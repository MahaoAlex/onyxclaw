import { randomUUID } from "node:crypto";

import { createInboundMessage } from "../../test-orchestrator/src/protocol.js";

export class LocalConsoleController {
  #simulator;
  #driver;
  #instanceId;
  #accountId;
  #chatId;
  #timeoutMs;
  #tokenFactory;
  #idFactory;
  #status;
  #soulBackup;
  #chatRunning = false;
  #helloResponse;
  #helloPromise;

  constructor({
    simulator,
    driver,
    instanceId = "local-mac",
    accountId = "default",
    chatId = `phase1-local-${randomUUID()}`,
    timeoutMs = 120_000,
    tokenFactory = randomUUID,
    idFactory = randomUUID,
  }) {
    this.#simulator = simulator;
    this.#driver = driver;
    this.#instanceId = instanceId;
    this.#accountId = accountId;
    this.#chatId = chatId;
    this.#timeoutMs = timeoutMs;
    this.#tokenFactory = tokenFactory;
    this.#idFactory = idFactory;
    this.#status = {
      mode: "idle",
      currentStep: "mode",
      soulConfirmed: false,
      instanceId,
      accountId,
      connectionId: null,
      gateway: null,
      error: null,
    };
  }

  getStatus() {
    return { ...this.#status };
  }

  async startLobsterMode() {
    if (this.#status.mode === "connected") return this.getStatus();
    if (this.#status.mode === "starting") {
      throw new Error("龙虾模式正在启动，请稍候");
    }
    this.#status = { ...this.#status, mode: "starting", error: null };
    const bootstrapToken = this.#tokenFactory();
    try {
      this.#simulator.issueBootstrapToken(this.#instanceId, bootstrapToken);
      await this.#simulator.start();
      await this.#driver.prepare({
        platformUrl: this.#simulator.url,
        instanceId: this.#instanceId,
        bootstrapToken,
      });
      const connection = await this.#simulator.waitForConnection(this.#instanceId, {
        timeoutMs: this.#timeoutMs,
      });
      const gateway = await this.#driver.probeGateway();
      this.#status = {
        ...this.#status,
        mode: "connected",
        currentStep: this.#status.soulConfirmed ? "chat" : "soul",
        connectionId: connection.connectionId,
        connectedAt: new Date().toISOString(),
        gateway,
        error: null,
      };
      return this.getStatus();
    } catch (error) {
      try {
        await this.#driver.disableChannel();
      } catch {}
      try {
        await this.#simulator.stop();
      } catch {}
      this.#status = {
        ...this.#status,
        mode: "error",
        currentStep: "mode",
        connectionId: null,
        error: error instanceof Error ? error.message : String(error),
      };
      throw error;
    }
  }

  async stopLobsterMode() {
    if (this.#status.mode === "idle") return this.getStatus();
    let failure;
    try {
      await this.#driver.disableChannel();
    } catch (error) {
      failure = error;
    }
    try {
      await this.#simulator.stop();
    } catch (error) {
      failure ??= error;
    }
    this.#status = {
      ...this.#status,
      mode: failure ? "error" : "idle",
      currentStep: "mode",
      connectionId: null,
      gateway: null,
      error: failure ? failure.message : null,
    };
    if (failure) throw failure;
    return this.getStatus();
  }

  async resetNewUser() {
    await this.stopLobsterMode();
    this.#soulBackup = undefined;
    this.#helloResponse = undefined;
    this.#helloPromise = undefined;
    this.#chatRunning = false;
    this.#status = {
      ...this.#status,
      mode: "idle",
      currentStep: "mode",
      soulConfirmed: false,
      connectionId: null,
      gateway: null,
      error: null,
    };
    return this.getStatus();
  }

  getSoul() {
    return this.#driver.readSoul();
  }

  async saveSoul(content) {
    if (typeof content !== "string") throw new TypeError("SOUL.md 内容必须是字符串");
    this.#soulBackup ??= await this.#driver.snapshotSoul();
    return this.#driver.writeAndVerifySoul(content);
  }

  async restoreSoul() {
    if (!this.#soulBackup) throw new Error("当前会话没有可恢复的 SOUL.md 备份");
    await this.#driver.restoreSoul(this.#soulBackup);
    this.#soulBackup = undefined;
    return this.#driver.readSoul();
  }

  async confirmSoul(content) {
    if (this.#status.mode !== "connected") {
      throw new Error("请先进入龙虾模式");
    }
    const file = await this.saveSoul(content);
    this.#status = {
      ...this.#status,
      soulConfirmed: true,
      currentStep: "chat",
    };
    return { ...file, soulConfirmed: true, currentStep: "chat" };
  }

  async sendMessage(text) {
    if (this.#status.mode !== "connected") {
      throw new Error("请先进入龙虾模式");
    }
    if (!this.#status.soulConfirmed) {
      throw new Error("请先在性格设定中确认性格");
    }
    if (typeof text !== "string" || !text.trim()) throw new TypeError("消息不能为空");
    if (this.#chatRunning) throw new Error("上一条消息仍在处理中");
    this.#chatRunning = true;
    const started = Date.now();
    const eventId = this.#idFactory();
    try {
      this.#simulator.sendInbound(
        this.#instanceId,
        createInboundMessage({
          eventId,
          instanceId: this.#instanceId,
          accountId: this.#accountId,
          senderId: "phase1-local-user",
          chatId: this.#chatId,
          text: text.trim(),
        }),
      );
      const outbound = await this.#simulator.waitForNextOutbound(this.#timeoutMs);
      return {
        text: outbound.payload.text,
        inboundEventId: eventId,
        outboundEventId: outbound.eventId,
        durationMs: Date.now() - started,
        traceId: eventId,
      };
    } finally {
      this.#chatRunning = false;
    }
  }

  async sayHello() {
    if (this.#status.mode !== "connected") throw new Error("请先进入龙虾模式");
    if (!this.#status.soulConfirmed) throw new Error("请先在性格设定中确认性格");
    if (this.#helloResponse) return { ...this.#helloResponse, alreadySent: true };
    if (this.#helloPromise) {
      const response = await this.#helloPromise;
      return { ...response, alreadySent: true };
    }
    this.#helloPromise = this.sendMessage(
      "这是你和新用户的第一次见面。请基于当前 SOUL.md 中的性格设定，用符合你性格的语气主动向用户说一声 hello，并做一句简短的自我介绍。不要提及这条引导消息或文件名。",
    )
      .then((response) => {
        this.#helloResponse = { ...response, alreadySent: false };
        return this.#helloResponse;
      })
      .finally(() => {
        this.#helloPromise = undefined;
      });
    return this.#helloPromise;
  }
}
