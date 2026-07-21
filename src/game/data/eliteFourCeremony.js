export const ELITE_FOUR_CEREMONY_MAP_IDS = Object.freeze([
  'GodotMapV2_FrostDojo',
  'GodotMapV2_TideDojo',
  'GodotMapV2_IronDojo',
  'GodotMapV2_DragonDojo'
])

export const ELITE_FOUR_CEREMONY_BY_MAP = Object.freeze({
  GodotMapV2_FrostDojo: Object.freeze({
    mapName: 'GodotMapV2_FrostDojo',
    bossEventId: 'elite_frost_boss',
    order: 1,
    theme: 'frost',
    icon: 'fa-snowflake',
    motif: '镜',
    trials: ['冰霜护甲', '低温催眠', '白雾轮换', '霜镜天王'],
    effectCount: 8,
    entryDurationMs: 3200,
    victoryDurationMs: 3600,
    entry: Object.freeze({
      eyebrow: '四大天王 · 第一席',
      title: '霜镜',
      subtitle: '镜面封路，冷静者先行',
      statement: '三重霜印之后，才是天王之席。'
    }),
    victory: Object.freeze({
      eyebrow: '第一席 · 突破',
      title: '霜镜碎裂',
      subtitle: '你没有被寒意夺走节奏',
      statement: '通往深潮的道路已经开启。',
      nextLabel: '下一席 · 深潮'
    })
  }),
  GodotMapV2_TideDojo: Object.freeze({
    mapName: 'GodotMapV2_TideDojo',
    bossEventId: 'elite_tide_boss',
    order: 2,
    theme: 'tide',
    icon: 'fa-water',
    motif: '潮',
    trials: ['潮汐回复', '猎潮追击', '漩涡压制', '深潮天王'],
    effectCount: 12,
    entryDurationMs: 3800,
    victoryDurationMs: 4200,
    entry: Object.freeze({
      eyebrow: '四大天王 · 第二席',
      title: '深潮',
      subtitle: '潮汐层叠，迟疑者沉没',
      statement: '掌握节奏，才能穿过起伏的潮心。'
    }),
    victory: Object.freeze({
      eyebrow: '第二席 · 突破',
      title: '潮心平息',
      subtitle: '海流已经承认你的节奏',
      statement: '铁壁的三重闸门正在前方升起。',
      nextLabel: '下一席 · 铁壁'
    })
  }),
  GodotMapV2_IronDojo: Object.freeze({
    mapName: 'GodotMapV2_IronDojo',
    bossEventId: 'elite_iron_boss',
    order: 3,
    theme: 'iron',
    icon: 'fa-shield-halved',
    motif: '铁',
    trials: ['铁壁展开', '磁轨锁定', '反击装甲', '铁壁天王'],
    effectCount: 16,
    entryDurationMs: 4400,
    victoryDurationMs: 4800,
    entry: Object.freeze({
      eyebrow: '四大天王 · 第三席',
      title: '铁壁',
      subtitle: '钢铁成城，强攻者止步',
      statement: '拆解防线，才能让王座核心开门。'
    }),
    victory: Object.freeze({
      eyebrow: '第三席 · 突破',
      title: '王座开门',
      subtitle: '最后一层装甲已在你面前崩解',
      statement: '终席龙穹已经在高处点亮。',
      nextLabel: '最终席 · 龙穹'
    })
  }),
  GodotMapV2_DragonDojo: Object.freeze({
    mapName: 'GodotMapV2_DragonDojo',
    bossEventId: 'elite_dragon_boss',
    order: 4,
    theme: 'dragon',
    icon: 'fa-dragon',
    motif: '龙',
    trials: ['龙牙威压', '追猎本能', '终焉压迫', '龙穹天王'],
    effectCount: 24,
    entryDurationMs: 5200,
    victoryDurationMs: 6200,
    entry: Object.freeze({
      eyebrow: '四大天王 · 最终席',
      title: '龙穹',
      subtitle: '三枚龙印，一道终局',
      statement: '越过最后的龙脊，让整支队伍回答这场试炼。'
    }),
    victory: Object.freeze({
      eyebrow: '四大天王 · 全席突破',
      title: '四席尽破',
      subtitle: '霜镜、深潮、铁壁与龙穹全部向你开门',
      statement: '你已经征服四大天王。',
      nextLabel: '终局达成'
    })
  }),
  GodotMapV2_ChampionTower: Object.freeze({
    mapName: 'GodotMapV2_ChampionTower',
    bossEventId: 'champion_tower_trial',
    order: 10,
    rankCount: 10,
    theme: 'champion',
    icon: 'fa-crown',
    motif: '冠',
    trials: ['一层', '二层', '三层', '四层', '五层', '六层', '七层', '八层', '九层', '冠军'],
    effectCount: 24,
    entryDurationMs: 4600,
    victoryDurationMs: 6200,
    entry: Object.freeze({
      eyebrow: '第十四章 · 终局开放',
      title: '冠军挑战塔',
      subtitle: '十层星轨，一支完成蜕变的队伍',
      statement: '每一次胜利都会点亮一层；失败不会让已经留下的足迹熄灭。'
    }),
    victory: Object.freeze({
      eyebrow: '冠军挑战塔 · 首次登顶',
      title: '星冠加冕',
      subtitle: '十层徽记依次回应，你的冠军纪录已经永久写入',
      statement: '冠军之证已经升上奖杯基座，每周冠军巡回正式开放。',
      nextLabel: '每周冠军巡回已开放'
    })
  })
})

let ceremonySequence = 0

export function getEliteFourCeremonyConfig(mapName) {
  return ELITE_FOUR_CEREMONY_BY_MAP[mapName] || null
}

export function isEliteFourBossEvent(mapName, eventId) {
  const config = getEliteFourCeremonyConfig(mapName)
  return Boolean(config && typeof eventId === 'string' && config.bossEventId === eventId)
}

export function createEliteFourCeremony(mapName, phase = 'entry') {
  const config = getEliteFourCeremonyConfig(mapName)
  const normalizedPhase = phase === 'victory' ? 'victory' : 'entry'
  const copy = config?.[normalizedPhase]
  if (!config || !copy) return null

  ceremonySequence += 1
  return {
    id: `${mapName}:${normalizedPhase}:${Date.now()}:${ceremonySequence}`,
    mapName,
    phase: normalizedPhase,
    order: config.order,
    rankCount: config.rankCount || 4,
    theme: config.theme,
    icon: config.icon,
    motif: config.motif,
    trials: [...config.trials],
    effectCount: config.effectCount,
    durationMs: normalizedPhase === 'victory' ? config.victoryDurationMs : config.entryDurationMs,
    ...copy
  }
}

export function createChampionTowerFloorCeremony(floor, { storyClimb = false } = {}) {
  const config = getEliteFourCeremonyConfig('GodotMapV2_ChampionTower')
  const safeFloor = Math.max(1, Math.min(10, Math.trunc(Number(floor)) || 1))
  if (!config) return null
  ceremonySequence += 1
  return {
    id: `${config.mapName}:floor-${safeFloor}:${Date.now()}:${ceremonySequence}`,
    mapName: config.mapName,
    phase: 'floor',
    order: safeFloor,
    rankCount: 10,
    litTrialCount: safeFloor,
    theme: config.theme,
    icon: safeFloor === 10 ? 'fa-crown' : 'fa-arrow-up',
    motif: String(safeFloor),
    trials: [...config.trials],
    effectCount: Math.min(24, 8 + safeFloor),
    durationMs: safeFloor === 10 ? 3200 : 2400,
    eyebrow: storyClimb ? '首次登塔 · 楼层记录已保存' : '每周冠军巡回 · 楼层记录已保存',
    title: `第 ${safeFloor} 层突破`,
    subtitle: safeFloor === 10 ? '星冠光轨抵达塔顶' : `第 ${safeFloor + 1} 层升降轨道已经接通`,
    statement: '云端确认完成，已经点亮的楼层不会因失败或旧存档而倒退。',
    nextLabel: safeFloor === 10 ? '本轮登顶完成' : `下一层 · ${safeFloor + 1}`
  }
}
