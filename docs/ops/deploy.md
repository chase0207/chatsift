---
文档: chatsift 部署与服务器重置方案 (DEPLOY)
版本: v1.5.0
状态: 已上线运行(现行事实 + 历史归档指针)
来源: 现行部署事实 + 早期重置方案历史归档
日期: 2026-06-02
---

## 变更日志

| 版本 | 日期 | 变更摘要 | 触发来源 |
|---|---|---|---|
| v1.5.0 | 2026-06-14 | 早期 chat_rpa 重置方案、test 决策和待生成清单拆入 archive;本文保留现行部署事实 | 治理 B4 |
| v1.4.0 | 2026-06-14 | 破坏性三问旧 OPS §3.1 指针改为 prod-safety §4 | 治理去重 B2-② |
| v1.3.0 | 2026-06-14 | data/ 红线正文改为指向 prod-safety §5 | 治理去重 B2-② |
| v1.2.0 | 2026-06-12 | v0.6.6 发布隔离:admin 静态与插件下载产物拆为两套(plugin-downloads 独立目录 + PLUGIN_DOWNLOAD_DIR);test/prod 全链路目录隔离;统一发布入口 `release.sh --env test\|prod` | 发布隔离机制重建 |
| v1.1.0 | 2026-06-02 | 域名改为复用 admin.kongyuekeji.com(老项目彻底废弃),不再启用新子域 | 用户决策 |
| v1.0.0 | 2026-06-02 | 初版:重置服务器(只跑 chatsift)+ 部署拓扑 + 待生成配置清单 | 用户决策:重置 |

> 早期一次性 chat_rpa 重置方案、test 是否保留决策和待生成配置清单已拆入 `docs/archive/2026-06-14_deploy_reset_plan_archive.md`。本文只保留现行部署事实、上线记录、备份/回滚和发布隔离口径。

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
| 服务器 | 现有云主机 `124.222.146.193`(真实主机名 `VM-0-13-opencloudos`) |
| 部署目录 | `/opt/chatsift`,compose 在 `/opt/chatsift/deploy` |
| 容器 | `chatsift-mysql`(mysql:8.0)、`chatsift-server`(node:20-alpine) |
| server 端口 | 容器内 3100,宿主**只绑 `127.0.0.1:3100`**(不公开,Nginx 在前) |
| MySQL | 库名 `chatsift`,数据卷 `deploy/data/mysql`,**不对公网开端口** |
| 域名/证书 | **复用 `admin.kongyuekeji.com`**(老项目废弃后指向 chatsift)+ HTTPS(沿用现有证书) |
| LLM key | **不进 env/compose**,各租户在后台写 `tenant_llm_config` 表 |
| 环境文件 | `deploy/.env.production`(机密只在服务器),软链 `.env -> .env.production` |

> 与 chat_rpa 的差异:① 无 dom-collector;② env 不含 `DEEPSEEK_*`(key 租户化);③ 容器/库/目录/域名全部换成 chatsift 命名;④ 端口 3100(chat_rpa 是 3000)。

---

## 2. 运行要求
- admin 首次登录立即改默认密码(seed 是 `admin`)。
- 在后台 LLM 配置页为租户填 DeepSeek key(key 不落代码/不落 env)。
- 确认 server 只绑 `127.0.0.1:3100`,公网只经 Nginx HTTPS 进。
- `JWT_SECRET` 生产用强随机值(勿用 dev 默认值)。
- 启用每日 mysqldump 备份(见 §3)。

## 3. 备份机制(硬要求)
- 每日凌晨 `mysqldump chatsift` → 压缩 → COS,保留 ≥30 天 + 每月归档。
- 可选开启 MySQL binlog(保留 7 天),便于按时间点恢复。
- data/ 红线见 `prod-safety.md` §5;清库操作三问见 `prod-safety.md` §4。

## 4. 实际上线记录(2026-06-02)
服务器用**宝塔面板**管 nginx(非 /etc/nginx/conf.d),vhost 在 `/www/server/panel/vhost/nginx/`。实际切换:
- `html_admin.kongyuekeji.com.conf`:`root /opt/chat-rpa/admin/dist`→`/opt/chatsift/admin/dist`(静态托管 SPA),`/api` 反代 `3000`→`3100`。
- `html_api.kongyuekeji.com.conf`、`html_ip_api.conf`(IP:8080):反代 `3000`→`3100`。
- 每个文件改前 `cp` 备份(`.bak.时间戳`),`nginx -t` 通过才 reload。
- chat_rpa prod + test 容器 `docker compose down`(数据卷保留,可回退)。
- 部署踩坑:① server/sql/*.sql 需 644(否则容器内读不到→v1 表不建);② mysql healthcheck 需 start_period(否则首次 init 误判不健康)。均已在仓库修复。
- 真实主机名 `VM-0-13-opencloudos`(非 chat-rpa-prod);登录 `ssh -i <Ubuntu.pem> root@124.222.146.193`。
- **遗留**:插件 serverUrl 需指到 `https://admin.kongyuekeji.com` 才往生产传数据;Phase 3(删 chat_rpa 旧目录)稳定后再做。

### 4.1 test 环境上线记录(2026-06-02)
- 目录 `/opt/chatsift-test`,compose `docker-compose.test.yml --env-file .env.test`(机密服务器生成、JWT 与 prod 不同)。
- 容器 `chatsift-mysql-test` + `chatsift-server-test`,server 绑 `127.0.0.1:3101`,库 `chatsift_test`,网络 `chatsift-net-test`,数据 `deploy/data-test/mysql`——与 prod 全隔离。
- 入口 `test-admin.kongyuekeji.com`:nginx `html_test-admin.kongyuekeji.com.conf` root→`/opt/chatsift-test/admin/dist`、`/api`→`3101`(已备份原配置,证书复用)。
- 验证:域名 /api/health code0、冒烟 PASS=6/0。常用:`cd /opt/chatsift-test/deploy && docker compose -f docker-compose.test.yml --env-file .env.test up -d`;重置 test 库可 `down` + `rm -rf data-test/mysql` + `up`。

## 5. 回滚
- 上线不稳:`docker compose down` chatsift;早期 chat_rpa 回退留存口径见 `docs/archive/2026-06-14_deploy_reset_plan_archive.md`。
- 版本回滚:`git checkout vX.Y.Z` 旧 tag → 重新 build/up(库迁移只增不改,旧版本兼容旧表)。
- 误删兜底:按 `docs/ops/prod-safety.md` 的备份要求用离机备份恢复。
