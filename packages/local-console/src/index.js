import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LocalMacOpenClawDriver } from "../../test-orchestrator/src/local-mac-driver.js";
import { WsPlatformSimulator } from "../../test-orchestrator/src/ws-simulator.js";
import { LocalConsoleController } from "./controller.js";
import { createLocalConsoleServer } from "./server.js";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(sourceDirectory, "../../..");
const host = process.env.PHASE1_HOST ?? "127.0.0.1";
const port = Number(process.env.PHASE1_PORT ?? "3000");
const instanceId = process.env.CHANNEL_INSTANCE_ID ?? "local-mac";
const accountId = process.env.CHANNEL_ACCOUNT_ID ?? "default";
const workspacePath =
  process.env.OPENCLAW_WORKSPACE ?? path.join(os.homedir(), ".openclaw", "workspace");

const simulator = new WsPlatformSimulator({
  host: process.env.CHANNEL_HOST ?? "127.0.0.1",
  port: Number(process.env.CHANNEL_PORT ?? "18890"),
});
const driver = new LocalMacOpenClawDriver({
  pluginPath: path.join(repositoryRoot, "packages", "onyxclaw-channel"),
  workspacePath,
});
const controller = new LocalConsoleController({
  simulator,
  driver,
  instanceId,
  accountId,
  timeoutMs: Number(process.env.PHASE1_TIMEOUT_MS ?? "120000"),
  tokenFactory: () => `phase1-${randomUUID()}`,
});
const app = createLocalConsoleServer({ controller, host, port });

await app.start();
process.stdout.write(`OnyxClaw Phase 1: ${app.url}\n`);
process.stdout.write("仅使用本机 OpenClaw；按 Ctrl+C 停止并清理测试 Channel。\n");

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  process.stdout.write(`\n收到 ${signal}，正在清理…\n`);
  try {
    await app.stop();
    process.exitCode = 0;
  } catch (error) {
    process.stderr.write(`清理失败：${error.message}\n`);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
