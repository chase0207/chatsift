const pool = require('../config/db')

// GET /api/pages?platform_id=X
async function list(req, res) {
  const { platform_id } = req.query
  if (!platform_id) return res.status(400).json({ code: 400, message: 'platform_id 不能为空' })
  try {
    const [rows] = await pool.query(
      'SELECT id, platform_id, page_name, url, sort_order FROM platform_pages WHERE platform_id = ? ORDER BY sort_order ASC, id ASC',
      [platform_id]
    )
    res.json({
      code: 0,
      data: rows.map((row) => ({
        ...row,
        page_code: String(row.id),
      })),
    })
  } catch (err) {
    console.error('[page.list]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// POST /api/pages
async function create(req, res) {
  const { platform_id, page_name, url, sort_order = 0 } = req.body
  if (!platform_id || !page_name || !url) {
    return res.status(400).json({ code: 400, message: 'platform_id、page_name、url 不能为空' })
  }
  try {
    const cleanedUrl = stripUrlParams(url)
    const [result] = await pool.query(
      'INSERT INTO platform_pages (platform_id, page_name, url, sort_order) VALUES (?,?,?,?)',
      [platform_id, page_name.trim(), cleanedUrl, sort_order]
    )
    res.json({ code: 0, data: { id: result.insertId } })
  } catch (err) {
    console.error('[page.create]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// PUT /api/pages/:id
async function update(req, res) {
  const id = parseInt(req.params.id)
  const { page_name, url, sort_order } = req.body
  if (!page_name || !url) return res.status(400).json({ code: 400, message: 'page_name、url 不能为空' })
  try {
    const cleanedUrl = stripUrlParams(url)
    const [{ affectedRows }] = await pool.query(
      'UPDATE platform_pages SET page_name = ?, url = ?, sort_order = ? WHERE id = ?',
      [page_name.trim(), cleanedUrl, sort_order ?? 0, id]
    )
    if (!affectedRows) return res.status(404).json({ code: 404, message: '页面不存在' })
    res.json({ code: 0, message: '更新成功' })
  } catch (err) {
    console.error('[page.update]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// DELETE /api/pages/:id
async function remove(req, res) {
  try {
    const [{ affectedRows }] = await pool.query('DELETE FROM platform_pages WHERE id = ?', [req.params.id])
    if (!affectedRows) return res.status(404).json({ code: 404, message: '页面不存在' })
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    console.error('[page.remove]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

function stripUrlParams(url) {
  try {
    const hasProtocol = /^https?:\/\//i.test(url)
    const fullUrl = hasProtocol ? url : 'https://' + url
    const parsed = new URL(fullUrl)
    // 保留 protocol + host + path，只去掉 ? 和 # 后面的部分
    var result = parsed.protocol + '//' + parsed.hostname
    if (parsed.pathname && parsed.pathname !== '/') {
      result += parsed.pathname.replace(/\/+$/, '')
    }
    return result
  } catch {
    return url.trim()
  }
}

module.exports = { list, create, update, remove }
