export function runtimePresentation(config = {}) {
  const cloud = config.deploymentMode === "cloud";
  if (!cloud) {
    return {
      cloud: false,
      environmentLabel: "LOCAL MACOS",
      modeCopy: "连接这台 Mac 上的 OpenClaw，创建一只拥有专属性格的智能龙虾。",
      primaryMetricLabel: "INSTANCE",
      secondaryMetricLabel: "GATEWAY",
    };
  }
  const providerLabel = config.providerName?.toUpperCase().replace(" AGENT SANDBOX", "") ||
    config.providerId?.toUpperCase() || "CLOUD SANDBOX";
  return {
    cloud: true,
    environmentLabel: `${providerLabel} · CLOUD`,
    modeCopy: "创建新的云端 Sandbox，或连接已有 Sandbox，随后启动其中的 OpenClaw。",
    primaryMetricLabel: "SANDBOX",
    secondaryMetricLabel: "RUNTIME",
  };
}

export function buildStartPayload({ deploymentMode, userType, sandboxId, instanceId }) {
  if (deploymentMode !== "cloud" || userType !== "existing") return {};
  const normalizedSandboxId = sandboxId?.trim();
  if (!normalizedSandboxId) throw new Error("请输入已有 Sandbox ID");
  const normalizedInstanceId = instanceId?.trim();
  return {
    sandboxId: normalizedSandboxId,
    ...(normalizedInstanceId ? { instanceId: normalizedInstanceId } : {}),
  };
}

export function cloudStartLabel(userType) {
  return userType === "existing"
    ? "连接已有 Sandbox →"
    : "创建云端 Sandbox →";
}
