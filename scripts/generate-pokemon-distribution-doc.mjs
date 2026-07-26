#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { withViteAuditServer, ROOT_DIR } from './load-vite-module.mjs'

const OUTPUT_FILE = '所有地图宝可梦分配与概率说明.md'

const MAP_DESIGN_NOTES = {
  GodotMap: '新手教学图。低等级中性、可爱系和水边生态用于教会捕捉、练级和分区探索，东南草坡再逐步加入更强成员。',
  GodotMapV2: '第一张区域链地图。草/毒、普通/飞行和花地生态承接新手图，Boss 专属小火龙提供第一只明确区域稀有奖励。',
  GodotMapV2_MistLake: '水边生态教学图。西岸、南岸和东岸分别强化浅水、潮滩和水边洞穴感，Boss 专属迷你龙提供长期目标。',
  GodotMapV2_FarmTown: '中期进化推进图。田垄、麦田和塔顶把草/普通、格斗/地面、机械/飞行分区拉开。',
  GodotMapV2_PirateShore: '海岸与沉船主题图。水系、化石和沉船幽影递进，Boss 专属化石翼龙强化古代气息。',
  GodotMapV2_Graveyard: '幽灵/毒系夜间主题图。基础野区改为旁系生态，试炼保留强幽灵/毒和分支进化奖励。',
  GodotMapV2_HexRuins: '机关遗迹主题图。电/超能、岩地和人工宝可梦分区明确，试炼加入高阶分支和远古形态。',
  GodotMapV2_SurvivalRidge: '高等级耐久挑战图。北岭、训练林、南岭、东岭分别承担训练营、岩地、钢/普通压力。',
  GodotMapV2_BossHighland: '最终区域。三块高地分别偏草/龙/岩、火/水/冰、电/传说/人工，观星秘径承担终局隐藏遭遇。'
}

const SPECIAL_ZONE_IDS = new Set([
  'meadow_hidden_grove',
  'lake_hidden_path',
  'farm_windmill_top',
  'shore_wreck_inner',
  'grave_deep_forest',
  'hex_sealed_chamber',
  'peak_starwatch_path'
])

const HIDDEN_EXCLUSIVE_POKEMON_BY_ZONE = {
  meadow_hidden_grove: [189, 190, 191],
  lake_hidden_path: [192, 193, 194],
  farm_windmill_top: [195, 196, 197],
  shore_wreck_inner: [198, 199, 200],
  grave_deep_forest: [201, 202, 203],
  hex_sealed_chamber: [204, 205, 206],
  peak_starwatch_path: [207, 208, 209]
}

const pct = (value, digits = 1) => {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return ''
  const percent = raw <= 1 ? raw * 100 : raw
  const rounded = Number(percent.toFixed(digits))
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(digits)}%`
}

const toId = (entry) => {
  const id = Math.trunc(Number(entry?.pokemonId ?? entry?.id ?? entry))
  return Number.isInteger(id) ? id : null
}

const levelText = (entry, fallbackMin = null, fallbackMax = null) => {
  const min = Math.trunc(Number(entry?.minLevel ?? entry?.level ?? fallbackMin))
  const max = Math.trunc(Number(entry?.maxLevel ?? entry?.level ?? fallbackMax ?? min))
  if (!Number.isInteger(min) && !Number.isInteger(max)) return ''
  if (min === max) return `Lv.${min}`
  return `Lv.${Math.min(min, max)}-${Math.max(min, max)}`
}

const pokemonName = (id, monsterById) => monsterById.get(id)?.name || `#${id}`

const formatPokemonEntry = (entry, monsterById, totalWeight = null, fallbackMin = null, fallbackMax = null) => {
  const id = toId(entry)
  const weight = Math.max(1, Number(entry?.weight) || 1)
  const share = totalWeight ? ` ${pct(weight / totalWeight)}` : ''
  const level = levelText(entry, fallbackMin, fallbackMax)
  return `${pokemonName(id, monsterById)}${level ? ` ${level}` : ''}${share}`
}

const formatTeam = (team = [], monsterById) => {
  if (!Array.isArray(team) || team.length === 0) return '无'
  return team.map((entry) => {
    const id = toId(entry)
    return `${pokemonName(id, monsterById)} ${levelText(entry)}`
  }).join('、')
}

const eventProps = (event) => (
  event?.properties && typeof event.properties === 'object' ? event.properties : {}
)

const isGeneratedBattleEvent = (event) => (
  ['trainer', 'boss', 'challenge'].includes(event?.type) && eventProps(event).team
)

const classifyTrainer = (event) => {
  const role = eventProps(event).role
  if (role === 'lieutenant') return '三名部下'
  if (role === 'reward') return '奖励挑战'
  if (role === 'minigame') return '循环挑战'
  return '普通训练师'
}

const hiddenZoneLabel = (zone) => (
  SPECIAL_ZONE_IDS.has(zone.id) || zone.depth === 'deep' ? '（额外隐藏遭遇区）' : ''
)

const sortEvents = (events = []) => events
  .filter(isGeneratedBattleEvent)
  .sort((left, right) => {
    const order = { reward: 0, trainer: 1, lieutenant: 2, challenge: 3, boss: 4 }
    const leftRole = eventProps(left).role || left.type
    const rightRole = eventProps(right).role || right.type
    return (order[leftRole] ?? 9) - (order[rightRole] ?? 9) ||
      String(eventProps(left).name || left.id).localeCompare(String(eventProps(right).name || right.id), 'zh-Hans-CN')
  })

const formatDate = () => {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const get = (type) => parts.find((part) => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

await withViteAuditServer(async ({ loadModule }) => {
  const { ADVENTURE_MAP_CHAIN, getAdventureMapInfo } = await loadModule('/src/game/data/overworldMaps.js')
  const { getMapConfig } = await loadModule('/src/data/maps/mapConfig.js')
  const { ENCOUNTER_TABLES } = await loadModule('/src/game/data/encounterTables.js')
  const { MONSTERS } = await loadModule('/src/utils/gameData.js')
  const {
    getChallengeBattleGroupSize,
    getChallengeRareUnlockBatch,
    normalizeChallengeRarePool
  } = await loadModule('/src/utils/challengeRareUnlock.js')

  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))
  const lines = []
  const hiddenRows = []

  lines.push('# 所有地图宝可梦分配与概率说明')
  lines.push('')
  lines.push(`更新时间：${formatDate()}`)
  lines.push('')
  lines.push('## 概率口径')
  lines.push('')
  lines.push('- `触发率`：玩家每走入一次对应草丛格，且当前遇敌冷却为 `0` 时，触发野生战斗的概率。')
  lines.push('- 战斗结束后会读取当前遇敌表的 `safeStepsAfterBattle` 作为冷却步数；未配置时默认 `5` 步。冷却中踩草不会触发战斗。')
  lines.push('- 野区宝可梦后的百分比：已经触发野生战斗后，该宝可梦在基础遇敌表中的权重占比。')
  lines.push('- 击败区域 Boss 后，专属稀有宝可梦通常以 `18%` 覆写率尝试替换一次已经触发的基础遭遇。')
  lines.push('- 每次完成区域试炼会解锁一批试炼稀有；普通区域试炼稀有覆写率通常为 `30%`，星雾高地为 `36%`。')
  lines.push('- 稀有覆写顺序是 `Boss 专属稀有 -> 试炼稀有 -> 区域进度增强 -> 原基础遭遇`。Boss 和试炼都解锁后，普通区域试炼稀有最终触发后占比约为 `82% x 30% = 24.6%`。')
  lines.push('- 区域进度增强：击败 `1` 名部下后，`12%` 尝试覆写为 Boss 队伍前 2 位成员；击败 `3` 名部下后，`18%` 尝试覆写为 Boss 队伍前 4 位成员。')
  lines.push('- 区域试炼固定四组：第 1 组 `3` 连战、第 2 组 `4` 连战、第 3 组 `5` 连战、第 4 组 `6` 连战。四批全部解锁后，后续重复挑战保持 `6` 连战并随机轮换守护者。')

  for (const mapId of ADVENTURE_MAP_CHAIN) {
    const mapInfo = getAdventureMapInfo(mapId)
    const config = getMapConfig(mapId)
    const mapName = config?.displayName || mapInfo?.displayName || mapId
    const mapMin = Math.max(1, Math.trunc(Number(config?.minLevel ?? 1)) || 1)
    const mapMax = Math.max(mapMin, Math.trunc(Number(config?.maxLevel ?? mapMin)) || mapMin)
    const zones = Array.isArray(mapInfo?.encounterZones) ? mapInfo.encounterZones : []
    const events = Array.isArray(mapInfo?.runtimeEvents) ? mapInfo.runtimeEvents : []

    lines.push('')
    lines.push(`## ${mapName} ${mapId}`)
    lines.push('')
    lines.push(`设计原因：${MAP_DESIGN_NOTES[mapId] || '按当前地图主题配置野区、训练师、Boss 和试炼奖励。'}`)
    lines.push('')
    lines.push(`等级范围：Lv.${mapMin}-${mapMax}`)
    lines.push('')
    lines.push('### 野区')
    lines.push('')
    if (zones.length === 0) {
      lines.push('- 无野生遭遇区。')
    } else {
      zones.forEach((zone) => {
        const table = ENCOUNTER_TABLES[zone.encounterTableId]
        const entries = Array.isArray(table?.pokemon) ? table.pokemon : []
        const totalWeight = entries.reduce((sum, entry) => sum + Math.max(1, Number(entry.weight) || 1), 0)
        const triggerRate = pct(zone.tallGrassRate ?? table?.tallGrassRate ?? table?.baseRate ?? 0)
        const cooldown = Math.trunc(Number(table?.safeStepsAfterBattle))
        const pokemonList = entries.map((entry) => formatPokemonEntry(entry, monsterById, totalWeight, mapMin, mapMax)).join('、')
        const zoneLine = `- ${zone.name || zone.id}${hiddenZoneLabel(zone)}，表 \`${zone.encounterTableId}\`，触发 \`${triggerRate}\`${Number.isInteger(cooldown) ? `，战后冷却 ${cooldown} 步` : ''}：${pokemonList}。`
        lines.push(zoneLine)
        if (SPECIAL_ZONE_IDS.has(zone.id) || zone.depth === 'deep') {
          const exclusiveIds = new Set(HIDDEN_EXCLUSIVE_POKEMON_BY_ZONE[zone.id] || [])
          const commonEntries = entries.filter((entry) => !exclusiveIds.has(toId(entry)))
          hiddenRows.push({
            mapName,
            zoneName: zone.name || zone.id,
            tableId: zone.encounterTableId,
            triggerRate,
            cooldown: Number.isInteger(cooldown) ? cooldown : 5,
            species: commonEntries.slice(0, 6).map((entry) => pokemonName(toId(entry), monsterById)).join('、'),
            exclusiveSpecies: [...exclusiveIds]
              .map((id) => pokemonName(id, monsterById))
              .join('、') || '无'
          })
        }
      })
    }

    lines.push('')
    lines.push('### 训练师、Boss 与试炼')
    lines.push('')
    const battleEvents = sortEvents(events)
    const grouped = new Map()
    battleEvents.forEach((event) => {
      const key = event.type === 'boss' ? 'Boss' : event.type === 'challenge' ? '区域试炼' : classifyTrainer(event)
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key).push(event)
    })

    ;['奖励挑战', '循环挑战', '普通训练师', '三名部下', 'Boss', '区域试炼'].forEach((groupName) => {
      const groupEvents = grouped.get(groupName) || []
      if (groupEvents.length === 0) return
      groupEvents.forEach((event) => {
        const props = eventProps(event)
        if (event.type === 'challenge') {
          const pool = normalizeChallengeRarePool(props.challengeRarePool)
          const groups = Array.isArray(props.challengeBattleGroups) ? props.challengeBattleGroups : []
          lines.push(`- ${props.name || event.id}：${props.beforeBattleText || '固定四组守护者，完成后分批解锁试炼稀有。'}`)
          groups.forEach((team, index) => {
            const unlockBatch = getChallengeRareUnlockBatch(pool, index)
            const unlockNames = unlockBatch.map((entry) => pokemonName(toId(entry), monsterById)).join('、') || '无新增'
            lines.push(`- 固定试炼第 ${index + 1} 组 ${getChallengeBattleGroupSize(index)} 连战：${formatTeam(team, monsterById)}。打败后解锁：${unlockNames}。`)
          })
          if (pool.length > 0) {
            lines.push(`- 试炼稀有覆写率：\`${pct(props.challengeRareChance ?? 0.3)}\`；全部解锁后重复挑战保持 6 连战并随机轮换。`)
          }
          return
        }
        if (event.type === 'boss') {
          const rareId = toId(props.bossRarePokemon)
          const rareText = rareId ? `。击败后解锁 ${pokemonName(rareId, monsterById)}，覆写率 \`${pct(props.bossRareChance ?? 0.18)}\`` : ''
          lines.push(`- Boss ${props.name || event.id}：${formatTeam(props.team, monsterById)}${rareText}。`)
          return
        }
        if (props.role === 'minigame') {
          lines.push(`- 循环挑战 ${props.name || event.id}：运行时从全图鉴非终局Boss专属池随机派出 6 只；胜场越高等级越高，最高 Lv.100；对手使用 Boss 级 AI，最多 3 次伤药。`)
          return
        }
        lines.push(`- ${groupName} ${props.name || event.id}：${formatTeam(props.team, monsterById)}。`)
      })
    })
  }

  lines.push('')
  lines.push('## 额外隐藏遭遇区一览')
  lines.push('')
  lines.push('这些区域由地图上的入口提示或隐藏入口标记引导，触发率高于普通草丛，且使用独立生态表。')
  lines.push('')
  lines.push('| 地图 | 隐藏区 | 实际表 | 触发率 | 冷却 | 常见生态 | 专属稀有 |')
  lines.push('|---|---|---|---:|---:|---|---|')
  hiddenRows.forEach((row) => {
    lines.push(`| ${row.mapName} | ${row.zoneName} | \`${row.tableId}\` | ${row.triggerRate} | ${row.cooldown} 步 | ${row.species} | ${row.exclusiveSpecies} |`)
  })

  lines.push('')
  lines.push('## 总体分配原则')
  lines.push('')
  lines.push('- 地图等级逐区抬升：新手山谷 `Lv.2-8`，区域链从 `Lv.5-12` 提升到 `Lv.52-60`。')
  lines.push('- 普通训练师表现本地基础生态；部下训练师预告 Boss 和试炼生态；Boss 队伍加入一个专属稀有压轴。')
  lines.push('- 额外隐藏遭遇区都使用独立生态表，并通过更高触发率或更短冷却制造更密集的探索回报。')
  lines.push('- 试炼稀有池按四组固定试炼拆成四批解锁；开战前预览、胜利结算和后续野区试炼稀有都读取同一批次数据。')
  lines.push('- 图鉴获取途径由实际野区、Boss、试炼、进度增强和进化链生成，避免静态说明和游戏数据不一致。')

  fs.writeFileSync(path.join(ROOT_DIR, OUTPUT_FILE), `${lines.join('\n')}\n`, 'utf8')
  console.log(`[generate-pokemon-distribution-doc] wrote ${OUTPUT_FILE}`)
})
