# OnyxClaw

OnyxClaw is a local OpenClaw Channel harness and Phase 1 browser console. Its
current macOS mode uses an already installed OpenClaw and does not create a
Sandbox.

Current implementation:

- minimal OpenClaw Channel Plugin;
- WebSocket Channel Platform Simulator;
- versioned inbound/outbound protocol;
- bootstrap registration, session reconnect, heartbeat, delivery receipt, and event deduplication;
- OpenClaw inbound dispatch and outbound reply delivery;
- local macOS E2E runner covering two message rounds, Gateway restart, token
  rotation, temporary `SOUL.md` verification, cleanup, and JSON reports.
- loopback-only Phase 1 UI for local Channel lifecycle, `SOUL.md` editing, and
  text chat, enforced as a serial connect → personality confirmation → chat
  onboarding flow with a one-time personality-based greeting.

## Requirements

- Node.js 22.19 or newer;
- OpenClaw 2026.6.11 or a compatible version;
- a configured local OpenClaw model provider.

## Development

```bash
npm install
npm test
```

The WebSocket test binds to loopback and may require local network permission in a sandboxed development environment.

## Local Phase 0

See [docs/phase0-local.md](./docs/phase0-local.md).

```bash
npm run phase0:local
```

Reports are written to `artifacts/phase0-local-<run-id>.json`.
The runner temporarily restarts the local Gateway and restores the original
`SOUL.md` before disabling the test Channel.

## Local Phase 1 UI

```bash
npm run dev
```

Open `http://127.0.0.1:3000`. This UI operates only on the OpenClaw installed
on the current Mac. See [docs/phase1-local.md](./docs/phase1-local.md).

With the UI server running, execute the complete local acceptance flow with:

```bash
npm run phase1:smoke
```

Current local acceptance status: 32 automated tests passing, plus real macOS
Phase 0 and Phase 1 OpenClaw runs passing. Cloud E2B/Sandbox lifecycle work is
tracked separately in the proposal and is not part of local mode.

## Design

- [Initial requirements](./docs/init.md)
- [Cloud validation proposal](./docs/proposal.md)
