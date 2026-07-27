/**
 * Minimal WebSocket server that simulates an ESP32 coffee scale.
 * Protocol (JSON text frames):
 *   server → client  { "t":"w", "g":12.34 }     // weight @ ~10 Hz
 *   client → server  { "t":"tare" }
 *   client → server  { "t":"pour", "rate":9 }    // g/s, 0 = stop
 *   client → server  { "t":"set", "g":50 }
 *
 * Usage: node scripts/esp32-sim.mjs
 * Default: ws://127.0.0.1:8787
 */
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.SCALE_PORT ?? 8787);
const HOST = process.env.SCALE_HOST ?? "127.0.0.1";

let grams = 0;
let tareOffset = 0;
let pourRate = 0; // g/s
let lastTick = Date.now();

/** @type {Set<import('node:stream').Duplex>} */
const clients = new Set();

function rawWeight() {
  return Math.max(0, grams - tareOffset);
}

function broadcastWeight() {
  const payload = JSON.stringify({
    t: "w",
    g: Math.round(rawWeight() * 100) / 100,
  });
  for (const socket of clients) {
    try {
      sendText(socket, payload);
    } catch {
      clients.delete(socket);
    }
  }
}

function tickPhysics() {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  if (pourRate > 0) {
    // Flow multiplier wanders between 0.5× and 1.5× the commanded rate
    const jitter = 0.5 + Math.random();
    grams += pourRate * jitter * dt;
  }
}

function handleMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    return;
  }
  if (msg.t === "tare") {
    tareOffset = grams;
    console.log(`[scale] tare → ${rawWeight().toFixed(2)} g`);
  } else if (msg.t === "pour") {
    pourRate = Number(msg.rate) || 0;
    console.log(`[scale] pour rate ${pourRate} g/s`);
  } else if (msg.t === "set" && typeof msg.g === "number") {
    grams = tareOffset + msg.g;
    console.log(`[scale] set ${rawWeight().toFixed(2)} g`);
  } else if (msg.t === "stop") {
    pourRate = 0;
  }
}

// ── Minimal WebSocket (RFC 6455 text frames) ─────────────────────────────────

function acceptKey(secKey) {
  return crypto
    .createHash("sha1")
    .update(secKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
}

function sendText(socket, text) {
  const data = Buffer.from(text, "utf8");
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  socket.write(Buffer.concat([header, data]));
}

function parseFrames(buffer, onText) {
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const b0 = buffer[offset];
    const b1 = buffer[offset + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let pos = offset + 2;
    if (len === 126) {
      if (pos + 2 > buffer.length) break;
      len = buffer.readUInt16BE(pos);
      pos += 2;
    } else if (len === 127) {
      if (pos + 8 > buffer.length) break;
      len = Number(buffer.readBigUInt64BE(pos));
      pos += 8;
    }
    const maskLen = masked ? 4 : 0;
    if (pos + maskLen + len > buffer.length) break;
    let payload = buffer.subarray(pos + maskLen, pos + maskLen + len);
    if (masked) {
      const mask = buffer.subarray(pos, pos + 4);
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }
    offset = pos + maskLen + len;
    if (opcode === 0x8) return { rest: buffer.subarray(offset), closed: true };
    if (opcode === 0x1) onText(payload.toString("utf8"));
    if (opcode === 0x9) {
      // ping → pong
    }
  }
  return { rest: buffer.subarray(offset), closed: false };
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(
    `Grano ESP32 scale simulator\nWebSocket: ws://${HOST}:${PORT}\nWeight: ${rawWeight().toFixed(2)} g\n`,
  );
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n` +
    "\r\n",
  );

  clients.add(socket);
  console.log(`[scale] client connected (${clients.size})`);
  sendText(
    socket,
    JSON.stringify({ t: "w", g: Math.round(rawWeight() * 100) / 100 }),
  );

  let buf = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    const { rest, closed } = parseFrames(buf, handleMessage);
    buf = Buffer.from(rest);
    if (closed) socket.end();
  });
  socket.on("close", () => {
    clients.delete(socket);
    console.log(`[scale] client disconnected (${clients.size})`);
  });
  socket.on("error", () => {
    clients.delete(socket);
  });
});

setInterval(() => {
  tickPhysics();
  broadcastWeight();
}, 100);

server.listen(PORT, HOST, () => {
  console.log(`[scale] ESP32 simulator listening on ws://${HOST}:${PORT}`);
  console.log(`[scale] HTTP probe: http://${HOST}:${PORT}/`);
});
