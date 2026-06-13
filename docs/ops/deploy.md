---
文档: chatsift 部署与服务器重置方案 (DEPLOY)
版本: v1.2.0
状态: 待确认(方案稿,确认后据此生成 deploy/scripts 配置)
来源: 调研 chat_rpa deploy/ + git-workflow §9 + 事故复盘,按 chatsift 改编
日期: 2026-06-02
---

## 变更日志

| 版本 | 日期 | 变更摘要 | 触发来源 |
|---|---|---|---|
| v1.2.0 | 2026-06-12 | v0.6.6 发布隔离:admin 静态与插件下载产物拆为两套(plugin-downloads 独立目录 + PLUGIN_DOWNLOAD_DIR);test/prod 全链路目录隔离;统一发布入口 `release.sh --env test\|prod` | 发布隔离机制重建 |
| v1.1.0 | 2026-06-02 | 域名改为复用 admin.kongyuekeji.com(老项目彻底废弃),不再启用新子域 | 用户决策 |
| v1.0.0 | 2026-06-02 | 初版:重置服务器(只跑 chatsift)+ 部署拓扑 + 待生成配置清单 | 用户决策:重置 |

> 已定决策:**重置现服务器、只跑 chatsift**(chat_rpa **彻底废弃**);入口**复用 `admin.kongyuekeji.com`**(老项目废弃后该域名指向 chatsift,不启用新子域);**先备份 chat_rpa 再重置**。
> 本文是方案;`deploy/*` 与 `scripts/*` 实际文件确认后再生成(见 §6 清单)。配置同步规范见 OPS.md。

> **v0.6.6 发布隔离(已落地)**:admin 静态资源与插件下载产物是**两套产物**——
> - prod: `/opt/chatsift/admin/dist`(静态) + `/opt/chatsift/plugin-downloads`(插件,独立)。
> - test: `/opt/chatsift-test/{server,admin/dist,plugin-downloads}` 全链路独立,与 prod 不共享任何目录。
> - server 经 `PLUGIN_DOWNLOAD_DIR` 读插件元数据/zip(不再固定 admin/dist);compose 按环境注入。
> - **发布命令 test/prod 不同**,统一走 `scripts/release.sh --env test|prod`(内置跨环境写入 guard);**禁止手工 rsync 插件产物到未声明目录**;插件 `metadata.json` 只允许更新到**目标环境**的 plugin-downloads。详见 `server-access.md` §5、`release.md`。

---

## 1. 目标拓扑

```
浏览器 → https://admin.kongyuekeji.com (Nginx 终止 TLS,复用老项目域名)
        → 反代 127.0.0.1:3100 (chatsift-server, Docker)
                        │
                  chatsift-mysql (Docker, 仅容器内网)
        静态: admin/dist 由 server 容器挂载为 /app/public 托管(同 chat_rpa)
```

| 项 | 取值 |
|---|---|
| 服务器 | 重置后的现有云主机(同一台),主机名设 `chatsift-prod` |
| 部署目录 | `/opt/chatsift`,compose 在 `/opt/chatsift/deploy` |
| 容器 | `chatsift-mysql`(mysql:8.0)、`chatsift-server`(node:20-alpine) |
| server 端口 | 容器内 3100,宿主**只绑 `127.0.0.1:3100`**(不公开,Nginx 在前) |
| MySQL | 库名 `chatsift`,数据卷 `deploy/data/mysql`,**不对公网开端口** |
| 域名/证书 | **复用 `admin.kongyuekeji.com`**(老项目废弃后指向 chatsift)+ HTTPS(沿用现有证书) |
| LLM key | **不进 env/compose**,各租户在后台写 `tenant_llm_config` 表 |
| 环境文件 | `deploy/.env.production`(机密只在服务器),软链 `.env -> .env.production` |

> 与 chat_rpa 的差异:① 无 dom-collector;② env 不含 `DEEPSEEK_*`(key 租户化);③ 容器/库/目录/域名全部换成 chatsift 命名;④ 端口 3100(chat_rpa 是 3000)。

### 1.1 是否保留 test 环境
- 建议比照 chat_rpa 留一套 test(`/opt/chatsift-test`、端口 3101、库 `chatsift_test`、`docker-compose.test.yml`,入口可复用 `test-admin.kongyuekeji.com`),发版前先 test 冒烟。
- 若想最省,可一期只上 prod、test 用本地 `deploy/docker-compose.yml`(现开发态)替代。**这点请你定**(默认:留 test,与 chat_rpa 一致)。
- 老项目彻底废弃后,`admin.kongyuekeji.com` 与 `test-admin.kongyuekeji.com` 都腾出给 chatsift 复用。

---

## 2. 重置前安全(必须先做,吸取 5-21 教训)

> chat_rpa 生产库里有真实业务数据。重置 = 永久销毁这些数据。备份是唯一安全网。

1. **登录 chat_rpa 生产,确认环境**:`hostname` / `curl ifconfig.me` 与记录一致(chat_rpa 是 `124.222.146.193` / `chat-rpa-prod`)。
2. **全量备份并下载离机**:
   - `mysqldump` chat_rpa 的 `rpa_system` 库 → 压缩 → `scp` 下载到本地 + 上传 COS。
   - 备份 `server/uploads/`(知识库物理文件)。
   - 记录备份路径与校验(行数/大小),确认可解压。
3. **再次和 Chase 确认 chat_rpa 确实弃用**(用户已评估可重置,此步是破坏前最后一道闸)。
4. 破坏性操作三问(OPS §3.1)逐条答完再动手。

---

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

---

## 4. 部署后必做
- admin 首次登录立即改默认密码(seed 是 `admin`)。
- 在后台 LLM 配置页为租户填 DeepSeek key(key 不落代码/不落 env)。
- 确认 server 只绑 `127.0.0.1:3100`,公网只经 Nginx HTTPS 进。
- `JWT_SECRET` 生产用强随机值(勿用 dev 默认值)。
- 启用每日 mysqldump 备份(见 §5)。

## 5. 备份机制(硬要求)
- 每日凌晨 `mysqldump chatsift` → 压缩 → COS,保留 ≥30 天 + 每月归档。
- 可选开启 MySQL binlog(保留 7 天),便于按时间点恢复。
- `deploy/data/` 永不同步/覆盖/删除;任何清库操作走 OPS §3.1 三问。

## 6. 待生成配置清单(本次只出方案,确认后我产出)
- `VERSION`(`0.1.0`)、`CHANGELOG.md`、`PROJECT_STATUS.md`(发版记录骨架)
- `scripts/`:`sync-version.sh`、`check-version.sh`、`bump-version.sh`、`release-prod.sh`、`scripts/qa/smoke.sh`
- `deploy/docker-compose.prod.yml`(基于 `_reference/v1-docker-compose.yml` 改 chatsift 命名/端口/无 DEEPSEEK env/admin 静态挂载)
- `deploy/docker-compose.test.yml`(若保留 test)
- `deploy/.env.production.example`(MYSQL_*、JWT_SECRET;无 LLM key)
- `server/.dockerignore`(排除 node_modules/.env 等)
- Nginx server 块示例(chatsift.kongyuekeji.com → 127.0.0.1:3100 + 证书)
- `scripts/backup-mysql.sh`(每日 dump + 上传)

## 6.1 实际上线记录(2026-06-02)
服务器用**宝塔面板**管 nginx(非 /etc/nginx/conf.d),vhost 在 `/www/server/panel/vhost/nginx/`。实际切换:
- `html_admin.kongyuekeji.com.conf`:`root /opt/chat-rpa/admin/dist`→`/opt/chatsift/admin/dist`(静态托管 SPA),`/api` 反代 `3000`→`3100`。
- `html_api.kongyuekeji.com.conf`、`html_ip_api.conf`(IP:8080):反代 `3000`→`3100`。
- 每个文件改前 `cp` 备份(`.bak.时间戳`),`nginx -t` 通过才 reload。
- chat_rpa prod + test 容器 `docker compose down`(数据卷保留,可回退)。
- 部署踩坑:① server/sql/*.sql 需 644(否则容器内读不到→v1 表不建);② mysql healthcheck 需 start_period(否则首次 init 误判不健康)。均已在仓库修复。
- 真实主机名 `VM-0-13-opencloudos`(非 chat-rpa-prod);登录 `ssh -i <Ubuntu.pem> root@124.222.146.193`。
- **遗留**:插件 serverUrl 需指到 `https://admin.kongyuekeji.com` 才往生产传数据;Phase 3(删 chat_rpa 旧目录)稳定后再做。

### 6.2 test 环境上线记录(2026-06-02)
- 目录 `/opt/chatsift-test`,compose `docker-compose.test.yml --env-file .env.test`(机密服务器生成、JWT 与 prod 不同)。
- 容器 `chatsift-mysql-test` + `chatsift-server-test`,server 绑 `127.0.0.1:3101`,库 `chatsift_test`,网络 `chatsift-net-test`,数据 `deploy/data-test/mysql`——与 prod 全隔离。
- 入口 `test-admin.kongyuekeji.com`:nginx `html_test-admin.kongyuekeji.com.conf` root→`/opt/chatsift-test/admin/dist`、`/api`→`3101`(已备份原配置,证书复用)。
- 验证:域名 /api/health code0、冒烟 PASS=6/0。常用:`cd /opt/chatsift-test/deploy && docker compose -f docker-compose.test.yml --env-file .env.test up -d`;重置 test 库可 `down` + `rm -rf data-test/mysql` + `up`。

## 7. 回滚
- 上线不稳:`docker compose down` chatsift,chat_rpa 旧目录/数据卷在 §3-C 暂保留时可 `up` 回退(故 chat_rpa 数据卷在 chatsift 稳定前不要删)。
- 版本回滚:`git checkout vX.Y.Z` 旧 tag → 重新 build/up(库迁移只增不改,旧版本兼容旧表)。
- 误删兜底:§2 的离机备份恢复。
