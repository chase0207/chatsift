# V1.9-QA Chaos 自动化脚本

> 配合 `docs/prd/2.0/V1.9-QA_执行手册.md` 使用。
> 覆盖 QA-1 / QA-3 / QA-6 / QA-7 自动化部分。
> QA-2 / QA-4 / QA-5 因依赖真实账号 / 服务端配合，仅提供半自动框架。

## 目录结构

```
scripts/chaos/
├── README.md                       本文件
├── _lib/
│   ├── chrome-setup.js             Playwright + 插件加载样板
│   ├── runtime-bootstrap.js        DevTools 注入"标准启动序列"
│   └── snapshot.js                 周期性 RpaV19DumpForBug 收集
├── reload.js                       QA-1 Reload Chaos
├── batch-burst.js                  QA-3 Batch Chaos
├── dom-storm.js                    QA-7 DOM Chaos
├── long-running.js                 QA-6 12h+ Long Running
└── regression/                     已发现 bug 的回归脚本（dev 持续添加）
    └── verify-chaos-QA-N-NNN.js
```

## 前置：安装 Playwright

由 qa-agent 在测试环境执行（dev-agent 仅产出脚本）：

```bash
cd /Users/caihongyang/vscode/chat_rpa
npm init -y  # 如果根目录无 package.json
npm install --save-dev playwright
npx playwright install chromium
```

或单独 admin 目录共用（如果已经有 vite 装的 chromium 可复用）。

## 通用约定

每个脚本：
- 启动一个 isolated chrome（带 plugin/ 解压扩展）
- 注入 standard bootstrap（Flag 全开 + ChaosMonitor.start + RuntimeManager.start）
- 执行 chaos 动作（reload / DOM mutation / network throttle / ...）
- 周期性 dump RpaV19DumpForBug 到 `scripts/chaos/_output/<scenario>-<ts>/`
- 退出时打印 violations 摘要

退出码：
- 0 = 期望的 chaos 完成且 chaos.violations 数符合预期
- 1 = 出现意外 violation（P0/P1 候选 bug）
- 2 = 脚本崩溃

## 与 verify-chaos-*.js 的区别

- `scripts/verify-*.js`：Node + DOM mock 接口级验证，**不依赖浏览器**
- `scripts/chaos/*.js`：Playwright + 真实 chrome，**依赖测试环境 + admin-test**
- `scripts/chaos/regression/*.js`：dev 修 bug 后写的回归脚本，**Node 级**，可在 CI 跑

## qa-agent 使用流程

```bash
# 1. 准备：手册 § 一 前置完成
# 2. 跑某一类 chaos
node scripts/chaos/reload.js --rounds=20 --admin-url=https://admin-test.kongyuekeji.com --account=test_qa_1

# 3. 检查输出
cat scripts/chaos/_output/reload-<ts>/summary.json
ls scripts/chaos/_output/reload-<ts>/dumps/

# 4. 发现 violation 时 → 按手册 § 四 Bug 报告流程
```

## dev-agent 添加 regression 脚本

收到 qa bug 报告后：
1. 在 `scripts/chaos/regression/verify-chaos-QA-N-NNN.js` 写 Node 级复现脚本
2. 现状 FAIL → 修代码 → PASS
3. verify-freeze.js 自动包含 regression 目录所有脚本，永久回归保护

参考已有 verify-*.js 风格。
