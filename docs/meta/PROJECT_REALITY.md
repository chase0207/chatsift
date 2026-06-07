---
文档: chatsift 代码现状审计 (PROJECT_REALITY)
版本: v1.0.0
状态: 基线审计
方法: 只读真实代码,不参考任何 docs/ 文档脑补。所有结论均带 文件:行号 出处。
日期: 2026-06-01
---

## 变更日志

| 版本 | 日期 | 变更摘要 | 触发来源 |
|---|---|---|---|
| v1.0.0 | 2026-06-01 | 初版:接手者只读代码审计,记录真实运行事实 | 用户任务2 |

> 说明:本文件描述"代码实际是什么样",不评判对错,不与设计文档对齐(对齐分析见 SPEC_GAP.md)。

---

## 0. 仓库形态

- npm workspaces monorepo,根 `package.json` 含三个 workspace:`plugin` / `server` / `admin`。
- 根脚本:`dev:server`、`dev:admin`、`build:plugin`(`cd plugin && node build.js`)、`build:admin`(vite)。
- 根版本 `0.0.1`;插件 manifest 版本 `0.1.0`。
- 源码文件量:plugin 37、server 65、admin 100、scripts 19(不含 node_modules)。

## 1. 服务端 (server/)

### 1.1 入口与路由 (`server/src/app.js`)
- Express,端口 `process.env.PORT || 3100`,`cors()` 全开,JSON body 上限 2mb。
- 非 production 时挂载 `middleware/chaos` + `/api/_chaos` 路由(测试故障注入)。
- 非 v1 路由(沿用 chat_rpa):`/api/auth /users /roles /menus /platforms /pages /plugins /configs /logs /dashboard`。
- v1 路由(前缀 `/api/v1`):`events`、`heartbeat`(POST)、`dom-adapter-config`(GET)、`conversations`、`leads`、`workorders`、`intent-rules`、`price-table`、`llm-config`、`analytics`。
- 静态托管 `server/public`,SPA fallback 到 `index.html`;`/api` 前缀未命中返回 404 JSON。
- 启动后,若 `ANALYZER_ENABLED !== 'false'`,调用 `analyzer.start()` 拉起分析 worker。

### 1.2 采集入库 (`controllers/v1/eventsController.js`)
- `POST /api/v1/events/batch`:body.events 必须是数组,**单批最多 50 条**(超出 400)。整批一个事务。
- 单条必填:platform、conversation_id(或 platform_conversation_id)、message_id(或 platform_message_id)、direction、occurred_at;缺任一 → `rejected++` 跳过。
- **去重键**:`messages(tenant_id, platform_message_id)`,已存在 → `duplicated++` 跳过。
- 会话 upsert:按 `(tenant_id, platform, platform_conversation_id)` 查;命中则 `UPDATE`(COALESCE 补昵称/uid、`GREATEST` 推进 last_message_at/last_inbound_at、message_count+1),否则 `INSERT`。
- 每条入库后插入 `analysis_jobs (status='pending')`。
- 返回 `{ accepted, duplicated, rejected }`。
- `heartbeat`:返回 server_time + config_version=1。`domAdapterConfig`:`version>=1` 时 selectors 返回 null(即不下发选择器,插件用内置 selectors)。

### 1.3 分析 worker (`v1/analyzer.js`)
- **DB 轮询队列**(非内存队列):`setInterval(tick, POLL_INTERVAL=1000ms)`。`tick` 串行执行,`isProcessing` 锁防重入。
- `takeJobs`:取 `analysis_jobs WHERE status='pending' AND attempts<MAX_ATTEMPTS(3)`,按 created_at/id 升序,LIMIT `BATCH_SIZE=20`,先批量置 `processing` 再逐条处理。
- 启动时 `resetProcessingJobs()`:把残留 `processing` 重置为 `pending`(崩溃恢复)。
- 失败重试:attempts+1,达 3 次置 `failed`,否则回 `pending`,错误存 `last_error`(截 512)。
- **pipeline 固定五段串行**:`intent → completeness → goal → workorder → lead`(`analyzer.js:18-24`)。
- `buildContext`:
  - 取当前 message;**若 direction='outbound' → skip=true**(只标记 analyzed_at、markDone,不分析)。
  - **intent 上下文**:`direction='inbound' AND content_text IS NOT NULL`,按 `occurred_at DESC,id DESC` 取 `CONTEXT_SIZE=20` 条,再 reverse(=最近 20 条 inbound)。
  - **completeness 上下文**:同条件 inbound,按 `occurred_at ASC,id ASC` **LIMIT 500**(全量 inbound 上限 500)。
- `persist`:更新 conversations 的 intent_label/confidence/source、current_stage、completeness_score、`field_validity`(JSON)、analyzed_at;并标记 message.analyzed_at。

### 1.4 意图引擎 (`v1/intent-engine.js`)
判定顺序(命中即返回):
1. `matchesComplaint`:硬编码正则 `/(投诉|售后|退款|差评|举报|不满意|太差|垃圾|骗)/` → complaint(conf 0.9, rule)。
2. `classifyStructuredAppointment`:命中字段词(姓名/手机/电话/联系方式/时间/用车时间/预约时间/车型/城市/地点/上车位置)**≥3 个** → appointment(0.92);或"想约/预约…"+时间词 → appointment(0.9)。
3. DB `intent_rules`(`tenant_id IN (0, ?)` AND enabled),按 priority 升序,keyword(竖线分隔 includes)或 regex 匹配 → 该 label(0.9, rule)。
4. 兜底 `llmFallback`:文本空 → simple_inquiry(0.5, default);否则调 LLM 四分类;LLM 失败 → simple_inquiry(0.5, default,quota 耗尽时 degraded=true);成功 → 解析标签(0.75, llm)。
- **投诉硬编码先于结构化预约**(顺序保证投诉优先)。VALID_INTENTS = simple_inquiry/appointment/complaint/price_inquiry。

### 1.5 完整度引擎 (`v1/completeness-engine.js`)
- **只对 intent ∈ {appointment, price_inquiry} 计算**,其它 intent 直接返回 `score:0, fields:{}, field_validity:{}, missing:[]`。
- 6 字段正则抽取:name / city / time / contact / pickup_location / car_type。城市/车型词表可被环境变量 `COMPLETENESS_CITY_LIST` / `COMPLETENESS_CAR_TYPE_LIST` 覆盖(默认与 business-rules 词表略有差异,见 §1.10)。
- 规则抽不到的字段交 `llmExtract`(只抽 missing,返回 JSON)补齐。
- `required` = appointment → 6 字段;price_inquiry → `priceFields`(只 city、car_type)。
- 调 `validity-checker.checkValidity` 得 field_validity;**score = round(valid 字段数 / required.length * 100)**;missing = 非 valid 的字段。

### 1.6 字段有效性 (`v1/validity-checker.js`)
- 三态 `valid / invalid / unknown`,每字段返回 `{status, source(rule|llm), reason, value}`。
- **规则优先**:contact(手机正则 `^1[3-9]\d{9}$` / 微信正则)、city(词表命中/"市区城区附近"判 invalid)、car_type(词表 includes)、name(无效词表/纯数字/过短→invalid,否则 unknown 交 AI)、time(模糊词→invalid,具体到日期+小时→valid,否则 unknown)、pickup_location(模糊词→invalid,含"路/街/号/小区…"→unknown,纯区县→unknown)。
- **仅 `status==unknown && 有值` 的字段批量交 AI**(`checkByAI`),AI 失败/不可解析 → 保持 unknown(标 source=llm,reason 记原因)。
- 导出 `validCount` / `allValid`(供 completeness/diagnosis/analytics 复用)。

### 1.7 阶段引擎 (`v1/goal-engine.js`)
- complaint→done;simple_inquiry→new;appointment/price_inquiry 按 score:0→new、<60→collecting、<100→completing、=100→done;其它→new。

### 1.8 工单引擎 (`v1/workorder-engine.js`)
- 按 intent 映射工单 spec:inquiry(prio5/SLA24h)、appointment(prio3/4h)、complaint(prio1/1h)、pricing(prio4/2h),SLA 小时可被 env 覆盖。
- **同会话同 type 且 status∉{done,cancelled} 时 UPDATE,否则 INSERT**(避免重复开单)。
- payload:appointment=完整度字段;pricing=字段+`findQuote`(查 price_table city+车型 LIKE)得报价;complaint=消息原文+risk_level=high;其它=intent_summary。
- pricing 的 suggestion:缺城市/车型→人工报价;有 quote→"建议报价:X元";否则→价格表无匹配。

### 1.9 线索引擎 (`v1/lead-engine.js`)
- 按 `(tenant_id, primary_conversation_id)` upsert leads(**一会话一线索,模型 C**)。
- profile 字段**只增不减**(`existing?.x || new`):nickname/name/platform_uid/phone/wechat/city。contact 用 `splitContact` 拆手机/微信。
- **lead_score** = intentBase(appointment50/price35/simple15/complaint10) + completeness*0.3 + contactBonus(15) + stageBonus(completing10/done15),封顶 100。
- level:≥70 high、≥40 mid、否则 low。
- 新建 status='new';**已存在线索的 status 不被引擎改写**(update 只改打分/资料,upsert 返回 existing.status)。
- `linkWorkorders`:把该会话 lead_id 为 NULL 的工单回填当前 leadId。

### 1.10 业务规则常量 (`v1/business-rules.js`) —— 硬编码,租车
- `appointmentFields` = [name, city, time, contact, pickup_location, car_type];`priceFields` = [city, car_type]。
- validity:contact/wechat 正则、城市词表(12 城)、车型词表、无效姓名词、模糊时间词、模糊地点词。
- leadScore 权重(见 §1.9)。
- **注意词表口径**:business-rules 车型词表含 `7座`,而 completeness-engine 默认抽取词表是 `七座/七座车`(无"7座");两处词表各自独立维护(completeness 抽取用自己的默认 + env,validity 校验用 business-rules)。

### 1.11 诊断 (`v1/diagnosis.js`) —— 实时拼,不存表
- 入参 conversation(含 intent_label + field_validity),输出 `{mainColor, tags[]}`。
- severity:danger4>warning3>success2>info1,mainColor 取标签最严重色。
- complaint→danger 标签;contact valid→success / unknown→warning / invalid→danger / 预约场景缺失→danger;预约 6 字段全 valid→"预约信息完整"success;各字段 invalid/unknown/缺失→warning;无任何字段→info"无实质信息"。
- 被 conversations.detail/list、leads.list/detail/recent 调用,**纯读 field_validity 派生,不调 AI、不写库**。

### 1.12 LLM 客户端 (`v1/llm-client.js`)
- OpenAI 兼容 `POST {api_base}/v1/chat/completions`,默认 base `https://api.deepseek.com`、model `deepseek-chat`、temperature 0、timeout 10s。
- 配置读 `tenant_llm_config WHERE tenant_id=? AND enabled=1`,**无 key→{ok:false,error:no_config}**。
- 月配额:跨月自动重置 used=0;`used>=quota` → {ok:false, quota_exceeded}。成功后累加 `monthly_token_used += total_tokens`。
- **任何异常/HTTP 非 2xx/空响应都返回 `{ok:false,...}`,绝不抛异常**(保护 analyzer worker)。

### 1.13 运营分析 (`controllers/v1/analyticsController.js`)
- 五接口:`/funnel /intent-distribution /lead-level /by-page /trend`。
- **漏斗口径(SQL 实算)**:
  - inquiry = 范围内 `COUNT(DISTINCT c.id)`(所有会话)。
  - lead = `field_validity.contact.status='valid'` 的会话数。
  - appointment = `appointmentFields` 全部 `.status='valid'` 的会话数(SQL 由 business-rules.appointmentFields 动态拼 JSON_EXTRACT)。
  - leadRate=lead/inquiry,appointmentRate=appointment/lead(百分比,分母 0 返 0)。**不含成交**。
- 默认时间范围:近 30 天(from=今天-29,to=今天),按 conversations.created_at(lead 接口按 leads.created_at);可选 platform_page 过滤。

### 1.14 线索接口含"提醒"取数 (`controllers/v1/leadsController.js`)
- `GET /api/v1/leads/recent?since=&min_level=`:取 `status='new' AND updated_at>=since`(默认近 30 分钟)LIMIT 50,经 `shouldNotify` 过滤:**complaint、或 high 级、或(诊断 success 且预约 6 字段全 valid)**。这是 W12"准实时提醒"的服务端取数,**没有独立 notifications 表/接口**。
- leads 还有 list(支持 status/level/city/keyword/ids/diagnosis_color 过滤)、detail、update(白名单字段,status='following' 写 last_followed_at)、convert(status→converted)。

### 1.15 数据库 schema
- 业务表(`server/sql/v1-schema.sql`,8 张):conversations、messages、leads、workorders、intent_rules、price_table、tenant_llm_config、analysis_jobs。
  - conversations 唯一键 `(tenant_id, platform, platform_conversation_id)`;有 `field_validity JSON`、completeness_score、current_stage、intent_*。
  - messages 唯一键 `(tenant_id, platform_message_id)` 去重;`occurred_at`(平台时间)、`uploaded_at`(入库时间)、`analyzed_at`、`raw_snapshot JSON`、FULLTEXT(content_text)。
  - **`analysis_jobs` 表注释写"正常流转在内存queue,本表用于崩溃恢复"——但 analyzer 实际直接轮询此表(无内存队列),注释与实现不符**(见 SPEC_GAP)。
- 复用表(`server/sql/00_reused_tables.sql`,从 chat_rpa):roles、users、menus、role_has_permissions、platforms、platform_pages、plugins、configs;含 seed(admin 账号、抖音/小红书等平台、菜单与权限点)。
  - 单级租户:`user_id 即 tenant_id`。

## 2. 采集插件 (plugin/)

### 2.1 manifest (`plugin/manifest.json`)
- MV3,permissions:storage/tabs/scripting/activeTab/alarms(**无 debugger**,印证放弃网络拦截)。
- host_permissions 与 content_scripts 均 `http://*/* https://*/*`,`all_frames:true`、`match_about_blank`、`run_at:document_end`。注入单文件 `content.js`,popup=`popup/popup.html`,background=`background.js`。

### 2.2 构建 (`plugin/build.js`)
- ADR-004:纯 concat,不用打包器。按 MODULES 顺序把 shared+runtime+adapters 拼成 `content.js`,缺文件只 warn 跳过。
- **MODULES 清单引用了若干仓库中不存在的文件**(构建时跳过):`runtime/adapter-runtime.js`、`adapters/base/dom-utils.js`、`adapters/base/adapter-helpers.js`、`adapters/xiaohongshu|kuaishou|meituan/*.adapter.js`、`content_legacy.js`。文件头注释仍提"V1.x 主逻辑在 content_legacy.js"(已不存在)——build.js 自身处于过渡/未清理状态。

### 2.3 采集链路 (`runtime/legacy-collector.js`)
- 启动:`Uploader.start()` + 对 `document.body` 挂 MutationObserver(childList/subtree/characterData)。
- **节流**:DOM 变化 debounce `COLLECT_DEBOUNCE_MS=10000`(~10s)后采集一次;`_collecting` 锁防并发。
- 受 feature flag `collector_v1_enabled` 控制(默认 true,见 §2.7);`boot()` 监听 `START_COLLECTOR/STOP_COLLECTOR` 消息,并每 1s `_syncFlag` 按 flag 起停。
- `collectMessageSession`:Registry 按 location 解析 adapter → `_buildSessionInfo` 读昵称(读不到/`unknown` 直接 skip 不上报)→ `adapter.getMessages` → `toConversationEvent` 映射 → `Collector.collect`(本地去重+入队)。

### 2.4 conversation_id / message_id 合成(真实)
- **conversation_id**(`legacy-collector.js:_buildSessionInfo`):`'douyin_' + pageKey(非字母数字转_) + '_' + simpleHash(pageKey + '|' + nickname)`。即 `douyin_<pageKey>_<hash(pageKey|nickname)>`,**只用 pageKey+昵称,不含头像**。DB 实样形如 `douyin_douyin_private_message_<8位hash>`。
- **message_id**(`shared/dom-utils.js:synthMessageId`):`'syn_' + simpleHash([conversationId, direction, text, 分钟].join('|'))`,时间取 occurredAt 的 ISO 前 16 位(**精确到分钟**)。
- hash = FNV-1a 32 位(`simpleHash`),8 位十六进制。
- **另有 `runtime/session-identity-resolver.js`(RpaSessionIdentityResolver)用 nickname+avatar(L2)/L1/L3 生成 session_id,但采集链路未调用它**(legacy-collector 自建 sessionInfo);它属旧 V1.9 runtime 路径,实际未参与采集 id 合成。

### 2.5 抖音私信 adapter (`adapters/douyin/private-message.adapter.js`) —— 主力
- 两条 getMessages 分支:
  - **`life.douyin.com/cs/web/clue_private_message` 路径(主路径,带时间解析)**:扫 `div[class*="my-4"]` 可见节点;无气泡文本但整行是完整时间 → 作为锚点(anchor);有文本 → 取时间。
  - 其它路径:扫 incoming/self bubble,**产出的消息不带 timestamp**(toConversationEvent 会 `_normalizeOccurredAt(undefined)` → 采集当刻),无精确时间。
- **时间解析优先级**(W12.6 实现):
  1. `_extractPreciseMessageTime`:从消息文本节点向上爬到 `flex-1 flex-col` 列容器,在容器内找 class 含 `invisible+whitespace-nowrap+absolute` 且内容匹配 `YYYY-MM-DD HH:MM:SS` 的节点(隐藏精确时间)→ `time_source='precise-invisible'`。
  2. `_extractMessagetime`:xpath `.//span[contains(@class,"text-xs")]` 等(旧独立时间)。
  3. `_parseOccurredAt` 支持:完整/部分绝对时间、`N月N日`、`今天/昨天`、`上午/下午/晚上/中午/凌晨`、`N秒/分钟/小时前`、`刚刚/刚才`;解析失败 → fallback 采集当刻(estimated=true)。
  4. 无独立时间 → 继承最近 anchor(+1s 递增);anchor 失败则清空不继承旧值。
  5. `_resolveOccurredAt` 单调保序:若 ≤ 上一条则置 `上一条+1s`,source 加 `+monotonic`。
- `raw_snapshot` 记录 `time_text/time_source/time_estimated`(可排查时间来源)。
- direction 由 `_isOutbound`(class 含 rightMsg/reverse/self/right 或 text-right)启发式判定。
- **adapter 文件头注释明确"V2.0 采集探针:仅 getMessages + toConversationEvent,发送方法已于 W5 移除"**;SELECTORS 仍保留 input/sendButton 选择器定义(未被调用)。

### 2.6 本地去重 + 上报 (`runtime/event-collector.js` + `event-queue.js` + `event-uploader.js`)
- EventCollector:按 message_id 在 `_seen` Set 去重(持久化到 chrome.storage,上限 1000),新事件入 EventQueue。
- EventQueue:内存数组 + chrome.storage 持久化(`chatsift_event_queue`),支持 enqueue/dequeueBatch/requeueFront/onChange。
- EventUploader:`setInterval(tick, UPLOAD_INTERVAL=15000)`(15s)**或**队列 onChange 到 `UPLOAD_FLUSH_SIZE=10` 触发;每次 `dequeueBatch(UPLOAD_BATCH_MAX=50)`,带 Bearer token POST `/api/v1/events/batch`;失败/无 token → `requeueFront` 回队重试。

### 2.7 特性开关 (`runtime/feature-flags.js` + `shared/constants.js`)
- FeatureFlagDefaults:`runtime_v19=false`、`send_runtime_v19=false`(发送链路总开关,最高风险,默认 deny)、`watchdog_v19=false`、**`collector_v1_enabled=true`(采集默认开)**。
- 解锁仅经服务端 runtime-config 下发或 DevTools `unlockForTesting`(不持久化);硬锁设计禁止持久化解锁。

### 2.8 红线现状(代码客观事实)
- **没有任何被调用的发送/回复代码路径**:adapter 发送方法已移除,`send_runtime_v19` 默认 false 且无 send 实现。
- 但仍有发送相关"残留":
  - `popup/popup.html`/`popup.js` 保留 `autoReplySwitch`(兜底回复、发送延迟等 UI 字段),`popup.js` 多处把 autoReply **强制 false**(`694`、`768`);`background.js` DEFAULT_CFG `autoReply:false`。
  - 构建产物 `content.js` 内含大量 V1.9 发送相关常量/注释/选择器(LK-SEND-*、`shouldBlockAutoReply`、input/sendButton selector、`send_runtime_v19` 开关等),均为打包进来的死代码,无激活路径。

### 2.9 background / popup
- `background.js`:`START_PLATFORM` 时写 `collector_v1_enabled:true`,可选 `reloadAfterStart` 刷新命中目标平台 detect_hosts 的 tab,再 `START_COLLECTOR`;`STOP` 写 `collector_v1_enabled:false`(W12.5 自动刷新逻辑)。
- popup 启动传 `reloadAfterStart:true`。

## 3. 后台前端 (admin/)

- Vite + Vue3 + ElementPlus + vue-router + pinia。`request.js` 统一封装,api/ 下按域拆分(conversations/leads/workorders/analytics/llmConfig/...)。
- 路由(`router/index.js`):login、dashboard、users、plugins、platforms、roles、menus、**conversations(+:id)、leads(+:id)、workorders、analytics、settings→settings/llm**。路由守卫做登录 + `routePermMap` 权限校验(超管 is_super 跳过)。
- 业务页:Conversations(会话中心,支持平台/意图/阶段/页面/昵称/消息关键词/诊断色过滤)、ConversationDetail、Leads/LeadDetail、Workorders、Analytics(运营分析)、LlmConfig。`MessageDrawer.vue` 拉最新 100 条(latest=1)消息流并滚到底部。
- **提醒**(`layouts/MainLayout.vue`):顶栏铃铛 + badge,**前端每 30s 轮询 `/leads/recent`**(自记 `since`),有新高价值线索弹 ElNotification、累加未读、点击跳 leads(按 ids 过滤)。无服务端推送/WebSocket。
- LLM 配置:GET 脱敏(`maskKey` → `sk-****xxxx`),PUT 留空不改 key(`llmConfigController`)。

## 4. scripts/

- `scripts/smoke/`:device-session-regression、douyin-laike-regression、douyin-laike-runtime-watch、douyin-private-regression、runtime-lock-regression。其中 `douyin-private-regression.js` 依赖已不在仓库的快照文件、`runtime-lock-regression.js` 按 W5 前发送锁语义检查(均会失败)。
- `scripts/chaos/`:故障注入/压测脚本(batch-burst/dom-storm/long-running/reload + _lib + regression),配合 server 的 `/api/_chaos`(仅非 production)。

## 5. 代码中客观存在的"残留/异常"(不评判,仅记录)

1. **死代码(V1.9 runtime)**:plugin/runtime 下 batch-manager、queue-manager、runtime-manager、recovery-manager、watchdog、session-parser、session-detector、diff-engine、chaos-monitor、bug-dump、rpc-bridge、lk-tracer、runtime-state-machine、self-check + session-identity-resolver,均被 build 进 content.js,但采集-only 路径(legacy-collector)不依赖其调度逻辑。
2. **build.js 清单引用不存在文件**(adapter-runtime.js、adapters/base/*、xiaohongshu/kuaishou/meituan adapter、content_legacy.js)——构建跳过、仅 warn。
3. **analysis_jobs 表注释"内存queue"与实现(DB 轮询)不符**。
4. **孤儿页面**:复用表 seed 与 server 都有"日志中心 /logs(Logs 组件)"+ `routes/logs.js`,但 admin 既无 `Logs.vue` 也无 `/logs` 路由(访问会被 fallback 到 dashboard)。
5. **两套词表**:completeness 抽取词表(默认值,可 env 覆盖)与 business-rules 校验词表不完全一致(如 7座 vs 七座)。
6. **同名客户合并**:conversation_id 用 `pageKey+昵称` hash,同页面同昵称会合并为一个会话(无稳定客户 ID 时的取舍)。
7. **session-identity-resolver 仍含 nickname+avatar 逻辑**,但未在采集链路被调用(采集 id 不含头像)。
8. **非主路径采集无时间**:私信 adapter 的 bubble 兜底分支产出消息不带时间戳,会落到采集当刻。
