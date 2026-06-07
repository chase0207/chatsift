require('dotenv').config()
const express = require('express')
const path = require('path')
const cors = require('cors')
const analyzer = require('./v1/analyzer')

const app = express()
const PORT = process.env.PORT || 3100

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (req, res) => {
  res.json({ code: 0, message: 'ok', data: { service: 'chatsift-server' } })
})

if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') {
  const chaos = require('./middleware/chaos')
  app.use(chaos.middleware)
  app.use('/api/_chaos', require('./routes/_chaos'))
}

app.use('/api/auth', require('./routes/auth'))
app.use('/api/users', require('./routes/users'))
app.use('/api/tenants', require('./routes/tenants'))
app.use('/api/service-accounts', require('./routes/service-accounts'))
app.use('/api/roles', require('./routes/roles'))
app.use('/api/menus', require('./routes/menus'))
app.use('/api/platforms', require('./routes/platforms'))
app.use('/api/pages', require('./routes/pages'))
app.use('/api/plugins', require('./routes/plugins'))
app.use('/api/configs', require('./routes/configs'))
app.use('/api/logs', require('./routes/logs'))
app.use('/api/dashboard', require('./routes/dashboard'))

const eventsController = require('./controllers/v1/eventsController')
const auth = require('./middleware/auth')
app.use('/api/v1/events', require('./routes/v1/events'))
app.post('/api/v1/heartbeat', auth, eventsController.heartbeat)
app.get('/api/v1/dom-adapter-config', auth, eventsController.domAdapterConfig)
app.use('/api/v1/conversations', require('./routes/v1/conversations'))
app.use('/api/v1/leads', require('./routes/v1/leads'))
app.use('/api/v1/workorders', require('./routes/v1/workorders'))
app.use('/api/v1/intent-rules', require('./routes/v1/intentRules'))
app.use('/api/v1/price-table', require('./routes/v1/priceTable'))
app.use('/api/v1/llm-config', require('./routes/v1/llmConfig'))
app.use('/api/v1/analytics', require('./routes/v1/analytics'))
app.use('/api/v1/home', require('./routes/v1/home'))

const publicDir = path.join(__dirname, '..', 'public')
app.use(express.static(publicDir))
app.get('*', (req, res) => {
  if (req.path.indexOf('/api') === 0) return res.status(404).json({ code: 404, message: '接口不存在' })
  res.sendFile(path.join(publicDir, 'index.html'))
})

const server = app.listen(PORT, async () => {
  console.log(`Chatsift Server running on port ${PORT}`)
  if (process.env.ANALYZER_ENABLED !== 'false') {
    try {
      await analyzer.start()
      console.log('analyzer worker started')
    } catch (err) {
      console.error('[analyzer.start]', err)
    }
  }
})

async function shutdown() {
  await analyzer.stop()
  server.close(() => process.exit(0))
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

module.exports = app
