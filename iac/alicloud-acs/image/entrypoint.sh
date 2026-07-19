#!/bin/bash
set -euo pipefail

: "${OPENCLAW_CONFIG_PATH:=/home/node/.openclaw/openclaw.json}"
: "${OPENCLAW_WORKSPACE_DIR:=/home/node/.openclaw/workspace}"
: "${ONYXCLAW_BOOTSTRAP_DIR:=/home/node/.openclaw/bootstrap}"

bootstrap_config="${ONYXCLAW_BOOTSTRAP_DIR}/openclaw.json"
bootstrap_soul="${ONYXCLAW_BOOTSTRAP_DIR}/SOUL.md"

install -d -m 0700 -o node -g node \
  "${ONYXCLAW_BOOTSTRAP_DIR}" \
  "${OPENCLAW_WORKSPACE_DIR}" \
  "$(dirname "${OPENCLAW_CONFIG_PATH}")"

# The E2B files API writes these two files after a warm Sandbox is claimed.
# Keeping the warm process idle avoids starting an unconfigured Gateway.
while [[ ! -s "${bootstrap_config}" || ! -s "${bootstrap_soul}" ]]; do
  sleep 1
done

cp "${bootstrap_config}" "${OPENCLAW_CONFIG_PATH}"
cp "${bootstrap_soul}" "${OPENCLAW_WORKSPACE_DIR}/SOUL.md"
chmod 0600 "${OPENCLAW_CONFIG_PATH}" "${OPENCLAW_WORKSPACE_DIR}/SOUL.md"
chown node:node "${OPENCLAW_CONFIG_PATH}" "${OPENCLAW_WORKSPACE_DIR}/SOUL.md"

exec setpriv --reuid=node --regid=node --init-groups \
  node /app/openclaw.mjs gateway --bind lan --port 18789
