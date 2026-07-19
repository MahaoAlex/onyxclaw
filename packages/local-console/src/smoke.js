import { createHash } from "node:crypto";

const baseUrl = process.env.PHASE1_URL ?? "http://127.0.0.1:3000";
const steps = [];
const startedAt = new Date();

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "x-onyxclaw-request": "local-ui",
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path}: ${body.error ?? `HTTP ${response.status}`}`);
  return body;
}

async function step(name, operation) {
  const started = Date.now();
  try {
    const result = await operation();
    steps.push({ name, result: "passed", durationMs: Date.now() - started });
    return result;
  } catch (error) {
    steps.push({
      name,
      result: "failed",
      durationMs: Date.now() - started,
      error: error.message,
    });
    throw error;
  }
}

let originalSoul;
let reply;
let failure;
try {
  await step("ui.load", async () => {
    const response = await fetch(baseUrl);
    const html = await response.text();
    if (!response.ok || !html.includes("龙虾模式") || !html.includes("和龙虾对话")) {
      throw new Error("Phase 1 UI contract mismatch");
    }
  });
  await step("lobster.start", async () => {
    const status = await api("/api/lobster/start", { method: "POST" });
    if (status.mode !== "connected" || !status.gateway?.ok) {
      throw new Error("local OpenClaw did not become healthy and connected");
    }
  });
  originalSoul = await step("soul.read", () => api("/api/soul"));
  const temporaryContent = `# Phase 1 smoke verification\n\nRun: ${startedAt.toISOString()}\n`;
  await step("soul.write.verify", async () => {
    const saved = await api("/api/soul", {
      method: "PUT",
      body: JSON.stringify({ content: temporaryContent }),
    });
    if (saved.sha256 !== sha256(temporaryContent)) {
      throw new Error("SOUL.md write hash mismatch");
    }
  });
  await step("soul.restore.verify", async () => {
    const restored = await api("/api/soul/restore", { method: "POST" });
    if (
      restored.sha256 !== originalSoul.sha256 ||
      restored.content !== originalSoul.content
    ) {
      throw new Error("SOUL.md was not restored byte-for-byte");
    }
  });
  await step("soul.confirm", () =>
    api("/api/soul/confirm", {
      method: "POST",
      body: JSON.stringify({ content: originalSoul.content }),
    }),
  );
  await step("chat.personality_hello", async () => {
    const hello = await api("/api/chat/hello", { method: "POST" });
    if (!hello.text?.trim() || hello.alreadySent) {
      throw new Error("first personality hello was not generated");
    }
    const repeated = await api("/api/chat/hello", { method: "POST" });
    if (!repeated.alreadySent || repeated.text !== hello.text) {
      throw new Error("personality hello was generated more than once");
    }
  });
  reply = await step("chat.roundtrip", () =>
    api("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        text: "你好，这是一次本机 UI Channel 连通性测试，请简短回复。",
      }),
    }),
  );
  if (!reply.text?.trim()) {
    throw new Error("OpenClaw returned an empty reply");
  }
} catch (error) {
  failure = error;
} finally {
  try {
    await step("lobster.stop", () => api("/api/lobster/stop", { method: "POST" }));
  } catch (error) {
    failure ??= error;
  }
}

const report = {
  target: "phase1-local-ui",
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  result: failure ? "failed" : "passed",
  ...(failure ? { error: failure.message } : {}),
  ...(reply
    ? { reply: reply.text, traceId: reply.traceId, roundtripMs: reply.durationMs }
    : {}),
  steps,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failure) process.exitCode = 1;
