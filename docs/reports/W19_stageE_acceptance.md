# W19 阶段E 验收报告 — 隔离收口 + 清库重采 + 发版 v0.5.0

> 版本: v1.0.0　日期: 2026-06-07　身份: DEV(CC1 执行)　性质: 不可逆硬关卡(清库+发版)
> 依据: 2026-06-07_W19阶段E技术方案(简化版,Chase 审过)+ docs/ops/release.md + server-access.md。

## 0. 结论
**E1–E5 全部完成,W19 全程闭环、v0.5.0 上线 prod+test。** E5 经 Chase 真机重采 + 三类角色隔离最终验收**通过**(2026-06-07)。

## 1. E1 隔离收口 ✅
- dashboardController.stats 改平台级计数,移除 W19 前 data_scope/req.user.id 当 tenant 遗留;不动 utils/data-scope.js(plugin/logs 的 user 级授权)。
- grep 静态检查:v1 无裸 req.user.id 当 tenant(仅 employee_id);业务查询走 scope,配置/写入走两路口径。
- commit `9d16fe2`;dashboard 平台方无 500、scope 隔离断言完好。

## 2. E2 schema 迁移 ✅(test + prod)
- 部署口径核实:**/opt/chatsift 非 git 仓库 → 用 rsync**(E方案的 git pull 不成立;release.md=rsync 为准)。
- 产出 `deploy/w19_tenant_asset.sql`(给已有库,= server/sql/02_w19)。
- 顺序 w17 先 w19 后,经 SSH 管道灌入容器 mysql:
  - **test** chatsift_test:w17(position/segment_at)+ w19(三表/role_code/role_scope/user_type/service_account_id×6/page_key/menus)✅ 验证通过。
  - **prod** chatsift:迁移前 dump `/opt/chatsift/backups/chatsift_pre_w19_20260607_032322.sql`(160KB=数据极少,印证无真实数据);w17+w19 应用 ✅ 验证通过(roles=platform_admin/tenant_admin/agent、首页去重 /dashboard 仅 platform_admin)。

## 3. E3 清库 ✅(Chase 点 go)
- 环境三确认(VM-0-13-opencloudos / 124.222.146.193 / 库 chatsift)+ dump 安全网已留。
- TRUNCATE 业务表(analysis_jobs/messages/workorders/leads/conversations/employee_service_account/service_accounts):
  - prod chatsift:业务表合计 **0**;保留 users=3/roles=3/tenants=1(空月)/menus=32 ✅
  - test chatsift_test:业务表合计 **0**;保留 users=3/roles=3/tenants=1 ✅

## 4. E4 发版 v0.5.0 ✅
- merge `w19-tenant-asset-model`→main(无冲突,`042c889`);release commit `3659600`;VERSION 0.3.1→0.5.0 + sync 三件套 + check-version SYNCED(3 sql==3 挂载);CHANGELOG + PROJECT_STATUS 记录;tag `v0.5.0` push main+tag(`832bf30`)。
- 部署:定向 rsync(server/ + admin/dist/ + deploy/,排除 .env/data/node_modules/.git/pem;无 --delete;.env.production·data/mysql 完好)→ docker compose build server + up -d → 同步生产 VERSION 0.5.0。
- **冒烟全过**:
  - test 3101:health=200、新路由(/v1/home /tenants /service-accounts /roles/options)=401(挂载非404)、login=400、日志 running 无报错。
  - prod 3100:同上全过;**公网 admin.kongyuekeji.com + mychat.kongyuekeji.com /api/health=200**(经 nginx 端到端)。

## 5. E5 真机重采 + 隔离最终验收 ✅(Chase 真机,2026-06-07 通过)
- 插件 v0.5.0 下载(admin/mychat 登录后均可)→ serverUrl 指 prod → 真机重采 private-message(带 account_biz_id)。
- 三类角色真数据验收**通过**:internal 默认看不到 / 租户超管看本租户全部 / 客服只看分配账号(B2 自动绑定 + C3 手工分配);conversation_id 含 account_biz_id 跨账号不误并;position 去重。
- **W19 全程闭环。**

## 6. 凭据/安全
- 部署用私钥(本地持有,不入库);临时 key 副本(deploy 期间)已删。dump 在 prod `/opt/chatsift/backups/`。
- 部署口径 = **rsync**(server-access.md 的 rsync vs git pull 冲突,据实际 /opt/chatsift 非 git 仓库定为 rsync;建议回写 server-access.md/E方案 统一)。

**E1–E4 完成、test+prod 上线 v0.5.0。E5 待真机重采验收。**
