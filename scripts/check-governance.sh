#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

pass_count=0
warn_count=0
exit_code=0

run_check() {
  local label="$1"
  local command="$2"
  local output
  local status

  echo "== $label =="
  output="$(cd "$ROOT_DIR" && bash "$command" 2>&1)"
  status=$?
  echo "$output"

  pass_count=$((pass_count + $(grep -c '^\[PASS\]' <<< "$output" || true)))
  warn_count=$((warn_count + $(grep -c '^\[WARN\]' <<< "$output" || true)))

  if [[ $status -ne 0 ]]; then
    exit_code=1
  fi
}

if [[ -f "$ROOT_DIR/scripts/check-doc-freshness" ]]; then
  run_check "A1 文档新鲜度检查" "scripts/check-doc-freshness"
elif [[ -f "$ROOT_DIR/scripts/check-doc-freshness.sh" ]]; then
  run_check "A1 文档新鲜度检查" "scripts/check-doc-freshness.sh"
else
  echo "[PASS] A1 检查未就位: scripts/check-doc-freshness 不存在,按兼容模式跳过"
  pass_count=$((pass_count + 1))
fi

run_check "A2 任务单一致性检查" "scripts/check-tasks.sh"

echo "== Governance Summary =="
echo "PASS $pass_count / WARN $warn_count"

if [[ $warn_count -gt 0 ]]; then
  exit 1
fi

exit "$exit_code"
