---
文档: W20 阶段E · E2 第一轮真机问题诊断(活文档)
版本: v1.0.0
周次: W20
落位: docs/reports/
状态: Diagnosis(根因确认,待 Chase 确认修复方案)
身份: DEV(CC4) / 环境: dev 库 chatsift @ 127.0.0.1:3306 / 分支: w20-account-governance
---

# W20 E2 第一轮真机问题诊断

## 1. 现象(Chase 报告)
- 同租户:管理员A(id=2,18651359635)+ 客服B(id=4,tenant)。
- 客服B 登录采集,账号"空月培训教育官方号";3 个客户咨询,**只采到客户1(车评老帅),客户2(chase)、客户3(上海空月-小正)起初未采**。
- 管理员A 采集时未提示"已有其他账号采集"。
- 10 分钟后客服B 采到客户3,但**客户2(chase)始终未采到**。
- 客服B 控制台刷屏 `[LegacyCollector] instance conflict {level:'account'/'session'}`,`collectMessageSession {collected:0, skipped:20}`,最后 `EventUploader stopped`。

## 2. 服务端铁证(dev 库实查)
- **service_accounts**:1 个,biz_id=1858797317227848,lifecycle=**pending**,collector_id=**4(客服B)**,collector_kind=temp,first_seen_by=4。→ 客服B 是采集负责人。✅
- **conversations**:只 2 条 —— 车评老帅(`...c35fc8d8`)、上海空月-小正(`...a402b372`);**缺 chase**。
- **service_account_audit 时间线**:
  | 时刻 | 事件 | 谁 |
  |---|---|---|
  | 16:03:09 | first_seen + temp_grant | 客服B(4)首见建号、得临时采集权 |
  | 16:05:47 | **pending_grab**(拒) | 管理员A(2)采集被采集权闸门拒(对,A 非采集人)|
  | 16:05:59→ | **instance_conflict session 刷屏** | B(4)与A(2)交替,**全在 `...5d46c12c`** |
- ★**关键**:冲突的 `5d46c12c` 既非车评老帅(c35fc8d8)也非小正(a402b372)——**它就是没采到的 chase 的会话**。
- **collect_instances**:2 个活跃实例 —— B(emp4)+ A(emp2),同 biz_id。

## 3. ★根因(确认)
**heartbeat 冲突检测漏了"同员工"维度,导致非采集人 A 的实例把合法采集人 B 给阻断了。**

- W20 server `heartbeat` 冲突查询(eventsController):
  ```sql
  SELECT conversation_id FROM collect_instances
  WHERE tenant_id=? AND account_biz_id=? AND collector_instance_id<>?
    AND last_seen_at >= NOW()-60s
  ```
  **只按 (tenant, account_biz_id) 查,没限定 employee_id。**
- 后果链:
  1. 客户1(车评老帅)在 16:03 采到 —— 那时 A 还没介入(16:05),无冲突。✅
  2. 16:05 管理员A 也开了 chase 的会话 → A 和 B 都 heartbeat `5d46c12c`。
  3. 服务端按 (tenant,biz_id) 查到"另一实例同会话" → **给 B 和 A 都返回 session-block**。
  4. 插件 E0 代码:session-block → `_blocked=true` → `collectMessageSession` 拦截 → **B(合法采集人)停止采集 chase**。
  5. chase 因此始终没被采到;小正(a402b372)是在 A 实例过期的空窗期被 B 采到的。
- **这违反 PRD §6.3 语义**:实例冲突(block/warn)是治理**"同采集负责人多实例"**(同一个人多设备/页签采同一会话);**非采集负责人**应由**采集权闸门**拒入库(已正确:pending_grab),**不该用实例冲突去 block**,更不该 block 到合法采集人头上。

## 4. 修复方案(建议,待 Chase 确认 → 我落地)
**核心一行**:heartbeat 冲突查询加 `AND employee_id = ?`(本员工),即只和**自己的其他实例**(同人多设备/页签)算冲突。
```sql
SELECT conversation_id FROM collect_instances
WHERE tenant_id=? AND employee_id=? AND account_biz_id=? AND collector_instance_id<>?
  AND last_seen_at >= NOW()-60s
```
- 效果:
  - 同一客服B 两个页签采同一会话 → 仍 session-block(对,同采集负责人多实例)。
  - 客服B(采集人)+ 管理员A(非采集人)→ **不再互相 block**;A 的采集仍被采集权闸门拒(pending_grab)。→ B 正常采到 chase。✅
- 影响面:仅 `eventsController.heartbeat` 一处查询;server 自测 D 组需补一条"跨员工不冲突"断言;不动 schema、不动采集权闸门。

## 5. 配套提醒(非阻塞)
- **O1 真机测法要改**:验 session-block 要用**同一个客服B 开两个页签/设备**,不能用 A+B(不同员工,修复后正确地不冲突)。
- 管理员A 跑采集插件 → 事件被拒(pending_grab,对)。理想上 tenant_admin 不应主动采集,但属设计细化,本次 employee_id 修复已解阻断,不阻塞。
- P3-1(conversation_id 含昵称)本轮未踩:三个会话 id(c35fc8d8/a402b372/5d46c12c)各不相同,无碰撞。
- 当前 dev 库残留本轮测试数据(1 账号 pending + 2 会话 + 37 消息 + 审计);修复后建议再清一次重测(E1 清库脚本可复用),或保留观察由 Chase 定。

## 6. 修复落地(β,2026-06-08,Chase 拍板选 β)
- 只改 `eventsController.heartbeat` + 新增 `resolveAccountCollector` 助手;**未动 schema、未动采集权闸门**。
- 逻辑:仍 upsert 全部实例;按 platform/page/account_biz_id 解析 service_account 的 collector_id;
  - 解析不到 / 本员工≠collector_id → 不返回冲突、不写 instance_conflict;
  - 本员工==collector_id → 只和本员工自己其他活跃实例(同 platform/page/account_biz_id,60s,排自身)比:同会话→session/block+audit;同账号不同会话→account/warn。
- 自测(`/tmp/w20_stageD_test.js`,β)**19/19 PASS**,覆盖 Chase 4 场景:
  1. 同采集人同账号同会话两实例→session/block ✅
  2. 同采集人同账号不同会话→account/warn ✅
  3. 采集人B+非采集人A 同会话→互不 block、A batch 仍 pending_grab 拒 ✅
  4. 非采集人自己两实例→无 heartbeat 冲突、batch 仍拒 ✅
  + 兼容(uk幂等/窗口/无cid/无account_biz_id)。
- 回归:B25/C34/UK13 全绿(累计 91 断言)。
- W20 server 已重启加载 β。dev 库仍有第一轮残留(1 pending 账号 + 2 会话 + 37 消息);**再测建议先清库(E1 脚本可复用,需 Chase 在场)**,或保留观察。

## 7. E2 第二轮诊断(2026-06-08):管理员首见抢占采集权 + 悬浮栏调研

### 7.1 现象
B 采到小正、"没采到"车评老帅;管理员A 未采到。待办 ② 不通过。

### 7.2 铁证(dev 库)
- service_accounts:1 个(active,collector=4 即 B)。
- **审计时间线**:`first_seen` 是 **emp 2(管理员A)** @18:23 → temp_grant collector=**2**;`pending_grab`(拒)**emp 4(B)** @18:24-18:36;`confirm`@19:28 → collector=4(B);此后 `reject_collect` emp 2(A 不再是采集人)。
- conversations(都挂账号16):小正(18:23,33msg,last 21:35)、chase(18:37,8msg)、车评老帅(18:38,40msg,last 18:34)。

### 7.3 根因
**管理员A 的插件先首见账号 → 自动成临时采集人(collector=2),把客服B 在 pending 期 pending_grab 挡住。** A 在 pending 期采了全部 3 客户;confirm 后 collector=B,B 只补采了小正,没再打开车评老帅 → B 视角"没采到车评老帅"。
- 违反 Chase 要求"管理员不天然获得采集权;管理员打开插件若不是 collector 应被拒"。**首见自动授采集权落到了 admin 头上**——这是设计缺口。

### 7.4 修复方案(待 Chase 确认口径)
**首见自动建号+授临时采集权,限定为 agent(客服)。** 非 agent(tenant_admin)首见未知账号 → `no_collect_permission` 拒、**不建号**;待 agent 采集才首见建号。admin 只能经 confirm/reassign 显式获得采集权(PRD §5.1)。
- 落点:`resolveServiceAccount` 首见分支加 `req.user.role_code==='agent'` 判定;否则返回 reject 标记,gate 拒。
- 备选 β:admin 首见也建号但 collector=NULL(进待确认列表待指派)。推荐 α(更简,账号由 agent 认领才生)。

### 7.5 插件悬浮栏/消息日志调研
- **当前 chatsift 插件无页面悬浮栏**(content.js 无 position:fixed/shadowRoot 注入)。
- **弹窗(popup)有"消息日志"**:`page-logs` 标签 → `logList` → `GET_LOGS`(运行时日志缓冲)→ `shouldShowRuntimeLog` 白名单过滤(`[发送/会话/消息/看门狗/...]`、`^[Tag]:` 等)。W20 状态(采集权拒/实例冲突)**目前没接进去**。
- 旧 chat_rpa 有 `dom-collector/overlay.css`(独立 dom-collector 的页面浮层),**当前 chatsift 没迁移**。
- 接 W20 状态两条路:(a)**复用 popup 消息日志**——给 首见pending/采集权拒(pending_grab/not_collector/disabled)/实例冲突block·warn 发用户友好中文日志行(format 配 shouldShowRuntimeLog);采集权拒来自 server reject_reasons(event-uploader 补一行 Logger),实例冲突已在 legacy-collector(改友好文案)。工作量小。(b)新建页面悬浮栏(新 UI,工作量大)。推荐 (a)。

## 变更日志
| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0.0 | 2026-06-08 | E2 第一轮:根因=heartbeat 冲突未按 employee_id 限定,非采集人实例阻断了合法采集人 → 缺 chase。修复=查询加 employee_id。待 Chase 确认落地。 |
| v1.1.0 | 2026-06-08 | Chase 选 β,修复落地(只改 heartbeat,加 resolveAccountCollector;只治理同采集负责人多实例);Stage D β 自测 19/19 + B/C/UK 回归;W20 server 重启。 |
| v1.2.0 | 2026-06-08 | E2 第二轮:根因=管理员首见抢占采集权(admin 自动成临时采集人挡住 agent);修复方案=首见限定 agent(待确认 α/β)。悬浮栏调研:当前无页面浮层,popup 有消息日志可复用接 W20 状态。 |
