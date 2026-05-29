# MIGRATED FROM chat_rpa

> 本文件记录从 chat_rpa 项目迁移到 chatsift 的代码，作为复用代码的"出生证明"。
>
> **原则**：迁移后独立维护，chat_rpa 后续更新不再同步过来。
> **基线**：chat_rpa commit `4fe827e`（2026-05-29），tag `v1.9.0-pre`。

---

## 迁移分类

| 标记 | 含义 |
|---|---|
| 🟢 直接复用 | 拷贝后零修改，作为基础设施使用 |
| 🟡 改造复用 | 拷贝后需要语义改造（主要是发送相关 → 采集相关） |
| 🔵 参考保留 | 拷贝过来但不直接用，作为实现参考 |
| ⛔ 不迁移 | chat_rpa 中存在但 chatsift 不需要 |

---

## 一、文件级迁移清单

### 1.1 plugin/runtime/ 模块

来自 `chat_rpa/plugin/runtime/`，共 20 个文件，3640 行。chatsift 迁移结果：

| 文件 | 处置 | 行数 | 迁移后路径 | 备注 |
|---|---|---:|---|---|
| adapter-registry.js | 🟢 | 169 | plugin/runtime/adapter-registry.js | 注册中心，直接复用 |
| adapter-runtime.js | ⛔ | 57 | — | legacy 残留，与 adapter-registry 重叠，不迁移 |
| batch-manager.js | 🟡 | 397 | plugin/runtime/batch-manager.js | 语义改为"批次上报"，删除批量发送相关代码 |
| bug-dump.js | 🟢 | 229 | plugin/runtime/bug-dump.js | QA 工具，直接复用 |
| chaos-monitor.js | 🟡 | 284 | plugin/runtime/chaos-monitor.js | 6 条不变量保留，改 2 条为"采集"相关 |
| diff-engine.js | 🟢 | 84 | plugin/runtime/diff-engine.js | 新消息判定，直接复用 |
| feature-flags.js | 🟡 | 68 | plugin/runtime/feature-flags.js | 3 个旧 flag 删除，加 2 个新 flag（collector_v2、scoped_dom） |
| lk-tracer.js | 🟢 | 174 | plugin/runtime/lk-tracer.js | LK 日志上报，直接复用 |
| pre-check.js | ⛔ | 91 | — | 发送前门禁，不迁移 |
| queue-manager.js | 🟡 | 233 | plugin/runtime/queue-manager.js | 调度器，语义改为"向上报"调度 |
| recovery-manager.js | 🟢 | 145 | plugin/runtime/recovery-manager.js | reload 恢复，直接复用 |
| rpc-bridge.js | 🟢 | 122 | plugin/runtime/rpc-bridge.js | DevTools 调试，直接复用 |
| runtime-manager.js | 🟡 | 455 | plugin/runtime/runtime-manager.js | 删除 sendInBatch（L313），状态机精简 |
| runtime-state-machine.js | 🟡 | 79 | plugin/runtime/runtime-state-machine.js | 12 状态精简为 6 状态 |
| self-check.js | 🟢 | 360 | plugin/runtime/self-check.js | 链路验证，改 4 个 case |
| send-confirm.js | ⛔ | 130 | — | 发送确认，不迁移 |
| session-detector.js | 🟢 | 110 | plugin/runtime/session-detector.js | M1 检测入口，直接复用 |
| session-identity-resolver.js | 🟢 | 206 | plugin/runtime/session-identity-resolver.js | ADR-005，直接复用 |
| session-parser.js | 🟢 | 100 | plugin/runtime/session-parser.js | DOM → SessionSnapshot，直接复用 |
| watchdog.js | 🟡 | 147 | plugin/runtime/watchdog.js | 监控对象改为"上报卡死" |

**统计**：🟢 11 个 / 🟡 6 个 / ⛔ 3 个 / 共迁移 17 个文件。约 3400 行。

### 1.2 plugin/adapters/douyin/ 适配器

| 文件 | 处置 | 行数 | 迁移后路径 | 备注 |
|---|---|---:|---|---|
| feige.adapter.js | 🟡 | 195 | plugin/adapters/douyin/feige.adapter.js | 删除 prepareReply / sendReply，新增 toConversationEvent |
| laike-message.adapter.js | 🟡 | 319 | plugin/adapters/douyin/laike-message.adapter.js | 同上 |
| private-message.adapter.js | 🟡 | 260 | plugin/adapters/douyin/private-message.adapter.js | 同上 |

**统计**：3 个文件全部改造迁移，约 770 行。

### 1.3 plugin/content_legacy.js

⛔ **不整体迁移**。按 `docs/prd/V2.0/runtime-disposition.md` 第 2 节，只迁移以下函数到 `plugin/runtime/legacy-collector.js`：

| 行号区间 | 内容 | 迁移后位置 |
|---|---|---|
| 63-119 | DOM 工具（simulateInput* / simulateClick* / scrollToBottom / sleep） | plugin/shared/dom-utils.js |
| 252-346 | 平台 / 页面识别 | plugin/shared/platform-detector.js |
| 354-462 | frame 路由 | plugin/runtime/frame-router.js |
| 748-831 | 去重 + 持久化 | plugin/runtime/dedup.js |
| 1000-1106 | 指纹处理 | plugin/runtime/fingerprint.js |
| 1340-1454 | 消息收集 | plugin/runtime/legacy-collector.js |

**不迁移**：decideReply / decideReplyMulti / sendReply / processMessageSession / showNewMessageBox 浮窗 / 统计 / 右键设置等。

---

## 二、服务端迁移清单

### 2.1 server/src/routes/

| 文件 | 处置 | 备注 |
|---|---|---|
| auth.js | 🟢 | 鉴权，直接复用 |
| users.js | 🟢 | 用户管理，直接复用 |
| roles.js | 🟢 | RBAC，直接复用 |
| menus.js | 🟢 | 菜单，加 V2.0 新菜单项 |
| platforms.js | 🟢 | 平台元数据 |
| pages.js | 🟢 | 页面识别规则 |
| plugins.js | 🟢 | 用户-平台授权 |
| configs.js | 🟢 | 用户配置 |
| dashboard.js | 🟢 | 首页统计 |
| logs.js | 🟢 | runtime 日志 |
| _chaos.js | 🟢 | dev-only 故障注入 |
| devices.js | 🟡 | 删除 `/api/plugin` 内挂载 |
| stats.js | 🟡 | 路径冲突修复 |
| messages.js | 🟡 | `/plugin/messages` → `/api/v2/events/batch` |
| runtime.js | 🟡 | V1.9 新增，改造 heartbeat 接口 |
| batches.js | ⛔ | V1.9 "对话处理批次"概念，不迁移 |
| sessions.js | 🟡 | 改为 `/api/v2/conversations` |
| ai.js | ⛔ | 决策在 server engine 内部，不暴露 HTTP |
| knowledge.js | ⛔ | V2.0 重新设计 RAG |
| keywordReplies.js | ⛔ | V2.0 用 v2_intent_rules 替代 |

### 2.2 server/src/middleware/

| 文件 | 处置 |
|---|---|
| auth.js | 🟢 JWT 验证 |
| permission.js | 🟢 RBAC 权限校验 |
| upload.js | 🟢 multer 文件上传 |

### 2.3 server/src/controllers/

按上述 routes 对应迁移。

### 2.4 server/sql/

⛔ **不迁移老 migration 文件**。chatsift 用全新的 `v2.0-schema.sql` 一次性建表。
🟢 复用 `roles` / `menus` / `permissions` 的初始化数据 SQL，作为 chatsift 初始化的一部分。

---

## 三、前台迁移清单

### 3.1 admin/src/ 基础设施

| 文件 / 目录 | 处置 | 备注 |
|---|---|---|
| main.js | 🟢 | Vue 入口 |
| App.vue | 🟢 | 根组件 |
| router/index.js | 🟡 | V2.0 路由替换 V1.x 路由 |
| store/（Pinia） | 🟢 | auth store 直接复用 |
| utils/axios.js | 🟢 | HTTP 客户端配置 |
| components/Layout.vue | 🟢 | 后台布局，直接复用 |
| components/SideMenu.vue | 🟡 | 菜单项替换 |
| views/Login.vue | 🟢 | 登录页 |

### 3.2 admin/src/views/

🟢 复用：Login / Users / Roles / Menus / Platforms / Plugins / Dashboard
⛔ 不迁移：Messages（脏）/ KeywordReplies / Knowledge / runtime/*（V1.9 分析侧）
🆕 新建：V2.0 的 8 个新页面（见 runtime-disposition.md 第 7 节）

---

## 四、部署与脚本迁移清单

### 4.1 deploy/

| 文件 | 处置 |
|---|---|
| docker-compose.yml | 🟡 容器命名前缀改 chatsift，端口避免冲突 |
| docker-compose.test.yml | 🟡 同上 |
| Caddyfile | 🔵 参考，实际用 Nginx |
| conf/ | 🟢 复用 |

### 4.2 scripts/

| 类别 | 处置 |
|---|---|
| package-plugin.sh | 🟡 修改下载路径和元数据 |
| chaos/ | 🟢 直接复用 |
| smoke/ | 🟢 直接复用 |
| qa / release / deploy 等 | 🟡 按 chatsift 命名 / 路径调整 |

---

## 五、文档迁移清单

### 5.1 docs/ — 选择性迁移

| 子目录 | 处置 |
|---|---|
| docs/architecture/ | 🟢 整体复用，部分 ADR 标记"V1.x 历史" |
| docs/decisions/ | 🟢 ADR-001 ~ ADR-005 复用 |
| docs/incidents/ | 🔵 参考保留，不放入 chatsift 仓库 |
| docs/agents/ | 🟢 复用 |
| docs/prd/V1.x/ | ⛔ 留在 chat_rpa，不迁移 |
| docs/prd/V1.9/ | 🔵 参考保留，实际放 chatsift 的 docs/prd/_archive/ |
| docs/prd/V2.0/ | 🆕 chatsift 新建 |

---

## 六、不迁移清单总览

明确不会出现在 chatsift 仓库的内容：

- chat_rpa/plugin/content_legacy.js（整体）
- chat_rpa/plugin/content.js（V1.9 build 产物，11176 行）
- chat_rpa/plugin/popup/ 老 UI（chatsift 重做 popup）
- chat_rpa/server/src/routes/ai.js / knowledge.js / keywordReplies.js / batches.js
- chat_rpa/admin/src/views/runtime/ V1.9 分析侧页面
- chat_rpa/server/sql/init.sql 和所有 migration_v*.sql
- chat_rpa/dom-collector/ 调试插件（chatsift 不需要单独的 dom collector）
- chat_rpa/revisions/ 历史快照

---

## 七、迁移操作步骤

> 此节由 chatsift 项目 W0 阶段执行，完成后本文件归档，不再更新。

### Step 1：创建 chatsift 仓库

```bash
mkdir -p ~/projects/chatsift
cd ~/projects/chatsift
git init
git remote add origin <chatsift repo url>
```

### Step 2：目录骨架

```bash
mkdir -p plugin/{runtime,adapters/douyin,shared,popup,icons}
mkdir -p server/src/{routes,controllers,middleware,v2,utils,config}
mkdir -p server/sql
mkdir -p admin/src/{views/v2,components,router,store,utils}
mkdir -p deploy/conf
mkdir -p docs/{prd/V2.0,architecture,decisions,_archive}
mkdir -p scripts/{chaos,smoke,qa,release}
```

### Step 3：按文本清单拷贝代码

按 🟢 / 🟡 / 🔵 / ⛔ 标记逐文件处理。每次拷贝后记录到本文件末尾的"迁移日志"段。

### Step 4：初始化配置文件

- 根 `package.json`（可选，monorepo workspace 配置）
- `.gitignore`
- `LICENSE` / `README.md`
- `deploy/docker-compose.yml`（chatsift 容器配置）

### Step 5：首次构建验证

- `server/`：`npm install && npm run dev`，确认能启动（空数据库）
- `admin/`：`npm install && npm run dev`，确认能跳到登录页
- `plugin/`：`node build.js`，确认能产出 dist/

### Step 6：首次 commit

```bash
git add .
git commit -m "feat: initialize chatsift from chat_rpa@4fe827e"
git push -u origin main
```

---

## 八、迁移日志

> W0 阶段每完成一批文件迁移，在此追加记录。

（空，待 W0 启动后填）
