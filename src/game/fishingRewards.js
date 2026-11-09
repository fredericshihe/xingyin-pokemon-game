export const FISHING_APPRAISAL_GRADES = Object.freeze({
  ordinary: { label: '普通', probability: 50, min: .5, max: 1, color: '#8dc5a5' },
  great: { label: '优良', probability: 30, min: 1.25, max: 2, color: '#62c8ba' },
  precious: { label: '珍贵', probability: 15, min: 2.5, max: 4, color: '#61aeea' },
  exquisite: { label: '极品', probability: 4, min: 6, max: 10, color: '#b294ed' },
  legendary: { label: '罕世', probability: 1, min: 15, max: 30, color: '#e6bc67' }
})

export function getFishingComboBonuses(streak, perfect = false) {
  const count = Math.max(0, Math.trunc(Number(streak) || 0))
  const hitBonusGold = count >= 2 ? Math.min(8, count - 1) : 0
  // Perfect catches add a small tiered bonus on top of the hit streak:
  // +1 at streak 2–3, +2 at 4–5, +3 at 6–7, and +4 from streak 8 onward.
  const perfectBonusGold = perfect && count >= 2 ? Math.min(4, 1 + Math.floor((count - 2) / 2)) : 0
  return { hitBonusGold, perfectBonusGold, bonusGold: hitBonusGold + perfectBonusGold }
}

export function getFishingComboReward(streak, perfect = false) {
  return getFishingComboBonuses(streak, perfect).bonusGold
}

/** Used by the isolated preview and audits; production prices come only from the RPC. */
export function previewFishingAppraisal(base, gradeRoll, priceRoll) {
  let cursor = 0
  const [grade, info] = Object.entries(FISHING_APPRAISAL_GRADES).find(([, tier]) => {
    cursor += tier.probability / 100
    return gradeRoll < cursor
  }) || ['legendary', FISHING_APPRAISAL_GRADES.legendary]
  const low = Math.floor(base * info.min), high = Math.floor(base * info.max)
  return { appraisalGrade: grade, price: low + Math.floor(Math.max(0, Math.min(.999999999, priceRoll)) * (high - low + 1)) }
}
