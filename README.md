# Chatsift · 会话筛

> **Conversation Sifting Platform** — 帮助企业从多平台客服会话中筛选高价值线索、补齐预约信息、生成业务工单。
>
> 不替代平台 AI 回复某句话，而是帮助企业识别高价值客户、补齐线索信息、生成预约工单，并持续推动会话转化率。

---

## 项目定位

Chatsift 是一个多平台会话智能运营系统（Conversation Intelligence Runtime），核心能力：

- **静默采集**（Observe First）：浏览器扩展作为只读探针，采集多平台客服消息
- **意图分析**（Intent Engine）：规则 + LLM 双引擎，识别简单咨询 / 预约下单 / 换货建议 / 询问价格
- **线索沉淀**（Lead Engine）：客户档案、成熟度评分、跟进状态管理
- **工单流转**（WorkOrder Engine）：自动生成 4 类工单，按城市 / 门店派单
- **会话审计**（Audit Engine）：转化漏斗、平台对比、客服质检

---

## 仓库结构

```
chatsift/
├── plugin/             Chrome MV3 扩展（只读探针）
├── server/             Node + Express 服务端
├── admin/              Vue 3 + Element Plus 管理后台
├── deploy/             Docker Compose + Nginx 配置
├── docs/               PRD / 任务单 / 调研 / 报告 / 治理规范
├── scripts/            构建、部署、QA 脚本
└── docs/meta/MIGRATED_FROM_CHAT_RPA.md   从 chat_rpa 迁移的代码清单
```

文档位置以 [`docs/meta/document-index.md`](./docs/meta/document-index.md) 为准。

---

## 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 扩展 | Chrome MV3 + 原生 JS + 纯 concat 构建 | 沿用已验证方案，只读 DOM 采集 |
| 服务端 | Node 20 + Express 4 + MySQL 8 | 无 ORM，手写 SQL |
| 后台 | Vue 3.5 + Pinia + Element Plus + Vite | 沿用 chat_rpa 技术栈 |
| 部署 | Docker Compose + Nginx + 单机 MySQL | MVP 阶段不上 K8s / Redis / MQ |
| 鉴权 | JWT HS256 | 沿用 chat_rpa 方案 |

**不引入**（验证用量后再评估）：Redis、消息队列、WebSocket、ORM、分库数据库、K8s。

---

## 与 chat_rpa 的关系

Chatsift 由 chat_rpa 的可复用代码迁移转型而来，**独立仓库，独立 git 历史，独立部署**。

- chat_rpa 已停止作为现行产品使用
- chatsift 从 chat_rpa 拷贝可复用代码，见 [`docs/meta/MIGRATED_FROM_CHAT_RPA.md`](./docs/meta/MIGRATED_FROM_CHAT_RPA.md)
- 拷贝后独立维护，chat_rpa 后续不再同步更新
- 鉴权、数据库、域名独立

---

## 开发阶段

当前版本与开发进度见根目录 `PROJECT_STATUS.md`。

---

## 快速开始

```bash
# 后端
cd server && npm install && npm run dev

# 后台
cd admin && npm install && npm run dev

# 扩展
cd plugin && node build.js && \
  # Chrome 访问 chrome://extensions 加载 plugin/dist
```

## 插件准实时使用要求

使用插件采集抖音私信时,抖音客服页面需要保持前台打开。浏览器最小化、切到后台标签页或系统休眠后,页面 DOM 可能暂停刷新,插件就无法准实时看到新消息。W12 后后台会轮询提醒新高意向线索,但前提仍是客服页面持续可见并且插件处于启动状态。

---

## 文档导航

- [`AGENTS.md`](./AGENTS.md) — agent 协作入口与核心规矩
- [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) — 当前版本、阶段、生产状态和遗留事项
- [`docs/meta/document-index.md`](./docs/meta/document-index.md) — 文档位置索引
- [`docs/meta/MIGRATED_FROM_CHAT_RPA.md`](./docs/meta/MIGRATED_FROM_CHAT_RPA.md) — 从 chat_rpa 复用的代码清单

---

## License

私有项目，内部使用。
