# chatsift — 项目说明(给 Claude Code)

chatsift 是**抖音客服私信的只读分拣分析平台**:插件纯 DOM 采集对话上报 → server 五引擎分析(意图/完整度/阶段/工单/线索)→ MySQL → admin 后台四页 + 运营漏斗 + 准实时提醒。由旧的"自动回复 RPA 插件 chat_rpa"转型而来。

## 最高红线
**永不发送(Observe First)**:只读采集/展示/分析,绝不发送或回复任何消息;后台无、也永不会有发送入口。任何"加回复框/后台直接回"都触红线,先报 Chase 确认。

## 工作方式
- 接手第一读:`docs/archive/chatsift_HANDOVER.md`(项目定位/红线/口径/进度/协作分级)。
- 变更分级见 `docs/archive/COLLABORATION.md`:A 类(实现细节)可自做并在报告说明;**B 类(设计意图/验收口径/数据契约)、C 类(动已验收代码)必须先停、报 Chase 确认再做,不自行 commit**。
- 任何不清楚的(口径/意图/验收/数据含义)一律先问,不"自认为"、不猜测后开干。
- 不改 `chat_rpa`(只读参考)。代码真实现状以 `docs/meta/PROJECT_REALITY.md` 为准,文档与代码差距见 `docs/meta/SPEC_GAP.md`。

## 运行拓扑
- monorepo(npm workspaces):`plugin`(MV3 采集插件,`npm run build:plugin` concat 生成 content.js)/ `server`(Express,端口 3100,API 前缀 `/api/v1`,分析 worker 轮询 analysis_jobs)/ `admin`(Vite+Vue3+ElementPlus,dev 5173)。
- MySQL `chatsift` 库;LLM 用 DeepSeek,key/配额按租户存 tenant_llm_config。

## 文档索引(docs/ 下已是"全部任务文档 + 工作报告")

### 顶层 / 纲领
- `docs/archive/chatsift_HANDOVER.md` — 接手交接总纲:定位、红线、已锁口径、进度、协作分级(第一必读)。
- `docs/archive/COLLABORATION.md` — 三方协作协议:A/B/C 变更分级、文档落盘纪律、版本号规范。
- `docs/archive/ROADMAP_post_mvp.md` — MVP 后路线图:W10→W11→W12 的顺序与依赖理由。
- `docs/meta/PROJECT_REALITY.md` — 只读代码审计的真实现状(引擎口径/采集链路/schema/残留),带文件行号。
- `docs/meta/SPEC_GAP.md` — 文档↔代码差距清单(MISSING / CONFLICT / UNDOCUMENTED)。
- `docs/archive/OPS.md` — 仓库管理 + 发版规范 + 环境安全(改编自 chat_rpa,待确认后生成脚本)。
- `docs/ops/deploy.md` — 服务器重置(只跑 chatsift,老项目彻底废弃)+ 部署拓扑 + 待生成配置清单(入口复用 admin.kongyuekeji.com)。
- `README.md` / `docs/meta/MIGRATED_FROM_CHAT_RPA.md` — 项目自述 / 从 chat_rpa 迁移说明。

### PRD
- `docs/prd/V1.0/PRD_v1.0.0.md` — chatsift 一期 PRD。
- `docs/prd/V2.0/PRD.md` — **转型前**旧"AI 客服系统"PRD(含自动回复/转人工,历史对照,勿当现行需求)。
- `docs/prd/V2.0/runtime-disposition.md` — V1.9 runtime 死代码的去留处置说明。
- `docs/prd/V1.0/W1|W2/*` — 早期 W1/W2 打包稿(历史)。

### docs/prd/V1.0/(Claude 产出:设计 design + 任务 tasks)
- `v1-api-spec.md` — V1 API 规格(部分接口/结构已被后续周次演进覆盖,以 SPEC_GAP 为准)。
- `W2_design.md` — 规则意图引擎设计。
- `W3_design.md` — goal/completeness/workorder 三引擎设计(字段与评分口径已被 W7/W10 取代)。
- `W4_design.md` / `W4_tasks.md` — 采集插件(DOM 采集 + 合成 ID + 批量上报)设计与任务。
- `W4.5_tasks.md` — 采集修复周任务(平台工具函数恢复等)。
- `W5_tasks.md` — 删除发送/自动回复代码、切只读探针(红线落地周)。
- `W6_tasks.md` / `W6.5_tasks.md` — 后台会话/工单中心;会话合并 + 完整度累计修复。
- `W7_design.md` / `W7_tasks.md` — 线索引擎 + 业务规则配置化预留 + 租车 6 字段校准。
- `W8_design.md` / `W8_tasks.md` — LLM(DeepSeek)接入 + 租户化配额 + 降级 + 配置页。
- `W9_design.md` / `W9_tasks.md` — 运营分析(漏斗/意图分布/线索分层/趋势/页面对比)。
- `W10_design.md` / `W10_tasks.md` — 字段有效性校验(规则优先 + AI 兜底,三态 valid/invalid/unknown)。
- `W11_design.md` / `W11_tasks.md` — 诊断颜色标签(红橙绿灰,实时拼)+ 就地快速复核。
- `W12_design.md` / `W12_tasks.md` — 准实时四段时序 + 后台轮询主动提醒。
- `W12.5_tasks.md` — intent 口径修正(最近 20 条 inbound)+ 结构化预约让位投诉 + 插件自动刷新。
- `W12.6_tasks.md` — 消息时间/顺序修复(优先读每条 invisible 精确时间标签)。

### reports/(执行端产出:验收 acceptance / 诊断 diagnosis / 盘点 inventory)
- `W4_acceptance.md`、`W4.5_acceptance.md` + `W4.5_diagnosis.md` — 采集周验收与诊断。
- `W5_acceptance.md` + `W5_inventory.md` — 删发送验收 + 发送相关代码盘点。
- `W6_acceptance.md` + `W6_inventory.md`、`W6.5_acceptance.md` + `W6.5_diagnosis.md` — 后台与会话合并修复验收/诊断。
- `W7_acceptance.md` … `W12_acceptance.md` — 各周验收报告。
- `W12.5_acceptance.md`、`W12.6_acceptance.md` + `W12.6_diagnosis.md` — 最近两周口径/时间修复的诊断与验收。
