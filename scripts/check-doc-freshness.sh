#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

check_line_for_hardcoded_version() {
  local file="$1"
  local line_no="$2"
  local text="$3"

  if [[ "$text" =~ (当前|开发阶段|prod[[:space:]]*VERSION|生产[[:space:]]*VERSION) ]] &&
     [[ "$text" =~ (v0\.[0-9]+\.[0-9]+|VERSION[[:space:]]*=?[[:space:]]*\`?0\.[0-9]+\.[0-9]+) ]]; then
    warn "$file:$line_no 当前状态语境写死版本号: $text"
  fi
}

check_ssot_targets() {
  local file
  local before_warns="$warn_count"

  for file in README.md docs/ops/release.md docs/ops/server-access.md; do
    while IFS=: read -r line_no text; do
      check_line_for_hardcoded_version "$file" "$line_no" "$text"
    done < <(awk '
      /^## .*变更日志/ { in_changelog=1 }
      !in_changelog && /当前|开发阶段|prod[[:space:]]*VERSION|生产[[:space:]]*VERSION|VERSION[[:space:]]*=/ {
        print FNR ":" $0
      }
    ' "$ROOT_DIR/$file")
  done

  if [[ "$warn_count" -eq "$before_warns" ]]; then
    pass "README.md / docs/ops/release.md / docs/ops/server-access.md 未发现当前状态硬编码产品版本号"
  fi
}

header_version() {
  local file="$1"

  awk '
    /^[> ]*版本:/ {
      line=$0
      sub(/^[> ]*版本:[[:space:]]*/, "", line)
      if (match(line, /v[0-9]+\.[0-9]+\.[0-9]+/)) {
        print substr(line, RSTART, RLENGTH)
        exit
      }
    }
  ' "$file"
}

changelog_top_version() {
  local file="$1"

  awk '
    /^## .*变更日志/ { in_log=1; next }
    in_log && /^\| v[0-9]+\.[0-9]+\.[0-9]+[[:space:]]*\|/ {
      line=$0
      if (match(line, /v[0-9]+\.[0-9]+\.[0-9]+/)) {
        print substr(line, RSTART, RLENGTH)
        exit
      }
    }
  ' "$file"
}

check_doc_versions() {
  local file
  local header
  local top

  for file in AGENTS.md docs/ops/*.md docs/meta/*.md; do
    [[ -f "$ROOT_DIR/$file" ]] || continue

    header="$(header_version "$ROOT_DIR/$file")"
    top="$(changelog_top_version "$ROOT_DIR/$file")"

    if [[ -z "$header" && -z "$top" ]]; then
      pass "$file 无文档头版本/changelog,跳过"
    elif [[ -z "$header" ]]; then
      warn "$file 缺少文档头版本"
    elif [[ -z "$top" ]]; then
      warn "$file 缺少变更日志顶行版本"
    elif [[ "$header" == "$top" ]]; then
      pass "$file 文档头版本与 changelog 顶行一致($header)"
    else
      warn "$file 文档头版本($header) != changelog 顶行($top)"
    fi
  done
}

check_ssot_targets
check_doc_versions

echo "Summary: PASS $pass_count / WARN $warn_count"

if [[ "$warn_count" -gt 0 ]]; then
  exit 1
fi
