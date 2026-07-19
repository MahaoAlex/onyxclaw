import { randomUUID } from "node:crypto";
import {
  createChannelPluginBase,
  createChatChannelPlugin,
} from "openclaw/plugin-sdk/channel-core";

import { dispatchInboundEvent } from "./inbound.js";
import { OnyxclawTransport } from "./transport-websocket.js";

export function resolveAccount(cfg, accountId = "default") {
  const section = cfg?.channels?.onyxclaw ?? {};
  const configured = Boolean(
    section.enabled !== false &&
      section.platformUrl &&
      section.bootstrapToken &&
      section.instanceId,
  );

  return {
    accountId: accountId ?? "default",
    configured,
    enabled: section.enabled !== false,
    platformUrl: section.platformUrl,
    bootstrapToken: section.bootstrapToken,
    instanceId: section.instanceId,
  };
}

const base = createChannelPluginBase({
  id: "onyxclaw",
  meta: {
    label: "OnyxClaw",
    selectionLabel: "OnyxClaw (Phase 0)",
    docsPath: "/channels/onyxclaw",
    blurb: "Validate OpenClaw channels inside E2B-compatible sandboxes.",
  },
  capabilities: {
    chatTypes: ["direct"],
    media: false,
    threads: false,
  },
  config: {
    listAccountIds: () => ["default"],
    resolveAccount,
  },
  setup: {
    resolveAccount,
    inspectAccount(cfg, accountId) {
      const account = resolveAccount(cfg, accountId);
      return {
        enabled: account.enabled,
        configured: account.configured,
        tokenStatus: account.bootstrapToken ? "available" : "missing",
      };
    },
  },
});

export const onyxclawPlugin = createChatChannelPlugin({
  base: {
    ...base,
    gateway: {
      async startAccount({
        account,
        abortSignal,
        cfg,
        channelRuntime,
        log,
        setStatus,
      }) {
        setStatus({
          accountId: account.accountId,
          configured: account.configured,
          running: account.configured,
          connected: false,
        });
        if (!account.configured) {
          log?.warn?.("OnyxClaw channel is not configured");
          return;
        }

        const transport = new OnyxclawTransport({
          platformUrl: account.platformUrl,
          instanceId: account.instanceId,
          accountId: account.accountId,
          bootstrapToken: account.bootstrapToken,
          pluginVersion: "0.1.0",
          onError: (error) => log?.error?.(`OnyxClaw transport: ${String(error)}`),
          onInbound: (event, connection) =>
            dispatchInboundEvent({
              event,
              accountId: account.accountId,
              cfg,
              channelRuntime,
              log,
              deliver: async ({ text, chatId, inReplyTo }) => {
                connection.sendOutbound({
                  eventId: randomUUID(),
                  chatId,
                  text,
                  inReplyTo,
                });
              },
            }),
        });

        try {
          await transport.start();
          setStatus({
            accountId: account.accountId,
            configured: true,
            running: true,
            connected: true,
            lastConnectedAt: Date.now(),
          });
          log?.info?.(`OnyxClaw channel connected (${transport.connectionId})`);
          await new Promise((resolve) => {
            if (abortSignal.aborted) return resolve();
            abortSignal.addEventListener("abort", resolve, { once: true });
          });
        } finally {
          transport.stop();
        }
      },
    },
  },
  security: {
    dm: {
      channelKey: "onyxclaw",
      resolvePolicy: () => "open",
      resolveAllowFrom: () => ["*"],
      defaultPolicy: "open",
    },
  },
  threading: { topLevelReplyToMode: "off" },
});
