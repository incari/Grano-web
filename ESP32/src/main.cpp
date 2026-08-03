#include <Arduino.h>
#include <HX711.h>
#include <Preferences.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <WiFiManager.h>
#include <WebSocketsServer.h>
#include <NimBLEDevice.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <functional>


// ESP32-C3 Super Mini
// HX711: DT -> GPIO5 , SCK -> GPIO6
#define DOUT 5
#define CLK  6

// Front-panel controls and feedback. GPIO8/9 are strapping/BOOT/LED on the C3,
// so we stay clear of them. Buttons use the internal pull-up (pressed = LOW),
// so each just bridges its GPIO to GND. The buzzer is an active type: it beeps
// on a plain HIGH, no PWM tone needed.
#define BTN_TARE   3   // physical tare button
#define BTN_TIMER  4   // starts the shot clock in the app
#define BUZZER    10   // active buzzer: (+) -> GPIO10, (-) -> GND

// DS18B20 submersible probe on a 1-Wire bus. Needs a 4.7k pull-up from data to
// 3V3 for reliable reads; the reading is broadcast about once a second.
#define TEMP_PIN   7
#define TEMP_INTERVAL_MS 1000

// Debounce window shared by both buttons - long enough to swallow contact
// bounce, short enough to still feel instant.
#define BTN_DEBOUNCE_MS 250

// Active-buzzer beep length for a short "bip" on a button press.
#define BEEP_MS 40

// Wi-Fi is provisioned from the phone, not hardcoded. On first boot (or when it
// can't reach the saved network) the scale opens its own hotspot named AP_SSID
// with a captive setup page. Once joined it advertises itself over mDNS so the
// app can connect to ws://<MDNS_HOST>.local:<WS_PORT>/ without knowing the IP.
#define AP_SSID  "Grano-Scale"       // hotspot the user connects to for setup
#define AP_PASS  "granoscale"        // 8+ chars; keep or change as you like
#define MDNS_HOST "grano-scale"      // → ws://grano-scale.local:81
#define WS_PORT   81

// BLE runs alongside Wi-Fi and speaks the same JSON protocol, so the app can
// reach the scale on either transport and pick whichever answers. Custom UUIDs
// ("Grano" + "Scale" in ASCII) — third-party espresso controllers match on
// vendor names/services instead, see docs/ble-scale-compatibility.md.
#define BLE_SERVICE_UUID "4772616e-6f53-6361-6c65-000000000001"
#define BLE_TX_UUID      "4772616e-6f53-6361-6c65-000000000002"  // notify: scale → app
#define BLE_RX_UUID      "4772616e-6f53-6361-6c65-000000000003"  // write:  app → scale
// Seconds the setup portal stays open before the scale reboots and retries.
#define PORTAL_TIMEOUT 180
// Tap the RST button twice within this window to forget Wi-Fi and reopen setup.
#define DRD_WINDOW_MS 4000

// Samples averaged per reading. HX711 runs at 10SPS (RATE low) or 80SPS (RATE high),
// so 5 samples is ~500ms on a 10SPS module and ~60ms on an 80SPS one.
#define SAMPLES 5

// Samples used for tare and calibration - slower but much steadier than a live reading.
#define CAL_SAMPLES 20

// Counts per gram, used until the calibration wizard stores a value measured on
// this actual load cell. Negative because this cell's A+/A- pair is reversed:
// added weight drives the raw count down. Measured at ~-115520 counts / 105g.
#define DEFAULT_CALIBRATION_FACTOR -1100.2f

// The shown weight is rounded to WEIGHT_STEP and only moves once the live reading
// differs from it by at least WEIGHT_DEADBAND. This cell has about +/-0.1g of
// noise, so without the deadband the last digit never settles.
#define WEIGHT_STEP 0.1f
#define WEIGHT_DEADBAND 0.1f

// Restyles the WiFiManager captive portal to match the Grano web app: same
// "Cream & espresso" palette, terracotta buttons, rounded inputs, serif titles,
// plus the "Night roast" dark theme. Injected into <head> after WiFiManager's
// own <style>, so these rules win. Colors mirror src/index.css.
static const char PORTAL_CSS[] PROGMEM = R"rawcss(<style>
body{
  font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,sans-serif;
  color:#29201a;background-color:#f3ede2;background-attachment:fixed;
  background-image:radial-gradient(1200px 620px at 100% -8%,#f6e5d6,transparent 58%),
    radial-gradient(900px 520px at -12% 112%,#ece2d1,transparent 55%);
}
.wrap{max-width:480px;margin:0 auto;padding:20px 16px;}
h1,h2,h3{font-family:"New York",ui-serif,Palatino,Georgia,"Times New Roman",serif;
  letter-spacing:-0.015em;color:#29201a;}
button,.msg,input,select{border-radius:12px;}
button{border:0;background:#c15b2c;color:#fffbf4;padding:14px;font-size:15px;
  font-weight:700;line-height:1.2;width:100%;}
button:active{filter:brightness(0.92);}
input,select{border:1px solid #d0c2a9;background:#fffbf4;color:#29201a;
  padding:12px 14px;font-size:15px;width:100%;}
input[type=checkbox]{width:auto;}
a{color:#c15b2c;font-weight:700;text-decoration:none;}
.q{color:#6d5f50;}
.msg{border:1px solid #e2d7c4;background:#fffbf4;color:#6d5f50;padding:12px 14px;}
@media (prefers-color-scheme:dark){
  body{color:#f2e9dc;background-color:#17120e;
    background-image:radial-gradient(1200px 620px at 100% -8%,#3a2416,transparent 58%),
      radial-gradient(900px 520px at -12% 112%,#2b221a,transparent 55%);}
  h1,h2,h3{color:#f2e9dc;}
  button{background:#e07d47;color:#1a130d;}
  input,select{border:1px solid #4a3b2c;background:#211a15;color:#f2e9dc;}
  a{color:#e07d47;}
  .q{color:#b1a08d;}
  .msg{border:1px solid #352a20;background:#211a15;color:#b1a08d;}
}
</style>)rawcss";

HX711 scale;
Preferences prefs;
WebSocketsServer webSocket = WebSocketsServer(WS_PORT);
// WiFiManager runs non-blocking so the HX711 read + broadcast loop keeps
// streaming to BLE while the captive portal is open (see connectWifi/loop).
WiFiManager wm;
OneWire oneWire(TEMP_PIN);
DallasTemperature tempSensor(&oneWire);
bool tempPresent = false;    // set at boot if a DS18B20 answers on the bus
bool portalActive = false;   // true while the setup portal is serviced in loop()
bool mdnsStarted = false;    // guards a one-time startMdns() once Wi-Fi connects
float calibrationFactor = DEFAULT_CALIBRATION_FACTOR;
bool streaming = true;
float displayedWeight = 0.0f;

// Sends one JSON frame back to whichever transport a command arrived on.
using Reply = std::function<void(const char *json, int len)>;

// Defined after the Wi-Fi helpers below but called from the serial/WebSocket
// command handlers above them.
static void resetWifi();
static void beep();

static void printHelp() {
    Serial.println();
    Serial.println("Commands:");
    Serial.println("  k        guided tare + calibration test (start here)");
    Serial.println("  t        tare only (zero the scale)");
    Serial.println("  c<g>     quick calibrate with weight already on the cell, e.g. c100");
    Serial.println("  s        show offset / calibration factor");
    Serial.println("  x        erase saved calibration and restore the default");
    Serial.println("  w        forget Wi-Fi and reboot into the setup hotspot");
    Serial.println("  <space>  pause / resume the weight stream");
    Serial.println("  h        this help");
    Serial.println();
}

static void printStatus() {
    Serial.printf("offset=%ld  calibrationFactor=%.6f counts/g  (saved: %s)\n",
                  scale.get_offset(), scale.get_scale(),
                  prefs.isKey("cal") ? "yes" : "no - using default");
}

static void saveCalibration(float factor) {
    prefs.putFloat("cal", factor);
    Serial.printf("Saved to NVS - survives reboot. factor=%.6f counts/g\n", factor);
}

static void applyCalibration(float factor) {
    calibrationFactor = factor;
    scale.set_scale(calibrationFactor);
}

static void tare(const char *reason) {
    Serial.printf("%s - keep the cell empty and still...\n", reason);
    scale.tare(CAL_SAMPLES);
    displayedWeight = 0.0f;  // drop the held value, the scale is zero now
    Serial.printf("Tared. offset=%ld\n", scale.get_offset());
}

static void quickCalibrate(float knownGrams) {
    if (knownGrams <= 0.0f) {
        Serial.println("Calibration needs a positive weight, e.g. c100");
        return;
    }
    Serial.printf("Calibrating against %.2fg - keep the weight still...\n", knownGrams);
    double value = scale.get_value(CAL_SAMPLES);  // raw counts minus tare offset
    if (fabs(value) < 1000.0) {
        Serial.printf("Only %.0f counts of change - is the weight actually on the cell?\n", value);
        Serial.println("Aborted, calibration factor unchanged.");
        return;
    }
    applyCalibration((float)(value / knownGrams));
    saveCalibration(calibrationFactor);
}

// Blocks until a line arrives on serial, then returns it trimmed.
static String readLine() {
    while (Serial.available()) {
        Serial.read();  // drop anything already buffered
    }
    String line;
    while (true) {
        while (!Serial.available()) {
            delay(10);
        }
        char c = (char)Serial.read();
        if (c == '\n' || c == '\r') {
            if (line.length() > 0 || c == '\n') {
                break;
            }
            continue;
        }
        line += c;
    }
    line.trim();
    return line;
}

static void calibrationWizard() {
    Serial.println();
    Serial.println("--- GUIDED TARE + CALIBRATION ---");

    Serial.println("Step 1/3: remove EVERYTHING from the cell, then press ENTER.");
    readLine();
    tare("Taring");

    long emptyDrift = (long)scale.get_value(CAL_SAMPLES);
    Serial.printf("Empty-cell noise after tare: %ld counts", emptyDrift);
    if (labs(emptyDrift) > 500) {
        Serial.println("  [high - cell may be drifting or unstable]");
    } else {
        Serial.println("  [OK]");
    }

    Serial.println();
    Serial.println("Step 2/3: place a known weight on the cell, type its weight in");
    Serial.println("grams (e.g. 100) and press ENTER.");
    float knownGrams = readLine().toFloat();
    if (knownGrams <= 0.0f) {
        Serial.println("Not a valid weight. Wizard aborted, nothing changed.");
        return;
    }

    Serial.printf("Measuring %.2fg - keep it still...\n", knownGrams);
    double value = scale.get_value(CAL_SAMPLES);
    Serial.printf("Change from tare: %.0f counts\n", value);
    if (fabs(value) < 1000.0) {
        Serial.println("Too little change - check wiring, or the weight is too light.");
        Serial.println("Wizard aborted, calibration factor unchanged.");
        return;
    }
    if (value < 0) {
        Serial.println("Note: change is negative - load cell wires E+/E- or A+/A- are swapped.");
        Serial.println("Continuing anyway with a negative factor, which still reads correctly.");
    }

    applyCalibration((float)(value / knownGrams));
    saveCalibration(calibrationFactor);

    Serial.println();
    Serial.println("Step 3/3: verifying against the same weight...");
    float measured = scale.get_units(CAL_SAMPLES);
    float error = measured - knownGrams;
    Serial.printf("Expected %.2fg, measured %.2fg, error %+.2fg (%+.2f%%)\n",
                  knownGrams, measured, error, (error / knownGrams) * 100.0f);
    if (fabs(error) <= knownGrams * 0.02f) {
        Serial.println("Result: PASS - within 2%.");
    } else {
        Serial.println("Result: off by more than 2% - re-run 'k' with the weight fully settled.");
    }

    Serial.println();
    Serial.println("Now remove the weight - the stream should return to ~0.00g.");
    Serial.println("--- DONE ---");
    Serial.println();
}

static void handleSerial() {
    if (!Serial.available()) {
        return;
    }

    char cmd = (char)Serial.read();
    String arg = Serial.readStringUntil('\n');
    arg.trim();

    switch (cmd) {
        case 'k':
        case 'K':
            calibrationWizard();
            break;
        case 't':
        case 'T':
            tare("Taring");
            break;
        case 'c':
        case 'C':
            quickCalibrate(arg.toFloat());
            break;
        case 's':
        case 'S':
            printStatus();
            break;
        case 'x':
        case 'X':
            prefs.remove("cal");
            applyCalibration(DEFAULT_CALIBRATION_FACTOR);
            Serial.printf("Saved calibration erased, back to default %.6f counts/g\n",
                          calibrationFactor);
            break;
        case 'w':
        case 'W':
            resetWifi();
            break;
        case ' ':
            streaming = !streaming;
            Serial.println(streaming ? "Stream resumed" : "Stream paused");
            break;
        case 'h':
        case 'H':
        case '?':
            printHelp();
            break;
        default:
            break;  // ignore stray newlines / noise
    }
}

// ── Transport-neutral JSON command layer ─────────────────────────────────────
// Both the Wi-Fi WebSocket and the BLE service carry the same frames the web app
// and simulator speak, so a command handler only needs a way to reply:
//   server → client  {"t":"w","g":12.3}                 // weight @ ~10 Hz
//   server → client  {"t":"ack","cmd":"tare","ok":true} // command result
//   server → client  {"t":"temp","c":93.5}              // probe temp @ ~1 Hz
//   server → client  {"t":"btn","id":"timer"}           // timer button pressed
//   client → server  {"t":"tare"}
//   client → server  {"t":"beep"}                       // sound the buzzer
//   client → server  {"t":"cal","g":100}                // 100 g is on the cell
//   client → server  {"t":"cal_reset"}

// Defined below with the BLE server; the broadcast helper needs it.
static void bleNotifyJson(const char *json, int len);

static void broadcastWeight() {
    char buf[48];
    int n = snprintf(buf, sizeof(buf), "{\"t\":\"w\",\"g\":%.1f}", displayedWeight);
    webSocket.broadcastTXT(buf, n);
    bleNotifyJson(buf, n);
}

static void sendAck(const Reply &reply, const char *cmd, bool ok, float factor,
                    const char *message) {
    char buf[160];
    int n;
    if (message) {
        n = snprintf(buf, sizeof(buf),
                     "{\"t\":\"ack\",\"cmd\":\"%s\",\"ok\":%s,\"message\":\"%s\"}",
                     cmd, ok ? "true" : "false", message);
    } else if (!isnan(factor)) {
        n = snprintf(buf, sizeof(buf),
                     "{\"t\":\"ack\",\"cmd\":\"%s\",\"ok\":%s,\"factor\":%.3f}",
                     cmd, ok ? "true" : "false", factor);
    } else {
        n = snprintf(buf, sizeof(buf), "{\"t\":\"ack\",\"cmd\":\"%s\",\"ok\":%s}",
                     cmd, ok ? "true" : "false");
    }
    reply(buf, n);
}

// Calibrate against a known weight sitting on the cell. Returns the new factor,
// or NAN if the change was too small (weight missing / wiring issue).
static float remoteCalibrate(float knownGrams) {
    if (knownGrams <= 0.0f) return NAN;
    double value = scale.get_value(CAL_SAMPLES);  // raw counts minus tare offset
    if (fabs(value) < 1000.0) return NAN;
    applyCalibration((float)(value / knownGrams));
    saveCalibration(calibrationFactor);
    return calibrationFactor;
}

// Tiny hand-rolled JSON reader — the frames are small and fixed-shape, so this
// avoids pulling in a full JSON parser.
static bool jsonHas(const char *s, const char *key, const char *val) {
    char needle[32];
    snprintf(needle, sizeof(needle), "\"%s\":\"%s\"", key, val);
    return strstr(s, needle) != nullptr;
}

static bool jsonNumber(const char *s, const char *key, float *out) {
    char needle[16];
    snprintf(needle, sizeof(needle), "\"%s\":", key);
    const char *p = strstr(s, needle);
    if (!p) return false;
    *out = atof(p + strlen(needle));
    return true;
}

// Runs a JSON command from either transport. Must be called from loop() only:
// tare and calibrate block for a second or more inside the HX711 driver, which
// would starve the BLE host task if run from its callback.
static void handleCommand(const char *payload, const char *via,
                          const Reply &reply) {
    if (jsonHas(payload, "t", "tare")) {
        Serial.printf("Tare (%s)\n", via);
        beep();
        tare("Taring");
        sendAck(reply, "tare", true, NAN, nullptr);
    } else if (jsonHas(payload, "t", "beep")) {
        // Audible feedback for an app action (start / pause / resume).
        beep();
        sendAck(reply, "beep", true, NAN, nullptr);
    } else if (jsonHas(payload, "t", "wifi_reset")) {
        sendAck(reply, "wifi_reset", true, NAN, nullptr);
        delay(100);  // let the ack flush before we drop Wi-Fi and reboot
        resetWifi();
    } else if (jsonHas(payload, "t", "cal_reset")) {
        prefs.remove("cal");
        applyCalibration(DEFAULT_CALIBRATION_FACTOR);
        Serial.printf("Calibration reset via %s -> %.6f counts/g\n", via,
                      calibrationFactor);
        sendAck(reply, "cal_reset", true, calibrationFactor, nullptr);
    } else if (jsonHas(payload, "t", "cal")) {
        float g = 0.0f;
        if (!jsonNumber(payload, "g", &g) || g <= 0.0f) {
            sendAck(reply, "cal", false, NAN, "Send a positive weight in g");
            return;
        }
        float factor = remoteCalibrate(g);
        if (isnan(factor)) {
            sendAck(reply, "cal", false, NAN, "Put the weight on the cell first");
        } else {
            Serial.printf("Calibrated via %s to %.2fg -> %.6f counts/g\n", via, g,
                          factor);
            sendAck(reply, "cal", true, factor, nullptr);
        }
    }
}

static void webSocketEvent(uint8_t num, WStype_t type, uint8_t *payload,
                           size_t length) {
    (void)length;
    switch (type) {
        case WStype_CONNECTED: {
            IPAddress ip = webSocket.remoteIP(num);
            Serial.printf("[ws] client %u connected from %d.%d.%d.%d\n", num,
                          ip[0], ip[1], ip[2], ip[3]);
            broadcastWeight();
            break;
        }
        case WStype_DISCONNECTED:
            Serial.printf("[ws] client %u disconnected\n", num);
            break;
        case WStype_TEXT:
            // webSocket.loop() runs on the main loop, so blocking here is safe.
            handleCommand((const char *)payload, "WebSocket",
                          [num](const char *json, int len) {
                              webSocket.sendTXT(num, json, len);
                          });
            break;
        default:
            break;
    }
}

// ── BLE server ───────────────────────────────────────────────────────────────
// One notify characteristic out, one write characteristic in, same JSON frames
// as the WebSocket. Frames are newline-delimited because a notification is
// capped at MTU-3 bytes: a long ack is split across packets and the client
// reassembles on "\n".

static NimBLECharacteristic *bleTx = nullptr;
static uint16_t bleMtu = 23;          // BLE default until the client negotiates up
static uint8_t bleClients = 0;

// Commands arrive on the NimBLE host task and are drained by loop(), so the
// blocking HX711 work never runs inside a BLE callback.
static char blePending[192];
static volatile bool blePendingReady = false;

static void bleNotifyJson(const char *json, int len) {
    if (!bleTx || bleClients == 0) return;
    // MTU-3 for the ATT header, minus 1 so the trailing "\n" always fits.
    const int chunk = (int)bleMtu - 4;
    if (chunk < 1) return;
    for (int off = 0; off < len; off += chunk) {
        int n = len - off < chunk ? len - off : chunk;
        bool last = off + n >= len;
        if (last) {
            char framed[200];
            if (n > (int)sizeof(framed) - 2) return;
            memcpy(framed, json + off, n);
            framed[n] = '\n';
            bleTx->setValue((const uint8_t *)framed, n + 1);
        } else {
            bleTx->setValue((const uint8_t *)(json + off), n);
        }
        bleTx->notify();
    }
}

class GranoServerCallbacks : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer *server, NimBLEConnInfo &info) override {
        (void)info;
        bleClients++;
        Serial.printf("[ble] client connected (%u)\n", bleClients);
        broadcastWeight();
        // Keep advertising so the app and a controller can both attach.
        if (bleClients < CONFIG_BT_NIMBLE_MAX_CONNECTIONS) {
            server->startAdvertising();
        }
    }
    void onDisconnect(NimBLEServer *server, NimBLEConnInfo &info,
                      int reason) override {
        (void)info;
        if (bleClients > 0) bleClients--;
        Serial.printf("[ble] client disconnected (reason %d, %u left)\n", reason,
                      bleClients);
        server->startAdvertising();
    }
    void onMTUChange(uint16_t mtu, NimBLEConnInfo &info) override {
        (void)info;
        bleMtu = mtu;
        Serial.printf("[ble] MTU %u\n", mtu);
    }
};

class GranoRxCallbacks : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic *chr, NimBLEConnInfo &info) override {
        (void)info;
        if (blePendingReady) return;  // previous command still queued, drop
        NimBLEAttValue value = chr->getValue();
        size_t n = value.length();
        if (n == 0 || n >= sizeof(blePending)) return;
        memcpy(blePending, value.data(), n);
        blePending[n] = '\0';
        blePendingReady = true;
    }
};

static GranoServerCallbacks bleServerCallbacks;
static GranoRxCallbacks bleRxCallbacks;

static void servicePendingBleCommand() {
    if (!blePendingReady) return;
    char cmd[sizeof(blePending)];
    memcpy(cmd, blePending, sizeof(cmd));
    blePendingReady = false;
    handleCommand(cmd, "BLE", bleNotifyJson);
}

static void startBle() {
    // Suffix keeps two scales on the same bench apart.
    uint64_t mac = ESP.getEfuseMac();
    char name[16];
    snprintf(name, sizeof(name), "Grano_%02X%02X", (uint8_t)(mac >> 40),
             (uint8_t)(mac >> 32));

    NimBLEDevice::init(name);
    NimBLEDevice::setMTU(185);  // enough for an ack in a single notification

    NimBLEServer *server = NimBLEDevice::createServer();
    server->setCallbacks(&bleServerCallbacks);

    NimBLEService *service = server->createService(BLE_SERVICE_UUID);
    bleTx = service->createCharacteristic(BLE_TX_UUID, NIMBLE_PROPERTY::NOTIFY);
    NimBLECharacteristic *rx = service->createCharacteristic(
        BLE_RX_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
    rx->setCallbacks(&bleRxCallbacks);
    service->start();

    NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
    adv->setName(name);
    adv->addServiceUUID(BLE_SERVICE_UUID);
    adv->enableScanResponse(true);
    adv->start();

    Serial.printf("BLE: advertising as \"%s\" (service %s)\n", name,
                  BLE_SERVICE_UUID);
}

// Advertise the scale over mDNS so the app can reach ws://MDNS_HOST.local:WS_PORT
// without knowing the DHCP-assigned IP. Safe to call only after Wi-Fi is up.
static void startMdns() {
    if (MDNS.begin(MDNS_HOST)) {
        MDNS.addService("ws", "tcp", WS_PORT);
        Serial.printf("mDNS: ws://%s.local:%u/\n", MDNS_HOST, WS_PORT);
    } else {
        Serial.println("mDNS start failed - use the IP shown above instead.");
    }
}

// Marker stored in flash while the double-reset window is open. Any distinctive
// value works; it just has to differ from an unset key (which reads back as 0).
#define DRD_MAGIC 0xD00Du
static bool drdArmed = false;
static uint32_t drdArmedAt = 0;

// Double-reset detection for the RST button. On boot: if the marker is already
// set, a previous boot happened within DRD_WINDOW_MS, so this is the second tap
// -> return true. Otherwise arm the marker; loop() clears it once the window
// passes. The flag lives in flash (not RTC) because the RST/EN button wipes RTC.
static bool consumeDoubleReset() {
    if (prefs.getUShort("drd", 0) == DRD_MAGIC) {
        prefs.remove("drd");
        return true;
    }
    prefs.putUShort("drd", DRD_MAGIC);
    drdArmed = true;
    drdArmedAt = millis();
    return false;
}

// Clear the double-reset marker once the window has elapsed without a second
// tap, so a single reset is treated as a normal reboot. Called from loop().
static void serviceDoubleReset() {
    if (drdArmed && millis() - drdArmedAt > DRD_WINDOW_MS) {
        prefs.remove("drd");
        drdArmed = false;
    }
}

// Forget the saved Wi-Fi network and reboot so the setup hotspot reopens. Used
// to move the scale onto a different network without re-flashing.
static void resetWifi() {
    Serial.println("Clearing saved Wi-Fi - rebooting into setup hotspot.");
    WiFiManager wm;
    wm.resetSettings();
    delay(500);
    ESP.restart();
}

// Connect using WiFiManager in non-blocking mode: autoConnect() tries the saved
// credentials and, if none work, opens the AP_SSID captive portal but returns
// immediately instead of blocking. loop() then drives the portal via wm.process()
// so the HX711 read + weight broadcast keep running (and BLE keeps streaming)
// while the user provisions Wi-Fi. mDNS starts once Wi-Fi actually connects.
static void connectWifi() {
    wm.setConfigPortalBlocking(false);
    wm.setConfigPortalTimeout(PORTAL_TIMEOUT);
    wm.setCustomHeadElement(PORTAL_CSS);  // match the Grano web app's look
    Serial.printf("Wi-Fi: connecting, else join hotspot \"%s\" (pass \"%s\") to set up.\n",
                  AP_SSID, AP_PASS);
    if (wm.autoConnect(AP_SSID, AP_PASS)) {
        Serial.printf("Wi-Fi connected. Scale WebSocket: ws://%s:%u/\n",
                      WiFi.localIP().toString().c_str(), WS_PORT);
        startMdns();
        mdnsStarted = true;
    } else {
        // Portal is now open and non-blocking; loop() services it via wm.process().
        portalActive = true;
    }
}

// Drive the non-blocking WiFiManager portal from loop(). Once Wi-Fi comes up
// (user provisions it via the captive page), start mDNS once and stop servicing.
static void serviceWifiPortal() {
    if (!portalActive) return;
    wm.process();
    if (WiFi.status() == WL_CONNECTED && !mdnsStarted) {
        Serial.printf("Wi-Fi connected. Scale WebSocket: ws://%s:%u/\n",
                      WiFi.localIP().toString().c_str(), WS_PORT);
        startMdns();
        mdnsStarted = true;
        portalActive = false;
    }
}

// ── Buttons, buzzer and temperature ──────────────────────────────────────────
// Short beep for a button press. Active buzzer, so a plain HIGH makes the sound;
// this blocks for BEEP_MS but that is far shorter than a HX711 conversion.
static void beep() {
    digitalWrite(BUZZER, HIGH);
    delay(BEEP_MS);
    digitalWrite(BUZZER, LOW);
}

// Send a frame to every connected transport (WebSocket + BLE).
static void broadcastFrame(const char *json, int len) {
    webSocket.broadcastTXT((char *)json, len);
    bleNotifyJson(json, len);
}

// Poll the two front-panel buttons from loop(). TARE zeroes the cell locally;
// TIMER just tells the app to start its shot clock via a "btn" frame. Both give
// a short beep. Each button is debounced independently and only fires on the
// press edge (LOW after being HIGH), so holding it down beeps once.
static void serviceButtons() {
    static bool tareWas = false, timerWas = false;
    static uint32_t tareAt = 0, timerAt = 0;
    uint32_t now = millis();

    bool tareDown = digitalRead(BTN_TARE) == LOW;
    if (tareDown && !tareWas && now - tareAt > BTN_DEBOUNCE_MS) {
        tareAt = now;
        beep();
        tare("Button tare");
        broadcastWeight();
    }
    tareWas = tareDown;

    bool timerDown = digitalRead(BTN_TIMER) == LOW;
    if (timerDown && !timerWas && now - timerAt > BTN_DEBOUNCE_MS) {
        timerAt = now;
        beep();
        const char *f = "{\"t\":\"btn\",\"id\":\"timer\"}";
        Serial.println("Timer button -> app");
        broadcastFrame(f, (int)strlen(f));
    }
    timerWas = timerDown;
}

// Broadcast the probe temperature about once a second. Requesting a conversion
// blocks briefly, so like everything else this runs from loop(), never a
// callback. A disconnected probe reads DEVICE_DISCONNECTED_C, which we skip.
static void serviceTemperature() {
    if (!tempPresent) return;
    static uint32_t last = 0;
    uint32_t now = millis();
    if (now - last < TEMP_INTERVAL_MS) return;
    last = now;

    tempSensor.requestTemperatures();
    float c = tempSensor.getTempCByIndex(0);
    if (c <= DEVICE_DISCONNECTED_C) return;

    char buf[32];
    int n = snprintf(buf, sizeof(buf), "{\"t\":\"temp\",\"c\":%.1f}", c);
    broadcastFrame(buf, n);
}

void setup() {
    Serial.begin(115200);
    delay(1000);

    scale.begin(DOUT, CLK);
    scale.set_gain(128);  // channel A, gain 128

    // Buttons idle HIGH via the internal pull-up; a press pulls them to GND.
    pinMode(BTN_TARE, INPUT_PULLUP);
    pinMode(BTN_TIMER, INPUT_PULLUP);
    pinMode(BUZZER, OUTPUT);
    digitalWrite(BUZZER, LOW);

    // Detect the DS18B20 once at boot; skip temp broadcasts if none is wired.
    tempSensor.begin();
    tempPresent = tempSensor.getDeviceCount() > 0;
    Serial.printf("Temp probe: %s\n", tempPresent ? "found" : "none");

    Serial.println();
    Serial.println("=== HX711 WEIGHT READOUT ===");
    Serial.println("Console only - no display, no touch.");
    Serial.println("Waiting for HX711...");

    while (!scale.is_ready()) {
        Serial.println("HX711 not ready - check DT/SCK/VCC/GND");
        delay(500);
    }
    Serial.println("HX711 ready");

    // Discard the first conversions after the gain change.
    scale.read();
    scale.read();
    scale.read();

    prefs.begin("gramo", false);
    applyCalibration(prefs.getFloat("cal", DEFAULT_CALIBRATION_FACTOR));
    if (prefs.isKey("cal")) {
        Serial.printf("Loaded saved calibration: %.6f counts/g\n", calibrationFactor);
    } else {
        Serial.printf("No saved calibration, using default %.6f counts/g\n", calibrationFactor);
        Serial.println("Run 'k' to calibrate this load cell.");
    }

    tare("Auto-taring at boot");

    // Double-tap RST within DRD_WINDOW_MS to wipe Wi-Fi and reopen the portal.
    if (consumeDoubleReset()) {
        Serial.println("Double reset detected - clearing saved Wi-Fi.");
        wm.resetSettings();
    }

      // Both transports stay up: the app probes them and uses whichever answers.
    startBle();

    connectWifi();
    webSocket.begin();
    webSocket.onEvent(webSocketEvent);

  

    printHelp();
}

void loop() {
    webSocket.loop();
    serviceWifiPortal();
    servicePendingBleCommand();
    handleSerial();
    serviceDoubleReset();
    serviceButtons();
    serviceTemperature();

    if (!streaming) {
        delay(50);
        return;
    }

    if (!scale.wait_ready_timeout(1000)) {
        Serial.println("HX711 not responding - check wiring");
        return;
    }

    long raw = scale.read_average(SAMPLES);
    long delta = raw - scale.get_offset();
    float weight = (float)delta / calibrationFactor;

    // Only move the shown value once the live reading leaves the deadband around it.
    if (fabsf(weight - displayedWeight) >= WEIGHT_DEADBAND) {
        displayedWeight = roundf(weight / WEIGHT_STEP) * WEIGHT_STEP;
    }

    Serial.printf("weight=%7.1f g   raw=%9ld   delta=%9ld\n", displayedWeight, raw, delta);
    broadcastWeight();

    delay(100);
}
