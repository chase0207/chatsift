const express    = require('express')
const router     = express.Router()
const auth       = require('../middleware/auth')
const controller = require('../controllers/configController')

router.use(auth)
router.get('/:pluginId/:platform',  controller.getConfig)
router.put('/:pluginId/:platform',  controller.saveConfig)

module.exports = router
