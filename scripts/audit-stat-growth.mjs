#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const OFFICIAL_STAT_KEYS = ['maxHp', 'atk', 'def', 'spAtk', 'spDef', 'spd']
const ALL_STAT_KEYS = ['maxHp', 'maxMp', 'atk', 'def', 'spAtk', 'spDef', 'spd']
const sample = (items, limit = 20) => items.slice(0, limit)

await withViteAuditServer(async ({ loadModule }) => {
  const [
    { MONSTERS },
    {
      calculateStatsForLevel,
      calculateOfficialHpStat,
      calculateOfficialBattleStat,
      calculateProjectMpStat,
    },
  ] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/pokemonStats.js'),
  ])

  const officialCurveMismatches = []
  const customMpMismatches = []
  const statRegressions = []

  for (const monster of MONSTERS) {
    let previousStats = null

    for (let level = 1; level <= 100; level += 1) {
      const projectStats = calculateStatsForLevel(monster, level)
      const officialStats = {
        maxHp: calculateOfficialHpStat(monster.maxHp, level),
        atk: calculateOfficialBattleStat(monster.atk, level),
        def: calculateOfficialBattleStat(monster.def, level),
        spAtk: calculateOfficialBattleStat(monster.spAtk, level),
        spDef: calculateOfficialBattleStat(monster.spDef, level),
        spd: calculateOfficialBattleStat(monster.spd, level),
      }

      for (const statKey of OFFICIAL_STAT_KEYS) {
        if (projectStats[statKey] !== officialStats[statKey]) {
          officialCurveMismatches.push({
            id: monster.id,
            dexNo: monster.dexNo,
            name: monster.name,
            level,
            statKey,
            project: projectStats[statKey],
            officialZeroIvEvNeutral: officialStats[statKey],
          })
        }
      }

      const expectedMp = calculateProjectMpStat(monster.maxMp, level)
      if (projectStats.maxMp !== expectedMp) {
        customMpMismatches.push({
          id: monster.id,
          dexNo: monster.dexNo,
          name: monster.name,
          level,
          project: projectStats.maxMp,
          expectedCustom: expectedMp,
        })
      }

      if (previousStats) {
        for (const statKey of ALL_STAT_KEYS) {
          if (projectStats[statKey] < previousStats[statKey]) {
            statRegressions.push({
              id: monster.id,
              dexNo: monster.dexNo,
              name: monster.name,
              level,
              statKey,
              previous: previousStats[statKey],
              current: projectStats[statKey],
            })
          }
        }
      }

      previousStats = projectStats
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    formula: {
      officialHp: 'floor(((2*base + IV + floor(EV/4))*level)/100) + level + 10',
      officialOtherStats: 'floor((floor(((2*base + IV + floor(EV/4))*level)/100) + 5) * nature)',
      auditAssumptions: { iv: 0, ev: 0, nature: 1 },
      customMp: 'max(24, floor(22 + baseMp*0.24 + level*(0.45 + baseMp/280)))',
    },
    summary: {
      monsterCount: MONSTERS.length,
      checkedLevelsPerMonster: 100,
      officialStatCurveChecks: MONSTERS.length * 100 * OFFICIAL_STAT_KEYS.length,
      officialCurveMismatchCount: officialCurveMismatches.length,
      customMpCurveChecks: MONSTERS.length * 100,
      customMpMismatchCount: customMpMismatches.length,
      statRegressionCount: statRegressions.length,
    },
    samples: {
      officialCurveMismatches: sample(officialCurveMismatches),
      customMpMismatches: sample(customMpMismatches),
      statRegressions: sample(statRegressions),
    },
  }

  console.log(JSON.stringify(report, null, 2))
})
