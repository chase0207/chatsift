---
文档: W20 阶段A 验收(数据模型)— 草稿,待 Chase 审
版本: v1.0.0
周次: W20
落位: docs/reports/
状态: Draft(夜间无人值守产出,天亮 Chase 一次性审)
身份: DEV(CC4) / 环境: 本地 worktree chatsift-w20 / 分支: w20-account-governance
---

# W20 阶段A 验收 — 数据模型(地基)

> 依据:技术方案 v1.3 §2 / W20_tasks 阶段A / Chase 夜间指令"W20 独立、不与 W19 混在一起"。
> ★本阶段是 Chase 第一个要审的硬闸(A 闸比 B-D 严):**完整 schema diff 见 §3**。

## 1. 做了什么
| 项 | 落点 |
|---|---|
| service_accounts 扩 4 列(lifecycle/first_seen_by/collector_id/collector_kind)+ idx_lifecycle + 2 FK | `server/sql/03_w20_account_governance.sql` W20.1 |
| 新建 service_account_view(查看权多人) | 同上 W20.2 |
| 新建 service_account_audit(治理审计) | 同上 W20.3 |
| 新建 collect_instances(采集实例 heartbeat) | 同上 W20.4 |
| employee_service_account 标废弃(改表注释,不 DROP、不迁移) | 同上 W20.5 |
| dev init 副本同步(防 M22) | `deploy/conf/init/03_w20_account_governance.sql`(与 canonical 字节一致) |
| 已有库(prod/test/dev)升级 migration | `deploy/w20_account_governance.sql`(同 DDL + "已有库手动迁移"头注) |
| prod/test compose 各加第 4 个 init 挂载 | `deploy/docker-compose.{prod,test}.yml` |

★**结构决策(遵 Chase 夜间指示)**:W20 schema **未并入 02_w19**,而是独立 `03_w20_account_governance.sql`,与 W19 完全隔离(W19=02、W20=03,对齐 W19 自身"server/sql 基线 + deploy 升级"双份模式)。

## 2. 本地自测(两条 schema 路径都验证)
独立测试库,不碰正在跑的 dev 库 `chatsift` 数据:
- **升级路径**:`chatsift_w20_base`(00+v1-schema+02_w19,模拟已有库)apply `deploy/w20_account_governance.sql` → 成功。
- **fresh-init 路径**:`chatsift_w20_fresh`(00+v1-schema+02_w19+03_w20)→ 成功。
- **两库 SHOW CREATE 逐表 diff**:service_accounts / service_account_view / service_account_audit / collect_instances / employee_service_account **全部一致**(证明 init 基线与升级 migration 单一真源、无漂移)。

验收清单:
- [x] 本地库 apply 成功;各表字段/索引/外键正确(见 §3 实测 SHOW CREATE)。
- [x] status 与 lifecycle 双字段:status 暂留不扩展、注释写明业务只读 lifecycle;lifecycle 默认 pending。
- [x] 新增 sql 文件 → check-version:server/sql 4 文件 == prod/test compose 各 4 挂载,**Status: SYNCED**。
- [x] 升级 migration 与 fresh 基线 schema 一致(双路径 diff 通过)。

## 3. ★完整 schema diff(Chase 第一个审)

### 3.1 service_accounts 扩列(ALTER ADD,只增不改)
```
+ `lifecycle`      varchar(16) NOT NULL DEFAULT 'pending'  AFTER status   -- 业务判断只看它
+ `first_seen_by`  int DEFAULT NULL  AFTER first_seen_at                  -- FK users(id)
+ `collector_id`   int DEFAULT NULL  AFTER first_seen_by                  -- FK users(id);采集权单人
+ `collector_kind` varchar(8) DEFAULT NULL  AFTER collector_id            -- temp/formal
+ KEY idx_lifecycle (tenant_id, lifecycle)
+ CONSTRAINT fk_sa_first_seen FOREIGN KEY (first_seen_by) REFERENCES users(id)
+ CONSTRAINT fk_sa_collector  FOREIGN KEY (collector_id)  REFERENCES users(id)
  (uk_account / status / 既有 FK 不动)
```
实测:lifecycle=varchar(16) NOT NULL DEFAULT 'pending';first_seen_by/collector_id=int NULL 带 FK→users;idx_lifecycle(tenant_id,lifecycle) 在。

### 3.2 service_account_view(新表)
```
uk_view (service_account_id, employee_id)          -- 一账号一员工只一条查看权
idx_tenant_emp (tenant_id, employee_id)            -- 客服 scope 高频按(tenant,emp)查
FK: tenant_id→tenants / service_account_id→service_accounts / employee_id→users
granted_by NULL = 系统(采集人首见默认查看权)
```

### 3.3 service_account_audit(新表)
```
event_type 枚举注释:first_seen/temp_grant/confirm/reassign_collector/view_add/view_remove
                    /reject_collect/pending_grab/instance_conflict/old_collector_blocked
before_value / after_value = JSON;device_id/browser_profile_id/tab_id 记实例
idx_tenant_sa (tenant_id, service_account_id) / idx_event (tenant_id, event_type, created_at)
无 FK(loose,容纳系统操作 operator=NULL)
```

### 3.4 collect_instances(新表,阶段D 用)
```
collector_instance_id varchar(64) NOT NULL = hash(device_id+browser_profile_id+tab_id)
uk_instance (tenant_id, collector_instance_id)     -- ★不含 nullable 字段
idx_acct (tenant_id, platform, platform_page, account_biz_id)
idx_conv (tenant_id, platform, platform_page, account_biz_id, conversation_id)
无 FK(heartbeat 表,loose)
```

### 3.5 employee_service_account(废弃)
```
仅改 TABLE COMMENT = 'W20 废弃:采集权移至 service_accounts.collector_id、查看权移至 service_account_view;
                      不再读写;DROP 待 W20 稳定后单独一步'
不 DROP、不删数据、不迁移(无真实用户数据)。代码三处改读移到阶段B/C。
```

## 4. 红线复核
- W17:position/message_id/段时间 **未动**(本阶段纯加列/建表)。
- W19:资产模型 **未破坏**(service_accounts 既有列/uk_account/既有 FK 全保留;esa 不 DROP)。
- 只读定位:无发送入口(本阶段无接口)。

## 5. 待 Chase 决策点(本阶段)
- **Q-A1(结构)**:已遵夜间指示用独立 `03_w20`(非并入 02_w19)。但 brief 原文写"并入 02_w19 增量"——以 Chase 夜间口头指示为准,记此以防 brief 字面与执行不一致需回溯。
- **Q-A2(lifecycle 默认 pending 对存量)**:fresh 库无存量;dev/test/prod 已有库跑升级 migration 后,既有 service_accounts 行 lifecycle 落 'pending'(DEFAULT)。技术方案 §2.1 已认可(无真实用户→可接受,需管理员确认)。若 Chase 希望存量直接落 'active' 免确认,需补一条 UPDATE(留 Chase 定)。
