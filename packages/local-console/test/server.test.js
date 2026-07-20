import assert from "node:assert/strict";
import test from "node:test";

import { createSandboxServiceMonitor } from "../src/observability.js";
import { createLocalConsoleServer } from "../src/server.js";

function createController() {
  return {
    getStatus: () => ({ mode: "idle", instanceId: "local-mac" }),
    startLobsterMode: async () => ({ mode: "connected", connectionId: "c-1" }),
    stopLobsterMode: async () => ({ mode: "idle" }),
    resetNewUser: async () => ({ mode: "idle", currentStep: "mode", soulConfirmed: false }),
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

test("UI config exposes safe runtime identity without provider secrets", async (t) => {
  const app = createLocalConsoleServer({
    controller: createController(),
    host: "127.0.0.1",
    port: 0,
    uiConfig: {
      deploymentMode: "cloud",
      providerId: "alicloud-acs",
      providerName: "Alibaba Cloud ACS Agent Sandbox",
    },
  });
  await app.start();
  t.after(() => app.stop({ cleanup: false }));

  const config = await fetch(`${app.url}/api/ui-config`).then((response) => response.json());

  assert.deepEqual(config, {
    deploymentMode: "cloud",
    providerId: "alicloud-acs",
    providerName: "Alibaba Cloud ACS Agent Sandbox",
  });
  assert.doesNotMatch(JSON.stringify(config), /apiKey|secret|baseUrl/i);
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

test("observability API reports only injected Sandbox Service calls and objects", async (t) => {
  const monitor = createSandboxServiceMonitor();
  const call = monitor.begin({ api: "Sandbox.create", target: "Sandbox Manager" });
  monitor.succeed(call, {
    object: { type: "Sandbox", id: "sandbox-1", state: "running" },
  });
  const app = createLocalConsoleServer({
    controller: createController(),
    operationMonitor: monitor,
    host: "127.0.0.1",
    port: 0,
  });
  await app.start();
  t.after(() => app.stop({ cleanup: false }));

  await fetch(`${app.url}/api/status`);
  const observation = await fetch(`${app.url}/api/observability`).then((response) => response.json());

  assert.equal(observation.calls[0].api, "Sandbox.create");
  assert.equal(observation.calls[0].state, "succeeded");
  assert.equal(observation.objects[0].id, "sandbox-1");
  assert.doesNotMatch(JSON.stringify(observation), /x-onyxclaw-request|content-type/);
});

test("ordinary BFF and OpenClaw calls do not enter Sandbox Service telemetry", async (t) => {
  const app = createLocalConsoleServer({
    controller: createController(),
    host: "127.0.0.1",
    port: 0,
  });
  await app.start();
  t.after(() => app.stop({ cleanup: false }));

  await fetch(`${app.url}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-onyxclaw-request": "local-ui",
    },
    body: JSON.stringify({ text: "not measured" }),
  });
  const observation = await fetch(`${app.url}/api/observability`).then((response) => response.json());
  assert.deepEqual(observation.calls, []);
  assert.deepEqual(observation.objects, []);
});

test("session reset returns the BFF to new-user state", async (t) => {
  let resetCalls = 0;
  const controller = createController();
  controller.resetNewUser = async () => {
    resetCalls += 1;
    return {
      mode: "idle",
      currentStep: "mode",
      soulConfirmed: false,
      sandboxId: null,
      connectionId: null,
    };
  };
  const app = createLocalConsoleServer({ controller, host: "127.0.0.1", port: 0 });
  await app.start();
  t.after(() => app.stop({ cleanup: false }));

  const reset = await fetch(`${app.url}/api/session/reset`, {
    method: "POST",
    headers: { "x-onyxclaw-request": "local-ui" },
  }).then((response) => response.json());

  assert.equal(resetCalls, 1);
  assert.equal(reset.mode, "idle");
  assert.equal(reset.soulConfirmed, false);
});

test("web UI exposes a phone workflow plus architecture and API observability", async (t) => {
  const app = createLocalConsoleServer({
    controller: createController(),
    host: "127.0.0.1",
    port: 0,
  });
  await app.start();
  t.after(() => app.stop({ cleanup: false }));

  const response = await fetch(app.url);
  const html = await response.text();
  const styles = await fetch(`${app.url}/styles.css`).then((result) => result.text());
  const browserApp = await fetch(`${app.url}/app.js`).then((result) => result.text());

  assert.equal(response.status, 200);
  assert.match(html, /龙虾模式/);
  assert.match(html, /性格设定/);
  assert.match(html, /对话龙虾/);
  assert.match(html, /id="reset-user"/);
  assert.match(html, /id="cloud-entry"/);
  assert.match(html, /data-user-type="new"/);
  assert.match(html, /id="sandbox-id"/);
  assert.match(html, /重置新用户/);
  assert.match(html, /确认性格并继续/);
  assert.match(html, /data-step="soul"/);
  assert.match(html, /class="phone-frame"/);
  assert.match(html, /SYSTEM ARCHITECTURE/);
  assert.match(html, /API ACTIVITY/);
  assert.match(html, /id="architecture-map"/);
  assert.match(html, /id="api-call-list"/);
  assert.match(html, /id="resource-grid"/);
  assert.doesNotMatch(html, /创建 Sandbox/);
  assert.match(html, /src="\/app\.js"/);
  assert.match(styles, /body\s*\{[^}]*overflow-y:\s*auto/);
  assert.doesNotMatch(styles, /body\s*\{[^}]*overflow:\s*hidden/);
  assert.match(styles, /\.workbench\s*\{[\s\S]*?height:\s*calc\(100dvh - 84px\)/);
  assert.match(styles, /grid-template-columns:\s*minmax\(270px,\s*min\(430px,\s*30vw\)\)\s+minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.phone-frame\s*\{[\s\S]*?aspect-ratio:\s*410\s*\/\s*810/);
  assert.match(styles, /\.phone-frame\s*\{[^}]*max-width:\s*100%/);
  assert.match(styles, /\.service-workbench\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0,/);
  assert.doesNotMatch(styles, /@media\s*\(max-width:\s*860px\)/);
  assert.match(styles, /@media\s*\(max-width:\s*680px\)/);
  assert.doesNotMatch(styles, /phone-hardware\s*\{[^}]*display:\s*none/);
  assert.match(styles, /\.composer textarea\s*\{[\s\S]*?caret-color:\s*var\(--coral-dark\)/);
  assert.match(browserApp, /history\.scrollRestoration\s*=\s*"manual"/);
  assert.match(browserApp, /window\.scrollTo\(0,\s*0\)/);
});
