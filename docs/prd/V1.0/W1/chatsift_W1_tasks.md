# Chatsift W1 实施任务清单(给 Claude Code)

> **周次**:W1(chatsift 第 1 周)
> **目标**:服务端 V1.0.0 数据库 + 基础路由骨架跑通
> **验收标准**:服务端能启动,8 张表建好,7 组 /api/v1/* 路由能响应(stub 即可),events 接口能落库
> **关联文档**:PRD_v1.0.0.md / v1-schema.sql / v1-api-spec.md
> **本周不做**:不写意图识别真实逻辑(stub),不写后台页面,不改插件

---

## 前置:确认环境

```bash
cd ~/vscode/chatsift
node -v          # 期望 >= 18
mysql --version  # 期望 8.x,或确认 docker mysql 可用
git status       # 确认在 main 分支,干净
```

---

## Task 1 — 放入三份 W1 文档

把我提供的三份文档放入仓库:

```bash
# PRD 放入新建的 PRD 目录(用户要求:新项目独立管理 PRD,从 v1.0.0 开始)
mkdir -p docs/prd
cp <PRD_v1.0.0.md>     docs/prd/PRD_v1.0.0.md

# schema 和 api spec
cp <v1-schema.sql>     server/sql/v1-schema.sql
cp <v1-api-spec.md>    docs/architecture/v1-api-spec.md
```

提交:

```bash
git add docs/prd/PRD_v1.0.0.md server/sql/v1-schema.sql docs/architecture/v1-api-spec.md
git commit -m "docs(W1): add PRD v1.0.0, db schema, api spec"
```

---

## Task 2 — 提取复用表 SQL

从 chat_rpa 提取 8 张复用表的建表语句,组成 chatsift 的基础表文件。

需要提取的表:users / roles / role_has_permissions / menus / platforms / platform_pages / plugins / configs。

```bash
# 从 chat_rpa 的 init.sql 和相关 migration 提取上述 8 张表的 CREATE TABLE
# 注意:只要这 8 张表,不要 chat_messages/keyword_replies/ai 等已废弃表
# 输出到 server/sql/00_reused_tables.sql
```

要求:cc 阅读 `~/vscode/chat_rpa/server/sql/init.sql` 和 migration_v11(roles/menus)、migration_v14(platform_pages),提取这 8 张表的最终结构(含后续 ALTER 的列),整理成一个干净的 `00_reused_tables.sql`。完成后让我 review。

---

## Task 3 — 建库建表

```bash
# 假设 docker mysql,先确认连接
# 建库
mysql -h127.0.0.1 -uroot -p -e "CREATE DATABASE IF NOT EXISTS chatsift DEFAULT CHARSET utf8mb4;"

# 按顺序导入:先复用表,再业务表
mysql -h127.0.0.1 -uroot -p chatsift < server/sql/00_reused_tables.sql
mysql -h127.0.0.1 -uroot -p chatsift < server/sql/v1-schema.sql

# 验证
mysql -h127.0.0.1 -uroot -p chatsift -e "SHOW TABLES;"
# 期望看到 8 张复用表 + 8 张业务表 = 16 张
```

验收:`SHOW TABLES` 输出 16 张表,`SELECT * FROM intent_rules` 有 3 条种子规则。

---

## Task 4 — 新建 server/src/app.js

这是差异 8 的补救(初始化时未复制 app.js)。新建 chatsift 的入口,挂载路由。

要求:
- 复用 chat_rpa app.js 的中间件结构(express.json、cors、auth 中间件)
- 路由表换成 chatsift 的:复用接口(auth/users/roles/menus/platforms/pages/plugins/configs/logs/dashboard)保持原前缀,新业务接口挂 /api/v1/
- 不挂载已废弃路由(ai/knowledge/keywordReplies/batches/messages 老版)

路由挂载清单:

```javascript
// 复用基础设施(无 v1 前缀)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/menus', require('./routes/menus'));
app.use('/api/platforms', require('./routes/platforms'));
app.use('/api/pages', require('./routes/pages'));
app.use('/api/plugins', require('./routes/plugins'));
app.use('/api/configs', require('./routes/configs'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/dashboard', require('./routes/dashboard'));
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/_chaos', require('./routes/_chaos'));
}

// V1.0.0 新业务(/api/v1 前缀)
app.use('/api/v1/events', require('./routes/v1/events'));
app.use('/api/v1/conversations', require('./routes/v1/conversations'));
app.use('/api/v1/leads', require('./routes/v1/leads'));
app.use('/api/v1/workorders', require('./routes/v1/workorders'));
app.use('/api/v1/intent-rules', require('./routes/v1/intentRules'));
app.use('/api/v1/price-table', require('./routes/v1/priceTable'));
app.use('/api/v1/llm-config', require('./routes/v1/llmConfig'));
app.use('/api/v1/analytics', require('./routes/v1/analytics'));
// heartbeat 和 dom-adapter-config 挂在 events 或单独 device 路由
```

---

## Task 5 — 写 8 组 /api/v1 路由 stub

在 `server/src/routes/v1/` 下新建 8 个路由文件。本周只做 stub:接口能响应、参数能解析、查询能跑通(返回真实数据或空列表),但不含分析逻辑。

| 文件 | 接口(参考 v1-api-spec.md) | 本周完成度 |
|---|---|---|
| events.js | POST /batch(真实落库去重)+ POST /heartbeat(记录)+ GET /dom-adapter-config(stub) | events/batch 必须真实可用 |
| conversations.js | GET / + GET /:id + GET /:id/messages | 真实查询 |
| leads.js | GET / + GET /:id + PATCH /:id + POST /:id/convert | 真实 CRUD |
| workorders.js | GET / + GET /:id + PATCH /:id + POST /:id/assign | 真实 CRUD |
| intentRules.js | GET/POST/PATCH/DELETE | 真实 CRUD |
| priceTable.js | GET/POST/PATCH/DELETE(import 留空) | 真实 CRUD |
| llmConfig.js | GET + PUT | 真实读写 |
| analytics.js | GET /funnel + GET /platform-comparison | 真实聚合查询 |

重点:**events.js 的 POST /batch 是 W1 的核心交付**,必须真实落库 + 去重,因为 W2 的 analyzer 依赖它。其他路由能跑通 CRUD 即可。

---

## Task 6 — 写 8 个 controller

在 `server/src/controllers/v1/` 下,对应 8 个路由各写一个 controller。沿用 chat_rpa 的 controller 风格(直接写 SQL,用现有的 db 连接池工具)。

events controller 的 batch 处理逻辑要点:

```
1. 校验 events 数组,超过 50 条返回 1003
2. 对每个 event:
   a. 用 (tenant_id, platform, platform_conversation_id) 找 conversation,
      不存在则创建,存在则更新 last_message_at / message_count
   b. 用 (tenant_id, platform_message_id) 判断消息是否已存在(去重)
   c. 不存在则插入 messages 表,analyzed_at = NULL
   d. 同时插入 analysis_jobs 表(status=pending),供 W2 的 analyzer 消费
3. 返回 { accepted, duplicated, rejected }
```

本周 analysis_jobs 只写入不消费(W2 才写 analyzer worker)。

---

## Task 7 — 配置文件与部署骨架

### 7.1 server/.env.example

```
NODE_ENV=development
PORT=3100

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=chatsift

JWT_SECRET=<生成一个新的,不要复用 chat_rpa 的>
JWT_EXPIRES_IN=7d
```

注意:端口用 3100(chat_rpa 是 3000,避免本地同时跑冲突)。JWT_SECRET 必须新生成。

### 7.2 deploy/docker-compose.yml

新建 chatsift 自己的 compose,容器名前缀 chatsift,端口避开 chat_rpa:

```yaml
services:
  chatsift-mysql:
    image: mysql:8.0
    container_name: chatsift-mysql
    ports: ["3307:3306"]      # 宿主 3307,避开 chat_rpa 的 3306
    environment:
      MYSQL_ROOT_PASSWORD: <设置>
      MYSQL_DATABASE: chatsift
    volumes:
      - chatsift-db:/var/lib/mysql
      - ./conf/init:/docker-entrypoint-initdb.d
  chatsift-server:
    build: ../server
    container_name: chatsift-server
    ports: ["3100:3100"]
    depends_on: [chatsift-mysql]
    environment:
      DB_HOST: chatsift-mysql
volumes:
  chatsift-db:
```

---

## Task 8 — 启动与验收

### 8.1 启动

```bash
cd server
cp .env.example .env   # 填好本地数据库密码
npm install
npm run dev            # 期望监听 3100
```

### 8.2 验收 checklist

逐项 curl 验证(需先有一个测试用户的 JWT,可临时从 auth/login 拿):

```bash
# 1. 健康检查(若有)
curl http://127.0.0.1:3100/api/health

# 2. 登录拿 token
TOKEN=$(curl -s -X POST http://127.0.0.1:3100/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<测试密码>"}' | jq -r '.data.token')

# 3. 上报事件(核心)
curl -X POST http://127.0.0.1:3100/api/v1/events/batch \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"events":[{"platform":"douyin","platform_page":"laike-message","conversation_id":"test_conv_1","message_id":"test_msg_1","direction":"inbound","sender_nickname":"测试用户","content_type":"text","content_text":"多少钱","occurred_at":"2026-05-30T10:00:00+08:00"}]}'
# 期望 { code:0, data:{ accepted:1, duplicated:0, rejected:0 } }

# 4. 再发一次相同 message_id,验证去重
# 期望 duplicated:1

# 5. 查会话列表
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/api/v1/conversations
# 期望能看到 test_conv_1

# 6. 查会话消息
curl -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:3100/api/v1/conversations/1/messages"
# 期望看到"多少钱"

# 7. 验证 analysis_jobs 已写入
mysql -h127.0.0.1 -P3307 -uroot -p chatsift -e "SELECT * FROM analysis_jobs;"
# 期望 1 条 pending 记录

# 8. 其余路由 stub 各 curl 一次,确认不 500
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/api/v1/leads
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/api/v1/workorders
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/api/v1/intent-rules
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/api/v1/price-table
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/api/v1/llm-config
curl -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:3100/api/v1/analytics/funnel"
```

### 8.3 提交

```bash
git add server/
git commit -m "feat(W1): server skeleton - 8 tables, 8 v1 route groups, events batch with dedup"
git log --oneline
```

---

## W1 完成标准(给我的验收报告)

完成后请提供:

1. `SHOW TABLES` 输出(确认 16 张表)
2. `SELECT * FROM intent_rules` 输出(确认 3 条种子)
3. Task 8.2 验收 checklist 第 3-7 项的 curl 输出
4. `git log --oneline` 提交记录
5. server 启动日志(确认监听 3100,无报错)
6. 任何偏离本清单的地方(像初始化时那样如实记录差异)

---

## 重要提示

- **本周不写分析逻辑**。intent/completeness/workorder 引擎都是 W2-W3。本周 events 落库时同步写 analysis_jobs(status=pending)即可,不消费。
- **复用 chat_rpa 的 db 连接池和工具**,不要引入新的 ORM。
- **JWT_SECRET 必须新生成**,不复用 chat_rpa 的(安全隔离)。
- **端口避开 chat_rpa**:server 3100,mysql 3307。
- **遇到 chat_rpa 表结构提取困难**(Task 2)先停下问我,不要猜。
- 写 SQL 查询时注意 **tenant_id 隔离**,所有查询都要带 `WHERE tenant_id = ?`。
