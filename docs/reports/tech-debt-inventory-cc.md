---
文档: chatsift 技术债 / 遗留问题清单 (tech-debt-inventory)
版本: v1.0.0
日期: 2026-06-03
方法: 对照 PROJECT_REALITY.md + SPEC_GAP.md(2026-06-01 基线)逐条核实当前代码现状,
      + grep TODO/FIXME/HACK/stub/占位 全量扫描 + git 工作区核查 + reports 未闭环承诺核查。
口径: 只盘点不修。区分"真债(建议处理)"与"已知取舍(登记备查,不处理)"。
标注: 【严重度】🔴阻断 / 🟡中 / 🟢低(整洁性,无功能影响);【现状】还在 / 已解决。
---

> 总览:**当前无 🔴 阻断级债**。功能均可用,债集中在"死代码/冗余/性能隐患/文档滞后/发版未推"。
> 自 6-01 基线后被顺手解决的:**M3 日志中心孤儿页(W13 建了 Logs.vue + 路由)**、**U9 非主路径时间戳(代码已修,待验收)**、**W14 悬空文件(main.js/stores/user.js 已随 v0.2.8 提交)**。

---

## A. 真债(建议处理)

### 代码债

| 编号 | 类型 | 严重度 | 现状 | 建议处置 | 关联文件 |
|---|---|---|---|---|---|
| D-A1 | 假实现 | 🟡 | 还在 | 价格表 Excel 导入是空 stub(`importRows` 直接 `ok({imported:0})`,无解析入库)。要么实现 Excel 解析,要么移除接口 + 前端导入入口,避免"看起来能用实则不入库"。 | server/src/controllers/v1/priceTableController.js:93、routes/v1/priceTable.js |
| D-A2 | 性能隐患 | 🟡 | 还在 | `diagnosis_color` 过滤是"全表取出→buildDiagnosis→内存筛选→再分页",无 LIMIT。数据量大时慢。建议把诊断色下推到 SQL(或限制时间范围/加上限)。 | server/src/controllers/v1/conversationsController.js(list 的 diagnosis_color 分支) |
| D-A3 | 词表不一致 | 🟡 | 还在 | 两套租车词表各自维护:抽取(completeness-engine 默认含"七座/七座车")vs 校验(business-rules 含"7座")。边界上会"抽得到但校验不过"或反之。建议合并为单一词表源。 | server/src/v1/completeness-engine.js、business-rules.js |
| D-A4 | 方向误判 | 🟡 | 还在(待复核) | 历史数据里有"用户73424…"被当 outbound(`_isOutbound` 启发式 + 旧布局)。重采后需复看;若复现,用 dom-collector 实测的方向信号(inbound 有 span.name、outbound 有 p.text-right)校准。 | plugin/adapters/douyin/private-message.adapter.js `_isOutbound` |
| D-A5 | 重复维护 | 🟢 | 还在 | intent 硬编码 complaint 正则与 `intent_rules` 种子(tenant 0 complaint keyword)**内容重复**,两处各一份。建议二选一(留种子或留硬编码),避免改一处漏一处。 | server/src/v1/intent-engine.js、intent_rules seed |
| D-A6 | 冗余路由 | 🟢 | 还在 | heartbeat / dom-adapter-config **双路径挂载**:`/api/v1/heartbeat` 直挂 + `/api/v1/events/heartbeat` 子路径各一份。建议删一处。 | server/src/app.js:37-38、routes/v1/events.js:9-10 |
| D-A7 | 字段冗余 | 🟢 | 还在 | users 表 `role`(TINYINT 1/9)与 `role_id`(FK)并存;登录已以 role_id/roles 为准,但 payload 仍带 role。建议统一到 role_id,或文档登记 role 为兼容字段。 | server/sql/00_reused_tables.sql:19-20、authController.js |
| D-A8 | 死代码(后台) | 🟢 | 还在 | admin 残留 chat_rpa 时代 api 封装:`ai.js`、`keywordReplies.js`、`knowledge.js`、`columnPrefs.js`、`devices.js`、`plugin-update.js`,对应能力 chatsift 已不提供。建议删除未用封装。 | admin/src/api/* |
| D-A9 | 死代码(插件) | 🟢 | 还在 | V1.9 runtime 死代码打进 content.js(增大体积):batch-manager、queue-manager、runtime-manager、recovery-manager、watchdog、diff-engine、chaos-monitor、bug-dump、rpc-bridge、runtime-state-machine、self-check、session-detector、session-parser(STUB)、session-identity-resolver(含 avatar,采集未用)。**清理时注意保留 LIVE 的:legacy-collector / event-collector|queue|uploader / feature-flags / adapter-registry / lk-tracer。** | plugin/runtime/* |
| D-A10 | 死引用 | 🟢 | 还在 | `build.js` MODULES 清单引用多个不存在文件(adapter-runtime、adapters/base/*、xiaohongshu/kuaishou/meituan adapter、content_legacy.js),构建仅 warn 跳过;文件头注释仍指向已删的 content_legacy.js。建议清理清单 + 更新注释。 | plugin/build.js |
| D-A11 | 过时脚本 | 🟢 | 还在 | 两个 smoke 必失败:`douyin-private-regression.js`(依赖已删快照)、`runtime-lock-regression.js`(W5 前发送锁语义)。建议删除;或用 dom-collector 现有快照(tools/dom-collector/dom-snapshots)重写 private 回归。 | scripts/smoke/ |

### 后台前端债

| 编号 | 类型 | 严重度 | 现状 | 建议处置 | 关联文件 |
|---|---|---|---|---|---|
| D-A12 | 接口未进规格 | 🟢 | 部分回写 | U1/U2(leads/recent、intent-distribution/lead-level/trend)、U3(列表新增查询参数)SPEC_GAP 记为"已回写 api-spec v1.1.0";建议核一遍 v1-api-spec.md 是否真同步,避免规格再次滞后。 | docs/architecture/v1-api-spec.md |

---

## B. 已知取舍(登记备查,**不处理**)

| 编号 | 取舍 | 为什么接受 | 关联 |
|---|---|---|---|
| T-1 | 同名客户合并(conversation_id = `pageKey+昵称` hash) | 无稳定客户 ID 阶段的权衡;同页面同昵称合一会话。 | legacy-collector.js `_buildSessionInfo` |
| T-2 | outbound(客服)消息时间降级(继承上一条 +1s / inherited,estimated) | 客服消息无精确隐藏时间,只保序不冒充。 | private-message.adapter.js `_resolveOccurredAt` |
| T-3 | data_scope 'dept' 未实现(self/all 已接入,dept 当 self) | 部门维度暂不需要;前端选项已 disabled 标"占位"。 | utils/data-scope.js、Roles.vue:53 |
| T-4 | 分析无优先级双队列(纯 FIFO) | W12 设计写明"先评估真积压才加"。 | analyzer.js takeJobs |
| T-5 | heartbeat 恒 config_version=1 / dom-config 不下发 selectors | 选择器走插件内置,未做服务端下发(占位)。 | eventsController heartbeat/domAdapterConfig |
| T-6 | analysis_jobs 表注释"内存queue"与实现(DB 轮询)不符 | 仅注释滞后,行为正确(C5)。 | v1-schema.sql |
| T-7 | 红线发送残留(popup autoReplySwitch 强制 false、content.js 打包的 LK-SEND-* 死代码) | 无激活路径,send_runtime_v19=false;清理可随 D-A9。 | popup.js、background.js、content.js |
| T-8 | intent 硬编码前置规则(complaint 正则 + 结构化预约先于 DB 规则) | W12.5 已追认为既定行为(投诉优先 / 结构化预约让位投诉)。注:其"重复维护"部分是 D-A5。 | intent-engine.js |
| T-9 | session-identity-resolver 的 avatar 身份逻辑 | 采集链路不含头像(W6.5 取舍);文件本体随 D-A9 清理。 | session-identity-resolver.js |

> 文档滞后类(SPEC_GAP 的 C1–C7:漏斗三环、by-page 改名、completeness 6 字段占比、pricing payload、analysis_jobs 注释、heartbeat 占位、词表 env 名)——均"以代码为准",SPEC_GAP v1.1.0 记为已回写 api-spec。归入 D-A12 复核,不单列。

---

## C. git / 工作区债

| 编号 | 严重度 | 现状 | 说明 / 建议处置 |
|---|---|---|---|
| G-1 | 🟡 | 还在 | **main 有 10 个本地 commit 未推 origin**,含 4 个发版 tag(v0.2.9 / v0.2.10 / v0.2.11 / v0.2.12)。发版当时为不带上并行线 commit 而未 push。建议:与并行线协调后择机 `git push origin main --tags`(会一并推上 dom-collector 的 fc73053/772abf6)。 |
| G-2 | 🟢 | 还在 | 工作目录当前在 `w16-platform-tenant-split`(并行 W16 分支);本人发版用 worktree 从 main 隔离做的。我的修复 commit 也残留在 w16(11e6d32/c2abd18/7cd63e9/ea7561e 等)与 main 上 cherry-pick 版并存。w16 合并 main 时会遇到同一修复双份(git 一般按 patch-id 去重),需留意。 |
| G-3 | 🟢 | 还在 | w16 工作树有 `tools/` 未跟踪(dom-collector 工具目录)。属并行线,待其归位。 |
| G-4 | — | 已解决 | W14 报告提的两个悬空文件 `admin/src/main.js`、`admin/src/stores/user.js` 已随 **v0.2.8** 提交并部署,不再悬空。 |

---

## D. 挂起任务债(文档承诺,未闭环)

| 编号 | 严重度 | 现状 | 说明 / 建议处置 |
|---|---|---|---|
| P-1 | 🟡 | 待验收 | **W12.6 真实重采验证**(inbound 入库时间 vs hover 精确时间准确率 ≥95%、time_source 多为 precise-invisible)。W12.6_acceptance.md §真实重采状态明确"本次未清空真实数据重采"。**机制已在近期真实重采数据上生效**(raw_snapshot 见 inbound = precise-invisible/estimated=false),但**未做正式 95% 抽样测量签收**。建议:用现有真实数据抽样测一次,补 W12.6 收口。 |
| P-2 | 🟢 | 已解决(代码)/ 待验收 | **U9 非主路径时间戳**:私信 adapter 的 bubble 兜底分支现已走 `_extractPreciseMessageTime` + `_resolveOccurredAt`(不再冒充采集当刻)。代码完成,随 P-1 一并验收。 |
| P-3 | 🟡 | 挂起 | **W15(剩余 RBAC)** + **D-A4 方向小瑕疵** —— 此前对话约定挂起,待排期。 |

---

## 建议优先级(供 Chase 排,仅参考)

1. **P-1 W12.6 收口**(时间准确率是核心数据质量,且已有真实数据可测,成本低)。
2. **G-1 push main + tags**(发版产物只在本地,有丢失风险;需与并行线协调)。
3. **D-A2 diagnosis_color 性能**、**D-A3 词表统一**(数据增长 / 校验准确性,影响口径)。
4. **D-A1 价格表导入**(按业务是否要这功能决定:做实 or 拆掉)。
5. **清理周一把梭**:D-A6/A7/A8/A9/A10/A11 + T-7 死代码(整洁性,建议放并行线 dom-collector / W16 收尾时一起做,降低与其改动的冲突)。
6. **D-A12 文档复核**、**D-A5 去重**(低优,顺手)。
