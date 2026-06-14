# 任务单协作规范

> 版本: v1.7.0 / 2026-06-14
> 生效范围: 从 v0.6.5 开始执行。v0.6.4 仍按当前临时增强 gate 走完。
> 目标: 用“一个任务一个文档”替代聊天长指令,降低漏读、漏执行、状态分散和多 agent 混乱。

---

## 1. 核心原则

1. **一个任务一个文档**。
   PM 指令、执行步骤、Stop Gates、验收标准、执行记录、最终结果、PM 审核结论都写在同一个文档里。

2. **聊天只传路径和短结论**。
   不再在聊天里贴大段执行指令。PM 写好任务单后,用户只需转发:

   ```text
   请按 docs/tasks/active/<任务单>.md 执行,遇到 Stop Gates 停下回报。
   ```

3. **执行结果默认写回任务单**。
   CC 执行记录直接回写同一个任务单。普通任务不另写 `result/handoff` 文档,避免多份文档互相漂移。
   但验收报告、事故复盘、调研证据仍按文档体系落 `docs/reports/` 或 `docs/research/`,并在任务单中链接。

4. **任务单是单任务事实源**。
   任何会影响本任务状态的信息,必须先进入任务单。聊天只做通知,不做事实源。

5. **PROJECT_STATUS 只记录总状态**。
   版本、阶段、发版状态写 `PROJECT_STATUS.md`;任务执行细节写任务单。

6. **CHANGELOG 只记录版本结果**。
   版本变更和复盘写 `CHANGELOG.md`;执行过程不写入 CHANGELOG。

7. **任务单不覆盖上位规则**。
   任务单不能降低 `AGENTS.md`、`PROJECT_STATUS.md`、`docs/ops/prod-safety.md` 的要求。若任务单与上位规则冲突,以上位规则为准并停下回报。

8. **PM 先写任务单,再发聊天指令**。
   凡是会影响 CC 执行的目标、步骤、review 意见、拍板结论、验收要求,PM 必须先写入任务单,再在聊天里发送任务单路径和一句话转发口径。禁止先在聊天里输出完整执行指令,事后再补任务单。

9. **CC 先回写任务单,再发聊天反馈**。
   凡是执行结果、阻塞原因、commit、检查命令、验收证据、未决项、是否触碰禁止项,CC 必须先写入任务单的 `执行记录` / `最终结果` / `PM 审核` 对应章节,再在聊天里发送路径和短摘要。禁止只在聊天里回长反馈,导致任务单缺状态。

10. **子 agent 可按任务单自动流转**。
   PM / DEV / QA 之间的交接以任务单 `Status`、`Owner`、`Role`、`Next Owner` 为准。只要未触发 Stop Gate,且任务单字段完整,下一个子 agent 可自动接手;聊天只做通知。

11. **自动流转不等于自动批准**。
   B/C 类、地基/环境/发布/权限/数据契约、test/prod、破坏性操作、发版/tag/CHANGELOG/VERSION,仍必须按任务单 `Approver` 和上位规则审批。子 agent 不得自批自己产出的 B/C 类方案或发版结果。

---

## 2. 目录约定

```text
docs/tasks/
  active/   # 进行中任务
  done/     # 已完成任务,从 active 移入
```

任务从创建到完成只维护同一个文件。完成后移动到 `done/`,不新建结果文件。

`docs/tasks/` 只放任务执行闭环,不放长期规则、技术方案总纲、验收报告或调研证据。

---

## 3. 命名格式

任务标题格式:

```text
任务：v0.6.5 xxx
```

其中 `xxx` 是需求概述,用一句短语表达任务目标。

文件命名格式:

```text
docs/tasks/active/YYYY-MM-DD_v0.6.5_xxx.md
```

示例:

```text
任务：v0.6.5 修复采集位置冷启动撞号
docs/tasks/active/2026-06-11_v0.6.5_修复采集位置冷启动撞号.md
```

---

## 4. 状态流转

```text
pending
→ in_progress
→ blocked / ready_for_review
→ approved / rejected
→ done
```

状态含义:

| 状态 | 含义 |
|---|---|
| pending | PM 已创建任务单,等待执行 |
| in_progress | CC 已接收并开始执行 |
| blocked | 触发 Stop Gate 或遇到阻塞,等待用户/PM |
| ready_for_review | CC 已完成,等待 PM/用户验收 |
| approved | PM/用户审核通过 |
| rejected | PM/用户退回,需补充 |
| done | 已完成并归档 |

每次状态变化必须在任务单里留下记录:

| 状态变化 | 必填记录 |
|---|---|
| `pending` → `in_progress` | 接手人、执行分支、开始时间 |
| `in_progress` → `blocked` | 阻塞原因、触发的 Stop Gate、需要谁拍板 |
| `in_progress` → `ready_for_review` | commit、检查命令、检查结果、未决项 |
| `ready_for_review` → `approved/rejected` | 审核人、审核结论、补充项 |
| `approved` → `done` | 归档位置、归档 commit |

### 4.1 子 agent 分工

| 子 agent | 主要职责 | 不允许 |
|---|---|---|
| PM agent | 定义问题层级、长期方向、当前阶段闭环、任务单、验收矩阵、版本顺序和依赖关系 | 写业务代码、直接发版、绕过上位规则批准 |
| DEV agent | 按任务单实现代码/脚本/配置/SQL,回写执行记录、commit、验证结果 | 自行扩大范围、自批 B/C 类、发版、改 VERSION/CHANGELOG/tag |
| QA agent | 按验收矩阵验证、核对环境/版本/tag/metadata/状态源,执行允许的发版流程 | 改业务逻辑、替 DEV 补功能、绕过 prod-safety |
| Review agent | 审任务单是否漏风险、审 DEV 是否越界、审 QA 验收是否充分,给用户决策建议 | 代替用户批准高风险动作、在未授权时接管实现 |

当前默认分工:Claude Code 承担 PM / DEV / QA 子 agent;Codex 承担 Review agent 和用户助理。用户可临时指定其他分工,但必须写入任务单。

### 4.2 自动切换规则

自动切换以任务单字段为准,不是以聊天口头描述为准:

| 触发条件 | 自动切换到 | 必须先写入任务单 |
|---|---|---|
| PM 完成任务单,字段完整,Status=`pending` | DEV agent | `Problem Layer`、`Change Class`、文件边界、Stop Gates、验收矩阵、`Next Owner` |
| DEV 开始执行 | DEV agent | Status=`in_progress`、执行分支、开始时间 |
| DEV 完成实现和自测 | QA agent / Review agent | Status=`ready_for_review`、commit、命令摘要、检查结果、未决项 |
| DEV 触发 Stop Gate | PM agent / 用户 / Review agent | Status=`blocked`、阻塞原因、需要谁拍板 |
| QA 验收通过 | PM agent / 用户 | 验收矩阵结果、prod/test 影响、状态源影响 |
| PM/用户批准 | QA agent / PM agent | Status=`approved`、审核结论、归档要求 |

### 4.3 自动执行授权矩阵

任务单字段完整、文件边界清楚、工作区可隔离时,按下表执行。若同一任务命中多个级别,按更高限制级别处理。

| 级别 | 可执行事项 | 授权方式 |
|---|---|---|
| 自动执行 | A 类本地代码修复;文档归类/索引更新;本地静态检查/单测/smoke;任务单状态回写;非生产环境只读核实 | 子 agent 可自动执行并回写任务单 |
| 自动执行 | 按任务单已批准方案做实现;按既定验收矩阵跑本地/test 验证;归档已 approved 的任务单 | 子 agent 可自动执行,但必须记录 commit/命令/结果 |
| 需 Review,不需用户 | B 类方案初审;test 环境非破坏性验证;非破坏性脚本改动;release 前状态源一致性检查;文档治理规则补充 | Review agent 审过无阻塞即可继续 |
| 需 PM/QA 批准 | 版本顺延;任务拆分/合并;更新 PROJECT_STATUS;更新 CHANGELOG 草稿;test 部署或重启 test 服务 | 对应 PM/QA agent 在任务单写批准结论 |
| 必须用户批准 | prod 部署/重启;数据迁移/删除/清库;schema/data contract;正式 VERSION/tag/发布;改权限/租户边界;替换 prod 插件包/metadata;破坏性操作 | 用户或任务单 Approver 明确批准 |

默认放权原则:

- A 类 + 本地 + 文件边界明确 = 自动执行。
- test 环境只读核实 = 自动执行;test 非破坏性重启/部署 = QA 批准。
- Review agent 可放行“需 Review,不需用户”的事项,但必须把依据写回任务单。
- 用户批准只保留给 prod、数据、schema、正式发版、权限/租户边界和破坏性操作。

必须停下的通用条件:

- 任务单字段缺失或与 `AGENTS.md` / `PROJECT_STATUS.md` / `docs/ops/prod-safety.md` 冲突。
- 工作区存在无关改动且无法隔离。
- 实际执行需要越过任务单文件边界。
- 验收命令失败且无法在任务范围内修复。

---

## 5. 任务单模板

```md
# 任务：v0.6.5 xxx

Owner: CC4
Role: DEV / QA / UI / PM
Status: pending
Next Owner: DEV / QA / PM / Review / Chase
Branch: 待创建或指定分支
Created: YYYY-MM-DD
Problem Layer: 普通 bug / 业务功能 / 采集链路 / 数据契约 / 权限租户 / 环境发布 / 生产安全 / 文档治理
Change Class: A 类 / B 类 / C 类
Approver: Chase / PM / QA / 用户
Status Source Impact: none / needs PROJECT_STATUS update / needs CHANGELOG on release
Commit Policy: 状态变更随任务提交 / 状态变更单独 docs commit / 不提交中间状态,最终归档提交

---

## 1. PM 指令

目标:
- ...

问题定性:
- Problem Layer:
- Long-term Correct Direction:
- Current Phase Closure:
- Deferred Items + Trigger:

范围:
- ...

不做:
- ...

文件边界:
- 允许改:
- 禁止改:

上位规则:
- 本任务单不覆盖 `AGENTS.md`、`PROJECT_STATUS.md`、`docs/ops/prod-safety.md`。
- 如本任务单与上位规则冲突,停下回报。

---

## 2. 执行步骤

1. ...
2. ...
3. ...

---

## 3. Stop Gates

遇到以下情况必须停下回报:

- 工作区不干净且存在无关改动
- merge conflict
- 出现未授权文件改动
- 任务单与 `AGENTS.md` / `PROJECT_STATUS.md` / `docs/ops/prod-safety.md` 冲突
- 发现任务范围外但想顺手处理的问题
- test/prod 操作前
- schema / migration / 清库 / 删除数据 / 数据契约变化
- 触及接口契约 / auth / permission / tenant scope / plugin runtime 地基
- 修改已验收代码或跨周次代码
- 需要新增依赖、改部署脚本、改 VERSION / CHANGELOG / tag
- 验收命令失败

---

## 4. 验收标准

- [ ] ...
- [ ] ...
- [ ] ...

---

## 5. 执行记录

由 CC 填写:

- 状态记录:
  - YYYY-MM-DD HH:mm `pending` → `in_progress`: ...
  - YYYY-MM-DD HH:mm `in_progress` → `ready_for_review`: ...
- 开始时间:
- 执行分支:
- commit:
- 执行命令摘要:
- 检查结果:
- 异常:
- 状态源影响:

---

## 6. 最终结果

由 CC 填写:

- 状态: 完成 / 阻塞
- 产物:
- reports/research 链接:
- 未决项:
- 是否触碰禁止项:
- 是否需要更新 PROJECT_STATUS / CHANGELOG:

---

## 7. PM 审核

由 PM/用户填写:

- 审核结论: approved / rejected
- 需要补充:
- 下一步:
```

---

## 6. 使用流程

### 6.1 PM 创建任务

PM 在 `docs/tasks/active/` 创建任务单,状态为 `pending`。

PM 必须填写 `Change Class`、`Approver`、`Status Source Impact`、`Commit Policy` 和文件边界。B/C 类任务必须先完成方案/审查要求,不能因为有任务单就直接进入代码实现。

PM 必须填写 `Problem Layer`、`Long-term Correct Direction`、`Current Phase Closure`、`Deferred Items + Trigger`。普通 bug 可简写,但环境/发布/权限/租户/数据契约/生产安全问题必须写完整。

PM 输出任何 CC 执行指令前,必须完成以下自检:

- 任务单已存在。
- 问题层级和当前阶段闭环已写清楚。
- 本轮执行内容、review 意见或拍板结论已写入任务单。
- Stop Gates 已写入任务单。
- `Next Owner` 已写明。
- 聊天回复只包含任务单路径、修改章节和一句话转发口径。

PM 在聊天中只输出:

```text
任务单: docs/tasks/active/<文件名>.md
本次更新: §1 PM 指令 / §3 Stop Gates / §4 验收标准
Next Owner: DEV agent
请按任务单执行,遇到 Stop Gates 停下回报。
```

### 6.2 CC 执行任务

CC 必须先读任务单,并在文档中把状态改为 `in_progress`。

CC 执行前必须按 `AGENTS.md` 做开工前置。若 `Problem Layer`、`Change Class`、文件边界、Stop Gates、验收矩阵或 `Next Owner` 缺失,必须先停下让 PM 补齐。

执行过程中遇到 Stop Gate,把状态改为 `blocked`,在任务单 `执行记录` 中写明原因,然后停下回报。

执行完成后,把状态改为 `ready_for_review`,填写 `执行记录` 和 `最终结果`。

CC 向用户/PM 反馈前,必须完成以下自检:

- `执行记录` 已填写 commit、命令摘要、检查结果和异常。
- `最终结果` 已填写状态、产物、未决项、是否触碰禁止项。
- 若触发 Stop Gate,任务单 Status 已改为 `blocked`,并写明阻塞原因。
- 若完成等待审核,任务单 Status 已改为 `ready_for_review`。
- 聊天回复只包含任务单路径、状态和短摘要。

CC 在聊天中只输出:

```text
任务单: docs/tasks/active/<文件名>.md
Status: ready_for_review / blocked
commit: <hash 或无>
验收: <命令和结果摘要>
未决项: <无 / 需要谁拍板什么>
```

### 6.3 PM/用户审核

PM/用户审核同一个任务单:

- 通过:状态改为 `approved`,然后移动到 `docs/tasks/done/` 并改为 `done`。
- 退回:状态改为 `rejected`,说明补充项。

### 6.4 QA 验收与 Review

QA agent 必须按任务单验收矩阵执行,不得只看功能是否可用。涉及环境/发布/插件/数据的任务,至少核对:

- 版本、tag、metadata、CHANGELOG、PROJECT_STATUS 是否一致。
- test/prod 是否隔离,prod 是否未受影响。
- 验收命令、线上只读证据、失败项和未决项是否写回任务单。
- 是否需要更新 `docs/reports/` 或 `docs/research/`。

Review agent 默认在以下节点介入:

- PM 创建 B/C 类、地基、环境发布、权限租户、数据契约、生产安全任务后。
- DEV 将任务改为 `ready_for_review` 后。
- QA 准备发版、归档或声明 prod/test 验收通过前。
- 用户要求二次把关时。

Review agent 输出只作为审查建议和风险提示;高风险批准权仍属于用户或任务单 `Approver`。

### 6.5 状态变更和归档提交

- 中间状态(`pending`→`in_progress`→`blocked/ready_for_review`)是否提交,按任务单 `Commit Policy` 执行。
- 任务最终通过后,用 `git mv docs/tasks/active/<文件名>.md docs/tasks/done/<文件名>.md` 归档。
- 归档移动必须进入最终 commit;若任务代码已单独提交,归档可作为独立 `docs:` commit。
- B/C 类任务不得把未审核的方案、代码和归档状态混成一个不可追溯 commit。

### 6.5.1 复盘强制触发

以下情况**必须**写复盘(进 CHANGELOG「变更+复盘」或 docs/reports):① 生产事故;② 发版中止/回滚(如版本顺延、abort);③ 发现事实源不一致(文档↔代码/状态漂移)。复盘要点:根因 + 当时为何没拦住 + 该补什么机制。

### 6.6 自动检查建议

后续可增加轻量检查脚本,只做格式和状态一致性检查,不替代人工审批:

- `active` 任务必须有 `Status`、`Role`、`Next Owner`、`Problem Layer`、`Change Class`、`Approver`、`Commit Policy`。
- `ready_for_review` 必须有 commit、检查命令和检查结果。
- `blocked` 必须有阻塞原因、触发的 Stop Gate 和所需拍板人。
- `done` 任务不得留在 `docs/tasks/active/`。
- 文档头版本必须和变更日志最高版本一致。
- 代码改动有 commit 但任务单无执行记录时报警。
- release 文件变动但 Role 不是 QA 时报警。

---

## 7. 与其他文档的关系

| 文档 | 作用 |
|---|---|
| `docs/tasks/active/*.md` | 单个任务的完整执行闭环 |
| `docs/tasks/done/*.md` | 已完成任务的归档记录 |
| `PROJECT_STATUS.md` | 当前版本、阶段、生产状态、总待办 |
| `CHANGELOG.md` | 已发布版本的变更与复盘 |
| `docs/reports/*.md` | 验收报告、事故复盘 |
| `docs/research/*.md` | 调研、盘点、技术方案和现状核实快照 |
| `docs/ops/*.md` | 流程规范和生产操作规程 |

任务单不是唯一状态源。版本与生产状态仍以 `PROJECT_STATUS.md` 为准。任务执行中产生的验收报告、事故复盘、调研证据仍归 `docs/reports/` 或 `docs/research/`,任务单只链接引用。

### 7.1 事实归属

| 信息类型 | 事实源 |
|---|---|
| PM 指令、review、拍板、验收要求 | 当前任务单 |
| CC 执行记录、阻塞、commit、检查结果、未决项 | 当前任务单 |
| 子 agent 自动流转状态、Owner、Next Owner | 当前任务单 |
| 项目当前版本、阶段、生产状态、总遗留 | `PROJECT_STATUS.md` |
| 已发布版本结果和发布复盘 | `CHANGELOG.md` |
| 验收报告、事故复盘 | `docs/reports/` |
| 调研、盘点、技术方案、现状核实证据 | `docs/research/` |

---

## 8. 变更日志

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.7.0 | 2026-06-14 | §6.5 增加复盘强制触发规则:生产事故、发版中止/回滚、事实源不一致必须复盘 |
| v1.6.0 | 2026-06-12 | 增加自动执行授权矩阵,明确自动执行、需 Review、需 PM/QA、必须用户批准的边界 |
| v1.5.0 | 2026-06-12 | 增加 PM/DEV/QA/Review 子 agent 分工、任务单自动流转规则、问题层级字段和 QA/Review 验收职责 |
| v1.4.0 | 2026-06-11 | 明确任务单是单任务事实源,补事实归属表、状态变更记录、聊天模板和自动检查建议 |
| v1.3.0 | 2026-06-11 | 新增 CC 反馈硬规则:执行结果、阻塞、commit、检查和未决项必须先回写任务单,聊天只发路径和短摘要 |
| v1.2.0 | 2026-06-11 | 新增 PM 前置硬规则:凡影响 CC 执行的内容必须先写入任务单,聊天只发路径和一句话转发口径 |
| v1.1.0 | 2026-06-11 | 补上位规则优先级、A/B/C 分类、审批人、状态源影响、commit 策略、reports/research 证据归属和归档提交规则 |
| v1.0.0 | 2026-06-11 | 初版:定义 v0.6.5 起一个任务一个文档、单文档闭环、active/done 目录和任务单模板 |
