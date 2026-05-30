const PLATFORM_ALIAS_MAP = {
  douyin: 'douyin',
  douyin_dm: 'douyin',
  feige_dm: 'douyin',
  life_douyin: 'douyin',
  xiaohongshu: 'xiaohongshu',
  xiaohongshu_dm: 'xiaohongshu',
  kuaishou: 'kuaishou',
  pinduoduo: 'pinduoduo',
  pdd_dm: 'pinduoduo',
  jd: 'jd',
  jd_dm: 'jd',
  taobao: 'taobao',
  meituan: 'meituan',
  meituan_jyb: 'meituan',
  wechat: 'wechat',
  shipinhao: 'wechat',
  baidu: 'baidu',
  bili: 'bili',
  bilibili: 'bili',
  tiktok: 'tiktok',
  alipay: 'alipay',
  xianyu: 'xianyu',
  wuba: 'wuba',
  kugou: 'kugou',
}

function normalizePlatformKey(platform = '') {
  const value = String(platform || '').trim().toLowerCase()
  return PLATFORM_ALIAS_MAP[value] || value
}

function getPlatformAliases(platform = '') {
  const normalized = normalizePlatformKey(platform)
  const aliases = new Set([normalized, String(platform || '').trim().toLowerCase()])
  Object.keys(PLATFORM_ALIAS_MAP).forEach((key) => {
    if (PLATFORM_ALIAS_MAP[key] === normalized) aliases.add(key)
  })
  return Array.from(aliases).filter(Boolean)
}

function extractDetectHosts(urlValue = '') {
  const raw = String(urlValue || '')
  if (!raw.trim()) return []

  const parts = raw
    .split(/[\n,|]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const hosts = new Set()
  parts.forEach((part) => {
    let value = part
    if (!/^https?:\/\//i.test(value) && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) {
      return
    }
    try {
      const url = /^https?:\/\//i.test(value) ? new URL(value) : new URL(`https://${value}`)
      if (url.hostname) hosts.add(url.hostname.toLowerCase())
    } catch (_) {}
  })

  return Array.from(hosts)
}

module.exports = {
  normalizePlatformKey,
  getPlatformAliases,
  extractDetectHosts,
}
