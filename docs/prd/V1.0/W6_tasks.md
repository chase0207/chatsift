-----

## 文档: W6 任务 — 后台页面:会话中心 + 工单中心(含阶段一盘点 + 阶段二开发)
版本: v1.1.0
周次: W6
状态: Active

## 变更日志

|版本    |日期        |变更摘要                                                                                       |触发来源        |
|------|----------|-------------------------------------------------------------------------------------------|------------|
|v1.1.0|2026-05-31|盘点回报后填充阶段二:会话/工单两页开发清单(沿用 Element Plus 现有风格);灰色遮罩确认为浏览器扩展非代码问题;dashboard 500 挂起 W9;新增品牌文案替换|阶段一盘点 + 用户决策|
|v1.0.0|2026-05-31|初版,阶段一盘点 admin 脚手架可运行状态                                                                    |Claude 设计   |

-----

# W6:后台页面 — 会话中心 + 工单中心

> **范围(已定)**:本周做两个核心页面 —— 会话列表+详情、工单列表+处理。仪表盘/运营分析放 W9。
> 
> **背景**:这是 chatsift 第一次做前端。admin 脚手架是 W0 从 chat_rpa 迁移来的(Login / Layout / router / store / axios 等),但迁移后从未真正运行验证过。参考插件侧经验(W4 暴露 background.js 缺失、端口写成 3000 等迁移欠债),admin 这侧大概率也有没跑通的问题。
> 
> **所以分两步**:阶段一先盘点 admin 脚手架的真实可运行状态,回报后 Claude 出阶段二页面开发清单。**阶段一只盘点 + 让脚手架能跑起来登录,不写业务页面。**

-----

## 阶段一:盘点 admin 脚手架 + 打通登录

目标:确认 admin 能 npm install、能启动、能登录、登录后能调通至少一个 /api/v1 接口。把这条”前端到后端”的链路打通,W6 阶段二才能在上面加页面。

### Inv Task 1 — 盘点 admin 目录结构与依赖

```bash
cd ~/vscode/chatsift/admin
# 目录结构
find src -type f | sort
# 依赖与脚本
cat package.json
# 构建配置
cat vite.config.js 2>/dev/null || cat vue.config.js 2>/dev/null
```

回报:admin 现有哪些文件、package.json 的依赖和 scripts、构建工具是 Vite 还是别的。

### Inv Task 2 — 盘点 axios / 接口基址配置

参考插件侧”端口写成 3000”的坑,重点查 admin 调后端的基址配置:

```bash
grep -rn "3000\|3100\|baseURL\|axios\|VITE_\|/api" src/ --include="*.js" --include="*.vue" | grep -iv "node_modules" | head -40
cat src/utils/axios.js 2>/dev/null || cat src/utils/request.js 2>/dev/null || echo "未找到 axios 封装"
# 环境变量文件
ls -la .env* 2>/dev/null
cat .env 2>/dev/null; cat .env.development 2>/dev/null
```

回报:admin 当前请求基址指向哪里(是不是还指向 chat_rpa 的 3000)、有没有 .env、token 怎么带。

### Inv Task 3 — 盘点路由与登录态

```bash
cat src/router/index.js
# 登录页和鉴权守卫
grep -rn "beforeEach\|requiresAuth\|token\|login\|Login" src/router/ src/store/ --include="*.js" | head -30
cat src/store/*.js 2>/dev/null | head -60
```

回报:现有路由表(哪些页面已有)、登录守卫逻辑、token 存取方式。

### Inv Task 4 — 盘点已迁移的页面和组件

```bash
ls -la src/views/
ls -la src/components/
# Layout / 菜单
cat src/components/Layout.vue 2>/dev/null | head -40 || find src -name "*ayout*" -o -name "*Menu*" | head
```

回报:哪些 .vue 页面已迁移过来、Layout 和侧边菜单是什么结构(W6 加新页面要往菜单里挂)。

### Inv Task 5 — 尝试启动并登录(打通链路)

```bash
cd ~/vscode/chatsift/admin
npm install
npm run dev
# 期望:能起一个本地端口(如 5173)
```

然后在浏览器:

1. 访问 admin 本地地址,确认能看到登录页
1. 用测试账号登录(admin / 对应密码)
1. 确认登录后能进入后台主界面(哪怕是空的)
1. 打开浏览器 Network,确认登录请求打到了 chatsift 的 3100(不是 chat_rpa 的 3000)

**如果这一步有任何卡点**(install 报错、起不来、登录 404/500、请求打错端口、CORS),如实记录,这些就是 admin 脚手架的迁移欠债,阶段一要把它们修通(改基址、补 .env、修 CORS 等)。修通登录链路属于阶段一范围。

### Inv Task 6 — 确认后端 CORS 放行 admin

W6 admin 跑在 5173(或别的端口),要调 3100 的后端,确认后端 CORS 允许:

```bash
grep -rn "cors\|Access-Control\|origin" ~/vscode/chatsift/server/src/ | head
```

回报:后端 CORS 当前配置,admin 的端口是否被放行。如未放行,阶段一补上。

### 阶段一回报格式

写成 `docs/reports/W6_inventory.md`,含:

1. Inv Task 1-6 的关键输出
1. **admin 脚手架可运行性结论**:能否 install / 启动 / 登录 / 调通 3100
1. 为打通登录链路做了哪些修复(改端口、补 .env、修 CORS 等)——这些属于 A 类调整,记录即可
1. 现有路由表 + 菜单结构(阶段二加页面要用)
1. 任何卡点和未解决项

**回报后停下,等 Claude 给阶段二页面开发清单。阶段一不写业务页面(会话/工单页)。**

-----

## 阶段二:开发会话中心 + 工单中心(Claude 据盘点填充)

## 阶段二:开发会话中心 + 工单中心(已据盘点确认)

> **盘点结论**:admin 脚手架可用(install/dev/build/登录/CORS/调通 /api/v1 全过)。登录后的”灰色遮罩”已确认是**浏览器扩展**所致(非 chatsift 代码问题),关掉该扩展即可,本周不处理。dashboard/stats 的 500(老表 message_logs)**挂起到 W9**,本周不碰。
> 
> **本周做**:会话列表+详情、工单列表+处理,挂到已有菜单项,顺带改品牌文案。
> 
> **风格铁律**:新页面**沿用现有 admin 的 Element Plus 风格**,和 Users.vue / Roles.vue / Platforms.vue 保持一致(同样的 el-table + el-form + 卡片布局 + 分页)。这是企业内部运营后台,一致性和可用性优先,不要另起炫酷设计。新页面打开后应该让人觉得”和其他页面是一套的”。

### Dev Task 1 — 参考现有页面,定下统一写法

开工前先读一个现有页面作为模板:

```bash
cat ~/vscode/chatsift/admin/src/views/Platforms.vue
cat ~/vscode/chatsift/admin/src/views/Users.vue
cat ~/vscode/chatsift/admin/src/utils/request.js
```

确认现有页面的统一写法:怎么用 request.js 发请求、怎么用 el-table 渲染列表、怎么做分页、怎么用 el-tag 显示状态。新页面照这个套路写,不要发明新写法。

### Dev Task 2 — 新增 API 封装

在 `admin/src/api/` 下新建两个文件,沿用现有 api 文件的写法(参考 src/api/platforms.js):

`admin/src/api/conversations.js`:

```javascript
import request from '../utils/request'
export const listConversations = (params) => request.get('/v1/conversations', { params })
export const getConversation   = (id)     => request.get(`/v1/conversations/${id}`)
export const getMessages       = (id)     => request.get(`/v1/conversations/${id}/messages`)
```

`admin/src/api/workorders.js`:

```javascript
import request from '../utils/request'
export const listWorkorders   = (params)      => request.get('/v1/workorders', { params })
export const getWorkorder     = (id)          => request.get(`/v1/workorders/${id}`)
export const updateWorkorder  = (id, data)    => request.patch(`/v1/workorders/${id}`, data)
export const assignWorkorder  = (id, data)    => request.post(`/v1/workorders/${id}/assign`, data)
```

注意:request.js 的 baseURL 是 `http://127.0.0.1:3100/api`,所以这里路径写 `/v1/conversations`(拼出来是 `/api/v1/conversations`)。

### Dev Task 3 — 会话列表页 Conversations.vue

新建 `admin/src/views/Conversations.vue`。沿用 Platforms.vue 的结构。

页面元素:

- 顶部筛选栏(el-form inline):平台下拉(douyin)、意图下拉(simple_inquiry/appointment/complaint/price_inquiry)、阶段下拉(new/collecting/completing/done)、关键词输入框、查询/重置按钮
- el-table 列:客户昵称、平台、平台页面、意图标签(用 el-tag,不同意图不同颜色)、当前阶段、完整度(用 el-progress 或百分比)、消息数、最后消息时间
- 意图标签配色建议:complaint=danger(红)、price_inquiry=warning(橙)、appointment=success(绿)、simple_inquiry=info(灰)
- 每行一个”查看”按钮 → 跳转会话详情(路由 /conversations/:id)
- 底部 el-pagination 分页,对接接口的 page/page_size/total

数据对接:调 `listConversations(params)`,params 含筛选条件 + 分页。返回结构按 v1-api-spec:`{ code:0, data:{ list, total, page, page_size } }`。

### Dev Task 4 — 会话详情页 ConversationDetail.vue

新建 `admin/src/views/ConversationDetail.vue`。路由 `/conversations/:id`。

页面元素:

- 顶部:返回按钮 + 会话基本信息卡片(客户昵称、平台、意图标签、阶段、完整度)
- 主体:消息流(类似聊天界面)。调 `getMessages(id)` 拿消息列表,按 occurred_at 升序
  - inbound(用户)消息靠左,outbound(客服)消息靠右,用不同底色区分
  - 每条显示:发送者昵称、内容、时间
  - 这个不用做得像真聊天软件那么花,el-card 或简单的左右对齐 div 即可,清晰能读就行
- 如果该会话关联了工单,显示工单入口(可选,看 getConversation 返回里有没有 workorder 信息)

### Dev Task 5 — 工单列表页 Workorders.vue

新建 `admin/src/views/Workorders.vue`。沿用 Platforms.vue 结构。

页面元素:

- 筛选栏:工单类型下拉(inquiry/appointment/complaint/pricing)、状态下拉(pending/assigned/processing/done/cancelled)、优先级下拉、是否超时(overdue)、查询/重置
- el-table 列:标题、类型、优先级(用 el-tag,priority=1 红色最显眼)、完整度、状态、SLA 截止时间、创建时间
- 优先级配色:1=danger、3-4=warning、5=info
- 超 SLA 的行高亮(可用 el-table 的 row-class-name 给超时行加红色背景)
- 操作列:“查看/处理”按钮 → 打开工单处理弹窗(el-dialog)
- 底部分页

### Dev Task 6 — 工单处理弹窗

在 Workorders.vue 里加一个 el-dialog 做工单处理:

- 打开时调 `getWorkorder(id)` 展示工单详情:payload(结构化字段,如预约的城市/时间/联系方式)、suggestion(报价建议等)、关联会话
- 提供状态变更:下拉选新状态 + 确认 → 调 `updateWorkorder(id, { status })`
- 提供派单(可选):选负责人 → 调 `assignWorkorder(id, { assigned_to })`。如果用户列表不好拿,W6 派单可以先只做”状态变更”,派单留到后面
- 处理成功后刷新列表

### Dev Task 7 — 路由 + 菜单挂载

盘点发现 DB 菜单已有”会话中心”“工单中心”条目,MainLayout 从 `/api/menus/tree` 动态渲染菜单。所以:

1. 在 `admin/src/router/index.js` 加三条路由(沿用现有路由的 meta/权限写法):
- `/conversations` → Conversations.vue(meta requiresAuth,权限 conversation:list)
- `/conversations/:id` → ConversationDetail.vue
- `/workorders` → Workorders.vue(权限 workorder:handle)
1. 确认 DB 里”会话中心”“工单中心”菜单项的 path 和上面路由对得上。如果对不上(比如菜单 path 是 /conversation 单数),以**路由迁就菜单**或在菜单数据里改 path——查 menus 表确认后处理,不确定先回报
1. 如果菜单项的权限点(conversation:list / workorder:handle)还没分配给 admin 角色,确认 admin 是超管能看到全部菜单(盘点显示 admin 是超级管理员,应该能看到)

### Dev Task 8 — 品牌文案替换(顺带,零风险)

截图发现 admin 还有 chat_rpa 的文案残留,替换成 chatsift:

- “管理后台” 顶部 logo 区 / “RPA系统” 面包屑 / “欢迎使用 RPA 管理后台” → 改为 chatsift / 会话分拣 相关文案
- 左下角 “版本 1.9.0” → 改为 chatsift 的版本(如 v1.0.0)
- 浏览器标签标题 “多平台AI客服助手 - 管理后台” → “Chatsift 会话分拣”

这些都是改字符串,grep 找到硬编码文案的位置改掉即可。不确定版本号写多少就写 v1.0.0。

### Dev Task 9 — 构建验证 + 真实登录验收

```bash
cd ~/vscode/chatsift/admin
npm run build   # 确认构建通过
npm run dev     # 起开发服务器
```

真实验收(Chase 配合,记得先关掉那个浏览器扩展遮罩):

1. 登录后点”会话中心”,确认能看到 W4/W5 采集进来的真实会话(chase 那几条),筛选能用
1. 点某会话的”查看”,确认详情页能看到消息流(早上好啊 等真实消息)
1. 点”工单中心”,确认能看到生成的工单(报价单/咨询单),筛选能用
1. 打开一个工单,改个状态,确认能保存、列表刷新

### Dev Task 10 — 提交

```bash
git add admin/
git commit -m "feat(W6): admin conversation center + workorder center

- api/conversations.js + api/workorders.js
- Conversations.vue 列表+筛选, ConversationDetail.vue 消息流
- Workorders.vue 列表+筛选+处理弹窗(状态变更)
- 路由挂载到已有菜单项, 沿用 Element Plus 现有风格
- 品牌文案 RPA系统/1.9.0 → chatsift
- dashboard/stats 500 留 W9, 浏览器扩展遮罩非代码问题"
git log --oneline -8
```

-----

## 完成标准(验收报告)

> 验收报告写成 `docs/reports/W6_acceptance.md` 落盘 + 进 git,用户上传给 Claude。

阶段一完成标准:

- [x] W6_inventory.md 已回报,admin 可运行性结论清晰
- [x] admin 能启动 + 登录 + 调通 3100 的 /api/v1 接口
- [x] 打通登录链路的修复已记录(A 类)
- [x] 现有路由表 + 菜单结构已盘清
- [x] 灰色遮罩确认为浏览器扩展(非代码),dashboard 500 挂起 W9

阶段二完成标准:

- [ ] api/conversations.js + api/workorders.js 已建
- [ ] 会话列表页:能看到真实采集会话,平台/意图/阶段筛选可用,分页正常
- [ ] 会话详情页:能看到真实消息流(inbound/outbound 区分)
- [ ] 工单列表页:能看到生成的工单,类型/状态/优先级筛选可用
- [ ] 工单处理弹窗:能看工单详情、改状态并保存、列表刷新
- [ ] 路由挂到已有”会话中心”“工单中心”菜单项,点击能进
- [ ] 新页面风格与现有 Users/Platforms 页一致(Element Plus)
- [ ] 品牌文案 RPA系统/1.9.0 → chatsift
- [ ] npm run build 通过
- [ ] git log 显示 W6 commit 独立

-----

## 重要提示

- **新页面沿用现有 Element Plus 风格**,和 Users/Roles/Platforms 一套,不要另起炫酷设计(企业运营后台,一致性优先)
- **先读 Platforms.vue 当模板**(Dev Task 1),照现有写法做,不发明新写法
- **request.js baseURL 已是 /api**,新 api 文件路径写 `/v1/conversations`(拼成 /api/v1/conversations)
- **灰色遮罩是浏览器扩展**,非 chatsift 代码,Chase 关掉扩展即可,本周不写任何修复
- **dashboard/stats 的 500 不碰**,留 W9 重写 dashboard 时一起修(老表 message_logs → messages)
- **不动后端已验收代码**:W6 纯前端,只调现成的 /api/v1 接口。如果发现接口返回结构和页面需要的对不上,先回报,不要去改后端 controller(那是 C 类)
- **菜单 path 对齐**:DB 菜单已有会话/工单中心条目,新路由 path 要和菜单 path 对上,对不上先查 menus 表再处理
- **真实验收要 Chase 配合**:启动 admin、关掉遮罩扩展、登录、点页面看真实数据
- **不要改 chat_rpa**(只读参考)