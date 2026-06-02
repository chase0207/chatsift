const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth')
const perm = require('../../middleware/permission')
const controller = require('../../controllers/v1/conversationsController')

router.use(auth)

router.get('/', perm('conversation:list'), controller.list)
router.get('/facets', perm('conversation:list'), controller.facets)
router.get('/:id', perm('conversation:list'), controller.detail)
router.get('/:id/messages', perm('conversation:list'), controller.messages)

module.exports = router
