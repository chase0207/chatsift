const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth')
const perm = require('../../middleware/permission')
const controller = require('../../controllers/v1/llmConfigController')

router.use(auth)

router.get('/', perm('llm:config'), controller.get)
router.put('/', perm('llm:config'), controller.put)

module.exports = router
