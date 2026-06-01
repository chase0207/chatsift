#!/bin/bash
# 把根 VERSION 同步到 server/admin/plugin 的版本字段。
# chatsift 只有三件套(无 chat_rpa 的 dom-collector)。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

cd "$PROJECT_DIR"

if [[ ! -f VERSION ]]; then
  echo -e "${RED}[ERROR] VERSION 文件不存在${NC}"
  exit 1
fi

VERSION=$(tr -d '[:space:]' < VERSION)

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${RED}[ERROR] VERSION 格式错误: '$VERSION'(应为 x.y.z)${NC}"
  exit 1
fi

set_json_version() {
  local file="$1"
  local ver="$2"
  [[ -f "$file" ]] || { echo -e "${RED}[skip]${NC} 不存在: $file"; return; }
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$file','utf8'));
    data.version = '$ver';
    if (data.packages && data.packages['']) data.packages[''].version = '$ver';
    fs.writeFileSync('$file', JSON.stringify(data, null, 2) + '\n');
  "
  echo -e "${GREEN}[OK]${NC} $file → $ver"
}

set_json_version "server/package.json"      "$VERSION"
set_json_version "server/package-lock.json" "$VERSION"
set_json_version "admin/package.json"       "$VERSION"
set_json_version "admin/package-lock.json"  "$VERSION"
set_json_version "plugin/manifest.json"     "$VERSION"

echo ""
echo -e "${GREEN}版本号已同步为 $VERSION${NC}"
