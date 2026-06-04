---
文档: W12.6 任务 — 修消息时间/顺序错乱(阶段一:诊断)
版本: v1.2.0
周次: W12.6(W12.5 后插入)
状态: Active
---

## 变更日志

| 版本 | 日期 | 变更摘要 | 触发来源 |
|---|---|---|---|
| v1.2.0 | 2026-06-01 | 重大升级:发现抖音每条消息有 invisible 的精确时间 p 标签(`text-xs text-gray-3 absolute whitespace-nowrap invisible`,内含"2026-06-01 12:47:18"精确到秒)。修复改为优先直接读该标签,拿每条精确时间,不再靠锚点推算 | 用户 DOM 审查发现精确时间节点 |
| v1.1.0 | 2026-05-31 | 阶段二:补相对时间解析 + 锚点继承 + 默认看最新 | 诊断 + 用户决策 |
| v1.0.0 | 2026-05-31 | 初版,诊断 occurred_at 时间/顺序错乱 | 真实页面验收暴露 |

---

# W12.6:修消息时间/顺序错乱

> **现象**(真实抖音页面 vs chatsift 后台对比):
> - **时间戳错**:真实抖音里"儿童节快乐"是今天(6/1)早上"刚刚"发的,chatsift 里显示成昨天 22:46。其他消息时间也对不上真实发送时间。
> - **顺序乱**:chatsift 聊天记录里消息时间不是单调递增——22:36 → 22:46 → 今天07:23 → 07:24 交替混乱,消息排序错乱。
>
> **根因推断**:抖音 DOM 里消息时间是**相对显示**的("昨天22:36""刚刚""今天")。采集时要把这些相对时间转成绝对时间戳 occurred_at。转换逻辑大概率有 bug(相对时间解析错、时区/跨天处理错、或干脆没解析用了上报时间)。
>
> **影响不小**:occurred_at 错会连带影响分析——intent 看"最近20条 inbound"、completeness 全量按时间,如果时间乱了,"最近"取的不是真正最近的,分析会被带偏。所以这个 bug 要修准。
>
> **风险**:动采集侧时间解析(W4 代码,C 类)。**本任务阶段一:只诊断不改**。

---

## 阶段一:诊断(只查不改)

### Dx Task 1 — 查 occurred_at 怎么来的

```bash
cd ~/vscode/chatsift
# 采集侧:消息时间从哪个 DOM 提取、怎么解析成 occurred_at
grep -n "occurred_at\|occurredAt\|time\|时间\|timestamp\|parseTime\|昨天\|刚刚\|today" plugin/adapters/douyin/*.js plugin/runtime/legacy-collector.js plugin/shared/dom-utils.js
```

把消息时间提取 + 解析成 occurred_at 的完整逻辑贴出来。重点:
- 时间从哪个 DOM 节点取(消息气泡旁的时间戳?)
- 抖音显示的是什么格式("昨天22:36"/"刚刚"/"今天"/"上午10:00"/绝对日期?)
- 怎么转成 occurred_at 的?有没有处理相对时间(昨天/刚刚/今天)和跨天?

### Dx Task 2 — 看真实采集到的 occurred_at 值

```bash
mysql -h127.0.0.1 -uroot chatsift -e "
SELECT id, conversation_id, direction,
       LEFT(content_text,20) AS text,
       occurred_at, uploaded_at
FROM messages
WHERE conversation_id = (SELECT id FROM conversations WHERE customer_nickname='chase' LIMIT 1)
ORDER BY occurred_at
LIMIT 30;"
```

把 chase 会话的消息 occurred_at vs uploaded_at 都打出来。对比:
- occurred_at 和真实发送时间差多少
- occurred_at 是不是约等于 uploaded_at(若是,说明根本没解析消息真实时间,用了上报时间)
- 看"儿童节快乐"那条的 occurred_at 到底是什么值

### Dx Task 3 — 抖音消息时间 DOM 的真实样子

```bash
# 看 adapter 怎么定位消息时间节点;若有 selectors 快照/调研文件也看
grep -n "getMessages\|messageTime\|msgTime\|时间\|timeNode" plugin/adapters/douyin/private-message.adapter.js
ls ~/Downloads/douyin*.json 2>/dev/null && cat ~/Downloads/douyin*.selectors.json 2>/dev/null | grep -A3 -i "time\|时间"
```

回报:抖音私信里,每条消息的时间是怎么在 DOM 上呈现的?
- 是每条消息都有时间,还是只有"分隔时间戳"(隔一段显示一次"昨天22:36",中间消息无独立时间)?
- 时间文本的真实格式样例(尽量贴真实字符串:"昨天 22:36"/"刚刚"/"上午10:00"/"6月1日"?)

**抖音常见情况**:消息列表里不是每条消息都带时间,而是**间隔显示时间分隔条**(如顶部一个"昨天22:36",下面几条消息共享这个时间段)。如果采集只在有时间分隔条时取到时间、中间消息没有独立时间,就可能导致"一批消息共用一个时间"或"取不到时间用上报时间兜底",造成顺序错乱。诊断要确认是不是这种情况。

### Dx Task 4 — 排序逻辑确认

```bash
# 后端/前端按什么排序展示消息
grep -n "ORDER BY\|occurred_at\|sort\|排序" server/src/controllers/v1/conversationsController.js
grep -n "sort\|occurred_at\|时间" admin/src/components/MessageDrawer.vue admin/src/views/ConversationDetail.vue 2>/dev/null
```

回报:消息列表按 occurred_at 升序排?如果 occurred_at 本身错了,排序自然乱。确认排序字段。

### 阶段一回报格式

写成 `docs/reports/W12.6_diagnosis.md`,含:

1. Dx Task 1:occurred_at 提取+解析逻辑(贴代码)
2. Dx Task 2:chase 消息的 occurred_at vs uploaded_at 真实值(关键证据)
3. Dx Task 3:抖音消息时间 DOM 的真实呈现方式(每条都有 / 间隔分隔条)
4. Dx Task 4:展示排序字段
5. 你对"为什么时间错+顺序乱"的判断

**回报后停下,等 Claude 给阶段二修复方案。不要自行改采集或数据库。**

---

## 阶段二:修复(v1.2.0 — 发现精确时间节点,方案升级)

> **重大发现(用户 DOM 审查)**:抖音私信里**每条消息都有一个精确到秒的时间 p 标签**,只是被 CSS 藏起来(hover 才显示):
>
> ```html
> <p class="text-xs text-gray-3 absolute whitespace-nowrap invisible"
>    style="left: 55px; top: -18px;">2026-06-01 12:47:18</p>
> ```
>
> 关键:它带 `invisible` class(visibility:hidden),**但时间文本一直在 DOM 里、不需要 hover 就能读**。这个 p 标签在每条消息容器(`flex-1 flex flex-col`)内部。
>
> **方案升级**:直接读这个 invisible 时间标签,拿每条消息精确到秒的真实时间,**不再靠"锚点继承+推算"**。顺序和时间都精准,实现更简单。原 v1.1.0 的相对时间解析/锚点继承**降级为兜底**(只在某条读不到精确标签时用)。

### Fix Task A(新,首选)— 读 invisible 精确时间标签

改 `plugin/adapters/douyin/private-message.adapter.js` 的消息时间提取:

```
对每条消息节点:
  1. 在消息容器内找精确时间标签:
     用稳定语义特征定位 —— class 含 invisible + whitespace-nowrap + absolute,
     且内容匹配 YYYY-MM-DD HH:mm:ss 格式(双重确认,避免误抓别的 invisible 元素)
  2. 读到 → 解析 "2026-06-01 12:47:18" 为 occurred_at(绝对格式,精确到秒,最好解析)
  3. 读不到 → 走 Fix Task B 兜底
```

注意:
- 内容是完整绝对时间,解析最简单,不用处理相对时间
- 选择器用语义 class(invisible/whitespace-nowrap/absolute 是 Tailwind 工具类,不是随机串)+ 内容正则双重确认
- 每条消息独立精确时间,顺序天然正确

### Fix Task B(兜底)— 相对时间解析 + 锚点继承

仅当 Fix Task A 读不到某条消息精确时间时,走原 v1.1.0 方案(下方"原阶段二方案"即是):相对时间解析、锚点继承、解析失败不继承旧时间用采集时刻兜底、单调保序。codex v1.1.0 若已实现,保留作兜底。

### Fix Task C — 入库顺序、默认看最新、重采验证、回归

- 入库 id 顺序与 DOM 一致(occurred_at 相同时兜底)
- 前端 MessageDrawer/ConversationDetail 默认滚到最新(v1.1.0 已规划,确认做了)
- 清旧数据重采(**先确认插件已重新加载**再清):
  ```sql
  DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE customer_nickname IN ('chase','车评老帅'));
  ```
  验证:每条入库时间 = hover 显示的真实精确时间;"儿童节快乐"显示今天、顺序对;默认看最新;抽查 occurred_at 与 hover 时间一致
- 回归:occurred_at 影响 intent(最近20条)/completeness(全量),重跑确认
- 提交:`fix(W12.6): read douyin per-message precise time (invisible tag)`

---

## 附:原阶段二方案(v1.1.0,现降级为 Fix Task B 兜底)

> 以下为 v1.1.0 方案。v1.2.0 后这些仅在"读不到精确时间标签"时兜底使用。

## 阶段二:修复(已据诊断确认)

> **诊断结论**:occurred_at 来自 adapter 解析 DOM 时间,只认绝对格式 `YYYY-MM-DD HH:mm:ss`,抖音相对时间(昨天/今天/刚刚/N分钟前)解析不了,导致时间错+顺序乱。"儿童节快乐"继承到了旧时间 22:46(真实是今天早上)。
>
> **修复目标(已定)**:
> 1. **优先拿每条消息的精确时间**:补全相对时间解析。只有 DOM 确实没有每条消息时间时,才退而用"继承锚点 + DOM 顺序保序"。
> 2. **顺序尽量贴真实** + **展示默认看最新消息**(打开聊天记录滚到底部/最新,不是停在最老)。
>
> **现实预期**:能做到"顺序正确 + 时间归到正确日期/时段";若抖音 DOM 无每条精确时间,做不到"精确到分钟的绝对时间"(数据源限制)。先尽力拿精确的。
>
> **风险**:动采集侧时间解析(W4,C 类),改完重跑采集验收。

### Fix Task 1 — 先确认抖音消息时间 DOM 结构(决定走A还是B)

修之前先确认一个事实(诊断没完全锁死):抖音私信 DOM 里,**是每条消息都有独立时间,还是间隔显示时间分隔条、中间消息无独立时间?**

```bash
# 看 adapter getMessages 怎么遍历消息、每条消息节点里有没有时间子节点
# 或在真实页面 DevTools 看几条消息的 DOM:相邻两条消息之间有没有各自的时间元素
grep -n "getMessages\|messageTime\|时间\|timeNode\|时间分隔\|divider" plugin/adapters/douyin/private-message.adapter.js
```

回报结论:
- **情况A**:每条消息都能找到对应时间(只是格式是相对的)→ 走 Fix Task 2A
- **情况B**:只有间隔时间分隔条,多数消息无独立时间 → 走 Fix Task 2B

### Fix Task 2A — 补相对时间解析(情况A,优先方案)

在时间解析处(adapter 或 dom-utils 的 parseTime)补全抖音相对时间格式,以**采集时刻**为基准转绝对时间:

```
parseTime(raw, collectAt):  // collectAt = 采集时刻(本地时间)
  - "YYYY-MM-DD HH:mm[:ss]"  → 直接解析(已支持)
  - "HH:mm" / "上午HH:mm"/"下午HH:mm" → 今天(collectAt 的日期)+ 该时刻;下午要+12小时
  - "昨天 HH:mm"            → collectAt日期 -1天 + 该时刻
  - "今天 HH:mm"            → collectAt日期 + 该时刻
  - "刚刚"                  → collectAt
  - "N分钟前" / "N秒前"      → collectAt - N分钟/秒
  - "星期X HH:mm" / "周X"   → 按 collectAt 倒推最近的那个星期X(如有)
  - 解析不了 → 不要静默继承旧时间,记录并兜底(见下)
  注意:跨天、时区(用本地时区,和 collectAt 一致)
```

兜底原则:解析不了时,**不要继承上一条的旧时间**(那正是这次 bug 的来源),改成用 collectAt 或上一条+1秒(保证顺序不倒退),并标记该条时间为"估算"。

### Fix Task 2B — 继承锚点 + DOM 顺序保序(情况B,退而求其次)

若 DOM 确实只有间隔分隔条:

```
遍历消息列表(DOM 从上到下):
  - 遇到时间分隔条 → 解析它作为当前锚点时间(用 Fix Task 2A 的相对时间解析)
  - 遇到消息 → occurred_at = 当前锚点时间;同一锚点下多条消息,
               按 DOM 出现顺序递增(如每条 +1 秒,或加一个 seq 序号字段)
               保证同锚点内消息 occurred_at 单调递增,不相等
  - 没有任何锚点的开头消息 → 用第一个锚点时间往前推,或用 collectAt 兜底
```

关键:保证 **occurred_at 整体单调对应 DOM 顺序**(谁在上面谁更早),这样排序不乱。

### Fix Task 3 — 入库顺序与 id 一致(配合排序)

后台按 `occurred_at ASC, id ASC` 排序。确认:同一批采集的消息,**入库 id 顺序和 DOM 顺序一致**(DOM 上面的先入库、id 更小)。这样当 occurred_at 相同时,id 兜底排序也是对的。

若现状不保证,调整入库顺序(按 DOM 顺序 insert)。

### Fix Task 4 — 展示默认看最新消息(前端,独立改进)

不管时间解析修到什么程度,这个体验改进都要做:

- `MessageDrawer.vue` 和 `ConversationDetail.vue` 的消息流:**打开时默认滚动到底部(最新消息)**,不是停在最老消息
- 消息仍按 occurred_at ASC 从上到下排(老→新),但视口默认定位到底部
- 实现:渲染完成后 scrollTop = scrollHeight(或滚到最后一条)

### Fix Task 5 — 清旧数据重采验证

时间解析修好后,chase 等测试会话的旧 occurred_at 是错的。清掉重采:

```sql
-- 清测试会话消息(或全部测试数据),重采
DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE customer_nickname='chase');
-- 或按需清理
```

Chase 在真实抖音页面重采 chase 会话,验证:
- 消息顺序正确(和真实抖音一致)
- "儿童节快乐"显示成今天(不再是昨天22:46)
- 打开聊天记录默认看到最新消息

### Fix Task 6 — 回归 + 提交

```bash
# occurred_at 影响 intent(最近20条)/completeness(全量按时间),重跑确认分析正常
# 重跑 W4/W5 采集 + W12.5 intent口径
git add plugin/ admin/ server/ docs/
git commit -m "fix(W12.6): parse douyin relative message time, default scroll to latest

- 补相对时间解析(昨天/今天/刚刚/N分钟前), 优先每条精确时间
- (若DOM无每条时间)继承时间分隔锚点+DOM顺序保序
- 解析失败不再继承旧时间, 用采集时刻兜底+标记估算
- 入库id顺序与DOM一致, 配合 occurred_at ASC,id ASC 排序
- 前端消息流默认滚到最新消息
- 清旧数据重采验证顺序/时间正确"
git log --oneline -10
```

---

## 完成标准(验收报告)

> 报告写 `docs/reports/W12.6_acceptance.md`。

阶段一:
- [x] occurred_at 解析逻辑查清(只认绝对格式,相对时间解析不了)
- [x] chase 消息 occurred_at vs uploaded_at 真实值已贴
- [x] 排序字段确认(occurred_at ASC, id ASC)

阶段二(v1.2.0):
- [ ] Fix Task A:读 invisible 精确时间标签,每条消息拿到精确到秒的真实 occurred_at
- [ ] 入库 occurred_at 与 hover 显示的真实时间一致(抽查验证)
- [ ] Fix Task B 兜底:读不到精确标签时,相对时间解析/锚点继承不崩、不继承旧时间
- [ ] 入库 id 顺序与 DOM 一致
- [ ] 前端消息流默认滚到最新消息
- [ ] 清旧数据重采:chase/车评老帅 顺序正确、"儿童节快乐"显示今天、默认看最新
- [ ] 回归:intent(最近20条)/completeness(全量) + 采集正常
- [ ] git log W12.6 独立

---

## 重要提示

- **首选读 invisible 精确时间标签**:抖音每条消息有精确到秒的时间 p 标签(class 含 invisible/whitespace-nowrap/absolute,内容 YYYY-MM-DD HH:mm:ss),一直在 DOM 里不用 hover。直接读它,拿每条真实精确时间。这是 v1.2.0 的核心
- **选择器双重确认**:语义 class + 内容正则匹配日期时间,避免误抓别的 invisible 元素
- **相对时间解析/锚点继承降级为兜底**:只在某条读不到精确标签时用
- **解析失败绝不继承上一条旧时间**(兜底时):那是原 bug 来源,失败用采集时刻兜底+标记估算
- **默认看最新消息**:前端体验改进,无论如何都做
- **occurred_at 影响分析**:错会带偏 intent(最近20条)/completeness(全量),修准后重跑回归
- **重采前先确认插件已重新加载**:别在旧代码还生效时就删数据重采,会毁掉真实样本
- **这是 C 类**(动 W4 采集时间解析),改完重跑采集验收
- **流程**(W12.5 重申):按 Claude 给的方案做,B/C 类不自行加戏
- **不要改 chat_rpa**(只读参考)
