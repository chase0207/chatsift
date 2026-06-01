#!/bin/bash
# 校验三件套版本与 VERSION 一致;并(若 prod/test compose 已存在)校验
# SQL 文件数 == compose 的 init 挂载数。--fix 以 VERSION 为准自动修复版本号。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FIX_MODE=false
[[ "${1:-}" == "--fix" ]] && FIX_MODE=true

cd "$PROJECT_DIR"

get_json_version() { node -e "console.log(JSON.parse(require('fs').readFileSync('$1','utf8')).version)"; }
set_json_version() {
  node -e "
    const fs=require('fs');const d=JSON.parse(fs.readFileSync('$1','utf8'));
    d.version='$2'; if(d.packages&&d.packages['']) d.packages[''].version='$2';
    fs.writeFileSync('$1', JSON.stringify(d,null,2)+'\n');"
}

BASE_VERSION=$([[ -f VERSION ]] && tr -d '[:space:]' < VERSION || echo "(缺失)")

declare -a FILES=(
  "server/package.json"
  "server/package-lock.json"
  "admin/package.json"
  "admin/package-lock.json"
  "plugin/manifest.json"
)

echo ""
echo "  版本号一致性检查 (基准 VERSION=$BASE_VERSION)"
echo "  ----------------------------------------"
ALL_SYNCED=true
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || { printf "  %-28s %s\n" "$f" "(不存在,跳过)"; continue; }
  cur=$(get_json_version "$f")
  printf "  %-28s %s\n" "$f" "$cur"
  if [[ "$cur" != "$BASE_VERSION" ]]; then
    ALL_SYNCED=false
    if $FIX_MODE && [[ "$BASE_VERSION" != "(缺失)" ]]; then
      set_json_version "$f" "$BASE_VERSION"
      echo -e "    ${YELLOW}[FIXED]${NC} → $BASE_VERSION"
    else
      echo -e "    ${RED}[MISMATCH]${NC} 期望 $BASE_VERSION"
    fi
  fi
done

# Migration 挂载数校验:仅当对应 compose 文件存在时才检查(prod/test 在部署批次生成)
echo ""
echo "  Migration 挂载校验"
echo "  ------------------"
SQL_COUNT=$(ls "${PROJECT_DIR}/server/sql/"*.sql 2>/dev/null | wc -l | tr -d ' ')
printf "  %-34s %s\n" "server/sql/*.sql 文件数:" "$SQL_COUNT"
for compose in deploy/docker-compose.prod.yml deploy/docker-compose.test.yml; do
  if [[ -f "$compose" ]]; then
    mount=$(grep -c 'docker-entrypoint-initdb.d' "$compose" || true)
    printf "  %-34s %s\n" "$compose 挂载数:" "$mount"
    if [[ "$mount" != "$SQL_COUNT" ]]; then
      ALL_SYNCED=false
      echo -e "    ${RED}[MISMATCH]${NC} 与 SQL 文件数($SQL_COUNT)不一致"
    fi
  else
    printf "  %-34s %s\n" "$compose:" "(尚未创建,跳过)"
  fi
done

echo ""
if $ALL_SYNCED; then
  echo -e "  ${GREEN}Status: SYNCED${NC}"; echo ""; exit 0
elif $FIX_MODE; then
  echo -e "  ${YELLOW}Status: FIXED${NC}"; echo ""; exit 0
else
  echo -e "  ${RED}Status: MISMATCH${NC}  (运行 'bash scripts/check-version.sh --fix' 以 VERSION 为准修复)"; echo ""; exit 1
fi
