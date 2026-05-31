const rules = require('./business-rules')

function evaluate(tenantId, intent, contextMessages) {
  if (intent !== 'appointment' && intent !== 'price_inquiry') {
    return { score: 0, fields: {}, missing: [] }
  }

  const text = (contextMessages || [])
    .map((message) => message.content_text)
    .filter(Boolean)
    .join('\n')

  const fields = {
    name: extractName(text),
    city: extractCity(text),
    time: extractTime(text),
    contact: extractContact(text),
    pickup_location: extractPickupLocation(text),
    car_type: extractCarType(text),
  }

  const required = intent === 'appointment' ? rules.appointmentFields : rules.priceFields
  const missing = required.filter((key) => !fields[key])

  return {
    score: Math.round(((required.length - missing.length) / required.length) * 100),
    fields: pickFields(fields, required),
    missing,
  }
}

function pickFields(fields, keys) {
  return Object.fromEntries(keys.map((key) => [key, fields[key] || null]))
}

function extractName(text) {
  const patterns = [
    /姓名[：:\s]*([\u4e00-\u9fa5A-Za-z·]{2,20})/,
    /我叫([\u4e00-\u9fa5A-Za-z·]{2,20})/,
    /名字(?:叫|是)?[：:\s]*([\u4e00-\u9fa5A-Za-z·]{2,20})/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return cleanValue(match[1])
  }
  return null
}

function extractCity(text) {
  const cityList = envList('COMPLETENESS_CITY_LIST', '上海,北京,广州,深圳,杭州,南京,成都,武汉,苏州,无锡,天津,重庆')
  const city = cityList.find((item) => text.includes(item))
  if (city) return city

  const patterns = [
    /城市[：:\s]*([\u4e00-\u9fa5]{2,8})(?:，|,|。|\s|\n|$)/,
    /我在([\u4e00-\u9fa5]{2,8})(?:，|,|。|\s|\n|$)/,
    /在([\u4e00-\u9fa5]{2,8})(?:区|市)/,
    /([\u4e00-\u9fa5]{2,8})(?:区|市)/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return cleanValue(match[1])
  }
  return null
}

function extractTime(text) {
  const patterns = [
    /(?:时间|用车时间|预约时间)[：:\s]*([^\n,，。;；]{2,30})/,
    /(这周末|本周末|周末|明天|后天|今天|今晚|上午|下午|晚上)/,
    /((?:这|本|下)?周[一二三四五六日天](?:上午|下午|晚上)?)/,
    /(\d{1,2}月\d{1,2}[号日](?:上午|下午|晚上)?)/,
    /((?:上午|下午|晚上)?\d{1,2}点(?:半)?)/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return cleanValue(match[1])
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

function extractPickupLocation(text) {
  const patterns = [
    /上车(?:位置|地点)?[：:\s]*([^\n,，。;；]{2,50})/,
    /(?:地址|位置)[：:\s]*([^\n,，。;；]{2,50})/,
    /在([^\n,，。;；]{2,50})(?:接|上车)/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return cleanValue(match[1])
  }
  return null
}

function extractCarType(text) {
  const carTypes = envList('COMPLETENESS_CAR_TYPE_LIST', '轿车,SUV,商务车,七座,七座车,MPV,新能源,电车,油车')
  return carTypes.find((item) => text.includes(item)) || null
}

function cleanValue(value) {
  return String(value || '')
    .replace(/[，。；;,.、\s]+$/g, '')
    .trim()
    .slice(0, 64) || null
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
