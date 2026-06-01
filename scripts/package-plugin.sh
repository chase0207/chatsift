#!/bin/bash
# 打包 plugin/ 成 zip + 生成 metadata.json,供后台首页下载(同 chat_rpa 逻辑)。
# 产物落 server/public/plugin-downloads/;release-prod.sh 会再 copy 到 admin/dist/plugin-downloads/
# (生产容器把 admin/dist 挂载为 /app/public,dashboard 路由从那里读)。
# 用法: bash scripts/package-plugin.sh "本次发版说明(可选)"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

RELEASE_NOTES_ARG="${*:-}"
cd "$PROJECT_DIR"

VERSION=$(tr -d '[:space:]' < VERSION 2>/dev/null || echo "")
[[ -z "$VERSION" ]] && { echo -e "${RED}[ERROR]${NC} 未找到 VERSION"; exit 1; }

ZIP_DIR="server/public/plugin-downloads"
ZIP_NAME="chatsift-plugin-v${VERSION}.zip"
ZIP_PATH="${ZIP_DIR}/${ZIP_NAME}"
mkdir -p "$ZIP_DIR"
rm -f "$ZIP_DIR"/chatsift-plugin-*.zip

# 打包 plugin/,zip 内无 plugin/ 前缀(Chrome 要 manifest.json 在根)
LIST="/tmp/chatsift-plugin-files-$$.txt"
( cd "$PROJECT_DIR/plugin" && find . -type f \
    ! -path "*/node_modules/*" ! -name ".DS_Store" ! -name ".gitkeep" \
    | sed 's|^\./||' | sort > "$LIST" )
( cd "$PROJECT_DIR/plugin" && zip -q -9 -X "$PROJECT_DIR/$ZIP_PATH" -@ < "$LIST" )
rm -f "$LIST"
ZIP_SIZE=$(stat -f%z "$ZIP_PATH" 2>/dev/null || stat -c%s "$ZIP_PATH" 2>/dev/null || echo 0)
echo -e "${GREEN}[OK]${NC} 打包: ${ZIP_PATH} ($((ZIP_SIZE/1024))KB)"

# 建议等级:按 plugin/ 的 git diff 粗判
PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
SUGGESTION="must-update"; SUGGESTION_LABEL="必须更新"
if [[ -n "$PREV_TAG" ]]; then
  CHANGED=$(git diff --name-only "${PREV_TAG}..HEAD" -- plugin/ 2>/dev/null || echo "")
  if [[ -n "$CHANGED" ]]; then
    if echo "$CHANGED" | grep -qE '^plugin/(content\.js|background\.js|runtime/)'; then
      SUGGESTION="must-update"; SUGGESTION_LABEL="必须更新"
    elif echo "$CHANGED" | grep -q '^plugin/.*\.js$'; then
      SUGGESTION="suggest-update"; SUGGESTION_LABEL="建议更新"
    elif echo "$CHANGED" | grep -vqE '^plugin/(icons/|.*\.(css|html|json)$|manifest\.json)'; then
      SUGGESTION="must-update"; SUGGESTION_LABEL="必须更新"
    else
      SUGGESTION="optional-update"; SUGGESTION_LABEL="选择更新"
    fi
  fi
fi

RELEASE_NOTES="$RELEASE_NOTES_ARG"
if [[ -z "$RELEASE_NOTES" ]]; then
  [[ -n "$PREV_TAG" ]] && RELEASE_NOTES=$(git log "${PREV_TAG}..HEAD" --oneline --no-decorate 2>/dev/null | head -20 | sed 's/^[0-9a-f]\{7,9\} //')
  [[ -z "$RELEASE_NOTES" ]] && RELEASE_NOTES="插件打包 v${VERSION}"
fi
RELEASE_DATE=$(date +%Y-%m-%d)
NOTES_JSON=$(printf '%s' "$RELEASE_NOTES" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(JSON.stringify(d.trim())))")

cat > "${ZIP_DIR}/metadata.json" <<EOF
{
  "version": "${VERSION}",
  "releaseDate": "${RELEASE_DATE}",
  "suggestion": "${SUGGESTION}",
  "suggestionLabel": "${SUGGESTION_LABEL}",
  "releaseNotes": ${NOTES_JSON},
  "zipName": "${ZIP_NAME}",
  "zipSize": ${ZIP_SIZE},
  "downloadUrl": "/api/dashboard/plugin-update/download"
}
EOF
echo -e "${GREEN}[OK]${NC} metadata.json: v${VERSION} / ${SUGGESTION_LABEL} / ${RELEASE_DATE} / $((ZIP_SIZE/1024))KB"
