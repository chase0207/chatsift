const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth')
const controller = require('../../controllers/v1/eventsController')

router.use(auth)

router.post('/batch', controller.batch)
router.post('/heartbeat', controller.heartbeat)
router.get('/dom-adapter-config', controller.domAdapterConfig)

module.exports = router
