# W17 阶段一验收报告 — 消息位置标识

> 版本: v1.0.0　日期: 2026-06-05　身份: DEV　周次: W17（开发版 v0.4.0）
> 分支: `w17-message-position`（单 agent 全程）。结论待 Chase 确认 = 阶段一闭环 = M1 关闭。

## 0. 范围与方法
- **目标**：消息身份（去重）+ 顺序（排序）统一靠"会话内 position"，取代旧"hash 内容 + seq"；不存假时间（outbound occurred_at=NULL）。
- **方法三层**：① node 单测（锚点算法/段兜底/position 来源）；② 直插 + 真链路（mock req/res 调真 `batch()`）DB 测试；③ **真机重采**（真实抖音来客私信 DOM，单账号清存储）。
- **数据策略**：清空重采（先全库备份并验证可解压，本地库，prod-safety §4 三问已过）。

## 1. 验收逐项结果（全部 PASS）

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | ★position 跨多次采集稳定、**不重复入库** | ✅ | 真机多会话 MutationObserver 自动重采多次，行数==distinct_position、0 重复；单账号清存储后 position 从 0 起 |
| 2 | segment_at 段时间条解析、段间排序 | ✅ | DB 测试：旧段（segment_at 早/position 大）正确排首、段内按 position；**A 兜底**已就位 |
| 3 | outbound occurred_at=NULL / inbound 精确 | ✅ | 真机 outbound 全 NULL、inbound 全精确；前端 `precise` 门控 + `&& occurred_at` 守卫，无 Invalid Date |
| 4 | 重复连发都保留 | ✅ | 真机 conv "1"×5、"你好"×4 全部存住（position 各异） |
| 5 | ★虚拟列表/滚动加载锚点对齐是否失效 | ✅ | **真实虚拟列表 DOM 自动重采 0 重复** = 锚点窗口幂等在真机成立（单测验不到、Task6 才暴露的关键项） |
| 6 | 不影响 intent(20 inbound)/completeness(全量 inbound) | ✅ | analyzer.js 只读 `direction='inbound'`、occurred_at 恒非 null、未触碰；真机 intent 已标、jobs 全 done、leads 生成 |
| 7 | raw_snapshot 记录 position 来源/锚点 mode | ✅ | **C** 已补：`raw_snapshot.position_source`（cold/aligned/degrade）+ `anchor_off`，真机 23/23 覆盖 |
| 8 | M13 方向复核 | ✅ | 真机抽样：客户问（学车/报名/优惠）=inbound、客服答=outbound，吻合 |
| 9 | 顺手清死代码无误删 LIVE | ✅ | M6 删的是 build.js 中**不存在文件**的死引用，content.js 产物字节不变；LIVE 模块全保留 |

## 2. A/B/C Finding 处置

- **A（段 segment_at 覆盖不全 → F1 排序错位）= 已补**。`_scanLifeMessages` 对无 segment_at 的连段，取段内首条 inbound 的 occurred_at 作兜底排序值（纯排序，标 `segment_fallback`）；整段无 inbound→维持 NULL（position 兜底）。node 验证通过；本轮真机段时间条覆盖满（0 NULL）故未触发，兜底已就位待稀疏时生效。
- **C（raw_snapshot 未记 position 来源）= 已补**。见上表 #7。便于排查 + 阶段二判 position 可信度。
- **B（position-tracker 存储键不隔离 tenant/客服账号）= 记 M24，延后**。换账号不清存储会串号（测试中 conv#4 残片即此因）。**正确隔离键需"客服账号稳定 ID"，而该 ID 是 W19 Q1 待定项**，现在改会用错键、与 W19 资产原点耦合。
  - **M24（待并入 main 技术债总纲）**：position-tracker 存储键加 tenant/客服账号隔离；★依赖 W19 客服账号标识方案，W19 做多客服账号时必须先解决（否则多账号 storage 串号会爆）。
  - **眼前测试纪律**：换账号/重测前手动清 `chrome.storage` 的 `w17_pos_*`（或移除扩展重载）。
  - 注：M24 等 W17 合并后更新到 main 的 `docs/research/tech-debt-master-plan.md`，**w17 分支不动总纲**。

## 3. 真机数据证据（清存储单账号重采，id2）
- 1 会话「上海空月-小正」23 条：position 0–22 全有值且不重复、min_pos=0；outbound 10 全 NULL、inbound 13 全精确；`position_source` 23/23（cold:20/aligned:3）；segment_at 0 NULL。
- 其它批次另证：4 会话自动重采 0 重复入库（锚点幂等）；连发 1×5/你好×4 保留；intent/leads 正常。

## 4. 关联提交（w17 分支）
Task1 数据契约 `efd4da9`（+ `3d63292` init 副本同步）→ Task2 锚点窗口 `439ca01`（+ `2a3b09f` M6）→ Task3 段时间条+排序+入库 `839ba2d` → Task4 时间处理 `9baf0ae` → Task6 A+C `910ff54` → collector warn 降 debug `8badcbc`。
（数据契约 ALTER 仅应用本地库；prod/test 的 `deploy/w17_message_position.sql` 留发版阶段；不发版/不打 tag。）

## 5. 结论
W17 **阶段一核心机制在真机验收通过**：身份+顺序统一靠 position（纯位置）、不存假时间、连发都保留、虚拟列表锚点幂等不重复入库、不影响分析。**M1 的解法真机证明成立。** A/C 已补，B=M24 延后（依赖 W19）+ 测试纪律。

待 Chase 确认本报告 → 阶段一闭环 = M1 关闭 → 再开**阶段二（云端对账）**（按约定不与阶段一并行）。
