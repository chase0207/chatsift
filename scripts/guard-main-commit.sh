#!/usr/bin/env bash

dry_run=0
branch_override=""
files=()

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/guard-main-commit.sh [--dry-run] [--branch <branch>] [--files <path>...]

Default mode reads staged files from git index. --files is for dry-run simulation.
Set ALLOW_MAIN_BIZ=1 to bypass main business-code blocking.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      dry_run=1
      shift
      ;;
    --branch)
      branch_override="${2:-}"
      if [[ -z "$branch_override" ]]; then
        echo "[GUARD][ERROR] --branch requires a value"
        exit 2
      fi
      shift 2
      ;;
    --files)
      shift
      while [[ $# -gt 0 ]]; do
        files+=("$1")
        shift
      done
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[GUARD][ERROR] unknown argument: $1"
      usage
      exit 2
      ;;
  esac
done

current_branch="${branch_override:-$(git branch --show-current 2>/dev/null || true)}"

if [[ ${#files[@]} -eq 0 ]]; then
  while IFS= read -r file; do
    [[ -n "$file" ]] && files+=("$file")
  done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
fi

mode="[GUARD]"
if [[ "$dry_run" -eq 1 ]]; then
  mode="[DRY-RUN]"
fi

if [[ "${ALLOW_MAIN_BIZ:-}" == "1" ]]; then
  echo "$mode[ALLOW][WARNING] 已用 ALLOW_MAIN_BIZ=1 临时放行业务代码进 main。"
  exit 0
fi

if [[ "$current_branch" != "main" ]]; then
  echo "$mode[ALLOW] current branch is '$current_branch'; main-only guard skipped."
  exit 0
fi

business_files=()
for file in "${files[@]}"; do
  case "$file" in
    server/*|admin/*|plugin/*)
      business_files+=("$file")
      ;;
  esac
done

if [[ ${#business_files[@]} -gt 0 ]]; then
  echo "$mode[BLOCK] 拦截:业务代码不能直接提交到 main,请在 feature/hotfix 分支上提交后再合并。涉及文件:"
  printf '  - %s\n' "${business_files[@]}"
  if [[ "$dry_run" -eq 1 ]]; then
    exit 0
  fi
  exit 1
fi

if [[ ${#files[@]} -eq 0 ]]; then
  echo "$mode[ALLOW] no staged files to check."
else
  echo "$mode[ALLOW] main commit contains no server/admin/plugin business files."
fi

exit 0
