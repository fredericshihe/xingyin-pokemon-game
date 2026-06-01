import { TYPES } from './constants.js'
import { itemSprite } from './itemSprites.js'
import { getOfficialLearnLevelByMove } from './officialLearnsets.js'
import { OFFICIAL_EXTRA_MOVES } from './officialExtraMoves.js'
import { withExplicitLevelEvolution } from './pokemonEvolutionRules.js'
import { assetUrl } from './assetUrl.js'
import { pokemonArtUrl, pokemonArtPngUrl, POKEMON_PLACEHOLDER_URL } from './mediaAssetUrl.js'

export { getOfficialLearnLevelByMove } from './officialLearnsets.js'

// ─── Sprite helper ────────────────────────────────────────────────────────────
// dexNo = 官方图鉴编号（与游戏内 id 不同）
const sp = (dexNo) => ({
  pokedexId: dexNo,
  sprite: pokemonArtUrl(dexNo),
  backSprite: pokemonArtUrl(dexNo),
  fallbackSprite: pokemonArtPngUrl(dexNo),
})

// ─── 技能数据库 ──────────────────────────────────────────────────────────────
// 所有属性参考官方（Gen 6+ 数值）
// cost = 消耗 MP；0 表示可无限使用
export const MOVES = {
  // 普通
  tackle:       { name: '撞击',     type: TYPES.NORMAL,   power: 40,  accuracy: 100, category: 'physical', cost: 0,  unlockLevel: 1 },
  scratch:      { name: '抓',       type: TYPES.NORMAL,   power: 40,  accuracy: 100, category: 'physical', cost: 0,  unlockLevel: 1 },
  horn_attack:  { name: '角撞',     type: TYPES.NORMAL,   power: 65,  accuracy: 100, category: 'physical', cost: 7,  unlockLevel: 10 },
  quickattack:  { name: '电光一闪', type: TYPES.NORMAL,   power: 40,  accuracy: 100, priority: 1, category: 'physical', cost: 0,  unlockLevel: 8 },
  flail:        { name: '挣扎',     type: TYPES.NORMAL,   power: 50,  accuracy: 100, category: 'physical', cost: 5,  unlockLevel: 15 },
  fury_attack:  { name: '乱击',     type: TYPES.NORMAL,   power: 45,  accuracy: 85,  category: 'physical', cost: 6,  unlockLevel: 15 },
  bite:         { name: '咬住',     type: TYPES.DARK,     power: 60,  accuracy: 100, category: 'physical', cost: 6,  unlockLevel: 12, volatileStatus: 'flinch', volatileChance: 30 },
  bodyslam:     { name: '泰山压顶', type: TYPES.NORMAL,   power: 85,  accuracy: 100, category: 'physical', cost: 12, unlockLevel: 26, status: 'paralysis', statusChance: 30 },
  slash:        { name: '劈开',     type: TYPES.NORMAL,   power: 70,  accuracy: 100, category: 'physical', cost: 9,  unlockLevel: 20 },
  extremespeed: { name: '神速',     type: TYPES.NORMAL,   power: 80,  accuracy: 100, priority: 2, category: 'physical', cost: 19, unlockLevel: 42 },
  recover:      { name: '自我再生', type: TYPES.NORMAL,   power: 0,   accuracy: 100, effect: 'heal', category: 'status', cost: 18, unlockLevel: 30 },
  mimic:        { name: '模仿',     type: TYPES.NORMAL,   power: 0,   accuracy: 100, effect: 'mimic', category: 'status', cost: 13, unlockLevel: 18 },
  // 火
  ember:        { name: '火花',     type: TYPES.FIRE,     power: 40,  accuracy: 100, category: 'special', cost: 5,  unlockLevel: 5,  status: 'burn', statusChance: 10 },
  flamethrower: { name: '喷射火焰', type: TYPES.FIRE,     power: 90,  accuracy: 100, category: 'special', cost: 13, unlockLevel: 28, status: 'burn', statusChance: 10 },
  fire_blast:   { name: '大字爆炎', type: TYPES.FIRE,     power: 110, accuracy: 85,  category: 'special', cost: 20, unlockLevel: 42, status: 'burn', statusChance: 10 },
  // 水
  watergun:     { name: '水枪',     type: TYPES.WATER,    power: 40,  accuracy: 100, category: 'special', cost: 5,  unlockLevel: 5 },
  surf:         { name: '冲浪',     type: TYPES.WATER,    power: 90,  accuracy: 100, category: 'special', cost: 13, unlockLevel: 30 },
  hydropump:    { name: '水炮',     type: TYPES.WATER,    power: 110, accuracy: 80,  category: 'special', cost: 20, unlockLevel: 44 },
  // 草
  vinewhip:     { name: '藤鞭',     type: TYPES.GRASS,    power: 45,  accuracy: 100, category: 'physical', cost: 5,  unlockLevel: 5 },
  razorleaf:    { name: '飞叶快刀', type: TYPES.GRASS,    power: 55,  accuracy: 95,  category: 'physical', cost: 8,  unlockLevel: 16 },
  // 电
  thundershock: { name: '电击',     type: TYPES.ELECTRIC, power: 40,  accuracy: 100, category: 'special', cost: 5,  unlockLevel: 5,  status: 'paralysis', statusChance: 10 },
  thunderbolt:  { name: '十万伏特', type: TYPES.ELECTRIC, power: 90,  accuracy: 100, category: 'special', cost: 13, unlockLevel: 28, status: 'paralysis', statusChance: 10 },
  zap_cannon:   { name: '电磁炮',   type: TYPES.ELECTRIC, power: 120, accuracy: 50,  category: 'special', cost: 18, unlockLevel: 40, status: 'paralysis', statusChance: 100 },
  // 冰
  icebeam:      { name: '冰冻光束', type: TYPES.ICE,      power: 90,  accuracy: 100, category: 'special', cost: 13, unlockLevel: 30, status: 'freeze', statusChance: 10 },
  blizzard:     { name: '暴风雪',   type: TYPES.ICE,      power: 110, accuracy: 70,  category: 'special', cost: 20, unlockLevel: 44, status: 'freeze', statusChance: 10 },
  // 格斗
  karate_chop:  { name: '空手劈',   type: TYPES.FIGHTING, power: 50,  accuracy: 100, category: 'physical', cost: 5,  unlockLevel: 8 },
  double_kick:  { name: '二连踢',   type: TYPES.FIGHTING, power: 60,  accuracy: 100, category: 'physical', cost: 7,  unlockLevel: 10 },
  low_kick:     { name: '下踢',     type: TYPES.FIGHTING, power: 60,  accuracy: 100, category: 'physical', cost: 8,  unlockLevel: 16 },
  // 毒
  poison_sting: { name: '毒针',     type: TYPES.POISON,   power: 15,  accuracy: 100, category: 'physical', cost: 3,  unlockLevel: 1, status: 'poison', statusChance: 30 },
  poison_jab:   { name: '毒击',     type: TYPES.POISON,   power: 80,  accuracy: 100, category: 'physical', cost: 11, unlockLevel: 24, status: 'poison', statusChance: 30 },
  // 地面
  earthquake:   { name: '地震',     type: TYPES.GROUND,   power: 100, accuracy: 100, category: 'physical', cost: 17, unlockLevel: 36 },
  // 飞行
  peck:         { name: '啄',       type: TYPES.FLYING,   power: 35,  accuracy: 100, category: 'physical', cost: 4,  unlockLevel: 1 },
  wing_attack:  { name: '翅膀攻击', type: TYPES.FLYING,   power: 60,  accuracy: 100, category: 'physical', cost: 7,  unlockLevel: 14 },
  fly:          { name: '飞翔',     type: TYPES.FLYING,   power: 90,  accuracy: 95,  category: 'physical', cost: 14, unlockLevel: 32 },
  drill_peck:   { name: '钻孔啄',   type: TYPES.FLYING,   power: 80,  accuracy: 100, category: 'physical', cost: 11, unlockLevel: 24 },
  hurricane:    { name: '暴风',     type: TYPES.FLYING,   power: 110, accuracy: 70,  category: 'special', cost: 20, unlockLevel: 44, volatileStatus: 'confusion', volatileChance: 30 },
  sky_attack:   { name: '神鸟猛击', type: TYPES.FLYING,   power: 140, accuracy: 90,  category: 'physical', cost: 22, unlockLevel: 48, charge: true, volatileStatus: 'flinch', volatileChance: 30 },
  // 超能
  psychic:      { name: '精神强念', type: TYPES.PSYCHIC,  power: 90,  accuracy: 100, category: 'special', cost: 13, unlockLevel: 30, statChange: { target: 'defender', stat: 'spDef', stages: -1, chance: 10 } },
  hypnosis:     { name: '催眠术',   type: TYPES.PSYCHIC,  power: 0,   accuracy: 60,  status: 'sleep', statusChance: 100, category: 'status', cost: 10, unlockLevel: 18 },
  dream_eater:  { name: '食梦',     type: TYPES.PSYCHIC,  power: 100, accuracy: 100, category: 'special', effect: 'drain', requiresTargetStatus: 'sleep', cost: 16, unlockLevel: 36 },
  // 虫
  fury_cutter:  { name: '连斩',     type: TYPES.BUG,      power: 40,  accuracy: 95,  category: 'physical', cost: 4,  unlockLevel: 6 },
  // 岩石
  rock_throw:   { name: '落石',     type: TYPES.ROCK,     power: 50,  accuracy: 90,  category: 'physical', cost: 6,  unlockLevel: 10 },
  rock_slide:   { name: '岩崩',     type: TYPES.ROCK,     power: 75,  accuracy: 90,  category: 'physical', cost: 11, unlockLevel: 24, volatileStatus: 'flinch', volatileChance: 30 },
  rollout:      { name: '滚动',     type: TYPES.ROCK,     power: 30,  accuracy: 90,  category: 'physical', cost: 5,  unlockLevel: 18 },
  // 幽灵
  lick:         { name: '舔',       type: TYPES.GHOST,    power: 30,  accuracy: 100, category: 'physical', cost: 4,  unlockLevel: 5, status: 'paralysis', statusChance: 30 },
  shadowball:   { name: '暗影球',   type: TYPES.GHOST,    power: 80,  accuracy: 100, category: 'special', cost: 11, unlockLevel: 24, statChange: { target: 'defender', stat: 'spDef', stages: -1, chance: 20 } },
  rage_fist:    { name: '愤怒之拳', type: TYPES.GHOST,    power: 50,  accuracy: 100, category: 'physical', cost: 12, unlockLevel: 35 },
  // 龙
  dragonclaw:   { name: '龙爪',     type: TYPES.DRAGON,   power: 80,  accuracy: 100, category: 'physical', cost: 12, unlockLevel: 30 },
  // 钢
  iron_tail:     { name: '铁尾',     type: TYPES.STEEL,    power: 100, accuracy: 75,  category: 'physical', cost: 15, unlockLevel: 30, statChange: { target: 'defender', stat: 'def', stages: -1, chance: 30 } },
  // 妖精
  moonblast:     { name: '月亮之力', type: TYPES.FAIRY,    power: 95,  accuracy: 100, category: 'special', cost: 15, unlockLevel: 35, statChange: { target: 'defender', stat: 'spAtk', stages: -1, chance: 30 } },
}

Object.assign(MOVES, Object.fromEntries(
  Object.entries(OFFICIAL_EXTRA_MOVES).filter(([moveKey]) => !MOVES[moveKey])
))

const FALLBACK_ZERO_COST_MOVES = ['tackle', 'scratch', 'quickattack', 'pound', 'peck'];

const uniqueMoveKeys = (moves = []) => {
  const seen = new Set();
  return moves.filter((moveKey) => {
    if (!MOVES[moveKey] || seen.has(moveKey)) return false;
    seen.add(moveKey);
    return true;
  });
};

export const getLocalLearnLevelByMove = (monster) => {
  const levels = {};
  for (const [levelKey, moveEntry] of Object.entries(monster?.learnset || {})) {
    const level = Number(levelKey);
    const moveKeys = Array.isArray(moveEntry) ? moveEntry : [moveEntry];
    for (const moveKey of moveKeys) {
      if (!MOVES[moveKey] || !Number.isInteger(level)) continue;
      levels[moveKey] = Math.min(levels[moveKey] ?? level, level);
    }
  }
  return levels;
};

export const getLearnLevelByMove = (monster) => {
  const officialLearnLevelByMove = getOfficialLearnLevelByMove(monster);
  return {
    ...(
      Object.keys(officialLearnLevelByMove).length > 0
        ? {}
        : getLocalLearnLevelByMove(monster)
    ),
    ...officialLearnLevelByMove,
  };
};

export const getMoveAvailabilityLevel = (monster, moveKey) => {
  const explicitLevel = getLearnLevelByMove(monster)[moveKey];
  if (Number.isInteger(Number(explicitLevel))) return Number(explicitLevel);
  const move = MOVES[moveKey];
  if (!move) return Infinity;
  return move.cost === 0 ? 1 : (move.unlockLevel || 1);
};

const moveMatchesType = (monster, moveKey) => {
  const moveType = MOVES[moveKey]?.type;
  return moveType && (moveType === monster?.type || moveType === monster?.type2);
};

const moveScore = (monster, moveKey) => {
  const move = MOVES[moveKey];
  if (!move) return -Infinity;
  const powerScore = Number(move.power) || 0;
  const statusScore = move.status || move.volatileStatus || move.statChange || move.statChanges || move.effect ? 16 : 0;
  const accuracyScore = Math.max(0, (Number(move.accuracy) || 100) - 80) * 0.2;
  const stabScore = moveMatchesType(monster, moveKey) ? 18 : 0;
  const priorityScore = (move.priority || 0) * 8;
  const costPenalty = Math.max(0, (move.cost || 0) - 10) * 0.8;
  return powerScore + statusScore + accuracyScore + stabScore + priorityScore - costPenalty;
};

const selectionMoveScore = (monster, moveKey, level = 1) => {
  const move = MOVES[moveKey];
  if (!move) return -Infinity;

  const safeLevel = Math.max(1, Math.min(100, Number(level) || 1));
  const power = Number(move.power) || 0;
  const cost = Number(move.cost) || 0;
  const statusLike =
    power <= 0 ||
    move.category === 'status' ||
    move.status ||
    move.volatileStatus ||
    move.statChange ||
    move.statChanges ||
    move.effect;

  let score = moveScore(monster, moveKey);

  if (safeLevel <= 20) {
    if (cost === 0) score += 18;
    else if (power > 0 && cost <= 5) score += 10;

    if (statusLike && safeLevel <= 12) score -= 8;
    if (power > 0 && power <= 50) score += 8;

    const softCostCap = safeLevel <= 8 ? 6 : safeLevel <= 16 ? 8 : 10;
    score -= Math.max(0, cost - softCostCap) * (safeLevel <= 8 ? 2.8 : 2.1);

    if (safeLevel <= 8 && power >= 100) score -= 34;
    else if (safeLevel <= 12 && power >= 95) score -= 26;
    else if (safeLevel <= 20 && power >= 110) score -= 18;

    if (safeLevel <= 8 && power > 70) {
      score -= (power - 70) * 2.4 + Math.max(0, cost - 8) * 3.5 + 12;
    } else if (safeLevel <= 12 && power > 85) {
      score -= (power - 85) * 1.8 + Math.max(0, cost - 9) * 2.4 + 8;
    } else if (safeLevel <= 20 && power > 95) {
      score -= (power - 95) * 1.2 + Math.max(0, cost - 10) * 1.8;
    }
  }

  return score;
};

const isDamagingMoveKey = (moveKey) => {
  const move = MOVES[moveKey];
  return Boolean(move && Number(move.power) > 0 && move.category !== 'status');
};

const hasDamagingMove = (moveKeys = []) => moveKeys.some((moveKey) => isDamagingMoveKey(moveKey));

const hasAffordableDamagingMove = (moveKeys = []) => moveKeys.some((moveKey) => {
  const move = MOVES[moveKey];
  return isDamagingMoveKey(moveKey) && (Number(move?.cost) || 0) <= 5;
});

const hasZeroCostMove = (moveKeys = []) => moveKeys.some((moveKey) => MOVES[moveKey]?.cost === 0);

const getBestDamagingMovePower = (moveKeys = []) => moveKeys
  .map((moveKey) => Number(MOVES[moveKey]?.power) || 0)
  .filter((power) => power > 0)
  .sort((a, b) => b - a)[0] || 0;

const addBestMove = (selected, candidates, predicate, monster, level = 1) => {
  const best = candidates
    .filter((moveKey) => !selected.includes(moveKey) && predicate(moveKey))
    .sort((a, b) => selectionMoveScore(monster, b, level) - selectionMoveScore(monster, a, level))[0];
  if (best) selected.push(best);
};

const getMinimumMoveCountForLevel = (level) => {
  if (level >= 24) return 4;
  if (level >= 16) return 3;
  if (level >= 8) return 2;
  return 1;
};

const getSupplementalBaseMoveLevel = (monster, moveKey) => {
  const move = MOVES[moveKey];
  if (!move) return Infinity;

  const power = Number(move.power) || 0;
  const cost = Number(move.cost) || 0;
  const statusLike =
    power <= 0 ||
    move.category === 'status' ||
    move.status ||
    move.volatileStatus ||
    move.statChange ||
    move.statChanges ||
    move.effect;

  let level = 28;
  if (power > 0 && cost === 0) {
    level = moveMatchesType(monster, moveKey) ? 1 : 8;
  } else if (power > 0 && cost <= 5 && power <= 50) {
    level = moveMatchesType(monster, moveKey) ? 5 : 8;
  } else if (statusLike) {
    level = 8;
  } else if (power > 0 && power <= 70 && cost <= 8) {
    level = 14;
  } else if (power > 0 && power <= 90 && cost <= 12) {
    level = 20;
  } else if (power > 95 || cost >= 16) {
    level = 32;
  }

  if (moveMatchesType(monster, moveKey) && power > 0 && power <= 50) level -= 2;
  if ((move.priority || 0) > 0 && power > 0) level -= 2;
  if (move.effect === 'heal') level = Math.max(level, 8);

  return Math.max(1, Math.min(50, level));
};

const getSupplementalMoveRank = (monster, moveKey) => {
  const move = MOVES[moveKey];
  if (!move) return Infinity;
  const power = Number(move.power) || 0;
  const cost = Number(move.cost) || 0;
  const statusLike =
    power <= 0 ||
    move.category === 'status' ||
    move.status ||
    move.volatileStatus ||
    move.statChange ||
    move.statChanges ||
    move.effect;

  const tier = power > 0 && cost === 0
    ? 0
    : power > 0 && cost <= 5
      ? 1
      : statusLike
        ? 2
        : power > 0 && power <= 70
          ? 3
          : power > 0 && power <= 95
            ? 4
            : 5;

  return tier * 1000 + getSupplementalBaseMoveLevel(monster, moveKey) * 10 - moveScore(monster, moveKey);
};

const getLevelMoveCandidates = (monster, level = 1) => {
  const safeLevel = Math.max(1, Math.min(100, Number(level) || 1));
  const officialLearnLevelByMove = getOfficialLearnLevelByMove(monster);
  const hasOfficialLearnset = Object.keys(officialLearnLevelByMove).length > 0;
  const rawBaseMoves = uniqueMoveKeys(monster?.moves || []);
  const baseMoves = hasOfficialLearnset
    ? rawBaseMoves.filter((moveKey) => officialLearnLevelByMove[moveKey] !== undefined)
    : rawBaseMoves;
  const learnLevelByMove = getLearnLevelByMove(monster);
  const explicitLearnsetMoves = Object.entries(learnLevelByMove)
    .filter(([, learnLevel]) => Number(learnLevel) <= safeLevel)
    .map(([moveKey]) => moveKey);
  let availableMoves = uniqueMoveKeys([...baseMoves, ...explicitLearnsetMoves]);
  let eligibleMoves = availableMoves.filter((moveKey) => {
    const move = MOVES[moveKey];
    return move && getMoveAvailabilityLevel(monster, moveKey) <= safeLevel;
  });

  if (hasOfficialLearnset) {
    const designMinimum = getMinimumMoveCountForLevel(safeLevel);
    const supplementalMoves = rawBaseMoves
      .filter((moveKey) => MOVES[moveKey] && !eligibleMoves.includes(moveKey))
      .filter((moveKey) => {
        const officialLevel = officialLearnLevelByMove[moveKey];
        const supplementalLevel = getSupplementalBaseMoveLevel(monster, moveKey);
        return supplementalLevel <= safeLevel && (officialLevel === undefined || officialLevel > supplementalLevel);
      })
      .sort((a, b) => getSupplementalMoveRank(monster, a) - getSupplementalMoveRank(monster, b));

    const supplementalSelected = [];
    const maybeTake = (predicate) => {
      const moveKey = supplementalMoves.find((candidate) => !supplementalSelected.includes(candidate) && predicate(candidate));
      if (moveKey) supplementalSelected.push(moveKey);
    };

    if (!hasDamagingMove(eligibleMoves)) {
      maybeTake((moveKey) => isDamagingMoveKey(moveKey));
    }
    if (eligibleMoves.length < designMinimum) {
      while (eligibleMoves.length + supplementalSelected.length < designMinimum) {
        maybeTake(() => true);
        if (supplementalSelected.length >= supplementalMoves.length) break;
      }
    }
    if (!hasAffordableDamagingMove([...eligibleMoves, ...supplementalSelected])) {
      maybeTake((moveKey) => isDamagingMoveKey(moveKey) && (Number(MOVES[moveKey]?.cost) || 0) <= 8);
    }
    if (
      supplementalSelected.length < supplementalMoves.length &&
      (eligibleMoves.filter((moveKey) => isDamagingMoveKey(moveKey)).length < 2 || getBestDamagingMovePower(eligibleMoves) <= 40)
    ) {
      maybeTake((moveKey) => {
        const move = MOVES[moveKey];
        return isDamagingMoveKey(moveKey) && (Number(move?.power) || 0) <= 65 && (Number(move?.cost) || 0) <= 8;
      });
    }

    if (supplementalSelected.length > 0) {
      availableMoves = uniqueMoveKeys([...availableMoves, ...supplementalSelected]);
      eligibleMoves = uniqueMoveKeys([...eligibleMoves, ...supplementalSelected]);
    }
  }

  if (!hasAffordableDamagingMove(eligibleMoves)) {
    const emergencyFallback = getEmergencyFallbackMove(rawBaseMoves);
    if (MOVES[emergencyFallback]) {
      availableMoves = uniqueMoveKeys([...availableMoves, emergencyFallback]);
      eligibleMoves = uniqueMoveKeys([...eligibleMoves, emergencyFallback]);
    }
  }

  return { safeLevel, baseMoves, availableMoves, eligibleMoves };
};

const getEmergencyFallbackMove = (baseMoves = []) => (
  FALLBACK_ZERO_COST_MOVES.find((moveKey) => MOVES[moveKey] && baseMoves.includes(moveKey)) ||
  baseMoves.find((moveKey) => MOVES[moveKey]?.cost === 0) ||
  FALLBACK_ZERO_COST_MOVES.find((moveKey) => MOVES[moveKey]) ||
  'tackle'
);

const getPreferredOpeningMove = (monster, baseMoves, eligibleMoves, level = 1) => {
  const eligibleZeroCostMoves = eligibleMoves.filter((moveKey) => MOVES[moveKey]?.cost === 0);
  if (eligibleZeroCostMoves.length > 0) {
    return eligibleZeroCostMoves
      .sort((a, b) => selectionMoveScore(monster, b, level) - selectionMoveScore(monster, a, level))[0];
  }
  if (eligibleMoves.length > 0) {
    return eligibleMoves
      .sort((a, b) => selectionMoveScore(monster, b, level) - selectionMoveScore(monster, a, level))[0];
  }
  return getEmergencyFallbackMove(baseMoves);
};

const backfillMoveScore = (monster, moveKey, level) => {
  const move = MOVES[moveKey];
  if (!move) return -Infinity;
  const unlockGap = Math.max(0, (move.unlockLevel || 1) - level);
  const lateMovePenalty = unlockGap * 6;
  const heavyCostPenalty = Math.max(0, (move.cost || 0) - 8) * 1.2;
  return selectionMoveScore(monster, moveKey, level) - lateMovePenalty - heavyCostPenalty;
};

export const getBalancedMovesForLevel = (monster, level = 1) => {
  const { safeLevel, baseMoves, eligibleMoves } = getLevelMoveCandidates(monster, level);
  const fallbackMove = getPreferredOpeningMove(monster, baseMoves, eligibleMoves, safeLevel);
  const selected = [];

  if (MOVES[fallbackMove]) selected.push(fallbackMove);
  addBestMove(selected, eligibleMoves, (moveKey) => moveMatchesType(monster, moveKey) && (MOVES[moveKey].power || 0) > 0, monster, safeLevel);
  addBestMove(selected, eligibleMoves, (moveKey) => !moveMatchesType(monster, moveKey) && (MOVES[moveKey].power || 0) > 0, monster, safeLevel);
  addBestMove(selected, eligibleMoves, (moveKey) => MOVES[moveKey].category === 'status' || MOVES[moveKey].status || MOVES[moveKey].volatileStatus || MOVES[moveKey].statChange || MOVES[moveKey].statChanges || MOVES[moveKey].effect, monster, safeLevel);

  eligibleMoves
    .filter((moveKey) => !selected.includes(moveKey))
    .sort((a, b) => selectionMoveScore(monster, b, safeLevel) - selectionMoveScore(monster, a, safeLevel))
    .forEach((moveKey) => {
      if (selected.length < 4) selected.push(moveKey);
    });

  const desiredMoveCount = Math.min(
    4,
    getMinimumMoveCountForLevel(safeLevel),
    uniqueMoveKeys([...eligibleMoves, fallbackMove]).length
  );
  eligibleMoves
    .filter((moveKey) => !selected.includes(moveKey))
    .sort((a, b) => backfillMoveScore(monster, b, safeLevel) - backfillMoveScore(monster, a, safeLevel))
    .forEach((moveKey) => {
      if (selected.length < desiredMoveCount) selected.push(moveKey);
    });

  return uniqueMoveKeys(selected).slice(0, 4);
};

export const getMoveKeysAvailableForMonsterLevel = (monster, level = 1, { includeEmergencyFallback = true } = {}) => {
  const { baseMoves, eligibleMoves } = getLevelMoveCandidates(monster, level);
  const fallbackMove = includeEmergencyFallback
    ? (eligibleMoves.length === 0 ? getEmergencyFallbackMove(baseMoves) : null)
    : null;
  return uniqueMoveKeys([...eligibleMoves, fallbackMove].filter(Boolean));
};

export const isMoveValidForPokemonLevel = (monster, moveKey, level = 1) => (
  Boolean(MOVES[moveKey]) &&
  getMoveKeysAvailableForMonsterLevel(monster, level).includes(moveKey)
);

export const normalizeMovesForPokemonLevel = (monster, moves = [], level = 1, {
  backfill = true,
  preferBalanced = false,
  preferBalancedWhenInvalid = false,
} = {}) => {
  const balancedMoves = getBalancedMovesForLevel(monster, level);
  const rawKnownMoves = Array.isArray(moves) ? moves : [];
  const knownMoves = uniqueMoveKeys(rawKnownMoves);
  const availableMoveKeys = new Set(getMoveKeysAvailableForMonsterLevel(monster, level));
  const validKnownMoves = knownMoves.filter((moveKey) => availableMoveKeys.has(moveKey));
  const hasInvalidMoves = rawKnownMoves.length !== knownMoves.length || validKnownMoves.length !== knownMoves.length;
  const needsZeroCostBackfill = !validKnownMoves.some((moveKey) => MOVES[moveKey]?.cost === 0);
  const shouldBackfill = backfill || validKnownMoves.length === 0 || needsZeroCostBackfill;
  const fillerMoves = shouldBackfill ? balancedMoves : [];
  const shouldPreferBalanced = preferBalanced || (preferBalancedWhenInvalid && hasInvalidMoves);

  return uniqueMoveKeys(
    shouldPreferBalanced
      ? [...fillerMoves, ...validKnownMoves]
      : [...validKnownMoves, ...fillerMoves]
  ).slice(0, 4);
};

// ─── 精灵球 ──────────────────────────────────────────────────────────────────
export const POKEBALLS = {
  pokeball_basic: { name: '精灵球', price: 150,  catchRateMultiplier: 1.0, sprite: itemSprite('poke-ball.png') },
  pokeball_great: { name: '超级球', price: 600,  catchRateMultiplier: 1.5, sprite: itemSprite('great-ball.png') },
  pokeball_ultra: { name: '高级球', price: 1200, catchRateMultiplier: 2.0, sprite: itemSprite('ultra-ball.png') },
}

// ─── 回复药水 ────────────────────────────────────────────────────────────────
export const POTIONS = {
  potion: {
    name: '伤药',
    price: 100,
    healAmount: 20,
    mpRestoreAmount: 5,
    sprite: itemSprite('potion.png'),
    description: '恢复 HP 20 / MP 5 / 解除异常',
  },
  super_potion: {
    name: '好伤药',
    price: 250,
    healAmount: 50,
    mpRestoreAmount: 20,
    sprite: itemSprite('super-potion.png'),
    description: '恢复 HP 50 / MP 20 / 解除异常',
  },
  hyper_potion: {
    name: '厉害伤药',
    price: 600,
    healAmount: 120,
    mpRestoreAmount: 50,
    sprite: itemSprite('hyper-potion.png'),
    description: '恢复 HP 120 / MP 50 / 解除异常',
  },
}

// ─── 经验药水（战斗之外的可控加速成长来源）───────────────────────────────────
export const EXP_POTIONS = {
  exp_potion_small:  { name: '小经验药水', price: 120, expAmount: 90,  sprite: itemSprite('exp-potion-small.png') },
  exp_potion_medium: { name: '中经验药水', price: 360, expAmount: 300, sprite: itemSprite('exp-potion-medium.png') },
  exp_potion_large:  { name: '大经验药水', price: 900, expAmount: 840, sprite: itemSprite('exp-potion-large.png') },
}

// ─── 进化道具（仅保留历史库存/后台白名单兼容；现行进化不再消耗它们）───────────
export const EVOLUTION_ITEMS = {
  water_stone:      { name: '水之石',     price: 1800, sprite: itemSprite('water-stone.png') },
  thunder_stone:    { name: '雷之石',     price: 1800, sprite: itemSprite('thunder-stone.png') },
  fire_stone:       { name: '火之石',     price: 1800, sprite: itemSprite('fire-stone.png') },
  leaf_stone:       { name: '叶之石',     price: 1800, sprite: itemSprite('leaf-stone.png') },
  ice_stone:        { name: '冰之石',     price: 1800, sprite: itemSprite('ice-stone.png') },
  moon_stone:       { name: '月之石',     price: 1800, sprite: itemSprite('moon-stone.png') },
  black_augurite:   { name: '黑奇石',     price: 2200, sprite: itemSprite('black-augurite.png') },
  dragon_scale:     { name: '龙之鳞片',   price: 2200, sprite: itemSprite('dragon-scale.png') },
  magmarizer:       { name: '熔岩增幅器', price: 2400, sprite: itemSprite('magmarizer.png') },
  electirizer:      { name: '电力增幅器', price: 2400, sprite: itemSprite('electirizer.png') },
  protector:        { name: '护具',       price: 2200, sprite: itemSprite('protector.png') },
  upgrade:          { name: '升级数据',   price: 2200, sprite: itemSprite('up-grade.png') },
  dubious_disc:     { name: '可疑补丁',   price: 2600, sprite: itemSprite('dubious-disc.png') },
  oval_stone:       { name: '浑圆之石',   price: 1600, sprite: itemSprite('oval-stone.png') },
}

// ─── 宝可梦数据库 ─────────────────────────────────────────────────────────────
//
// 字段说明：
//   id      游戏内唯一编号（可不连续，新增时取当前最大值+1）
//   dexNo   官方图鉴编号（决定 sprite URL，与 id 无关）
//   name    中文名
//   type    主属性（必填）
//   type2   副属性（可选，省略则无副属性）
//   maxHp   官方 HP 种族值（公式：floor(2*base*lv/100)+lv+10）
//   maxMp   游戏自定义 MP（建议 = max(30, round(spAtk*0.6+10))，法术/辅助系酌情提高）
//   atk     官方 ATK 种族值
//   def     官方 DEF 种族值
//   spAtk   官方 SP.ATK 种族值
//   spDef   官方 SP.DEF 种族值
//   spd     官方 SPD 种族值
//   moves   技能 key 数组（引用 MOVES，最多 4 个）
//
// ── 新增宝可梦模板 ──
// {
//   id: <下一个id>, dexNo: <图鉴号>,
//   name: '<中文名>',
//   type: TYPES.<TYPE>,               // 必填
//   // type2: TYPES.<TYPE>,           // 有副属性时取消注释
//   maxHp: <HP种族值>, maxMp: <自定义MP>,
//   atk: <ATK>, def: <DEF>, spAtk: <SP.ATK>, spDef: <SP.DEF>, spd: <SPD>,
//   moves: ['<move1>', '<move2>', '<move3>', '<move4>'],
//   ...sp(<图鉴号>),
// },
// ─────────────────────────────────────────────────────────────────────────────

export const MONSTERS = [
  // ── 御三家 ──────────────────────────────────────────────────────────────────
  {
    id: 1, dexNo: 1, name: '妙蛙种子',
    type: TYPES.GRASS, type2: TYPES.POISON,
    maxHp: 45, maxMp: 50, atk: 49, def: 49, spAtk: 65, spDef: 65, spd: 45,
    moves: ['tackle', 'vinewhip', 'razorleaf', 'recover'],
    learnset: { 29: 'bodyslam', 41: 'hypnosis' },
    evolvesTo: { level: 16, targetId: 71 },
    ...sp(1),
  },
  {
    id: 2, dexNo: 4, name: '小火龙',
    type: TYPES.FIRE,
    maxHp: 39, maxMp: 45, atk: 52, def: 43, spAtk: 60, spDef: 50, spd: 65,
    moves: ['scratch', 'ember', 'flamethrower', 'bite'],
    learnset: { 22: 'slash', 31: 'flamethrower', 42: 'fire_blast' },
    evolvesTo: { level: 16, targetId: 73 },
    ...sp(4),
  },
  {
    id: 3, dexNo: 7, name: '杰尼龟',
    type: TYPES.WATER,
    maxHp: 44, maxMp: 40, atk: 48, def: 65, spAtk: 50, spDef: 64, spd: 43,
    moves: ['tackle', 'watergun', 'surf', 'bite'],
    learnset: { 28: 'bodyslam', 40: 'surf', 52: 'hydropump' },
    evolvesTo: { level: 16, targetId: 75 },
    ...sp(7),
  },
  // ── 水系 ────────────────────────────────────────────────────────────────────
  {
    id: 5, dexNo: 79, name: '呆呆兽',
    type: TYPES.WATER, type2: TYPES.PSYCHIC,
    maxHp: 90, maxMp: 35, atk: 65, def: 65, spAtk: 40, spDef: 40, spd: 15,
    moves: ['tackle', 'watergun', 'hypnosis', 'recover'],
    learnset: { 18: 'psychic' },
    evolvesTo: { level: 37, targetId: 37 },
    alternateEvolutions: [
      { method: 'trade_item', targetId: 138 }
    ],
    ...sp(79),
  },
  {
    id: 8, dexNo: 130, name: '暴鲤龙',
    type: TYPES.WATER, type2: TYPES.FLYING,
    maxHp: 95, maxMp: 45, atk: 125, def: 79, spAtk: 60, spDef: 100, spd: 81,
    moves: ['bite', 'surf', 'dragonclaw', 'watergun'],
    ...sp(130),
  },
  {
    id: 9, dexNo: 131, name: '拉普拉斯',
    type: TYPES.WATER, type2: TYPES.ICE,
    maxHp: 130, maxMp: 60, atk: 85, def: 80, spAtk: 85, spDef: 95, spd: 60,
    moves: ['icebeam', 'surf', 'bodyslam', 'watergun'],
    ...sp(131),
  },
  {
    id: 16, dexNo: 129, name: '鲤鱼王',
    type: TYPES.WATER,
    maxHp: 20, maxMp: 30, atk: 10, def: 55, spAtk: 15, spDef: 20, spd: 80,
    moves: ['tackle', 'flail'],
    learnset: { 15: 'flail' },
    evolvesTo: { level: 20, targetId: 8 },
    ...sp(129),
  },
  {
    id: 33, dexNo: 62, name: '蚊香泳士',
    type: TYPES.WATER, type2: TYPES.FIGHTING,
    maxHp: 90, maxMp: 50, atk: 95, def: 95, spAtk: 70, spDef: 90, spd: 70,
    moves: ['surf', 'low_kick', 'bodyslam', 'hydropump'],
    ...sp(62),
  },
  {
    id: 37, dexNo: 80, name: '呆壳兽',
    type: TYPES.WATER, type2: TYPES.PSYCHIC,
    maxHp: 95, maxMp: 70, atk: 75, def: 110, spAtk: 100, spDef: 80, spd: 30,
    moves: ['surf', 'psychic', 'watergun', 'recover'],
    ...sp(80),
  },
  {
    id: 40, dexNo: 87, name: '白海狮',
    type: TYPES.WATER, type2: TYPES.ICE,
    maxHp: 90, maxMp: 50, atk: 70, def: 80, spAtk: 70, spDef: 95, spd: 70,
    moves: ['icebeam', 'surf', 'bodyslam', 'watergun'],
    ...sp(87),
  },
  {
    id: 42, dexNo: 91, name: '刺甲贝',
    type: TYPES.WATER, type2: TYPES.ICE,
    maxHp: 50, maxMp: 60, atk: 95, def: 180, spAtk: 85, spDef: 45, spd: 70,
    moves: ['icebeam', 'blizzard', 'surf', 'tackle'],
    ...sp(91),
  },
  {
    id: 44, dexNo: 99, name: '巨钳蟹',
    type: TYPES.WATER,
    maxHp: 55, maxMp: 40, atk: 130, def: 115, spAtk: 50, spDef: 50, spd: 75,
    moves: ['slash', 'surf', 'bodyslam', 'watergun'],
    ...sp(99),
  },
  {
    id: 53, dexNo: 115, name: '袋兽',
    type: TYPES.NORMAL,
    maxHp: 105, maxMp: 35, atk: 95, def: 80, spAtk: 40, spDef: 80, spd: 90,
    moves: ['bite', 'bodyslam', 'earthquake', 'tackle'],
    ...sp(115),
  },
  {
    id: 54, dexNo: 117, name: '海刺龙',
    type: TYPES.WATER,
    maxHp: 55, maxMp: 65, atk: 65, def: 95, spAtk: 95, spDef: 45, spd: 85,
    moves: ['hydropump', 'icebeam', 'watergun', 'tackle'],
    evolvesTo: { method: 'trade_item', item: 'dragon_scale', targetId: 86 },
    ...sp(117),
  },
  {
    id: 55, dexNo: 121, name: '宝石海星',
    type: TYPES.WATER, type2: TYPES.PSYCHIC,
    maxHp: 60, maxMp: 70, atk: 75, def: 85, spAtk: 100, spDef: 85, spd: 115,
    moves: ['surf', 'psychic', 'thunderbolt', 'recover'],
    ...sp(121),
  },
  {
    id: 62, dexNo: 134, name: '水伊布',
    type: TYPES.WATER,
    maxHp: 130, maxMp: 75, atk: 65, def: 60, spAtk: 110, spDef: 95, spd: 65,
    moves: ['hydropump', 'surf', 'icebeam', 'quickattack'],
    ...sp(134),
  },
  {
    id: 66, dexNo: 139, name: '多刺菊石兽',
    type: TYPES.ROCK, type2: TYPES.WATER,
    maxHp: 70, maxMp: 80, atk: 60, def: 125, spAtk: 115, spDef: 70, spd: 55,
    moves: ['hydropump', 'rock_slide', 'icebeam', 'watergun'],
    ...sp(139),
  },
  {
    id: 67, dexNo: 141, name: '镰刀盔',
    type: TYPES.ROCK, type2: TYPES.WATER,
    maxHp: 60, maxMp: 50, atk: 115, def: 105, spAtk: 65, spDef: 70, spd: 80,
    moves: ['slash', 'rock_slide', 'surf', 'tackle'],
    ...sp(141),
  },
  // ── 火系 ────────────────────────────────────────────────────────────────────
  {
    id: 7, dexNo: 59, name: '风速狗',
    type: TYPES.FIRE,
    maxHp: 90, maxMp: 70, atk: 110, def: 80, spAtk: 100, spDef: 80, spd: 95,
    moves: ['extremespeed', 'flamethrower', 'bite', 'ember'],
    ...sp(59),
  },
  {
    id: 29, dexNo: 38, name: '九尾',
    type: TYPES.FIRE,
    maxHp: 73, maxMp: 60, atk: 76, def: 75, spAtk: 81, spDef: 100, spd: 100,
    moves: ['flamethrower', 'fire_blast', 'hypnosis', 'quickattack'],
    ...sp(38),
  },
  {
    id: 36, dexNo: 78, name: '烈焰马',
    type: TYPES.FIRE,
    maxHp: 65, maxMp: 60, atk: 100, def: 70, spAtk: 80, spDef: 80, spd: 105,
    moves: ['flamethrower', 'fire_blast', 'quickattack', 'tackle'],
    ...sp(78),
  },
  {
    id: 59, dexNo: 126, name: '鸭嘴火兽',
    type: TYPES.FIRE,
    maxHp: 65, maxMp: 70, atk: 95, def: 57, spAtk: 100, spDef: 85, spd: 93,
    moves: ['flamethrower', 'karate_chop', 'ember', 'tackle'],
    evolvesTo: { method: 'trade_item', item: 'magmarizer', targetId: 94 },
    ...sp(126),
  },
  {
    id: 64, dexNo: 136, name: '火伊布',
    type: TYPES.FIRE,
    maxHp: 65, maxMp: 65, atk: 130, def: 60, spAtk: 95, spDef: 110, spd: 65,
    moves: ['flamethrower', 'ember', 'bite', 'quickattack'],
    ...sp(136),
  },
  // ── 草系 ────────────────────────────────────────────────────────────────────
  {
    id: 30, dexNo: 45, name: '霸王花',
    type: TYPES.GRASS, type2: TYPES.POISON,
    maxHp: 75, maxMp: 75, atk: 80, def: 85, spAtk: 110, spDef: 90, spd: 50,
    moves: ['vinewhip', 'razorleaf', 'poison_jab', 'recover'],
    ...sp(45),
  },
  {
    id: 46, dexNo: 103, name: '椰蛋树',
    type: TYPES.GRASS, type2: TYPES.PSYCHIC,
    maxHp: 95, maxMp: 85, atk: 95, def: 85, spAtk: 125, spDef: 75, spd: 55,
    moves: ['razorleaf', 'psychic', 'hypnosis', 'dream_eater'],
    ...sp(103),
  },
  // ── 电系 ────────────────────────────────────────────────────────────────────
  {
    id: 27, dexNo: 145, name: '闪电鸟',
    type: TYPES.ELECTRIC, type2: TYPES.FLYING,
    maxHp: 90, maxMp: 85, atk: 90, def: 85, spAtk: 125, spDef: 90, spd: 100,
    moves: ['thunderbolt', 'zap_cannon', 'drill_peck', 'quickattack'],
    ...sp(145),
  },
  {
    id: 4, dexNo: 25, name: '皮卡丘',
    type: TYPES.ELECTRIC,
    maxHp: 35, maxMp: 55, atk: 55, def: 40, spAtk: 50, spDef: 50, spd: 90,
    moves: ['tackle', 'quickattack', 'thundershock', 'thunderbolt'],
    evolvesTo: { method: 'thunder_stone', item: 'thunder_stone', targetId: 28 },
    ...sp(25),
  },
  {
    id: 28, dexNo: 26, name: '雷丘',
    type: TYPES.ELECTRIC,
    maxHp: 60, maxMp: 65, atk: 90, def: 55, spAtk: 90, spDef: 80, spd: 110,
    moves: ['thunderbolt', 'quickattack', 'bodyslam', 'thundershock'],
    ...sp(26),
  },
  {
    id: 38, dexNo: 82, name: '三合一磁怪',
    type: TYPES.ELECTRIC, type2: TYPES.STEEL,
    maxHp: 50, maxMp: 80, atk: 60, def: 95, spAtk: 120, spDef: 70, spd: 70,
    moves: ['thunderbolt', 'zap_cannon', 'iron_tail', 'tackle'],
    evolvesTo: { method: 'stone', item: 'thunder_stone', targetId: 143 },
    ...sp(82),
  },
  {
    id: 45, dexNo: 101, name: '顽皮雷弹',
    type: TYPES.ELECTRIC,
    maxHp: 60, maxMp: 60, atk: 50, def: 70, spAtk: 80, spDef: 80, spd: 150,
    moves: ['thunderbolt', 'zap_cannon', 'iron_tail', 'quickattack'],
    ...sp(101),
  },
  {
    id: 58, dexNo: 125, name: '电击兽',
    type: TYPES.ELECTRIC,
    maxHp: 65, maxMp: 65, atk: 83, def: 57, spAtk: 95, spDef: 85, spd: 105,
    moves: ['thunderbolt', 'quickattack', 'karate_chop', 'thundershock'],
    evolvesTo: { method: 'trade_item', item: 'electirizer', targetId: 122 },
    ...sp(125),
  },
  {
    id: 63, dexNo: 135, name: '雷伊布',
    type: TYPES.ELECTRIC,
    maxHp: 65, maxMp: 75, atk: 65, def: 60, spAtk: 110, spDef: 95, spd: 130,
    moves: ['thunderbolt', 'thundershock', 'quickattack', 'bite'],
    ...sp(135),
  },
  // ── 冰系 ────────────────────────────────────────────────────────────────────
  {
    id: 26, dexNo: 144, name: '急冻鸟',
    type: TYPES.ICE, type2: TYPES.FLYING,
    maxHp: 90, maxMp: 65, atk: 85, def: 100, spAtk: 95, spDef: 125, spd: 85,
    moves: ['icebeam', 'blizzard', 'hurricane', 'recover'],
    ...sp(144),
  },
  {
    id: 57, dexNo: 124, name: '迷唇姐',
    type: TYPES.ICE, type2: TYPES.PSYCHIC,
    maxHp: 65, maxMp: 80, atk: 50, def: 35, spAtk: 115, spDef: 95, spd: 95,
    moves: ['icebeam', 'psychic', 'hypnosis', 'tackle'],
    ...sp(124),
  },
  // ── 格斗系 ──────────────────────────────────────────────────────────────────
  {
    id: 18, dexNo: 67, name: '豪力',
    type: TYPES.FIGHTING,
    maxHp: 80, maxMp: 40, atk: 100, def: 70, spAtk: 50, spDef: 60, spd: 45,
    moves: ['low_kick', 'karate_chop', 'bodyslam', 'tackle'],
    learnset: { 44: 'earthquake' },
    evolvesTo: { method: 'trade', targetId: 34 },
    ...sp(67),
  },
  {
    id: 32, dexNo: 57, name: '火爆猴',
    type: TYPES.FIGHTING,
    maxHp: 65, maxMp: 45, atk: 105, def: 60, spAtk: 60, spDef: 70, spd: 95,
    moves: ['karate_chop', 'low_kick', 'bodyslam', 'scratch'],
    learnset: { 35: 'rage_fist' },
    evolvesTo: { method: 'move_usage', move: 'rage_fist', targetId: 126 },
    ...sp(57),
  },
  {
    id: 34, dexNo: 68, name: '怪力',
    type: TYPES.FIGHTING,
    maxHp: 90, maxMp: 50, atk: 130, def: 80, spAtk: 65, spDef: 85, spd: 55,
    moves: ['karate_chop', 'low_kick', 'bodyslam', 'earthquake'],
    ...sp(68),
  },
  {
    id: 48, dexNo: 106, name: '飞腿郎',
    type: TYPES.FIGHTING,
    maxHp: 50, maxMp: 30, atk: 120, def: 53, spAtk: 35, spDef: 110, spd: 87,
    moves: ['low_kick', 'karate_chop', 'quickattack', 'tackle'],
    ...sp(106),
  },
  {
    id: 49, dexNo: 107, name: '快拳郎',
    type: TYPES.FIGHTING,
    maxHp: 50, maxMp: 30, atk: 105, def: 79, spAtk: 35, spDef: 110, spd: 76,
    moves: ['karate_chop', 'quickattack', 'bodyslam', 'tackle'],
    ...sp(107),
  },
  // ── 毒系 ────────────────────────────────────────────────────────────────────
  {
    id: 17, dexNo: 34, name: '尼多王',
    type: TYPES.POISON, type2: TYPES.GROUND,
    maxHp: 81, maxMp: 60, atk: 102, def: 77, spAtk: 85, spDef: 75, spd: 85,
    moves: ['earthquake', 'poison_jab', 'bodyslam', 'rock_slide'],
    ...sp(34),
  },
  {
    id: 41, dexNo: 89, name: '臭臭泥',
    type: TYPES.POISON,
    maxHp: 105, maxMp: 50, atk: 105, def: 75, spAtk: 65, spDef: 100, spd: 50,
    moves: ['poison_jab', 'bodyslam', 'tackle', 'lick'],
    ...sp(89),
  },
  {
    id: 50, dexNo: 110, name: '双弹瓦斯',
    type: TYPES.POISON,
    maxHp: 65, maxMp: 60, atk: 90, def: 120, spAtk: 85, spDef: 70, spd: 60,
    moves: ['poison_jab', 'bodyslam', 'tackle', 'lick'],
    ...sp(110),
  },
  // ── 地面/岩石系 ─────────────────────────────────────────────────────────────
  {
    id: 22, dexNo: 95, name: '大岩蛇',
    type: TYPES.ROCK, type2: TYPES.GROUND,
    maxHp: 35, maxMp: 30, atk: 45, def: 160, spAtk: 30, spDef: 45, spd: 70,
    moves: ['tackle', 'bodyslam', 'rock_throw', 'earthquake'],
    evolvesTo: { method: 'trade_item', targetId: 139 },
    ...sp(95),
  },
  {
    id: 35, dexNo: 76, name: '隆隆岩',
    type: TYPES.ROCK, type2: TYPES.GROUND,
    maxHp: 80, maxMp: 45, atk: 120, def: 130, spAtk: 55, spDef: 65, spd: 45,
    moves: ['rock_slide', 'earthquake', 'bodyslam', 'tackle'],
    ...sp(76),
  },
  {
    id: 47, dexNo: 105, name: '嘎啦嘎啦',
    type: TYPES.GROUND,
    maxHp: 60, maxMp: 40, atk: 80, def: 110, spAtk: 50, spDef: 80, spd: 45,
    moves: ['earthquake', 'rock_slide', 'bodyslam', 'tackle'],
    ...sp(105),
  },
  {
    id: 51, dexNo: 112, name: '钻角犀兽',
    type: TYPES.GROUND, type2: TYPES.ROCK,
    maxHp: 105, maxMp: 35, atk: 130, def: 120, spAtk: 45, spDef: 45, spd: 40,
    moves: ['earthquake', 'rock_slide', 'bodyslam', 'tackle'],
    evolvesTo: { method: 'trade_item', item: 'protector', targetId: 104 },
    ...sp(112),
  },
  // ── 飞行系 ──────────────────────────────────────────────────────────────────
  {
    id: 19, dexNo: 85, name: '嘟嘟利',
    type: TYPES.NORMAL, type2: TYPES.FLYING,
    maxHp: 60, maxMp: 45, atk: 110, def: 70, spAtk: 60, spDef: 60, spd: 110,
    moves: ['drill_peck', 'quickattack', 'bite', 'bodyslam'],
    ...sp(85),
  },
  {
    id: 23, dexNo: 123, name: '飞天螳螂',
    type: TYPES.BUG, type2: TYPES.FLYING,
    maxHp: 70, maxMp: 45, atk: 110, def: 80, spAtk: 55, spDef: 80, spd: 105,
    moves: ['quickattack', 'slash', 'wing_attack', 'fury_cutter'],
    alternateEvolutions: [
      { method: 'item', item: 'black_augurite', targetId: 125 },
      { method: 'trade_item', targetId: 140 }
    ],
    ...sp(123),
  },
  {
    id: 24, dexNo: 142, name: '化石翼龙',
    type: TYPES.ROCK, type2: TYPES.FLYING,
    maxHp: 80, maxMp: 45, atk: 105, def: 65, spAtk: 60, spDef: 75, spd: 130,
    moves: ['bite', 'rock_slide', 'wing_attack', 'fly'],
    ...sp(142),
  },
  {
    id: 39, dexNo: 83, name: '大葱鸭',
    type: TYPES.NORMAL, type2: TYPES.FLYING,
    maxHp: 52, maxMp: 45, atk: 90, def: 55, spAtk: 58, spDef: 62, spd: 60,
    moves: ['slash', 'wing_attack', 'quickattack', 'tackle'],
    evolvesTo: { method: 'battle_condition', condition: 'three_critical_hits', targetId: 146 },
    ...sp(83),
  },
  // ── 超能系 ──────────────────────────────────────────────────────────────────
  {
    id: 11, dexNo: 65, name: '胡地',
    type: TYPES.PSYCHIC,
    maxHp: 55, maxMp: 90, atk: 50, def: 45, spAtk: 135, spDef: 95, spd: 120,
    moves: ['psychic', 'recover', 'tackle', 'quickattack'],
    ...sp(65),
  },
  {
    id: 43, dexNo: 97, name: '引梦貘人',
    type: TYPES.PSYCHIC,
    maxHp: 85, maxMp: 55, atk: 73, def: 70, spAtk: 73, spDef: 115, spd: 67,
    moves: ['hypnosis', 'dream_eater', 'psychic', 'bodyslam'],
    ...sp(97),
  },
  {
    id: 56, dexNo: 122, name: '魔墙人偶',
    type: TYPES.PSYCHIC, type2: TYPES.FAIRY,
    maxHp: 40, maxMp: 70, atk: 45, def: 65, spAtk: 100, spDef: 120, spd: 90,
    moves: ['psychic', 'hypnosis', 'recover', 'tackle'],
    evolvesTo: { level: 42, targetId: 147 },
    ...sp(122),
  },
  {
    id: 65, dexNo: 137, name: '3D龙',
    type: TYPES.NORMAL,
    maxHp: 65, maxMp: 60, atk: 60, def: 70, spAtk: 85, spDef: 75, spd: 40,
    moves: ['psychic', 'thunderbolt', 'recover', 'tackle'],
    evolvesTo: { method: 'trade_item', item: 'upgrade', targetId: 108 },
    ...sp(137),
  },
  // ── 幽灵系 ──────────────────────────────────────────────────────────────────
  {
    id: 20, dexNo: 92, name: '鬼斯',
    type: TYPES.GHOST, type2: TYPES.POISON,
    maxHp: 30, maxMp: 70, atk: 35, def: 30, spAtk: 100, spDef: 35, spd: 80,
    moves: ['hypnosis', 'lick', 'shadowball', 'psychic'],
    learnset: { 38: 'dream_eater' },
    evolvesTo: { level: 25, targetId: 21 },
    ...sp(92),
  },
  {
    id: 21, dexNo: 93, name: '鬼斯通',
    type: TYPES.GHOST, type2: TYPES.POISON,
    maxHp: 45, maxMp: 80, atk: 50, def: 45, spAtk: 115, spDef: 55, spd: 95,
    moves: ['hypnosis', 'lick', 'shadowball', 'dream_eater'],
    learnset: { 43: 'psychic' },
    evolvesTo: { method: 'trade', targetId: 6 },
    ...sp(93),
  },
  {
    id: 6, dexNo: 94, name: '耿鬼',
    type: TYPES.GHOST, type2: TYPES.POISON,
    maxHp: 60, maxMp: 90, atk: 65, def: 60, spAtk: 130, spDef: 75, spd: 110,
    moves: ['hypnosis', 'shadowball', 'dream_eater', 'psychic'],
    ...sp(94),
  },
  // ── 龙系 ────────────────────────────────────────────────────────────────────
  {
    id: 12, dexNo: 149, name: '快龙',
    type: TYPES.DRAGON, type2: TYPES.FLYING,
    maxHp: 91, maxMp: 70, atk: 134, def: 95, spAtk: 100, spDef: 100, spd: 80,
    moves: ['dragonclaw', 'extremespeed', 'flamethrower', 'hydropump'],
    ...sp(149),
  },
  // ── 普通系 ──────────────────────────────────────────────────────────────────
  {
    id: 10, dexNo: 143, name: '卡比兽',
    type: TYPES.NORMAL,
    maxHp: 160, maxMp: 50, atk: 110, def: 65, spAtk: 65, spDef: 110, spd: 30,
    moves: ['bodyslam', 'tackle', 'bite', 'recover'],
    ...sp(143),
  },
  {
    id: 13, dexNo: 133, name: '伊布',
    type: TYPES.NORMAL,
    maxHp: 55, maxMp: 35, atk: 55, def: 50, spAtk: 45, spDef: 65, spd: 55,
    moves: ['tackle', 'quickattack', 'bite', 'bodyslam'],
    alternateEvolutions: [
      { method: 'stone', item: 'water_stone', targetId: 62 },
      { method: 'stone', item: 'thunder_stone', targetId: 63 },
      { method: 'stone', item: 'fire_stone', targetId: 64 },
      { method: 'friendship_day', targetId: 132 },
      { method: 'stone', item: 'leaf_stone', targetId: 133 },
      { method: 'stone', item: 'ice_stone', targetId: 134 },
      { method: 'friendship_night', targetId: 137 },
      { method: 'friendship_move_type', type: TYPES.FAIRY, targetId: 144 }
    ],
    ...sp(133),
  },
  {
    id: 15, dexNo: 39, name: '胖丁',
    type: TYPES.NORMAL, type2: TYPES.FAIRY,
    maxHp: 115, maxMp: 35, atk: 45, def: 20, spAtk: 45, spDef: 25, spd: 20,
    moves: ['tackle', 'bodyslam', 'hypnosis', 'recover'],
    evolvesTo: { method: 'stone', item: 'moon_stone', targetId: 115 },
    ...sp(39),
  },
  {
    id: 31, dexNo: 53, name: '猫老大',
    type: TYPES.NORMAL,
    maxHp: 65, maxMp: 50, atk: 70, def: 60, spAtk: 65, spDef: 65, spd: 115,
    moves: ['slash', 'bite', 'quickattack', 'scratch'],
    ...sp(53),
  },
  {
    id: 52, dexNo: 113, name: '吉利蛋',
    type: TYPES.NORMAL,
    maxHp: 250, maxMp: 60, atk: 5, def: 5, spAtk: 35, spDef: 105, spd: 50,
    moves: ['recover', 'bodyslam', 'tackle', 'psychic'],
    evolvesTo: { method: 'friendship', targetId: 117 },
    ...sp(113),
  },
  {
    id: 61, dexNo: 128, name: '肯泰罗',
    type: TYPES.NORMAL,
    maxHp: 75, maxMp: 35, atk: 100, def: 95, spAtk: 40, spDef: 70, spd: 110,
    moves: ['bodyslam', 'earthquake', 'tackle', 'quickattack'],
    ...sp(128),
  },
  // ── 水系（其他） ─────────────────────────────────────────────────────────────
  {
    id: 14, dexNo: 54, name: '可达鸭',
    type: TYPES.WATER,
    maxHp: 50, maxMp: 50, atk: 52, def: 48, spAtk: 65, spDef: 50, spd: 55,
    moves: ['watergun', 'scratch', 'hypnosis', 'psychic'],
    learnset: { 39: 'bodyslam' },
    evolvesTo: { level: 33, targetId: 70 },
    ...sp(54),
  },
  {
    id: 70, dexNo: 55, name: '哥达鸭',
    type: TYPES.WATER,
    maxHp: 80, maxMp: 65, atk: 82, def: 78, spAtk: 95, spDef: 80, spd: 85,
    moves: ['surf', 'watergun', 'psychic', 'hypnosis'],
    ...sp(55),
  },
  {
    id: 60, dexNo: 127, name: '大甲',
    type: TYPES.BUG,
    maxHp: 65, maxMp: 40, atk: 125, def: 100, spAtk: 55, spDef: 70, spd: 85,
    moves: ['slash', 'bodyslam', 'fury_cutter', 'low_kick'],
    ...sp(127),
  },
  // ── 传说宝可梦 ───────────────────────────────────────────────────────────────
  {
    id: 25, dexNo: 146, name: '火焰鸟',
    type: TYPES.FIRE, type2: TYPES.FLYING,
    maxHp: 90, maxMp: 85, atk: 100, def: 90, spAtk: 125, spDef: 85, spd: 90,
    moves: ['flamethrower', 'fire_blast', 'sky_attack', 'recover'],
    ...sp(146),
  },
  {
    id: 68, dexNo: 150, name: '超梦',
    type: TYPES.PSYCHIC,
    maxHp: 106, maxMp: 100, atk: 110, def: 90, spAtk: 154, spDef: 90, spd: 130,
    moves: ['psychic', 'recover', 'shadowball', 'thunderbolt'],
    ...sp(150),
  },
  {
    id: 69, dexNo: 151, name: '梦幻',
    type: TYPES.PSYCHIC,
    maxHp: 100, maxMp: 70, atk: 100, def: 100, spAtk: 100, spDef: 100, spd: 100,
    moves: ['psychic', 'earthquake', 'flamethrower', 'recover'],
    ...sp(151),
  },

  // ══ 御三家进化形态（通过进化获得，不在选择画面出现）════════════════════════
  {
    id: 71, dexNo: 2, name: '妙蛙草',
    type: TYPES.GRASS, type2: TYPES.POISON,
    maxHp: 60, maxMp: 60, atk: 62, def: 63, spAtk: 80, spDef: 80, spd: 60,
    moves: ['tackle', 'vinewhip', 'razorleaf', 'poison_jab'],
    learnset: { 33: 'bodyslam', 41: 'hypnosis' },
    evolvesTo: { level: 32, targetId: 72 },
    ...sp(2),
  },
  {
    id: 72, dexNo: 3, name: '妙蛙花',
    type: TYPES.GRASS, type2: TYPES.POISON,
    maxHp: 80, maxMp: 70, atk: 82, def: 83, spAtk: 100, spDef: 100, spd: 80,
    moves: ['vinewhip', 'razorleaf', 'poison_jab', 'bodyslam'],
    learnset: { 45: 'hypnosis' },
    ...sp(3),
  },
  {
    id: 73, dexNo: 5, name: '火恐龙',
    type: TYPES.FIRE,
    maxHp: 58, maxMp: 58, atk: 64, def: 58, spAtk: 80, spDef: 65, spd: 80,
    moves: ['scratch', 'ember', 'bite', 'slash'],
    learnset: { 32: 'slash', 38: 'flamethrower', 50: 'fire_blast' },
    evolvesTo: { level: 36, targetId: 74 },
    ...sp(5),
  },
  {
    id: 74, dexNo: 6, name: '喷火龙',
    type: TYPES.FIRE, type2: TYPES.FLYING,
    maxHp: 78, maxMp: 75, atk: 84, def: 78, spAtk: 109, spDef: 85, spd: 100,
    moves: ['slash', 'flamethrower', 'bite', 'wing_attack'],
    learnset: { 44: 'fire_blast', 56: 'fly' },
    ...sp(6),
  },
  {
    id: 75, dexNo: 8, name: '卡咪龟',
    type: TYPES.WATER,
    maxHp: 59, maxMp: 50, atk: 63, def: 80, spAtk: 65, spDef: 80, spd: 58,
    moves: ['tackle', 'watergun', 'bite', 'bodyslam'],
    learnset: { 30: 'bodyslam', 44: 'surf', 54: 'hydropump' },
    evolvesTo: { level: 36, targetId: 76 },
    ...sp(8),
  },
  {
    id: 76, dexNo: 9, name: '水箭龟',
    type: TYPES.WATER,
    maxHp: 79, maxMp: 65, atk: 83, def: 100, spAtk: 85, spDef: 105, spd: 78,
    moves: ['watergun', 'surf', 'bite', 'hydropump'],
    learnset: { 46: 'hydropump', 56: 'icebeam' },
    ...sp(9),
  },
  {
    id: 77, dexNo: 116, name: '墨海马',
    type: TYPES.WATER,
    maxHp: 30, maxMp: 55, atk: 40, def: 70, spAtk: 70, spDef: 25, spd: 60,
    moves: ['tackle', 'watergun', 'surf', 'hydropump'],
    evolvesTo: { level: 32, targetId: 54 },
    ...sp(116),
  },
  {
    id: 78, dexNo: 90, name: '大舌贝',
    type: TYPES.WATER,
    maxHp: 30, maxMp: 45, atk: 65, def: 100, spAtk: 45, spDef: 25, spd: 40,
    moves: ['tackle', 'watergun', 'icebeam', 'surf'],
    evolvesTo: { method: 'stone', item: 'water_stone', targetId: 42 },
    ...sp(90),
  },
  {
    id: 79, dexNo: 98, name: '大钳蟹',
    type: TYPES.WATER,
    maxHp: 30, maxMp: 35, atk: 105, def: 90, spAtk: 25, spDef: 25, spd: 50,
    moves: ['tackle', 'watergun', 'slash', 'bodyslam'],
    evolvesTo: { level: 28, targetId: 44 },
    ...sp(98),
  },
  {
    id: 80, dexNo: 120, name: '海星星',
    type: TYPES.WATER,
    maxHp: 30, maxMp: 55, atk: 45, def: 55, spAtk: 70, spDef: 55, spd: 85,
    moves: ['tackle', 'watergun', 'surf', 'recover'],
    evolvesTo: { method: 'stone', item: 'water_stone', targetId: 55 },
    ...sp(120),
  },
  {
    id: 81, dexNo: 138, name: '菊石兽',
    type: TYPES.ROCK, type2: TYPES.WATER,
    maxHp: 35, maxMp: 55, atk: 40, def: 100, spAtk: 90, spDef: 55, spd: 35,
    moves: ['tackle', 'watergun', 'rock_throw', 'surf'],
    evolvesTo: { level: 40, targetId: 66 },
    ...sp(138),
  },
  {
    id: 82, dexNo: 140, name: '化石盔',
    type: TYPES.ROCK, type2: TYPES.WATER,
    maxHp: 30, maxMp: 35, atk: 80, def: 90, spAtk: 55, spDef: 45, spd: 55,
    moves: ['scratch', 'watergun', 'rock_throw', 'slash'],
    evolvesTo: { level: 40, targetId: 67 },
    ...sp(140),
  },
  {
    id: 83, dexNo: 58, name: '卡蒂狗',
    type: TYPES.FIRE,
    maxHp: 55, maxMp: 45, atk: 70, def: 45, spAtk: 70, spDef: 50, spd: 60,
    moves: ['tackle', 'ember', 'bite', 'flamethrower'],
    evolvesTo: { method: 'stone', item: 'fire_stone', targetId: 7 },
    ...sp(58),
  },
  {
    id: 84, dexNo: 37, name: '六尾',
    type: TYPES.FIRE,
    maxHp: 38, maxMp: 50, atk: 41, def: 40, spAtk: 50, spDef: 65, spd: 65,
    moves: ['tackle', 'ember', 'quickattack', 'flamethrower'],
    evolvesTo: { method: 'stone', item: 'fire_stone', targetId: 29 },
    ...sp(37),
  },
  {
    id: 85, dexNo: 77, name: '小火马',
    type: TYPES.FIRE,
    maxHp: 50, maxMp: 45, atk: 85, def: 55, spAtk: 65, spDef: 65, spd: 90,
    moves: ['tackle', 'ember', 'quickattack', 'fire_blast'],
    evolvesTo: { level: 40, targetId: 36 },
    ...sp(77),
  },
  {
    id: 86, dexNo: 230, name: '刺龙王',
    type: TYPES.WATER, type2: TYPES.DRAGON,
    maxHp: 75, maxMp: 75, atk: 95, def: 95, spAtk: 95, spDef: 95, spd: 85,
    moves: ['watergun', 'surf', 'hydropump', 'dragonclaw'],
    ...sp(230),
  },
  {
    id: 87, dexNo: 44, name: '臭臭花',
    type: TYPES.GRASS, type2: TYPES.POISON,
    maxHp: 60, maxMp: 65, atk: 65, def: 70, spAtk: 85, spDef: 75, spd: 40,
    moves: ['tackle', 'vinewhip', 'razorleaf', 'poison_jab'],
    alternateEvolutions: [
      { method: 'stone', item: 'leaf_stone', targetId: 30 },
      { method: 'stone', targetId: 136 }
    ],
    ...sp(44),
  },
  {
    id: 88, dexNo: 102, name: '蛋蛋',
    type: TYPES.GRASS, type2: TYPES.PSYCHIC,
    maxHp: 60, maxMp: 60, atk: 40, def: 80, spAtk: 60, spDef: 45, spd: 40,
    moves: ['tackle', 'razorleaf', 'hypnosis', 'psychic'],
    evolvesTo: { method: 'stone', item: 'leaf_stone', targetId: 46 },
    ...sp(102),
  },
  {
    id: 90, dexNo: 81, name: '小磁怪',
    type: TYPES.ELECTRIC, type2: TYPES.STEEL,
    maxHp: 25, maxMp: 65, atk: 35, def: 70, spAtk: 95, spDef: 55, spd: 45,
    moves: ['tackle', 'thundershock', 'thunderbolt', 'zap_cannon'],
    evolvesTo: { level: 30, targetId: 38 },
    ...sp(81),
  },
  {
    id: 91, dexNo: 100, name: '霹雳电球',
    type: TYPES.ELECTRIC,
    maxHp: 40, maxMp: 45, atk: 30, def: 50, spAtk: 55, spDef: 55, spd: 100,
    moves: ['tackle', 'thundershock', 'quickattack', 'thunderbolt'],
    evolvesTo: { level: 30, targetId: 45 },
    ...sp(100),
  },
  {
    id: 92, dexNo: 239, name: '电击怪',
    type: TYPES.ELECTRIC,
    maxHp: 45, maxMp: 45, atk: 63, def: 37, spAtk: 65, spDef: 55, spd: 95,
    moves: ['tackle', 'thundershock', 'quickattack', 'thunderbolt'],
    evolvesTo: { level: 30, targetId: 58 },
    ...sp(239),
  },
  {
    id: 93, dexNo: 238, name: '迷唇娃',
    type: TYPES.ICE, type2: TYPES.PSYCHIC,
    maxHp: 45, maxMp: 65, atk: 30, def: 15, spAtk: 85, spDef: 65, spd: 65,
    moves: ['tackle', 'icebeam', 'hypnosis', 'psychic'],
    evolvesTo: { level: 30, targetId: 57 },
    ...sp(238),
  },
  {
    id: 94, dexNo: 467, name: '鸭嘴炎兽',
    type: TYPES.FIRE,
    maxHp: 75, maxMp: 85, atk: 95, def: 67, spAtk: 125, spDef: 95, spd: 83,
    moves: ['ember', 'flamethrower', 'fire_blast', 'karate_chop'],
    ...sp(467),
  },
  {
    id: 95, dexNo: 240, name: '鸭嘴宝宝',
    type: TYPES.FIRE,
    maxHp: 45, maxMp: 45, atk: 75, def: 37, spAtk: 70, spDef: 55, spd: 83,
    moves: ['tackle', 'ember', 'karate_chop', 'flamethrower'],
    evolvesTo: { level: 30, targetId: 59 },
    ...sp(240),
  },
  {
    id: 96, dexNo: 66, name: '腕力',
    type: TYPES.FIGHTING,
    maxHp: 70, maxMp: 30, atk: 80, def: 50, spAtk: 35, spDef: 35, spd: 35,
    moves: ['tackle', 'karate_chop', 'low_kick', 'bodyslam'],
    evolvesTo: { level: 28, targetId: 18 },
    ...sp(66),
  },
  {
    id: 97, dexNo: 56, name: '猴怪',
    type: TYPES.FIGHTING,
    maxHp: 40, maxMp: 35, atk: 80, def: 35, spAtk: 35, spDef: 45, spd: 70,
    moves: ['scratch', 'karate_chop', 'low_kick', 'bodyslam'],
    evolvesTo: { level: 28, targetId: 32 },
    ...sp(56),
  },
  {
    id: 98, dexNo: 32, name: '尼多朗',
    type: TYPES.POISON,
    maxHp: 46, maxMp: 35, atk: 57, def: 40, spAtk: 40, spDef: 40, spd: 50,
    moves: ['tackle', 'poison_jab', 'bodyslam', 'earthquake'],
    evolvesTo: { level: 16, targetId: 99 },
    ...sp(32),
  },
  {
    id: 99, dexNo: 33, name: '尼多力诺',
    type: TYPES.POISON,
    maxHp: 61, maxMp: 40, atk: 72, def: 57, spAtk: 55, spDef: 55, spd: 65,
    moves: ['tackle', 'poison_jab', 'bodyslam', 'earthquake'],
    evolvesTo: { method: 'stone', item: 'moon_stone', targetId: 17 },
    ...sp(33),
  },
  {
    id: 100, dexNo: 88, name: '臭泥',
    type: TYPES.POISON,
    maxHp: 80, maxMp: 40, atk: 80, def: 50, spAtk: 40, spDef: 50, spd: 25,
    moves: ['tackle', 'poison_jab', 'bodyslam', 'lick'],
    evolvesTo: { level: 38, targetId: 41 },
    ...sp(88),
  },
  {
    id: 101, dexNo: 109, name: '瓦斯弹',
    type: TYPES.POISON,
    maxHp: 40, maxMp: 45, atk: 65, def: 95, spAtk: 60, spDef: 45, spd: 35,
    moves: ['tackle', 'poison_jab', 'bodyslam', 'lick'],
    evolvesTo: { level: 35, targetId: 50 },
    ...sp(109),
  },
  {
    id: 102, dexNo: 74, name: '小拳石',
    type: TYPES.ROCK, type2: TYPES.GROUND,
    maxHp: 40, maxMp: 30, atk: 80, def: 100, spAtk: 30, spDef: 30, spd: 20,
    moves: ['tackle', 'rock_throw', 'rock_slide', 'earthquake'],
    evolvesTo: { level: 25, targetId: 103 },
    ...sp(74),
  },
  {
    id: 103, dexNo: 75, name: '隆隆石',
    type: TYPES.ROCK, type2: TYPES.GROUND,
    maxHp: 55, maxMp: 35, atk: 95, def: 115, spAtk: 45, spDef: 45, spd: 35,
    moves: ['tackle', 'rock_throw', 'rock_slide', 'earthquake'],
    evolvesTo: { method: 'trade', targetId: 35 },
    ...sp(75),
  },
  {
    id: 104, dexNo: 464, name: '超甲狂犀',
    type: TYPES.GROUND, type2: TYPES.ROCK,
    maxHp: 115, maxMp: 45, atk: 140, def: 130, spAtk: 55, spDef: 55, spd: 40,
    moves: ['tackle', 'rock_slide', 'earthquake', 'bodyslam'],
    ...sp(464),
  },
  {
    id: 105, dexNo: 111, name: '独角犀牛',
    type: TYPES.GROUND, type2: TYPES.ROCK,
    maxHp: 80, maxMp: 30, atk: 85, def: 95, spAtk: 30, spDef: 30, spd: 25,
    moves: ['tackle', 'rock_throw', 'rock_slide', 'earthquake'],
    evolvesTo: { level: 42, targetId: 51 },
    ...sp(111),
  },
  {
    id: 106, dexNo: 84, name: '嘟嘟',
    type: TYPES.NORMAL, type2: TYPES.FLYING,
    maxHp: 35, maxMp: 30, atk: 85, def: 45, spAtk: 35, spDef: 35, spd: 75,
    moves: ['tackle', 'quickattack', 'wing_attack', 'drill_peck'],
    evolvesTo: { level: 31, targetId: 19 },
    ...sp(84),
  },
  {
    id: 107, dexNo: 96, name: '催眠貘',
    type: TYPES.PSYCHIC,
    maxHp: 60, maxMp: 45, atk: 48, def: 45, spAtk: 43, spDef: 90, spd: 42,
    moves: ['tackle', 'hypnosis', 'psychic', 'dream_eater'],
    evolvesTo: { level: 26, targetId: 43 },
    ...sp(96),
  },
  {
    id: 108, dexNo: 233, name: '多边兽II',
    type: TYPES.NORMAL,
    maxHp: 85, maxMp: 75, atk: 80, def: 90, spAtk: 105, spDef: 95, spd: 60,
    moves: ['tackle', 'psychic', 'thunderbolt', 'recover'],
    evolvesTo: { method: 'trade_item', item: 'dubious_disc', targetId: 109 },
    ...sp(233),
  },
  {
    id: 109, dexNo: 474, name: '多边兽Z',
    type: TYPES.NORMAL,
    maxHp: 85, maxMp: 85, atk: 80, def: 70, spAtk: 135, spDef: 75, spd: 90,
    moves: ['tackle', 'psychic', 'thunderbolt', 'recover'],
    ...sp(474),
  },
  {
    id: 110, dexNo: 63, name: '凯西',
    type: TYPES.PSYCHIC,
    maxHp: 25, maxMp: 60, atk: 20, def: 15, spAtk: 105, spDef: 55, spd: 90,
    moves: ['tackle', 'quickattack', 'psychic', 'recover'],
    evolvesTo: { level: 16, targetId: 111 },
    ...sp(63),
  },
  {
    id: 111, dexNo: 64, name: '勇基拉',
    type: TYPES.PSYCHIC,
    maxHp: 40, maxMp: 75, atk: 35, def: 30, spAtk: 120, spDef: 70, spd: 105,
    moves: ['tackle', 'quickattack', 'psychic', 'recover'],
    evolvesTo: { method: 'trade', targetId: 11 },
    ...sp(64),
  },
  {
    id: 112, dexNo: 439, name: '魔尼尼',
    type: TYPES.PSYCHIC, type2: TYPES.FAIRY,
    maxHp: 20, maxMp: 50, atk: 25, def: 45, spAtk: 70, spDef: 90, spd: 60,
    moves: ['tackle', 'hypnosis', 'psychic', 'recover'],
    learnset: { 18: 'mimic' },
    evolvesTo: { method: 'move_known', move: 'mimic', targetId: 56 },
    ...sp(439),
  },
  {
    id: 113, dexNo: 446, name: '小卡比兽',
    type: TYPES.NORMAL,
    maxHp: 135, maxMp: 35, atk: 85, def: 40, spAtk: 40, spDef: 85, spd: 5,
    moves: ['tackle', 'bite', 'bodyslam', 'recover'],
    evolvesTo: { method: 'friendship', targetId: 10 },
    ...sp(446),
  },
  {
    id: 114, dexNo: 174, name: '宝宝丁',
    type: TYPES.NORMAL, type2: TYPES.FAIRY,
    maxHp: 90, maxMp: 25, atk: 30, def: 15, spAtk: 40, spDef: 20, spd: 15,
    moves: ['tackle', 'hypnosis', 'bodyslam', 'recover'],
    evolvesTo: { method: 'friendship', targetId: 15 },
    ...sp(174),
  },
  {
    id: 115, dexNo: 40, name: '胖可丁',
    type: TYPES.NORMAL, type2: TYPES.FAIRY,
    maxHp: 140, maxMp: 45, atk: 70, def: 45, spAtk: 85, spDef: 50, spd: 45,
    moves: ['tackle', 'bodyslam', 'hypnosis', 'recover'],
    ...sp(40),
  },
  {
    id: 116, dexNo: 440, name: '小福蛋',
    type: TYPES.NORMAL,
    maxHp: 100, maxMp: 35, atk: 5, def: 5, spAtk: 15, spDef: 65, spd: 30,
    moves: ['tackle', 'bodyslam', 'recover', 'psychic'],
    evolvesTo: { method: 'level_up_item_day', item: 'oval_stone', targetId: 52 },
    ...sp(440),
  },
  {
    id: 117, dexNo: 242, name: '幸福蛋',
    type: TYPES.NORMAL,
    maxHp: 255, maxMp: 70, atk: 10, def: 10, spAtk: 75, spDef: 135, spd: 55,
    moves: ['tackle', 'bodyslam', 'recover', 'psychic'],
    ...sp(242),
  },
  {
    id: 119, dexNo: 52, name: '喵喵',
    type: TYPES.NORMAL,
    maxHp: 40, maxMp: 35, atk: 45, def: 35, spAtk: 40, spDef: 40, spd: 90,
    moves: ['scratch', 'quickattack', 'bite', 'slash'],
    evolvesTo: { level: 28, targetId: 31 },
    alternateEvolutions: [
      { level: 28, targetId: 145 }
    ],
    ...sp(52),
  },
  {
    id: 120, dexNo: 438, name: '盆才怪',
    type: TYPES.ROCK,
    maxHp: 50, maxMp: 25, atk: 80, def: 95, spAtk: 10, spDef: 45, spd: 10,
    moves: ['tackle', 'rock_throw', 'rock_slide', 'low_kick'],
    evolvesTo: { method: 'move_known', move: 'mimic', targetId: 135 },
    ...sp(438),
  },
  {
    id: 121, dexNo: 236, name: '无畏小子',
    type: TYPES.FIGHTING,
    maxHp: 35, maxMp: 25, atk: 35, def: 35, spAtk: 35, spDef: 35, spd: 35,
    moves: ['tackle', 'karate_chop', 'quickattack', 'low_kick'],
    alternateEvolutions: [
      { level: 20, condition: 'attack_gt_defense', targetId: 48 },
      { level: 20, condition: 'attack_lt_defense', targetId: 49 },
      { level: 20, condition: 'attack_eq_defense', targetId: 141 }
    ],
    ...sp(236),
  },
  {
    id: 122, dexNo: 466, name: '电击魔兽',
    type: TYPES.ELECTRIC,
    maxHp: 75, maxMp: 80, atk: 123, def: 67, spAtk: 95, spDef: 85, spd: 95,
    moves: ['thundershock', 'thunderbolt', 'quickattack', 'karate_chop'],
    ...sp(466),
  },
  {
    id: 124, dexNo: 108, name: '大舌头',
    type: TYPES.NORMAL,
    maxHp: 90, maxMp: 45, atk: 55, def: 75, spAtk: 60, spDef: 75, spd: 30,
    moves: ['tackle', 'bodyslam', 'lick', 'earthquake'],
    learnset: { 24: 'rollout' },
    evolvesTo: { method: 'move_known', move: 'rollout', targetId: 127 },
    ...sp(108),
  },
  {
    id: 125, dexNo: 900, name: '劈斧螳螂',
    type: TYPES.BUG, type2: TYPES.ROCK,
    maxHp: 70, maxMp: 45, atk: 135, def: 95, spAtk: 45, spDef: 70, spd: 85,
    moves: ['fury_cutter', 'slash', 'rock_slide', 'quickattack'],
    ...sp(900),
  },
  {
    id: 126, dexNo: 979, name: '弃世猴',
    type: TYPES.FIGHTING, type2: TYPES.GHOST,
    maxHp: 110, maxMp: 60, atk: 115, def: 80, spAtk: 50, spDef: 90, spd: 90,
    moves: ['karate_chop', 'low_kick', 'shadowball', 'bodyslam'],
    ...sp(979),
  },
  {
    id: 127, dexNo: 463, name: '大舌舔',
    type: TYPES.NORMAL,
    maxHp: 110, maxMp: 55, atk: 85, def: 95, spAtk: 80, spDef: 95, spd: 50,
    moves: ['tackle', 'bodyslam', 'lick', 'earthquake'],
    ...sp(463),
  },
  {
    id: 128, dexNo: 147, name: '迷你龙',
    type: TYPES.DRAGON,
    maxHp: 41, maxMp: 40, atk: 64, def: 45, spAtk: 50, spDef: 50, spd: 50,
    moves: ['tackle', 'quickattack', 'dragonclaw', 'watergun'],
    evolvesTo: { level: 30, targetId: 129 },
    ...sp(147),
  },
  {
    id: 129, dexNo: 148, name: '哈克龙',
    type: TYPES.DRAGON,
    maxHp: 61, maxMp: 55, atk: 84, def: 65, spAtk: 70, spDef: 70, spd: 70,
    moves: ['tackle', 'quickattack', 'dragonclaw', 'surf'],
    evolvesTo: { level: 55, targetId: 12 },
    ...sp(148),
  },
  {
    id: 130, dexNo: 246, name: '幼基拉斯',
    type: TYPES.ROCK, type2: TYPES.GROUND,
    maxHp: 50, maxMp: 30, atk: 64, def: 50, spAtk: 45, spDef: 50, spd: 41,
    moves: ['tackle', 'rock_throw', 'bite', 'earthquake'],
    evolvesTo: { level: 30, targetId: 131 },
    ...sp(246),
  },
  {
    id: 131, dexNo: 247, name: '沙基拉斯',
    type: TYPES.ROCK, type2: TYPES.GROUND,
    maxHp: 70, maxMp: 45, atk: 84, def: 70, spAtk: 65, spDef: 70, spd: 51,
    moves: ['tackle', 'rock_slide', 'bite', 'earthquake'],
    evolvesTo: { level: 55, targetId: 142 },
    ...sp(247),
  },
  {
    id: 132, dexNo: 196, name: '太阳伊布',
    type: TYPES.PSYCHIC,
    maxHp: 65, maxMp: 80, atk: 65, def: 60, spAtk: 130, spDef: 95, spd: 110,
    moves: ['tackle', 'quickattack', 'psychic', 'recover'],
    ...sp(196),
  },
  {
    id: 133, dexNo: 470, name: '叶伊布',
    type: TYPES.GRASS,
    maxHp: 65, maxMp: 55, atk: 110, def: 130, spAtk: 60, spDef: 65, spd: 95,
    moves: ['tackle', 'quickattack', 'vinewhip', 'razorleaf'],
    ...sp(470),
  },
  {
    id: 134, dexNo: 471, name: '冰伊布',
    type: TYPES.ICE,
    maxHp: 65, maxMp: 75, atk: 60, def: 110, spAtk: 130, spDef: 95, spd: 65,
    moves: ['tackle', 'quickattack', 'icebeam', 'blizzard'],
    ...sp(471),
  },
  {
    id: 135, dexNo: 185, name: '树才怪',
    type: TYPES.ROCK,
    maxHp: 70, maxMp: 30, atk: 100, def: 115, spAtk: 30, spDef: 65, spd: 30,
    moves: ['rock_slide', 'earthquake', 'low_kick', 'bodyslam'],
    ...sp(185),
  },
  {
    id: 136, dexNo: 182, name: '美丽花',
    type: TYPES.GRASS,
    maxHp: 75, maxMp: 72, atk: 80, def: 95, spAtk: 90, spDef: 100, spd: 50,
    moves: ['tackle', 'vinewhip', 'razorleaf', 'recover'],
    ...sp(182),
  },
  {
    id: 137, dexNo: 197, name: '月亮伊布',
    type: TYPES.DARK,
    maxHp: 95, maxMp: 68, atk: 65, def: 110, spAtk: 60, spDef: 130, spd: 65,
    moves: ['tackle', 'quickattack', 'bite', 'bodyslam'],
    ...sp(197),
  },
  {
    id: 138, dexNo: 199, name: '呆呆王',
    type: TYPES.WATER, type2: TYPES.PSYCHIC,
    maxHp: 95, maxMp: 100, atk: 75, def: 80, spAtk: 100, spDef: 110, spd: 30,
    moves: ['watergun', 'surf', 'psychic', 'recover'],
    ...sp(199),
  },
  {
    id: 139, dexNo: 208, name: '大钢蛇',
    type: TYPES.STEEL, type2: TYPES.GROUND,
    maxHp: 75, maxMp: 64, atk: 85, def: 200, spAtk: 55, spDef: 65, spd: 30,
    moves: ['tackle', 'iron_tail', 'rock_slide', 'earthquake'],
    ...sp(208),
  },
  {
    id: 140, dexNo: 212, name: '巨钳螳螂',
    type: TYPES.BUG, type2: TYPES.STEEL,
    maxHp: 70, maxMp: 64, atk: 130, def: 100, spAtk: 55, spDef: 80, spd: 65,
    moves: ['fury_cutter', 'quickattack', 'slash', 'iron_tail'],
    ...sp(212),
  },
  {
    id: 141, dexNo: 237, name: '战舞郎',
    type: TYPES.FIGHTING,
    maxHp: 50, maxMp: 48, atk: 95, def: 95, spAtk: 35, spDef: 110, spd: 70,
    moves: ['tackle', 'quickattack', 'karate_chop', 'low_kick'],
    ...sp(237),
  },
  {
    id: 142, dexNo: 248, name: '班基拉斯',
    type: TYPES.ROCK, type2: TYPES.DARK,
    maxHp: 100, maxMp: 96, atk: 134, def: 110, spAtk: 95, spDef: 100, spd: 61,
    moves: ['rock_slide', 'bite', 'earthquake', 'bodyslam'],
    ...sp(248),
  },
  {
    id: 143, dexNo: 462, name: '自爆磁怪',
    type: TYPES.ELECTRIC, type2: TYPES.STEEL,
    maxHp: 70, maxMp: 124, atk: 70, def: 115, spAtk: 130, spDef: 90, spd: 60,
    moves: ['thundershock', 'thunderbolt', 'zap_cannon', 'iron_tail'],
    ...sp(462),
  },
  {
    id: 144, dexNo: 700, name: '仙子伊布',
    type: TYPES.FAIRY,
    maxHp: 95, maxMp: 108, atk: 65, def: 65, spAtk: 110, spDef: 130, spd: 60,
    moves: ['tackle', 'quickattack', 'moonblast', 'recover'],
    ...sp(700),
  },
  {
    id: 145, dexNo: 863, name: '喵头目',
    type: TYPES.STEEL,
    maxHp: 70, maxMp: 60, atk: 110, def: 100, spAtk: 50, spDef: 60, spd: 50,
    moves: ['scratch', 'slash', 'bite', 'iron_tail'],
    ...sp(863),
  },
  {
    id: 146, dexNo: 865, name: '葱游兵',
    type: TYPES.FIGHTING,
    maxHp: 62, maxMp: 74, atk: 135, def: 95, spAtk: 68, spDef: 82, spd: 65,
    moves: ['slash', 'karate_chop', 'low_kick', 'quickattack'],
    ...sp(865),
  },
  {
    id: 147, dexNo: 866, name: '踏冰人偶',
    type: TYPES.ICE, type2: TYPES.PSYCHIC,
    maxHp: 80, maxMp: 108, atk: 85, def: 75, spAtk: 110, spDef: 100, spd: 70,
    moves: ['icebeam', 'blizzard', 'psychic', 'hypnosis'],
    ...sp(866),
  },
]

const normalizeMonsterLevelOnlyEvolutions = (monster) => {
  if (!monster || typeof monster !== 'object') return monster

  if (monster.evolvesTo && typeof monster.evolvesTo === 'object') {
    monster.evolvesTo = withExplicitLevelEvolution(monster.id, monster.evolvesTo)
  }

  if (Array.isArray(monster.alternateEvolutions)) {
    monster.alternateEvolutions = monster.alternateEvolutions.map((evolution) => (
      withExplicitLevelEvolution(monster.id, evolution)
    ))
  }

  return monster
}

MONSTERS.forEach(normalizeMonsterLevelOnlyEvolutions)

export const getPokemonOfficialDexNo = (pokemon) => {
  const dexNo = Number(pokemon?.dexNo ?? pokemon?.pokedexId);
  if (Number.isFinite(dexNo) && dexNo > 0) return dexNo;
  const id = Number(pokemon?.id);
  return Number.isFinite(id) && id > 0 ? id : Number.MAX_SAFE_INTEGER;
};

export const comparePokemonOfficialDex = (a, b) => {
  const dexDiff = getPokemonOfficialDexNo(a) - getPokemonOfficialDexNo(b);
  if (dexDiff !== 0) return dexDiff;
  return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-CN') ||
    ((Number(a?.id) || 0) - (Number(b?.id) || 0));
};

export const OFFICIAL_DEX_MONSTERS = [...MONSTERS].sort(comparePokemonOfficialDex);
