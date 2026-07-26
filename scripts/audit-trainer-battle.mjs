#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const FACINGS = new Set(['up', 'down', 'left', 'right'])
const ROLE_MIN_TEAM_SIZE = {
  normal: 2,
  reward: 2,
  minigame: 6,
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
    resolveTrainerBattleTeamConfig,
    TERMINAL_BOSS_EXCLUSIVE_POKEMON_IDS
  } = await loadModule('/src/utils/trainerBattleScaling.js')
  const { MONSTERS } = await loadModule('/src/utils/gameData.js')

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
  let minigameCount = 0
  const dailyVariantSignatures = new Set()
  const trainerNameOwners = new Map()
  const speciesNameById = new Map(MONSTERS.map((monster) => [monster.id, monster.name]))
  const terminalExclusiveIds = new Set(TERMINAL_BOSS_EXCLUSIVE_POKEMON_IDS || [])
  const lieutenantGroupsByMap = new Map()

  const getSpeciesName = (pokemonId) => speciesNameById.get(pokemonId) || `#${pokemonId}`
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
    const isEliteSpecialLieutenant = isLieutenant && Boolean(event.properties?.specialBattleRule?.id)
    const isMinigameTrainer = event.type === 'trainer' && role === 'minigame'
    const isChampionTowerChallenge = event.type === 'challenge' && Boolean(event.properties?.towerChallenge)
    const isDailyScalingTrainer = isNormalTrainer
    const isDailyVariantBattle = !isChampionTowerChallenge && (isDailyVariantBattleEvent(event.type, role) || isMinigameTrainer)
    if (isNormalTrainer) normalTrainerCount += 1
    if (isLieutenant) lieutenantCount += 1
    if (isMinigameTrainer) minigameCount += 1
    if (isLieutenant) {
      const currentGroup = lieutenantGroupsByMap.get(map.id) || []
      currentGroup.push(event)
      lieutenantGroupsByMap.set(map.id, currentGroup)
    }

    if (!FACINGS.has(facing) && event.type !== 'challenge') {
      addError(`${map.id}/${event.id} 缺少合理朝向: ${String(facing)}`)
    }
    if (team.length < minTeamSize) {
      addError(`${map.id}/${event.id} 队伍数量不足: ${team.length} < ${minTeamSize}`)
    }
    if (levels.some((level) => level < 1 || level > 100)) {
      addError(`${map.id}/${event.id} 存在非法等级: ${levels.join('/')}`)
    }
    if (event.type !== 'boss') {
      const staticTerminalMembers = team.filter((member) => terminalExclusiveIds.has(Number(member.pokemonId ?? member.id)))
      if (staticTerminalMembers.length > 0) {
        addError(`${map.id}/${event.id} 非 Boss 队伍不能提前带出终局 Boss 专属宝可梦: ${staticTerminalMembers.map((member) => getSpeciesName(Number(member.pokemonId ?? member.id))).join('、')}`)
      }
    }
    if ((isNormalTrainer || isLieutenant) && collectDuplicateFamilyKeys(team).length > 0) {
      addError(`${map.id}/${event.id} 基础队伍存在同进化家族重复`)
    }
    if (isLieutenant) {
      const styleKey = event.properties?.battleStyle
      const battleStyleLabel = event.properties?.battleStyleLabel || ''
      if (isEliteSpecialLieutenant) {
        const rule = event.properties.specialBattleRule
        if (styleKey !== rule.id || !battleStyleLabel || battleStyleLabel !== rule.name) {
          addError(`${map.id}/${event.id} 四天王部下的规则与风格标签未对齐`)
        }
        if (typeof event.properties?.difficultyLabel !== 'string' || !event.properties.difficultyLabel.includes('四天王部下')) {
          addError(`${map.id}/${event.id} 四天王部下难度标签异常`)
        }
      } else {
        if (!['pressure', 'control', 'elite'].includes(styleKey)) {
          addError(`${map.id}/${event.id} 部下缺少明确风格标签`)
        }
        const sourceTags = Array.isArray(event.properties?.teamSourceTags) ? event.properties.teamSourceTags : []
        const sourceSummary = typeof event.properties?.teamSourceSummary === 'string' ? event.properties.teamSourceSummary : ''
        if (sourceTags.length !== team.length) {
          addError(`${map.id}/${event.id} 部下缺少队伍来源标记`)
        }
        if (!sourceSummary.includes('wild') || !sourceSummary.includes('trial')) {
          addError(`${map.id}/${event.id} 部下队伍必须混合本地图野生与试炼池`)
        }
        const sourceKinds = new Set(sourceTags)
        if (!(sourceKinds.has('wild') && sourceKinds.has('trial'))) {
          addError(`${map.id}/${event.id} 部下队伍必须同时包含野生池与试炼池宝可梦`)
        }
      }
      const uniquePokemonIds = new Set(team.map((member) => member.pokemonId))
      if (uniquePokemonIds.size < 3) {
        addError(`${map.id}/${event.id} 部下队伍不能出现重复宝可梦`)
      }
      const leadNames = team.map((member) => getSpeciesName(member.pokemonId)).join('、')
      if (!isEliteSpecialLieutenant && (typeof event.properties?.difficultyLabel !== 'string' || !event.properties.difficultyLabel.includes('部下训练家'))) {
        addError(`${map.id}/${event.id} 部下难度标签异常`)
      }
      if (typeof event.properties?.title !== 'string' || !event.properties.title.includes(battleStyleLabel)) {
        addError(`${map.id}/${event.id} 部下标题没有体现风格`)
      }
      if (!isEliteSpecialLieutenant && typeof event.properties?.beforeBattleText === 'string' && !event.properties.beforeBattleText.includes('boss') && !event.properties.beforeBattleText.includes('首领')) {
        addError(`${map.id}/${event.id} 部下开场文案未明确首领目标`)
      }
      if (leadNames.length === 0) {
        addError(`${map.id}/${event.id} 部下队伍缺少可读名字`)
      }
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
      if (typeof event.properties?.defeatedText !== 'string' || (!isEliteSpecialLieutenant && !event.properties.defeatedText.includes('印记'))) {
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
      if (typeof completedText !== 'string' || !completedText.includes('可继续挑战')) {
        addError(`${map.id}/${event.id} 试炼完成文案必须明确可继续挑战`)
      }
      if (typeof dailyDefeatedText !== 'string' || !dailyDefeatedText.includes('可继续挑战')) {
        addError(`${map.id}/${event.id} 试炼当天完成文案必须明确可继续挑战`)
      }
      if (Array.isArray(event.properties?.challengeRarePool) && event.properties.challengeRarePool.length > 0) {
        const unlockText = event.properties?.challengeRareUnlockText
        if (typeof unlockText !== 'string' || unlockText.trim().length === 0) {
          addError(`${map.id}/${event.id} 缺少隐藏生态解锁提示`)
        }
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
      let hasPostUnlockChallengeRotation = false
      let maxVariantTeamSize = 0

      for (const victoryCount of [0, 1, 2, 3, 4, 8, 16, 80, 120]) {
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
            dailyVariantSpeciesIds: event.properties?.dailyVariantSpeciesIds,
            dailyVariantLevelJitter: event.properties?.dailyVariantLevelJitter,
            bossTeamConfig: bossTeam,
            challengeRarePool: event.properties?.challengeRarePool,
            challengeBattleGroups: event.properties?.challengeBattleGroups,
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
          if (event.type === 'challenge' && victoryCount >= 4 && variantTeam.length !== 6) {
            addError(`${map.id}/${event.id} 全部解锁后的重复试炼必须保持 6 连战，当前 ${variantTeam.length}`)
          }
          if (variantLevels.some((level) => level < bounds.minLevel || level > bounds.maxLevel)) {
            addError(`${map.id}/${event.id} 每日等级越界: ${variantLevels.join('/')}，允许 Lv.${bounds.minLevel}-${bounds.maxLevel}`)
          }
          if (event.type !== 'boss') {
            const terminalMembers = variantTeam.filter((member) => terminalExclusiveIds.has(Number(member.pokemonId ?? member.id)))
            if (terminalMembers.length > 0) {
              addError(`${map.id}/${event.id} 动态队伍不能提前抽到终局 Boss 专属宝可梦: ${terminalMembers.map((member) => getSpeciesName(Number(member.pokemonId ?? member.id))).join('、')} (${teamSignature})`)
            }
          }
          if (isMinigameTrainer) {
            if (variantTeam.length !== 6) {
              addError(`${map.id}/${event.id} 循环小游戏必须固定 6 只宝可梦，当前 ${variantTeam.length}`)
            }
            if (victoryCount >= 120 && variantLevels.some((level) => level !== 100)) {
              addError(`${map.id}/${event.id} 循环小游戏最高胜场应稳定到 Lv.100，当前 ${variantLevels.join('/')}`)
            }
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
        if (event.type === 'challenge' && victoryCount <= 3 && daySignatures.size !== 1) {
          addError(`${map.id}/${event.id} 固定试炼第 ${victoryCount + 1} 组不应随每日刷新变化`)
        }
        if (event.type === 'challenge' && victoryCount >= 4 && daySignatures.size > 1) {
          hasPostUnlockChallengeRotation = true
        }
        daySignaturesByVictoryCount.set(victoryCount, daySignatures)
      }

      if (signaturesForEvent.size < 2) {
        addError(`${map.id}/${event.id} 每日变体缺少队伍或等级变化`)
      }
      const hasDayToDayVariation = [...daySignaturesByVictoryCount.values()].some((signatures) => signatures.size > 1)
      if (!hasDayToDayVariation && event.type !== 'challenge') {
        addError(`${map.id}/${event.id} 每日刷新后阵容或等级没有发生变化`)
      }
      if (isMinigameTrainer) {
        const hasVictoryVariation = new Set(
          [...daySignaturesByVictoryCount.values()].map((signatures) => [...signatures].sort().join('||'))
        ).size > 1
        if (!hasVictoryVariation) {
          addError(`${map.id}/${event.id} 循环小游戏胜场提升后阵容或等级没有发生变化`)
        }
      }
      if (event.type === 'challenge' && maxVariantTeamSize !== 6) {
        addError(`${map.id}/${event.id} 试炼重复挑战必须能成长到 6 连战，当前抽样最大 ${maxVariantTeamSize}`)
      }
      if (event.type === 'challenge' && !hasPostUnlockChallengeRotation) {
        addError(`${map.id}/${event.id} 隐藏生态全部解锁后的重复试炼缺少随机轮换`)
      }
    }
  }

  const expectedDailyScalingTrainerCount = normalTrainerCount
  lieutenantGroupsByMap.forEach((events, mapId) => {
    if (events.length !== 3) {
      addError(`${mapId} 部下训练师数量异常，当前 ${events.length}`)
      return
    }
    const styleKeys = events.map((event) => event.properties?.battleStyle).filter(Boolean)
    if (new Set(styleKeys).size !== events.length) {
      addError(`${mapId} 的 3 名部下风格必须互不重复`)
    }
    const leadIds = events.map((event) => Number(event.properties?.team?.[0]?.pokemonId)).filter(Number.isInteger)
    if (new Set(leadIds).size !== leadIds.length) {
      addError(`${mapId} 的 3 名部下首发宝可梦必须互不重复`)
    }
    const styleLabels = events.map((event) => event.properties?.battleStyleLabel).filter(Boolean)
    if (new Set(styleLabels).size !== styleLabels.length) {
      addError(`${mapId} 的 3 名部下风格标签必须互不重复`)
    }
  })
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
  const reward = getTrainerRoleBalance('reward')
  const minigame = getTrainerRoleBalance('minigame')
  const lieutenant = getTrainerRoleBalance('lieutenant')
  const challenge = getTrainerRoleBalance('challenge')
  const boss = getTrainerRoleBalance('boss')
  if (reward.aiSkill !== normal.aiSkill || reward.switchChance !== normal.switchChance || reward.potionBudget !== normal.potionBudget) {
    addError('奖励挑战 NPC 应明确使用普通训练家级 AI 配置')
  }
  if (minigame.minTeamSize !== 6 || minigame.maxTeamSize !== 6 || minigame.potionBudget !== 3) {
    addError('循环小游戏必须固定 6 只宝可梦，并拥有 3 次伤药预算')
  }
  if (minigame.aiSkill !== boss.aiSkill || minigame.switchChance !== boss.switchChance || minigame.switchScoreGap !== boss.switchScoreGap) {
    addError('循环小游戏应使用 Boss 级 AI 换人与出招强度')
  }
  if (!(boss.goldMultiplier < minigame.goldMultiplier && boss.goldCapMultiplier < minigame.goldCapMultiplier)) {
    addError('循环小游戏金币奖励上限必须高于 Boss，才能支撑长期重复挑战')
  }
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
  console.log(`- repeatable minigame trainers: ${minigameCount}`)
  console.log(`- daily variant battles: ${dailyVariantBattleCount}`)
  console.log(`- challenge events: ${challengeEventCount}`)
  console.log(`- sampled daily variants: ${dailyVariantSignatures.size}`)
  console.log(`- highest boss levels: ${highlandBossLevels.join('/')}`)
  console.log(`- boss reward multiplier: ${boss.rewardMultiplier}, switch chance: ${boss.switchChance}`)
})
