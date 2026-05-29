const express = require('express')
const router     = express.Router()
const auth       = require('../middleware/auth')
const perm       = require('../middleware/permission')
const controller = require('../controllers/menuController')

router.use(auth)

router.get('/tree',          controller.tree)         // 面向前端无权限要求
router.get('/',              perm('menu:list'),   controller.list)
router.post('/',             perm('menu:create'), controller.create)
router.put('/:id',           perm('menu:update'), controller.update)
router.delete('/:id',        perm('menu:delete'), controller.remove)

module.exports = router
