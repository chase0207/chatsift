function normalizePlatformKey(platform) {
  return String(platform || '').trim().toLowerCase()
}

module.exports = { normalizePlatformKey }
