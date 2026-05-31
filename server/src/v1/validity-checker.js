const rules = require('./business-rules')
const llmClient = require('./llm-client')

const STATUS = {
  VALID: 'valid',
  INVALID: 'invalid',
  UNKNOWN: 'unknown',
}

async function checkValidity(tenantId, fields, requiredFields) {
  const result = {}
  const aiFields = []

  for (const field of requiredFields || []) {
    const checked = checkByRule(field, fields[field])
    result[field] = checked
    if (checked.status === STATUS.UNKNOWN && checked.value) aiFields.push(field)
  }

  if (aiFields.length) {
    const aiResult = await checkByAI(tenantId, fields, aiFields)
    for (const field of aiFields) {
      if (aiResult[field]) result[field] = aiResult[field]
    }
  }

  return result
}

function checkByRule(field, value) {
  const normalized = normalize(value)
  if (!normalized) return item(STATUS.INVALID, 'rule', '字段为空', normalized)

  if (field === 'contact') return checkContact(normalized)
  if (field === 'city') return checkCity(normalized)
  if (field === 'car_type') return checkCarType(normalized)
  if (field === 'name') return checkName(normalized)
  if (field === 'time') return checkTime(normalized)
  if (field === 'pickup_location') return checkPickupLocation(normalized)

  return item(STATUS.UNKNOWN, 'rule', '规则无法判断', normalized)
}

function checkContact(value) {
  const validity = rules.validity
  if (validity.contactRegex.test(value)) return item(STATUS.VALID, 'rule', '手机号格式有效', value)
  if (validity.wechatRegex.test(value)) return item(STATUS.VALID, 'rule', '微信号格式有效', value)
  return item(STATUS.INVALID, 'rule', '联系方式格式无效', value)
}

function checkCity(value) {
  if (rules.validity.cityList.includes(value)) return item(STATUS.VALID, 'rule', '城市词表命中', value)
  if (['市区', '城区', '附近'].includes(value)) return item(STATUS.INVALID, 'rule', '不是明确城市', value)
  return item(STATUS.INVALID, 'rule', '城市不在词表', value)
}

function checkCarType(value) {
  const valid = rules.validity.carTypeList.some((item) => value.includes(item))
  return valid
    ? item(STATUS.VALID, 'rule', '车型词表命中', value)
    : item(STATUS.INVALID, 'rule', '车型不在词表', value)
}

function checkName(value) {
  if (rules.validity.invalidNameWords.includes(value)) return item(STATUS.INVALID, 'rule', '明显不是姓名', value)
  if (/^\d+$/.test(value)) return item(STATUS.INVALID, 'rule', '姓名不能是纯数字', value)
  if (value.length < 2) return item(STATUS.INVALID, 'rule', '姓名过短', value)
  return item(STATUS.UNKNOWN, 'rule', '需判断是否像真实姓名', value)
}

function checkTime(value) {
  if (rules.validity.vagueTimeWords.some((word) => value.includes(word))) {
    return item(STATUS.INVALID, 'rule', '时间表达过于模糊', value)
  }
  if (
    /(今天|明天|后天|周[一二三四五六日天]|周末|本周末|这周末).*(上午|下午|晚上)?\d{1,2}点/.test(value) ||
    /\d{1,2}月\d{1,2}[号日].*\d{1,2}点/.test(value) ||
    /\d{4}-\d{2}-\d{2}.*\d{1,2}[:点]/.test(value)
  ) {
    return item(STATUS.VALID, 'rule', '时间具体到日期和小时', value)
  }
  return item(STATUS.UNKNOWN, 'rule', '需判断时间是否具体', value)
}

function checkPickupLocation(value) {
  if (rules.validity.vagueLocationWords.includes(value)) {
    return item(STATUS.INVALID, 'rule', '上车位置不是具体点', value)
  }
  if (/^\d+$/.test(value)) return item(STATUS.INVALID, 'rule', '上车位置格式无效', value)
  if (/(路|街|号|弄|巷|小区|公寓|大厦|广场|商场|酒店|门口|地铁站|机场|火车站|高铁站)/.test(value)) {
    return item(STATUS.UNKNOWN, 'rule', '需确认是否为具体上车点', value)
  }
  if (/^[\u4e00-\u9fa5]{2,4}区$/.test(value)) return item(STATUS.UNKNOWN, 'rule', '需判断区县是否足够具体', value)
  return item(STATUS.UNKNOWN, 'rule', '需判断点位有效性', value)
}

async function checkByAI(tenantId, fields, aiFields) {
  const result = await llmClient.chat(tenantId, {
    systemPrompt: [
      '你是租车客服字段有效性校验器。',
      '只返回 JSON,不要解释。',
      '对每个字段返回 {"status":"valid|invalid","reason":"简短原因"}。',
      '判断标准:name像真实人名;time能定位到具体日期和小时;pickup_location必须是司机能找到的具体上车点,市区/某区/某片区无效。',
      `只判断这些字段:${aiFields.join(',')}`,
    ].join('\n'),
    userPrompt: JSON.stringify(Object.fromEntries(aiFields.map((field) => [field, fields[field] || null]))),
    maxTokens: 300,
  })

  if (!result.ok) {
    return Object.fromEntries(aiFields.map((field) => [
      field,
      item(STATUS.UNKNOWN, 'llm', result.error || 'LLM不可用', fields[field]),
    ]))
  }

  const parsed = parseJsonObject(result.text)
  if (!parsed) {
    return Object.fromEntries(aiFields.map((field) => [
      field,
      item(STATUS.UNKNOWN, 'llm', 'LLM返回无法解析', fields[field]),
    ]))
  }

  return Object.fromEntries(aiFields.map((field) => {
    const value = parsed[field] || {}
    const status = value.status === STATUS.VALID || value.status === STATUS.INVALID ? value.status : STATUS.UNKNOWN
    return [field, item(status, 'llm', value.reason || 'LLM判定', fields[field])]
  }))
}

function item(status, source, reason, value) {
  return { status, source, reason, value: normalize(value) }
}

function normalize(value) {
  const text = String(value || '').trim()
  return text || null
}

function parseJsonObject(text) {
  const value = String(text || '').trim()
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  const jsonText = fenced ? fenced[1].trim() : (start >= 0 && end > start ? value.slice(start, end + 1) : null)
  if (!jsonText) return null
  try {
    const parsed = JSON.parse(jsonText)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function validCount(validity, fields) {
  return (fields || []).filter((field) => validity?.[field]?.status === STATUS.VALID).length
}

function allValid(validity, fields) {
  return (fields || []).every((field) => validity?.[field]?.status === STATUS.VALID)
}

module.exports = { checkValidity, validCount, allValid, parseJsonObject }
