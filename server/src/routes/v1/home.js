const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth')
const controller = require('../../controllers/v1/homeController')

router.use(auth)

router.get('/', controller.home)

module.exports = router
