# 发版流程(release.md)

> chatsift 发版用"手动按 checklist + 版本脚本辅助",不用全自动发版脚本。目标:稳定、安全、可追溯。
> 只有 **QA 身份(或用户亲自)** 能发版。
> 版本:v1.0.0 / 2026-06-04

---

## 1. 版本号规则

- `VERSION` 是单一真源,三段 semver `MAJOR.MINOR.PATCH`。**chatsift 独立 v0.x 版本线。**
- **W 大功能 → minor**(`0.x.0`);**补丁/小修复 → patch**(`0.x.y`)。
- 当前:W16 = v0.3.1;**W17 = v0.4.0**。
- `tools/dom-collector` 走独立版本线(1.0.0),不并入产品版本。

## 2. 版本号要同步哪些文件(第5条答案)

`VERSION` 改后,以下产品版本文件必须同步(用现有脚本,别手工):

```
VERSION(先改这个)
 ↓ bash scripts/sync-version.sh 自动同步:
server/package.json
server/package-lock.json
admin/package.json
admin/package-lock.json
plugin/manifest.json
 ↓ bash scripts/check-version.sh 校验一致
 ↓ 发版部署时还要手动同步:
生产 /opt/chatsift/VERSION   ← ★历史教训:曾漏掉(生产0.1.0 vs 代码0.3.1)
```

> 注:`tools/dom-collector/manifest.json` 是独立工具版本(1.0.0),**不**随产品版本同步。

## 3. 发版 checklist(QA 按此手动执行)

### 发版前
- [ ] `git status` 干净(无未提交/无关改动)
- [ ] `echo "0.4.0" > VERSION`
- [ ] `bash scripts/sync-version.sh`(同步版本文件)
- [ ] `bash scripts/check-version.sh`(校验一致,无报错)
- [ ] CHANGELOG.md 已加本版记录(变更 + 复盘)
- [ ] PROJECT_STATUS.md 发版记录表已加本版
- [ ] (大改动)test 已用 main 重部署、冒烟通过
- [ ] 数据契约/采集类改动:确认无意外行为

### 发版
- [ ] `git add -A && git commit -m "chore: release v0.4.0"`(发版改动单独提交,不混业务)
- [ ] `git tag v0.4.0`
- [ ] `git push origin main && git push origin v0.4.0`

### 生产部署(SSH 前先做环境确认,见 prod-safety.md)
- [ ] 备份生产数据库(`scripts/backup-mysql.sh` 或手动 dump,离机+验证可解压)
- [ ] rsync 同步代码到 /opt/chatsift(排除 .env / data/ / test compose)
- [ ] `cd /opt/chatsift/deploy && docker compose build server && docker compose up -d server`
- [ ] ★同步生产 VERSION:`echo "0.4.0" > /opt/chatsift/VERSION`(别漏)
- [ ] 验证:server 容器版本号、admin 侧边栏版本号、健康检查 200

### 发版后
- [ ] `git status` 干净;`git log --oneline -5` 确认 tag/commit 正确
- [ ] 回写 PROJECT_STATUS.md:当前版本、生产同步状态、数据库迁移实际执行到哪个 SQL

## 4. 发版硬规则(禁止打 tag 的情况)
- CHANGELOG.md 没有对应版本记录 → 禁止
- PROJECT_STATUS.md 没有对应发版记录 → 禁止
- 工作区有与发版无关的改动 → 禁止
- (大改动)test 冒烟未通过 → 禁止
- 打错 tag 修复:`git tag -d <错> && git push origin :refs/tags/<错>`,再重发

## 5. hotfix(P0/P1 生产故障)
- 从生产 tag 切 `hotfix/vX.X.X`,只修目标问题、不带无关改动,PATCH+1。
- 可豁免 test 预发,但生产验证不可豁免。修完 merge 回 main。

## 6. 现有脚本(已确认存在,可用)
- `scripts/sync-version.sh` — 同步版本号(以 VERSION 为准)
- `scripts/check-version.sh` — 校验版本一致
- `scripts/bump-version.sh` — 改版本号
- `scripts/backup-mysql.sh` — 备份数据库
- `scripts/release-prod.sh` — chat_rpa 遗留的全自动发版,**chatsift 不用它**(改用本文手动流程)

---

## 变更日志
| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0.0 | 2026-06-04 | 初版:手动发版流程 + 版本同步文件清单 + 硬规则 |
