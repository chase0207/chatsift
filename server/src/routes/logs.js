const express    = require('express')
const router     = express.Router()
const auth       = require('../middleware/auth')
const controller = require('../controllers/logsController')

router.use(auth)
router.get('/messages',  controller.messages)
router.get('/transfers', controller.transfers)
router.get('/runtime',   controller.runtime)
router.post('/runtime',  controller.createRuntime)

module.exports = router
