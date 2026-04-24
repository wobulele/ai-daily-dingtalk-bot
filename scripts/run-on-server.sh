#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

: "${DINGTALK_WEBHOOK:?Missing DINGTALK_WEBHOOK in .env or environment.}"

if [[ -z "${STATE_PATH:-}" ]]; then
  export STATE_PATH="$ROOT_DIR/.runtime/state.json"
elif [[ "$STATE_PATH" != /* ]]; then
  export STATE_PATH="$ROOT_DIR/$STATE_PATH"
fi

cd "$ROOT_DIR"
exec node src/index.js
