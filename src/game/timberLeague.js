import { calculateBattleRewards } from '../utils/gameBalance.js';

export const TIMBER_LEAGUE_VERSION = 5;
export const TIMBER_LEAGUE_EVENT_ID = 'npc_ridge_coin_sprint';
export const TIMBER_LEAGUE_DEFAULT_ROUTE = 'training';
export const TIMBER_LEAGUE_TIER_LABELS = { bronze: '铜奖', silver: '银奖', gold: '金奖' };
export const TIMBER_LEAGUE_BASE_LEVEL = 45;
export const TIMBER_LEAGUE_ENEMY_SWITCH_LIMIT = 2;

// Training league medals keep the level-based base payout while rewarding
// faster clears with visibly different gold amounts.
export const TIMBER_LEAGUE_GOLD_MULTIPLIERS = Object.freeze({
  bronze: 1,
  silver: 1.25,
  gold: 1.5
});

const LEGACY_MEDAL_THRESHOLDS = {
  training: { gold: 14, silver: 18 },
  steady: { gold: 6, silver: 8 },
  sprint: { gold: 9, silver: 12 },
  gauntlet: { gold: 11, silver: 15 }
};

const clampInt = (value, min, max, fallback = min) => {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const uniqueIds = (value) => Array.from(new Set(
  (Array.isArray(value) ? value : [])
    .filter((id) => typeof id === 'string' && id.trim().length > 0)
    .map((id) => id.trim())
));

const pad = (value) => String(value).padStart(2, '0');

export const getTimberLeagueWeekKey = (date = new Date()) => {
  const utc = new Date(date instanceof Date ? date.getTime() : Date.now());
  const beijing = new Date(utc.getTime() + 8 * 60 * 60 * 1000);
  const day = beijing.getUTCDay() || 7;
  beijing.setUTCDate(beijing.getUTCDate() - day + 1);
  return `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(beijing.getUTCDate())}`;
};

const routeTeam = (levels, species) => levels.map((level, index) => ({
  pokemonId: species[index % species.length],
  level
}));

const teamVariants = (levels, lineups) => lineups.map((species) => routeTeam(levels, species));

const hashRunId = (runId) => {
  let hash = 2166136261;
  for (const char of String(runId || '')) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
};

const TRAINING_BENCH_ORDERS = [
  [3, 4, 5], [4, 5, 3], [5, 3, 4],
  [3, 5, 4], [5, 4, 3], [4, 3, 5]
];

const shuffleTrainingLineupOrder = (variantCount, seedKey, cycle) => {
  const order = Array.from({ length: variantCount }, (_, index) => index);
  let seed = cycle === 0 ? hashRunId(seedKey) : hashRunId(`${seedKey}:${cycle}`);
  const firstShuffledIndex = cycle === 0 ? 1 : 0;
  for (let index = order.length - 1; index > firstShuffledIndex; index--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const swapIndex = firstShuffledIndex + seed % (index - firstShuffledIndex + 1);
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }
  return order;
};

const getTrainingLineupOrder = (variantCount, seedKey, cycle) => {
  const order = shuffleTrainingLineupOrder(variantCount, seedKey, cycle);
  if (cycle > 0 && order.length > 2) {
    const previous = shuffleTrainingLineupOrder(variantCount, seedKey, cycle - 1);
    if (order[0] === previous.at(-1)) [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
};

const partyLevels = (playerTeam) => (Array.isArray(playerTeam) ? playerTeam : [])
  .map((mon) => Number(typeof mon === 'number' ? mon : mon?.level))
  .filter((level) => Number.isFinite(level) && level >= 1)
  .map((level) => clampInt(level, 1, 100, 1))
  .sort((a, b) => b - a);

export const getTimberLeaguePlayerLevels = (playerTeam) => partyLevels(playerTeam);

// Retain definitions for battles already running in older saves.
const LEGACY_ROUTES = {
  steady: {
    key: 'steady',
    label: '稳健训练',
    icon: 'fa-shield-heart',
    description: '赢得一场就能拿凭证，适合先练手。',
    battleHint: '先保证队伍有体力，打赢就有铜奖。',
    energyCost: 1,
    stages: 1,
    levelGap: 4,
    scoreMetric: 'turns',
    thresholds: { silver: 16, gold: 11 },
    rewards: { bronze: 1, silver: 2, gold: 3 },
    teamVariants: [teamVariants([43, 43, 44, 44, 45, 45], [
      [34, 58, 23, 139, 35, 51],
      [32, 33, 139, 58, 47, 125],
      [33, 49, 23, 47, 141, 35]
    ])]
  },
  sprint: {
    key: 'sprint',
    label: '回合竞速',
    icon: 'fa-stopwatch',
    description: '连赢两场；出手越少，奖励越多。',
    battleHint: '两场回合加在一起算。建议带满6只宝可梦和好伤药。',
    energyCost: 1,
    stages: 2,
    levelGap: 8,
    scoreMetric: 'turns',
    thresholds: { silver: 20, gold: 15 },
    rewards: { bronze: 1, silver: 3, gold: 5 },
    teamVariants: [
      teamVariants([44, 45, 46, 47], [
        [34, 58, 139, 51], [48, 35, 58, 146], [32, 139, 49, 125]
      ]),
      teamVariants([45, 46, 47, 48], [
        [48, 35, 51, 141], [33, 49, 139, 34], [47, 58, 146, 125]
      ])
    ]
  },
  gauntlet: {
    key: 'gauntlet',
    label: '极速连战',
    icon: 'fa-fire-flame-curved',
    description: '连赢3场才能领奖，每场都要花能量。',
    battleHint: '连赢3场，体力和技能值不自动回满。建议带满6只并备好药。',
    energyCost: 1,
    stages: 3,
    levelGap: 12,
    scoreMetric: 'turns',
    thresholds: { silver: 21, gold: 16 },
    rewards: { bronze: 2, silver: 4, gold: 7 },
    teamVariants: [
      teamVariants([45, 45, 46], [
        [34, 47, 23], [32, 139, 58], [33, 35, 146]
      ]),
      teamVariants([46, 47, 47], [
        [141, 35, 51], [49, 58, 125], [34, 47, 139]
      ]),
      teamVariants([48, 48, 49], [
        [34, 58, 125], [48, 51, 139], [32, 58, 125]
      ])
    ]
  }
};

export const TIMBER_LEAGUE_ROUTES = {
  training: {
    key: 'training',
    label: '计时训练',
    energyCost: 2,
    stages: 1,
    levelGap: 6,
    scoreMetric: 'turns',
    thresholds: { silver: 17, gold: 14 },
    rewards: { bronze: 1, silver: 2, gold: 3 },
    goldMultipliers: TIMBER_LEAGUE_GOLD_MULTIPLIERS,
    teamVariants: [teamVariants([43, 44, 45, 45, 46, 47], [
      [74, 58, 62, 139, 34, 55],
      [76, 47, 8, 201, 28, 74],
      [34, 137, 143, 17, 6, 10],
      [7, 63, 30, 199, 205, 55],
      [198, 29, 28, 137, 140, 104],
      [47, 143, 8, 189, 23, 94],
      [132, 48, 143, 199, 190, 202],
      [202, 144, 164, 36, 55, 196],
      [137, 191, 208, 74, 192, 205],
      [145, 132, 144, 194, 94, 142],
      [134, 86, 204, 7, 63, 196],
      [190, 199, 203, 55, 125, 137],
      [166, 94, 190, 161, 55, 204],
      [45, 190, 24, 203, 182, 205],
      [12, 146, 63, 30, 139, 192]
    ])]
  }
};

const ALL_ROUTES = { ...LEGACY_ROUTES, ...TIMBER_LEAGUE_ROUTES };

export const getTimberLeagueRoute = (routeKey) => (
  ALL_ROUTES[routeKey] || TIMBER_LEAGUE_ROUTES[TIMBER_LEAGUE_DEFAULT_ROUTE]
);

export const getTimberLeagueLevelOffset = (playerTeam, routeKey = TIMBER_LEAGUE_DEFAULT_ROUTE) => {
  const levels = partyLevels(playerTeam);
  if (levels.length === 0) return 0;
  if (getTimberLeagueRoute(routeKey).key === 'training') return 0;
  const teamLevel = Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length);
  return clampInt(teamLevel - TIMBER_LEAGUE_BASE_LEVEL - getTimberLeagueRoute(routeKey).levelGap, 0, 55, 0);
};

export const getTimberLeagueLegacyThresholds = (routeKey) => (
  LEGACY_MEDAL_THRESHOLDS[getTimberLeagueRoute(routeKey).key] || getTimberLeagueRoute(routeKey).thresholds
);

export const getTimberLeagueRouteTeam = (routeKey, stage = 1, runId = '', levelOffset = 0) => {
  const route = getTimberLeagueRoute(routeKey);
  const safeStage = clampInt(stage, 1, route.stages, 1);
  const variants = route.teamVariants?.[safeStage - 1];
  const variantIndex = runId && variants?.length ? hashRunId(runId) % variants.length : 0;
  const offset = clampInt(levelOffset, 0, 55, 0);
  return (variants?.[variantIndex] || route.teams?.[safeStage - 1] || route.team || [])
    .map((entry) => ({ ...entry, level: Math.min(100, entry.level + offset) }));
};

export const getTimberLeagueNextTeam = (routeKey, stage, leagueState, playerTeam) => {
  const route = getTimberLeagueRoute(routeKey);
  const safeStage = clampInt(stage, 1, route.stages, 1);
  const variants = route.teamVariants[safeStage - 1];
  const state = normalizeTimberLeagueState(leagueState);
  const clearedIds = state.clearedStageIds
    .filter((id) => id.startsWith(`${route.key}:${safeStage}:`))
    .sort();
  const clearedCount = clearedIds.length;
  const levels = partyLevels(playerTeam);
  let variantIndex = clearedCount % variants.length;
  let team = variants[variantIndex];
  if (route.key === 'training' && variants.length > 1) {
    // A win advances the deterministic rotation; a loss or party edit does not.
    const cycle = Math.floor(clearedCount / variants.length);
    const order = getTrainingLineupOrder(variants.length, state.lineupSeed || clearedIds[0] || '', cycle);
    variantIndex = order[clearedCount % variants.length];
    const benchOrder = TRAINING_BENCH_ORDERS[cycle % TRAINING_BENCH_ORDERS.length];
    team = [
      ...variants[variantIndex].slice(0, 3),
      ...benchOrder.map((index) => variants[variantIndex][index])
    ];
  }
  if (route.key === 'training' && levels.length === 0) return [];
  return team.map((entry, index) => {
    if (levels.length === 0) return { ...entry };
    if (route.key === 'training') {
      // Repeat ranks evenly for small parties; a full party matches one-to-one.
      const count = Math.min(levels.length, team.length);
      return { ...entry, level: levels[Math.floor(index * count / team.length)] };
    }
    // Divide the whole sorted party across opponents; with six versus six this is one-to-one.
    const start = Math.floor(index * levels.length / team.length);
    const end = Math.max(start + 1, Math.floor((index + 1) * levels.length / team.length));
    const group = levels.slice(start, end);
    const reference = group.length ? group : [levels[Math.min(index, levels.length - 1)]];
    const target = index === 0 && route.stages > 1
      ? levels[0]
      : Math.round(reference.reduce((sum, level) => sum + level, 0) / reference.length);
    const scaledLevel = entry.level + target - TIMBER_LEAGUE_BASE_LEVEL - route.levelGap;
    const highLevelFloor = index === 0 && route.stages > 1 && levels[0] - levels.at(-1) >= 12
      ? levels[0] - 8
      : 5;
    return { ...entry, level: clampInt(Math.max(scaledLevel, highLevelFloor), 5, 100, 5) };
  });
};

export const calculateTimberLeagueStageGold = (enemyTeam, tier = null, routeKey = TIMBER_LEAGUE_DEFAULT_ROUTE) => {
  if (!Array.isArray(enemyTeam) || enemyTeam.length === 0) return 0;
  const baseGold = 2 * enemyTeam.reduce((total, mon) => total + calculateBattleRewards({
    defeatedMon: mon,
    battleKind: 'trainer',
    trainerRole: 'minigame'
  }).gold, 0);
  const route = getTimberLeagueRoute(routeKey);
  const multiplier = route.key === 'training' && tier
    ? Number(route.goldMultipliers?.[tier] || 1)
    : 1;
  return Math.max(0, Math.round(baseGold * multiplier));
};

export const isTimberLeagueBattle = (environment) => (
  Boolean(environment?.timberLeague && typeof environment.timberLeague === 'object')
);

export const getTimberLeagueEnemySwitchCount = (run, battleLogs = []) => {
  if (run?.enemySwitches != null && Number.isFinite(Number(run.enemySwitches))) {
    return clampInt(run.enemySwitches, 0, 999, 0);
  }
  // Older in-progress saves have no counter. Recall logs distinguish voluntary
  // switches from replacements after a knockout; new stages use their counter.
  return (Array.isArray(battleLogs) ? battleLogs : []).filter((message) => (
    typeof message === 'string' && message.startsWith('对手收回了 ')
  )).length;
};

export const canTimberLeagueEnemySwitch = (environment, battleLogs = []) => (
  !isTimberLeagueBattle(environment) ||
  getTimberLeagueEnemySwitchCount(environment.timberLeague, battleLogs) < TIMBER_LEAGUE_ENEMY_SWITCH_LIMIT
);

export const restoreTimberLeagueEnemySwitches = (environment, battleLogs = []) => {
  if (!isTimberLeagueBattle(environment) || environment.timberLeague.enemySwitches != null) return environment;
  return { ...environment, timberLeague: {
    ...environment.timberLeague,
    enemySwitches: getTimberLeagueEnemySwitchCount(environment.timberLeague, battleLogs)
  } };
};

// Called inside the serialized switch transaction using the persisted logs,
// before adding the new recall message. Failed/replayed commits spend nothing.
export const recordTimberLeagueEnemySwitch = (environment, battleLogs = []) => {
  if (!isTimberLeagueBattle(environment)) return environment;
  if (!canTimberLeagueEnemySwitch(environment, battleLogs)) {
    throw new Error('联赛对手本场已主动换人两次。');
  }
  return { ...environment, timberLeague: {
    ...environment.timberLeague,
    enemySwitches: getTimberLeagueEnemySwitchCount(environment.timberLeague, battleLogs) + 1
  } };
};

export const normalizeTimberLeagueBattle = (value, fallback = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  const routeKey = ALL_ROUTES[source.routeKey] ? source.routeKey : getTimberLeagueRoute(fallback.routeKey).key;
  const route = getTimberLeagueRoute(routeKey);
  return {
    routeKey,
    runId: typeof source.runId === 'string' && source.runId.length > 0 ? source.runId : (fallback.runId || null),
    weekKey: typeof source.weekKey === 'string' && source.weekKey.length > 0 ? source.weekKey : (fallback.weekKey || getTimberLeagueWeekKey()),
    stage: clampInt(source.stage ?? fallback.stage, 1, route.stages, 1),
    stages: route.stages,
    levelOffset: clampInt(source.levelOffset ?? fallback.levelOffset, 0, 55, 0),
    playerLevels: Array.isArray(source.playerLevels) ? partyLevels(source.playerLevels) : null,
    medalThresholds: source.medalThresholds && typeof source.medalThresholds === 'object'
      ? {
        gold: clampInt(source.medalThresholds.gold, 1, 999, route.thresholds.gold),
        silver: clampInt(source.medalThresholds.silver, 1, 999, route.thresholds.silver)
      }
      : null,
    turns: clampInt(source.turns, 0, 999, 0),
    potions: clampInt(source.potions, 0, 99, 0),
    switches: clampInt(source.switches, 0, 99, 0),
    enemySwitches: source.enemySwitches == null ? null : clampInt(source.enemySwitches, 0, 999, 0),
    startedAt: typeof source.startedAt === 'string' ? source.startedAt : null,
    completed: source.completed === true,
    tier: ['bronze', 'silver', 'gold'].includes(source.tier) ? source.tier : null,
    score: clampInt(source.score, 0, 999, 0)
  };
};

export const advanceTimberLeagueBattle = (value, metric = 'turns', amount = 1) => {
  const current = normalizeTimberLeagueBattle(value);
  if (metric === 'potions') current.potions = clampInt(current.potions + amount, 0, 99, current.potions);
  if (metric === 'switches') current.switches = clampInt(current.switches + amount, 0, 99, current.switches);
  if (metric === 'turns') current.turns = clampInt(current.turns + amount, 0, 999, current.turns);
  return current;
};

export const evaluateTimberLeagueTier = ({ routeKey, turns = 0, medalThresholds = null } = {}) => {
  const route = getTimberLeagueRoute(routeKey);
  // Score is the actual number of player turns across the run. Stage count is
  // completion metadata, not an artificial penalty added to the player's time.
  const score = clampInt(turns, 0, 999, 0);
  const thresholds = medalThresholds || route.thresholds;
  if (score <= thresholds.gold) return { tier: 'gold', score, voucherCount: route.rewards.gold };
  if (score <= thresholds.silver) return { tier: 'silver', score, voucherCount: route.rewards.silver };
  return { tier: 'bronze', score, voucherCount: route.rewards.bronze };
};

const legacyVoucherIds = (source) => {
  const legacyBalance = clampInt(source?.voucherBalance, 0, 999, 0);
  return Array.from({ length: legacyBalance }, (_, index) => `legacy-voucher-${index + 1}`);
};

export const normalizeTimberLeagueState = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const earnedVoucherIds = uniqueIds([
    ...legacyVoucherIds(source),
    ...(Array.isArray(source.earnedVoucherIds) ? source.earnedVoucherIds : []),
    // V2 could defer earned rewards; retain them when migrating the reward rules.
    ...(Array.isArray(source.voucherEntitlementIds) ? source.voucherEntitlementIds : [])
  ]);
  const spentVoucherIds = uniqueIds(Array.isArray(source.spentVoucherIds) ? source.spentVoucherIds : []);
  const completedRewardIds = uniqueIds(Array.isArray(source.completedRewardIds)
    ? source.completedRewardIds
    : source.claimedRewardIds);
  const bestScores = source.bestScores && typeof source.bestScores === 'object' && !Array.isArray(source.bestScores)
    ? source.bestScores
    : {};
  return {
    version: TIMBER_LEAGUE_VERSION,
    lineupSeed: typeof source.lineupSeed === 'string' && source.lineupSeed.trim()
      ? source.lineupSeed.trim() : null,
    earnedVoucherIds,
    spentVoucherIds,
    completedRewardIds,
    clearedStageIds: uniqueIds(source.clearedStageIds),
    bestScores,
    lastRun: source.lastRun && typeof source.lastRun === 'object'
      ? normalizeTimberLeagueBattle(source.lastRun)
      : null
  };
};

export const getTimberVoucherBalance = (state) => {
  const normalized = normalizeTimberLeagueState(state);
  return Math.max(0, normalized.earnedVoucherIds.length - normalized.spentVoucherIds.length);
};

export const mergeTimberLeagueState = (target, source) => {
  const left = normalizeTimberLeagueState(target);
  const right = normalizeTimberLeagueState(source);
  const bestScores = { ...right.bestScores };
  Object.entries(left.bestScores).forEach(([weekKey, routes]) => {
    bestScores[weekKey] = { ...(bestScores[weekKey] || {}) };
    Object.entries(routes || {}).forEach(([routeKey, result]) => {
      const current = bestScores[weekKey][routeKey];
      if (!current || Number(result?.score) < Number(current?.score)) bestScores[weekKey][routeKey] = result;
    });
  });
  return {
    version: TIMBER_LEAGUE_VERSION,
    lineupSeed: [left.lineupSeed, right.lineupSeed].filter(Boolean).sort()[0] || null,
    earnedVoucherIds: uniqueIds([...left.earnedVoucherIds, ...right.earnedVoucherIds]),
    spentVoucherIds: uniqueIds([...left.spentVoucherIds, ...right.spentVoucherIds]),
    completedRewardIds: uniqueIds([...left.completedRewardIds, ...right.completedRewardIds]),
    clearedStageIds: uniqueIds([...left.clearedStageIds, ...right.clearedStageIds]),
    bestScores,
    lastRun: left.lastRun || right.lastRun || null
  };
};

export const claimTimberLeagueReward = (world, battle, now = new Date()) => {
  const route = getTimberLeagueRoute(battle?.routeKey);
  const normalizedBattle = normalizeTimberLeagueBattle(battle, { weekKey: getTimberLeagueWeekKey(now) });
  const result = evaluateTimberLeagueTier({
    routeKey: normalizedBattle.routeKey,
    turns: normalizedBattle.turns,
    medalThresholds: normalizedBattle.medalThresholds || getTimberLeagueLegacyThresholds(normalizedBattle.routeKey)
  });
  const state = normalizeTimberLeagueState(world?.timberLeague);
  const routeComplete = Boolean(normalizedBattle.runId) && normalizedBattle.completed === true && normalizedBattle.stage >= route.stages;
  if (route.key === 'training') {
    const rewardId = normalizedBattle.runId ? `training:${normalizedBattle.runId}` : null;
    const alreadyClaimed = state.completedRewardIds.includes(rewardId);
    const voucherIds = routeComplete && !alreadyClaimed
      ? Array.from({ length: result.voucherCount }, (_, index) => `${rewardId}:${index + 1}`)
      : [];
    const currentBest = state.bestScores?.[normalizedBattle.weekKey]?.training;
    return {
      state: {
        ...state,
        lineupSeed: state.lineupSeed || (routeComplete
          ? state.clearedStageIds.filter((id) => id.startsWith('training:1:')).sort()[0] || normalizedBattle.runId
          : null),
        completedRewardIds: voucherIds.length ? uniqueIds([...state.completedRewardIds, rewardId]) : state.completedRewardIds,
        earnedVoucherIds: uniqueIds([...state.earnedVoucherIds, ...voucherIds]),
        bestScores: routeComplete && (!currentBest || result.score < currentBest.score) ? {
          ...state.bestScores,
          [normalizedBattle.weekKey]: {
            ...(state.bestScores[normalizedBattle.weekKey] || {}),
            training: { score: result.score, tier: result.tier, updatedAt: new Date(now instanceof Date ? now.getTime() : Date.now()).toISOString() }
          }
        } : state.bestScores,
        lastRun: { ...normalizedBattle, tier: routeComplete ? result.tier : null, score: result.score }
      },
      rewardId,
      tier: result.tier,
      score: result.score,
      voucherCount: voucherIds.length,
      alreadyClaimed: routeComplete && alreadyClaimed,
      incomplete: !routeComplete
    };
  }
  const tierRank = { bronze: 1, silver: 2, gold: 3 };
  const achievedRank = result.tier ? tierRank[result.tier] : 0;
  const eligibleTiers = ['bronze', 'silver', 'gold'].filter((tier) => tierRank[tier] <= achievedRank);
  const rewardIds = eligibleTiers.map((tier) => `${normalizedBattle.weekKey}:${normalizedBattle.routeKey}:${tier}`);
  const rewardId = rewardIds[rewardIds.length - 1] || null;
  const claimedRank = ['bronze', 'silver', 'gold'].reduce((rank, tier) => (
    state.completedRewardIds.includes(`${normalizedBattle.weekKey}:${normalizedBattle.routeKey}:${tier}`)
      ? Math.max(rank, tierRank[tier]) : rank
  ), 0);
  const alreadyClaimed = routeComplete && achievedRank > 0 && achievedRank <= claimedRank;
  if (!routeComplete || !result.tier) {
    return {
      state: { ...state, lastRun: { ...normalizedBattle, completed: normalizedBattle.completed, tier: result.tier, score: result.score } },
      rewardId,
      tier: result.tier,
      score: result.score,
      voucherCount: 0,
      alreadyClaimed: false,
      incomplete: !routeComplete
    };
  }
  const newlyClaimedTiers = eligibleTiers.filter((tier) => tierRank[tier] > claimedRank);
  const tierVoucherIncrement = (tier) => {
    const previousTier = tier === 'gold' ? 'silver' : tier === 'silver' ? 'bronze' : null;
    return route.rewards[tier] - (previousTier ? route.rewards[previousTier] : 0);
  };
  const voucherIds = newlyClaimedTiers.flatMap((tier) => Array.from(
    { length: tierVoucherIncrement(tier) },
    (_, index) => `${normalizedBattle.weekKey}:${normalizedBattle.routeKey}:${tier}:${index + 1}`
  ));
  const nextState = {
    ...state,
    completedRewardIds: newlyClaimedTiers.length > 0
      ? uniqueIds([...state.completedRewardIds, ...newlyClaimedTiers.map((tier) => `${normalizedBattle.weekKey}:${normalizedBattle.routeKey}:${tier}`)])
      : state.completedRewardIds,
    earnedVoucherIds: uniqueIds([...state.earnedVoucherIds, ...voucherIds]),
    bestScores: (() => {
      const current = state.bestScores?.[normalizedBattle.weekKey]?.[normalizedBattle.routeKey];
      if (current && Number(current.score) <= result.score) return state.bestScores;
      return {
        ...state.bestScores,
        [normalizedBattle.weekKey]: {
          ...(state.bestScores[normalizedBattle.weekKey] || {}),
          [normalizedBattle.routeKey]: {
            score: result.score,
            tier: result.tier,
            updatedAt: new Date(now instanceof Date ? now.getTime() : Date.now()).toISOString()
          }
        }
      };
    })(),
    lastRun: { ...normalizedBattle, completed: true, tier: result.tier, score: result.score }
  };
  return {
    state: nextState,
    rewardId,
    tier: result.tier,
    score: result.score,
    voucherCount: voucherIds.length,
    alreadyClaimed
  };
};

export const spendTimberVouchers = (state, amount, transactionId) => {
  const normalized = normalizeTimberLeagueState(state);
  const spendAmount = Number(amount);
  if (!Number.isSafeInteger(spendAmount) || spendAmount <= 0 || spendAmount > 10000) return { success: false, state: normalized, message: '凭证数量无效。' };
  const tx = typeof transactionId === 'string' && transactionId.trim().length > 0 ? transactionId.trim() : null;
  if (!tx) return { success: false, state: normalized, message: '凭证交易缺少稳定编号，请重试。' };
  const spendIds = Array.from({ length: spendAmount }, (_, index) => `${tx}:${index + 1}`);
  const alreadySpent = spendIds.every((id) => normalized.spentVoucherIds.includes(id));
  if (alreadySpent) return { success: true, alreadySpent: true, state: normalized };
  if (spendIds.some((id) => normalized.spentVoucherIds.includes(id))) {
    return { success: false, state: normalized, message: '凭证交易数量不一致，请重新读取。' };
  }
  if (getTimberVoucherBalance(normalized) < spendAmount) {
    return { success: false, state: normalized, message: '训练凭证不足，请先完成铁木训练联赛。' };
  }
  return {
    success: true,
    alreadySpent: false,
    state: {
      ...normalized,
      spentVoucherIds: uniqueIds([...normalized.spentVoucherIds, ...spendIds])
    }
  };
};

// Run inside the existing serialized cloud mutation, before snapshot normalization.
// A move attempt, potion or voluntary switch costs one action; forced replacements
// and enemy actions do not. Restoring a pending switch follows the same transition.
export const trackTimberLeagueTransition = (before, after) => {
  const previous = before?.battleEnvironment?.timberLeague;
  const incoming = after?.battleEnvironment?.timberLeague;
  if (!previous?.runId || incoming?.runId !== previous.runId) return after;
  const run = normalizeTimberLeagueBattle(incoming);
  for (const metric of ['turns', 'potions', 'switches']) {
    run[metric] = Math.max(run[metric], previous[metric] || 0);
  }
  if (previous.stage === run.stage) {
    run.enemySwitches = Math.max(
      getTimberLeagueEnemySwitchCount(previous, before.logs),
      getTimberLeagueEnemySwitchCount(run, after.logs)
    );
  }
  if (before.battlePhase === 'active' && after.battlePhase === 'active' && previous.stage === run.stage) {
    const switched = before.pendingBattleSwitch && !before.pendingBattleSwitch.forced &&
      before.activePlayerId !== after.activePlayerId && !after.pendingBattleSwitch;
    const potionCount = (snapshot) => (snapshot.playerInventory || [])
      .filter((item) => item.itemType === 'potion')
      .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const usedPotion = before.turn === 'player' && after.turn === 'enemy' && potionCount(after) < potionCount(before);
    const moveAttempt = before.turn === 'player' && after.turn === 'resolving' && !after.pendingBattleSwitch;
    if (switched || usedPotion || moveAttempt) run.turns++;
    if (switched) run.switches++;
    if (usedPotion) run.potions++;
  }
  return { ...after, battleEnvironment: { ...after.battleEnvironment, timberLeague: run } };
};

export const normalizeTimberLeagueSummary = (value) => value && typeof value === 'object' ? {
  ...normalizeTimberLeagueBattle(value),
  voucherCount: clampInt(value.voucherCount, 0, 99, 0),
  alreadyClaimed: value.alreadyClaimed === true,
  stageCleared: value.stageCleared === true
} : null;

// Both transitions run inside the cloud mutation queue. The expected identity
// rejects callbacks from an earlier stage, including double clicks after refresh.
const requireTimberLeagueStage = (snapshot, expected, phase) => {
  const run = normalizeTimberLeagueBattle(snapshot?.battleEnvironment?.timberLeague);
  if (!run.runId || run.runId !== expected?.runId || run.stage !== expected?.stage ||
      snapshot?.view !== 'battle' || snapshot?.battlePhase !== phase || run.completed) {
    throw new Error('联赛阶段已变化，请重新读取当前挑战。');
  }
  return run;
};

export const settleTimberLeagueStage = (snapshot, expected, isAlive, now = new Date()) => {
  const run = requireTimberLeagueStage(snapshot, expected, 'active');
  if (!snapshot.enemyTeam?.length || snapshot.enemyTeam.some(isAlive)) {
    throw new Error('当前阶段还有未击败的对手，暂不能结算。');
  }
  const route = getTimberLeagueRoute(run.routeKey);
  if (route.key === 'training' && snapshot.enemyTeam.length !== 6) {
    throw new Error('训练赛应有六只对手，请重新读取当前挑战。');
  }
  const clearedStageId = `${route.key}:${run.stage}:${run.runId}`;
  if (normalizeTimberLeagueState(snapshot.world?.timberLeague).clearedStageIds.includes(clearedStageId)) {
    throw new Error('本场奖励已结算，请重新读取当前挑战。');
  }
  run.completed = run.stage === route.stages;
  const reward = claimTimberLeagueReward(snapshot.world, run, now);
  reward.state.clearedStageIds = uniqueIds([...reward.state.clearedStageIds, clearedStageId]);
  const gold = calculateTimberLeagueStageGold(snapshot.enemyTeam, reward.tier, route.key);
  const nextRun = { ...run, tier: run.completed ? reward.tier : null, score: run.turns };
  const environment = { ...snapshot.battleEnvironment, timberLeague: nextRun };
  return {
    ...snapshot,
    world: { ...snapshot.world, timberLeague: reward.state },
    battleEnvironment: environment,
    battlePhase: 'victory',
    turn: 'player',
    pendingBattleSwitch: null,
    battleEnergyRefundEligible: false,
    battlePhaseData: {
      enemyName: `铁木训练联赛 · ${route.label}`,
      isTrainer: true,
      battleEnvironment: environment,
      battleEventCompletion: snapshot.battleEventCompletion,
      rewardSummary: { gold, timberLeague: {
        ...nextRun, stageCleared: true,
        voucherCount: reward.voucherCount, alreadyClaimed: reward.alreadyClaimed
      } }
    }
  };
};

export const continueTimberLeagueStage = (snapshot, expected, enemyTeam, isAlive, clearStageRuntime) => {
  const run = requireTimberLeagueStage(snapshot, expected, 'victory');
  const cleared = snapshot.battlePhaseData?.rewardSummary?.timberLeague;
  if (run.stage >= run.stages || !cleared?.stageCleared || cleared.runId !== run.runId || cleared.stage !== run.stage) {
    throw new Error('请先完成当前联赛阶段。');
  }
  const route = getTimberLeagueRoute(run.routeKey);
  const playerTeam = snapshot.playerTeam.map(clearStageRuntime);
  const lead = playerTeam.find((mon) => mon.id === snapshot.activePlayerId && isAlive(mon)) || playerTeam.find(isAlive);
  if (!lead || !enemyTeam?.length) throw new Error('队伍无法继续挑战，请结束本次联赛。');
  const environment = { ...snapshot.battleEnvironment, timberLeague: {
    ...run,
    stage: run.stage + 1,
    enemySwitches: 0
  } };
  return {
    ...snapshot,
    playerTeam,
    enemyTeam,
    activePlayerId: lead.id,
    activeEnemyId: enemyTeam[0].id,
    battleEnvironment: environment,
    battlePhase: 'intro',
    turn: 'player',
    pendingBattleSwitch: null,
    participatedMonIds: [lead.id],
    activeBattleEnergyCost: route.energyCost,
    battleEnergyRefundEligible: false,
    battlePhaseData: {
      enemyMon: enemyTeam[0], leadMonId: lead.id, sendOutSide: 'both',
      message: `${route.label} · 第 ${run.stage + 1}/${run.stages} 阶段`,
      battleEnvironment: environment, battleEventCompletion: snapshot.battleEventCompletion
    }
  };
};
