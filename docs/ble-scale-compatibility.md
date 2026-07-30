# BLE scale compatibility — protocol spec

Research notes and byte-level spec for exposing the Grano scale over BLE so that
third-party espresso controllers can read it. Written 2026-07-30.

Nothing here is implemented yet. The firmware ([../ESP32/src/main.cpp](../ESP32/src/main.cpp))
currently publishes weight over serial text and a Wi-Fi JSON WebSocket only — no
BLE stack at all. Neither transport is discoverable by any third-party app.

---

## 1. Who supports what (the finding that drives everything)

Both GaggiMate and Gaggiuino consume BLE scales through the same library lineage,
but they **register different subsets of drivers**:

| Project | Library | Drivers actually registered |
|---|---|---|
| GaggiMate | [`gaggimate/esp-arduino-ble-scales@v1.0.2`](https://github.com/gaggimate/esp-arduino-ble-scales) (pinned in its `platformio.ini`) | 12 — Acaia, Bookoo, Decent, Difluid, Eclair, Eureka, Felicita, Timemore, Varia, WeighMyBru, MyScale, Dot |
| Gaggiuino | [`Zer0-bit/esp-arduino-ble-scales`](https://github.com/Zer0-bit/esp-arduino-ble-scales) | **Acaia only** |

The Gaggiuino limit is easy to miss. Its `bleScalesInit()` in
`webserver/src/scales/ble_scales.cpp` (branch `release/stm32-blackpill` — note
`main` holds only docs) calls exactly one plugin:

```cpp
void bleScalesInit() {
  AcaiaScalesPlugin::apply();
  BLEDevice::init("Gaggiuino");
  ...
}
```

Bookoo, Decent and Felicita drivers exist in the library it links, but are never
registered, so stock Gaggiuino will never discover them.

GaggiMate registers all 12 in `BLEScalePlugin::setup()`
([`src/display/plugins/BLEScalePlugin.cpp:65-76`](https://github.com/jniebuhr/gaggimate/blob/master/src/display/plugins/BLEScalePlugin.cpp)).

> **Conclusion: Acaia is the only protocol both stock firmwares will discover.**
> The frame parsing is byte-for-byte identical in both forks (verified against
> `acaia.cpp` in each), so a single emulation covers both.

Bookoo is worth implementing as a *second* profile — much simpler, and it
natively carries flow rate, battery and a scale timer that GaggiMate surfaces via
`hasFlowRate()` / `hasBatteryLevel()` / `hasScaleTimer()`. It just does nothing
for Gaggiuino.

## 2. Discovery is gated on the advertised name prefix

Every driver's `handles()` matches on the **advertised device name**, nothing
else — not the service UUID, not manufacturer data:

```cpp
// acaia.h — both forks
static bool handles(const DiscoveredDevice& device) {
  const std::string& deviceName = device.getName();
  return !deviceName.empty() && (
       deviceName.find("ACAIA") == 0
    || deviceName.find("PYXIS") == 0
    || deviceName.find("LUNAR") == 0
    || deviceName.find("PEARL") == 0
    || deviceName.find("PROCH") == 0);   // GaggiMate's fork also accepts "UMBRA"
}

// bookoo.h — both forks
return !deviceName.empty() && (deviceName.find("BOOKOO_SC") == 0);

// decent.h
return deviceName.find("Decent Scale") == 0 || deviceName.find("EspressiScale") == 0;
```

**A device advertising as `Grano_A1B2` is invisible to both projects.** There is
no technical way around this — compatibility requires advertising a name with one
of the recognised prefixes (e.g. `LUNAR_Grano`, `BOOKOO_SC_Grano`).

That's a product/legal judgment call, not a technical one. The clean long-term
exit is upstreaming a real `grano` driver: GaggiMate's README explicitly invites
new drivers ("Want a specific model? Implement it 🚀"). Gaggiuino's stated
position is that only integrated scales are officially supported, so plan on the
Acaia alias remaining the Gaggiuino path indefinitely.

**One GATT server can host all profiles at once.** Only the advertised *name* has
to be chosen, since that is the only thing consumers match on:

| Mode | Advertised name | Picked up by |
|---|---|---|
| `off` (default) | `Grano_A1B2` (suffix = last 2 MAC bytes) | Grano web app only |
| `acaia` | `LUNAR_Grano` | **Gaggiuino + GaggiMate** + Beanconqueror |
| `bookoo` | `BOOKOO_SC_Grano` | GaggiMate, with native flow/battery/timer |

`LUNAR_Grano` is 12 bytes: flags(3) + name(14) + 16-bit UUID(4) = 21 of the 31
advertising bytes. Fits without a scan response.

---

## 3. Acaia protocol (primary — required for Gaggiuino)

```
service  49535343-fe7d-4ae5-8fa9-9fafd205e455
 ├─ char 49535343-1e4d-4bd9-ba61-23c647249616   NOTIFY   weight/status out
 └─ char 49535343-8841-43f4-a8d4-ecbe34729bb3   WRITE    commands in
```

Legacy alternative the driver probes **first** (Lunar 2015 / older Pearl):
service `00001820-0000-1000-8000-00805f9b34fb`, single characteristic
`00002a80-0000-1000-8000-00805f9b34fb` used for both directions. Don't expose
this one — if present it takes precedence and shares one characteristic for read
and write.

### 3.1 Gotcha: the CCCD is mandatory

`performConnectionHandshake()` does `weightCharacteristic->getDescriptor(0x2902)`
and **aborts the entire connection if it returns null**:

```cpp
NimBLERemoteDescriptor* notifyDescriptor = weightCharacteristic->getDescriptor(NimBLEUUID((uint16_t)0x2902));
if (notifyDescriptor != nullptr) {
  uint8_t value[2] = { 0x01, 0x00 };
  notifyDescriptor->writeValue(value, 2, true);
} else {
  clientCleanup();
  return false;     // <-- connection dies here
}
```

NimBLE-Arduino's *server* creates the CCCD automatically for `NOTIFY`
characteristics. Just don't suppress it.

### 3.2 Frame format

All frames: `EF DD <type> <payload…> <ck1> <ck2>`

The client computes `messageLength = 3 + buf[3] + 2`, and `buf[3]` is the first
payload byte — so **`payload[0]` must equal the payload length including itself.**

Checksums are two independent byte sums over the payload (not a CRC, not an XOR):

```cpp
for (i = 0; i < length; i++)
  if (i % 2 == 0) cksum1 += payload[i];
  else            cksum2 += payload[i];
```

Message types (`buf[2]`): `0x00` SYSTEM · `0x04` TARE · `0x06` HANDSHAKE ·
`0x07` INFO · `0x08` STATUS · `0x0B` IDENTIFY · `0x0C` EVENT.
Only EVENT and STATUS are parsed inbound by the client.

### 3.3 Weight event — 13 bytes, emit at 10 Hz

```
 idx  0    1    2    3    4    5    6    7    8    9    10   11   12
     EF   DD   0C   08   05   w0   w1   00   00   sc   fl   ck1  ck2
                │    │    │    └──┬──┘   └─┬─┘    │    │
                │    │    │       │        │      │    └─ flags: bit 0x02 = negative
                │    │    │       │        │      └─ scaling: 1 = ÷10, 2 = ÷100
                │    │    │       │        └─ ignored by the standard decode path
                │    │    │       └─ magnitude, unsigned LE16 (LSB first)
                │    │    └─ 0x05 = WEIGHT event
                │    └─ payload length (8)
                └─ 0x0C = EVENT

ck1 = 0x08 + w0 + 0x00 + sc
ck2 = 0x05 + w1 + 0x00 + fl
```

Decoder, for reference:

```cpp
float value = (weightPayload[1] << 8) | weightPayload[0];
uint8_t scaling = weightPayload[4];        // 1..4 → /10 /100 /1000 /10000
if (weightPayload[5] & 0x02) value *= -1;
```

**Range caveat:** the magnitude is unsigned 16-bit, so `scaling=2` (0.01 g) caps
at 655.35 g. Use `scaling=2` below 600 g and fall back to `scaling=1` (0.1 g)
above it, so a 2 kg cell still reads correctly.

Bytes 7–8 are ignored on the standard path in both forks — zero them.
GaggiMate's Umbra branch reads those bytes instead, but only when the *Umbra*
service UUID is bound (`0000fe40-cc7a-482a-984a-7f2ed5b3e58f`), which we never
advertise.

**Test vectors:**

| Weight | Frame |
|---|---|
| `+100.00 g` | `EF DD 0C 08 05 10 27 00 00 02 00 1A 2C` |
| `-2.50 g` | `EF DD 0C 08 05 FA 00 00 00 02 02 04 07` |

### 3.4 Status frame — battery + units

Send on connect and every ~5 s (GaggiMate polls metadata on a 1 s tick):

```
EF DD 08 07 <bat> 02 00 05 00 01 <ck1> <ck2>
              │    │     │     └─ payload[6]: beep on
              │    │     └─ payload[4]: auto-off ÷5 min
              │    └─ 0x02 = grams (0x05 = ounces)
              └─ battery %, masked & 0x7F by the client

ck1 = 07 + 02 + 05 + 01 = 0x0F
ck2 = <bat>
```

e.g. 87 % → `EF DD 08 07 57 02 00 05 00 01 0F 57`

### 3.5 Commands the server must accept

Parse `EF DD <type> …` and dispatch on type. **Ignore the checksum on inbound
frames** — the client's own `sendId()` sends 15× `0x2D` as payload, so
`payload[0] = 0x2D = 45` violates its own length convention.

| Type | Client call | Server action |
|---|---|---|
| `0x04` | `tare()`, payload `{0x00}` | **Tare the cell.** The only command the driver ever sends. |
| `0x0B` | `sendId()` — 15× `0x2D` | ack / ignore |
| `0x0C` | `sendNotificationRequest()` — payload `09 00 01 01 02 02 05 03 04` | start/confirm notifications |
| `0x00` | heartbeat `02 00`, every 2 s | refresh a liveness timer |
| `0x06` | heartbeat handshake `00` | ignore |

The heartbeat is a keepalive. If it stops for >10 s, keep notifying anyway
(harmless) but log it.

---

## 4. Bookoo protocol (secondary — richer GaggiMate integration)

Official spec: <https://github.com/BooKooCode/OpenSource/blob/main/bookoo_mini_scale/protocols.md>

```
service  0x0FFE
 ├─ char 0xFF11  NOTIFY   20-byte weight frame
 └─ char 0xFF12  WRITE    6-byte commands
```

16-bit UUIDs expand to `0000xxxx-0000-1000-8000-00805F9B34FB`.

### 4.1 Weight notification — 20 bytes

```
[0]     0x03  product id            [10]    flow sign  '+' 0x2B / '-' 0x2D
[1]     0x0B  weight message        [11-12] flow × 100 g/s, BE u16
[2-4]   timer ms, BE u24            [13]    battery %  (0-100)
[5]     0x02 = grams, 0x01 = oz     [14-15] standby min × 10, BE u16
[6]     weight sign '+' / '-'       [16]    buzzer gear
[7-9]   grams × 100, BE u24         [17]    flow-smoothing switch
                                    [18]    reserved (Ultra: auto-stop cond.)
                                    [19]    checksum = XOR of bytes 0..18
```

**Test vector** — 100.00 g, flow 2.35 g/s, battery 87 %, timer 12.340 s, 30 min standby:

```
03 0B 00 30 34 02 2B 00 27 10 2B 00 EB 57 01 2C 00 00 00 A8
```

### 4.2 Commands in — `03 0A <cmd> <d1> <d2> <xor>`

| Function | Bytes |
|---|---|
| Tare | `03 0A 01 00 00 08` |
| Start timer | `03 0A 04 00 00 0D` |
| Stop timer | `03 0A 05 00 00 0C` |
| Reset timer | `03 0A 06 00 00 0F` |
| Tare + start timer | `03 0A 07 00 00 0E` |
| Beep level (0-5) | `03 0A 02 00 <level> <xor>` |
| Auto-off (5-30 min) | `03 0A 03 00 <minutes> <xor>` |
| Flow smoothing (0/1) | `03 0A 08 <0/1> 00 <xor>` |

Checksum is XOR of all preceding bytes. GaggiMate's driver sends `07` on tare
(not `01`) and `08 00` on connect to disable scale-side flow smoothing.

Filling in flow rate, battery, timer and the unit byte is what earns the richer
GaggiMate integration — `BLEScalePlugin` only surfaces those fields when the
driver's `hasX()` returns true.

---

## 5. Sample rate — the real blocker, independent of protocol

Market scales notify at 10–20 Hz. The current firmware manages **~1.6/sec**:

```cpp
// main.cpp:402 — blocks ~500 ms on a stock 10 SPS module
long raw = scale.read_average(SAMPLES);   // SAMPLES = 5
...
delay(100);
```

Three separate problems:

1. **HX711 runs at 10 SPS** unless pin 15 (`RATE`) is pulled to VCC for 80 SPS —
   and most breakout boards hard-tie it to GND. 10 Hz output with a usable flow
   rate needs that pad lifted. An **NAU7802** (I²C, up to 320 SPS) removes the
   problem entirely if a hardware revision is on the table.
2. **`HX711::read()` bit-bangs inside `portENTER_CRITICAL` + `noInterrupts()`**
   with `delayMicroseconds(1)` per clock edge. Left on the main loop it will
   starve the BLE stack. Acquisition must move to its own FreeRTOS task, with a
   separate 10 Hz notifier reading a mutex-guarded `{grams, flow, ts, stable}`.
3. **The 0.1 g quantize-and-hold belongs in the UI, not the wire format.**

   ```cpp
   // main.cpp:407 — kills the flow-rate derivative
   if (fabsf(weight - displayedWeight) >= WEIGHT_DEADBAND) {
       displayedWeight = roundf(weight / WEIGHT_STEP) * WEIGHT_STEP;
   }
   ```

   Report 0.01 g on the wire and apply a ~0.05 g display hysteresis in the
   consumer. Quantizing the numerator turns the derivative into a staircase.

Also worth adding, since every market scale has it: **flow rate as a linear
least-squares slope over a ~600 ms window** (not `Δw/Δt`), and **auto-zero
tracking** — if `|w| < 0.15 g` and stable for >3 s, creep the offset toward zero.
That's why commercial scales read `0.0` instead of drifting.

Reuse the existing `tare()` ([main.cpp:73](../ESP32/src/main.cpp#L73)),
`quickCalibrate()` and NVS handling as-is; route the BLE tare into `tare()`.
Note `calibrationWizard()`'s blocking `readLine()`
([main.cpp:97](../ESP32/src/main.cpp#L97)) will stall a live BLE connection — it
needs to become non-blocking or be gated to "serial only, BLE idle".

Build changes: `h2zero/NimBLE-Arduino@^2.2.3`,
`board_build.partitions = huge_app.csv` (NimBLE won't fit the default 4 MB
table), and `-DCONFIG_BT_NIMBLE_MAX_CONNECTIONS=2` so an espresso controller and
the Grano app can connect at once. BLE and Wi-Fi coexist on the C3 but share one
antenna — if throughput suffers, make Wi-Fi opt-in at runtime.

---

## 6. Web app side

### 6.1 Web Bluetooth driver

[`ScaleDriver`](../src/scale/types.ts) is already the right seam —
[`createWsScaleDriver`](../src/scale/drivers/websocket.ts) is one implementation,
so a BLE driver drops in beside it with no consumer changes.

Target the **Bookoo service (0x0FFE)** regardless of which name the firmware
advertises. Web Bluetooth filters on services, so this works in all three
advertised-name modes and gets flow/battery/timer for free:

```ts
const device = await navigator.bluetooth.requestDevice({
  filters: [{ services: [0x0ffe] }, { namePrefix: "Grano" }],
  optionalServices: [0x0ffe],
});
```

**Web Bluetooth is unavailable in Safari and Firefox.** The Wi-Fi WebSocket
driver must stay as the cross-browser path — BLE is an addition, not a
replacement.

`ScaleSample` should grow `flowGPerS?`, `batteryPct?`, `timerMs?`, `stable?`,
`unit?`, and the driver a `transport: "ws" | "ble" | "sim"` so the connection
chip at [GuidedPour.tsx:414](../src/pages/Brew/GuidedPour.tsx#L414) can tell them
apart.

Known structural issue to fix at the same time:
[GuidedPour.tsx:60](../src/pages/Brew/GuidedPour.tsx#L60) creates the driver
inside the brew page, so the connection is torn down on unmount
([L137-141](../src/pages/Brew/GuidedPour.tsx#L137)). BLE pairing is a
user-gesture-gated, multi-second operation — re-pairing every brew is painful.
The driver needs to be an app-level singleton.

### 6.2 Display conventions

What "match other smart devices in the market" means concretely. Acaia, Bookoo,
Decent and Felicita all converge on the same rules.

1. **0.1 g resolution.** The app currently shows *whole grams* via
   `Math.round(current)` — coarser than any commercial scale. Sites:
   [WaterGauge.tsx:97](../src/components/WaterGauge/WaterGauge.tsx#L97) and
   [GuidedPour.tsx](../src/pages/Brew/GuidedPour.tsx) lines 584, 605, 606, 624, 631.
   There is no formatting helper today and `"g"` is inlined at ~10 JSX sites —
   worth a `src/utils/weight.ts`.
2. **Fixed-width digits.** `font-variant-numeric: tabular-nums` plus the existing
   `--font-mono`, with space reserved for 3 integer digits so the readout doesn't
   shift crossing 9.9 → 10.0 → 100.0. At 10 Hz a shimmering value is the single
   most noticeable difference between a cheap readout and an Acaia.
3. **Decouple render cadence from sample cadence.** Weight at 10 Hz, flow at
   ~4 Hz — 10 Hz flow is unreadable. Coalesce through `requestAnimationFrame`;
   [useScale.ts:25-38](../src/scale/useScale.ts#L25) currently fires two
   `setState`s per sample.
4. **Prefer native flow.** Use `s.flowGPerS` when the driver supplies it, falling
   back to the existing `0.55/0.45` EMA at
   [useScale.ts:32](../src/scale/useScale.ts#L32).
5. **Never show `-0.0`**; clamp `|w| < 0.05` to zero. Dash out flow below
   ~0.2 g/s and never show it negative.
6. **Stability dot** from `sample.stable` — the universal "reading settled, safe
   to dose" cue.
7. **Battery + RSSI** in the connection chip next to `scaleStatusLabel`.
8. **Live timer as `m:ss.s`.** `formatTime()` at
   [recipe.ts:288](../src/utils/recipe.ts#L288) is floor-based `m:ss`; add a
   tenths variant for the live clock and leave log formatting alone.

Unrelated cleanup while in here: `IDEAL_FLOW` / `REF_FLOW` / `SIM_FLOW` are the
same `9` g/s duplicated across
[AccumulationChart.tsx:18](../src/components/AccumulationChart/AccumulationChart.tsx#L18),
[recipe.ts:49](../src/utils/recipe.ts#L49) and
[GuidedPour.tsx:38](../src/pages/Brew/GuidedPour.tsx#L38).

---

## 7. Verification strategy

Byte layout is the riskiest part and the cheapest to test in isolation.

1. **Frame builders first, in JS.** Extend
   [scripts/esp32-sim.mjs](../scripts/esp32-sim.mjs) to build both frames and
   assert against the test vectors in §3.3 and §4.1. Check the negative flag and
   the `scaling=1` crossover above 600 g. Round-trip the bytes through the new
   parser and confirm the value comes back.
   While there: the sim's header comment documents `cal` / `cal_reset` / `ack`
   but `handleMessage` only implements `tare` / `pour` / `set` / `stop`, so the
   calibrate commands the driver sends are silently dropped and `onStatus` never
   fires.
2. **Firmware.** `pio run -e esp32c3-supermini` — watch flash usage after NimBLE.
   Then with nRF Connect or `bluetoothctl`: confirm the advertised name flips
   with the setting, both services are present, the notify characteristic has a
   CCCD, and notifications arrive at 10 Hz. Read a 100 g reference weight.
3. **End-to-end** — the only step that proves the goal:
   - GaggiMate, mode `bookoo`: scan → connect → confirm weight tracks and flow +
     battery appear. Then mode `acaia` and confirm it still connects.
   - Gaggiuino, mode `acaia`: `bleScalesMaintainConnection()` auto-connects to
     `scales[0]`, so it should latch on with no UI action. Confirm weight reaches
     the shot chart and its tare zeroes the cell.
   - Grano app: BLE connect, 0.1 g readout, digits don't shift width, flow tracks
     a real pour, tare works.
4. **Regression.** Wi-Fi WebSocket and all serial commands
   (`k`/`t`/`c`/`s`/`x`/space/`h`) must still work with BLE active — the sampling
   restructure is what could break them. `npm run build` and `npm run lint`.

## 8. Suggested order

1. Frame builders + test vectors in the sim — de-risks the byte layout for free.
2. Sampling task restructure — everything depends on a non-blocking 10 Hz source.
3. NimBLE server + Acaia profile + name modes → test Gaggiuino and GaggiMate.
4. Bookoo profile → test the richer GaggiMate path.
5. Web Bluetooth driver + driver hoisting to a singleton.
6. Display conventions.
7. Upstream a `grano` driver to GaggiMate so the vendor alias can be retired.

## 9. Open decision

**Advertising under a vendor name prefix is a product/legal call, not a technical
one.** Both projects gate discovery on the name, so there is no alternative that
works with stock firmware. The plan above defaults to `Grano_A1B2` and puts
`LUNAR_Grano` / `BOOKOO_SC_Grano` behind an explicit user setting, which keeps
the emulation opt-in — but it needs a decision before shipping.
