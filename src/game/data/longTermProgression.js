export const LONG_TERM_PROGRESS_SCHEMA_VERSION = 1
export const MAP_COMPLETION_CATALOG_VERSION = 1
export const PERMANENT_DEX_VERSION = 1
export const ELITE_UNLOCK_TASK_VERSION = 3
export const CHAMPION_TOWER_VERSION = 1

export const CHAMPION_TOWER_MAP_ID = 'GodotMapV2_ChampionTower'
export const CHAMPION_TOWER_UNLOCK_BOSS_ID = 'elite_dragon_boss'

const isProgressionFeatureEnabled = (envKey) => {
  const configuredValue = import.meta.env?.[envKey]
  if (configuredValue === 'false') return false
  return import.meta.env?.DEV === true || configuredValue === 'true'
}

export const LONG_TERM_PROGRESSION_FLAGS = Object.freeze({
  mapProgressV1: isProgressionFeatureEnabled('VITE_ENABLE_MAP_PROGRESS_V1'),
  permanentDexV1: isProgressionFeatureEnabled('VITE_ENABLE_PERMANENT_DEX_V1'),
  completionRewardsV1: isProgressionFeatureEnabled('VITE_ENABLE_COMPLETION_REWARDS_V1'),
  eliteUnlockTasksV1: isProgressionFeatureEnabled('VITE_ENABLE_ELITE_UNLOCK_TASKS_V1'),
  championTowerV1: isProgressionFeatureEnabled('VITE_ENABLE_CHAMPION_TOWER_V1')
})

export const ADVENTURE_CHAPTERS = Object.freeze([
  { chapter: 1, mapId: 'GodotMap', name: '新手山谷', theme: 'valley', accent: '#55a96f' },
  { chapter: 2, mapId: 'GodotMapV2', name: '星音草径', theme: 'meadow', accent: '#72b95c' },
  { chapter: 3, mapId: 'GodotMapV2_MistLake', name: '雾湖苇岸', theme: 'mist', accent: '#4ba5aa' },
  { chapter: 4, mapId: 'GodotMapV2_FarmTown', name: '风车农庄', theme: 'farm', accent: '#d59b4a' },
  { chapter: 5, mapId: 'GodotMapV2_PirateShore', name: '贝壳海岸', theme: 'shore', accent: '#3c91bd' },
  { chapter: 6, mapId: 'GodotMapV2_Graveyard', name: '月影墓园', theme: 'grave', accent: '#776b9f' },
  { chapter: 7, mapId: 'GodotMapV2_HexRuins', name: '六角遗迹', theme: 'hex', accent: '#8d61b7' },
  { chapter: 8, mapId: 'GodotMapV2_SurvivalRidge', name: '铁木营地', theme: 'ridge', accent: '#a16a3f' },
  { chapter: 9, mapId: 'GodotMapV2_BossHighland', name: '星雾高地', theme: 'peak', accent: '#8176bd' },
  { chapter: 10, mapId: 'GodotMapV2_FrostDojo', name: '霜镜道馆', theme: 'frost', accent: '#75d5e6' },
  { chapter: 11, mapId: 'GodotMapV2_TideDojo', name: '深潮道馆', theme: 'tide', accent: '#2ec4bd' },
  { chapter: 12, mapId: 'GodotMapV2_IronDojo', name: '铁壁道馆', theme: 'iron', accent: '#e0aa45' },
  { chapter: 13, mapId: 'GodotMapV2_DragonDojo', name: '龙穹道馆', theme: 'dragon', accent: '#b181e4' },
  { chapter: 14, mapId: CHAMPION_TOWER_MAP_ID, name: '冠军挑战塔', theme: 'champion', accent: '#f2c868' }
])

export const ADVENTURE_CHAPTER_BY_MAP_ID = Object.freeze(Object.fromEntries(
  ADVENTURE_CHAPTERS.map((chapter) => [chapter.mapId, chapter])
))

const reward = (itemType, itemKey, quantity) => ({ itemType, itemKey, quantity })

const EARLY_COMPLETION_REWARDS = Object.freeze({
  25: [reward('pokeball', 'pokeball_basic', 2)],
  50: [reward('potion', 'potion', 2)],
  75: [reward('expPotion', 'exp_potion_small', 1)],
  100: [reward('pokeball', 'pokeball_great', 1), reward('expPotion', 'exp_potion_small', 1)]
})

const MID_COMPLETION_REWARDS = Object.freeze({
  25: [reward('pokeball', 'pokeball_great', 1)],
  50: [reward('potion', 'super_potion', 2)],
  75: [reward('expPotion', 'exp_potion_medium', 1)],
  100: [reward('pokeball', 'pokeball_ultra', 1), reward('expPotion', 'exp_potion_medium', 1)]
})

const LATE_COMPLETION_REWARDS = Object.freeze({
  25: [reward('pokeball', 'pokeball_ultra', 1)],
  50: [reward('potion', 'hyper_potion', 2)],
  75: [reward('expPotion', 'exp_potion_large', 1)],
  100: [reward('pokeball', 'pokeball_ultra', 2), reward('potion', 'max_potion', 1)]
})

const TOWER_COMPLETION_REWARDS = Object.freeze({
  25: [reward('potion', 'hyper_potion', 2)],
  50: [reward('pokeball', 'pokeball_ultra', 2)],
  75: [reward('expPotion', 'exp_potion_super', 1)],
  100: [reward('pokeball', 'pokeball_master', 1)]
})

export const MAP_COMPLETION_THRESHOLDS = Object.freeze([25, 50, 75, 100])

export function getMapCompletionRewardDefinition(mapId, threshold) {
  const chapter = ADVENTURE_CHAPTER_BY_MAP_ID[mapId]?.chapter || 1
  const safeThreshold = MAP_COMPLETION_THRESHOLDS.includes(Number(threshold)) ? Number(threshold) : null
  if (!safeThreshold) return null
  const table = chapter === 14
    ? TOWER_COMPLETION_REWARDS
    : chapter >= 9
      ? LATE_COMPLETION_REWARDS
      : chapter >= 5
        ? MID_COMPLETION_REWARDS
        : EARLY_COMPLETION_REWARDS
  return {
    id: `map:${mapId}:completion:v${MAP_COMPLETION_CATALOG_VERSION}:${safeThreshold}`,
    mapId,
    chapter,
    threshold: safeThreshold,
    items: table[safeThreshold].map((item) => ({ ...item })),
    championTrophy: chapter === 14 && safeThreshold === 100
  }
}

const step = (taskId, suffix, name, x, y, visualKind, extra = {}) => ({
  id: `${taskId}:${suffix}`,
  eventId: `objective_${taskId}_${suffix}`,
  name,
  position: { x, y },
  visualKind,
  ...extra
})

const task = ({ id, mapId, targetEventId, title, description, theme, order, prerequisiteTaskIds = [], prerequisiteTrainerIds = [], minigame = null, steps }) => ({
  id,
  mapId,
  targetEventId,
  title,
  description,
  theme,
  order,
  prerequisiteTaskIds,
  prerequisiteTrainerIds,
  minigame,
  steps: steps.map((entry, index) => ({ ...entry, sequence: entry.sequence || index + 1 }))
})

export const ELITE_UNLOCK_TASKS = Object.freeze([
  task({
    id: 'frost_mirror_crown', mapId: 'GodotMapV2_FrostDojo', targetEventId: 'elite_frost_boss',
    title: '霜镜翻格阵', description: '像经典翻灯谜题一样，每次点击会同时翻转自己和上下左右的霜镜，让 16 面镜子全部亮起。', theme: 'frost', order: 4,
    prerequisiteTrainerIds: ['elite_frost_lieutenant_1', 'elite_frost_lieutenant_2', 'elite_frost_lieutenant_3'],
    minigame: {
      kind: 'lights_out', label: '点亮 16 面霜镜', skill: '逻辑 · 翻格 · 规划',
      guide: { goal: '让 4×4 的霜镜全部变成发光状态。', action: '点一面镜子，它和上下左右会一起变亮或变暗。' },
      size: 4,
      start: [false, true, true, false, true, false, false, true, true, false, false, true, false, true, true, false],
      target: true,
      maxMoves: 14
    },
    steps: [step('frost_mirror_crown', 'altar', '王座霜镜盘', 12, 7, 'frost_mirror')]
  }),

  task({
    id: 'tide_dual_pressure', mapId: 'GodotMapV2_TideDojo', targetEventId: 'elite_tide_lieutenant_1',
    title: '潮压控制台', description: '先看下一轮水流变化，再用三个按钮让数字进入绿色区，并连续保持 3 次。', theme: 'tide', order: 1,
    minigame: {
      kind: 'pressure_balance', label: '把水压停在绿色区', skill: '观察 · 计算 · 选择',
      guide: { goal: '让白色指针停在绿色区域，连续成功 3 次。', action: '先看“下一轮变化”，再选进水、稳流或泄压。' },
      start: 18, target: 52, tolerance: 6, holdRounds: 3, maxMoves: 12,
      intake: 17, release: -11, drift: [4, -3, 5, -4, 2, -2]
    },
    steps: [
      step('tide_dual_pressure', 'west', '西潮进水阀', 7, 19, 'tide_pressure'),
      step('tide_dual_pressure', 'east', '东潮泄压阀', 14, 19, 'tide_pressure')
    ]
  }),
  task({
    id: 'tide_current_observation', mapId: 'GodotMapV2_TideDojo', targetEventId: 'elite_tide_lieutenant_2',
    title: '深海声呐', description: '看清 5 个图案亮起的顺序，等播放结束后，再按相同顺序点一遍。', theme: 'tide', order: 2,
    prerequisiteTaskIds: ['tide_dual_pressure'], prerequisiteTrainerIds: ['elite_tide_lieutenant_1'],
    minigame: {
      kind: 'sonar_memory', label: '记住 5 个图案', skill: '观察 · 记忆 · 排序',
      guide: { goal: '把刚才亮起的 5 个图案按原顺序点出来。', action: '先点“播放”，播放结束后再开始作答；答错可以重听。' },
      pattern: ['crest', 'abyss', 'shell', 'moon', 'crest'], maxMistakes: 2
    },
    steps: [
      step('tide_current_observation', 'outer', '浅层声呐台', 3, 14, 'tide_gauge'),
      step('tide_current_observation', 'middle', '中层声呐台', 3, 10, 'tide_gauge'),
      step('tide_current_observation', 'upper', '深层声呐台', 7, 5, 'tide_gauge')
    ]
  }),
  task({
    id: 'tide_vortex_stability', mapId: 'GodotMapV2_TideDojo', targetEventId: 'elite_tide_lieutenant_3',
    title: '逆流漩涡阵', description: '点击外环、内环和核心，让三层箭头都转到各自显示的目标方向。', theme: 'tide', order: 3,
    prerequisiteTaskIds: ['tide_current_observation'], prerequisiteTrainerIds: ['elite_tide_lieutenant_2'],
    minigame: {
      kind: 'vortex_rotation', label: '转动三层水环', skill: '方向 · 旋转 · 观察',
      guide: { goal: '让外环、内环、核心三个箭头都对准目标方向。', action: '点击某一层就会转动 90°；变成绿色代表这一层已对准。' },
      start: [0, 2, 1], target: [2, 0, 3], maxMoves: 12
    },
    steps: [
      step('tide_vortex_stability', 'outer', '外环导流锚', 16, 5, 'tide_anchor'),
      step('tide_vortex_stability', 'inner', '内环导流锚', 20, 5, 'tide_anchor'),
      step('tide_vortex_stability', 'altar', '核心导流锚', 24, 9, 'tide_anchor')
    ]
  }),
  task({
    id: 'tide_oath', mapId: 'GodotMapV2_TideDojo', targetEventId: 'elite_tide_boss',
    title: '深潮分流瓶', description: '像经典水管分色谜题一样，把上层颜色倒入空瓶或同色瓶，最后让每种潮流各归一瓶。', theme: 'tide', order: 4,
    prerequisiteTaskIds: ['tide_vortex_stability'], prerequisiteTrainerIds: ['elite_tide_lieutenant_1', 'elite_tide_lieutenant_2', 'elite_tide_lieutenant_3'],
    minigame: {
      kind: 'water_sort', label: '将三种潮流完成分色', skill: '分类 · 顺序 · 规划',
      guide: { goal: '让每个非空瓶只有一种颜色，并且刚好装满。', action: '先点要倒出的瓶子，再点空瓶或顶部同色的瓶子。' },
      capacity: 3,
      tubes: [['aqua', 'violet', 'aqua'], ['violet', 'gold', 'violet'], ['gold', 'aqua', 'gold'], [], []],
      maxMoves: 30
    },
    steps: [step('tide_oath', 'altar', '中央潮汐祭坛', 17, 17, 'tide_altar')]
  }),

  task({
    id: 'iron_forge_ignition', mapId: 'GodotMapV2_IronDojo', targetEventId: 'elite_iron_lieutenant_1',
    title: '百炼节拍', description: '看准来回移动的白色游标，在它进入绿色区域时点击落锤，连续完成 3 次。', theme: 'iron', order: 1,
    minigame: {
      kind: 'forge_rhythm', label: '绿色区域精准落锤', skill: '节奏 · 反应 · 专注',
      guide: { goal: '让白色游标进入绿色区域时落锤，命中 3 次。', action: '绿色区域每轮会换位置；没打中也可以继续观察。' },
      centers: [0.28, 0.67, 0.46], tolerance: 0.145, maxMisses: 3, cycleMs: 3200
    },
    steps: [
      step('iron_forge_ignition', 'outer', '预热锻炉', 7, 19, 'iron_forge'),
      step('iron_forge_ignition', 'inner', '精炼锻炉', 12, 19, 'iron_forge')
    ]
  }),
  task({
    id: 'iron_magnetic_rail', mapId: 'GodotMapV2_IronDojo', targetEventId: 'elite_iron_lieutenant_2',
    title: '磁轨逻辑阵', description: '旋转 6 块弯轨，让电流从左上入口沿着弯轨前进，最后到达右下出口。', theme: 'iron', order: 2,
    prerequisiteTaskIds: ['iron_forge_ignition'], prerequisiteTrainerIds: ['elite_iron_lieutenant_1'],
    minigame: {
      kind: 'circuit_rotation', label: '接通 6 块弯轨', skill: '推理 · 旋转 · 路径',
      guide: { goal: '把左上入口一路接到右下出口，6 块弯轨都要用上。', action: '点击方块旋转弯轨；接通的部分会发出绿色亮光。' },
      shapes: ['corner', 'corner', 'corner', 'corner', 'corner', 'corner'],
      start: [0, 2, 1, 3, 0, 2], target: [1, 0, 1, 3, 2, 3], pathOrder: [0, 3, 4, 1, 2, 5], maxMoves: 18
    },
    steps: [
      step('iron_magnetic_rail', 'west', '西侧磁轨端口', 8, 15, 'iron_relay'),
      step('iron_magnetic_rail', 'center', '中央磁轨矩阵', 14, 15, 'iron_relay'),
      step('iron_magnetic_rail', 'east', '东侧闸门端口', 19, 15, 'iron_relay')
    ]
  }),
  task({
    id: 'iron_wall_reinforcement', mapId: 'GodotMapV2_IronDojo', targetEventId: 'elite_iron_lieutenant_3',
    title: '装甲配重局', description: '把 1–6 号装甲分到三面墙上，让三面墙的总数刚好等于 6、7、8。', theme: 'iron', order: 3,
    prerequisiteTaskIds: ['iron_magnetic_rail'], prerequisiteTrainerIds: ['elite_iron_lieutenant_2'],
    minigame: {
      kind: 'armor_distribution', label: '三面墙数字配对', skill: '加法 · 组合 · 规划',
      guide: { goal: '让甲墙等于 6、乙墙等于 7、丙墙等于 8，所有装甲都要使用。', action: '反复点击同一块装甲，可在甲、乙、丙和未分配之间切换。' },
      capacities: [6, 7, 8], plates: [1, 2, 3, 4, 5, 6], maxMoves: 24
    },
    steps: [
      step('iron_wall_reinforcement', 'lower', '下层承重台', 19, 11, 'iron_armor'),
      step('iron_wall_reinforcement', 'middle', '中层承重台', 14, 11, 'iron_armor'),
      step('iron_wall_reinforcement', 'upper', '上层承重台', 10, 11, 'iron_armor')
    ]
  }),
  task({
    id: 'iron_crown_core', mapId: 'GodotMapV2_IronDojo', targetEventId: 'elite_iron_boss',
    title: '王冠数字滑块', description: '像经典数字华容道一样，把与空格相邻的铁片滑进去，将 1–8 按顺序排好。', theme: 'iron', order: 4,
    prerequisiteTaskIds: ['iron_wall_reinforcement'], prerequisiteTrainerIds: ['elite_iron_lieutenant_1', 'elite_iron_lieutenant_2', 'elite_iron_lieutenant_3'],
    minigame: {
      kind: 'sliding_tiles', label: '排好 1–8 号王冠铁片', skill: '空间 · 步骤 · 规划',
      guide: { goal: '把数字排成 1、2、3 / 4、5、6 / 7、8、空格。', action: '只能点击空格上下左右相邻的数字，它会滑入空格。' },
      size: 3,
      start: [4, 6, 1, 7, 0, 3, 5, 2, 8],
      target: [1, 2, 3, 4, 5, 6, 7, 8, 0],
      maxMoves: 40
    },
    steps: [step('iron_crown_core', 'console', '王座核心控制台', 19, 6, 'iron_core')]
  }),

  task({
    id: 'dragon_fang_resonance', mapId: 'GodotMapV2_DragonDojo', targetEventId: 'elite_dragon_lieutenant_1',
    title: '龙息调音台', description: '逐个点击三个旋钮，根据“偏离、接近、对准”的提示，把三个旋钮都调成绿色。', theme: 'dragon', order: 1,
    minigame: {
      kind: 'resonance_tuning', label: '三个旋钮找正确档位', skill: '反馈 · 推断 · 调整',
      guide: { goal: '把三个旋钮都调到绿色“对准”状态。', action: '每点一次会换一档；显示“接近”说明只差一档。' },
      start: [0, 0, 0], target: [2, 4, 1], levels: 5, maxMoves: 12
    },
    steps: [
      step('dragon_fang_resonance', 'left', '左翼龙牙柱', 12, 20, 'dragon_fang'),
      step('dragon_fang_resonance', 'right', '右翼龙牙柱', 16, 20, 'dragon_fang'),
      step('dragon_fang_resonance', 'gate', '门前龙牙柱', 12, 22, 'dragon_fang')
    ]
  }),
  task({
    id: 'dragon_star_path', mapId: 'GodotMapV2_DragonDojo', targetEventId: 'elite_dragon_lieutenant_2',
    title: '星穹航路', description: '读懂 4 条线索，从紫微星出发，在有连线的星星之间找到通往王冠的路线。', theme: 'dragon', order: 2,
    prerequisiteTaskIds: ['dragon_fang_resonance'], prerequisiteTrainerIds: ['elite_dragon_lieutenant_1'],
    minigame: {
      kind: 'constellation_path', label: '根据线索寻找星路', skill: '阅读 · 路径 · 选择',
      guide: { goal: '从紫微星出发，依次走到王冠；只能点有连线的下一颗星。', action: '走错会回到起点并少一颗星光，共有 3 次机会。' },
      nodes: ['violet', 'cyan', 'gold', 'white', 'red', 'blue', 'crown'],
      path: ['violet', 'gold', 'cyan', 'white', 'crown'],
      edges: [['violet', 'gold'], ['violet', 'red'], ['gold', 'cyan'], ['gold', 'blue'], ['cyan', 'white'], ['red', 'white'], ['blue', 'crown'], ['white', 'crown']],
      maxMistakes: 3
    },
    steps: [
      step('dragon_star_path', 'lower', '启航星标', 10, 19, 'dragon_beacon'),
      step('dragon_star_path', 'middle', '分岔星标', 15, 17, 'dragon_beacon'),
      step('dragon_star_path', 'upper', '王冠星标', 13, 17, 'dragon_beacon')
    ]
  }),
  task({
    id: 'dragon_final_seal', mapId: 'GodotMapV2_DragonDojo', targetEventId: 'elite_dragon_lieutenant_3',
    title: '终焉符文锁', description: '在 6 次机会内猜出 3 个符文的正确顺序，每次提交后都会告诉你哪些位置猜对了。', theme: 'dragon', order: 3,
    prerequisiteTaskIds: ['dragon_star_path'], prerequisiteTrainerIds: ['elite_dragon_lieutenant_2'],
    minigame: {
      kind: 'rune_code', label: '猜出 3 个符文顺序', skill: '观察 · 排除 · 验证',
      guide: { goal: '猜出 3 个符文的正确图案和位置。', action: '点符文换图案，再提交；绿色是位置正确，黄色是图案正确但位置不对。' },
      runes: ['fang', 'wing', 'flame', 'crown'], target: ['wing', 'fang', 'crown'], maxAttempts: 6
    },
    steps: [
      step('dragon_final_seal', 'one', '牙之符文柱', 15, 14, 'dragon_seal'),
      step('dragon_final_seal', 'two', '翼之符文柱', 13, 14, 'dragon_seal'),
      step('dragon_final_seal', 'three', '焰之符文柱', 15, 12, 'dragon_seal'),
      step('dragon_final_seal', 'four', '冠之符文柱', 13, 12, 'dragon_seal')
    ]
  }),
  task({
    id: 'dragon_oath', mapId: 'GodotMapV2_DragonDojo', targetEventId: 'elite_dragon_boss',
    title: '龙印移塔', description: '像经典汉诺塔一样，一次只移动顶部的一枚龙印，把四层印塔完整移到右侧王座。', theme: 'dragon', order: 4,
    prerequisiteTaskIds: ['dragon_final_seal'], prerequisiteTrainerIds: ['elite_dragon_lieutenant_1', 'elite_dragon_lieutenant_2', 'elite_dragon_lieutenant_3'],
    minigame: {
      kind: 'tower_hanoi', label: '将四层龙印塔移到右侧', skill: '分步 · 顺序 · 规划',
      guide: { goal: '让 4 枚龙印全部移到右侧王座，且从大到小叠放。', action: '先点一根柱子拿起顶部龙印，再点目标柱；大印不能压在小印上。' },
      discs: 4,
      maxMoves: 24
    },
    steps: [step('dragon_oath', 'altar', '穹顶龙印祭坛', 15, 8, 'dragon_altar')]
  })
])

export const ELITE_UNLOCK_TASK_BY_ID = Object.freeze(Object.fromEntries(
  ELITE_UNLOCK_TASKS.map((entry) => [entry.id, entry])
))

export const ELITE_UNLOCK_STEP_BY_EVENT_ID = Object.freeze(Object.fromEntries(
  ELITE_UNLOCK_TASKS.flatMap((entry) => entry.steps.map((taskStep) => [taskStep.eventId, { task: entry, step: taskStep }]))
))

export function getEliteUnlockTasksForMap(mapId) {
  return ELITE_UNLOCK_TASKS.filter((entry) => entry.mapId === mapId)
}

export function getEliteUnlockTaskForTarget(mapId, targetEventId) {
  return ELITE_UNLOCK_TASKS.find((entry) => entry.mapId === mapId && entry.targetEventId === targetEventId) || null
}

export function getEliteUnlockObjectiveEvents(mapId) {
  return getEliteUnlockTasksForMap(mapId).flatMap((entry) => entry.steps.map((taskStep) => ({
    id: taskStep.eventId,
    type: 'objective',
    position: { ...taskStep.position },
    properties: {
      interactionKind: 'elite_unlock_objective',
      taskId: entry.id,
      taskTitle: entry.title,
      taskDescription: entry.description,
      targetEventId: entry.targetEventId,
      theme: entry.theme,
      order: entry.order,
      stepId: taskStep.id,
      stepName: taskStep.name,
      stepSequence: taskStep.sequence || null,
      visualKind: taskStep.visualKind,
      minigameKind: entry.minigame?.kind || null,
      minigameLabel: entry.minigame?.label || null,
      prerequisiteTaskIds: [...entry.prerequisiteTaskIds],
      prerequisiteTrainerIds: [...entry.prerequisiteTrainerIds]
    }
  })))
}

const towerFloor = (floor, name, title, pokemonIds, levels, visualTier) => ({
  floor,
  id: `champion_tower_floor_${floor}`,
  name,
  title,
  visualTier,
  team: pokemonIds.map((pokemonId, index) => ({ pokemonId, level: levels[index] }))
})

export const CHAMPION_TOWER_FLOORS = Object.freeze([
  towerFloor(1, '晨星引路者', '第一层 · 启程之光', [134, 139, 192], [96, 96, 96], 1),
  towerFloor(2, '棱镜守望者', '第二层 · 逆光棱镜', [76, 74, 26], [96, 97, 97], 1),
  towerFloor(3, '苍穹编队长', '第三层 · 风与羽翼', [143, 147, 12], [97, 97, 98], 1),
  towerFloor(4, '深层巡礼者', '第四层 · 潮下回廊', [199, 193, 206, 204], [97, 98, 98, 98], 2),
  towerFloor(5, '双极锻造师', '第五层 · 雷火锻台', [205, 74, 9, 139], [98, 98, 98, 99], 2),
  towerFloor(6, '远古观测者', '第六层 · 遗迹回声', [65, 94, 150, 151], [98, 99, 99, 99], 2),
  towerFloor(7, '群星驯兽师', '第七层 · 星兽列阵', [145, 146, 76, 149, 134], [99, 99, 99, 99, 100], 3),
  towerFloor(8, '终局策士', '第八层 · 万象棋局', [192, 204, 208, 69, 199], [99, 99, 100, 100, 100], 3),
  towerFloor(9, '王座代行者', '第九层 · 冠冕前夜', [139, 193, 205, 209, 150], [99, 100, 100, 100, 100], 3),
  towerFloor(10, '星冠冠军', '第十层 · 冠军之证', [134, 192, 204, 208, 209, 150], [100, 100, 100, 100, 100, 100], 4)
])

export const CHAMPION_TOWER_WEEKLY_REWARD = Object.freeze([
  reward('pokeball', 'pokeball_ultra', 2),
  reward('potion', 'super_potion', 2)
])

const CHAMPION_TOWER_WEEKLY_SPECIES_POOL = Object.freeze(Array.from(new Set(
  CHAMPION_TOWER_FLOORS.flatMap((entry) => entry.team.map((member) => member.pokemonId))
)))

const hashTowerSeed = (value) => {
  let hash = 2166136261
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function getChampionTowerFloor(floor) {
  const safeFloor = Math.max(1, Math.min(10, Math.trunc(Number(floor)) || 1))
  return CHAMPION_TOWER_FLOORS.find((entry) => entry.floor === safeFloor) || CHAMPION_TOWER_FLOORS[0]
}

export function getChampionTowerWeeklyFloor(floor, seasonKey) {
  const baseFloor = getChampionTowerFloor(floor)
  const safeSeasonKey = typeof seasonKey === 'string' && seasonKey.trim() ? seasonKey.trim() : 'weekly'
  const rankedSpecies = CHAMPION_TOWER_WEEKLY_SPECIES_POOL
    .map((pokemonId) => ({
      pokemonId,
      rank: hashTowerSeed(`${safeSeasonKey}:${baseFloor.floor}:${pokemonId}`)
    }))
    .sort((left, right) => left.rank - right.rank || left.pokemonId - right.pokemonId)

  return {
    ...baseFloor,
    id: `${baseFloor.id}:weekly:${safeSeasonKey}`,
    name: `周巡·${baseFloor.name}`,
    title: `${baseFloor.title} · 周巡`,
    seasonKey: safeSeasonKey,
    weekly: true,
    team: baseFloor.team.map((member, index) => ({
      pokemonId: rankedSpecies[index].pokemonId,
      level: member.level
    }))
  }
}
