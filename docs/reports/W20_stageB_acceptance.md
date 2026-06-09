---
文档: W20 阶段B 验收(首见 + 确认)— 草稿,待 Chase 审
版本: v1.0.0
周次: W20
落位: docs/reports/
状态: Draft(夜间无人值守产出)
身份: DEV(CC4) / 环境: 本地 worktree / 分支: w20-account-governance
---

# W20 阶段B 验收 — 首见 + 确认

> 依据:技术方案 v1.3 §3.1/§5 / W20_tasks 阶段B。

## 1. 做了什么
| 项 | 落点 |
|---|---|
| `resolveServiceAccount` 替 `resolveServiceAccountId`,返回完整状态 `{id,lifecycle,collector_id,collector_kind,created}` | `eventsController.js` |
| 首见(uk_account 未命中)→ 建 pending + 临时采集权(本员工 collector_kind=temp)+ view 行(granted_by=NULL)+ audit first_seen/temp_grant | 同上 |
| 命中既有 → 返回该行 created=false;★并发首见撞 uk_account → 捕获 FOR UPDATE 改查命中行返回 | 同上 |
| audit 写入 helper(两 controller 共用) | `server/src/utils/account-audit.js`(新) |
| `POST /:id/confirm {collector_id?, viewer_ids?}` pending→active、formal、确保 collector view 行、配查看人、audit confirm | `serviceAccountController.js` + 路由 |
| home 待确认待办(仅 tenant_admin):count + 列表(first_seen_by 姓名/首见时间/建议采集人) | `homeController.js` |

★**分阶段纪律**:阶段B **不做采集权拒绝闸门**(留 C1),仍全量入库;**保留 `autoBindAgent`(esa 双写)+ `_shared` 仍读 esa**,可见性不变 → 阶段B 不破坏现有隔离。esa 摘除 + _shared 改读 view 原子地放到阶段C。

## 2. 本地自测(直连 controller 函数 × 独立 fresh 库,25/25 PASS)
| 场景 | 断言 |
|---|---|
| S1 agent1 首见 acc_A | created=true / pending / collector=agent1 temp;SA 行 first_seen_by 对;view 1 行 granted_by=NULL;audit first_seen+temp_grant |
| S2 agent1 再采 acc_A | created=false 同 id;view 仍 1 行、audit 仍 2 行(**幂等不重复**) |
| S3 agent2 首见 acc_B | created=true collector=agent2 |
| S4 home(ta) | pending_accounts.count=2;acc_A first_seen_by_name=agent1、建议采集人=agent1 |
| S5 confirm(ta) acc_A viewer=[agent2] | active / formal / collector=agent1;view 2 行 {agent1(系统NULL)、agent2(ta 授)};audit confirm 1 条 |
| S6 再 confirm acc_A | 400 非待确认 |
| S7 confirm collector=internal admin | 400(只能指派本租户 agent) |
| S8 home(ta) confirm 后 | pending 减为 1 |

复跑:`cd server && NODE_PATH=<root>/node_modules node /tmp/w20_stageB_test.js`(harness 在 /tmp,未入库)。

## 3. 契约 diff(本阶段对外可见变化)
- `POST /api/service-accounts/:id/confirm`(新)。
- `GET /api/v1/home` 响应新增 `pending_accounts`(tenant_admin 非空,其余 null)。
- 采集入库 `POST /api/v1/events/batch` 行为对插件**暂无可见变化**(仍全量入库,首见多写治理行)。

## 4. 红线复核
- W17 position/message_id/段时间未动(batch 入库 SQL 未改 message 写法)。
- W19 资产模型未破坏(esa 仍双写、_shared 仍读 esa,本阶段隔离口径不变)。
- 只读:confirm/home 均为后台读写治理元数据,无消息发送入口。

## 5. 待 Chase 决策点(本阶段)
- **Q-B1(确认权限)**:confirm 走 `service-account:update`(tenant_admin)。internal 平台管理员(is_super)也可调用——是否允许平台方代确认租户账号?当前放行(平台全权),如需禁止再加 denyInternal。
- **Q-B2(confirm 幂等)**:当前仅 pending 可 confirm,重复 confirm 返回 400。如需"已 active 也可改采集人",应走 `PUT /:id/collector`(阶段C),不复用 confirm。
- **Q-B3(并发首见)**:FOR UPDATE 回查为最新已提交行;真并发未在夜间做多进程压测,建议阶段E 真机/压测复核(逻辑已就位)。
