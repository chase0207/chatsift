# 生产环境安全铁律(prod-safety.md)

> 这些规则来自实战事故(数据丢失)的教训,任何生产操作前必读。稳定、安全是底线。
> 版本:v1.1.0 / 2026-06-14

---

## 1. 唯一入口与目录
| 项 | 标准 |
|---|---|
| 平台/超管入口 | https://admin.kongyuekeji.com/ |
| 租户/员工入口 | https://mychat.kongyuekeji.com/ |
| 生产部署目录 | /opt/chatsift |
| 服务器 | 124.222.146.193 |
| Compose 目录 | /opt/chatsift/deploy |

- 禁止新建独立后台站点;IP 入口只能重定向到正式 HTTPS 域名。

## 2. ★SSH 到生产后,操作前必做环境确认★
```bash
hostname          # 确认在生产机
curl ifconfig.me  # 预期 124.222.146.193
docker ps         # 确认容器在运行
```

## 3. ★模型切换 / 上下文压缩后,必须重新确认环境★
模型切换(Sonnet↔Opus)、上下文压缩、新会话后,agent 可能丢失对运行环境的记忆。关键操作前:
```bash
pwd        # 在正确的项目目录?
hostname   # 在正确的机器?
git status # 工作区状态?
```

## 4. ★破坏性操作三问(rm -rf / DROP / 清空 / 数据迁移 前)★
1. 当前操作的是哪个环境?(本地/测试/生产)
2. 目标数据有备份吗?(离机 + 验证可解压)
3. 操作失误最坏后果?能接受吗?

| 操作 | 处理 |
|---|---|
| docker compose up -d / logs / rsync | 安全,无需二次确认 |
| docker compose down / stop | ⚠️ 影响可用性,需确认 |
| 修改 .env / 重启 MySQL | ⚠️ 需确认 |
| rm -rf / DROP TABLE / DROP DATABASE | 🚫 必须有备份确认 |

- 清空重采 / 数据迁移:执行端做备份+脚本+演练,**停在最后一步留用户在场 apply**。

## 5. 部署同步链路
```
本地 ~/vscode/chatsift → GitHub main + tag → 生产 /opt/chatsift
```
- 同步:admin/dist、server/src、server/sql、server/package*、deploy/
- **排除**:.env / .env.production、data/、test compose
- **data/ 红线**:`deploy/data/` 永不同步/覆盖/删除;**禁止同步/覆盖/删除生产 data/ 目录**(数据库数据在里面);test 与 prod 数据库配置禁互换;任何清库操作走 §4 破坏性操作三问。
- 新增 migration SQL 后,同步更新 prod/test compose 的 MySQL init 挂载列表

## 6. Compose 环境变量
执行 docker compose 前确认 `.env -> .env.production` 软链接存在:
```bash
cd /opt/chatsift/deploy
test -L .env && test "$(readlink .env)" = ".env.production"
```
环境变量为空 warning 下禁止继续 `docker compose up`。

## 7. test 环境(预发)
- test 跟随 main:大改动发生产前,先用 main 重部署 test、冒烟通过,再上生产。
- test 与 prod 资源隔离(端口/容器名/数据库名/数据卷/域名都不同),JWT_SECRET 与 prod 不同。
- 禁止同步/覆盖 test 数据目录;禁止 test/prod 数据库配置互换。

## 8. 备份
- 破坏性操作前,数据库全量 dump → 下载离机 → 验证可解压(不是 dump 完就算)。
- 备份脚本:`scripts/backup-mysql.sh`。

---

## 变更日志
| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.1.0 | 2026-06-14 | §5 补全 data/ 红线唯一正文,承接 server-access/deploy 副本归一 |
| v1.0.0 | 2026-06-04 | 初版:唯一入口/环境确认/模型切换重确认/破坏性三问/同步链路/test |
