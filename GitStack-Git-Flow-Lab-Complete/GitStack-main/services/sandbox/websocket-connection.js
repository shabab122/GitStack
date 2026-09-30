import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_CLIENT_MESSAGE_BYTES = 64 * 1024;

function buildFrame(opcode, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;

  if (body.length < 126) {
    header = Buffer.alloc(2);
    header[1] = body.length;
  } else if (body.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }

  header[0] = 0x80 | opcode;
  return Buffer.concat([header, body]);
}

export function rejectWebSocketUpgrade(socket, statusCode, message) {
  const reason = message || "WebSocket connection rejected.";
  socket.write(
    `HTTP/1.1 ${statusCode} ${reason}\r\n` +
      "Connection: close\r\n" +
      "Content-Type: application/json; charset=utf-8\r\n" +
      `Content-Length: ${Buffer.byteLength(JSON.stringify({ error: reason }))}\r\n` +
      "\r\n" +
      JSON.stringify({ error: reason })
  );
  socket.destroy();
}

export class WebSocketConnection extends EventEmitter {
  constructor(socket, head = Buffer.alloc(0)) {
    super();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.closed = false;

    socket.on("data", (chunk) => this.#consume(chunk));
    socket.on("close", () => this.#finish());
    socket.on("end", () => this.#finish());
    socket.on("error", (error) => this.emit("error", error));

    if (head.length) this.#consume(head);
  }

  sendJson(value) {
    if (this.closed) return;
    this.socket.write(buildFrame(0x1, JSON.stringify(value)));
  }

  sendText(value) {
    if (this.closed) return;
    this.socket.write(buildFrame(0x1, String(value)));
  }

  sendPong(payload) {
    if (this.closed) return;
    this.socket.write(buildFrame(0x0a, payload));
  }

  close(code = 1000, reason = "") {
    if (this.closed) return;
    this.closed = true;
    const reasonBuffer = Buffer.from(String(reason).slice(0, 120));
    const payload = Buffer.alloc(2 + reasonBuffer.length);
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2);
    this.socket.write(buildFrame(0x08, payload), () => this.socket.end());
    setTimeout(() => this.socket.destroy(), 500).unref();
  }

  #finish() {
    if (this.closed) return;
    this.closed = true;
    this.emit("close");
  }

  #consume(chunk) {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = Boolean(first & 0x80);
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let payloadLength = second & 0x7f;
      let offset = 2;

      if (!fin) {
        this.close(1003, "Fragmented frames are not supported.");
        return;
      }

      if (payloadLength === 126) {
        if (this.buffer.length < 4) return;
        payloadLength = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length < 10) return;
        const length = this.buffer.readBigUInt64BE(2);
        if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
          this.close(1009, "Message is too large.");
          return;
        }
        payloadLength = Number(length);
        offset = 10;
      }

      if (!masked) {
        this.close(1002, "Client frames must be masked.");
        return;
      }

      if (payloadLength > MAX_CLIENT_MESSAGE_BYTES) {
        this.close(1009, "Message is too large.");
        return;
      }

      const frameLength = offset + 4 + payloadLength;
      if (this.buffer.length < frameLength) return;

      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(
        this.buffer.subarray(offset + 4, frameLength)
      );
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
      this.buffer = this.buffer.subarray(frameLength);

      if (opcode === 0x08) {
        this.close(1000, "Client closed the connection.");
        this.emit("close");
        return;
      }
      if (opcode === 0x09) {
        this.sendPong(payload);
        continue;
      }
      if (opcode === 0x0a) continue;
      if (opcode !== 0x01 && opcode !== 0x02) {
        this.close(1003, "Unsupported WebSocket frame.");
        return;
      }

      this.emit("message", opcode === 0x01 ? payload.toString("utf8") : payload);
    }
  }
}

export function acceptWebSocketUpgrade(req, socket, head) {
  const key = req.headers["sec-websocket-key"];
  const version = req.headers["sec-websocket-version"];
  const upgrade = String(req.headers.upgrade || "").toLowerCase();

  if (!key || version !== "13" || upgrade !== "websocket") {
    rejectWebSocketUpgrade(socket, 400, "Invalid WebSocket handshake.");
    return null;
  }

  const accept = createHash("sha1")
    .update(`${key}${WEBSOCKET_GUID}`)
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n"
  );

  return new WebSocketConnection(socket, head);
}
