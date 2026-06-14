# 任务：B3 README 校准 + B4 deploy 拆分(看 diff 组,内容风险最高)

Owner: CC4
Role: 文档治理
Status: in_progress
Next Owner: Review agent（codex）→ Chase
Branch: main（在 chatsift-gov 治理 worktree;纯文档,守卫放行;两条各一个 commit）
Created: 2026-06-14
Problem Layer: 文档治理
Change Class: B 类（动根五件套 README + 历史文档 deploy）
Approver: Chase
Status Source Impact: none
Commit Policy: **两条各独立一个 docs commit**

前置依赖: 前序治理已合并。**在 chatsift-gov 工作区执行**,不碰 W23 工作区。

---

## 1. PM 指令

### 用大白话讲

这是本轮"丢内容风险最高"的两份,所以**做完都要给 Chase 看改动摘要**,不盲过。
- **B3 README**:README 冻在了项目开张期(技术栈 Node 18、写着不存在的 `docs/architecture`/`docs/decisions` 目录、内部自相矛盾)。把它**校准到现状**,回归"对外简介",过期的内部状态删掉、结构改成指向 document-index。
- **B4 deploy 拆分**:deploy.md 一半是早期一次性方案(chat_rpa 重置、"待生成清单"其实早做完了),一半是现行事实(上线记录、备份要求)。把**一次性历史部分搬去 archive(标 superseded),不删**;现行事实留下;修掉假的状态头。

### 铁律:搬去 archive,不是删

B4 移走的历史内容,要**完整搬进 `docs/archive/`** 并在原处/新处标注取代关系(按 document-governance 的归档规约),**不是直接删除**。任何拿不准"算历史还是现行"的段落 → 停下报,别擅自移。

### 文件边界
- **允许改**:`README.md`、`docs/ops/deploy.md`、`docs/archive/`(新增归档文件)。
- **禁止改**:业务代码、其他规则正文、`docs/prd/V1.0/W23_position_realign_recovery.md`、project-workflow.md(账本最后统一同步)。

### 上位规则
- 不覆盖 AGENTS / PROJECT_STATUS / prod-safety。冲突即停。

---

## 2. 执行步骤

**条 1 — B3 README 校准(对照现状,逐项核对再改)**
1. 以 `CLAUDE.md`、`docs/ops/server-access.md`、`docs/meta/document-index.md`、实际目录为现状基准,逐项核对 README:
   - 技术栈版本(如 Node 版本)对齐现状。
   - 仓库/文档结构:删掉不存在的目录(`docs/architecture`、`docs/decisions`、ADR-004 等),改成"文档位置见 `docs/meta/document-index.md`"。
   - 内部自相矛盾处(如 MIGRATED 文件路径)统一。
   - 与 chat_rpa 关系、产品定位框架等过期表述,校准到现状(当前阶段/版本一律指向 PROJECT_STATUS,不写死)。
2. 拿不准某项"现状到底是什么" → 停下报,不臆测。
3. README 若有文档头版本/changelog 则同步 +1;无则按 document-governance 处理。
4. commit:`docs: README 校准到现状`

**条 2 — B4 deploy 拆分(历史搬 archive,现行留下)**
1. 先把 deploy.md 内容分两类,**列给 Chase 看一眼分类再动手**(可在 §5 先贴分类清单):
   - 一次性历史(chat_rpa 重置方案、"§6 待生成配置清单"已完成项、早期决策记录)→ 搬。
   - 现行事实(目标拓扑、上线记录 §6.1/§6.2、备份机制 §5、回滚 §7、隔离口径)→ 留。
2. 把历史类**整段搬进** `docs/archive/`(新文件,文件头标"由 deploy.md 拆出,历史留存,现行见 docs/ops/deploy.md"),原 deploy.md 留指针或删除该段(段落级,不碎删)。
3. 修文档头:把"状态:待确认(方案稿)"改为反映现状(已上线运行);文档头版本与 changelog 对齐。
4. 其余 `OPS §x` 历史指针若指向已不存在的地址,一并修正或标注(在本条范围内顺手清,拿不准则留注记)。
5. commit:`docs: deploy 拆分历史到 archive,保留现行事实`

> 每条 commit 后跑 `bash scripts/check-governance.sh`,期望 `WARN 0`。

---

## 3. Stop Gates
- 任何段落拿不准"历史 vs 现行" → 停下报,不擅自移/删。
- B4 要删(而非搬)任何历史内容 → 停下。归档是搬,不是删。
- README 某项现状无法确认 → 停下报,不臆测填。
- `check-governance` 出新 `WARN` → 停下查版本对齐。
- 误触业务代码 / W23 PRD / project-workflow / 其他规则 → 停下。
- 工作区不干净且有无关改动 / merge conflict。

---

## 4. 验收标准
- [ ] README 技术栈、目录结构、内部矛盾、过期定位均已校准;结构改为指向 document-index;当前阶段/版本指向 PROJECT_STATUS,无写死。
- [ ] deploy.md 一次性历史已**搬入 archive**(非删除),archive 文件头标注取代关系;现行事实保留在 deploy.md。
- [ ] deploy.md 状态头已反映现状(非"待确认方案稿")。
- [ ] 两条各一个 commit;被改文档头版本 == changelog 顶行;最终 `check-governance` `WARN 0`。
- [ ] 未碰业务代码 / W23 PRD / project-workflow / 其他规则正文。

> 给 Chase 看的:① README 改动摘要(扫一眼有没有把对的也删了);② deploy 的"历史/现行分类清单 + 搬去 archive 的内容"(确认是搬不是删、分类无误)。这两份都看摘要,不盲过。

---

## 5. 执行记录(由 CC 填写)
- 状态记录:
- 2026-06-14 `pending` → `in_progress`:Codex 在 `/Users/caihongyang/vscode/chatsift-gov` 执行;工作区基线干净。
- B3 README 改动摘要(逐项:改了什么/依据现状哪份):
  - 仓库结构:删除不存在的 `docs/architecture`、`docs/decisions` 和根 `MIGRATED_FROM_CHAT_RPA.md` 路径;改为指向 `docs/meta/document-index.md` 与 `docs/meta/MIGRATED_FROM_CHAT_RPA.md`。依据:`docs/meta/document-index.md`、实际目录。
  - 技术栈:服务端 Node 18 改为 Node 20;删除 ADR-004 过期指针。依据:`server/Dockerfile`、`CLAUDE.md`。
  - chat_rpa 关系:去掉写死的旧产品版本,改为已停止作为现行产品使用;迁移说明路径改到 `docs/meta/`。依据:`CLAUDE.md`、`docs/meta/document-index.md`。
  - 文档导航:删掉旧 V2.0 PRD 作为主入口的误导,改为 AGENTS / PROJECT_STATUS / document-index / MIGRATED 入口。依据:`docs/meta/document-index.md`。
- B4 deploy 分类清单(历史→搬哪 / 现行→留)+ archive 新文件路径:
- 各文档头版本 bump:
- 最终 check-governance 输出:
- 异常 / Stop Gate:

## 6. 最终结果(由 CC 填写)
- 状态:完成 / 阻塞
- 产物(改动文件 + archive 新文件 + commit 号):
- 是否触碰禁止项:
- 未决项:

## 7. PM 审核(Review / Chase)
- 结论:approved / rejected
- 下一步:

## 8. 变更日志
| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0.0 | 2026-06-14 | 初版:B3 README 校准到现状 + B4 deploy 历史拆入 archive(只搬不删)、修状态头 |
