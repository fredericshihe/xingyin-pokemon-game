#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const FACINGS = new Set(['up', 'down', 'left', 'right'])
const ROLE_MIN_TEAM_SIZE = {
  normal: 2,
  lieutenant: 3,
  boss: 5,
  challenge: 3
}

const errors = []
const addError = (message) => errors.push(message)

await withViteAuditServer(async ({ loadModule }) => {
  const { MAP_IDS, getMapInfo } = await loadModule('/src/game/data/mapCatalog.js')
  const { getTrainerRoleBalance, normalizeTrainerRole } = await loadModule('/src/utils/gameBalance.js')
  const { isLevelValidForSpecies } = await loadModule('/src/utils/wildEncounterRules.js')
  const { getEvolutionFamilyKey } = await loadModule('/src/utils/pokemonFamilyVariety.js')
  const { getMapConfig } = await loadModule('/src/data/maps/mapConfig.js')
  const {
    getTrainerDifficultyBounds,
    isDailyVariantBattleEvent,
    resolveTrainerBattleTeamConfig
  } = await loadModule('/src/utils/trainerBattleScaling.js')

  const maps = MAP_IDS.map((mapId) => getMapInfo(mapId)).filter(Boolean)
  const trainerEvents = maps.flatMap((map) => (
    (map.runtimeEvents || [])
      .filter((event) => event.type === 'trainer' || event.type === 'boss' || event.type === 'challenge')
      .map((event) => ({ map, event }))
  ))
  const bossLevelCapByMap = new Map(
    maps.map((map) => {
      const boss = (map.runtimeEvents || []).find((event) => event.type === 'boss')
      const bossLevels = (boss?.properties?.team || [])
        .map((member) => Number(member.level))
        .filter(Number.isFinite)
      return [map.id, bossLevels.length > 0 ? Math.max(...bossLevels) : null]
    })
  )

  if (trainerEvents.length < 64) {
    addError(`训练家/首领事件数量不足，当前 ${trainerEvents.length}`)
  }

  let dailyScalingTrainerCount = 0
  let dailyVariantBattleCount = 0
  let challengeEventCount = 0
  let normalTrainerCount = 0
  let lieutenantCount = 0
  const dailyVariantSignatures = new Set()
  const trainerNameOwners = new Map()

  const collectDuplicateFamilyKeys = (team = []) => {
    const seen = new Map()
    const duplicates = new Set()
    team.forEach((member) => {
      const familyKey = getEvolutionFamilyKey(member?.pokemonId)
      if (!familyKey) return
      if (seen.has(familyKey)) duplicates.add(familyKey)
      else seen.set(familyKey, member?.pokemonId)
    })
    return [...duplicates]
  }

  for (const { map, event } of trainerEvents) {
    const role = normalizeTrainerRole(event.type === 'boss' ? 'boss' : (event.properties?.role || event.type || 'normal'))
    const facing = event.properties?.facing
    const team = Array.isArray(event.properties?.team) ? event.properties.team : []
    const levels = team.map((member) => Number(member.level)).filter(Number.isFinite)
    const minTeamSize = ROLE_MIN_TEAM_SIZE[role] || 2
    const npcSourceId = event.type === 'challenge' ? `${event.id}_monument` : `${event.id}_npc`
    const hasNpcDecoration = (map.decorativeObjects || []).some((object) => object.sourceId === npcSourceId)
    const isNormalTrainer = event.type === 'trainer' && role === 'normal'
    const isLieutenant = event.type === 'trainer' && role === 'lieutenant'
    const isDailyScalingTrainer = isNormalTrainer
    const isDailyVariantBattle = isDailyVariantBattleEvent(event.type, role)
    if (isNormalTrainer) normalTrainerCount += 1
    if (isLieutenant) lieutenantCount += 1

    if (!FACINGS.has(facing) && event.type !== 'challenge') {
      addError(`${map.id}/${event.id} 缺少合理朝向: ${String(facing)}`)
    }
    if (team.length < minTeamSize) {
      addError(`${map.id}/${event.id} 队伍数量不足: ${team.length} < ${minTeamSize}`)
    }
    if (levels.some((level) => level < 1 || level > 100)) {
      addError(`${map.id}/${event.id} 存在非法等级: ${levels.join('/')}`)
    }
    if ((isNormalTrainer || isLieutenant) && collectDuplicateFamilyKeys(team).length > 0) {
      addError(`${map.id}/${event.id} 基础队伍存在同进化家族重复`)
    }
    if (!hasNpcDecoration) {
      addError(`${map.id}/${event.id} 缺少地图实体装饰: ${npcSourceId}`)
    }
    if ((isNormalTrainer || isLieutenant) && typeof event.properties?.name === 'string') {
      const trainerName = event.properties.name.trim()
      if (trainerName.length > 0) {
        if (trainerNameOwners.has(trainerName)) {
          addError(`训练师名字重复: ${trainerName} 同时出现在 ${trainerNameOwners.get(trainerName)} 和 ${map.id}/${event.id}`)
        } else {
          trainerNameOwners.set(trainerName, `${map.id}/${event.id}`)
        }
      }
    }
    if (isDailyScalingTrainer) {
      dailyScalingTrainerCount += 1
      const dailyText = event.properties?.dailyDefeatedText
      if (typeof dailyText !== 'string' || !dailyText.includes('明天')) {
        addError(`${map.id}/${event.id} 缺少训练家当日再战拦截台词`)
      }
      const bossCap = bossLevelCapByMap.get(map.id)
      if (bossCap > 0 && levels.some((level) => level > bossCap)) {
        addError(`${map.id}/${event.id} 初始等级超过本地区 Boss 上限 Lv.${bossCap}: ${levels.join('/')}`)
      }
    }
    if (isLieutenant) {
      if (isDailyVariantBattle) {
        addError(`${map.id}/${event.id} 部下训练师不能是每日重复战斗`)
      }
      if (typeof event.properties?.defeatedText !== 'string' || !event.properties.defeatedText.includes('印记')) {
        addError(`${map.id}/${event.id} 部下训练师缺少一次性印记完成文案`)
      }
      if (typeof event.properties?.dailyDefeatedText === 'string' && event.properties.dailyDefeatedText.includes('明天再来')) {
        addError(`${map.id}/${event.id} 部下训练师仍含每日再战文案`)
      }
    }
    if (event.type === 'challenge') {
      challengeEventCount += 1
      const completedText = event.properties?.completedText || event.properties?.dailyDefeatedText
      const dailyDefeatedText = event.properties?.dailyDefeatedText
      if (typeof completedText !== 'string' || !completedText.includes('明天')) {
        addError(`${map.id}/${event.id} 试炼完成文案必须明确次日刷新`)
      }
      if (typeof completedText !== 'string' || !completedText.includes('按批次')) {
        addError(`${map.id}/${event.id} 缺少试炼分批解锁文案`)
      }
      if (typeof completedText !== 'string' || !completedText.includes('首通奖励不会重复')) {
        addError(`${map.id}/${event.id} 缺少试炼首通奖励不重复文案`)
      }
      if (typeof dailyDefeatedText !== 'string' || !dailyDefeatedText.includes('明天')) {
        addError(`${map.id}/${event.id} 试炼当天完成文案必须明确次日刷新`)
      }
    }
    if (isDailyVariantBattle) {
      dailyVariantBattleCount += 1
      const mapConfig = getMapConfig(map.id)
      const bossTeam = ((map.runtimeEvents || []).find((candidate) => candidate.type === 'boss')?.properties?.team || [])
      const bossCap = bossLevelCapByMap.get(map.id)
      const bounds = getTrainerDifficultyBounds({
        role,
        mapConfig,
        bossLevelCap: bossCap
      })
      const isLateGameNormalTrainer = isNormalTrainer && (
        (Math.trunc(Number(mapConfig?.regionOrder ?? 0)) || 0) >= 8 ||
        (Math.trunc(Number(mapConfig?.recommendedLevel ?? 0)) || 0) >= 45 ||
        (Math.trunc(Number(mapConfig?.maxLevel ?? 0)) || 0) >= 47
      )
      const signaturesForEvent = new Set()
      const daySignaturesByVictoryCount = new Map()
      let maxVariantTeamSize = 0

      for (const victoryCount of [0, 1, 2, 3, 4, 8, 16, 80]) {
        const daySignatures = new Set()
        for (const dailyRefreshKey of ['2026-05-21', '2026-05-22', '2026-05-23']) {
          const variantTeam = resolveTrainerBattleTeamConfig(team, {
            role,
            eventType: event.type,
            eventId: event.id,
            mapName: map.id,
            dailyRefreshKey,
            victoryCount,
            mapConfig,
            mapWildPokemon: mapConfig.wildPokemon,
            bossTeamConfig: bossTeam,
            challengeRarePool: event.properties?.challengeRarePool,
            enableDailyVariant: true
          })
          const roleBalance = getTrainerRoleBalance(role)
          const variantLevels = variantTeam.map((member) => Number(member.level)).filter(Number.isFinite)
          const teamSignature = variantTeam.map((member) => `${member.pokemonId}@${member.level}`).join(',')
          const signature = `${map.id}/${event.id}/${dailyRefreshKey}/${victoryCount}:${teamSignature}`
          signaturesForEvent.add(signature)
          dailyVariantSignatures.add(signature)
          daySignatures.add(teamSignature)
          maxVariantTeamSize = Math.max(maxVariantTeamSize, variantTeam.length)

          if (variantTeam.length < roleBalance.minTeamSize || variantTeam.length > roleBalance.maxTeamSize) {
            addError(`${map.id}/${event.id} 每日队伍数量越界: ${variantTeam.length}`)
          }
          if (collectDuplicateFamilyKeys(variantTeam).length > 0) {
            addError(`${map.id}/${event.id} 每日变体存在同进化家族重复: ${teamSignature}`)
          }
          if (event.type === 'challenge' && variantTeam.length > 6) {
            addError(`${map.id}/${event.id} 试炼连战数量超过 6: ${variantTeam.length}`)
          }
          if (event.type === 'challenge' && victoryCount <= 3) {
            const expectedTrialSize = Math.min(6, 3 + victoryCount)
            if (variantTeam.length !== expectedTrialSize) {
              addError(`${map.id}/${event.id} 试炼第 ${victoryCount + 1} 批应为 ${expectedTrialSize} 连战，当前 ${variantTeam.length}`)
            }
          }
          if (variantLevels.some((level) => level < bounds.minLevel || level > bounds.maxLevel)) {
            addError(`${map.id}/${event.id} 每日等级越界: ${variantLevels.join('/')}，允许 Lv.${bounds.minLevel}-${bounds.maxLevel}`)
          }
          if (event.type === 'challenge' && bossCap > 0 && variantLevels.some((level) => level > bossCap)) {
            addError(`${map.id}/${event.id} 试炼等级超过本地图 Boss 上限 Lv.${bossCap}: ${variantLevels.join('/')}`)
          }
          const invalidSpecies = variantTeam.filter((member) => !isLevelValidForSpecies(member.pokemonId, member.level))
          if (invalidSpecies.length > 0) {
            addError(`${map.id}/${event.id} 每日队伍存在不符合进化阶段的等级: ${invalidSpecies.map((member) => `${member.pokemonId}@${member.level}`).join('/')}`)
          }
          if (isLateGameNormalTrainer && levels.length > 0 && variantLevels.length > 0 && Math.min(...variantLevels) < Math.min(...levels)) {
            addError(`${map.id}/${event.id} 晚期普通训练师的每日阵容不应弱于基础模板: base=${levels.join('/')} variant=${variantLevels.join('/')}`)
          }
        }
        daySignaturesByVictoryCount.set(victoryCount, daySignatures)
      }

      if (signaturesForEvent.size < 2) {
        addError(`${map.id}/${event.id} 每日变体缺少队伍或等级变化`)
      }
      const hasDayToDayVariation = [...daySignaturesByVictoryCount.values()].some((signatures) => signatures.size > 1)
      if (!hasDayToDayVariation) {
        addError(`${map.id}/${event.id} 每日刷新后阵容或等级没有发生变化`)
      }
      if (event.type === 'challenge' && maxVariantTeamSize !== 6) {
        addError(`${map.id}/${event.id} 试炼重复挑战必须能成长到 6 连战，当前抽样最大 ${maxVariantTeamSize}`)
      }
    }
  }

  const expectedDailyScalingTrainerCount = normalTrainerCount
  if (dailyScalingTrainerCount !== expectedDailyScalingTrainerCount) {
    addError(`每日成长训练家数量异常，当前 ${dailyScalingTrainerCount}，预期 ${expectedDailyScalingTrainerCount}`)
  }
  const mapsWithChallenge = maps.filter((map) => (map.runtimeEvents || []).some((event) => event.type === 'challenge')).length
  if (challengeEventCount !== mapsWithChallenge) {
    addError(`试炼场数量异常，当前 ${challengeEventCount}，预期 ${mapsWithChallenge}`)
  }

  const highlandBoss = trainerEvents.find(({ map, event }) => (
    map.id === 'GodotMapV2_BossHighland' && event.type === 'boss'
  ))?.event
  const highlandBossLevels = (highlandBoss?.properties?.team || []).map((member) => Number(member.level))
  if (!highlandBoss || Math.max(...highlandBossLevels) < 53 || highlandBossLevels.length < 6) {
    addError('最高等级地图 Boss 必须拥有 6 只宝可梦，且最高等级至少 Lv.53')
  }

  const normal = getTrainerRoleBalance('normal')
  const lieutenant = getTrainerRoleBalance('lieutenant')
  const challenge = getTrainerRoleBalance('challenge')
  const boss = getTrainerRoleBalance('boss')
  if (!(normal.rewardMultiplier < lieutenant.rewardMultiplier && lieutenant.rewardMultiplier < boss.rewardMultiplier)) {
    addError('训练家奖励倍率必须满足 normal < lieutenant < boss')
  }
  if (!(lieutenant.rewardMultiplier < challenge.rewardMultiplier && challenge.rewardMultiplier < boss.rewardMultiplier)) {
    addError('试炼奖励倍率必须满足 lieutenant < challenge < boss')
  }
  if (!(normal.switchChance < lieutenant.switchChance && lieutenant.switchChance < boss.switchChance)) {
    addError('训练家换人倾向必须满足 normal < lieutenant < boss')
  }
  if (!(lieutenant.switchChance < challenge.switchChance && challenge.switchChance < boss.switchChance)) {
    addError('试炼换人倾向必须满足 lieutenant < challenge < boss')
  }

  if (errors.length > 0) {
    console.error('[audit-trainer-battle] FAILED')
    errors.forEach((error) => console.error(`- ${error}`))
    process.exitCode = 1
    return
  }

  console.log('[audit-trainer-battle] OK')
  console.log(`- checked events: ${trainerEvents.length}`)
  console.log(`- daily scaling trainers: ${dailyScalingTrainerCount}`)
  console.log(`- one-time lieutenants: ${lieutenantCount}`)
  console.log(`- daily variant battles: ${dailyVariantBattleCount}`)
  console.log(`- challenge events: ${challengeEventCount}`)
  console.log(`- sampled daily variants: ${dailyVariantSignatures.size}`)
  console.log(`- highest boss levels: ${highlandBossLevels.join('/')}`)
  console.log(`- boss reward multiplier: ${boss.rewardMultiplier}, switch chance: ${boss.switchChance}`)
})
