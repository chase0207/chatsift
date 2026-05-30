-----

## 文档: W5 任务 — Round 2:切 flag + 删发送代码(含阶段一盘点 + 阶段二删除)
版本: v1.1.0
周次: W5
状态: Active

## 变更日志

|版本    |日期        |变更摘要                                                                                         |触发来源        |
|------|----------|---------------------------------------------------------------------------------------------|------------|
|v1.1.0|2026-05-30|盘点回报后填充阶段二:范围 A(只删纯发送)+ flag 默认改 true 保留 gate + 删 sendlock/preCheck 自检;旧 V1.9 runtime 留作未来清理周|阶段一盘点 + 用户决策|
|v1.0.0|2026-05-30|初版,阶段一盘点发送/自动回复残留                                                                            |Claude 设计   |

-----

# W5:Round 2 — 切 flag + 删 legacy

> **背景**:W4 用”只增不删”建了采集链路,与 legacy 并存,flag 默认关闭。W5 是 Round 2:把 flag 默认切到新链路,并删除 W4 保留的发送/自动回复相关代码。这是三轮策略里第一次真正”删”。
> 
> **风险**:删除不可逆,且发送代码可能与采集代码共用工具函数或同处一文件,删错会误伤采集链路。
> 
> **W4 已知线索**:W4 验收时发现”仓库没有旧的 processMessageSession 入口文件”——说明 chatsift 的 legacy 自动回复链路可能本就不完整(W0 迁移时 content_legacy 的发送逻辑标了⚫不迁移)。所以 W5 实际删除范围可能比想象小,但必须先盘清楚到底有什么。
> 
> **本任务是阶段一:只盘点不删除**。盘点结果回报 Claude,Claude 据此给阶段二的精确删除清单。**不要在阶段一删任何代码或切 flag。**

-----

## 阶段一:盘点(只查不删)

目标:把插件侧所有”发送 / 自动回复 / 决策回复”相关的代码残留找出来,并标注每一处是”可删”还是”被采集链路依赖、不能碰”。

### Inv Task 1 — 全局搜索发送/回复相关符号

```bash
cd ~/vscode/chatsift

# 发送/回复相关的函数名和概念
grep -rn "sendReply\|prepareReply\|decideReply\|decideReplyMulti\|processMessageSession\|sendInBatch\|send-confirm\|sendConfirm\|pre-check\|preCheck\|autoReply\|自动回复\|话术\|keywordReply" plugin/ --include="*.js" | grep -v "node_modules"
```

把完整结果回报。对每一条,标注它在哪个文件、属于什么(方法定义 / 调用点 / 注释 / 字符串)。

### Inv Task 2 — 盘点 runtime 里的发送相关模块

W0 迁移清单里标了几个发送相关模块。确认它们当前状态:

```bash
# 这几个文件是否存在
ls -la plugin/runtime/send-confirm.js 2>/dev/null || echo "send-confirm.js 不存在"
ls -la plugin/runtime/pre-check.js 2>/dev/null || echo "pre-check.js 不存在"
ls -la plugin/runtime/batch-manager.js 2>/dev/null || echo "batch-manager.js 不存在"
ls -la plugin/runtime/queue-manager.js 2>/dev/null || echo "queue-manager.js 不存在"

# 如果存在,看谁在引用它们
for f in send-confirm pre-check batch-manager queue-manager; do
  echo "=== 谁引用 $f ==="
  grep -rn "$f" plugin/ --include="*.js" | grep -v "node_modules" | grep -v "plugin/runtime/$f.js:"
done
```

回报:这四个模块各自的存在状态 + 被谁引用。重点区分:被采集链路(event-*/legacy-collector/collectMessageSession)引用的,不能删;只被发送链路引用或无人引用的,可删。

### Inv Task 3 — 盘点三个抖音 adapter 里的发送方法

W4 保留了 adapter 的 prepareReply/sendReply/buildBatch。确认它们现在的状态:

```bash
for f in laike-message feige private-message; do
  echo "=== $f.adapter.js 里的发送方法 ==="
  grep -n "prepareReply\|sendReply\|buildBatch\|toConversationEvent" plugin/adapters/douyin/$f.adapter.js
done
```

回报每个 adapter 里这些方法的存在情况(行号),以及它们是否被 adapter 外部调用。

### Inv Task 4 — 盘点 feature flag 当前状态

```bash
# 找到 collector_v1_enabled 的定义和默认值
grep -rn "collector_v1_enabled" plugin/ --include="*.js" | grep -v "node_modules"

# 找到分叉点(flag 决定走采集还是走发送的地方)
grep -rn "processMessageSession\|collectMessageSession" plugin/ --include="*.js" | grep -v "node_modules"
```

回报:flag 默认值现在是什么、在哪定义、分叉逻辑长什么样(贴出那段代码)。这决定 W5 怎么”切 flag”——是改默认值,还是直接删掉分叉只留采集。

### Inv Task 5 — 盘点 self-check 对发送的依赖

W4 反馈提到 self-check.js 的 sendlock 自检依赖 sendReply 存在。确认:

```bash
grep -n "sendlock\|sendReply\|sendLock\|send_lock" plugin/runtime/self-check.js 2>/dev/null || echo "self-check.js 无 sendlock 相关 或文件不存在"
```

回报:self-check 里有哪些 case 依赖发送相关方法。删 sendReply 时这些 case 要同步处理(改或删),否则自检会报错。

### 阶段一回报格式

把上述写成 `docs/reports/W5_inventory.md`,结构:

1. Inv Task 1-5 的原始命令输出
1. **一张”删除候选清单”表**,每一项含:文件/方法、类型(发送链路/采集链路/共用/无人引用)、建议处置(可删/保留/需改造)
1. 你发现的任何”删了会误伤采集链路”的风险点

格式建议:

|文件 / 符号          |类型  |被谁引用               |建议处置             |
|-----------------|----|-------------------|-----------------|
|adapter.sendReply|发送方法|self-check sendlock|删,但需先改 self-check|
|send-confirm.js  |发送模块|无人引用               |可删               |
|queue-manager.js |队列  |event-uploader?    |待确认,可能采集在用       |
|…                |    |                   |                 |

**回报后停下,等 Claude 给阶段二删除清单。不要自行删除或切 flag。**

-----

## 阶段二:切 flag + 删除(Claude 据盘点结果填充)

## 阶段二:切 flag + 删除(范围 A,已据盘点确认)

> **范围决策(已定)**:范围 A —— 只删纯发送代码,不碰旧 V1.9 runtime 组。
> 
> **删除目标**(纯发送,共 5 处):
> 
> 1. 三个抖音 adapter 的 sendReply / prepareReply / buildBatch(及注册字段)
> 1. runtime-manager.js 的 sendInBatch
> 1. self-check.js 的 sendlock + preCheck 两个发送自检用例
> 1. build.js 清单里 pre-check.js / send-confirm.js 的残留引用
> 1. adapter-registry.js 的发送方法锁(SEND_RUNTIME_METHODS / _wrapSendMethods)——仅删发送锁逻辑,保留 registry 的 resolve/register
> 
> **明确不碰(范围 B,留作未来清理周)**:queue-manager.js、batch-manager.js、runtime-manager.js 整体(只删 sendInBatch 一个函数,文件留)、recovery-manager、chaos-monitor、bug-dump、rpc-bridge。这些是死代码,采集链路不依赖,但互相缠绕,本周不动。
> 
> **执行顺序铁律**:先切 flag 验证采集正常 → 再删发送代码。删了发送就回不去了,所以必须先确认采集在 flag 默认开时能独立工作。

### Fix Task 1 — 先切 flag,验证采集独立工作(删代码前必做)

把 collector_v1_enabled 默认值从 false 改为 true,保留 flag gate(不删 gate)。

```bash
cd ~/vscode/chatsift
# 两处默认值都要改:
# 1. plugin/shared/constants.js:133  collector_v1_enabled: false → true
# 2. plugin/runtime/legacy-collector.js 里若有独立默认也改
# 3. background.js 的 START/STOP 写入逻辑不动(它是运行时开关,不是默认值)
```

改完构建 + 真实页面验证(这一步要 Chase 配合):

```bash
cd plugin && node build.js --check
# 然后 Chase: 重新加载插件,不手动开 flag,确认采集 observer 自动启动、
# 真实消息能上报(查库 conversations/messages 有新数据)
```

**这一步通过(采集在默认 flag 下独立工作)才能进入删除。如果采集依赖了任何发送代码才能跑,停下回报。**

### Fix Task 2 — 改 self-check.js(删发送前先改,否则自检报错)

删除两个发送自检用例:

- `_checkSendLock()`:整个函数删除(它测 adapter.sendReply 的 lock 行为,发送删了就没意义)
- `_checkPreCheck()`:整个函数删除(它依赖已不存在的 RpaPreCheck + 伪 sendReply)
- 在 self-check 的用例注册列表里,移除对这两个函数的调用
- 这两个用例引用的 fake adapter(`{ sendReply: function(){} }`)一并删除

改完 `node --check plugin/runtime/self-check.js`。

注意:self-check 里如果还引用 RpaQueueManager / RpaBatchManager 做别的自检(非发送),**保留不动**(那属于范围 B)。只删 sendlock 和 precheck 两个用例。

### Fix Task 3 — 删 runtime-manager.js 的 sendInBatch

- 删除 `sendInBatch` 函数定义(约 L314-435)
- 删除导出对象里的 `sendInBatch: sendInBatch`(L453)
- 删除函数顶部那段 pre-check/confirm 加载判断(L317 的 `if (!PreCheck || !Confirm)...`)和相关注释(L278-279)
- runtime-manager.js 的**其他部分全部保留**(它属于范围 B,本周只摘掉 sendInBatch 这一个发送入口)
- 如果 sendInBatch 删除后,runtime-manager 里有变量(PreCheck/Confirm 的 require)变成无人使用,一并删掉那几行 require

改完 `node --check plugin/runtime/runtime-manager.js`。

### Fix Task 4 — 删三个 adapter 的发送方法

对 laike-message / feige / private-message 三个 adapter,各删:

- `prepareReply` 函数定义
- `sendReply` 函数定义
- `buildBatch` 函数定义
- 导出对象里对应的三行(prepareReply / sendReply / buildBatch)
- 文件头 TODO 注释改为:`// V2.0 采集探针: 仅 getMessages + toConversationEvent,发送方法已于 W5 移除`

**务必保留**:matchPage / detectSessions / getMessages / classifyMessage / toConversationEvent / _parseContact / confirmActiveSession / buildRuntimeContext。这些是采集链路要用的。

每个 adapter 改完 `node --check`。

### Fix Task 5 — 删 adapter-registry 的发送锁

- 删除 `SEND_RUNTIME_METHODS = ['prepareReply','sendReply','confirmReply']`(L54)
- 删除 `_wrapSendMethods` 相关逻辑(包装发送方法的部分)
- 删除注册必需方法列表里的 ‘prepareReply’ / ‘sendReply’(L45-46),改为采集必需方法(getMessages / toConversationEvent)
- **保留** registry 的核心:register / resolve(location)/ matchPage 分发。采集链路靠这些拿 adapter,绝不能动

改完 `node --check plugin/runtime/adapter-registry.js`。

注意:如果 registry 删除发送方法校验后,三个 adapter 因为”缺少 sendReply”而注册失败,要把注册校验从”必须有 sendReply”改成”必须有 getMessages + toConversationEvent”。

### Fix Task 6 — 清理 build.js 残留引用

- 删除 build.js 清单里的 `'runtime/send-confirm.js'`(L61)
- 删除 `'runtime/pre-check.js'`(L62)
- 删除/修正相关注释(L56 提到 pre-check 的那行)
- runtime-manager.js 仍在清单里保留(范围 B 不删文件)

改完 `node build.js --check`,确认构建产物 content.js 不再包含发送方法。

### Fix Task 7 — 全量构建 + 验证采集链路完好

```bash
cd plugin && node build.js
# 确认 content.js 重新生成,无构建错误

# 验证发送代码已从产物消失
grep -c "function sendReply\|function prepareReply\|sendInBatch" content.js
# 期望:0(或只剩注释,无函数定义)

# 验证采集代码仍在
grep -c "toConversationEvent\|collectMessageSession\|RpaEventQueue" content.js
# 期望:> 0
```

真实页面回归(Chase 配合):重新加载插件,确认采集链路仍正常(真实消息进库、生成工单),且插件控制台无报错(尤其 self-check 不报错)。

### Fix Task 8 — 提交

```bash
git add plugin/
git commit -m "feat(W5): round2 - switch flag default on, remove send/auto-reply code

- collector_v1_enabled 默认改 true(保留 gate 作开关)
- 删除三个抖音 adapter 的 sendReply/prepareReply/buildBatch
- 删除 runtime-manager.sendInBatch(其余保留)
- 删除 self-check 的 sendlock/preCheck 两个发送自检用例
- 删除 adapter-registry 发送方法锁, 注册校验改为采集方法
- 清理 build.js 的 pre-check/send-confirm 残留引用
- 范围A: 旧V1.9 runtime(queue-manager等)留作未来清理周
- 验证: 采集链路在默认flag下独立工作, 发送代码已从产物移除"
git log --oneline -7
```

-----

## 完成标准(验收报告)

> 验收报告写成 `docs/reports/W5_acceptance.md` 落盘 + 进 git,用户上传给 Claude。

阶段一完成标准:

- [x] W5_inventory.md 已回报,删除候选清单清晰
- [x] 标注了每一项的”发送链路/采集链路/共用”归属
- [x] 标出了误伤风险点

阶段二完成标准:

- [ ] Fix Task 1:flag 默认改 true 后,采集链路在不手动开 flag 时独立工作(真实页面验证)
- [ ] self-check 的 sendlock + preCheck 用例已删,自检不报错
- [ ] runtime-manager 的 sendInBatch 已删,其余保留,node –check 通过
- [ ] 三个 adapter 的 sendReply/prepareReply/buildBatch 已删,采集方法保留
- [ ] adapter-registry 发送锁已删,注册校验改为采集方法,采集链路 resolve 正常
- [ ] build.js 清理 pre-check/send-confirm 引用
- [ ] 构建产物 content.js:发送函数已消失(grep=0),采集代码仍在
- [ ] 真实页面回归:采集链路正常(消息进库 + 生成工单),控制台无报错
- [ ] git log 显示 W5 commit 独立(W0~W5)

-----

## 重要提示

- **执行顺序铁律**:先切 flag 验证采集独立工作(Fix Task 1),再删发送代码。删了发送回不去,必须先确认采集能脱离发送独立跑
- **改 self-check 在删 sendReply 之前**(Fix Task 2 在 Fix Task 4 之前),否则删了 sendReply 自检立即报错
- **范围 A 铁律**:只删纯发送,旧 V1.9 runtime(queue-manager/batch-manager/runtime-manager 整体/recovery/chaos/bug-dump/rpc-bridge)一律不删,留作未来清理周。runtime-manager 只摘 sendInBatch 一个函数,文件留
- **adapter-registry 不能整删**:采集链路靠 registry 的 resolve/register 拿 adapter,只删发送锁,保留分发核心
- **adapter 只删发送方法**:matchPage/getMessages/toConversationEvent/classifyMessage 等采集方法必须保留
- **content.js 是产物**:所有删除改源文件,然后 node build.js 重建,不手改 content.js
- **每改一个文件做 node –check**,改完整体 node build.js –check,最后真实页面回归
- **不要改 chat_rpa**(只读参考)
- 如果删 adapter-registry 发送锁后三个 adapter 注册失败(因为校验要求 sendReply),把注册校验改成”必须有 getMessages+toConversationEvent”,不要为了过校验保留 sendReply