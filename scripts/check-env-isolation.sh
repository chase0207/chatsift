#!/bin/bash
# 只读核验 test/prod 环境隔离矩阵(v0.6.6)。不改任何东西,只 SSH 读取并比对。
# 用法: CHATSIFT_SSH_KEY=/path/key.pem bash scripts/check-env-isolation.sh
set -uo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YEL='\033[0;33m'; NC='\033[0m'
REMOTE_HOST="${CHATSIFT_DEPLOY_HOST:-root@124.222.146.193}"
[[ -n "${CHATSIFT_SSH_KEY:-}" && -f "${CHATSIFT_SSH_KEY}" ]] || { echo -e "${RED}需 CHATSIFT_SSH_KEY=可用 .pem${NC}"; exit 1; }
SSH="ssh -i ${CHATSIFT_SSH_KEY} -o IdentitiesOnly=yes -o ConnectTimeout=20 $REMOTE_HOST"

pass=0; fail=0
chk() { # chk "维度" "prod值" "test值" "want-different|want-3100-3101"
  local name="$1" a="$2" b="$3" mode="${4:-diff}"
  local ok=1
  case "$mode" in
    diff) [[ -n "$a" && -n "$b" && "$a" != "$b" ]] || ok=0 ;;
    test_isolated) case "$b" in *chatsift-test*|*chatsift_test*) ok=1 ;; *) ok=0 ;; esac ;;
  esac
  if [[ $ok == 1 ]]; then echo -e "  ${GREEN}PASS${NC} $name"; pass=$((pass+1)); else echo -e "  ${RED}FAIL${NC} $name"; fail=$((fail+1)); fi
  echo "        prod: $a"
  echo "        test: $b"
}

mount_src() { $SSH "docker inspect $1 --format '{{range .Mounts}}{{if eq .Destination \"$2\"}}{{.Source}}{{end}}{{end}}'" 2>/dev/null; }
env_of()    { $SSH "docker inspect $1 --format '{{range .Config.Env}}{{println .}}{{end}}'" 2>/dev/null | grep "^$2=" | head -1 | sed "s/^$2=//"; }
# JWT_SECRET 全程在服务器端 hash, 明文不回传本地(只取 sha256 前12位用于比对)
jwt_hash()  { $SSH "docker inspect $1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^JWT_SECRET=' | head -1 | sed 's/^JWT_SECRET=//' | sha256sum | cut -c1-12" 2>/dev/null; }
meta_ver()  { $SSH "curl -s http://127.0.0.1:$1/plugin-downloads/metadata.json | grep -o '\"version\"[^,]*' | head -1" 2>/dev/null; }

echo "== chatsift test/prod 隔离矩阵 (只读) =="
chk "/app/public 挂载源"        "$(mount_src chatsift-server /app/public)"            "$(mount_src chatsift-server-test /app/public)"
chk "plugin-downloads 挂载源"   "$(mount_src chatsift-server /app/plugin-downloads)"  "$(mount_src chatsift-server-test /app/plugin-downloads)"
chk "PLUGIN_DOWNLOAD_DIR"       "$(env_of chatsift-server PLUGIN_DOWNLOAD_DIR)"       "$(env_of chatsift-server-test PLUGIN_DOWNLOAD_DIR)"
chk "DB_NAME"                   "$(env_of chatsift-server DB_NAME)"                   "$(env_of chatsift-server-test DB_NAME)"
chk "DB_HOST"                   "$(env_of chatsift-server DB_HOST)"                   "$(env_of chatsift-server-test DB_HOST)"
chk "JWT_SECRET(sha256 前12)"   "$(jwt_hash chatsift-server)"                         "$(jwt_hash chatsift-server-test)"
chk "mysql 数据卷"              "$(mount_src chatsift-mysql /var/lib/mysql)"          "$(mount_src chatsift-mysql-test /var/lib/mysql)"
chk "metadata 版本(可不同)"     "$(meta_ver 3100)"                                    "$(meta_ver 3101)"

echo
if [[ $fail == 0 ]]; then echo -e "${GREEN}全部 PASS ($pass)${NC}"; else echo -e "${RED}$fail 项 FAIL / $pass 项 PASS${NC} —— 见 Stop Gate"; fi
exit $fail
