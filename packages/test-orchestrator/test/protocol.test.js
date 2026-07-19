import assert from "node:assert/strict";
import test from "node:test";

import {
  CHANNEL_PROTOCOL_VERSION,
  createInboundMessage,
  parseChannelEnvelope,
} from "../src/protocol.js";

test("createInboundMessage creates a versioned, routable event", () => {
  const event = createInboundMessage({
    eventId: "evt-1",
    instanceId: "local-mac",
    accountId: "default",
    senderId: "tester",
    chatId: "phase0",
    threadId: "thread-1",
    text: "reply with pong",
    timestamp: "2026-07-18T00:00:00.000Z",
  });

  assert.equal(event.protocolVersion, CHANNEL_PROTOCOL_VERSION);
  assert.equal(event.eventType, "message.inbound");
  assert.equal(event.payload.text, "reply with pong");
  assert.equal(event.payload.threadId, "thread-1");
});

test("parseChannelEnvelope rejects malformed events", () => {
  assert.throws(
    () => parseChannelEnvelope({ eventType: "message.inbound" }),
    /protocolVersion/,
  );
});

test("parseChannelEnvelope accepts supported heartbeat events", () => {
  const parsed = parseChannelEnvelope({
    protocolVersion: CHANNEL_PROTOCOL_VERSION,
    eventId: "evt-heartbeat",
    eventType: "heartbeat",
    timestamp: "2026-07-18T00:00:00.000Z",
    instanceId: "local-mac",
    accountId: "default",
    payload: {},
  });

  assert.equal(parsed.eventType, "heartbeat");
});
