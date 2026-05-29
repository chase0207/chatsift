const express = require('express');
const router = express.Router();
const auth   = require('../middleware/auth');
const authController = require('../controllers/authController');

router.post('/login',          authController.login);
router.post('/verify',         authController.verify);
router.post('/refresh',        authController.refresh);
router.post('/logout',         authController.logout);
router.get('/userinfo',  auth, authController.userinfo);

module.exports = router;
