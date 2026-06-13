#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TASK_RULES="$ROOT_DIR/docs/ops/task-doc-workflow.md"
ACTIVE_DIR="$ROOT_DIR/docs/tasks/active"

pass_count=0
warn_count=0

pass() {
  echo "[PASS] $*"
  pass_count=$((pass_count + 1))
}

warn() {
  echo "[WARN] $*"
  warn_count=$((warn_count + 1))
}

extract_required_fields() {
  awk '
    /^### 6\.6 / { in_section=1; next }
    in_section && /^---$/ { exit }
    in_section && /^\- `active` 任务必须有/ {
      line=$0
      while (match(line, /`[^`]+`/)) {
        field=substr(line, RSTART + 1, RLENGTH - 2)
        if (field != "active") print field
        line=substr(line, RSTART + RLENGTH)
      }
    }
  ' "$TASK_RULES"
}

field_value_present() {
  local file="$1"
  local field="$2"

  grep -Eq "^${field}:[[:space:]]*[^[:space:]].*$" "$file"
}

has_any() {
  local file="$1"
  shift

  local pattern
  for pattern in "$@"; do
    if grep -Eiq "$pattern" "$file"; then
      return 0
    fi
  done
  return 1
}

required_fields=()
while IFS= read -r field; do
  required_fields+=("$field")
done < <(extract_required_fields)

if [[ ! -f "$TASK_RULES" ]]; then
  warn "规则文档不存在: docs/ops/task-doc-workflow.md"
elif [[ ${#required_fields[@]} -eq 0 ]]; then
  warn "无法从 docs/ops/task-doc-workflow.md §6.6 提取 active 必填字段"
else
  pass "已从 docs/ops/task-doc-workflow.md §6.6 读取 active 必填字段: ${required_fields[*]}"
fi

shopt -s nullglob
active_files=("$ACTIVE_DIR"/*.md)

if [[ ${#active_files[@]} -eq 0 ]]; then
  pass "docs/tasks/active/ 无任务单"
else
  for file in "${active_files[@]}"; do
    rel="${file#"$ROOT_DIR"/}"
    missing_fields=()

    for field in "${required_fields[@]}"; do
      if ! field_value_present "$file" "$field"; then
        missing_fields+=("$field")
      fi
    done

    if [[ ${#missing_fields[@]} -eq 0 ]]; then
      pass "$rel 字段齐全"
    else
      warn "$rel 缺少或未填写字段: ${missing_fields[*]}"
    fi

    status="$(awk -F ':' '/^Status:/ { sub(/^[[:space:]]+/, "", $2); print $2; exit }' "$file")"

    case "$status" in
      ready_for_review)
        missing_records=()
        has_any "$file" "commit[[:space:]]*:" "commit[[:space:]]*[0-9a-f]{7,}" || missing_records+=("commit")
        has_any "$file" "执行命令摘要" "检查命令" "命令摘要" || missing_records+=("检查命令")
        has_any "$file" "检查结果" "验收[[:space:]]*:" "PASS|WARN|通过|失败" || missing_records+=("检查结果")

        if [[ ${#missing_records[@]} -eq 0 ]]; then
          pass "$rel ready_for_review 状态记录齐全"
        else
          warn "$rel ready_for_review 缺少状态记录: ${missing_records[*]}"
        fi
        ;;
      blocked)
        missing_records=()
        has_any "$file" "阻塞原因" "blocked" "Stop Gate" || missing_records+=("阻塞原因")
        has_any "$file" "Stop Gate" "Stop Gates" "触发" || missing_records+=("触发的 Stop Gate")
        has_any "$file" "需要谁拍板" "Chase" "Approver" "用户" "PM" "Review" || missing_records+=("所需拍板人")

        if [[ ${#missing_records[@]} -eq 0 ]]; then
          pass "$rel blocked 状态记录齐全"
        else
          warn "$rel blocked 缺少状态记录: ${missing_records[*]}"
        fi
        ;;
      done)
        warn "$rel Status: done 仍位于 docs/tasks/active/"
        ;;
      "")
        warn "$rel 缺少 Status 字段"
        ;;
      *)
        pass "$rel 状态无需额外记录检查: $status"
        ;;
    esac
  done
fi

echo "Summary: PASS $pass_count / WARN $warn_count"

if [[ $warn_count -gt 0 ]]; then
  exit 1
fi
