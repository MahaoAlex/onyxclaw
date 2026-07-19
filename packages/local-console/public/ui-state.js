export function resolveLandingView({ initialLanding, status }) {
  const connected = status.mode === "connected";
  const busy = status.mode === "starting";
  let startLabel = "进入龙虾模式";
  if (busy) startLabel = "正在进入龙虾模式…";
  else if (connected && initialLanding) startLabel = "继续龙虾模式";
  else if (connected) startLabel = "龙虾模式已连接";

  return {
    visibleStep: initialLanding ? "mode" : (status.currentStep ?? "mode"),
    startLabel,
    startDisabled: busy || (connected && !initialLanding),
  };
}
