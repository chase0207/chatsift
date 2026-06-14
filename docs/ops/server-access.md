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
| 目录 | `/opt/chatsift-test`（v0.6.6 起 server 源树/静态/插件全链路独立） |
| server 源(build context) | `/opt/chatsift-test/server`（**不复用** prod `/opt/chatsift/server`） |
| 静态 SPA | `/opt/chatsift-test/admin/dist`（nginx root + 容器 `/app/public`） |
| 插件下载产物 | `/opt/chatsift-test/plugin-downloads`（**独立于 admin/dist**;容器 `PLUGIN_DOWNLOAD_DIR=/app/plugin-downloads`） |
| 容器 | `chatsift-mysql-test` / `chatsift-server-test`,绑 `127.0.0.1:3101` |
| 库 | `chatsift_test`,网络 `chatsift-net-test`,数据 `/opt/chatsift-test/deploy/data-test/mysql`（与 prod 全隔离） |
| 入口 | `test-admin.kongyuekeji.com`(+ test-mychat 已申请) |
| 启动 | `cd /opt/chatsift/deploy && docker compose -f docker-compose.test.yml --env-file .env.test up -d`（compose/.env.test 在 `/opt/chatsift/deploy`,挂载/build 指向 `/opt/chatsift-test/*`） |

## 5. ★发布入口(v0.6.6 起:统一脚本,test/prod 解耦)
```bash
# 唯一环境部署入口。test/prod 全链路目录写死,内置 guard(test 不写 prod 目录、prod 不引用 test)。
CHATSIFT_SSH_KEY=/path/Ubuntu.pem bash scripts/release.sh --env test --version 0.6.6   # 发 test
bash scripts/release.sh --env prod --version 0.6.6 --dry-run                            # prod 先看计划
# 只读核验隔离矩阵(挂载/PLUGIN_DOWNLOAD_DIR/DB/JWT/metadata):
CHATSIFT_SSH_KEY=/path/Ubuntu.pem bash scripts/check-env-isolation.sh
# 本地文档新鲜度检查(版本号单一真源 + 文档头/changelog 一致性):
bash scripts/check-doc-freshness.sh
# 本地治理检查(文档新鲜度若未就位则跳过 + 任务单字段/状态一致性):
bash scripts/check-governance.sh
# 本地 main 提交守卫:main 上提交 server/admin/plugin 会被 pre-commit 拦截;极端应急可 `ALLOW_MAIN_BIZ=1 git commit ...` 临时放行。
```
- **plugin-downloads 不再放进 admin/dist**:release.sh 把它 rsync 到各环境独立目录(`/opt/chatsift[-test]/plugin-downloads`),server 经 `PLUGIN_DOWNLOAD_DIR` 读取。
- **test 发布只写 `/opt/chatsift-test/*`**;prod 只写 `/opt/chatsift/*`。禁止手工 rsync 插件产物到未声明目录。
- 仓库侧版本准备(bump/commit/tag/CHANGELOG)仍走 `release-prod.sh`(prod 线);release.sh 只负责环境部署。

## 5.x 旧手工部署序列(legacy,v0.6.6 前;仅留作排错参考,新发布请用 §5 release.sh)
```bash
# ── 本地(在 main 分支)──
npm run build:admin                          # 出 admin/dist(★会清空 admin/dist)
bash scripts/package-plugin.sh "发版说明"    # 打包插件 → server/public/plugin-downloads
rm -rf admin/dist/plugin-downloads && cp -r server/public/plugin-downloads admin/dist/plugin-downloads  # ★补回(build:admin 清过)

# ── 推代码 = rsync(★口径已定,见下)──
cp "<含空格的Ubuntu.pem>" /tmp/ck.pem && chmod 600 /tmp/ck.pem   # 私钥路径含空格→复制无空格临时副本(rsync -e 要),用完 rm
SSH='ssh -i /tmp/ck.pem'; H=root@124.222.146.193
rsync -az -e "$SSH" --exclude=node_modules --exclude='.env' --exclude='.env.*' server/ $H:/opt/chatsift/server/
rsync -az -e "$SSH" admin/dist/ $H:/opt/chatsift/admin/dist/
rsync -az -e "$SSH" --exclude=data --exclude=data-test --exclude='.env*' --exclude='*.pem' --exclude=backups deploy/ $H:/opt/chatsift/deploy/

# ── 服务器 ──
cd /opt/chatsift/deploy && docker compose -f docker-compose.prod.yml build server \
  && docker compose -f docker-compose.prod.yml up -d server
echo "<新版本>" > /opt/chatsift/VERSION     # ★别漏
nginx -t && nginx -s reload                 # nginx 已指 chatsift,通常不动
# 已有库 schema 迁移(发版含 SQL 变更时):cat deploy/wXX.sql | ssh ... 'docker exec -i chatsift-mysql sh -c "mysql -uroot -p\$MYSQL_ROOT_PASSWORD chatsift"'
```
> ✅ **推代码口径 = rsync(2026-06-07 v0.5.0 发版确认)**:`/opt/chatsift` **不是 git 仓库**,`git pull` 不可用——E方案曾写的 git pull 作废,统一用上面的 rsync(无 --delete;.env/data/node_modules/.git/pem 全排除)。test 同法,目标 `/opt/chatsift-test`、compose `docker-compose.test.yml --env-file .env.test`、端口 3101。

## 6. ★发版红线（务必遵守）
1. **发版 = QA 身份**（AGENTS §6）:只有 QA/Chase 能发版、改 VERSION、写发版记录。
2. **不可逆操作停最后一步**:清库 / `docker compose down` / DROP / 删 `data/` → prod-safety §4 三问 + 先备份(离机+验证可解压) + **Chase 在场答"go"才执行**。
3. **发什么版要先明确**:当前 prod 版本见 `PROJECT_STATUS.md`。发版范围由 Chase/QA 定,cc 不自决。
4. **data/ 永不同步/覆盖/删除**;test 与 prod 数据库配置禁互换。

## 7. 凭据（安全,不入库）
- 私钥 `Ubuntu.pem`、服务器 `.env.production` 的 `MYSQL_PASSWORD`/`JWT_SECRET` 等只在本地/服务器,不在仓库。给 cc 时直接给私钥路径,勿粘贴进任何会提交的文件。

---
## 变更日志
| 版本 | 日期 | 摘要 |
|---|---|---|
| v1.0.0 | 2026-06-06 | 初版:SSH 接入 + prod/test 拓扑 + 部署序列 + 发版红线,汇总自 DEPLOY/release/prod-safety |
| v1.1.0 | 2026-06-07 | 推代码口径定为 rsync(/opt/chatsift 非 git 仓库,git pull 作废);补 plugin-downloads cp 步 + 无空格 key + SSH 管道迁移;prod VERSION→0.5.0(W17+W19 v0.5.0 发版确认) |
| v1.2.0 | 2026-06-12 | v0.6.6 发布隔离:新增统一入口 `release.sh --env test\|prod` + `check-env-isolation.sh`;plugin-downloads 独立于 admin/dist(PLUGIN_DOWNLOAD_DIR);test 全链路 `/opt/chatsift-test/{server,admin/dist,plugin-downloads}` 独立;旧手工序列降级为 legacy |
