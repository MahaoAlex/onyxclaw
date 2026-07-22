export function resolveLandingView({ initialLanding, status }) {
  return {
    visibleStep: initialLanding ? "mode" : (status.currentStep ?? "mode"),
  };
}

export function resolveTabState(status) {
  const soulConfirmed = Boolean(status?.soulConfirmed);
  const connected = status?.mode === "connected";
  const personalityReady = status?.mode === "allocated" || connected;
  return {
    mode: { enabled: true, hidden: false },
    soul: { enabled: personalityReady && !soulConfirmed, hidden: soulConfirmed },
    chat: { enabled: connected && soulConfirmed, hidden: false },
  };
}
