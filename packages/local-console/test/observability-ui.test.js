import assert from "node:assert/strict";
import test from "node:test";

import {
  architectureStateFor,
  formatDuration,
  summarizeCalls,
} from "../public/observability-ui.js";

test("architecture highlights only Sandbox Service calls", () => {
  assert.deepEqual(
    architectureStateFor([{ api: "Files.write", state: "running" }]),
    {
      activeApi: "Files.write",
      edges: ["app-bff", "bff-e2b", "e2b-sandbox"],
      nodes: ["app", "bff", "e2b", "sandbox"],
    },
  );
  assert.deepEqual(architectureStateFor([]), {
    activeApi: null,
    edges: [],
    nodes: [],
  });
});

test("duration formatting stays compact for the telemetry table", () => {
  assert.equal(formatDuration(82), "82 ms");
  assert.equal(formatDuration(2_413), "2.41 s");
});

test("call summary exposes totals and groups failed APIs", () => {
  assert.deepEqual(summarizeCalls([
    { api: "Commands.run", state: "failed" },
    { api: "Files.write", state: "succeeded" },
    { api: "Commands.run", state: "failed" },
    { api: "Sandbox.create", state: "running" },
  ]), {
    total: 4,
    running: 1,
    succeeded: 1,
    failed: 2,
    failedApis: [{ api: "Commands.run", count: 2 }],
  });
});
