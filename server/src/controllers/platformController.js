const pool = require('../config/db')
const { normalizePlatformKey, extractDetectHosts } = require('../utils/platforms')

// GET /api/platforms
async function list(req, res) {
  try {
    const { enabled } = req.query
    let sql = 'SELECT id, platform_name, platform_key, url, enabled, dom_status, sort_order, created_at FROM platforms'
    const params = []
    if (enabled !== undefined) {
      sql += ' WHERE enabled = ?'
      params.push(parseInt(enabled))
    }
    sql += ' ORDER BY sort_order ASC, id ASC'
    const [rows] = await pool.query(sql, params)

    // 批量查询每个平台的页面
    const ids = rows.map(r => r.id)
    const pagesMap = {}
    if (ids.length) {
      const [pages] = await pool.query(
        'SELECT id, platform_id, page_name, url, sort_order FROM platform_pages WHERE platform_id IN (?) ORDER BY sort_order ASC, id ASC',
        [ids]
      )
      pages.forEach(p => {
        if (!pagesMap[p.platform_id]) pagesMap[p.platform_id] = []
        pagesMap[p.platform_id].push(p)
      })
    }

    res.json({
      code: 0,
      data: rows.map((row) => ({
        ...row,
        platform_code: normalizePlatformKey(row.platform_key),
        runtime_key: normalizePlatformKey(row.platform_key),
        detect_hosts: extractDetectHosts(row.url),
        pages: (pagesMap[row.id] || []).map((page) => ({
          ...page,
          page_code: String(page.id),
          detect_hosts: extractDetectHosts(page.url),
        })),
      })),
    })
  } catch (err) {
    console.error('[platform.list]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// POST /api/platforms
async function create(req, res) {

  const { platform_name, platform_key, url, enabled = 1, sort_order = 0 } = req.body
  if (!platform_name || !platform_key || !url) {
    return res.status(400).json({ code: 400, message: 'platform_name、platform_key、url 不能为空' })
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO platforms (platform_name, platform_key, url, enabled, sort_order) VALUES (?,?,?,?,?)',
      [platform_name, platform_key.trim().toLowerCase(), url, enabled, sort_order]
    )
    res.json({ code: 0, data: { id: result.insertId } })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ code: 400, message: '平台标识码已存在' })
    }
    console.error('[platform.create]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// PUT /api/platforms/:id
async function update(req, res) {

  const { id } = req.params
  try {
    const fields = []
    const values = []
    const { platform_name, url, enabled, dom_status, sort_order } = req.body
    if (platform_name !== undefined) { fields.push('platform_name = ?'); values.push(platform_name) }
    if (url           !== undefined) { fields.push('url = ?');           values.push(url) }
    if (enabled       !== undefined) { fields.push('enabled = ?');       values.push(enabled) }
    if (dom_status    !== undefined) { fields.push('dom_status = ?');    values.push(dom_status) }
    if (sort_order    !== undefined) { fields.push('sort_order = ?');    values.push(sort_order) }

    if (!fields.length) {
      return res.status(400).json({ code: 400, message: '没有可更新的字段' })
    }
    values.push(id)
    await pool.query(`UPDATE platforms SET ${fields.join(', ')} WHERE id = ?`, values)
    res.json({ code: 0, message: '更新成功' })
  } catch (err) {
    console.error('[platform.update]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// DELETE /api/platforms/:id
async function remove(req, res) {

  try {
    await pool.query('DELETE FROM platforms WHERE id = ?', [req.params.id])
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    console.error('[platform.remove]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

module.exports = { list, create, update, remove }
