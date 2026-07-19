import assert from "node:assert/strict";
import test from "node:test";

import { onyxclawPlugin, resolveAccount } from "../src/channel.js";

test("resolveAccount reads the default channel account", () => {
  const account = resolveAccount({
    channels: {
      onyxclaw: {
        enabled: true,
        platformUrl: "ws://127.0.0.1:18890/channel",
        bootstrapToken: "bootstrap-secret",
        instanceId: "local-mac",
      },
    },
  });

  assert.equal(account.accountId, "default");
  assert.equal(account.instanceId, "local-mac");
  assert.equal(account.configured, true);
});

test("resolveAccount reports an unconfigured account without leaking secrets", () => {
  const account = resolveAccount({ channels: {} });

  assert.equal(account.configured, false);
  assert.equal(account.bootstrapToken, undefined);
});

test("plugin exposes only the capabilities needed by Phase 0", () => {
  assert.equal(onyxclawPlugin.id, "onyxclaw");
  assert.deepEqual(onyxclawPlugin.capabilities.chatTypes, ["direct"]);
  assert.equal(onyxclawPlugin.capabilities.media, false);
  assert.deepEqual(onyxclawPlugin.config.listAccountIds({}), ["default"]);
  assert.equal(typeof onyxclawPlugin.config.resolveAccount, "function");
  assert.equal(typeof onyxclawPlugin.gateway.startAccount, "function");
});
