# 任务单协作规范

> 版本: v1.1.0 / 2026-06-11
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

4. **PROJECT_STATUS 只记录总状态**。
   版本、阶段、发版状态写 `PROJECT_STATUS.md`;任务执行细节写任务单。

5. **CHANGELOG 只记录版本结果**。
   版本变更和复盘写 `CHANGELOG.md`;执行过程不写入 CHANGELOG。

6. **任务单不覆盖上位规则**。
   任务单不能降低 `AGENTS.md`、`PROJECT_STATUS.md`、`docs/ops/prod-safety.md` 的要求。若任务单与上位规则冲突,以上位规则为准并停下回报。

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

---

## 5. 任务单模板

```md
# 任务：v0.6.5 xxx

Owner: CC4
Role: DEV / QA / UI / PM
Status: pending
Branch: 待创建或指定分支
Created: YYYY-MM-DD
Change Class: A 类 / B 类 / C 类
Approver: Chase / PM / QA / 用户
Status Source Impact: none / needs PROJECT_STATUS update / needs CHANGELOG on release
Commit Policy: 状态变更随任务提交 / 状态变更单独 docs commit / 不提交中间状态,最终归档提交

---

## 1. PM 指令

目标:
- ...

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

PM 在聊天中只输出:

```text
任务单已创建: docs/tasks/active/<文件名>.md
请 CC4 按该文档执行,遇到 Stop Gates 停下回报。
```

### 6.2 CC 执行任务

CC 必须先读任务单,并在文档中把状态改为 `in_progress`。

CC 执行前必须按 `AGENTS.md` 做开工前置。若 `Change Class`、文件边界或 Stop Gates 缺失,必须先停下让 PM 补齐。

执行过程中遇到 Stop Gate,把状态改为 `blocked`,在任务单 `执行记录` 中写明原因,然后停下回报。

执行完成后,把状态改为 `ready_for_review`,填写 `执行记录` 和 `最终结果`。

### 6.3 PM/用户审核

PM/用户审核同一个任务单:

- 通过:状态改为 `approved`,然后移动到 `docs/tasks/done/` 并改为 `done`。
- 退回:状态改为 `rejected`,说明补充项。

### 6.4 状态变更和归档提交

- 中间状态(`pending`→`in_progress`→`blocked/ready_for_review`)是否提交,按任务单 `Commit Policy` 执行。
- 任务最终通过后,用 `git mv docs/tasks/active/<文件名>.md docs/tasks/done/<文件名>.md` 归档。
- 归档移动必须进入最终 commit;若任务代码已单独提交,归档可作为独立 `docs:` commit。
- B/C 类任务不得把未审核的方案、代码和归档状态混成一个不可追溯 commit。

---

## 7. 与其他文档的关系

| 文档 | 作用 |
|---|---|
| `docs/tasks/active/*.md` | 单个任务的完整执行闭环 |
| `docs/tasks/done/*.md` | 已完成任务的归档记录 |
| `PROJECT_STATUS.md` | 当前版本、阶段、生产状态、总待办 |
| `CHANGELOG.md` | 已发布版本的变更与复盘 |
| `docs/reports/*.md` | 验收报告、事故复盘、调研证据 |
| `docs/research/*.md` | 调研、盘点、技术方案和现状核实快照 |
| `docs/ops/*.md` | 流程规范和生产操作规程 |

任务单不是唯一状态源。版本与生产状态仍以 `PROJECT_STATUS.md` 为准。任务执行中产生的验收报告、事故复盘、调研证据仍归 `docs/reports/` 或 `docs/research/`,任务单只链接引用。

---

## 8. 变更日志

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.1.0 | 2026-06-11 | 补上位规则优先级、A/B/C 分类、审批人、状态源影响、commit 策略、reports/research 证据归属和归档提交规则 |
| v1.0.0 | 2026-06-11 | 初版:定义 v0.6.5 起一个任务一个文档、单文档闭环、active/done 目录和任务单模板 |
