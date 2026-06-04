---
文档: chatsift 引入 dom-collector 改造方案(阶段一:调研 + 抢救 + 剔除发送)
版本: v1.0.0
状态: Active
---

## 变更日志

| 版本 | 日期 | 变更摘要 | 触发来源 |
|---|---|---|---|
| v1.0.0 | 2026-06-02 | 初版,阶段一调研(摸清 dom-collector、剔除发送、抢救代码) | Chase 决定借用 chat_rpa 的 dom-collector 改造 |

---

# chatsift 引入 dom-collector:阶段一(调研 + 抢救 + 剔除发送)

> **背景**:Chase 决定借用 chat_rpa 的 dom-collector 改造,服务 chatsift 的 DOM 采集(目标见本文 §4 的 ABC 字段)。
> **关键前提**:① 是"把 dom-collector 代码拷进 chatsift 改造成 chatsift 自己的",**不是依赖/调用 chat_rpa**(chat_rpa 即将重置废弃);② chat_rpa 重置前,dom-collector 源码必须先抢救出来;③ **chat_rpa 是自动回复工具,dom-collector 可能耦合发送逻辑——引入 chatsift 必须剔除所有发送相关代码(红线:永不发送)**。
> **本阶段只调研 + 抢救,不改造**。改造方案(阶段二)等调研结果出来再定。
> **风险**:涉及红线(剔除发送)+ chat_rpa 重置时机(先抢救代码)。C 类,谨慎。

---

## 0. 为什么先调研不直接改

我们(包括 Claude)都不知道 chat_rpa 的 dom-collector 具体长什么样、有多少发送耦合。现在直接写"怎么改造"是空中楼阁。必须先摸清:它里面有什么、哪些纯采集、哪些沾发送、和新目标 ABC 字段差多少。调研清楚,阶段二改造才有依据。

而且 chat_rpa 即将重置,**dom-collector 源码要先抢救到 chatsift 仓库,否则重置后丢失**。

---

## 1. 红线前置警告(最重要)

chat_rpa 是**自动回复**工具(会向抖音发消息)。它的 dom-collector 很可能耦合了发送相关逻辑(定位输入框、点发送按钮、填充内容、发送时序等)。

**引入 chatsift 时,所有发送相关代码必须剔除干净**——chatsift 红线是"永不发送"。引入一个带发送能力的采集器,等于把刚核查确认"无发送能力"的红线又破坏了。

调研阶段就要把"哪些是纯采集、哪些沾发送"分清楚,阶段二只移植纯采集骨架,发送部分一行都不带进来。

---

## 2. 阶段一调研任务(只看不改)

### Dx Task 1 — 定位并抢救 dom-collector 源码

```bash
# dom-collector 源码现在在哪?确认本地能拿到(chat_rpa 重置前必须抢救)
# chat_rpa 仓库里找 dom-collector
find <chat_rpa仓库路径> -type d -name "dom-collector" -o -name "*collector*" 2>/dev/null
# 看它的目录结构和文件清单
```

**抢救**:把 dom-collector 整个目录拷贝一份到安全位置(本地 + 备份),**绝不依赖服务器上 chat_rpa 的版本**(那个要被重置删掉)。确认拷贝完整、能打开。

回报:dom-collector 的完整目录结构 + 文件清单 + 各文件大致职责。

### Dx Task 2 — 区分"纯采集" vs "沾发送"(红线核查)

逐个文件看,把 dom-collector 的能力分成两类:

```bash
# 在 dom-collector 里搜发送相关字样
grep -rn "send\|发送\|reply\|回复\|input.*value\|sendButton\|输入框\|点击发送\|submit" <dom-collector目录>
```

分类回报:
- **纯采集**(保留候选):遍历 DOM、提取消息、解析时间、识别会话、上报数据等
- **沾发送**(必须剔除):定位输入框、填充内容、点发送、发送时序、自动回复逻辑等
- **不确定**:说不清是采集还是发送的,单独列出待判断

### Dx Task 3 — dom-collector 的采集能力清单

摸清 dom-collector 现在能采什么、怎么采:
- 它针对哪些平台/页面?(chat_rpa 是不是也采抖音私信?DOM 选择器是否可复用?)
- 它的采集架构:纯 DOM 遍历?还是有别的机制(网络拦截/SDK hook)?
- 它怎么定位消息、判断方向、提取时间、识别会话?
- 它的上报机制?(和 chatsift 的 events/batch 兼容吗?)

回报:dom-collector 现有采集能力的概览。

### Dx Task 4 — 与 chatsift 现有采集的关系

chatsift 现在已经有一套采集(plugin/adapters/douyin/、legacy-collector.js、event-queue 等,W4-W12.6 做的)。要搞清楚:

- dom-collector 和 chatsift 现有采集是**替换关系**还是**互补关系**?
- chatsift 现有采集(W12.6 刚做好的精确时间、合成ID、节流上报)哪些要保留、哪些被 dom-collector 取代?
- **关键判断**:是"用 dom-collector 替换 chatsift 现有采集",还是"用 dom-collector 补充某些 chatsift 采不到的能力"?

> 这条很重要:chatsift 现有采集 W4-W12.6 投入了大量工作(精确时间、防漂移、去重等),不能因为引入 dom-collector 就轻易推翻。要搞清楚 dom-collector 能带来什么现有采集没有的,而不是重复造轮子。

### Dx Task 5 — 与新采集目标(ABC 字段)的差距

对照本文 §4 的 ABC 字段目标,看 dom-collector 现状能覆盖多少、缺多少:
- ABC 里的必采字段,dom-collector 现在能采哪些?
- 缺哪些?(尤其:accountId 稳定客户ID、消息原生唯一ID、inbound精确时间、时间分隔条)

---

## 3. 阶段一回报格式

写成 `docs/reports/dom-collector-investigation.md`,含:
1. Dx1:dom-collector 目录结构 + 文件清单 + 抢救情况(拷到哪了)
2. Dx2:纯采集 / 沾发送 / 不确定 三类清单(红线核查)
3. Dx3:现有采集能力概览
4. Dx4:与 chatsift 现有采集的关系判断(替换 or 互补)
5. Dx5:与 ABC 目标的差距

**回报后停下,等 Claude 据此出阶段二改造方案。不要自行改造或合并代码。**

---

## 4. 新采集目标(ABC 字段,阶段二改造的目标)

> 这是改造后要达成的采集目标。阶段一只用它对照差距(Dx5),阶段二才实现。

### A. 会话级(整对话一份)
| 字段 | 建议 |
|---|---|
| 客户昵称 | 必采 |
| accountId(客户稳定ID) | 必采 — URL里稳定数字ID,根治同名合并 |
| 所属客服账号 | 必采 |
| 会话Tab(当前/历史咨询) | 建议 |
| 来源标签(经营源/自然流量) | 建议 |
| 留资状态标签 | 建议 |
| 客户头像 | 无需 |

### B. 消息级(每条一份)⭐核心
| 字段 | 建议 |
|---|---|
| 消息内容 | 必采 |
| 方向(inbound/outbound) | 必采 |
| DOM顺序 | 必采 |
| inbound精确时间(invisible常驻标签) | 必采 |
| 消息唯一标识(去重用,优先找原生msg_id) | 必采 |
| 消息类型(文本/图片/卡片/系统) | 建议 |
| 发送者名 | 建议 |
| 时间来源标记(精确/锚点/兜底) | 建议 |
| outbound精确时间 | 无需(hover才生成,采不到,降级) |
| 已读/未读 | 无需 |

### C. 段落级
| 字段 | 建议 |
|---|---|
| 时间分隔条(居中常驻时间) | 必采 — 展示分段 + outbound时间锚点 |

### 两个关键确认(阶段一一并查)
- accountId 是否每会话都有、能稳定取到(→ 客户稳定ID)
- 每条消息有没有原生唯一ID(→ 去重,根治"去重误删"丢消息)

---

## 5. 重要提示

- **红线第一**:dom-collector 来自自动回复工具,引入 chatsift 必须剔除所有发送代码。阶段一就要分清纯采集/沾发送
- **拷代码,不依赖 chat_rpa**:dom-collector 代码拷进 chatsift 改造成自己的,不跨项目依赖(chat_rpa 要废弃)
- **重置前先抢救**:chat_rpa 重置会删掉它,dom-collector 源码先拷出来备份
- **别轻易推翻 chatsift 现有采集**:W4-W12.6 的精确时间/防漂移/去重投入很大,搞清 dom-collector 是替换还是互补,不重复造轮子
- **阶段一只调研不改**:摸清现状,改造方案等 Claude 据调研结果出
- **流程**(W12.5重申):调研属诊断,改造方案先报,不自行合并代码+commit
- 调研中如发现 dom-collector 有 chatsift 现有采集没有的好东西(如更稳的会话识别、原生msg_id),重点标出