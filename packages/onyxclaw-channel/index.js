import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";

import { onyxclawPlugin } from "./src/channel.js";

export default defineChannelPluginEntry({
  id: "onyxclaw",
  name: "OnyxClaw",
  description: "Phase 0 channel for validating E2B-compatible sandboxes",
  plugin: onyxclawPlugin,
});
