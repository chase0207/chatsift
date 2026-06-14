---
文档: chatsift 服务器重置与早期部署方案历史归档
状态: 已废弃/历史留存
来源: 由 docs/ops/deploy.md 拆出
现行文档: docs/ops/deploy.md
取代关系: 早期一次性 chat_rpa 重置方案、test 是否保留决策、待生成配置清单已被现行 deploy/server-access/release/prod-safety 承接;本文仅作历史追溯,不作为执行依据。
日期: 2026-06-14
---

# chatsift 服务器重置与早期部署方案历史归档

> 本文完整保留从 `docs/ops/deploy.md` 拆出的历史段落。现行部署入口、生产安全和服务器速查见 `docs/ops/deploy.md`、`docs/ops/server-access.md`、`docs/ops/prod-safety.md`、`docs/ops/release.md`。

## 历史背景

> 已定决策:**重置现服务器、只跑 chatsift**(chat_rpa **彻底废弃**);入口**复用 `admin.kongyuekeji.com`**(老项目废弃后该域名指向 chatsift,不启用新子域);**先备份 chat_rpa 再重置**。
> 本文是方案;`deploy/*` 与 `scripts/*` 实际文件确认后再生成(见 §6 清单)。配置同步规范见 OPS.md。

## 历史段落一: 是否保留 test 环境

### 1.1 是否保留 test 环境
- 建议比照 chat_rpa 留一套 test(`/opt/chatsift-test`、端口 3101、库 `chatsift_test`、`docker-compose.test.yml`,入口可复用 `test-admin.kongyuekeji.com`),发版前先 test 冒烟。
- 若想最省,可一期只上 prod、test 用本地 `deploy/docker-compose.yml`(现开发态)替代。**这点请你定**(默认:留 test,与 chat_rpa 一致)。
- 老项目彻底废弃后,`admin.kongyuekeji.com` 与 `test-admin.kongyuekeji.com` 都腾出给 chatsift 复用。

## 历史段落二: 重置前安全

## 2. 重置前安全(必须先做,吸取 5-21 教训)

> chat_rpa 生产库里有真实业务数据。重置 = 永久销毁这些数据。备份是唯一安全网。

1. **登录 chat_rpa 生产,确认环境**:`hostname` / `curl ifconfig.me` 与记录一致(chat_rpa 是 `124.222.146.193` / `chat-rpa-prod`)。
2. **全量备份并下载离机**:
   - `mysqldump` chat_rpa 的 `rpa_system` 库 → 压缩 → `scp` 下载到本地 + 上传 COS。
   - 备份 `server/uploads/`(知识库物理文件)。
   - 记录备份路径与校验(行数/大小),确认可解压。
3. **再次和 Chase 确认 chat_rpa 确实弃用**(用户已评估可重置,此步是破坏前最后一道闸)。
4. 破坏性操作三问(`prod-safety.md` §4)逐条答完再动手。

## 历史段落三: 重置 + 部署步骤

## 3. 重置 + 部署步骤(确认配置后执行)

```
A. 备份 chat_rpa(见 §2),确认备份可用
B. 停 chat_rpa:cd /opt/chat-rpa/deploy && docker compose down(数据卷先留着,确认 chatsift 上线稳定再清)
C. 设主机名 chatsift-prod;清理/归档旧目录(/opt/chat-rpa 暂保留为回退,磁盘紧再删)
D. 建 /opt/chatsift,从 GitHub 拉 chatsift main(需先建 remote 并 push,见 OPS §1.1)
E. 写 deploy/.env.production(机密),建软链 .env -> .env.production
F. 首次 up:docker compose up -d → MySQL 按 init 挂载灌入 00_reused_tables.sql + v1-schema.sql(admin/平台/菜单 seed 随之建好)
G. 构建:本地 npm run build:admin 推 admin/dist;server 容器 docker compose build && up -d
H. Nginx 把 admin.kongyuekeji.com 指向 chatsift:复用老项目 server 块与证书,upstream 改 127.0.0.1:3100(老项目已废弃,域名腾出)
I. 冒烟:登录 admin(默认 admin/初始密码)→ 改密 → 配租户 LLM key → events/batch 造数 → 看四页/漏斗/提醒
J. 稳定运行观察后,再清理 chat_rpa 旧目录与数据卷(最终弃用)
```

## 历史段落四: 待生成配置清单

## 6. 待生成配置清单(本次只出方案,确认后我产出)
- `VERSION`(`0.1.0`)、`CHANGELOG.md`、`PROJECT_STATUS.md`(发版记录骨架)
- `scripts/`:`sync-version.sh`、`check-version.sh`、`bump-version.sh`、`release-prod.sh`、`scripts/qa/smoke.sh`
- `deploy/docker-compose.prod.yml`(基于 `_reference/v1-docker-compose.yml` 改 chatsift 命名/端口/无 DEEPSEEK env/admin 静态挂载)
- `deploy/docker-compose.test.yml`(若保留 test)
- `deploy/.env.production.example`(MYSQL_*、JWT_SECRET;无 LLM key)
- `server/.dockerignore`(排除 node_modules/.env 等)
- Nginx server 块示例(chatsift.kongyuekeji.com → 127.0.0.1:3100 + 证书)
- `scripts/backup-mysql.sh`(每日 dump + 上传)
