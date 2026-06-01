#!/bin/bash
# chatsift 冒烟:验证服务端核心链路可用。发版前后跑,要求 FAIL=0。
# 用法:
#   API_BASE=https://admin.kongyuekeji.com QA_USERNAME=admin QA_PASSWORD=admin123 bash scripts/qa/smoke.sh
#   (本地:API_BASE=http://127.0.0.1:3100)
set -uo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:3100}"
QA_USERNAME="${QA_USERNAME:-admin}"
QA_PASSWORD="${QA_PASSWORD:-admin123}"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
PASS=0; FAIL=0

jqget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);const p='$1'.split('.').filter(Boolean);let v=o;for(const k of p)v=v&&v[k];console.log(v==null?'':v)}catch{console.log('')}})"; }

check() { # name expected actual
  if [[ "$2" == "$3" ]]; then echo -e "  ${GREEN}[PASS]${NC} $1"; PASS=$((PASS+1));
  else echo -e "  ${RED}[FAIL]${NC} $1 (期望 $2,实际 $3)"; FAIL=$((FAIL+1)); fi
}

echo "API_BASE=$API_BASE"
echo "------------------------------------"

# 1. 健康检查
H=$(curl -s "$API_BASE/api/health")
check "health code=0" "0" "$(echo "$H" | jqget code)"

# 2. 登录拿 token
LOGIN=$(curl -s -X POST "$API_BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$QA_USERNAME\",\"password\":\"$QA_PASSWORD\"}")
check "login code=0" "0" "$(echo "$LOGIN" | jqget code)"
TOKEN=$(echo "$LOGIN" | jqget data.token); [[ -z "$TOKEN" ]] && TOKEN=$(echo "$LOGIN" | jqget data.access_token)

# 3. 鉴权拦截:无 token 应 401
NOAUTH_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API_BASE/api/v1/conversations")
check "未授权拦截=401" "401" "$NOAUTH_CODE"

if [[ -n "$TOKEN" ]]; then
  AUTH=( -H "Authorization: Bearer $TOKEN" )
  # 4. 会话列表
  check "会话列表 code=0" "0" "$(curl -s "${AUTH[@]}" "$API_BASE/api/v1/conversations?page=1&page_size=1" | jqget code)"
  # 5. 运营漏斗
  check "运营漏斗 code=0" "0" "$(curl -s "${AUTH[@]}" "$API_BASE/api/v1/analytics/funnel" | jqget code)"
  # 6. 线索提醒接口
  check "线索提醒 code=0" "0" "$(curl -s "${AUTH[@]}" "$API_BASE/api/v1/leads/recent" | jqget code)"
else
  echo -e "  ${RED}[FAIL]${NC} 未拿到 token,跳过鉴权接口"; FAIL=$((FAIL+3))
fi

echo "------------------------------------"
echo -e "PASS=$PASS  FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
