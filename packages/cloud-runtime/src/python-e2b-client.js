import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const defaultBridgePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "e2b-bridge.py",
);

class PythonBridge {
  #child;
  #pending = new Map();
  #requestTimeoutMs;

  constructor({ pythonPath, bridgePath, spawnImpl, env, requestTimeoutMs }) {
    this.#requestTimeoutMs = requestTimeoutMs;
    this.#child = spawnImpl(pythonPath, [bridgePath], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = createInterface({ input: this.#child.stdout });
    lines.on("line", (line) => this.#receive(line));
    this.#child.once("error", (error) => this.#failAll(error));
    this.#child.once("exit", (code, signal) => {
      this.#failAll(new Error(`E2B bridge exited (${code ?? signal})`));
    });
  }

  #receive(line) {
    let response;
    try {
      response = JSON.parse(line);
    } catch {
      return;
    }
    const pending = this.#pending.get(response.id);
    if (!pending) return;
    this.#pending.delete(response.id);
    clearTimeout(pending.timer);
    if (response.error) {
      const error = new Error(response.error.message || "E2B bridge operation failed");
      error.code = response.error.code;
      pending.reject(error);
    } else {
      pending.resolve(response.result);
    }
  }

  #failAll(error) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  request(op, params = {}) {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`E2B bridge timed out during ${op}`));
      }, this.#requestTimeoutMs);
      timer.unref?.();
      this.#pending.set(id, { resolve, reject, timer });
      this.#child.stdin.write(`${JSON.stringify({ id, op, params })}\n`, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(error);
      });
    });
  }

  close() {
    this.#child.kill("SIGTERM");
  }
}

function sessionFor(bridge, sandboxId) {
  return {
    sandboxId,
    runCommand(command, options = {}) {
      return bridge.request("command", { sandboxId, command, ...options });
    },
    writeFile(filePath, content, options = {}) {
      return bridge.request("writeFile", {
        sandboxId,
        path: filePath,
        content: Buffer.isBuffer(content) ? content.toString("base64") : content,
        encoding: Buffer.isBuffer(content) ? "base64" : "utf8",
        ...options,
      });
    },
    async readFile(filePath, options = {}) {
      const result = await bridge.request("readFile", {
        sandboxId,
        path: filePath,
        ...options,
      });
      return result.content;
    },
    kill() {
      return bridge.request("kill", { sandboxId });
    },
  };
}

export function createPythonE2BClientFactory({
  pythonPath = process.env.ONYXCLAW_E2B_PYTHON ?? "python3",
  bridgePath = defaultBridgePath,
  spawnImpl = spawn,
} = {}) {
  return ({ apiKey, baseUrl, requestTimeoutMs }) => {
    const bridge = new PythonBridge({
      pythonPath,
      bridgePath,
      spawnImpl,
      requestTimeoutMs,
      env: {
        ...process.env,
        E2B_API_KEY: apiKey,
        E2B_BASE_URL: baseUrl,
      },
    });
    return {
      async create(options) {
        const result = await bridge.request("create", options);
        return sessionFor(bridge, result.sandboxId);
      },
      async connect(sandboxId) {
        const result = await bridge.request("connect", { sandboxId });
        return sessionFor(bridge, result.sandboxId);
      },
      close() {
        bridge.close();
      },
    };
  };
}
