/**
 * V1.9-QA Chaos Playwright Chrome 启动样板
 *
 * 注意：本文件只是脚本框架。真实运行需要 qa 在测试环境先：
 *   npm install --save-dev playwright
 *   npx playwright install chromium
 *
 * dev-agent 不在 CI 跑这个，因为依赖 chrome + 真实账号 + admin-test 站点。
 */

'use strict'

const path = require('path')

let playwright = null
try {
  playwright = require('playwright')
} catch (_) {
  // 留给 qa-agent 在测试环境安装；这里允许导入失败，运行时才报错
}

const PLUGIN_DIR = path.join(__dirname, '..', '..', '..', 'plugin')

/**
 * 启动一个加载 V1.9 插件的 chrome（persistent context）
 * @param {Object} opts
 * @param {string} opts.userDataDir  独立 user-data-dir（建议每次 chaos 新建）
 * @param {boolean} opts.headless    是否 headless（chaos 调试时设 false）
 * @param {string[]} opts.targetUrls 初始打开的 url
 * @returns {Promise<{browser, page, close}>}
 */
async function launchWithPlugin(opts) {
  if (!playwright) {
    throw new Error(
      '[V1.9-QA chaos] playwright not installed.\n' +
      '  请在测试环境运行：npm install --save-dev playwright && npx playwright install chromium'
    )
  }
  opts = opts || {}
  const userDataDir = opts.userDataDir || path.join('/tmp', 'rpa-qa-v19-' + Date.now())
  const headless    = opts.headless === true
  const targetUrl   = (opts.targetUrls && opts.targetUrls[0]) || 'https://im.douyin.com/'

  const browser = await playwright.chromium.launchPersistentContext(userDataDir, {
    headless: headless,
    args: [
      `--disable-extensions-except=${PLUGIN_DIR}`,
      `--load-extension=${PLUGIN_DIR}`,
      '--no-default-browser-check',
      '--no-first-run',
    ],
  })

  const page = await browser.newPage()
  await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 })

  return {
    browser, page, userDataDir,
    close: async () => { try { await browser.close() } catch (_) {} },
  }
}

module.exports = { launchWithPlugin }
