import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStartPayload,
  cloudStartLabel,
  runtimePresentation,
} from "../public/runtime-ui.js";

test("local presentation keeps macOS controls and hides cloud identity inputs", () => {
  assert.deepEqual(runtimePresentation({ deploymentMode: "local" }), {
    cloud: false,
    environmentLabel: "LOCAL MACOS",
    modeCopy: "连接这台 Mac 上的 OpenClaw，创建一只拥有专属性格的智能龙虾。",
    primaryMetricLabel: "INSTANCE",
    secondaryMetricLabel: "GATEWAY",
  });
});

test("cloud presentation identifies the configured provider and Sandbox metrics", () => {
  assert.deepEqual(runtimePresentation({
    deploymentMode: "cloud",
    providerId: "alicloud-acs",
    providerName: "Alibaba Cloud ACS Agent Sandbox",
  }), {
    cloud: true,
    environmentLabel: "ALIBABA CLOUD ACS · CLOUD",
    modeCopy: "创建新的云端 Sandbox，或连接已有 Sandbox，随后启动其中的 OpenClaw。",
    primaryMetricLabel: "SANDBOX",
    secondaryMetricLabel: "RUNTIME",
  });
});

test("existing cloud user sends Sandbox and OpenClaw instance identities", () => {
  assert.deepEqual(buildStartPayload({
    deploymentMode: "cloud",
    userType: "existing",
    sandboxId: " sandbox-123 ",
    instanceId: " claw-456 ",
  }), {
    sandboxId: "sandbox-123",
    instanceId: "claw-456",
  });
});

test("new and local users start without client-supplied Sandbox identity", () => {
  assert.deepEqual(buildStartPayload({ deploymentMode: "cloud", userType: "new" }), {});
  assert.deepEqual(buildStartPayload({
    deploymentMode: "local",
    userType: "existing",
    sandboxId: "ignored",
  }), {});
});

test("existing cloud user must provide a Sandbox ID", () => {
  assert.throws(
    () => buildStartPayload({ deploymentMode: "cloud", userType: "existing" }),
    /Sandbox ID/,
  );
});

test("cloud entry action clearly distinguishes create and connect", () => {
  assert.equal(cloudStartLabel("new"), "创建云端 Sandbox →");
  assert.equal(cloudStartLabel("existing"), "连接已有 Sandbox →");
});
