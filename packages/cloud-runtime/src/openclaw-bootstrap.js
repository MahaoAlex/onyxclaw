import { randomUUID } from "node:crypto";

const DEFAULT_BOOTSTRAP_DIR = "/home/node/.openclaw/bootstrap";

export class BootstrapError extends Error {
  constructor(phase) {
    super(`OpenClaw bootstrap failed during ${phase}`);
    this.name = "BootstrapError";
    this.phase = phase;
    this.code = "OPENCLAW_BOOTSTRAP_FAILED";
  }
}

export class OpenClawBootstrapSaga {
  #adapter;
  #channel;
  #gateway;
  #gatewayPort;
  #bootstrapDir;
  #instanceIdFactory;
  #tokenFactory;
  #traceIdFactory;
  #onTransition;

  constructor({
    adapter,
    channel,
    gateway,
    gatewayPort,
    bootstrapDir = DEFAULT_BOOTSTRAP_DIR,
    instanceIdFactory = randomUUID,
    tokenFactory = randomUUID,
    traceIdFactory = randomUUID,
    onTransition = () => {},
  }) {
    this.#adapter = adapter;
    this.#channel = channel;
    this.#gateway = gateway;
    this.#gatewayPort = gatewayPort;
    this.#bootstrapDir = bootstrapDir.replace(/\/$/, "");
    this.#instanceIdFactory = instanceIdFactory;
    this.#tokenFactory = tokenFactory;
    this.#traceIdFactory = traceIdFactory;
    this.#onTransition = onTransition;
  }

  #transition(phase, context = {}) {
    this.#onTransition({ phase, at: new Date().toISOString(), ...context });
  }

  #validateBootstrapInput({ soul, buildConfig }) {
    if (typeof soul !== "string" || !soul.trim()) {
      throw new TypeError("SOUL.md content is required");
    }
    if (typeof buildConfig !== "function") throw new TypeError("buildConfig is required");
  }

  async provision({ soul, buildConfig }) {
    this.#validateBootstrapInput({ soul, buildConfig });

    const instanceId = this.#instanceIdFactory();
    const traceId = this.#traceIdFactory();
    this.#transition("ALLOCATING", { instanceId, traceId });

    try {
      const created = await this.#adapter.createSandbox({
        metadata: { traceId, instanceId },
      });
      return this.#bootstrapAllocated({
        sandboxId: created.sandboxId,
        instanceId,
        traceId,
        soul,
        buildConfig,
      });
    } catch (error) {
      if (error instanceof BootstrapError) throw error;
      this.#transition("FAILED", { instanceId, traceId, failedAtPhase: "ALLOCATING" });
      throw new BootstrapError("ALLOCATING");
    }
  }

  async bootstrapSandbox({ sandboxId, instanceId, traceId, soul, buildConfig }) {
    this.#validateBootstrapInput({ soul, buildConfig });
    if (typeof sandboxId !== "string" || !sandboxId) {
      throw new TypeError("sandboxId is required");
    }
    if (typeof instanceId !== "string" || !instanceId) {
      throw new TypeError("instanceId is required");
    }
    return this.#bootstrapAllocated({
      sandboxId,
      instanceId,
      traceId: traceId || this.#traceIdFactory(),
      soul,
      buildConfig,
    });
  }

  async #bootstrapAllocated({ sandboxId, instanceId, traceId, soul, buildConfig }) {
    const bootstrapToken = this.#tokenFactory();
    let tokenIssued = false;
    let phase = "BOOTSTRAPPING";
    this.#transition(phase, { sandboxId, instanceId, traceId });

    try {

      await this.#channel.issueBootstrapToken(instanceId, bootstrapToken);
      tokenIssued = true;
      const config = await buildConfig({
        sandboxId,
        instanceId,
        bootstrapToken,
        traceId,
      });
      const serializedConfig =
        typeof config === "string" ? config : JSON.stringify(config);
      if (!serializedConfig) throw new TypeError("OpenClaw config is required");

      await this.#adapter.writeFile(
        sandboxId,
        `${this.#bootstrapDir}/openclaw.json`,
        serializedConfig,
      );
      await this.#adapter.writeFile(
        sandboxId,
        `${this.#bootstrapDir}/SOUL.md`,
        soul,
      );

      const gateway = await this.#gateway.waitUntilReady(sandboxId, {
        port: this.#gatewayPort,
      });
      phase = "GATEWAY_READY";
      this.#transition(phase, { sandboxId, instanceId, traceId, gateway });

      const connection = await this.#channel.waitForConnection(instanceId);
      phase = "CHANNEL_READY";
      this.#transition(phase, {
        sandboxId,
        instanceId,
        traceId,
        connectionId: connection.connectionId,
      });

      phase = "READY";
      this.#transition(phase, { sandboxId, instanceId, traceId });
      return {
        sandboxId,
        instanceId,
        connectionId: connection.connectionId,
        traceId,
        status: "ready",
      };
    } catch {
      const failedAtPhase = phase;
      if (tokenIssued) {
        try {
          await this.#channel.revokeBootstrapToken(instanceId);
        } catch {}
      }
      if (sandboxId) {
        try {
          await this.#adapter.killSandbox(sandboxId);
        } catch {}
      }
      this.#transition("FAILED", { sandboxId, instanceId, traceId, failedAtPhase });
      throw new BootstrapError(failedAtPhase);
    }
  }
}
