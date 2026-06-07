---
文档: chatsift 文档索引(document-index)
版本: v1.0.0
状态: 生效中(活文档)
日期: 2026-06-07
---

## 变更日志

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0.0 | 2026-06-07 | 初版:Phase 1 整理后各类文档位置 + 主要入口 |

> 归类/命名规则见 [document-governance.md](document-governance.md)。本文只索引"在哪/找什么",不复述内容。
> 唯一状态源是根目录 `PROJECT_STATUS.md`,本文不维护进度。

---

## 主要入口(先读这几个)

| 文档 | 作用 |
|---|---|
| [AGENTS.md](../../AGENTS.md) | 协作入口,核心规矩(A/B/C 分级、身份、编号约定) |
| [PROJECT_STATUS.md](../../PROJECT_STATUS.md) | ★唯一状态源:版本/进度/遗留/发版记录/生产状态 |
| [CLAUDE.md](../../CLAUDE.md) | 项目说明(定位/红线/运行拓扑/文档索引) |
| `CHANGELOG.md`(根) | 版本变更记录(对应 tag) |

## 各类文档位置

| 目录 | 放什么 | 命名 |
|---|---|---|
| 仓库根 | 五件套:AGENTS / CLAUDE / PROJECT_STATUS / CHANGELOG / README | 固定语义名 |
| `docs/meta/` | 文档治理(本文 + document-governance)、技术债总纲(tech-debt-master-plan)、代码现状(PROJECT_REALITY)、文档↔代码差距(SPEC_GAP)、迁移说明(MIGRATED_FROM_CHAT_RPA) | 固定语义名 |
| `docs/ops/` | 流程/生产规程:release / prod-safety / versioning / server-access / engineering-governance / deploy | 固定语义名 |
| `docs/prd/V1.0/` | 编码前设计:PRD_v1.0.0、v1-api-spec、v1-schema.sql、`W##_design/tasks`、dom-collector_stage1/2_tasks 等 | `W##_design.md` |
| `docs/prd/V2.0/` | **转型前**旧"AI 客服"PRD(历史对照,勿当现行需求)、runtime-disposition | — |
| `docs/research/` | 调研/盘点/现状核实/技术方案 = 快照 | `YYYY-MM-DD_主题.md` |
| `docs/reports/` | 验收/诊断/盘点/复盘 = 证据(含 cc/cc2/codex 多 agent 调研,全保留) | `W##_acceptance` 或带日期 |
| `docs/archive/` | 已废弃保留:OPS / COLLABORATION / chatsift_HANDOVER / ROADMAP_post_mvp(被根五件套 + ops/ 取代) | 原名 |

## 取代关系(archive 内文档现由谁承接)

| 已废弃(archive) | 现行承接 |
|---|---|
| OPS.md | docs/ops/(release/versioning/prod-safety/server-access) |
| COLLABORATION.md | AGENTS.md §3(A/B/C 分级) |
| chatsift_HANDOVER.md | AGENTS.md(协作入口)+ PROJECT_STATUS.md(状态)|
| ROADMAP_post_mvp.md | PROJECT_STATUS.md(backlog/待排期)|
