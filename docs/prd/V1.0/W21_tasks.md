# W21 Tasks: 辅助采集器

> 版本: v1.2.0
> 日期: 2026-06-09
> 状态: Draft  
> 输入: `W21_design.md` + `2026-06-08_W21技术方案.md`  
> 边界: 当前只出任务文档;W21 代码任务等 W20 E1/E2 验收、W20 merge 回 main 后执行

---

## 变更日志

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0.0 | 2026-06-08 | 初版:W21 辅助采集器任务拆解 |
| v1.1.0 | 2026-06-08 | 增补 P0 修正任务:legacy 10s debounce 采集触发、候选 DOM 重匹配、W20 依赖口径 |
| v1.2.0 | 2026-06-09 | 明确插件面板开关入口;同步 W20 账号级 block 实例冲突口径;移除 warn 依赖;补充 Phase B 实施顺序 |

## 0. 启动前置

W21 代码开工前必须满足:

- W20 E1 dev apply 通过。
- W20 E2 真机回归通过。
- W20 acceptance 已写。
- W20 分支已 merge 回 main。
- W20 heartbeat 账号级实例冲突 block 已通过 W20 merge 在 main 可用。
- W20 采集权只读能力已通过 W20 merge 在 main 可用;如需新增接口,归 W20 域完成,W21 只消费。
- 从最新 main 切 `w21-assisted-collector` 分支。

若上述任一不满足,W21 只能继续做文档/调研,不能写代码。

## Phase A — 只读调研与方案确认

### Task A1 PRD review

- 复审 W21 PRD 是否仍保持“显式授权低频辅助采集”。
- 确认不恢复 W18 夜间全自动巡检。
- 确认第一版只做抖音私信。

验收:

- `docs/research/2026-06-08_W21只读调研与PRD复审.md` 已落盘。
- 结论明确:W21 可做,但代码排在 W20 后。

### Task A2 当前插件能力盘点

盘点:

- `auto_switch_session`
- 插件面板“客服配置-自动化配置-自动切换会话”入口
- popup 开关
- `ChatsiftContentGate`
- `switchSession`
- `detectSessions`
- unread badge
- W20 heartbeat account/block 依赖点
- legacy collector 10 秒 debounce 与采集触发方式
- 候选 `dom_ref` 跨切换失效风险

验收:

- 现有能力/缺口清单完整。
- 标出哪些能复用,哪些需要新增。

### Task A3 技术方案

- 输出 W21 技术方案。
- 明确状态机、候选策略、人工互锁、W20 采集权检查、验收标准。

验收:

- `docs/research/2026-06-08_W21技术方案.md` 已落盘。
- 不含代码变更。

## Phase B — 本地插件最小实现

> Phase B 仅在 W20 merge 后执行。

### Task B0 开关入口确认

确认并复用现有入口:

```text
插件面板 -> 客服配置 -> 自动化配置 -> 自动切换会话
```

要求:

- 不新增第二个 W21 开关。
- 默认值保持 `auto_switch_session=false`。
- 用户关闭后立即停止 assisted collector 的 timer 和本轮调度。
- 开启提示必须说明“会低频自动切换当前客服页面会话,人工操作时会暂停”。

验收:

- 页面刷新、插件重启后默认不自动开启。
- 关闭开关后不再调用 `switchSession()`。
- 开关文案不承诺全量无漏。

### Task B1 新增 assisted collector 模块

新增:

```text
plugin/runtime/assisted-collector.js
```

职责:

- 读取 `auto_switch_session`
- 检查 `ChatsiftContentGate`
- 解析当前 adapter
- 维护状态机
- 管理 timer

验收:

- 默认关闭时不启动。
- 非目标页面不启动。
- `node --check plugin/runtime/assisted-collector.js` 通过。

### Task B1.5 legacy 立即采集入口

> 仅在 W20 merge 后执行。该任务触碰 legacy collector,必须小改、单独验收。

实现二选一:

- 推荐:在 `RpaLegacyCollector` 暴露 `collectNow()` 安全入口,内部复用现有 `collectMessageSession()`。
- 备选:W21 每个候选停留至少 12 秒,通过日志确认 legacy debounce 已 fire。

验收:

- 推荐方案下,`collectNow()` 不改 position/message_id/occurred_at。
- 连续切换 3 个候选,每个候选都能触发采集。
- 若采用备选方案,必须证明 10 秒 debounce 没被下一次切换重置。

### Task B2 人工互锁

实现:

- 监听鼠标/键盘/wheel/focus。
- 记录 `lastHumanActionAt`。
- scanning 中检测到人工操作立即暂停。

验收:

- 人工事件后 1 秒内停止切换。
- 15 分钟阈值可配置常量。
- 关闭开关立即清 timer。

### Task B3 候选会话调度

实现:

- 调用 `adapter.detectSessions()`。
- 只取 `unread_count > 0` 且有 `dom_ref` 的当前可见候选。
- 单轮最多 5 个。
- 两次切换间隔不低于 12 秒,再叠加随机抖动。
- 单轮后冷却 3 分钟。
- 轮首只记录候选稳定键,不跨候选复用缓存的 `dom_ref`。
- 每次切换前重新 `detectSessions()`,按稳定键重匹配当前 DOM 节点。

验收:

- 候选 0 个时不动作。
- 候选 >5 个时只处理 5 个。
- 不滚动会话列表。
- 列表重渲染后不会点击旧 `dom_ref`。
- 找不到候选新节点时跳过,不误点。

### Task B4 通过 adapter 切换

实现:

- 只能调用 `adapter.switchSession(session)`。
- 不直接调用 `Dom.simulateClick`。
- 切换后调用 `adapter.confirmActiveSession(session)`。
- 切换确认后调用 `collectNow()` 或停留至少 12 秒等待 legacy debounce 完成。

验收:

- `auto_switch_session=false` 时返回 `auto-switch-disabled`。
- `switch-timeout` 只记录,不重试刷屏。
- 静态 grep 确认 assisted collector 不直接调用 `simulateClick`。
- 不能只等待 3 秒就切下一个候选。

### Task B5 W20 状态联动

接入:

- account block:停止调度。
- 采集权不可用:不自动切换。
- disabled:不自动切换。

验收:

- 非采集负责人不切换。
- disabled 不切换。
- block 不切换。
- 不依赖 session 级冲突。
- 不依赖 warn。

## Phase C — 验收与真机回归

### Task C1 静态安全检查

命令:

```bash
npm run build:plugin -- --check
node --check plugin/runtime/assisted-collector.js
rg "sendReply|verifySent|simulateInput" plugin/runtime/assisted-collector.js
rg "simulateClick" plugin/runtime/assisted-collector.js
```

通过标准:

- build 通过。
- 无发送/输入实现。
- assisted collector 不直接 simulateClick。

### Task C2 本地模拟检查

覆盖:

- 默认关闭。
- 非目标页面。
- 人工操作暂停。
- 候选限量。
- account block。

通过标准:

- 每项有日志或 DevTools 观测证据。

### Task C3 抖音私信真机

覆盖:

- 单账号单浏览器。
- 单账号多 tab。
- 两员工账号采集权冲突。
- 人工介入暂停。
- disabled 账号。

通过标准:

- 可低频切换 3-5 个当前可见未读候选。
- 消息可入库。
- 非负责人/disabled 不自动切换。
- 人工操作立即暂停。

### Task C4 W17/W20 回归

验证:

- W17 position/message_id/occurred_at 不变。
- W20 batch 采集权拒绝仍生效。
- W20 heartbeat account/block 仍生效。
- W21 依赖的 W20 采集权只读能力可用。

通过标准:

- 采集事件入库后 position 连续。
- message_id 不因 W21 改变。
- 非采集负责人 event rejected。
- 连续切换不会让 legacy debounce 一直重置导致漏采。

## Phase D — Acceptance

输出:

```text
docs/reports/W21_acceptance.md
```

必须包含:

- 静态检查结果。
- 本地模拟结果。
- 真机截图/日志/SQL 证据。
- W17/W20 红线复核。
- 是否允许扩展到抖音其他页面的建议。

## 不做清单

- 不做凌晨回扫。
- 不做全量红点队列。
- 不做深度滚动会话列表。
- 不做跨平台通用。
- 不新增发送入口。
- 不在 W20 未合并前写代码。
