import { randomUUID } from "node:crypto";

import { createInboundMessage } from "./protocol.js";

export async function runLocalPhase0({
  simulator,
  driver,
  instanceId,
  accountId,
  bootstrapToken,
  restartBootstrapToken,
  timeoutMs,
  firstPrompt = "Reply with exactly: ONYXCLAW_PHASE0_FIRST_OK",
  secondPrompt = "Reply with exactly: ONYXCLAW_PHASE0_SECOND_OK",
  soulContent = "# Phase 0 verification soul\n\nReply concisely during this temporary test.\n",
  onProgress = () => {},
}) {
  const runId = randomUUID();
  const startedAt = new Date();
  const steps = [];
  const replies = [];
  let soulSnapshot;
  let failure;

  async function step(name, operation) {
    const started = Date.now();
    onProgress(name);
    try {
      const result = await operation();
      steps.push({ name, result: "passed", durationMs: Date.now() - started });
      return result;
    } catch (error) {
      steps.push({
        name,
        result: "failed",
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async function roundTrip(name, text) {
    return step(name, async () => {
      const eventId = randomUUID();
      simulator.sendInbound(
        instanceId,
        createInboundMessage({
          eventId,
          instanceId,
          accountId,
          senderId: "phase0-tester",
          chatId: "phase0-local",
          text,
        }),
      );
      const outbound = await simulator.waitForNextOutbound(timeoutMs);
      replies.push(outbound.payload.text);
      return outbound;
    });
  }

  try {
    soulSnapshot = await step("soul.snapshot", () => driver.snapshotSoul());
    simulator.issueBootstrapToken(instanceId, bootstrapToken);
    await step("simulator.start", () => simulator.start());
    await step("openclaw.prepare.initial", () =>
      driver.prepare({
        platformUrl: simulator.url,
        instanceId,
        bootstrapToken,
      }),
    );
    const firstConnection = await step("channel.connect.initial", () =>
      simulator.waitForConnection(instanceId, { timeoutMs }),
    );
    await roundTrip("channel.message.first", firstPrompt);

    await step("channel.disconnect.inject", async () => {
      simulator.forceDisconnect(instanceId);
    });
    const reconnected = await step("channel.reconnect.session", () =>
      simulator.waitForConnection(instanceId, {
        afterConnectionId: firstConnection.connectionId,
        timeoutMs,
      }),
    );

    const writtenSoul = await step("soul.write.verify", () =>
      driver.writeAndVerifySoul(soulContent),
    );
    simulator.issueBootstrapToken(instanceId, restartBootstrapToken);
    await step("openclaw.restart.with.rotated_token", () =>
      driver.prepare({
        platformUrl: simulator.url,
        instanceId,
        bootstrapToken: restartBootstrapToken,
      }),
    );
    await step("channel.connect.after_gateway_restart", () =>
      simulator.waitForConnection(instanceId, {
        afterConnectionId: reconnected.connectionId,
        timeoutMs,
      }),
    );
    await step("gateway.probe", () => driver.probeGateway());
    await step("soul.persist.after_restart", async () => {
      const persisted = await driver.readSoulVerification();
      if (persisted.sha256 !== writtenSoul.sha256) {
        throw new Error("SOUL.md hash changed after Gateway restart");
      }
    });
    await roundTrip("channel.message.second", secondPrompt);
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  } finally {
    if (soulSnapshot) {
      try {
        await step("cleanup.soul.restore", () => driver.restoreSoul(soulSnapshot));
      } catch (error) {
        failure ??= error;
      }
    }
    try {
      await step("cleanup.channel.disable", () => driver.disableChannel());
    } catch (error) {
      failure ??= error;
    }
    try {
      await step("cleanup.simulator.stop", () => simulator.stop());
    } catch (error) {
      failure ??= error;
    }
  }

  return {
    runId,
    traceId: runId,
    target: "local-macos",
    instanceId,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    result: failure ? "failed" : "passed",
    ...(failure ? { error: failure.message } : {}),
    replies,
    steps,
  };
}
