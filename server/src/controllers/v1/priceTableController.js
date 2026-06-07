const pool = require('../../config/db')
const { ok, fail, tenantId, denyInternal, paging } = require('./_shared')

async function list(req, res) {
  const tenant = tenantId(req)
  const { page, pageSize, offset } = paging(req.query)
  const params = [tenant]
  let where = 'WHERE tenant_id = ?'
  for (const key of ['city', 'enabled']) {
    if (req.query[key] !== undefined) {
      where += ` AND ${key} = ?`
      params.push(req.query[key])
    }
  }
  if (req.query.keyword) {
    where += ' AND product_name LIKE ?'
    params.push(`%${req.query.keyword}%`)
  }

  try {
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM price_table ${where}`, params)
    const [rows] = await pool.query(
      `SELECT id, city, product_name, hours, price, original_price, notes, enabled,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM price_table ${where}
       ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )
    ok(res, { list: rows, total, page, page_size: pageSize })
  } catch (err) {
    console.error('[v1.priceTable.list]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function create(req, res) {
  if (denyInternal(req, res)) return
  const { city, product_name, hours = null, price = null, original_price = null, notes = null, enabled = 1 } = req.body
  if (!city || !product_name) return fail(res, 400, 1003, 'city 和 product_name 不能为空')
  try {
    const [result] = await pool.query(
      `INSERT INTO price_table
       (tenant_id, city, product_name, hours, price, original_price, notes, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId(req), city, product_name, hours, price, original_price, notes, enabled]
    )
    ok(res, { id: result.insertId })
  } catch (err) {
    console.error('[v1.priceTable.create]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function update(req, res) {
  if (denyInternal(req, res)) return
  const allowed = ['city', 'product_name', 'hours', 'price', 'original_price', 'notes', 'enabled']
  const fields = []
  const values = []
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      fields.push(`${key} = ?`)
      values.push(req.body[key])
    }
  }
  if (!fields.length) return fail(res, 400, 1003, '没有可更新字段')
  try {
    const [result] = await pool.query(
      `UPDATE price_table SET ${fields.join(', ')}
       WHERE tenant_id = ? AND id = ?`,
      [...values, tenantId(req), req.params.id]
    )
    if (!result.affectedRows) return fail(res, 404, 2001, '价格项不存在')
    ok(res)
  } catch (err) {
    console.error('[v1.priceTable.update]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function remove(req, res) {
  if (denyInternal(req, res)) return
  try {
    const [result] = await pool.query(
      'DELETE FROM price_table WHERE tenant_id = ? AND id = ?',
      [tenantId(req), req.params.id]
    )
    if (!result.affectedRows) return fail(res, 404, 2001, '价格项不存在')
    ok(res)
  } catch (err) {
    console.error('[v1.priceTable.remove]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function importRows(req, res) {
  ok(res, { imported: 0 })
}

module.exports = { list, create, update, remove, importRows }
