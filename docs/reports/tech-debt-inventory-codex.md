---
文档: 技术债 / 遗留问题清单
状态: 只盘点不修
日期: 2026-06-03
范围: PROJECT_REALITY.md、SPEC_GAP.md、HANDOVER、docs/reports、server/admin/plugin/scripts/tools、git 工作区
---

# 技术债 / 遗留问题清单

## 0. 核查方法

- 代码债:对照 `docs/PROJECT_REALITY.md`、`docs/SPEC_GAP.md`,并 grep `TODO/FIXME/HACK/deprecated/废弃/V1.9/send_runtime`。
- 工作区债:执行 `git status --short`、`git ls-files --others --exclude-standard`、核查 W14 提到的 `admin/src/main.js` / `admin/src/stores/user.js`。
- 挂起任务债:核查 `docs/chatsift_HANDOVER.md`、`docs/architecture/chatsift_HANDOVER.md`、`docs/reports/*.md`。

## 1. 真债清单

| 债项 | 类型 | 严重度 | 现状 | 建议处置 | 关联文件 |
|---|---|---:|---|---|---|
| 价格表 Excel 导入是假实现 | 代码债 / 功能空壳 | 🟡 | 还在。`importRows` 直接返回 `{ imported: 0 }`,无 Excel 解析/入库。 | 进入价格表专项时补真实导入;未做前前端不要暴露“已导入成功”的业务承诺。 | `server/src/controllers/v1/priceTableController.js:93`; `docs/SPEC_GAP.md:M1`; `docs/architecture/v1-api-spec.md:372` |
| `diagnosis_color` 全表内存过滤 | 性能债 | 🟡 | 还在。会话/线索列表带 `diagnosis_color` 时先取全量命中行,再 `buildDiagnosis` 内存过滤、slice 分页。 | 数据量上来前可暂缓;后续改为 SQL JSON 条件或物化诊断色字段。 | `server/src/controllers/v1/conversationsController.js:50`; `server/src/controllers/v1/leadsController.js:32`; `docs/SPEC_GAP.md:U3` |
| intent 硬编码规则与 DB 规则重复 | 规则维护债 | 🟡 | 还在。投诉硬编码正则与 `intent_rules` seed 重复;结构化预约规则也在引擎内硬编码。 | 清理周先统一“投诉优先”保留位置;若要租户化,把可配置词表与不可变优先级分层。 | `server/src/v1/intent-engine.js:10`; `server/sql/v1-schema.sql:211`; `docs/SPEC_GAP.md:U4` |
| 租车抽取词表与校验词表两套维护 | 规则维护债 | 🟡 | 还在。`completeness-engine` 有 env/default 词表,`business-rules` 有 validity 词表,车型口径不完全一致。 | 合并成单一 rules source,抽取和校验分别读同一份配置;保留 env override 时也从同一路径注入。 | `server/src/v1/completeness-engine.js:58`; `server/src/v1/completeness-engine.js:119`; `server/src/v1/business-rules.js`; `docs/SPEC_GAP.md:U5` |
| 旧 V1.9 runtime 仍被 build 进 `content.js` | 插件死代码 / 构建债 | 🟡 | 还在。queue/batch/runtime-manager/watchdog/recovery/chaos/bug-dump/rpc-bridge/self-check 等均存在并打包,采集链路不依赖。 | 单独开“清理周”:先确认 `legacy-collector/event-*` 不依赖,再整组删除 runtime/debug/self-check/chaos,重建插件并做真实采集回归。 | `plugin/build.js:40`; `plugin/runtime/*`; `plugin/content.js`; `docs/PROJECT_REALITY.md:5.1`; `docs/chatsift_HANDOVER.md:126` |
| `plugin/build.js` 模块清单引用不存在文件 | 构建债 | 🟡 | 还在。`adapter-runtime.js`、`adapters/base/*`、多平台 adapter、`content_legacy.js` 缺失,构建仅 warn 跳过。 | 与 V1.9 runtime 清理一并处理;保留真实模块清单,让缺文件从“可忽略 warn”变成异常。 | `plugin/build.js:41`; `plugin/build.js:56`; `plugin/build.js:67`; `plugin/build.js:89`; `docs/PROJECT_REALITY.md:2.2` |
| 发送相关 UI/常量残留 | 红线周边清理债 | 🟡 | 部分还在。可调用发送路径已删,但 popup 仍有 `autoReplySwitch`,constants 仍有 LK-SEND/send_runtime 语义,adapter selector 仍保留 sendButton/input selector。 | 保持“无发送路径”红线;清理时只删 UI/常量/selector 残留,不要引入任何回复入口。 | `plugin/popup/popup.html:159`; `plugin/popup/popup.js:367`; `plugin/shared/constants.js:74`; `plugin/adapters/douyin/private-message.adapter.js:82`; `docs/PROJECT_REALITY.md:2.8` |
| 两个过时 smoke 脚本仍在 | 测试债 | 🟡 | 还在。`douyin-private-regression.js` 依赖已删除快照;`runtime-lock-regression.js` 按 W5 前发送锁语义检查,报告中确认会失败。 | 清理或改写为 W5 后采集-only smoke;CI/验收不要再引用旧脚本。 | `scripts/smoke/douyin-private-regression.js`; `scripts/smoke/runtime-lock-regression.js`; `docs/reports/W12.6_acceptance.md:177`; `docs/chatsift_HANDOVER.md:127` |
| admin 残留 chat_rpa API 封装与页面能力 | 前端遗留债 | 🟡 | 还在。`ai.js/knowledge.js/keywordReplies.js/devices.js/plugin-update.js` 等仍在;`Plugins.vue` 仍有 AI/知识库/关键词配置入口。 | W15/W16 后按平台/租户视角重做时清理;先确认这些入口是否仍对生产可见。 | `admin/src/api/ai.js`; `admin/src/api/knowledge.js`; `admin/src/api/keywordReplies.js`; `admin/src/api/devices.js`; `admin/src/views/Plugins.vue`; `docs/SPEC_GAP.md:U10`; `docs/reports/W15-admin-perspective-investigation.md` |
| 控制台仍是 chat_rpa 视角 | 产品/前端债 | 🟡 | 还在。Dashboard 仍展示用户/插件/设备/AI调用/关键词/转人工等旧机器人指标,与 chatsift 只读分拣业务不匹配。 | 等 Chase 定“视角梳理”后,重做成会话/线索/工单/漏斗/提醒概览。 | `admin/src/views/Dashboard.vue`; `docs/reports/W15-admin-perspective-investigation.md:42` |
| 跨页下钻断裂、主体维度混乱 | 产品/前端债 | 🟡 | 还在。W15 报告确认会话→线索不可点、会话→工单跳列表丢 id、工单列表缺客户主体、线索缺平台维度。 | 等产品定主体观后统一导航:客户/会话/工单之间用明确 id 下钻。 | `admin/src/views/ConversationDetail.vue`; `admin/src/views/Workorders.vue`; `admin/src/views/Leads.vue`; `docs/reports/W15-admin-perspective-investigation.md` |
| `users.role` 与 `users.role_id` 双角色字段 | Schema 债 | 🟡 | 还在。`users` 同时有旧数字 `role` 和新 `role_id`,当前逻辑主要用 `role_id`。 | 多账号稳定后迁移清理旧 `role`,或明确只作为兼容字段并冻结写入。 | `server/sql/00_reused_tables.sql:15`; `docs/reports/W16-permission-investigation.md:31` |
| `data_scope` 只部分接入 | 权限模型债 | 🟡 | 部分还在。`applyDataScope` 被 dashboard/logs/plugin 用;v1 业务接口仍固定 `tenant_id=req.user.id`,不支持超管代入租户。 | 若平台运维要跨租户排障,做 `is_super + 指定 tenant` 专项;若不需要,登记为设计取舍。 | `server/src/utils/data-scope.js`; `server/src/controllers/v1/_shared.js:9`; `server/src/controllers/dashboardController.js`; `docs/reports/W16-permission-investigation.md:44` |
| heartbeat / dom-adapter-config 仍是占位 | 采集配置债 | 🟡 | 还在。heartbeat 恒 `config_version=1`;dom config `selectors:null`,插件始终用内置选择器。 | 和 dom-collector 外置选择器维护一起做;先定义 selectors schema 和版本发布机制。 | `server/src/controllers/v1/eventsController.js:132`; `server/src/controllers/v1/eventsController.js:139`; `docs/SPEC_GAP.md:C6`; `docs/reports/dom-collector-investigation.md:121` |
| heartbeat / dom-adapter-config 双路径挂载 | API 整理债 | 🟢 | 还在。直挂 `/api/v1/heartbeat` 与 `/api/v1/events/heartbeat` 两套路径。 | 保留兼容也可以;若要清理,先查插件和外部调用,再下线 events 子路径。 | `server/src/app.js:37`; `server/src/routes/v1/events.js:9`; `docs/SPEC_GAP.md:U6` |
| `session-identity-resolver` 头像身份逻辑已失效但仍在 | 死代码 / 误导债 | 🟢 | 还在。真实采集用 `legacy-collector` 的 pageKey+nickname,不调用 avatar resolver。 | 与 V1.9 runtime 清理同组删除;删除前确认 dom-collector/accountId 方案是否替代。 | `plugin/runtime/session-identity-resolver.js`; `plugin/runtime/legacy-collector.js:52`; `docs/SPEC_GAP.md:U8` |
| `analysis_jobs` schema 注释与实际机制不符 | 文档/Schema 债 | 🟢 | 还在。表注释说“内存 queue 崩溃恢复”,实际 analyzer 直接 DB 轮询。 | 改 schema 注释和 api-spec 备注即可,不影响运行。 | `server/sql/v1-schema.sql`; `server/src/v1/analyzer.js`; `docs/PROJECT_REALITY.md:1.15` |
| accountId 未采,客户稳定 ID 仍缺 | 采集准确性债 | 🟡 | 还在。当前 conversation_id 仍按 pageKey+nickname 合成;dom-collector 调研指出 URL `accountId` 可能可用,但未接入且需真实核查稳定性。 | 先让 Chase 切换多个真实会话确认 URL accountId 稳定;确认后再改采集 conversation_id,并设计历史合并迁移。 | `plugin/runtime/legacy-collector.js:62`; `docs/reports/dom-collector-investigation.md:136`; `docs/reports/dom-collector-investigation.md:170` |
| W16 生产拆分未闭环 | 发布/环境债 | 🟡 | 还在。报告显示本地 Task1-7 就绪,生产 DNS/证书/建租户/迁移/nginx reload/上线验收待执行。 | 单独按生产上线清单执行;迁移前备份并离机保存。 | `docs/reports/W16_acceptance.md:13`; `docs/reports/W16_acceptance.md:48`; `deploy/nginx/mychat.kongyuekeji.com.conf`; `scripts/w16_migrate.js` |
| dom-collector 外置选择器链路未接入运行时 | 工具链债 | 🟡 | 还在。工具已改造成只读点位调研,但输出仍人工转发,没有接入 `dom-adapter-config` 下发。 | 等 heartbeat/dom-config 专项,把工具输出 JSON 纳入平台页面配置。 | `tools/dom-collector/README.md`; `docs/reports/dom-collector-refactor.md`; `docs/reports/dom-collector-investigation.md` |

## 2. 已解决 / 已顺手闭环项

| 债项 | 类型 | 严重度 | 现状 | 建议处置 | 关联文件 |
|---|---|---:|---|---|---|
| `platform-comparison` 文档名与实现不一致 | 文档债 | 🟢 | 已解决。api-spec 已回写为 `/analytics/by-page`。 | 无需处理。 | `docs/SPEC_GAP.md:M2`; `docs/architecture/v1-api-spec.md` |
| 日志中心孤儿页 | 前端缺页 | 🟢 | 已解决。当前 router 有 `/logs`,且 `admin/src/views/Logs.vue` 存在。 | 若后续视角梳理不保留日志中心,再按产品处理。 | `admin/src/router/index.js:32`; `admin/src/views/Logs.vue` |
| auth 不补普通用户 permissions | 权限 bug | 🟢 | 已解决。`auth.js` 已在 token 缺 permissions 且非超管时从 DB 补权限点。 | 保留 W16 回归;生产需确认 server rebuild 生效。 | `server/src/middleware/auth.js:31`; `docs/reports/W16_acceptance.md:28` |
| W14 提到的 `admin/src/main.js` / `admin/src/stores/user.js` 悬空文件 | 工作区债 | 🟢 | 已解决。两个文件均已被 Git 跟踪,最近提交为 `faf1261`。 | 无需处理。 | `admin/src/main.js`; `admin/src/stores/user.js` |
| U9 非主路径时间戳代码修复 | 采集时间债 | 🟡 | 代码已修。SPEC_GAP 标记“已修复(待真实验收)”,W12.6 acceptance 有模拟验证。 | 仍需真实重采验收,见挂起任务债。 | `docs/SPEC_GAP.md:U9`; `docs/reports/W12.6_acceptance.md` |
| adapter `sendReply/prepareReply` 可调用发送路径 | 红线债 | 🟢 | 已解决。grep 未发现 adapter 外部可调用 `sendReply/prepareReply`;现存为 UI/常量/selector 残留。 | 只需清残留,不要重开任何发送入口。 | `plugin/adapters/douyin/*.adapter.js`; `docs/PROJECT_REALITY.md:2.8` |

## 3. Git / 工作区债

| 债项 | 类型 | 严重度 | 现状 | 建议处置 | 关联文件 |
|---|---|---:|---|---|---|
| 工作区不干净 | 工作区债 | 🟡 | 还在。盘点前 `git status --short` 显示 `?? tools/`;无 tracked diff。 | 决定 `tools/dom-collector` 是重新纳入仓库还是删除本地副本;处理前不要混入业务 commit。 | `tools/dom-collector/*` |
| dom-collector 文件被清理提交后又以未跟踪形式出现 | 工作区债 | 🟡 | 还在。`git log -- tools/dom-collector` 显示曾提交又清理,当前 12 个文件未跟踪。 | 若要保留工具,按当前只读版重新 add/commit;若只是本地残留,清理前先确认不是 Chase 新样本。 | `tools/dom-collector/README.md`; `tools/dom-collector/content.js`; `tools/dom-collector/popup/*` |
| W15/W16 调研报告是否悬空 | 工作区核查 | 🟢 | 已解决。`docs/reports/W15-admin-perspective-investigation.md`、`W16-permission-investigation.md` 已被 Git 跟踪。 | 无需处理。 | `docs/reports/W15-admin-perspective-investigation.md`; `docs/reports/W16-permission-investigation.md` |

> 说明:写入本报告后,`docs/reports/tech-debt-inventory.md` 本身会成为新的未提交文件,这属于本任务产物。

## 4. 挂起任务债

| 债项 | 类型 | 严重度 | 现状 | 建议处置 | 关联文件 |
|---|---|---:|---|---|---|
| W12.6 真实重采验证未闭环 | 验收债 / 采集准确性 | 🔴 | 还在。报告明确未清空 `chase` 真实数据重采;HANDOVER 要求真实时间准确率 ≥95%、raw_snapshot `time_source` 绝大多数为 `precise-invisible`。 | Chase 重新加载插件→真实重采→查 time_source 分布→抽样对比 hover 时间;通过后 W12.6 才收口。 | `docs/reports/W12.6_acceptance.md:191`; `docs/chatsift_HANDOVER.md:141` |
| U9 非主路径时间戳真实验收未闭环 | 验收债 | 🟡 | 还在。代码模拟 10/10,但 SPEC_GAP 仍写“待真实验收”。 | 与 W12.6 真实重采一起验;关注非 clue/life 页或 bubble 兜底路径。 | `docs/SPEC_GAP.md:20`; `plugin/adapters/douyin/private-message.adapter.js` |
| W13 消息聚合展示待启动 | 产品待办 | 🟢 | 待启动。HANDOVER 写明 W13 依赖 W12.6 验证后再定设计。 | 不算当前缺陷;排期时先卡 W12.6 真实验收。 | `docs/chatsift_HANDOVER.md:145` |
| 清理周未启动 | 清理待办 | 🟡 | 还在。HANDOVER 指向旧 V1.9 runtime + 过时 smoke 脚本统一清理。 | 排一个低风险清理迭代,避免夹在业务功能里做。 | `docs/chatsift_HANDOVER.md:150`; `docs/reports/W5_inventory.md` |
| W15 视角梳理等待产品方案 | 产品待办 | 🟡 | 还在。W15 报告只诊断,等待 Chase 定主体观、控制台是否重做、命名标准等。 | 先定产品信息架构,再改 UI;不要零散修表头。 | `docs/reports/W15-admin-perspective-investigation.md:141` |
| W16 生产上线与数据迁移待 Chase 拉闸 | 发布待办 | 🟡 | 还在。报告明确本地就绪,生产待 DNS/证书/备份/建租户/迁移/权限 SQL/nginx reload。 | 按 W16_acceptance 生产清单分步骤执行,每步验收后再下一步。 | `docs/reports/W16_acceptance.md:48` |
| private-message nickname 修复后的历史脏数据处理 | 数据清理债 | 🟢 | 可能还在。报告待办写“重采验证通过后删除会话 id=6 及关联数据、复看方向边界”。后续是否已处理未在报告闭环。 | 若库里仍有会话 id=6/旧误读样本,列清单确认后清理;生产数据不要盲删。 | `docs/reports/private-message-nickname-fix.md:30` |

## 5. 已知取舍,登记备查但不按债处理

| 事项 | 类型 | 严重度 | 现状 | 建议处置 | 关联文件 |
|---|---|---:|---|---|---|
| 同页面同昵称客户可能合并 | 已知取舍 | 🟢 | 接受现状。conversation_id 当前用 pageKey+nickname;无稳定客户 ID 前避免头像导致拆会话。 | 不作为 bug;若 accountId 稳定性确认后再升级。 | `plugin/runtime/legacy-collector.js:62`; `docs/reports/W6.5_acceptance.md:164` |
| outbound 精确时间降级 | 已知取舍 | 🟢 | 接受现状。inbound 可读 invisible 精确时间;outbound 可能只能走锚点/相对/单调保序。 | 不作为债;只要求顺序和用户可读时间不明显错乱。 | `docs/reports/W12.6_acceptance.md`; `plugin/adapters/douyin/private-message.adapter.js` |
| 原生 message_id 采不到,使用合成 ID | 已知取舍 | 🟢 | 接受现状。DOM 无稳定 msg id,当前按会话+方向+内容+出现序号合成,服务端再用唯一键去重。 | 不作为债;若后续能从网络/URL 稳定拿到再替换。 | `plugin/runtime/legacy-collector.js:91`; `plugin/shared/dom-utils.js`; `docs/reports/dom-collector-investigation.md:175` |
| 准实时提醒不用 WebSocket | 已知取舍 | 🟢 | 接受现状。后台 30s 轮询 `/leads/recent`,只提醒投诉/高意向/完整预约。 | 不作为债;量级上来或 SLA 更严时再评估 SSE/WebSocket。 | `admin/src/layouts/MainLayout.vue`; `server/src/controllers/v1/leadsController.js` |
| 业务规则先硬编码租车,未来再租户化 | 已知取舍 | 🟢 | 接受现状。HANDOVER 明确一期只有租车,未来第二行业再做租户配置。 | 不作为当前债;但新增行业前必须先做规则配置化。 | `server/src/v1/business-rules.js`; `docs/chatsift_HANDOVER.md:118` |

## 6. 优先级建议

1. 🔴 先闭环 W12.6 真实重采验证。时间/顺序是采集可信度地基,不闭环会影响后续所有页面判断。
2. 🟡 第二优先处理工作区不干净。`tools/dom-collector` 未跟踪会污染后续 commit 边界。
3. 🟡 第三优先排一个“清理周”:V1.9 runtime、过时 smoke、build 清单缺文件、发送 UI/常量残留放一起做。
4. 🟡 第四优先等 Chase 定 W15 视角方案后重做 Dashboard/跨页下钻/命名统一。
5. 🟡 W16 生产上线按发布窗口执行,不要和代码清理混在一个变更里。
