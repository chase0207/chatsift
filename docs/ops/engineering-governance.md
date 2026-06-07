# 工程治理方案(engineering-governance.md)

> 目标:清理 chatsift 工程中的死代码、废弃入口和历史包袱,同时避免误删仍被动态路由、插件构建、部署脚本或生产迁移依赖的代码。
> 原则:先盘点、再分级、再小批量删除;不做全仓一刀切。
> 版本:v1.0.0 / 2026-06-07

---

## 1. 适用范围

本方案适用于:

- 前端未路由页面、未使用 API 封装、废弃组件。
- server 未挂载 route/controller/helper。
- plugin 未进入 build 拼接的 runtime、adapter、shared 模块。
- 旧脚本、旧文档、历史调研材料、已失效 smoke。
- 重复实现、遗留兼容层、已被新链路替代的代码。

不适用于:

- 生产热修。
- 数据迁移回滚。
- 发版流程。
- 大型架构重构。

---

## 2. 核心规则

### 2.1 不用"没人搜索到引用"直接删除

chatsift 存在动态入口:

- Express route 动态挂载。
- Vue router 懒加载。
- 菜单权限动态显示。
- Chrome extension 由 `plugin/build.js` 拼接。
- SQL migration / docker compose / shell 脚本在发版或生产环境使用。

因此,只靠 `rg 文件名` 或 IDE 灰色提示不能作为删除依据。

### 2.2 入口反查优先

死代码判断必须从入口链路反查:

```
server/src/app.js
server/src/routes/**
admin/src/router/index.js
admin/src/utils/entry.js
plugin/build.js
plugin/manifest.json
deploy/docker-compose*.yml
scripts/**
docs/ops/**
```

没有进入入口链路的文件,才进入候选清单。

### 2.3 先出清单,不直接删

清理前先产出候选清单,按四类归档:

```
确定死代码
疑似死代码
历史归档但不删
禁止删除
```

用户确认"确定死代码"后,再分批删除。

### 2.4 小批量删除

每批只删同一类对象:

```
batch 1:前端未路由页面/组件
batch 2:未挂载 server route/controller
batch 3:未进入 plugin build 的模块
batch 4:废弃 scripts/smoke
batch 5:历史文档归档或删除
```

每批删除后必须验证,不能攒到最后一起验。

---

## 3. 风险分级

### 3.1 低风险

- 明确未路由的前端页面。
- 未被 import 的 admin API 封装。
- 已过期的一次性调研草稿。
- 明确标注废弃且无入口引用的脚本。

### 3.2 中风险

- server controller/helper。
- admin 业务组件。
- plugin runtime 辅助模块。
- smoke/qa 脚本。

### 3.3 高风险

以下对象默认禁止直接删除:

```
deploy/
server/sql/
docs/ops/
docs/reports/
plugin/runtime/position-tracker.js
plugin/runtime/event-*.js
plugin/runtime/legacy-collector.js
plugin/adapters/douyin/*
server/src/controllers/v1/_shared.js
server/src/middleware/*
server/src/config/*
scripts/backup-mysql.sh
scripts/sync-version.sh
scripts/check-version.sh
```

这些文件即使引用少,也可能是采集、权限、迁移、发版或生产安全地基。

---

## 4. 候选清单格式

每个候选项必须记录:

| 字段 | 说明 |
|---|---|
| 文件/符号 | 文件路径、函数名、组件名 |
| 分类 | 确定死代码 / 疑似死代码 / 历史归档但不删 / 禁止删除 |
| 怀疑理由 | 为什么认为它可能不用 |
| 入口链路 | 是否从 app/router/build/manifest/deploy 入口可达 |
| 动态调用风险 | 是否可能由字符串、菜单、脚本、插件拼接调用 |
| 删除风险 | 低 / 中 / 高 |
| 验证方式 | build、smoke、grep、人工确认 |
| 建议动作 | 删除 / 保留 / 归档 / 待确认 |

建议清单落位:

```
docs/research/YYYY-MM-DD_死代码清理候选清单.md
```

---

## 5. 分区盘点方法

### 5.1 admin

入口:

```
admin/src/router/index.js
admin/src/utils/entry.js
admin/src/api/**
admin/src/views/**
admin/src/components/**
```

检查:

- 页面是否在 router 注册。
- API 封装是否被 view/component 引用。
- 组件是否只在已废弃页面中使用。
- 菜单是否仍指向该 route。

验证:

```
npm run build:admin
```

### 5.2 server

入口:

```
server/src/app.js
server/src/routes/**
server/src/controllers/**
server/src/controllers/v1/**
server/src/v1/**
server/src/middleware/**
```

检查:

- controller 是否被 route 挂载。
- route 是否被 app.js 挂载。
- helper 是否被 controller/v1/analyzer 引用。
- 是否涉及 auth、permission、scope、tenant、service_account。

注意:

- 未挂载 controller 可以进入候选。
- middleware、scope、auth、SQL 相关默认高风险。
- 只要是生产 API 路径,不能仅凭缺少前端引用删除。

### 5.3 plugin

入口:

```
plugin/build.js
plugin/manifest.json
plugin/runtime/**
plugin/shared/**
plugin/adapters/**
```

检查:

- 文件是否进入 `plugin/build.js` 拼接清单。
- content.js 是否由源文件生成,不要直接把生成结果当唯一依据。
- adapter 是否虽然未启用但属于规划平台。
- runtime 模块是否通过 `window.Rpa*` 动态访问。

注意:

- `plugin/content.js` 是生成物,不要只改/删它判断源代码状态。
- 抖音相关 adapter 和 W17 position/event 队列默认高风险。

### 5.4 scripts / deploy / docs

入口:

```
docs/ops/release.md
docs/ops/prod-safety.md
deploy/docker-compose*.yml
scripts/*.sh
scripts/qa/**
scripts/smoke/**
```

检查:

- 是否被 release/prod-safety 引用。
- 是否是生产备份、版本同步、发版校验脚本。
- 是否是历史一次性脚本。

注意:

- 生产、备份、版本、迁移脚本默认禁止删除。
- 旧 smoke 可以归档,不要直接删掉唯一验证手段。

---

## 6. 删除流程

### 6.1 盘点阶段

1. 从干净 main 切治理分支。
2. 运行入口反查。
3. 产出候选清单。
4. 用户确认第一批"确定死代码"。

### 6.2 删除阶段

1. 每批只删一类。
2. 删除后跑对应验证。
3. 验证通过后独立 commit。
4. 继续下一批。

### 6.3 验证命令

基础验证:

```
npm run build:admin
npm run build:plugin
```

按需验证:

```
bash scripts/qa/smoke.sh
bash scripts/check-version.sh
```

涉及 server API 时,至少本地启动 server 后做核心 API smoke:

```
/api/health
/api/auth/login
/api/v1/conversations
/api/v1/home
```

涉及 plugin 时,至少确认:

- `plugin/build.js` 可生成 `plugin/content.js`。
- 插件核心模块仍进入 content.js。
- 抖音私信试点采集链路未被删断。

---

## 7. 删除硬禁区

没有明确技术方案和用户确认前,禁止删除或重构:

- 生产部署脚本。
- 数据库 migration / init SQL。
- auth / permission / scope。
- W17 position / event queue / uploader。
- W19 service_account / tenant scope 相关路径。
- docs/ops 治理文档。
- 最近一次 acceptance report。

---

## 8. 建议清理顺序

推荐顺序:

1. admin 未路由页面和未使用组件。
2. admin 未使用 API 封装。
3. server 未挂载 route/controller。
4. plugin 未进入 build 的非抖音 adapter。
5. 明确废弃 smoke/script。
6. 历史文档归档。
7. runtime/helper 级别清理。

最后一类必须单独做 review,不和其他清理混批。

---

## 9. 完成标准

一次死代码清理完成,必须满足:

- 候选清单已归档到 `docs/research/`。
- 删除范围经过用户确认。
- 每批删除都有独立 commit。
- `npm run build:admin` 通过。
- `npm run build:plugin` 通过。
- 涉及 server/plugin 的批次完成对应 smoke。
- `git status` 干净。
- 未删除生产、迁移、权限、采集地基文件。

---

## 变更日志

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0.0 | 2026-06-07 | 初版:死代码清理的分区、分级、候选清单、删除流程和硬禁区 |

