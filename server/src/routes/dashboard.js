const express    = require('express')
const path       = require('path')
const fs         = require('fs')
const router     = express.Router()
const auth       = require('../middleware/auth')
const perm       = require('../middleware/permission')
const controller = require('../controllers/dashboardController')

router.use(auth)

router.get('/stats', perm('dashboard'), controller.stats)

// v0.6.6 test/prod 发布隔离: 插件下载目录优先读 PLUGIN_DOWNLOAD_DIR(compose 按环境注入),
// 未配置则 fallback 到 public/plugin-downloads(本地开发/旧行为,prod 未注入时不变 → 安全)。
function pluginDownloadDir() {
  return process.env.PLUGIN_DOWNLOAD_DIR || path.join(__dirname, '../..', 'public', 'plugin-downloads')
}

// 插件更新信息
router.get('/plugin-update', function (req, res) {
  var metaPath = path.join(pluginDownloadDir(), 'metadata.json')
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
  var dir = pluginDownloadDir()
  var metaPath = path.join(dir, 'metadata.json')
  try {
    if (!fs.existsSync(metaPath)) {
      return res.status(404).json({ code: 404, message: '暂无下载文件' })
    }
    var meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    // 防路径穿越: 只取 basename, 解析后必须仍在 dir 内
    var zipName = path.basename(String(meta.zipName || ''))
    var zipPath = path.resolve(dir, zipName)
    if (!zipName || zipPath.indexOf(path.resolve(dir) + path.sep) !== 0 || !fs.existsSync(zipPath)) {
      return res.status(404).json({ code: 404, message: '文件不存在' })
    }
    var filename = encodeURIComponent(zipName)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + filename)
    res.setHeader('Content-Length', fs.statSync(zipPath).size)
    fs.createReadStream(zipPath).pipe(res)
  } catch (err) {
    res.status(500).json({ code: 500, message: '下载失败' })
  }
})

module.exports = router
