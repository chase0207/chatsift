function judge(intent, completeness) {
  if (intent === 'complaint') return { stage: 'done' }
  if (intent === 'simple_inquiry') return { stage: 'new' }

  if (intent === 'appointment' || intent === 'price_inquiry') {
    const score = completeness && Number(completeness.score) || 0
    if (score === 0) return { stage: 'new' }
    if (score < 60) return { stage: 'collecting' }
    if (score < 100) return { stage: 'completing' }
    return { stage: 'done' }
  }

  return { stage: 'new' }
}

module.exports = { judge }
