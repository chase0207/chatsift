#!/bin/bash
# 写入新版本号到 VERSION 并同步到三件套。不自动 commit(由 release-prod.sh 统一提交)。
# 用法: bash scripts/bump-version.sh 0.2.0
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo -e "${RED}[ERROR]${NC} 用法: bash scripts/bump-version.sh <x.y.z>"; exit 1
fi
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${RED}[ERROR]${NC} 版本号格式错误: '$VERSION'(应为 x.y.z)"; exit 1
fi

cd "$PROJECT_DIR"
echo "$VERSION" > VERSION
bash scripts/sync-version.sh
echo -e "${GREEN}VERSION 已置为 $VERSION${NC}"
