import assert from "node:assert/strict";
import test from "node:test";

import {
  CloudGatewayProbe,
  buildOpenClawConfig,
} from "../src/cloud-app-support.js";

test("builds a complete cloud config without mutating the provider template", () => {
  const baseConfig = {
    agents: { defaults: { model: { primary: "test/model" } } },
    models: {
      providers: {
        test: { apiKey: "__ONYXCLAW_MODEL_API_KEY__" },
      },
    },
    plugins: { load: { paths: ["/existing/plugin"] } },
  };
  const result = buildOpenClawConfig({
    baseConfig,
    modelApiKey: "model-secret",
    platformUrl: "ws://onyxclaw-app.default.svc.cluster.local:18890",
    instanceId: "instance-1",
    bootstrapToken: "bootstrap-secret",
  });

  assert.equal(result.models.providers.test.apiKey, "model-secret");
  assert.deepEqual(result.plugins.load.paths, [
    "/existing/plugin",
    "/opt/onyxclaw/channel",
  ]);
  assert.equal(result.plugins.entries.onyxclaw.enabled, true);
  assert.deepEqual(result.channels.onyxclaw, {
    enabled: true,
    platformUrl: "ws://onyxclaw-app.default.svc.cluster.local:18890",
    instanceId: "instance-1",
    bootstrapToken: "bootstrap-secret",
  });
  assert.equal(baseConfig.models.providers.test.apiKey, "__ONYXCLAW_MODEL_API_KEY__");
});

test("rejects a model config that never consumes the injected model key", () => {
  assert.throws(
    () => buildOpenClawConfig({
      baseConfig: { models: {} },
      modelApiKey: "model-secret",
      platformUrl: "ws://channel.internal",
      instanceId: "instance-1",
      bootstrapToken: "bootstrap-secret",
    }),
    /model key placeholder/,
  );
});

test("Gateway probe retries inside the Sandbox until ready", async () => {
  const calls = [];
  const responses = [1, 1, 0];
  const adapter = {
    async runCommand(sandboxId, command) {
      calls.push([sandboxId, command]);
      return { exitCode: responses.shift(), stdout: "", stderr: "" };
    },
  };
  const probe = new CloudGatewayProbe({
    adapter,
    timeoutMs: 1000,
    intervalMs: 0,
  });

  assert.deepEqual(await probe.waitUntilReady("sandbox-1", { port: 18789 }), {
    ok: true,
    attempts: 3,
  });
  assert.equal(calls.length, 3);
  assert.match(calls[0][1], /127\.0\.0\.1:18789/);
});
