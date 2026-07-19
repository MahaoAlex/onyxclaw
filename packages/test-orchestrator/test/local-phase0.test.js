import assert from "node:assert/strict";
import test from "node:test";

import { runLocalPhase0 } from "../src/local-phase0.js";

test("local Phase 0 runs reconnect, restart, SOUL verification, two messages, and cleanup", async () => {
  const calls = [];
  const connections = [
    { connectionId: "connection-1" },
    { connectionId: "connection-2" },
    { connectionId: "connection-3" },
  ];
  const outbound = [
    { eventId: "out-1", payload: { text: "first-ok" } },
    { eventId: "out-2", payload: { text: "second-ok" } },
  ];
  const simulator = {
    url: "ws://127.0.0.1:18890",
    issueBootstrapToken: (instanceId, token) => calls.push(["issueToken", instanceId, token]),
    start: async () => calls.push(["simulator.start"]),
    stop: async () => calls.push(["simulator.stop"]),
    waitForConnection: async (_instanceId, options) => {
      calls.push(["waitForConnection", options]);
      return connections.shift();
    },
    forceDisconnect: (instanceId) => calls.push(["forceDisconnect", instanceId]),
    sendInbound: (_instanceId, event) => calls.push(["sendInbound", event.payload.text]),
    waitForNextOutbound: async () => outbound.shift(),
  };
  const driver = {
    snapshotSoul: async () => ({ existed: true, content: Buffer.from("original") }),
    prepare: async (input) => calls.push(["driver.prepare", input.bootstrapToken]),
    writeAndVerifySoul: async () => ({ sha256: "hash-1", size: 16 }),
    readSoulVerification: async () => ({ sha256: "hash-1", size: 16 }),
    probeGateway: async () => ({ ok: true }),
    restoreSoul: async () => calls.push(["driver.restoreSoul"]),
    disableChannel: async () => calls.push(["driver.disableChannel"]),
  };

  const report = await runLocalPhase0({
    simulator,
    driver,
    instanceId: "local-mac",
    accountId: "default",
    bootstrapToken: "token-1",
    restartBootstrapToken: "token-2",
    timeoutMs: 1_000,
  });

  assert.equal(report.result, "passed");
  assert.deepEqual(report.replies, ["first-ok", "second-ok"]);
  assert.equal(calls.filter(([name]) => name === "driver.prepare").length, 2);
  assert.equal(calls.filter(([name]) => name === "sendInbound").length, 2);
  assert.ok(calls.some(([name]) => name === "forceDisconnect"));
  assert.deepEqual(calls.slice(-3), [
    ["driver.restoreSoul"],
    ["driver.disableChannel"],
    ["simulator.stop"],
  ]);
});
