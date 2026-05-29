const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth')
const perm = require('../../middleware/permission')
const controller = require('../../controllers/v1/workordersController')

router.use(auth)

router.get('/', perm('workorder:handle'), controller.list)
router.get('/:id', perm('workorder:handle'), controller.detail)
router.patch('/:id', perm('workorder:handle'), controller.update)
router.post('/:id/assign', perm('workorder:assign'), controller.assign)

module.exports = router
