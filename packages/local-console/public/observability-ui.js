export function architectureStateFor(calls = []) {
  const active = calls.find((call) => call.state === "running");
  if (!active) return { activeApi: null, edges: [], nodes: [] };
  return {
    activeApi: active.api,
    edges: ["app-bff", "bff-e2b", "e2b-sandbox"],
    nodes: ["app", "bff", "e2b", "sandbox"],
  };
}

export function formatDuration(durationMs) {
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
}
