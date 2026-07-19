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

  constructor({ provider, secrets, clientFactory }) {
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
    this.#client = clientFactory({
      apiKey: secrets.apiKey,
      baseUrl: provider.api.baseUrl,
      requestTimeoutMs: provider.api.requestTimeoutMs,
    });
  }

  async #perform(stage, operation) {
    try {
      return await operation();
    } catch (error) {
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
    return this.#perform("create", async () => {
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
    return this.#perform("connect", async () => {
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
    return this.#perform("command", async () => {
      const session = await this.#getSession(sandboxId);
      return session.runCommand(command, { user: this.#provider.sandbox.defaultUser });
    });
  }

  async writeFile(sandboxId, filePath, content) {
    if (!path.posix.isAbsolute(filePath)) throw new TypeError("filePath must be absolute");
    if (typeof content !== "string" && !Buffer.isBuffer(content)) {
      throw new TypeError("content must be a string or Buffer");
    }
    return this.#perform("file-write", async () => {
      const session = await this.#getSession(sandboxId);
      return session.writeFile(filePath, content, {
        user: this.#provider.sandbox.defaultUser,
      });
    });
  }

  async readFile(sandboxId, filePath) {
    if (!path.posix.isAbsolute(filePath)) throw new TypeError("filePath must be absolute");
    return this.#perform("file-read", async () => {
      const session = await this.#getSession(sandboxId);
      return session.readFile(filePath, { user: this.#provider.sandbox.defaultUser });
    });
  }

  async killSandbox(sandboxId) {
    const id = requiredString(sandboxId, "sandboxId");
    return this.#perform("kill", async () => {
      const session = await this.#getSession(id);
      try {
        await session.kill();
      } finally {
        this.#sessions.delete(id);
      }
      return { sandboxId: id, status: "killed" };
    });
  }
}

export function createAlibabaAcsAdapter({
  registry,
  providerId = "alicloud-acs",
  clientFactory,
}) {
  return new AlibabaAcsAdapter({
    provider: registry.getProvider(providerId),
    secrets: registry.getSecrets(providerId),
    clientFactory,
  });
}
