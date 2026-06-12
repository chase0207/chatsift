#!/bin/bash
# 统一发布入口(v0.6.6 发布隔离机制)。test/prod 全链路目录写死,带 guard 防跨环境误写。
#
# 用法:
#   CHATSIFT_SSH_KEY=/path/to/key.pem bash scripts/release.sh --env test [--version 0.6.6] [--notes "..."]
#   bash scripts/release.sh --env prod --dry-run        # 只打印计划,不连服务器
#
# 设计原则(对应任务单 §2.4 / §4.5):
#   - test 发布路径写死 /opt/chatsift-test/*, prod 写死 /opt/chatsift/*。
#   - test 脚本不得写 prod 目录;prod 脚本不得引用 test 目录(内置 guard)。
#   - 执行前打印计划(env/host/目录/compose/metadata/容器)并要求确认或 --dry-run。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
GREEN='\033[0;32m'; RED='\033[0;31m'; YEL='\033[0;33m'; NC='\033[0m'
die() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

ENV=""; VERSION_ARG=""; DRY=0; NOTES=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)     ENV="${2:-}"; shift 2 ;;
    --version) VERSION_ARG="${2:-}"; shift 2 ;;
    --notes)   NOTES="${2:-}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    *) die "未知参数: $1" ;;
  esac
done
[[ "$ENV" == "test" || "$ENV" == "prod" ]] || die "必须 --env test|prod"

cd "$PROJECT_DIR"
VERSION="${VERSION_ARG:-$(tr -d '[:space:]' < VERSION 2>/dev/null || echo "")}"
[[ -n "$VERSION" ]] || die "缺少 VERSION(用 --version 或 VERSION 文件)"

REMOTE_HOST="${CHATSIFT_DEPLOY_HOST:-root@124.222.146.193}"
REMOTE_DEPLOY="/opt/chatsift/deploy"   # compose 文件与 .env.* 所在(test/prod 共用此目录,仅作配置入口)

if [[ "$ENV" == "prod" ]]; then
  ADMIN_DIST_DIR="/opt/chatsift/admin/dist"
  PLUGIN_DIR="/opt/chatsift/plugin-downloads"
  SERVER_DIR="/opt/chatsift/server"
  COMPOSE_FILE="docker-compose.prod.yml"
  ENV_FILE=".env.production"
  SERVER_SERVICE="server"
  SERVER_CONTAINER="chatsift-server"
  PORT=3100
else
  ADMIN_DIST_DIR="/opt/chatsift-test/admin/dist"
  PLUGIN_DIR="/opt/chatsift-test/plugin-downloads"
  SERVER_DIR="/opt/chatsift-test/server"
  COMPOSE_FILE="docker-compose.test.yml"
  ENV_FILE=".env.test"
  SERVER_SERVICE="server-test"
  SERVER_CONTAINER="chatsift-server-test"
  PORT=3101
fi

# ---- guard: 跨环境写入防护 ----
for p in "$ADMIN_DIST_DIR" "$PLUGIN_DIR" "$SERVER_DIR"; do
  if [[ "$ENV" == "test" ]]; then
    case "$p" in /opt/chatsift/*) die "GUARD: --env test 的目标含 prod 路径: $p" ;; esac
  else
    case "$p" in /opt/chatsift-test*) die "GUARD: --env prod 的目标引用 test 路径: $p" ;; esac
  fi
done

# ---- 计划打印 ----
echo -e "${GREEN}== chatsift release plan ==${NC}"
cat <<PLAN
  env:        $ENV
  host:       $REMOTE_HOST
  version:    $VERSION
  admin dist: $ADMIN_DIST_DIR
  plugin dir: $PLUGIN_DIR   (metadata: $PLUGIN_DIR/metadata.json)
  server dir: $SERVER_DIR
  compose:    $REMOTE_DEPLOY/$COMPOSE_FILE   (--env-file $ENV_FILE)
  container:  $SERVER_CONTAINER  (service $SERVER_SERVICE, port $PORT)
PLAN

if [[ "$DRY" == "1" ]]; then
  echo -e "${YEL}[dry-run]${NC} 仅打印计划,不连服务器、不构建、不部署。"
  exit 0
fi

[[ -n "${CHATSIFT_SSH_KEY:-}" && -f "${CHATSIFT_SSH_KEY}" ]] || die "需设置 CHATSIFT_SSH_KEY=可用的 .pem 路径"
RSH="ssh -i ${CHATSIFT_SSH_KEY} -o IdentitiesOnly=yes -o ConnectTimeout=20"

if [[ "${CHATSIFT_RELEASE_YES:-}" == "1" ]]; then
  echo "(CHATSIFT_RELEASE_YES=1 → 跳过交互确认)"
else
  read -r -p "确认部署到 [$ENV] $REMOTE_HOST ? [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "已取消"; exit 1; }
fi

# ---- 本地构建 ----
echo -e "${GREEN}[1/5]${NC} build admin"
( cd "$PROJECT_DIR/admin" && npm run build >/dev/null )
echo -e "${GREEN}[2/5]${NC} package plugin v${VERSION} → 独立输出目录"
BUILD_TMP="$(mktemp -d)/plugin-downloads"
bash "$SCRIPT_DIR/package-plugin.sh" --out "$BUILD_TMP" --version "$VERSION" "${NOTES:-release v${VERSION} ($ENV)}"

# ---- 同步到对应环境(写死路径, 与 guard 一致) ----
echo -e "${GREEN}[3/5]${NC} rsync → $ENV"
rsync -az -e "$RSH" "$PROJECT_DIR/admin/dist/"  "$REMOTE_HOST:$ADMIN_DIST_DIR/"
rsync -az -e "$RSH" --exclude=node_modules --exclude='.env' --exclude='.env.*' \
      --exclude='public/plugin-downloads' "$PROJECT_DIR/server/"  "$REMOTE_HOST:$SERVER_DIR/"
rsync -az -e "$RSH" "$BUILD_TMP/"  "$REMOTE_HOST:$PLUGIN_DIR/"
rsync -az -e "$RSH" "$PROJECT_DIR/deploy/$COMPOSE_FILE"  "$REMOTE_HOST:$REMOTE_DEPLOY/$COMPOSE_FILE"

# ---- 重建对应环境 server(只动本环境, --no-deps 不碰 mysql) ----
echo -e "${GREEN}[4/5]${NC} 重建 $SERVER_CONTAINER"
$RSH "$REMOTE_HOST" "cd $REMOTE_DEPLOY && docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d --no-deps --build $SERVER_SERVICE"

# ---- 冒烟 ----
echo -e "${GREEN}[5/5]${NC} 冒烟"
$RSH "$REMOTE_HOST" "
  echo -n 'health: '; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:$PORT/api/health
  echo -n 'metadata: '; curl -s http://127.0.0.1:$PORT/plugin-downloads/metadata.json | grep -o '\"version\"[^,]*' | head -1
"
echo -e "${GREEN}[OK]${NC} $ENV 发布完成 v${VERSION}"
