# W21 Tasks: 辅助采集器

> 版本: v1.0.0  
> 日期: 2026-06-08  
> 状态: Draft  
> 输入: `W21_design.md` + `2026-06-08_W21技术方案.md`  
> 边界: 当前只出任务文档;W21 代码任务等 W20 E1/E2 验收、W20 merge 回 main 后执行

---

## 0. 启动前置

W21 代码开工前必须满足:

- W20 E1 dev apply 通过。
- W20 E2 真机回归通过。
- W20 acceptance 已写。
- W20 分支已 merge 回 main。
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
- popup 开关
- `ChatsiftContentGate`
- `switchSession`
- `detectSessions`
- unread badge
- W20 heartbeat/block 依赖点

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
- 两次切换随机 5-12 秒。
- 单轮后冷却 3 分钟。

验收:

- 候选 0 个时不动作。
- 候选 >5 个时只处理 5 个。
- 不滚动会话列表。

### Task B4 通过 adapter 切换

实现:

- 只能调用 `adapter.switchSession(session)`。
- 不直接调用 `Dom.simulateClick`。
- 切换后调用 `adapter.confirmActiveSession(session)`。

验收:

- `auto_switch_session=false` 时返回 `auto-switch-disabled`。
- `switch-timeout` 只记录,不重试刷屏。
- 静态 grep 确认 assisted collector 不直接调用 `simulateClick`。

### Task B5 W20 状态联动

接入:

- session block:停止调度。
- account warn:暂停当前轮,不停 legacy 采集。
- 采集权不可用:不自动切换。

验收:

- 非采集负责人不切换。
- disabled 不切换。
- block 不切换。
- warn 不继续本轮自动切换。

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
- block/warn。

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
- W20 heartbeat block/warn 仍生效。

通过标准:

- 采集事件入库后 position 连续。
- message_id 不因 W21 改变。
- 非采集负责人 event rejected。

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

