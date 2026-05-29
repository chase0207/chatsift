# Chatsift · 多平台会话智能运营系统

> **PLACEHOLDER · 待补充**
> 本文件为 W0 阶段占位骨架，正式 README 内容由项目方提供后替换。
> 当前仓库由 chat_rpa@4fe827e 迁移而来，迁移详情见 [MIGRATED_FROM_CHAT_RPA.md](./MIGRATED_FROM_CHAT_RPA.md)。

## 仓库结构（W0 完成态）

```
chatsift/
├── plugin/          # Chrome MV3 插件
│   ├── runtime/     # V2.0 Runtime（11 项 🟢 复用 + 7 项 🟡 TODO 改造）
│   ├── adapters/    # 平台适配器（douyin × 3 待改造）
│   ├── shared/      # DOM utils / adapter helpers
│   └── popup/       # 弹窗 UI
├── server/          # Node.js + Express
│   ├── src/routes/      # 复用 11 条 V1.x 路由
│   ├── src/controllers/ # 对应 controller
│   ├── src/middleware/  # auth / permission / upload
│   ├── src/v2/          # V2.0 新代码（W1+ 写入）
│   └── sql/             # migration（W1 新建 v2_*.sql）
├── admin/           # Vue 3 + Element Plus
│   ├── src/views/v2/    # V2.0 新页面
│   └── src/router/      # TODO: V1.x → V2.0 路由替换
├── deploy/          # 部署配置
│   └── _reference/      # V1.x compose 留存参考（不直接使用）
├── docs/
│   ├── prd/V2.0/        # V2.0 PRD + runtime-disposition
│   ├── architecture/
│   ├── decisions/       # ADR
│   └── _archive/
└── scripts/         # chaos / smoke / qa / release
```

## 当前阶段

| Workstep | 内容 | 状态 |
|----------|------|------|
| **W0** | 仓库初始化、代码迁移、TODO 标记 | 🚧 进行中 |
| W1 | server V2.0 schema + 路由骨架 | ⏳ |
| W2 | plugin Runtime 改造（批次 → 逐条；6 状态） | ⏳ |
| W3 | adapter 改造（toConversationEvent 接口） | ⏳ |
| W4 | admin V2.0 页面 + 路由替换 | ⏳ |

## 关键决策

| 项 | 结论 |
|----|------|
| 来源 | chat_rpa@4fe827e |
| 迁移策略 | 🟢 直接复用 / 🟡 头部加 TODO 后由 W1+ 改造 / ⛔ 不迁移（V1.x 业务代码） |
| chat_rpa 仓库 | 全程只读，迁移期不接受改动 |
| V2.0 文档 | 见 [docs/prd/V2.0/](./docs/prd/V2.0/) |

## 不迁移的内容（保留在 chat_rpa）

- `content_legacy.js` / V1.x `content.js` 单体
- AI / 知识库 / 关键词回复路由（业务变化大，V2.0 重设计）
- batches / send-related runtime 模块（V2.0 不再有 batch 概念）
- V1.x migration SQL（V2.0 全新 schema）

完整迁移清单见 [MIGRATED_FROM_CHAT_RPA.md](./MIGRATED_FROM_CHAT_RPA.md)。
