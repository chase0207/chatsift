export const diagnosisOptions = [
  { label: '红-硬伤', value: 'danger' },
  { label: '橙-待核对', value: 'warning' },
  { label: '绿-有效', value: 'success' },
  { label: '灰-无信息', value: 'info' },
]

export const diagnosisText = {
  danger: '红-硬伤',
  warning: '橙-待核对',
  success: '绿-有效',
  info: '灰-无信息',
}

export const fieldLabels = {
  name: '姓名',
  city: '城市',
  time: '时间',
  contact: '联系方式',
  pickup_location: '上车位置',
  car_type: '车型',
}

export function diagnosisTags(row) {
  return row?.diagnosis?.tags || []
}

export function diagnosisMain(row) {
  return row?.diagnosis?.mainColor || 'info'
}

export function fieldValidityRows(value = {}) {
  return Object.entries(value || {}).map(([field, item]) => ({
    field,
    label: fieldLabels[field] || field,
    value: item?.value || '-',
    status: item?.status || 'unknown',
    reason: item?.reason || '',
  }))
}

export function statusType(status) {
  if (status === 'valid') return 'success'
  if (status === 'invalid') return 'danger'
  if (status === 'unknown') return 'warning'
  return 'info'
}

export function statusLabel(status) {
  if (status === 'valid') return '有效'
  if (status === 'invalid') return '无效'
  if (status === 'unknown') return '待核对'
  return '无信息'
}
