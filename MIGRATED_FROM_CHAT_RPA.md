# 迁移清单：从 chat_rpa 到 chatsift

> **PLACEHOLDER · 待补充权威清单**
> 本文件为 W0 阶段自动生成的迁移记录，**权威迁移清单（含 🟢/🟡 标注、改造细则、依赖关系）由项目方提供后替换**。
> 当前内容为 cc 在 W0 期间实际执行的 cp / sed 动作记录，可作为产出校验依据。

---

## 来源版本

- 仓库：chat_rpa
- HEAD：`4fe827e chore(test): mount migration_v20/v21 in docker-compose.test.yml`
- 迁移时间：2026-05-29
- 执行者：dev-agent (Claude Opus 4.7)

---

## 一、迁移文件清单

### 1.1 plugin/runtime/ — 🟢 直接复用（11 个）

| 文件 | 复用原因 |
|------|---------|
| adapter-registry.js | 平台适配器注册中心，V2.0 仍需此机制 |
| bug-dump.js | 9 分类快照工具，调试基础设施 |
| diff-engine.js | DOM diff 引擎，V2.0 仍用于增量识别 |
| lk-tracer.js | LK 诊断节点系统，V2.0 沿用 |
| recovery-manager.js | 状态恢复管理 |
| rpc-bridge.js | chrome.runtime onMessage RPC 桥接 |
| self-check.js | 自检 |
| session-detector.js | 会话检测 |
| session-identity-resolver.js | session_id 三级降级（L1/L2/L3） |
| session-parser.js | 会话解析 |
| chaos-monitor.js | 混沌注入监控（注：需手工去除 2 处 send 相关，本步骤记为 🟡） |

### 1.2 plugin/runtime/ — 🟡 整体复制 + 头部 TODO（7 个）

| 文件 | 改造方向（TODO） |
|------|----------------|
| batch-manager.js | 语义改为"批次→单次" |
| chaos-monitor.js | 删除 send 相关不变量 |
| feature-flags.js | 删除 3 个旧 flag，新增 2 个 |
| queue-manager.js | 调度语义改为"向上层" |
| runtime-manager.js | 删除 sendInBatch、状态机精简 |
| runtime-state-machine.js | 12 状态精简为 6 状态 |
| watchdog.js | 监控对象改为"单步卡死" |

### 1.3 plugin/adapters/douyin/ — 🟡（3 个）

| 文件 | 改造方向（TODO） |
|------|----------------|
| feige.adapter.js | 删除 prepareReply / sendReply，新增 toConversationEvent |
| laike-message.adapter.js | 同上 |
| private-message.adapter.js | 同上 |

### 1.4 server/src/ — 🟢 直接复用

| 类别 | 文件 |
|------|------|
| 中间件 | auth.js / permission.js / upload.js（如存在）|
| 路由 | auth / users / roles / menus / platforms / pages / plugins / configs / dashboard / logs / _chaos |
| controllers | 与路由对应（具体清单见实际执行日志） |

### 1.5 admin/src/ — 🟢 直接复用

| 类别 | 内容 |
|------|------|
| 入口 | package.json / vite.config.js / index.html / main.js / App.vue |
| router | index.js（带 TODO 头，W4 替换 V1.x 路由）|
| store / utils | 整体复用 |
| components | Layout.vue / SideMenu.vue |
| views | Login / Users / Roles / Menus / Platforms / Plugins / Dashboard |

### 1.6 plugin shared / build / manifest

| 文件 | 处理 |
|------|------|
| plugin/shared/dom-utils.js | 从 adapters/base/ 复制 |
| plugin/shared/adapter-helpers.js | 从 adapters/base/ 复制 |
| plugin/build.js | 复制 + 头部 TODO |
| plugin/manifest.json | **不复制**，按 V2.0 形态新写 |

### 1.7 scripts / deploy

| 类别 | 处理 |
|------|------|
| scripts/chaos/ | 复用 |
| scripts/smoke/ | 复用 |
| deploy/_reference/ | 仅留 V1.x compose 作为参考；V2.0 部署 W1+ 重设计 |

---

## 二、明确不迁移（保留在 chat_rpa）

| 文件 / 模块 | 原因 |
|-------------|------|
| plugin/content_legacy.js | V1.x 单体 content，V2.0 全新组织 |
| plugin/content.js | 同上 |
| server/src/routes/ai.js | 业务变化大，V2.0 重设计 |
| server/src/routes/knowledge.js | 同上 |
| server/src/routes/keywordReplies.js | 同上 |
| server/src/routes/batches.js | V2.0 不再有 batch 概念 |
| plugin/runtime/adapter-runtime.js | V2.0 不再走 V1.x adapter runtime |
| plugin/runtime/pre-check.js | V2.0 不再做发送前置检查 |
| plugin/runtime/send-confirm.js | V2.0 不再做发送确认 |
| server/sql/migration_v*.sql | V2.0 全新 schema |

---

## 三、待用户提供的权威版本

本文件标记为 PLACEHOLDER。正式权威清单需要包含：
1. 每个 🟡 文件的具体改造点（行号、函数名、删除/新增内容）
2. 依赖关系图（哪些文件可独立改造、哪些必须联动）
3. 验收标准（每个改造文件如何回归）

收到正式版后整体替换本文件。
