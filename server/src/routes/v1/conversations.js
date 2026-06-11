const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth')
const perm = require('../../middleware/permission')
const controller = require('../../controllers/v1/conversationsController')

router.use(auth)

router.get('/', perm('conversation:list'), controller.list)
router.get('/facets', perm('conversation:list'), controller.facets)
// v0.6.5:冷启动 re-align 只读接口。★必须在 /:id 之前注册,否则 'position-state' 会被当作 :id 吞掉。
router.get('/position-state', perm('conversation:list'), controller.positionState)
router.get('/:id', perm('conversation:list'), controller.detail)
router.get('/:id/messages', perm('conversation:list'), controller.messages)

module.exports = router
