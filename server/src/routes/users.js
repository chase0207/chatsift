const express = require('express')
const router     = express.Router()
const auth       = require('../middleware/auth')
const perm       = require('../middleware/permission')
const controller = require('../controllers/userController')
const colPref    = require('../controllers/columnPrefController')

router.use(auth)

router.get('/column-prefs/:pageKey', colPref.get)
router.put('/column-prefs/:pageKey', colPref.set)

router.get('/',     perm('user:list'),   controller.list)
router.post('/',    perm('user:create'), controller.create)
router.put('/:id',  perm('user:update'), controller.update)
router.delete('/:id', perm('user:delete'), controller.remove)

module.exports = router
