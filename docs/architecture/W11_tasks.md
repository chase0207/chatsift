-----

## 文档: W11 实施任务清单 — 诊断颜色 + 快速复核
版本: v1.0.0
周次: W11
状态: Active

## 变更日志

|版本    |日期        |变更摘要|触发来源     |
|------|----------|----|---------|
|v1.0.0|2026-05-31|初版  |Claude 设计|

-----

# W11 实施任务清单(给执行端 cc / codex)

> **目标**:诊断标签+颜色(读 W10 有效性实时拼)+ 就地快速复核聊天记录
> **验收标准**:列表按主色分流(红硬伤/橙待核对/绿有效/灰无信息);点开就地看聊天记录
> **关联**:W11_design.md(先读)、W10 field_validity、W6 会话详情、W9 后台
> **本周不做**:准实时(W12)、改分析逻辑
> **核心**:W11 只读 W10 数据做翻译展示,不碰分析流水线

-----

## 前置:阅读设计

读 W11_design.md。重点:诊断标签实时拼不存表(第1节)、颜色语义和生成规则(第1.2)、主色规则红>橙>绿>灰(第1.3)、快速复核就地弹出(第4节)。

W11 不调 AI、不写业务表、不改分析引擎——只读 W10 的 field_validity 拼展示。

-----

## Task 1 — 放文档

```bash
cd ~/vscode/chatsift
cp <W11_design.md> docs/architecture/W11_design.md
cp <W11_tasks.md>  docs/architecture/W11_tasks.md
git add docs/architecture/W11_*.md
git commit -m "docs(W11): diagnosis tags + quick review"
```

-----

## Task 2 — 后端诊断标签拼装

新建 `server/src/v1/diagnosis.js`(或工具函数),实现 `buildDiagnosis(conversation)`:

```
buildDiagnosis(conv):  // 读 conv.field_validity + intent_label + lead 信息
  tags = []
  按环节生成标签(详见 W11_design 1.2):
    咨询:无信息→灰; 咨询类→橙; 投诉→红
    留资:contact valid→绿; unknown→橙; invalid→红
    预约:6字段全valid→绿; contact缺/invalid→红; pickup/time/name/city/car_type invalid→橙; unknown→橙
  每个 tag: { label, color:'danger|warning|success|info', field, reason(来自field_validity) }
  mainColor = 最严重(danger>warning>success>info)
  return { tags, mainColor }
```

铁律:

- 只读 field_validity 实时拼,不存表、不调 AI、不写业务表
- reason 直接用 W10 存的 field_validity[field].reason
- 主色规则 danger>warning>success>info,抽公共函数

-----

## Task 3 — 接口挂 diagnosis

在以下接口返回里加 diagnosis 字段(调 Task 2 的 buildDiagnosis):

- GET /api/v1/conversations(列表):每条带 diagnosis.mainColor + 简要 tags
- GET /api/v1/conversations/:id(详情):完整 diagnosis.tags
- GET /api/v1/leads(列表/详情):同样带 diagnosis

支持按主色筛选:列表接口加 query 参数 `diagnosis_color=danger|warning|success|info`,筛出对应主色的会话(给客服分流用)。

这些是只读拼装,不改写入逻辑。node –check 通过。

-----

## Task 4 — 前端列表颜色 + 筛选

改 `admin/src/views/Conversations.vue` 和 `Leads.vue`:

- 加”诊断”列或在客户名旁显示主色标记(红点/色块)
- 按 mainColor 渲染:danger 红、warning 橙、success 绿、info 灰
- 顶部筛选栏加”诊断”下拉(全部/红-硬伤/橙-待核对/绿-有效/灰-无信息),调接口的 diagnosis_color
- 鼠标悬停或点击展开显示标签组

沿用现有 Element Plus el-tag 配色(danger/warning/success/info 标准色)。

-----

## Task 5 — 前端详情页诊断标签

改 `admin/src/views/ConversationDetail.vue` 和 `LeadDetail.vue`:

- 客户档案区,每个字段显示:字段值 + 有效性颜色 tag + 理由
- 例:“上车位置:浦东新区 [橙色tag]仅区级,缺具体上车点”
- 让客服一眼看出哪个字段有问题、为什么

-----

## Task 6 — 快速复核:就地弹出聊天记录

在 Conversations.vue / Leads.vue 列表里:

- 每行加”看记录”按钮(或点诊断标签)
- 点击 → 就地弹出 el-drawer(抽屉)或 el-dialog,显示该会话聊天记录
- **不跳转**到详情页。看完关掉,接着看下一条
- 聊天记录复用 W6 详情页的消息流组件(inbound/outbound 区分),放进 drawer
- 调 GET /api/v1/conversations/:id/messages 拿消息

**加分项(时间够再做)**:drawer 里把机器抽取的字段值在原文对应位置高亮(如从”普陀区镇坪路666号”抽出 pickup,就高亮这段)。优先做”就地弹出”核心,高亮可后置。

-----

## Task 7 — 验收

### 7.1 后端

```bash
TOKEN=<login>; BASE=http://127.0.0.1:3100

# 诊断标签
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/conversations"
# 期望:每条带 diagnosis.mainColor;缺有效联系方式的→danger,地址不准→warning,全有效→success,纯寒暄→info

curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/conversations?diagnosis_color=danger"
# 期望:只返回主色红的会话

curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/conversations/<某预约会话id>"
# 期望:diagnosis.tags 含每字段诊断 + 理由(理由来自W10)
```

### 7.2 前端(Chase 配合)

- 列表:不同会话显示不同主色,缺联系方式的预约红、地址不准的橙、全有效绿、寒暄灰
- 按诊断颜色筛选:选”红-硬伤”,只看到有硬伤的
- 详情:每字段诊断标签 + 理由显示
- 快速复核:点”看记录”,就地弹出聊天记录,不跳转,关掉看下一条

### 7.3 一致性验证

```bash
# 改某会话的 W10 field_validity(如把 pickup 从 invalid 改 valid),重查诊断
# 期望:诊断颜色跟着变(证明是实时拼的,不是存的旧标签)
```

### 7.4 回归

```bash
# 重跑核心:诊断只读,不影响 W3/W7/W8/W9/W10 分析流水线
```

### 7.5 提交

```bash
git add server/ admin/
git commit -m "feat(W11): diagnosis tags + quick review

- diagnosis.js: 读W10 field_validity 实时拼诊断标签(红橙绿灰), 不存表
- conversations/leads 接口带 diagnosis.mainColor + tags, 支持按主色筛选
- 前端列表主色分流 + 详情字段诊断标签 + 理由
- 快速复核: 列表就地弹出聊天记录(drawer), 不跳转
- 诊断只读, 不碰分析流水线"
git log --oneline -10
```

-----

## 完成标准(验收报告)

> 报告写 `docs/reports/W11_acceptance.md`。

- [ ] buildDiagnosis:读 field_validity 实时拼标签,不存表不调 AI
- [ ] 颜色正确:缺有效联系方式红、地址/时间不准橙、全有效绿、纯寒暄灰
- [ ] 主色规则:多标签时取最严重(红>橙>绿>灰)
- [ ] 接口带 diagnosis,支持 diagnosis_color 筛选
- [ ] 详情页每字段诊断标签 + 理由(理由来自 W10)
- [ ] 快速复核:列表就地弹出聊天记录,不跳转
- [ ] 一致性:改 W10 有效性后诊断颜色跟着变(实时拼证明)
- [ ] 回归:不影响分析流水线
- [ ] git log W11 独立

-----

## 重要提示

- **W11 不碰分析逻辑**:诊断标签是读 W10 field_validity 实时拼的视图,不调 AI、不写表、不改引擎。守住这条,W11 才低风险
- **标签实时拼不存表**:和 W10 数据一致,W10 调整后标签自动跟着变
- **主色红>橙>绿>灰**,列表详情统一,抽公共函数
- **理由来自 W10**:诊断 reason 直接用 field_validity 存的 reason,不重新生成
- **快速复核先做”就地弹出”**,字段高亮是加分项可后置
- **沿用 W6/W7 Element Plus 风格**,用 danger/warning/success/info 标准色
- **不要改 chat_rpa**(只读参考)