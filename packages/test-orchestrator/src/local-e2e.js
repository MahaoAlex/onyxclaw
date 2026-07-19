import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalPhase0 } from "./local-phase0.js";
import { LocalMacOpenClawDriver } from "./local-mac-driver.js";
import { WsPlatformSimulator } from "./ws-simulator.js";

const host = process.env.CHANNEL_HOST ?? "127.0.0.1";
const port = Number(process.env.CHANNEL_PORT ?? "18890");
const instanceId = process.env.CHANNEL_INSTANCE_ID ?? "local-mac";
const accountId = process.env.CHANNEL_ACCOUNT_ID ?? "default";
const timeoutMs = Number(process.env.PHASE0_TIMEOUT_MS ?? "120000");
const workspacePath =
  process.env.OPENCLAW_WORKSPACE ?? path.join(os.homedir(), ".openclaw", "workspace");
const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(sourceDirectory, "../../..");
const pluginPath = path.join(repositoryRoot, "packages", "onyxclaw-channel");

const simulator = new WsPlatformSimulator({ host, port });
const driver = new LocalMacOpenClawDriver({ pluginPath, workspacePath });

const report = await runLocalPhase0({
  simulator,
  driver,
  instanceId,
  accountId,
  bootstrapToken: `phase0-initial-${randomUUID()}`,
  restartBootstrapToken: `phase0-rotated-${randomUUID()}`,
  timeoutMs,
  firstPrompt:
    process.env.PHASE0_FIRST_PROMPT ??
    "Reply with exactly: ONYXCLAW_PHASE0_FIRST_OK",
  secondPrompt:
    process.env.PHASE0_SECOND_PROMPT ??
    "Reply with exactly: ONYXCLAW_PHASE0_SECOND_OK",
  onProgress(name) {
    process.stderr.write(`[phase0] ${name}\n`);
  },
});

await mkdir(path.join(repositoryRoot, "artifacts"), { recursive: true });
const reportPath = path.join(
  repositoryRoot,
  "artifacts",
  `phase0-local-${report.runId}.json`,
);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const output = JSON.stringify({ ...report, reportPath }, null, 2);
if (report.result === "passed") {
  process.stdout.write(`${output}\n`);
} else {
  process.stderr.write(`${output}\n`);
  process.exitCode = 1;
}
