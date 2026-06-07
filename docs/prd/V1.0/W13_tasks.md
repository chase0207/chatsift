---
文档: W13 实施任务清单 — 消息聚合展示
版本: v1.0.0
周次: W13
状态: Active
---

## 变更日志

| 版本 | 日期 | 变更摘要 | 触发来源 |
|---|---|---|---|
| v1.0.0 | 2026-06-02 | 初版 | Claude 设计 |

---

# W13 实施任务清单(给执行端 Claude Code)

> **目标**:新增一个纯只读的三栏"消息聚合展示"页面,一屏看全一个客户(对话+字段诊断+lead+工单)
> **验收标准**:三栏正常聚合;全程只读无任何发送入口;复用 W6/W10/W11/W12.6 数据
> **关联**:W13_design.md(先读)、W6消息、W10字段、W11诊断、W12.6时间、W7lead
> **本周不做**:任何发送功能、新分析逻辑
> **前置**:确认 W12.6 已收口(精确时间真实验证达标),否则中栏对话时间还是乱的

---

## 前置:阅读设计 + 确认红线

读 W13_design.md。重点:**纯只读无发送入口(第1节,红线)**、三栏布局(第2节)、数据全部复用已有(第3节)、新增独立页面不改旧页(第4节)。

W13 不调 AI、不写业务表、不加分析、**绝不加任何发送/回复入口**。它是把已有数据组装成三栏展示。

---

## Task 1 — 放文档

```bash
cd ~/vscode/chatsift
cp <W13_design.md> docs/architecture/W13_design.md
cp <W13_tasks.md>  docs/architecture/W13_tasks.md
git add docs/architecture/W13_*.md
git commit -m "docs(W13): message aggregation view design + tasks"
```

---

## Task 2 — (可选)聚合接口

判断要不要做聚合接口:
- 数据量小 → 前端并发调现有接口(conversations/:id、messages、leads、workorders),不新增接口
- 想省请求 → 新增 GET /api/v1/conversations/:id/aggregate,一次返回:
  ```
  { conversation, messages(latest N), diagnosis(W11), lead(W7), workorders(关联) }
  ```
  只读聚合查询,复用各引擎已有的取数逻辑,不新增分析。租户隔离。

建议:先用前端并发现有接口实现(简单、不新增后端),如果实测请求多/慢再做聚合接口。

注意:别触发 SPEC_GAP U3 提到的 diagnosis_color 全表内存过滤隐患——单客户聚合是按 conversation_id 精确查,数据量小,没这个问题。

---

## Task 3 — 新页面 + 三栏布局

新增 `admin/src/views/Aggregate.vue`(或 MessageAggregate.vue),路由 `/aggregate`,菜单加"消息聚合"(**不叫工作台**)。

三栏布局(Element Plus el-container 或 flex):
```
左(固定宽,如 320px):会话列表
中(自适应):消息流
右(固定宽,如 360px):客户全貌
```

---

## Task 4 — 左栏:会话列表

- 复用会话中心列表逻辑(精简版):客户昵称 + 诊断主色点 + 意图 + 阶段 + 完整度
- 保留 W11 诊断颜色筛选 + W12.6 页面/昵称/消息搜索
- 点某行 → 触发中栏+右栏加载该 conversation 的数据
- 高亮当前选中行
- 调 GET /api/v1/conversations(已带 diagnosis.mainColor)

---

## Task 5 — 中栏:消息流(只读)

- 复用 W6/W11 MessageDrawer 的消息流展示(这里是常驻栏不是抽屉)
- inbound/outbound 左右区分;时间用 W12.6 精确时间;默认滚到最新(latest=1)
- 调 GET /api/v1/conversations/:id/messages?latest=1
- **关键:中栏顶部/底部都不要任何输入框、发送按钮、回复区**。纯展示对话历史
- (加分)点右栏字段 → 中栏滚动定位并高亮该字段抽取的原文消息

---

## Task 6 — 右栏:客户全貌

聚合展示(全部只读):
- **字段诊断**:6 字段(姓名/城市/时间/联系方式/上车位置/车型),每个 值 + 有效性颜色 tag + 理由。数据来自 GET /conversations/:id 的 field_validity / diagnosis
- **诊断标签组**:W11 的红/橙/绿/灰标签
- **lead 信息**:等级 + 评分 + 阶段。调 GET /leads(按 conversation 关联)
- **意图 / 完整度**
- **关联工单**:该客户的工单(只读列表,点开看详情可跳工单中心;**不在右栏改工单状态**)。调 GET /workorders(按 conversation 筛)

---

## Task 7 — 验收

### 7.1 功能(Chase 配合看界面)
```
- 新页面三栏:左列表、中消息流、右客户全貌
- 点左栏客户 → 中栏显示完整对话(精确时间、默认看最新)、右栏显示字段诊断/lead/工单
- 右栏 6 字段值+颜色+理由,和 W10/W11 一致
- 诊断标签、lead 等级、关联工单正确聚合
- 筛选/搜索保留(W11 诊断色 + W12.6 搜索)
- (加分)点右栏字段→中栏高亮原文
```

### 7.2 红线验证(必查)
```
- 整个页面通查:没有任何 <input>/<textarea> 用于回复、没有"发送"按钮、没有回复区
- 代码层面:W13 没引入任何调用 adapter 发送方法的代码、没新增发送相关接口
- send_runtime_v19 仍默认 false(OPS §4 红线卡点)
```

### 7.3 回归
```
- W13 只读聚合,不影响 conversations/messages/leads/workorders/analytics 各页
- 会话中心/工单/线索各页照常(W13 是新增不是改造)
- 不调 AI、不写业务表(查 token 不变)
```

### 7.4 提交
```bash
git add admin/ server/ docs/
git commit -m "feat(W13): read-only message aggregation view

- 新增三栏聚合页(左会话列表/中消息流/右客户全貌), 纯只读无发送入口
- 中栏复用W6/W11/W12.6消息流(精确时间, 默认看最新)
- 右栏聚合W10字段诊断/W11诊断标签/W7lead/关联工单
- 数据全部复用现有接口, 不新增分析, 不写业务表
- 红线: 全程只读, 无任何回复/发送入口"
git log --oneline -10
```

---

## 完成标准(验收报告)

> 报告写 `docs/reports/W13_acceptance.md`。

- [ ] 新页面三栏布局,点左栏客户中右栏联动刷新
- [ ] 中栏消息流:精确时间、inbound/outbound 区分、默认看最新
- [ ] 右栏:6字段诊断(值+色+理由)、诊断标签、lead、关联工单 正确聚合
- [ ] **红线:整个页面无任何输入框/发送按钮/回复入口(必查必报)**
- [ ] 筛选搜索保留;数据复用现有接口不新增分析
- [ ] 回归:现有各页照常,W13 是新增非改造,不调 AI 不写表
- [ ] git log W13 独立

---

## 重要提示

- **红线第一:纯只读,无任何发送入口**。W13 长得像"工作台"最易踩线,实现和验收都专门查"没有任何回复/发送入口"。命名叫"消息聚合"不叫"工作台"
- **纯展示不新增分析**:只聚合 W10字段/W11诊断/W7lead/W6消息/工单,不调AI、不写表、不加分析(同 W11 低风险)
- **复用而非重写**:中栏复用消息流组件、右栏复用诊断、左栏复用会话列表。W13 是"组装"
- **新页面并存**:不改造会话中心等旧页,W13 是新增视图
- **前置确认 W12.6 收口**:中栏精确时间依赖 W12.6 真实验证达标
- **工单只读**:右栏工单点开可跳工单中心看详情,不在聚合页改工单状态
- **沿用 Element Plus**,三栏用现有布局,诊断用标准色
- **不要改 chat_rpa**(只读参考)
