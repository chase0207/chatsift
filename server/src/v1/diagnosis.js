const rules = require('./business-rules')

const severity = {
  danger: 4,
  warning: 3,
  success: 2,
  info: 1,
}

const fieldLabels = {
  name: '姓名',
  city: '城市',
  time: '时间',
  contact: '联系方式',
  pickup_location: '上车位置',
  car_type: '车型',
}

const invalidLabels = {
  name: '姓名存疑',
  city: '城市不准确',
  time: '时间不准确',
  pickup_location: '上车位置不准确',
  car_type: '车型不明确',
}

function buildDiagnosis(conversation = {}) {
  const fieldValidity = parseFieldValidity(conversation.field_validity)
  const tags = []
  const intent = conversation.intent_label
  const isAppointment = intent === 'appointment' || hasAnyField(fieldValidity, rules.appointmentFields)

  if (intent === 'complaint') {
    tags.push(tag('投诉优先处理', 'danger', 'intent', '投诉会话需要优先处理'))
  }

  const contact = fieldValidity.contact
  if (contact?.status === 'valid') {
    tags.push(tag('联系方式有效', 'success', 'contact', contact.reason))
  } else if (contact?.status === 'unknown') {
    tags.push(tag('联系方式待核对', 'warning', 'contact', contact.reason))
  } else if (contact?.status === 'invalid') {
    tags.push(tag('联系方式无效', 'danger', 'contact', contact.reason))
  } else if (isAppointment) {
    tags.push(tag('缺有效联系方式', 'danger', 'contact', '联系方式缺失或未校验'))
  }

  if (isAppointment) {
    const allValid = rules.appointmentFields.every((field) => fieldValidity[field]?.status === 'valid')
    if (allValid) tags.push(tag('预约信息完整', 'success', 'appointment', '6 个预约字段均有效'))

    for (const field of rules.appointmentFields) {
      if (field === 'contact') continue
      const item = fieldValidity[field]
      if (!item) {
        tags.push(tag(`${fieldLabels[field]}无信息`, 'warning', field, '字段缺失或未校验'))
      } else if (item.status === 'invalid') {
        tags.push(tag(invalidLabels[field], 'warning', field, item.reason))
      } else if (item.status === 'unknown') {
        tags.push(tag(`${fieldLabels[field]}待核对`, 'warning', field, item.reason))
      }
    }
  }

  if (!tags.length && hasAnyField(fieldValidity, Object.keys(fieldLabels))) {
    tags.push(tag('咨询待跟进', 'warning', 'intent', '有咨询信息但未形成有效留资'))
  }

  if (!tags.length && intent === 'price_inquiry') {
    tags.push(tag('咨询待跟进', 'warning', 'intent', '询价会话需要跟进'))
  }

  if (!tags.length) tags.push(tag('无实质信息', 'info', 'intent', '暂无可诊断字段'))

  return {
    mainColor: mainColor(tags),
    tags,
  }
}

function tag(label, color, field, reason) {
  return { label, color, field, reason: reason || '' }
}

function mainColor(tags) {
  return (tags || []).reduce((current, item) => {
    if (!current) return item.color
    return severity[item.color] > severity[current] ? item.color : current
  }, 'info')
}

function hasAnyField(fieldValidity, fields) {
  return (fields || []).some((field) => fieldValidity[field] && fieldValidity[field].status)
}

function parseFieldValidity(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

module.exports = { buildDiagnosis, mainColor }
