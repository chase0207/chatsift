const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth')
const perm = require('../../middleware/permission')
const controller = require('../../controllers/v1/priceTableController')

router.use(auth)

router.get('/', perm('price:manage'), controller.list)
router.post('/', perm('price:manage'), controller.create)
router.post('/import', perm('price:manage'), controller.importRows)
router.patch('/:id', perm('price:manage'), controller.update)
router.delete('/:id', perm('price:manage'), controller.remove)

module.exports = router
