---
文档: chatsift dom-collector 改造方案(阶段二:改造成选择器调研工具)
版本: v1.0.0
状态: Active
---

## 变更日志

| 版本 | 日期 | 变更摘要 | 触发来源 |
|---|---|---|---|
| v1.0.0 | 2026-06-02 | 阶段二改造:抢救落点、剔除发送点位、对接 chatsift 平台体系、导出 selectors.json | 调研完成 + Chase 三点确认 |

---

# dom-collector 改造:阶段二(改造成 chatsift 选择器调研工具)

> **定位(已与调研对齐)**:dom-collector **不是采集器**(它不采消息),是一个"人工可视化点选元素 → 生成多策略选择器 → 导出 selectors.json"的**调研工具**。
> **真正价值**:chatsift 未来扩多平台时,每个"平台-页面"都要人工摸 DOM 找选择器——又慢又易错。dom-collector 把这件事变成可视化点选、自动生成、自动验证、自动归一化随机class,产出准确的 selectors.json **交给 CC 作为开发新平台 adapter 的依据**。它是开发辅助工具,不是 chatsift 运行时组件。
> **Chase 已确认**:① 落点 `chatsift/tools/dom-collector/`;② 原样拷保命 + 改造时剔发送点位(并核查确认无发送执行代码);③ 导出 selectors.json,人工转发给 CC(不做 dom-adapter-config 自动下发)。
> **不影响生产**:工具放 tools/、不进 plugin 采集运行时、不动 chatsift 现有采集(W4-W12.6 全部保留)。

---

## 0. 改造目标一句话

把 chat_rpa 的 dom-collector 改造成 **chatsift 的"平台-页面选择器调研工具"**:剔除发送点位、对接 chatsift 的平台/页面体系、产出准确的 selectors.json,供 CC 扩平台开发时参考。**核心价值是"扩平台时快速准确拿选择器",不是采集消息。**

---

## Task 1 — 抢救 + 落点

```bash
# 原样拷贝到 chatsift/tools/(保命、可追溯,不进 plugin 运行时)
mkdir -p ~/vscode/chatsift/tools
cp -R ~/vscode/chat_rpa/dom-collector ~/vscode/chatsift/tools/dom-collector
cd ~/vscode/chatsift
git add tools/dom-collector
git commit -m "chore(tools): salvage dom-collector from chat_rpa (pre-refactor, original)"
```

先原样提交一次(保留 chat_rpa 原始版本可追溯),再在后续 Task 做改造。
注意:这是工具目录,**不纳入 plugin 构建、不进采集运行时**。

---

## Task 2 — 剔除发送点位 + 红线核查

> Chase 说明:dom-collector 本来就不带发送功能(只是点选元素生成选择器)。所以这一步是"删掉发送区点位定义 + 核查确认确实没有发送执行代码",不是拆发送功能。

剔除(按调研报告第六节):

| 位置 | 处置 |
|---|---|
| `content.js:42-45` 的 `ELEMENT_TYPES` 中 `inputBox`/`sendButton`/`sendButtonDisabledState`/`inputDisabledHint` | 删除这4个发送区点位定义 |
| `popup/popup.js:31-34` 同样4个点位 | 删除 |
| `dom-snapshots/*.selectors.json` 里上述键的选择器 | 旧快照可清理或留作参考(重采时不再含) |
| `README.md` 的发送合约(`sendReply→verifySent`、点位映射表的输入框/发送按钮行) | 重写为"只读选择器调研"合约,去掉所有 send/verifySent 表述 |

**保留(不属发送)**:`closedHint`/`loginDialog`/`historyLoadTrigger`/`messageSystemText` 等会话/页面状态点位。

**红线核查(顺手做)**:剔除后全局 grep 确认无发送执行代码:
```bash
cd ~/vscode/chatsift/tools/dom-collector
grep -rn "send\|发送\|reply\|verifySent\|输入框\|点击发送\|\.click()\|submit" .
# 确认:没有任何"填输入框→点发送"的执行逻辑(本来就没有,核查确认)
```
回报核查结论(应为:工具只生成选择器/写本地json,无任何发送执行)。

```bash
git add tools/dom-collector
git commit -m "chore(tools/dom-collector): remove send element-type definitions, rewrite contract to read-only

- 删 ELEMENT_TYPES 的 inputBox/sendButton/sendButtonDisabledState/inputDisabledHint
- README 改为只读选择器调研合约
- grep 核查确认无发送执行代码(本就只生成选择器)"
```

---

## Task 3 — 点位清单按 ABC 三层组织(核心:采什么)

> dom-collector 的点位清单**严格按 ABC 三层分类组织,不平铺**。采集时:会话级(A)整对话采一份、消息级(B)逐条采、段落级(C)单独管。
> **重要区分**:点位 = "DOM 上能点选到的元素"。有些字段(方向/顺序/精确时间结构化爬取/去重)**不是点选元素能采的,要靠逻辑推导**——这些不列点位,写进 §3.4 的"逻辑推导字段说明"给 CC。

### 3.1 A. 会话级点位(整对话一份,采一次)

| 点位 | 选择器目标 | 建议 |
|---|---|---|
| 客户昵称 | 会话标题/昵称节点 | 必采 |
| 客服账号 | 当前接待客服账号节点 | 必采 |
| 会话Tab | 当前咨询/历史咨询 tab | 建议 |
| 来源标签 | 经营源/自然流量 节点 | 建议 |
| 留资状态标签 | 已留资 节点 | 建议 |
| 登录态 | loginDialog(保留,状态识别) | 保留 |
| 会话关闭态 | closedHint(保留) | 保留 |

> accountId(稳定客户ID):**DOM 不暴露,无法点选**(调研已证实)。不列点位,见 §3.4。

### 3.2 B. 消息级点位(每条消息,逐条采)⭐核心

| 点位 | 选择器目标 | 建议 |
|---|---|---|
| 消息容器 | 单条消息的根节点(如 my-4 行) | 必采(逐条遍历的锚) |
| 用户消息文本 | 用户气泡文本节点 | 必采 |
| 自己消息文本 | 自己(客服)气泡文本节点 | 必采(与上一条配合判方向,见§3.4) |
| 消息类型判别锚 | 图片/卡片/系统消息的区分节点 | 建议 |
| 发送者名 | 消息上方发送者名节点 | 建议 |
| 加载历史触发器 | historyLoadTrigger(滚动加载更多) | 保留(采全历史) |

> inbound 精确时间(invisible 节点):**不是单个选择器能定位的**(要结构化爬取),不列点位,见 §3.4。
> outbound 精确时间:hover 才生成,**采不到**,见 §3.4。

### 3.3 C. 段落级点位(时间分隔条,单独管)

| 点位 | 选择器目标 | 建议 |
|---|---|---|
| 时间分隔条 | 居中的时间节点(messageSystemText/分隔条) | 必采 |

### 3.4 逻辑推导字段说明(不是点位,写给 CC 实现)⚠️

以下字段**采集器采不到**(不是 DOM 上点选一个元素就有的),要靠 CC 写运行时逻辑推导。dom-collector 导出 selectors.json 时,**附这份说明给 CC**:

| 字段 | 为什么不能点选 | CC 实现逻辑 |
|---|---|---|
| **方向(inbound/outbound)** | 不是某节点的值 | 靠"命中用户消息文本选择器=inbound / 命中自己消息文本选择器=outbound",或靠消息容器在左/右(class 区分) |
| **消息顺序** | 不是采来的 | 按消息容器在 DOM 中的出现顺序(从上到下),配合精确时间;时间相等或缺失时按 DOM 顺序单调保序(承接 W12.6) |
| **inbound 精确时间** | 要结构化爬取非单选择器 | 从消息文本节点**向上爬到 flex-col 列容器,再找隐藏的 invisible 兄弟节点**(p.invisible.whitespace-nowrap.absolute),取其文本(W12.6 逻辑,精确到秒) |
| **outbound 精确时间** | hover 才动态生成,采不到 | 降级:不采精确时间,继承最近时间分隔条(C 点位)+ DOM 顺序保序 |
| **消息唯一标识(去重)** | DOM 无原生 msg_id | 合成 message_id(会话+方向+内容+seq),seq 按 DOM 顺序(W4/W12.6) |
| **accountId(稳定客户ID)** | DOM 不暴露 | 拿不到;会话标识用 pageKey+nickname 合成(W6.5 取舍) |

> 一句话:**点位采"DOM 上看得见、点得到"的;逻辑推导"看不见、要算出来"的(方向/顺序/精确时间爬取/去重)。** 两者分开,前者进 selectors.json,后者附说明给 CC。

---

## Task 4 — 对接 chatsift 平台/页面体系

dom-collector 原来 fetch chat_rpa 的 `/api/auth/login` + `/api/platforms` 填平台-页面下拉框。改成对接 chatsift:

- 登录接口指向 chatsift server(同样有 auth)
- 平台/页面树指向 chatsift 的 platforms(复用表,chatsift 也有)
- 确认 schema_version/platform_key/page_key 等字段和 chatsift 的平台-页面定义对得上
- 如果接口路径/字段有差异,适配成 chatsift 的

目的:让 dom-collector 在 chatsift 体系里能选"给哪个平台-页面采选择器",导出的 json 带正确的 platform_key/page_key。

---

## Task 5 — 导出 selectors.json(核心产出)

确认导出功能正常,产出的 selectors.json 结构清晰、可直接给 CC 用:

- 导出结构:`{schema_version, platform_key, page_key, url_pattern, capture_points, validation_summary, selectors}`(沿用原结构,去掉发送点位)
- 每个点位含多策略选择器(primary/css_list/xpath/text_xpath/dom_path/sample_html)+ 归一化后的稳定 class
- 导出前强制验证(原有的 validateCollectedSelectors):确保选择器在当前页面能命中
- 导出到本地文件(showDirectoryPicker 或浏览器下载)

**用法约定(写进 README)**:扩新平台时,实施/运营人员用 dom-collector 在目标平台页面点选必要元素 → 导出 selectors.json → **人工转发给 CC** → CC 据此开发该平台的 adapter。

---

## Task 6 — 验收

### 6.1 工具可用
```
- 在 chatsift 体系登录、选平台-页面
- 在一个目标页面(如抖音私信,已知结构)点选元素,生成选择器
- 导出 selectors.json,结构正确、含多策略选择器、无发送点位
- 导出前验证生效(选择器能命中)
```

### 6.2 红线
```
- grep 确认 tools/dom-collector 无发送执行代码、无 inputBox/sendButton 点位定义
- 确认 tools/dom-collector 不进 plugin 构建、不进采集运行时(独立工具)
```

### 6.3 不影响生产
```
- chatsift 现有采集(plugin/)、server、admin 完全不受影响(dom-collector 是独立工具)
- W4-W12.6 的采集运行时一行未动
```

### 6.4 提交
```bash
git add tools/dom-collector
git commit -m "feat(tools/dom-collector): refactor to chatsift selector research tool

- 对接 chatsift 平台/页面体系
- 导出 selectors.json 供扩平台开发参考(人工转发CC)
- 独立工具, 不进采集运行时, 不影响生产"
```

---

## 完成标准(验收报告)

> 报告写 `docs/reports/dom-collector-refactor.md`。

- [ ] 原样拷到 tools/dom-collector 并先提交一次(可追溯)
- [ ] 剔除4个发送点位 + README 改只读合约 + grep 核查确认无发送执行代码
- [ ] **点位清单按 ABC 三层组织(A会话级/B消息级/C段落级),不平铺**
- [ ] **逻辑推导字段(方向/顺序/精确时间爬取/去重/accountId)不列点位,写成"附给CC的说明"(§3.4)**
- [ ] 对接 chatsift 平台/页面体系(登录、平台树)
- [ ] 导出 selectors.json 结构正确、多策略、无发送点位、导出前验证生效
- [ ] README 写明用法(扩平台时点选→导出→人工转发CC开发adapter)
- [ ] 红线:无发送执行代码、不进采集运行时
- [ ] 不影响生产:chatsift 现有采集/server/admin 未动
- [ ] git log 独立(原样拷一次 + 改造若干次)

---

## 重要提示

- **定位:选择器调研工具,不是采集器**。它产出选择器配置,不采消息。chatsift 采集运行时(W4-W12.6)一行不动
- **点位按 ABC 三层组织,不平铺**:A会话级(采一次)、B消息级(逐条)、C段落级(分隔条)
- **点位 vs 逻辑推导,要分清**:点位采"DOM上看得见、点得到"的(内容/昵称/分隔条等);方向/顺序/inbound精确时间爬取/去重/accountId 这些**看不见、要算出来**的,不列点位,写成附给CC的逻辑说明(§3.4)
- **核心价值:扩平台提效**。未来接新平台时,可视化点选+自动生成验证+归一化随机class,快速准确拿选择器交给 CC 开发,替代人工肉眼摸 DOM
- **现实预期**:它优化"采 DOM 里有的东西"的效率和准确度,不能创造"DOM 里没有的东西"(如抖音没有稳定accountId,它也采不到)
- **红线**:剔除发送点位 + 核查确认无发送执行代码(本就没有)。工具不进采集运行时
- **简单版**:导出 json 人工转发 CC,不做 dom-adapter-config 自动下发(那是更大工程,以后再说)
- **不依赖 chat_rpa**:代码拷进 chatsift 自己的 tools/,chat_rpa 重置后不受影响
- **流程**(W12.5重申):按方案做,有偏差先报