---
文档: chatsift 技术债收尾总纲 (tech-debt-master-plan)
版本: v1.2.0
状态: Active(收尾执行总账)
日期: 2026-06-04
来源: 三方独立盘点(tech-debt-inventory-cc / -cc2 / -codex)交叉验证后汇总
用途: 技术债收尾的唯一总账,也是**唯一技术债编号(M 系列)的真源**。新债一律 M 编号续编,废弃 D-A/U/T/G/P/E 等杂编号(见 AGENTS 编号约定)。
落位: docs/research/
---

## 变更日志

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.2.0 | 2026-06-05 | **M1 关闭**(W17 阶段一真机验收通过)+ M13 关闭;补 **M24**(position-tracker 存储键隔离,依赖 W19);W17 阶段一已合并 main(3486c12,未发版) |
| v1.1.0 | 2026-06-04 | M3 完成;M1 由 W17 解决中;补 M22/M23;对齐编号约定(M 为唯一技术债编号);outbound 时间取舍改为 W17 的 NULL 方案 |
| v1.0.1 | 2026-06-03 | M0-A 完成:W16 收尾闭环(零迁移认可 + 生产浏览器4项验证通过) |
| v1.0.0 | 2026-06-03 | 初版:三方汇总 + 统一编号 + 分批处理 + 协作规矩 |

---

## 0. 三方交叉验证结论

三个独立 agent(cc窗口1 / cc窗口2 / codex)各自盘点,结论高度一致,可信度高:

1. **无 🔴 阻断级债,功能全部可用。** 债集中在:死代码/冗余、性能隐患、文档滞后、发版未推。
2. **优先级三方一致**:W12.6 收口 → push 发版 → 清理周。
3. **自 6-01 基线后已顺手解决**(三方一致确认):M3 日志中心孤儿页(Logs.vue 已建)、U9 非主路径时间戳(代码已修待验收)、W13 消息聚合(Aggregate.vue 已建)、W14 悬空文件(随 v0.2.8 提交)。
4. **W16 数据策略 = 零迁移 + 隔离**(三方确认是合理权衡):admin 名下 tenant_id=1 仅极少量测试数据,迁移收益≈0 却有误迁风险,故不迁移;靠"后端 tenant_id 隔离 + 前端域名过滤 + 登录域名限制"三层保证 admin 进不了 mychat。**前提:admin 名下确是纯测试数据(待 Chase 最终确认)。**

> 三份盘点编号不同(cc 用 D-A*/G*/P*,cc2 用 C*/T*/G*/P*/E*,codex 另一套)。本总纲**统一重新编号**(下方 M* 主编号),并标注三方对应项。

---

## 1. ★比债更优先:两件"非债"的进行中事项★

这两件不是技术债,是"进行中/未闭环"的状态,**必须先于债处理**,否则后续叠加会乱:

### M0-A. W16 真正收尾 ✅ 已完成(2026-06-03)
- **现状**:W16 双入口拆分代码完成,生产浏览器最终验证**已通过**(4项:admin×admin通、admin×mychat拒、外部×mychat通、外部×admin拒)。
- **数据策略**:零迁移方案正式认可——admin 名下 tenant_id=1 **已确认是纯测试数据**,无害保留,靠"后端 tenant_id 隔离 + 前端域名过滤 + 登录域名限制"三层保证不进 mychat。
- **结论**:✅ W16 闭环。chatsift 完成"平台入口/租户入口物理分离 + 数据按身份隔离"。

### M0-B. 多 agent 协作规矩(立即立规,防止债累积)
- **现状**(cc2 G4):本次同时有 codex + cc窗口1 + cc窗口2 三个 agent;写代码时 commit 已交错混在同一分支历史(c2abd18/7cd63e9 等)。本地领先 origin ~11 commit、含 v0.2.9~v0.3.1 发版 tag 全未推。
- **规矩**:
  - **只读盘点/调研** → 可多 agent 并行(像本次三方盘点,不冲突,且能交叉验证)。
  - **写代码/改同一片区域** → 明确一个主 agent,各用各的分支,禁止多 agent 同分支并行写,避免 commit 交错。
  - push 前先理清分支(可能有 cherry-pick 双份,git 按 patch-id 去重),协调后再 push main + tags。
- **处置**:Chase 明确分工边界;后续写代码任务指定单一 agent + 分支。
- **✅ 已落地**:AGENTS.md §4(写代码单 agent 单分支)+ 文档体系建立。

---

## 1.5 当前进度快照(2026-06-04)

- ✅ **M0-A** W16 收尾闭环;✅ **M0-B** 协作规矩(已写进 AGENTS)
- ✅ **M3** git 整理 + push + 生产 VERSION 修正(merge 7b672d3,main=生产代码)
- ✅ **M6** build.js 死引用(随 W17 Task2 顺手清,commit 2a3b09f)
- ✅ **M1** W12.6 签收:W17 用 position 统一身份+顺序,从根上重做了消息时间/排序/去重。**W17 阶段一真机验收通过(2026-06-05)= M1 关闭**(merge 3486c12,见 docs/reports/W17_acceptance.md)。
- ✅ **M13** 方向复核:W17 清空重采真机抽样,inbound/outbound 分类吻合
- ✅ **W17 阶段一**(v0.4.0,Task1-6)真机验收通过、已合并 main(3486c12,**未发版**);🔄 阶段二(云端对账)排在 W19 之后
- 🔄 **W19** 阶段一调研(租户资产模型)进行中
- ⏸ **W18** AutoScanner 暂缓(碰"主动操作页面"红线,PRD 归档 docs/prd/)

---

## 2. 真债清单(统一编号,按批次组织)

> 严重度:🔴阻断 / 🟡中 / 🟢低(整洁性)。三方对应列出处供追溯。

### 第一批 — 闭环进行中(最优先)

| 编号 | 项 | 严重度 | 现状 | 处置 | 三方对应 |
|---|---|---|---|---|---|
| M1 | W12.6 真实重采签收 | ✅ **关闭** | W17 用 position 重做消息身份+顺序+时间,M1 并入 W17 阶段一验收 | **W17 阶段一真机验收通过(2026-06-05)= M1 关闭**。原"95%抽样"由 W17 清空重采真机验证替代 | cc-P1 / cc2-P1 |
| M2 | U9 非主路径时间戳验收 | 🟢 | 代码已修(bubble 兜底走 _extractPreciseMessageTime),模拟 10/10 | W17 重做时间逻辑后一并验收 | cc-P2 / cc2-P2 |

> M1/M2 是 W13 的前置。挂最久,先收口。

### 第二批 — 发版落盘(有丢失风险)

| 编号 | 项 | 严重度 | 现状 | 处置 | 三方对应 |
|---|---|---|---|---|---|
| M3 | push main + tags ✅完成 | 🟡 | ✅ M3 已完成(merge 7b672d3,main=生产代码,6 tag 已 push,生产 VERSION 修正) | 已闭环 | cc-G1 / cc2-G1 |

### 第三批 — 清理周一把梭(死代码集群,集中清降冲突)

> 这些互相关联、且和 dom-collector/W16 改动会碰,集中一个清理周做,清完**重建插件 + 真实采集回归**。

| 编号 | 项 | 严重度 | 现状 | 处置 | 三方对应 |
|---|---|---|---|---|---|
| M4 | V1.9 runtime 死代码 | 🟢 | 还在。queue/batch/runtime-manager/watchdog/recovery/chaos/bug-dump/rpc-bridge/state-machine/self-check/session-parser(stub)/session-identity-resolver(含avatar) 打进 content.js | 整组删。**保留 LIVE:legacy-collector / event-collector\|queue\|uploader / feature-flags / adapter-registry / lk-tracer** | cc-D-A9 / cc2-C8 |
| M5 | 红线发送死代码 | 🟢 | 还在。popup autoReplySwitch 强制 false、content.js 打包 LK-SEND-* 死代码、adapter 保留 sendButton/input selector。**无激活路径,send_runtime_v19=false** | **与 M4 一起清**(同在 plugin/content.js 区域)。清后红线无虚惊 | cc-T7 / cc2-T7 |
| M6 | build.js 死引用 ✅完成 | 🟢 | ✅ 随 W17 Task2 顺手清(commit 2a3b09f) | 已闭环 | cc-D-A10 / cc2-C9 |
| M7 | admin 残留 chat_rpa api 封装 | 🟢 | 还在。ai/keywordReplies/knowledge/columnPrefs/devices/plugin-update.js | 删未用封装(可随 W15 前端重做) | cc-D-A8 / cc2-C10 |
| M8 | 过时 smoke 脚本 | 🟢 | 还在。douyin-private-regression(依赖已删快照)、runtime-lock-regression(W5前发送锁) | 删,或用 dom-collector 快照重写采集-only smoke | cc-D-A11 / cc2-C11 |
| M9 | heartbeat/dom-config 双路由 | 🟢 | 还在。直挂 + events 子路径各一份 | 删一处 | cc-D-A6 / cc2-C4 |

### 第四批 — 口径/性能(数据增长前)

| 编号 | 项 | 严重度 | 现状 | 处置 | 三方对应 |
|---|---|---|---|---|---|
| M10 | diagnosis_color 全表内存过滤 | 🟡 | 还在。无 LIMIT,数据量大时慢 | 诊断色下推 SQL 或物化字段;数据量大前可暂缓 | cc-D-A2 / cc2-C2 |
| M11 | 两套租车词表不一致 | 🟡 | 还在。抽取(含"七座/七座车")vs 校验(含"7座")口径不一 | 合并单一词表源,抽取/校验读同一份 | cc-D-A3 / cc2-C3 |
| M12 | intent complaint 正则与 DB 种子重复 | 🟢 | 还在。硬编码 + intent_rules 种子各一份 | 二选一,避免改一处漏一处 | cc-D-A5 / cc2-C6 |
| M13 | 方向误判(待复核) | 🟡 | 还在(待复核)。历史数据有"用户73424…"被当 outbound | 重采后复看;若复现用 dom-collector 实测方向信号校准 | cc-D-A4 |

### 第五批 — 业务/演变触发时

| 编号 | 项 | 严重度 | 现状 | 处置 | 三方对应 |
|---|---|---|---|---|---|
| M14 | 价格表 Excel 导入空 stub | 🟡 | 还在。importRows 仅 ok({imported:0}) | **按业务定**:要功能→实现解析;不要→拆接口+前端入口(别留假象) | cc-D-A1 / cc2-C1 |
| M15 | user_type 字段(W16 演变点) | 🟡 待演变 | 内部/外部靠 is_super 二分;未来有"内部非超管员工"时不够 | 出现内部员工时加 user_type(internal/external) | cc2-E1 |
| M16 | users 双角色字段 role+role_id | 🟡 | 代码已收口为 role_id/user_type;fresh schema 已无 role;既有环境 DROP 待随新代码部署后执行 | 部署含 M16 代码后,Chase 在场执行 deploy/m16_drop_users_role.sql;执行前确认无旧代码读写 role | cc-D-A7 / cc2-C5 |
| M17 | data_scope 预留未接入 | 🟢 | 还在。self/all 已接、dept 当 self | 多租户/部门维度时再接 | cc-T3 / cc2-C7 |

### 第六批 — 文档/收尾(顺手)

| 编号 | 项 | 严重度 | 现状 | 处置 | 三方对应 |
|---|---|---|---|---|---|
| M18 | api-spec 复核 | 🟢 | C1-C7/U1-U3 记"已回写 v1.1.0" | 核一遍真同步 | cc-D-A12 / cc2-C12 |
| M19 | DEPLOY.md 补真实落地流程 | 🟢 | 还是"方案稿";实际部署(rsync+docker compose+nginx sed)W16 跑通但没写入 | 把真实部署步骤补进 DEPLOY | cc2-E3 |
| M20 | api.kongyuekeji.com 返回 000 | 🟢 | pre-existing,与 W16 无关。疑似证书/配置 | 查(可能证书过期) | cc2-E2 |
| M21 | 后台 UI 视角理顺(W15) | 🟡 | 调研完,方案未实施。控制台过时/下钻断裂/命名不统一 | **并入 W19**(mychat 首页 = W15 控制台;命名/视角随 W19 租户化一起理) | cc2-C13/C14/C15/P4 |

### 第七批 — W17 衍生的新债(2026-06-04 新增)

| 编号 | 项 | 严重度 | 现状 | 处置 |
|---|---|---|---|---|
| M22 | schema 基线与 dev init 副本易漂移 | 🟢 | v1-schema.sql(canonical)与 deploy/conf/init/01_v1-schema.sql(dev副本)需手动同步,曾漏 field_validity/customer_name(W17 Task1 时发现并对齐) | 已临时对齐;根治 = 合成一份,或加一致性校验(check 两者一致)。清理周做 |
| M23 | position-tracker 已采序列无软上限 | 🟢 | chrome.storage 每会话存已采序列,长会话累积无上限 | 现无真实长会话不触发;真触发时加软上限(如只保留最近 N 条锚点) |
| M24 | position-tracker 存储键不隔离 tenant/客服账号 | 🟡 | 存储键仅按 conversationId,换账号/重登不清存储会跨账号串 position 序号(W17 真机测出 conv#4 残片) | ★依赖 W19 客服账号稳定标识(W19 Q1 待定);W19 做多客服账号时必须先解决(否则多账号 storage 串号会爆)。眼前测试纪律=重采前清 w17_pos_* |

---

## 3. 已知取舍(登记备查,**不处理**)

这些是刻意接受的现状,不是债,不要去"修":

| 项 | 为什么接受 |
|---|---|
| 同名客户合并(conversation_id=pageKey+昵称) | 无稳定客户 ID 阶段的权衡 |
| ~~outbound 时间降级(继承+1s)~~ → **W17 改为 occurred_at=NULL** | 旧"继承+1s合成假时间"已被 W17 废弃;outbound 不存假时间(NULL)、不展示时间;排序靠 segment_at+position。**不再是取舍,是 W17 正式方案** |
| 分析纯 FIFO 无优先级双队列 | W12 设计明写"先评估真积压才加" |
| heartbeat 恒 config_version=1 / dom-config 不下发 | 选择器走插件内置,服务端下发未启用(占位) |
| analysis_jobs 注释"内存queue"与实现(DB轮询)不符 | 仅注释滞后,行为正确 |
| W16 零迁移(admin 仍持 tenant_id=1 测试数据) | 数据量极小,不迁移=零误迁风险;靠隔离保证不进 mychat |

---

## 4. 处理顺序总览(按依赖)

```
立刻:
  M0-A  W16 真正收尾(确认数据性质 + 生产浏览器4项验证)← 第一件事
  M0-B  立多agent协作规矩(写代码单agent单分支)
  M1+M2 W12.6签收 + U9验收(Chase负责,W13前置)

发版落盘:
  M3    理清分支 → push main + tags

清理周(集中,清完重建插件+采集回归):
  M4+M5 V1.9死代码 + 红线发送死代码(一起)
  M6 build.js / M7 admin残留api / M8 过时smoke / M9 双路由

数据增长前:
  M10 性能 / M11 词表统一 / M12 正则去重 / M13 方向复核

业务/演变触发:
  M14 价格表(做实or拆) / M15 user_type / M16 双角色 / M17 data_scope

顺手:
  M18 api-spec / M19 DEPLOY落地 / M20 api域名000 / M21 W15视角理顺
```

---

## 5. 给执行的提示

- **先收口再清债**:M0-A(W16收尾)、M1/M2(W12.6/U9)是"进行中"的,先闭环,别被债清单带偏。
- **清理周集中清死代码**:M4-M9 互相关联、和别的改动会碰,集中一个清理周、清完做采集回归,别零散清。红线发送死代码(M5)和 V1.9 死代码(M4)一起清(同区域)。
- **多 agent 规矩**:只读调研可并行(本次三方盘点很成功),写代码单 agent 单分支。
- **区分债 vs 取舍**:第 3 节那些是刻意接受的现状,不要去"修"。
- **价格表(M14)、W15(M21)看业务/排期**:不是必须现在做。
- **流程**:每批做完报 Chase 确认;涉及数据/红线/发版的操作按 OPS 三问。
