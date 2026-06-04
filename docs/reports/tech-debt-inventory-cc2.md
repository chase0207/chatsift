---
文档: chatsift 技术债 / 遗留问题清单 (cc2 独立盘点)
版本: v1.0.0
日期: 2026-06-03
作者: Claude Code(W16 实施者视角,独立于 -cc / -codex 重新逐条核实)
方法: grep/读真实代码逐条核实现状 + 第一手 W16 实施观察 + git 工作区核查 + docs/reports 未闭环承诺核查。
口径: **只盘点不修**。区分"真债(建议处理)"与"已知取舍(登记备查,不处理)"。
严重度: 🔴阻断 / 🟡中 / 🟢低(整洁性,无功能影响)。现状: 还在 / 已解决。
---

> **总览:无 🔴 阻断级债,功能全部可用。** 债集中在:死代码/冗余、性能隐患、文档滞后、发版未推,以及 W16 引入的"用户分类靠 is_super"待演变点。
> **本版相对 -cc / -codex 的增量**(我是 W16 实施者,第一手):① W16 后最新 git/发版状态 ② is_super 划分内部/外部的局限(E1)③ 生产数据隔离的实际取舍(T10)④ 多 agent 并行协调债(G4)⑤ DEPLOY 落地流程未写入(E3)。
> **自 6-01 基线后已顺手解决**:M3 日志中心孤儿页(Logs.vue 已建)、U9 非主路径时间戳(代码已修待验收)、W13 消息聚合(Aggregate.vue 已建)、W14 悬空文件(随 v0.2.8 提交)。

---

## A. 真债(建议处理)

### 代码债

| 编号 | 项 | 严重度 | 现状(已核实) | 建议处置 | 关联文件:行 |
|---|---|---|---|---|---|
| C1 | 价格表 Excel 导入空 stub | 🟡 | 还在。核实 `importRows` 仅 `ok({imported:0})`,无解析/入库 | 实现 Excel 解析,或拆掉接口+前端导入入口(别让"看似能用实则不入库") | `priceTableController.js:93` |
| C2 | diagnosis_color 全表内存过滤 | 🟡 | 还在。list 带 diagnosis_color 时全表取→buildDiagnosis→内存筛→再分页,**无 LIMIT** | 把诊断色下推 SQL(JSON 条件)或物化诊断色字段;数据量大前可暂缓 | `conversationsController.js`、`leadsController.js` |
| C3 | 两套租车词表各自维护 | 🟡 | 还在。抽取(completeness-engine,含"七座/七座车")vs 校验(business-rules,含"7座")口径不一,边界上"抽得到校验不过" | 合并单一词表源,抽取/校验读同一份 | `completeness-engine.js`、`business-rules.js` |
| C4 | heartbeat/dom-config 双路径挂载 | 🟢 | 还在。核实 `app.js:37-38` 直挂 + `routes/v1/events.js:9-10` 子路径各一份 | 删一处 | `app.js:37-38`、`routes/v1/events.js:9-10` |
| C5 | users 双角色字段 role+role_id | 🟢 | 还在。核实 `role TINYINT(1普通/9管理员)` + `role_id FK` 并存;W16 鉴权用 is_super/role_id,`role` 仅兼容 | 统一到 role_id,文档登记 role 为兼容字段 | `00_reused_tables.sql:19-20` |
| C6 | intent 硬编码 complaint 正则与 DB 种子重复 | 🟢 | 还在。投诉正则硬编码 + `intent_rules` 种子各一份 | 二选一,避免改一处漏一处 | `intent-engine.js:10`、intent_rules seed |
| C7 | data_scope 预留未接入 | 🟢 | 还在。核实业务 controller + `permission.js` **都不读 data_scope**(数据范围纯靠 tenant_id;权限靠 is_super+permissions) | 多租户/部门维度时再接;现登记 | `roles.data_scope`、`permission.js` |
| C8 | V1.9 runtime 死代码打进 content.js | 🟢 | 还在。queue/batch/runtime-manager/watchdog/recovery/chaos/bug-dump/rpc-bridge/state-machine/self-check/session-parser(stub)/session-identity-resolver 均打包,采集链路不依赖。**清理时保留 LIVE:legacy-collector / event-collector|queue|uploader / feature-flags / adapter-registry / lk-tracer** | 清理周整组删 + 重建插件 + 真实采集回归 | `plugin/runtime/*`、`content.js` |
| C9 | build.js 死引用 | 🟢 | 还在。MODULES 引不存在文件(adapter-runtime、adapters/base/*、多平台 adapter、content_legacy.js),仅 warn 跳过;头注释仍指已删的 content_legacy | 清单清理 + 注释更新(随 C8) | `build.js` |
| C10 | admin 残留 chat_rpa api 封装 | 🟢 | 还在。ai/keywordReplies/knowledge/columnPrefs/devices/plugin-update.js,对应能力 chatsift 已不提供 | 删未用封装(随 W15/W16 前端重做) | `admin/src/api/*` |
| C11 | 两个过时 smoke 必失败 | 🟢 | 还在。`douyin-private-regression`(依赖已删快照)、`runtime-lock-regression`(W5前发送锁语义);报告确认会失败 | 删或改写为采集-only smoke(可借 dom-collector 快照) | `scripts/smoke/` |
| C12 | api-spec 文档需复核 | 🟢 | C1-C7/U1-U3 在 SPEC_GAP 记"已回写 api-spec v1.1.0"(我 W16 期间做的);建议核一遍真同步 | 复核 v1-api-spec.md | `docs/architecture/v1-api-spec.md` |

### 产品/前端债(承 W15 调研结论)

| 编号 | 项 | 严重度 | 现状 | 建议处置 | 关联 |
|---|---|---|---|---|---|
| C13 | 控制台仍 chat_rpa 视角 | 🟡 | 还在。Dashboard 展示用户/插件/设备/AI调用/关键词/**转人工**(机器人指标),与只读分拣不符 | W15 视角梳理后重做成 会话/线索/工单/漏斗 概览 | `Dashboard.vue`、W15报告 |
| C14 | 跨页下钻断裂 + 主体维度混乱 | 🟡 | 还在。会话→线索不可点、会话→工单跳列表丢 id、工单列表无客户主体、线索无平台维度 | 产品定主体观后统一 id 下钻 | `ConversationDetail/Workorders/Leads.vue`、W15报告 |
| C15 | platform_page 一字段三显示 + 客户多叫法 | 🟢 | 还在。"页面"/"抖音私信"/"private-message" 混用;客户/客户昵称/抖音昵称/真实姓名/客户ID 分散 | 命名统一 | W15报告 |

---

## B. 已知取舍(登记备查,**不处理**)

| 编号 | 取舍 | 为什么接受 | 关联 |
|---|---|---|---|
| T1 | 同名客户合并(conversation_id = pageKey+昵称 hash) | 无稳定客户 ID 阶段的权衡 | `legacy-collector.js _buildSessionInfo` |
| T2 | outbound(客服)消息时间降级(继承上一条+1s,inherited/estimated) | 客服消息无精确隐藏时间,只保序不冒充采集当刻 | `private-message.adapter.js _resolveOccurredAt` |
| T3 | data_scope 'dept' 未实现(self/all 也未真接入) | 部门维度暂不需要 | C7 |
| T4 | 分析纯 FIFO,无优先级双队列 | W12 设计明写"先评估真积压才加" | `analyzer.js takeJobs` |
| T5 | heartbeat 恒 config_version=1 / dom-config 不下发 selectors | 选择器走插件内置,服务端下发未启用(占位) | `eventsController` |
| T6 | analysis_jobs 注释"内存queue"与实现(DB轮询)不符 | 仅注释滞后,行为正确 | `v1-schema.sql` |
| T7 | 红线发送残留(popup autoReplySwitch 强制 false、content.js 打包 LK-SEND-* 死代码、adapter 保留 sendButton/input selector) | **无激活发送路径,send_runtime_v19=false(已核实)**;清理随 C8 | `popup.js`、`constants.js`、`content.js` |
| T8 | intent 硬编码前置规则(complaint + 结构化预约先于 DB 规则) | W12.5 追认为既定(投诉优先 / 结构化预约让位投诉);其"重复维护"部分是 C6 | `intent-engine.js` |
| T9 | session-identity-resolver 的 avatar 身份逻辑 | 采集链路不含头像(W6.5 取舍);本体随 C8 清理 | `session-identity-resolver.js` |
| ★T10 | **W16:生产数据不迁移,admin 仍是 tenant_id=1 owner** | admin 名下有 2 条测试数据,理论上手敲 /api 能查到自己 tenant_id=1 数据。数据隔离靠 `tenant_id=user.id`(admin 只看自己)+ 前端域名过滤 + 登录域名限制。这是新方案"数据零迁移"的接受取舍——admin 看自己测试数据无害,关键是它不进 mychat 外部入口 | `_shared.js tenantId`、`Login.vue` |

> 文档滞后类(SPEC_GAP C1-C7:漏斗三环、by-page 改名、completeness 6字段占比、pricing payload、analysis_jobs 注释、heartbeat 占位、词表 env 名)——均"以代码为准",已回写 api-spec v1.1.0,归 C12 复核,不单列。

---

## C. git / 工作区债

| 编号 | 严重度 | 现状 | 说明 / 建议 |
|---|---|---|---|
| G1 | 🟡 | 还在 | **本地领先 origin/main 约 11 commit 未推**,含 W16 的 **v0.3.0 / v0.3.1 两个新发版 tag**(+ 旧 v0.2.x)。发版产物全在本地,有丢失风险。建议与并行线协调后 `git push` 分支 + tags |
| G2 | 🟢 | 还在 | 当前在 `w16-platform-tenant-split` 分支;OPS 是单 main 主干,w16 待合回 main(注意 main 上可能有同一修复的 cherry-pick 双份,git 按 patch-id 去重) |
| G3 | 🟢 | 还在 | 工作区 ?? :`tools/`(dom-collector,归 codex)、`tech-debt-inventory-cc/codex/cc2.md`(三份并行盘点)。待归位 |
| ★G4 | 🟢 | 注意 | **多 agent 同分支并行**:本 cc 做 W16、codex 做 fix/dom-collector、另一 cc 做 -cc 清单。已发生 commit 交错(c2abd18/7cd63e9/ea299f2 等 codex 的混在我分支历史)。属协调债,非代码债——建议明确分工边界 + 各自分支 | — |
| G5 | — | 已解决 | W14 悬空文件 `admin/src/main.js`、`admin/src/stores/user.js` 已随 v0.2.8 提交,不再悬空 |

---

## D. 挂起任务债(文档承诺,未闭环)

| 编号 | 严重度 | 现状 | 说明 / 建议 |
|---|---|---|---|
| P1 | 🟡 | **待验收** | **W12.6 真实重采 95% 抽样签收**:机制已生效(真实重采数据里 inbound=precise-invisible/estimated=false),但**未做正式 95% 准确率抽样测量+签收**(W12.6_acceptance §真实重采状态明确未做)。建议用现有真实数据抽样测一次收口 |
| P2 | 🟢 | 已解决代码/待验收 | **U9 非主路径时间戳**:bubble 兜底分支已走 `_extractPreciseMessageTime`+`_resolveOccurredAt`(不冒充采集当刻),模拟验证 10/10。随 P1 一并验收 |
| P3 | — | 已做 | **W13 消息聚合展示**:核实 `Aggregate.vue` 存在,已做 |
| P4 | 🟡 | 调研完/方案未实施 | **W15 视角梳理**:调研报告已产出(平台/租户视角混乱),但产品方案+实施未做。C13/C14/C15 是其子项 |
| ★P5 | 🟡 | **W16 收尾未闭环** | W16 还剩:① push 0.3.1 + merge main(见 G1/G2)② **生产浏览器最终验证**:我只 curl 验了 API 层(外部账号登录/菜单/403/数据不动),登录域名限制是前端 JS,生产浏览器签收待你做 4 项(admin/外部 × admin/mychat)③ admin 域名拒外部的对称限制已加,生产浏览器待验 |

---

## E. W16 第一手观察(我作为实施者的增量,-cc/-codex 没有)

| 编号 | 严重度 | 说明 |
|---|---|---|
| ★E1 | 🟡(待演变) | **内部/外部用户靠 `is_super` 二分**:admin(超管)=内部、role_id=2=外部。登录域名限制(mychat 拒内部/admin 拒外部)就靠这个判定。**局限**:未来若有"内部非超管员工"(内部运营但不是超管),is_super 二分不够,需加 `user_type`(internal/external)字段。现只有 admin 一个内部账号,is_super 够用,登记待演变 |
| E2 | 🟢(与W16无关) | **api.kongyuekeji.com curl 返回 000**(SSL/连接错,exit 60):W16 没动这域名(只动 mychat + server),server 本身活(mychat 反代返 401 证明)。疑似 api 域名自身证书/配置问题(可能过期),**pre-existing,与 W16 无关**,记录待你查 |
| E3 | 🟢 | **DEPLOY.md 仍是"方案稿"状态**:实际部署机制(生产/test 非 git,靠 rsync 同步代码 + docker compose build/up + nginx sed 生成站点)在 W16 实操中跑通,但没正式写入落地流程文档。建议把真实部署步骤补进 DEPLOY,别再让它停留在"待确认方案稿" |

---

## 优先级建议(供 Chase 排,仅参考)

1. **P1 W12.6 收口** —— 时间准确率是核心数据质量,有真实数据可测,成本低。
2. **G1 push(0.3.1 + 分支 + tags)** —— 发版产物只在本地,有丢失风险;先和并行线协调。
3. **P5 W16 收尾** —— 生产浏览器最终验证 4 项 + merge main。
4. **C2 diagnosis_color 性能 / C3 词表统一** —— 数据增长 / 校验口径准确性。
5. **C1 价格表导入** —— 按业务是否要此功能:做实 or 拆掉。
6. **清理周一把梭**:C4/C8/C9/C10/C11 + T7 死代码(整洁性,建议放 dom-collector / W16 收尾时一起做,降冲突)。
7. **E1 user_type / C12 文档复核 / C6 去重**(低优,演变到/顺手时做)。

---

> 与 `-cc`(另一 cc 版)、`-codex`(codex 版)三份并存,供交叉验证。三份结论一致:**无阻断债,优先 W12.6 收口 + push + 清理周**。本版独有 E 节(W16 第一手)+ T10 / G4 / E1-E3。
