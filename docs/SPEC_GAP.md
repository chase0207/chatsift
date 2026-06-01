---
文档: chatsift 文档↔代码差距清单 (SPEC_GAP)
版本: v1.0.0
状态: 基线对比
方法: 以 PROJECT_REALITY.md(代码现实)为准,对照 docs/architecture/* 与 docs/v1-api-spec。
日期: 2026-06-01
---

## 变更日志

| 版本 | 日期 | 变更摘要 | 触发来源 |
|---|---|---|---|
| v1.0.0 | 2026-06-01 | 初版:列出 MISSING/CONFLICT/UNDOCUMENTED | 用户任务3 |

> 读法:
> - **MISSING** = 文档说有、代码没有(或只有空壳)。
> - **CONFLICT** = 文档和代码都有但口径/结构/行为不一致。
> - **UNDOCUMENTED** = 代码有、对应任务文档/接口规格没记(或只在别处零散记)。
>
> 重要背景:很多差距源于 `v1-api-spec.md` 和早期 W2/W3 设计**写于 MVP 早期,之后被 W7/W9/W10/W11/W12 演进覆盖但原文档未回写**。所以多数 CONFLICT 不是 bug,是文档滞后。下方每条标注"以哪份为准"。

---

## 一、MISSING(文档说有,代码没有 / 只有空壳)

### M1. 价格表 Excel 导入是空 stub
- 文档:`v1-api-spec.md §5.2` 列 `POST /api/v1/price-table/import`,注"Excel 导入,W7 实现"。
- 代码:`routes/v1/priceTable.js:11` 确有挂载,但 `priceTableController.js:93 importRows` 直接 `ok(res, { imported: 0 })`,**无任何解析/入库逻辑**。
- 结论:接口在、功能不在(假实现)。

### M2. 运营分析 `platform-comparison` 接口不存在
- 文档:`v1-api-spec.md §6.2` `GET /api/v1/analytics/platform-comparison`。
- 代码:无此路由。等价能力由 `/api/v1/analytics/by-page` 提供(`analyticsController.byPage`),返回结构也不同。
- 结论:按文档名找不到该接口(已更名为 by-page,见 C2)。

### M3. 后台"日志中心"页面缺失(孤儿菜单)
- 文档/数据:复用表 seed `00_reused_tables.sql:134` 插入菜单"日志中心 /logs (component=Logs)";server 有 `routes/logs.js` + `logsController.js`。
- 代码:admin **无 `views/Logs.vue`、`router/index.js` 无 `/logs` 路由**。访问 `/logs` 被 `:pathMatch(.*)*` 兜底重定向到 `/dashboard`。
- 结论:菜单和后端接口在,前端页面缺失。

### M4. W12 ③"分析优先级双队列"未实现(设计本就允许缺席)
- 文档:`W12_design.md §3` "必要时给高意向消息更高分析优先级(双队列/排序)"。
- 代码:`analyzer.js takeJobs` 纯按 `created_at ASC, id ASC` FIFO,**无任何优先级**。
- 结论:W12 设计写明"先评估,真积压才加",所以这是**设计允许的未实现**,非违背。仅记录现状。

---

## 二、CONFLICT(文档与代码不一致)

### C1. 漏斗 `/analytics/funnel` 返回结构完全不同 ★
- 文档:`v1-api-spec.md §6.1` 返回 `{ total_conversations, by_intent{...}, leads_created, workorders_created, converted }`。
- 代码:`analyticsController.funnel` 返回 `{ inquiry, lead, appointment, leadRate, appointmentRate }`(三环漏斗:咨询→留资→预约,不含成交)。
- 以谁为准:**代码**。漏斗在 W9/W10 被重定义为三环(留资=contact valid、预约=6字段全 valid),`v1-api-spec` 未回写。

### C2. `platform-comparison` → `by-page` 改名 + 结构变化
- 文档:`v1-api-spec.md §6.2` platform-comparison。
- 代码:`/analytics/by-page`,按 `platform_page` 分组,返回 inquiry/lead/appointment + 率。
- 以谁为准:**代码**(W9 起按页面维度而非"平台"维度)。

### C3. completeness 字段集与评分口径
- 文档:`W3_design.md §3` 预约 5 字段(city/time/contact/**project/store**),每字段 20 分;问价字段 city/**hours**。
- 代码:`business-rules.js` 预约 6 字段(name/city/time/contact/**pickup_location/car_type**),问价 city/**car_type**;`completeness-engine.js` 评分 = **valid 字段数/总数×100**(不是"已填×20")。
- 以谁为准:**代码**。W7 校准为租车 6 字段+占比评分、W10 改为按"有效"计分,`W3_design` 是被取代的早期稿。

### C4. pricing 工单 payload 字段
- 文档:`W3_design.md §4.2` pricing payload `{ city, hours, project, quote }`。
- 代码:`workorder-engine.js buildPayload` pricing = completeness.fields(`city, car_type`)+ `quote`。hours/project 在租车场景已弃用。
- 以谁为准:**代码**(同 C3,W7 后)。

### C5. analysis_jobs 表注释与实际队列机制不符
- 文档:`v1-schema.sql:186-187` 注释"正常流转在内存queue,本表用于崩溃恢复和审计"。
- 代码:`analyzer.js` **直接轮询 `analysis_jobs` 表**(`setInterval` + `status=pending` 取批),根本没有内存队列;此表就是主队列。
- 以谁为准:**代码**。schema 注释是早期设想,实现走了 DB 轮询。

### C6. heartbeat / dom-adapter-config 是占位实现
- 文档:`v1-api-spec.md §1.2/1.3` 描述 config_version 会变、selectors 下发真实选择器。
- 代码:`eventsController.heartbeat` 恒返回 `config_version:1`;`domAdapterConfig` 在 `version>=1` 时 `selectors:null`(从不下发),插件用内置 SELECTORS。
- 以谁为准:**代码**(选择器走插件内置,未做服务端下发)。

### C7. completeness 抽取词表的环境变量名
- 文档:`W3_design.md §7` 列 `COMPLETENESS_CITY_LIST` + `COMPLETENESS_PROJECT_LIST`。
- 代码:`completeness-engine.js` 用 `COMPLETENESS_CITY_LIST` + `COMPLETENESS_CAR_TYPE_LIST`(无 PROJECT_LIST,租车改车型)。
- 以谁为准:**代码**。

---

## 三、UNDOCUMENTED(代码有,任务文档/接口规格未记或仅零散记)

### U1. `/api/v1/leads/recent` 未进 API 规格
- 代码:`routes/v1/leads.js:9` + `leadsController.recent`(提醒取数:status=new + updated_at>=since,过滤 complaint/high/完整预约)。
- 文档:`v1-api-spec.md` 完全没有;只有 `W12_design.md §4.2` 提过。建议回写 api-spec。

### U2. 运营分析 `/intent-distribution`、`/lead-level`、`/trend` 未进 API 规格
- 代码:`analyticsController` 三个接口 + 路由均在。
- 文档:`v1-api-spec.md §6` 只有 funnel + platform-comparison。这三个仅 `W9_acceptance.md` 记录。

### U3. 会话/线索列表新增查询参数未进 API 规格
- 代码:conversations.list 支持 `platform_page`(LIKE)、`nickname`(LIKE)、`keyword`(消息全文 EXISTS)、`diagnosis_color`(**全表取出后内存过滤,无 LIMIT**);leads.list 支持 `ids`、`diagnosis_color`。
- 文档:`v1-api-spec.md §2.1` 仅列 platform/intent_label/current_stage/keyword。这些是 W11(诊断色)/W12.6(页面/昵称搜索)加的,api-spec 未回写。
- 附注:`diagnosis_color` 过滤是"取全部命中行→buildDiagnosis→内存筛选→再分页",数据量大时有性能隐患(纯客观记录)。

### U4. intent-engine 的硬编码前置规则
- 代码:`intent-engine.js:10-13` 在查 DB intent_rules **之前**,先跑硬编码 `matchesComplaint` 正则、再跑 `classifyStructuredAppointment`(命中字段词≥3 或 预约意图+时间词 → appointment)。
- 文档:`W2_design`(意图规则)未述这两段;`W12.5_acceptance.md` 事后追认了"结构化预约 + 投诉优先"。
- 附注:硬编码 complaint 正则与 `intent_rules` 种子(tenant 0 complaint keyword)**内容重复**,两处各维护一份。

### U5. 两套租车词表各自独立维护
- 代码:`completeness-engine.js` 抽取用的默认车型词表含 `七座/七座车`(无"7座");`business-rules.js` 校验词表含 `7座`(无"七座车")。城市词表两处也各写一份。
- 文档:未明确"抽取词表"与"校验词表"是分离的两套。可能导致"抽得到但校验不过"或反之的边界差异。

### U6. heartbeat / dom-adapter-config 重复挂载
- 代码:`app.js:37-38` 直挂 `/api/v1/heartbeat`、`/api/v1/dom-adapter-config`;`routes/v1/events.js:9-10` 又在 `/api/v1/events/` 下挂了一份同名接口。即两个路径都可用。
- 文档:api-spec 只记 `/api/v1/heartbeat`、`/api/v1/dom-adapter-config`(直挂那份)。events 子路径那份未记。

### U7. 插件构建与死代码现状未在文档体现
- 代码:`build.js` MODULES 清单引用多个**不存在的文件**(adapter-runtime.js、adapters/base/*、xiaohongshu/kuaishou/meituan adapter、content_legacy.js),构建时跳过仅 warn;`content.js` 打包了大量 V1.9 runtime 死代码(queue/batch/watchdog/diff-engine/chaos/bug-dump/rpc-bridge…)。
- 文档:HANDOVER §5 提到"旧 V1.9 死代码故意保留",但 build.js 引用不存在文件、注释仍指向已删的 content_legacy.js 这一具体现状未记录。

### U8. session-identity-resolver 含 avatar 身份逻辑但采集未用
- 代码:`session-identity-resolver.js` 对 douyin-private 仍按 `nickname + fnv64(avatar)`(L2)生成 session_id;但真实采集链路用的是 `legacy-collector.js:_buildSessionInfo`(只 pageKey+nickname,**不含头像**)。resolver 在采集路径未被调用。
- 文档:HANDOVER §4 强调"conversation_id 不含头像(W6.5 修过)"——这对**活跃采集路径成立**;但残留的 avatar resolver 未在文档说明其已失效/未用。

### U9. 抖音私信 adapter 的非主路径采集无时间戳
- 代码:`private-message.adapter.js getMessages` 在非 `clue_private_message` URL 时走 incoming/self bubble 分支,产出消息**不带 timestamp/time_meta**,落到 `toConversationEvent` 后 `_normalizeOccurredAt(undefined)` = 采集当刻。
- 文档:W12.6 只覆盖了 `clue_private_message` 主路径的精确时间,这条 bubble 兜底分支的时间缺失未记。

### U10. admin 仍带 chat_rpa 残留接口封装
- 代码:`admin/src/api/` 下有 `ai.js`、`keywordReplies.js`、`knowledge.js`、`columnPrefs.js`、`devices.js`、`plugin-update.js` 等(chat_rpa 时代),其中部分(ai/keywordReplies/knowledge)对应 chatsift 已不提供的能力。
- 文档:`v1-api-spec.md §7` 笼统说"chat_rpa 的 /api/ai/* /keyword-replies 等不在 chatsift 提供",但前端封装文件仍在,未清理也未在文档标注为残留。

---

## 四、不算差距(已核对一致,登记备查)

- 红线:无被调用的发送/回复路径,`send_runtime_v19` 默认 false(`constants.js`)。与 HANDOVER §1 一致(残留发送脚手架见 PROJECT_REALITY §2.8)。
- intent 口径(最近20条 inbound,排 outbound)、completeness(全量 inbound≤500)— 与 HANDOVER/W12.5 一致(`analyzer.js`)。
- 字段有效性三态 + 规则优先 AI 兜底 + 结果存 `field_validity`、报表只读 — 与 W10 一致。
- 诊断颜色实时拼不存表、红>橙>绿>灰 — 与 W11 一致(`diagnosis.js`)。
- lead 模型 C 一会话一线索、status 不被分析回退、score 权重 — 与 W7 一致(`lead-engine.js`)。
- LLM:DeepSeek 默认、租户化 key/配额、失败返回 ok:false 不抛、GET 脱敏 PUT 留空不改 — 与 W8 一致。
- 准实时:采集节流 ~10s、上报 15s/满10条、提醒 30s 轮询 only 推完整预约/投诉/高意向 — 与 W12 一致。
