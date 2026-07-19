#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generated = path.join(root, "generated");
const kubeconfig = path.join(generated, "kubeconfig");
const manifest = path.join(generated, "sandboxset.yaml");
const sandboxTemplate = await readFile(
  path.join(root, "templates", "sandboxset.yaml.tmpl"),
  "utf8",
);

function safeYamlScalar(value, label) {
  if (!/^[A-Za-z0-9._/@:+-]+$/.test(value)) {
    throw new Error(`${label} contains unsupported YAML characters`);
  }
  return value;
}

export function renderSandboxSet({ image, replicas = 2, templateName = "onyxclaw" }) {
  const count = Number(replicas);
  if (!Number.isInteger(count) || count < 0 || count > 100) {
    throw new Error("replicas must be an integer between 0 and 100");
  }
  return sandboxTemplate
    .replace("{{TEMPLATE_NAME}}", safeYamlScalar(templateName, "template name"))
    .replace("{{REPLICAS}}", String(count))
    .replace("{{IMAGE}}", safeYamlScalar(image, "image"));
}

export function validateEnvironment(env, action = "deploy") {
  const required = [
    "ALIBABA_CLOUD_ACCESS_KEY_ID",
    "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
    "ALIBABA_CLOUD_REGION",
  ];
  if (action !== "destroy") {
    required.push(
      "TF_VAR_e2b_domain",
      "TF_VAR_sandbox_admin_api_key",
      "ONYXCLAW_OPENCLAW_IMAGE",
      "ONYXCLAW_ACS_ACCOUNT_READY",
    );
  }
  const missing = required.filter((name) => !env[name]);
  if (action !== "destroy" && env.ONYXCLAW_ACS_ACCOUNT_READY && env.ONYXCLAW_ACS_ACCOUNT_READY !== "true") {
    missing.push("ONYXCLAW_ACS_ACCOUNT_READY=true");
  }
  if (missing.length) throw new Error(`Missing required environment: ${missing.join(", ")}`);
}

export function buildCommands(action, { terraform = "terraform" } = {}) {
  const kubeArgs = ["--kubeconfig", kubeconfig];
  if (action === "deploy") {
    return [
      { command: terraform, args: ["init", "-upgrade"] },
      { command: terraform, args: ["apply", "-auto-approve"] },
      { command: "kubectl", args: [...kubeArgs, "apply", "-f", manifest] },
    ];
  }
  if (action === "destroy") {
    return [
      {
        command: "kubectl",
        args: [
          ...kubeArgs,
          "delete",
          "sandboxset",
          "onyxclaw",
          "--ignore-not-found=true",
          "--wait=true",
        ],
        optional: true,
      },
      { command: terraform, args: ["destroy", "-auto-approve"] },
    ];
  }
  throw new Error("Usage: npm run iac:alicloud -- <deploy|destroy|plan>");
}

function findExecutable(candidates) {
  for (const candidate of candidates) {
    const result = spawnSync("sh", ["-c", `command -v ${candidate}`], { encoding: "utf8" });
    if (result.status === 0) return candidate;
  }
  return null;
}

async function run() {
  const action = process.argv[2];
  process.env.TF_VAR_region ??= process.env.ALIBABA_CLOUD_REGION;
  if (action === "plan") {
    validateEnvironment(process.env, action);
    await mkdir(generated, { recursive: true });
    const terraform = findExecutable(["terraform", "tofu"]);
    if (!terraform) throw new Error("terraform or tofu is required");
    const commands = [
      { command: terraform, args: ["init", "-upgrade"] },
      { command: terraform, args: ["plan"] },
    ];
    for (const item of commands) execute(item);
    return;
  }

  validateEnvironment(process.env, action);
  await mkdir(generated, { recursive: true });
  const terraform = findExecutable(["terraform", "tofu"]);
  if (!terraform) throw new Error("terraform or tofu is required");
  if (action === "deploy" && !findExecutable(["kubectl"])) {
    throw new Error("kubectl is required for deploy");
  }

  if (action === "deploy") {
    const rendered = renderSandboxSet({
      image: process.env.ONYXCLAW_OPENCLAW_IMAGE,
      replicas: process.env.ONYXCLAW_WARM_POOL_REPLICAS ?? 2,
      templateName: "onyxclaw",
    });
    await writeFile(manifest, rendered, { mode: 0o600 });
  } else if (action === "destroy") {
    try {
      await access(kubeconfig);
    } catch {
      // A partial deployment may not have produced kubeconfig; Terraform still cleans its state.
    }
  }

  for (const item of buildCommands(action, { terraform })) execute(item);
  if (action === "destroy") await rm(generated, { recursive: true, force: true });
}

function execute({ command, args, optional = false }) {
  const result = spawnSync(command, args, { cwd: root, env: process.env, stdio: "inherit" });
  if (result.status !== 0 && !optional) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    process.stderr.write(`onyxclaw ACS IaC: ${error.message}\n`);
    process.exitCode = 1;
  });
}
