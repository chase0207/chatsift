const express = require('express')
const router     = express.Router()
const auth       = require('../middleware/auth')
const perm       = require('../middleware/permission')
const controller = require('../controllers/tenantController')

router.use(auth)

router.get('/',          perm('tenant:list'),   controller.list)
router.get('/options',   perm('tenant:list'),   controller.options)
router.post('/',         perm('tenant:create'), controller.create)
router.put('/:id',       perm('tenant:update'), controller.update)
router.delete('/:id',    perm('tenant:delete'), controller.remove)

module.exports = router
