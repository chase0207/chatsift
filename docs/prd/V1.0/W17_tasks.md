---
文档: W17 实施任务清单 — 消息位置标识
版本: v1.1.0
周次: W17(发版 v0.4.0)
落位: docs/prd/
状态: Active
---

## 变更日志

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.1.0 | 2026-06-04 | 对齐文档体系:v0.4.0、引用 AGENTS/prod-safety、单 agent 单分支 |
| v1.0.0 | 2026-06-04 | 初版 |

---

# W17 实施任务清单(给 DEV)

> **先读**:W17_design.md;AGENTS.md(§3 变更分类、§4 单 agent 单分支);docs/ops/prod-safety.md。
> **目标**:消息身份(去重)+ 顺序(排序)统一靠"会话内 position",取代旧"hash 内容 + seq"。
> **性质**:C 类(动采集核心 + 数据契约)。分两阶段:先本地层(可独立验证),云端对账第二阶段。
> **数据策略**:清空重采。

---

## 开工前置(AGENTS §1/§4)
- 从干净 main 切 `w17-message-position` 分支,**单 agent 全程**(其他 agent 不碰本分支代码)。
- 声明身份 DEV、运行环境(本地);git status 干净。
- 开发期间**不发版/不打 tag**(发版在阶段一阶段二全部验收后)。

---

## 阶段一:本地层(先做,可独立验证)

### Task 1 — 数据契约变更【★C 类:改前列 schema diff 报 Chase 确认再动】
- messages 加 `position` 字段
- occurred_at 改 nullable(outbound 存 NULL)
- message_id 生成改为基于 `(conversationId, position)`,不含内容
- 加 `(conversation_id, position)` 排序索引
- 写 migration SQL(只增不改,同步 prod/test compose init 挂载,见 prod-safety §5)

### Task 2 — 位置标识:锚点窗口对齐
- 弃 legacy-collector 的 `_seqMap`
- 持久化每会话已采序列(chrome.storage),每次取连续 3-5 条锚点窗口在已采序列匹配,锚点后续编 position
- message_id = f(conversationId, position),纯位置不含内容
- 失败降级:窗口匹配不到→按时间条作新段排到对应位置;锚点歧义→加宽窗口+方向模式,取最长唯一匹配

### Task 3 — 段间排序用时间条
- 消息按时间条分段(超5分钟一条)
- 段间按时间条排序、段内按 position
- 排序最终:ORDER BY 段时间条, position(不再靠 occurred_at 排 outbound)

### Task 4 — 时间处理
- inbound:occurred_at 存精确时间(W12.6 逻辑保留)、展示显示
- outbound:occurred_at 存 NULL(★废弃"继承+1s"合成假时间)、展示不显时间
- 段时间条:正常显示

### Task 5 — 重复内容
- 连发"1/1/1":各自 position 不同 → message_id 不同 → 都入库
- 用真机那段(客服连发"你好/你好/1/1/1")测,应存 5 条不丢

### Task 6 — 清空重采【★破坏性:先备份,走 prod-safety §4 三问】
- 备份现有数据(虽是测试数据,仍离机+验证可解压)
- 清空 messages + 相关分析数据,用新逻辑重采
- 验证新数据 position/occurred_at 正确

### 顺手做(本次采集核心范围内)
- 清掉碰到的旧采集死代码:M4(V1.9 runtime)/ M5(发送死代码)/ M6(build.js 死引用),**仅限本次改到的 plugin 区域**;无关的留清理周
- 清空重采时复核 M13(方向误判:inbound/outbound 有没有分错)

### Task 7 — 阶段一验收(报 Chase 本地验收)
```
- 重复连发存几条是几条(你好/你好/1/1/1 = 5 条)
- outbound occurred_at=NULL、展示不显时间;inbound 显精确时间
- 顺序正确:段间时间条、段内 position,inbound/outbound 混排位置对
- 跨多次采集(滚动加载历史)position 稳定、不重复入库
- 不影响 intent(20条inbound)/completeness(全量inbound)分析
- raw_snapshot 记录 position 来源/锚点匹配情况,便于排查
- 顺手清的死代码(M4/5/6)无误删 LIVE 代码;M13 方向复核结论
```

---

## 阶段二:云端对账(本地稳定后再做)

> a 方案(每客服采自己账号)+ 强提醒下,F5 暂不高发,云端对账可第二阶段上。

### Task 8 — 源头预防:多设备采集强提醒
- 插件开启时检测"该客服账号是否已在其它设备采集"
- 是 → 提醒"该客服账号已在 xx 设备上采集,确定开启吗?"

### Task 9 — 云端对账(每1h)
- 对账单位 = 段(时间条之间),不逐条
- 跨设备重复:段标识 [租户+平台+页面+客服+客户+段时间条边界+段内序列] 一致 → 合并
- 顺序纠偏:按时间条+position 重排;段间拼接:新段按时间条归位
- 对不齐兜底:整段丢弃
- ★幂等:跑多次结果一致;★只补不乱改已确认数据

### Task 10 — 阶段二验收
```
- 强提醒生效(模拟两设备采同账号)
- 对账幂等:连跑多次结果不变
- 模拟跨设备重复段 → 对账后合并、不重复
- 对账不破坏已确认数据顺序
```

---

## 完成标准(验收报告 docs/reports/W17_acceptance.md)

阶段一:
- [ ] 数据契约变更(position/occurred_at nullable/message_id 基于位置)已报 Chase 确认再改
- [ ] 锚点窗口对齐:position 稳定、跨采集不重复
- [ ] 段间时间条排序 + 段内 position,顺序正确
- [ ] outbound occurred_at=NULL 不存假时间、展示不显;inbound 显精确时间
- [ ] 重复连发存几条是几条
- [ ] 清空重采(先备份)、新数据正确
- [ ] 不影响 intent/completeness 分析
- [ ] 顺手清死代码无误伤;M13 方向复核

阶段二:
- [ ] 多设备强提醒
- [ ] 云端对账:段为单位/幂等/只补不乱改/对不齐丢弃

---

## 重要提示
- **核心**:身份+顺序统一靠 position(纯位置不含内容);废弃 hash 内容去重
- **有几条存几条**:重复连发都保留,绝不靠内容去重
- **不存假时间**:outbound occurred_at=NULL,废弃"+1s"合成
- **对账单位是"段"不是单条**(时间条之间)
- **分两阶段**:本地层先做可独立验证;云端对账第二阶段
- **C 类**:动采集核心+数据契约,Task1 改前报 Chase 确认;Task6 清空前先备份;改完重跑采集回归
- **单 agent 单分支**:本分支只你写,CC2 不碰
- 每个 Task 做完报 Chase,尤其数据契约和清空重采前后
- 阶段二不和阶段一并行(有依赖)
