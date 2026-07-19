import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalMacOpenClawDriver } from "../src/local-mac-driver.js";

test("prepare installs a missing plugin, configures the channel, and restarts", async () => {
  const calls = [];
  const runCommand = async (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === "plugins" && args[1] === "inspect") {
      throw new Error("plugin not found");
    }
    return { stdout: "ok", stderr: "" };
  };
  const driver = new LocalMacOpenClawDriver({
    runCommand,
    pluginPath: "/repo/packages/onyxclaw-channel",
    workspacePath: "/tmp/workspace",
  });

  await driver.prepare({
    platformUrl: "ws://127.0.0.1:18890",
    instanceId: "local-mac",
    bootstrapToken: "secret",
  });

  assert.deepEqual(calls[0], ["openclaw", "plugins", "inspect", "onyxclaw", "--json"]);
  assert.deepEqual(calls[1], [
    "openclaw",
    "plugins",
    "install",
    "--link",
    "/repo/packages/onyxclaw-channel",
  ]);
  assert.equal(calls[2][1], "config");
  assert.equal(calls[2][2], "set");
  assert.equal(calls[2][3], "channels.onyxclaw");
  assert.deepEqual(JSON.parse(calls[2][4]), {
    enabled: true,
    platformUrl: "ws://127.0.0.1:18890",
    bootstrapToken: "secret",
    instanceId: "local-mac",
  });
  assert.deepEqual(calls[3], ["openclaw", "gateway", "restart"]);
});

test("SOUL snapshot is restored byte-for-byte after a verification write", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "onyxclaw-driver-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const soulPath = path.join(root, "SOUL.md");
  const original = Buffer.from("# Existing soul\n\nprivate content\n", "utf8");
  await writeFile(soulPath, original);
  const driver = new LocalMacOpenClawDriver({
    runCommand: async () => ({ stdout: "", stderr: "" }),
    pluginPath: "/repo/plugin",
    workspacePath: root,
  });

  const snapshot = await driver.snapshotSoul();
  const verification = await driver.writeAndVerifySoul("# Phase 0 soul\n");
  assert.equal(verification.content, "# Phase 0 soul\n");
  assert.match(verification.sha256, /^[a-f0-9]{64}$/);

  await driver.restoreSoul(snapshot);
  assert.deepEqual(await readFile(soulPath), original);
});

test("restore removes SOUL.md when it did not exist before the test", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "onyxclaw-driver-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const driver = new LocalMacOpenClawDriver({
    runCommand: async () => ({ stdout: "", stderr: "" }),
    pluginPath: "/repo/plugin",
    workspacePath: root,
  });

  const snapshot = await driver.snapshotSoul();
  await driver.writeAndVerifySoul("temporary\n");
  await driver.restoreSoul(snapshot);

  await assert.rejects(readFile(path.join(root, "SOUL.md")), /ENOENT/);
});

test("readSoul returns editable content and verification metadata", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "onyxclaw-driver-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "SOUL.md"), "# Local personality\n");
  const driver = new LocalMacOpenClawDriver({
    runCommand: async () => ({ stdout: "", stderr: "" }),
    pluginPath: "/repo/plugin",
    workspacePath: root,
  });

  const soul = await driver.readSoul();

  assert.equal(soul.existed, true);
  assert.equal(soul.content, "# Local personality\n");
  assert.equal(soul.size, 20);
  assert.match(soul.sha256, /^[a-f0-9]{64}$/);
});
