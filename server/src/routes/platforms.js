const express        = require('express')
const router         = express.Router()
const auth           = require('../middleware/auth')
const requirePermission = require('../middleware/permission')
const controller     = require('../controllers/platformController')

router.use(auth)
router.get('/',       controller.list)
router.post('/',      requirePermission('platform:create'),  controller.create)
router.put('/:id',    requirePermission('platform:update'),  controller.update)
router.delete('/:id', requirePermission('platform:delete'),  controller.remove)

module.exports = router
