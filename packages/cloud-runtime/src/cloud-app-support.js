const MODEL_KEY_PLACEHOLDER = "__ONYXCLAW_MODEL_API_KEY__";

function replaceModelKey(value, modelApiKey, state) {
  if (value === MODEL_KEY_PLACEHOLDER) {
    state.replaced += 1;
    return modelApiKey;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceModelKey(item, modelApiKey, state));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        replaceModelKey(child, modelApiKey, state),
      ]),
    );
  }
  return value;
}

export function buildOpenClawConfig({
  baseConfig,
  modelApiKey,
  platformUrl,
  instanceId,
  bootstrapToken,
}) {
  const state = { replaced: 0 };
  const config = replaceModelKey(baseConfig, modelApiKey, state);
  if (state.replaced === 0) {
    throw new Error("OpenClaw base config must contain the model key placeholder");
  }
  const paths = [...(config.plugins?.load?.paths ?? [])];
  if (!paths.includes("/opt/onyxclaw/channel")) paths.push("/opt/onyxclaw/channel");
  return {
    ...config,
    plugins: {
      ...config.plugins,
      load: { ...config.plugins?.load, paths },
      entries: {
        ...config.plugins?.entries,
        onyxclaw: { ...config.plugins?.entries?.onyxclaw, enabled: true },
      },
    },
    channels: {
      ...config.channels,
      onyxclaw: {
        enabled: true,
        platformUrl,
        instanceId,
        bootstrapToken,
      },
    },
  };
}

export class CloudGatewayProbe {
  #adapter;
  #timeoutMs;
  #intervalMs;

  constructor({ adapter, timeoutMs = 120_000, intervalMs = 1000 }) {
    this.#adapter = adapter;
    this.#timeoutMs = timeoutMs;
    this.#intervalMs = intervalMs;
  }

  async waitUntilReady(sandboxId, { port }) {
    const deadline = Date.now() + this.#timeoutMs;
    let attempts = 0;
    const command = `node -e "fetch('http://127.0.0.1:${port}/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`;
    while (Date.now() <= deadline) {
      attempts += 1;
      try {
        const result = await this.#adapter.runCommand(sandboxId, command);
        if (result.exitCode === 0) return { ok: true, attempts };
      } catch {}
      if (this.#intervalMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.#intervalMs));
      }
    }
    throw new Error(`Gateway did not become ready after ${attempts} attempts`);
  }
}
