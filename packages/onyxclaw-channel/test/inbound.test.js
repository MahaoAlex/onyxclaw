import assert from "node:assert/strict";
import test from "node:test";

import { dispatchInboundEvent } from "../src/inbound.js";

test("dispatchInboundEvent routes a direct message and delivers the agent reply", async () => {
  const delivered = [];
  let capturedContext;
  const runtime = {
    routing: {
      resolveAgentRoute: () => ({
        agentId: "main",
        accountId: "default",
        sessionKey: "agent:main:onyxclaw:direct:phase0",
      }),
    },
    reply: {
      formatAgentEnvelope: ({ body }) => body,
      resolveEnvelopeFormatOptions: () => ({}),
      dispatchReplyWithBufferedBlockDispatcher: () => {},
    },
    inbound: {
      buildContext: (input) => {
        capturedContext = input;
        return input;
      },
      async run({ raw, adapter }) {
        const ingested = adapter.ingest(raw);
        const turn = await adapter.resolveTurn(ingested);
        await turn.delivery.deliver({ text: "pong" });
      },
    },
    session: {
      resolveStorePath: () => "/tmp/session.json",
      recordInboundSession: () => {},
    },
  };

  await dispatchInboundEvent({
    event: {
      eventId: "in-1",
      timestamp: "2026-07-18T00:00:00.000Z",
      payload: {
        senderId: "tester",
        chatId: "phase0",
        text: "ping",
      },
    },
    accountId: "default",
    cfg: {},
    channelRuntime: runtime,
    deliver: async (reply) => delivered.push(reply),
  });

  assert.equal(capturedContext.conversation.kind, "direct");
  assert.equal(capturedContext.message.bodyForAgent, "ping");
  assert.equal(delivered[0].text, "pong");
  assert.equal(delivered[0].inReplyTo, "in-1");
});
