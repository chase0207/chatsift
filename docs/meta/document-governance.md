---
文档: chatsift 文档治理规范(document-governance)
版本: v1.0.0
状态: 生效中(活文档)
日期: 2026-06-07
---

## 变更日志

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0.0 | 2026-06-07 | 初版:目录口径 + 五条硬规则 + 命名 + 两阶段 + 去重三态。落地见 docs/reports/2026-06-07_文档治理盘点与整理方案.md |

> 本文是 chatsift 文档归类/命名/治理的**唯一规范**。新增或整理文档前先读本文。
> 当前各文档位置见 [document-index.md](document-index.md);当前状态/进度见根目录 `PROJECT_STATUS.md`。

---

## 1. 目录口径(固定)

| 位置 | 放什么 | 命名 |
|---|---|---|
| **仓库根**(五件套,不动) | `AGENTS.md` `CLAUDE.md` `PROJECT_STATUS.md` `CHANGELOG.md` `README.md` | 固定语义名,无日期无编号 |
| `docs/prd/` | 编码前设计:PRD、design、tasks、技术方案中"会指导实现"的部分 | `W##_design.md`(固定名 + 内部版本号 + changelog,无日期无前缀) |
| `docs/research/` | 调研、盘点、现状核实 = **快照** | `YYYY-MM-DD_<W##或主题>_描述.md`(带日期) |
| `docs/reports/` | 验收、诊断、复盘结论 = **证据** | 带日期 或 `W##_acceptance/diagnosis` |
| `docs/ops/` | 流程与生产操作规程 | `release/prod-safety/versioning/server-access/engineering-governance/deploy` |
| `docs/meta/` | 文档治理、索引、技术债总纲、项目级长期说明 | 固定语义名;**不放**具体验收报告 / 一次性调研 |
| `docs/archive/` | 历史废弃文档(进 git) | 保留原名,文件头标注取代关系 |
| `docs/scratch/` | 临时草稿 | **不进 git** |

> 红线提醒:`docs/` 根目录**不再留散落 .md**,所有文档归入上述子目录。

## 2. 五条硬规则

1. **根目录五件套不动**。`CHANGELOG.md` 被 `scripts/release-prod.sh` 写入,`PROJECT_STATUS.md` 被 `docs/ops/release.md`、`versioning.md`、`AGENTS.md` 引用——移动 = 改脚本/流程,需另立 B 类治理任务。
2. **`CLAUDE.md` / `AGENTS.md` 必须留根**:CLAUDE.md 是 Claude Code 自动加载入口,AGENTS.md 是 Codex 入口约定。工具依赖,不动。
3. **`docs/meta/` 固定**,不再写"docs 根或 docs/meta"二选一。
4. **两阶段,第一阶段不改正文**:Phase 1 只做盘点/分类/移动/改名/改引用(链接路径);Phase 2 才给活文档补 changelog、给废弃文档加 superseded 标记。
5. **去重保守,不合并证据**:文档分三态——
   - `canonical`:当前权威版本。
   - `superseded`:被取代但保留(进 archive,标取代关系)。
   - `evidence`:历史证据(多 agent 调研 cc/cc2/codex、acceptance、investigation 等),**不合并不删**。

   仅"同主题 + 同结论 + 同时间窗 + 无新增证据"才可合并留最新。

## 3. 命名

- 项目级活文档(根五件套 + meta):固定语义名,**无日期无编号**。
- 设计/活文档(prd 的 design/tasks):固定名 + 内部版本号 + changelog 表,**无日期无前缀**(`W19_design.md`)。
- 调研/报告快照(research/reports):`YYYY-MM-DD_<W##或主题>_描述.md`(带日期)。
- 活文档开头必须有 changelog 表;废弃文档文件头标注"已废弃,被 XX 取代"。

## 4. 整理纪律

- 只做归类 + 重命名 + 去重(留最新)+ 改引用,**不重写内容、不补缺失**;找不到的标"缺",不自行补。
- 废弃文档不删,移 `docs/archive/`,文件头标取代关系。
- `git mv` 保留历史;确认重复用 `git rm`(可从历史恢复)。
- 整理产出落 `docs/reports/`(带日期),报 Chase 审,审过再动。
