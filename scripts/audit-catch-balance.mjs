import { calculateCatchRate } from '../src/utils/gameBalance.js'
import { MONSTERS, POKEBALLS } from '../src/utils/gameData.js'

const round1 = (value) => Number(value.toFixed(1))

const combinedChance = (rates) => (
  1 - rates.reduce((failChance, rate) => failChance * (1 - rate / 100), 1)
)

const getMonster = (name) => {
  const monster = MONSTERS.find((entry) => entry.name === name)
  if (!monster) throw new Error(`找不到宝可梦: ${name}`)
  return monster
}

const buildTarget = ({
  name,
  level,
  maxHp = 100,
  currentHp = 50,
  maxMp = 50,
  currentMp = 50,
  status = null,
}) => ({
  ...getMonster(name),
  level,
  maxHp,
  currentHp,
  maxMp,
  currentMp,
  status,
})

const calculateBallRows = ({ target, playerAverageLevels }) => (
  playerAverageLevels.map((playerAverageLevel) => {
    const rates = Object.fromEntries(Object.entries(POKEBALLS).map(([ballKey, ball]) => [
      ballKey,
      calculateCatchRate({
        target,
        ballMultiplier: ball.catchRateMultiplier,
        playerAverageLevel,
      }),
    ]))
    return {
      playerAverageLevel,
      basic: round1(rates.pokeball_basic),
      great: round1(rates.pokeball_great),
      ultra: round1(rates.pokeball_ultra),
      master: round1(rates.pokeball_master),
      oneGreatTwoBasic: round1(combinedChance([
        rates.pokeball_great,
        rates.pokeball_basic,
        rates.pokeball_basic,
      ]) * 100),
    }
  })
)

const standardScenario = {
  name: '标准黄血目标',
  target: buildTarget({
    name: '哥达鸭',
    level: 17,
    maxHp: 100,
    currentHp: 50,
    maxMp: 50,
    currentMp: 50,
  }),
  playerAverageLevels: [17],
}

const redHpStrongScenario = {
  name: '截图类强力红血低MP目标',
  target: buildTarget({
    name: '罗丝雷朵',
    level: 19,
    maxHp: 51,
    currentHp: 4,
    maxMp: 45,
    currentMp: 1,
  }),
  playerAverageLevels: [8, 10, 12, 15],
}

const scenarios = [standardScenario, redHpStrongScenario].map((scenario) => ({
  name: scenario.name,
  target: {
    name: scenario.target.name,
    level: scenario.target.level,
    hp: `${scenario.target.currentHp}/${scenario.target.maxHp}`,
    mp: `${scenario.target.currentMp}/${scenario.target.maxMp}`,
    status: scenario.target.status || null,
  },
  rows: calculateBallRows(scenario),
}))

const standardRow = scenarios[0].rows[0]
const redHpAvg10Row = scenarios[1].rows.find((row) => row.playerAverageLevel === 10)
const redHpAvg8Row = scenarios[1].rows.find((row) => row.playerAverageLevel === 8)
const failures = []

if (!standardRow || standardRow.great < 40) {
  failures.push('同级黄血普通目标使用超级球应至少约 40%。')
}
if (!standardRow || standardRow.oneGreatTwoBasic < 65) {
  failures.push('同级黄血普通目标使用一颗超级球加两颗普通球，总成功率应至少约 65%。')
}
if (!redHpAvg10Row || redHpAvg10Row.basic < 38 || redHpAvg10Row.great < 58) {
  failures.push('强力进化型红血低MP且玩家均级落后约4级时，普通球/超级球不应低到让玩家感觉无望。')
}
if (!redHpAvg8Row || redHpAvg8Row.great < 48) {
  failures.push('强力进化型红血低MP且玩家均级落后约6级时，超级球仍应接近五成。')
}
if (scenarios.some((scenario) => scenario.rows.some((row) => row.master !== 100))) {
  failures.push('大师球应必定捕获。')
}

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  scenarios,
  failures,
}, null, 2))

if (failures.length > 0) {
  process.exitCode = 1
}
