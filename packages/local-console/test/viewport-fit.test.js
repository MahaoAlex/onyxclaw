import assert from "node:assert/strict";
import test from "node:test";

import { calculateViewportFit } from "../public/viewport-fit.js";

test("desktop workbench scales down and centers when rendered content is taller than viewport", () => {
  assert.deepEqual(calculateViewportFit({
    viewportWidth: 1440,
    viewportHeight: 820,
    contentWidth: 1400,
    contentHeight: 1000,
  }), {
    enabled: true,
    scale: 0.82,
    renderWidth: 1727,
    left: 12,
  });
});

test("desktop workbench remains unscaled when it already fits", () => {
  assert.deepEqual(calculateViewportFit({
    viewportWidth: 1440,
    viewportHeight: 900,
    contentWidth: 1400,
    contentHeight: 880,
  }), {
    enabled: true,
    scale: 1,
    renderWidth: 1416,
    left: 12,
  });
});

test("mobile layout keeps natural document flow", () => {
  assert.deepEqual(calculateViewportFit({
    viewportWidth: 600,
    viewportHeight: 800,
    contentWidth: 600,
    contentHeight: 1400,
  }), {
    enabled: false,
    scale: 1,
    renderWidth: null,
    left: 0,
  });
});

test("desktop fit keeps a configurable horizontal safety gutter", () => {
  assert.deepEqual(calculateViewportFit({
    viewportWidth: 1280,
    viewportHeight: 720,
    contentWidth: 1240,
    contentHeight: 900,
    horizontalGutter: 20,
  }), {
    enabled: true,
    scale: 0.8,
    renderWidth: 1550,
    left: 20,
  });
});
