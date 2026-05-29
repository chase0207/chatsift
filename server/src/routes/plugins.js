const express    = require('express')
const router     = express.Router()
const auth       = require('../middleware/auth')
const requirePermission = require('../middleware/permission')
const controller = require('../controllers/pluginController')

router.use(auth)
router.get('/',       requirePermission('plugin:list'),    controller.list)
router.post('/',      requirePermission('plugin:create'),  controller.create)
router.put('/:id',    requirePermission('plugin:update'),  controller.update)
router.delete('/:id', requirePermission('plugin:delete'),  controller.remove)

module.exports = router
