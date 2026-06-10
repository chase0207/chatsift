# chatsift 项目状态(PROJECT_STATUS.md)

> 最后更新:2026-06-10
> 本文件是 chatsift 当前状态的**唯一状态源**。与任何 AI agent 沟通时,优先读/发本文件。
> 协作规矩见 AGENTS.md;发版/生产/编号细则见 docs/ops/。

---

## 项目基本信息
- 名称:多平台客服会话诊断系统(chatsift)。当前抖音单平台,V2.0 起引入多平台。
- 品牌:空月科技 KONGYUE TECH
- 定位:只读会话诊断——采集 + 五引擎分析(intent/completeness/goal/workorder/lead)+ 后台展示 + 工单/线索 + 准实时提醒。后台无发送入口,客户回复在抖音原生页面由人工做。
- 技术栈:Node.js + Express + MySQL + Vue3 + Element Plus + Chrome Extension MV3
- 本地:~/vscode/chatsift;生产:/opt/chatsift @ 124.222.146.193
- 端口:server 3100、MySQL 3306、admin dev 5173;API 前缀 /api/v1/
- 入口:admin.kongyuekeji.com(平台/超管)、mychat.kongyuekeji.com(租户/员工)

---

## 当前版本
| 模块 | 版本 |
|---|---|
| VERSION / server / admin / plugin | 0.6.2(已一致;W22 发版中) |
| tools/dom-collector | 1.0.0(独立版本线) |
| 生产 VERSION | 待部署确认(上次记录为 v0.5.0;本次 v0.6.2 发版需同步生产 VERSION) |

发版:**v0.6.2 = W22 工单中心优化**。本次范围为租户管理后台工单中心体验补丁:字段重构、类型 tab、搜索叠加、状态 inline 保存、查看记录抽屉与客户全貌。**不改 schema / 分析引擎 / 工单类型枚举 / 发送回复能力**。

**v0.6.0 = W20 + W20.1 + W21** 已形成 release commit/tag;W20 迁移与 test/prod 实际部署状态后续以生产验证记录为准。

## 当前进度 / 下一步
- 🚧 **v0.6.2 发版中(W22 工单中心优化)** — 代码已完成并按 PRD 补齐关联工单摘要;当前执行版本同步、CHANGELOG/PROJECT_STATUS 回写、tag/push 前校验。
  - ✅ **W22 PRD**:`docs/prd/V1.0/W22_workorder_center.md` 已落地,明确范围只改租户管理后台工单中心。
  - ✅ **W22 实现**:工单中心去类型/标题/查看处理;IM昵称/客户姓名/关键词/状态 inline;全部/预约/咨询/询价/投诉 tab + 计数;查看记录抽屉两列;不发送不回复。
  - ⏳ **下一步**:完成 v0.6.2 release commit/tag/push;按发版规程执行 test/prod 部署与验证,并同步生产 VERSION。
- ✅ **v0.6.0(W20 + W20.1 + W21)** — 已形成 release commit/tag。
  - ✅ **W20 采集权/查看权/账号治理**:service_accounts.lifecycle(pending/active/disabled)+ collector_id(采集权单人)+ service_account_view(查看权多人)+ 事件级采集权闸门 + heartbeat 账号级实例冲突 block + 仲裁;`collector_v1_enabled` 默认 false 启停闸门。
  - ✅ **W20.1 collect-permission 只读接口**:`GET /api/v1/service-accounts/collect-permission`(allowed/reason/lifecycle/collector_id;查看权≠采集权;internal→403)。
  - ✅ **W21 辅助采集器**:低频自动切换可见未读会话 → `collectNow` 显式采集;只走 `adapter.switchSession()`;消费 W20 采集权 + 账号级 block;人工互锁(`isTrusted` 过滤 + 切换抑制窗口);prod/test 双时间参数 profile(按 serverUrl 判档)。报告 docs/reports/W21_acceptance.md。**红线:仍只读、永不发送/输入。**
- ✅ **W19 租户资产模型 全闭环**(阶段A–E,v0.5.0 已发上线 prod+test;两层身份/scope隔离/service_account 采集归属/conversation_id/admin租户管理/mychat首页)。报告 docs/reports/W19_stage{A,B,CD,E}_acceptance.md。
- ✅ **W17 阶段一**(消息位置标识 本地层)随 v0.5.0 一起发。
- ⛔ **W17 阶段二(云端对账)= 取消/交 codex**,不在 chatsift 本线推进。
- **下一步**:完成 v0.6.2 发版提交/tag/push → test/prod 部署验证 → 回写生产同步状态。

### 待排期(backlog,非进行中)
- **M16 users.role 收口**:代码已统一走 role_id/user_type,fresh schema 已无 `users.role`;既有环境物理 DROP 需在对应环境部署含 M16 的新代码后,由用户在场执行。
- **data_scope 命名澄清**:`utils/data-scope.js` 目前仅用于 plugin/logs 的 user 级授权,不是租户隔离模型;如清理,先做文档/命名澄清,不要顺手改逻辑。
- **技术债清理周**:M22/M23/U3 + M4/M5/M7-M12/M14/M17-M20 死代码。
- **未定功能方向**:W20 租户自助管理(成员/菜单/权限)、价格表导入(M1 空壳)、W13 聚合视图、laike/feige 多平台采集。

---

## 发版记录
| 版本 | tag | 时间 | 关联 W | 范围 | 备注 |
|---|---|---|---|---|---|
| v0.6.2 | v0.6.2 | 06-10 | **W22** | server+admin+docs | 工单中心字段重构、类型 tab、状态 inline 保存、查看记录抽屉;不改 schema/引擎/枚举/发送回复 |
| v0.6.0 | v0.6.0 | 06-09 | **W20+W20.1+W21** | server+admin+plugin+迁移 | 采集权/查看权治理 + collect-permission 只读接口 + 辅助采集器 |
| v0.5.0 | v0.5.0 | 06-07 | **W17+W19** | server+admin+plugin+迁移 | 消息位置标识 + 租户资产模型(两层身份/scope隔离/service_account/采集归属/conversation_id);一次清库重采 |
| v0.3.1 | v0.3.1 | 06-03 | **W16** | server+admin+plugin | 登录域名限制(内部/外部按域名分入口) |
| v0.3.0 | v0.3.0 | 06-03 | **W16** | server+admin+plugin | 平台/租户双入口拆分(admin+mychat)首发 |
| v0.2.12 | v0.2.12 | 06-03 | 昵称修复链 | server+admin | 聚合条目展示最后消息+相对时间 |
| v0.2.9~11 | — | 06-03 | 昵称修复链 | — | 客户昵称误读修复(插件/server/工单) |
| v0.2.5/6 | — | 06-02 | **W13** | admin | 消息聚合三栏 + 多平台切换 |
| v0.2.0~8 | — | 06-02 | W1-W12 基线 | 全栈 | 从 chat_rpa 初始化 + 早期功能(无明确W) |

> 完整 tag↔W 对应见 docs/ops/versioning.md;历史依据见 docs/research/2026-06-04_版本与编号现状核实.md。

---

## 生产环境状态
| 项 | 状态 |
|---|---|
| 平台入口 | https://admin.kongyuekeji.com/ ✓ |
| 租户入口 | https://mychat.kongyuekeji.com/ ✓ |
| 部署目录 | /opt/chatsift(rsync 部署,非 git) |
| server | Docker,127.0.0.1:3100 |
| 数据库 | Docker MySQL |
| 当前生产版本 | 待部署确认(上次记录为 v0.5.0;本次准备发布 v0.6.2) |
| v0.6.2 验证 | 待 test/prod 部署后回写 |
| 待办 | 发版时同步生产 VERSION;M16 既有环境物理 DROP `users.role`:代码已收口;test/prod/dev 需先确认已部署含 M16 的新代码,再由用户在场执行 deploy/m16_drop_users_role.sql |

---

## 进度

### 已完成
- MVP 主线 W0-W12 + 修复 W4.5/W6.5/W12.5/W12.6
- W13 消息聚合展示(Aggregate.vue)
- W14 dom-collector 选择器调研工具(tools/dom-collector/)
- W16 平台/租户双入口拆分 ✓ 闭环(零迁移方案 + 生产验证通过)
- **W17 阶段一 消息位置标识**随 v0.5.0 已发布上线;M1 关闭(见 docs/reports/W17_acceptance.md)
- **W19 租户资产模型**阶段A-E全闭环,随 v0.5.0 已发布上线
- **W20 + W20.1 + W21** 已形成 v0.6.0 release commit/tag
- **W22 工单中心优化** 已进入 v0.6.2 发版
- M3 git 整理(合并 push、生产 VERSION 修正、未跟踪文件归位)
- 文档治理:AGENTS.md + docs/ops/(release/prod-safety/versioning)+ 本文件 + CHANGELOG

### 进行中
- **v0.6.2 发布收口**(W22 工单中心优化,详见「当前进度 / 下一步」)。

### 待办(技术债,见 tech-debt-master-plan)
- **W17 阶段二:云端对账**——已取消/不在 chatsift 本线推进。
- ~~**W20** 采集权/查看权分离~~ — ✅ 已实现并本地验收(W20+W20.1),纳入 v0.6.0。
- 清理周:M4/M5(死代码,随 W17 顺手清碰到的)+ M6-M9
- M10-M13:性能/词表/正则/方向复核
- M14/M15-M17:价格表(业务定)/ user_type / data_scope(演变时)
- M18/M19/M20/M21:api-spec / DEPLOY落地 / api域名000 / W15后台UI理顺
- 编号规范专项:本次已落地 docs/ops/versioning.md

### 已搁置
- W18 AutoScanner(夜间自动巡检):碰"主动操作页面"边界,搁置。夜间对话诊断改用"员工早上在岗采集 + 五引擎分析"满足。

---

## 关键决策口径(贯穿)
- 采集:纯 DOM + 合成 message_id,放弃网络拦截(W4)。
- conversation_id = platform+page+nickname(W6.5)。
- intent:最近20条 inbound 排 outbound(W12.5);completeness:全量 inbound 按有效字段占比。意图优先级:投诉>问价>预约>咨询。
- 租车预约6字段:姓名/城市/时间/联系方式/上车位置/车型。
- 字段有效性三态(W10);诊断颜色实时拼不存表(W11)。
- W16 数据隔离:后端 tenant_id 强制过滤(已有,无越权);零迁移(admin 名下纯测试数据)。
- W17:position 统一身份+顺序;outbound occurred_at=NULL;段间按时间条、段内按 position;清空重采。

---

## 变更日志
| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.4.0 | 2026-06-10 | W22 工单中心优化进入 v0.6.2 发版;同步 v0.6.0 已形成 release commit/tag,修正此前 v0.6.0 准备中旧口径 |
| v1.3.0 | 2026-06-09 | W20+W20.1+W21 本地+真机验收通过,进入 v0.6.0 发布准备(未 merge/未 bump/生产仍 v0.5.0);下一步 test 预发→prod |
| v1.2.0 | 2026-06-07 | 对齐 v0.5.0/W17+W19 已发布状态;清理旧生产 v0.3.1、W19 调研中、W17 阶段二待做等冲突口径 |
| v1.1.0 | 2026-06-05 | W17 阶段一闭环已合并 main(3486c12,未发版/未碰生产);M1 关闭;W19 调研中;阶段二排 W19 后 |
| v1.0.0 | 2026-06-04 | 初版:唯一状态源建立(版本/发版记录/生产状态/进度/决策口径) |
