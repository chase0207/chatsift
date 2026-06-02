---
文档: dom-collector 调研报告(阶段一:调研 + 抢救 + 剔除发送)
版本: v1.0.0
状态: 调研完成,待改造方案
日期: 2026-06-02
方法: 只读 chat_rpa/dom-collector 源码 + 真实选择器快照对照 chatsift adapter,不改任何代码
---

## 变更日志

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0.0 | 2026-06-02 | 初版:Dx Task 1-5 调研、发送点位剔除清单、与 chatsift 互补判断 |

---

## 红线前置结论(最重要,先说)

**dom-collector 自身不执行发送、不上报消息、不调用抖音任何接口。** 它是一个**"DOM 选择器可视化采集工具"**:人工在页面上点选元素 → 生成多策略选择器 → 导出 `{platform}-{page}.selectors.json` 本地文件,供 RPA 主插件迁移参考。

"沾发送"只存在于两处,且**都是声明/文档层面,没有发送执行代码**:
1. 点位清单 `ELEMENT_TYPES` 里有发送区点位定义(`inputBox`/`sendButton`/`sendButtonDisabledState`/`inputDisabledHint`)——只是"让用户去点选输入框/发送按钮在哪",导出其选择器。
2. `README.md` 的合约链路描述了 `sendReply -> verifySent`、点位映射表含输入框/发送按钮。

**剔除方式:删点位定义 + 重写 README 合约段即可,没有发送执行逻辑需要拆。** 详见第六节剔除清单。

---

## Task 1: 定位与抢救

- **源路径**:`/Users/caihongyang/vscode/chat_rpa/dom-collector`(本地仓库,非服务器版本)。
- **规模**:14 个文件 / 1562 行 JS,**无 node_modules 依赖**(纯原生 JS + chrome 扩展 API)。
- **形态**:独立 MV3 插件(side_panel),`manifest version 1.9.0`,permissions 仅 `storage/activeTab/scripting/sidePanel`,**无 debugger**(纯 DOM,与 chatsift 同路线)。

文件清单:

| 文件 | 行/大小 | 作用 |
|---|---|---|
| `content.js` | 848 行 | 主力:点选、生成选择器、验证、页面 overlay |
| `popup/popup.js` | 698 行 | 侧边栏:登录、平台/页面选择、采集控制、导出 JSON |
| `popup/popup.html` `popup/popup.css` `overlay.css` | — | 侧边栏与页面高亮样式 |
| `background.js` | 17 行 | 仅 sidePanel 开关 |
| `manifest.json` | — | MV3 配置 |
| `dom-snapshots/douyin-1.selectors.json` | — | 抖音私信(clue_private_message)真实采集产物 |
| `dom-snapshots/douyin-2.selectors.json` | — | 抖音 life.douyin.com/cs/web 产物 |
| `README.md` | 192 行 | 使用说明 + 合约映射(含发送合约,需重写) |
| `icons/` | 3 图标 | 资源 |

> **注**:chatsift 那个失效的 `scripts/smoke/douyin-private-regression.js` 依赖的 `dom-snapshots/douyin-1.selectors.json`,源头就是这里。

**抢救情况(已执行)**:
- 已**原样拷贝**到 `chatsift/tools/dom-collector/`(14 文件完整,独立工具目录,**未进 plugin 采集链路**、未改内容、未合并、未 commit)。
- 命令:`cp -R ~/vscode/chat_rpa/dom-collector ~/vscode/chatsift/tools/dom-collector`。
- 现在 chat_rpa 即使重置,源码已在 chatsift 仓库保全。剔除发送留待阶段二改造(先保留原样,可追溯)。
- 待确认:落点 `tools/dom-collector/` 是否合适(可移)。

---

## Task 2: 逐文件分类(纯采集 / 沾发送 / 不确定)

| 文件 | 分类 | 说明 |
|---|---|---|
| `content.js` | 纯采集为主 + 4 处发送点位定义 | 选择器引擎/验证/overlay 全是通用采集;只有 `ELEMENT_TYPES` 中 `inputBox/sendButton/sendButtonDisabledState/inputDisabledHint`(`:42-45`)是发送点位声明 |
| `popup/popup.js` | 纯采集为主 + 同 4 处发送点位定义 | UI/登录/平台选择/导出全通用;`ELEMENT_TYPES`(`:31-34`)同样含 4 个发送点位 |
| `popup/popup.html` | 纯采集 | 渲染由 `ELEMENT_TYPES` 驱动,无独立发送按钮/输入框 UI |
| `popup/popup.css`、`overlay.css` | 纯采集 | 样式 |
| `background.js` | 纯采集 | 仅 sidePanel |
| `manifest.json` | 纯采集 | 无 debugger;权限最小 |
| `dom-snapshots/*.selectors.json` | 数据沾发送 | 采集产物里含 `inputBox/sendButton/...` 的选择器,属采集结果,剔除点位时连带去掉 |
| `README.md` | 文档沾发送 | 合约链路 `sendReply -> verifySent`、点位映射表含输入框/发送按钮,需重写 |
| `icons/` | 纯采集 | 资源 |

**结论**:没有任何文件含"执行发送"的代码;发送耦合集中在 `ELEMENT_TYPES` 的 4 个点位声明 + README 合约文字 + 快照里的对应选择器。剔除面很小、很干净。

---

## Task 3: 现有采集能力(它采的是"选择器",不是"消息")

**本质**:dom-collector 是**选择器调研工具**,不是消息采集运行时。它不解析消息内容、不识别消息事实、不上报会话数据。

能力清单:
1. **可视化点选**:鼠标悬停高亮 + 点击锁定元素(`content.js` handleCollectorPick)。
2. **多策略选择器生成**(`generateSelectors`):`primary`(页面内唯一的 CSS)、`css_list`、`xpath`、`text_xpath`、`dom_path`、`sample_html`。
3. **动态 hash class 归一化**(`normalizeClass`):`contactCard-NdfsWo` → `[class*="contactCard"]`,过滤随机串 class——这是工程价值点。
4. **shadowRoot / 同源 iframe 穿透**(`collectOpenShadowRoots`/`collectSameOriginFrameDocuments`)。
5. **选择器验证**(`validateCollectedSelectors`):按 primary→css_list→xpath→text_xpath 重新查找命中并高亮,导出前强制验证核心点位。
6. **26 类点位清单**(分组:会话列表/会话身份/会话校验/消息区/发送区/异常态),12 个 required。
7. **导出**:组装 `{schema_version, platform_key, page_key, url_pattern, capture_points, validation_summary, selectors}` → 写本地文件。

**"消息/方向/时间/会话怎么识别"——只到选择器层**:
- 方向:靠两个独立选择器区分——`messageText`(用户气泡)vs `selfMessageText`(自己气泡)。
- 时间:`messageTimestamp` 点位指向一个时间节点(见 Task 4,采的是可见 text-xs span)。
- 会话:`sessionTitle`/`activeContactItem`/`sessionUserIdNode` 等点位。
- **它不做** occurred_at 解析、方向启发式、锚点继承、单调排序、去重、上报——这些都是 chatsift 运行时才有的。

**上报机制 / server 耦合(很轻)**:
- 只 fetch 自己 admin server 两个接口:`/api/auth/login`(登录拿 token)、`/api/platforms`(拉平台-页面树填下拉框)。
- 选择器**不回传 server**,导出是 `showDirectoryPicker` 写本地 `dom-snapshots/`(或退回浏览器下载)。
- 这两个接口 chatsift server 也有(复用表 platforms),耦合可忽略。

---

## Task 4: 与 chatsift 采集(W4-W12.6)是替换还是互补 —— **互补,不替换**

dom-collector 真实快照(`douyin-1`,URL 正是 chatsift 主路径 `clue_private_message/chat/session`)对照 chatsift adapter:

| 点位 | dom-collector 快照 primary | chatsift adapter | 一致? |
|---|---|---|---|
| messageItem | `div[class*="my-4"]` | `div[class*="my-4"]` | 完全一致 |
| messageText | `div[class*="px-3"][class*="py-2"][class*="text"][class*="break-all"][class*="whitespace"]` | bubbleText[0] `div[class*="px-3"][class*="py-2"][class*="break-all"][class*="whitespace"]` | 几乎一致 |
| messageTimestamp | `span[class*="text-xs"]...[class*="mr-2"]`,值 `2026-05-23 04:51:51` | `_extractMessageTime` = `.//span[contains(@class,"text-xs")]` | 一致(都是"可见旧时间") |
| messageSystemText | `div[class*="px-4"][class*="text-xs"]...[class*="my-4"]`,值 `2026-05-23 04:48` | 分隔条 anchor(无文本的 my-4 行) | 对应 |
| sessionTitle | `div[class*="flex-1"][class*="flex"][class*="items"]...` | `_readNickname`(msgTitle/userInfo/sessionTitle) | 思路一致 |

**关键差异(决定"不能替换")**:
- dom-collector 的 `messageTimestamp` 采的是**可见的 `text-xs ... mr-2` span**,等价于 chatsift 时间三级里的**第二级"旧独立时间"**。
- chatsift W12.6 的**精确时间**用的是 **invisible 节点**(`p.invisible.whitespace-nowrap.absolute`)+ **从文本节点向上爬到 `flex-1 flex-col` 列容器再找隐藏兄弟节点**的结构化逻辑。
- dom-collector"一个选择器指向一个节点"的模型**表达不了这种结构化爬取** → 若用 dom-collector 的选择器驱动采集,**会丢掉 W12.6 的精确时间,退回到可见旧时间**。这正是要避免的。

**结论:互补。**
- dom-collector 的价值:把 chatsift **硬编码 SELECTORS 外置化/可视化维护**——对应 chatsift 早就预留、但至今未启用的 `dom-adapter-config` 服务端下发(见 `SPEC_GAP C6`)。抖音改版时,运营/实施人员可视化重采选择器,不必改代码。
- **不动 chatsift 的运行时成果**:消息提取、方向判定、精确时间(invisible+爬容器)、锚点继承、单调排序、seq 去重、上报——全部保留。
- 可能的结合点:dom-collector 导出的 selectors JSON → 喂给 chatsift 的 `dom-adapter-config` 接口下发 → adapter 用外置选择器替换内置硬编码的**那部分**(列表/容器/文本/方向),**但时间提取的结构化逻辑仍走 chatsift 代码**。

---

## Task 5: 与 ABC 字段目标(任务文档 §4)的差距

> ABC 字段目标已在 `chatsift_dom-collector_stage1_tasks.md §4` 明确定义。下表逐字段对照:目标 / chatsift 现状(W12.6 后)/ dom-collector 能力 / 差距。★ 标关键项。

### A. 会话级

| 字段 | 目标 | chatsift 现状 | dom-collector | 差距/备注 |
|---|---|---|---|---|
| 客户昵称 | 必采 | 已采(`_readNickname`) | `sessionTitle` 点位 | 都有 |
| **accountId(客户稳定ID)** | 必采 | **未用**(W6.5 简化为 pageKey+nickname) | **采不到**(纯 DOM,不读 URL) | ★ 在 **URL query**(`accountId=数字`);chatsift 读 `location.search` 即得,dom-collector 盲区。见下方专项① |
| 所属客服账号 | 必采 | 已采(`71faba4` 采 agent 账号名) | `messageSenderName` 点位 | chatsift 已做 |
| 会话Tab(当前/历史) | 建议 | 未采 | 无对应点位 | 都缺 |
| 来源标签(经营源/自然) | 建议 | 未采 | 无 | 都缺 |
| 留资状态标签 | 建议 | 未采(后台算) | 无 | 都缺 |
| 客户头像 | 无需 | W6.5 已砍 | `sessionAvatar` 点位 | 无需 |

### B. 消息级 ⭐核心

| 字段 | 目标 | chatsift 现状 | dom-collector | 差距 |
|---|---|---|---|---|
| 消息内容 | 必采 | 已采 | `messageText`/`selfMessageText` | 都有 |
| 方向 | 必采 | `_isOutbound` 启发式 | `messageText` vs `selfMessageText` 两选择器 | 都有 |
| DOM顺序 | 必采 | 按 my-4 DOM 序 | `messageItem` | 都有 |
| **inbound精确时间(invisible)** | 必采 | ★ W12.6 已做(invisible+爬 flex-col 容器) | **采不到**(`messageTimestamp` 采的是可见 text-xs span) | ★ chatsift 独有,dom-collector 选择器模型表达不了 |
| **消息唯一标识(优先原生msg_id)** | 必采 | 合成(会话+方向+内容+seq) | 无 msg_id 点位 | ★ 原生 msg_id DOM 没有(both),见专项② |
| 消息类型(文本/图/卡/系统) | 建议 | 部分(text) | `messageImage`/`messageProductCard`/`messageSystemText` 点位 | dom-collector 点位更全 |
| 发送者名 | 建议 | 部分 | `messageSenderName` | 接近 |
| 时间来源标记 | 建议 | ★ 已做(`time_source`:precise-invisible/inherited/anchor/fallback) | 无 | chatsift 独有 |
| outbound精确时间 | 无需 | inherited 继承 | — | 一致(降级) |
| 已读/未读 | 无需 | — | — | 无需 |

### C. 段落级

| 字段 | 目标 | chatsift 现状 | dom-collector | 差距 |
|---|---|---|---|---|
| 时间分隔条 | 必采 | ★ 已做(anchor 锚点) | `messageSystemText` 点位(快照采到 `2026-05-23 04:48`) | 都有;dom-collector 有独立点位 |

### 两个关键确认(Dx5 重点)

**① accountId 是否每会话都有、能稳定取到?**
- accountId **在 URL query,不在 DOM**:你截图 URL `life.douyin.com/cs/...accountId=7613630133065156650`。
- `W6.5_diagnosis.md:86` 明确判定 **"URL 参数在抖音页面基本稳定"**,当年会话分裂(chase 拆 3 条)的祸首是 **avatar**(DOM 头像读取不稳),**不是 accountId**。W6.5 把 accountId 连 avatar 一起砍、简化为 `pageKey+nickname`,是简化副作用,**不是因为 accountId 不稳**。
- 所以 ABC 用 accountId 做客户稳定 ID、根治同名合并,**与 W6.5 诊断一致、方向正确**(`pageKey+nickname` 会把同名不同客户合并,accountId 能区分)。
- chatsift **能读**:`session-identity-resolver.js:95/110` 已有 `URLSearchParams(location.search)` 能力(但采集链路未调,属 U8 死代码);W6.5 的 `_param('accountId')` 也读过。读 `location.search` 即得。
- **dom-collector 采不到**:纯 DOM 节点选择器,不读 URL query(grep 确认)。其 `sessionUserIdNode` 点位在真实快照里采成了输入框 label(`byted-input`,text=null)——证明 DOM 里没有稳定 ID 节点。
- **结论**:accountId 是 chatsift 该补、且能补(读 URL)的字段;dom-collector 帮不上(盲区)。**待你真实核查**(我做不了):页面切换不同客户会话,看 URL `accountId` 是否随客户变、同一客户重进是否不变。

**② 每条消息有没有原生唯一 ID?**
- **没有**。`messageItem = div[class*="my-4"]`,无 `data-msg-id`;`W4_design.md:87` 确认抖音气泡 DOM 无 data-id/data-msg-id,class 是随机串。原生 msg_id 只在网络响应/JS 内存,纯 DOM(含 dom-collector)拿不到,debugger 已否决。
- **结论**:原生 msg_id **无解**(DOM 物理限制)。去重只能靠合成键(chatsift 现用 会话+方向+内容+seq)。但 accountId 把"会话维度"做稳(替代易撞的 nickname)后,能间接降低跨会话去重误判。

### Dx5 小结:dom-collector 补得了/补不了什么

- **补得了**(它擅长):DOM 节点选择器的可视化采集与维护——消息内容/方向/容器/类型/时间分隔条/invisible 节点的**定位**,且 hash class 归一化 + 验证。
- **补不了**(盲区,需 chatsift 自己或无解):
  - accountId → 在 URL query,chatsift 读 `location.search` 自补;
  - 原生 msg_id → DOM 物理没有,无解;
  - inbound 精确时间的结构化提取(invisible + 爬 flex-col 容器)→ chatsift W12.6 运行时逻辑,选择器模型表达不了,**保留不动**。

---

## 六、红线:发送相关剔除清单(改造时执行)

| 位置 | 内容 | 处置 |
|---|---|---|
| `content.js:42-45` `popup/popup.js:31-34` | `ELEMENT_TYPES` 中 `inputBox`/`sendButton`/`sendButtonDisabledState`/`inputDisabledHint` 四个点位定义 | 删除(发送区整组) |
| `dom-snapshots/*.selectors.json` | 快照里上述键的选择器(如 `sendButton: button[type="button"]`) | 重采时不再包含;旧快照可清理 |
| `README.md` | 合约链路 `detect→...→sendReply→verifySent`、点位映射表的"输入框/发送按钮/发送失败"行、`sendReply`/`verifySent` 说明 | 重写为只读采集合约(去掉 send/verifySent) |

**保留(不属发送,只读也有用)**:`closedHint`(会话关闭状态)、`loginDialog`(登录态)、`historyLoadTrigger`(加载历史)、`messageSystemText`(系统提示/时间分割)。这些是会话/页面状态识别,不触红线。

**复核**:剔除后整个工具**无任何发送执行代码、无填输入框、无点发送按钮**——它本来就只生成选择器、写本地 JSON。红线安全。

---

## 七、待 Chase 确认(回报后停下,等阶段二改造方案)

1. **accountId 真实核查**(我做不了,需你在页面操作):切换几个不同客户会话,看 URL `accountId` 是否随客户变、同客户重进是否不变。确认稳定后,阶段二可用它做客户稳定 ID 根治同名合并(这是 ABC.A 最关键、且 dom-collector 补不了的字段)。
2. **抢救落点**:已拷到 `chatsift/tools/dom-collector/`(原样保命)。落点是否 OK?发送点位留阶段二剔(保留原样可追溯),可否?
3. **改造方向**:是否把 dom-collector 改造成"chatsift 选择器可视化维护工具"——导出 selectors JSON 经 `dom-adapter-config` 下发给 adapter,替换**列表/容器/文本/方向**这部分内置选择器,而 **accountId(读 URL)、inbound 精确时间(invisible+爬容器)、去重/排序等仍由 chatsift 运行时承担**?还是另有设想?
