import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function defaultRunCommand(command, args) {
  return execFileAsync(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export class LocalMacOpenClawDriver {
  #runCommand;
  #pluginPath;
  #workspacePath;

  constructor({ runCommand = defaultRunCommand, pluginPath, workspacePath }) {
    if (!pluginPath || !workspacePath) {
      throw new TypeError("pluginPath and workspacePath are required");
    }
    this.#runCommand = runCommand;
    this.#pluginPath = pluginPath;
    this.#workspacePath = workspacePath;
  }

  get soulPath() {
    return path.join(this.#workspacePath, "SOUL.md");
  }

  async prepare({ platformUrl, instanceId, bootstrapToken }) {
    try {
      await this.#runCommand("openclaw", ["plugins", "inspect", "onyxclaw", "--json"]);
    } catch {
      await this.#runCommand("openclaw", [
        "plugins",
        "install",
        "--link",
        this.#pluginPath,
      ]);
    }

    const config = JSON.stringify({
      enabled: true,
      platformUrl,
      bootstrapToken,
      instanceId,
    });
    await this.#runCommand("openclaw", [
      "config",
      "set",
      "channels.onyxclaw",
      config,
      "--strict-json",
    ]);
    await this.restartGateway();
  }

  async restartGateway() {
    return this.#runCommand("openclaw", ["gateway", "restart"]);
  }

  async probeGateway() {
    const result = await this.#runCommand("openclaw", ["gateway", "status"]);
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (!output.includes("Connectivity probe: ok")) {
      throw new Error("OpenClaw Gateway connectivity probe did not report ok");
    }
    return { ok: true };
  }

  async disableChannel() {
    await this.#runCommand("openclaw", [
      "config",
      "set",
      "channels.onyxclaw.enabled",
      "false",
      "--strict-json",
    ]);
    await this.restartGateway();
  }

  async snapshotSoul() {
    try {
      const [content, metadata] = await Promise.all([
        readFile(this.soulPath),
        stat(this.soulPath),
      ]);
      return { existed: true, content, mode: metadata.mode };
    } catch (error) {
      if (error?.code === "ENOENT") return { existed: false };
      throw error;
    }
  }

  async readSoul() {
    try {
      const content = await readFile(this.soulPath);
      return {
        existed: true,
        content: content.toString("utf8"),
        sha256: sha256(content),
        size: content.byteLength,
      };
    } catch (error) {
      if (error?.code === "ENOENT") {
        const content = Buffer.alloc(0);
        return {
          existed: false,
          content: "",
          sha256: sha256(content),
          size: 0,
        };
      }
      throw error;
    }
  }

  async writeAndVerifySoul(content) {
    const bytes = Buffer.from(content, "utf8");
    await mkdir(this.#workspacePath, { recursive: true });
    const temporaryPath = `${this.soulPath}.phase0-${randomUUID()}.tmp`;
    await writeFile(temporaryPath, bytes, { mode: 0o600 });
    await rename(temporaryPath, this.soulPath);
    const verified = await readFile(this.soulPath);
    if (!verified.equals(bytes)) {
      throw new Error("SOUL.md verification mismatch");
    }
    return {
      content: verified.toString("utf8"),
      sha256: sha256(verified),
      size: verified.byteLength,
    };
  }

  async readSoulVerification() {
    const content = await readFile(this.soulPath);
    return { sha256: sha256(content), size: content.byteLength };
  }

  async restoreSoul(snapshot) {
    if (!snapshot.existed) {
      await rm(this.soulPath, { force: true });
      return;
    }
    await mkdir(this.#workspacePath, { recursive: true });
    await writeFile(this.soulPath, snapshot.content);
    if (snapshot.mode !== undefined) await chmod(this.soulPath, snapshot.mode);
  }
}
