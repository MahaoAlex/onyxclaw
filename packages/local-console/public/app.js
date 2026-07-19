import { resolveLandingView } from "./ui-state.js";

const elements = {
  status: document.querySelector("#global-status"),
  statusText: document.querySelector("#global-status-text"),
  start: document.querySelector("#start-mode"),
  stop: document.querySelector("#stop-mode"),
  modeNotice: document.querySelector("#mode-notice"),
  metricMode: document.querySelector("#metric-mode"),
  metricInstance: document.querySelector("#metric-instance"),
  metricGateway: document.querySelector("#metric-gateway"),
  metricConnection: document.querySelector("#metric-connection"),
  soul: document.querySelector("#soul-editor"),
  soulSize: document.querySelector("#soul-size"),
  soulHash: document.querySelector("#soul-hash"),
  soulNotice: document.querySelector("#soul-notice"),
  confirmSoul: document.querySelector("#confirm-soul"),
  restoreSoul: document.querySelector("#restore-soul"),
  reloadSoul: document.querySelector("#reload-soul"),
  chatState: document.querySelector("#chat-state"),
  messages: document.querySelector("#messages"),
  chatForm: document.querySelector("#chat-form"),
  chatInput: document.querySelector("#chat-input"),
  send: document.querySelector(".send-button"),
  chatStop: document.querySelector("#chat-stop"),
};
let helloShown = false;
let helloLoading = false;
let initialLanding = true;

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "x-onyxclaw-request": "local-ui",
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

function notice(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle("error", error);
  element.hidden = !message;
}

function renderStatus(status) {
  const labels = {
    idle: "尚未连接",
    starting: "正在启动本机 OpenClaw…",
    connected: "本机 OpenClaw 已连接",
    error: "连接异常",
  };
  elements.status.className = `status-pill ${status.mode}`;
  elements.statusText.textContent = labels[status.mode] ?? status.mode;
  elements.metricMode.textContent = status.mode.toUpperCase();
  elements.metricInstance.textContent = status.instanceId ?? "local-mac";
  elements.metricGateway.textContent = status.gateway?.ok ? "HEALTHY" : "待检查";
  elements.metricConnection.textContent = status.connectionId ?? "—";
  const connected = status.mode === "connected";
  const chatReady = connected && status.soulConfirmed;
  const busy = status.mode === "starting";
  const landing = resolveLandingView({ initialLanding, status });
  elements.start.textContent = landing.startLabel;
  elements.start.disabled = landing.startDisabled;
  elements.stop.disabled = !connected || busy;
  elements.chatInput.disabled = !chatReady;
  elements.send.disabled = !chatReady;
  elements.chatState.textContent = chatReady ? "已连接 · 可以发送" : "等待完成设置";
  showStep(landing.visibleStep, status);
  if (status.error) notice(elements.modeNotice, status.error, true);
}

function showStep(step, status = {}) {
  document.querySelectorAll(".panel").forEach((item) => item.classList.remove("active"));
  document.querySelector(`#panel-${step}`)?.classList.add("active");
  document.querySelectorAll(".tab").forEach((item) => {
    const order = { mode: 1, soul: 2, chat: 3 };
    item.classList.toggle("active", item.dataset.step === step);
    item.classList.toggle("complete", order[item.dataset.step] < order[step]);
  });
  const soulTab = document.querySelector('[data-step="soul"]');
  soulTab.hidden = Boolean(status.soulConfirmed);
  if (step === "soul") void loadSoul();
  if (step === "chat" && status.soulConfirmed) void ensureHello();
}

async function refreshStatus() {
  renderStatus(await api("/api/status"));
}

function renderSoul(file) {
  elements.soul.value = file.content;
  elements.soulSize.textContent = `${file.size} bytes`;
  elements.soulHash.textContent = `SHA-256 ${file.sha256.slice(0, 16)}…`;
}

async function loadSoul() {
  elements.soul.disabled = true;
  try {
    renderSoul(await api("/api/soul"));
    notice(elements.soulNotice, "");
  } catch (error) {
    notice(elements.soulNotice, error.message, true);
  } finally {
    elements.soul.disabled = false;
  }
}

function addMessage(role, text, metadata) {
  document.querySelector(".empty-chat")?.remove();
  const message = document.createElement("div");
  message.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = metadata;
  message.append(bubble, meta);
  elements.messages.append(message);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

async function ensureHello() {
  if (helloShown || helloLoading) return;
  helloLoading = true;
  elements.chatState.textContent = "龙虾正在准备第一声问候…";
  try {
    const hello = await api("/api/chat/hello", { method: "POST" });
    addMessage(
      "assistant",
      hello.text,
      `OpenClaw · 性格问候 · ${hello.durationMs} ms`,
    );
    helloShown = true;
  } catch (error) {
    addMessage("assistant", `问候生成失败：${error.message}`, "系统 · 可以刷新重试");
  } finally {
    helloLoading = false;
    elements.chatState.textContent = "已连接 · 可以发送";
  }
}

elements.start.addEventListener("click", async () => {
  notice(elements.modeNotice, "正在检查 Plugin 并重启 Gateway，请稍候…");
  const current = await api("/api/status");
  initialLanding = false;
  if (current.mode === "connected") elements.start.disabled = true;
  else renderStatus({ ...current, mode: "starting" });
  try {
    const status = await api("/api/lobster/start", { method: "POST" });
    renderStatus(status);
    notice(elements.modeNotice, "龙虾模式已就绪，可以编辑性格或开始对话。");
  } catch (error) {
    await refreshStatus();
    notice(elements.modeNotice, error.message, true);
  }
});

elements.stop.addEventListener("click", async () => {
  elements.stop.disabled = true;
  notice(elements.modeNotice, "正在禁用测试 Channel 并清理连接…");
  try {
    renderStatus(await api("/api/lobster/stop", { method: "POST" }));
    notice(elements.modeNotice, "连接已清理，本机 OpenClaw 保持运行。");
  } catch (error) {
    notice(elements.modeNotice, error.message, true);
  }
});

elements.reloadSoul.addEventListener("click", loadSoul);
elements.confirmSoul.addEventListener("click", async () => {
  elements.confirmSoul.disabled = true;
  try {
    const file = await api("/api/soul/confirm", {
      method: "POST",
      body: JSON.stringify({ content: elements.soul.value }),
    });
    renderSoul(file);
    notice(elements.soulNotice, "性格已确认，正在进入对话…");
    await refreshStatus();
  } catch (error) {
    notice(elements.soulNotice, error.message, true);
  } finally {
    elements.confirmSoul.disabled = false;
  }
});

elements.restoreSoul.addEventListener("click", async () => {
  try {
    const file = await api("/api/soul/restore", { method: "POST" });
    renderSoul(file);
    notice(elements.soulNotice, "已恢复为本次编辑前的版本。");
  } catch (error) {
    notice(elements.soulNotice, error.message, true);
  }
});

elements.chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = elements.chatInput.value.trim();
  if (!text) return;
  elements.chatInput.value = "";
  elements.chatInput.disabled = true;
  elements.send.disabled = true;
  addMessage("user", text, "你 · 刚刚");
  elements.chatState.textContent = "OpenClaw 正在思考…";
  try {
    const reply = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    addMessage("assistant", reply.text, `OpenClaw · ${reply.durationMs} ms · ${reply.traceId.slice(0, 8)}`);
  } catch (error) {
    addMessage("assistant", `发送失败：${error.message}`, "系统");
  } finally {
    elements.chatInput.disabled = false;
    elements.send.disabled = false;
    elements.chatInput.focus();
    elements.chatState.textContent = "已连接 · 可以发送";
  }
});

elements.chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.chatForm.requestSubmit();
  }
});

elements.chatStop.addEventListener("click", async () => {
  elements.chatStop.disabled = true;
  try {
    renderStatus(await api("/api/lobster/stop", { method: "POST" }));
    notice(elements.modeNotice, "连接已清理，本机 OpenClaw 保持运行。");
  } catch (error) {
    addMessage("assistant", `清理失败：${error.message}`, "系统");
  } finally {
    elements.chatStop.disabled = false;
  }
});

await Promise.all([refreshStatus(), loadSoul()]);
