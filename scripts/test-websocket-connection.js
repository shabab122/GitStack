import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { WebSocketConnection } from "../services/sandbox/websocket-connection.js";

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.writes = [];
    this.destroyed = false;
  }
  write(data, callback) {
    this.writes.push(Buffer.from(data));
    callback?.();
    return true;
  }
  end() { this.emit("end"); }
  destroy() { this.destroyed = true; this.emit("close"); }
}

function maskedTextFrame(text) {
  const payload = Buffer.from(text);
  const mask = Buffer.from([1, 2, 3, 4]);
  const frame = Buffer.alloc(2 + 4 + payload.length);
  frame[0] = 0x81;
  frame[1] = 0x80 | payload.length;
  mask.copy(frame, 2);
  for (let index = 0; index < payload.length; index += 1) {
    frame[6 + index] = payload[index] ^ mask[index % 4];
  }
  return frame;
}

const socket = new FakeSocket();
const connection = new WebSocketConnection(socket);
const received = new Promise((resolve) => connection.once("message", resolve));
socket.emit("data", maskedTextFrame(JSON.stringify({ type: "input", data: "git init\r" })));
const message = JSON.parse(await received);
assert.equal(message.type, "input");
assert.equal(message.data, "git init\r");
connection.sendJson({ type: "status", status: "connected" });
assert.ok(socket.writes.length >= 1);
console.log("WebSocket framing test passed.");
