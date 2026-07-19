import assert from "node:assert/strict";
import test from "node:test";

import { CloudConsoleController } from "../src/cloud-controller.js";

function fixture() {
  const calls = [];
  const adapter = {
    async createSandbox(options) {
      calls.push(["create", options]);
      return { sandboxId: "sandbox-1", status: "running" };
    },
    async connectSandbox(id) {
      calls.push(["connect", id]);
      return { sandboxId: id, status: "running" };
    },
    async killSandbox(id) {
      calls.push(["kill", id]);
    },
  };
  const saga = {
    async bootstrapSandbox(options) {
      calls.push(["bootstrap", options]);
      return { ...options, connectionId: "connection-1", status: "ready" };
    },
  };
  const controller = new CloudConsoleController({
    adapter,
    saga,
    instanceIdFactory: () => "instance-1",
    traceIdFactory: () => "trace-1",
    defaultSoul: "# Default lobster",
    buildConfig: ({ instanceId }) => ({ instanceId }),
  });
  return { calls, controller };
}

test("new users allocate first, then bootstrap the same Sandbox after SOUL confirmation", async () => {
  const { calls, controller } = fixture();

  assert.deepEqual(await controller.startLobsterMode(), {
    mode: "allocated",
    currentStep: "soul",
    soulConfirmed: false,
    sandboxId: "sandbox-1",
    instanceId: "instance-1",
    connectionId: null,
    traceId: "trace-1",
    error: null,
  });
  const soul = await controller.getSoul();
  assert.equal(soul.content, "# Default lobster");
  await controller.confirmSoul("# Brave lobster");
  assert.equal(controller.getStatus().currentStep, "chat");
  assert.equal(controller.getStatus().soulConfirmed, true);
  assert.deepEqual(calls.map(([name]) => name), ["create", "bootstrap"]);
  assert.equal(calls[1][1].sandboxId, "sandbox-1");
});

test("existing users connect by Sandbox ID and skip personality confirmation", async () => {
  const { calls, controller } = fixture();
  const status = await controller.startLobsterMode({ sandboxId: "saved-sandbox" });

  assert.equal(status.mode, "connected");
  assert.equal(status.currentStep, "chat");
  assert.equal(status.soulConfirmed, true);
  assert.deepEqual(calls, [["connect", "saved-sandbox"]]);
});

test("stop kills the cloud Sandbox and resets the serial flow", async () => {
  const { calls, controller } = fixture();
  await controller.startLobsterMode();
  const status = await controller.stopLobsterMode();

  assert.equal(status.mode, "idle");
  assert.equal(status.currentStep, "mode");
  assert.deepEqual(calls.at(-1), ["kill", "sandbox-1"]);
});
