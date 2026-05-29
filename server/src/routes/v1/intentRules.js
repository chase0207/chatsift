const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth')
const perm = require('../../middleware/permission')
const controller = require('../../controllers/v1/intentRulesController')

router.use(auth)

router.get('/', perm('intent-rule:config'), controller.list)
router.post('/', perm('intent-rule:config'), controller.create)
router.patch('/:id', perm('intent-rule:config'), controller.update)
router.delete('/:id', perm('intent-rule:config'), controller.remove)

module.exports = router
