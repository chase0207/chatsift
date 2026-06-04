---
文档: W16 拆分方案 — 平台/租户双入口(权限/视角分离)
版本: v1.0.0
状态: Active(阶段二:实施)
---

## 变更日志

| 版本 | 日期 | 变更摘要 | 触发来源 |
|---|---|---|---|
| v1.0.0 | 2026-06-03 | 阶段二实施:建租户账号+数据迁移+插件改账号+入口拆分+修auth | 调研完成 + Chase 全部同意 |

---

# W16 阶段二:平台/租户双入口拆分

> **目标**:把"平台视角"和"租户/用户视角"从入口物理分离。
> - **admin.kongyuekeji.com** = 平台/超管入口:管用户/插件/平台/角色,**看不到任何租户业务数据**。
> - **mychat.kongyuekeji.com**(新)= 租户/员工入口:管自己的会话/线索/工单/分析/聚合。
> **调研结论(W16阶段一)**:后端数据查询已按 `tenant_id=req.user.id` 强制隔离(无越权)、数据表 tenant 地基已就绪。真问题是"单账号 admin 身兼平台超管+唯一数据owner"。所以本期只需:**拆账号 + 迁数据 + 插件改账号 + 分入口 + 修auth**,不动查询逻辑。
> **Chase 已同意全部 6 点**(见 §0)。
> **定性**:数据安全改动(改数据归属)。死守"先备份、可回滚、分步验证"。

---

## 0. 已定决策(Chase 全部同意)

1. 新建独立"租户/员工"账号(role_id=2 普通用户),与 admin(超管)彻底分开。
2. 现有 tenant_id=1 业务数据**迁给**新租户账号(先备份,不清空重采)。
3. 入口隔离用"**同一份前端按登录身份过滤菜单**"起步(不做两套构建)。
4. 平台超管**不查租户数据**,维持现状最简(不接入 data_scope 跨租户查)。
5. 插件改用**租户账号 token** 上报。
6. **前置先修 auth 补 permissions**(否则新账号进业务页 403)。

---

## 1. ★安全认知(必须理解,不能误判)★

- **数据隔离靠后端 `tenant_id` 过滤(已有),不是靠前端隐藏菜单。** "按身份过滤菜单"是视角/体验分离;真正的数据安全是后端 `WHERE tenant_id=req.user.id`(调研已确认存在)。所以即使租户员工手敲 URL 访问某页,后端也只返回他自己租户的数据。**两者都要,别以为前端隐藏了就安全。**
- **本期最高风险动作 = 数据归属迁移(Task 3)**:改 tenant_id 是改数据归属,误迁=租户看不到历史。**迁移前必须备份、迁移用事务、迁移后逐表核对行数。**
- **执行顺序不能乱**(见 §2):必须"先建账号+修auth → 备份 → 迁数据 → 改插件 → 验证 → 才分入口"。顺序错会导致新数据落回 admin 或租户登录即 403。

---

## 2. 执行顺序(按依赖,不可打乱)

```
Task 1  修 auth 补 permissions(前置,不然新账号进业务页 403)
Task 2  建独立租户账号(role_id=2)
Task 3  ★备份 → 迁移现有 tenant_id=1 业务数据到新租户 id(事务+核对)★
Task 4  插件改用租户账号 token 上报
Task 5  验证:新租户登录能看到迁移后的全部业务数据;admin 登录看不到业务数据
Task 6  入口拆分:admin 只留平台页、mychat 放业务页(按身份过滤菜单)
Task 7  部署 mychat 域名(Nginx + 证书)
Task 8  端到端验收
```

每个 Task 做完报 Chase 确认再下一步,尤其 Task 3(数据迁移)前后。

---

## Task 1 — 修 auth 补 permissions(前置)

调研发现:`middleware/auth.js` 只补 is_super/data_scope,**不补 permissions**。单超管不触发(超管放行不看 permissions),但普通用户 token 不带 permissions 会进业务页全部 403。

- 在 auth.js 里,若 token 缺 permissions,从 DB(role_has_permissions → menus.permission_code)补全到 req.user.permissions。
- 或在登录签发 token 时就把 permissions 写进 JWT。
- 验证:用一个 role_id=2 的测试账号,带它的 token 调 conversations:list,应 200(不再 403)。

> 这是后续所有"租户账号能用业务页"的前提,必须先修。

---

## Task 2 — 建独立租户账号

- 新建一个 user,role_id=2(普通用户),与 admin(id=1)分开。记下它的 id(下文称 TENANT_ID)。
- 这个账号是员工甲以后从 mychat 登录用的业务账号。
- 设强密码(不用默认值)。
- 确认它的角色(role_id=2)拥有业务页权限点(conversation:list / lead:* / workorder:* 等),没有平台页权限点(user:list / plugin:list / platform:list 等)。
- admin(id=1)保持超管,但后续要去掉它的业务页权限点(Task 6)。

---

## Task 3 — ★数据归属迁移(最高风险,先备份)★

> 把现有 tenant_id=1(admin)的业务数据迁到新租户 TENANT_ID。

**3.1 先备份(硬要求)**
```bash
# 全量备份当前库(迁移前的安全网)
mysqldump chatsift > chatsift_before_w16_migration_$(date +%Y%m%d).sql
# 下载离机 + 验证可解压(不是导出就完事)
```

**3.2 确认迁移范围**
列出所有 tenant_id=1 的业务数据表:conversations、messages、leads、workorders、analysis_jobs、(以及 tenant_llm_config、price_table 等所有 tenant_id 打头的业务表)。
**注意**:intent_rules 的 tenant_id=0 是全局规则,**不迁**;users/roles/menus 等平台表不迁。只迁"业务数据"。

**3.3 迁移(事务 + 核对)**
```sql
START TRANSACTION;
-- 迁移前记录各表行数
SELECT COUNT(*) FROM conversations WHERE tenant_id=1;  -- 记下
-- ... 各业务表
UPDATE conversations    SET tenant_id=<TENANT_ID> WHERE tenant_id=1;
UPDATE messages         SET tenant_id=<TENANT_ID> WHERE tenant_id=1;
UPDATE leads            SET tenant_id=<TENANT_ID> WHERE tenant_id=1;
UPDATE workorders       SET tenant_id=<TENANT_ID> WHERE tenant_id=1;
UPDATE analysis_jobs    SET tenant_id=<TENANT_ID> WHERE tenant_id=1;
UPDATE tenant_llm_config SET tenant_id=<TENANT_ID> WHERE tenant_id=1;  -- 若有
-- ... 其余业务表
-- 迁移后核对:各表 tenant_id=TENANT_ID 的行数 == 迁移前 tenant_id=1 的行数
COMMIT;  -- 核对无误才 COMMIT;有误 ROLLBACK
```

**3.4 唯一键风险检查**:业务表唯一键多以 tenant_id 打头(如 conversations uk(tenant_id,platform,platform_conversation_id))。迁移是整体改 tenant_id,不会撞唯一键(因为是 1→TENANT_ID 整体平移,组合仍唯一)。但仍要确认迁移后无唯一键冲突报错。

---

## Task 4 — 插件改用租户账号 token 上报

- 插件现在用 admin 账号的 token 上报(数据落 tenant_id=1)。改成用 TENANT_ID 租户账号的 token。
- 否则拆分后新采数据又落回 admin,白迁。
- 验证:重新采集一条,确认新数据的 tenant_id = TENANT_ID(不是 1)。

> 这一步和 Task 3 的顺序:先迁历史数据(Task 3),再改插件(Task 4),然后新老数据都归 TENANT_ID。

---

## Task 5 — 验证数据归属(分入口前的关卡)

```
- 用新租户账号(TENANT_ID)登录,调业务接口(conversations/leads/workorders/analytics):
  应能看到迁移后的全部业务数据(车评老帅等历史会话都在)
- 用 admin(id=1)登录,调业务接口:应返回空(tenant_id=1 已无业务数据)
  → 这就实现了"超管看不到租户业务数据"
- 插件重新采一条,确认落到 TENANT_ID
```

**这一步通过(租户看得到、admin看不到),才能进入入口拆分。** 否则停下排查。

---

## Task 6 — 入口拆分(按登录身份过滤菜单)

采用"同一份前端、按登录身份过滤菜单"(调研方案a):

- **菜单本来就是 DB 角色权限驱动**(menuTree 按 role_has_permissions)。所以:
  - admin(超管)角色:**去掉业务页权限点**(conversation:list/lead:*/workorder:*/analytics 等),只留平台页(user/plugin/platform/role/menu/log)。
  - 租户角色(role_id=2):只有业务页权限点,没有平台页。
- 这样 admin 登录只看到平台页菜单,租户登录只看到业务页菜单。
- **前端按域名兜底**(可选增强):mychat 域名只渲染业务路由、admin 域名只渲染平台路由,双保险。
- **重申安全**:菜单过滤是视角分离;数据安全仍靠后端 tenant_id 过滤(已有)。即使有人手敲 URL,后端只返回其租户数据。

> 控制台 Dashboard 是 chat_rpa 残留(W15 问题)——本期可暂不重做,但注意:它在 admin 平台入口下,内容过时(用户/插件/设备/转人工)。W15 再处理"重做成平台运营概览"。mychat 的业务概览另算。

---

## Task 7 — 部署 mychat 域名

- Nginx 加 mychat.kongyuekeji.com 的 server 块,反代到同一个 chatsift-server(127.0.0.1:3100),复用 /api/v1。
- 配 HTTPS 证书(参考 admin 现有配置;chatsift 刚部署完,顺手)。
- 两个域名指向同一份前端构建(方案a),前端按域名/身份渲染对应入口。
- test 环境同步(test-admin + 对应 mychat-test 或复用)。

---

## Task 8 — 端到端验收

### 8.1 视角分离
```
- 访问 admin.kongyuekeji.com:超管登录,只见平台页(用户/插件/平台/角色/日志),
  无会话/线索/工单/分析入口;即使手敲 /conversations,后端返回空
- 访问 mychat.kongyuekeji.com:租户账号登录,只见业务页(会话/线索/工单/分析/聚合),
  能看到迁移后的全部业务数据;无平台管理入口
```

### 8.2 数据安全
```
- admin 登录调业务接口返回空(看不到租户数据)
- 租户登录调平台接口被拒(无权限点 403)
- 插件新采数据落 TENANT_ID
- 后端 tenant_id 过滤仍生效(手敲URL也只见自己租户数据)
```

### 8.3 不破坏现有
```
- 业务功能(五引擎/采集/分析/漏斗/提醒)照常,只是数据归属从 id=1 变 TENANT_ID
- 迁移备份已离机留存、可恢复
```

### 8.4 提交
```bash
git add server/ admin/ deploy/ docs/
git commit -m "feat(W16): split platform/tenant dual-entry (admin + mychat)

- 修 auth 补 permissions(普通用户多账号前置)
- 建独立租户账号, 迁移业务数据归属 id=1→TENANT_ID(已备份)
- 插件改用租户账号token上报
- 入口拆分: admin只留平台页/mychat放业务页(按身份过滤菜单)
- 超管看不到租户业务数据(数据迁走后自然成立)
- 数据安全仍靠后端tenant_id过滤(本就有)"
```

---

## 完成标准(验收报告 docs/reports/W16_acceptance.md)

- [ ] Task1 auth 补 permissions:role_id=2 账号能进业务页不403
- [ ] Task2 建独立租户账号(role_id=2),权限点正确(有业务页/无平台页)
- [ ] Task3 ★迁移前备份已离机+可解压★;事务迁移+行数核对一致
- [ ] Task4 插件改租户账号token,新数据落 TENANT_ID
- [ ] Task5 租户登录看得到历史数据、admin登录看不到业务数据
- [ ] Task6 菜单按身份过滤:admin见平台页/租户见业务页
- [ ] Task7 mychat 域名部署(Nginx+证书),两入口可访问
- [ ] Task8 视角分离+数据安全+不破坏现有,全部通过
- [ ] 数据迁移备份留存记录(路径+校验)

---

## 重要提示

- **最高风险=数据迁移(Task3)**:先备份+离机+验证可解压,事务+行数核对,有误ROLLBACK
- **执行顺序不可乱**:修auth→建账号→备份→迁数据→改插件→验证→才分入口
- **安全靠后端不靠前端**:菜单过滤是视角分离,数据安全靠后端tenant_id(已有);两者都要
- **超管不看租户数据**:数据迁走后 admin 自然查不到(免费成立),不需专门写禁止逻辑
- **只迁业务数据**:intent_rules tenant_id=0(全局规则)不迁;users/roles/menus等平台表不迁
- **本期不做完整多租户**:只拆"平台 vs 一个默认租户"。多租户/租户管理员/业务规则租户化等第二个租户来了再演变(数据层地基已就绪,届时基本不动)
- **W15(控制台重做/命名/下钻)仍往后排**:本期 admin 的控制台暂留(过时),W16 后再做 W15
- **流程**(W12.5重申):分步做,每步报Chase确认,尤其数据迁移前后
- **不改 chat_rpa**