const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth')
const perm = require('../../middleware/permission')
const controller = require('../../controllers/v1/analyticsController')

router.use(auth)

router.get('/funnel', perm('conversation:list'), controller.funnel)
router.get('/platform-comparison', perm('conversation:list'), controller.platformComparison)

module.exports = router
