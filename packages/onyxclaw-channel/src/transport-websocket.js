import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

import {
  createEnvelope,
  createOutboundMessage,
  parseChannelEnvelope,
} from "./protocol.js";

export class OnyxclawTransport {
  #options;
  #socket;
  #heartbeatTimer;
  #reconnectTimer;
  #reconnectAttempt = 0;
  #stopped = false;
  #initialSettled = false;
  #initialResolve;
  #initialReject;
  #sessionToken;

  status = "idle";
  connectionId;

  constructor(options) {
    this.#options = options;
  }

  start() {
    if (this.status !== "idle" && this.status !== "closed") {
      throw new Error(`cannot start transport from ${this.status}`);
    }
    this.#stopped = false;
    const initial = new Promise((resolve, reject) => {
      this.#initialResolve = resolve;
      this.#initialReject = reject;
    });
    this.#connect();
    return initial;
  }

  sendOutbound({ eventId, chatId, text, inReplyTo }) {
    if (this.status !== "connected") {
      throw new Error("channel transport is not connected");
    }
    this.#socket.send(
      JSON.stringify(
        createOutboundMessage({
          eventId,
          instanceId: this.#options.instanceId,
          accountId: this.#options.accountId,
          chatId,
          text,
          inReplyTo,
        }),
      ),
    );
  }

  stop() {
    this.#stopped = true;
    this.#stopHeartbeat();
    clearTimeout(this.#reconnectTimer);
    this.#socket?.close(1000, "stopped");
    this.status = "closed";
  }

  #connect() {
    if (this.#stopped) return;
    this.status = this.#reconnectAttempt > 0 ? "reconnecting" : "connecting";
    this.#options.onStatus?.(this.status);
    const socket = new WebSocket(this.#options.platformUrl);
    this.#socket = socket;

    socket.once("open", () => {
      this.status = "registering";
      this.#options.onStatus?.(this.status);
      socket.send(
        JSON.stringify(
          createEnvelope({
            eventId: randomUUID(),
            eventType: "channel.register",
            instanceId: this.#options.instanceId,
            accountId: this.#options.accountId,
            payload: {
              ...(this.#sessionToken
                ? { sessionToken: this.#sessionToken }
                : { bootstrapToken: this.#options.bootstrapToken }),
              pluginVersion: this.#options.pluginVersion,
            },
          }),
        ),
      );
    });

    socket.on("message", async (data) => {
      try {
        const event = parseChannelEnvelope(JSON.parse(data.toString()));
        if (event.eventType === "channel.registered") {
          this.connectionId = event.payload.connectionId;
          this.#sessionToken = event.payload.sessionToken ?? this.#sessionToken;
          this.#reconnectAttempt = 0;
          this.status = "connected";
          this.#options.onStatus?.(this.status);
          this.#startHeartbeat();
          if (!this.#initialSettled) {
            this.#initialSettled = true;
            this.#initialResolve(this);
          }
          return;
        }
        if (event.eventType === "message.inbound") {
          await this.#options.onInbound?.(event, this);
        }
      } catch (error) {
        this.#options.onError?.(error);
        if (!this.#initialSettled) {
          this.#initialSettled = true;
          this.#initialReject(error);
        }
      }
    });

    socket.on("error", (error) => this.#options.onError?.(error));
    socket.once("close", () => {
      this.#stopHeartbeat();
      this.#options.onClose?.();
      if (this.#stopped) {
        this.status = "closed";
        return;
      }
      this.#scheduleReconnect();
    });
  }

  #scheduleReconnect() {
    this.#reconnectAttempt += 1;
    this.status = "reconnecting";
    this.#options.onStatus?.(this.status);
    const min = this.#options.reconnectMinDelayMs ?? 250;
    const max = this.#options.reconnectMaxDelayMs ?? 5_000;
    const delay = Math.min(max, min * 2 ** (this.#reconnectAttempt - 1));
    this.#reconnectTimer = setTimeout(() => this.#connect(), delay);
    this.#reconnectTimer.unref?.();
  }

  #startHeartbeat() {
    this.#stopHeartbeat();
    const intervalMs = this.#options.heartbeatIntervalMs ?? 5_000;
    this.#heartbeatTimer = setInterval(() => {
      if (this.status !== "connected") return;
      this.#socket.send(
        JSON.stringify(
          createEnvelope({
            eventId: randomUUID(),
            eventType: "heartbeat",
            instanceId: this.#options.instanceId,
            accountId: this.#options.accountId,
            payload: { connectionId: this.connectionId },
          }),
        ),
      );
    }, intervalMs);
    this.#heartbeatTimer.unref?.();
  }

  #stopHeartbeat() {
    clearInterval(this.#heartbeatTimer);
    this.#heartbeatTimer = undefined;
  }
}
