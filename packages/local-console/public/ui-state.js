export function resolveLandingView({ initialLanding, status }) {
  return {
    visibleStep: initialLanding ? "mode" : (status.currentStep ?? "mode"),
  };
}
