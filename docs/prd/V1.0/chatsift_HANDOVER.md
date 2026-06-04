---
文档: chatsift 项目交接说明(给接手的 Claude Code / 新开发者)
版本: v1.0.0
状态: 交接基准
用途: 接手者的第一份必读文档。读完这份 + docs/ 全部文档 + git log,即可建立全局认知并接手。
---

## 变更日志

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0.0 | 2026-06-01 | 初版,项目交接说明 |

---

# chatsift 项目交接说明

> **接手第一步**:读完本文档 + `docs/architecture/` + `docs/reports/` 全部文档 + `git log`,然后**用你自己的话复述**:这个项目是什么、核心约束是什么、现在停在哪。复述给 Chase 确认无误后,再开始干活。**不要没读懂就开干。**

---

## 0. 一句话项目定位

chatsift 是一个**抖音客服会话的只读分拣分析平台**:采集抖音私信里的客服-客户对话,自动做意图分类、信息完整度评分、字段有效性校验、生成工单、沉淀销售线索,并提供运营漏斗和准实时提醒。它从一个旧的"自动回复 RPA 插件"(chat_rpa)转型而来,服务对象是租车/陪驾类商家的客服运营。

---

## 1. 最高红线:永不发送(Observe First)⚠️

**这是不可触碰的产品红线,优先级高于一切功能需求。**

- chatsift **只读**:采集、展示、分析对话,**绝不发送/回复任何消息**。
- 后台没有、也永远不会有任何发送入口。客服的回复在抖音原生页面自己做,chatsift 不介入。
- W5 时已把插件里所有发送/自动回复代码删干净。**任何"加个回复框""让客服在后台直接回"的需求,都触碰红线,必须先和 Chase 确认产品方向,不能自行实现。**
- 即将做的 W13"消息聚合展示"也是纯只读视图——中间会有会话消息流,但**没有输入框、没有发送按钮**。命名特意叫"展示"不叫"工作台",就是为了守住这条线。
- 背景:转型成只读探针,正是为了规避自动发送带来的抖音封号风控和合规责任。这是 chatsift 存在的理由,别走回头路。

---

## 2. 三方协作协议(接手后请继续遵守)

历史上是三方协作:产品决策(Chase)、架构/方案设计(Claude)、代码实现(codex)。切换到 Claude Code 后,设计和实现合并,但**变更分级和检查点习惯要保留**:

**变更分级(改动前先判类别):**
- **A 类**(实现细节、保守调整,如补词表、修明显笔误):可自行执行,在报告里说明即可。
- **B 类**(触及设计意图或验收标准,如改意图判断逻辑、改评分口径、加新功能):**必须先停下,把方案报给 Chase 确认,再做。不要自行 commit。**
- **C 类**(跨周次、或动已验收代码):**必须先停,先诊断、报方案,确认后小步改,改完重跑相关验收。**

**重要历史教训**:之前发生过两次执行端自行改 B 类并 commit(一次改 intent 取数、一次加搜索功能),其中一次方向虽对但绕过了确认。**接手后:涉及产品判断的改动,先报 Chase,不自作主张。** Chase 是产品负责人,口径和方向由他定。

**文档纪律:**
- 每个阶段的任务+设计文档放 `docs/architecture/`,验收/诊断报告放 `docs/reports/`。
- 每份文档开头有版本号 + 变更日志表。
- 改文档时只注明改了哪些章节,方便聚焦 diff、省 token。

---

## 3. 架构概要(代码在哪)

项目位于 `~/vscode/chatsift`,独立 git 仓库。API 前缀 `/api/v1/`,server 端口 3100,MySQL 3306,admin 前端 Vite+Vue3+ElementPlus,dev 端口 5173。chat_rpa 全程只读参考、**绝不修改**。

**数据流(完整闭环)**:
```
抖音私信页面
  ↓ 插件采集(纯 DOM + 合成ID,永不发送)
events/batch 上报
  ↓ analyzer 串行队列
五引擎分析:intent(意图) → completeness(完整度) → goal(阶段) → workorder(工单) → lead(线索)
  ↓
MySQL(conversations/messages/workorders/leads/...)
  ↓
admin 后台四页(控制台/会话中心/工单中心/线索中心)+ 运营分析 + 准实时提醒
```

**关键文件**:
- 采集:`plugin/adapters/douyin/*.adapter.js`(private-message 是主力)、`plugin/runtime/legacy-collector.js`、`event-queue.js`、`event-uploader.js`、`plugin/content.js`(构建产物,改 adapter 后 `npm run build:plugin` 重新生成)
- 分析引擎:`server/src/v1/` 下 intent-engine.js / completeness-engine.js / lead-engine.js / validity-checker.js / diagnosis.js / llm-client.js / analyzer.js / business-rules.js
- 接口:`server/src/controllers/v1/`
- 前端:`admin/src/views/`(Conversations/ConversationDetail/Workorders/Leads/LeadDetail/Analytics/LlmConfig)、`admin/src/components/MessageDrawer.vue`

---

## 4. 已锁定的关键决策与口径(别擅自改)

以下是历经多轮讨论锁定的口径。**改任何一条都是 B 类,要先报 Chase。**

**采集侧:**
- 纯 DOM 采集 + 合成 message_id(`hash(conversationId+direction+content+时间到分钟)`),放弃 chrome.debugger 网络拦截。
- conversation_id = `platform + platform_page + nickname` 的稳定组合(不含头像 URL——头像会波动导致会话被拆,W6.5 修过)。nickname 读到 unknown 时跳过不上报。
- 消息时间 occurred_at:优先读每条消息的 invisible 精确时间标签(`p.invisible.whitespace-nowrap.absolute`,在消息列 flex-col 容器内、是消息行的兄弟节点,精确到秒);读不到才用相对时间解析/锚点继承兜底。(W12.6)
- 采集前提:**抖音页面必须前台打开**(浏览器休眠后台标签会导致 DOM 不刷新、采集停止)。这是物理限制,写进了用户手册。

**分析侧:**
- intent(意图):取**最近20条 inbound**(客户发的),**排除 outbound**(客服话术会反向污染,如把促销误判成问价)。意图看近期防漂移。
- completeness(完整度):取**全量 inbound**,字段**只增不减**(早期给的字段不被后续覆盖)。按**有效字段数/总数×100**评分。
- 意图优先级:投诉 > 问价 > 预约 > 咨询(投诉最优先)。结构化预约识别要**让位投诉**。
- 租车预约 6 字段:姓名/城市/时间/联系方式/上车位置/车型。
- 字段有效性三态:valid/invalid/unknown(unknown=配额耗尽AI没跑,标待核对)。规则优先(手机号正则、城市/车型词表)、AI 兜底(地址点vs片、时间具体度、姓名真伪)。结果存 `conversations.field_validity` JSON,**报表只读不重算 AI**(省钱铁律)。
- lead 聚合:模型 C(单页面内按客户聚合 ≈ 会话一对一),leads 表结构按模型 B 预留(未来跨平台合并)。lead 的 status(人工设的 following/converted/lost)**不被分析回退**。
- 诊断颜色:读 field_validity **实时拼,不存表**。红=硬伤、橙=存疑、绿=有效、灰=无信息,列表主色取最严重。

**LLM:**
- DeepSeek(api_base=https://api.deepseek.com,model=deepseek-chat,OpenAI兼容)。
- **费用完全租户化**:每租户在 tenant_llm_config 配自己的 key/额度,花自己的钱。
- llm-client **任何失败返回 {ok:false} 不抛异常**(它在 analyzer worker 里,抛异常会崩队列)。
- 省钱铁律:规则能命中的不调 LLM、outbound 不分析、字段抽全不调、配额耗尽降级。
- **API key 安全**:不进代码/报告/git/日志,GET 脱敏(sk-****xxxx),PUT 留空不改 key。**接手者绝不接触真实 key**,由 Chase 在后台配。

**运营漏斗:**
- 三环:咨询 → 留资 → 预约,**不含成交**(成交在线下,采集不到)。
- 留资 = contact 字段 valid;预约 = 6 字段全 valid(按实体字段值判,不按 score/stage 状态)。真包含,转化率 ≤100%。

**准实时(W12):**
- 采集节流~10秒、EventQueue 满10条或15秒flush、分析1-3秒、后台30秒轮询提醒。目标总延迟30-45秒、最坏1分钟。
- 后台提醒只推"完整预约/投诉/高意向 lead",普通咨询不推(别淹没客服)。
- 不做 WebSocket,轮询足够。

**业务规则租户化(未来专项,现在硬编码)**:一期只有租车,规则硬编码在 business-rules.js,注释标明"租车行业规则,未来按租户配置"。未来接第二个行业客户时,把"读常量"改成"读租户配置表",引擎不动。配置由平台实施人员做,不开放租户自助 UI。

---

## 5. 故意保留的东西(别"好心"清理)⚠️

接手者读代码时会看到一些"看起来该清理"的东西,但它们是**故意留的**,清理前必须先问 Chase:

- **旧 V1.9 runtime 死代码**(queue-manager/batch-manager/runtime-manager/recovery/chaos/bug-dump/rpc-bridge 等):采集链路没用到,但互相缠绕,留作未来统一的"清理周"再删。现在别动。
- **两个过时的 smoke 脚本**(`scripts/smoke/douyin-private-regression.js` 依赖已删除的快照文件、`runtime-lock-regression.js` 按 W5 前的发送锁语义检查):它们必然失败,但失败原因是脚本过时不是代码 bug。可在清理周一起处理。
- **同名客户会误合并**:conversation_id 用 nickname,同一页面同名客户会被当成一个。这是抖音无稳定客户 ID 阶段的接受的权衡,不是 bug。
- **历史 AI 回复消息混在 outbound 里**:采集数据里有历史上别的工具自动发的 outbound 消息(机器发的)。意图分析已排除 outbound 所以不受影响,但未来做"客服质量分析"时要注意区分人工/机器 outbound。

---

## 6. 当前进度与待办

**已完成并验收(W0-W12 + 修复周 W4.5/W6.5/W12.5)**:
- MVP 主线 W0-W9:采集→五引擎→后台四页→运营漏斗。
- 打磨 W10(字段有效性)/W11(诊断颜色+快速复核)/W12(准实时+提醒)。
- W12.5:intent 口径修正(20条inbound)、结构化预约让位投诉、插件自动刷新。

**进行中**:
- **W12.6(消息时间/顺序修复)**:代码完成(v1.3.0,读 invisible 精确时间标签),模拟验证通过。**待 Chase 真实重采验证"真实时间准确率≥95%"**——重新加载插件→重采→查 raw_snapshot 的 time_source 分布(绝大多数应是 precise-invisible)、抽样对比入库时间与 hover 时间。验证通过 W12.6 才收口。
- W12.6 同批还做了会话中心搜索增强(页面下拉/昵称/消息搜索/页面名称展示)——这是 Chase 要求的,已授权。

**待启动**:
- **W13(消息聚合展示)**:把会话/消息/诊断/字段聚合成一个**纯只读**的多栏视图(类似四栏布局:会话列表+消息流+字段诊断+工单)。**绝对无发送入口**(见红线)。中间消息流用 W12.6 的精确时间,字段诊断复用 W11 的颜色。设计细节待 W12.6 验证后和 Chase 定。

**MVP 后迭代池(不急,等真实客户反馈排优先级)**:
- 业务规则租户化(接第二个行业客户时启动)
- 跨平台客户合并(模型 C→B,需稳定客户 ID)
- 清理周(删旧 V1.9 runtime 死代码 + 过时 smoke 脚本)
- 历史 AI 回复消息对运营指标的污染处理

---

## 7. 接手者的工作方式建议

- **保留检查点习惯**:虽然你(Claude Code)能直接改代码+commit,但请保持"分阶段、改完报告、Chase 确认再继续"的节奏。Chase 是非技术背景的产品负责人,需要 step-by-step 的清晰沟通,且要他确认产品决策。别一口气改一大堆。
- **诊断优于猜测**:你能直接读代码/数据库/git,遇到 bug 先诊断(看真实代码和数据)再动手,别凭感觉改。这是相比之前模式的最大优势,用好它。
- **改已验收代码(C类)要重跑对应验收**:每周的验收 case 在 docs/reports/ 里,改了相关逻辑要重新验证没碰坏。
- **Chase 负责真实浏览器验证**:涉及真实抖音页面采集的验证(时间、顺序、采集完整性),你做不了,要 Chase 配合。
- **不改 chat_rpa**:它只是只读参考。

---

## 8. 接手确认清单

接手者开始前,确认能回答:
- [ ] chatsift 的核心红线是什么?(永不发送)
- [ ] intent 和 completeness 的取数口径分别是什么?为什么不同?
- [ ] 漏斗三环怎么定义?为什么不含成交?
- [ ] 哪些代码是"故意保留别动"的?
- [ ] 现在停在哪?下一步做什么?
- [ ] A/B/C 类变更分别怎么处理?

能答对,说明接手成功。答不全,回去再读 docs/。
