/* global TextDecoder, TextEncoder, URL */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

test("read-only RTC observation preserves packets and counts metadata without text", async () => {
  const source = await fs.readFile(new URL("./full-app.mjs", import.meta.url), "utf8");
  const prefix = "  await page.addInitScript(";
  const start = source.indexOf(prefix) + prefix.length;
  const end = source.indexOf('\n  page.on("request"', start);
  assert.ok(start >= prefix.length && end > start);
  const callback = source.slice(start, end).trim().replace(/\);$/, "");
  const sent = [];
  class Channel {
    listeners = new Map();
    addEventListener(name, listener) {
      this.listeners.set(name, listener);
    }
    send(packet) {
      sent.push(packet);
      return "native-result";
    }
  }
  class Peer {
    listeners = new Map();
    createDataChannel() {
      return new Channel();
    }
    addEventListener(name, listener) {
      this.listeners.set(name, listener);
    }
    setRemoteDescription() {
      return "native-description";
    }
  }
  const window = { RTCDataChannel: Channel, RTCPeerConnection: Peer };
  vm.runInNewContext(`(${callback})()`, {
    window,
    TextDecoder,
    performance: { now: () => 42 },
    setInterval: () => 1,
    ArrayBuffer,
    WeakMap,
    WeakSet,
    Map,
  });
  const channel = new Peer().createDataChannel();
  const packet = new TextEncoder().encode(
    "\u0008\u0001" +
      JSON.stringify({
        event_type: "elevenlabs_agent_command",
        event_id: "uuid-qa",
        session_id: "session-qa",
        elevenlabs_event_type: "user_message",
        data: { text: 'private { text } with "quotes"' },
      }) +
      "\u0010"
  );
  assert.equal(channel.send(packet), "native-result");
  assert.equal(sent.length, 1);
  assert.equal(sent[0], packet);
  channel.listeners.get("message")({
    data: new TextEncoder().encode(
      JSON.stringify({
        event_type: "avatar.speak_started",
        event_id: "start-qa",
        source_event_id: "uuid-qa",
        session_id: "session-qa",
      })
    ),
  });
  const observed = window.__yuniQAMedia;
  assert.equal(observed.commands.length, 1);
  assert.equal(observed.commands[0].commandType, "user_message");
  assert.equal(observed.providerEvents[0].sourceEventId, "uuid-qa");
  assert.ok(!JSON.stringify(observed).includes("private"));
  channel.send(new Uint8Array([1, 2, 3]));
  assert.equal(sent.length, 2);
  assert.equal(observed.commands.length, 1);
});
