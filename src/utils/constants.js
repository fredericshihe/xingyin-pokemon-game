// 类型定义
export const TYPES = {
  NORMAL: 'normal',
  FIRE: 'fire',
  WATER: 'water',
  GRASS: 'grass',
  ELECTRIC: 'electric',
  ICE: 'ice',
  FIGHTING: 'fighting',
  POISON: 'poison',
  GROUND: 'ground',
  FLYING: 'flying',
  PSYCHIC: 'psychic',
  BUG: 'bug',
  ROCK: 'rock',
  GHOST: 'ghost',
  DRAGON: 'dragon',
  DARK: 'dark',
  STEEL: 'steel',
  FAIRY: 'fairy'
}

export const TYPE_NAMES_CN = {
  normal: '普通', fire: '火', water: '水', grass: '草', electric: '电',
  ice: '冰', fighting: '格斗', poison: '毒', ground: '地面',
  flying: '飞行', psychic: '超能', bug: '虫', rock: '岩石',
  ghost: '幽灵', dragon: '龙', dark: '恶', steel: '钢', fairy: '妖精'
}

// 类型克制表
export const TYPE_CHART = {
  [TYPES.NORMAL]: { [TYPES.ROCK]: 0.5, [TYPES.GHOST]: 0, [TYPES.STEEL]: 0.5 },
  [TYPES.FIRE]: { [TYPES.FIRE]: 0.5, [TYPES.WATER]: 0.5, [TYPES.GRASS]: 2, [TYPES.ICE]: 2, [TYPES.BUG]: 2, [TYPES.ROCK]: 0.5, [TYPES.DRAGON]: 0.5, [TYPES.STEEL]: 2 },
  [TYPES.WATER]: { [TYPES.FIRE]: 2, [TYPES.WATER]: 0.5, [TYPES.GRASS]: 0.5, [TYPES.GROUND]: 2, [TYPES.ROCK]: 2, [TYPES.DRAGON]: 0.5 },
  [TYPES.GRASS]: { [TYPES.FIRE]: 0.5, [TYPES.WATER]: 2, [TYPES.GRASS]: 0.5, [TYPES.POISON]: 0.5, [TYPES.GROUND]: 2, [TYPES.FLYING]: 0.5, [TYPES.BUG]: 0.5, [TYPES.ROCK]: 2, [TYPES.DRAGON]: 0.5, [TYPES.STEEL]: 0.5 },
  [TYPES.ELECTRIC]: { [TYPES.WATER]: 2, [TYPES.GRASS]: 0.5, [TYPES.ELECTRIC]: 0.5, [TYPES.GROUND]: 0, [TYPES.FLYING]: 2, [TYPES.DRAGON]: 0.5 },
  [TYPES.ICE]: { [TYPES.FIRE]: 0.5, [TYPES.WATER]: 0.5, [TYPES.GRASS]: 2, [TYPES.ICE]: 0.5, [TYPES.GROUND]: 2, [TYPES.FLYING]: 2, [TYPES.DRAGON]: 2, [TYPES.STEEL]: 0.5 },
  [TYPES.FIGHTING]: { [TYPES.NORMAL]: 2, [TYPES.ICE]: 2, [TYPES.ROCK]: 2, [TYPES.DARK]: 2, [TYPES.STEEL]: 2, [TYPES.FLYING]: 0.5, [TYPES.POISON]: 0.5, [TYPES.BUG]: 0.5, [TYPES.PSYCHIC]: 0.5, [TYPES.FAIRY]: 0.5, [TYPES.GHOST]: 0 },
  [TYPES.POISON]: { [TYPES.GRASS]: 2, [TYPES.FAIRY]: 2, [TYPES.POISON]: 0.5, [TYPES.GROUND]: 0.5, [TYPES.ROCK]: 0.5, [TYPES.GHOST]: 0.5, [TYPES.STEEL]: 0 },
  [TYPES.GROUND]: { [TYPES.FIRE]: 2, [TYPES.ELECTRIC]: 2, [TYPES.POISON]: 2, [TYPES.ROCK]: 2, [TYPES.STEEL]: 2, [TYPES.GRASS]: 0.5, [TYPES.BUG]: 0.5, [TYPES.FLYING]: 0 },
  [TYPES.FLYING]: { [TYPES.GRASS]: 2, [TYPES.FIGHTING]: 2, [TYPES.BUG]: 2, [TYPES.ELECTRIC]: 0.5, [TYPES.ROCK]: 0.5, [TYPES.STEEL]: 0.5 },
  [TYPES.PSYCHIC]: { [TYPES.FIGHTING]: 2, [TYPES.POISON]: 2, [TYPES.PSYCHIC]: 0.5, [TYPES.STEEL]: 0.5, [TYPES.DARK]: 0 },
  [TYPES.BUG]: { [TYPES.GRASS]: 2, [TYPES.PSYCHIC]: 2, [TYPES.DARK]: 2, [TYPES.FIRE]: 0.5, [TYPES.FIGHTING]: 0.5, [TYPES.POISON]: 0.5, [TYPES.FLYING]: 0.5, [TYPES.GHOST]: 0.5, [TYPES.STEEL]: 0.5, [TYPES.FAIRY]: 0.5 },
  [TYPES.ROCK]: { [TYPES.FIRE]: 2, [TYPES.ICE]: 2, [TYPES.FLYING]: 2, [TYPES.BUG]: 2, [TYPES.FIGHTING]: 0.5, [TYPES.GROUND]: 0.5, [TYPES.STEEL]: 0.5 },
  [TYPES.GHOST]: { [TYPES.GHOST]: 2, [TYPES.PSYCHIC]: 2, [TYPES.DARK]: 0.5, [TYPES.NORMAL]: 0 },
  [TYPES.DRAGON]: { [TYPES.DRAGON]: 2, [TYPES.STEEL]: 0.5, [TYPES.FAIRY]: 0 },
  [TYPES.DARK]: { [TYPES.GHOST]: 2, [TYPES.PSYCHIC]: 2, [TYPES.FIGHTING]: 0.5, [TYPES.DARK]: 0.5, [TYPES.FAIRY]: 0.5 },
  [TYPES.STEEL]: { [TYPES.ICE]: 2, [TYPES.ROCK]: 2, [TYPES.FAIRY]: 2, [TYPES.FIRE]: 0.5, [TYPES.WATER]: 0.5, [TYPES.ELECTRIC]: 0.5, [TYPES.STEEL]: 0.5 },
  [TYPES.FAIRY]: { [TYPES.FIGHTING]: 2, [TYPES.DRAGON]: 2, [TYPES.DARK]: 2, [TYPES.FIRE]: 0.5, [TYPES.POISON]: 0.5, [TYPES.STEEL]: 0.5 }
}

export const getEffectiveness = (moveType, targetType) => {
  if (!TYPE_CHART[moveType]) return 1
  return TYPE_CHART[moveType][targetType] !== undefined ? TYPE_CHART[moveType][targetType] : 1
}
