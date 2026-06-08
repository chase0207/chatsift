# CHANGELOG — chatsift

> 记录 chatsift 各版本变更。chatsift 独立 v0.x 版本线。
> 记录规则:`0.x.0` = W 大功能(关联 W 编号);`0.x.y` = 补丁/小修复。每版含「变更 + 复盘」。
> 发版时由 QA 写入(见 docs/ops/release.md)。完整 tag↔W 对应见 docs/ops/versioning.md。

---

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
