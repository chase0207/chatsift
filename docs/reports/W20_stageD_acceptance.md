---
文档: W20 阶段D 验收(采集实例冲突检测)— 草稿,待 Chase 审
版本: v1.0.0
周次: W20
落位: docs/reports/
状态: Draft(夜间无人值守产出)
身份: DEV(CC4) / 环境: 本地 worktree / 分支: w20-account-governance
---

# W20 阶段D 验收 — 采集实例冲突检测

> 依据:技术方案 v1.3 §2.5/§6 / W20_tasks 阶段D / PRD §6。

## 1. 做了什么
| 子项 | 落点 | 状态 |
|---|---|---|
| **D2 server heartbeat** 冲突检测(空壳→实现) | `eventsController.heartbeat` | ✅ 实现 + 自测 |
| upsert collect_instances(uk=tenant+collector_instance_id,刷新 last_seen + 当前 account/conv) | 同上 | ✅ |
| 会话级命中(同 account_biz_id+conversation_id,60s 窗口,排除自身)→ block + audit instance_conflict | 同上 | ✅ |
| 账号级命中(同 account_biz_id 不同会话)→ warn | 同上 | ✅ |
| **D1 插件实例标识** device_id/browser_profile_id(chrome.storage 持久)/tab_id(sessionStorage)/collector_instance_id=hash(三者) | `plugin/runtime/instance-identity.js`(新) | ✅ 代码 + content.js 重建 |
| batch 上报透传实例标识(§2.5) | `plugin/runtime/event-uploader.js` | ✅ |
| heartbeat 发送 API `sendHeartbeat(context)` 返回 {conflict,action} | `instance-identity.js` | ✅ |
| build 接线 + content.js 重建(32 模块,语法通过) | `plugin/build.js` / `content.js` | ✅ |

## 2. 本地自测(server heartbeat,直连函数 × fresh 库,12/12 PASS)
| 场景 | 断言 |
|---|---|
| D-S1 I1 首个 hb(acc_A,conv_1) | 无冲突;collect_instances 1 行 |
| D-S2 I2 同 acc_A 同 conv_1 | **conflict=session, action=block** + audit instance_conflict |
| D-S3 I2 切 acc_A conv_2 | **conflict=account, action=warn**;audit 不增(warn 不审计,遵 §6) |
| D-S4 I1 再 hb | uk_instance 幂等,仍 1 行;总 2 实例 |
| D-S5 I1 last_seen 120s 前 | 窗口外 → I2 无冲突(60s 窗口生效) |
| D-S6 无 collector_instance_id | 仅基础响应(向后兼容旧插件) |
| D-S7 无 account_biz_id | upsert 但不判冲突 |

复跑:`cd server && NODE_PATH=<root>/node_modules node /tmp/w20_stageD_test.js`(harness 在 /tmp,未入库)。

## 3. 契约 diff
- `POST /api/v1/events/heartbeat` 请求体新增可选:`collector_instance_id/device_id/browser_profile_id/tab_id/platform/platform_page/account_biz_id/conversation_id`;响应新增 `conflict`('session'|'account'|null) + `action`('block'|'warn'|null)。**无 collector_instance_id 时维持旧响应**(server_time/config_version),旧插件不受影响。
- `POST /api/v1/events/batch` 请求体可带实例标识(透传,server 当前忽略,留后用)。

## 4. ★阶段边界(D1 插件 vs Stage E,红线考量)
**已落地(纯加法,不改既有采集行为)**:实例标识生成/持久化、batch 透传、heartbeat 发送 API、content.js 重建。
**留 Stage E(真机,Chase)——夜间不接线**:
1. **周期 heartbeat 调度入实时采集循环**:需绑定当前会话的 account_biz_id/conversation_id(来自 session-detector 实时态),且只有真机能验证读到正确上下文。
2. **block/warn 强制执行(停采/强提醒 UI)**:`action='block'` 触发"停该 tab 采集"是有副作用的控制动作;**误接线可能停掉合法采集**(触"别破坏正在跑的插件")。
→ 故夜间只提供 `RpaInstanceIdentity.sendHeartbeat()` + getIdentity() API 与 server 闭环,**调度与停采执行留真机 Stage E 接线验证**。server 侧冲突判定已完整可用。

## 5. 红线复核
- W17:position/message_id/段时间 **未动**(heartbeat 与消息入库无关;插件改动只在上报链路加实例标识,不碰 position-tracker/采集去重)。
- W19:资产模型未破坏。
- 只读:实例标识仅随机指纹 + 采集维度,无发送入口(红线 R4)。

## 6. 待 Chase 决策点(本阶段)
- **Q-D1(warn 是否审计)**:当前仅 session-block 写 audit instance_conflict(遵 §6);account-warn 不审计(避免双 tab 看同账号不同会话高频刷 audit)。conflicts() 管理端因此只列 block 冲突。如需 warn 也入审计,提示我加。
- **Q-D2(heartbeat 窗口 60s)**:活跃判定窗口硬编码 60s(`HEARTBEAT_WINDOW_SECONDS`)。是否需可配/调整由 Chase 定。
- **Q-D3(D1 接线归属)**:周期心跳调度 + block/warn 停采执行确认放 Stage E 真机(本报告 §4)。如 Chase 希望夜间先接一个"只提醒不停采"的保守版,可议;但"停采"动作建议真机验证。
