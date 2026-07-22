import path from "node:path";

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} is required`);
  }
  return value.trim();
}

function redact(message, secrets) {
  let safe = String(message);
  for (const secret of Object.values(secrets)) {
    if (typeof secret === "string" && secret) safe = safe.replaceAll(secret, "[REDACTED]");
  }
  return safe;
}

function safeCommandSummary(command, secrets) {
  return redact(command, secrets)
    .replace(/((?:api[_-]?key|access[_-]?token|auth[_-]?token|bootstrap[_-]?token|password|secret)\s*[=:]\s*)([^\s;&|]+)/gi, "$1[REDACTED]")
    .replace(/(--(?:api-key|token|password|secret)(?:=|\s+))([^\s;&|]+)/gi, "$1[REDACTED]")
    .slice(0, 2_000);
}

export class CloudRuntimeError extends Error {
  constructor(stage, error, secrets) {
    const detail = redact(error instanceof Error ? error.message : error, secrets);
    super(`Alibaba ACS ${stage} failed: ${detail}`, { cause: error });
    this.name = "CloudRuntimeError";
    this.stage = stage;
    this.code = `CLOUD_RUNTIME_${stage.toUpperCase()}_FAILED`;
  }
}

export class AlibabaAcsAdapter {
  #provider;
  #secrets;
  #client;
  #sessions = new Map();
  #operationMonitor;

  constructor({ provider, secrets, clientFactory, operationMonitor }) {
    if (typeof clientFactory !== "function") throw new TypeError("clientFactory is required");
    requiredString(provider?.api?.baseUrl, "provider.api.baseUrl");
    requiredString(provider?.sandbox?.templateId, "provider.sandbox.templateId");
    requiredString(provider?.sandbox?.defaultUser, "provider.sandbox.defaultUser");
    requiredString(secrets?.apiKey, "secrets.apiKey");
    if (!Number.isInteger(provider.sandbox.timeoutMs) || provider.sandbox.timeoutMs <= 0) {
      throw new TypeError("provider.sandbox.timeoutMs must be a positive integer");
    }
    this.#provider = provider;
    this.#secrets = secrets;
    this.#operationMonitor = operationMonitor;
    this.#client = clientFactory({
      apiKey: secrets.apiKey,
      baseUrl: provider.api.baseUrl,
      requestTimeoutMs: provider.api.requestTimeoutMs,
    });
  }

  async #perform(stage, telemetry, operation) {
    const callId = this.#operationMonitor?.begin({
      api: telemetry.api,
      target: telemetry.target,
      object: telemetry.object,
      failureContext: telemetry.failureContext,
    });
    try {
      const result = await operation();
      this.#operationMonitor?.succeed(callId, {
        object: telemetry.resultObject?.(result) ?? telemetry.object,
      });
      return result;
    } catch (error) {
      this.#operationMonitor?.fail(callId, {
        object: telemetry.failureObject ?? (telemetry.object
          ? { ...telemetry.object, state: "failed" }
          : undefined),
      });
      if (error instanceof CloudRuntimeError) throw error;
      throw new CloudRuntimeError(stage, error, this.#secrets);
    }
  }

  #remember(session, fallbackId) {
    const sandboxId = requiredString(session?.sandboxId ?? fallbackId, "sandboxId");
    this.#sessions.set(sandboxId, session);
    return { sandboxId, status: "running" };
  }

  async createSandbox({ metadata, envs } = {}) {
    return this.#perform("create", {
      api: "Sandbox.create",
      target: "Alibaba ACS Sandbox Manager",
      resultObject: (result) => ({
        type: "Sandbox",
        id: result.sandboxId,
        state: "running",
      }),
    }, async () => {
      const session = await this.#client.create({
        template: this.#provider.sandbox.templateId,
        timeoutSeconds: Math.ceil(this.#provider.sandbox.timeoutMs / 1000),
        secure: this.#provider.sandbox.secure,
        metadata,
        envs,
      });
      return this.#remember(session);
    });
  }

  async connectSandbox(sandboxId) {
    const id = requiredString(sandboxId, "sandboxId");
    return this.#perform("connect", {
      api: "Sandbox.connect",
      target: "Alibaba ACS Sandbox Manager",
      object: { type: "Sandbox", id, state: "connecting" },
      resultObject: (result) => ({ type: "Sandbox", id: result.sandboxId, state: "running" }),
    }, async () => {
      const session = await this.#client.connect(id);
      return this.#remember(session, id);
    });
  }

  async #getSession(sandboxId) {
    const id = requiredString(sandboxId, "sandboxId");
    if (!this.#sessions.has(id)) await this.connectSandbox(id);
    return this.#sessions.get(id);
  }

  async runCommand(sandboxId, command) {
    requiredString(command, "command");
    const id = requiredString(sandboxId, "sandboxId");
    return this.#perform("command", {
      api: "Commands.run",
      target: "Sandbox envd",
      failureContext: {
        label: "COMMAND",
        value: safeCommandSummary(command, this.#secrets),
      },
      object: { type: "Process", id, state: "running" },
      resultObject: (result) => ({
        type: "Process",
        id,
        state: `exited:${result.exitCode}`,
      }),
    }, async () => {
      const session = await this.#getSession(sandboxId);
      return session.runCommand(command, { user: this.#provider.sandbox.defaultUser });
    });
  }

  async writeFile(sandboxId, filePath, content) {
    if (!path.posix.isAbsolute(filePath)) throw new TypeError("filePath must be absolute");
    if (typeof content !== "string" && !Buffer.isBuffer(content)) {
      throw new TypeError("content must be a string or Buffer");
    }
    return this.#perform("file-write", {
      api: "Files.write",
      target: "Sandbox envd",
      object: { type: "File", id: filePath, state: "writing" },
      resultObject: () => ({ type: "File", id: filePath, state: "written" }),
    }, async () => {
      const session = await this.#getSession(sandboxId);
      return session.writeFile(filePath, content, {
        user: this.#provider.sandbox.defaultUser,
      });
    });
  }

  async readFile(sandboxId, filePath) {
    if (!path.posix.isAbsolute(filePath)) throw new TypeError("filePath must be absolute");
    return this.#perform("file-read", {
      api: "Files.read",
      target: "Sandbox envd",
      object: { type: "File", id: filePath, state: "reading" },
      resultObject: () => ({ type: "File", id: filePath, state: "read" }),
    }, async () => {
      const session = await this.#getSession(sandboxId);
      return session.readFile(filePath, { user: this.#provider.sandbox.defaultUser });
    });
  }

  async killSandbox(sandboxId) {
    const id = requiredString(sandboxId, "sandboxId");
    return this.#perform("kill", {
      api: "Sandbox.kill",
      target: "Alibaba ACS Sandbox Manager",
      object: { type: "Sandbox", id, state: "terminating" },
      resultObject: () => ({ type: "Sandbox", id, state: "terminated" }),
    }, async () => {
      const session = await this.#getSession(id);
      try {
        await session.kill();
      } finally {
        this.#sessions.delete(id);
      }
      return { sandboxId: id, status: "killed" };
    });
  }

  close() {
    this.#client.close?.();
  }
}

export function createAlibabaAcsAdapter({
  registry,
  providerId = "alicloud-acs",
  clientFactory,
  operationMonitor,
}) {
  return new AlibabaAcsAdapter({
    provider: registry.getProvider(providerId),
    secrets: registry.getSecrets(providerId),
    clientFactory,
    operationMonitor,
  });
}
