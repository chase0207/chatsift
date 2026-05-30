function evaluate(tenantId, intent, contextMessages) {
  if (intent !== 'appointment' && intent !== 'price_inquiry') {
    return { score: 0, fields: {}, missing: [] }
  }

  const text = (contextMessages || [])
    .map((message) => message.content_text)
    .filter(Boolean)
    .join('\n')

  const fields = {
    city: extractCity(text),
    time: extractTime(text),
    contact: extractContact(text),
    hours: extractHours(text),
    project: extractProject(text),
    store: extractStore(text),
  }

  if (intent === 'appointment') {
    const required = ['city', 'time', 'contact', 'project', 'store']
    const missing = required.filter((key) => !fields[key])
    return {
      score: (required.length - missing.length) * 20,
      fields: pickFields(fields, required),
      missing,
    }
  }

  const required = ['city', 'hours']
  const missing = required.filter((key) => !fields[key])
  return {
    score: (fields.city ? 50 : 0) + (fields.hours ? 50 : 0),
    fields: pickFields(fields, ['city', 'hours', 'project']),
    missing,
  }
}

function pickFields(fields, keys) {
  return Object.fromEntries(keys.map((key) => [key, fields[key] || null]))
}

function extractCity(text) {
  const cityList = envList('COMPLETENESS_CITY_LIST', '上海,北京,广州,深圳,杭州,南京,成都,武汉')
  const city = cityList.find((item) => text.includes(item))
  if (city) return city

  const patterns = [
    /我在([\u4e00-\u9fa5]{2,8})(?:，|,|。|\s|$)/,
    /在([\u4e00-\u9fa5]{2,8})(?:区|市)/,
    /([\u4e00-\u9fa5]{2,8})(?:区|市)/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1]
  }
  return null
}

function extractTime(text) {
  const patterns = [
    /(这周末|本周末|周末|明天|后天|今天|今晚|上午|下午|晚上)/,
    /((?:这|本|下)?周[一二三四五六日天](?:上午|下午|晚上)?)/,
    /(\d{1,2}月\d{1,2}[号日](?:上午|下午|晚上)?)/,
    /((?:上午|下午|晚上)?\d{1,2}点(?:半)?)/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1]
  }
  return null
}

function extractContact(text) {
  const phone = text.match(/1[3-9]\d{9}/)
  if (phone) return phone[0]

  const wechat = text.match(/(?:微信|vx|VX|加我)[：:\s]*([A-Za-z][A-Za-z0-9_-]{5,19})/)
  if (wechat) return wechat[1]
  return null
}

function extractHours(text) {
  const match = text.match(/(\d{1,3})\s*(?:个)?(?:小时|课时)/)
  return match ? Number(match[1]) : null
}

function extractProject(text) {
  const projectList = envList('COMPLETENESS_PROJECT_LIST', '陪驾,陪练,科目二,科目三,新手上路,长途')
  return projectList.find((item) => text.includes(item)) || null
}

function extractStore(text) {
  const storeList = envList('COMPLETENESS_STORE_LIST', '')
  const store = storeList.find((item) => text.includes(item))
  if (store) return store

  const match = text.match(/([\u4e00-\u9fa5A-Za-z0-9]{2,20}(?:店|门店))/)
  return match ? match[1] : null
}

function envList(key, fallback) {
  return String(process.env[key] || fallback || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

async function llmExtract(tenantId, text, requiredFields) {
  return {}
}

module.exports = { evaluate, llmExtract }
