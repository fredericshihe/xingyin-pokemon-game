import { assetUrl } from './assetUrl'
import { TYPES } from './constants'

const SFX_BASE = '/assets/audio/sfx'

// UI音效
export const UI_SFX = {
  SELECT: assetUrl(`${SFX_BASE}/ui/select.ogg`),
  CONFIRM: assetUrl(`${SFX_BASE}/ui/confirm.ogg`),
  CANCEL: assetUrl(`${SFX_BASE}/ui/cancel.ogg`),
  ERROR: assetUrl(`${SFX_BASE}/ui/error.ogg`),
  OPEN_MENU: assetUrl(`${SFX_BASE}/ui/open-menu.ogg`),
  CLOSE_MENU: assetUrl(`${SFX_BASE}/ui/close-menu.ogg`),
  PAGE_TURN: assetUrl(`${SFX_BASE}/ui/page-turn.ogg`),
}

// 战斗事件音效
export const BATTLE_EVENT_SFX = {
  ENCOUNTER_WILD: assetUrl(`${SFX_BASE}/battle/events/encounter-wild.ogg`),
  ENCOUNTER_TRAINER: assetUrl(`${SFX_BASE}/battle/events/encounter-trainer.ogg`),
  ENCOUNTER_BOSS: assetUrl(`${SFX_BASE}/battle/events/encounter-boss.ogg`),
  ENCOUNTER_RARE: assetUrl(`${SFX_BASE}/battle/events/encounter-rare.ogg`),
  FAINT: assetUrl(`${SFX_BASE}/battle/events/faint.ogg`),
  VICTORY: assetUrl(`${SFX_BASE}/battle/events/victory.ogg`),
  DEFEAT: assetUrl(`${SFX_BASE}/battle/events/defeat.ogg`),
  SWITCH: assetUrl(`${SFX_BASE}/battle/events/switch.ogg`),
  ESCAPE_SUCCESS: assetUrl(`${SFX_BASE}/battle/events/escape-success.ogg`),
  ESCAPE_FAIL: assetUrl(`${SFX_BASE}/battle/events/escape-fail.ogg`),
}

// 伤害音效
export const IMPACT_SFX = {
  HIT_NORMAL: assetUrl(`${SFX_BASE}/battle/impact/hit-normal.ogg`),
  HIT_SUPER_EFFECTIVE: assetUrl(`${SFX_BASE}/battle/impact/hit-super-effective.ogg`),
  HIT_NOT_VERY_EFFECTIVE: assetUrl(`${SFX_BASE}/battle/impact/hit-not-very-effective.ogg`),
  HIT_CRITICAL: assetUrl(`${SFX_BASE}/battle/impact/hit-critical.ogg`),
  MISS: assetUrl(`${SFX_BASE}/battle/impact/miss.ogg`),
  FIZZLE: assetUrl(`${SFX_BASE}/battle/impact/fizzle.ogg`),
}

// 状态音效
export const STATUS_SFX = {
  POISON: assetUrl(`${SFX_BASE}/battle/status/poison.ogg`),
  BURN: assetUrl(`${SFX_BASE}/battle/status/burn.ogg`),
  PARALYSIS: assetUrl(`${SFX_BASE}/battle/status/paralysis.ogg`),
  SLEEP: assetUrl(`${SFX_BASE}/battle/status/sleep.ogg`),
  FREEZE: assetUrl(`${SFX_BASE}/battle/status/freeze.ogg`),
  CONFUSION: assetUrl(`${SFX_BASE}/battle/status/confusion.ogg`),
  FLINCH: assetUrl(`${SFX_BASE}/battle/status/flinch.ogg`),
  HEAL: assetUrl(`${SFX_BASE}/battle/status/heal.ogg`),
  BUFF: assetUrl(`${SFX_BASE}/battle/status/buff.ogg`),
  DEBUFF: assetUrl(`${SFX_BASE}/battle/status/debuff.ogg`),
}

// 精灵球音效
export const POKEBALL_SFX = {
  THROW: assetUrl(`${SFX_BASE}/battle/pokeball/throw.ogg`),
  SHAKE: assetUrl(`${SFX_BASE}/battle/pokeball/shake.ogg`),
  CATCH: assetUrl(`${SFX_BASE}/battle/pokeball/catch.ogg`),
  BREAK: assetUrl(`${SFX_BASE}/battle/pokeball/break.ogg`),
}

// 道具音效
export const ITEM_SFX = {
  POTION: assetUrl(`${SFX_BASE}/items/potion.ogg`),
  POKEBALL: assetUrl(`${SFX_BASE}/items/pokeball.ogg`),
  BERRY: assetUrl(`${SFX_BASE}/items/berry.ogg`),
  EXP: assetUrl(`${SFX_BASE}/items/exp.ogg`),
  EVOLUTION: assetUrl(`${SFX_BASE}/items/evolution.ogg`),
  PURCHASE: assetUrl(`${SFX_BASE}/items/purchase.ogg`),
  PICKUP: assetUrl(`${SFX_BASE}/items/pickup.ogg`),
}

// 特殊事件音效
export const SPECIAL_SFX = {
  LEVEL_UP: assetUrl(`${SFX_BASE}/special/level-up.ogg`),
  EVOLUTION_START: assetUrl(`${SFX_BASE}/special/evolution-start.ogg`),
  EVOLUTION_COMPLETE: assetUrl(`${SFX_BASE}/special/evolution-complete.ogg`),
  ACHIEVEMENT: assetUrl(`${SFX_BASE}/special/achievement.ogg`),
  WARP: assetUrl(`${SFX_BASE}/special/warp.ogg`),
  FAST_TRAVEL: assetUrl(`${SFX_BASE}/special/fast-travel.ogg`),
}

// 技能音效映射（支持变体）
// 使用 {variant} 占位符，会被替换为 1, 2, 3 等
export const MOVE_SFX_TEMPLATES = {
  [TYPES.FIRE]: assetUrl(`${SFX_BASE}/battle/moves/fire/fire-attack-{variant}.ogg`),
  [TYPES.WATER]: assetUrl(`${SFX_BASE}/battle/moves/water/water-attack-{variant}.ogg`),
  [TYPES.GRASS]: assetUrl(`${SFX_BASE}/battle/moves/grass/grass-attack-{variant}.ogg`),
  [TYPES.ELECTRIC]: assetUrl(`${SFX_BASE}/battle/moves/electric/electric-attack-{variant}.ogg`),
  [TYPES.ICE]: assetUrl(`${SFX_BASE}/battle/moves/ice/ice-attack-{variant}.ogg`),
  [TYPES.FIGHTING]: assetUrl(`${SFX_BASE}/battle/moves/fighting/fighting-attack-{variant}.ogg`),
  [TYPES.POISON]: assetUrl(`${SFX_BASE}/battle/moves/poison/poison-attack-{variant}.ogg`),
  [TYPES.GROUND]: assetUrl(`${SFX_BASE}/battle/moves/ground/ground-attack-{variant}.ogg`),
  [TYPES.FLYING]: assetUrl(`${SFX_BASE}/battle/moves/flying/flying-attack-{variant}.ogg`),
  [TYPES.PSYCHIC]: assetUrl(`${SFX_BASE}/battle/moves/psychic/psychic-attack-{variant}.ogg`),
  [TYPES.BUG]: assetUrl(`${SFX_BASE}/battle/moves/bug/bug-attack-{variant}.ogg`),
  [TYPES.ROCK]: assetUrl(`${SFX_BASE}/battle/moves/rock/rock-attack-{variant}.ogg`),
  [TYPES.GHOST]: assetUrl(`${SFX_BASE}/battle/moves/ghost/ghost-attack-{variant}.ogg`),
  [TYPES.DRAGON]: assetUrl(`${SFX_BASE}/battle/moves/dragon/dragon-attack-{variant}.ogg`),
  [TYPES.DARK]: assetUrl(`${SFX_BASE}/battle/moves/dark/dark-attack-{variant}.ogg`),
  [TYPES.STEEL]: assetUrl(`${SFX_BASE}/battle/moves/steel/steel-attack-{variant}.ogg`),
  [TYPES.FAIRY]: assetUrl(`${SFX_BASE}/battle/moves/fairy/fairy-attack-{variant}.ogg`),
  [TYPES.NORMAL]: assetUrl(`${SFX_BASE}/battle/moves/normal/normal-attack-{variant}.ogg`),
}

// 获取技能音效URL（带变体）
export function getMoveSfxUrl(type, variant = null) {
  const template = MOVE_SFX_TEMPLATES[type] || MOVE_SFX_TEMPLATES[TYPES.NORMAL]
  if (variant !== null) {
    return template.replace('{variant}', String(variant))
  }
  return template
}

// 根据效果获取伤害音效
export function getImpactSfxUrl(effectiveness, isCritical = false) {
  if (isCritical) return IMPACT_SFX.HIT_CRITICAL
  if (effectiveness > 1) return IMPACT_SFX.HIT_SUPER_EFFECTIVE
  if (effectiveness < 1) return IMPACT_SFX.HIT_NOT_VERY_EFFECTIVE
  return IMPACT_SFX.HIT_NORMAL
}

// 根据状态获取音效
export function getStatusSfxUrl(status) {
  const statusMap = {
    poison: STATUS_SFX.POISON,
    burn: STATUS_SFX.BURN,
    paralysis: STATUS_SFX.PARALYSIS,
    sleep: STATUS_SFX.SLEEP,
    freeze: STATUS_SFX.FREEZE,
    confusion: STATUS_SFX.CONFUSION,
    flinch: STATUS_SFX.FLINCH,
    heal: STATUS_SFX.HEAL,
    buff: STATUS_SFX.BUFF,
    debuff: STATUS_SFX.DEBUFF,
  }
  return statusMap[status] || STATUS_SFX.BUFF
}

// 获取遇敌音效
export function getEncounterSfxUrl({ trainer = false, boss = false, rare = false } = {}) {
  if (boss) return BATTLE_EVENT_SFX.ENCOUNTER_BOSS
  if (trainer) return BATTLE_EVENT_SFX.ENCOUNTER_TRAINER
  if (rare) return BATTLE_EVENT_SFX.ENCOUNTER_RARE
  return BATTLE_EVENT_SFX.ENCOUNTER_WILD
}

// 收集所有需要预加载的音效URL
export function getAllSfxUrls() {
  const urls = [
    ...Object.values(UI_SFX),
    ...Object.values(BATTLE_EVENT_SFX),
    ...Object.values(IMPACT_SFX),
    ...Object.values(STATUS_SFX),
    ...Object.values(POKEBALL_SFX),
    ...Object.values(ITEM_SFX),
    ...Object.values(SPECIAL_SFX),
  ]

  // 添加所有技能音效变体（每个属性3个变体）
  Object.values(MOVE_SFX_TEMPLATES).forEach((template) => {
    for (let i = 1; i <= 3; i++) {
      urls.push(template.replace('{variant}', String(i)))
    }
  })

  return [...new Set(urls)]
}

// 获取核心音效URL（优先加载）
export function getCoreSfxUrls() {
  return [
    ...Object.values(UI_SFX),
    ...Object.values(IMPACT_SFX),
    BATTLE_EVENT_SFX.ENCOUNTER_WILD,
    BATTLE_EVENT_SFX.FAINT,
    BATTLE_EVENT_SFX.VICTORY,
    STATUS_SFX.HEAL,
    POKEBALL_SFX.THROW,
    POKEBALL_SFX.CATCH,
  ]
}
