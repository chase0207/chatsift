const express = require('express')
const router     = express.Router()
const auth       = require('../middleware/auth')
const perm       = require('../middleware/permission')
const controller = require('../controllers/serviceAccountController')

router.use(auth)

router.get('/',                         perm('service-account:list'),   controller.list)
router.get('/employees',                perm('service-account:list'),   controller.employees)

// 查看权(service_account_view):新 /views 端点 + 旧 /assignments 别名(同处理函数,均操作 view 表)
router.get('/:id/views',                perm('service-account:list'),   controller.assignments)
router.post('/:id/views',               perm('service-account:update'), controller.assign)
router.delete('/:id/views/:employeeId', perm('service-account:update'), controller.unassign)
router.get('/:id/assignments',          perm('service-account:list'),   controller.assignments)
router.post('/:id/assignments',         perm('service-account:update'), controller.assign)
router.delete('/:id/assignments/:employeeId', perm('service-account:update'), controller.unassign)

// 确认 / 采集权重分配 / 停用·恢复 / 冲突记录
router.post('/:id/confirm',             perm('service-account:update'), controller.confirm)
router.put('/:id/collector',            perm('service-account:update'), controller.reassignCollector)
router.put('/:id/disable',              perm('service-account:update'), controller.disable)
router.put('/:id/enable',               perm('service-account:update'), controller.enable)
router.get('/:id/conflicts',            perm('service-account:list'),   controller.conflicts)

module.exports = router
