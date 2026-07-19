import assert from "node:assert/strict";
import test from "node:test";

import { LocalConsoleController } from "../src/controller.js";

function fixture() {
  const calls = [];
  const simulator = {
    url: "ws://127.0.0.1:18890",
    issueBootstrapToken: (instanceId, token) =>
      calls.push(["token", instanceId, token]),
    start: async () => calls.push(["simulator.start"]),
    stop: async () => calls.push(["simulator.stop"]),
    waitForConnection: async () => ({ connectionId: "connection-1" }),
    sendInbound: (_instanceId, event) =>
      calls.push(["send", event.eventId, event.payload.text]),
    waitForNextOutbound: async () => ({
      eventId: "outbound-1",
      payload: { text: "hello from OpenClaw", inReplyTo: "inbound-1" },
    }),
  };
  const originalSoul = { existed: true, content: Buffer.from("original\n") };
  const driver = {
    prepare: async (input) => calls.push(["prepare", input]),
    probeGateway: async () => ({ ok: true }),
    disableChannel: async () => calls.push(["disable"]),
    readSoul: async () => ({ content: "original\n", sha256: "hash-original", size: 9 }),
    snapshotSoul: async () => originalSoul,
    writeAndVerifySoul: async (content) => ({ content, sha256: "hash-new", size: content.length }),
    restoreSoul: async (snapshot) => calls.push(["restore", snapshot]),
  };
  const controller = new LocalConsoleController({
    simulator,
    driver,
    instanceId: "local-mac",
    accountId: "default",
    tokenFactory: () => "secret-token",
    idFactory: () => "inbound-1",
    timeoutMs: 1_000,
  });
  return { controller, calls, originalSoul };
}

test("lobster mode configures the installed local OpenClaw and exposes status", async () => {
  const { controller, calls } = fixture();

  const status = await controller.startLobsterMode();

  assert.equal(status.mode, "connected");
  assert.equal(status.connectionId, "connection-1");
  assert.equal(status.gateway.ok, true);
  assert.deepEqual(calls.slice(0, 3), [
    ["token", "local-mac", "secret-token"],
    ["simulator.start"],
    [
      "prepare",
      {
        platformUrl: "ws://127.0.0.1:18890",
        instanceId: "local-mac",
        bootstrapToken: "secret-token",
      },
    ],
  ]);
});

test("SOUL editing keeps one backup and can restore it", async () => {
  const { controller, calls, originalSoul } = fixture();

  const saved = await controller.saveSoul("new personality\n");
  await controller.saveSoul("newer personality\n");
  await controller.restoreSoul();

  assert.equal(saved.sha256, "hash-new");
  assert.equal(calls.filter(([name]) => name === "restore").length, 1);
  assert.deepEqual(calls.find(([name]) => name === "restore"), [
    "restore",
    originalSoul,
  ]);
});

test("new user must confirm SOUL after lobster mode before chat", async () => {
  const { controller, calls } = fixture();

  await assert.rejects(() => controller.sendMessage("hello"), /龙虾模式/);
  await controller.startLobsterMode();
  await assert.rejects(() => controller.sendMessage("hello"), /确认性格/);
  const confirmed = await controller.confirmSoul("new personality\n");
  assert.equal(confirmed.soulConfirmed, true);
  assert.equal(confirmed.currentStep, "chat");
  const response = await controller.sendMessage("hello");

  assert.equal(response.text, "hello from OpenClaw");
  assert.equal(response.inboundEventId, "inbound-1");
  assert.equal(typeof response.durationMs, "number");
  assert.deepEqual(calls.find(([name]) => name === "send").slice(2), ["hello"]);
});

test("lobster mode advances a new user to personality confirmation", async () => {
  const { controller } = fixture();

  assert.equal(controller.getStatus().currentStep, "mode");
  const status = await controller.startLobsterMode();

  assert.equal(status.currentStep, "soul");
  assert.equal(status.soulConfirmed, false);
});

test("first chat entry generates exactly one personality-based hello", async () => {
  const { controller, calls } = fixture();
  await controller.startLobsterMode();
  await controller.confirmSoul("warm and concise\n");

  const first = await controller.sayHello();
  const repeated = await controller.sayHello();

  assert.equal(first.text, "hello from OpenClaw");
  assert.equal(first.alreadySent, false);
  assert.equal(repeated.text, first.text);
  assert.equal(repeated.alreadySent, true);
  assert.equal(calls.filter(([name]) => name === "send").length, 1);
  assert.match(calls.find(([name]) => name === "send")[2], /SOUL\.md/);
});

test("stop disables only the test channel and stops the simulator", async () => {
  const { controller, calls } = fixture();
  await controller.startLobsterMode();

  const status = await controller.stopLobsterMode();

  assert.equal(status.mode, "idle");
  assert.deepEqual(calls.slice(-2), [["disable"], ["simulator.stop"]]);
});

test("stopping an idle console does not restart OpenClaw", async () => {
  const { controller, calls } = fixture();

  const status = await controller.stopLobsterMode();

  assert.equal(status.mode, "idle");
  assert.deepEqual(calls, []);
});

test("failed lobster mode startup disables the test channel and stops simulator", async () => {
  const { controller, calls } = fixture();
  controller.getStatus();
  const broken = new LocalConsoleController({
    simulator: {
      url: "ws://127.0.0.1:18890",
      issueBootstrapToken: () => {},
      start: async () => calls.push(["broken.start"]),
      stop: async () => calls.push(["broken.stop"]),
      waitForConnection: async () => {
        throw new Error("connection timeout");
      },
    },
    driver: {
      prepare: async () => calls.push(["broken.prepare"]),
      disableChannel: async () => calls.push(["broken.disable"]),
    },
    timeoutMs: 10,
  });

  await assert.rejects(() => broken.startLobsterMode(), /connection timeout/);

  assert.equal(broken.getStatus().mode, "error");
  assert.deepEqual(calls.slice(-2), [["broken.disable"], ["broken.stop"]]);
});
