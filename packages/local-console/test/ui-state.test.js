import assert from "node:assert/strict";
import test from "node:test";

import { resolveLandingView } from "../public/ui-state.js";

test("a browser refresh always lands on lobster mode without resetting server progress", () => {
  assert.deepEqual(
    resolveLandingView({
      initialLanding: true,
      status: { mode: "connected", currentStep: "chat", soulConfirmed: true },
    }),
    { visibleStep: "mode" },
  );
});

test("after continuing, the UI follows the server-controlled serial step", () => {
  assert.deepEqual(
    resolveLandingView({
      initialLanding: false,
      status: { mode: "connected", currentStep: "soul", soulConfirmed: false },
    }),
    { visibleStep: "soul" },
  );
});

test("cloud allocation advances to personality", () => {
  assert.deepEqual(
    resolveLandingView({
      initialLanding: false,
      status: { mode: "allocated", currentStep: "soul", soulConfirmed: false },
    }),
    { visibleStep: "soul" },
  );
});
