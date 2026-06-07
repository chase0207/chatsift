const express = require('express')
const router     = express.Router()
const auth       = require('../middleware/auth')
const perm       = require('../middleware/permission')
const controller = require('../controllers/serviceAccountController')

router.use(auth)

router.get('/',                         perm('service-account:list'),   controller.list)
router.get('/employees',                perm('service-account:list'),   controller.employees)
router.get('/:id/assignments',          perm('service-account:list'),   controller.assignments)
router.post('/:id/assignments',         perm('service-account:update'), controller.assign)
router.delete('/:id/assignments/:employeeId', perm('service-account:update'), controller.unassign)
router.post('/:id/confirm',             perm('service-account:update'), controller.confirm)

module.exports = router
