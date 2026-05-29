/**
 * V1.9-QA Chaos 注入控制端点
 *
 * 路由前缀：/api/_chaos
 *
 * 安全：仅 NODE_ENV !== 'production' 时由 app.js 挂载。
 *
 * 端点：
 *   POST /api/_chaos/inject-delay    { endpoint, delay_ms, ratio? }
 *   POST /api/_chaos/inject-failure  { endpoint, error_code?, error_message?, ratio? }
 *   POST /api/_chaos/inject-drop     { endpoint, ratio? }
 *   GET  /api/_chaos/rules
 *   DELETE /api/_chaos/rules         （清空全部）
 *   DELETE /api/_chaos/rules/:id     （删单条）
 *
 * 注：不挂 auth 中间件 —— chaos 测试需要可任意调用；仅 dev 环境可达。
 */

'use strict'

const express = require('express')
const router  = express.Router()
const chaos   = require('../middleware/chaos')

router.post('/inject-delay',    express.json(), chaos.injectDelay)
router.post('/inject-failure',  express.json(), chaos.injectFailure)
router.post('/inject-drop',     express.json(), chaos.injectDrop)
router.get('/rules',            chaos.listRules)
router.delete('/rules',         chaos.clearRules)
router.delete('/rules/:id',     chaos.removeRule)

module.exports = router
