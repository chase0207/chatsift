require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'rpa_system',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  charset: 'utf8mb4',
  timezone: '+08:00',
});

pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+08:00'", (err) => {
    if (err) console.error('Failed to set timezone:', err.message);
  });
});

module.exports = pool;
