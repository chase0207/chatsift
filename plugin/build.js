// TODO V2.0: 构建清单需要按 chatsift 新的模块列表调整
/**
 * build.js — V2.x content.js concat 构建脚本
 *
 * ADR-004: 禁止 webpack/vite/esbuild，使用纯 concat。
 * 理由: DOM-RPA 调试优先，DevTools 可读，无 source map 问题。
 *
 * 用法:
 *   node build.js            # 生成 content.js
 *   node build.js --dry-run  # 只打印模块列表，不写文件
 *   node build.js --check    # 语法检查生成产物
 *
 * 注意: 当前 V1.x 主逻辑仍在 content_legacy.js 中。
 * M1 开始后逐步将平台适配器迁移到 runtime/ 模块，
 * 迁移完成后移除 content_legacy.js。
 */

'use strict'

const fs   = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const DRY_RUN = process.argv.includes('--dry-run')
const CHECK   = process.argv.includes('--check')
const ROOT    = __dirname

// ── 模块加载顺序（严格按依赖顺序排列）───────────────────────────────
//
// 阶段注释说明哪个 milestone 负责该文件，方便追踪。
// 文件不存在时跳过并打印警告，不中断构建。
//
const MODULES = [
  // ── V1.9 shared（无依赖，必须最先加载）──────────────────────────
  'shared/content-gate.js',               // W20-preflight: 平台页面 URL 白名单 gate
  'shared/constants.js',                  // M1: RuntimeState / LK / Stage / Status / FeatureFlagDefaults
  'shared/hash.js',                       // M1: fnv32 / fnv64 / joinAndHash
  'shared/logger.js',                     // M1: console 包装
  'shared/dom-utils.js',                  // W4: DOM / XPath / 合成 message_id

  // ── V1.9 Runtime 基础（依赖 shared）─────────────────────────
  'runtime/feature-flags.js',             // M1: Feature Flag 中心（必须在 adapter-registry 之前）
  'runtime/runtime-state-machine.js',     // M1: 状态机（依赖 RpaConstants）
  'runtime/lk-tracer.js',                 // M1: LK Trace
  'runtime/adapter-registry.js',          // W5: Adapter 注册与采集分发
  'runtime/batch-manager.js',             // M2+M4: batch 状态机 + stable_wait
  'runtime/queue-manager.js',             // M2: 调度队列
  'runtime/event-queue.js',               // W4: 新采集链路事件队列
  'runtime/event-collector.js',           // W4: 本地去重 + 入队
  'runtime/event-uploader.js',            // W4: 批量上报 /api/v1/events/batch
  'runtime/watchdog.js',                  // M2: 看门狗
  'runtime/recovery-manager.js',          // M2: reload 恢复
  'runtime/session-identity-resolver.js', // M3: session_id 提取器
  'shared/adapter-helpers.js',            // M3: adapter 辅助方法（依赖 session-identity-resolver）

  'runtime/runtime-manager.js',           // M1+M2: legacy runtime 骨架保留

  // ── 历史 runtime（评估去留）──────────────────────────────────────
  'runtime/session-parser.js',
  'runtime/session-detector.js',
  'runtime/diff-engine.js',

  // ── Adapters（实际平台实现 / STUB）──────────────────────────────
  'adapters/douyin/laike-message.adapter.js',
  'adapters/douyin/private-message.adapter.js',
  'adapters/douyin/feige.adapter.js',
  'adapters/xiaohongshu/private-message.adapter.js',
  'adapters/kuaishou/customer-service.adapter.js',
  'adapters/meituan/jingyingbao.adapter.js',

  'runtime/position-tracker.js',          // W17: 锚点窗口 position(legacy-collector 依赖,须在其前)
  'runtime/legacy-collector.js',          // W4: flag 切换到只读采集链路

  // ── M6 自检脚本（最后注册，便于 DevTools 一行调用） ──────────────
  'runtime/self-check.js',

  // ── V1.9-QA Chaos Monitor（不变量哨兵，默认关，DevTools 显式 start） ─
  'runtime/chaos-monitor.js',

  // ── V1.9-QA Bug Dump（一键收集 9 类快照，DevTools 调用） ─────────
  'runtime/bug-dump.js',

  // ── V1.9-QA RPC Bridge（chrome.runtime.onMessage 桥，Playwright/main-world 调用） ─
  'runtime/rpc-bridge.js',
]

// ── 构建 ─────────────────────────────────────────────────────────

function build() {
  if (DRY_RUN) {
    console.log('[dry-run] 模块列表（按 concat 顺序）:')
    MODULES.forEach(m => {
      const exists = fs.existsSync(path.join(ROOT, m))
      console.log(` ${exists ? '✓' : '✗ (缺失)'}  ${m}`)
    })
    return
  }

  let output = ''
  let loaded = 0

  for (const file of MODULES) {
    const fullPath = path.join(ROOT, file)
    if (!fs.existsSync(fullPath)) {
      console.warn(`[warn] 跳过（文件不存在）: ${file}`)
      continue
    }
    output += `\n// ${'='.repeat(60)}\n`
    output += `// MODULE: ${file}\n`
    output += `// ${'='.repeat(60)}\n\n`
    output += fs.readFileSync(fullPath, 'utf8').trimEnd()
    output += '\n'
    loaded++
  }

  const outPath = path.join(ROOT, 'content.js')
  fs.writeFileSync(outPath, output, 'utf8')
  console.log(`[build] content.js 已生成  模块=${loaded}  大小=${(output.length / 1024).toFixed(1)}KB`)

  if (CHECK) {
    try {
      execSync(`node --check "${outPath}"`, { stdio: 'inherit' })
      console.log('[check] 语法检查通过')
    } catch {
      console.error('[check] 语法错误，请检查 content.js')
      process.exit(1)
    }
  }
}

build()
