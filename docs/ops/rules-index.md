# 规则登记册(rules-index.md)

> 目的:登记 chatsift 治理规则的唯一归属与强制者,避免规则散落、重复和无人执行。
> 版本:v1.0.0 / 2026-06-14

---

## 变更日志

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0.0 | 2026-06-14 | 初版:登记核心治理规则的唯一家、强制者和核实状态 |

---

## 1. 判定口径

| 字段 | 含义 |
|---|---|
| 规则 | 需要长期遵守的治理要求 |
| 唯一的家 | 规则正文所在文档;其他文档只能链接或摘要 |
| 强制者 | 机器检查 / 人工检查点 / 二者组合 |
| 核实状态 | 本次 D2 是否确认有家、有强制者 |

无漏洞判据:每条规则只有一个家,且有明确强制者。强制者可以是机器,也可以是在册的人工检查点。

## 2. 规则登记表

| 规则 | 唯一的家 | 强制者 | 核实状态 |
|---|---|---|---|
| 永不发送红线 | `CLAUDE.md` 最高红线 | 人(产品红线;Review/PM/DEV 开工前识别) | ✅ |
| 开工前置:声明身份/环境/文件边界/工作区状态 | `AGENTS.md` §1 | 人(每次开工自检) | ✅ |
| 默认不碰生产 | `AGENTS.md` §2 | 人(用户明确授权前停下) | ✅ |
| 先判层 | `AGENTS.md` §3 | 人(PM/Review 判断;Chase 定优先级) | ✅ |
| 变更分级 A/B/C | `AGENTS.md` §3 | 人(DEV 初判;B/C 过 Claude + Chase) | ✅ |
| 重改动先出技术方案 | `AGENTS.md` §4 | 人(DEV 停下出方案;Review/Chase 审) | ✅ |
| 单 agent 单分支 | `AGENTS.md` §5 | 人(PM/DEV 分支边界自检) | ✅ |
| 改完即提交 / commit 格式 | `AGENTS.md` §6 | 人(DEV/QA 收口检查) | ✅ |
| 发版权 = QA/Chase | `AGENTS.md` §7 | 人(QA/Chase 执行;DEV 不碰 VERSION/tag/发版记录) | ✅ |
| 高风险操作停最后一步 / 留用户在场 | `AGENTS.md` §8 | 人(执行端停下;Chase 在场) | ✅ |
| 模型切换/上下文压缩后重确认环境 | `AGENTS.md` §9 | 人(关键操作前复核 pwd/hostname/git status) | ✅ |
| 多 agent 分工 / 自动流转授权矩阵 | `AGENTS.md` §10 + `docs/ops/task-doc-workflow.md` §4.3 | 人(任务单字段驱动;高风险仍需用户批准) | ✅ |
| 任务单是单任务事实源 | `docs/ops/task-doc-workflow.md` §1 | 人(PM/CC 先写任务单,聊天只通知) | ✅ |
| 任务单不覆盖上位规则 | `docs/ops/task-doc-workflow.md` §1 | 人(冲突时以上位规则为准并停下) | ✅ |
| 任务状态流转和归档规则 | `docs/ops/task-doc-workflow.md` §4/§6.5 | 人 + 机器(`scripts/check-tasks.sh`) | ✅ |
| 任务单字段/状态一致 | `docs/ops/task-doc-workflow.md` §6.6 | 机器(A2:`scripts/check-tasks.sh`) | ✅ |
| done/approved 不留 active | `docs/ops/task-doc-workflow.md` §6.5/§6.6 | 机器(A2:`scripts/check-tasks.sh`) | ✅ |
| reports/research 证据归属 | `docs/ops/task-doc-workflow.md` §7/§7.1 | 人(PM/CC 归档时检查) | ✅ |
| 复盘强制触发 | `docs/ops/task-doc-workflow.md` §6.5.1 | 人(QA/PM 判断触发条件;任务单/CHANGELOG/reports 留痕) | ✅ |
| 破坏性三问 | `docs/ops/prod-safety.md` §4 | 人(执行端停最后一步;Chase 确认) | ✅ |
| SSH 到生产后的环境三确认 | `docs/ops/prod-safety.md` §2 | 人(生产操作前手动核对) | ✅ |
| data/ 红线 | `docs/ops/prod-safety.md` §5 | 人(部署/rsync 前核对排除项) | ✅ |
| test/prod 隔离 | `docs/ops/release.md` §7.1 + `docs/ops/server-access.md` §5 + `docs/ops/deploy.md` | 机器(`scripts/release.sh` guard + `scripts/check-env-isolation.sh`) + 人(QA checklist) | ✅ |
| 发版版本文件同步 | `docs/ops/release.md` §2 | 机器(`scripts/sync-version.sh` + `scripts/check-version.sh`) | ✅ |
| 发版 checklist / 禁止打 tag 条件 | `docs/ops/release.md` §3/§4 | 人(QA checklist) + 机器(`scripts/check-version.sh`) | ✅ |
| 并线发版声明 | `docs/ops/release.md` §6 | 人(QA 发版前写 PROJECT_STATUS + CHANGELOG 声明) | ✅ |
| 编号约定 W/M/v | `docs/ops/versioning.md` §1 | 人(QA/PM 维护) + 机器(A1 部分检查版本一致性) | ✅ |
| 版本号单一真源 | `docs/ops/release.md` §1/§2 + `PROJECT_STATUS.md` 当前版本 | 机器(A1:`scripts/check-doc-freshness.sh`;发版:`scripts/check-version.sh`) | ✅ |
| 文档头版本 == changelog 顶行 | 各活文档文档头 + 变更日志 | 机器(A1:`scripts/check-doc-freshness.sh`) | ✅ |
| 文档 SSOT / 归类 / 命名 | `docs/meta/document-governance.md` | 人(文档治理任务审查) + 机器(A1 部分新鲜度检查) | ✅ |
| 根目录五件套不移动 | `docs/meta/document-governance.md` §2 | 人(文档治理审查;移动需另立 B 类任务) | ✅ |
| 根目录五件套内容新鲜度 | `docs/meta/document-governance.md` §5 | 机器(A1:`scripts/check-doc-freshness.sh`) + 人(对应人工 review) | ✅ |
| 不提交运行产物和机密 | `AGENTS.md` 文档体系规约 | 人(提交前检查;`.gitignore` 辅助) | ✅ |
| 唯一状态源 | `PROJECT_STATUS.md` | 人(PM/QA 更新状态;A1 防部分写死版本漂移) | ✅ |
| main 不进业务码 | `scripts/guard-main-commit.sh` | 机器(A3:pre-commit 拦截 server/admin/plugin) | ✅ |
| 统一治理检查门 | `.githooks/pre-commit` + `scripts/check-governance.sh` | 机器(D1:pre-commit warning-only 跑 A1/A2;A3 仍拦业务码) | ✅ |
| 死代码清理流程 | `docs/ops/engineering-governance.md` | 人(先盘点、分级、用户确认后小批量删除) | ✅ |
| 新增/修改规则必须登记强制者 | `docs/meta/document-governance.md` §5 | 人(文档治理 review;后续可机器化) | ✅ |
## 3. 机器强制点索引

| 编号 | 强制点 | 作用 | 当前行为 |
|---|---|---|---|
| A1 | `scripts/check-doc-freshness.sh` | 查 README/release/server-access 当前状态写死版本号、活文档头版本与 changelog 顶行一致 | WARN/FAIL;由 `check-governance.sh` 汇总 |
| A2 | `scripts/check-tasks.sh` | 查 active 任务字段、ready_for_review 记录、approved/done 未归档 | WARN/FAIL;由 `check-governance.sh` 汇总 |
| A3 | `scripts/guard-main-commit.sh` | main 上拦截 server/admin/plugin 业务码提交 | pre-commit 真拦;`ALLOW_MAIN_BIZ=1` 可应急放行并警告 |
| D1 | `.githooks/pre-commit` | 先跑 A3,再 warning-only 跑 `check-governance.sh` | A3 拦截;治理检查提醒不拦 |
| release | `scripts/sync-version.sh` / `scripts/check-version.sh` | 同步和校验产品版本文件 | 发版 checklist 必跑 |
| env | `scripts/release.sh` / `scripts/check-env-isolation.sh` | test/prod 发布目录隔离和隔离矩阵核验 | release.sh guard;check-env-isolation 只读核验 |
