# 服务器接入与部署速查(server-access.md)

> 版本: v1.0.0 / 2026-06-06
> 给 DEV/QA 发版/部署时快速查连接与命令。**机密(私钥/密码)不在本文、不在仓库**,只在你本地/服务器。
> 配套必读:`release.md`(发版 checklist)、`prod-safety.md`(生产铁律)。来源:DEPLOY.md §1/§6.1/§6.2 + 实际上线记录。

---

## 1. SSH 登录
```bash
ssh -i <Ubuntu.pem> root@124.222.146.193
```
| 项 | 值 |
|---|---|
| IP | `124.222.146.193` |
| 用户 | `root` |
| 私钥 | `Ubuntu.pem`（本地持有,不在仓库） |
| 端口 | 22（默认） |
| 真实主机名 | `VM-0-13-opencloudos`（`hostname` 应返回它） |
| 面板 | 宝塔管 nginx,vhost 在 `/www/server/panel/vhost/nginx/`（非 /etc/nginx/conf.d） |

## 2. ★SSH 后环境三确认（prod-safety §2,操作前必做）
```bash
hostname          # 预期 VM-0-13-opencloudos
curl ifconfig.me  # 预期 124.222.146.193
docker ps         # 确认 chatsift-mysql / chatsift-server 在跑
```

## 3. 生产（prod）
| 项 | 值 |
|---|---|
| 目录 | `/opt/chatsift`;compose 在 `/opt/chatsift/deploy` |
| compose | `docker-compose.prod.yml` |
| 容器 | `chatsift-mysql`(mysql:8.0)、`chatsift-server`(node:20) |
| server 端口 | 容器内 3100,宿主**只绑 `127.0.0.1:3100`**（公网经 nginx） |
| 库 | `chatsift`（容器内 3306,不对公网） |
| 域名 | `admin.kongyuekeji.com`(平台)、`mychat.kongyuekeji.com`(租户),HTTPS |
| VERSION | `/opt/chatsift/VERSION` ★部署后必同步（历史漏过:prod 0.1.0 vs 代码 0.3.1） |
| .env | `cd /opt/chatsift/deploy` 确认软链 `.env -> .env.production` 在 |

## 4. 测试（test,先验预发）
| 项 | 值 |
|---|---|
| 目录 | `/opt/chatsift-test` |
| 容器 | `chatsift-mysql-test` / `chatsift-server-test`,绑 `127.0.0.1:3101` |
| 库 | `chatsift_test`,网络 `chatsift-net-test`,数据 `deploy/data-test/mysql`（与 prod 全隔离） |
| 入口 | `test-admin.kongyuekeji.com`(+ test-mychat 已申请) |
| 启动 | `cd /opt/chatsift-test/deploy && docker compose -f docker-compose.test.yml --env-file .env.test up -d` |

## 5. 部署命令序列
```bash
# 本地
npm run build:admin        # 出 admin/dist
# 推代码到服务器(★口径见下方警告)
# 服务器
cd /opt/chatsift/deploy && docker compose -f docker-compose.prod.yml build server \
  && docker compose -f docker-compose.prod.yml up -d server
echo "<新版本>" > /opt/chatsift/VERSION     # ★别漏
nginx -t && nginx -s reload                 # nginx 已指 chatsift,通常不动
```
> ⚠️ **推代码口径不一致,发版前先确认**:`release.md §3` 写 **rsync** 同步(排除 .env / data/ / test compose);W19 阶段E方案写 `cd /opt/chatsift && git pull`(需先 push main)。两者择一,别混用(否则 rsync 覆盖 + git 状态不一致)。

## 6. ★发版红线（务必遵守）
1. **发版 = QA 身份**（AGENTS §6）:只有 QA/Chase 能发版、改 VERSION、写发版记录。
2. **不可逆操作停最后一步**:清库 / `docker compose down` / DROP / 删 `data/` → prod-safety §4 三问 + 先备份(离机+验证可解压) + **Chase 在场答"go"才执行**。
3. **发什么版要先明确**:prod VERSION=`0.3.1`;W17 已并 main **未发版**;W19 进行中。发版范围（W17 单发 / 等 W19 一起 v0.5.0）由 Chase/QA 定,cc 不自决。
4. **data/ 永不同步/覆盖/删除**;test 与 prod 数据库配置禁互换。

## 7. 凭据（安全,不入库）
- 私钥 `Ubuntu.pem`、服务器 `.env.production` 的 `MYSQL_PASSWORD`/`JWT_SECRET` 等只在本地/服务器,不在仓库。给 cc 时直接给私钥路径,勿粘贴进任何会提交的文件。

---
## 变更日志
| 版本 | 日期 | 摘要 |
|---|---|---|
| v1.0.0 | 2026-06-06 | 初版:SSH 接入 + prod/test 拓扑 + 部署序列 + 发版红线,汇总自 DEPLOY/release/prod-safety |
