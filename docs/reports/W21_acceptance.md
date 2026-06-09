---
文档: W21 辅助采集器 验收
版本: v1.0.0
周次: W21
落位: docs/reports/
状态: 本地实现+静态自测通过,**真机验收待 Chase**
身份: DEV / 分支: w21-assisted-collector(从 main 切,含 W20+W20.1;未 merge/未部署)
---

# W21 辅助采集器 验收

> 低频自动切换"当前客服页面"的可见未读会话,切换确认后显式触发一次采集。
> ★只切换不发送/不输入/不回复;只走 `adapter.switchSession()`;不改 W17 position/message_id;服从 W20 采集权 + 账号级 block;人工操作立即暂停。

## 1. 改动文件
| 文件 | 改动 |
|---|---|
| `plugin/runtime/assisted-collector.js`(新) | 辅助采集器:状态机 + 人工互锁 + 节流 + 候选重匹配 + W20 采集权/block 联动 |
| `plugin/runtime/legacy-collector.js` | 加安全 `collectNow()`(复用 collectMessageSession,★不改 position/message_id/occurred_at/契约) |
| `plugin/build.js` | content.js 接入 assisted-collector(顺序在 legacy 之后) |
| `plugin/content.js` | 重建(33 模块) |

## 2. 实现要点(对齐技术方案/tasks)
- **入口**:复用插件面板"客服配置-自动化配置-自动切换会话"开关 `auto_switch_session`,**默认 false**;**无第二个开关**;关闭 → 立即 `clearInterval` 停 timer + 中止本轮(storage.onChanged 联动)。开启日志含"低频自动切换、人工暂停、不承诺全量无漏"。
- **状态机**:disabled / idle / paused_by_human / scanning / cooldown / blocked_by_w20。
- **启动条件(全满足才扫)**:auto_switch_session + collector_v1_enabled + ContentGate.isAllowed + adapter==`douyin/private-message` + 有 account_biz_id + 最近人工>15min + 非 account-block + **W20 collect-permission allowed**。
- **候选**:`detectSessions()` → `unread_count>0 && dom_ref` → 按 unread 降序(稳定排序保 DOM 序) → **单轮≤5**;轮首只存稳定键(raw_id / nickname 兜底,**无 last_message_text 可用**),**不缓存 dom_ref**;每次切换前**重新 detectSessions + 按键重匹配**,找不到则跳过。
- **节流**:两次切换 ≥12s + 随机抖动(≤4s);单轮后冷却 ≥3min;单账号每分钟 ≤6 次。
- **切换**:只 `adapter.switchSession()`(其内部硬闸再校验开关 + 自身点击)→ `confirmActiveSession()` → 等 1.5s DOM 稳定 → `Legacy.collectNow()`(显式采集)。
- **人工互锁**:监听 mousemove/mousedown/keydown/wheel/focus → 更新 lastHumanActionAt;扫描中人工事件 → `_abortRound`,可中断 sleep 轮询(≤200ms 粒度,1s 内停)。
- **W20 联动**:collect-permission 非 allowed(not_collector/pending_owner/account_disabled/missing_account)→ 不切换(idle+原因日志);`Legacy.isBlocked()`(账号级 block)→ blocked_by_w20 停止;**不依赖 session 级冲突、不依赖 warn**。
- **日志**:运行态/暂停原因写 popup 消息日志(`[自动切换]: ...`,匹配 shouldShowRuntimeLog 白名单)。

## 3. 静态自测(Phase C1)✅
- `npm run build:plugin -- --check` → **语法通过**(33 模块,content.js 含 RpaAssistedCollector)。
- `node --check plugin/runtime/assisted-collector.js` → **通过**;legacy-collector 通过。
- `rg "sendReply|verifySent|simulateInput|textarea|contenteditable" assisted-collector.js` → **空**(无发送/输入实现)。
- `rg "simulateClick" assisted-collector.js` → **空**(不直接点击,只走 adapter.switchSession)。
- `git diff --check` → **净**。

## 4. 本地模拟(Phase C2,代码路径核对)
> 纯逻辑/闸门已按设计核对;**行为证据(DevTools/日志)属真机**(需浏览器 + 抖音页 + chrome API)。
- 默认 `auto_switch_session=false` → `_syncEnabled` 走 `_stopTimer`,无 timer、不扫描。
- 非目标页 / 非 douyin-private adapter / 无 account_biz_id → `_evaluateGates` 直接 DISABLED/IDLE,不切换。
- 关闭开关 → storage.onChanged → `_stopTimer('switch-off')` 清 timer + `_abortRound`。
- 候选 0 → 不动作;候选 >5 → `_planCandidates` 截断 5;候选键找不到 → 跳过不误点。
- account-block(`Legacy.isBlocked()`)→ blocked_by_w20,不切换。

## 5. ★真机待验清单(交 Chase,Phase C3/C4)
| # | 项 | 期望 |
|---|---|---|
| R1 | 抖音私信 3-5 个当前可见未读 | 可被低频切换,每个候选有采集触发/入库证据 |
| R2 | 连续切换 3 个候选 | 每个都有 `collectNow` 日志/入库;**legacy 10s debounce 不被反复重置导致漏采** |
| R3 | 人工 mouse/key/wheel/focus | 1s 内暂停(paused_by_human),日志可见 |
| R4 | 单账号多 tab | W20 账号级 block → blocked_by_w20,不切换(最早实例继续) |
| R5 | 非采集负责人账号 | collect-permission allowed=false → 不自动切换 |
| R6 | disabled 账号 | 不自动切换 |
| R7 | W17 回归 | 入库 position 连续、message_id/occurred_at 不因 W21 改变 |
| R8 | W20 回归 | batch 采集权拒仍生效;heartbeat account-block 仍生效;collect-permission 可用 |
| 调试 | 15min 阈值难等 | DevTools `RpaAssistedCollector._debugSetHumanIdleMs(5000)` 可临时降阈值验证;`RpaAssistedCollector.getState()` 看状态 |

## 6. W17/W20 红线复核 ✅
- **W17**:`collectNow()` 仅复用 `collectMessageSession()`,未改 `PositionTracker.assign()`/`Dom.synthMessageId`/position/message_id/occurred_at;assisted-collector 不碰位置链路。
- **W20**:assisted-collector **只读消费** collect-permission + `isBlocked()`;**不改 batch/collectGate**——最终采集权仍由 server batch 闸门强制(collectNow → collectMessageSession → events batch → gate)。不绕过。
- **只读**:无发送入口、无输入框选择器、不直接点击 DOM。

## 7. 已知风险
- **P-1 候选键无 last_message_text**:adapter session 仅 raw_id/nickname,候选键退化为 raw_id 主、nickname 兜底;nickname 兜底在重名时可能误匹配(技术方案 §6 已警)。真机记录误匹配。
- **P-2 collect-permission 每轮一次 HTTP**:网络失败 → allowed=false(保守不切换),不影响采集主链路。
- **P-3 账号级 block 依赖 legacy heartbeat 在跑**:assisted 复用 `Legacy.isBlocked()`,需 collector 已 start(心跳在发)。collector 未启动时 isBlocked=false,但此时 collect_v1 gate 也拦着不扫。
- **P-4 15min 阈值**:真机验收需降阈值(调试 API 已留)。

## 8. 扩展建议(抖音其他页面)
第一版仅 `douyin/private-message`。扩展到来客/飞鸽前需:① 对应 adapter 补齐 detectSessions/switchSession/confirmActiveSession + unread 识别;② W20 page_key 已覆盖(laike-message/feige);③ account_biz_id 在这些页是否恒有需确认(私信靠 URL accountId,来客/飞鸽口径不同)。建议私信试点真机稳定后再评估扩展。

## 9. 边界
未 merge、未部署、未碰 test/prod、未动 VERSION/CHANGELOG/tag。**自测通过,停下等 Chase 真机验收。**
