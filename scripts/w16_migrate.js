'use strict'
// W16 数据归属迁移: 把业务数据 tenant_id 从 SRC 迁到 DST(默认 1 → 4)。
// 安全: 事务内 UPDATE + 逐表核对行数一致才 COMMIT, 否则 ROLLBACK。
// 用法:
//   node scripts/w16_migrate.js            # dry-run, 只打印计划与基线, 不改库
//   node scripts/w16_migrate.js --apply    # 真正执行(事务+核对)
//   node scripts/w16_migrate.js --apply --dst=4   # 指定目标租户 id(生产建账号后的 id)
// 迁移前务必已备份(scripts 同级或 ~/chatsift_backups)。intent_rules(tenant_id=0 全局)不迁。

const fs = require('fs')
const path = require('path')
const envPath = path.join(__dirname, '../server/.env')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const pool = require('../server/src/config/db')

const arg = (k, d) => {
  const f = process.argv.find((a) => a.startsWith('--' + k + '='))
  return f ? f.split('=')[1] : d
}
const SRC = Number(arg('src', 1))
const DST = Number(arg('dst', 4))
const APPLY = process.argv.includes('--apply')
const BIZ = ['conversations', 'messages', 'leads', 'workorders', 'analysis_jobs', 'tenant_llm_config', 'price_table']

async function count(conn, table, tid) {
  const [[r]] = await conn.query(`SELECT COUNT(*) c FROM ${table} WHERE tenant_id=?`, [tid])
  return r.c
}

async function main() {
  if (SRC === DST) { console.error('SRC 与 DST 相同, 拒绝执行'); process.exit(1) }
  const conn = await pool.getConnection()
  try {
    console.log(`迁移计划: tenant_id ${SRC} → ${DST}   模式: ${APPLY ? 'APPLY(事务执行)' : 'DRY-RUN(只读)'}`)
    const baseline = {}
    for (const t of BIZ) {
      const src = await count(conn, t, SRC)
      const dst = await count(conn, t, DST)
      baseline[t] = src
      console.log(`  ${t.padEnd(18)} src(${SRC}): ${String(src).padStart(6)}   dst(${DST}): ${dst}`)
    }

    if (!APPLY) {
      console.log('\nDRY-RUN: 未改动任何数据。确认无误后加 --apply 执行。')
      conn.release(); await pool.end(); return
    }

    await conn.beginTransaction()
    for (const t of BIZ) {
      await conn.query(`UPDATE ${t} SET tenant_id=? WHERE tenant_id=?`, [DST, SRC])
    }
    // 核对: 迁移后 dst 行数应 == 基线 src, 且 src 应清零
    let okAll = true
    for (const t of BIZ) {
      const dstNow = await count(conn, t, DST)
      const srcNow = await count(conn, t, SRC)
      const ok = dstNow === baseline[t] && srcNow === 0
      if (!ok) okAll = false
      console.log(`  核对 ${t.padEnd(18)} dst(${DST})=${dstNow} (期望 ${baseline[t]})  src(${SRC})=${srcNow} (期望 0)  ${ok ? 'OK' : '✗不一致'}`)
    }
    if (okAll) {
      await conn.commit()
      console.log('\n核对全部一致 → 已 COMMIT。迁移完成。')
    } else {
      await conn.rollback()
      console.error('\n核对不一致 → 已 ROLLBACK。数据未改动, 请排查。')
      process.exit(2)
    }
    conn.release(); await pool.end()
  } catch (e) {
    try { await conn.rollback() } catch (_) {}
    conn.release()
    console.error('迁移异常, 已 ROLLBACK:', e.message)
    process.exit(1)
  }
}
main()
