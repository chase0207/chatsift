const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth')
const perm = require('../../middleware/permission')
const controller = require('../../controllers/v1/leadsController')

router.use(auth)

router.get('/recent', perm('lead:manage'), controller.recent)
router.get('/', perm('lead:manage'), controller.list)
router.get('/:id', perm('lead:manage'), controller.detail)
router.patch('/:id', perm('lead:manage'), controller.update)
router.post('/:id/convert', perm('lead:manage'), controller.convert)

module.exports = router
