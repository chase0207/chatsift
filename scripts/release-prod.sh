#!/bin/bash
# chatsift 唯一正式发版入口。门禁 RELEASE_ACTOR=qa。
# 用法:
#   RELEASE_ACTOR=qa bash scripts/release-prod.sh <version> \
#     --scope "服务端 + 后台 + 插件" \
#     --notes "本次发版说明" \
#     [--database "数据库变更说明"] \
#     [--retrospective "本版本复盘"]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

usage() {
  cat <<EOF
RELEASE_ACTOR=qa bash scripts/release-prod.sh <version> --scope "..." --notes "..." [--database "..."] [--retrospective "..."]
这是唯一正式发版入口,不允许手工改 VERSION / 手工打 tag 绕过。
EOF
  exit 1
}

if [[ "${RELEASE_ACTOR:-}" != "qa" ]]; then
  echo -e "${RED}[ERROR]${NC} 只有 RELEASE_ACTOR=qa 可执行正式发版。"; exit 1
fi

VERSION="${1:-}"; shift || true
[[ -z "$VERSION" ]] && usage
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${RED}[ERROR]${NC} 版本号格式错误: '$VERSION'"; exit 1
fi

SCOPE=""; NOTES=""; DATABASE="无结构变更。"; RETRO="本版本暂无复盘。"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope) SCOPE="${2:-}"; shift 2;;
    --notes) NOTES="${2:-}"; shift 2;;
    --database) DATABASE="${2:-}"; shift 2;;
    --retrospective|--retro) RETRO="${2:-}"; shift 2;;
    *) echo -e "${RED}[ERROR]${NC} 未知参数: $1"; usage;;
  esac
done
[[ -z "$SCOPE" || -z "$NOTES" ]] && { echo -e "${RED}[ERROR]${NC} --scope / --notes 必填"; usage; }

cd "$PROJECT_DIR"

# 1. 工作区必须干净
if [[ -n "$(git status --porcelain)" ]]; then
  echo -e "${RED}[ERROR]${NC} 工作区不干净,发版前请先提交或清理。"; git status --short; exit 1
fi

# 2. 红线只读卡点:确认插件无激活发送路径
if ! grep -q "send_runtime_v19:[[:space:]]*false" plugin/shared/constants.js; then
  echo -e "${RED}[ERROR]${NC} 红线检查失败:send_runtime_v19 默认值不是 false(疑似引入发送路径)。"; exit 1
fi

# 3. bump 版本并同步
bash scripts/bump-version.sh "$VERSION"

# 4. 构建插件 → 打包供下载 → 构建后台(版本号内联进产物)
npm run build:plugin
bash scripts/package-plugin.sh "$NOTES"
npm run build:admin
# 插件下载产物放进 admin/dist(生产容器把 admin/dist 挂为 /app/public,dashboard 从那读)
mkdir -p admin/dist/plugin-downloads
cp -f server/public/plugin-downloads/* admin/dist/plugin-downloads/ 2>/dev/null || true

# 5. 更新 CHANGELOG(在 marker 后插入新版本块)
DATE=$(date +%Y-%m-%d)
MARKER="<!-- NEW-RELEASE-ANCHOR -->"
ENTRY="## [$VERSION] - $DATE

- 范围: $SCOPE
- 说明: $NOTES
- 数据库: $DATABASE
- 复盘: $RETRO
"
if grep -q "$MARKER" CHANGELOG.md; then
  ENTRY="$ENTRY" node -e "
    const fs=require('fs');const m='$MARKER';
    let c=fs.readFileSync('CHANGELOG.md','utf8');
    c=c.replace(m, m+'\n\n'+process.env.ENTRY.trim());
    fs.writeFileSync('CHANGELOG.md',c);
  "
else
  echo -e "${YELLOW}[warn]${NC} CHANGELOG.md 未找到锚点,追加到文件末尾。"
  printf "\n%s\n" "$ENTRY" >> CHANGELOG.md
fi

# 6. 版本一致性校验
bash scripts/check-version.sh

# 7. 提交 + 打 tag
git add -A
git commit -m "chore: release v$VERSION"
git tag "v$VERSION"

echo ""
echo -e "${GREEN}发版准备完成: v$VERSION${NC}"
echo "下一步: git push && git push --tags,然后按 docs/ops/deploy.md 部署到生产。"
