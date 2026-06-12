# CHANGELOG — chatsift

> 记录 chatsift 各版本变更。chatsift 独立 v0.x 版本线。
> 记录规则:`0.x.0` = W 大功能(关联 W 编号);`0.x.y` = 补丁/小修复。每版含「变更 + 复盘」。
> 发版时由 QA 写入(见 docs/ops/release.md)。完整 tag↔W 对应见 docs/ops/versioning.md。

---

## v0.6.7 — 2026-06-12
- 关联:抖音私信客服接待模式 csUI 消息采集适配(基于 v0.6.6 发布隔离基线)
- 范围:plugin(adapter + content.js build)+ docs(任务单)
- 变更:
  - `private-message.adapter.js` 新增「平台-页面-场景」轻量路由(结构优先):life(my-4)优先 → csUI → 老版气泡兜底;**①②-life 路径零改动**。
  - 新增 csUI scanner(`_scanCsuiMessages` 等)+ 诊断日志 `_logScan`(scene/dom_family/scanner/message_dom_count);csUI 时间复用 `_resolveOccurredAt` 继承策略(W17 红线:锚点+1s/继承+1s,禁 inbound 退采集当刻)。
- 部署口径:
  - **已上 prod,Chase prod 真机验收通过(2026-06-12)**:经 v0.6.6 发布隔离机制 test 先验→prod 后发,test/prod 各用独立 plugin-downloads;prod metadata 0.6.7、`chatsift-plugin-v0.6.7.zip` 含 csUI、VERSION 0.6.7;mysql 未动(仅 `--no-deps --build server`)。
  - 遗留 Stop Gate(另案,不在本版本):空月等 my-4 账号自动切换后 `realign-no-anchor` 跳过上传(属 v0.6.5 冷启动 re-align)。
- 复盘:
  - 「客服-接待模式」不是单一 DOM:csUI 与 life/my-4 两变体并存;靠结构(非顶部文案)路由、life 优先 + csUI 兜底,既覆盖 csUI 缺口又不动 ①②。
  - csUI 无逐条精确时间,复用 life 的继承+锚点策略守住 W17 红线(inbound 不退采集当刻)。
  - v0.6.7 是首个经 v0.6.6 隔离机制走完整 test→prod 的业务版本,验证发布隔离闭环可用。

## v0.6.6 — 2026-06-12
- 关联:test/prod 发布隔离机制重建(**环境治理版本,不含业务采集/DOM 改动**)
- 范围:server(dashboard.js/app.js 读 `PLUGIN_DOWNLOAD_DIR`)+ deploy(compose×2)+ scripts(`release.sh`/`check-env-isolation.sh`/`package-plugin --out`)+ docs(ops×3)
- 变更:
  - 插件下载产物从 `admin/dist` 拆出为独立目录,server 经 `PLUGIN_DOWNLOAD_DIR` 读取(未配置 fallback `public/plugin-downloads`);test 全链路 `/opt/chatsift-test/{server,admin/dist,plugin-downloads}` 独立。
  - 新增统一发布入口 `release.sh --env test|prod`(guard/dry-run/计划/确认)+ `check-env-isolation.sh`(只读隔离矩阵);`dashboard.js` 下载防路径穿越;`package-plugin.sh` 支持 `--out`/`--version`。
- 部署口径:
  - **test 验收通过**(独立发 0.6.6,prod 当时仍 0.6.5)→ **prod 迁移完成**(随 v0.6.7 上 prod 2026-06-12):prod 用独立 `/opt/chatsift/plugin-downloads` + `PLUGIN_DOWNLOAD_DIR`。
  - **`check-env-isolation.sh` 全 8 PASS**(test/prod 的 `/app/public`、plugin-downloads 挂载源、DB、JWT、mysql 卷均隔离)→ **test/prod 发布隔离全环境闭环**。
  - **未单独 tag**(随 v0.6.7 上 prod);prod 迁移用 `release.sh --env prod`,mysql 未动。
- 复盘:
  - 静态产物目录耦合(prod/test 共用 `admin/dist/plugin-downloads`)曾让 test 预发可影响 prod 自动更新——根因是发布拓扑不隔离,不能靠 Stop Gate/人工提醒补丁式推进。
  - 解法=机制隔离:plugin-downloads 独立目录 + server 读 `PLUGIN_DOWNLOAD_DIR` + 统一 `release.sh --env`(guard 写死路径)+ `check-env-isolation.sh` 可复核。

## v0.6.5 — 2026-06-11
- 关联:客户端采集本地态隔离与冷启动续编(根治 v0.6.4 验收暴露的"本地态不隔离":seen 串租户漏历史 + position 冷启动撞号)
- 范围:plugin + server(只读接口) + docs(任务单)
- 变更:
  - 客户端采集本地态(`seen` / `PositionTracker`)按 **env(normalized serverUrl 的 hash) + tenant_id + account_biz_id** 命名空间隔离;旧全局 key(`chatsift_event_seen_ids` / `w17_pos_*`)弃用不读(不迁移、不物理清理)。
  - **冷启动 re-align**:本地 position 态为空时,调新只读接口 `GET /api/v1/conversations/position-state` 取该会话已入库 `max(position)` + 最近 K 条,重建 seq 让可见历史**对齐回旧 position(幂等)**,只有真·新消息续编 `max+1`;接口失败/无法对齐 → **跳过本轮、不从 0**(防重复入库)。
  - `tenant_id` 取 `userInfo.tenant_id || decode(JWT)`;`env/tenant/account` 任一缺失 → **fail-closed 跳过本轮**(不写本地态/不上传),不用公共兜底 key。
  - 上下文(env/tenant/account)切换时 **flush 未上传 queue**,防残留事件发往新环境/新租户。
  - 新接口纯只读(SELECT),按 `tenant_id` 隔离,**不建账号/不写库/不改 lifecycle/无 schema 变更**。
- 已知注意:
  - **作为 hotfix 先直发 prod(release.md §5 豁免 test 预发),收口期补发 test → test/prod 同跑 v0.6.5 代码;Chase prod 真机验收通过(2026-06-11)**;插件为下载更新制(不更新不受影响),server 端 additive(只新增只读端点,不影响旧插件)。
  - `message_id` 合成规则 / server 去重键 / messages schema 均未改;W17"有几条存几条 + 幂等"靠 re-align 保持。
  - 待复审口径:`position-state` 用 `tenant_id` 隔离、未叠 service_account 查看权(避免采集者饥饿/撞号)。
- 复盘:
  - 客户端持久采集态命名空间只到浏览器 profile(不含 env/tenant)是采集串号/漏历史的总根因;隔离必须落到 env+tenant+account。
  - 冷启动必须 re-align:单纯 `max+1` 续编会把可见历史重新编号→重复入库;只有把可见历史对齐回旧 position、仅真·新消息续编才幂等。
  - hotfix 先 prod 后补 test 属应急(本地态根因明确、回退成本低);常规仍应 test 预发。`.env.test` 这类机密文件须纳入部署清单/备份,避免丢失后只能从 live 容器反推。

## v0.6.4 — 2026-06-11
- 关联:v0.6.3 hotfix
- 范围:plugin
- 变更:
  - 修复采集权 rejected 后本地 seen 未回滚,导致开权后消息被 skipped、无法补传。
  - 修复 popup 消息日志时间显示 [undefined]。
  - 简化插件面板:隐藏 AI 配置、知识库入口;客服配置页仅保留"自动切换红点会话"。
  - 增加"采集规则"和"自动切换红点会话"说明文案。
- 追加(test 验收暴露,纳入本版本):popup 从持久化 serverUrl 恢复环境——修"登录 test、重开 popup/重登误回 prod"(详见复盘报告 §popup serverUrl)。
- 部署:**test→prod 已部署,tag v0.6.4(`100afd1`)已 push,Chase prod 真机验收通过**;plugin only,无 schema 变更,仅 server 重启(mysql 未碰)。
- 复盘:
  - rejected 不等于终态;采集权类 rejected 应允许授权后重试。
  - popup 暴露给用户的入口必须和当前只读采集产品边界一致;serverUrl 环境须从持久化恢复,避免本地态默认 prod 误导/误传。
  - W17 position 冷启动撞号、租户2 collected:0、**seen 串租户漏历史**等"客户端本地态不隔离"问题不纳入本版本,交 codex 排查+方案另起版本(见 docs/reports/…§5/§5B)。

## v0.6.3 — 2026-06-10
- 关联:**v0.6.0 热修**(W21 节奏 + 时区;接在 v0.6.2/W22 之后)
- 范围:plugin + deploy(compose TZ)
- 变更:
  - **时区修复**:server 容器加 `TZ=Asia/Shanghai`。根因=容器跑 UTC,`toMysqlDate` 按 Node 本地时区拆 `getHours()` 入 DATETIME(插件发 occurred.iso=UTC 绝对时刻)→ 存成 UTC 墙钟,前端按 CST 解析 → 会话列表"最近时间"等差 8h。改后新数据按东八区入库,显示正确。⚠️ 已存旧 DATETIME 仍是 UTC 墙钟,需清/重采或 +8h 修正。
  - **W21 节奏**:prod profile `HUMAN_IDLE_MS` 5min → **1min**(开启自动切换后,人工无操作 1 分钟即开始扫描)。
- 说明:原计划 v0.6.1,因 W22 并行发版 v0.6.2,顺延为 v0.6.3(含 W22)。
- 复盘:
  - v0.6.1 热修因 W22 并行合入 main 导致版本号/CHANGELOG 冲突,已 `abort`(无 push、main 完好),最终基于 v0.6.2 顺延为 v0.6.3。
  - v0.6.2 未单独部署,随 v0.6.3 一起上 prod;旧 DATETIME 已做 +8h 修正(发版前 UTC 墙钟行)。
  - **发版后暴露「采集失效」,经排查拆成三类(均与本次时区/W21/W22 无关)**:① 租户1 W17 position 冷启动撞号(重装清 chrome.storage → 撞历史 position → duplicated 不入库);② 租户2 collected:0(库全空,待现场 console 确认);③ rejected 后插件本地 seen 未回滚 → 不重试。
  - 教训:后续 hotfix 不应再混入无关功能;并行发版需明确 release 分支与功能分支的冻结/合入顺序。修复统一走 `hotfix/v0.6.4-collector-retry-ui`,position 根治另行评估。

## v0.6.2 — 2026-06-10
- 关联:**W22 工单中心优化**
- 范围:server + admin + docs
- 变更:
  - **工单中心字段重构**:去掉列表/搜索区域的“类型”,去掉“标题”和“查看/处理”;新增/调整 IM昵称、客户姓名、关键词、状态 inline 处理入口。
  - **工单类型 tab**:按 全部/预约/咨询/询价/投诉 分类,每个 tab 展示当前权限范围内统计数字;“询价”作为原 pricing/报价的前端展示文案,不改底层枚举。
  - **搜索与状态处理**:搜索条件叠加在当前 tab 下;状态下拉直接保存,防重复提交,成功提示“状态修改成功”。
  - **查看记录抽屉**:新增蓝色“查看记录”入口,右侧抽屉展示对话内容 + 客户全貌,补齐关联工单摘要;第一版不做关键词高亮,不提供发送/回复/输入能力。
  - **产品文档**:新增 `docs/prd/V1.0/W22_workorder_center.md`,明确不改 schema、不改分析引擎、不改工单类型枚举。
- 复盘:
  - W22 是租户后台工单中心体验补丁,保持 chatsift 只读诊断边界。
  - W22 已发布至 GitHub/test/prod;生产随 v0.6.3 一起上线。
  - **未作为 v0.6.2 单独部署,随 v0.6.3 上 prod**。
  - 教训:以后并行发版时,正在 hotfix 的 release 分支与功能分支必须明确冻结/合入顺序(本次 W22 并行合入触发了 v0.6.1→v0.6.3 的版本顺延)。

## v0.6.0 — 2026-06-09
- 关联:**W20 + W20.1 + W21**(账号采集权治理 + 采集权只读接口 + 辅助采集器,一起发版)
- 范围:server + admin + plugin + deploy migration(W20 schema)
- 变更:
  - **W20 采集权/查看权/账号治理**:`service_accounts.lifecycle`(pending/active/disabled)+ `collector_id`(采集权单人)+ `service_account_view`(查看权多人,查看权≠采集权);事件级采集权闸门(非负责人上报 rejected,HTTP 200);heartbeat 账号级实例冲突 block + 仲裁(最早注册 primary/继续,更晚 block/暂停);`collector_v1_enabled` 默认 false 启停闸门;采集权"谁先发现谁临时归属"(不区分角色)。
  - **W20.1 collect-permission 只读接口**:`GET /api/v1/service-accounts/collect-permission`,返回 allowed/reason/lifecycle/collector_id/collector_kind(reason ∈ ok|missing_account|pending_owner|not_collector|account_disabled|unknown);tenant_admin 不天然 allowed;internal→403。只读,不建账号/不分配/不改 lifecycle。
  - **W21 辅助采集器**(plugin):低频自动切换"当前客服页面"可见未读会话 → 切换确认 → `collectNow` 显式触发一次采集;**只走 `adapter.switchSession()`,不直接点击 DOM,不发送/不输入**;消费 W20 collect-permission + 账号级 block;人工互锁(`isTrusted` 过滤真人 vs 插件合成事件 + 切换抑制窗口,避免自身切换误暂停);prod/test 双时间参数 profile(按 serverUrl 判档,固化进代码)。入口=面板 `auto_switch_session` 开关,默认 false。
- 已知注意:
  - **test/prod 需先 apply W20 migration(deploy schema),先跑 preflight 再迁移**。
  - W21 真机仅验 test 档主链路(候选识别/切换/collectNow/accepted/人工互锁);**R4–R8(多 tab block / 非负责人 / disabled / W17·W20 回归)+ prod 档节奏待 test 预发复核**。
  - 红线复核:全程只读,无发送入口;W17 position/message_id/occurred_at 不因 W21 改变。
- 复盘:
  - W20/W20.1/W21 主链路已上线 prod;W20 migration 已在 prod 执行。
  - W21 自动切换默认关闭,仍保持只读红线。
  - **后续发现 W17 position 本地状态依赖 chrome.storage,插件重装/多端会触发冷启动撞号(新消息 message_id 命中历史 position → server duplicated 不入库),需单独根治**(见 docs/reports/v0.6.0-v0.6.3_发版时间线与采集失效根因分析.md §5)。

## v0.5.0 — 2026-06-07
- 关联:**W17 消息位置标识 + W19 租户资产模型**(一次清库重采、一起发版,design §8.2)
- 范围:server + admin + plugin + 数据库迁移(deploy/w17_message_position.sql + deploy/w19_tenant_asset.sql)
- 变更:
  - **W17**:消息身份(去重)+顺序(排序)统一靠会话内 position;有几条存几条(靠位置不靠内容);outbound occurred_at=NULL 不存假时间。
  - **W19**:两层身份(user_type 系统级 internal/external + role_code/role_scope 租户级);scope helper 正向枚举 fail-closed 隔离(平台方默认不看/租户超管看本租户全部/客服看分配账号);service_account 资产模型(account_biz_id=商家账号URL accountId);采集账号识别+自动归属(客服上报自动绑定);conversation_id 纳入 account_biz_id(跨账号同名客户不误并);admin 租户管理+客服账号分配(归租户方);mychat 首页;移除 chat_rpa 死指标。
  - **清库重采**:conversation_id/message_id 口径变更 → W17+W19 一次清库 + 真机重采。
- 复盘:(发版后补)

## v0.4.0(W17,未单独发版,并入 v0.5.0)
- 关联:**W17 消息位置标识**;与 W19 一起发 v0.5.0,不单独打 tag。变更见 v0.5.0 的 W17 部分。

---

## v0.3.1 — 2026-06-03
- 关联:**W16**
- 范围:server + admin + plugin
- 变更:登录域名限制(内部/外部按域名分入口),完成平台/租户双入口拆分。
- 复盘:数据隔离靠后端 tenant_id(已有),前端域名过滤是视角分离;零迁移(admin 纯测试数据)收益高于迁移风险。

## v0.3.0 — 2026-06-03
- 关联:**W16**
- 范围:server + admin + plugin
- 变更:平台/租户双入口拆分(admin + mychat)首发。
- 复盘:超管不跨 tenant 查,使"超管看不到租户数据"几乎免费成立。

## v0.2.12 — 2026-06-03
- 范围:server + admin
- 变更:聚合条目展示最后一条消息 + 相对时间(微信式)。客户昵称修复链收尾。
- 复盘:昵称误读根因是插件读了登录客服名;server 只取 inbound 客户消息为准。

## v0.2.9 ~ v0.2.11 — 2026-06-03
- 范围:plugin / server / admin
- 变更:客户昵称误读修复链(插件去 userInfo 兜底 → server 只取 inbound → 工单显示实时客户名)。
- 复盘:用户身份与消息归属必须分离,不能用客服名冒充客户名。

## v0.2.5 / v0.2.6 — 2026-06-02
- 关联:**W13**
- 范围:admin
- 变更:只读消息聚合三栏页 + 隐藏日志中心 + 顶部多平台切换(平台→页面→客服)。
- 复盘:聚合页定位"展示"非"工作台",无发送入口。

## v0.2.0 ~ v0.2.8 — 2026-06-02
- 范围:全栈
- 变更:从 chat_rpa 初始化 + 采集插件骨架 + 早期功能(采集/会话展示/昵称/admin菜单/RBAC修复)。W1-W12 早期工作累积进基线 + 增量补丁。
- 复盘:历史 tag 非按 W 1:1;从 W17/v0.4.0 起严格 W↔tag 对应。

---

## 变更日志(本文件)
| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0.0 | 2026-06-04 | 初版:回填 v0.2.0~v0.3.1 历史 + v0.4.0 占位 |
