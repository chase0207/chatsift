#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

EXPECT="${EXPECT:-auto}"
DURATION="${DURATION:-90}"
WATCH_RUNTIME="${WATCH_RUNTIME:-0}"

node scripts/smoke/douyin-laike-regression.js

if [[ "$WATCH_RUNTIME" == "1" ]]; then
  node scripts/smoke/douyin-laike-runtime-watch.js --expect "$EXPECT" --duration "$DURATION"
else
  echo "runtime watch skipped. Set WATCH_RUNTIME=1 to inspect live runtime_logs."
fi
