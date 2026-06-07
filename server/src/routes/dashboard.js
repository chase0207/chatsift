const express    = require('express')
const path       = require('path')
const fs         = require('fs')
const router     = express.Router()
const auth       = require('../middleware/auth')
const perm       = require('../middleware/permission')
const controller = require('../controllers/dashboardController')

router.use(auth)

router.get('/stats', perm('dashboard'), controller.stats)

// 插件更新信息
router.get('/plugin-update', function (req, res) {
  var metaPath = path.join(__dirname, '../..', 'public', 'plugin-downloads', 'metadata.json')
  try {
    if (!fs.existsSync(metaPath)) {
      return res.json({ code: 0, data: null })
    }
    var meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    res.json({ code: 0, data: meta })
  } catch (err) {
    res.json({ code: 0, data: null })
  }
})

// 插件下载
router.get('/plugin-update/download', function (req, res) {
  var metaPath = path.join(__dirname, '../..', 'public', 'plugin-downloads', 'metadata.json')
  try {
    if (!fs.existsSync(metaPath)) {
      return res.status(404).json({ code: 404, message: '暂无下载文件' })
    }
    var meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    var zipPath = path.join(__dirname, '../..', 'public', 'plugin-downloads', meta.zipName)
    if (!fs.existsSync(zipPath)) {
      return res.status(404).json({ code: 404, message: '文件不存在' })
    }
    var filename = encodeURIComponent(meta.zipName)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + filename)
    res.setHeader('Content-Length', fs.statSync(zipPath).size)
    fs.createReadStream(zipPath).pipe(res)
  } catch (err) {
    res.status(500).json({ code: 500, message: '下载失败' })
  }
})

module.exports = router
