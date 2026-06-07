---
文档: chatsift 仓库管理 + 发版规范 (OPS)
版本: v1.0.0
状态: 待确认(方案稿,确认后据此生成 VERSION/脚本/compose)
来源: 调研 chat_rpa(docs/git-workflow.md + scripts/*.sh + 2026-05-21 事故复盘)后,按 chatsift 实际改编
日期: 2026-06-02
---

## 变更日志

| 版本 | 日期 | 变更摘要 | 触发来源 |
|---|---|---|---|
| v1.0.0 | 2026-06-02 | 初版:仓库管理 + 发版规范 + 环境安全(改编自 chat_rpa) | 用户任务(调研 chat_rpa 定规范) |

> 本文是**规范方案**,不含可运行脚本。确认后再按本文生成 `VERSION` / `scripts/*` / `deploy/*`(见 DEPLOY.md 配置清单)。
> chatsift 只有三件套 **plugin / server / admin**(无 chat_rpa 的 dom-collector);最高红线"永不发送"见 HANDOVER §1。

---

## 1. 仓库管理

### 1.1 分支与提交
- **单 `main` 主干开发**,AI 主导、迭代快。实验性大改才开 feature 分支,完成后合回。
- **改完即提交**,不攒到发版;每次会话结束 `git status` 必须干净(有积压先问 Chase 再分类提交)。
- 禁止 `main` force push(会破坏 release tag 历史)。tag 只由发版脚本打,不手工 `git tag`。
- chatsift 当前**无 git remote**,需新建 GitHub 仓库(建议 `chase0207/chatsift`)并 `git push -u origin main`。

### 1.2 Commit message
- 格式:`<type>: <50字以内主语句>`,可空一行后多行说明"为什么"。
- type:`feat` / `fix` / `chore`(发版/构建/脚本) / `docs` / `refactor` / `style` / `test`。
- 沿用本仓库已有习惯,如 `fix(W12.6): ...` 这种带周次的也保留。
- 反例(禁止):`update files`、`fix bug`、只写文件名不写原因。
- 结尾按 Claude Code 约定附 `Co-Authored-By` 行。

### 1.3 特殊文件归属(发版相关)
| 文件 | 谁能改 | 何时提交 |
|---|---|---|
| `VERSION` | 只有 `release` 脚本 | 发版时自动改并提交,禁手工 |
| `CHANGELOG.md` | 只有 `release` 脚本 | 发版时自动 |
| `docs/architecture/*`(design+tasks) | 设计阶段产出 | 改完即提交 |
| `docs/reports/*`(验收/诊断) | 验收阶段产出 | 改完即提交 |
| `CLAUDE.md` / `docs/*.md` 规范类 | 任何人可补 | 单独 commit,不混业务代码 |

### 1.4 GitHub 提交 vs 服务器同步(边界)
GitHub 存"可复现项目所需";服务器只部署"运行所需"。不要混为一类。

| 类型 | 示例 | GitHub | 服务器 |
|---|---|---|---|
| 运行代码 | `server/src/`、`admin/src/`、`plugin/`(源 + `content.js` 产物) | 提交 | 同步运行所需 / 构建产物 |
| 数据库结构 | `server/sql/` | 提交 | 同步(init 挂载) |
| 构建/部署 | `scripts/`、`server/Dockerfile`、`deploy/*.yml` | 提交 | 只同步部署所需 |
| 项目文档 | `docs/`、`CLAUDE.md`、`README.md`、本文 | 提交 | **不同步** |
| 敏感/产物 | `.env*`、`node_modules/`、`admin/dist/`、`deploy/data/` | **不提交** | 不同步(`admin/dist` 仅作构建产物按需推到静态目录) |

> 注:chatsift 的 LLM key **不进 .env、不进 compose**,而是各租户在后台写入 `tenant_llm_config` 表(与 chat_rpa 把 `DEEPSEEK_API_KEY` 放 env 不同)。生产环境 env 无需 LLM key。

---

## 2. 版本与发版

### 2.1 版本号单一真源
- 根目录 `VERSION` 文件(纯 `x.y.z`,SemVer)是唯一真源,chatsift 从 **`0.1.0`** 起(对齐当前 plugin manifest 0.1.0;现 server/admin package.json 是 0.0.1,需对齐)。
- 由 `scripts/sync-version.sh` 同步到:`server/package.json`(+lock)、`admin/package.json`(+lock)、`plugin/manifest.json`。**无 dom-collector**(chat_rpa 有,chatsift 删)。
- `scripts/check-version.sh` 校验上述全部一致 + **SQL 文件数 == compose init 挂载数**(prod 与 test 两个 compose 都要等于 `server/sql/*.sql` 数量)。不一致发版即拦。

### 2.2 唯一发版入口
- `scripts/release-prod.sh` 是**唯一发版入口**,门禁 `RELEASE_ACTOR=qa`(对齐 chat_rpa 的 actor 门禁,名称可定)。一条龙:
  1. `bump-version.sh` 改 `VERSION` + sync 到三件套
  2. `npm run build:plugin`(生成 content.js)
  3. `npm run build:admin`(版本号内联进 JS)
  4. 写 `CHANGELOG.md` + `PROJECT_STATUS.md`(发版记录)
  5. `check-version.sh` 校验
  6. 打 tag `vX.Y.Z`
- 发版前工作区必须 clean;发版后 `git push && git push --tags`。
- 禁止手工改 `VERSION`、手工打 tag、绕过脚本拼装。

### 2.3 数据库迁移约定(现在就立规矩)
- chatsift 现在只有 `server/sql/00_reused_tables.sql` + `v1-schema.sql`,**还没有 migration 链**。
- 今后**只增不改**:新增结构写 `server/sql/NN_xxx.sql`(序号递增),并**同步在 prod/test 两个 compose 的 init 挂载列表追加一行**,`check-version.sh` 保证三者数量一致。
- 已上线的 SQL 文件不回改(已灌库的库不会重跑 init)。

### 2.4 双环境发版流程
```
dev 改 → commit → 部署 test(冒烟通过)→ release-prod.sh → 部署 prod(冒烟通过)
```
- 冒烟脚本放 `scripts/qa/`(现为空目录),覆盖:登录、events/batch 入库、五引擎跑通、四页接口 200、漏斗、提醒接口。
- hotfix:从 prod tag 切 `hotfix/vX.Y.Z`,豁免 test 卡点,但 prod 冒烟必须过;稳定后合回 main 并补 test。

---

## 3. 环境安全(继承 chat_rpa 2026-05-21 生产数据丢失教训)

> chat_rpa 曾因 AI 误判环境、`rm -rf deploy/data/mysql` 且无备份,导致生产数据全丢。chatsift 直接继承护栏,不重蹈。

### 3.1 破坏性操作三问
执行 `rm -rf` / `DROP DATABASE` / 清 `data/` / 重置密码 / 重启生产 MySQL 前,先答:
1. 当前是哪个环境?(本地 / 生产 / 测试)
2. 目标数据有备份吗?备份在哪?
3. 操作失误最坏后果?能接受吗?

### 3.2 环境识别(每次关键操作/模型切换/新会话后重确认)
| 特征 | 本地 | 生产 |
|---|---|---|
| 目录 | `~/vscode/chatsift` | `/opt/chatsift` |
| 主机名 | 本机名 | `chatsift-prod`(重置后设定) |
| 外网 IP | 本地 | 服务器公网 IP |
| `docker ps` | 可能无容器 | 有 `chatsift-mysql` + `chatsift-server` |

```bash
pwd; hostname; curl -s ifconfig.me; git status   # 关键操作前先跑
```

### 3.3 生产操作白名单
- 直接可做:`docker compose up -d` / `logs` / `restart` / `rsync` 代码。
- 需二次确认:`docker compose down`/`stop`、`rm -rf`、`DROP ...`、改 `.env.production`、重启 MySQL。
- 涉及产品判断(口径/红线/新功能)按 COLLABORATION.md 的 B/C 类,先报 Chase。

### 3.4 备份是硬要求(不是可选项)
- 生产 MySQL 每日 `mysqldump` + 下载离机(腾讯云 COS 或本地),保留 ≥30 天。
- `deploy/data/` 绝不同步、不覆盖、不删除。
- 重置/迁移服务器前,先备份再动手(见 DEPLOY.md §2)。

---

## 4. 红线相关的发版卡点
- 发版脚本/冒烟中加一条只读检查:确认插件**无激活发送路径**——`plugin/shared/constants.js` 的 `send_runtime_v19` 默认 `false`、adapter 无被调用的发送方法。任何使其为 true 或新增发送入口的改动属红线,先报 Chase(见 HANDOVER §1)。

---

## 5. 与现有协作协议的关系
- 本文是"工程/运维层"规范;产品/设计层的 A/B/C 变更分级、文档纪律见 `docs/COLLABORATION.md` 与 `docs/chatsift_HANDOVER.md`。
- 二者不冲突:涉及发版/服务器的动作,既遵守本文的技术护栏,也遵守 COLLABORATION 的"B/C 先报 Chase"。
