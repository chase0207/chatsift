const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth')
const controller = require('../../controllers/v1/serviceAccountsController')

router.use(auth)

// W20.1:采集权只读(登录员工自查本租户账号采集权;无 tenant_admin 管理权限要求)
router.get('/collect-permission', controller.collectPermission)

module.exports = router
