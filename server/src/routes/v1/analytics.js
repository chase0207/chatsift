const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth')
const perm = require('../../middleware/permission')
const controller = require('../../controllers/v1/analyticsController')

router.use(auth)

router.get('/funnel', perm('analytics:view'), controller.funnel)
router.get('/intent-distribution', perm('analytics:view'), controller.intentDistribution)
router.get('/lead-level', perm('analytics:view'), controller.leadLevel)
router.get('/by-page', perm('analytics:view'), controller.byPage)
router.get('/trend', perm('analytics:view'), controller.trend)

module.exports = router
