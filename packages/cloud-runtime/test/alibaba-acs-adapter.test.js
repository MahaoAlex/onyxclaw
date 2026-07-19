import assert from "node:assert/strict";
import test from "node:test";

import {
  AlibabaAcsAdapter,
  CloudRuntimeError,
  createAlibabaAcsAdapter,
} from "../src/alibaba-acs-adapter.js";

function provider() {
  return {
    api: {
      baseUrl: "http://127.0.0.1:18081",
      requestTimeoutMs: 30_000,
    },
    sandbox: {
      templateId: "onyxclaw",
      timeoutMs: 300_000,
      secure: false,
      defaultUser: "node",
    },
  };
}

function fixture({ createError } = {}) {
  const calls = [];
  const files = new Map();
  const session = {
    sandboxId: "default--onyxclaw-test",
    async runCommand(command, options) {
      calls.push(["command", command, options]);
      return { exitCode: 0, stdout: "ok", stderr: "" };
    },
    async writeFile(path, content, options) {
      calls.push(["write", path, options]);
      files.set(path, content);
    },
    async readFile(path, options) {
      calls.push(["read", path, options]);
      return files.get(path);
    },
    async kill() {
      calls.push(["kill"]);
    },
  };
  const client = {
    async create(options) {
      calls.push(["create", options]);
      if (createError) throw createError;
      return session;
    },
    async connect(sandboxId) {
      calls.push(["connect", sandboxId]);
      return { ...session, sandboxId };
    },
  };
  const clientFactory = (options) => {
    calls.push(["factory", options]);
    return client;
  };
  return { calls, clientFactory };
}

test("maps provider configuration into an E2B-compatible ACS client", async () => {
  const { calls, clientFactory } = fixture();
  const adapter = new AlibabaAcsAdapter({
    provider: provider(),
    secrets: { apiKey: "runtime-secret" },
    clientFactory,
  });

  const created = await adapter.createSandbox({
    metadata: { traceId: "trace-1" },
    envs: { ONYXCLAW_INSTANCE_ID: "instance-1" },
  });

  assert.deepEqual(created, {
    sandboxId: "default--onyxclaw-test",
    status: "running",
  });
  assert.deepEqual(calls[0], ["factory", {
    apiKey: "runtime-secret",
    baseUrl: "http://127.0.0.1:18081",
    requestTimeoutMs: 30_000,
  }]);
  assert.deepEqual(calls[1], ["create", {
    template: "onyxclaw",
    timeoutSeconds: 300,
    secure: false,
    metadata: { traceId: "trace-1" },
    envs: { ONYXCLAW_INSTANCE_ID: "instance-1" },
  }]);
});

test("uses the configured runtime user for commands and files, then kills", async () => {
  const { calls, clientFactory } = fixture();
  const adapter = new AlibabaAcsAdapter({
    provider: provider(),
    secrets: { apiKey: "runtime-secret" },
    clientFactory,
  });
  const { sandboxId } = await adapter.createSandbox();

  assert.deepEqual(await adapter.runCommand(sandboxId, "id"), {
    exitCode: 0,
    stdout: "ok",
    stderr: "",
  });
  await adapter.writeFile(sandboxId, "/home/node/test.txt", "hello");
  assert.equal(await adapter.readFile(sandboxId, "/home/node/test.txt"), "hello");
  await adapter.killSandbox(sandboxId);

  assert.deepEqual(calls.slice(2), [
    ["command", "id", { user: "node" }],
    ["write", "/home/node/test.txt", { user: "node" }],
    ["read", "/home/node/test.txt", { user: "node" }],
    ["kill"],
  ]);
});

test("connects an existing Sandbox ID before operating on it", async () => {
  const { calls, clientFactory } = fixture();
  const adapter = new AlibabaAcsAdapter({
    provider: provider(),
    secrets: { apiKey: "runtime-secret" },
    clientFactory,
  });

  assert.deepEqual(await adapter.connectSandbox("existing-sandbox"), {
    sandboxId: "existing-sandbox",
    status: "running",
  });
  await adapter.runCommand("existing-sandbox", "pwd");

  assert.deepEqual(calls.slice(1), [
    ["connect", "existing-sandbox"],
    ["command", "pwd", { user: "node" }],
  ]);
});

test("wraps provider failures with a stage and redacts secrets", async () => {
  const secret = "runtime-secret-value";
  const { clientFactory } = fixture({
    createError: new Error(`authentication failed for ${secret}`),
  });
  const adapter = new AlibabaAcsAdapter({
    provider: provider(),
    secrets: { apiKey: secret },
    clientFactory,
  });

  await assert.rejects(adapter.createSandbox(), (error) => {
    assert.ok(error instanceof CloudRuntimeError);
    assert.equal(error.stage, "create");
    assert.equal(error.code, "CLOUD_RUNTIME_CREATE_FAILED");
    assert.doesNotMatch(error.message, new RegExp(secret));
    assert.match(error.message, /\[REDACTED\]/);
    return true;
  });
});

test("builds the adapter from the shared provider registry", async () => {
  const { calls, clientFactory } = fixture();
  const registryCalls = [];
  const registry = {
    getProvider(providerId) {
      registryCalls.push(["provider", providerId]);
      return provider();
    },
    getSecrets(providerId) {
      registryCalls.push(["secrets", providerId]);
      return { apiKey: "runtime-secret" };
    },
  };

  const adapter = createAlibabaAcsAdapter({ registry, clientFactory });
  await adapter.createSandbox();

  assert.deepEqual(registryCalls, [
    ["provider", "alicloud-acs"],
    ["secrets", "alicloud-acs"],
  ]);
  assert.equal(calls[0][0], "factory");
});
