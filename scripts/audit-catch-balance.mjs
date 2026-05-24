const CATCH_BALANCE = {
  baseRate: 5,
  hpMissingBonus: 62,
  hpMissingExponent: 1.18,
  mpMissingBonus: 6,
  maxRate: 92,
  minRate: 2,
  overLevelPenaltyPerLevel: 0.86,
  levelAdvantageBonusPerLevel: 0.02,
  maxLevelAdvantageBonus: 1.28,
  maxHighLevelPenalty: 0.34,
  weakSpeciesBonus: 1.1,
  strongSpeciesPenalty: 0.74,
  legendarySpeciesPenalty: 0.4,
  statusMultipliers: {
    sleep: 1.85,
    freeze: 1.85,
    paralysis: 1.35,
    burn: 1.2,
    poison: 1.2,
  },
}

const BALLS = {
  basic: 1,
  great: 1.5,
  ultra: 2,
}

const speciesPowerMultiplier = (statTotal) => {
  if (statTotal >= 580) return CATCH_BALANCE.legendarySpeciesPenalty
  if (statTotal >= 520) return CATCH_BALANCE.strongSpeciesPenalty
  if (statTotal <= 330) return CATCH_BALANCE.weakSpeciesBonus
  return 1 - ((statTotal - 330) / 190) * (1 - CATCH_BALANCE.strongSpeciesPenalty)
}

const calculateCatchRate = ({
  hpRatio,
  ballMultiplier,
  statTotal = 500,
  targetLevel = 17,
  playerAverageLevel = 17,
  status = null,
}) => {
  const hpMissingRatio = Math.max(0, Math.min(1, 1 - hpRatio))
  let catchRate = (
    CATCH_BALANCE.baseRate +
    Math.pow(hpMissingRatio, CATCH_BALANCE.hpMissingExponent) * CATCH_BALANCE.hpMissingBonus
  ) * ballMultiplier

  catchRate *= CATCH_BALANCE.statusMultipliers[status] || 1

  const levelRatio = (targetLevel - 1) / 99
  const highLevelPenalty = 1 - Math.pow(levelRatio, 1.18) * CATCH_BALANCE.maxHighLevelPenalty
  catchRate *= Math.max(1 - CATCH_BALANCE.maxHighLevelPenalty, highLevelPenalty)

  catchRate *= speciesPowerMultiplier(statTotal)

  const overLevel = targetLevel - playerAverageLevel - 5
  if (overLevel > 0) {
    catchRate *= Math.pow(CATCH_BALANCE.overLevelPenaltyPerLevel, overLevel)
  } else if (overLevel < 0) {
    catchRate *= Math.min(
      CATCH_BALANCE.maxLevelAdvantageBonus,
      1 + Math.abs(overLevel) * CATCH_BALANCE.levelAdvantageBonusPerLevel
    )
  }

  return Math.max(CATCH_BALANCE.minRate, Math.min(CATCH_BALANCE.maxRate, catchRate))
}

const combinedChance = (rates) => (
  1 - rates.reduce((failChance, rate) => failChance * (1 - rate / 100), 1)
)

const yellowGolduckScenario = {
  pokemon: '哥达鸭',
  targetLevel: 17,
  playerAverageLevel: 17,
  statTotal: 500,
  hpRatios: [0.75, 0.6, 0.5, 0.35, 0.25, 0.1],
}

const rows = yellowGolduckScenario.hpRatios.map((hpRatio) => {
  const basic = calculateCatchRate({ ...yellowGolduckScenario, hpRatio, ballMultiplier: BALLS.basic })
  const great = calculateCatchRate({ ...yellowGolduckScenario, hpRatio, ballMultiplier: BALLS.great })
  const ultra = calculateCatchRate({ ...yellowGolduckScenario, hpRatio, ballMultiplier: BALLS.ultra })
  const oneGreatTwoBasic = combinedChance([great, basic, basic]) * 100
  return {
    hpRatio,
    basic: Number(basic.toFixed(1)),
    great: Number(great.toFixed(1)),
    ultra: Number(ultra.toFixed(1)),
    oneGreatTwoBasic: Number(oneGreatTwoBasic.toFixed(1)),
  }
})

const keyScenario = rows.find((row) => row.hpRatio === 0.5)
const failures = []
if (!keyScenario || keyScenario.great < 35) {
  failures.push('哥达鸭黄血 50% 时超级球捕捉率应至少达到 35%。')
}
if (!keyScenario || keyScenario.oneGreatTwoBasic < 60) {
  failures.push('哥达鸭黄血 50% 时一颗超级球加两颗普通球的总成功率应至少达到 60%。')
}

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  scenario: yellowGolduckScenario,
  rows,
  failures,
}, null, 2))

if (failures.length > 0) {
  process.exitCode = 1
}
