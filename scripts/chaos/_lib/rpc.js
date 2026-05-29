/**
 * V1.9-QA Playwright RPC 包装
 *
 * Chrome Extension content script 跑在 isolated world，Playwright 的
 * page.evaluate() 跑在 main world，无法直接访问 window.RpaXxx。
 *
 * 通过 service worker（MV3 background）的 chrome.tabs.sendMessage 转发到
 * content script 的 V19_RPC handler（plugin/runtime/rpc-bridge.js）。
 *
 * 用法：
 *   const { setupRpc } = require('./_lib/rpc')
 *   const rpc = await setupRpc(ctx, page)
 *   const sc = await rpc('selfcheck.run')
 *   await rpc('flag.unlock', 'send_runtime_v19')
 */

'use strict'

async function setupRpc(ctx, page) {
  // 等 service worker
  let sw = ctx.serviceWorkers()[0]
  if (!sw) {
    sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 })
  }

  // 找当前 page 对应的 tab id
  const pageUrl = page.url()
  const tabs = await sw.evaluate(async (url) => {
    const list = await chrome.tabs.query({})
    return list.filter(t => t.url === url).map(t => ({ id: t.id, url: t.url }))
  }, pageUrl)
  if (!tabs.length) throw new Error('[V19 RPC] cannot find tab for ' + pageUrl)
  const tabId = tabs[0].id

  // 返回 rpc 函数 + 工具
  async function call(method, args) {
    const resp = await sw.evaluate(async ({ tabId, method, args }) => {
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: 'V19_RPC', method, args }, (r) => {
          resolve(r || { ok: false, error: 'no response (sendResponse never called)' })
        })
      })
    }, { tabId, method, args })
    if (!resp.ok) {
      throw new Error(`[V19 RPC] ${method} failed: ${resp.error}`)
    }
    return resp.result
  }

  call.tabId = tabId
  call.serviceWorker = sw
  call.refreshTabId = async () => {
    const pageUrl = page.url()
    const tabs = await sw.evaluate(async (url) => {
      const list = await chrome.tabs.query({})
      return list.filter(t => t.url === url).map(t => ({ id: t.id, url: t.url }))
    }, pageUrl)
    if (tabs.length) call.tabId = tabs[0].id
  }

  return call
}

module.exports = { setupRpc }
