export const CHANNEL_PROTOCOL_VERSION = "1";

const EVENT_TYPES = new Set([
  "channel.register",
  "channel.registered",
  "heartbeat",
  "message.inbound",
  "message.outbound",
  "message.ack",
  "error",
]);

function requireString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value;
}

export function parseChannelEnvelope(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("channel envelope must be an object");
  }
  const protocolVersion = requireString(input.protocolVersion, "protocolVersion");
  if (protocolVersion !== CHANNEL_PROTOCOL_VERSION) {
    throw new RangeError(`unsupported protocolVersion: ${protocolVersion}`);
  }
  const eventType = requireString(input.eventType, "eventType");
  if (!EVENT_TYPES.has(eventType)) {
    throw new RangeError(`unsupported eventType: ${eventType}`);
  }
  requireString(input.eventId, "eventId");
  requireString(input.timestamp, "timestamp");
  requireString(input.instanceId, "instanceId");
  requireString(input.accountId, "accountId");
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) {
    throw new TypeError("payload must be an object");
  }
  return structuredClone(input);
}

export function createEnvelope({
  eventId,
  eventType,
  instanceId,
  accountId,
  payload,
  timestamp = new Date().toISOString(),
}) {
  return parseChannelEnvelope({
    protocolVersion: CHANNEL_PROTOCOL_VERSION,
    eventId,
    eventType,
    timestamp,
    instanceId,
    accountId,
    payload,
  });
}

export function createInboundMessage({
  eventId,
  instanceId,
  accountId,
  senderId,
  chatId,
  threadId,
  text,
  timestamp,
}) {
  return createEnvelope({
    eventId,
    eventType: "message.inbound",
    timestamp,
    instanceId,
    accountId,
    payload: {
      senderId: requireString(senderId, "senderId"),
      chatId: requireString(chatId, "chatId"),
      ...(threadId ? { threadId } : {}),
      text: requireString(text, "text"),
    },
  });
}

export function createOutboundMessage({
  eventId,
  instanceId,
  accountId,
  chatId,
  text,
  inReplyTo,
}) {
  return createEnvelope({
    eventId,
    eventType: "message.outbound",
    instanceId,
    accountId,
    payload: {
      chatId: requireString(chatId, "chatId"),
      text: requireString(text, "text"),
      ...(inReplyTo ? { inReplyTo } : {}),
    },
  });
}
