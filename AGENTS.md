# chatsift — AGENTS 协作入口

> chatsift = 多平台客服会话诊断系统(当前抖音单平台,V2.0 起引入多平台)。
> 本文件是所有 AI agent 的协作入口,**只放每次都要遵守的核心规矩**(一屏内)。
> 细节按需查附录:发版看 `docs/ops/release.md`、生产操作看 `docs/ops/prod-safety.md`、编号看 `docs/ops/versioning.md`。
> 当前状态 / 进度 / 版本,以 `PROJECT_STATUS.md` 为准(唯一状态源)。
> 版本:v1.7.0 / 2026-06-14

---

## 核心规矩(每个 agent 开工必读)

### 1. 开工前置(每次任务先做)
1. 声明身份:**PM / DEV / QA / UI**
2. 声明运行环境:本地 / 测试 / 生产
3. 声明本次改哪些文件、不碰哪些文件(文件边界)
4. `git status` 确认工作区干净

### 2. 默认不碰生产
默认只在本地改代码。只有用户明确说"部署/上线/发布生产"才操作生产。改完、验证通过后停下等指令,不要因"顺手"主动推生产。

### 3. 先判层 + 变更分类 A/B/C
先判层(分级前先做):先判断问题属于哪一层——普通业务 bug,还是地基/基础设施类(环境、发版、权限/租户、数据契约、生产安全)。**地基类问题给长期正确方案,不压成最小补丁;判错层会让下面的 A/B/C 分级跟着错。**

- **A**(实现细节):DEV 自主,验收说明即可。
- **B**(触及设计意图/验收标准/接口契约):停下,过 Claude + 用户。
- **C**(跨周次/动已验收代码/改数据契约):停下,先诊断,过 Claude + 用户。
- **DEV 不得自行 commit B/C 类变更。** 数据契约变更(加字段/改nullable/改message_id等)= C 类,改前列 schema diff 报用户。

### 4. 重改动先出技术方案,审了再写代码
重的改动(C 类 / 地基 / 数据契约 / 跨多处的大改),DEV **先出"技术方案 + 执行计划",经 Claude + 用户审、确认后再写代码**:
- 技术方案 = 怎么做的具体实现:精确 DDL / 代码改法 / SQL / 算法 / ★受影响的调用点(DEV 查真实代码列出)。
- 执行计划 = 分几步、每步改哪些文件、风险点。
- 落 `docs/research/` 或 `docs/prd/`,报用户 + Claude 审。
- 流程:Claude 的 design/tasks(为什么/做什么/验收)→ DEV 技术方案(怎么做)→ 审 → DEV 写代码 → 验收。
- ★小改(A 类 / 局部 / 可逆)不强制走方案层,直接做、验收说明即可(判断:路线错了返工成本大不大)。

### 5. 写代码单 agent 单分支
- 只读调研/盘点 → 可多 agent 并行。
- **写代码 / 改同一片区域 → 必须单一 agent + 单一分支**,禁止多 agent 同分支并行写。
- 迭代从干净 main 切分支(如 `w17-message-position`),指定一个 agent 全程做,验收后合回 main。
- 禁止在 main 上 force push。

### 6. 改完即提交
完成一个独立可测改动立即 commit;会话结束前 `git status` 必须干净。Commit 格式:`<type>: <50字内说明>`(type: feat/fix/chore/docs/refactor/style/test)。

### 7. 发版权收口
只有 **QA 身份(或用户亲自)** 能发版、改 VERSION、写发版记录。DEV 不碰这些。发版流程见 `docs/ops/release.md`。

### 8. 高风险操作停下报用户
数据迁移 / 清空 / 删除 / push 生产 / 部署 等不可逆操作:执行端做准备+备份+演练,**停在最后一步,留用户在场执行**。破坏性操作前的「三问」见 `docs/ops/prod-safety.md` §4。

### 9. ★模型切换/上下文压缩后,重新确认环境★
模型切换、上下文压缩、新会话后,agent 可能丢失环境记忆。关键操作前重新确认:`pwd`(对的目录?)、`hostname`(对的机器?)、`git status`(工作区状态?)。

### 10. 多 agent 默认分工与自动流转
默认主力使用 Claude Code 子 agent:PM agent 写任务单/定层级/排版本顺序,DEV agent 按任务单实现,QA agent 按验收矩阵验证和发版收口;Codex 默认作为 Review agent/用户助理,审任务单、实现边界和验收充分性。任务按 `docs/ops/task-doc-workflow.md` 的 `Status`、`Owner`、`Next Owner` 和“自动执行授权矩阵”流转:A 类本地修复、文档治理、本地/test 只读核实等可自动执行;prod、数据、schema、正式发版、权限/租户边界和破坏性操作必须用户批准。

---

## 产品提醒(非红线,但需注意)

- chatsift 当前定位:**只读诊断**——采集+分析+展示+工单/线索,客户回复在抖音原生页面由人工做,后台无发送入口。
- 引入"主动操作页面"能力(自动点开/滚动/发送/填表)的需求,**先过 Claude + 用户评估**,不直接实现。(随业务发展此定位可能调整,届时由用户决策)

---

## 身份与权限(简表)

| 身份 | 职责 | 不允许 |
|---|---|---|
| **PM** | 需求、PRD、方案 | 改代码、发版 |
| **DEV** | 业务代码、接口、SQL migration、Bug 修复、诊断 | 自行决定 B/C 类;发版;改 VERSION / 发版记录;碰别的 agent 的分支 |
| **QA** | 唯一发版执行者:版本同步、CHANGELOG、tag、生产部署 | — |
| **UI** | UI、样式、交互 | 改业务逻辑、发版 |

> 当前默认:Claude Code 分 PM / DEV / QA 子 agent 承担主力执行;Codex = Review agent / 用户助理,负责把关任务层级、边界、风险和验收,不默认接管实现。发版由 QA agent 或用户亲自执行。

---

## 文档体系

| 文档/目录 | 作用 |
|---|---|
| **AGENTS.md**(本文件) | 协作入口,核心规矩 |
| **PROJECT_STATUS.md** | ★唯一状态源★:版本/进度/遗留/发版记录/生产状态 |
| **CHANGELOG.md** | 版本变更记录(对应 tag),含"变更+复盘" |
| docs/ops/ | 治理细则:release.md(发版)、prod-safety.md(生产铁律)、versioning.md(编号规范) |
| docs/prd/ | 产品需求 + Claude 的 design/tasks |
| docs/reports/ | 验收报告(各 W 的 acceptance) |
| docs/research/ | 调研/盘点/现状核实(技术债盘点、专题调研、版本核实等) |
| docs/tasks/ | 单任务协作闭环(active/done),规范见 docs/ops/task-doc-workflow.md |
| docs/meta/ | 文档治理(document-governance/document-index)、技术债总纲、PROJECT_REALITY、SPEC_GAP |
| docs/archive/ | 已废弃保留(被现行文档取代,文件头标注取代关系) |

**规约:**
- 文档归类/命名规则见 `docs/meta/document-governance.md`;各文档位置见 `docs/meta/document-index.md`。
- 唯一状态源是 PROJECT_STATUS.md,不维护第二份进度文档。
- 任务单只承载单任务执行闭环,不得降低本文件、PROJECT_STATUS.md、docs/ops/prod-safety.md 的要求。
- 调研/盘点/核实类文档 → 进 `docs/research/`,文件名 `YYYY-MM-DD_主题.md`,开头带版本号。传给 Claude 时给路径 + 上传文档(Claude 读不到本地仓库)。
- 不提交 .env / node_modules / admin/dist / .agents / .claude / data 等运行产物。

---

## 编号约定(沟通用,简单高效)

> 解决"编号种类太多、字母复用、跨 agent 不统一"的混乱。只保留三种持久编号 + 一种临时引用。

**持久编号(进文档,要追溯)——三种,前缀不重复:**
| 编号 | 管什么 | 例 |
|---|---|---|
| `W##` | 产品迭代周次 | W16 / W17 |
| `M##` | 技术债(**唯一**技术债编号,废弃 D-A/U/T/G/P/E 等杂编号;严重度用 🔴🟡🟢 标签,不占编号) | M1 / M13 |
| `v#.#.#` | 版本号 / git tag | v0.4.0 |

**临时引用(对话当场,不进文档):**
- Claude 列多个问题/选项让用户拍板时,用 `Q1 / Q2 / Q3` 标注,**仅本轮有效,下一轮重置**。
- 用户回复时直接用 `Q1 选甲、Q2 同意、Q3 待定`。
- 用完即弃,不进文档,不要求全局唯一(所以永远够用)。

**固定术语(保留):**
- 变更分类 **"A 类 / B 类 / C 类"**(见核心规矩 §3):永远带"类"字,不单说字母,避免和别的编号混。

**原则:** 持久编号前缀不重复(W/M/v);方案选项不再单独字母编号(用 Q# 临时标);临时引用每轮重置。

---

## 接手清单(新 agent 上手)
1. 读本文件 → 懂核心规矩。
   读 `docs/ops/project-workflow.md` → 懂项目主流程怎么转。
2. 读 PROJECT_STATUS.md → 懂当前版本/进度/遗留。
3. 读当前迭代的 docs/prd 文档 → 懂手头任务。
4. 做开工前置(身份/环境/文件边界/git status)。
5. 遇 B/C 类、高风险、不确定 → 停下报用户。

---

## 项目信息
- 名称:多平台客服会话诊断系统(chatsift)
- 品牌:空月科技 KONGYUE TECH
- 技术栈:Node.js + Express + MySQL + Vue3 + Element Plus + Chrome Extension MV3
- 本地:~/vscode/chatsift;生产:/opt/chatsift @ 124.222.146.193
- 端口:server 3100、MySQL 3306、admin dev 5173;API 前缀 /api/v1/
- 入口:admin.kongyuekeji.com(平台/超管)、mychat.kongyuekeji.com(租户/员工)

---

## 变更日志
| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.7.0 | 2026-06-14 | §3 折入先判层,明确地基类问题先给长期正确方案 |
| v1.6.1 | 2026-06-14 | §8 破坏性三问改为指向 prod-safety §4,去重归一 |
| v1.6.0 | 2026-06-12 | §10 指向任务单自动执行授权矩阵,明确 A 类/文档/只读核实可放权,prod/数据/schema/发版等必须用户批准 |
| v1.5.0 | 2026-06-12 | 增加 Claude Code PM/DEV/QA 子 agent + Codex Review 默认分工,任务单自动流转但高风险不得自动批准 |
| v1.4.0 | 2026-06-11 | 文档体系补 docs/tasks 任务单协作闭环 + task-doc-workflow 指针 |
| v1.3.0 | 2026-06-07 | 文档体系补 docs/meta + docs/archive 行 + 指向 document-governance/index;DEPLOY 移入 docs/ops/deploy.md |
| v1.2.0 | 2026-06-05 | 加 §4"重改动先出技术方案审了再写代码"(三层流程);后续规则顺延编号 |
| v1.1.0 | 2026-06-04 | 加"编号约定"节:持久编号 W/M/v 三种 + 临时引用 Q# + 变更分类带"类"字 |
| v1.0.0 | 2026-06-04 | 初版:精简核心规矩 + 治理细则拆入 docs/ops/;身份 PM/DEV/QA/UI;独立 v0.x 版本线 |
