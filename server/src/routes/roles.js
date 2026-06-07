const express = require('express')
const router     = express.Router()
const auth       = require('../middleware/auth')
const perm       = require('../middleware/permission')
const controller = require('../controllers/roleController')

router.use(auth)

router.get('/options',       controller.options)  // 建用户角色下拉(auth 即可,按作用域)
router.get('/',              perm('role:list'),   controller.list)
router.post('/',             perm('role:create'), controller.create)
router.put('/:id',           perm('role:update'), controller.update)
router.delete('/:id',        perm('role:delete'), controller.remove)
router.get('/:id/permissions',   perm('role:list'),   controller.getPermissions)
router.put('/:id/permissions',   perm('role:update'), controller.setPermissions)

module.exports = router
