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

export function summarizeCalls(calls = []) {
  const summary = {
    total: calls.length,
    running: 0,
    succeeded: 0,
    failed: 0,
    failedApis: [],
  };
  const failedApis = new Map();
  for (const call of calls) {
    if (call.state === "running") summary.running += 1;
    if (call.state === "succeeded") summary.succeeded += 1;
    if (call.state === "failed") {
      summary.failed += 1;
      const api = call.api || "Unknown API";
      failedApis.set(api, (failedApis.get(api) ?? 0) + 1);
    }
  }
  summary.failedApis = [...failedApis.entries()]
    .map(([api, count]) => ({ api, count }))
    .sort((left, right) => right.count - left.count || left.api.localeCompare(right.api));
  return summary;
}
