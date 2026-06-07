# 工作交接文档 — Claude(架构) → codex

> 日期: 2026-06-07　交接人: Claude(架构/第二视角)　接手人: codex
> 落位: docs/reports/　性质: 交接(项目状态 + 协作要点 + 当前盯点)
> 用途: codex 接手 chatsift 的架构/监督角色,本文档传递这一路的关键上下文,避免丢失决策与教训。

---

## 0. 一句话现状
chatsift(多平台客服会话只读分拣系统)已上线 **v0.5.0**(W17阶段一 + W19 全程)。当前**无进行中开发**,目标:**清债 → W20**。本月不推广用户(还债窗口)。

---

## 1. 项目核心(不可动摇的底线)
- **产品红线(已降级为"提醒",但仍是默认)**:永不发送/Observe First——后台只读,无发送入口,不主动操作抖音页面。后续业务可能变,但默认守此。
- **用户原则**:稳定、安全是底线(非"越简单越好");长期主义;做正确的事;错误立即纠正,不因"已写了/改着麻烦"将就。
- **让纠正发生在低成本阶段**:重改动先出方案、schema改前报、不可逆操作人在场——这些关卡是为了让错误在 diff/方案阶段(便宜)暴露,而不是上线后(昂贵)。

---

## 2. 协作结构(现状)
- **Chase**:产品负责人,非技术背景,看不了代码,最终决策 + 不可逆操作的"go"权。所有指令经 Chase 路由。
- **CC1**:主力开发,唯一写代码的 agent(单 agent 单分支)。这一路表现稳:边界清、主动 flag 风险、该停就停、grep/查代码扎实。
- **CC2**:技术总监/审查(出方案/review),只读+写docs,不碰功能分支代码。
- **codex**(接手中):W20 已由 codex 审定;清债监督 + 后续架构/第二视角交给 codex。
- **CC3**:产品经理角色(处理文档管理规范等)。
- **Claude(我,移交中)**:原架构/第二视角,因读不了代码(需 Chase 复制中转),逐步移交 codex。

### 协作铁律(AGENTS.md v1.2.0)
1. 开工前置(声明身份/环境,git status干净)
2. 默认不碰生产
3. **变更分类 A/B/C**:A=实现细节(自主)/B=触及设计意图(停下报)/C=跨周次或动数据契约(停下,先报diff/方案)
4. **重改动先出技术方案,审了再写代码**(C类/地基/数据契约):DEV先出方案(精确DDL/代码改法/受影响调用点,查真实代码)→ Chase+审查者审 → 才写代码。小改(A类/可逆)不强制走方案层。
5. **写代码单 agent 单分支**(功能分支只属做它的agent;治理文档放main;别人不碰功能分支)
6. 改完即提交
7. 发版权收口(QA身份/用户)
8. 高风险操作停下报用户(数据迁移/清空/删除/push生产/部署:执行端准备+备份+演练,停最后一步,用户在场)
9. 模型切换/上下文压缩后,重新确认环境

### 提速规则(近期定,平衡速度与安全)
- 批量过:A类直接做+验收说明;简单C类按task批量报diff(不碎报)
- 守硬关卡(单独审,先报diff/方案):改数据契约/schema、清库、发版、安全逻辑(权限/隔离/越权)、已验收代码
- 判断标准:错了能否轻易回退?能(代码,git兜底)→批量过;不能(数据/上线/安全)→守关卡人在场

---

## 3. 已完成(上线 v0.5.0)
### W17 阶段一(消息位置标识)
- position(纯位置,锚点窗口算法,虚拟列表幂等真机验证0重复)+ 不存假时间(outbound occurred_at=NULL/inbound精确)+ 重复连发都保留 + segment_at段间排序。
- message_id = syn_hash(conversationId|position)。关闭 M1。

### W19(租户资产模型,五阶段A-E全闭环)
- **两层身份**:user_type(internal/external,系统级,解决M15)+ role(租户级:平台管理员/租户超级管理员/客服,解决M16)。内部用户=user_type=internal、tenant_id=NULL,不是roles里的角色。
- **客服账号资产**:account_biz_id(=URL accountId,商家账号稳定键,实测换客户/换坐席不变)+ account_nickname(坐席昵称,改名靠人工校正)。三表:tenants/service_accounts/employee_service_account。
- **conversation_id 纳入 account_biz_id**(跨账号同名客户不误并;坐席不进=换坐席不分裂会话)。
- **scope helper(A4)**:★fail-closed 正向枚举——internal→1=0(显式选租户才查)/tenant_admin→本租户全部/agent→分配账号集/else→1=0(未知角色一律拒绝)。判据用 role_code(platform_admin/tenant_admin/agent,比role_id常量稳、比中文name稳),不用data_scope。
- **采集归属**:首次采集自动绑定(限客服角色)+ 管理员可重分配;缺account_biz_id放行留NULL(不拒不写unknown);拒绝internal上报。
- v0.5.0 已发 prod+test,E5真机三类角色隔离验收通过。

### 还债(刚完成)
- **M16 第二步**:DROP users.role(去authController 9处读+userController 2处写,本地已DROP,commit 9774bea/9774... 实际见git)。★旧token(带role)验证不失效。
- **data_scope 评估**:维持现状(评估论证:data_scope全是用户级所有者授权plugin/logs,非租户隔离;E1已闭唯一隐患;不该清,清了破坏平台方看全部plugin/logs)。

---

## 4. ★当前盯点(codex 接手要立即关注)
### 4.1 main 领先 prod(隐性待办)
- main 现含 M16(去role+DROP代码)+ data_scope评估,**prod 还是 v0.5.0(带role读写的旧代码)**。
- **prod 的列 DROP 必须在"含M16的新版本部署到prod之后"才能跑**(先DROP会让旧代码因列不存在报错)。
- deploy/m16_drop_users_role.sql 已建,注释标了顺序。prod DROP = 含M16新版本部署后 + Chase在场。

### 4.2 清债监督(交给codex)
CC1 正/将做技术债清理周。盯点:
- **纯死代码删除**(M4/M5/M7-M12/M14/M17-M20):A类,放开批量删,删完批量报验收(确认无误删LIVE代码即可),不逐个审。
- **U3**(diagnosis_color 全表扫描无LIMIT):★这是性能/规模问题,改它动查询逻辑=C类,要审(不是纯删死代码)。
- **M22**(schema基线与dev副本易漂移):涉及schema同步机制,小心。历史教训:基线v1-schema与dev init副本多次漂移,改动要两处一致。
- **M23**(position-tracker序列无上限):看具体改法定A/C类。
- 监督原则:死代码批量放开;动逻辑/schema的(U3/M22)守关卡审。

### 4.3 W20(codex已审定,等CC1)
- W17二阶段(云端对账)已彻底取消,升级为W20新方案(产品+技术+实施,codex已审)。
- W18 已取消。
- CC1清债告一段落 → 接W20。
- ★若W20涉及采集权/租户/conversation_id等地基,守方案层+关键审(地基快不得)。

---

## 5. 文档管理规范(CC3处理中,codex知晓)
分类:① 代码 ② 设计方案docs/prd ③ 调研docs/research ④ 报告docs/reports ⑤ 项目级(AGENTS/CLAUDE留根目录;PROJECT_STATUS/CHANGELOG/技术债总纲→docs)。
命名:活文档固定名+版本号+changelog(不带日期);调研/报告快照=YYYY-MM-DD_主题_描述。
整理只移动/改名/合并,不重写内容、找不到标"缺"、废弃文档标记不删。

---

## 6. 关键决策与教训(避免重蹈)
- **地基性设计先查成熟实践,不凭直觉**:user_type两层模型一开始Claude说"不用加",后查业界多租户实践才确认该加(系统级type+租户级role分离)。教训:身份/权限/租户这类地基,查实践再定。
- **第二视角的建议要过"已验证事实"关**:曾有"lifeAccountId=单个客服"的伪核实(被Chase真机实测证伪);codex曾建议"唯一键去昵称"(基于"accountId是坐席级"的错误前提,实测是商家账号级)。教训:任何建议(包括架构的)都要过实测事实,不盲从单一来源。
- **git状态以实际为准,不凭记忆**:Claude曾误判"总纲已在main"让CC1 revert,实际总纲从没在main、那次revert删了唯一副本(后从历史恢复)。教训:git状态以CC1查到的实际历史为准。
- **fail-closed**:权限/隔离的失败方向必须是"拒绝"不是"放行"。R1曾是fail-open(default分支让未知角色看本租户全部),改成正向枚举+else 1=0。
- **NULL-in-uk**:唯一键含可空列会让唯一性失效(MySQL多NULL可重复)。service_accounts.page_id因此设NOT NULL。
- **稳定标识必须来自稳定数据**:conversation_id/message_id不能用DOM随机class;account_biz_id用URL的accountId(实测稳定)。
- **多视角接盲区**:这一路靠"Chase实测+架构出方案+审查者独立审+CC1摸真实代码"接住了多个盲区(W18红线/伪核实/type模型/R1 fail-open/page映射断层/NULL-in-uk)。codex接手后,保持"出方案者≠审方案者"的独立性。

---

## 7. 技术债状态(M编号唯一真源 = docs/research/tech-debt-master-plan.md)
- ✅关闭:M1(消息位置)/M3/M6/M13/M15(user_type)/M16(role双轨,字段已删)
- 🔄清理周待:M22(schema漂移)/M23(position序列无上限)/U3(全表扫描无LIMIT)/M4/M5/M7-M12/M14/M17-M20(死代码)
- data_scope:维持现状(评估定性用户级授权,非债)

---

## 8. 环境/基础设施
- 本地 ~/vscode/chatsift;生产 /opt/chatsift @124.222.146.193(★非git仓库,部署用rsync不是git pull);test /opt/chatsift-test@3101。
- 端口:server 3100/MySQL 3306/admin dev 5173;API前缀/api/v1/。
- 入口:admin.kongyuekeji.com(平台/超管)、mychat.kongyuekeji.com(租户/员工)。
- 数据源:抖音来客私信(DOM采集,W4放弃网络拦截)。
- 部署口径:rsync(server-access.md v1.1.0已定)。
- prod当前v0.5.0,无真实用户数据(本月不推广)。

---

## 9. 给codex的交接要点(总结)
1. **立即关注**:main领先prod(M16代码),prod列DROP要等新版本部署后+Chase在场(§4.1)。
2. **当前任务**:监督CC1清债(死代码批量放开/U3·M22守关卡审,§4.2)→ 接W20(§4.3)。
3. **守住**:协作铁律(AGENTS v1.2.0)+ 提速规则 + 不可逆操作Chase在场。
4. **保持独立第二视角**:出方案者≠审方案者;建议过实测事实关;git以实际为准。
5. **底线**:稳定安全;长期主义;错误立即纠正不将就。
6. **Chase是最终决策 + go权**;CC1是唯一写代码agent(单agent单分支)。

交接完成。codex 接手 chatsift 架构/监督角色。
