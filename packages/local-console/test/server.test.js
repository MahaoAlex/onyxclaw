import assert from "node:assert/strict";
import test from "node:test";

import { createLocalConsoleServer } from "../src/server.js";

function createController() {
  return {
    getStatus: () => ({ mode: "idle", instanceId: "local-mac" }),
    startLobsterMode: async () => ({ mode: "connected", connectionId: "c-1" }),
    stopLobsterMode: async () => ({ mode: "idle" }),
    getSoul: async () => ({ content: "# Soul\n", sha256: "abc", size: 7 }),
    saveSoul: async (content) => ({ content, sha256: "def", size: content.length }),
    restoreSoul: async () => ({ content: "# Original\n", sha256: "old", size: 11 }),
    confirmSoul: async (content) => ({
      content,
      sha256: "confirmed",
      soulConfirmed: true,
      currentStep: "chat",
    }),
    sendMessage: async (text) => ({ text: `reply:${text}`, durationMs: 4 }),
    sayHello: async () => ({ text: "personality hello", alreadySent: false }),
  };
}

test("Phase 1 API exposes status, lobster mode, SOUL, and chat", async (t) => {
  const app = createLocalConsoleServer({
    controller: createController(),
    host: "127.0.0.1",
    port: 0,
  });
  await app.start();
  t.after(() => app.stop({ cleanup: false }));

  const status = await fetch(`${app.url}/api/status`).then((response) => response.json());
  assert.equal(status.mode, "idle");

  const started = await fetch(`${app.url}/api/lobster/start`, {
    method: "POST",
    headers: { "x-onyxclaw-request": "local-ui" },
  }).then((response) => response.json());
  assert.equal(started.connectionId, "c-1");

  const soul = await fetch(`${app.url}/api/soul`).then((response) => response.json());
  assert.equal(soul.content, "# Soul\n");

  const saved = await fetch(`${app.url}/api/soul`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-onyxclaw-request": "local-ui",
    },
    body: JSON.stringify({ content: "updated" }),
  }).then((response) => response.json());
  assert.equal(saved.sha256, "def");

  const confirmed = await fetch(`${app.url}/api/soul/confirm`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-onyxclaw-request": "local-ui",
    },
    body: JSON.stringify({ content: "updated" }),
  }).then((response) => response.json());
  assert.equal(confirmed.soulConfirmed, true);

  const hello = await fetch(`${app.url}/api/chat/hello`, {
    method: "POST",
    headers: { "x-onyxclaw-request": "local-ui" },
  }).then((response) => response.json());
  assert.equal(hello.text, "personality hello");

  const chat = await fetch(`${app.url}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-onyxclaw-request": "local-ui",
    },
    body: JSON.stringify({ text: "hello" }),
  }).then((response) => response.json());
  assert.equal(chat.text, "reply:hello");
});

test("API rejects malformed JSON and unknown routes", async (t) => {
  const app = createLocalConsoleServer({
    controller: createController(),
    host: "127.0.0.1",
    port: 0,
  });
  await app.start();
  t.after(() => app.stop({ cleanup: false }));

  const malformed = await fetch(`${app.url}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-onyxclaw-request": "local-ui",
    },
    body: "{",
  });
  assert.equal(malformed.status, 400);

  const missing = await fetch(`${app.url}/api/missing`);
  assert.equal(missing.status, 404);
});

test("mutating API rejects requests without the local UI header", async (t) => {
  const app = createLocalConsoleServer({
    controller: createController(),
    host: "127.0.0.1",
    port: 0,
  });
  await app.start();
  t.after(() => app.stop({ cleanup: false }));

  const response = await fetch(`${app.url}/api/lobster/start`, { method: "POST" });

  assert.equal(response.status, 403);
});

test("web UI exposes the three local OpenClaw tabs without Sandbox controls", async (t) => {
  const app = createLocalConsoleServer({
    controller: createController(),
    host: "127.0.0.1",
    port: 0,
  });
  await app.start();
  t.after(() => app.stop({ cleanup: false }));

  const response = await fetch(app.url);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /龙虾模式/);
  assert.match(html, /性格设定/);
  assert.match(html, /和龙虾对话/);
  assert.match(html, /确认性格并继续/);
  assert.match(html, /data-step="soul"/);
  assert.match(html, /本机 OpenClaw/);
  assert.doesNotMatch(html, /创建 Sandbox/);
  assert.match(html, /src="\/app\.js"/);
});
