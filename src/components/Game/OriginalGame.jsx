import React, { lazy, Suspense, useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, Component, startTransition } from "react"
import { createPortal } from "react-dom"
import { TYPES, TYPE_NAMES_CN } from "../../utils/constants"
import { MOVES, MONSTERS, OFFICIAL_DEX_MONSTERS, POKEBALLS, POTIONS, EXP_POTIONS, EVOLUTION_ITEMS, getBalancedMovesForLevel, normalizeMovesForPokemonLevel } from "../../utils/gameData"
import { getMovesLearnedAtLevel, getEvolutionLevelForBranch } from "../../utils/pokemonGrowth"
import { MAP_CONFIG, getMapConfig, getRandomWildPokemon, getRandomWildLevel } from "../../data/maps/mapConfig"
import GameCanvas from "../../game/GameCanvas"
import { applyMapEventsToGrid, getMapEventAt, getMapEvents, getMapStartPosition, getMapSignMessage } from "../../game/data/mapEvents"
import { getMapEventTile } from "../../game/data/mapEventTypes"
import { FAST_TRAVEL_COST, getFastTravelStation, getFastTravelStationMeta } from "../../game/data/fastTravel"
import { ADVENTURE_MAP_CHAIN, getAdventureMapInfo, hasAdventureMap, hasAdventureMapGridVisualRoadMismatch, loadAdventureMapGrid } from "../../game/data/overworldMaps"
import { PLAYER_VISUAL_VERSION, getPlayerFigureDataUrl } from "../../game/world/TextureFactory.js"
import { supabase } from "../../supabaseClient"
import {
  ENCOUNTER_SAFE_STEPS,
  DEFAULT_MAX_ENERGY,
  DEFAULT_STARTING_ENERGY,
  DEFAULT_STARTING_GOLD,
  calculateBattleRewards,
  calculateCatchRate,
  getExpToNextLevelOfficial,
  getCatchAttemptWarning,
  getBattleEnergyCost,
  getDefeatGoldPenalty,
  getPlayerAverageLevel,
  isMapLockedForLevel,
  getTrainerRoleBalance,
  normalizeTrainerRole
} from "../../utils/gameBalance"
import {
  calculateBattleDamage,
  getMoveEffectivenessMeta,
  getTypeEffectivenessMessage,
  getStageMultiplier,
  resolveBattleStat
} from "../../utils/battleDamage"
import { chooseTrainerBattleAction } from "../../utils/battleAi"
import {
  BATTLE_TEXT_CHAR_MS,
  getBattleLogReadDelay,
  getBattleMoveImpactDelay,
  getBattleMovePhaseDuration,
  addBattleLogAndWait,
  addBattleLogsSequentially,
  wait
} from "../../utils/battlePacing"
import {
  MAX_PARTY_SIZE,
  MAX_STORAGE_SIZE,
  acquireMonster,
  addToStorage,
  depositToStorage,
  withdrawToParty,
  swapPartyAndStorage,
  replacePartyMember,
  releaseMonster,
  sanitizeRoster
} from "../../utils/pokemonRoster"
import { calculateStatsForLevel } from "../../utils/pokemonStats"
import { isLevelValidForSpecies, pickLevelForSpecies } from "../../utils/wildEncounterRules"
import {
  getTrainerDifficultyBounds,
  getTrainerBattlePressureLevel,
  isDailyVariantBattleEvent,
  rebalanceTrainerBattleTeamLevels,
  resolveTrainerBattleTeamConfig
} from "../../utils/trainerBattleScaling"
import {
  findExpOverflowMonsters,
  normalizeRosterExpProgress,
  simulateMonsterExpGain
} from "../../utils/pokemonProgress"
import {
  clearPotionCurableStatus,
  consumeInventoryItem,
  getInventoryItemQuantity,
  hasPotionCurableStatus,
  getPotionEffectParts,
  getPotionEffectText,
  getPotionRecoveryProfile,
  isActiveInventoryItemType,
  isLegacyInventoryItemType,
  mergeInventoryEntries,
  resolveInventoryItemDetails,
  resolveInventoryItemType,
  sanitizePlayerInventory,
  sortInventorySlots,
} from "../../utils/inventoryItems"
import { getMoveEffectConfig } from "../../utils/moveVisuals"
import {
  appendLevelUpCelebrationsToQueue,
  buildLevelUpCelebrationPayload,
  buildLevelUpCelebrationsForRoster
} from "../../utils/levelUpCelebrations"
import { applyImageFallback, preloadImageAssets, warmImageAssets } from "../../utils/localAssetPreloader"
import { gameAudio, normalizeAudioSettings, readStoredAudioSettings, writeStoredAudioSettings } from "../../utils/gameAudio"
import { CollectionCard, CollectionGrid, TypeBadge } from "./gameUiPrimitives"
import { assetUrl } from "../../utils/assetUrl"

// --- Data Definitions ---

// 高清宝可梦素材：运行时只读取 public/assets 本地缓存，避免战斗时依赖外部网络。
const POKEMON_LOCAL_SPRITE_BASE = assetUrl('/assets/pokemon/official-artwork');
const POKEMON_LOCAL_PLACEHOLDER = assetUrl('/assets/pokemon/placeholder.svg');
const BATTLE_SENDOUT_BALL_SPRITE = assetUrl('/assets/characters/battle-trainer/pokeapi-pokeball-dreamworld.png');
const TRAINER_PORTRAITS = {
  normal: assetUrl('/assets/characters/trainers/trainer-normal.png'),
  lieutenant: assetUrl('/assets/characters/trainers/trainer-lieutenant.png'),
  boss: assetUrl('/assets/characters/trainers/trainer-boss.png'),
  challenge: assetUrl('/assets/characters/trainers/trainer-challenge.png')
};

const DeferredDexScreen = lazy(() => import("./DeferredGamePanels").then((module) => ({ default: module.DexScreen })));
const DeferredShopScreen = lazy(() => import("./DeferredGamePanels").then((module) => ({ default: module.ShopScreen })));
const DeferredTeamScreen = lazy(() => import("./DeferredGamePanels").then((module) => ({ default: module.TeamScreen })));
const DeferredBagScreen = lazy(() => import("./DeferredGamePanels").then((module) => ({ default: module.BagScreen })));
const DeferredUnifiedBagScreen = lazy(() => import("./DeferredGamePanels").then((module) => ({ default: module.UnifiedBagScreen })));

const DeferredPanelFallback = ({ title = '界面加载中...' }) => (
  <div className="game-page">
    <div className="game-page-header">
      <div>
        <h2 className="game-page-title">{title}</h2>
        <div className="game-page-subtitle">正在准备内容</div>
      </div>
    </div>
    <div className="game-scroll-area">
      <div className="game-card p-4 text-sm font-bold text-slate-500">请稍候...</div>
    </div>
  </div>
);

let threeLowPolyModelCacheModulePromise = null;

const loadThreeLowPolyModelCacheModule = () => {
  if (!threeLowPolyModelCacheModulePromise) {
    threeLowPolyModelCacheModulePromise = import("../../game/threeLowPolyModelCache");
  }
  return threeLowPolyModelCacheModulePromise;
};

const preloadThreeLowPolyMapModelsOnDemand = async (mapName) => {
  const { preloadThreeLowPolyMapModels } = await loadThreeLowPolyModelCacheModule();
  return preloadThreeLowPolyMapModels(mapName);
};

const getTrainerPortraitForRole = (role) => {
  const normalizedRole = normalizeTrainerRole(role);
  return TRAINER_PORTRAITS[normalizedRole] || TRAINER_PORTRAITS.normal;
};

const TRAINER_INTRO_META = {
  normal: {
    promptText: '挡住了去路，准备对战！',
  },
  lieutenant: {
    promptText: '试炼印记之战开始！',
  },
  boss: {
    promptText: '首领挑战开始！',
  },
  challenge: {
    promptText: '区域试炼开始！',
  },
};

const getTrainerIntroMeta = (role) => (
  TRAINER_INTRO_META[normalizeTrainerRole(role)] || TRAINER_INTRO_META.normal
);

const getFastTravelFigureDataUrl = ({ direction, pose }) => {
  const safeDirection = ['down', 'left', 'right', 'up'].includes(direction) ? direction : 'down';
  return getPlayerFigureDataUrl({
    direction: safeDirection,
    frame: pose === 'run' ? 1 : 0,
    scale: 2
  });
};

const extractPokedexIdFromSpriteUrl = (url) => {
  if (typeof url !== 'string') return null;
  const match = url.match(/\/pokemon(?:\/back|\/official-artwork|\/other\/(?:official-artwork|home))?\/(\d+)\.png$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const resolvePokedexId = (monster) => {
  const explicitId = Number(monster?.pokedexId);
  if (Number.isFinite(explicitId) && explicitId > 0) return explicitId;
  const fromDexNo = Number(monster?.dexNo);
  if (Number.isFinite(fromDexNo) && fromDexNo > 0) return fromDexNo;
  const fromSprite = extractPokedexIdFromSpriteUrl(monster?.sprite);
  if (fromSprite) return fromSprite;
  const fromBackSprite = extractPokedexIdFromSpriteUrl(monster?.backSprite);
  if (fromBackSprite) return fromBackSprite;
  const fromBase = Number(monster?.baseId);
  if (Number.isFinite(fromBase) && fromBase > 0) {
    const baseMonster = MONSTERS.find((candidate) => Number(candidate?.id) === fromBase);
    const baseDexNo = Number(baseMonster?.dexNo ?? baseMonster?.pokedexId);
    if (Number.isFinite(baseDexNo) && baseDexNo > 0) return baseDexNo;
  }
  const fromId = Number(monster?.id);
  if (Number.isFinite(fromId) && fromId > 0) return fromId;
  return null;
};

const getHighResPokemonSpriteSet = (pokedexId) => {
  const safeId = Number(pokedexId);
  if (!Number.isFinite(safeId) || safeId <= 0) return null;
  const front = `${POKEMON_LOCAL_SPRITE_BASE}/${safeId}.png`;
  return {
    pokedexId: safeId,
    sprite: front,
    backSprite: front,
    fallbackSprite: POKEMON_LOCAL_PLACEHOLDER
  };
};

const applyHighResPokemonSprites = (monster) => {
  const pokedexId = resolvePokedexId(monster);
  const spriteSet = getHighResPokemonSpriteSet(pokedexId);
  if (!spriteSet) return monster;
  return { ...monster, ...spriteSet };
};

const getLevelStatBase = (baseMonster = {}) => (
  baseMonster.stats
    ? {
        maxHp: baseMonster.stats.hp,
        maxMp: Math.floor((baseMonster.stats.sp_attack || 50) * 0.8) + 20,
        atk: baseMonster.stats.attack,
        def: baseMonster.stats.defense,
        spAtk: baseMonster.stats.sp_attack,
        spDef: baseMonster.stats.sp_defense,
        spd: baseMonster.stats.speed,
      }
    : {
        maxHp: baseMonster.maxHp,
        maxMp: baseMonster.maxMp,
        atk: baseMonster.atk,
        def: baseMonster.def,
        spAtk: baseMonster.spAtk,
        spDef: baseMonster.spDef,
        spd: baseMonster.spd,
      }
);

const preserveNormalizedMeter = (currentValue, previousMaxValue, nextMaxValue) => {
  const nextMax = Math.max(0, Math.trunc(Number(nextMaxValue) || 0));
  if (currentValue === undefined || currentValue === null || currentValue === '') return nextMax;
  const current = Number(currentValue);
  const previousMax = Number(previousMaxValue);

  if (!Number.isFinite(current)) return nextMax;
  if (!Number.isFinite(previousMax) || previousMax <= 0) {
    return Math.max(0, Math.min(nextMax, Math.trunc(current)));
  }
  if (current >= previousMax) return nextMax;

  const ratio = Math.max(0, Math.min(1, current / previousMax));
  return Math.max(0, Math.min(nextMax, Math.round(nextMax * ratio)));
};

const resolveBaseMonsterForAsset = (monster) => {
  if (!monster || typeof monster !== 'object') return null;

  const dexNo = Number(monster.dexNo ?? monster.pokedexId);
  if (Number.isFinite(dexNo) && dexNo > 0) {
    const byDexNo = MONSTERS.find((candidate) => (
      Number(candidate?.dexNo ?? candidate?.pokedexId) === dexNo
    ));
    if (byDexNo) return byDexNo;
  }

  const candidateIds = [
    monster.baseId,
    monster.speciesId,
    monster.templateId,
    monster.monsterId,
    monster.id,
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  for (const id of candidateIds) {
    const byId = MONSTERS.find((candidate) => Number(candidate?.id) === id);
    if (byId) return byId;
  }

  return null;
};

const normalizeMonsterAssetSource = (monster) => {
  if (!monster || typeof monster !== 'object') return monster;
  const spriteSet = getHighResPokemonSpriteSet(resolvePokedexId(monster));
  const normalized = spriteSet ? { ...monster, ...spriteSet } : {
    ...monster,
    sprite: monster.sprite || POKEMON_LOCAL_PLACEHOLDER,
    backSprite: monster.backSprite || POKEMON_LOCAL_PLACEHOLDER,
    fallbackSprite: POKEMON_LOCAL_PLACEHOLDER
  };
  if ((normalized.currentHp === undefined || normalized.currentHp === null || normalized.currentHp === '') && normalized.hp != null) {
    normalized.currentHp = normalized.hp;
  }
  if ((normalized.currentMp === undefined || normalized.currentMp === null || normalized.currentMp === '') && normalized.mp != null) {
    normalized.currentMp = normalized.mp;
  }
  const baseMonster = resolveBaseMonsterForAsset(normalized);
  if (baseMonster) {
    const baseDexNo = Number(baseMonster.dexNo ?? baseMonster.pokedexId);
    normalized.baseId = baseMonster.id;
    normalized.dexNo = Number.isFinite(baseDexNo) && baseDexNo > 0 ? baseDexNo : normalized.dexNo;
    normalized.pokedexId = Number.isFinite(baseDexNo) && baseDexNo > 0 ? baseDexNo : normalized.pokedexId;
    normalized.name = baseMonster.name;
    normalized.type = baseMonster.type;
    normalized.type2 = baseMonster.type2 || null;
    const baseSpriteSet = getHighResPokemonSpriteSet(normalized.dexNo);
    if (baseSpriteSet) {
      normalized.sprite = baseSpriteSet.sprite;
      normalized.backSprite = baseSpriteSet.backSprite;
      normalized.fallbackSprite = baseSpriteSet.fallbackSprite;
    }
  }
  const level = Number(normalized.level);
  if (Number.isFinite(level) && (baseMonster || Array.isArray(normalized.moves))) {
    if (baseMonster) {
      const recalculatedStats = calculateStatsForLevel(getLevelStatBase(baseMonster), level);
      const previousMaxHp = normalized.maxHp;
      const previousMaxMp = normalized.maxMp;
      normalized.maxHp = recalculatedStats.maxHp;
      normalized.maxMp = recalculatedStats.maxMp;
      normalized.atk = recalculatedStats.atk;
      normalized.def = recalculatedStats.def;
      normalized.spAtk = recalculatedStats.spAtk;
      normalized.spDef = recalculatedStats.spDef;
      normalized.spd = recalculatedStats.spd;
      normalized.currentHp = preserveNormalizedMeter(normalized.currentHp, previousMaxHp, recalculatedStats.maxHp);
      normalized.currentMp = preserveNormalizedMeter(normalized.currentMp, previousMaxMp, recalculatedStats.maxMp);
    }
    normalized.moves = getRuntimeMovesPreservingKnown(baseMonster || normalized, normalized.moves || [], level, {
      preferBalancedWhenInvalid: true,
    });
    normalized.expToNextLevel = level >= 100 ? Infinity : getExpToNextLevelOfficial(level, baseMonster || normalized);
  }
  return normalized;
};

const normalizeMonsterAssetList = (monsters) => (
  Array.isArray(monsters) ? monsters.map(normalizeMonsterAssetSource) : []
);

const HEAL_ANIMATION_DURATION_MS = 950;
const EXP_ANIMATION_DURATION_MS = 1150;
const BATTLE_SWITCH_RECALL_MS = 760;
const BATTLE_SWITCH_SEND_MS = 980;
const BATTLE_SENDOUT_OVERLAY_MS = 980;
const VICTORY_SETTLEMENT_READY_MS = 1850;
const BATTLE_TURN_RECOVERY_MS = 4500;
const BATTLE_SPRITE_IMAGE_BASE_UNIT = 96;
const BATTLE_SPRITE_CONTAINER_BASE_UNIT = 112;
const LAUNCH_SPRITE_IMAGE_BASE_UNIT = 64;
const LAUNCH_SPRITE_CONTAINER_BASE_UNIT = 68;
const BATTLE_PLAYER_SPRITE_MULTIPLIER = 1.35;
const BATTLE_ENEMY_SPRITE_MULTIPLIER = 1.25;

const buildEvolutionEventKey = (monId, targetId) => `${String(monId)}::${Number(targetId)}`;
const buildEvolutionChoiceEventKey = (monId, targetOptions = []) => `${String(monId)}::${[...targetOptions].map((targetId) => Number(targetId)).sort((a, b) => a - b).join(',')}`;
const buildLearnMoveEventKey = (monId, moveKey) => `${String(monId)}::${String(moveKey)}`;
const CLOUD_SYNC_CONFLICT_MESSAGE = '云端已有新进度，请重新读取。';
const CLOUD_REQUEST_RETRY_DELAYS_MS = [220, 520, 920];
const isCloudSyncConflict = (message) => typeof message === 'string' && message.includes('旧版本存档');
const isMissingCloudRpcError = (error, rpcName) => {
  const message = getCloudRequestErrorMessage(error);
  return error?.code === 'PGRST202' || (typeof rpcName === 'string' && rpcName.length > 0 && message.includes(rpcName));
};
const getCloudRequestErrorMessage = (error) => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return String(error.message || error.details || error.hint || error.name || error);
};
const isTransientCloudRequestError = (error) => {
  const message = getCloudRequestErrorMessage(error);
  return /load failed|failed to fetch|networkerror|network request failed|fetch failed|timeout|timed out|aborted|aborterror|cancelled/i.test(message);
};
const runCloudRequestWithRetry = async (requestFn, retryDelaysMs = CLOUD_REQUEST_RETRY_DELAYS_MS) => {
  let lastTransientError = null;
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      const result = await requestFn();
      if (result?.error && isTransientCloudRequestError(result.error) && attempt < retryDelaysMs.length) {
        lastTransientError = result.error;
        await wait(retryDelaysMs[attempt]);
        continue;
      }
      return result;
    } catch (error) {
      if (!isTransientCloudRequestError(error) || attempt >= retryDelaysMs.length) {
        throw error;
      }
      lastTransientError = error;
      await wait(retryDelaysMs[attempt]);
    }
  }
  throw lastTransientError || new Error('云端请求失败，稍后重试。');
};
const getMonsterMaxHp = (mon) => Math.max(0, Number(mon?.maxHp ?? mon?.stats?.hp ?? 0) || 0);
const getMonsterMaxMp = (mon) => {
  const directMaxMp = Number(mon?.maxMp);
  if (Number.isFinite(directMaxMp) && directMaxMp > 0) return directMaxMp;
  const spAttack = Number(mon?.stats?.sp_attack ?? mon?.stats?.spAtk ?? mon?.spAtk);
  return Number.isFinite(spAttack) && spAttack > 0 ? Math.floor(spAttack * 0.8) + 20 : 0;
};
const clampMonsterMeter = (value, maxValue) => {
  const safeMax = Math.max(0, Math.trunc(Number(maxValue) || 0));
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return safeMax;
  return Math.max(0, Math.min(safeMax, Math.trunc(numeric)));
};
const getMonsterCurrentMeter = (mon, keys, maxValue) => {
  for (const key of keys) {
    const value = mon?.[key];
    if (value === undefined || value === null || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return clampMonsterMeter(numeric, maxValue);
  }
  return clampMonsterMeter(maxValue, maxValue);
};
const getMonsterCurrentHp = (mon, maxHp = getMonsterMaxHp(mon)) => (
  getMonsterCurrentMeter(mon, ['currentHp', 'hp'], maxHp)
);
const getMonsterCurrentMp = (mon, maxMp = getMonsterMaxMp(mon)) => (
  getMonsterCurrentMeter(mon, ['currentMp', 'mp'], maxMp)
);
const getMoveMpCost = (move) => Math.max(0, Math.trunc(Number(move?.cost) || 0));
const normalizeRuntimeKnownMoveKeys = (moves = []) => {
  const seen = new Set();
  return (Array.isArray(moves) ? moves : [])
    .filter((moveKey) => {
      if (!MOVES[moveKey] || seen.has(moveKey)) return false;
      seen.add(moveKey);
      return true;
    })
    .slice(0, 4);
};
const getRuntimeMovesPreservingKnown = (baseMonster, moves = [], level = 1, options = {}) => {
  const knownMoves = normalizeRuntimeKnownMoveKeys(moves);
  if (knownMoves.length > 0) return knownMoves;
  return normalizeMovesForPokemonLevel(baseMonster, moves, level, options);
};
const hasZeroCostMove = (moves = []) => (
  normalizeRuntimeKnownMoveKeys(moves).some((moveKey) => getMoveMpCost(MOVES[moveKey]) === 0)
);
const getAffordableBattleMoveKeys = (mon) => {
  const currentMp = getMonsterCurrentMp(mon);
  return normalizeRuntimeKnownMoveKeys(mon?.moves).filter((moveKey) => (
    getMoveMpCost(MOVES[moveKey]) <= currentMp
  ));
};
const getNoMpBattleHint = (mon) => (
  `${mon?.name || '宝可梦'} 的 MP 不足，暂时无法使用任何技能。可以打开背包使用伤药恢复 MP，或更换宝可梦继续对战。`
);
const getNoMpOverlayTitle = (mon) => (
  `${mon?.name || '宝可梦'} 暂时放不出技能`
);
const getNoMpOverlayBody = () => (
  '补一点 MP，或换一只上场。'
);
const getMoveMpShortageHint = (mon, move) => (
  `${move?.name || '这个技能'} 需要 MP ${getMoveMpCost(move)}，${mon?.name || '宝可梦'} 当前 MP 不足。可以选择其他技能、打开背包使用伤药恢复 MP，或更换宝可梦继续对战。`
);
const getNoMpBattleDeadlockHint = () => (
  '当前队伍已经没有可继续战斗的技能、替补或恢复手段，本场战斗会判定失败。'
);
const canRestoreBattleMpWithInventory = (playerInventory = [], mon) => {
  if (!mon) return false;
  const maxMp = getMonsterMaxMp(mon);
  const currentMp = getMonsterCurrentMp(mon, maxMp);
  if (currentMp >= maxMp) return false;

  return Object.entries(POTIONS).some(([itemKey, potion]) => (
    getPotionRecoveryProfile(potion).mp > 0 &&
    getInventoryItemQuantity(playerInventory, 'potion', itemKey) > 0
  ));
};
const hasBattleRecoveryPath = ({
  playerTeam = [],
  playerInventory = [],
  canRun = false,
} = {}) => {
  if (canRun) return true;

  return (Array.isArray(playerTeam) ? playerTeam : []).some((mon) => (
    getMonsterCurrentHp(mon) > 0 &&
    (
      getAffordableBattleMoveKeys(mon).length > 0 ||
      canRestoreBattleMpWithInventory(playerInventory, mon)
    )
  ));
};
const getBattleSendOutMessage = (mon) => `去吧！${mon?.name || '伙伴'}！`;

const didPlayerJustSwitchOnLastBattleLog = (logs = [], playerMon = null) => {
  const latestLog = Array.isArray(logs) && logs.length > 0 ? logs[logs.length - 1] : '';
  const playerName = typeof playerMon?.name === 'string' ? playerMon.name : '';
  if (typeof latestLog !== 'string' || latestLog.length === 0) return false;
  if (playerName) return latestLog === `上吧，${playerName}！`;
  return /^上吧，.+！$/.test(latestLog);
};
const getEnemyAiSwitchIntentMessage = (action) => {
  const targetName = action?.target?.name;
  if (!targetName) return '';
  switch (action.reason) {
    case 'avoid_ko':
      return `对手察觉到危险，准备换上 ${targetName} 承受攻势。`;
    case 'type_pivot':
      return `对手判断属性不利，选择换上 ${targetName} 调整节奏。`;
    case 'preserve_partner':
      return `对手想保留当前伙伴的体力，换上 ${targetName}。`;
    default:
      return `对手看准机会，换上 ${targetName}。`;
  }
};
const FLOATING_ENTRY_POKEDEX_IDS = new Set([65, 81, 82, 92, 93, 94, 122, 144, 145, 146, 149, 150, 462]);
const HEAVY_ENTRY_TYPES = new Set([TYPES.ROCK, TYPES.GROUND, TYPES.STEEL]);
const getBattleEntryMode = (mon) => {
  if (!mon) return 'ground';
  const typeA = mon.type;
  const typeB = mon.type2;
  if (
    typeA === TYPES.FLYING ||
    typeB === TYPES.FLYING ||
    FLOATING_ENTRY_POKEDEX_IDS.has(Number(mon.pokedexId || mon.id))
  ) {
    return 'air';
  }

  const maxHp = getMonsterMaxHp(mon);
  const atk = Number(mon?.atk ?? mon?.stats?.attack ?? 0) || 0;
  const def = Number(mon?.def ?? mon?.stats?.defense ?? 0) || 0;
  if (
    HEAVY_ENTRY_TYPES.has(typeA) ||
    HEAVY_ENTRY_TYPES.has(typeB) ||
    maxHp >= 95 ||
    atk + def >= 190
  ) {
    return 'heavy';
  }

  return 'ground';
};
const getLevelUpStatSnapshot = (mon) => ({
  maxHp: getMonsterMaxHp(mon),
  maxMp: getMonsterMaxMp(mon),
  atk: Math.max(0, Math.trunc(Number(mon?.atk ?? mon?.stats?.attack ?? 0) || 0)),
  def: Math.max(0, Math.trunc(Number(mon?.def ?? mon?.stats?.defense ?? 0) || 0)),
  spAtk: Math.max(0, Math.trunc(Number(mon?.spAtk ?? mon?.stats?.sp_attack ?? 0) || 0)),
  spDef: Math.max(0, Math.trunc(Number(mon?.spDef ?? mon?.stats?.sp_defense ?? 0) || 0)),
  spd: Math.max(0, Math.trunc(Number(mon?.spd ?? mon?.stats?.speed ?? 0) || 0)),
});
const abortCloudSnapshotCommit = (message, notificationType = 'warning') => ({
  __cloudSnapshotCommitAborted: true,
  message,
  notificationType,
});
const isAbortedCloudSnapshotCommit = (value) => Boolean(value?.__cloudSnapshotCommitAborted);

const getBattleDisplayMonster = (monster) => monster;

// 全量替换为高清素材
for (let i = 0; i < MONSTERS.length; i += 1) {
  MONSTERS[i] = applyHighResPokemonSprites(MONSTERS[i]);
}

let gameAssetPreloadPromise = null;
let latestGameAssetPreloadSummary = null;

const toUniqueAssetUrls = (urls = []) => (
  [...new Set(urls
    .filter((url) => typeof url === 'string' && url.trim().length > 0)
    .map((url) => url.trim()))]
);

const getInventoryImageAssetUrls = () => (
  [
    ...Object.values(POKEBALLS).map((item) => item.sprite),
    ...Object.values(POTIONS).map((item) => item.sprite),
    ...Object.values(EXP_POTIONS).map((item) => item.sprite),
    ...Object.values(EVOLUTION_ITEMS).map((item) => item.sprite)
  ]
);

const getCriticalPokemonImageAssetUrls = () => (
  [1, 4, 7, 25, 59, 65, 94, 129, 130, 131, 133, 135, 149]
    .map((dexNo) => `${POKEMON_LOCAL_SPRITE_BASE}/${dexNo}.png`)
);

const getCriticalGameImageAssetUrls = () => toUniqueAssetUrls([
  POKEMON_LOCAL_PLACEHOLDER,
  BATTLE_SENDOUT_BALL_SPRITE,
  ...Object.values(TRAINER_PORTRAITS),
  ...getCriticalPokemonImageAssetUrls(),
  ...getInventoryImageAssetUrls()
]);

const getAllGameImageAssetUrls = () => toUniqueAssetUrls([
  ...getCriticalGameImageAssetUrls(),
  ...MONSTERS.flatMap((monster) => [monster.sprite, monster.backSprite, monster.fallbackSprite]),
  ...OFFICIAL_DEX_MONSTERS.flatMap((monster) => [monster.sprite, monster.backSprite, monster.fallbackSprite])
]);

const preloadGameAssets = () => {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    latestGameAssetPreloadSummary = { ok: true, skipped: true, total: 0, loaded: 0, failed: [] };
    return Promise.resolve(latestGameAssetPreloadSummary);
  }
  if (gameAssetPreloadPromise) return gameAssetPreloadPromise;

  gameAssetPreloadPromise = (async () => {
    const critical = await preloadImageAssets(getCriticalGameImageAssetUrls(), {
      concurrency: 10,
      timeoutMs: 12000
    });
    latestGameAssetPreloadSummary = critical;
    if (!critical.ok) {
      console.warn('[assets] 关键游戏素材预加载存在失败项', critical.failed);
    }
    warmImageAssets(getAllGameImageAssetUrls(), {
      concurrency: 8,
      timeoutMs: 16000
    });
    return critical;
  })();

  return gameAssetPreloadPromise;
};

const handlePokemonImageError = (event) => {
  applyImageFallback(event, POKEMON_LOCAL_PLACEHOLDER);
};

const handleItemImageError = (event) => {
  applyImageFallback(event, POKEBALLS.pokeball_basic.sprite || POKEMON_LOCAL_PLACEHOLDER);
};

const handlePokeballImageError = (event) => {
  applyImageFallback(event, POKEBALLS.pokeball_basic.sprite || POKEMON_LOCAL_PLACEHOLDER);
};

const handleTrainerPortraitImageError = (event) => {
  applyImageFallback(event, TRAINER_PORTRAITS.normal || POKEMON_LOCAL_PLACEHOLDER);
};

const getChallengeUnlockSpeciesPreview = (pool = []) => {
  const seen = new Set();
  return (Array.isArray(pool) ? pool : [])
    .map((entry) => Math.trunc(Number(entry?.pokemonId ?? entry?.id ?? entry)))
    .filter(Number.isInteger)
    .filter((pokemonId) => {
      if (seen.has(pokemonId)) return false;
      seen.add(pokemonId);
      return true;
    })
    .map((pokemonId) => {
      const baseMonster = MONSTERS.find((monster) => Number(monster?.id) === pokemonId);
      if (!baseMonster) return null;
      const dexMonster = OFFICIAL_DEX_MONSTERS.find((monster) => (
        Number(monster?.id) === Number(baseMonster.id) ||
        Number(monster?.dexNo ?? monster?.pokedexId) === Number(baseMonster.dexNo ?? baseMonster.pokedexId)
      ));
      return normalizeMonsterAssetSource(dexMonster || baseMonster);
    })
    .filter(Boolean)
    .map((monster) => ({
      id: monster.id,
      name: monster.name,
      sprite: monster.sprite || POKEMON_LOCAL_PLACEHOLDER,
      type: monster.type,
      type2: monster.type2 || null
    }));
};

const getChallengeBattleSpeciesPreview = (teamConfig = []) => (
  Array.isArray(teamConfig)
    ? teamConfig
      .map((entry, index) => {
        const pokemonId = Math.trunc(Number(entry?.pokemonId ?? entry?.id ?? entry));
        if (!Number.isInteger(pokemonId)) return null;
        const baseMonster = MONSTERS.find((monster) => Number(monster?.id) === pokemonId);
        if (!baseMonster) return null;
        const dexMonster = OFFICIAL_DEX_MONSTERS.find((monster) => (
          Number(monster?.id) === Number(baseMonster.id) ||
          Number(monster?.dexNo ?? monster?.pokedexId) === Number(baseMonster.dexNo ?? baseMonster.pokedexId)
        ));
        const normalized = normalizeMonsterAssetSource(dexMonster || baseMonster);
        const level = Math.trunc(Number(entry?.level));
        return {
          id: `${normalized.id}-${index}`,
          speciesId: normalized.id,
          name: normalized.name,
          sprite: normalized.sprite || POKEMON_LOCAL_PLACEHOLDER,
          level: Number.isFinite(level) && level > 0 ? level : null
        };
      })
      .filter(Boolean)
    : []
);

// --- Utilities ---
const getEffectiveBattleStat = resolveBattleStat;

const STATUS_LABELS = {
  sleep: '睡眠',
  poison: '中毒',
  burn: '灼伤',
  paralysis: '麻痹',
  freeze: '冰冻',
  confusion: '混乱',
  flinch: '畏缩'
};

const STATUS_BATTLE_HINTS = {
  sleep: '倒计时醒来前无法行动',
  poison: '回合结束时损失体力',
  burn: '回合结束时损失体力',
  paralysis: '25%无法行动，速度降低',
  freeze: '每回合尝试解冻，部分火焰招式可破冰',
  confusion: '33%可能伤到自己',
  flinch: '本回合无法行动'
};

const getStatusAppliedBattleMessage = (targetName, status) => ({
  sleep: `${targetName} 睡着了，暂时无法行动！`,
  poison: `${targetName} 中毒了，会持续损失体力！`,
  burn: `${targetName} 被灼伤了，会持续损失体力！`,
  paralysis: `${targetName} 麻痹了，行动时有25%概率无法出招！`,
  freeze: `${targetName} 被冻住了，暂时无法行动！`,
  confusion: `${targetName} 混乱了，可能伤到自己！`,
  flinch: `${targetName} 畏缩了，本回合难以行动！`
}[status] || `${targetName} 陷入了${STATUS_LABELS[status] || status}状态！`);

const STATUS_IMMUNITY_BY_TYPE = {
  poison: ['poison', 'steel'],
  burn: ['fire'],
  paralysis: ['electric'],
  freeze: ['ice']
};

const getMonsterTypes = (mon) => [mon?.type, mon?.type2].filter(Boolean);

const hasStatusImmunity = (mon, status) => {
  const immuneTypes = STATUS_IMMUNITY_BY_TYPE[status];
  if (!immuneTypes) return false;
  const monsterTypes = getMonsterTypes(mon);
  return immuneTypes.some((type) => monsterTypes.includes(type));
};

const createBattleStatusVisualMove = (status) => {
  const base = {
    name: STATUS_LABELS[status] || '异常',
    category: 'status',
    power: 0,
    accuracy: 100,
    cost: 0,
  };
  switch (status) {
    case 'sleep':
      return { ...base, type: 'psychic', status: 'sleep' };
    case 'poison':
      return { ...base, type: 'poison', status: 'poison' };
    case 'burn':
      return { ...base, type: 'fire', status: 'burn' };
    case 'paralysis':
      return { ...base, type: 'electric', status: 'paralysis' };
    case 'freeze':
      return { ...base, type: 'ice', status: 'freeze' };
    case 'confusion':
      return { ...base, type: 'psychic', volatileStatus: 'confusion' };
    case 'flinch':
      return { ...base, type: 'normal', volatileStatus: 'flinch' };
    default:
      return { ...base, type: 'normal' };
  }
};

const withBattleRuntimeDefaults = (mon) => {
  if (!mon) return null;
  const normalized = normalizeMonsterAssetSource(mon);
  const maxHp = getMonsterMaxHp(normalized);
  const maxMp = getMonsterMaxMp(normalized);
  return {
    ...normalized,
    maxHp,
    maxMp,
    currentHp: getMonsterCurrentHp(normalized, maxHp),
    currentMp: getMonsterCurrentMp(normalized, maxMp),
    status: normalized.status || null,
    statusTurns: normalized.statusTurns || 0,
    volatileStatuses: normalized.volatileStatuses || {},
    statStages: normalized.statStages || {}
  };
};

const clampStatStage = (value) => Math.max(-6, Math.min(6, value));

const updateBattleMonBySide = ({ side, monId, updater, setPlayerTeam, setEnemyTeam }) => {
  const setter = side === 'player' ? setPlayerTeam : setEnemyTeam;
  setter((prev) => prev.map((mon) => mon.id === monId ? updater(withBattleRuntimeDefaults(mon)) : mon));
};

const rollChance = (chance = 100) => Math.random() * 100 < chance;

const checkMoveHit = (move, attacker, defender = null) => {
  if (move?.alwaysHits) return true;
  const accuracy = typeof move.accuracy === 'number' ? move.accuracy : 100;
  const stage = (attacker?.statStages?.accuracy || 0) - (defender?.statStages?.evasion || 0);
  const adjustedAccuracy = Math.max(1, Math.min(100, accuracy * getStageMultiplier(stage)));
  return rollChance(adjustedAccuracy);
};

const createStatusPayload = (status) => {
  // 这里的内部计数会在行动开始时先递减一次，因此用 2~4 来贴近官方 1~3 回合睡眠。
  if (status === 'sleep') return { status, statusTurns: 2 + Math.floor(Math.random() * 3) };
  if (status === 'freeze') return { status, statusTurns: 0 };
  return { status, statusTurns: 0 };
};

const getConfusionDurationTurns = () => (
  // 与睡眠同理，内部 2~5 次计数能更贴近官方 1~4 回合混乱。
  2 + Math.floor(Math.random() * 4)
);

const calculateConfusionSelfHitDamage = (mon) => {
  const runtimeMon = withBattleRuntimeDefaults(mon);
  const level = runtimeMon?.level || 50;
  const attackStat = Math.max(1, getEffectiveBattleStat(runtimeMon, 'atk'));
  const defenseStat = Math.max(1, getEffectiveBattleStat(runtimeMon, 'def'));
  const randomFactor = (Math.floor(Math.random() * 16) + 85) / 100;
  const damage = (((2 * level / 5 + 2) * 40 * (attackStat / defenseStat)) / 50 + 2) * randomFactor;
  return Math.max(1, Math.floor(damage));
};

const isFreezeThawingMove = (move) => (
  move?.category !== 'status' && move?.type === TYPES.FIRE
);

const isFreezeSelfThawingMove = (move) => Boolean(move?.thawsUser);

const createBattleStatusEvent = (status, message, mon, options = {}) => ({
  status,
  message,
  mon: withBattleRuntimeDefaults(mon),
  move: options.move || createBattleStatusVisualMove(status),
  moveKey: options.moveKey || `__status_${status}`,
  phase: options.phase || 'status',
  visual: options.visual !== false,
  suppressActorMotion: options.suppressActorMotion ?? true,
  forceTargetReaction: options.forceTargetReaction ?? false,
  reactionClass: options.reactionClass || null,
  minMs: options.minMs,
  maxMs: options.maxMs,
  extraMs: options.extraMs,
  durationMs: options.durationMs,
});

const sanitizeBattleRuntime = (mon) => {
  if (!mon) return mon;
  const normalized = withBattleRuntimeDefaults(mon);
  return {
    ...normalized,
    status: null,
    statusTurns: 0,
    volatileStatuses: {},
    statStages: {}
  };
};

const clearTemporaryBattleRuntime = (mon) => {
  if (!mon) return mon;
  const volatileStatuses = { ...(mon.volatileStatuses || {}) };
  delete volatileStatuses.flinch;
  delete volatileStatuses.confusion;
  delete volatileStatuses.chargingMove;
  delete volatileStatuses.lastMoveKey;
  delete volatileStatuses.furyCutterCount;
  delete volatileStatuses.rolloutCount;
  return {
    ...mon,
    volatileStatuses,
    statStages: {}
  };
};

const clearBattleExitRuntime = (mon) => {
  if (!mon) return mon;
  const cleared = clearTemporaryBattleRuntime(mon);
  const volatileStatuses = { ...(cleared.volatileStatuses || {}) };
  delete volatileStatuses.rageFistHits;
  return {
    ...cleared,
    volatileStatuses
  };
};

const getStatusBadgeMeta = (status) => {
  const meta = {
    sleep: { label: '眠', className: 'battle-status-sleep' },
    poison: { label: '毒', className: 'battle-status-poison' },
    burn: { label: '灼', className: 'battle-status-burn' },
    paralysis: { label: '麻', className: 'battle-status-paralysis' },
    freeze: { label: '冻', className: 'battle-status-freeze' },
    confusion: { label: '乱', className: 'battle-status-confusion' },
    flinch: { label: '畏', className: 'battle-status-flinch' }
  }[status];
  if (!meta) return null;
  return {
    ...meta,
    fullLabel: STATUS_LABELS[status] || status,
    hint: STATUS_BATTLE_HINTS[status] || '状态异常'
  };
};

const getBattleStatusNotes = (mon) => {
  if (!mon) return [];
  const notes = [];
  if (mon.status) {
    const statusMeta = getStatusBadgeMeta(mon.status);
    if (statusMeta) notes.push(statusMeta);
  }
  if (mon.volatileStatuses?.confusion) {
    const confusionMeta = getStatusBadgeMeta('confusion');
    if (confusionMeta) notes.push(confusionMeta);
  }
  if (mon.volatileStatuses?.flinch) {
    const flinchMeta = getStatusBadgeMeta('flinch');
    if (flinchMeta) notes.push(flinchMeta);
  }
  return notes;
};

const STAT_LABELS = {
  atk: '攻击',
  def: '防御',
  spAtk: '特攻',
  spDef: '特防',
  spd: '速度',
  accuracy: '命中',
  evasion: '闪避'
};

const STAT_SHORT_LABELS = {
  atk: '攻',
  def: '防',
  spAtk: '特攻',
  spDef: '特防',
  spd: '速',
  accuracy: '命中',
  evasion: '闪避'
};

const MOVE_CATEGORY_LABELS = {
  physical: '物理',
  special: '特殊',
  status: '变化'
};

const getMoveStatChangeEntries = (move) => {
  const entries = [];
  if (move?.statChange) entries.push(move.statChange);
  if (Array.isArray(move?.statChanges)) entries.push(...move.statChanges);
  return entries.filter((entry) => entry?.stat && Number(entry.stages) !== 0);
};

const getMoveStatChangeLabel = (entry, { compact = false } = {}) => {
  const statLabel = compact
    ? (STAT_SHORT_LABELS[entry.stat] || STAT_LABELS[entry.stat] || '能力')
    : (STAT_LABELS[entry.stat] || '能力');
  return `${statLabel}${Number(entry.stages) > 0 ? '提升' : '降低'}`;
};

const getMoveEffectLabels = (move) => {
  const labels = [];
  if (!move) return labels;
  if (move.status) labels.push(STATUS_LABELS[move.status] || '异常');
  if (move.volatileStatus) {
    labels.push(
      move.volatileStatus === 'flinch'
        ? '畏缩'
        : move.volatileStatus === 'confusion'
          ? '混乱'
          : move.volatileStatus
    );
  }
  getMoveStatChangeEntries(move).forEach((entry) => labels.push(getMoveStatChangeLabel(entry)));
  if (move.effect === 'heal') labels.push('回复');
  if (move.effect === 'drain') labels.push('吸取');
  if (move.effect === 'mimic') labels.push('模仿技能');
  if (move.effect === 'teleport') labels.push('脱离战斗');
  if (move.effect === 'nothing') labels.push('无效果');
  if (move.requiresTargetStatus) labels.push(`需要${STATUS_LABELS[move.requiresTargetStatus] || '状态'}`);
  if (move.requiresUserStatus) labels.push(`需自身${STATUS_LABELS[move.requiresUserStatus] || '状态'}`);
  if (move.usableWhileAsleep) labels.push('睡眠中可用');
  if (move.thawsUser) labels.push('可破冰');
  if (move.priority) labels.push(`先制 +${move.priority}`);
  if (move.charge) labels.push('蓄力');
  return labels.slice(0, 3);
};

const getMovePrimaryEffectDisplay = (move) => {
  if (Number(move?.power) > 0) {
    return { label: '威力', value: String(move.power) };
  }
  if (!move) return { label: '效果', value: '--' };
  if (move.status) return { label: '效果', value: STATUS_LABELS[move.status] || '异常' };
  if (move.volatileStatus) {
    return {
      label: '效果',
      value: move.volatileStatus === 'flinch'
        ? '畏缩'
        : move.volatileStatus === 'confusion'
          ? '混乱'
          : String(move.volatileStatus)
    };
  }
  if (move.effect === 'heal') return { label: '效果', value: '回复' };
  if (move.effect === 'mimic') return { label: '效果', value: '模仿' };
  if (move.effect === 'teleport') return { label: '效果', value: '脱离' };
  if (move.effect === 'nothing') return { label: '效果', value: '无效果' };

  const statChanges = getMoveStatChangeEntries(move);
  if (statChanges.length > 0) {
    const positives = statChanges.filter((entry) => Number(entry.stages) > 0);
    const negatives = statChanges.filter((entry) => Number(entry.stages) < 0);
    const compactStats = (entries) => entries
      .slice(0, 3)
      .map((entry) => STAT_SHORT_LABELS[entry.stat] || STAT_LABELS[entry.stat] || '能力')
      .join('/');
    if (positives.length > 0 && negatives.length > 0) {
      return { label: '效果', value: `${compactStats(positives)}升/${compactStats(negatives)}降` };
    }
    const entries = positives.length > 0 ? positives : negatives;
    return { label: '效果', value: `${compactStats(entries)}${positives.length > 0 ? '提升' : '降低'}` };
  }

  const labels = getMoveEffectLabels(move);
  return { label: '效果', value: labels[0] || '辅助' };
};

const getUserStatusRequirementFailureMessage = (move, attackerName = '宝可梦') => {
  if (!move?.requiresUserStatus) return null;
  const requiredStatusLabel = STATUS_LABELS[move.requiresUserStatus] || move.requiresUserStatus;
  return `${attackerName} 现在不能使用 ${move.name}，需要自己处于${requiredStatusLabel}状态。`;
};

const resolveTurnStart = (mon, attemptedMoveKey = null) => {
  let nextMon = withBattleRuntimeDefaults(mon);
  if (!nextMon) {
    return { mon: null, events: [], canAct: false, fainted: false };
  }
  const events = [];
  let canAct = true;
  let confusionActiveThisTurn = false;
  const attemptedMove = attemptedMoveKey ? MOVES[attemptedMoveKey] : null;

  const volatileStatuses = { ...nextMon.volatileStatuses };
  const pendingConfusionTurns = Math.max(0, Number(volatileStatuses.confusion) || 0);

  if (volatileStatuses.flinch) {
    delete volatileStatuses.flinch;
    nextMon = { ...nextMon, volatileStatuses };
    events.push(createBattleStatusEvent('flinch', `${nextMon.name} 畏缩了，无法行动！`, nextMon, {
      forceTargetReaction: true,
      minMs: 780,
      maxMs: 1480,
      extraMs: 80,
    }));
    canAct = false;
  }

  if (canAct && nextMon.status === 'sleep') {
    const nextTurns = Math.max(0, (nextMon.statusTurns || 1) - 1);
    if (nextTurns <= 0) {
      nextMon = { ...nextMon, status: null, statusTurns: 0 };
      events.push(createBattleStatusEvent('sleep', `${nextMon.name} 醒来了！`, nextMon, {
        minMs: 760,
        maxMs: 1320,
        extraMs: 70,
      }));
    } else {
      nextMon = { ...nextMon, statusTurns: nextTurns };
      if (attemptedMove?.usableWhileAsleep) {
        events.push(createBattleStatusEvent('sleep', `${nextMon.name} 还在睡梦中，但可以使出 ${attemptedMove.name}！`, nextMon, {
          minMs: 760,
          maxMs: 1420,
          extraMs: 80,
        }));
      } else {
        events.push(createBattleStatusEvent('sleep', `${nextMon.name} 睡着了，无法行动！`, nextMon, {
          forceTargetReaction: true,
          minMs: 820,
          maxMs: 1500,
          extraMs: 90,
        }));
        canAct = false;
      }
    }
  }

  if (canAct && nextMon.status === 'freeze') {
    if (attemptedMove && isFreezeSelfThawingMove(attemptedMove)) {
      nextMon = { ...nextMon, status: null, statusTurns: 0 };
      events.push(createBattleStatusEvent('freeze', `${nextMon.name} 破冰而出，准备使出 ${attemptedMove.name}！`, nextMon, {
        minMs: 760,
        maxMs: 1380,
        extraMs: 70,
      }));
    } else if (rollChance(20)) {
      nextMon = { ...nextMon, status: null, statusTurns: 0 };
      events.push(createBattleStatusEvent('freeze', `${nextMon.name} 解冻了！`, nextMon, {
        minMs: 760,
        maxMs: 1380,
        extraMs: 70,
      }));
    } else {
      events.push(createBattleStatusEvent('freeze', `${nextMon.name} 被冻住了，无法行动！`, nextMon, {
        forceTargetReaction: true,
        minMs: 820,
        maxMs: 1540,
        extraMs: 90,
      }));
      canAct = false;
    }
  }

  if (canAct && nextMon.status === 'paralysis') {
    if (rollChance(25)) {
      events.push(createBattleStatusEvent('paralysis', `${nextMon.name} 因麻痹无法行动！`, nextMon, {
        forceTargetReaction: true,
        minMs: 780,
        maxMs: 1460,
        extraMs: 80,
      }));
      canAct = false;
    }
  }

  // 混乱的剩余回合只会在这回合真正通过行动检查时消耗；
  // 满麻、睡眠、冰冻、畏缩等导致的停手不应白白消耗混乱回合。
  if (canAct && pendingConfusionTurns > 0) {
    const nextTurns = Math.max(0, pendingConfusionTurns - 1);
    if (nextTurns <= 0) {
      delete volatileStatuses.confusion;
      nextMon = { ...nextMon, volatileStatuses };
      events.push(createBattleStatusEvent('confusion', `${nextMon.name} 从混乱中清醒了。`, nextMon, {
        visual: false,
        minMs: 720,
        maxMs: 1220,
        extraMs: 70,
      }));
    } else {
      volatileStatuses.confusion = nextTurns;
      nextMon = { ...nextMon, volatileStatuses };
      events.push(createBattleStatusEvent('confusion', `${nextMon.name} 混乱了！`, nextMon, {
        forceTargetReaction: true,
        minMs: 760,
        maxMs: 1360,
        extraMs: 80,
      }));
      confusionActiveThisTurn = true;
    }
  }

  if (canAct && confusionActiveThisTurn) {
    if (rollChance(100 / 3)) {
      const hurt = calculateConfusionSelfHitDamage(nextMon);
      nextMon = { ...nextMon, currentHp: Math.max(0, nextMon.currentHp - hurt) };
      events.push(createBattleStatusEvent('confusion', `${nextMon.name} 在混乱中伤到了自己！`, nextMon, {
        forceTargetReaction: true,
        minMs: 840,
        maxMs: 1540,
        extraMs: 100,
      }));
      canAct = false;
    }
  }

  return { mon: nextMon, events, canAct, fainted: nextMon.currentHp <= 0 };
};

const resolveTurnEnd = (mon) => {
  let nextMon = withBattleRuntimeDefaults(mon);
  if (!nextMon || nextMon.currentHp <= 0) {
    return { mon: nextMon, events: [], fainted: false };
  }

  const events = [];
  if (nextMon.status === 'poison' || nextMon.status === 'burn') {
    const residualStatus = nextMon.status;
    const divisor = residualStatus === 'poison' ? 8 : 16;
    const damage = Math.max(1, Math.floor(nextMon.maxHp / divisor));
    nextMon = { ...nextMon, currentHp: Math.max(0, nextMon.currentHp - damage) };
    events.push(createBattleStatusEvent(
      residualStatus,
      residualStatus === 'poison'
        ? `${nextMon.name} 因中毒损失了体力！`
        : `${nextMon.name} 因灼伤损失了体力！`,
      nextMon,
      {
        forceTargetReaction: true,
        minMs: 820,
        maxMs: 1500,
        extraMs: 90,
      }
    ));
  }

  return { mon: nextMon, events, fainted: nextMon.currentHp <= 0 };
};

const applyPrimaryStatusToMon = (target, status) => {
  if (!status || target.status || hasStatusImmunity(target, status)) {
    return target;
  }
  return { ...target, ...createStatusPayload(status) };
};

const applyVolatileStatusToMon = (target, status) => {
  if (!status) return target;
  const volatileStatuses = { ...(target.volatileStatuses || {}) };
  if (status === 'confusion') {
    if (volatileStatuses.confusion) return target;
    volatileStatuses.confusion = getConfusionDurationTurns();
  } else if (status === 'flinch') {
    volatileStatuses.flinch = 1;
  }
  return { ...target, volatileStatuses };
};

const getLastExecutedMoveKey = (mon) => {
  const moveKey = mon?.volatileStatuses?.lastMoveKey;
  return MOVES[moveKey] ? moveKey : null;
};

const applyStatChangeToMon = (target, statChange) => {
  if (!statChange?.stat || !statChange?.stages) return target;
  const statStages = { ...(target.statStages || {}) };
  statStages[statChange.stat] = clampStatStage((statStages[statChange.stat] || 0) + statChange.stages);
  return { ...target, statStages };
};

const getMoveStatChanges = (move) => (
  Array.isArray(move?.statChanges)
    ? move.statChanges.filter(Boolean)
    : (move?.statChange ? [move.statChange] : [])
);

const getBattleMoveHitCount = (move) => {
  if (!move?.multiHit) return 1;
  const minHits = Math.max(1, Number(move.multiHit.min) || 1);
  const maxHits = Math.max(minHits, Number(move.multiHit.max) || minHits);
  return minHits + Math.floor(Math.random() * (maxHits - minHits + 1));
};

const getFlailPower = (attacker) => {
  const hpRatio = Math.max(0, (attacker?.currentHp || 0) / Math.max(1, attacker?.maxHp || 1));
  if (hpRatio <= 1 / 48) return 200;
  if (hpRatio <= 5 / 48) return 150;
  if (hpRatio <= 10 / 48) return 100;
  if (hpRatio <= 17 / 48) return 80;
  if (hpRatio <= 33 / 48) return 40;
  return 20;
};

const getLowKickPower = (defender) => {
  const bulkScore = (Number(defender?.maxHp) || 1) + (Number(defender?.def) || 1) + (Number(defender?.spDef) || 1);
  if (bulkScore >= 280) return 120;
  if (bulkScore >= 220) return 100;
  if (bulkScore >= 170) return 80;
  if (bulkScore >= 125) return 60;
  if (bulkScore >= 80) return 40;
  return 20;
};

const getElectroBallPower = (attacker, defender) => {
  const attackerSpeed = Math.max(1, getEffectiveBattleStat(attacker, 'spd'));
  const defenderSpeed = Math.max(1, getEffectiveBattleStat(defender, 'spd'));
  const ratio = attackerSpeed / defenderSpeed;
  if (ratio >= 4) return 150;
  if (ratio >= 3) return 120;
  if (ratio >= 2) return 80;
  if (ratio >= 1) return 60;
  return 40;
};

const getGyroBallPower = (attacker, defender) => {
  const attackerSpeed = Math.max(1, getEffectiveBattleStat(attacker, 'spd'));
  const defenderSpeed = Math.max(1, getEffectiveBattleStat(defender, 'spd'));
  return Math.max(1, Math.min(150, Math.floor((25 * defenderSpeed / attackerSpeed) + 1)));
};

const getHeavySlamPower = (attacker, defender) => {
  const attackerBulk = (Number(attacker?.maxHp) || 1) + (Number(attacker?.atk) || 1) + (Number(attacker?.def) || 1);
  const defenderBulk = Math.max(1, (Number(defender?.maxHp) || 1) + (Number(defender?.atk) || 1) + (Number(defender?.def) || 1));
  const ratio = attackerBulk / defenderBulk;
  if (ratio >= 5) return 120;
  if (ratio >= 4) return 100;
  if (ratio >= 3) return 80;
  if (ratio >= 2) return 60;
  return 40;
};

const getDynamicBattleMovePower = (moveKey, move, attacker, defender) => {
  if (moveKey === 'flail' || moveKey === 'reversal') return getFlailPower(attacker);
  if (moveKey === 'low_kick' || moveKey === 'grass_knot') return getLowKickPower(defender);
  if (moveKey === 'electro_ball') return getElectroBallPower(attacker, defender);
  if (moveKey === 'gyro_ball') return getGyroBallPower(attacker, defender);
  if (moveKey === 'heavy_slam') return getHeavySlamPower(attacker, defender);
  if (moveKey === 'rage_fist') {
    const hitsTaken = Math.max(0, Number(attacker?.volatileStatuses?.rageFistHits) || 0);
    return Math.min(350, 50 + hitsTaken * 50);
  }
  if (moveKey === 'fury_cutter') {
    const chain = Math.max(0, Number(attacker?.volatileStatuses?.furyCutterCount) || 0);
    return Math.min(160, (Number(move.power) || 40) * (2 ** chain));
  }
  if (moveKey === 'rollout') {
    const chain = Math.max(0, Number(attacker?.volatileStatuses?.rolloutCount) || 0);
    return Math.min(480, (Number(move.power) || 30) * (2 ** chain));
  }
  return Number(move?.power) || 0;
};

const determineBattleActionOrder = (playerMon, enemyMon, playerMove, enemyMove) => {
  const playerPriority = playerMove?.priority || 0;
  const enemyPriority = enemyMove?.priority || 0;
  if (playerPriority !== enemyPriority) {
    return playerPriority > enemyPriority ? ['player', 'enemy'] : ['enemy', 'player'];
  }

  const playerSpeed = getEffectiveBattleStat(playerMon, 'spd');
  const enemySpeed = getEffectiveBattleStat(enemyMon, 'spd');
  if (playerSpeed !== enemySpeed) {
    return playerSpeed > enemySpeed ? ['player', 'enemy'] : ['enemy', 'player'];
  }

  return Math.random() < 0.5 ? ['player', 'enemy'] : ['enemy', 'player'];
};

const determineBattleEndOfTurnSideOrder = (playerMon, enemyMon) => {
  const playerSpeed = getEffectiveBattleStat(playerMon, 'spd');
  const enemySpeed = getEffectiveBattleStat(enemyMon, 'spd');
  if (playerSpeed !== enemySpeed) {
    return playerSpeed > enemySpeed ? ['player', 'enemy'] : ['enemy', 'player'];
  }
  return Math.random() < 0.5 ? ['player', 'enemy'] : ['enemy', 'player'];
};

const getBattleActionOrderReason = (playerMon, enemyMon, playerMove, enemyMove, actionOrder) => {
  const firstSide = actionOrder?.[0];
  const firstName = firstSide === 'player' ? playerMon?.name : `敌方 ${enemyMon?.name}`;
  const playerPriority = playerMove?.priority || 0;
  const enemyPriority = enemyMove?.priority || 0;

  if (playerPriority !== enemyPriority) {
    const moveName = firstSide === 'player' ? playerMove?.name : enemyMove?.name;
    return `${firstName} 的 ${moveName} 优先级更高，率先行动！`;
  }

  const playerSpeed = getEffectiveBattleStat(playerMon, 'spd');
  const enemySpeed = getEffectiveBattleStat(enemyMon, 'spd');
  if (playerSpeed !== enemySpeed) {
    return `${firstName} 速度更快，率先行动！`;
  }

  return `双方速度相同，${firstName} 抢先行动！`;
};

const getBattleMoveUseMessage = (actorName, moveName, isRelease = false) => (
  isRelease ? `${actorName} 释放了 ${moveName}！` : `${actorName} 使用了 ${moveName}！`
);

const getRecoveryBehaviorText = ({ hp = 0, mp = 0, curedStatus = false } = {}) => {
  const restoredHp = hp > 0;
  const restoredMp = mp > 0;
  if (restoredHp && restoredMp && curedStatus) return '恢复了体力、技能值并解除了异常状态';
  if (restoredHp && restoredMp) return '恢复了体力与技能值';
  if (restoredHp && curedStatus) return '恢复了体力并解除了异常状态';
  if (restoredHp) return '恢复了体力';
  if (restoredMp && curedStatus) return '恢复了技能值并解除了异常状态';
  if (restoredMp) return '恢复了技能值';
  if (curedStatus) return '解除了异常状态';
  return '恢复没有生效';
};

const getBattleMovePressure = (attacker, defender) => {
  const hasKnownTypes = getMonsterTypes(attacker).length > 0 && getMonsterTypes(defender).length > 0;
  const damagingMoveMetas = (attacker?.moves || [])
    .map((moveKey) => MOVES[moveKey])
    .filter((move) => move && move.category !== 'status' && Number(move.power) > 0)
    .map((move) => ({
      move,
      ...getMoveEffectivenessMeta(move, defender, attacker)
    }));

  if (damagingMoveMetas.length === 0) {
    return {
      hasDamagingMove: false,
      hasKnownTypes,
      bestEffectiveness: 1,
      bestRank: 'neutral',
      allResisted: false,
      allImmune: false
    };
  }

  const bestMove = damagingMoveMetas.reduce((best, current) => (
    current.effectiveness > best.effectiveness ? current : best
  ), damagingMoveMetas[0]);

  return {
    hasDamagingMove: true,
    hasKnownTypes,
    bestEffectiveness: bestMove.effectiveness,
    bestRank: bestMove.rank,
    bestMoveName: bestMove.move.name,
    allResisted: damagingMoveMetas.every((meta) => meta.effectiveness < 1),
    allImmune: damagingMoveMetas.every((meta) => meta.effectiveness === 0)
  };
};

const getBattleHudHint = (ownPressure, opposingPressure, perspective = 'player') => {
  const ownHasSuper = ownPressure.bestEffectiveness > 1;
  const opposingHasSuper = opposingPressure.bestEffectiveness > 1;
  const ownHasStrongSuper = ownPressure.bestEffectiveness >= 4;
  const isPlayerPerspective = perspective === 'player';

  if (ownHasSuper && opposingHasSuper) {
    return { text: '双方都有克制招式', className: 'text-orange-200' };
  }
  if (ownHasStrongSuper) {
    return { text: isPlayerPerspective ? '强力克制' : '威胁很高', className: 'text-emerald-200' };
  }
  if (ownHasSuper) {
    return { text: isPlayerPerspective ? '你有克制招式' : '有克制招式', className: 'text-emerald-200' };
  }
  if (opposingHasSuper) {
    return { text: isPlayerPerspective ? '注意对手克制' : '弱点可突破', className: 'text-rose-200' };
  }
  if (!ownPressure.hasKnownTypes || !opposingPressure.hasKnownTypes) {
    return { text: '属性待确认', className: 'text-sky-100/75' };
  }
  if (!ownPressure.hasDamagingMove) {
    return { text: '缺少伤害招式', className: 'text-amber-200' };
  }
  if (ownPressure.allImmune) {
    return { text: '当前攻击无效', className: 'text-slate-200' };
  }
  if (ownPressure.allResisted) {
    return { text: '招式不占优', className: 'text-amber-200' };
  }
  return { text: '属性均衡', className: 'text-white/70' };
};

const getBattleLevelUpMessage = (name) => `${name} 升级了！`;
const INSUFFICIENT_BATTLE_ENERGY_LOG = '能量不足，至少需要 1 点能量才能开始战斗。';
const INSUFFICIENT_BATTLE_ENERGY_NOTIFICATION = '能量不足，无法开始战斗。';
const BATTLE_DIALOGUE_MAX_CHARS = 52;

const shortenBattleDialogueText = (text, maxChars = BATTLE_DIALOGUE_MAX_CHARS) => {
  const cleanText = String(text || '').trim();
  if (cleanText.length <= maxChars) return cleanText;
  return `${cleanText.slice(0, Math.max(1, maxChars - 3)).trim()}...`;
};

const formatBattleDialogueLog = (message) => {
  const rawText = String(message || '').trim();
  if (!rawText) return '';

  const actionText = rawText
    .replace(/^(.+?)作为普通训练家挡住了你的去路：.*$/, '$1发起对战！')
    .replace(/^(.+?)作为部下训练家守着试炼印记：.*$/, '$1守着试炼印记！')
    .replace(/^试炼标记发出光芒：隐藏生态守护者将连续出战（(.+?)）。.*$/, '试炼连战开始！$1')
    .replace(/^(.+?)：三枚试炼印记已经发光。.*$/, '$1首领挑战！')
    .replace(/！本回合不消耗 MP。/g, '！')
    .replace(/！MP\s*-\d+（[^）]*）/g, '！')
    .replace(/\s*\(Lv\.\d+\)\s*/g, '')
    .replace(/Lv\.\d+\s*→\s*Lv\.\d+/g, '')
    .replace(/（\d+\s*回合）/g, '')
    .replace(/当前阶段\s*[+-]?\d+/g, '')
    .replace(/损失\s*\d+\s*点体力/g, '体力下降')
    .replace(/受到了\s*\d+\s*点伤害，HP\s*\d+\/\d+/g, '受到了伤害')
    .replace(/恢复了\s*\d+\s*点体力，HP\s*\d+\/\d+/g, '恢复了体力')
    .replace(/吸取了\s*\d+\s*点体力，HP\s*\d+\/\d+/g, '吸取了体力')
    .replace(/获得了\s*\d+\s*经验值，参与战斗的宝可梦平分。/g, '参与战斗的宝可梦获得了经验。')
    .replace(/获得了\s*\d+\s*金币。/g, '获得了战斗奖励。')
    .replace(/挑战失败，损失了\s*\d+\s*金币，队伍已恢复。/g, '挑战失败，队伍已恢复。')
    .replace(/能量不足，至少需要\s*\d+\s*点能量才能开始战斗。/g, '能量不足，无法开始战斗。')
    .replace(/能量不足，野外战斗需要\s*\d+\s*点能量。/g, '能量不足，无法开始野外战斗。')
    .replace(/能量不足，训练家对战需要\s*\d+\s*点能量。/g, '能量不足，无法开始训练家对战。')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return shortenBattleDialogueText(actionText);
};

const getExpToNextLevel = (level, baseMonster = null) => {
  return level >= 100 ? Infinity : getExpToNextLevelOfficial(level, baseMonster);
};

const createMonsterInstance = (baseMonster, level, id, initialCurrentHp, initialCurrentMp, initialCurrentExp) => {
  // Defensive check to prevent crash if baseMonster is not found (e.g., during level-up)
  if (!baseMonster) {
    console.error(`createMonsterInstance received an undefined 'baseMonster'. This likely means a monster lookup failed, possibly during level-up. ID passed: ${id}.`);
    // Return a fallback monster to prevent a crash.
    const fallbackSpriteSet = getHighResPokemonSpriteSet(132);
    baseMonster = {
      id: 0, name: '错误宝可梦', type: 'normal', moves: ['tackle'],
      sprite: fallbackSpriteSet?.sprite || POKEMON_LOCAL_PLACEHOLDER,
      backSprite: fallbackSpriteSet?.backSprite || POKEMON_LOCAL_PLACEHOLDER,
      fallbackSprite: fallbackSpriteSet?.fallbackSprite,
      stats: { hp: 10, attack: 10, defense: 10, sp_attack: 10, sp_defense: 10, speed: 10 }
    };
  }

  // Data normalization to handle different structures (MONSTERS vs BALANCED_MONSTERS)
  const baseStats = baseMonster.stats ? { // From BALANCED_MONSTERS
    maxHp: baseMonster.stats.hp,
    maxMp: Math.floor((baseMonster.stats.sp_attack || 50) * 0.8) + 20, // Calculate MP
    atk: baseMonster.stats.attack,
    def: baseMonster.stats.defense,
    spAtk: baseMonster.stats.sp_attack,
    spDef: baseMonster.stats.sp_defense,
    spd: baseMonster.stats.speed
  } : { // From MONSTERS
    maxHp: baseMonster.maxHp,
    maxMp: baseMonster.maxMp,
    atk: baseMonster.atk,
    def: baseMonster.def,
    spAtk: baseMonster.spAtk,
    spDef: baseMonster.spDef,
    spd: baseMonster.spd
  };

  const calculatedStats = calculateStatsForLevel(baseStats, level);

  return normalizeMonsterAssetSource({
    ...baseMonster,
    ...calculatedStats,
    moves: getBalancedMovesForLevel(baseMonster, level),
    level,
    id,
    baseId: baseMonster.id, // Keep track of the original monster template ID
    currentHp: initialCurrentHp ?? calculatedStats.maxHp,
    currentMp: initialCurrentMp ?? calculatedStats.maxMp,
    currentExp: initialCurrentExp ?? 0,
    expToNextLevel: getExpToNextLevel(level, baseMonster)
  });
};

const getMapEventProperties = (event) => (
  event?.properties && typeof event.properties === 'object' ? event.properties : {}
);

const isConfiguredBattleEventType = (type) => (
  type === 'trainer' || type === 'boss' || type === 'challenge'
);

const getConfiguredBattleOpponentCount = (teamConfig = []) => {
  const count = Array.isArray(teamConfig)
    ? teamConfig.filter((entry) => Number.isFinite(Math.trunc(Number(entry?.pokemonId ?? entry?.id)))).length
    : 0;
  return Math.max(1, count || 0);
};

const getConfiguredBattleLevelRangeText = (teamConfig = []) => {
  const levels = Array.isArray(teamConfig)
    ? teamConfig
      .map((entry) => Math.trunc(Number(entry?.level)))
      .filter((level) => Number.isFinite(level) && level > 0)
    : [];
  if (levels.length === 0) return '';
  const minLevel = Math.min(...levels);
  const maxLevel = Math.max(...levels);
  return minLevel === maxLevel ? `Lv.${minLevel}` : `Lv.${minLevel}-${maxLevel}`;
};

const getConfiguredBattleLevels = (teamConfig = []) => (
  Array.isArray(teamConfig)
    ? teamConfig
      .map((entry) => Math.trunc(Number(entry?.level)))
      .filter((level) => Number.isFinite(level) && level > 0)
      .map((level) => Math.max(1, Math.min(100, level)))
    : []
);

const DAILY_SCALING_TRAINER_ROLES = new Set(['normal']);
const CHALLENGE_RARE_UNLOCK_STAGE_COUNT = 4;

const isDailyScalingTrainerRole = (role) => DAILY_SCALING_TRAINER_ROLES.has(normalizeTrainerRole(role));

const isDailyScalingTrainerEvent = (eventType, role) => (
  eventType === 'trainer' && isDailyScalingTrainerRole(role)
);

const getMapScopedEventId = (mapName, eventId) => {
  if (typeof mapName !== 'string' || mapName.length === 0) return null;
  if (typeof eventId !== 'string' || eventId.length === 0) return null;
  return `${mapName}:${eventId}`;
};

const getBattleEventInteractionLockKey = ({ world, mapName, eventType, eventId } = {}) => {
  if (!isConfiguredBattleEventType(eventType)) return null;
  const scopedId = getMapScopedEventId(mapName, eventId);
  if (!scopedId) return null;
  const dailyKey = typeof world?.dailyRefreshKey === 'string' && world.dailyRefreshKey.length > 0
    ? world.dailyRefreshKey
    : getCurrentDailyRefreshKey();
  return `${dailyKey}:${eventType}:${scopedId}`;
};

const getBattleEventCompletedLockKeys = ({ world, mapName, eventType, eventId, eventRole = null } = {}) => {
  const interactionKey = getBattleEventInteractionLockKey({ world, mapName, eventType, eventId });
  const scopedId = getMapScopedEventId(mapName, eventId);
  const resolvedEventRole = eventRole || resolveConfiguredBattleRole(
    eventType,
    getMapEventProperties(getMapEventById(mapName, eventId))
  );
  const isPermanentTrainerEvent = eventType === 'trainer' && normalizeTrainerRole(resolvedEventRole) !== 'normal';
  const dailyKey = typeof world?.dailyRefreshKey === 'string' && world.dailyRefreshKey.length > 0
    ? world.dailyRefreshKey
    : getCurrentDailyRefreshKey();
  return [
    interactionKey,
    eventId && isDailyVariantBattleEvent(eventType, resolvedEventRole) ? `${dailyKey}:${eventType}:${eventId}` : null,
    (eventType === 'boss' || isPermanentTrainerEvent) && scopedId ? `permanent:${eventType}:${scopedId}` : null,
    (eventType === 'boss' || isPermanentTrainerEvent) && eventId ? `permanent:${eventType}:${eventId}` : null
  ].filter(Boolean);
};

const getCompletedBattleEventVisualOverrideKey = (mapName, eventId) => (
  getMapScopedEventId(mapName, eventId)
);

const resolveCompletedBattleEventVisualOverrideStatus = ({ eventType, eventRole = null } = {}) => {
  if (eventType === 'boss') return 'completed';
  if (eventType === 'challenge') return 'daily_complete';
  if (eventType === 'trainer') {
    return isDailyScalingTrainerEvent(eventType, eventRole) ? 'daily_complete' : 'cleared';
  }
  return null;
};

const appendCompletedBattleEventVisualOverride = (overrides, {
  world,
  mapName,
  eventType,
  eventId,
  eventRole = null
} = {}) => {
  const key = getCompletedBattleEventVisualOverrideKey(mapName, eventId);
  const status = resolveCompletedBattleEventVisualOverrideStatus({ eventType, eventRole });
  const normalized = overrides && typeof overrides === 'object' ? overrides : {};

  if (!key || !status) return normalized;

  return {
    ...normalized,
    [key]: {
      status,
      dailyRefreshKey: status === 'daily_complete'
        ? (
          typeof world?.dailyRefreshKey === 'string' && world.dailyRefreshKey.length > 0
            ? world.dailyRefreshKey
            : getCurrentDailyRefreshKey()
        )
        : null
    }
  };
};

const getCompletedBattleEventVisualOverride = (overrides, {
  world,
  mapName,
  eventId
} = {}) => {
  const key = getCompletedBattleEventVisualOverrideKey(mapName, eventId);
  if (!key || !overrides || typeof overrides !== 'object') return null;
  const override = overrides[key];
  if (!override || typeof override.status !== 'string') return null;
  if (override.status !== 'daily_complete') return override;

  const activeDailyRefreshKey = (
    typeof world?.dailyRefreshKey === 'string' && world.dailyRefreshKey.length > 0
      ? world.dailyRefreshKey
      : getCurrentDailyRefreshKey()
  );
  return override.dailyRefreshKey === activeDailyRefreshKey ? override : null;
};

const globalMapEventIdCountCache = new Map();

const getGlobalMapEventIdCount = (eventId) => {
  if (typeof eventId !== 'string' || eventId.length === 0) return 0;
  if (globalMapEventIdCountCache.has(eventId)) {
    return globalMapEventIdCountCache.get(eventId);
  }
  const count = ADVENTURE_MAP_CHAIN.reduce((sum, mapName) => (
    sum + getMapEvents(mapName).filter((event) => event.id === eventId).length
  ), 0);
  globalMapEventIdCountCache.set(eventId, count);
  return count;
};

const getMapScopedEventLookupIds = (mapName, eventId) => {
  if (typeof eventId !== 'string' || eventId.length === 0) return [];
  const scopedId = getMapScopedEventId(mapName, eventId);
  return [
    scopedId,
    getGlobalMapEventIdCount(eventId) <= 1 ? eventId : null
  ].filter(Boolean);
};

const hasMapScopedWorldEventId = (world, key, mapName, eventId) => (
  getMapScopedEventLookupIds(mapName, eventId)
    .some((id) => hasWorldEventId(world, key, id))
);

const appendMapScopedWorldEventId = (world, key, mapName, eventId) => {
  const scopedId = getMapScopedEventId(mapName, eventId);
  return appendWorldEventId(world, key, scopedId || eventId);
};

const appendBattleCompletionWorldEventId = (world, key, mapName, eventId) => {
  const scopedId = getMapScopedEventId(mapName, eventId);
  const normalized = appendWorldEventId(world, key, scopedId || eventId);
  return scopedId && scopedId !== eventId
    ? appendWorldEventId(normalized, key, eventId)
    : normalized;
};

const countMapScopedWorldEventIds = (world, key, mapName, eventIds = []) => (
  (Array.isArray(eventIds) ? eventIds : [])
    .filter((eventId) => hasMapScopedWorldEventId(world, key, mapName, eventId))
    .length
);

const hasDailyTrainerBattleEvent = (world, mapName, eventId) => (
  hasMapScopedWorldEventId(world, 'dailyTrainerBattleIds', mapName, eventId)
);

const appendDailyTrainerBattleEvent = (world, mapName, eventId) => {
  return appendBattleCompletionWorldEventId(world, 'dailyTrainerBattleIds', mapName, eventId);
};

const getTrainerVictoryCount = (world, eventId, mapName = null) => {
  if (typeof eventId !== 'string' || eventId.length === 0) return 0;
  const counts = normalizePositiveIntegerMap(world?.trainerVictoryCounts);
  const lookupIds = mapName
    ? getMapScopedEventLookupIds(mapName, eventId)
    : [eventId];
  return Math.max(0, ...lookupIds.map((id) => counts[id] || 0));
};

const incrementTrainerVictoryCount = (world, eventId, mapName = null) => {
  if (typeof eventId !== 'string' || eventId.length === 0) return normalizeWorldState(world);
  const normalized = normalizeWorldState(world);
  const progressId = getMapScopedEventId(mapName, eventId) || eventId;
  const currentCount = getTrainerVictoryCount(normalized, eventId, mapName);
  return {
    ...normalized,
    trainerVictoryCounts: {
      ...normalized.trainerVictoryCounts,
      [progressId]: Math.min(999, currentCount + 1)
    }
  };
};

const setTrainerVictoryCount = (world, eventId, count, mapName = null) => {
  if (typeof eventId !== 'string' || eventId.length === 0) return normalizeWorldState(world);
  const normalized = normalizeWorldState(world);
  const nextCount = Math.max(0, Math.min(999, Math.trunc(Number(count)) || 0));
  const progressId = getMapScopedEventId(mapName, eventId) || eventId;
  return {
    ...normalized,
    trainerVictoryCounts: {
      ...normalized.trainerVictoryCounts,
      ...(nextCount > 0 ? { [progressId]: nextCount } : {})
    }
  };
};

const getChallengeRarePool = (event) => {
  const props = getMapEventProperties(event);
  return Array.isArray(props.challengeRarePool) ? props.challengeRarePool : [];
};

const getChallengeRareUnlockStage = (world, event, mapName = null) => {
  if (!event?.id) return 0;
  const victoryCount = getTrainerVictoryCount(world, event.id, mapName);
  if (victoryCount > 0) return victoryCount;
  return hasMapScopedWorldEventId(world, 'completedChallengeIds', mapName, event.id) ? 1 : 0;
};

const getChallengeRareUnlockStageCount = (event) => {
  const poolSize = getChallengeRarePool(event).length;
  if (poolSize <= 0) return 0;
  return Math.min(CHALLENGE_RARE_UNLOCK_STAGE_COUNT, poolSize);
};

const getChallengeRareUnlockedCountForStage = (event, stage) => {
  const poolSize = getChallengeRarePool(event).length;
  if (poolSize <= 0) return 0;
  const stageCount = getChallengeRareUnlockStageCount(event);
  const safeStage = Math.max(0, Math.min(stageCount, Math.trunc(Number(stage)) || 0));
  if (safeStage <= 0) return 0;
  if (safeStage >= stageCount) return poolSize;
  return Math.max(1, Math.min(poolSize, Math.round((poolSize * safeStage) / stageCount)));
};

const getChallengeRareUnlockBatch = (event, completedStage = 0) => {
  const pool = getChallengeRarePool(event);
  const stage = Math.max(0, Math.trunc(Number(completedStage)) || 0);
  const start = getChallengeRareUnlockedCountForStage(event, stage);
  const end = getChallengeRareUnlockedCountForStage(event, stage + 1);
  return pool.slice(start, end);
};

const getChallengeUnlockedRarePool = (event, world, mapName = null) => {
  const pool = getChallengeRarePool(event);
  const stage = getChallengeRareUnlockStage(world, event, mapName);
  return pool.slice(0, getChallengeRareUnlockedCountForStage(event, stage));
};

const getChallengeRunRewardItems = ({ mapName, teamSize = 3 } = {}) => {
  const mapConfig = getMapConfig(mapName);
  const regionOrder = Math.max(1, Math.trunc(Number(mapConfig?.regionOrder)) || 1);
  const length = Math.max(3, Math.min(6, Math.trunc(Number(teamSize)) || 3));
  const isLate = regionOrder >= 6;
  const isMid = regionOrder >= 3;
  const ballKey = isLate ? 'pokeball_ultra' : isMid ? 'pokeball_great' : 'pokeball_basic';
  const potionKey = isLate ? 'hyper_potion' : isMid ? 'super_potion' : 'potion';
  return [
    ...(length >= 4 ? [{
      itemType: 'pokeball',
      itemKey: ballKey,
      quantity: length >= 6 ? 2 : 1
    }] : [{
      itemType: 'pokeball',
      itemKey: ballKey,
      quantity: 1
    }]),
    ...(length >= 5 ? [{
      itemType: 'potion',
      itemKey: potionKey,
      quantity: 1
    }] : [])
  ];
};

const getMapBossLevelCap = (mapName) => {
  const boss = getMapBossEvent(mapName);
  const bossLevels = getConfiguredBattleLevels(getMapEventProperties(boss).team);
  if (bossLevels.length > 0) return Math.max(...bossLevels);
  const mapConfig = getMapConfig(mapName);
  return Math.max(
    1,
    Math.min(100, Math.trunc(Number(mapConfig.maxLevel || mapConfig.recommendedLevel || 5)) || 5)
  );
};

const resolveDailyBattleTeamConfig = (teamConfig, {
  mapName,
  world,
  eventId,
  eventType = 'trainer',
  role = 'normal',
  challengeRarePool = [],
  dailyVariantSpeciesIds = [],
  dailyVariantLevelJitter = null
} = {}) => {
  if (!Array.isArray(teamConfig) || teamConfig.length === 0) return [];
  const mapConfig = getMapConfig(mapName);
  const bossEvent = getMapBossEvent(mapName);
  return resolveTrainerBattleTeamConfig(teamConfig, {
    role,
    eventType,
    eventId,
    mapName,
    dailyRefreshKey: world?.dailyRefreshKey,
    victoryCount: getTrainerVictoryCount(
      world,
      eventId,
      isDailyVariantBattleEvent(eventType, role) ? mapName : null
    ),
    mapConfig,
    mapWildPokemon: mapConfig?.wildPokemon,
    dailyVariantSpeciesIds,
    dailyVariantLevelJitter,
    bossTeamConfig: getMapEventProperties(bossEvent).team,
    challengeRarePool,
    enableDailyVariant: isDailyVariantBattleEvent(eventType, role)
  });
};

const getDailyTrainerBlockedText = ({ eventName, properties = {} } = {}) => (
  typeof properties.dailyDefeatedText === 'string' && properties.dailyDefeatedText.length > 0
    ? properties.dailyDefeatedText
    : `${eventName || '训练家'}今天已挑战，明天再来。`
);

const getConfiguredBattleCompletionKey = (eventType) => {
  if (eventType === 'boss') return 'defeatedBossIds';
  if (eventType === 'challenge') return 'completedChallengeIds';
  if (eventType === 'trainer') return 'defeatedTrainerIds';
  return null;
};

const getDailyTrainerVictoryText = ({ eventName, mapName, world, eventId } = {}) => {
  const event = getMapEventById(mapName, eventId);
  const eventProps = getMapEventProperties(event);
  const eventRole = resolveConfiguredBattleRole(event?.type, eventProps);
  const scaledTeam = resolveDailyBattleTeamConfig(eventProps.team, {
    mapName,
    world,
    eventId,
    eventType: event?.type,
    role: eventRole,
    challengeRarePool: eventProps.challengeRarePool,
    dailyVariantSpeciesIds: eventProps.dailyVariantSpeciesIds,
    dailyVariantLevelJitter: eventProps.dailyVariantLevelJitter
  });
  const levels = getConfiguredBattleLevels(scaledTeam);
  const bounds = getTrainerDifficultyBounds({
    role: eventRole,
    mapConfig: getMapConfig(mapName),
    bossLevelCap: getMapBossLevelCap(mapName)
  });
  const isAtCap = levels.length > 0 && levels.every((level) => level >= bounds.maxLevel);
  const fallbackName = eventName || (event?.type === 'challenge' ? '区域试炼' : '训练家');
  if (event?.type === 'challenge') {
    return isAtCap
      ? `${fallbackName}已达本区试炼上限，明天会以当前强度再次开放。`
      : `${fallbackName}明天会更强。`;
  }
  return isAtCap
    ? `${fallbackName}已达本区训练家上限。`
    : `${fallbackName}明天会更强。`;
};

const buildConfiguredOpponentTeam = (teamConfig, eventId = 'map_event') => {
  if (!Array.isArray(teamConfig) || teamConfig.length === 0) return [];
  return teamConfig
    .map((entry, index) => {
      const pokemonId = Math.trunc(Number(entry?.pokemonId ?? entry?.id));
      const level = Math.max(1, Math.min(100, Math.trunc(Number(entry?.level)) || 1));
      const baseMonster = MONSTERS.find((monster) => monster.id === pokemonId);
      if (!baseMonster) return null;
      return createMonsterInstance(
        baseMonster,
        level,
        `${eventId}_${Date.now()}_${index}`
      );
    })
    .filter(Boolean);
};

const resolveConfiguredBattleRole = (eventType, properties = {}) => (
  normalizeTrainerRole(eventType === 'boss' ? 'boss' : (properties.role || eventType))
);

const buildFallbackOpponentTeam = ({
  role = 'normal',
  eventId = 'map_event',
  currentMapName = DEFAULT_WORLD_MAP_NAME,
  playerAverageLevel = 5,
  mapRecommendedLevel = 5,
  levelBonus = 0,
  levelCap = 100
} = {}) => {
  const roleBalance = getTrainerRoleBalance(role);
  const teamSize = Math.max(
    roleBalance.minTeamSize,
    Math.min(roleBalance.maxTeamSize, roleBalance.fallbackTeamSize)
  );
  const mapConfig = getMapConfig(currentMapName);
  const weightedSpecies = Array.isArray(mapConfig?.wildPokemon) ? mapConfig.wildPokemon : [];
  const speciesPool = weightedSpecies
    .map((entry) => MONSTERS.find((monster) => monster.id === Number(entry.id)))
    .filter(Boolean);
  const fallbackPool = speciesPool.length > 0 ? speciesPool : MONSTERS;
  const baseLevel = Math.max(
    1,
    Math.round(Number(playerAverageLevel) || 5),
    Math.round(Number(mapRecommendedLevel) || 5) - 2
  ) + roleBalance.levelOffset + Math.max(0, Math.trunc(Number(levelBonus)) || 0);

  return Array.from({ length: teamSize }, (_, index) => {
    const targetLevel = Math.max(1, Math.min(100, levelCap, baseLevel + Math.floor(index / 2)));
    const validPool = fallbackPool.filter((monster) => isLevelValidForSpecies(monster.id, targetLevel));
    const pool = validPool.length > 0 ? validPool : fallbackPool;
    const baseMonster = pool[(index * 3 + Math.floor(Math.random() * pool.length)) % pool.length];
    return createMonsterInstance(
      baseMonster,
      targetLevel,
      `${eventId}_${role}_${Date.now()}_${index}`
    );
  });
};

const applyBattleRewardGrowth = ({
  playerTeam,
  pendingGrowthEvents,
  participantIds,
  totalExp,
  getBaseMonsterDefinition
}) => {
  const uniqueParticipantIds = [...new Set((participantIds || []).filter(Boolean))];
  const baseTeam = Array.isArray(playerTeam) ? playerTeam : [];
  const basePendingGrowthEvents = Array.isArray(pendingGrowthEvents) ? pendingGrowthEvents : [];
  const safeTotalExp = Math.max(0, Math.trunc(Number(totalExp)));

  if (uniqueParticipantIds.length === 0 || safeTotalExp <= 0) {
    return {
      playerTeam: baseTeam,
      pendingGrowthEvents: basePendingGrowthEvents,
      splitExp: 0,
      levelUps: []
    };
  }

  const splitExp = Math.max(1, Math.round(safeTotalExp / uniqueParticipantIds.length));
  let nextTeam = baseTeam;
  const newEvents = [];
  const levelUps = [];

  uniqueParticipantIds.forEach((monId) => {
    const mon = nextTeam.find((candidate) => candidate.id === monId);
    if (!mon) return;

    const result = simulateMonsterExpGain(mon, splitExp, getBaseMonsterDefinition, [...basePendingGrowthEvents, ...newEvents]);
    nextTeam = nextTeam.map((candidate) => (
      candidate.id === monId ? result.updatedMon : candidate
    ));
    newEvents.push(...result.events);
    levelUps.push(...result.levelUps);
  });

  return {
    playerTeam: nextTeam,
    pendingGrowthEvents: [...basePendingGrowthEvents, ...newEvents],
    splitExp,
    levelUps
  };
};

const normalizeDefeatedRewardMons = (defeatedMons) => {
  const source = Array.isArray(defeatedMons) ? defeatedMons : [defeatedMons];
  const seenIds = new Set();
  return source.filter((mon) => {
    if (!mon) return false;
    const key = mon.id || `${mon.baseId || mon.name || 'monster'}:${mon.level || 1}`;
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  });
};

const calculateBattleRewardTotals = ({
  defeatedMons,
  playerAverageLevel,
  battleKind,
  participants,
  trainerRole
} = {}) => (
  normalizeDefeatedRewardMons(defeatedMons).reduce((totals, mon) => {
    const reward = calculateBattleRewards({
      defeatedMon: mon,
      playerAverageLevel,
      battleKind,
      participants,
      trainerRole
    });
    return {
      exp: totals.exp + (Number(reward.exp) || 0),
      gold: totals.gold + (Number(reward.gold) || 0)
    };
  }, { exp: 0, gold: 0 })
);

// --- Error Boundary ---
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    this.setState({ errorInfo });
    // Send error to parent frame for debugging
    window.parent.postMessage({
      type: 'spark-app-error',
      error: {
        message: error.toString(),
        stack: error.stack,
        componentStack: errorInfo.componentStack
      }
    }, '*');
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center p-4 bg-red-900/90 text-white font-mono">
          <div className="max-w-2xl bg-black/50 p-6 rounded-xl border border-red-500/30">
            <div className="flex items-center gap-3 mb-4 text-red-400">
              <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
              <h2 className="text-xl font-bold">Runtime Error</h2>
            </div>
            <div className="text-sm space-y-2">
              <p className="text-red-300 font-bold">{this.state.error?.toString()}</p>
              {this.state.error?.stack &&
              <pre className="text-xs text-slate-300 overflow-auto max-h-64 bg-black/30 p-3 rounded">
                  {this.state.error.stack}
                </pre>
              }
            </div>
          </div>
        </div>);

    }
    return this.props.children;
  }
}

// --- Components ---

const ProgressBar = ({ current, max, color = "bg-green-500" }) => {
  const percent = Math.max(0, Math.min(100, current / max * 100));
  let barColor = color;
  // 仅对生命条应用危险色预警逻辑
  if (color === "bg-green-500") {
    if (percent < 50) barColor = "bg-yellow-500";
    if (percent < 20) barColor = "bg-red-500";
  }

  return (
    <div className="w-full bg-gray-700 h-2 rounded-sm border border-gray-600 relative overflow-hidden">
            <div
        className={`h-full ${barColor} transition-all duration-500 ease-out`}
        style={{ width: `${percent}%` }}>
      </div>
            {/* Gloss effect */}
            <div className="absolute top-0 left-0 w-full h-0.5 bg-white opacity-20"></div>
        </div>);
};

/**
 * 经验值专用进度条 - 独立设计，纤细且具有科技纹理
 */
const ExpBar = ({ current, max }) => {
  const percent = Math.max(0, Math.min(100, (current / max) * 100));
  return (
    <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden border border-white/5 relative">
      <div
        className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-1000 ease-out relative"
        style={{ width: `${percent}%` }}>
        {/* 条纹装饰层 */}
        <div className="absolute inset-0 opacity-20 bg-[linear-gradient(45deg,rgba(255,255,255,0.4)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.4)_50%,rgba(255,255,255,0.4)_75%,transparent_75%,transparent)] bg-[length:8px_8px]"></div>
      </div>
    </div>
  );
};

const LevelUpCelebrationModal = ({ celebration, onClose }) => {
  if (!celebration) return null;

  const statChanges = Array.isArray(celebration.statChanges) ? celebration.statChanges : [];
  const levelGain = Math.max(1, Math.trunc(Number(celebration.levelGain) || 1));

  return (
    <div className="growth-modal-overlay" role="dialog" aria-modal="true">
      <div className="growth-levelup-card">
        <div className="growth-levelup-burst" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>
        <div className="growth-levelup-sprite">
          <img src={celebration.sprite || POKEMON_LOCAL_PLACEHOLDER} alt={celebration.name} onError={handlePokemonImageError} />
        </div>
        <p>LEVEL UP</p>
        <h2>{celebration.name} 升级了！</h2>
        <div className="growth-levelup-number">
          <span>Lv.{celebration.fromLevel}</span>
          <i aria-hidden="true">→</i>
          <b>Lv.{celebration.toLevel}</b>
        </div>
        {levelGain > 1 && (
          <div className="growth-levelup-note">连续提升 {levelGain} 级，属性成长已汇总展示。</div>
        )}
        {statChanges.length > 0 && (
          <div className="growth-levelup-stats" aria-label="升级属性变化">
            {statChanges.map((stat) => (
              <div key={stat.key} className="growth-levelup-stat">
                <span>{stat.label}</span>
                <b>{stat.before}</b>
                <i aria-hidden="true">→</i>
                <strong>{stat.after}</strong>
                <em>{stat.delta >= 0 ? `+${stat.delta}` : stat.delta}</em>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="game-primary-button" onClick={onClose}>
          继续
        </button>
      </div>
    </div>
  );
};

const EvolutionCeremonyModal = ({
  mon,
  targetBase = null,
  targetBases = [],
  event,
  onChoose,
}) => {
  const choiceTargets = Array.isArray(targetBases) ? targetBases.filter(Boolean) : [];
  const choiceTargetKey = choiceTargets.map((candidate) => candidate.id).join(',');
  const hasChoice = choiceTargets.length > 1;
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [phase, setPhase] = useState(hasChoice ? 'choice' : 'ready');
  const [isCommitting, setIsCommitting] = useState(false);
  const previewTarget = selectedChoice || (hasChoice ? null : targetBase || choiceTargets[0] || null);
  const targetName = previewTarget?.name || '新形态';

  const handleSelectChoice = useCallback((candidate) => {
    if (isCommitting || phase !== 'choice') return;
    setSelectedChoice(candidate);
    setPhase('transforming');
  }, [isCommitting, phase]);

  const handleStartEvolution = useCallback(() => {
    if (isCommitting || phase !== 'ready') return;
    setPhase('transforming');
  }, [isCommitting, phase]);

  const handleConfirmEvolution = useCallback(async () => {
    const targetId = previewTarget?.id || event?.targetId;
    if (isCommitting || !event || !targetId) return;
    setIsCommitting(true);
    const success = await onChoose(event.monId, targetId, event);
    if (!success) setIsCommitting(false);
  }, [event, isCommitting, onChoose, previewTarget?.id]);

  useEffect(() => {
    setSelectedChoice(null);
    setPhase(hasChoice ? 'choice' : 'ready');
    setIsCommitting(false);
  }, [choiceTargetKey, event?.monId, event?.targetId, hasChoice, targetBase?.id]);

  useEffect(() => {
    if (phase !== 'transforming') return undefined;
    const revealTimer = window.setTimeout(() => setPhase('revealed'), 3400);
    return () => window.clearTimeout(revealTimer);
  }, [phase]);

  if (!mon || !event || (!previewTarget && !hasChoice)) return null;

  const title = hasChoice && phase === 'choice'
    ? `选择 ${mon.name} 的进化方向`
    : phase === 'revealed'
    ? `恭喜！${mon.name} 进化成了 ${targetName}`
    : `咦？${mon.name} 的样子……`;
  const subtitle = hasChoice && phase === 'choice'
    ? '光芒回应了不同的可能性，选择它接下来同行的形态。'
    : phase === 'ready'
    ? '进化能量已经准备好，等待你的选择。'
    : phase === 'transforming'
    ? `${mon.name} 被耀眼的光芒包围了！`
    : isCommitting
    ? `${targetName} 带着全新的力量出现了，正在同步进度。`
    : `${targetName} 带着全新的力量出现了。`;

  return (
    <div
      className={`growth-modal-overlay growth-modal-overlay--evolution ${hasChoice ? 'growth-modal-overlay--evolution-choice' : ''}`}
      role="dialog"
      aria-modal="true"
    >
      <div className={`growth-evolution-card ${hasChoice ? 'growth-evolution-card--branch' : ''} growth-evolution-card--${phase}`}>
        <div className="growth-evolution-field" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span><span></span>
        </div>
        <div className="growth-evolution-header">
          <span>EVOLUTION</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        <div className="growth-evolution-stage growth-evolution-stage--official" aria-label={`${mon.name} 进化预览`}>
          <div className="growth-evolution-rings" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
          <div className="growth-evolution-beam-field" aria-hidden="true">
            <span></span><span></span><span></span><span></span>
          </div>
          <div className="growth-evolution-form growth-evolution-form--source">
            <div className="growth-evolution-orb">
              <img src={mon.sprite} alt={mon.name} onError={handlePokemonImageError} />
            </div>
            <b>{mon.name}</b>
          </div>
          {previewTarget && (
            <div className="growth-evolution-form growth-evolution-form--target">
              <div className="growth-evolution-orb">
                <img src={previewTarget.sprite} alt={previewTarget.name} onError={handlePokemonImageError} />
              </div>
              <b>{targetName}</b>
              {phase === 'revealed' && (
                <div className="growth-evolution-types">
                  {previewTarget.type2 && <TypeBadge type={previewTarget.type2} small />}
                  <TypeBadge type={previewTarget.type} small />
                </div>
              )}
            </div>
          )}
          {hasChoice && phase === 'choice' && (
            <div className="growth-evolution-form growth-evolution-form--mystery">
              <div className="growth-evolution-orb">
                <i className="fa-solid fa-question"></i>
              </div>
              <b>选择新形态</b>
            </div>
          )}
          <div className="growth-evolution-core" aria-hidden="true">
            <i></i>
            <span></span>
            <em></em>
          </div>
        </div>

        <div className="growth-evolution-timeline" aria-hidden="true">
          <span>能量聚集</span>
          <span>形态重塑</span>
          <span>新伙伴登场</span>
        </div>

        {hasChoice && phase === 'choice' ? (
          <div className="growth-evolution-choices">
            {choiceTargets.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="growth-evolution-choice-card"
                onClick={() => handleSelectChoice(candidate)}
              >
                <img src={candidate.sprite} alt={candidate.name} onError={handlePokemonImageError} />
                <span>{mon.name} 进化为</span>
                <b>{candidate.name}</b>
                <div className="growth-evolution-choice-types">
                  {candidate.type2 && <TypeBadge type={candidate.type2} small />}
                  <TypeBadge type={candidate.type} small />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={phase === 'ready' ? handleStartEvolution : handleConfirmEvolution}
            className="game-primary-button growth-evolution-action"
            disabled={phase === 'transforming' || isCommitting}
          >
            {phase === 'ready'
              ? `选择进化为 ${targetName}`
              : phase === 'transforming'
              ? '进化中...'
              : isCommitting
              ? '正在保存...'
              : `进化为 ${targetName}`}
          </button>
        )}
      </div>
    </div>
  );
};

const LearnMoveCeremonyModal = ({
  mon,
  moveKey,
  event,
  onLearn,
  onChooseForget,
}) => {
  if (!mon || !moveKey) return null;

  const newMove = MOVES[moveKey];
  const knownMoves = Array.isArray(mon.moves) ? mon.moves.filter((knownMoveKey) => MOVES[knownMoveKey]) : [];
  const hasOpenSlot = knownMoves.length < 4;
  const categoryLabel = MOVE_CATEGORY_LABELS[newMove?.category] || '招式';
  const movePowerDisplay = getMovePrimaryEffectDisplay(newMove);
  const moveCostLabel = Number(newMove?.cost) || 0;
  const eventLevel = Number.isInteger(Number(event?.level)) ? Number(event.level) : null;
  const [isCommitting, setIsCommitting] = useState(false);
  const [pendingForgetIndex, setPendingForgetIndex] = useState(null);
  const pendingForgetMoveKey = Number.isInteger(pendingForgetIndex) ? knownMoves[pendingForgetIndex] : null;
  const pendingForgetMove = pendingForgetMoveKey ? MOVES[pendingForgetMoveKey] : null;
  const pendingReplacementMoves = Number.isInteger(pendingForgetIndex)
    ? knownMoves.map((knownMoveKey, index) => (index === pendingForgetIndex ? moveKey : knownMoveKey))
    : knownMoves;
  const pendingReplacementKeepsZeroCostMove = hasZeroCostMove(pendingReplacementMoves);

  useEffect(() => {
    setIsCommitting(false);
    setPendingForgetIndex(null);
  }, [event?.monId, moveKey]);

  const commitChoice = async (action) => {
    if (isCommitting || !event?.monId) return;
    setIsCommitting(true);
    const success = await action?.();
    if (!success) setIsCommitting(false);
  };

  const handleLearn = () => {
    if (hasOpenSlot) {
      commitChoice(() => onLearn?.(event.monId, moveKey, event));
    }
  };

  const handleSkip = () => {
    commitChoice(() => onChooseForget?.(event.monId, moveKey, null, event));
  };

  const handleReplace = (index) => {
    const forgetMove = MOVES[knownMoves[index]];
    if (getMoveMpCost(forgetMove) === 0) {
      setPendingForgetIndex(index);
      return;
    }
    commitChoice(() => onChooseForget?.(event.monId, moveKey, index, event));
  };

  const handleConfirmReplaceZeroCostMove = () => {
    if (!Number.isInteger(pendingForgetIndex)) return;
    const index = pendingForgetIndex;
    setPendingForgetIndex(null);
    commitChoice(() => onChooseForget?.(event.monId, moveKey, index, event));
  };

  return (
    <div className="growth-modal-overlay growth-modal-overlay--learn" role="dialog" aria-modal="true">
      <div className="growth-learn-card">
        <div className="growth-learn-sparks" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>

        <div className="growth-learn-header">
          <span>NEW MOVE</span>
          <h2>{mon.name} 想学会新技能</h2>
          <p>{eventLevel ? `升级到 Lv.${eventLevel} 时领悟了新的战斗方式。` : '它领悟了新的战斗方式。'}</p>
        </div>

        <div className="growth-learn-move-card">
          <div className="growth-learn-move-card__icon" aria-hidden="true">
            <i className="fa-solid fa-wand-sparkles"></i>
          </div>
          <div className="growth-learn-move-card__main">
            <div className="growth-learn-move-card__title">
              <strong>{newMove?.name ?? moveKey}</strong>
              {newMove?.type && <TypeBadge type={newMove.type} small />}
            </div>
            <div className="growth-learn-move-card__meta">
              <span>{categoryLabel}</span>
              <span>{movePowerDisplay.label} {movePowerDisplay.value}</span>
              <span>MP {moveCostLabel}</span>
            </div>
          </div>
        </div>

        {hasOpenSlot ? (
          <div className="growth-learn-open-slot">
            <div className="growth-learn-open-slot__line">
              <span>技能栏</span>
              <b>{knownMoves.length}/4</b>
            </div>
            <p>还有空位，确认后会把这个技能加入队伍技能栏。</p>
            <button type="button" className="game-primary-button" onClick={handleLearn} disabled={isCommitting}>
              {isCommitting ? '正在保存...' : `学会 ${newMove?.name ?? moveKey}`}
            </button>
            <button
              type="button"
              className="growth-learn-secondary-action"
              onClick={handleSkip}
              disabled={isCommitting}
            >
              暂不学习
            </button>
          </div>
        ) : (
          <div className="growth-learn-forget">
            <p>技能已满，请选择要替换的技能：</p>
            <div className="growth-learn-forget-list">
              {knownMoves.map((knownMoveKey, index) => {
                const knownMove = MOVES[knownMoveKey];
                const knownPowerDisplay = getMovePrimaryEffectDisplay(knownMove);
                const knownCostLabel = getMoveMpCost(knownMove);
                const knownCategoryLabel = MOVE_CATEGORY_LABELS[knownMove?.category] || '招式';
                return (
                  <button
                    key={`${knownMoveKey}-${index}`}
                    type="button"
                    className={`growth-learn-forget-card ${getMoveMpCost(knownMove) === 0 ? 'growth-learn-forget-card--zero-cost' : ''}`}
                    onClick={() => handleReplace(index)}
                    disabled={isCommitting}
                  >
                    <span className="growth-learn-forget-card__action">忘记</span>
                    <div className="growth-learn-forget-card__top">
                      <strong>{knownMove?.name ?? knownMoveKey}</strong>
                      {knownMove?.type && <TypeBadge type={knownMove.type} small />}
                    </div>
                    <div className="growth-learn-forget-card__meta">
                      <em>{knownCategoryLabel}</em>
                      <em>{knownPowerDisplay.label} {knownPowerDisplay.value}</em>
                      <em>MP {knownCostLabel}</em>
                    </div>
                  </button>
                );
              })}
            </div>
            {pendingForgetMove && (
              <div className="growth-learn-zero-cost-warning" role="alert">
                <div className="growth-learn-zero-cost-warning__icon" aria-hidden="true">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                </div>
                <div className="growth-learn-zero-cost-warning__copy">
                  <strong>确认忘记 {pendingForgetMove.name}？</strong>
                  <p>
                    这是一个 MP 消耗为 0 的保底技能。
                    {pendingReplacementKeepsZeroCostMove
                      ? '替换后仍保留其他 0 MP 技能，但请确认这是你想要的选择。'
                      : '替换后队伍技能里可能没有 0 MP 技能，MP 不够时会无法攻击，需要用伤药恢复 MP。'}
                  </p>
                </div>
                <div className="growth-learn-zero-cost-warning__actions">
                  <button
                    type="button"
                    className="growth-learn-secondary-action"
                    onClick={() => setPendingForgetIndex(null)}
                    disabled={isCommitting}
                  >
                    再想想
                  </button>
                  <button
                    type="button"
                    className="game-primary-button"
                    onClick={handleConfirmReplaceZeroCostMove}
                    disabled={isCommitting}
                  >
                    {isCommitting ? '正在保存...' : '确认替换'}
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              className="growth-learn-secondary-action"
              onClick={handleSkip}
              disabled={isCommitting}
            >
              {isCommitting ? '正在保存...' : `放弃学习 ${newMove?.name ?? moveKey}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const PixelCard = ({ children, className = "", onClick, active = false }) =>
<div
  onClick={onClick}
  className={`
            game-card p-2 relative
            ${active ? 'game-card-active z-10' : ''}
            ${onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''}
            ${className}
        `}>

        <div className="h-full p-1 relative">
            {children}
        </div>
    </div>;

const HealingBurst = ({ amount = 0, compact = false }) => {
  const restoreParts = typeof amount === 'object' && amount !== null
    ? [
      Number(amount.hp) > 0 ? { key: 'hp', text: `+${amount.hp} HP` } : null,
      Number(amount.mp) > 0 ? { key: 'mp', text: `+${amount.mp} MP` } : null,
      amount.status ? { key: 'status', text: '异常解除' } : null,
    ].filter(Boolean)
    : [{ key: 'hp', text: `+${amount} HP` }];
  const hasMp = restoreParts.some((part) => part.key === 'mp');
  const sparkles = React.useMemo(() => (
    Array.from({ length: compact ? 6 : hasMp ? 10 : 7 }, (_, index) => ({
      left: `${18 + (index * 13) % 66}%`,
      top: `${24 + (index * 17) % 48}%`,
      delay: `${index * 70}ms`,
    }))
  ), [compact, hasMp]);

  return (
    <div className={`pokemon-heal-effect ${compact ? 'pokemon-heal-effect--compact' : ''} ${hasMp ? 'pokemon-heal-effect--hp-mp' : ''}`} aria-hidden="true">
      <span className="pokemon-heal-ring" />
      <span className="pokemon-heal-ring pokemon-heal-ring--delay" />
      {hasMp && <span className="pokemon-heal-ring pokemon-heal-ring--mp" />}
      {sparkles.map((sparkle, index) => (
        <span
          key={index}
          className={`pokemon-heal-spark ${hasMp && index % 2 === 1 ? 'pokemon-heal-spark--mp' : ''}`}
          style={{ left: sparkle.left, top: sparkle.top, animationDelay: sparkle.delay }}
        />
      ))}
      <span className="pokemon-heal-plus-stack">
        {restoreParts.map((part) => (
          <span key={part.key} className={`pokemon-heal-plus pokemon-heal-plus--${part.key}`}>
            {part.text}
          </span>
        ))}
      </span>
    </div>
  );
};

const ExpBurst = ({ amount = 0, levelUps = [], compact = false }) => {
  const motes = React.useMemo(() => (
    Array.from({ length: 10 }, (_, index) => ({
      left: `${14 + (index * 19) % 72}%`,
      top: `${18 + (index * 23) % 58}%`,
      delay: `${index * 55}ms`,
    }))
  ), []);
  const hasLevelUp = levelUps.length > 0;

  return (
    <div className={`pokemon-exp-effect ${compact ? 'pokemon-exp-effect--compact' : ''} ${hasLevelUp ? 'pokemon-exp-effect--levelup' : ''}`} aria-hidden="true">
      <span className="pokemon-exp-aura" />
      <span className="pokemon-exp-orbit pokemon-exp-orbit--outer" />
      {motes.map((mote, index) => (
        <span
          key={index}
          className="pokemon-exp-mote"
          style={{ left: mote.left, top: mote.top, animationDelay: mote.delay }}
        />
      ))}
      <span className="pokemon-exp-plus">+{amount} EXP</span>
      {hasLevelUp && <span className="pokemon-exp-levelup">LEVEL UP</span>}
    </div>
  );
};

const RewardCountUp = ({ value = 0, delay = 0 }) => {
  const target = Math.max(0, Math.round(Number(value) || 0));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let frameId = null;
    const timerId = setTimeout(() => {
      const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const tick = (now) => {
        const progress = Math.min(1, (now - startTime) / 720);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayValue(Math.round(target * eased));
        if (progress < 1 && typeof requestAnimationFrame === 'function') {
          frameId = requestAnimationFrame(tick);
        }
      };

      if (typeof requestAnimationFrame === 'function') {
        frameId = requestAnimationFrame(tick);
      } else {
        setDisplayValue(target);
      }
    }, delay);

    return () => {
      clearTimeout(timerId);
      if (frameId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameId);
    };
  }, [delay, target]);

  return <>{displayValue.toLocaleString('zh-CN')}</>;
};

const BattleMeter = ({ label, current, max, variant = 'hp', showValue = true }) => {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const percent = Math.max(0, Math.min(100, safeCurrent / safeMax * 100));
  const variantClass = {
    hp: 'battle-meter-fill-hp',
    mp: 'battle-meter-fill-mp',
    exp: 'battle-meter-fill-exp'
  }[variant] || 'battle-meter-fill-hp';
  const hpToneClass = variant === 'hp'
    ? percent <= 20
      ? 'battle-meter-fill-hp-critical'
      : percent <= 50
        ? 'battle-meter-fill-hp-warning'
        : 'battle-meter-fill-hp-healthy'
	    : '';

  return (
    <div className={`battle-meter-row battle-meter-row-${variant}`}>
      <div className="flex items-center justify-between gap-2 text-[10px] font-black uppercase text-white/70">
        <span>{label}</span>
        {showValue && <span className="text-white/90">{safeCurrent}/{safeMax}</span>}
      </div>
      <div className={`battle-meter-track battle-meter-track-${variant}`}>
        <div className={`battle-meter-fill ${variantClass} ${hpToneClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
};

const BattleHudCard = ({ mon, stats, hint, align = 'left', playerGold = null, showMp = true, showExp = false, className = '', partyBalls = null }) => {
  const expMax = Number.isFinite(mon.expToNextLevel) ? mon.expToNextLevel : 1;
  const layoutClass = className || (align === 'right' ? 'battle-hud-enemy' : 'battle-hud-player');
  const statusNotes = getBattleStatusNotes(mon);
  const hintMeta = hint || { text: '', className: '' };
  return (
    <div className={`battle-glass-card ${layoutClass}`}>
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-sm font-black leading-none text-white drop-shadow">{mon.name}</div>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {mon.type2 && <TypeBadge type={mon.type2} small />}
            <TypeBadge type={mon.type} small />
          </div>
        </div>
        <div className="shrink-0 rounded-full border border-yellow-200/60 bg-yellow-300/20 px-2 py-0.5 text-[11px] font-black text-yellow-100">
          Lv.{mon.level}
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        <BattleMeter label="HP" current={stats.currentHp} max={stats.maxHp} variant="hp" />
        {showMp && <BattleMeter label="MP" current={stats.currentMp} max={stats.maxMp} variant="mp" />}
        {showExp && <BattleMeter label="EXP" current={mon.currentExp || 0} max={expMax} variant="exp" />}
      </div>

      {statusNotes.length > 0 && (
        <div className="battle-status-note" aria-label={`${mon.name}的异常状态`}>
          <span className="battle-status-note__label">异常</span>
          {statusNotes.slice(0, 2).map((note) => (
            <span key={note.fullLabel} className="battle-status-note__item">
              <span className={`battle-status-badge battle-status-badge--tiny ${note.className}`}>{note.label}</span>
              <strong>{note.fullLabel}</strong>
              <em>{note.hint}</em>
            </span>
          ))}
        </div>
      )}

      <div className="battle-hud-footer">
        <span className={`battle-hud-hint ${hintMeta.className}`}>{hintMeta.text}</span>
        {partyBalls}
        {playerGold !== null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-300/20 px-1.5 py-0.5 text-[10px] font-black text-yellow-100">
            <i className="fa-solid fa-coins text-yellow-300"></i>
            {playerGold}
          </span>
        )}
      </div>
    </div>
  );
};

const BattleActionButton = ({ label, icon, variant, disabled, onClick, title = '', note = '', locked = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`battle-action-button battle-action-${variant} ${locked ? 'battle-action-button--locked' : ''}`}
  >
    <i className={`fa-solid ${icon}`}></i>
    <span className="battle-action-button__content">
      <span className="battle-action-button__label">{label}</span>
      {note ? <span className="battle-action-button__note">{note}</span> : null}
    </span>
  </button>
);

const MonsterSprite = ({ monster, isBack = false, animate = false, sizeMultiplier = 1, isBattleContext = false }) => {
  if (!monster) return null;
  const displayMonster = getBattleDisplayMonster(monster);
  const spriteUrl = isBack ? displayMonster.backSprite : displayMonster.sprite;
  const fallbackUrl = displayMonster.fallbackSprite || spriteUrl;
  const [resolvedSpriteUrl, setResolvedSpriteUrl] = useState(spriteUrl);

  useEffect(() => {
    setResolvedSpriteUrl(spriteUrl);
  }, [spriteUrl]);

  // 定义基础单位尺寸。
  // 战斗场景：基础约96-112px（根据反馈已显著增大）
  // 启动页：基础64px
  const baseImageUnit = isBattleContext ? BATTLE_SPRITE_IMAGE_BASE_UNIT : LAUNCH_SPRITE_IMAGE_BASE_UNIT;
  const baseContainerUnit = isBattleContext ? BATTLE_SPRITE_CONTAINER_BASE_UNIT : LAUNCH_SPRITE_CONTAINER_BASE_UNIT;

  // 使用内联样式而非动态类名，以确保任何倍数都能准确渲染像素
  const containerPx = baseContainerUnit * sizeMultiplier;
  const imagePx = baseImageUnit * sizeMultiplier;

  return (
    <div 
      className={`relative flex items-center justify-center ${animate ? 'animate-bounce' : ''}`}
      style={{ width: `${containerPx}px`, height: `${containerPx}px` }}
    >
      <img
        src={resolvedSpriteUrl}
        alt={displayMonster.name}
        className="object-contain transition-transform duration-300"
        onError={() => {
          if (resolvedSpriteUrl !== fallbackUrl) setResolvedSpriteUrl(fallbackUrl);
        }}
        style={{ 
          width: `${imagePx}px`, 
          height: `${imagePx}px`, 
          imageRendering: 'auto',
          transform: isBack ? 'scaleX(-1)' : 'none'
        }} 
      />
      {/* 底部投影 */}
      <div 
        className="absolute bottom-2 h-3 bg-black/30 rounded-full blur-sm"
        style={{ width: `${imagePx * 0.8}px` }}
      ></div>
    </div>
  );
};

const CaptureSequenceOverlay = ({ show, data, onComplete, paused = false }) => {
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!show || !data || paused) return undefined;

    setFinishing(false);
    const finishDelay = data.success ? 5100 : 4700;
    const completeDelay = data.success ? 6200 : 5600;
    const finishTimer = setTimeout(() => setFinishing(true), finishDelay);
    const completeTimer = setTimeout(() => onComplete?.(data), completeDelay);

    return () => {
      clearTimeout(finishTimer);
      clearTimeout(completeTimer);
    };
  }, [show, data, onComplete, paused]);

  if (!show || !data) return null;

  const success = Boolean(data.success);
  const resultTitle = success ? '捕捉成功！' : '差一点！';
  const resultText = success
    ? `${data.pokemonName} 捕捉成功，正在安置`
    : `${data.pokemonName} 挣脱了精灵球`;

  return (
    <div
      className={`capture-sequence-overlay ${success ? 'capture-success-mode' : 'capture-fail-mode'} ${finishing ? 'capture-finishing' : ''}`}
      aria-live="assertive"
    >
      <div className="capture-speed-lines" />
      <div className="capture-stage-glow" />
      <div className="capture-throw-arc" />

      <div className="capture-target-wrap">
        <div className="capture-target-ring" />
        <img
          src={data.pokemonSprite}
          alt={data.pokemonName}
          className="capture-target-sprite"
          onError={handlePokemonImageError}
        />
        <div className="capture-target-name">
          <span>{data.pokemonName}</span>
          {data.pokemonLevel ? <small>Lv.{data.pokemonLevel}</small> : null}
        </div>
      </div>

      <div className="capture-energy-beam">
        <span />
        <span />
        <span />
      </div>

      <div className="capture-ball-stage">
        <div className="capture-ball-shadow" />
        <img
          src={data.ballSprite || POKEBALLS.pokeball_basic.sprite}
          alt={data.ballName || '精灵球'}
          className="capture-ball-image"
          onError={handleItemImageError}
        />
        <div className="capture-ball-flash" />
      </div>

      <div className="capture-tension-panel">
        <div className="capture-tension-title">{data.ballName || '精灵球'}正在摇晃...</div>
        <div className="capture-tension-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="capture-result-card">
        <div className="capture-result-kicker">捕捉结果</div>
        <div className="capture-result-title">{resultTitle}</div>
        <div className="capture-result-text">{resultText}</div>
      </div>
    </div>
  );
};

// Monsters to display on the launch screen carousel
const BALANCED_MONSTERS = [
{
  id: 1, pokedexId: 1, name: '妙蛙种子', type: 'grass',
  sprite: '/assets/pokemon/official-artwork/1.png', backSprite: '/assets/pokemon/official-artwork/1.png', fallbackSprite: POKEMON_LOCAL_PLACEHOLDER,
  stats: { hp: 45, attack: 49, defense: 49, sp_attack: 65, sp_defense: 65, speed: 45 },
  moves: ['tackle', 'vinewhip', 'razorleaf', 'poison_jab']
},
{
  id: 4, pokedexId: 4, name: '小火龙', type: 'fire',
  sprite: '/assets/pokemon/official-artwork/4.png', backSprite: '/assets/pokemon/official-artwork/4.png', fallbackSprite: POKEMON_LOCAL_PLACEHOLDER,
  stats: { hp: 39, attack: 52, defense: 43, sp_attack: 60, sp_defense: 50, speed: 65 },
  moves: ['scratch', 'ember', 'flamethrower', 'dragonclaw']
},
{
  id: 7, pokedexId: 7, name: '杰尼龟', type: 'water',
  sprite: '/assets/pokemon/official-artwork/7.png', backSprite: '/assets/pokemon/official-artwork/7.png', fallbackSprite: POKEMON_LOCAL_PLACEHOLDER,
  stats: { hp: 44, attack: 48, defense: 65, sp_attack: 50, sp_defense: 64, speed: 43 },
  moves: ['tackle', 'watergun', 'bite', 'icebeam']
},
{
  id: 59, pokedexId: 59, name: '风速狗', type: 'fire',
  sprite: '/assets/pokemon/official-artwork/59.png', backSprite: '/assets/pokemon/official-artwork/59.png', fallbackSprite: POKEMON_LOCAL_PLACEHOLDER,
  stats: { hp: 90, attack: 110, defense: 80, sp_attack: 100, sp_defense: 80, speed: 95 },
  moves: ['bite', 'flamethrower', 'extremespeed', 'fire_blast']
},
{
  id: 131, pokedexId: 131, name: '拉普拉斯', type: 'water',
  sprite: '/assets/pokemon/official-artwork/131.png', backSprite: '/assets/pokemon/official-artwork/131.png', fallbackSprite: POKEMON_LOCAL_PLACEHOLDER,
  stats: { hp: 130, attack: 85, defense: 80, sp_attack: 85, sp_defense: 95, speed: 60 },
  moves: ['watergun', 'icebeam', 'surf', 'bodyslam']
},
{
  id: 94, pokedexId: 94, name: '耿鬼', type: 'ghost',
  sprite: '/assets/pokemon/official-artwork/94.png', backSprite: '/assets/pokemon/official-artwork/94.png', fallbackSprite: POKEMON_LOCAL_PLACEHOLDER,
  stats: { hp: 60, attack: 65, defense: 60, sp_attack: 130, sp_defense: 75, speed: 110 },
  moves: ['lick', 'shadowball', 'hypnosis', 'dream_eater']
},
{
  id: 65, pokedexId: 65, name: '胡地', type: 'psychic',
  sprite: '/assets/pokemon/official-artwork/65.png', backSprite: '/assets/pokemon/official-artwork/65.png', fallbackSprite: POKEMON_LOCAL_PLACEHOLDER,
  stats: { hp: 55, attack: 50, defense: 45, sp_attack: 135, sp_defense: 95, speed: 120 },
  moves: ['psychic', 'shadowball', 'hypnosis', 'dream_eater']
},
{
  id: 149, pokedexId: 149, name: '快龙', type: 'dragon',
  sprite: '/assets/pokemon/official-artwork/149.png', backSprite: '/assets/pokemon/official-artwork/149.png', fallbackSprite: POKEMON_LOCAL_PLACEHOLDER,
  stats: { hp: 91, attack: 134, defense: 95, sp_attack: 100, sp_defense: 100, speed: 80 },
  moves: ['dragonclaw', 'wing_attack', 'thunderbolt', 'hurricane']
}];

for (let i = 0; i < BALANCED_MONSTERS.length; i += 1) {
  BALANCED_MONSTERS[i] = applyHighResPokemonSprites(BALANCED_MONSTERS[i]);
}

const LAUNCH_SCREEN_MONSTERS = [
MONSTERS.find((m) => m.name === '小火龙'),
MONSTERS.find((m) => m.name === '妙蛙种子'),
MONSTERS.find((m) => m.name === '杰尼龟'),
MONSTERS.find((m) => m.name === '皮卡丘'),
MONSTERS.find((m) => m.name === '伊布')].
filter(Boolean);

const STARTER_STORY_META = {
  小火龙: {
    role: '热血进攻',
    trait: '火焰会回应勇敢的决定，适合喜欢主动出击的冒险者。',
    promise: '后期成长为强力火系伙伴',
    voiceLine: '尾焰明亮，战斗节奏直接有力。',
    mapHint: '适合喜欢主动推进、快速结束战斗的玩家。',
    earlyRouteHint: '建议先在阳光草坡热身，再去湖北浅滩补经验，最后压进南边密林。',
    motionClass: 'launch-partner-motion--ember',
    color: '#f97316',
    icon: 'fa-fire',
  },
  妙蛙种子: {
    role: '稳定成长',
    trait: '草与阳光会慢慢积蓄力量，适合喜欢稳扎稳打的冒险者。',
    promise: '回复与控制能力更均衡',
    voiceLine: '背上的种子泛起柔和绿光，适合稳步探索。',
    mapHint: '适合耐心培养、先稳住节奏再逐步推进的玩家。',
    earlyRouteHint: '建议先在阳光草坡练到更稳，再去湖北浅滩，最后再挑战南边密林。',
    motionClass: 'launch-partner-motion--leaf',
    color: '#16a34a',
    icon: 'fa-seedling',
  },
  杰尼龟: {
    role: '守护防线',
    trait: '小小龟壳能挡住很多危险，适合喜欢安全探索的冒险者。',
    promise: '防御可靠，水系招式稳定',
    voiceLine: '龟壳可靠，适合在未知区域稳住节奏。',
    mapHint: '适合喜欢防守稳定、一步一步完成挑战的玩家。',
    earlyRouteHint: '建议先过阳光草坡，再去花丘草地补一轮，最后再进南边密林。',
    motionClass: 'launch-partner-motion--water',
    color: '#2563eb',
    icon: 'fa-droplet',
  },
  皮卡丘: {
    role: '高速电击',
    trait: '电光很快，反应也很快，适合喜欢灵活节奏的冒险者。',
    promise: '速度快，电系打击感强',
    voiceLine: '电光一闪，它已经跑到你的脚边。',
    mapHint: '适合反应快、喜欢灵活节奏的玩家。',
    earlyRouteHint: '建议先在阳光草坡起手，再看状态去花丘或湖边继续推进。',
    motionClass: 'launch-partner-motion--spark',
    color: '#eab308',
    icon: 'fa-bolt',
  },
  伊布: {
    role: '无限可能',
    trait: '伊布会随着陪伴改变未来，适合想长期培养专属伙伴的冒险者。',
    promise: '路线灵活，适合收藏成长',
    voiceLine: '它歪头看着你，像在等待一个共同决定的未来。',
    mapHint: '适合想长期陪伴、慢慢找到专属路线的玩家。',
    earlyRouteHint: '建议先在阳光草坡稳住，再根据状态去花丘或湖北浅滩继续练级。',
    motionClass: 'launch-partner-motion--star',
    color: '#a16207',
    icon: 'fa-star',
  },
};

const LAUNCH_STARTER_SUPPLY_ITEMS = [
  { icon: POKEBALLS.pokeball_basic.sprite, name: '精灵球', qty: 5, text: '用于第一次捕捉' },
  { icon: POKEBALLS.pokeball_great.sprite, name: '超级球', qty: 3, text: '更稳定的捕捉机会' },
  { icon: POKEBALLS.pokeball_ultra.sprite, name: '高级球', qty: 1, text: '留给更稀有的伙伴' },
  { icon: POTIONS.potion.sprite, name: '伤药', qty: 5, text: getPotionEffectText(POTIONS.potion) },
  { icon: POTIONS.super_potion.sprite, name: '好伤药', qty: 3, text: getPotionEffectText(POTIONS.super_potion) },
  { icon: POTIONS.hyper_potion.sprite, name: '厉害伤药', qty: 1, text: getPotionEffectText(POTIONS.hyper_potion) },
  { fa: 'fa-bolt', name: '战斗能量', qty: DEFAULT_STARTING_ENERGY, text: '每场战斗消耗 1 点' },
];

const getStarterBaseStats = (monster = {}) => ({
  hp: Math.max(0, Number(monster.maxHp ?? monster.stats?.hp ?? 0) || 0),
  attack: Math.max(0, Number(monster.atk ?? monster.stats?.attack ?? 0) || 0),
  defense: Math.max(0, Number(monster.def ?? monster.stats?.defense ?? 0) || 0),
  spAttack: Math.max(0, Number(monster.spAtk ?? monster.stats?.sp_attack ?? monster.stats?.spAtk ?? 0) || 0),
  spDefense: Math.max(0, Number(monster.spDef ?? monster.stats?.sp_defense ?? monster.stats?.spDef ?? 0) || 0),
  speed: Math.max(0, Number(monster.spd ?? monster.stats?.speed ?? 0) || 0),
});

const getStarterSimpleStats = (monster = {}) => {
  const stats = getStarterBaseStats(monster);
  return {
    life: stats.hp,
    attack: Math.round((stats.attack + stats.spAttack) / 2),
    defense: Math.round((stats.defense + stats.spDefense) / 2),
    speed: stats.speed,
  };
};

// --- LaunchScreen component ---
const LaunchScreen = ({ onStartGame, user, transition = null, children = null }) => {
  const [selectedMonster, setSelectedMonster] = useState(() => LAUNCH_SCREEN_MONSTERS[0] || null);
  const [isStarting, setIsStarting] = useState(false);
  const displayName = user?.nickname || user?.username || '新晋冒险者';
  const selectedMeta = STARTER_STORY_META[selectedMonster?.name] || {
    role: '可靠伙伴',
    trait: '它会陪你完成第一次探索。',
    promise: '适合新手冒险',
    voiceLine: '它正在认真听你做决定。',
    mapHint: '适合第一次探索。',
    motionClass: 'launch-partner-motion--star',
    color: '#0ea5e9',
    icon: 'fa-star',
  };

  const starterTypes = [selectedMonster?.type, selectedMonster?.type2].filter(Boolean);
  const starterStats = getStarterSimpleStats(selectedMonster);
  const traitRows = [
    { label: '生命', value: starterStats.life, color: '#22c55e', max: 160, icon: 'fa-heart-pulse' },
    { label: '攻击', value: starterStats.attack, color: '#f97316', max: 135, icon: 'fa-hand-fist' },
    { label: '防御', value: starterStats.defense, color: '#14b8a6', max: 135, icon: 'fa-shield-halved' },
    { label: '速度', value: starterStats.speed, color: '#eab308', max: 135, icon: 'fa-wind' },
  ];

  const handleStart = async () => {
    if (!selectedMonster || isStarting) return;
    gameAudio.prime();
    gameAudio.playUiConfirm();
    setIsStarting(true);
    try {
      const started = await onStartGame(selectedMonster);
      if (!started) setIsStarting(false);
    } catch {
      setIsStarting(false);
    }
  };

  return (
    <div className="launch-adventure game-app-bg">
      <div className="launch-adventure__sky" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <main className="launch-console" aria-live="polite" style={{ '--starter-color': selectedMeta.color }}>
        <section className="launch-stage">
          {selectedMonster && (
            <div className="launch-partner-layout" style={{ '--starter-color': selectedMeta.color }}>
              <header className="launch-header">
                <div>
                  <span className="launch-kicker">
                    <span className="launch-kicker-dot" aria-hidden="true" />
                    初始伙伴
                  </span>
                  <h1>{displayName}，选择同行伙伴</h1>
                </div>
                <div className="launch-status-pill" aria-label="初始等级">
                  <i className="fa-solid fa-star" aria-hidden="true"></i>
                  <span>Lv.5</span>
                </div>
              </header>

              <div className={`launch-monster-stage ${selectedMeta.motionClass || ''}`}>
                <div className="launch-monster-sprite-wrap">
                  <div className="launch-monster-halo" />
                  <MonsterSprite monster={selectedMonster} sizeMultiplier={2.55} />
                </div>
                <div className="launch-monster-name">
                  <span>{selectedMeta.role}</span>
                  <div className="launch-monster-name-row">
                    <strong>{selectedMonster.name}</strong>
                    <div className="launch-element-badges" aria-label="属性">
                      {starterTypes.map((typeName) => <TypeBadge key={typeName} type={typeName} />)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="launch-starter-orbs" aria-label="初始伙伴">
                {LAUNCH_SCREEN_MONSTERS.map((monster) => {
                  const meta = STARTER_STORY_META[monster.name] || selectedMeta;
                  const active = selectedMonster.id === monster.id;
                  return (
                    <button
                      key={monster.id}
                      type="button"
                      className={`launch-starter-orb ${active ? 'launch-starter-orb--active' : ''}`}
                      style={{ '--starter-color': meta.color }}
                      onClick={() => {
                        gameAudio.prime();
                        gameAudio.playUiSelect();
                        setSelectedMonster(monster);
                      }}
                      disabled={isStarting}
                      aria-pressed={active}
                    >
                      <img src={monster.sprite} alt={monster.name} onError={handlePokemonImageError} />
                      <span>{monster.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="launch-starter-details">
                {traitRows.map((row) => (
                  <div key={row.label} className="launch-trait-bar" style={{ '--trait-color': row.color }}>
                    <div className="launch-trait-bar__head">
                      <span>
                        <i className={`fa-solid ${row.icon}`} aria-hidden="true"></i>
                        {row.label}
                      </span>
                      <b>{Math.trunc(row.value)}</b>
                    </div>
                    <div className="launch-trait-bar__track">
                      <i style={{ width: `${Math.min(100, Math.max(8, ((Number(row.value) || 0) / row.max) * 100))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="launch-actions">
          <div className="launch-supply-inline" aria-label="初始补给">
            {LAUNCH_STARTER_SUPPLY_ITEMS.slice(0, 6).map((item) => (
              <span key={item.name}>
                {item.icon ? <img src={item.icon} alt="" onError={handleItemImageError} /> : <i className={`fa-solid ${item.fa}`}></i>}
                {item.name} x{item.qty}
              </span>
            ))}
          </div>
          <button type="button" className="game-primary-button launch-next-button" onClick={handleStart} disabled={isStarting}>
            {isStarting ? '正在同步云端...' : `和${selectedMonster?.name || '伙伴'}出发`}
          </button>
        </div>
        <LaunchDepartureOverlay transition={transition} />
        {children}
      </main>
    </div>
  );
};

const LaunchDepartureOverlay = ({ transition }) => {
  if (!transition?.monster) return null;

  const { monster, stage = 'departing', color = '#f97316' } = transition;
  const partnerName = monster.name || '伙伴';
  const isArriving = stage === 'arriving';

  return (
    <div
      className={`launch-departure-overlay launch-departure-overlay--${stage}`}
      style={{ '--starter-color': color }}
      aria-live="polite"
      aria-label={`${partnerName}来到你身边`}
    >
      <div className="launch-departure-vignette" aria-hidden="true" />
      <div className="launch-departure-road" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="launch-departure-cue" aria-hidden="true">
        <i className="fa-solid fa-location-dot"></i>
      </div>
      <div className="launch-departure-target" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="launch-departure-partner">
        <div className="launch-departure-aura" aria-hidden="true" />
        <img src={monster.sprite} alt={partnerName} onError={handlePokemonImageError} />
      </div>
      <div className="launch-departure-copy">
        <strong>{isArriving ? `${partnerName} 来到你身边` : `${partnerName} 准备出发`}</strong>
        <p>{isArriving ? '一起去冒险吧' : '地图亮起来了'}</p>
      </div>
      <div className="launch-departure-sparkles" aria-hidden="true">
        <i></i><i></i><i></i><i></i>
      </div>
    </div>
  );
};

const AttackEffect = ({ effect, onDone }) => {
  if (!effect) return null;

  const move = effect.move || (effect.moveKey ? MOVES[effect.moveKey] : null);
  const moveConfig = getMoveEffectConfig(effect.moveKey, move || effect);
  const isSecondaryResult = effect.phase === 'secondary';
  const visual = isSecondaryResult ? 'secondary-result' : (moveConfig.visual || 'impact');
  const moveClass = String(isSecondaryResult ? 'secondary-result' : (effect.moveKey || 'unknown')).replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  const visualVariant = String(moveConfig.variant || 'physical').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  const hitReactionClass = String(moveConfig.hitReaction || 'bump').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  const semanticTags = Array.isArray(moveConfig.semanticTags)
    ? moveConfig.semanticTags
      .map((tag) => String(tag || '').replace(/[^a-z0-9_-]/gi, '-').toLowerCase())
      .filter(Boolean)
    : [];
  const semanticTagClasses = semanticTags.map((tag) => `battle-move-effect--tag-${tag}`).join(' ');
  const iconClass = String(moveConfig.icon || 'fa-solid fa-star');
  const accent = moveConfig.accent || '#ffffff';
  const core = moveConfig.core || '#64748b';
  const glow = moveConfig.glow || 'rgba(255,255,255,0.7)';
  const actorSide = effect.attackerSide === 'enemy' ? 'enemy' : 'player';
  const targetSide = effect.target === 'player' ? 'player' : 'enemy';
  const anchors = {
    enemy: { x: '74%', y: '31%' },
    player: { x: '25%', y: '69%' }
  };
  const source = anchors[actorSide];
  const target = anchors[targetSide];
  const targetMode = moveConfig.target === 'self' ? 'self' : 'foe';
  const particleCount = Math.max(6, Math.min(18, Number(moveConfig.particleCount) || (visual === 'blizzard' || visual === 'hurricane' || visual === 'rock-slide' || visual === 'fire-blast' ? 14 : 10)));
  const shardCount = Math.max(6, Math.min(16, Number(moveConfig.shardCount) || (visual === 'rock-slide' || visual === 'blizzard' || visual === 'quake' ? 12 : 8)));
  const effectDuration = Math.max(520, Number(effect.durationMs) || getBattleMovePhaseDuration(effect.phase));
  const effectScale = Math.max(0.72, Math.min(1.28, Number(moveConfig.scale) || 1));

  return (
    <div
      key={effect.id}
      className={`battle-move-effect battle-move-effect--${visual} battle-move-effect--move-${moveClass} battle-move-effect--variant-${visualVariant} battle-move-effect--reaction-${hitReactionClass} ${semanticTagClasses} battle-move-effect--type-${move?.type || effect.type || 'normal'} battle-move-effect--from-${actorSide} battle-move-effect--to-${targetSide} battle-move-effect--target-${targetMode} battle-move-effect--phase-${effect.phase || 'hit'}`}
      style={{
        '--move-accent': accent,
        '--move-core': core,
        '--move-glow': glow,
        '--move-effect-duration': `${effectDuration}ms`,
        '--effect-source-x': source.x,
        '--effect-source-y': source.y,
        '--effect-target-x': target.x,
        '--effect-target-y': target.y,
        '--move-effect-scale': effectScale,
      }}
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.currentTarget === event.target) onDone?.();
      }}
    >
      <div className="battle-move-effect__projectile">
        <div className="battle-vfx-projectile-tail" />
        <div className="battle-vfx-projectile-core" />
        <div className="battle-vfx-projectile-spark" />
      </div>
      <div className="battle-move-effect__target">
        <div className="battle-vfx-ring" />
        <div className="battle-vfx-burst" />
        <div className="battle-vfx-symbol" />
        <i className={`battle-vfx-icon ${iconClass}`} />
        <div className="battle-vfx-beam" />
        <div className="battle-vfx-shock" />
        <div className="battle-vfx-slashes">
          {Array.from({ length: 4 }, (_, index) => <span key={index} style={{ '--i': index }} />)}
        </div>
        <div className="battle-vfx-shards">
          {Array.from({ length: shardCount }, (_, index) => <span key={index} style={{ '--i': index }} />)}
        </div>
        <div className="battle-vfx-waves">
          {Array.from({ length: 4 }, (_, index) => <span key={index} style={{ '--i': index }} />)}
        </div>
        <div className="battle-vfx-particles">
          {Array.from({ length: particleCount }, (_, index) => <span key={index} style={{ '--i': index }} />)}
        </div>
      </div>
    </div>);

};

/**
 * Generates a maze with a single exit using an iterative randomized DFS algorithm.
 * @param {number} width - The width of the maze.
 * @param {number} height - The height of the maze.
 * @returns {Array<Array<number>>} A 2D array representing the maze (0=path, 1=wall, 2=exit).
 */

const PLAYER_SPRITE_URL = getHighResPokemonSpriteSet(132)?.sprite || POKEMON_LOCAL_PLACEHOLDER; // 默认使用百变怪作为替身

// 加载真实的宝可梦地图
const loadPokemonMap = (mapName) => {
  if (!hasAdventureMap(mapName)) {
    console.error(`地图 ${mapName} 不存在`);
    return loadAdventureMapGrid(DEFAULT_WORLD_MAP_NAME);
  }

  return applyMapEventsToGrid(mapName, loadAdventureMapGrid(mapName));
};

const cloneMapGrid = (grid) => (
  Array.isArray(grid)
    ? grid.map((row) => (Array.isArray(row) ? [...row] : row))
    : []
);

const areMapGridsEqual = (left, right) => {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  for (let rowIndex = 0; rowIndex < left.length; rowIndex += 1) {
    const leftRow = left[rowIndex];
    const rightRow = right[rowIndex];
    if (leftRow === rightRow) continue;
    if (!Array.isArray(leftRow) || !Array.isArray(rightRow) || leftRow.length !== rightRow.length) return false;
    for (let colIndex = 0; colIndex < leftRow.length; colIndex += 1) {
      if (leftRow[colIndex] !== rightRow[colIndex]) return false;
    }
  }
  return true;
};

const arePrimitiveArraysEqual = (left, right) => {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
};

const areWorldPositionsEqual = (left, right) => (
  left === right ||
  (
    left &&
    right &&
    Number(left.x) === Number(right.x) &&
    Number(left.y) === Number(right.y) &&
    String(left.direction || '') === String(right.direction || '')
  )
);

const PERSISTENT_MAP_EVENT_TYPES = new Set([
  'warp',
  'fast_travel',
  'heal',
  'sign',
  'info',
  'trainer',
  'boss',
  'challenge'
]);

const PERSISTENT_MAP_EVENT_TILES = new Set(
  Array.from(PERSISTENT_MAP_EVENT_TYPES)
    .map((type) => getMapEventTile(type))
    .filter((tile) => Number.isSafeInteger(tile))
);
const PERSISTABLE_ADVENTURE_CLEAR_TILES = new Set([9]);

const ensurePersistentMapEventsInGrid = (mapName, sourceGrid) => {
  const grid = cloneMapGrid(sourceGrid);
  if (!hasAdventureMap(mapName) || grid.length === 0) return grid;

  const baseGrid = loadAdventureMapGrid(mapName);
  const mapInfo = getAdventureMapInfo(mapName);
  const expectedPersistentTileKeys = new Map();
  const addExpectedPersistentTile = (tile, x, y) => {
    if (!Number.isSafeInteger(tile) || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return;
    if (!expectedPersistentTileKeys.has(tile)) expectedPersistentTileKeys.set(tile, new Set());
    expectedPersistentTileKeys.get(tile).add(`${x},${y}`);
  };

  Object.keys(mapInfo?.signs || {}).forEach((coordinate) => {
    const [x, y] = coordinate.split(',').map((value) => Math.trunc(Number(value)));
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return;
    addExpectedPersistentTile(getMapEventTile('sign'), x, y);
  });

  getMapEvents(mapName).forEach((event) => {
    if (!PERSISTENT_MAP_EVENT_TYPES.has(event?.type)) return;
    const tile = getMapEventTile(event.type);
    const x = Math.trunc(Number(event.position?.x));
    const y = Math.trunc(Number(event.position?.y));
    addExpectedPersistentTile(tile, x, y);
  });

  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y];
    if (!Array.isArray(row)) continue;
    for (let x = 0; x < row.length; x += 1) {
      const tile = row[x];
      if (!PERSISTENT_MAP_EVENT_TILES.has(tile)) continue;
      if (expectedPersistentTileKeys.get(tile)?.has(`${x},${y}`)) continue;
      const baseTile = baseGrid[y]?.[x];
      row[x] = baseTile === undefined ? 0 : baseTile;
    }
  }

  Object.keys(mapInfo?.signs || {}).forEach((coordinate) => {
    const [x, y] = coordinate.split(',').map((value) => Math.trunc(Number(value)));
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return;
    if (grid[y]?.[x] === undefined) return;

    const baseTile = baseGrid[y]?.[x];
    if (baseTile === 1 || baseTile === 11 || baseTile === undefined) return;
    grid[y][x] = getMapEventTile('sign');
  });

  getMapEvents(mapName).forEach((event) => {
    if (!PERSISTENT_MAP_EVENT_TYPES.has(event?.type)) return;
    const tile = getMapEventTile(event.type);
    if (!tile) return;

    const x = Math.trunc(Number(event.position?.x));
    const y = Math.trunc(Number(event.position?.y));
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return;
    if (grid[y]?.[x] === undefined) return;

    const baseTile = baseGrid[y]?.[x];
    if (baseTile === 1 || baseTile === 11 || baseTile === undefined) return;
    grid[y][x] = tile;
  });

  return grid;
};

const syncConsumableMapEventsInGrid = (mapName, sourceGrid, world) => {
  const grid = ensurePersistentMapEventsInGrid(mapName, sourceGrid);
  if (!hasAdventureMap(mapName) || grid.length === 0) return grid;

  const baseGrid = loadAdventureMapGrid(mapName);
  const usesDynamicConsumableVisibility = getAdventureMapInfo(mapName)?.renderMode === 'three-lowpoly';
  getMapEvents(mapName).forEach((event) => {
    if (!event || !['item', 'pickup'].includes(event.type)) return;
    const tile = getMapEventTile(event.type);
    if (!tile) return;

    const x = Math.trunc(Number(event.position?.x));
    const y = Math.trunc(Number(event.position?.y));
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return;
    if (grid[y]?.[x] === undefined) return;

    const baseTile = baseGrid[y]?.[x];
    if (baseTile === undefined || baseTile === 1 || baseTile === 11) return;

    if (usesDynamicConsumableVisibility) {
      grid[y][x] = baseTile;
      return;
    }

    if (hasWorldEventId(world, 'collectedEventIds', event.id)) {
      grid[y][x] = baseTile;
      return;
    }

    grid[y][x] = tile;
  });

  return grid;
};

const buildAuthoritativeAdventureMapGrid = (mapName, sourceGrid = null) => {
  const authoritativeGrid = loadPokemonMap(mapName);
  if (!Array.isArray(sourceGrid) || sourceGrid.length === 0) {
    return authoritativeGrid;
  }

  const nextGrid = cloneMapGrid(authoritativeGrid);
  for (let y = 0; y < nextGrid.length; y += 1) {
    const nextRow = nextGrid[y];
    const sourceRow = sourceGrid[y];
    if (!Array.isArray(nextRow) || !Array.isArray(sourceRow)) continue;

    for (let x = 0; x < nextRow.length; x += 1) {
      const authoritativeTile = nextRow[x];
      const sourceTile = sourceRow[x];
      if (!PERSISTABLE_ADVENTURE_CLEAR_TILES.has(authoritativeTile)) continue;
      if (!Number.isSafeInteger(sourceTile) || sourceTile === authoritativeTile) continue;
      nextRow[x] = sourceTile;
    }
  }

  return nextGrid;
};

const buildMapGridForWorld = (mapName, world, sourceGrid = null) => {
  const safeMapName = hasAdventureMap(mapName) ? mapName : DEFAULT_WORLD_MAP_NAME;
  const usesAuthoritativeAdventureGrid = getAdventureMapInfo(safeMapName)?.renderMode === 'three-lowpoly';
  const baseGrid = usesAuthoritativeAdventureGrid
    ? buildAuthoritativeAdventureMapGrid(safeMapName, sourceGrid)
    : (
      Array.isArray(sourceGrid) && sourceGrid.length > 0
        ? sourceGrid
        : loadPokemonMap(safeMapName)
    );
  return syncConsumableMapEventsInGrid(safeMapName, baseGrid, world);
};

const clearMapTileInGrid = (mapName, grid, tileX, tileY) => {
  const safeX = Math.trunc(Number(tileX));
  const safeY = Math.trunc(Number(tileY));
  const next = cloneMapGrid(grid);
  if (!Number.isSafeInteger(safeX) || !Number.isSafeInteger(safeY)) return next;
  if (next[safeY]?.[safeX] === undefined) return next;
  const baseTile = hasAdventureMap(mapName)
    ? loadAdventureMapGrid(mapName)?.[safeY]?.[safeX]
    : 0;
  next[safeY][safeX] = baseTile === undefined ? 0 : baseTile;
  return next;
};

const shouldPersistMapTileClear = (mapName, mapEvent, effectiveType, tileX, tileY) => {
  if (tileX === null || tileY === null) return false;
  if (effectiveType === 'berry') return true;
  if (!['item', 'pickup'].includes(mapEvent?.type)) return false;
  const usesDynamicConsumableVisibility = getAdventureMapInfo(mapName)?.renderMode === 'three-lowpoly';
  return !usesDynamicConsumableVisibility;
};

const getInitialMapGrid = (savedGameData) => {
  const savedMapName = savedGameData?.world?.currentMapName || savedGameData?.currentMapName || DEFAULT_WORLD_MAP_NAME;
  const normalizedWorld = normalizeWorldState(savedGameData?.world, {
    currentMapName: savedMapName,
    playerPos: savedGameData?.playerPos || savedGameData?.world?.playerPos || getMapStartPosition(savedMapName)
  });
  if (Array.isArray(savedGameData?.mapGrid) && savedGameData.mapGrid.length > 0) {
    return buildMapGridForWorld(savedMapName, normalizedWorld, savedGameData.mapGrid);
  }
  return buildMapGridForWorld(savedMapName, normalizedWorld, loadPokemonMap(savedMapName));
};

// --- Unified Bag Component ---
const UnifiedBagScreen = ({
  inventory = [],
  onClose,
  onUseItem, // For balls/battle items
  onUsePotion, // For healing
  onUseExpPotion,
  onBattleItemConsumed,
  team = [],
  isBattle = false,
  canUseBattleBalls = true,
  activeMonId,
  addLog
}) => {
  const [selectedItem, setSelectedItem] = useState(null);
  const [showTeamSelect, setShowTeamSelect] = useState(false);
  const [itemUseEffect, setItemUseEffect] = useState(null);
  const [targetItemNotice, setTargetItemNotice] = useState(null);
  const [targetItemHeaderNotice, setTargetItemHeaderNotice] = useState(null);
  const [pendingItemTargetId, setPendingItemTargetId] = useState(null);
  const itemUseEffectTimerRef = useRef(null);
  const pendingItemTargetIdRef = useRef(null);

  const stackedInventory = useMemo(() => sortInventorySlots(inventory), [inventory]);
  const isItemUsePending = pendingItemTargetId !== null;
  const selectedItemQuantity = selectedItem
    ? getInventoryItemQuantity(inventory, selectedItem.inventoryType, selectedItem.itemKey)
    : 0;
  const selectedItemIsDepleted = Boolean(selectedItem) && selectedItemQuantity <= 0;
  const selectedItemEffectText = selectedItem?.type === 'expPotion'
    ? `经验 +${selectedItem?.expAmount || 0}`
    : getPotionEffectParts(selectedItem).join(' · ');
  const selectedItemStockText = selectedItem
    ? (targetItemHeaderNotice?.text || (selectedItemIsDepleted ? '数量不足' : `剩余 x${selectedItemQuantity}`))
    : '';

  const clearItemUseEffectTimer = useCallback(() => {
    if (itemUseEffectTimerRef.current) {
      clearTimeout(itemUseEffectTimerRef.current);
      itemUseEffectTimerRef.current = null;
    }
  }, []);

  const resetItemUseEffect = useCallback(() => {
    clearItemUseEffectTimer();
    setItemUseEffect(null);
  }, [clearItemUseEffectTimer]);

  useEffect(() => () => {
    clearItemUseEffectTimer();
    pendingItemTargetIdRef.current = null;
  }, [clearItemUseEffectTimer]);

  const playItemUseEffect = useCallback((payload, durationMs = HEAL_ANIMATION_DURATION_MS) => new Promise((resolve) => {
    clearItemUseEffectTimer();
    setItemUseEffect({ ...payload, startedAt: Date.now() });
    itemUseEffectTimerRef.current = setTimeout(() => {
      setItemUseEffect(null);
      itemUseEffectTimerRef.current = null;
      resolve();
    }, durationMs);
  }), [clearItemUseEffectTimer]);

  const handleCloseBag = useCallback(() => {
    if (pendingItemTargetIdRef.current) return;
    onClose?.();
  }, [onClose]);

  const handleCancelTargetSelect = useCallback(() => {
    if (pendingItemTargetIdRef.current) return;
    resetItemUseEffect();
    setTargetItemNotice(null);
    setTargetItemHeaderNotice(null);
    setSelectedItem(null);
    setShowTeamSelect(false);
  }, [resetItemUseEffect]);

  // Group items
  const items = stackedInventory.map((slot) => {
    const inventoryType = resolveInventoryItemType(slot);
    const details = resolveInventoryItemDetails(inventoryType, slot.itemKey);
    const type = inventoryType === 'pokeball' ? 'ball' : inventoryType;
    return { ...slot, ...details, inventoryType, type };
  }).filter((item) => item.name); // Filter out unknown items

  const handleItemClick = async (item) => {
    if (pendingItemTargetIdRef.current) return;

    if (item.type === 'potion' || item.type === 'expPotion') {
      if (isBattle && item.type === 'expPotion') {
        addLog?.('经验药水只能在战斗之外使用。');
        return;
      }
      resetItemUseEffect();
      setTargetItemNotice(null);
      setTargetItemHeaderNotice(null);
      setSelectedItem(item);
      setShowTeamSelect(true);
    } else if (item.type === 'evolutionItem') {
      addLog?.(`${item.name} 已停用，宝可梦现在只会在达到等级时进化。`);
    } else if (item.type === 'ball') {
      if (isBattle) {
        if (!canUseBattleBalls) {
          addLog?.('训练家对战中不能使用精灵球。');
          return;
        }
        const used = await Promise.resolve(onUseItem(item.itemKey));
        if (used) {
          handleCloseBag();
        }
      } else {
        // Cannot use balls outside battle
      }
    }
  };

  const handlePotionUse = async (monId) => {
    if (!selectedItem || pendingItemTargetIdRef.current) return;

    const item = selectedItem;
	    const targetMon = team.find((mon) => mon.id === monId);
	    const maxHp = getMonsterMaxHp(targetMon);
	    const currentHp = targetMon ? getMonsterCurrentHp(targetMon, maxHp) : 0;
	    const maxMp = getMonsterMaxMp(targetMon);
	    const currentMp = targetMon ? getMonsterCurrentMp(targetMon, maxMp) : 0;
	    const recoveryProfile = item.type === 'potion' ? getPotionRecoveryProfile(item) : { hp: 0, mp: 0 };
	    const healAmount = item.type === 'potion'
	      ? Math.max(0, Math.min(recoveryProfile.hp, maxHp - currentHp))
	      : 0;
	    const mpRestoreAmount = item.type === 'potion'
	      ? Math.max(0, Math.min(recoveryProfile.mp, maxMp - currentMp))
	      : 0;
    const curesStatus = item.type === 'potion' && hasPotionCurableStatus(targetMon);
    const remainingQuantityBeforeUse = getInventoryItemQuantity(
      inventory,
      item.inventoryType,
      item.itemKey
    );
    if (remainingQuantityBeforeUse <= 0) {
      setTargetItemNotice(null);
      setTargetItemHeaderNotice({ text: `${item.name} 数量不足。`, tone: 'empty' });
      return;
    }

    setTargetItemNotice(null);
    setTargetItemHeaderNotice(null);
    pendingItemTargetIdRef.current = monId;
    setPendingItemTargetId(monId);
    let used = false;
    let usageResult = null;
    let closeBattleBagAfterUse = false;
    try {
      if (item.type === 'expPotion') {
        usageResult = await Promise.resolve(onUseExpPotion(monId, item.itemKey));
      } else {
        usageResult = await Promise.resolve(onUsePotion(monId, item.itemKey));
      }
      used = usageResult === true || usageResult?.success === true;

      if (!used) return;

      if (addLog) {
        addLog(`使用了 ${item.name}`);
      }

	      if (item.type === 'potion') {
	        await playItemUseEffect({
	          type: 'heal',
	          monId,
	          amount: { hp: healAmount, mp: mpRestoreAmount, status: curesStatus },
	          itemName: item.name
	        }, HEAL_ANIMATION_DURATION_MS);
      } else if (item.type === 'expPotion') {
        await playItemUseEffect({
          type: 'exp',
          monId,
          amount: item.expAmount || usageResult?.expAmount || 0,
          itemName: item.name,
          levelUps: Array.isArray(usageResult?.levelUps) ? usageResult.levelUps : [],
        }, EXP_ANIMATION_DURATION_MS);
      }

      const remainingQuantityAfterUse = Math.max(0, remainingQuantityBeforeUse - 1);
      setTargetItemNotice(null);
      setTargetItemHeaderNotice(
        remainingQuantityAfterUse <= 0
          ? { text: `${item.name} 数量不足。`, tone: 'empty' }
          : null
      );

      if (isBattle && item.type === 'potion') {
        closeBattleBagAfterUse = true;
        await Promise.resolve(onBattleItemConsumed?.({
          itemType: item.type,
          itemKey: item.itemKey,
          targetId: monId
        }));
      }
    } finally {
      pendingItemTargetIdRef.current = null;
      setPendingItemTargetId(null);
    }

    if (closeBattleBagAfterUse) {
      resetItemUseEffect();
      setTargetItemNotice(null);
      setTargetItemHeaderNotice(null);
      setSelectedItem(null);
      setShowTeamSelect(false);
      onClose?.();
    }
  };

  return (
    <div className="absolute inset-0 z-50 game-page">
      <div className="game-page-header">
        <div>
          <h2 className="game-page-title">
            <i className="fa-solid fa-bag-shopping text-teal-600"></i>
            背包
          </h2>
          <div className="game-page-subtitle">道具、药水与精灵球</div>
        </div>
        <button
          onClick={handleCloseBag}
          disabled={isItemUsePending}
          className="game-icon-button"
          title="关闭"
          aria-label="关闭"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div className="game-scroll-area">
        <CollectionGrid>
          {items.length === 0 && <div className="game-collection-empty">背包是空的</div>}
          {items.map((item) => {
            const isLegacyEvolutionItem = item.type === 'evolutionItem';
            const hasEvolutionTarget = false;
            const battleLocked = item.type === 'ball' && !isBattle;
            const trainerBattleLocked = item.type === 'ball' && isBattle && !canUseBattleBalls;
            const battleExpLocked = item.type === 'expPotion' && isBattle;
            const mapLocked = false;
            const noTargetLocked = isLegacyEvolutionItem && !hasEvolutionTarget;
            const itemLocked = battleLocked || trainerBattleLocked || battleExpLocked || mapLocked || noTargetLocked;
            const effectText = trainerBattleLocked
              ? '训练家对战中不能捕捉'
              : battleExpLocked
              ? '仅战斗外使用'
              : item.type === 'ball'
              ? '用于捕捉宝可梦'
              : item.type === 'expPotion'
              ? `经验 +${item.expAmount}`
              : isLegacyEvolutionItem
              ? '旧版进化道具，现已停用'
	              : getPotionEffectText(item);

            return (
              <CollectionCard key={`${item.inventoryType}-${item.itemKey}`} className={itemLocked ? 'game-collection-card--disabled' : ''}>
                <span className="game-collection-card__corner">
                  <span className="game-collection-card__qty">x{item.quantity}</span>
                </span>
                <div className="game-collection-card__sprite-wrap">
                  <img
                    src={item.sprite}
                    alt={item.name}
                    className="game-collection-card__sprite"
                    style={{ imageRendering: 'auto' }}
                    onError={handleItemImageError}
                  />
                </div>
                <div className="game-collection-card__name">{item.name}</div>
                <div className="game-collection-card__desc">{effectText}</div>
                <div className="game-collection-card__footer">
                  <button
                    type="button"
                    onClick={() => handleItemClick(item)}
                    disabled={itemLocked}
                    className="game-primary-button"
                  >
                    {battleLocked ? '仅战斗' : trainerBattleLocked ? '仅野外' : battleExpLocked ? '仅地图' : noTargetLocked ? '已停用' : '使用'}
                  </button>
                </div>
              </CollectionCard>
            );
          })}
        </CollectionGrid>
      </div>

      {/* Team Selector Modal Overlay for Potion */}
      {showTeamSelect &&
        <div
          className="bag-target-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bag-target-title"
        >
          <section className="bag-target-modal animate-bounce-in">
            <header className="bag-target-header">
              <div className="bag-target-item-panel">
                <div className="bag-target-item-panel__icon">
                  <img src={selectedItem?.sprite} alt={selectedItem?.name || '道具'} onError={handleItemImageError} />
                </div>
                <div className="bag-target-item-panel__body">
                  <div className="bag-target-kicker">选择目标</div>
                  <h3 id="bag-target-title">{selectedItem?.name || '道具'}</h3>
                  <p>{selectedItemEffectText || '恢复'}</p>
                </div>
                <span className={`bag-target-stock ${selectedItemIsDepleted ? 'bag-target-stock--empty' : ''}`}>
                  {selectedItemStockText}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancelTargetSelect}
                disabled={isItemUsePending}
                className="bag-target-close"
                title="关闭"
                aria-label="关闭"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>

            {targetItemNotice && (
              <div className={`bag-target-notice ${selectedItemIsDepleted ? 'bag-target-notice--empty' : ''}`}>
                <i className={`fa-solid ${selectedItemIsDepleted ? 'fa-circle-exclamation' : 'fa-circle-check'}`}></i>
                {targetItemNotice}
              </div>
            )}

            <div className="bag-target-list">
              {(!team || team.length === 0) && <div className="bag-target-empty">没有可用的队伍信息</div>}
              {team.map((mon) => {
                const maxHp = getMonsterMaxHp(mon) || 100;
                const currentHp = getMonsterCurrentHp(mon, maxHp);
                const maxMp = getMonsterMaxMp(mon);
                const currentMp = getMonsterCurrentMp(mon, maxMp);
                const hpPercent = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
                const mpPercent = maxMp > 0 ? Math.max(0, Math.min(100, (currentMp / maxMp) * 100)) : 100;
                const selectedExpPotion = selectedItem?.type === 'expPotion' ? selectedItem : null;
                const selectedPotion = selectedItem?.type === 'potion' ? selectedItem : null;
                const selectedPotionRecovery = selectedPotion ? getPotionRecoveryProfile(selectedPotion) : { hp: 0, mp: 0 };
                const expToNextLevel = Number(mon.expToNextLevel);
                const isMaxLevel = Number(mon.level) >= 100;
                const expPercent = selectedExpPotion
                  ? isMaxLevel
                    ? 100
                    : Number.isFinite(expToNextLevel) && expToNextLevel > 0
                      ? Math.max(0, Math.min(100, ((mon.currentExp || 0) / expToNextLevel) * 100))
                      : 0
                  : 0;
                const isHealing = itemUseEffect?.type === 'heal' && itemUseEffect.monId === mon.id;
                const isExpBoosting = itemUseEffect?.type === 'exp' && itemUseEffect.monId === mon.id;
                const isPending = pendingItemTargetId === mon.id;
                const canPotionRestoreHp = Boolean(selectedPotion && selectedPotionRecovery.hp > 0 && currentHp < maxHp);
                const canPotionRestoreMp = Boolean(selectedPotion && selectedPotionRecovery.mp > 0 && currentMp < maxMp);
                const canPotionCureStatus = Boolean(selectedPotion && hasPotionCurableStatus(mon));
                const hpPreview = Math.min(selectedPotionRecovery.hp, Math.max(0, maxHp - currentHp));
                const mpPreview = Math.min(selectedPotionRecovery.mp, Math.max(0, maxMp - currentMp));
                const isUnavailable = selectedExpPotion
                  ? isMaxLevel
                  : !canPotionRestoreHp && !canPotionRestoreMp && !canPotionCureStatus;
                const isTargetDisabled = isUnavailable || isItemUsePending || selectedItemIsDepleted;
                const statusLabel = selectedItemIsDepleted
                  ? '无库存'
                  : selectedExpPotion
                    ? isMaxLevel ? '满级' : `+${selectedExpPotion.expAmount || 0}`
                    : isUnavailable
                      ? '已满'
                      : canPotionCureStatus && !canPotionRestoreHp && !canPotionRestoreMp
                        ? '解异常'
                        : '可用';

                return (
                  <button
                    key={mon.id}
                    type="button"
                    onClick={!isTargetDisabled ? () => handlePotionUse(mon.id) : undefined}
                    disabled={isTargetDisabled}
                    className={[
                      'bag-target-option',
                      isUnavailable || selectedItemIsDepleted ? 'bag-target-option--disabled' : '',
                      isHealing ? 'bag-target-option--healing' : '',
                      isExpBoosting ? 'bag-target-option--exp' : ''
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="bag-target-option__sprite">
                      <img src={mon.sprite} onError={handlePokemonImageError} alt={mon.name} />
                      {isHealing && <HealingBurst amount={itemUseEffect.amount} compact />}
                      {isExpBoosting && <ExpBurst amount={itemUseEffect.amount} levelUps={itemUseEffect.levelUps || []} compact />}
                    </div>
                    <div className="bag-target-option__main">
                      <div className="bag-target-option__top">
                        <div className="bag-target-option__name">
                          <strong>{mon.name}</strong>
                          <span>Lv.{mon.level}</span>
                        </div>
                        <span className={`bag-target-option__status ${isUnavailable || selectedItemIsDepleted ? 'bag-target-option__status--muted' : ''}`}>
                          {isPending && !isHealing && !isExpBoosting ? '处理中' : statusLabel}
                        </span>
                      </div>
                      {!selectedExpPotion && selectedPotion && (
                        <div className="bag-target-restore-preview">
                          <span className={canPotionRestoreHp ? 'bag-target-restore-preview--active' : ''}>HP +{hpPreview}</span>
                          <span className={canPotionRestoreMp ? 'bag-target-restore-preview--active bag-target-restore-preview--mp' : ''}>MP +{mpPreview}</span>
                          <span className={canPotionCureStatus ? 'bag-target-restore-preview--active bag-target-restore-preview--status' : ''}>解除异常</span>
                        </div>
                      )}
                      <div className="bag-target-option__bars">
                        <div className="bag-target-meter">
                          <span>{selectedExpPotion ? 'EXP' : 'HP'}</span>
                          <div><i className="bag-target-meter__hp" style={{ width: selectedExpPotion ? `${expPercent}%` : `${hpPercent}%` }}></i></div>
                          <b>{selectedExpPotion ? (isMaxLevel ? 'MAX' : `${mon.currentExp || 0}/${Number.isFinite(expToNextLevel) ? expToNextLevel : '--'}`) : `${currentHp}/${maxHp}`}</b>
                        </div>
                        {!selectedExpPotion && selectedPotion && (
                          <div className="bag-target-meter">
                            <span>MP</span>
                            <div><i className="bag-target-meter__mp" style={{ width: `${mpPercent}%` }}></i></div>
                            <b>{currentMp}/{maxMp}</b>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <footer className="bag-target-footer">
              <button
                type="button"
                onClick={handleCancelTargetSelect}
                disabled={isItemUsePending}
                className="bag-target-footer-button"
              >
                {isItemUsePending ? '处理中...' : selectedItemIsDepleted ? '返回背包' : '取消'}
              </button>
            </footer>
          </section>
        </div>
      }
    </div>);

};

// --- Re-implemented MapScreen ---
// [ActionButtons removed - unused]

// ═══════════════════════════════════════════════════════════════════
//  战斗过场 Overlay 组件
// ═══════════════════════════════════════════════════════════════════

// ── 遭遇开场 ────────────────────────────────────────────────────────
const BattlePartyBalls = ({ team = [], activeId = null, className = '', compact = false, showActive = true, aceId = null }) => {
  const party = (Array.isArray(team) ? team : []).slice(0, 6);
  if (party.length === 0) return null;

  const faintedCount = party.filter((mon) => isBattleMonFainted(mon)).length;

  return (
    <div className={`battle-party-balls ${compact ? 'battle-party-balls--compact' : ''} ${className}`} aria-label={`对手持有 ${party.length} 只宝可梦，${faintedCount} 只已失去战斗能力`}>
      {party.map((mon, index) => {
        const fainted = isBattleMonFainted(mon);
        const active = showActive && !fainted && activeId != null && mon?.id === activeId;
        const ace = aceId != null && mon?.id === aceId;
        return (
          <span
            key={mon?.id || index}
            className={`battle-party-ball ${active ? 'battle-party-ball--active' : ''} ${ace ? 'battle-party-ball--ace' : ''} ${fainted ? 'battle-party-ball--fainted' : ''}`}
            style={{ '--ball-index': index }}
            title={`${mon?.name || '宝可梦'}${ace ? ' 压轴王牌' : fainted ? ' 已失去战斗能力' : active ? ' 正在场上' : ' 待命中'}`}
          >
            <img src={BATTLE_SENDOUT_BALL_SPRITE} alt="" loading="eager" decoding="async" draggable="false" onError={handlePokeballImageError} />
          </span>
        );
      })}
    </div>
  );
};

const BattleIntroOverlay = ({ enemyMon, enemyTeam = [], battleKind = 'wild', battleEnvironment, onComplete }) => {
  const isTrainerBattle = battleKind === 'trainer';
  const opponentName = battleEnvironment?.eventName || battleEnvironment?.zoneName || '训练家';
  const trainerRole = normalizeTrainerRole(battleEnvironment?.eventRole || 'normal');
  const trainerPortraitSrc = getTrainerPortraitForRole(trainerRole);
  const trainerIntroMeta = getTrainerIntroMeta(trainerRole);
  const trainerRoleLabel = getTrainerRoleBalance(trainerRole).label;
  const opponentTitle = isTrainerBattle
    ? trainerRoleLabel
    : battleEnvironment?.eventTitle || (battleEnvironment?.eventRole === 'boss' ? '区域首领' : '训练家');
  const trainerTeam = Array.isArray(enemyTeam) ? enemyTeam.filter(Boolean) : [];
  const trainerTeamSize = Math.max(1, trainerTeam.length);
  const trainerIntroBallTeam = trainerTeam.length > 0
    ? trainerTeam
    : (enemyMon ? [enemyMon] : Array.from({ length: trainerTeamSize }, (_, index) => ({ id: `intro-ball-${index}`, name: '宝可梦' })));
  const bossAceMon = battleEnvironment?.eventRole === 'boss'
    ? (trainerTeam.length > 0 ? trainerTeam[trainerTeam.length - 1] : null)
    : null;
  const bossAceId = bossAceMon?.id ?? null;
  const bossSupportCount = bossAceMon ? Math.max(0, trainerTeam.length - 1) : 0;

  return (
    <div
      className={`battle-intro-overlay ${isTrainerBattle ? `battle-intro-overlay--trainer battle-intro-overlay--${trainerRole}` : ''} absolute inset-0 z-[9500] select-none overflow-hidden`}
      onClick={onComplete}
    >
      <div className="battle-intro-spotlight" />
      <div className="battle-intro-scan" />
      <div
        className="battle-intro-sprite-stage"
        style={{ animation: 'btIntroEnemy 650ms cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <div className="relative">
          <div className="battle-intro-sprite-aura" />
          {isTrainerBattle ? (
            <div className={`battle-intro-trainer-portrait battle-intro-trainer-portrait--${trainerRole}`} aria-hidden="true">
              <span className="battle-intro-trainer-effect battle-intro-trainer-effect--halo" />
              <span className="battle-intro-trainer-effect battle-intro-trainer-effect--rank" />
              <img
                src={trainerPortraitSrc}
                alt=""
                loading="eager"
                decoding="async"
                draggable="false"
                onError={handleTrainerPortraitImageError}
              />
            </div>
          ) : (
            <img
              src={enemyMon?.sprite || POKEMON_LOCAL_PLACEHOLDER}
              alt={enemyMon?.name}
              className="battle-intro-sprite"
              style={{ imageRendering: 'auto', filter: 'drop-shadow(0 16px 28px rgba(0,0,0,0.32)) drop-shadow(0 0 18px rgba(150,200,255,0.38))' }}
              loading="eager"
              decoding="async"
              draggable="false"
              onError={handlePokemonImageError}
            />
          )}
        </div>
      </div>

      <div className="battle-intro-info-panel text-center px-6" style={{ animation: 'battleIntroOverlayFade 360ms ease-out both' }}>
        <div className="battle-intro-kicker text-white/50 text-xs font-black tracking-[0.3em] uppercase mb-1">
          {isTrainerBattle ? opponentTitle : '野生的'}
        </div>
        <div
          className="battle-intro-title text-white font-black tracking-wide"
          style={{
            fontSize: isTrainerBattle ? 'clamp(1.85rem, 6.8vw, 2.48rem)' : 'clamp(2rem, 8vw, 2.8rem)',
            lineHeight: 1.05,
            textShadow: '0 2px 20px rgba(100,180,255,0.5)'
          }}
        >
          {isTrainerBattle ? opponentName : enemyMon?.name}
        </div>
        {isTrainerBattle ? (
          <>
            <p className="battle-intro-trainer-text">{trainerIntroMeta.promptText}</p>
            {bossAceMon ? (
              <div className="battle-intro-boss-ace-panel">
                <span className="battle-intro-boss-ace-panel__eyebrow">
                  压轴王牌
                </span>
                <div className="battle-intro-boss-ace-panel__main">
                  <span className="battle-intro-boss-ace-panel__name">{bossAceMon.name}</span>
                  <span className="battle-intro-boss-ace-panel__level">Lv.{bossAceMon.level}</span>
                </div>
                <div className="battle-intro-boss-ace-panel__meta">
                  {bossSupportCount > 0 ? (
                    <span className="battle-intro-boss-ace-panel__hint">
                      先破前阵 {bossSupportCount} 只，再迎最终王牌
                    </span>
                  ) : null}
                  <div className="battle-intro-boss-ace-panel__types">
                    {bossAceMon.type ? <TypeBadge type={bossAceMon.type} small /> : null}
                    {bossAceMon.type2 ? <TypeBadge type={bossAceMon.type2} small /> : null}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="battle-intro-trainer-meta">
              <BattlePartyBalls
                team={trainerIntroBallTeam}
                className="battle-party-balls--intro"
                compact
                showActive={false}
                aceId={bossAceId}
              />
            </div>
          </>
        ) : (
          <div className="mt-2.5 flex items-center justify-center gap-2">
            <span className="bg-yellow-400/15 text-yellow-200 text-sm font-black px-3 py-1 rounded-full">
              Lv.{enemyMon?.level}
            </span>
            {enemyMon?.type && <TypeBadge type={enemyMon.type} />}
            {enemyMon?.type2 && <TypeBadge type={enemyMon.type2} />}
          </div>
        )}
      </div>

      <div
        className="battle-intro-continue-hint text-white/40 text-xs font-bold"
        style={{ animation: 'battleIntroOverlayFade 360ms ease-out both, battleCaretPulse 1.4s ease-in-out infinite' }}
      >
        点击屏幕继续
      </div>
    </div>
  );
};

const BattleSendOutOverlay = ({ onComplete, mode = 'player', variant = 'opening' }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete?.();
    }, BATTLE_SENDOUT_OVERLAY_MS);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const sides = mode === 'both' ? ['enemy', 'player'] : [mode === 'enemy' ? 'enemy' : 'player'];

  return (
    <div className={`battle-sendout-overlay battle-sendout-overlay--${variant} absolute inset-0 z-[9500] select-none overflow-hidden pointer-events-none`} aria-hidden="true">
      <div className="battle-sendout-vignette" />
      {sides.map((side, sideIndex) => (
        <div key={side} className={`battle-sendout-side battle-sendout-side--${side}`} style={{ '--sendout-side-delay': `${sideIndex * 120}ms` }}>
          <div className="battle-sendout-arc" />
          <div className={`battle-sendout-ball-shell battle-sendout-ball-shell--${side}`}>
            <img
              src={BATTLE_SENDOUT_BALL_SPRITE}
              alt="精灵球"
              className={`battle-sendout-ball battle-sendout-ball--${side}`}
              loading="eager"
              decoding="async"
              onError={handlePokeballImageError}
              draggable="false"
            />
          </div>
          <div className="battle-sendout-burst">
            {Array.from({ length: 10 }, (_, index) => (
              <span key={index} style={{ '--spark-index': index }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── 胜利画面 ────────────────────────────────────────────────────────
const BattleVictoryOverlay = ({ enemyName, isTrainer, rewardSummary, onContinue }) => {
  const [canContinue, setCanContinue] = useState(false);
  const rewards = useMemo(() => normalizeBattleRewardSummary(rewardSummary), [rewardSummary]);
  const levelUps = rewards.levelUps || [];
  const unlocks = rewards.unlocks || [];
  const participantText = rewards.participantCount > 1
    ? `${rewards.participantCount} 只宝可梦平分`
    : '出战宝可梦获得';
  const primaryRewardItems = [
    {
      key: 'gold',
      className: 'battle-victory-reward--gold',
      icon: 'fa-coins',
      label: '金币',
      value: rewards.gold,
      meta: '已加入钱包',
      delay: 980
    },
    {
      key: 'exp',
      className: 'battle-victory-reward--exp',
      icon: 'fa-bolt',
      label: '经验',
      value: rewards.exp,
      meta: participantText,
      delay: 1130
    }
  ];
  const itemRewardItems = rewards.items.map((item, index) => ({
    key: `item-${index}-${item.itemName}`,
    icon: 'fa-gift',
    sprite: item.sprite,
    label: item.itemName,
    value: item.quantity,
    delay: 1280 + index * 90
  }));
  const rewardDetailCount = primaryRewardItems.length + itemRewardItems.length + unlocks.length + levelUps.length;

  useEffect(() => {
    setCanContinue(false);
    const timer = setTimeout(() => setCanContinue(true), VICTORY_SETTLEMENT_READY_MS);
    return () => clearTimeout(timer);
  }, [rewards.exp, rewards.gold, rewards.participantCount]);

  return (
    <div className="battle-victory-overlay absolute inset-0 z-[9500] flex flex-col items-center justify-center overflow-hidden select-none">
      <div className="battle-victory-spotlight" />
      <div className="battle-victory-sheen" aria-hidden="true" />

      <div className="battle-victory-panel relative z-10 w-full text-center">
        <div className="battle-victory-panel__header">
          <div
            className="battle-victory-panel__icon mb-3 w-full text-center leading-none"
            style={{ animation: 'btVictoryIcon 700ms cubic-bezier(0.34, 1.56, 0.64, 1) 200ms both' }}
          >
            <i className="fa-solid fa-trophy"></i>
          </div>

          <h2
            className="battle-victory-panel__title m-0 w-full text-center font-black leading-tight text-yellow-300"
            style={{
              fontSize: 'clamp(2rem, 5.3vw, 2.45rem)',
              textShadow: '0 0 24px rgba(255, 210, 0, 0.65), 0 0 24px rgba(255, 210, 0, 0.35), 0 2px 4px rgba(0, 0, 0, 0.8)',
              animation: 'btVictoryTitle 600ms cubic-bezier(0.34, 1.56, 0.64, 1) 400ms both',
            }}
          >
            <span className="battle-victory-title-wrap" aria-label="战斗胜利！">
              <span className="battle-victory-title-core">战斗胜利</span>
              <span className="battle-victory-title-mark" aria-hidden="true">！</span>
            </span>
          </h2>

          <div
            className="battle-victory-panel__subtitle mt-3 flex w-full flex-col items-center gap-1 px-2"
            style={{ animation: 'btVictorySubIn 500ms ease-out 700ms both' }}
          >
            <p className="flex max-w-full flex-wrap items-center justify-center gap-x-1.5 text-center text-base font-bold text-white/70">
              <span>击败了{isTrainer ? '训练家' : '野生的'}</span>
              <span className="text-yellow-200 font-black">{enemyName}</span>
            </p>
            {isTrainer && (
              <p className="inline-flex items-center gap-1 text-center text-sm font-bold text-emerald-300">
                <i className="fa-solid fa-kit-medical"></i>
                队伍全员已完全恢复
              </p>
            )}
          </div>
        </div>

        <div className="battle-victory-settlement" aria-live="polite">
          <div className="battle-victory-settlement__label">
            <span className="battle-victory-settlement__line" />
            <i className="fa-solid fa-star"></i>
            获得奖励
            <span className="battle-victory-settlement__line" />
          </div>
          <div className="battle-victory-settlement__scroll">
            <div className="battle-victory-rewards">
              {primaryRewardItems.map((item, index) => (
                <div
                  key={item.key}
                  className={`battle-victory-reward ${item.className}`}
                  style={{ animationDelay: `${900 + index * 150}ms`, '--reward-grow-delay': `${item.delay}ms` }}
                >
                  <span className="battle-victory-reward__icon">
                    {item.sprite ? (
                      <img src={item.sprite} alt="" onError={handleItemImageError} />
                    ) : (
                      <i className={`fa-solid ${item.icon}`}></i>
                    )}
                  </span>
                  <span className="battle-victory-reward__body">
                    <span className="battle-victory-reward__label">{item.label}</span>
                    <span className="battle-victory-reward__meta">{item.meta}</span>
                  </span>
                  <strong className="battle-victory-reward__value">+<RewardCountUp value={item.value} delay={item.delay} /></strong>
                  <span className="battle-victory-reward__progress" aria-hidden="true"><span /></span>
                </div>
              ))}
            </div>

            {itemRewardItems.length > 0 && (
              <div className="battle-victory-item-rewards" aria-label="道具奖励">
                {itemRewardItems.map((item, index) => (
                  <span
                    key={item.key}
                    className="battle-victory-item-reward"
                    style={{ animationDelay: `${1080 + index * 90}ms` }}
                    title={`${item.label} +${item.value}`}
                    aria-label={`${item.label} ${item.value} 个`}
                  >
                    {item.sprite ? (
                      <img src={item.sprite} alt="" onError={handleItemImageError} />
                    ) : (
                      <i className={`fa-solid ${item.icon}`} aria-hidden="true"></i>
                    )}
                    <b aria-hidden="true">{item.value}</b>
                  </span>
                ))}
              </div>
            )}

            {unlocks.length > 0 && (
              <div className="battle-victory-unlocks">
                {unlocks.map((unlock, index) => (
                  <div
                    key={`${unlock.kind}-${unlock.title}-${index}`}
                    className={`battle-victory-unlock battle-victory-unlock--${unlock.kind}`}
                    style={{ animationDelay: `${1210 + index * 140}ms` }}
                  >
                    <span className="battle-victory-unlock__icon"><i className="fa-solid fa-star"></i></span>
                    <span className="battle-victory-unlock__body">
                      <strong>{unlock.title}</strong>
                      {unlock.subtitle ? <span>{unlock.subtitle}</span> : null}
                      {unlock.speciesPreview.length > 0 ? (
                        <span
                          className="battle-victory-unlock__sprites"
                          aria-label={`新增 ${unlock.totalCount} 种稀有宝可梦`}
                        >
                          {unlock.speciesPreview.map((monster) => (
                            <span
                              key={`${monster.id}-${monster.name}`}
                              className="battle-victory-unlock__sprite"
                              title={monster.name}
                            >
                              <img src={monster.sprite} alt={monster.name} onError={handlePokemonImageError} />
                            </span>
                          ))}
                          {unlock.totalCount > unlock.speciesPreview.length ? (
                            <span className="battle-victory-unlock__more">+{unlock.totalCount - unlock.speciesPreview.length}</span>
                          ) : null}
                        </span>
                      ) : null}
                      {unlock.description ? <small>{unlock.description}</small> : null}
                    </span>
                    {unlock.chanceText ? <b>{unlock.chanceText}</b> : null}
                  </div>
                ))}
              </div>
            )}

            {levelUps.length > 0 && (
              <div className="battle-victory-levelups">
                {levelUps.map((levelUp, index) => (
                  <div
                    key={`${levelUp.name}-${levelUp.toLevel}-${index}`}
                    className="battle-victory-levelup"
                    style={{ animationDelay: `${1150 + index * 120}ms` }}
                  >
                    <i className="fa-solid fa-arrow-up"></i>
                    <span>{levelUp.name} Lv.{levelUp.fromLevel} → Lv.{levelUp.toLevel}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {rewardDetailCount > 3 && (
            <div className="battle-victory-settlement__hint">
              <i className="fa-solid fa-chevron-up"></i>
              上下滑动查看全部奖励
              <i className="fa-solid fa-chevron-down"></i>
            </div>
          )}
        </div>

        <button
          onClick={onContinue}
          disabled={!canContinue}
          className="battle-victory-panel__button mt-5 flex min-h-[56px] w-[210px] shrink-0 items-center justify-center self-center rounded-2xl px-6 py-4 text-base font-black text-black"
          style={{
            background: 'linear-gradient(135deg, #ffd700, #ffb300)',
            boxShadow: '0 0 30px 8px rgba(255,215,0,0.3), 0 8px 24px rgba(0,0,0,0.4)',
            animation: 'btVictoryBtnIn 500ms ease-out 1450ms both',
          }}>
          {canContinue ? '继续探索' : '结算中'}
        </button>
      </div>
    </div>
  );
};

// ── 失败画面 ────────────────────────────────────────────────────────
const BattleDefeatOverlay = ({ onContinue, goldPenalty = 0 }) => {
  const [isContinuing, setIsContinuing] = useState(false);
  const handleContinue = async () => {
    if (isContinuing) return;
    setIsContinuing(true);
    try {
      await onContinue?.();
    } finally {
      setIsContinuing(false);
    }
  };

  return (
  <div className="absolute inset-0 z-[9500] flex flex-col items-center justify-center overflow-hidden select-none"
    style={{
      background: 'radial-gradient(ellipse at 50% 30%, #1a0505 0%, #0d0202 50%, #060101 100%)',
      animation: 'btDefeatBg 600ms ease-out both',
    }}>
    {/* 红色光晕 */}
    <div className="absolute inset-0 pointer-events-none"
      style={{ background: 'radial-gradient(ellipse at 50% 20%, rgba(180,20,20,0.25) 0%, transparent 65%)', animation: 'btDefeatVignette 800ms ease-out both' }} />

    <div className="relative z-10 flex w-full max-w-sm flex-col items-center px-5 text-center">
      {/* 图标 */}
      <div className="mb-2 w-full text-center text-8xl opacity-90" style={{ animation: 'btDefeatSkull 700ms cubic-bezier(0.34,1.2,0.64,1) 300ms both' }}>
        💀
      </div>

      {/* 标题 */}
      <div className="w-full text-center font-black leading-none text-red-400"
        style={{
          fontSize: 'clamp(2rem, 9vw, 3rem)',
          textShadow: '0 0 24px rgba(220,40,40,0.6), 0 2px 4px rgba(0,0,0,0.9)',
          animation: 'btDefeatTitle 900ms ease-out 600ms both',
        }}>
        挑战失败
      </div>

      {/* 说明 */}
      <div className="mt-3 w-full px-2 text-center" style={{ animation: 'btDefeatSubIn 600ms ease-out 1200ms both' }}>
        <div className="text-sm font-bold leading-relaxed text-white/50">
          队伍已安全撤退并恢复了全部体力
          {goldPenalty > 0 && (
            <>
              <br />
              <span className="text-amber-200/90">损失了 {goldPenalty} 金币</span>
            </>
          )}
        </div>
      </div>

      {/* 重整旗鼓按钮 */}
      <button
        onClick={handleContinue}
        disabled={isContinuing}
        className="mt-10 inline-flex min-h-[64px] w-[220px] items-center justify-center rounded-2xl px-6 py-4 text-center text-lg font-black text-white"
        style={{
          background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
          boxShadow: '0 0 20px 4px rgba(180,20,20,0.2), 0 8px 24px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,100,100,0.25)',
          opacity: isContinuing ? 0.72 : 1,
          animation: 'btDefeatBtnIn 500ms ease-out 1600ms both',
        }}>
        {isContinuing ? '同步中' : '重整旗鼓'}
      </button>
    </div>
  </div>
  );
};

// ── 逃跑画面（自动消失）────────────────────────────────────────────
const BattleEscapeOverlay = ({ onComplete, paused = false, refundEligible = false, phaseData = null }) => {
  React.useEffect(() => {
    if (paused) return undefined;
    const t = setTimeout(onComplete, 1600);
    return () => clearTimeout(t);
  }, [onComplete, paused]);

  const isTeleportEscape = phaseData?.reason === 'teleport';
  const isEnemyEscape = isTeleportEscape && phaseData?.side === 'enemy';
  const title = isTeleportEscape
    ? isEnemyEscape ? '对手逃走了！' : '瞬间移动成功！'
    : '成功逃跑！';
  const subtitle = isTeleportEscape
    ? '瞬间移动让战斗结束了'
    : refundEligible ? '未进入战斗，已返还能量' : '已进入战斗，能量不会返还';

  return (
    <div className="absolute inset-0 z-[9500] flex flex-col items-center justify-center pointer-events-none"
      style={{
        background: 'rgba(4,8,26,0.96)',
        animation: 'btEscapeFade 1600ms ease-in-out both',
      }}>
      <div className="flex flex-col items-center gap-3"
        style={{ animation: 'btEscapeIn 450ms cubic-bezier(0.34,1.56,0.64,1) both' }}>
        <div className="text-6xl" style={{ animation: 'btEscapeIcon 400ms ease-out 200ms both' }}>{isTeleportEscape ? '✨' : '💨'}</div>
        <div className="text-white font-black text-2xl" style={{ textShadow: '0 2px 12px rgba(100,200,255,0.4)' }}>
          {title}
        </div>
        <div className="text-sm font-bold text-white/55">
          {subtitle}
        </div>
      </div>
    </div>
  );
};

// --- This comment ensures the search for the next block is unique ---
// The original MapScreen component is replaced by the version below.

const BattleScene = ({
  playerMon, enemyMon, logs, onMove, onSwitch, turn, onNavigate, playerGold,
  isThrowingPokeball, onGoToLaunchScreen, onRun, escapeRule = null,
  // New props for modal screens
  playerTeam, enemyTeam = [], activeEnemyId = null, playerInventory, onUseItem, onUsePotion, onUseExpPotion, addLog,
  canUsePokeballs = true,
  onModalScreenChange,
  moveVisualEvent,
  switchVisualEvent,
  pendingBattleSwitch,
  battleEnvironment,
  battlePhase = 'active',
  battleKind = 'wild',
  battlePhaseData = null,
  openingIntro = false,
  openingSendOut = false,
  onOpeningIntroComplete,
  onOpeningSendOutComplete
}) => {
  const [playerAnim, setPlayerAnim] = useState('');
  const [enemyAnim, setEnemyAnim] = useState('');
  const [attackEffect, setAttackEffect] = useState(null);
  const [playerSwitchOverride, setPlayerSwitchOverride] = useState(null);
  const [enemySwitchOverride, setEnemySwitchOverride] = useState(null);

  // New states for modal screens
  const [showBag, setShowBag] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [showControls, setShowControls] = useState('main'); // 'main' or 'moves'
  const [isBusy, setIsBusy] = useState(false);
  const [typedLog, setTypedLog] = useState('');
  const [battleFeedbackCue, setBattleFeedbackCue] = useState(null);
  const isBattleSceneMountedRef = useRef(true);
  const battleVisualTimerRef = useRef([]);
  const battleEffectCleanupTimerRef = useRef(null);
  const battleFeedbackTimerRef = useRef(null);
  const battlePlayerMon = useMemo(() => withBattleRuntimeDefaults(playerMon), [playerMon]);
  const battleEnemyMon = useMemo(() => withBattleRuntimeDefaults(enemyMon), [enemyMon]);
  const activeSwitchRequest = useMemo(() => normalizePendingBattleSwitch(pendingBattleSwitch), [pendingBattleSwitch]);

  useEffect(() => {
    onModalScreenChange?.(showBag || showTeam);
  }, [onModalScreenChange, showBag, showTeam]);

  useEffect(() => {
    isBattleSceneMountedRef.current = true;
    return () => {
      isBattleSceneMountedRef.current = false;
      battleVisualTimerRef.current.forEach(clearTimeout);
      battleVisualTimerRef.current = [];
      if (battleEffectCleanupTimerRef.current) {
        clearTimeout(battleEffectCleanupTimerRef.current);
        battleEffectCleanupTimerRef.current = null;
      }
      if (battleFeedbackTimerRef.current) {
        clearTimeout(battleFeedbackTimerRef.current);
        battleFeedbackTimerRef.current = null;
      }
      onModalScreenChange?.(false);
    };
  }, [onModalScreenChange]);

  const resolvedEscapeRule = useMemo(() => ({
    kind: escapeRule?.kind || 'wild',
    canRun: escapeRule?.canRun !== false,
    blockedReason: escapeRule?.blockedReason || '',
    inlineHint: escapeRule?.inlineHint || '',
    buttonNote: escapeRule?.buttonNote || '',
    feedbackTitle: escapeRule?.feedbackTitle || '',
    feedbackMessage: escapeRule?.feedbackMessage || '',
    feedbackDurationMs: Number.isFinite(Number(escapeRule?.feedbackDurationMs))
      ? Number(escapeRule.feedbackDurationMs)
      : 0
  }), [escapeRule]);

  const clearBattleVisualTimers = useCallback(() => {
    battleVisualTimerRef.current.forEach(clearTimeout);
    battleVisualTimerRef.current = [];
    if (battleEffectCleanupTimerRef.current) {
      clearTimeout(battleEffectCleanupTimerRef.current);
      battleEffectCleanupTimerRef.current = null;
    }
  }, []);

  const playBattleMoveVisual = useCallback((event) => {
    const moveKey = event?.moveKey;
    const attackerSide = event?.attackerSide;
    const phase = event?.phase || 'hit';
    const durationMs = event?.durationMs || getBattleMovePhaseDuration(phase);
    const impactDelayMs = getBattleMoveImpactDelay(phase, durationMs);
    const move = event?.move || MOVES[moveKey];
    if (!move || isThrowingPokeball) return;
    const moveConfig = getMoveEffectConfig(moveKey, move);
    const isEnemyAttack = attackerSide === 'enemy';
    const isSecondaryResultPhase = phase === 'secondary';
    const isActorFocusedPhase = ['charge', 'start', 'copy', 'fizzle'].includes(phase);
    const shouldMoveActor = !event?.suppressActorMotion && !isSecondaryResultPhase && ['start', 'hit', 'status', 'heal', 'drain', 'miss', 'fizzle'].includes(phase);
    const shouldShowTargetEffect = ['hit', 'status', 'secondary', 'heal', 'drain', 'miss', 'fizzle'].includes(phase);
    const shouldApplyTargetReaction = Boolean(event?.forceTargetReaction) || ['hit', 'status', 'heal', 'drain'].includes(phase);
    const explicitTargetSide = ['player', 'enemy'].includes(event?.targetSide) ? event.targetSide : null;
    const effectTarget = explicitTargetSide || (isActorFocusedPhase || moveConfig.target === 'self' || move.effect === 'heal'
      ? (isEnemyAttack ? 'enemy' : 'player')
      : (isEnemyAttack ? 'player' : 'enemy'));
    const actorAnim = `battle-actor-motion battle-actor-motion--${moveConfig.motion || 'lunge'}`;
    const resolvedReactionClass = event?.reactionClass || (isSecondaryResultPhase ? 'ripple' : phase === 'charge' ? 'charge' : moveConfig.hitReaction || 'bump');
    const targetAnim = `battle-hit-reaction battle-hit-reaction--${resolvedReactionClass}`;

    clearBattleVisualTimers();
    setAttackEffect(null);
    if (shouldMoveActor) {
      if (isEnemyAttack) {
        setEnemyAnim(actorAnim);
      } else {
        setPlayerAnim(actorAnim);
      }
    }

    battleVisualTimerRef.current.push(setTimeout(() => {
      if (!isBattleSceneMountedRef.current) return;
      if (shouldMoveActor && shouldShowTargetEffect) {
        if (isEnemyAttack) setEnemyAnim('');
        else setPlayerAnim('');
      }
      if (shouldApplyTargetReaction) {
        if (effectTarget === 'player') setPlayerAnim(targetAnim);
        else setEnemyAnim(targetAnim);
      }
      if (shouldShowTargetEffect) {
        setAttackEffect({
          id: `${moveKey}-${phase}-${Date.now()}`,
          type: move.type,
          category: move.category,
          attackerSide,
          target: effectTarget,
          moveKey,
          phase,
          durationMs: Math.max(520, durationMs - impactDelayMs),
        });
      }
    }, impactDelayMs));

    battleVisualTimerRef.current.push(setTimeout(() => {
      if (!isBattleSceneMountedRef.current) return;
      setPlayerAnim('');
      setEnemyAnim('');
      setAttackEffect(null);
    }, durationMs));
  }, [clearBattleVisualTimers, isThrowingPokeball]);

  useEffect(() => {
    if (!moveVisualEvent) return;
    playBattleMoveVisual(moveVisualEvent);
  }, [moveVisualEvent, playBattleMoveVisual]);

  useEffect(() => {
    if (!switchVisualEvent) return undefined;
    const phase = switchVisualEvent.phase === 'recall' ? 'recall' : 'send';
    const durationMs = switchVisualEvent.durationMs || (phase === 'recall' ? BATTLE_SWITCH_RECALL_MS : BATTLE_SWITCH_SEND_MS);
    clearBattleVisualTimers();
    setAttackEffect(null);
    const isEnemySwitch = switchVisualEvent.side === 'enemy';
    const setSwitchOverride = isEnemySwitch ? setEnemySwitchOverride : setPlayerSwitchOverride;
    const setSwitchAnim = isEnemySwitch ? setEnemyAnim : setPlayerAnim;
    setSwitchOverride({
      monster: switchVisualEvent.monster || (isEnemySwitch ? battleEnemyMon : battlePlayerMon),
      phase,
      hidden: false
    });
    setSwitchAnim(`battle-switch-motion battle-switch-motion--${phase}`);

    const timer = setTimeout(() => {
      if (!isBattleSceneMountedRef.current) return;
      if (phase === 'recall') {
        setSwitchAnim('battle-switch-hidden');
        setSwitchOverride((prev) => prev ? { ...prev, hidden: true } : prev);
      } else {
        setSwitchAnim('');
      }
    }, durationMs);

    battleVisualTimerRef.current.push(timer);
    return () => clearTimeout(timer);
  }, [clearBattleVisualTimers, switchVisualEvent]);

  useEffect(() => {
    if (battlePhase === 'active' && !openingIntro && !openingSendOut) return;
    clearBattleVisualTimers();
    setPlayerAnim('');
    setEnemyAnim('');
    setAttackEffect(null);
  }, [battlePhase, clearBattleVisualTimers, openingIntro, openingSendOut]);

  useEffect(() => {
    if (switchVisualEvent) return;

    const settleSwitchOverride = (prev, currentMon, side) => {
      if (!prev) return prev;
      if (prev.phase === 'send') {
        if (prev.monster?.id === currentMon?.id) return null;
        const isPendingPlayerSend =
          side === 'player' &&
          activeSwitchRequest?.nextActivePlayerId &&
          String(prev.monster?.id) === activeSwitchRequest.nextActivePlayerId;
        return isPendingPlayerSend ? prev : null;
      }
      if (prev?.hidden && prev.monster?.id !== currentMon?.id) return null;
      return prev;
    };

    setPlayerSwitchOverride((prev) => settleSwitchOverride(prev, battlePlayerMon, 'player'));
    setEnemySwitchOverride((prev) => settleSwitchOverride(prev, battleEnemyMon, 'enemy'));
    setPlayerAnim((prev) => (prev === 'battle-switch-hidden' ? '' : prev));
    setEnemyAnim((prev) => (prev === 'battle-switch-hidden' ? '' : prev));
  }, [activeSwitchRequest?.nextActivePlayerId, battleEnemyMon, battlePlayerMon, switchVisualEvent]);

  useEffect(() => {
    if (!attackEffect) return undefined;
    if (battleEffectCleanupTimerRef.current) clearTimeout(battleEffectCleanupTimerRef.current);
    battleEffectCleanupTimerRef.current = setTimeout(() => {
      if (!isBattleSceneMountedRef.current) return;
      setAttackEffect(null);
      battleEffectCleanupTimerRef.current = null;
    }, attackEffect.durationMs || getBattleMovePhaseDuration(attackEffect.phase));
    return () => {
      if (battleEffectCleanupTimerRef.current) {
        clearTimeout(battleEffectCleanupTimerRef.current);
        battleEffectCleanupTimerRef.current = null;
      }
    };
  }, [attackEffect]);

  // Reset busy state when it's player's turn
  useEffect(() => {
    if (turn === 'player') setIsBusy(false);
  }, [turn]);

  const movePressure = useMemo(() => {
    if (!battlePlayerMon || !battleEnemyMon) {
      const neutralPressure = getBattleMovePressure(null, null);
      return { player: neutralPressure, enemy: neutralPressure };
    }

    return {
      player: getBattleMovePressure(battlePlayerMon, battleEnemyMon),
      enemy: getBattleMovePressure(battleEnemyMon, battlePlayerMon)
    };
  }, [battleEnemyMon, battlePlayerMon]);

  const playerHint = getBattleHudHint(movePressure.player, movePressure.enemy, 'player');
  const enemyHint = getBattleHudHint(movePressure.enemy, movePressure.player, 'enemy');

  // Close bag when throwing pokeball animation starts
  useEffect(() => {
    if (isThrowingPokeball) {
      setShowBag(false);
    }
  }, [isThrowingPokeball]);

  // --- Data Normalization ---
  const normalizeStats = (mon) => {
    if (!mon) return { currentHp: 0, maxHp: 0, currentMp: 0, maxMp: 0 };
    const maxHp = getMonsterMaxHp(mon);
    const currentHp = getMonsterCurrentHp(mon, maxHp);
    const maxMp = getMonsterMaxMp(mon);
    const currentMp = getMonsterCurrentMp(mon, maxMp);
    return { currentHp, maxHp, currentMp, maxMp };
  };

  const moveGridRowCount = Math.max(1, Math.ceil((battlePlayerMon?.moves?.length || 0) / 2));
  const sendOutMode = battlePhaseData?.sendOutSide || (battleKind === 'trainer' ? 'both' : 'player');
  const switchSendOutMode = battlePhase !== 'sendout' && switchVisualEvent?.phase === 'send'
    ? (switchVisualEvent.side === 'enemy' ? 'enemy' : 'player')
    : null;
  const isPlayerOpeningSendOut = openingSendOut && sendOutMode !== 'enemy';
  const isEnemyOpeningSendOut = openingSendOut && sendOutMode !== 'player';
  const displayPlayerMon = getBattleDisplayMonster(
    isPlayerOpeningSendOut
      ? battlePlayerMon
      : (playerSwitchOverride?.monster || battlePlayerMon)
  );
  const displayEnemyMon = getBattleDisplayMonster(
    isEnemyOpeningSendOut
      ? (withBattleRuntimeDefaults(battlePhaseData?.enemyMon) || battleEnemyMon)
      : (enemySwitchOverride?.monster || battleEnemyMon)
  );
  const playerStats = normalizeStats(displayPlayerMon);
  const enemyStats = normalizeStats(displayEnemyMon);
  const playerEntryMode = getBattleEntryMode(displayPlayerMon);
  const enemyEntryMode = getBattleEntryMode(displayEnemyMon);
  const enemySpriteClass = openingIntro
    ? 'battle-opening-hidden'
    : isEnemyOpeningSendOut
      ? `battle-opening-send battle-opening-send--${enemyEntryMode}`
    : enemySwitchOverride?.hidden
      ? 'battle-switch-hidden'
    : enemyAnim;
  const playerSpriteClass = openingIntro
    ? 'battle-opening-hidden'
    : isPlayerOpeningSendOut
      ? `battle-opening-send battle-opening-send--${playerEntryMode}`
      : playerAnim;
  const battleDialogueLogs = (Array.isArray(logs) ? logs : [])
    .filter((log) => typeof log === 'string' && log.trim().length > 0);
  const formattedBattleDialogueLogs = battleDialogueLogs
    .map(formatBattleDialogueLog)
    .filter((log) => log.length > 0);
  const latestLog = formattedBattleDialogueLogs.length > 0
    ? formattedBattleDialogueLogs[formattedBattleDialogueLogs.length - 1]
    : '战斗开始！';
  const visibleDialogueLogs = formattedBattleDialogueLogs.length > 1
    ? [formattedBattleDialogueLogs[formattedBattleDialogueLogs.length - 2], latestLog]
    : [latestLog];
  const playerChargingMoveKey = battlePlayerMon?.volatileStatuses?.chargingMove;
  const isBattleInputLocked = battlePhase !== 'active' || openingIntro || openingSendOut;
  const activePlayerFainted = isBattleMonFainted(battlePlayerMon) || playerStats.currentHp <= 0;
  const forcedSwitchRequired = activePlayerFainted && getAliveBattleBench(playerTeam, battlePlayerMon?.id).length > 0;
  const basePlayerCommandDisabled = isBattleInputLocked || turn !== 'player' || isBusy || isThrowingPokeball;
  const activePlayerActionDisabled = basePlayerCommandDisabled || activePlayerFainted;
  const teamCommandDisabled = basePlayerCommandDisabled || (!!playerChargingMoveKey && !forcedSwitchRequired);
  const noMpTeamSwitchDisabled = teamCommandDisabled || !getAliveBattleBench(playerTeam, battlePlayerMon?.id).length;
  const playerAffordableMoveKeys = getAffordableBattleMoveKeys(battlePlayerMon);
  const playerHasBattleRecoveryPath = hasBattleRecoveryPath({
    playerTeam,
    playerInventory,
    canRun: resolvedEscapeRule.canRun,
  });
  const playerOutOfMpLocked = Boolean(
    battlePlayerMon &&
    !activePlayerFainted &&
    !playerChargingMoveKey &&
    normalizeRuntimeKnownMoveKeys(battlePlayerMon.moves).length > 0 &&
    playerAffordableMoveKeys.length === 0
  );
  const playerNoMpHardLock = playerOutOfMpLocked && !playerHasBattleRecoveryPath;
  const runHintText = resolvedEscapeRule.canRun
    ? (resolvedEscapeRule.inlineHint || '野外战可以尝试脱离战斗。')
    : (resolvedEscapeRule.inlineHint || resolvedEscapeRule.blockedReason || '当前战斗无法逃跑。');
  const battleFeedbackKind = battleFeedbackCue?.kind || '';
  // --- End Data Normalization ---

  const handleNoMpOpenBag = useCallback(() => {
    if (activePlayerActionDisabled || !!playerChargingMoveKey) return;
    gameAudio.playUiSelect();
    setShowBag(true);
  }, [activePlayerActionDisabled, playerChargingMoveKey]);

  const handleNoMpOpenTeam = useCallback(() => {
    if (noMpTeamSwitchDisabled) return;
    gameAudio.playUiSelect();
    setShowTeam(true);
  }, [noMpTeamSwitchDisabled]);

  const handleMovePress = useCallback(async (moveKey) => {
    if (activePlayerFainted) {
      addLog?.('宝可梦倒下了，请选择下一只。');
      setShowControls('main');
      return;
    }
    if (isBattleInputLocked || turn !== 'player' || isBusy || isThrowingPokeball) return;
    gameAudio.playUiConfirm();
    setIsBusy(true);
    try {
      await onMove(moveKey);
    } finally {
      if (isBattleSceneMountedRef.current) {
        setIsBusy(false);
      }
    }
  }, [activePlayerFainted, addLog, isBattleInputLocked, isBusy, isThrowingPokeball, onMove, turn]);

  const triggerBlockedRunFeedback = useCallback(() => {
    if (resolvedEscapeRule.canRun) return;
    if (battleFeedbackTimerRef.current) {
      clearTimeout(battleFeedbackTimerRef.current);
      battleFeedbackTimerRef.current = null;
    }

    setBattleFeedbackCue({
      kind: resolvedEscapeRule.kind || 'trainer',
      title: resolvedEscapeRule.feedbackTitle || '无法逃跑',
      message: resolvedEscapeRule.feedbackMessage || resolvedEscapeRule.blockedReason || '',
    });

    battleFeedbackTimerRef.current = window.setTimeout(() => {
      battleFeedbackTimerRef.current = null;
      if (isBattleSceneMountedRef.current) {
        setBattleFeedbackCue(null);
      }
    }, Math.max(520, resolvedEscapeRule.feedbackDurationMs || 720));
  }, [resolvedEscapeRule]);

  const handleRunPress = useCallback(async () => {
    if (activePlayerFainted) {
      addLog?.('宝可梦倒下了，请选择下一只。');
      setShowControls('main');
      return;
    }
    if (isBattleInputLocked || !!playerChargingMoveKey || turn !== 'player' || isBusy || isThrowingPokeball) return;
    if (!resolvedEscapeRule.canRun) {
      return;
    }
    gameAudio.playUiSelect();
    setIsBusy(true);
    try {
      await onRun?.();
    } finally {
      if (isBattleSceneMountedRef.current) {
        setIsBusy(false);
      }
    }
  }, [activePlayerFainted, addLog, isBattleInputLocked, isBusy, isThrowingPokeball, onRun, playerChargingMoveKey, resolvedEscapeRule.canRun, turn]);

  useEffect(() => {
    if (!battleFeedbackCue) return;
    if (battlePhase !== 'active' || turn !== 'player') {
      if (battleFeedbackTimerRef.current) {
        clearTimeout(battleFeedbackTimerRef.current);
        battleFeedbackTimerRef.current = null;
      }
      setBattleFeedbackCue(null);
    }
  }, [battleEnemyMon?.id, battleFeedbackCue, battlePhase, turn]);

  useEffect(() => {
    let index = 0;
    setTypedLog('');
    const timer = setInterval(() => {
      index += 1;
      setTypedLog(latestLog.slice(0, index));
      if (index >= latestLog.length) clearInterval(timer);
    }, BATTLE_TEXT_CHAR_MS);
    return () => clearInterval(timer);
  }, [latestLog]);

  const battleSceneClass = useMemo(() => {
    const stableEnvironment = normalizeBattleEnvironment({
      ...(battleEnvironment || {}),
      battleKind: battleEnvironment?.battleKind || battleKind
    });
    if (isKnownBattleSceneClass(stableEnvironment?.sceneClass)) {
      return stableEnvironment.sceneClass;
    }
    return battleKind === 'trainer' ? 'battle-scene-training-ground' : 'battle-scene-meadow';
  }, [battleEnvironment, battleKind]);
  const battleSceneRoleClass = useMemo(() => {
    if (battleKind !== 'trainer') return 'battle-scene-role-wild';
    return `battle-scene-role-${normalizeTrainerRole(battleEnvironment?.eventRole || battleEnvironment?.eventType || 'normal')}`;
  }, [battleEnvironment?.eventRole, battleEnvironment?.eventType, battleKind]);

  // --- Modal Screen Rendering ---
  if (showBag) {
    return (
      <Suspense fallback={<DeferredPanelFallback title="背包加载中..." />}>
        <DeferredUnifiedBagScreen
          inventory={playerInventory}
          onClose={() => setShowBag(false)}
          onUseItem={onUseItem}
          onUsePotion={onUsePotion}
          onUseExpPotion={onUseExpPotion}
          onBattleItemConsumed={({ itemType }) => {
            if (itemType !== 'potion') return;
            setShowBag(false);
            setShowControls('main');
            setIsBusy(true);
          }}
          team={playerTeam && playerTeam.length > 0 ? playerTeam : [battlePlayerMon].filter(Boolean)}
          isBattle={true}
          canUseBattleBalls={canUsePokeballs}
          addLog={addLog}
        />
      </Suspense>
    );

  }

  if (showTeam) {
    return (
      <Suspense fallback={<DeferredPanelFallback title="队伍加载中..." />}>
        <DeferredTeamScreen
          team={playerTeam}
          onSelect={async (id) => {
            if (id === battlePlayerMon?.id) return false;
            setIsBusy(true);
            setShowTeam(false);
            setShowControls('main');
            const switched = await onSwitch?.(id);
            if (switched === false) {
              if (isBattleSceneMountedRef.current) {
                setIsBusy(false);
                setShowTeam(true);
              }
              return false;
            }
            if (isBattleSceneMountedRef.current) {
              setIsBusy(false);
            }
            return false;
          }}
          activeId={battlePlayerMon?.id}
          onBack={() => {
            if (forcedSwitchRequired) {
              addLog?.('宝可梦倒下了，请选择下一只。');
              return;
            }
            setShowTeam(false);
          }}
        />
      </Suspense>
    );

  }

  // Dex is removed from battle screen for a cleaner UI
  // --- End Modal Rendering ---

  const playerBattleSpriteSize = BATTLE_SPRITE_CONTAINER_BASE_UNIT * BATTLE_PLAYER_SPRITE_MULTIPLIER;

  if (openingIntro) {
    return (
      <div className="battle-intro-page relative h-full overflow-hidden">
        <BattleIntroOverlay
          enemyMon={displayEnemyMon}
          enemyTeam={enemyTeam}
          battleKind={battleKind}
          battleEnvironment={battleEnvironment}
          onComplete={onOpeningIntroComplete}
        />
      </div>
    );
  }

  return (
    <div
      className={`battle-modern-shell h-full flex flex-col relative overflow-hidden ${battleFeedbackKind ? `battle-modern-shell--feedback battle-modern-shell--feedback-${battleFeedbackKind}` : ''}`}
      style={{
        '--battle-player-slot-size': `${playerBattleSpriteSize}px`,
      }}
    >
      {/* ══ 战斗场景：吃掉剩余高度，底部面板不再挤出黑色空区 ══ */}
      <div className={`anime-battle-bg ${battleSceneClass} ${battleSceneRoleClass} relative flex-1 min-h-0 overflow-hidden ${battleFeedbackKind ? `battle-scene-feedback battle-scene-feedback--${battleFeedbackKind}` : ''}`}>
        <div className="battle-environment-props" aria-hidden="true">
          <span className="battle-env-prop battle-env-prop--horizon" />
          <span className="battle-env-prop battle-env-prop--left" />
          <span className="battle-env-prop battle-env-prop--right" />
          <span className="battle-env-prop battle-env-prop--foreground" />
          <span className="battle-env-prop battle-env-prop--particles" />
        </div>
        <AttackEffect effect={attackEffect} onDone={() => setAttackEffect(null)} />
        <div className="battle-atmosphere" />
        {battleFeedbackCue && (
          <div className={`battle-lock-feedback battle-lock-feedback--${battleFeedbackCue.kind || 'trainer'}`} role="status" aria-live="polite">
            <span className="battle-lock-feedback__icon">
              <i className={`fa-solid ${
                battleFeedbackCue.kind === 'boss'
                  ? 'fa-crown'
                  : battleFeedbackCue.kind === 'challenge'
                    ? 'fa-shield-halved'
                    : 'fa-ban'
              }`}></i>
            </span>
            <div className="battle-lock-feedback__copy">
              <span className="battle-lock-feedback__title">{battleFeedbackCue.title}</span>
              <span className="battle-lock-feedback__message">{battleFeedbackCue.message}</span>
            </div>
          </div>
        )}

        {/* 敌方 HUD：左上角（敌方精灵在右上，不重叠）*/}
        <BattleHudCard
          mon={displayEnemyMon}
          stats={enemyStats}
          hint={enemyHint}
          className="battle-hud-enemy"
          partyBalls={battleKind === 'trainer' ? (
            <BattlePartyBalls
              team={enemyTeam}
              activeId={activeEnemyId || battleEnemyMon?.id}
              className="battle-party-balls--hud"
              aceId={battleEnvironment?.eventRole === 'boss' ? enemyTeam[enemyTeam.length - 1]?.id : null}
            />
          ) : null}
        />

        {/* 精灵层 */}
        <div className="absolute inset-0 z-10">
          {/* 敌方精灵：右上 */}
          <div className={`battle-sprite-slot battle-sprite-enemy ${enemySpriteClass} ${battleFeedbackKind ? `battle-sprite-slot--feedback battle-sprite-slot--feedback-${battleFeedbackKind}` : ''}`}>
            <div className={openingIntro ? 'battle-intro-enemy-stage' : 'battle-sprite-float'}>
              <MonsterSprite monster={displayEnemyMon} isBattleContext={true} sizeMultiplier={BATTLE_ENEMY_SPRITE_MULTIPLIER} />
            </div>
          </div>
          {/* 我方精灵：左下（背面）*/}
          <div className={`battle-sprite-slot battle-sprite-player ${playerSpriteClass}`}>
            <div className={openingSendOut ? 'battle-opening-send-stage' : 'battle-sprite-float battle-sprite-float-delayed'}>
              <MonsterSprite monster={displayPlayerMon} isBack={true} isBattleContext={true} sizeMultiplier={BATTLE_PLAYER_SPRITE_MULTIPLIER} />
            </div>
          </div>
        </div>

        {/* 我方 HUD：右下角（我方精灵在左下，不重叠）*/}
        <BattleHudCard
          mon={displayPlayerMon}
          stats={playerStats}
          hint={playerHint}
          playerGold={playerGold}
          showExp={true}
          className="battle-hud-player"
        />

        {battlePhase === 'sendout' && (
          <BattleSendOutOverlay mode={sendOutMode} onComplete={onOpeningSendOutComplete} />
        )}
        {switchSendOutMode && (
          <BattleSendOutOverlay mode={switchSendOutMode} variant="switch" />
        )}
      </div>

      {/* ══ 指令面板：压缩底部按钮区，给战斗画面留更多空间 ══ */}
      <div className="battle-command-panel flex-none overflow-hidden">
        {/* 对话框 */}
	        <div className="px-3 pt-2 shrink-0">
	          <div className="battle-dialogue" id="battle-log">
	            <span className="battle-dialogue-caret">&gt;</span>
	            <div className="battle-dialogue-lines" aria-live="polite">
	              {visibleDialogueLogs.map((log, index) => {
	                const isLatest = index === visibleDialogueLogs.length - 1;
	                const displayText = isLatest ? (typedLog || latestLog) : log;
	                return (
	                  <span
	                    key={`${isLatest ? 'latest' : 'previous'}-${log}`}
	                    className={`battle-dialogue-line ${isLatest ? 'battle-dialogue-line--latest battle-dialogue-text' : 'battle-dialogue-line--previous'}`}
	                    title={log}
	                  >
	                    {displayText}
	                  </span>
	                );
	              })}
	            </div>
	          </div>
	        </div>

        {/* 按钮区：flex-1 分配剩余，每个按钮有上限高度 */}
        <div className="battle-command-controls min-h-0 px-3 pt-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] flex flex-col">
          {showControls === 'main' ? (
            <>
              <div className="battle-command-main-grid min-h-0">
                <BattleActionButton
                  label={playerChargingMoveKey ? "释放" : "战斗"}
                  icon="fa-burst"
                  variant="attack"
                  onClick={() => {
                    if (playerOutOfMpLocked) addLog?.(getNoMpBattleHint(battlePlayerMon));
                    setShowControls('moves');
                  }}
                  disabled={activePlayerActionDisabled}
                />
                <BattleActionButton
                  label="背包"
                  icon="fa-bag-shopping"
                  variant="bag"
                  onClick={() => setShowBag(true)}
                  disabled={activePlayerActionDisabled || !!playerChargingMoveKey}
                />
                <BattleActionButton
                  label="队伍"
                  icon="fa-people-group"
                  variant="party"
                  onClick={() => setShowTeam(true)}
                  disabled={teamCommandDisabled}
                />
                <BattleActionButton
                  label="逃跑"
                  icon="fa-person-running"
                  variant="run"
                  onClick={handleRunPress}
                  title={!resolvedEscapeRule.canRun && resolvedEscapeRule.blockedReason ? resolvedEscapeRule.blockedReason : ''}
                  note={resolvedEscapeRule.canRun ? resolvedEscapeRule.buttonNote : (resolvedEscapeRule.buttonNote || '不可逃跑')}
                  locked={!resolvedEscapeRule.canRun}
                  disabled={activePlayerActionDisabled || !!playerChargingMoveKey}
                />
              </div>
              <div className={`battle-command-tip battle-command-tip--${resolvedEscapeRule.canRun ? 'wild' : (resolvedEscapeRule.kind || 'trainer')}`}>
                <i className={`fa-solid ${resolvedEscapeRule.canRun ? 'fa-person-running' : 'fa-lock'}`}></i>
                <span>{runHintText}</span>
              </div>
            </>
          ) : (
            <div className={`battle-move-stack flex flex-col min-h-0 ${playerOutOfMpLocked ? 'battle-move-stack--no-mp' : ''}`}>
              <div
                className={`battle-move-grid min-h-0 ${playerOutOfMpLocked ? 'battle-move-grid--blocked' : ''}`}
                style={{ gridTemplateRows: `repeat(${moveGridRowCount}, minmax(0, 1fr))` }}
              >
                {(battlePlayerMon?.moves || []).map((moveKey) => {
                  const move = MOVES[moveKey];
                  if (!move) return null;
                  const isChargingReleaseMove = playerChargingMoveKey === moveKey;
                  const moveCost = getMoveMpCost(move);
                  const hasEnoughMp = isChargingReleaseMove || playerStats.currentMp >= moveCost;
                  const isMoveDisabledByCharge = !!playerChargingMoveKey && !isChargingReleaseMove;
                  const effectivenessMeta = getMoveEffectivenessMeta(move, battleEnemyMon, battlePlayerMon);
                  const shouldShowEffectiveness = Boolean(effectivenessMeta.label);
                  const movePowerDisplay = getMovePrimaryEffectDisplay(move);
                  const moveCategoryLabel = MOVE_CATEGORY_LABELS[move.category] || '招式';
                  const moveEffectLabels = getMoveEffectLabels(move);
                  const moveTitle = [
                    effectivenessMeta.description,
                    `${movePowerDisplay.label} ${movePowerDisplay.value}`,
                    moveCategoryLabel,
                    `MP ${moveCost}`,
                    ...moveEffectLabels
                  ].filter(Boolean).join(' · ');
                  return (
                    <button
                      key={moveKey}
                      onClick={() => handleMovePress(moveKey)}
                      disabled={activePlayerActionDisabled || !hasEnoughMp || isMoveDisabledByCharge}
                      className={`battle-move-button battle-move-button--${move.category || 'unknown'}`}
                      title={moveTitle}
                    >
                      <div className="battle-move-button__top">
                        <span className="battle-move-button__name">{isChargingReleaseMove ? `释放${move.name}` : move.name}</span>
                        <div className="battle-move-button__badges">
                          {shouldShowEffectiveness && (
                            <span className={`battle-move-effectiveness ${effectivenessMeta.className}`}>
                              {effectivenessMeta.label}
                            </span>
                          )}
                          <TypeBadge type={move.type} small />
                        </div>
                      </div>
                      <div className="battle-move-button__details">
                        <span className="battle-move-button__detail battle-move-button__detail--power">
                          <small>{movePowerDisplay.label}</small><b>{movePowerDisplay.value}</b>
                        </span>
                        <span className={`battle-move-button__category battle-move-button__category--${move.category || 'unknown'}`}>
                          {moveCategoryLabel}
                        </span>
                        <span className={hasEnoughMp ? 'battle-move-button__mp' : 'battle-move-button__mp battle-move-button__mp--low'}>
                          {isChargingReleaseMove ? '蓄力完成' : <><small>MP</small><b>{moveCost}</b></>}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setShowControls('main')}
                className="battle-back-button shrink-0"
                disabled={playerOutOfMpLocked}
              >
                <i className="fa-solid fa-arrow-left"></i>
                <span>返回</span>
              </button>
              {playerOutOfMpLocked && (
                <div className="battle-no-mp-overlay" role="status" aria-live="polite">
                  <div className="battle-no-mp-overlay__card">
                    <div className="battle-no-mp-overlay__badge" aria-hidden="true">
                      <i className="fa-solid fa-bolt-lightning"></i>
                      <span>MP 不足</span>
                    </div>
                    <h3 className="battle-no-mp-overlay__title">{getNoMpOverlayTitle(battlePlayerMon)}</h3>
                    <p className="battle-no-mp-overlay__body">{getNoMpOverlayBody()}</p>
                    <div className="battle-no-mp-overlay__meters" aria-label="当前魔力状态">
                      <span className="battle-no-mp-overlay__meter battle-no-mp-overlay__meter--mp">
                        MP {getMonsterCurrentMp(battlePlayerMon)} / {getMonsterMaxMp(battlePlayerMon)}
                      </span>
                      {playerNoMpHardLock && (
                        <span className="battle-no-mp-overlay__meter battle-no-mp-overlay__meter--warn">
                          没有替补就会战败
                        </span>
                      )}
                    </div>
                    <div className="battle-no-mp-overlay__actions">
                      <button
                        type="button"
                        className="battle-no-mp-action battle-no-mp-action--bag"
                        onClick={handleNoMpOpenBag}
                        disabled={activePlayerActionDisabled || !!playerChargingMoveKey}
                      >
                        <i className="fa-solid fa-bag-shopping" aria-hidden="true"></i>
                        <span>去背包补充</span>
                      </button>
                      <button
                        type="button"
                        className="battle-no-mp-action battle-no-mp-action--team"
                        onClick={handleNoMpOpenTeam}
                        disabled={noMpTeamSwitchDisabled}
                        title={noMpTeamSwitchDisabled ? '当前没有可替换的队伍成员。' : ''}
                      >
                        <i className="fa-solid fa-people-group" aria-hidden="true"></i>
                        <span>换一只上场</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>);

};

const MonsterAcquisitionDecisionModal = ({
  pending,
  party = [],
  storageBox = [],
  onSendToStorage,
  onReplacePartyMember,
  onReleasePending
}) => {
  const [mode, setMode] = useState('choice');
  const [isBusy, setIsBusy] = useState(false);
  if (!pending?.monster) return null;

  const monster = pending.monster;
  const sourceLabel = pending.source === 'teacher_reward'
    ? '老师奖励的宝可梦'
    : pending.source === 'map_reward'
    ? '地图奖励的宝可梦'
    : '捕捉到的宝可梦';
  const canStore = storageBox.length < MAX_STORAGE_SIZE;

  const handleSendToStorage = async () => {
    if (!onSendToStorage || isBusy) return;
    setIsBusy(true);
    try {
      await onSendToStorage();
    } finally {
      setIsBusy(false);
    }
  };

  const handleReplaceChoice = async (partyId) => {
    if (!onReplacePartyMember || isBusy) return;
    setIsBusy(true);
    try {
      await onReplacePartyMember(partyId);
    } finally {
      setIsBusy(false);
    }
  };

  const handleReleaseChoice = async () => {
    if (!onReleasePending || isBusy) return;
    setIsBusy(true);
    try {
      await onReleasePending();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      className="game-screen-dialog-overlay game-screen-dialog-overlay--acquisition"
      role="dialog"
      aria-modal="true"
      aria-labelledby="monster-acquisition-title"
    >
      <div className="game-card flex max-h-[calc(100%_-_1.5rem)] w-full max-w-md flex-col overflow-hidden animate-bounce-in">
        <div className="flex items-start justify-between gap-3 border-b border-black/10 p-4">
          <div>
            <h3 id="monster-acquisition-title" className="text-xl font-black text-slate-900">队伍已满，选择安置方式</h3>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {sourceLabel}: {monster.name} Lv.{monster.level}
            </p>
          </div>
          <div className="h-16 w-16 shrink-0 rounded-full bg-black/10 p-2">
            <img src={monster.sprite} onError={handlePokemonImageError} alt={monster.name} className="h-full w-full object-contain" style={{ imageRendering: 'auto' }} />
          </div>
        </div>

        {mode === 'choice' ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-4 rounded-lg bg-black/5 p-3 text-sm font-bold text-slate-700">
              出战队伍最多 {MAX_PARTY_SIZE} 只。你可以把它放入仓库、替换队伍中的一只，或者放弃它。
            </div>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={handleSendToStorage}
                disabled={!canStore || isBusy}
                className="game-primary-button min-h-10"
              >
                <i className="fa-solid fa-box-archive"></i>
                {canStore ? `放入仓库 (${storageBox.length}/${MAX_STORAGE_SIZE})` : '仓库已满'}
              </button>
              <button
                type="button"
                onClick={() => setMode('replace')}
                disabled={isBusy}
                className="game-soft-button min-h-10"
              >
                <i className="fa-solid fa-right-left"></i>
                替换队伍中的一只
              </button>
              <button
                type="button"
                onClick={() => setMode('releaseConfirm')}
                disabled={isBusy}
                className="game-danger-button min-h-10"
              >
                <i className="fa-solid fa-person-walking-arrow-right"></i>
                放弃这只宝可梦
              </button>
            </div>
          </div>
        ) : mode === 'releaseConfirm' ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-rose-500 text-white shadow-lg">
                <i className={`fa-solid ${isBusy ? 'fa-rotate fa-spin' : 'fa-person-walking-arrow-right'}`}></i>
              </div>
              <h4 className="text-lg font-black text-slate-900">放弃 {monster.name}？</h4>
              <p className="mt-2 text-sm font-bold leading-relaxed text-slate-600">
                它将返回野外，之后无法找回。确认后会同步到云端进度。
              </p>
            </div>
            <div className="mt-4 grid gap-2">
              <button type="button" onClick={() => setMode('choice')} disabled={isBusy} className="game-soft-button min-h-10">
                <i className="fa-solid fa-arrow-left"></i>
                再想想
              </button>
              <button type="button" onClick={handleReleaseChoice} disabled={isBusy} className="game-danger-button min-h-10">
                <i className={`fa-solid ${isBusy ? 'fa-rotate fa-spin' : 'fa-person-walking-arrow-right'}`}></i>
                {isBusy ? '同步中' : '确认放弃'}
              </button>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <button type="button" onClick={() => setMode('choice')} disabled={isBusy} className="game-soft-button mb-3 min-h-9 text-sm">
              <i className="fa-solid fa-arrow-left"></i>
              返回安置选项
            </button>
            <CollectionGrid>
              {party.map((partyMon) => (
                <CollectionCard key={partyMon.id} onClick={() => handleReplaceChoice(partyMon.id)}>
                  <div className="game-collection-card__sprite-wrap">
                    <img src={partyMon.sprite} onError={handlePokemonImageError} alt={partyMon.name} className="game-collection-card__sprite" style={{ imageRendering: 'auto' }} />
                  </div>
                  <div className="game-collection-card__name">{partyMon.name}</div>
                  <div className="game-collection-card__meta">Lv.{partyMon.level}</div>
                  <div className="game-collection-card__types">
                    {partyMon.type2 && <TypeBadge type={partyMon.type2} small />}
                    <TypeBadge type={partyMon.type} small />
                  </div>
                </CollectionCard>
              ))}
            </CollectionGrid>
          </div>
        )}
      </div>
    </div>
  );
};

const BagScreen = ({ playerInventory = [], activePlayerMon, activeEnemyMon, onUseItem, onBack, addLog, turn, playerTeam = [], onUsePotion, onUseExpPotion, canUsePokeballs = true }) => {
  // Determine if we are in battle context (activeEnemyMon exists)
  const isBattle = !!activeEnemyMon;
  // Fallback to active mon if team is missing
  const effectiveTeam = playerTeam && playerTeam.length > 0 ? playerTeam : (activePlayerMon ? [activePlayerMon] : []);

  return (
    <UnifiedBagScreen
      inventory={playerInventory}
      onClose={onBack}
      onUseItem={onUseItem}
      onUsePotion={onUsePotion}
      onUseExpPotion={onUseExpPotion}
      team={effectiveTeam}
      isBattle={isBattle}
      canUseBattleBalls={canUsePokeballs}
      activeMonId={activePlayerMon?.id}
      addLog={addLog}
    />
  );
};

// --- Main App Logic ---
const DEFAULT_INVENTORY = [
  { itemType: 'pokeball', itemKey: 'pokeball_basic', quantity: 5 },
  { itemType: 'pokeball', itemKey: 'pokeball_great', quantity: 3 },
  { itemType: 'pokeball', itemKey: 'pokeball_ultra', quantity: 1 },
  { itemType: 'potion', itemKey: 'super_potion', quantity: 3 },
  { itemType: 'potion', itemKey: 'hyper_potion', quantity: 1 },
  { itemType: 'potion', itemKey: 'potion', quantity: 5 },
];

const CLOUD_SAVE_DEBOUNCE_MS = 650;
const CLOUD_SAVE_MAX_WAIT_MS = 3000;
const CLOUD_SAVE_SYNC_META_KEY = '_sync';
const WORLD_MAP_CONTENT_VERSION = 45;
const DEFAULT_WORLD_MAP_NAME = 'GodotMap';

const FAST_TRAVEL_SYMBOL_ICONS = {
  seed: 'fa-seedling',
  leaf: 'fa-leaf',
  water: 'fa-water',
  wheat: 'fa-wheat-awn',
  anchor: 'fa-anchor',
  moon: 'fa-moon',
  hex: 'fa-dice-d6',
  camp: 'fa-campground',
  flag: 'fa-flag'
};

const BATTLE_SCENE_CLASSES = new Set([
  'battle-scene-valley-camp',
  'battle-scene-lake',
  'battle-scene-meadow',
  'battle-scene-dusk',
  'battle-scene-sunny-meadow',
  'battle-scene-flower-hill',
  'battle-scene-forest',
  'battle-scene-lake-reeds',
  'battle-scene-wetland',
  'battle-scene-southeast-meadow',
  'battle-scene-farm-field',
  'battle-scene-pirate-shore',
  'battle-scene-graveyard',
  'battle-scene-hex-ruins',
  'battle-scene-survival-ridge',
  'battle-scene-star-peak',
  'battle-scene-training-ground',
]);

const BATTLE_SCENE_BY_ZONE_ID = {
  camp_grass: 'battle-scene-valley-camp',
  route102_grass: 'battle-scene-sunny-meadow',
  route102_meadow: 'battle-scene-sunny-meadow',
  route102_thicket: 'battle-scene-forest',
  route102_lake: 'battle-scene-lake-reeds',
  route102_clearing: 'battle-scene-flower-hill',
  route102_pass: 'battle-scene-southeast-meadow',
  forest_grass: 'battle-scene-forest',
  forest_moss: 'battle-scene-forest',
  forest_spirit: 'battle-scene-dusk',
  forest_meadow: 'battle-scene-flower-hill',
  forest_pond: 'battle-scene-lake-reeds',
  sunny_meadow: 'battle-scene-sunny-meadow',
  upper_flower_grass: 'battle-scene-flower-hill',
  grove_grass: 'battle-scene-forest',
  lake_north_reeds: 'battle-scene-lake-reeds',
  southeast_meadow: 'battle-scene-southeast-meadow',
  meadow_west_grass: 'battle-scene-sunny-meadow',
  meadow_south_grass: 'battle-scene-southeast-meadow',
  meadow_east_flowers: 'battle-scene-flower-hill',
  lake_west_reeds: 'battle-scene-lake-reeds',
  lake_south_reeds: 'battle-scene-wetland',
  lake_east_reeds: 'battle-scene-lake',
  farm_north_rows: 'battle-scene-farm-field',
  farm_west_rows: 'battle-scene-farm-field',
  farm_east_rows: 'battle-scene-farm-field',
  shore_dune_grass: 'battle-scene-pirate-shore',
  shore_south_grass: 'battle-scene-pirate-shore',
  shore_wreck_grass: 'battle-scene-pirate-shore',
  grave_north_thicket: 'battle-scene-graveyard',
  grave_south_thicket: 'battle-scene-graveyard',
  grave_moon_grass: 'battle-scene-graveyard',
  hex_north_ruins: 'battle-scene-hex-ruins',
  hex_west_ruins: 'battle-scene-hex-ruins',
  hex_east_ruins: 'battle-scene-hex-ruins',
  ridge_north_grass: 'battle-scene-survival-ridge',
  ridge_south_grass: 'battle-scene-survival-ridge',
  ridge_east_grass: 'battle-scene-survival-ridge',
  peak_west_grass: 'battle-scene-star-peak',
  peak_south_grass: 'battle-scene-star-peak',
  peak_east_grass: 'battle-scene-star-peak',
};

const BATTLE_SCENE_BY_MAP_NAME = {
  GodotMap: 'battle-scene-valley-camp',
  GodotMapV2: 'battle-scene-sunny-meadow',
  GodotMapV2_MistLake: 'battle-scene-lake-reeds',
  GodotMapV2_FarmTown: 'battle-scene-farm-field',
  GodotMapV2_PirateShore: 'battle-scene-pirate-shore',
  GodotMapV2_Graveyard: 'battle-scene-graveyard',
  GodotMapV2_HexRuins: 'battle-scene-hex-ruins',
  GodotMapV2_SurvivalRidge: 'battle-scene-survival-ridge',
  GodotMapV2_BossHighland: 'battle-scene-star-peak',
};

const BATTLE_SCENE_BY_TERRAIN = {
  valley: 'battle-scene-valley-camp',
  meadow: 'battle-scene-sunny-meadow',
  grass: 'battle-scene-sunny-meadow',
  tall_grass: 'battle-scene-sunny-meadow',
  pale_grass: 'battle-scene-graveyard',
  forest: 'battle-scene-forest',
  lake: 'battle-scene-lake-reeds',
  water: 'battle-scene-lake-reeds',
  reeds: 'battle-scene-lake-reeds',
  farm: 'battle-scene-farm-field',
  wheat: 'battle-scene-farm-field',
  sand: 'battle-scene-pirate-shore',
  shore: 'battle-scene-pirate-shore',
  grave: 'battle-scene-graveyard',
  graveyard: 'battle-scene-graveyard',
  ruins: 'battle-scene-hex-ruins',
  hex: 'battle-scene-hex-ruins',
  ridge: 'battle-scene-survival-ridge',
  camp: 'battle-scene-survival-ridge',
  peak: 'battle-scene-star-peak',
  highland: 'battle-scene-star-peak',
  trainer: 'battle-scene-training-ground',
  8: 'battle-scene-sunny-meadow',
  11: 'battle-scene-lake-reeds',
};

const isKnownBattleSceneClass = (sceneClass) =>
  typeof sceneClass === 'string' && BATTLE_SCENE_CLASSES.has(sceneClass);

const toBattleEnvironmentText = (value) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';

const toBattleEnvironmentNumber = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const normalizeBattleEnvironmentPosition = (position) => {
  if (!position || typeof position !== 'object') return null;
  const x = toBattleEnvironmentNumber(position.x);
  const y = toBattleEnvironmentNumber(position.y);
  if (x === null || y === null) return null;
  const direction = toBattleEnvironmentText(position.direction);
  return {
    x,
    y,
    ...(direction ? { direction } : {})
  };
};

const normalizeBattleEventCompletion = (completion, fallbackEnvironment = null) => {
  const source = completion && typeof completion === 'object' ? completion : {};
  const fallback = fallbackEnvironment && typeof fallbackEnvironment === 'object' ? fallbackEnvironment : {};
  const mapName = toBattleEnvironmentText(
    source.mapName ||
    source.currentMapName ||
    fallback.mapName ||
    fallback.currentMapName
  );
  const eventType = isConfiguredBattleEventType(source.eventType)
    ? source.eventType
    : (isConfiguredBattleEventType(fallback.eventType) ? fallback.eventType : null);
  const eventId = toBattleEnvironmentText(source.eventId || fallback.eventId);

  if (!mapName || !eventType || !eventId) return null;
  return { mapName, eventType, eventId };
};

const createBattleEventCompletion = ({ currentMapName, mapName, eventType, eventId } = {}) => (
  normalizeBattleEventCompletion({
    mapName: mapName || currentMapName,
    eventType,
    eventId
  })
);

const BATTLE_SCENE_BY_EVENT_ID = {
  valley_trainer_camp_path: 'battle-scene-valley-camp',
  valley_trainer_flower_hill: 'battle-scene-flower-hill',
  valley_trainer_lake_path: 'battle-scene-lake-reeds',
};

const BATTLE_SCENE_EVENT_KEYWORDS = [
  { pattern: /flower|花丘|花地|花/i, sceneClass: 'battle-scene-flower-hill' },
  { pattern: /lake|mist|reed|湖|苇|水边|芦/i, sceneClass: 'battle-scene-lake-reeds' },
  { pattern: /forest|grove|thicket|林|密林|树/i, sceneClass: 'battle-scene-forest' },
  { pattern: /farm|field|wheat|农|田|麦|风车/i, sceneClass: 'battle-scene-farm-field' },
  { pattern: /shore|pirate|dune|wreck|海岸|沙丘|沉船|码头/i, sceneClass: 'battle-scene-pirate-shore' },
  { pattern: /grave|moon|墓|幽灵|月影/i, sceneClass: 'battle-scene-graveyard' },
  { pattern: /hex|ruin|遗迹|六角|机关/i, sceneClass: 'battle-scene-hex-ruins' },
  { pattern: /ridge|survival|铁木|山脊/i, sceneClass: 'battle-scene-survival-ridge' },
  { pattern: /peak|highland|star|高地|星雾|峰/i, sceneClass: 'battle-scene-star-peak' },
  { pattern: /meadow|grass|草径|草坡|草丛/i, sceneClass: 'battle-scene-sunny-meadow' },
];

const resolveBattleSceneClassFromText = (...parts) => {
  const normalizedParts = parts.map(toBattleEnvironmentText).filter(Boolean);
  const source = normalizedParts.join(' ');
  if (!source) return null;
  const matchedRule = BATTLE_SCENE_EVENT_KEYWORDS.find((rule) => rule.pattern.test(source));
  return matchedRule?.sceneClass || null;
};

const resolveBattleSceneClassFromPosition = ({ mapName, eventPosition, triggerPosition } = {}) => {
  const normalizedMapName = toBattleEnvironmentText(mapName);
  const position = normalizeBattleEnvironmentPosition(eventPosition) || normalizeBattleEnvironmentPosition(triggerPosition);
  if (!normalizedMapName || !position) return null;
  const zones = getAdventureMapInfo(normalizedMapName)?.encounterZones || [];
  if (!Array.isArray(zones) || zones.length === 0) return null;

  let nearestZone = null;
  let nearestScore = Infinity;
  for (const zone of zones) {
    if (!zone?.id) continue;
    const sceneClass = BATTLE_SCENE_BY_ZONE_ID[zone.id];
    if (!isKnownBattleSceneClass(sceneClass)) continue;
    const x = Number(zone.x);
    const y = Number(zone.y);
    const width = Number(zone.width);
    const height = Number(zone.height);
    if (![x, y, width, height].every(Number.isFinite)) continue;
    const isInsideZone =
      position.x >= x &&
      position.x < x + width &&
      position.y >= y &&
      position.y < y + height;
    if (isInsideZone) return sceneClass;

    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const dx = position.x - centerX;
    const dy = position.y - centerY;
    const score = dx * dx + dy * dy;
    if (score < nearestScore) {
      nearestScore = score;
      nearestZone = zone;
    }
  }

  return nearestZone?.id ? BATTLE_SCENE_BY_ZONE_ID[nearestZone.id] || null : null;
};

const resolveBattleSceneClass = ({
  battleKind = 'wild',
  mapName,
  mapInfo,
  zoneId,
  zoneName,
  terrainType,
  sceneClass,
  eventId,
  eventType,
  eventRole,
  eventName,
  eventTitle,
  eventPosition,
  triggerPosition,
} = {}) => {
  if (isKnownBattleSceneClass(sceneClass)) return sceneClass;

  const normalizedZoneId = toBattleEnvironmentText(zoneId);
  if (BATTLE_SCENE_BY_ZONE_ID[normalizedZoneId]) {
    return BATTLE_SCENE_BY_ZONE_ID[normalizedZoneId];
  }

  const explicitEventScene = BATTLE_SCENE_BY_EVENT_ID[toBattleEnvironmentText(eventId)];
  if (isKnownBattleSceneClass(explicitEventScene)) return explicitEventScene;

  const positionedScene = resolveBattleSceneClassFromPosition({
    mapName,
    eventPosition,
    triggerPosition
  });
  if (isKnownBattleSceneClass(positionedScene)) return positionedScene;

  const eventTextScene = resolveBattleSceneClassFromText(eventId, eventName, eventTitle, zoneName, mapInfo);
  if (isKnownBattleSceneClass(eventTextScene)) return eventTextScene;

  const normalizedMapName = toBattleEnvironmentText(mapName);
  if (BATTLE_SCENE_BY_MAP_NAME[normalizedMapName]) {
    return BATTLE_SCENE_BY_MAP_NAME[normalizedMapName];
  }

  const stationTerrain = getFastTravelStationMeta(normalizedMapName)?.terrain;
  if (stationTerrain && BATTLE_SCENE_BY_TERRAIN[stationTerrain]) {
    return BATTLE_SCENE_BY_TERRAIN[stationTerrain];
  }

  const normalizedTerrain = typeof terrainType === 'number'
    ? terrainType
    : toBattleEnvironmentText(terrainType).toLowerCase();
  if (BATTLE_SCENE_BY_TERRAIN[normalizedTerrain] && normalizedTerrain !== 'trainer') {
    return BATTLE_SCENE_BY_TERRAIN[normalizedTerrain];
  }

  const name = `${toBattleEnvironmentText(zoneName)} ${toBattleEnvironmentText(mapInfo)}`;
  if (/[山谷营地]/.test(name)) return 'battle-scene-valley-camp';
  if (/[湖水溪岸芦苇湿]/.test(name)) return 'battle-scene-lake-reeds';
  if (/[农庄田垄麦风车]/.test(name)) return 'battle-scene-farm-field';
  if (/[海岸沙丘贝壳码头沉船]/.test(name)) return 'battle-scene-pirate-shore';
  if (/[墓园月影墓幽灵毒]/.test(name)) return 'battle-scene-graveyard';
  if (/[遗迹六角机关多边兽]/.test(name)) return 'battle-scene-hex-ruins';
  if (/[营地铁木山脊岩钢]/.test(name)) return 'battle-scene-survival-ridge';
  if (/[高地星雾峰顶龙]/.test(name)) return 'battle-scene-star-peak';
  if (/[密林森林树]/.test(name)) return 'battle-scene-forest';
  if (/[花丘花]/.test(name)) return 'battle-scene-flower-hill';
  if (/[东南岩坡]/.test(name)) return 'battle-scene-southeast-meadow';
  if (/[草坡草丛]/.test(name)) return 'battle-scene-sunny-meadow';
  if (battleKind === 'trainer') return 'battle-scene-training-ground';

  return 'battle-scene-meadow';
};

const normalizeBattleEnvironment = (environment) => {
  if (!environment || typeof environment !== 'object') return null;

  const battleKind = environment.battleKind === 'trainer' ? 'trainer' : 'wild';
  const zoneId = toBattleEnvironmentText(environment.zoneId);
  const zoneName = toBattleEnvironmentText(environment.zoneName);
  const mapName = toBattleEnvironmentText(environment.mapName);
  const mapInfo = toBattleEnvironmentText(environment.mapInfo);
  const terrainType = typeof environment.terrainType === 'number'
    ? environment.terrainType
    : toBattleEnvironmentText(environment.terrainType);
  const eventId = toBattleEnvironmentText(environment.eventId);
  const eventType = ['trainer', 'boss', 'challenge'].includes(environment.eventType)
    ? environment.eventType
    : '';
  const eventRole = toBattleEnvironmentText(environment.eventRole);
  const trainerStyle = toBattleEnvironmentText(environment.trainerStyle);
  const eventName = toBattleEnvironmentText(environment.eventName);
  const eventTitle = toBattleEnvironmentText(environment.eventTitle);
  const introText = toBattleEnvironmentText(environment.introText);
  const battleEventCompletion = normalizeBattleEventCompletion(environment.battleEventCompletion, {
    mapName: mapName || DEFAULT_WORLD_MAP_NAME,
    eventType,
    eventId
  });
  const eventPosition = normalizeBattleEnvironmentPosition(
    environment.eventPosition || { x: environment.eventX, y: environment.eventY, direction: environment.eventDirection }
  );
  const triggerPosition = normalizeBattleEnvironmentPosition(
    environment.triggerPosition || environment.playerPos || { x: environment.triggerX, y: environment.triggerY, direction: environment.triggerDirection }
  );
  const sceneClass = resolveBattleSceneClass({
    battleKind,
    mapName,
    mapInfo,
    zoneId,
    zoneName,
    terrainType,
    sceneClass: environment.sceneClass,
    eventId,
    eventType,
    eventRole,
    trainerStyle,
    eventName,
    eventTitle,
    eventPosition,
    triggerPosition,
  });

  return {
    battleKind,
    mapName: mapName || DEFAULT_WORLD_MAP_NAME,
    mapInfo,
    zoneId: zoneId || null,
    zoneName,
    terrainType: terrainType === '' ? null : terrainType,
    sceneClass,
    eventId: eventId || null,
    eventType: eventType || null,
    eventRole: eventRole || null,
    trainerStyle: trainerStyle || null,
    eventName: eventName || null,
    eventTitle: eventTitle || null,
    introText: introText || null,
    battleEventCompletion,
    eventPosition,
    triggerPosition,
  };
};

const createBattleEnvironment = ({
  battleKind = 'wild',
  currentMapName = DEFAULT_WORLD_MAP_NAME,
  mapInfo = '',
  zoneId,
  zoneName,
  terrainType,
  sceneClass,
  eventId,
  eventType,
  eventRole,
  trainerStyle,
  eventName,
  eventTitle,
  introText,
  battleEventCompletion,
  eventPosition,
  triggerPosition,
} = {}) => normalizeBattleEnvironment({
  battleKind,
  mapName: currentMapName,
  mapInfo,
  zoneId,
  zoneName,
  terrainType,
  sceneClass,
  eventId,
  eventType,
  eventRole,
  trainerStyle,
  eventName,
  eventTitle,
  introText,
  battleEventCompletion,
  eventPosition,
  triggerPosition,
});

const getBattleVictoryDisplayName = ({
  battleKind = 'wild',
  battleEnvironment = null,
  eventProps = null,
  fallbackName = '对手'
} = {}) => {
  const eventMeta = normalizeBattleEnvironment(battleEnvironment);
  if (battleKind === 'trainer') {
    return (
      eventMeta?.eventName ||
      eventProps?.name ||
      eventMeta?.eventTitle ||
      eventMeta?.zoneName ||
      '训练家'
    );
  }
  return fallbackName || eventMeta?.eventName || eventMeta?.zoneName || '对手';
};

const getDefaultInventory = () => DEFAULT_INVENTORY.map((item) => ({ ...item }));

const consumeInventoryFromSnapshot = (baseSnapshot, itemType, itemKey, amount = 1) => {
  const previousQuantity = getInventoryItemQuantity(baseSnapshot?.playerInventory, itemType, itemKey);
  const safeAmount = Math.trunc(Number(amount));
  if (!Number.isSafeInteger(safeAmount) || safeAmount <= 0 || previousQuantity < safeAmount) {
    return null;
  }
  const nextInventory = consumeInventoryItem(baseSnapshot?.playerInventory, itemType, itemKey, safeAmount);
  return nextInventory;
};
const getDefaultWorldPosition = () => getMapStartPosition(DEFAULT_WORLD_MAP_NAME);

const normalizeWorldPosition = (position, fallback = getDefaultWorldPosition()) => {
  const fallbackPosition = fallback || getDefaultWorldPosition();
  const x = Math.trunc(Number(position?.x));
  const y = Math.trunc(Number(position?.y));
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    return fallbackPosition;
  }
  const direction = typeof position?.direction === 'string' && position.direction.length > 0
    ? position.direction
    : (fallbackPosition.direction || 'down');
  return { x, y, direction };
};

const buildWorldPositionPatch = (baseSnapshot, position) => {
  const fallbackPosition = baseSnapshot?.playerPos || baseSnapshot?.world?.playerPos || getDefaultWorldPosition();
  const safePosition = normalizeWorldPosition(position, fallbackPosition);
  return {
    playerPos: safePosition,
    world: {
      ...(baseSnapshot?.world && typeof baseSnapshot.world === 'object' ? baseSnapshot.world : {}),
      playerPos: safePosition
    }
  };
};

const uniqueStringList = (value) => (
  Array.isArray(value)
    ? Array.from(new Set(value.filter((id) => typeof id === 'string' && id.length > 0)))
    : []
);

const getCurrentDailyRefreshKey = () => {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCurrentDailyRefreshTimestamp = () => new Date().toISOString();

const normalizeWorldState = (world, fallback = {}) => {
  const source = world && typeof world === 'object' ? world : {};
  const currentMapName = typeof fallback.currentMapName === 'string' && fallback.currentMapName.length > 0
    ? fallback.currentMapName
    : (typeof source.currentMapName === 'string' && source.currentMapName.length > 0 ? source.currentMapName : DEFAULT_WORLD_MAP_NAME);
  const playerPos = normalizeWorldPosition(
    fallback.playerPos || source.playerPos,
    getMapStartPosition(currentMapName)
  );
  const dailyRefreshKey = getCurrentDailyRefreshKey();
  const currentDailyRefreshTimestamp = getCurrentDailyRefreshTimestamp();
  const previousDailyRefreshKey = typeof source.dailyRefreshKey === 'string' && source.dailyRefreshKey.length > 0
    ? source.dailyRefreshKey
    : dailyRefreshKey;
  const shouldResetDailyEvents = previousDailyRefreshKey !== dailyRefreshKey;

  return {
    ...source,
    mapContentVersion: WORLD_MAP_CONTENT_VERSION,
    dailyRefreshKey,
    dailyRefreshAppliedAt: shouldResetDailyEvents
      ? currentDailyRefreshTimestamp
      : (typeof source.dailyRefreshAppliedAt === 'string' && source.dailyRefreshAppliedAt.length > 0
        ? source.dailyRefreshAppliedAt
        : currentDailyRefreshTimestamp),
    currentMapName,
    playerPos,
    collectedEventIds: shouldResetDailyEvents ? [] : uniqueStringList(source.collectedEventIds),
    dailyTrainerBattleIds: shouldResetDailyEvents ? [] : uniqueStringList(source.dailyTrainerBattleIds),
    defeatedTrainerIds: uniqueStringList(source.defeatedTrainerIds),
    defeatedBossIds: uniqueStringList(source.defeatedBossIds),
    completedChallengeIds: uniqueStringList(source.completedChallengeIds),
    trainerVictoryCounts: normalizePositiveIntegerMap(source.trainerVictoryCounts),
    usedHealPointIds: uniqueStringList(source.usedHealPointIds),
    flags: source.flags && typeof source.flags === 'object' ? source.flags : {},
    mapProgress: source.mapProgress && typeof source.mapProgress === 'object' ? source.mapProgress : {}
  };
};

function normalizePositiveIntegerMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce((acc, [key, rawCount]) => {
    if (typeof key !== 'string' || key.length === 0) return acc;
    const count = Math.max(0, Math.min(999, Math.trunc(Number(rawCount)) || 0));
    if (count > 0) acc[key] = count;
    return acc;
  }, {});
}

const mergeUniqueStringLists = (...lists) => (
  Array.from(new Set(lists.flatMap(uniqueStringList)))
);

const mergePositiveIntegerMaps = (...maps) => (
  maps.reduce((acc, map) => {
    const normalized = normalizePositiveIntegerMap(map);
    Object.entries(normalized).forEach(([key, count]) => {
      acc[key] = Math.max(acc[key] || 0, count);
    });
    return acc;
  }, {})
);

const hasWorldEventId = (world, key, eventId) => (
  typeof eventId === 'string' &&
  eventId.length > 0 &&
  uniqueStringList(world?.[key]).includes(eventId)
);

const appendWorldEventId = (world, key, eventId) => {
  if (typeof eventId !== 'string' || eventId.length === 0) return normalizeWorldState(world);
  const normalized = normalizeWorldState(world);
  return {
    ...normalized,
    [key]: Array.from(new Set([...uniqueStringList(normalized[key]), eventId]))
  };
};

const getMapEventById = (mapName, eventId) => (
  typeof eventId === 'string' && eventId.length > 0
    ? getMapEvents(mapName).find((event) => event.id === eventId) || null
    : null
);

const getMapBossEvent = (mapName) => getMapEvents(mapName).find((event) => event.type === 'boss') || null;

const getBossCompletionEventIds = (mapName, eventId = null) => {
  const bossEvent = getMapBossEvent(mapName);
  return Array.from(new Set([
    typeof eventId === 'string' && eventId.length > 0 ? eventId : null,
    typeof bossEvent?.id === 'string' && bossEvent.id.length > 0 ? bossEvent.id : null
  ].filter(Boolean)));
};

const hasCompletedBossEvent = (world, mapName, eventId = null) => (
  getBossCompletionEventIds(mapName, eventId)
    .some((id) => hasMapScopedWorldEventId(world, 'defeatedBossIds', mapName, id))
);

const appendCompletedBossEventIds = (world, mapName, eventId = null) => (
  getBossCompletionEventIds(mapName, eventId)
    .reduce((nextWorld, id) => appendBattleCompletionWorldEventId(nextWorld, 'defeatedBossIds', mapName, id), normalizeWorldState(world))
);

const isFreshStartSnapshot = (snapshot) => (
  snapshot &&
  typeof snapshot === 'object' &&
  Boolean(snapshot.showLaunchScreen) &&
  (!Array.isArray(snapshot.playerTeam) || snapshot.playerTeam.length === 0) &&
  (!Array.isArray(snapshot.storageBox) || snapshot.storageBox.length === 0)
);

const mergeMonotonicWorldProgress = (targetWorld, sourceWorld, fallback = {}) => {
  const target = normalizeWorldState(targetWorld, fallback);
  const source = normalizeWorldState(sourceWorld, {
    currentMapName: target.currentMapName,
    playerPos: target.playerPos
  });
  const sameDailyRefresh = target.dailyRefreshKey === source.dailyRefreshKey;

  return {
    ...target,
    dailyRefreshAppliedAt: target.dailyRefreshKey === source.dailyRefreshKey
      ? (
        typeof target.dailyRefreshAppliedAt === 'string' && target.dailyRefreshAppliedAt.length > 0
          ? target.dailyRefreshAppliedAt
          : source.dailyRefreshAppliedAt
      )
      : target.dailyRefreshAppliedAt,
    defeatedTrainerIds: mergeUniqueStringLists(target.defeatedTrainerIds, source.defeatedTrainerIds),
    defeatedBossIds: mergeUniqueStringLists(target.defeatedBossIds, source.defeatedBossIds),
    completedChallengeIds: mergeUniqueStringLists(target.completedChallengeIds, source.completedChallengeIds),
    trainerVictoryCounts: mergePositiveIntegerMaps(source.trainerVictoryCounts, target.trainerVictoryCounts),
    collectedEventIds: sameDailyRefresh
      ? mergeUniqueStringLists(target.collectedEventIds, source.collectedEventIds)
      : target.collectedEventIds,
    dailyTrainerBattleIds: sameDailyRefresh
      ? mergeUniqueStringLists(target.dailyTrainerBattleIds, source.dailyTrainerBattleIds)
      : target.dailyTrainerBattleIds,
    usedHealPointIds: mergeUniqueStringLists(target.usedHealPointIds, source.usedHealPointIds),
    flags: {
      ...(source.flags && typeof source.flags === 'object' ? source.flags : {}),
      ...(target.flags && typeof target.flags === 'object' ? target.flags : {})
    },
    mapProgress: {
      ...(source.mapProgress && typeof source.mapProgress === 'object' ? source.mapProgress : {}),
      ...(target.mapProgress && typeof target.mapProgress === 'object' ? target.mapProgress : {})
    }
  };
};

const mergeMonotonicSnapshotProgress = (sourceSnapshot, targetSnapshot) => {
  if (!sourceSnapshot || !targetSnapshot || isFreshStartSnapshot(targetSnapshot)) return targetSnapshot;
  const targetMapName = targetSnapshot.currentMapName || targetSnapshot.world?.currentMapName || DEFAULT_WORLD_MAP_NAME;
  const targetPlayerPos = targetSnapshot.playerPos || targetSnapshot.world?.playerPos || getDefaultWorldPosition();
  const mergedWorld = mergeMonotonicWorldProgress(targetSnapshot.world, sourceSnapshot.world, {
    currentMapName: targetMapName,
    playerPos: targetPlayerPos
  });

  return {
    ...targetSnapshot,
    world: mergedWorld
  };
};

const mergeLocalBattleProgressIntoWorld = (targetWorld, sourceWorld, fallback = {}) => {
  const target = normalizeWorldState(targetWorld, fallback);
  const source = normalizeWorldState(sourceWorld, {
    currentMapName: target.currentMapName,
    playerPos: target.playerPos
  });
  const merged = mergeMonotonicWorldProgress(target, source, fallback);

  return {
    ...merged,
    collectedEventIds: target.collectedEventIds,
    usedHealPointIds: target.usedHealPointIds,
    flags: target.flags
  };
};

const readCloudSnapshotFromString = (value) => {
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const getMapChallengeEvent = (mapName) => getMapEvents(mapName).find((event) => event.type === 'challenge') || null;

const CONFIGURED_BATTLE_EVENT_SEARCH_RADIUS = 2;

const toMapTileCoordinate = (value) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  const tile = Math.trunc(numberValue);
  return Number.isSafeInteger(tile) ? tile : null;
};

const getConfiguredBattleLookupTypes = (eventType) => {
  if (eventType === 'trainer') {
    return ['trainer', 'boss'];
  }
  return isConfiguredBattleEventType(eventType) ? [eventType] : ['trainer', 'boss', 'challenge'];
};

const normalizeBattleEventLookupPosition = (...positions) => {
  for (const position of positions) {
    const normalized = normalizeBattleEnvironmentPosition(position);
    if (normalized) return normalized;
  }
  return null;
};

const findNearestConfiguredBattleEvent = ({
  mapName,
  eventType,
  position,
  maxDistance = CONFIGURED_BATTLE_EVENT_SEARCH_RADIUS
} = {}) => {
  const lookupPosition = normalizeBattleEventLookupPosition(position);
  if (!lookupPosition) return null;

  const lookupTypes = new Set(getConfiguredBattleLookupTypes(eventType));
  const candidates = getMapEvents(mapName).filter((event) => lookupTypes.has(event.type));
  const ranked = candidates
    .map((event) => {
      const eventPosition = normalizeBattleEnvironmentPosition(event.position);
      if (!eventPosition) return null;
      const distance =
        Math.abs(eventPosition.x - lookupPosition.x) +
        Math.abs(eventPosition.y - lookupPosition.y);
      return {
        event,
        distance,
        typeRank: event.type === eventType ? 0 : 1
      };
    })
    .filter(Boolean)
    .filter((entry) => entry.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance || a.typeRank - b.typeRank);

  return ranked[0]?.event || null;
};

const resolveConfiguredBattleMapEvent = ({
  mapName,
  eventType,
  eventRole,
  eventId,
  mapEvent,
  tileX,
  tileY,
  eventPosition,
  triggerPosition
} = {}) => {
  const lookupTypes = new Set(getConfiguredBattleLookupTypes(eventType));
  if (mapEvent && isConfiguredBattleEventType(mapEvent.type) && lookupTypes.has(mapEvent.type)) {
    return mapEvent;
  }

  const byId = getMapEventById(mapName, eventId);
  if (byId && isConfiguredBattleEventType(byId.type)) {
    return byId;
  }

  const tilePosition = tileX !== null && tileY !== null ? { x: tileX, y: tileY } : null;
  const lookupPosition = normalizeBattleEventLookupPosition(
    eventPosition,
    tilePosition,
    triggerPosition
  );
  const nearest = findNearestConfiguredBattleEvent({
    mapName,
    eventType,
    position: lookupPosition
  });
  if (nearest) return nearest;

  const normalizedRole = normalizeTrainerRole(eventRole || eventType);
  if (eventType === 'boss' || normalizedRole === 'boss') {
    return getMapBossEvent(mapName);
  }
  if (eventType === 'challenge' || normalizedRole === 'challenge') {
    return getMapChallengeEvent(mapName);
  }

  return null;
};

const normalizeMapRewardItems = (rewardItems = []) => (
  Array.isArray(rewardItems)
    ? rewardItems
      .map((reward) => {
        const itemType = resolveInventoryItemType({
          itemType: reward?.itemType,
          itemKey: reward?.itemKey
        });
        const itemKey = typeof reward?.itemKey === 'string' ? reward.itemKey : '';
        const details = itemType ? resolveInventoryItemDetails(itemType, itemKey) : null;
        const quantity = Math.max(1, Math.trunc(Number(reward?.quantity ?? 1)) || 1);
        if (!itemType || !itemKey || !details) return null;
        return {
          itemType,
          itemKey,
          quantity,
          itemName: details.name || itemKey,
          sprite: details.sprite || ''
        };
      })
      .filter(Boolean)
    : []
);

const getMapRewardItemMergeKey = (reward) => `${reward.itemType}:${reward.itemKey}`;

const mergeNormalizedMapRewardItems = (rewardItems = []) => {
  const merged = new Map();
  normalizeMapRewardItems(rewardItems).forEach((reward) => {
    const key = getMapRewardItemMergeKey(reward);
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += reward.quantity;
    } else {
      merged.set(key, { ...reward });
    }
  });
  return Array.from(merged.values());
};

const mergeMapRewardItems = (inventory, rewardItems = []) => (
  mergeNormalizedMapRewardItems(rewardItems).reduce(
    (nextInventory, reward) => mergeInventoryEntries(nextInventory, reward.itemType, reward.itemKey, reward.quantity),
    inventory
  )
);

const describeMapRewardItems = (rewardItems = []) => (
  mergeNormalizedMapRewardItems(rewardItems)
    .map((reward) => `${reward.itemName}${reward.quantity > 1 ? ` x${reward.quantity}` : ''}`)
);

const formatCollectedItemNotification = ({ customText, itemDetails, quantity }) => {
  const itemName = itemDetails?.name || '补给';
  const safeQuantity = Math.max(1, Math.trunc(Number(quantity ?? 1)) || 1);
  const itemText = `${itemName}${safeQuantity > 1 ? ` x${safeQuantity}` : ''}`;
  const cleanedText = typeof customText === 'string' ? customText.trim() : '';

  if (!cleanedText) return `获得了 ${itemText}。`;
  if (cleanedText.includes(itemName)) return cleanedText;
  return `${cleanedText.replace(/[。.!！?？]+$/, '')}：${itemText}。`;
};

const getMapProgressSummary = (mapName, world) => {
  const events = getMapEvents(mapName);
  const trainerEvents = events.filter((event) => event.type === 'trainer');
  const lieutenantEvents = trainerEvents.filter((event) => getMapEventProperties(event).role === 'lieutenant');
  const itemEvents = events.filter((event) => event.type === 'item' || event.type === 'pickup');
  const bossEvent = getMapBossEvent(mapName);
  const challengeEvent = getMapChallengeEvent(mapName);
  const challengeRarePool = getChallengeRarePool(challengeEvent);
  const challengeUnlockedRarePool = getChallengeUnlockedRarePool(challengeEvent, world, mapName);
  const collectedEventIds = uniqueStringList(world?.collectedEventIds);
  const defeatedLieutenantIds = lieutenantEvents
    .map((event) => event.id)
    .filter((id) => hasMapScopedWorldEventId(world, 'defeatedTrainerIds', mapName, id));

  return {
    defeatedTrainers: trainerEvents.filter((event) => hasMapScopedWorldEventId(world, 'defeatedTrainerIds', mapName, event.id)).length,
    totalTrainers: trainerEvents.length,
    defeatedLieutenants: defeatedLieutenantIds.length,
    totalLieutenants: lieutenantEvents.length,
    bossDefeated: hasCompletedBossEvent(world, mapName, bossEvent?.id),
    challengeCompleted: Boolean(challengeEvent && hasMapScopedWorldEventId(world, 'completedChallengeIds', mapName, challengeEvent.id)),
    challengeRareUnlocked: challengeUnlockedRarePool.length,
    challengeRareTotal: challengeRarePool.length,
    collectedItems: itemEvents.filter((event) => collectedEventIds.includes(event.id)).length,
    totalItems: itemEvents.length,
    encounterTier: getMapEncounterProgressTier(mapName, world),
    rareUnlocked: Boolean(
      hasCompletedBossEvent(world, mapName, bossEvent?.id) ||
      challengeUnlockedRarePool.length > 0
    )
  };
};

const getConfiguredBattleEventVisualState = (mapName, world, event) => {
  if (!event?.id || !isConfiguredBattleEventType(event.type)) return null;
  const props = getMapEventProperties(event);
  const role = resolveConfiguredBattleRole(event.type, props);

  if (event.type === 'trainer') {
    if (isDailyScalingTrainerEvent(event.type, role)) {
      return {
        status: hasDailyTrainerBattleEvent(world, mapName, event.id) ? 'daily_complete' : 'available',
        eventType: event.type,
        role
      };
    }

    return {
      status: hasMapScopedWorldEventId(world, 'defeatedTrainerIds', mapName, event.id) ? 'cleared' : 'available',
      eventType: event.type,
      role
    };
  }

  if (event.type === 'boss') {
    const requiredIds = Array.isArray(props.requiredTrainerIds)
      ? props.requiredTrainerIds.filter((id) => typeof id === 'string' && id.length > 0)
      : [];
    const defeatedCount = countMapScopedWorldEventIds(world, 'defeatedTrainerIds', mapName, requiredIds);
    const remaining = Math.max(0, requiredIds.length - defeatedCount);
    return {
      status: hasCompletedBossEvent(world, mapName, event.id)
        ? 'completed'
        : remaining > 0
          ? 'locked'
          : 'available',
      eventType: event.type,
      role,
      remainingRequired: remaining,
      requiredCount: requiredIds.length
    };
  }

  if (event.type === 'challenge') {
    return {
      status: hasDailyTrainerBattleEvent(world, mapName, event.id) ? 'daily_complete' : 'available',
      eventType: event.type,
      role,
      unlockStage: getChallengeRareUnlockStage(world, event, mapName)
    };
  }

  return null;
};

const buildMapEventVisualState = (mapName, world, completedBattleEventVisualOverrides = null) => {
  const events = getMapEvents(mapName);
  const visualState = {};

  events.forEach((event) => {
    const eventVisualState = getConfiguredBattleEventVisualState(mapName, world, event);
    if (!eventVisualState) return;
    const override = getCompletedBattleEventVisualOverride(completedBattleEventVisualOverrides, {
      world,
      mapName,
      eventId: event.id
    });
    visualState[event.id] = override
      ? { ...eventVisualState, ...override }
      : eventVisualState;
  });

  return visualState;
};

const getConfiguredBattleEventInfoMessage = ({
  mapName,
  world,
  event,
  visualState = null
} = {}) => {
  if (!event || !isConfiguredBattleEventType(event.type)) return null;
  const props = getMapEventProperties(event);
  const resolvedVisualState = visualState || getConfiguredBattleEventVisualState(mapName, world, event);
  const status = typeof resolvedVisualState?.status === 'string' ? resolvedVisualState.status : 'available';
  const eventName = props.name || (event.type === 'boss' ? '区域首领' : event.type === 'challenge' ? '区域试炼' : '训练家');

  if (status === 'daily_complete') {
    return typeof props.dailyDefeatedText === 'string' && props.dailyDefeatedText.length > 0
      ? props.dailyDefeatedText
      : `${eventName}今天已完成，明天再来。`;
  }

  if (status === 'cleared' || status === 'completed') {
    if (typeof props.completedText === 'string' && props.completedText.length > 0) {
      return props.completedText;
    }
    if (typeof props.defeatedText === 'string' && props.defeatedText.length > 0) {
      return props.defeatedText;
    }
    return `${eventName}已完成。`;
  }

  if (status === 'locked') {
    return typeof props.lockedText === 'string' && props.lockedText.length > 0
      ? props.lockedText
      : `${eventName}尚未开放。`;
  }

  return null;
};

const withUpdatedMapProgress = (world, mapName) => {
  const normalized = normalizeWorldState(world, {
    currentMapName: mapName
  });
  return {
    ...normalized,
    mapProgress: {
      ...(normalized.mapProgress && typeof normalized.mapProgress === 'object' ? normalized.mapProgress : {}),
      [mapName]: getMapProgressSummary(mapName, normalized)
    }
  };
};

const getSnapshotBattleEventCompletion = (snapshot = null, battleEnvironment = null) => {
  const fallbackEnvironment = normalizeBattleEnvironment(
    snapshot?.battleEnvironment ||
    snapshot?.battlePhaseData?.battleEnvironment ||
    battleEnvironment
  );
  return normalizeBattleEventCompletion(
    snapshot?.battleEventCompletion ||
    snapshot?.battlePhaseData?.battleEventCompletion ||
    fallbackEnvironment?.battleEventCompletion ||
    battleEnvironment?.battleEventCompletion,
    fallbackEnvironment || battleEnvironment
  );
};

const getConfiguredBattleCompletionMeta = ({
  snapshot = null,
  battleEnvironment = null,
  fallbackMapName = DEFAULT_WORLD_MAP_NAME
} = {}) => {
  const eventMeta = normalizeBattleEnvironment(
    snapshot?.battleEnvironment ||
    snapshot?.battlePhaseData?.battleEnvironment ||
    battleEnvironment
  );
  const battleEventCompletion = getSnapshotBattleEventCompletion(snapshot, battleEnvironment);
  const mapName = battleEventCompletion?.mapName || eventMeta?.mapName || snapshot?.currentMapName || fallbackMapName;
  const lookupEventType = battleEventCompletion?.eventType || eventMeta?.eventType;
  const lookupEventId = battleEventCompletion?.eventId || eventMeta?.eventId;
  const event = resolveConfiguredBattleMapEvent({
    mapName,
    eventType: lookupEventType,
    eventRole: eventMeta?.eventRole,
    eventId: lookupEventId,
    eventPosition: eventMeta?.eventPosition,
    triggerPosition: eventMeta?.triggerPosition
  });
  const eventType = battleEventCompletion?.eventType || event?.type || eventMeta?.eventType || null;
  const eventId = battleEventCompletion?.eventId || event?.id || eventMeta?.eventId || null;
  const eventProps = getMapEventProperties(event);
  const eventRole = resolveConfiguredBattleRole(eventType, eventProps);

  return {
    eventMeta,
    battleEventCompletion,
    mapName,
    event,
    eventType,
    eventId,
    eventProps,
    eventRole,
    completionKey: getConfiguredBattleCompletionKey(eventType)
  };
};

const applyConfiguredBattleCompletionToWorld = (world, completionMeta) => {
  const mapName = completionMeta?.mapName;
  const eventType = completionMeta?.eventType;
  const eventId = completionMeta?.eventId;
  const eventRole = completionMeta?.eventRole;
  const completionKey = completionMeta?.completionKey;
  let nextWorld = normalizeWorldState(world, {
    currentMapName: mapName || DEFAULT_WORLD_MAP_NAME
  });

  if (!mapName || !completionKey || !eventId) {
    return { world: nextWorld, completedNow: false, wasAlreadyCompleted: true };
  }

  const wasAlreadyCompleted = eventType === 'boss'
    ? hasCompletedBossEvent(nextWorld, mapName, eventId)
    : hasMapScopedWorldEventId(nextWorld, completionKey, mapName, eventId);

  if (!wasAlreadyCompleted) {
    nextWorld = eventType === 'boss'
      ? appendCompletedBossEventIds(nextWorld, mapName, eventId)
      : appendBattleCompletionWorldEventId(nextWorld, completionKey, mapName, eventId);
  }

  if (
    eventType === 'trainer' &&
    isDailyVariantBattleEvent(eventType, eventRole) &&
    !hasDailyTrainerBattleEvent(nextWorld, mapName, eventId)
  ) {
    nextWorld = appendDailyTrainerBattleEvent(nextWorld, mapName, eventId);
    if (getTrainerVictoryCount(nextWorld, eventId, mapName) <= 0) {
      nextWorld = incrementTrainerVictoryCount(nextWorld, eventId, mapName);
    }
  }

  return {
    world: withUpdatedMapProgress(nextWorld, mapName),
    completedNow: !wasAlreadyCompleted,
    wasAlreadyCompleted
  };
};

const buildCompletedBattleEventLocalPrimeState = ({
  snapshot = null,
  world = null,
  fallbackMapName = DEFAULT_WORLD_MAP_NAME,
  currentOverrides = {}
} = {}) => {
  const normalizedWorld = normalizeWorldState(world, {
    currentMapName: fallbackMapName || snapshot?.currentMapName || DEFAULT_WORLD_MAP_NAME,
    playerPos: snapshot?.playerPos || world?.playerPos || getDefaultWorldPosition()
  });
  const completionMeta = getConfiguredBattleCompletionMeta({
    snapshot,
    battleEnvironment: snapshot?.battleEnvironment || snapshot?.battlePhaseData?.battleEnvironment || null,
    fallbackMapName: normalizedWorld.currentMapName
  });

  if (!completionMeta?.mapName || !completionMeta?.eventType || !completionMeta?.eventId) {
    return {
      overrides: currentOverrides,
      lockKeys: []
    };
  }

  const isVictoryPhase = snapshot?.battlePhase === 'victory';
  const primedWorld = isVictoryPhase
    ? applyConfiguredBattleCompletionToWorld(normalizedWorld, completionMeta).world
    : normalizedWorld;
  const isCompleted = completionMeta.eventType === 'boss'
    ? hasCompletedBossEvent(primedWorld, completionMeta.mapName, completionMeta.eventId)
    : Boolean(
      completionMeta.completionKey &&
      hasMapScopedWorldEventId(primedWorld, completionMeta.completionKey, completionMeta.mapName, completionMeta.eventId)
    );

  if (!isCompleted) {
    return {
      overrides: currentOverrides,
      lockKeys: []
    };
  }

  return {
    overrides: appendCompletedBattleEventVisualOverride(currentOverrides, {
      world: primedWorld,
      mapName: completionMeta.mapName,
      eventType: completionMeta.eventType,
      eventId: completionMeta.eventId,
      eventRole: completionMeta.eventRole
    }),
    lockKeys: getBattleEventCompletedLockKeys({
      world: primedWorld,
      mapName: completionMeta.mapName,
      eventType: completionMeta.eventType,
      eventId: completionMeta.eventId,
      eventRole: completionMeta.eventRole
    })
  };
};

const getBattleEventCompletionMessages = ({
  mapName,
  event,
  world,
  challengeRareUnlockBatch = null,
  challengeRareUnlockStage = null,
  includeRewardItems = true
}) => {
  const props = getMapEventProperties(event);
  const mapLabel = getMapConfig(mapName).displayName;
  const messages = [];
  if (typeof props.defeatedText === 'string' && props.defeatedText.length > 0) {
    messages.push(props.defeatedText);
  }

  if (event?.type === 'trainer' && props.role === 'lieutenant') {
    const boss = getMapBossEvent(mapName);
    const requiredIds = Array.isArray(getMapEventProperties(boss).requiredTrainerIds)
      ? getMapEventProperties(boss).requiredTrainerIds
      : [];
    const defeatedCount = countMapScopedWorldEventIds(world, 'defeatedTrainerIds', mapName, requiredIds);
    if (requiredIds.length > 0 && defeatedCount >= requiredIds.length) {
      messages.push(`${mapLabel}试炼印记已集齐，首领挑战解锁。`);
      messages.push(`${mapLabel}野生宝可梦变强。`);
    } else if (defeatedCount === 1) {
      messages.push(`已击败部下 1/${requiredIds.length}，草丛生态已增强。`);
    } else if (requiredIds.length > 0) {
      messages.push(`已击败部下 ${defeatedCount}/${requiredIds.length}，继续寻找剩余部下。`);
    }
  }

  if (event?.type === 'boss' && typeof props.rareUnlockText === 'string') {
    messages.push(props.rareUnlockText);
  }

  if (event?.type === 'challenge') {
    if (Array.isArray(challengeRareUnlockBatch)) {
      if (challengeRareUnlockBatch.length > 0) {
        messages.push(buildChallengeRareUnlockMessage({
          mapName,
          event,
          rarePool: challengeRareUnlockBatch,
          unlockStage: challengeRareUnlockStage
        }));
      }
    } else if (typeof props.challengeRareUnlockText === 'string' && props.challengeRareUnlockText.length > 0) {
      messages.push(props.challengeRareUnlockText);
    }
  }

  const rewardDescriptions = includeRewardItems ? describeMapRewardItems(props.rewardItems) : [];
  if (rewardDescriptions.length > 0) {
    messages.push(`额外获得：${rewardDescriptions.join('、')}。`);
  }

  return messages;
};

const formatRareChanceText = (chance, fallbackChance = 0.3) => {
  const normalizedChance = Math.max(0, Math.min(1, Number(chance ?? fallbackChance) || fallbackChance));
  return `稀有约 ${Math.round(normalizedChance * 100)}%`;
};

const resolveRareSpeciesPreviewMonster = (entry) => {
  const rawId = entry && typeof entry === 'object'
    ? entry.pokemonId ?? entry.id ?? entry.pokedexId ?? entry.dexNo
    : entry;
  const pokemonId = Math.trunc(Number(rawId));
  const rawName = typeof entry === 'string'
    ? entry.trim()
    : (typeof entry?.name === 'string' ? entry.name.trim() : '');
  const baseMonster = Number.isInteger(pokemonId)
    ? MONSTERS.find((monster) => (
      monster.id === pokemonId ||
      Number(monster.dexNo ?? monster.pokedexId) === pokemonId
    ))
    : MONSTERS.find((monster) => monster.name === rawName);
  const normalized = baseMonster
    ? normalizeMonsterAssetSource(baseMonster)
    : (rawName || entry?.sprite ? normalizeMonsterAssetSource({
      id: rawName || pokemonId,
      name: rawName || '稀有宝可梦',
      sprite: entry?.sprite || POKEMON_LOCAL_PLACEHOLDER,
      pokedexId: Number.isInteger(pokemonId) ? pokemonId : undefined
    }) : null);
  if (!normalized?.name) return null;
  return {
    id: normalized.id ?? normalized.pokedexId ?? normalized.dexNo ?? normalized.name,
    name: normalized.name,
    sprite: normalized.sprite || POKEMON_LOCAL_PLACEHOLDER,
    dexNo: normalized.dexNo ?? normalized.pokedexId ?? null
  };
};

const getRareSpeciesPreview = (entries = []) => {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : [])
    .map(resolveRareSpeciesPreviewMonster)
    .filter(Boolean)
    .filter((monster) => {
      const key = String(monster.dexNo ?? monster.id ?? monster.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const getRareSpeciesNames = (entries = []) => {
  return getRareSpeciesPreview(entries).map((monster) => monster.name);
};

const buildChallengeRareUnlockMessage = ({
  mapName,
  event,
  rarePool = [],
  unlockStage = null
} = {}) => {
  const props = getMapEventProperties(event);
  const mapLabel = getMapConfig(mapName).displayName;
  const speciesNames = getRareSpeciesNames(rarePool);
  if (speciesNames.length === 0) return `${mapLabel}隐藏生态有新的气息出现。`;
  const stageText = Number.isFinite(Number(unlockStage)) && Number(unlockStage) > 0
    ? `第 ${Math.trunc(Number(unlockStage))} 批`
    : '新一批';
  return `${mapLabel}隐藏生态${stageText}解锁：${speciesNames.join('、')}现在会在草丛中出现（${formatRareChanceText(props.challengeRareChance)}）。`;
};

const buildBattleRareUnlockSummaries = ({
  mapName,
  event,
  rarePoolOverride = null,
  unlockStage = null,
  unlockedCount = null
} = {}) => {
  const props = getMapEventProperties(event);
  const mapLabel = getMapConfig(mapName).displayName;

  if (event?.type === 'challenge' && Array.isArray(props.challengeRarePool) && props.challengeRarePool.length > 0) {
    const rarePool = Array.isArray(rarePoolOverride) ? rarePoolOverride : props.challengeRarePool;
    const speciesPreview = getRareSpeciesPreview(rarePool);
    if (speciesPreview.length === 0) return [];
    const speciesNames = speciesPreview.map((monster) => monster.name);
    const stage = Math.trunc(Number(unlockStage));
    const totalRareCount = props.challengeRarePool.length;
    const safeUnlockedCount = Math.min(
      totalRareCount,
      Math.max(speciesNames.length, Math.trunc(Number(unlockedCount)) || speciesNames.length)
    );
    return [{
      kind: 'challengeRare',
      title: Number.isFinite(stage) && stage > 0 ? `隐藏生态第 ${stage} 批开启` : '隐藏生态开启',
      subtitle: `${mapLabel}草丛新增 ${speciesPreview.length} 种`,
      description: totalRareCount > speciesNames.length
        ? `累计解锁 ${safeUnlockedCount}/${totalRareCount} 种`
        : '草丛探索可遇见',
      chanceText: formatRareChanceText(props.challengeRareChance),
      speciesPreview: speciesPreview.slice(0, 8),
      speciesNames: speciesNames.slice(0, 8),
      totalCount: speciesNames.length
    }];
  }

  if (event?.type === 'boss' && props.bossRarePokemon) {
    const speciesPreview = getRareSpeciesPreview([props.bossRarePokemon]);
    if (speciesPreview.length === 0) return [];
    const speciesNames = speciesPreview.map((monster) => monster.name);
    return [{
      kind: 'bossRare',
      title: '专属稀有开启',
      subtitle: `${mapLabel}草丛新增`,
      description: '击败首领后可遇见',
      chanceText: formatRareChanceText(props.bossRareChance, 0.18),
      speciesPreview,
      speciesNames,
      totalCount: speciesNames.length
    }];
  }

  return [];
};

const getForwardMapBossGate = ({ currentMapName, targetMapName, world }) => {
  const currentConfig = getMapConfig(currentMapName);
  const targetConfig = getMapConfig(targetMapName);
  const currentOrder = Number(currentConfig?.regionOrder || 0);
  const targetOrder = Number(targetConfig?.regionOrder || 0);
  if (!currentOrder || !targetOrder || targetOrder <= currentOrder) return null;

  const requiredMapName = ADVENTURE_MAP_CHAIN.find((mapName) => {
    const config = getMapConfig(mapName);
    const order = Number(config?.regionOrder || 0);
    if (!order || order < currentOrder || order >= targetOrder) return false;
    const boss = getMapBossEvent(mapName);
    return boss && !hasCompletedBossEvent(world, mapName, boss.id);
  });
  if (!requiredMapName) return null;

  const requiredConfig = getMapConfig(requiredMapName);
  const boss = getMapBossEvent(requiredMapName);
  const bossName = getMapEventProperties(boss).name || `${requiredConfig.displayName}首领`;
  return {
    bossName,
    mapName: requiredConfig.displayName
  };
};

const normalizeRequiredEventIds = (ids) => {
  if (Array.isArray(ids)) {
    return ids.filter((id) => typeof id === 'string' && id.length > 0);
  }
  return typeof ids === 'string' && ids.length > 0 ? [ids] : [];
};

const formatMapLockHint = ({ reason = '', nextStep = '' }) => {
  const cleanReason = String(reason || '').trim().replace(/[。．\.]+$/u, '');
  const cleanNextStep = String(nextStep || '').trim().replace(/[。．\.]+$/u, '');
  return cleanReason || cleanNextStep || '暂不能进入。';
};

const getWarpEventLockState = ({ currentMapName, warpEvent, world, playerTeam }) => {
  const props = getMapEventProperties(warpEvent);
  const requiredAverageLevel = Number(props.requiredAverageLevel);
  const requiredTrainerIds = normalizeRequiredEventIds(props.requiredTrainerIds);
  const missingTrainerCount = Math.max(
    0,
    requiredTrainerIds.length - countMapScopedWorldEventIds(world, 'defeatedTrainerIds', currentMapName, requiredTrainerIds)
  );
  const levelLocked = Number.isFinite(requiredAverageLevel) &&
    requiredAverageLevel > 0 &&
    getPlayerAverageLevel(playerTeam, 5) < requiredAverageLevel;

  if (missingTrainerCount <= 0 && !levelLocked) {
    return { locked: false, reason: '' };
  }

  const explicitText = typeof props.lockedText === 'string' ? props.lockedText.trim() : '';
  if (explicitText) {
    return { locked: true, reason: explicitText };
  }

  const reasons = [];
  if (missingTrainerCount > 0) {
    reasons.push(`再胜 ${missingTrainerCount} 人`);
  }
  if (levelLocked) {
    const targetLevel = Math.trunc(requiredAverageLevel);
    reasons.push(`平均 Lv.${targetLevel}`);
  }

  return {
    locked: true,
    reason: formatMapLockHint({
      reason: reasons.join('，')
    })
  };
};

const getAdventureRouteIndex = (mapName) => {
  const index = ADVENTURE_MAP_CHAIN.indexOf(mapName);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
};

const getWarpDirectionLabel = (mapName, warpEvent) => {
  const mapInfo = getAdventureMapInfo(mapName);
  const x = Number(warpEvent?.position?.x);
  const y = Number(warpEvent?.position?.y);
  const width = Math.max(1, Number(mapInfo?.width) || 0);
  const height = Math.max(1, Number(mapInfo?.height) || 0);

  if (width && x >= width - 2) return '右侧';
  if (height && y >= height - 2) return '下方';
  if (x <= 1) return '左侧';
  if (y <= 1) return '上方';
  return '相邻';
};

const getFastTravelForwardRoutes = (mapName) => {
  const sourceIndex = getAdventureRouteIndex(mapName);
  if (!hasAdventureMap(mapName) || sourceIndex === Number.MAX_SAFE_INTEGER) return [];

  return getMapEvents(mapName)
    .filter((event) => event.type === 'warp' && event?.target?.mapName)
    .map((event) => {
      const targetMapName = event.target.mapName;
      const targetIndex = getAdventureRouteIndex(targetMapName);
      if (targetIndex <= sourceIndex || targetIndex === Number.MAX_SAFE_INTEGER) return null;
      return {
        fromMapName: mapName,
        targetMapName,
        warpEvent: event,
        fromLabel: getMapConfig(mapName).displayName,
        targetLabel: getMapConfig(targetMapName).displayName,
        directionLabel: getWarpDirectionLabel(mapName, event),
        label: getMapEventProperties(event).label || ''
      };
    })
    .filter(Boolean);
};

const getFastTravelIncomingRoutes = (targetMapName) => (
  ADVENTURE_MAP_CHAIN.flatMap((mapName) => getFastTravelForwardRoutes(mapName))
    .filter((route) => route.targetMapName === targetMapName)
);

const describeBossGateOptions = (routeStates) => {
  const gates = routeStates
    .map((state) => state.bossGate)
    .filter(Boolean)
    .map((gate) => `${gate.mapName}的${gate.bossName}`);
  const uniqueGates = [...new Set(gates)];
  if (uniqueGates.length === 0) return '';
  if (uniqueGates.length === 1) return `击败${uniqueGates[0]}`;
  return `击败其一：${uniqueGates.join(' / ')}`;
};

const describeRouteGateOptions = (routeStates) => {
  const reasons = routeStates
    .map((state) => (
      state.bossGate
        ? `击败${state.bossGate.mapName}的${state.bossGate.bossName}`
        : state.warpGate?.reason
    ))
    .filter(Boolean);
  const uniqueReasons = [...new Set(reasons)];
  if (uniqueReasons.length === 0) return '';
  if (uniqueReasons.length === 1) return uniqueReasons[0];
  return `其一：${uniqueReasons.join(' / ')}`;
};

const getFastTravelRouteGate = ({ targetMapName, world, playerTeam }) => {
  const routes = getFastTravelIncomingRoutes(targetMapName);
  if (routes.length === 0) return { locked: false, routes, reason: '' };

  const routeStates = routes.map((route) => ({
    route,
    bossGate: getForwardMapBossGate({
      currentMapName: route.fromMapName,
      targetMapName,
      world
    }),
    warpGate: getWarpEventLockState({
      currentMapName: route.fromMapName,
      warpEvent: route.warpEvent,
      world,
      playerTeam
    })
  }));
  const openRoute = routeStates.find((state) => !state.bossGate && !state.warpGate?.locked);
  if (openRoute) {
    return { locked: false, routes, openRoute: openRoute.route, reason: '' };
  }

  return {
    locked: true,
    routes,
    reason: describeRouteGateOptions(routeStates) || describeBossGateOptions(routeStates)
  };
};

const getFastTravelBossGate = ({ targetMapName, world }) => {
  const targetConfig = getMapConfig(targetMapName);
  const targetOrder = Number(targetConfig?.regionOrder || 0);
  if (!targetOrder) return null;

  const requiredMapName = ADVENTURE_MAP_CHAIN.find((mapName) => {
    const config = getMapConfig(mapName);
    const order = Number(config?.regionOrder || 0);
    if (!order || order >= targetOrder) return false;
    const boss = getMapBossEvent(mapName);
    return boss && !hasCompletedBossEvent(world, mapName, boss.id);
  });
  if (!requiredMapName) return null;

  const requiredConfig = getMapConfig(requiredMapName);
  const boss = getMapBossEvent(requiredMapName);
  const bossName = getMapEventProperties(boss).name || `${requiredConfig.displayName}首领`;
  return {
    bossName,
    mapName: requiredConfig.displayName
  };
};

const getFastTravelMapLockState = ({ targetMapName, currentMapName, world, playerTeam }) => {
  if (!targetMapName || !hasAdventureMap(targetMapName)) {
    return { locked: true, reason: '道路未开放。' };
  }
  const mapConfig = getMapConfig(targetMapName);
  if (targetMapName === currentMapName) {
    return { locked: false, current: true, reason: '当前所在区域' };
  }

  const playerAvgLevel = getPlayerAverageLevel(playerTeam);
  const routeGate = getFastTravelRouteGate({ targetMapName, world, playerTeam });
  const levelLocked = isMapLockedForLevel(mapConfig, playerAvgLevel);

  if (routeGate.locked && levelLocked) {
    return {
      locked: true,
      reason: formatMapLockHint({
        reason: routeGate.reason || `路线 / 平均 Lv.${Math.max(1, Math.trunc(Number(mapConfig.recommendedLevel) || 1))}`
      })
    };
  }
  if (routeGate.locked) {
    return {
      locked: true,
      reason: formatMapLockHint({
        reason: routeGate.reason || '路线未通'
      })
    };
  }
  if (levelLocked) {
    return {
      locked: true,
      reason: formatMapLockHint({
        reason: `平均 Lv.${Math.max(1, Math.trunc(Number(mapConfig.recommendedLevel) || 1))}`
      })
    };
  }

  return { locked: false, reason: '' };
};

const getMapEncounterProgressTier = (mapName, world) => {
  const boss = getMapBossEvent(mapName);
  if (!boss) return 0;
  if (hasCompletedBossEvent(world, mapName, boss.id)) return 3;

  const requiredIds = Array.isArray(getMapEventProperties(boss).requiredTrainerIds)
    ? getMapEventProperties(boss).requiredTrainerIds
    : [];
  const defeatedCount = countMapScopedWorldEventIds(world, 'defeatedTrainerIds', mapName, requiredIds);
  if (requiredIds.length > 0 && defeatedCount >= requiredIds.length) return 2;
  if (defeatedCount >= 1) return 1;
  return 0;
};

const STARTER_VALLEY_MAP_ID = 'GodotMap';
const STARTER_VALLEY_TUTORIAL_TRAINER_ID = 'valley_trainer_camp_path';
const STARTER_VALLEY_THICKET_ZONE_ID = 'grove_grass';
const STARTER_VALLEY_THICKET_GUIDE_TEXT = '南边密林的宝可梦更强，先沿土路往上去阳光草坡练练手更稳。';

const isStarterValleyThicketUnlocked = (world, playerTeam = []) => (
  hasMapScopedWorldEventId(world, 'defeatedTrainerIds', STARTER_VALLEY_MAP_ID, STARTER_VALLEY_TUTORIAL_TRAINER_ID) ||
  getPlayerAverageLevel(playerTeam, 5) >= 6
);

const buildEncounterZoneLocks = (mapName, world, playerTeam = []) => {
  if (mapName !== STARTER_VALLEY_MAP_ID || isStarterValleyThicketUnlocked(world, playerTeam)) {
    return {};
  }

  return {
    [STARTER_VALLEY_THICKET_ZONE_ID]: {
      blocked: true,
      reason: STARTER_VALLEY_THICKET_GUIDE_TEXT
    }
  };
};

const pickProgressEncounterCandidate = ({ candidates, minLevel, maxLevel, rare = false, progressTier = 0 }) => {
  const legalCandidates = candidates
    .map((entry, index) => ({
      pokemonId: Math.trunc(Number(entry?.pokemonId ?? entry?.id)),
      minLevel: Math.max(1, Math.trunc(Number(entry?.minLevel ?? minLevel)) || minLevel),
      maxLevel: Math.max(1, Math.trunc(Number(entry?.maxLevel ?? maxLevel)) || maxLevel),
      weight: Math.max(1, Math.trunc(Number(entry?.weight ?? 10 + index * 2)) || 1)
    }))
    .filter((entry) => (
      Number.isInteger(entry.pokemonId) &&
      MONSTERS.some((monster) => monster.id === entry.pokemonId) &&
      pickLevelForSpecies(entry.pokemonId, entry.minLevel, entry.maxLevel) !== null
    ));

  if (legalCandidates.length === 0) return null;

  const totalWeight = legalCandidates.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of legalCandidates) {
    roll -= entry.weight;
    if (roll <= 0) {
      const level = pickLevelForSpecies(entry.pokemonId, entry.minLevel, entry.maxLevel);
      if (level !== null) return { pokemonId: entry.pokemonId, level, rare, progressTier };
    }
  }

  const fallback = legalCandidates[0];
  const level = pickLevelForSpecies(fallback.pokemonId, fallback.minLevel, fallback.maxLevel);
  return level !== null ? { pokemonId: fallback.pokemonId, level, rare, progressTier } : null;
};

const getProgressBumpedEncounter = ({ basePokemonId, baseLevel, progressTier, mapMin, mapMax }) => {
  const pokemonId = Math.trunc(Number(basePokemonId));
  const level = Math.trunc(Number(baseLevel));
  if (!Number.isInteger(pokemonId) || !Number.isInteger(level) || progressTier <= 0) return null;

  const bonus = progressTier >= 2 ? 1 : (Math.random() < 0.35 ? 1 : 0);
  if (bonus <= 0) return null;
  const targetLevel = Math.min(mapMax, Math.max(mapMin, level + bonus));
  for (let candidateLevel = targetLevel; candidateLevel >= level; candidateLevel -= 1) {
    if (isLevelValidForSpecies(pokemonId, candidateLevel)) {
      return { pokemonId, level: candidateLevel, rare: false, progressTier, strengthened: candidateLevel > level };
    }
  }
  return null;
};

const pickProgressRareEncounter = ({ mapName, world, basePokemonId, baseLevel }) => {
  const boss = getMapBossEvent(mapName);
  if (!boss) return null;

  const challenge = getMapChallengeEvent(mapName);
  const progressTier = getMapEncounterProgressTier(mapName, world);
  const config = getMapConfig(mapName);
  const mapMin = Math.max(1, Math.trunc(Number(config.minLevel ?? 1)) || 1);
  const mapMax = Math.max(mapMin, Math.trunc(Number(config.maxLevel ?? mapMin + 3)) || mapMin + 3);
  const bossProps = getMapEventProperties(boss);
  const bossTeam = Array.isArray(bossProps.team) ? bossProps.team : [];
  const challengeProps = getMapEventProperties(challenge);
  const unlockedChallengeRarePool = getChallengeUnlockedRarePool(challenge, world, mapName);

  if (progressTier >= 3 && bossProps.bossRarePokemon) {
    const bossRareChance = Math.max(
      0,
      Math.min(0.6, Number(bossProps.bossRareChance ?? 0.18) || 0.18)
    );
    if (Math.random() < bossRareChance) {
      const bossRareEncounter = pickProgressEncounterCandidate({
        candidates: [bossProps.bossRarePokemon],
        minLevel: mapMin,
        maxLevel: mapMax,
        rare: true,
        progressTier: 3
      });
      if (bossRareEncounter) {
        return {
          ...bossRareEncounter,
          bossRare: true,
          unlockSource: 'boss'
        };
      }
    }
  }

  if (unlockedChallengeRarePool.length > 0) {
    const challengeRareChance = Math.max(
      0,
      Math.min(0.6, Number(challengeProps.challengeRareChance ?? 0.3) || 0.3)
    );
    if (Math.random() < challengeRareChance) {
      const challengeRareEncounter = pickProgressEncounterCandidate({
        candidates: unlockedChallengeRarePool,
        minLevel: mapMin,
        maxLevel: mapMax,
        rare: true,
        progressTier: 4
      });
      if (challengeRareEncounter) {
        return {
          ...challengeRareEncounter,
          challengeRare: true,
          unlockSource: 'challenge'
        };
      }
    }
  }

  if (progressTier >= 2 && Math.random() < 0.18) {
    const candidates = bossTeam.slice(0, 4).map((entry, index) => ({
      pokemonId: Math.trunc(Number(entry?.pokemonId ?? entry?.id)),
      minLevel: Math.min(mapMax, mapMin + 1),
      maxLevel: mapMax,
      weight: 12 + index
    }));
    const progressEncounter = pickProgressEncounterCandidate({
      candidates,
      minLevel: Math.min(mapMax, mapMin + 1),
      maxLevel: mapMax,
      rare: false,
      progressTier
    });
    if (progressEncounter) return progressEncounter;
  }

  if (progressTier >= 1 && Math.random() < 0.12) {
    const candidates = bossTeam.slice(0, 2).map((entry, index) => ({
      pokemonId: Math.trunc(Number(entry?.pokemonId ?? entry?.id)),
      minLevel: mapMin,
      maxLevel: mapMax,
      weight: 12 + index
    }));
    const progressEncounter = pickProgressEncounterCandidate({
      candidates,
      minLevel: mapMin,
      maxLevel: mapMax,
      rare: false,
      progressTier
    });
    if (progressEncounter) return progressEncounter;
  }

  return getProgressBumpedEncounter({ basePokemonId, baseLevel, progressTier, mapMin, mapMax });
};

const createCloudSaveSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const getCloudSaveRevision = (gameData) => {
  const rawRevision =
    gameData?.[CLOUD_SAVE_SYNC_META_KEY]?.revision ??
    gameData?.saveRevision ??
    gameData?.save_revision ??
    0;
  const revision = Number(rawRevision);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : 0;
};

const withCloudSaveMeta = (snapshot, revision, sessionId) => ({
  ...snapshot,
  [CLOUD_SAVE_SYNC_META_KEY]: {
    revision,
    sessionId,
    clientSavedAt: new Date().toISOString()
  }
});

const normalizePendingGrowthEvents = (events) => {
  if (!Array.isArray(events)) return [];

  const normalizedEvents = events.flatMap((evt) => {
    if (!evt || typeof evt !== 'object') return [];

    const level = Number.isInteger(Number(evt.level)) ? Number(evt.level) : null;
    const sourceBaseId = Number.isInteger(Number(evt.sourceBaseId)) ? Number(evt.sourceBaseId) : null;

    if (evt.type === 'evolution' && evt.monId && Number.isInteger(Number(evt.targetId)) && Number(evt.targetId) > 0) {
      return [{
        type: 'evolution',
        monId: evt.monId,
        targetId: Number(evt.targetId),
        level,
        sourceBaseId,
      }];
    }

    if (evt.type === 'evolutionChoice' && evt.monId && Array.isArray(evt.targetOptions)) {
      const targetOptions = [...new Set(
        evt.targetOptions
          .map((targetId) => Number(targetId))
          .filter((targetId) => Number.isInteger(targetId) && targetId > 0)
      )];
      if (targetOptions.length >= 2) {
        return [{
          type: 'evolutionChoice',
          monId: evt.monId,
          targetOptions,
          level,
          sourceBaseId,
        }];
      }
    }

    if (evt.type === 'learnMove' && evt.monId && typeof evt.moveKey === 'string' && evt.moveKey.length > 0) {
      return [{
        type: 'learnMove',
        monId: evt.monId,
        moveKey: evt.moveKey,
        level,
        sourceBaseId,
      }];
    }

    return [];
  });

  const seen = new Set();
  return normalizedEvents.filter((evt) => {
    const key = getPendingGrowthEventKey(evt);
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getPendingGrowthEventKey = (evt) => {
  if (!evt?.monId || !evt?.type) return null;
  if (evt.type === 'evolution') return buildEvolutionEventKey(evt.monId, evt.targetId);
  if (evt.type === 'evolutionChoice') return buildEvolutionChoiceEventKey(evt.monId, evt.targetOptions);
  if (evt.type === 'learnMove') return buildLearnMoveEventKey(evt.monId, evt.moveKey);
  return null;
};

const resolvePendingGrowthEventHead = (baseSnapshot, expectedEvent) => {
  const expectedKey = getPendingGrowthEventKey(expectedEvent);
  if (!expectedKey) {
    return {
      aborted: abortCloudSnapshotCommit('成长事件无效，请重新读取。', 'error')
    };
  }

  const baseEvents = normalizePendingGrowthEvents(baseSnapshot?.pendingGrowthEvents);
  const headEvent = baseEvents[0] || null;
  if (!headEvent) {
    return {
      aborted: abortCloudSnapshotCommit('成长事件已处理。', 'info')
    };
  }

  if (getPendingGrowthEventKey(headEvent) !== expectedKey) {
    return {
      aborted: abortCloudSnapshotCommit('成长事件已变化，请重新读取。')
    };
  }

  return {
    expectedKey,
    headEvent,
    remainingEvents: baseEvents.slice(1),
  };
};

const doesGrowthEventSourceMatchMon = (mon, evt) => {
  if (!evt?.sourceBaseId) return true;
  return Number(mon?.baseId) === Number(evt.sourceBaseId);
};

const pruneResolvedEvolutionEvents = ({ remainingEvents = [], resolvedEvent = null, monId = null } = {}) => {
  const resolvedKey = getPendingGrowthEventKey(resolvedEvent);
  const normalizedRemainingEvents = normalizePendingGrowthEvents(remainingEvents);

  return normalizedRemainingEvents.filter((evt) => {
    if (getPendingGrowthEventKey(evt) === resolvedKey) return false;

    if (
      resolvedEvent?.type === 'evolutionChoice' &&
      evt?.monId === monId &&
      (evt.type === 'evolutionChoice' || evt.type === 'evolution')
    ) {
      return false;
    }

    return true;
  });
};

const buildEvolutionFollowUpLearnMoveEvents = ({
  mon,
  targetBase,
  level,
  remainingEvents = [],
} = {}) => {
  if (!mon?.id || !targetBase) return [];
  const safeLevel = Number.isInteger(Number(level)) ? Number(level) : Number(mon.level);
  if (!Number.isInteger(safeLevel)) return [];

  const knownMoves = new Set(normalizeRuntimeKnownMoveKeys(mon.moves));
  const queuedMoveKeys = new Set(
    normalizePendingGrowthEvents(remainingEvents)
      .filter((evt) => evt.type === 'learnMove' && evt.monId === mon.id)
      .map((evt) => evt.moveKey)
  );

  return getMovesLearnedAtLevel(targetBase, safeLevel)
    .filter((moveKey) => MOVES[moveKey] && !knownMoves.has(moveKey) && !queuedMoveKeys.has(moveKey))
    .map((moveKey) => ({
      type: 'learnMove',
      monId: mon.id,
      moveKey,
      level: safeLevel,
      sourceBaseId: targetBase.id,
    }));
};

const evolveMonsterInstance = (monster, targetBase) => {
  if (!monster || !targetBase) return monster;
  const currentMaxHp = getMonsterMaxHp(monster);
  const currentMaxMp = getMonsterMaxMp(monster);
  const hpRatio = currentMaxHp > 0 ? getMonsterCurrentHp(monster, currentMaxHp) / currentMaxHp : 1;
  const mpRatio = currentMaxMp > 0 ? getMonsterCurrentMp(monster, currentMaxMp) / currentMaxMp : 1;
  const preservedMoves = normalizeRuntimeKnownMoveKeys(monster.moves);
  const evolved = createMonsterInstance(targetBase, monster.level, monster.id, null, null, monster.currentExp);
  return {
    ...evolved,
    baseId: targetBase.id,
    currentHp: Math.max(1, Math.round(evolved.maxHp * hpRatio)),
    currentMp: Math.max(0, Math.round(evolved.maxMp * mpRatio)),
    moves: preservedMoves.length > 0 ? preservedMoves : getBalancedMovesForLevel(targetBase, monster.level),
    status: null,
    statusTurns: 0,
    volatileStatuses: {},
    statStages: {},
  };
};

const normalizeBattleEnergyCost = (value) => {
  const amount = Math.trunc(Number(value));
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
};

const hasBattleHp = (monster) => {
  if (!monster) return false;
  const hp = getMonsterCurrentHp(monster);
  return Number.isFinite(hp) && hp > 0;
};

const isBattleMonFainted = (monster) => !hasBattleHp(monster);

const getAliveBattleBench = (playerTeam = [], activePlayerId = null) => (
  (Array.isArray(playerTeam) ? playerTeam : [])
    .filter((mon) => mon?.id !== activePlayerId && hasBattleHp(mon))
);

const resolveDefaultActivePlayerId = (playerTeam = [], fallbackId = null) => {
  const team = Array.isArray(playerTeam) ? playerTeam : [];
  return team[0]?.id ?? (team.some((mon) => mon?.id === fallbackId) ? fallbackId : null);
};

const resolveActiveEnemyId = (enemyTeam = [], fallbackId = null) => {
  const team = Array.isArray(enemyTeam) ? enemyTeam : [];
  if (team.some((mon) => mon?.id === fallbackId)) return fallbackId;
  return team.find(hasBattleHp)?.id ?? team[0]?.id ?? null;
};

const resolveBattleLeadId = (playerTeam = []) => {
  const team = Array.isArray(playerTeam) ? playerTeam : [];
  const partyLead = team[0];
  if (hasBattleHp(partyLead)) return partyLead.id;
  return team.find(hasBattleHp)?.id ?? partyLead?.id ?? null;
};

const buildExitedBattleSnapshot = (baseSnapshot, overrides = {}) => {
  const exitedTeam = Array.isArray(overrides.playerTeam)
    ? overrides.playerTeam
    : (Array.isArray(baseSnapshot?.playerTeam) ? baseSnapshot.playerTeam : []);
  const defaultActivePlayerId = resolveDefaultActivePlayerId(exitedTeam, baseSnapshot?.activePlayerId);

  return {
    ...baseSnapshot,
    view: 'map',
    turn: 'player',
    participatedMonIds: [],
    enemyTeam: [],
    activeEnemyId: null,
    activePlayerId: defaultActivePlayerId,
    gameOver: false,
    battleKind: 'wild',
    battlePhase: 'active',
    battlePhaseData: null,
    pendingBattleSwitch: null,
    isThrowingPokeball: false,
    captureSequenceData: null,
    encounterCooldownSteps: ENCOUNTER_SAFE_STEPS,
    activeBattleEnergyCost: 0,
    battleEnergyRefundEligible: false,
    ...overrides,
  };
};

const appendSnapshotLogs = (baseSnapshot, nextLogs = []) => ([
  ...(Array.isArray(baseSnapshot?.logs) ? baseSnapshot.logs : []),
  ...nextLogs
]);

const normalizeBattlePhase = (phase) => (
  ['active', 'intro', 'sendout', 'victory', 'defeat', 'escape'].includes(phase) ? phase : 'active'
);

const normalizeBattleTurn = (turn, {
  view = 'map',
  battlePhase = 'active',
  isThrowingPokeball = false,
  captureSequenceData = null
} = {}) => {
  if (view !== 'battle') return 'player';
  if (battlePhase !== 'active') return 'player';
  if (turn === 'enemy') return 'enemy';
  if (turn === 'resolving') return 'resolving';
  if (turn === 'capture') {
    return isThrowingPokeball && captureSequenceData ? 'capture' : 'player';
  }
  return 'player';
};

const normalizeBattleTurnForSnapshot = (turn, options = {}) => {
  const normalizedTurn = normalizeBattleTurn(turn, options);
  return normalizedTurn === 'capture' ? 'player' : normalizedTurn;
};

const shouldRepairBattleTurnOnLoad = (gameData) => {
  if (!gameData || typeof gameData !== 'object') return false;
  const view = gameData.view || 'map';
  const battlePhase = normalizeBattlePhase(gameData.battlePhase);
  const captureSequenceData = normalizeCaptureSequenceData(gameData.captureSequenceData);
  const isThrowingPokeball = Boolean(gameData.isThrowingPokeball) && !!captureSequenceData;
  const normalizedTurn = normalizeBattleTurn(gameData.turn, {
    view,
    battlePhase,
    isThrowingPokeball,
    captureSequenceData
  });
  return view === 'battle' && battlePhase === 'active' && gameData.turn !== normalizedTurn;
};

const normalizeCaptureSequenceData = (data) => {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.pokemonName !== 'string' || data.pokemonName.length === 0) return null;

  const caughtMonster = data.caughtMonster
    ? sanitizeBattleRuntime(normalizeMonsterAssetSource(data.caughtMonster))
    : null;
  const pokemonLevel = Number.isInteger(Number(data.pokemonLevel)) ? Number(data.pokemonLevel) : null;
  const catchRate = Number(data.catchRate);

  return {
    success: Boolean(data.success),
    caughtMonster,
    pokemonName: data.pokemonName,
    pokemonSprite: typeof data.pokemonSprite === 'string' && data.pokemonSprite.length > 0
      ? data.pokemonSprite
      : (caughtMonster?.sprite || POKEMON_LOCAL_PLACEHOLDER),
    pokemonLevel,
    ballName: typeof data.ballName === 'string' ? data.ballName : null,
    ballSprite: typeof data.ballSprite === 'string' ? data.ballSprite : null,
    catchRate: Number.isFinite(catchRate) ? catchRate : null
  };
};

const normalizePendingBattleSwitch = (value) => {
  if (!value || typeof value !== 'object') return null;

  const nextActivePlayerId = value.nextActivePlayerId != null
    ? String(value.nextActivePlayerId)
    : null;
  if (!nextActivePlayerId) return null;

  const previousActivePlayerId = value.previousActivePlayerId != null
    ? String(value.previousActivePlayerId)
    : null;
  const followUpEnemyMon = value.followUpEnemyMon
    ? sanitizeBattleRuntime(normalizeMonsterAssetSource(value.followUpEnemyMon))
    : null;
  const followUpEnemyMessage = typeof value.followUpEnemyMessage === 'string'
    ? value.followUpEnemyMessage
    : '';

  return {
    previousActivePlayerId,
    nextActivePlayerId,
    forced: Boolean(value.forced),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : null,
    followUpEnemyMon,
    followUpEnemyMessage
  };
};

const getPendingBattleSwitchKey = (value) => {
  const normalized = normalizePendingBattleSwitch(value);
  if (!normalized) return null;
  return [
    normalized.previousActivePlayerId || 'none',
    normalized.nextActivePlayerId,
    normalized.forced ? 'forced' : 'free',
    normalized.createdAt || 'now'
  ].join('::');
};

const buildPendingBattleSwitch = ({
  previousActivePlayerId,
  nextActivePlayerId,
  forced = false,
  createdAt = new Date().toISOString(),
  followUpEnemyMon = null,
  followUpEnemyMessage = ''
} = {}) => {
  const normalizedNextActivePlayerId = nextActivePlayerId != null ? String(nextActivePlayerId) : null;
  if (!normalizedNextActivePlayerId) return null;

  return {
    previousActivePlayerId: previousActivePlayerId != null ? String(previousActivePlayerId) : null,
    nextActivePlayerId: normalizedNextActivePlayerId,
    forced: Boolean(forced),
    createdAt,
    followUpEnemyMon: followUpEnemyMon ? sanitizeBattleRuntime(normalizeMonsterAssetSource(followUpEnemyMon)) : null,
    followUpEnemyMessage: typeof followUpEnemyMessage === 'string' ? followUpEnemyMessage : ''
  };
};

const normalizePendingMonsterAcquisition = (pending) => {
  if (!pending || typeof pending !== 'object' || !pending.monster) return null;
  const monster = sanitizeBattleRuntime(normalizeMonsterAssetSource(pending.monster));
  if (!monster?.id) return null;

  return {
    monster,
    source: ['capture', 'teacher_reward', 'map_reward'].includes(pending.source)
      ? pending.source
      : 'capture',
    createdAt: typeof pending.createdAt === 'string' ? pending.createdAt : new Date().toISOString()
  };
};

const normalizeBattleRewardSummary = (summary) => {
  if (!summary || typeof summary !== 'object') {
    return { exp: 0, gold: 0, participantCount: 0, expPerPokemon: 0, levelUps: [], items: [], unlocks: [] };
  }

  const toSafeAmount = (value) => {
    const amount = Math.round(Number(value) || 0);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  };

  const levelUps = Array.isArray(summary.levelUps)
    ? summary.levelUps
      .map((levelUp) => ({
        name: typeof levelUp?.name === 'string' && levelUp.name.length > 0 ? levelUp.name : '宝可梦',
        fromLevel: toSafeAmount(levelUp?.fromLevel),
        toLevel: toSafeAmount(levelUp?.toLevel)
      }))
      .filter((levelUp) => levelUp.toLevel > 0)
      .slice(0, 5)
    : [];

  const items = mergeNormalizedMapRewardItems(summary.items)
    .map((item) => ({
      itemType: item.itemType,
      itemKey: item.itemKey,
      itemName: item.itemName,
      quantity: item.quantity,
      sprite: item.sprite
    }))
    .slice(0, 4);

  const unlocks = Array.isArray(summary.unlocks)
    ? summary.unlocks
      .map((unlock) => {
        const rawSpeciesNames = Array.isArray(unlock?.speciesNames)
          ? unlock.speciesNames
            .filter((name) => typeof name === 'string' && name.trim().length > 0)
            .map((name) => name.trim())
            .slice(0, 8)
          : [];
        const speciesPreview = getRareSpeciesPreview([
          ...(Array.isArray(unlock?.speciesPreview) ? unlock.speciesPreview : []),
          ...rawSpeciesNames
        ]).slice(0, 8);
        const speciesNames = speciesPreview.length > 0
          ? speciesPreview.map((monster) => monster.name)
          : rawSpeciesNames;
        const totalCount = Math.max(
          speciesPreview.length,
          speciesNames.length,
          Math.trunc(Number(unlock?.totalCount ?? speciesNames.length)) || speciesNames.length
        );
        return {
          kind: typeof unlock?.kind === 'string' && unlock.kind.length > 0 ? unlock.kind : 'rare',
          title: typeof unlock?.title === 'string' && unlock.title.length > 0 ? unlock.title : '稀有生态解锁',
          subtitle: typeof unlock?.subtitle === 'string' ? unlock.subtitle : '',
          description: typeof unlock?.description === 'string' ? unlock.description : '',
          chanceText: typeof unlock?.chanceText === 'string' ? unlock.chanceText : '',
          speciesPreview,
          speciesNames,
          totalCount
        };
      })
      .filter((unlock) => unlock.speciesPreview.length > 0 || unlock.speciesNames.length > 0 || unlock.description.length > 0)
      .slice(0, 2)
    : [];

  return {
    exp: toSafeAmount(summary.exp),
    gold: toSafeAmount(summary.gold),
    participantCount: toSafeAmount(summary.participantCount),
    expPerPokemon: toSafeAmount(summary.expPerPokemon),
    levelUps,
    items,
    unlocks
  };
};

const getPayableDefeatGoldPenalty = (rawPenalty, availableGold) => {
  const penalty = Math.max(0, Math.floor(Number(rawPenalty) || 0));
  const gold = Math.max(0, Math.floor(Number(availableGold) || 0));
  return Math.min(penalty, gold);
};

const getBattleEscapeRule = ({ battleKind = 'wild', battleEnvironment = null } = {}) => {
  const eventType = battleEnvironment?.eventType || null;
  const eventRole = battleEnvironment?.eventRole || null;
  const isBossBattle = eventType === 'boss' || eventRole === 'boss';
  const isChallengeBattle = eventType === 'challenge' || eventRole === 'challenge';
  const isTrainerBattle = battleKind === 'trainer';

  if (!isTrainerBattle && !isBossBattle && !isChallengeBattle) {
    return {
      kind: 'wild',
      canRun: true,
      blockedReason: '',
      inlineHint: '野外战可以尝试脱离战斗。',
      buttonNote: '可脱离',
      feedbackTitle: '',
      feedbackMessage: '',
      feedbackDurationMs: 0
    };
  }

  if (isBossBattle) {
    return {
      kind: 'boss',
      canRun: false,
      blockedReason: '首领的气场封住了退路，无法逃跑！',
      inlineHint: '首领战必须分出胜负。',
      buttonNote: '首领锁定',
      feedbackTitle: '退路被首领压住了',
      feedbackMessage: '强敌的压迫感笼住战场，只能正面迎战。',
      feedbackDurationMs: 920
    };
  }

  if (isChallengeBattle) {
    return {
      kind: 'challenge',
      canRun: false,
      blockedReason: '试炼已经开始，无法中途撤离！',
      inlineHint: '试炼战不可中途撤离。',
      buttonNote: '试炼锁定',
      feedbackTitle: '试炼尚未结束',
      feedbackMessage: '这场考验必须坚持到底，才能离开战场。',
      feedbackDurationMs: 820
    };
  }

  return {
    kind: 'trainer',
    canRun: false,
    blockedReason: '对手盯得很紧，训练家对战中不能逃跑。',
    inlineHint: '训练家对战已封锁逃跑。',
    buttonNote: '已被盯住',
    feedbackTitle: '退路被对手封住',
    feedbackMessage: '训练家对战要堂堂正正地打完。',
    feedbackDurationMs: 700
  };
};

const getEnemyTurnDelayMs = (logs = []) => {
  const latestLog = Array.isArray(logs) && logs.length > 0 ? logs[logs.length - 1] : '';
  if (typeof latestLog !== 'string') return 1500;
  if (latestLog.includes('逃跑失败') || latestLog.includes('没能甩开对手')) {
    return 920;
  }
  return 1500;
};

const isInsufficientGoldMessage = (message) => (
  typeof message === 'string' && message.includes('金币不足')
);

const createDefeatSummary = (payablePenalty, rawPenalty) => {
  return '挑战失败，队伍已恢复。';
};

const normalizeBattlePhaseData = (phase, data) => {
  if (!data || typeof data !== 'object') return null;

  if ((phase === 'intro' || phase === 'sendout') && data.enemyMon) {
    const sendOutSide = ['player', 'enemy', 'both'].includes(data.sendOutSide)
      ? data.sendOutSide
      : (phase === 'sendout' ? 'player' : null);
    const battleEnvironment = normalizeBattleEnvironment(data.battleEnvironment);
    const battleEventCompletion = normalizeBattleEventCompletion(
      data.battleEventCompletion || battleEnvironment?.battleEventCompletion,
      battleEnvironment
    );
    return {
      enemyMon: sanitizeBattleRuntime(normalizeMonsterAssetSource(data.enemyMon)),
      mapInfo: typeof data.mapInfo === 'string' ? data.mapInfo : '',
      leadMonId: data.leadMonId ?? null,
      message: typeof data.message === 'string' ? data.message : '',
      sendOutSide,
      battleEnvironment: battleEnvironment && battleEventCompletion
        ? { ...battleEnvironment, battleEventCompletion }
        : battleEnvironment,
      battleEventCompletion
    };
  }

  if (phase === 'victory') {
    const battleEnvironment = normalizeBattleEnvironment(data.battleEnvironment);
    const battleEventCompletion = normalizeBattleEventCompletion(
      data.battleEventCompletion || battleEnvironment?.battleEventCompletion,
      battleEnvironment
    );
    return {
      enemyName: typeof data.enemyName === 'string' && data.enemyName.length > 0 ? data.enemyName : '对手',
      isTrainer: Boolean(data.isTrainer),
      rewardSummary: normalizeBattleRewardSummary(data.rewardSummary),
      battleEnvironment: battleEnvironment && battleEventCompletion
        ? { ...battleEnvironment, battleEventCompletion }
        : battleEnvironment,
      battleEventCompletion
    };
  }

  return null;
};

const buildQueuedEnemySendOutPhaseData = ({
  enemyMon = null,
  leadMonId = null,
  message = '',
  battleEnvironment = null,
  battleEventCompletion = null
} = {}) => {
  const normalizedEnemyMon = enemyMon
    ? sanitizeBattleRuntime(normalizeMonsterAssetSource(enemyMon))
    : null;
  if (!normalizedEnemyMon) return null;

  const normalizedBattleEnvironment = normalizeBattleEnvironment(battleEnvironment);
  const normalizedBattleEventCompletion = normalizeBattleEventCompletion(
    battleEventCompletion || normalizedBattleEnvironment?.battleEventCompletion,
    normalizedBattleEnvironment
  );

  return {
    enemyMon: normalizedEnemyMon,
    leadMonId,
    message: typeof message === 'string' ? message : '',
    sendOutSide: 'enemy',
    battleEnvironment: normalizedBattleEnvironment && normalizedBattleEventCompletion
      ? { ...normalizedBattleEnvironment, battleEventCompletion: normalizedBattleEventCompletion }
      : normalizedBattleEnvironment,
    battleEventCompletion: normalizedBattleEventCompletion
  };
};

const normalizePendingTeacherRewardClaim = (claim) => {
  if (!claim || typeof claim !== 'object') return null;
  const token = typeof claim.token === 'string' && claim.token.length > 0 ? claim.token : null;
  if (!token) return null;

  return {
    token,
    rewardIds: Array.isArray(claim.rewardIds)
      ? claim.rewardIds.filter((id) => typeof id === 'string' && id.length > 0)
      : [],
    createdAt: typeof claim.createdAt === 'string' ? claim.createdAt : null
  };
};

const normalizeAppliedTeacherRewardIds = (value) => (
  Array.isArray(value)
    ? Array.from(new Set(value.filter((id) => typeof id === 'string' && id.length > 0)))
    : []
);

const normalizeLegacyTeacherRewardRecovery = (value) => {
  if (!value || typeof value !== 'object') return null;

  const rewards = Array.isArray(value.rewards)
    ? value.rewards.filter((reward) => reward && typeof reward === 'object')
    : [];
  if (rewards.length === 0) return null;

  const rewardIds = normalizeAppliedTeacherRewardIds(value.rewardIds);

  return {
    rewards,
    rewardIds,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : null
  };
};

const getLegacyTeacherRewardRecoveryStorageKey = (userId) => `pokemon-game:legacy-teacher-reward-recovery:${userId}`;

const readLegacyTeacherRewardRecoveryFromStorage = (userId) => {
  if (typeof window === 'undefined' || !userId) return null;

  try {
    const raw = window.localStorage.getItem(getLegacyTeacherRewardRecoveryStorageKey(userId));
    if (!raw) return null;
    return normalizeLegacyTeacherRewardRecovery(JSON.parse(raw));
  } catch (error) {
    console.error('Failed to read legacy teacher reward recovery:', error);
    return null;
  }
};

const writeLegacyTeacherRewardRecoveryToStorage = (userId, recovery) => {
  if (typeof window === 'undefined' || !userId) return;

  try {
    if (!recovery) {
      window.localStorage.removeItem(getLegacyTeacherRewardRecoveryStorageKey(userId));
      return;
    }
    window.localStorage.setItem(
      getLegacyTeacherRewardRecoveryStorageKey(userId),
      JSON.stringify(recovery)
    );
  } catch (error) {
    console.error('Failed to write legacy teacher reward recovery:', error);
  }
};

const clearLegacyTeacherRewardRecoveryFromStorage = (userId) => {
  if (typeof window === 'undefined' || !userId) return;

  try {
    window.localStorage.removeItem(getLegacyTeacherRewardRecoveryStorageKey(userId));
  } catch (error) {
    console.error('Failed to clear legacy teacher reward recovery:', error);
  }
};

const createDefaultCloudGameData = (gold = DEFAULT_STARTING_GOLD) => ({
  schemaVersion: 4,
  mapContentVersion: WORLD_MAP_CONTENT_VERSION,
  showLaunchScreen: true,
  view: 'map',
  turn: 'player',
  logs: ['在地图上探索吧！'],
  participatedMonIds: [],
  pendingGrowthEvents: [],
  playerTeam: [],
  storageBox: [],
  enemyTeam: [],
  activePlayerId: null,
  activeEnemyId: null,
  gameOver: false,
  battleKind: 'wild',
  battlePhase: 'active',
  battlePhaseData: null,
  battleEnvironment: null,
  battleEventCompletion: null,
  isThrowingPokeball: false,
  captureSequenceData: null,
  activeBattleEnergyCost: 0,
  battleEnergyRefundEligible: false,
  pendingTeacherRewardClaim: null,
  appliedTeacherRewardIds: [],
  legacyTeacherRewardRecovery: null,
  pendingMonsterAcquisition: null,
  pendingBattleSwitch: null,
  playerGold: gold,
  playerInventory: getDefaultInventory(),
  nextPlayerMonsterId: 100,
  nextEnemyMonsterId: 200,
  playerPos: getDefaultWorldPosition(),
  mapGrid: getInitialMapGrid(null),
  mapLevel: 1,
  maxReachedLevel: 1,
  useRealMaps: true,
  currentMapName: DEFAULT_WORLD_MAP_NAME,
  encounterCooldownSteps: 0,
  world: normalizeWorldState(null, {
    currentMapName: DEFAULT_WORLD_MAP_NAME,
    playerPos: getDefaultWorldPosition()
  })
});

const getSavedMapContentVersion = (gameData) => {
  const version = Number(gameData?.mapContentVersion ?? gameData?.world?.mapContentVersion ?? 0);
  return Number.isFinite(version) ? version : 0;
};

const hasAdventureMapRuntimeGridMismatch = (gameData) => {
  if (!gameData || typeof gameData !== 'object') return false;

  const savedMapName = gameData.world?.currentMapName || gameData.currentMapName || DEFAULT_WORLD_MAP_NAME;
  if (getAdventureMapInfo(savedMapName)?.renderMode !== 'three-lowpoly') return false;
  if (!Array.isArray(gameData.mapGrid) || gameData.mapGrid.length === 0) return false;

  const normalizedWorld = normalizeWorldState(gameData.world, {
    currentMapName: savedMapName,
    playerPos: gameData.playerPos || gameData.world?.playerPos || getMapStartPosition(savedMapName)
  });
  const runtimeGrid = buildMapGridForWorld(savedMapName, normalizedWorld, gameData.mapGrid);
  return !areMapGridsEqual(gameData.mapGrid, runtimeGrid);
};

const shouldPersistMapContentMigration = (gameData) => {
  if (!gameData || typeof gameData !== 'object') return false;
  const savedMapName = gameData.world?.currentMapName || gameData.currentMapName || DEFAULT_WORLD_MAP_NAME;
  return (
    getSavedMapContentVersion(gameData) !== WORLD_MAP_CONTENT_VERSION ||
    hasAdventureMapGridVisualRoadMismatch(savedMapName, gameData.mapGrid) ||
    hasAdventureMapRuntimeGridMismatch(gameData)
  );
};

const normalizeCloudGameData = (gameData, backendGold) => {
  if (!gameData || typeof gameData !== 'object') {
    return null;
  }

  const defaults = createDefaultCloudGameData(backendGold);
  const rawPlayerTeam = normalizeMonsterAssetList(gameData.playerTeam);
  const rawStorageBox = normalizeMonsterAssetList(gameData.storageBox);
  const roster = sanitizeRoster(rawPlayerTeam, rawStorageBox, gameData.activePlayerId);
  const progressRoster = normalizeRosterExpProgress({
    playerTeam: roster.playerTeam,
    storageBox: roster.storageBox,
    activePlayerId: roster.activePlayerId,
    pendingGrowthEvents: normalizePendingGrowthEvents(gameData.pendingGrowthEvents),
  });
  const playerTeam = progressRoster.playerTeam;
  const storageBox = progressRoster.storageBox;
  const enemyTeam = normalizeMonsterAssetList(gameData.enemyTeam);
  const battlePhase = normalizeBattlePhase(gameData.battlePhase);
  const captureSequenceData = normalizeCaptureSequenceData(gameData.captureSequenceData);
  const pendingBattleSwitch = normalizePendingBattleSwitch(gameData.pendingBattleSwitch);
  const view = gameData.view || defaults.view;
  const isBattleContext = view === 'battle' || Boolean(gameData.activeEnemyId);
  const activeEnemyId = isBattleContext ? resolveActiveEnemyId(enemyTeam, gameData.activeEnemyId) : null;
  const initialActivePlayerId = isBattleContext
    ? progressRoster.activePlayerId
    : resolveDefaultActivePlayerId(playerTeam, progressRoster.activePlayerId);
  const isThrowingPokeball = Boolean(gameData.isThrowingPokeball) && !!captureSequenceData;
  const normalizedBattlePhaseData = normalizeBattlePhaseData(battlePhase, gameData.battlePhaseData);
  const isBattleFlow = isBattleContext;
  const rawBattleEnvironment = isBattleFlow
    ? normalizeBattleEnvironment(gameData.battleEnvironment || normalizedBattlePhaseData?.battleEnvironment)
    : null;
  const normalizedBattleEventCompletion = isBattleFlow
    ? normalizeBattleEventCompletion(
      gameData.battleEventCompletion ||
      rawBattleEnvironment?.battleEventCompletion ||
      normalizedBattlePhaseData?.battleEventCompletion,
      rawBattleEnvironment
    )
    : null;
  const normalizedBattleEnvironment = rawBattleEnvironment && normalizedBattleEventCompletion
    ? { ...rawBattleEnvironment, battleEventCompletion: normalizedBattleEventCompletion }
    : rawBattleEnvironment;
  const serializedBattlePhaseData = normalizedBattlePhaseData && normalizedBattleEventCompletion
    ? {
      ...normalizedBattlePhaseData,
      battleEnvironment: normalizedBattlePhaseData.battleEnvironment || normalizedBattleEnvironment,
      battleEventCompletion: normalizedBattleEventCompletion
    }
    : normalizedBattlePhaseData;
  const normalized = {
    ...defaults,
    ...gameData,
    view,
    turn: normalizeBattleTurn(gameData.turn, {
      view,
      battlePhase,
      isThrowingPokeball,
      captureSequenceData
    }),
    playerTeam,
    storageBox,
    enemyTeam,
    participatedMonIds: Array.isArray(gameData.participatedMonIds) ? gameData.participatedMonIds : [],
    pendingGrowthEvents: progressRoster.pendingGrowthEvents,
    transientGrowthLevelUps: progressRoster.levelUps,
    logs: Array.isArray(gameData.logs) ? gameData.logs : defaults.logs,
    playerGold: typeof backendGold === 'number' ? backendGold : (typeof gameData.playerGold === 'number' ? gameData.playerGold : DEFAULT_STARTING_GOLD),
    playerInventory: sanitizePlayerInventory(gameData.playerInventory),
    playerPos: gameData.playerPos || defaults.playerPos,
    battleKind: gameData.battleKind || defaults.battleKind,
    battlePhase,
    battlePhaseData: serializedBattlePhaseData,
    battleEnvironment: normalizedBattleEnvironment,
    battleEventCompletion: normalizedBattleEventCompletion,
    isThrowingPokeball,
    captureSequenceData,
    activeBattleEnergyCost: normalizeBattleEnergyCost(gameData.activeBattleEnergyCost ?? defaults.activeBattleEnergyCost),
    battleEnergyRefundEligible: isBattleFlow && Boolean(gameData.battleEnergyRefundEligible),
    pendingTeacherRewardClaim: normalizePendingTeacherRewardClaim(gameData.pendingTeacherRewardClaim),
    appliedTeacherRewardIds: normalizeAppliedTeacherRewardIds(gameData.appliedTeacherRewardIds),
    legacyTeacherRewardRecovery: normalizeLegacyTeacherRewardRecovery(gameData.legacyTeacherRewardRecovery),
    pendingMonsterAcquisition: normalizePendingMonsterAcquisition(gameData.pendingMonsterAcquisition),
    pendingBattleSwitch,
    activePlayerId: initialActivePlayerId,
    activeEnemyId,
    mapLevel: gameData.mapLevel || defaults.mapLevel,
    maxReachedLevel: gameData.maxReachedLevel || defaults.maxReachedLevel,
    currentMapName: gameData.currentMapName || defaults.currentMapName,
    encounterCooldownSteps: Math.max(0, Math.trunc(Number(gameData.encounterCooldownSteps ?? defaults.encounterCooldownSteps ?? 0))),
    world: normalizeWorldState(
      {
        ...defaults.world,
        ...(gameData.world && typeof gameData.world === 'object' ? gameData.world : {})
      },
      {
        currentMapName: gameData.world?.currentMapName || gameData.currentMapName || defaults.currentMapName,
        playerPos: gameData.world?.playerPos || gameData.playerPos || defaults.world.playerPos
      }
    ),
    showLaunchScreen: Boolean(gameData.showLaunchScreen) || playerTeam.length === 0
  };

  normalized.currentMapName = normalized.world.currentMapName;
  normalized.playerPos = normalized.world.playerPos;
  const savedMapContentVersion = getSavedMapContentVersion(gameData);
  const mapContentChanged = savedMapContentVersion !== WORLD_MAP_CONTENT_VERSION;
  const safeMapName = hasAdventureMap(normalized.currentMapName)
    ? normalized.currentMapName
    : DEFAULT_WORLD_MAP_NAME;
  const mapGridVisualMismatch = hasAdventureMapGridVisualRoadMismatch(safeMapName, normalized.mapGrid);
  normalized.mapContentVersion = WORLD_MAP_CONTENT_VERSION;
  normalized.world.mapContentVersion = WORLD_MAP_CONTENT_VERSION;
  normalized.currentMapName = safeMapName;
  normalized.world.currentMapName = safeMapName;

  if (mapContentChanged || mapGridVisualMismatch || !Array.isArray(normalized.mapGrid) || normalized.mapGrid.length === 0) {
    normalized.mapGrid = (mapContentChanged || mapGridVisualMismatch)
      ? loadPokemonMap(safeMapName)
      : getInitialMapGrid(normalized);
    const startPosition = getMapStartPosition(safeMapName);
    normalized.playerPos = startPosition;
    normalized.world.playerPos = startPosition;
  }
  normalized.mapGrid = buildMapGridForWorld(safeMapName, normalized.world, normalized.mapGrid);

  if (normalized.view === 'battle' && (enemyTeam.length === 0 || !normalized.activeEnemyId)) {
    normalized.view = 'map';
    normalized.turn = 'player';
    normalized.battlePhase = 'active';
    normalized.battlePhaseData = null;
    normalized.battleEnvironment = null;
    normalized.battleEventCompletion = null;
    normalized.pendingBattleSwitch = null;
    normalized.isThrowingPokeball = false;
    normalized.captureSequenceData = null;
    normalized.activeBattleEnergyCost = 0;
    normalized.battleEnergyRefundEligible = false;
  }

  if (normalized.view !== 'battle' && !normalized.activeEnemyId) {
    normalized.playerTeam = (Array.isArray(normalized.playerTeam) ? normalized.playerTeam : []).map(clearBattleExitRuntime);
    normalized.storageBox = (Array.isArray(normalized.storageBox) ? normalized.storageBox : []).map(clearBattleExitRuntime);
    normalized.battlePhase = 'active';
    normalized.battlePhaseData = null;
    normalized.battleEnvironment = null;
    normalized.battleEventCompletion = null;
    normalized.pendingBattleSwitch = null;
    normalized.isThrowingPokeball = false;
    normalized.captureSequenceData = null;
    normalized.activeBattleEnergyCost = 0;
    normalized.battleEnergyRefundEligible = false;
    normalized.activePlayerId = resolveDefaultActivePlayerId(normalized.playerTeam, normalized.activePlayerId);
  } else if (normalized.battlePhase === 'intro' && !normalized.battlePhaseData?.enemyMon) {
    normalized.battlePhase = 'active';
    normalized.battlePhaseData = null;
    normalized.battleEnvironment = null;
    normalized.battleEventCompletion = null;
  }

  normalized.turn = normalizeBattleTurn(normalized.turn, {
    view: normalized.view,
    battlePhase: normalized.battlePhase,
    isThrowingPokeball: normalized.isThrowingPokeball,
    captureSequenceData: normalized.captureSequenceData
  });
  if (
    normalized.activeEnemyId &&
    normalized.battlePhase === 'active' &&
    normalized.turn !== 'resolving' &&
    normalized.turn !== 'capture'
  ) {
    const activeBattleMon = normalized.playerTeam.find((mon) => mon.id === normalized.activePlayerId);
    if (isBattleMonFainted(activeBattleMon) && getAliveBattleBench(normalized.playerTeam, normalized.activePlayerId).length > 0) {
      normalized.view = 'team';
      normalized.turn = 'player';
      normalized.battlePhaseData = null;
      normalized.pendingBattleSwitch = null;
      normalized.isThrowingPokeball = false;
      normalized.captureSequenceData = null;
    }
  }
  if (
    normalized.turn !== 'resolving' ||
    normalized.view !== 'battle' ||
    normalized.battlePhase !== 'active' ||
    normalized.pendingBattleSwitch?.nextActivePlayerId === normalized.activePlayerId
  ) {
    normalized.pendingBattleSwitch = null;
  }

  return normalized;
};

const createCloudSnapshot = (gameData) => {
  const rawPlayerTeam = normalizeMonsterAssetList(gameData.playerTeam);
  const rawStorageBox = normalizeMonsterAssetList(gameData.storageBox);
  const roster = sanitizeRoster(rawPlayerTeam, rawStorageBox, gameData.activePlayerId);
  const progressRoster = normalizeRosterExpProgress({
    playerTeam: roster.playerTeam,
    storageBox: roster.storageBox,
    activePlayerId: roster.activePlayerId,
    pendingGrowthEvents: normalizePendingGrowthEvents(gameData.pendingGrowthEvents),
  });
  const playerTeam = progressRoster.playerTeam;
  const storageBox = progressRoster.storageBox;
  const enemyTeam = normalizeMonsterAssetList(gameData.enemyTeam);
  const view = gameData.view || 'map';
  const battlePhase = normalizeBattlePhase(gameData.battlePhase);
  const captureSequenceData = normalizeCaptureSequenceData(gameData.captureSequenceData);
  const isThrowingPokeball = Boolean(gameData.isThrowingPokeball) && !!captureSequenceData;
  const pendingBattleSwitch = normalizePendingBattleSwitch(gameData.pendingBattleSwitch);
  const isBattleContext = view === 'battle' || Boolean(gameData.activeEnemyId);
  const activeEnemyId = isBattleContext ? resolveActiveEnemyId(enemyTeam, gameData.activeEnemyId) : null;
  const isBattleFlow = isBattleContext;
  const activePlayerId = isBattleFlow
    ? progressRoster.activePlayerId
    : resolveDefaultActivePlayerId(playerTeam, progressRoster.activePlayerId);
  const battlePhaseData = normalizeBattlePhaseData(battlePhase, gameData.battlePhaseData);
  const rawBattleEnvironment = isBattleFlow
    ? normalizeBattleEnvironment(gameData.battleEnvironment || battlePhaseData?.battleEnvironment)
    : null;
  const battleEventCompletion = isBattleFlow
    ? normalizeBattleEventCompletion(
      gameData.battleEventCompletion ||
      rawBattleEnvironment?.battleEventCompletion ||
      battlePhaseData?.battleEventCompletion,
      rawBattleEnvironment
    )
    : null;
  const battleEnvironment = rawBattleEnvironment && battleEventCompletion
    ? { ...rawBattleEnvironment, battleEventCompletion }
    : rawBattleEnvironment;
  const serializedBattlePhaseData = battlePhaseData && battleEventCompletion
    ? {
      ...battlePhaseData,
      battleEnvironment: battlePhaseData.battleEnvironment || battleEnvironment,
      battleEventCompletion
    }
    : battlePhaseData;
  const snapshotTurn = normalizeBattleTurnForSnapshot(gameData.turn, {
    view,
    battlePhase,
    isThrowingPokeball,
    captureSequenceData
  });
  const serializedPendingBattleSwitch = (
    view === 'battle' &&
    battlePhase === 'active' &&
    snapshotTurn === 'resolving' &&
    pendingBattleSwitch?.nextActivePlayerId !== activePlayerId
  )
    ? pendingBattleSwitch
    : null;
  const snapshotPlayerTeam = isBattleFlow ? playerTeam : playerTeam.map(clearBattleExitRuntime);
  const snapshotStorageBox = isBattleFlow ? storageBox : storageBox.map(clearBattleExitRuntime);
  const snapshotActivePlayerId = isBattleFlow
    ? activePlayerId
    : resolveDefaultActivePlayerId(snapshotPlayerTeam, activePlayerId);

  return {
    schemaVersion: 4,
    mapContentVersion: WORLD_MAP_CONTENT_VERSION,
    showLaunchScreen: Boolean(gameData.showLaunchScreen) || snapshotPlayerTeam.length === 0,
    view,
    turn: snapshotTurn,
    logs: Array.isArray(gameData.logs) ? gameData.logs.slice(-80) : ['在地图上探索吧！'],
    participatedMonIds: Array.isArray(gameData.participatedMonIds) ? gameData.participatedMonIds : [],
    pendingGrowthEvents: progressRoster.pendingGrowthEvents,
    playerTeam: snapshotPlayerTeam,
    storageBox: snapshotStorageBox,
    enemyTeam,
    activePlayerId: snapshotActivePlayerId,
    activeEnemyId,
    gameOver: Boolean(gameData.gameOver),
    battleKind: gameData.battleKind || 'wild',
    battlePhase,
    battlePhaseData: serializedBattlePhaseData,
    battleEnvironment,
    battleEventCompletion,
    isThrowingPokeball,
    captureSequenceData,
    activeBattleEnergyCost: normalizeBattleEnergyCost(gameData.activeBattleEnergyCost),
    battleEnergyRefundEligible: isBattleFlow && Boolean(gameData.battleEnergyRefundEligible),
    pendingTeacherRewardClaim: normalizePendingTeacherRewardClaim(gameData.pendingTeacherRewardClaim),
    appliedTeacherRewardIds: normalizeAppliedTeacherRewardIds(gameData.appliedTeacherRewardIds),
    legacyTeacherRewardRecovery: normalizeLegacyTeacherRewardRecovery(gameData.legacyTeacherRewardRecovery),
    pendingMonsterAcquisition: normalizePendingMonsterAcquisition(gameData.pendingMonsterAcquisition),
    pendingBattleSwitch: serializedPendingBattleSwitch,
    playerGold: typeof gameData.playerGold === 'number' ? gameData.playerGold : DEFAULT_STARTING_GOLD,
    playerInventory: sanitizePlayerInventory(gameData.playerInventory),
    nextPlayerMonsterId: gameData.nextPlayerMonsterId || 100,
    nextEnemyMonsterId: gameData.nextEnemyMonsterId || 200,
    playerPos: gameData.playerPos || getDefaultWorldPosition(),
    mapGrid: Array.isArray(gameData.mapGrid) ? gameData.mapGrid : [],
    mapLevel: gameData.mapLevel || 1,
    maxReachedLevel: gameData.maxReachedLevel || 1,
    useRealMaps: true,
    currentMapName: gameData.currentMapName || DEFAULT_WORLD_MAP_NAME,
    encounterCooldownSteps: Math.max(0, Math.trunc(Number(gameData.encounterCooldownSteps ?? 0))),
    world: normalizeWorldState(gameData.world, {
      currentMapName: gameData.currentMapName || gameData.world?.currentMapName || DEFAULT_WORLD_MAP_NAME,
      playerPos: gameData.playerPos || gameData.world?.playerPos || getDefaultWorldPosition()
    })
  };
};

const formatSaveTime = (value) => {
  if (!value) return '尚未保存';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '尚未保存';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
};

const CloudGateScreen = ({ title, message, actionLabel, onAction, busy = false }) => (
  <div className="game-app-bg">
    <div className="w-full max-w-sm game-card p-5 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-lg">
        <i className={`fa-solid ${busy ? 'fa-rotate fa-spin' : 'fa-cloud'}`}></i>
      </div>
      <h2 className="text-xl font-black text-gray-900 mb-2">{title}</h2>
      <p className="text-sm font-bold text-gray-700 leading-relaxed">{message}</p>
      {onAction && (
        <button
          onClick={onAction}
          className="mt-4 w-full game-primary-button py-2"
        >
          {actionLabel}
        </button>
      )}
    </div>
  </div>
);

const CloudSaveControls = ({ disabled, isOnline, lastSavedAt, saveStatus, syncError, onSave, floating = false, requiresReload = false }) => {
  const isSaving = saveStatus === 'auto-saving' || saveStatus === 'manual-saving';
  const actionLabel =
    requiresReload ? '重新读取云端' :
    isSaving ? '保存中' :
    '保存云端';
  const actionIcon =
    requiresReload ? 'fa-rotate-right' :
    isSaving ? 'fa-rotate fa-spin' :
    'fa-cloud-arrow-up';
  const statusText =
    !isOnline ? '离线，等待恢复网络' :
    syncError ? syncError :
    isSaving ? '正在同步云端...' :
    saveStatus === 'saved' ? `已保存 ${formatSaveTime(lastSavedAt)}` :
    `云端 ${formatSaveTime(lastSavedAt)}`;

  return (
    <div className={`cloud-save-widget ${floating ? 'cloud-save-floating' : ''}`}>
      <button
        onClick={onSave}
        disabled={disabled || isSaving || !isOnline}
        className="game-icon-button"
        title={`${actionLabel} · ${statusText}`}
        aria-label={`${actionLabel} · ${statusText}`}
      >
        <i className={`fa-solid ${actionIcon}`}></i>
      </button>
      <div className={`cloud-status-chip ${syncError || !isOnline ? 'cloud-status-chip-error' : ''}`}>
        {statusText}
      </div>
    </div>
  );
};

const CloudSyncBlocker = ({ isOnline, syncError, saveStatus, onRetry, requiresReload = false }) => {
  if (isOnline && !syncError) return null;
  const isSaving = saveStatus === 'auto-saving' || saveStatus === 'manual-saving';
  const actionText =
    requiresReload ? '重新读取云端进度' :
    isSaving ? '正在重试...' :
    '立即同步';

  return (
    <div
      className="game-bounded-modal-overlay game-bounded-modal-overlay--cloud"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-sync-title"
    >
      <div className="w-full max-w-sm game-card p-5 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-lg">
          <i className="fa-solid fa-wifi"></i>
        </div>
        <h2 id="cloud-sync-title" className="text-xl font-black text-gray-900 mb-2">需要云端同步</h2>
        <p className="text-sm font-bold text-gray-700 leading-relaxed">
          {!isOnline ? '当前网络已断开，游戏必须连接后端才能继续。' : syncError}
        </p>
        <button
          onClick={onRetry}
          disabled={!isOnline || isSaving}
          className="mt-4 w-full game-primary-button py-2"
        >
          {actionText}
        </button>
      </div>
    </div>
  );
};

const ResetProgressConfirmModal = ({ open, busy = false, onCancel, onConfirm }) => {
  if (!open) return null;

  return (
    <div className="reset-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-confirm-title">
      <div className="reset-confirm-card">
        <div className="reset-confirm-card__icon" aria-hidden="true">
          <i className={`fa-solid ${busy ? 'fa-rotate fa-spin' : 'fa-rotate-left'}`}></i>
        </div>
        <div className="reset-confirm-card__body">
          <p className="reset-confirm-card__eyebrow">重新开始</p>
          <h2 id="reset-confirm-title">清空当前账号进度？</h2>
          <p>
            队伍、背包、地图、战斗、金币和当前存档都会清空，之后会回到重新选择初始宝可梦的阶段。
          </p>
        </div>
        <div className="reset-confirm-card__actions">
          <button type="button" className="game-soft-button" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button type="button" className="game-danger-button" onClick={onConfirm} disabled={busy}>
            <i className={`fa-solid ${busy ? 'fa-rotate fa-spin' : 'fa-trash-can'}`}></i>
            {busy ? '清空中' : '确认清空'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ChallengeBattleConfirmModal = ({
  open,
  busy = false,
  eventName = '区域试炼',
  eventTitle = '连战挑战',
  energyCost = 1,
  teamSize = 3,
  levelRangeText = '',
  rewardItems = [],
  rewardLabel = '',
  rewardDescriptions = [],
  unlockSpeciesPool = [],
  unlockDescription = '',
  unlockProgress = null,
  battlePreviewTeam = [],
  alreadyCompleted = false,
  onCancel,
  onConfirm
}) => {
  if (!open) return null;

  const unlockSpecies = getChallengeUnlockSpeciesPreview(unlockSpeciesPool);
  const battlePreviewSpecies = getChallengeBattleSpeciesPreview(battlePreviewTeam);
  const showingBattlePreview = alreadyCompleted && unlockSpecies.length === 0 && battlePreviewSpecies.length > 0;
  const displayedSpecies = showingBattlePreview ? battlePreviewSpecies : unlockSpecies;
  const unlockCount = unlockSpecies.length;
  const displayedSpeciesCount = showingBattlePreview ? battlePreviewSpecies.length : unlockCount;
  const unlockPreviewSpecies = displayedSpecies.slice(0, 8);
  const hiddenUnlockCount = Math.max(0, displayedSpeciesCount - unlockPreviewSpecies.length);
  const normalizedRewardItems = mergeNormalizedMapRewardItems(rewardItems);
  const fallbackRewardItems = normalizedRewardItems.length > 0
    ? normalizedRewardItems
    : rewardDescriptions.map((reward, index) => ({
      itemName: reward,
      quantity: 1,
      itemKey: `legacy-${index}`,
      itemType: 'legacy',
      sprite: ''
    }));
  const totalUnlockCount = Math.max(0, Math.trunc(Number(unlockProgress?.totalCount)) || 0);
  const currentUnlockedCount = Math.max(0, Math.trunc(Number(unlockProgress?.unlockedCount)) || 0);
  const nextUnlockedCount = totalUnlockCount > 0
    ? Math.min(totalUnlockCount, currentUnlockedCount + unlockCount)
    : unlockCount;
  const nextBatchIndex = Math.max(1, Math.trunc(Number(unlockProgress?.nextBatchIndex)) || 1);
  const progressText = totalUnlockCount > 0 ? `累计 ${nextUnlockedCount}/${totalUnlockCount} 种` : '';
  const introText = alreadyCompleted
    ? unlockCount > 0
      ? `${eventTitle}可继续挑战。本次通关会解锁第 ${nextBatchIndex} 批隐藏生态。`
      : `${eventTitle}可继续挑战。隐藏生态已全部解锁，首通奖励不会重复领取。`
    : unlockCount > 0
      ? `${eventTitle}会立刻开始。完成后除了拿到奖励，还会解锁第 ${nextBatchIndex} 批野生宝可梦。`
      : `${eventTitle}会立刻开始。确认后将进入连续对战。`;
  const unlockLeadText = alreadyCompleted
    ? unlockCount > 0
      ? `通关后新增 ${unlockCount} 种野生宝可梦。${progressText}`
      : (showingBattlePreview
      ? '隐藏生态已开启，本次试炼会派出以下守护者。'
      : (unlockDescription || '本区域隐藏生态已全部开启。'))
    : unlockCount > 0
      ? `完成试炼后，本区域草丛会新增 ${unlockCount} 种野生宝可梦。${progressText}`
      : unlockDescription;

  return (
    <div className="reset-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="challenge-confirm-title">
      <div className="reset-confirm-card challenge-confirm-card">
        <div className="reset-confirm-card__icon challenge-confirm-card__icon" aria-hidden="true">
          <i className={`fa-solid ${busy ? 'fa-rotate fa-spin' : 'fa-landmark'}`}></i>
        </div>
        <div className="reset-confirm-card__body">
          <p className="reset-confirm-card__eyebrow">试炼确认</p>
          <h2 id="challenge-confirm-title">{eventName}</h2>
          <p className="challenge-confirm-card__lead">{introText}</p>
          <div className="challenge-confirm-card__chips" aria-label="挑战信息">
            <span className="challenge-confirm-card__chip">{teamSize} 连战</span>
            {levelRangeText ? (
              <span className="challenge-confirm-card__chip">{levelRangeText}</span>
            ) : null}
            <span className="challenge-confirm-card__chip">消耗 {energyCost} 点能量</span>
          </div>
          {fallbackRewardItems.length > 0 ? (
            <div className="challenge-confirm-card__reward challenge-confirm-card__reward--summary">
              <span className="challenge-confirm-card__reward-label">{rewardLabel || (alreadyCompleted ? '本次挑战奖励' : '首通与本次奖励')}</span>
              <div className="challenge-confirm-card__reward-list" aria-label="完成奖励列表">
                {fallbackRewardItems.map((reward, index) => (
                  <span key={`${reward.itemType}-${reward.itemKey}-${index}`} className="challenge-confirm-card__reward-pill">
                    <span className="challenge-confirm-card__reward-icon" aria-hidden="true">
                      {reward.sprite ? (
                        <img src={reward.sprite} alt="" onError={handleItemImageError} />
                      ) : (
                        <i className="fa-solid fa-gift"></i>
                      )}
                    </span>
                    <span className="challenge-confirm-card__reward-name">{reward.itemName}</span>
                    {reward.quantity > 1 ? (
                      <span className="challenge-confirm-card__reward-qty">x{reward.quantity}</span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {(displayedSpeciesCount > 0 || unlockDescription) ? (
            <div className="challenge-confirm-card__reward challenge-confirm-card__reward--unlock">
              <div className="challenge-confirm-card__reward-head">
                <span className="challenge-confirm-card__reward-label">{showingBattlePreview ? '本次试炼守护者' : unlockCount > 0 ? `本次解锁 · 第 ${nextBatchIndex} 批` : '隐藏生态已全部开启'}</span>
                {displayedSpeciesCount > 0 ? (
                  <span className="challenge-confirm-card__reward-count">{showingBattlePreview ? `${displayedSpeciesCount} 只` : `${displayedSpeciesCount} 种`}</span>
                ) : null}
              </div>
              {unlockLeadText ? (
                <p className="challenge-confirm-card__reward-copy">{unlockLeadText}</p>
              ) : null}
              {displayedSpeciesCount > 0 ? (
                <div className="challenge-confirm-card__unlock-grid" aria-label={showingBattlePreview ? '本次试炼守护者' : '解锁的野生宝可梦'}>
                  {unlockPreviewSpecies.map((monster) => (
                    <div key={monster.id} className="challenge-confirm-card__unlock-mon">
                      <div className="challenge-confirm-card__unlock-sprite">
                        <img src={monster.sprite} alt={monster.name} onError={handlePokemonImageError} />
                      </div>
                      <span className="challenge-confirm-card__unlock-name">{monster.name}</span>
                      {monster.level ? <span className="challenge-confirm-card__unlock-level">Lv.{monster.level}</span> : null}
                    </div>
                  ))}
                  {hiddenUnlockCount > 0 ? (
                    <div className="challenge-confirm-card__unlock-mon challenge-confirm-card__unlock-mon--more">
                      <div className="challenge-confirm-card__unlock-sprite" aria-hidden="true">
                        <span className="challenge-confirm-card__more-mark">+{hiddenUnlockCount}</span>
                      </div>
                      <span className="challenge-confirm-card__unlock-name">更多稀有</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="reset-confirm-card__actions">
          <button type="button" className="game-soft-button" onClick={onCancel} disabled={busy}>
            稍后再来
          </button>
          <button type="button" className="game-primary-button" onClick={onConfirm} disabled={busy}>
            <i className={`fa-solid ${busy ? 'fa-rotate fa-spin' : 'fa-bolt'}`}></i>
            {busy ? '进入中' : '开始挑战'}
          </button>
        </div>
      </div>
    </div>
  );
};

const SpringRestoreConfirmModal = ({
  open,
  busy = false,
  springName = '恢复泉水',
  cost = 1,
  currentGold = 0,
  error = '',
  onCancel,
  onConfirm
}) => {
  if (!open) return null;

  const displayGold = Number.isFinite(Number(currentGold)) ? Math.max(0, Math.trunc(Number(currentGold))) : 0;
  const displayCost = Math.max(1, Math.trunc(Number(cost)) || 1);
  const canAfford = displayGold >= displayCost;

  return (
    <div className="reset-confirm-overlay spring-restore-overlay" role="dialog" aria-modal="true" aria-labelledby="spring-restore-title">
      <div className="reset-confirm-card spring-restore-card">
        <div className="reset-confirm-card__icon spring-restore-card__icon" aria-hidden="true">
          <i className={`fa-solid ${busy ? 'fa-rotate fa-spin' : 'fa-droplet'}`}></i>
        </div>
        <div className="reset-confirm-card__body">
          <p className="reset-confirm-card__eyebrow spring-restore-card__eyebrow">泉水恢复</p>
          <h2 id="spring-restore-title">{springName}</h2>
          <p>
            支付 {displayCost} 金币后，泉水会为队伍全员恢复体力、技能值并解除异常状态。
          </p>
          <div className="spring-restore-card__chips" aria-label="泉水恢复信息">
            <span className="spring-restore-card__chip">
              <i className="fa-solid fa-coins"></i>
              当前 {displayGold} 金币
            </span>
            <span className="spring-restore-card__chip">
              <i className="fa-solid fa-heart-pulse"></i>
              HP / MP / 异常全恢复
            </span>
          </div>
          {(!canAfford || error) && (
            <p className="spring-restore-card__warning">
              {error || `金币不足，还需要 ${displayCost - displayGold} 金币。`}
            </p>
          )}
        </div>
        <div className="reset-confirm-card__actions">
          <button type="button" className="game-soft-button" onClick={onCancel} disabled={busy}>
            暂不恢复
          </button>
          <button type="button" className="game-primary-button" onClick={onConfirm} disabled={busy || !canAfford}>
            <i className={`fa-solid ${busy ? 'fa-rotate fa-spin' : 'fa-coins'}`}></i>
            {busy ? '恢复中' : `支付 ${displayCost} 金币`}
          </button>
        </div>
      </div>
    </div>
  );
};

const FastTravelMapModal = ({
  open,
  currentMapName,
  currentGold = 0,
  playerTeam = [],
  world,
  busy = false,
  error = '',
  onCancel,
  onTravel
}) => {
  if (!open) return null;

  const displayGold = Number.isFinite(Number(currentGold)) ? Math.max(0, Math.trunc(Number(currentGold))) : 0;
  const canAfford = displayGold >= FAST_TRAVEL_COST;
  const entries = ADVENTURE_MAP_CHAIN.map((mapName) => {
    const config = getMapConfig(mapName);
    const station = getFastTravelStation(mapName) || getMapStartPosition(mapName);
    const meta = getFastTravelStationMeta(mapName) || {};
    const lockState = getFastTravelMapLockState({ targetMapName: mapName, currentMapName, world, playerTeam });
    const current = lockState.current || mapName === currentMapName;
    const locked = Boolean(lockState.locked);
    const incomingRoutes = getFastTravelIncomingRoutes(mapName);
    const forwardRoutes = getFastTravelForwardRoutes(mapName);
    return {
      mapName,
      config,
      station,
      current,
      locked,
      reason: lockState.reason,
      incomingRoutes,
      forwardRoutes,
      terrain: meta.terrain || 'meadow',
      stationTitle: meta.title || '星纹传送台',
      landmark: meta.landmark || `传送点 ${station.x},${station.y}`,
      symbol: meta.symbol || 'leaf'
    };
  });
  const unlockedCount = entries.filter((entry) => !entry.locked).length;
  const currentEntry = entries.find((entry) => entry.current) || entries[0];
  const currentStationLabel = currentEntry?.landmark || currentEntry?.stationTitle || '当前传送台';

  return (
    <div className="fast-travel-overlay" role="dialog" aria-modal="true" aria-labelledby="fast-travel-title">
      <section className="fast-travel-panel animate-bounce-in">
        <header className="fast-travel-header">
          <div className="fast-travel-heading">
            <h2 id="fast-travel-title">选择目的地</h2>
            <span>{currentStationLabel} · {unlockedCount}/{entries.length} 已连通</span>
          </div>
          <div className="fast-travel-status">
            <span><i className="fa-solid fa-coins"></i>{displayGold}</span>
            <span>{FAST_TRAVEL_COST}/次</span>
            <button type="button" className="game-icon-button" onClick={onCancel} disabled={busy} title="关闭" aria-label="关闭">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </header>

        <div className="fast-travel-destination-body">
          <div className="fast-travel-route-backdrop" aria-hidden="true">
            <div className="fast-travel-route-backdrop__land fast-travel-route-backdrop__land--a"></div>
            <div className="fast-travel-route-backdrop__land fast-travel-route-backdrop__land--b"></div>
            <div className="fast-travel-route-backdrop__land fast-travel-route-backdrop__land--c"></div>
            <div className="fast-travel-route-rail">
              {entries.map((entry, index) => {
                const percent = entries.length <= 1 ? 50 : (index / (entries.length - 1)) * 100;
                return (
                  <span
                    key={`route-step-${entry.mapName}`}
                    className={[
                      'fast-travel-route-step',
                      entry.current ? 'fast-travel-route-step--current' : '',
                      entry.locked ? 'fast-travel-route-step--locked' : ''
                    ].filter(Boolean).join(' ')}
                    style={{ left: `${percent}%` }}
                  >
                    <i className={`fa-solid ${FAST_TRAVEL_SYMBOL_ICONS[entry.symbol] || 'fa-location-dot'}`}></i>
                  </span>
                );
              })}
            </div>
          </div>

          <div className="fast-travel-destination-list" aria-label="快速传送目的地">
            {entries.map((entry, index) => {
              const disabled = busy || entry.current || entry.locked || !canAfford;
              const statusText = entry.current
                ? '当前位置'
                : entry.locked
                  ? '未解锁'
                  : !canAfford
                    ? '金币不足'
                    : '传送';
              const routeLabel = entry.incomingRoutes.length === 0
                ? '旅程起点'
                : `来自 ${entry.incomingRoutes.map((route) => route.fromLabel).join(' / ')}`;
              const routeLinks = entry.forwardRoutes.length > 0
                ? entry.forwardRoutes.map((route) => `${route.directionLabel} → ${route.targetLabel}`).join(' · ')
                : '终点区域';
              const detailText = entry.locked
                ? (entry.reason || '未解锁')
                : entry.current
                  ? entry.stationTitle
                  : entry.landmark;
              const compactStatusText = entry.locked
                ? '未解锁'
                : statusText;
              return (
                <button
                  key={entry.mapName}
                  type="button"
                  className={[
                    'fast-travel-destination',
                    `fast-travel-destination--${entry.terrain}`,
                    entry.current ? 'fast-travel-destination--current' : '',
                    entry.locked ? 'fast-travel-destination--locked' : '',
                    !canAfford && !entry.current && !entry.locked ? 'fast-travel-destination--poor' : ''
                  ].filter(Boolean).join(' ')}
                  disabled={disabled}
                  onClick={() => onTravel?.(entry.mapName)}
                  aria-label={`${entry.config.displayName}，${compactStatusText}，${entry.stationTitle}`}
                  title={`${entry.config.displayName} · ${entry.stationTitle} · ${compactStatusText}`}
                >
                  <span className="fast-travel-destination__order" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <span className="fast-travel-destination__icon" aria-hidden="true">
                    <i className={`fa-solid ${FAST_TRAVEL_SYMBOL_ICONS[entry.symbol] || 'fa-location-dot'}`}></i>
                  </span>
                  <span className="fast-travel-destination__copy">
                    <span className="fast-travel-destination__route">{routeLabel}</span>
                    <strong>{entry.config.displayName}</strong>
                    <small>{detailText}</small>
                    <span className="fast-travel-destination__links">{routeLinks}</span>
                  </span>
                  <span className="fast-travel-destination__status">{compactStatusText}</span>
                </button>
              );
            })}
          </div>

        </div>

        <footer className="fast-travel-footer">
          <span className={error || !canAfford ? 'fast-travel-footer__warning' : ''}>
            {error || (canAfford ? '选择已连通目的地，抵达固定传送台。' : `需要 ${FAST_TRAVEL_COST} 金币才能传送。`)}
          </span>
          {busy && <i className="fa-solid fa-rotate fa-spin" aria-hidden="true"></i>}
        </footer>
      </section>
    </div>
  );
};

const FastTravelTransitOverlay = ({ transit }) => {
  const phase = ['departing', 'arriving', 'syncing'].includes(transit?.phase) ? transit.phase : 'departing';
  const direction = ['down', 'left', 'right', 'up'].includes(transit?.travelDirection) ? transit.travelDirection : 'right';
  const isMapWarp = transit?.kind === 'warp';
  const pose = phase === 'arriving' ? 'idle' : 'run';
  const fallbackFigureSrc = useMemo(
    () => getFastTravelFigureDataUrl({
      direction,
      pose
    }),
    [direction, pose]
  );
  const [figureSrc, setFigureSrc] = useState(fallbackFigureSrc);

  useEffect(() => {
    let cancelled = false;
    setFigureSrc(fallbackFigureSrc);

    if (transit?.renderMode !== 'three-lowpoly') {
      return () => {
        cancelled = true;
      };
    }

    import("../../game/playerFigureVisual")
      .then(({ getLowPolyPlayerFigureDataUrl }) => {
        if (cancelled) return;
        setFigureSrc(getLowPolyPlayerFigureDataUrl({
          direction: 'right',
          pose: pose === 'run' ? 'run' : 'idle',
          width: 224,
          height: 224,
          scale: 0.72,
          cameraPreset: 'travel'
        }));
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('[FastTravelTransitOverlay] Failed to load low-poly preview figure:', error);
          setFigureSrc(fallbackFigureSrc);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackFigureSrc, pose, transit?.renderMode]);

  if (!transit) return null;

  const fromLabel = transit.fromLabel || '当前位置';
  const toLabel = transit.toLabel || '目的地';
  const headline = phase === 'arriving'
    ? `${isMapWarp ? '进入' : '抵达'} ${toLabel}`
    : phase === 'syncing'
      ? (isMapWarp ? '道路连接中' : '星路同步中')
      : `前往 ${toLabel}`;
  const caption = phase === 'arriving'
    ? '地图正在展开'
    : `${fromLabel} -> ${toLabel}`;
  const ariaPrefix = isMapWarp ? '区域连接' : '快速传送';

  return (
    <div
      className={`fast-travel-cinematic fast-travel-cinematic--${phase} fast-travel-cinematic--${transit.terrain || 'meadow'}`}
      aria-live="polite"
      aria-label={`${ariaPrefix}：${fromLabel} 前往 ${toLabel}`}
    >
      <div className="fast-travel-cinematic__vignette" aria-hidden="true" />
      <div className="fast-travel-cinematic__road" aria-hidden="true">
        <span /><span /><span />
      </div>
      <div className="fast-travel-cinematic__cue" aria-hidden="true">
        <i className="fa-solid fa-location-dot"></i>
      </div>
      <div className="fast-travel-cinematic__target" aria-hidden="true">
        <span /><span />
      </div>
      <div className="fast-travel-cinematic__runner" aria-hidden="true">
        <span className="fast-travel-cinematic__aura" />
        {figureSrc ? (
          <img src={figureSrc} alt="" />
        ) : (
          <span className="fast-travel-cinematic__fallback" />
        )}
      </div>
      <div className="fast-travel-cinematic__copy">
        <strong>{headline}</strong>
        <p>{caption}</p>
      </div>
    </div>
  );
};

const AdventureTopBar = ({
  user,
  activeMon,
  playerGold,
  playerEnergy,
  maxEnergy,
  saveProps,
  onLogout,
  onResetGame,
  resetDisabled = false,
  audioSettings = null,
  onToggleAudio = null,
  onVolumeChange = null
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsPanelRef = useRef(null);
  const displayName = user?.nickname || user?.username || '冒险者';
  const avatarSrc = activeMon?.sprite || PLAYER_SPRITE_URL;
  const level = activeMon?.level || 1;
  const energyValue = Number.isFinite(Number(playerEnergy)) ? Number(playerEnergy) : 0;
  const maxEnergyValue = Number.isFinite(Number(maxEnergy)) && Number(maxEnergy) > 0 ? Number(maxEnergy) : DEFAULT_MAX_ENERGY;
  const goldValue = Number.isFinite(Number(playerGold)) ? Number(playerGold) : 0;
  const formattedGold = goldValue.toLocaleString('zh-CN');
  const resolvedAudioSettings = normalizeAudioSettings(audioSettings);
  const audioEnabled = resolvedAudioSettings.enabled && resolvedAudioSettings.volume > 0;
  const audioVolumePercent = Math.round(resolvedAudioSettings.volume * 100);
  const audioButtonTitle = audioEnabled ? `音效已开 ${audioVolumePercent}%` : '音效已关闭';

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!settingsPanelRef.current?.contains(event.target)) {
        setSettingsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [settingsOpen]);

  const settingsOverlay = settingsOpen ? (
    <div
      className="reset-confirm-overlay topbar-settings-overlay topbar-settings-overlay--shell"
      role="dialog"
      aria-modal="true"
      aria-labelledby="topbar-settings-title"
    >
      <div className="reset-confirm-card topbar-settings-card" ref={settingsPanelRef}>
        <button
          type="button"
          className="game-icon-button topbar-settings-close"
          onClick={() => setSettingsOpen(false)}
          aria-label="关闭设置"
          title="关闭设置"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
        <div className="topbar-settings-card__header">
          <p className="reset-confirm-card__eyebrow">设置</p>
          <h2 id="topbar-settings-title">冒险控制台</h2>
          <p>存档、音量和重置都放在这里。</p>
        </div>
        <div className="topbar-settings-card__body">
          <section className="topbar-settings-card__section">
            <div className="topbar-settings-card__label">云端存档</div>
            <CloudSaveControls {...saveProps} />
          </section>
          {onToggleAudio && (
            <section className="topbar-settings-card__section">
              <div className="topbar-settings-card__label">音量</div>
              <div className="topbar-settings-card__row">
                <button
                  type="button"
                  onClick={onToggleAudio}
                  className={`game-icon-button ${audioEnabled ? '' : 'game-icon-button--muted'} topbar-volume-button`}
                  title={audioButtonTitle}
                  aria-label={audioButtonTitle}
                  aria-pressed={audioEnabled}
                >
                  <i className={`fa-solid ${audioEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}`}></i>
                </button>
                {onVolumeChange && (
                  <label className="topbar-audio-slider" aria-label="音效音量">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={audioVolumePercent}
                      onChange={(event) => onVolumeChange?.(event.target.value)}
                      title={`音效音量 ${audioVolumePercent}%`}
                      aria-label={`音效音量 ${audioVolumePercent}%`}
                    />
                    <span>{audioVolumePercent}%</span>
                  </label>
                )}
              </div>
            </section>
          )}
          {onResetGame && (
            <section className="topbar-settings-card__section">
              <div className="topbar-settings-card__label">重置</div>
              <button
                onClick={onResetGame}
                disabled={resetDisabled}
                className="game-icon-button game-icon-button--danger topbar-reset-button topbar-settings-card__reset"
                title="重置进度"
                aria-label="重置进度"
              >
                <i className="fa-solid fa-rotate-left"></i>
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const settingsPortalRoot =
    settingsOpen && typeof document !== 'undefined'
      ? document.querySelector('.game-console-shell')
      : null;

  return (
    <div className="game-topbar game-topbar--unified">
      <div
        className="map-player-hud map-hud-frosted"
        aria-label={`${displayName}，等级 ${level}，金币 ${formattedGold}，体力 ${energyValue} / ${maxEnergyValue}`}
      >
        <div className="map-player-hud__avatar">
          <img src={avatarSrc} onError={handlePokemonImageError} alt="" />
        </div>
        <div className="map-player-hud__info">
          <div className="map-player-hud__line map-player-hud__line--name">
            <span className="map-player-hud__name">{displayName}</span>
            <span className="map-player-hud__level">Lv.{level}</span>
          </div>
          <div className="map-player-hud__line map-player-hud__stat map-player-hud__stat--gold">
            <i className="fa-solid fa-coins" aria-hidden="true"></i>
            <span>{formattedGold}</span>
          </div>
          <div className="map-player-hud__line map-player-hud__stat map-player-hud__stat--energy">
            <i className="fa-solid fa-bolt" aria-hidden="true"></i>
            <span>{energyValue}/{maxEnergyValue}</span>
          </div>
        </div>
      </div>
      <div className="map-action-rail map-hud-actions-rail">
        <button
          type="button"
          onClick={() => {
            gameAudio.prime();
            setSettingsOpen((current) => !current);
          }}
          className={`map-action-button map-action-button--icon map-hud-icon-button map-hud-frosted${settingsOpen ? ' map-hud-icon-button--active' : ''}`}
          title="设置"
          aria-label="设置"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
        >
          <i className={`fa-solid ${settingsOpen ? 'fa-xmark' : 'fa-gear'}`}></i>
        </button>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="map-action-button map-action-button--icon map-hud-icon-button map-hud-frosted"
            title="退出登录"
            aria-label="退出登录"
          >
            <i className="fa-solid fa-right-from-bracket"></i>
          </button>
        )}
      </div>
      {settingsPortalRoot && settingsOverlay
        ? createPortal(settingsOverlay, settingsPortalRoot)
        : settingsOverlay}
    </div>
  );
};

const NOTIFICATION_TYPES = new Set(['gold', 'item', 'info', 'success', 'error', 'warning']);
const NOTIFICATION_BASE_DURATION_MS = {
  error: 4800,
  warning: 4400,
  item: 3000,
  gold: 3000,
  success: 3200,
  info: 3400
};
const NOTIFICATION_MAX_DURATION_MS = {
  error: 7600,
  warning: 7000,
  item: 5200,
  gold: 5200,
  success: 5400,
  info: 6200
};
const MAX_VISIBLE_NOTIFICATIONS = 1;
const NOTIFICATION_EXACT_MESSAGE_REPLACEMENTS = new Map([
  ['检测到云端已有更新，为避免旧进度覆盖新进度，必须重新读取云端进度。', '云端已有新进度，请重新读取。'],
  ['云端已有新进度，请先重新读取。', '云端已有新进度，请重新读取。'],
  ['云端已有更晚进度，请先重新读取。', '云端已有新进度，请重新读取。'],
  ['请重新同步后再试。', '请重新读取后重试。'],
  ['请重新同步后继续。', '请重新读取后继续。'],
  ['云端请求失败，请稍后重试。', '云端请求失败，稍后重试。'],
  ['云端同步失败，请稍后重试。', '云端同步失败，稍后重试。'],
  ['云端同步忙碌，请稍后重试。', '云端忙碌，稍后重试。'],
  ['后端资源同步失败，请稍后重试。', '资源同步失败，稍后重试。'],
  ['购买失败，请重试。', '购买失败，请重试。'],
  ['地图道具拾取失败，请重试。', '拾取失败，请重试。'],
  ['果实采集失败，请重试。', '采集失败，请重试。'],
  ['恢复点使用失败，请重试。', '恢复失败，请重试。'],
  ['战败结果未能安全保存，请重新同步后重试。', '战败未保存，请重新读取。'],
  ['逃跑结算未能安全保存，请重新同步后继续。', '逃跑未保存，请重新读取。'],
  ['地图切换未能保存，请重新同步后再试。', '地图切换未保存，请重新读取。'],
  ['捕捉结果无法安全写入，请重新读取云端进度。', '捕捉结果未保存，请重新读取。'],
  ['奖励领取批次已变化，请重新读取云端进度。', '奖励批次已变化，请重新读取。'],
  ['精灵球数量已变化，请重新读取当前状态。', '精灵球数量已变化，请重新读取。'],
  ['药剂数量已变化，请重新读取当前状态。', '药剂数量已变化，请重新读取。'],
  ['经验药水数量已变化，请重新读取当前状态。', '经验药水数量已变化，请重新读取。'],
  ['下一只敌方宝可梦状态已变化，请重新读取当前战斗。', '对手状态已变化，请重新读取。'],
  ['对手换人的目标状态已变化，请重新读取当前战斗。', '对手状态已变化，请重新读取。'],
  ['队伍状态已变化，请重新确认。', '队伍已变化，请重试。'],
  ['目标宝可梦已变化，请重新确认。', '目标已变化，请重试。'],
  ['目标宝可梦已无法上场，请重新选择。', '目标无法上场，请重选。'],
  ['当前已是这只宝可梦在场。', '这只宝可梦已在场。'],
  ['换人目标已失效，请重新选择可上场宝可梦。', '换人目标已失效，请重选。'],
  ['战斗结算出现异常，已恢复操作。', '战斗已恢复，请继续。'],
  ['捕捉动画状态已恢复，请继续操作。', '捕捉已恢复，请继续。'],
  ['换人状态已恢复，请继续操作。', '换人已恢复，请继续。'],
  ['换人状态已恢复，已继续完成换人。', '换人已恢复。'],
  ['战斗状态已恢复，请继续操作。', '战斗已恢复，请继续。'],
  ['上一笔购买正在处理中。', '购买处理中，请稍候。']
]);

const normalizeNotificationMessage = (message) => {
  if (typeof message !== 'string') return '';
  let cleanMessage = message
    .replace('(需完善App逻辑以保存)', '')
    .replace(/\s+/g, ' ')
    .trim();
  cleanMessage = NOTIFICATION_EXACT_MESSAGE_REPLACEMENTS.get(cleanMessage) || cleanMessage;
  cleanMessage = cleanMessage
    .replace(/^云端进度尚未就绪，/, '云端未就绪，')
    .replace(/请重新同步后再试。/g, '请重新读取后重试。')
    .replace(/请重新同步后继续。/g, '请重新读取后继续。')
    .replace(/请稍后重试。/g, '稍后重试。')
    .replace(/请先重新读取。/g, '请重新读取。')
    .replace(/^提示:/, '提示：')
    .replace(/^(.+?) 已经没有了。$/, '$1 数量不足。')
    .replace(/^(.+?)已经完成挑战。$/, '$1已完成。')
    .replace(/^(.+?) 的体力和技能值已满。$/, '$1 状态已满。')
    .replace(/^(.+?)消耗 \d+ 金币，队伍已满状态恢复。$/, '$1已恢复全队。')
    .replace(/^泉水恢复需要 \d+ 金币，当前金币不足。$/, '金币不足，无法恢复。')
    .replace(/^领取奖励: (.+?) x(\d+)$/, '获得$1 x$2。')
    .replace(/^领取奖励: (.+?) 已入仓$/, '$1 已入仓。')
    .replace(/^领取奖励: (.+?) Lv\.(\d+)$/, '获得$1 Lv.$2。')
    .replace(/^旧版奖励 (.+?) 已停用$/, '旧版奖励已停用：$1。')
    .replace(/^(.+?) 已经满级。$/, '$1 已满级。')
    .replace(/^(.+?) 已经会 (.+?)。$/, '$1 已会 $2。');
  return NOTIFICATION_EXACT_MESSAGE_REPLACEMENTS.get(cleanMessage) || cleanMessage;
};

const normalizeNotificationType = (type) => (
  NOTIFICATION_TYPES.has(type) ? type : 'info'
);

const getNotificationDurationMs = (type, message = '') => {
  const safeType = normalizeNotificationType(type);
  const baseMs = NOTIFICATION_BASE_DURATION_MS[safeType] || NOTIFICATION_BASE_DURATION_MS.info;
  const maxMs = NOTIFICATION_MAX_DURATION_MS[safeType] || NOTIFICATION_MAX_DURATION_MS.info;
  const extraMs = Math.max(0, normalizeNotificationMessage(message).length - 18) * 36;
  return Math.min(maxMs, baseMs + extraMs);
};

const createNotificationItem = ({ message, type, sequence }) => {
  const cleanMessage = normalizeNotificationMessage(message);
  if (!cleanMessage) return null;
  const safeType = normalizeNotificationType(type);
  const dedupeKey = `${safeType}::${cleanMessage}`;
  return {
    id: `${dedupeKey}::${sequence}`,
    dedupeKey,
    message: cleanMessage,
    type: safeType,
    durationMs: getNotificationDurationMs(safeType, cleanMessage),
    createdAt: Date.now()
  };
};

const takeLatestNotificationItem = (queue) => {
  const pending = Array.isArray(queue) ? queue.filter(Boolean) : [];
  if (pending.length === 0) return { item: null, discarded: [] };

  let latestIndex = 0;
  for (let index = 1; index < pending.length; index += 1) {
    if (pending[index].createdAt >= pending[latestIndex].createdAt) {
      latestIndex = index;
    }
  }

  return {
    item: pending[latestIndex],
    discarded: pending.filter((_, index) => index !== latestIndex)
  };
};

export default function OriginalGame({ user, onLogout }) {
  const [assetsReady, setAssetsReady] = useState(() => (
    typeof window === 'undefined' || typeof Image === 'undefined'
  ));
  const [assetLoadSummary, setAssetLoadSummary] = useState(() => latestGameAssetPreloadSummary);

  useEffect(() => {
    let cancelled = false;
    preloadGameAssets()
      .then((summary) => {
        if (cancelled) return;
        setAssetLoadSummary(summary);
        setAssetsReady(true);
      })
      .catch((error) => {
        console.warn('[assets] 游戏素材预加载失败', error);
        if (!cancelled) {
          setAssetLoadSummary({ ok: false, error });
          setAssetsReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 用 ref 锁住最新 user，避免 user 对象引用变化导致 applyCloudGameData / loadGameFromCloud
  // 被重建、useEffect 重跑、cloudLoading 反复 true → 画面闪"正在读取云端进度"。
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [cloudLoading, setCloudLoading] = useState(true);
  const [cloudError, setCloudError] = useState(null);
  const [hasLoadedCloudSave, setHasLoadedCloudSave] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [syncError, setSyncError] = useState(null);
  const [requiresCloudReload, setRequiresCloudReload] = useState(false);
  const cloudBlocked = !isOnline || Boolean(syncError);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [launchDepartureTransition, setLaunchDepartureTransition] = useState(null);
  const launchTransitionActive = Boolean(launchDepartureTransition);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [isResettingProgress, setIsResettingProgress] = useState(false);
  const lastSavedSnapshotRef = useRef('');
  const cloudSaveSessionIdRef = useRef(createCloudSaveSessionId());
  const cloudSaveRevisionRef = useRef(0);
  const latestCloudSnapshotRef = useRef(null);
  const cloudSaveInFlightRef = useRef(false);
  const cloudLoadInFlightRef = useRef(null);
  const atomicCloudLoadUnavailableRef = useRef(false);
  const queuedCloudSaveRef = useRef(null);
  const pendingManualSaveNoticeRef = useRef(false);
  const criticalCloudSaveRequestedRef = useRef(false);
  const mapMovementSaveTimerRef = useRef(null);
  const pickupUiSyncIdleHandleRef = useRef(null);
  const pickupUiSyncFrameRef = useRef(0);
  const rewardClaimBeginInFlightRef = useRef(false);
  const rewardClaimConfirmInFlightRef = useRef(false);
  const growthEventDismissInFlightRef = useRef(null);
  const teacherRewardHandshakeRetryAtRef = useRef(0);
  const teacherRewardConfirmRetryAtRef = useRef(0);
  const legacyTeacherRewardRecoveryInFlightRef = useRef(false);
  const legacyTeacherRewardRecoveryRetryAtRef = useRef(0);
  const loadedCloudUserIdRef = useRef(null);
  const playerDefeatRecoveryInFlightRef = useRef(false);
  const activeBattleEnergyCostRef = useRef(0);
  const shopPurchaseInFlightRef = useRef(false);
  const battleEventConfirmInFlightRef = useRef(false);
  const battleEventStartInFlightRef = useRef(new Set());
  const completedBattleEventLockRef = useRef(new Set());
  const completedBattleEventVisualOverridesRef = useRef({});
  const battleNoMpResolutionKeyRef = useRef(null);
  const requiresCloudReloadRef = useRef(false);
  const cloudBlockedRef = useRef(cloudBlocked);
  useEffect(() => { requiresCloudReloadRef.current = requiresCloudReload; }, [requiresCloudReload]);
  useEffect(() => { cloudBlockedRef.current = cloudBlocked; }, [cloudBlocked]);

  // --- Cloud-only State Initialization ---
  const [view, setView] = useState('map');
  const [turn, setTurn] = useState('player');
  const [logs, setLogs] = useState(['在地图上探索吧！']);
  const logsRef = useRef(['在地图上探索吧！']);
  const [showLaunchScreen, setShowLaunchScreen] = useState(true);
  const [participatedMonIds, setParticipatedMonIds] = useState([]);

  // Game State
  const [playerTeam, setPlayerTeam] = useState([]);
  const [storageBox, setStorageBox] = useState([]);
  const [enemyTeam, setEnemyTeam] = useState([]);
  const [activePlayerId, setActivePlayerId] = useState(null);
  const [activeEnemyId, setActiveEnemyId] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [battleKind, setBattleKind] = useState('wild');
  const [playerGold, setPlayerGold] = useState(() => user?.gold ?? DEFAULT_STARTING_GOLD);
  const [playerEnergy, setPlayerEnergy] = useState(() => user?.energy ?? DEFAULT_STARTING_ENERGY);
  const [maxEnergy, setMaxEnergy] = useState(() => user?.max_energy ?? DEFAULT_MAX_ENERGY);
  const latestPlayerResourcesRef = useRef({
    gold: playerGold,
    energy: playerEnergy,
    maxEnergy,
  });
  const [playerInventory, setPlayerInventory] = useState(() => sanitizePlayerInventory(getDefaultInventory()));
  const [nextPlayerMonsterId, setNextPlayerMonsterId] = useState(100);
  const [nextEnemyMonsterId, setNextEnemyMonsterId] = useState(200);
  const [isThrowingPokeball, setIsThrowingPokeball] = useState(false);
  const [captureSequenceData, setCaptureSequenceData] = useState(null);
  const [activeBattleEnergyCost, setActiveBattleEnergyCost] = useState(0);
  const [battleEnergyRefundEligible, setBattleEnergyRefundEligible] = useState(false);
  const resolveTrackedActiveBattleEnergyCost = useCallback((snapshotCost = 0) => Math.max(
    normalizeBattleEnergyCost(snapshotCost),
    normalizeBattleEnergyCost(activeBattleEnergyCost),
    normalizeBattleEnergyCost(activeBattleEnergyCostRef.current)
  ), [activeBattleEnergyCost]);
  const [playerPos, setPlayerPos] = useState(() => getDefaultWorldPosition());
  const playerPosRef = useRef(getDefaultWorldPosition());
  const [mapGrid, setMapGrid] = useState(() => getInitialMapGrid(null));

  // Map Level State
  const [mapLevel, setMapLevel] = useState(1);
  const [maxReachedLevel, setMaxReachedLevel] = useState(1);
  const [useRealMaps, setUseRealMaps] = useState(true);
  const [currentMapName, setCurrentMapName] = useState(DEFAULT_WORLD_MAP_NAME);
  const currentMapNameRef = useRef(DEFAULT_WORLD_MAP_NAME);
  const [encounterCooldownSteps, setEncounterCooldownSteps] = useState(0);
  const [world, setWorld] = useState(() => normalizeWorldState(null, {
    currentMapName: DEFAULT_WORLD_MAP_NAME,
    playerPos: getDefaultWorldPosition()
  }));
  const [completedBattleEventVisualOverrides, setCompletedBattleEventVisualOverrides] = useState({});
  const worldRef = useRef(normalizeWorldState(null, {
    currentMapName: DEFAULT_WORLD_MAP_NAME,
    playerPos: getDefaultWorldPosition()
  }));
  const encounterCooldownStepsRef = useRef(0);

  const resetLocalBattleEventCompletionState = useCallback(() => {
    completedBattleEventLockRef.current = new Set();
    completedBattleEventVisualOverridesRef.current = {};
    setCompletedBattleEventVisualOverrides({});
  }, []);

  const markCompletedBattleEventLocally = useCallback(({
    world: sourceWorld = null,
    mapName,
    eventType,
    eventId,
    eventRole = null
  } = {}) => {
    setCompletedBattleEventVisualOverrides((current) => {
      const next = appendCompletedBattleEventVisualOverride(current, {
        world: sourceWorld,
        mapName,
        eventType,
        eventId,
        eventRole
      });
      completedBattleEventVisualOverridesRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!world) return;
    getMapEvents(currentMapName).forEach((event) => {
      if (!isConfiguredBattleEventType(event.type)) return;
      const visualState = getConfiguredBattleEventVisualState(currentMapName, world, event);
      if (!['cleared', 'completed', 'daily_complete'].includes(visualState?.status)) return;
      getBattleEventCompletedLockKeys({
        world,
        mapName: currentMapName,
        eventType: event.type,
        eventId: event.id,
        eventRole: resolveConfiguredBattleRole(event.type, getMapEventProperties(event))
      }).forEach((key) => completedBattleEventLockRef.current.add(key));
    });
  }, [currentMapName, world]);

  const [notifications, setNotifications] = useState([]);
  const [notificationQueueVersion, setNotificationQueueVersion] = useState(0);
  const notificationTimersRef = useRef(new Map());
  const notificationActiveRef = useRef(new Set());
  const notificationVisibleRef = useRef([]);
  const notificationQueueRef = useRef([]);
  const notificationSequenceRef = useRef(0);
  const notificationDisplayBlockedRef = useRef(false);
  const notificationLastShownAtRef = useRef(0);
  // 升级成长事件队列
  const [pendingGrowthEvents, setPendingGrowthEvents] = useState([]);
  const [growthModalDelayActive, setGrowthModalDelayActive] = useState(false);
  const [levelUpCelebration, setLevelUpCelebration] = useState(null);
  const [levelUpCelebrationQueue, setLevelUpCelebrationQueue] = useState([]);
  const levelUpCelebrationRef = useRef(null);
  const growthModalDelayTimerRef = useRef(null);
  const levelUpCelebrationTimersRef = useRef([]);
  const [battleModalScreenOpen, setBattleModalScreenOpen] = useState(false);
  const [pendingTeacherRewardClaim, setPendingTeacherRewardClaim] = useState(null);
  const [appliedTeacherRewardIds, setAppliedTeacherRewardIds] = useState([]);
  const [legacyTeacherRewardRecovery, setLegacyTeacherRewardRecovery] = useState(null);
  const [pendingMonsterAcquisition, setPendingMonsterAcquisition] = useState(null);
  const [pendingBattleEventConfirm, setPendingBattleEventConfirm] = useState(null);
  const [battleEventConfirmBusy, setBattleEventConfirmBusy] = useState(false);
  const [pendingSpringRestoreConfirm, setPendingSpringRestoreConfirm] = useState(null);
  const [springRestoreBusy, setSpringRestoreBusy] = useState(false);
  const [springRestoreAnimation, setSpringRestoreAnimation] = useState(null);
  const springRestoreAnimationTimerRef = useRef(0);
  const [pendingFastTravel, setPendingFastTravel] = useState(null);
  const [fastTravelBusy, setFastTravelBusy] = useState(false);
  const [fastTravelTransitTarget, setFastTravelTransitTarget] = useState(null);
  const [mapWarpBusy, setMapWarpBusy] = useState(false);
  const [mapWarpTransitTarget, setMapWarpTransitTarget] = useState(null);
  const mapWarpBusyRef = useRef(false);
  const [pendingBattleSwitch, setPendingBattleSwitch] = useState(null);
  // 战斗过场阶段: 'active' | 'intro' | 'victory' | 'defeat' | 'escape'
  const [battlePhase, setBattlePhase] = useState('active');
  const [battlePhaseData, setBattlePhaseData] = useState(null);
  const [battleEnvironment, setBattleEnvironment] = useState(null);
  const battleCompletionContextRef = useRef({
    battleEnvironment: null,
    battleEventCompletion: null
  });
  const [audioSettings, setAudioSettings] = useState(() => readStoredAudioSettings());
  const [moveVisualEvent, setMoveVisualEvent] = useState(null);
  const [switchVisualEvent, setSwitchVisualEvent] = useState(null);
  const battleTurnInFlightRef = useRef(false);
  const enemyTurnInFlightRef = useRef(false);
  const notificationSuppressedForBattle = view === 'battle' || Boolean(activeEnemyId);

  const resolveCommittedBattleContext = useCallback((snapshot = null) => {
    const persistedContext = battleCompletionContextRef.current || {};
    const resolvedBattleEnvironment = normalizeBattleEnvironment(
      snapshot?.battleEnvironment ||
      snapshot?.battlePhaseData?.battleEnvironment ||
      battleEnvironment ||
      battlePhaseData?.battleEnvironment ||
      persistedContext.battleEnvironment
    );
    const resolvedBattleEventCompletion = normalizeBattleEventCompletion(
      snapshot?.battleEventCompletion ||
      snapshot?.battlePhaseData?.battleEventCompletion ||
      resolvedBattleEnvironment?.battleEventCompletion ||
      battleEnvironment?.battleEventCompletion ||
      battlePhaseData?.battleEventCompletion ||
      persistedContext.battleEventCompletion,
      resolvedBattleEnvironment || battleEnvironment || battlePhaseData?.battleEnvironment || persistedContext.battleEnvironment
    );
    return {
      battleEnvironment: resolvedBattleEnvironment && resolvedBattleEventCompletion
        ? { ...resolvedBattleEnvironment, battleEventCompletion: resolvedBattleEventCompletion }
        : resolvedBattleEnvironment,
      battleEventCompletion: resolvedBattleEventCompletion
    };
  }, [battleEnvironment, battlePhaseData]);

  const hydrateCommittedBattleSnapshot = useCallback((snapshot = null) => {
    const baseSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const committedContext = resolveCommittedBattleContext(baseSnapshot);
    if (!committedContext.battleEnvironment && !committedContext.battleEventCompletion) {
      return {
        snapshot: baseSnapshot,
        battleEnvironment: null,
        battleEventCompletion: null
      };
    }
    const hydratedPhaseData = baseSnapshot.battlePhaseData && committedContext.battleEventCompletion
      ? {
        ...baseSnapshot.battlePhaseData,
        battleEnvironment: baseSnapshot.battlePhaseData.battleEnvironment || committedContext.battleEnvironment,
        battleEventCompletion: committedContext.battleEventCompletion
      }
      : baseSnapshot.battlePhaseData;
    return {
      snapshot: {
        ...baseSnapshot,
        battleEnvironment: committedContext.battleEnvironment,
        battleEventCompletion: committedContext.battleEventCompletion,
        battlePhaseData: hydratedPhaseData
      },
      ...committedContext
    };
  }, [resolveCommittedBattleContext]);

  useEffect(() => {
    const battleContextActive = view === 'battle' || Boolean(activeEnemyId);
    const committedContext = resolveCommittedBattleContext();
    if (battleContextActive && (committedContext.battleEnvironment || committedContext.battleEventCompletion)) {
      battleCompletionContextRef.current = committedContext;
      return;
    }
    if (!battleContextActive) {
      battleCompletionContextRef.current = {
        battleEnvironment: null,
        battleEventCompletion: null
      };
    }
  }, [activeEnemyId, resolveCommittedBattleContext, view]);

  useEffect(() => {
    if (!moveVisualEvent) return;
    if (view === 'battle' && battlePhase === 'active') return;
    setMoveVisualEvent(null);
  }, [battlePhase, moveVisualEvent, view]);
  const notificationDisplayBlocked = (
    notificationSuppressedForBattle ||
    launchTransitionActive ||
    showLaunchScreen ||
    resetConfirmOpen ||
    battleModalScreenOpen ||
    Boolean(pendingBattleEventConfirm) ||
    Boolean(pendingSpringRestoreConfirm) ||
    Boolean(pendingFastTravel) ||
    Boolean(fastTravelTransitTarget) ||
    fastTravelBusy ||
    Boolean(mapWarpTransitTarget) ||
    mapWarpBusy ||
    Boolean(pendingMonsterAcquisition) ||
    Boolean(pendingBattleSwitch) ||
    Boolean(levelUpCelebration) ||
    Boolean(captureSequenceData) ||
    isThrowingPokeball ||
    gameOver
  );
  const notificationDisplayMode = 'default';
  const isGrowthModalSuppressed = showLaunchScreen || launchTransitionActive || battleModalScreenOpen || Boolean(pendingBattleEventConfirm) || Boolean(pendingSpringRestoreConfirm) || Boolean(pendingFastTravel) || Boolean(fastTravelTransitTarget) || fastTravelBusy || Boolean(mapWarpTransitTarget) || mapWarpBusy || view !== 'map';
  const hasPendingLevelUpCelebrations = levelUpCelebrationQueue.length > 0;
  const isGrowthEventModalBlocked = (
    isGrowthModalSuppressed ||
    growthModalDelayActive ||
    Boolean(levelUpCelebration) ||
    hasPendingLevelUpCelebrations
  );

  useEffect(() => {
    latestPlayerResourcesRef.current = {
      gold: playerGold,
      energy: playerEnergy,
      maxEnergy,
    };
  }, [maxEnergy, playerEnergy, playerGold]);

  useEffect(() => () => {
    if (springRestoreAnimationTimerRef.current) {
      window.clearTimeout(springRestoreAnimationTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof user?.gold === 'number') {
      setPlayerGold(user.gold);
    }
  }, [user?.gold]);

  useEffect(() => {
    if (typeof user?.energy === 'number') {
      setPlayerEnergy(user.energy);
    }
    if (typeof user?.max_energy === 'number') {
      setMaxEnergy(user.max_energy);
    }
  }, [user?.energy, user?.max_energy]);

  useEffect(() => {
    gameAudio.applySettings(audioSettings);
    writeStoredAudioSettings(audioSettings);
  }, [audioSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const primeAudioOnGesture = () => {
      gameAudio.prime();
    };
    window.addEventListener('pointerdown', primeAudioOnGesture, { passive: true });
    window.addEventListener('keydown', primeAudioOnGesture);
    return () => {
      window.removeEventListener('pointerdown', primeAudioOnGesture);
      window.removeEventListener('keydown', primeAudioOnGesture);
    };
  }, []);

  const primeGameAudio = useCallback(() => {
    gameAudio.prime();
  }, []);

  const handleToggleAudio = useCallback(() => {
    primeGameAudio();
    setAudioSettings((current) => {
      const normalizedCurrent = normalizeAudioSettings(current);
      const next = normalizeAudioSettings({
        enabled: !normalizedCurrent.enabled,
        volume: normalizedCurrent.volume > 0 ? normalizedCurrent.volume : 0.72
      });
      gameAudio.applySettings(next);
      if (next.enabled) {
        gameAudio.playUiConfirm();
      }
      return next;
    });
  }, [primeGameAudio]);

  const handleAudioVolumeChange = useCallback((value) => {
    primeGameAudio();
    const normalizedValue = Math.max(0, Math.min(1, Number(value) / 100));
    const nextSettings = normalizeAudioSettings({
      enabled: normalizedValue > 0,
      volume: normalizedValue
    });
    setAudioSettings(nextSettings);
    gameAudio.applySettings(nextSettings);
    if (nextSettings.enabled && nextSettings.volume > 0) {
      gameAudio.playUiSelect();
    }
  }, [audioSettings.enabled, primeGameAudio]);

  const handleNavigateView = useCallback((nextView) => {
    if (typeof nextView !== 'string' || !nextView) return;
    primeGameAudio();
    if (nextView === 'map') {
      gameAudio.playUiBack();
    } else {
      gameAudio.playUiSelect();
    }
    setView(nextView);
  }, [primeGameAudio]);

  useEffect(() => {
    currentMapNameRef.current = currentMapName;
  }, [currentMapName]);

  useEffect(() => {
    if (showLaunchScreen || !currentMapName) return undefined;
    const timerId = window.setTimeout(() => {
      const adjacentMapNames = new Set(
        getMapEvents(currentMapName)
          .filter((event) => event.type === 'warp' && hasAdventureMap(event.target?.mapName))
          .map((event) => event.target.mapName)
      );
      adjacentMapNames.forEach((mapName) => {
        preloadThreeLowPolyMapModelsOnDemand(mapName).catch((error) => {
          console.warn(`[OriginalGame] Failed to preload map models for ${mapName}:`, error);
        });
      });
    }, 420);
    return () => window.clearTimeout(timerId);
  }, [currentMapName, showLaunchScreen]);

  useEffect(() => {
    worldRef.current = world;
  }, [world]);

  const bumpNotificationQueueVersion = useCallback(() => {
    setNotificationQueueVersion((version) => (version + 1) % 1000000);
  }, []);

  const clearNotificationRuntimeItem = useCallback((notification) => {
    if (!notification) return;
    const timer = notificationTimersRef.current.get(notification.dedupeKey);
    if (timer) clearTimeout(timer);
    notificationTimersRef.current.delete(notification.dedupeKey);
    notificationActiveRef.current.delete(notification.dedupeKey);
  }, []);

  const clearVisibleNotificationRuntime = useCallback(() => {
    notificationVisibleRef.current.forEach(clearNotificationRuntimeItem);
    notificationVisibleRef.current = [];
    setNotifications([]);
  }, [clearNotificationRuntimeItem]);

  const replaceQueuedNotificationRuntime = useCallback((item) => {
    notificationQueueRef.current.forEach((notification) => {
      notificationActiveRef.current.delete(notification.dedupeKey);
    });
    notificationQueueRef.current = item ? [item] : [];
    if (item) {
      notificationActiveRef.current.add(item.dedupeKey);
    }
  }, []);

  const resetNotificationRuntime = useCallback(({ bumpQueueVersion = true } = {}) => {
    notificationTimersRef.current.forEach((timer) => clearTimeout(timer));
    notificationTimersRef.current.clear();
    notificationActiveRef.current.clear();
    notificationVisibleRef.current = [];
    notificationQueueRef.current = [];
    notificationLastShownAtRef.current = 0;
    setNotifications([]);
    if (bumpQueueVersion) {
      bumpNotificationQueueVersion();
    }
  }, [bumpNotificationQueueVersion]);

  const addNotification = useCallback((message, type = 'info') => {
    const item = createNotificationItem({
      message,
      type,
      sequence: notificationSequenceRef.current += 1
    });
    if (!item) return;

    const visibleNotifications = notificationVisibleRef.current;
    if (!notificationDisplayBlockedRef.current) {
      visibleNotifications.forEach(clearNotificationRuntimeItem);
      replaceQueuedNotificationRuntime(null);
      notificationActiveRef.current.add(item.dedupeKey);
      notificationVisibleRef.current = [item];
      setNotifications([item]);
      return;
    }

    clearVisibleNotificationRuntime();
    replaceQueuedNotificationRuntime(item);
    bumpNotificationQueueVersion();
  }, [
    bumpNotificationQueueVersion,
    clearNotificationRuntimeItem,
    clearVisibleNotificationRuntime,
    replaceQueuedNotificationRuntime
  ]);

  useEffect(() => {
    notificationVisibleRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    notificationDisplayBlockedRef.current = notificationDisplayBlocked;
    if (notificationDisplayBlocked) {
      if (notificationVisibleRef.current.length > 0 || notifications.length > 0) {
        clearVisibleNotificationRuntime();
      }
      return;
    }
    bumpNotificationQueueVersion();
  }, [bumpNotificationQueueVersion, clearVisibleNotificationRuntime, notificationDisplayBlocked, notifications.length]);

  useEffect(() => {
    if (!notificationSuppressedForBattle) return;
    resetNotificationRuntime({ bumpQueueVersion: false });
  }, [notificationQueueVersion, notificationSuppressedForBattle, resetNotificationRuntime]);

  useEffect(() => {
    if (notificationDisplayBlocked || notifications.length === 0) return undefined;

    const currentNotification = notifications[0];
    const timer = setTimeout(() => {
      notificationTimersRef.current.delete(currentNotification.dedupeKey);
      notificationActiveRef.current.delete(currentNotification.dedupeKey);
      notificationVisibleRef.current = notificationVisibleRef.current.filter((notification) => (
        notification.dedupeKey !== currentNotification.dedupeKey
      ));
      notificationLastShownAtRef.current = Date.now();
      setNotifications((prev) => prev.filter((notification) => (
        notification.dedupeKey !== currentNotification.dedupeKey
      )));
    }, currentNotification.durationMs);

    notificationTimersRef.current.set(currentNotification.dedupeKey, timer);
    return () => {
      clearTimeout(timer);
      if (notificationTimersRef.current.get(currentNotification.dedupeKey) === timer) {
        notificationTimersRef.current.delete(currentNotification.dedupeKey);
      }
    };
  }, [notificationDisplayBlocked, notifications]);

  useEffect(() => {
    if (
      notificationDisplayBlocked ||
      notifications.length >= MAX_VISIBLE_NOTIFICATIONS ||
      notificationQueueRef.current.length === 0
    ) {
      return undefined;
    }

    const delayMs = 0;
    const timer = setTimeout(() => {
      if (
        notificationDisplayBlockedRef.current ||
        notificationVisibleRef.current.length >= MAX_VISIBLE_NOTIFICATIONS ||
        notificationQueueRef.current.length === 0
      ) {
        return;
      }

      const { item, discarded } = takeLatestNotificationItem(notificationQueueRef.current);
      discarded.forEach((notification) => {
        notificationActiveRef.current.delete(notification.dedupeKey);
      });
      notificationQueueRef.current = [];
      bumpNotificationQueueVersion();
      if (!item) return;
      notificationActiveRef.current.add(item.dedupeKey);
      notificationVisibleRef.current = [item];
      setNotifications([item]);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [bumpNotificationQueueVersion, notificationDisplayBlocked, notificationQueueVersion, notifications.length]);

  useEffect(() => {
    if (!hasLoadedCloudSave || typeof window === 'undefined') return undefined;

    const refreshDailyMapState = () => {
      const latestWorld = worldRef.current;
      const refreshedWorld = normalizeWorldState(latestWorld, {
        currentMapName: currentMapNameRef.current,
        playerPos: playerPosRef.current
      });

      if (refreshedWorld.dailyRefreshKey === latestWorld?.dailyRefreshKey) return;

      worldRef.current = refreshedWorld;
      setWorld(refreshedWorld);
      setMapGrid((prev) => buildMapGridForWorld(currentMapNameRef.current, refreshedWorld, prev));
      addNotification('今日内容已刷新。', 'info');
    };

    refreshDailyMapState();
    const intervalId = window.setInterval(refreshDailyMapState, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [addNotification, hasLoadedCloudSave]);

  useEffect(() => {
    if (!hasLoadedCloudSave) return;
    const normalizedPlayerTeam = playerTeam.map(normalizeMonsterAssetSource);
    const normalizedStorageBox = storageBox.map(normalizeMonsterAssetSource);
    const progressRoster = normalizeRosterExpProgress({
      playerTeam: normalizedPlayerTeam,
      storageBox: normalizedStorageBox,
      activePlayerId,
      pendingGrowthEvents,
    });
    if (JSON.stringify(progressRoster.playerTeam) !== JSON.stringify(playerTeam)) {
      setPlayerTeam(progressRoster.playerTeam);
    }
    if (JSON.stringify(progressRoster.storageBox) !== JSON.stringify(storageBox)) {
      setStorageBox(progressRoster.storageBox);
    }
    const resolvedProgressActiveId = (view === 'battle' || activeEnemyId)
      ? progressRoster.activePlayerId
      : resolveDefaultActivePlayerId(progressRoster.playerTeam, progressRoster.activePlayerId);
    if (resolvedProgressActiveId !== activePlayerId) {
      setActivePlayerId(resolvedProgressActiveId);
    }
    if (JSON.stringify(progressRoster.pendingGrowthEvents) !== JSON.stringify(pendingGrowthEvents)) {
      setPendingGrowthEvents(progressRoster.pendingGrowthEvents);
    }
    setEnemyTeam((prev) => prev.map(normalizeMonsterAssetSource));
    setPlayerInventory((prev) => {
      const next = sanitizePlayerInventory(prev);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
  }, [activeEnemyId, activePlayerId, hasLoadedCloudSave, pendingGrowthEvents, playerTeam, storageBox, view]);

  useEffect(() => {
    setPlayerInventory((prev) => {
      const next = sanitizePlayerInventory(prev);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
  }, []);

  // --- Core Game Logic Callbacks ---
  const addLog = useCallback((msg) => {
    const currentLogs = Array.isArray(logsRef.current) ? logsRef.current : [];
    const nextLogs = [...currentLogs, msg];
    logsRef.current = nextLogs;
    setLogs(nextLogs);
    setTimeout(() => {
      const el = document.getElementById('battle-log');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }, []);

  const waitForBattleMoveVisual = useCallback(async (moveKey, attackerSide, phase = 'hit', {
    targetSide = null,
    onImpact = null,
    durationMs = getBattleMovePhaseDuration(phase),
    effectMove = null,
    effectMoveKey = moveKey,
    suppressActorMotion = false,
    forceTargetReaction = false,
    reactionClass = null,
  } = {}) => {
    const resolvedMove = effectMove || MOVES[moveKey];
    const resolvedMoveKey = effectMoveKey || moveKey;
    if (!resolvedMove) return;
    const impactDelayMs = getBattleMoveImpactDelay(phase, durationMs);
    const visualId = `${resolvedMoveKey}-${attackerSide}-${phase}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setMoveVisualEvent({
      id: visualId,
      moveKey: resolvedMoveKey,
      move: resolvedMove,
      attackerSide,
      targetSide,
      phase,
      durationMs,
      suppressActorMotion,
      forceTargetReaction,
      reactionClass,
    });
    try {
      if (typeof onImpact === 'function') {
        await wait(impactDelayMs);
        onImpact();
        await wait(Math.max(0, durationMs - impactDelayMs));
        return;
      }
      await wait(durationMs);
    } finally {
      setMoveVisualEvent((prev) => prev?.id === visualId ? null : prev);
    }
  }, []);

  const playBattleVisualMessage = useCallback(async ({
    moveKey,
    move,
    attackerSide,
    phase = 'status',
    targetSide = null,
    onImpact = null,
    message = '',
    durationMs = getBattleMovePhaseDuration(phase),
    suppressActorMotion = false,
    forceTargetReaction = false,
    reactionClass = null,
    minMs = 860,
    maxMs = 2300,
    extraMs = 130,
  }) => {
    const impactDelayMs = getBattleMoveImpactDelay(phase, durationMs);
    let loggedAtImpact = false;

    await waitForBattleMoveVisual(moveKey, attackerSide, phase, {
      targetSide,
      durationMs,
      onImpact: () => {
        onImpact?.();
        if (message) {
          addLog(message);
          loggedAtImpact = true;
        }
      },
      effectMove: move,
      effectMoveKey: moveKey,
      suppressActorMotion,
      forceTargetReaction,
      reactionClass,
    });

    if (!message) return;
    if (!loggedAtImpact) {
      await addBattleLogAndWait(addLog, message, { minMs, maxMs, extraMs });
      return;
    }

    const visualReadOverlapMs = Math.max(0, durationMs - impactDelayMs);
    const readDelayMs = getBattleLogReadDelay(message, { minMs, maxMs, extraMs });
    await wait(Math.max(220, readDelayMs - visualReadOverlapMs));
  }, [addLog, waitForBattleMoveVisual]);

  const playBattleStatusEvents = useCallback(async ({ side, monId, events = [] }) => {
    let latestMon = null;

    for (const event of events) {
      latestMon = withBattleRuntimeDefaults(event.mon);
      if (!latestMon) continue;
      const eventStatus = event.status || (
        event.phase === 'heal'
          ? 'heal'
          : event.phase === 'secondary'
            ? 'buff'
            : 'status'
      );
      const syncMonState = () => {
        updateBattleMonBySide({
          side,
          monId,
          setPlayerTeam,
          setEnemyTeam,
          updater: () => latestMon
        });
      };

      if (event.visual === false) {
        syncMonState();
        gameAudio.playBattleStatus(eventStatus, eventStatus === 'freeze' && event.message?.includes('解冻')
          ? 'recover'
          : event.message?.includes('恢复') || event.message?.includes('醒') || event.message?.includes('清醒')
            ? 'recover'
            : event.message?.includes('伤害') || event.message?.includes('中毒') || event.message?.includes('灼伤')
              ? 'tick'
              : 'apply');
        if (event.message) {
          await addBattleLogAndWait(addLog, event.message, {
            minMs: event.minMs,
            maxMs: event.maxMs,
            extraMs: event.extraMs,
          });
        }
        continue;
      }

      await playBattleVisualMessage({
        moveKey: event.moveKey || `__status_${event.status || 'effect'}`,
        move: event.move || null,
        attackerSide: side,
        phase: event.phase || 'status',
        targetSide: side,
        onImpact: () => {
          syncMonState();
          gameAudio.playBattleStatus(eventStatus, eventStatus === 'freeze' && event.message?.includes('解冻')
            ? 'recover'
            : event.message?.includes('恢复') || event.message?.includes('醒') || event.message?.includes('清醒')
              ? 'recover'
              : event.message?.includes('伤害') || event.message?.includes('中毒') || event.message?.includes('灼伤')
                ? 'tick'
                : 'apply');
        },
        message: event.message,
        durationMs: event.durationMs,
        suppressActorMotion: event.suppressActorMotion ?? true,
        forceTargetReaction: event.forceTargetReaction ?? false,
        reactionClass: event.reactionClass || null,
        minMs: event.minMs,
        maxMs: event.maxMs,
        extraMs: event.extraMs,
      });
    }

    return latestMon;
  }, [addLog, playBattleVisualMessage]);

	  const getBaseMonsterDefinition = useCallback((monsterId) => {
	      const safeId = Number(monsterId);
	      const definition = MONSTERS.find(m => Number(m.id) === safeId);
	      // 只对"看似合法但定义表里没有"的 id 报警告；0 / null / undefined / 非数字大概率是旧存档数据，没必要刷屏
	      if (!definition && Number.isFinite(Number(monsterId)) && Number(monsterId) > 0) {
	        console.warn("[Pokemon] 找不到 ID 对应的种族定义:", monsterId);
	      }
	      return definition;
	  }, []);

  // --- Other Callbacks & Handlers ---

  const clearNotifications = useCallback(() => {
    resetNotificationRuntime();
  }, [resetNotificationRuntime]);

  const clearDeferredPickupUiSync = useCallback(() => {
    if (pickupUiSyncFrameRef.current && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(pickupUiSyncFrameRef.current);
    }
    pickupUiSyncFrameRef.current = 0;

    const idleHandle = pickupUiSyncIdleHandleRef.current;
    if (idleHandle !== null && idleHandle !== undefined) {
      if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle);
      } else {
        clearTimeout(idleHandle);
      }
    }
    pickupUiSyncIdleHandleRef.current = null;
  }, []);

  const scheduleDeferredPickupUiSync = useCallback((applyChanges) => {
    if (typeof applyChanges !== 'function') return;
    clearDeferredPickupUiSync();

    const flush = () => {
      pickupUiSyncIdleHandleRef.current = null;
      startTransition(() => {
        applyChanges();
      });
    };

    const queueIdle = () => {
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        pickupUiSyncIdleHandleRef.current = window.requestIdleCallback(() => {
          flush();
        }, { timeout: 120 });
        return;
      }
      pickupUiSyncIdleHandleRef.current = (typeof window !== 'undefined' ? window.setTimeout : setTimeout)(() => {
        flush();
      }, 32);
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      pickupUiSyncFrameRef.current = window.requestAnimationFrame(() => {
        pickupUiSyncFrameRef.current = 0;
        queueIdle();
      });
      return;
    }

    queueIdle();
  }, [clearDeferredPickupUiSync]);

  useEffect(() => () => {
    notificationTimersRef.current.forEach((timer) => clearTimeout(timer));
    notificationTimersRef.current.clear();
    notificationActiveRef.current.clear();
    notificationVisibleRef.current = [];
    notificationQueueRef.current = [];
    if (growthModalDelayTimerRef.current) clearTimeout(growthModalDelayTimerRef.current);
    if (mapMovementSaveTimerRef.current) clearTimeout(mapMovementSaveTimerRef.current);
    clearDeferredPickupUiSync();
    levelUpCelebrationTimersRef.current.forEach((timer) => clearTimeout(timer));
    levelUpCelebrationTimersRef.current = [];
  }, [clearDeferredPickupUiSync]);

  const holdGrowthModalsForItemAnimation = useCallback(() => {
    if (growthModalDelayTimerRef.current) clearTimeout(growthModalDelayTimerRef.current);
    setGrowthModalDelayActive(true);
    let released = false;

    return (delayMs = 0) => {
      if (released) return;
      released = true;
      if (growthModalDelayTimerRef.current) clearTimeout(growthModalDelayTimerRef.current);
      growthModalDelayTimerRef.current = setTimeout(() => {
        setGrowthModalDelayActive(false);
        growthModalDelayTimerRef.current = null;
      }, Math.max(0, delayMs));
    };
  }, []);

  const enqueueLevelUpCelebrations = useCallback((celebrations = [], delayMs = 0) => {
    const normalizedCelebrations = Array.isArray(celebrations) ? celebrations.filter(Boolean) : [];
    if (normalizedCelebrations.length === 0) return;

    const enqueue = () => {
      setLevelUpCelebrationQueue((prev) => (
        appendLevelUpCelebrationsToQueue(prev, normalizedCelebrations, levelUpCelebrationRef.current)
      ));
    };

    const safeDelayMs = Math.max(0, delayMs);
    if (safeDelayMs <= 0) {
      enqueue();
      return;
    }

    const timer = setTimeout(() => {
      enqueue();
      levelUpCelebrationTimersRef.current = levelUpCelebrationTimersRef.current.filter((entry) => entry !== timer);
    }, safeDelayMs);
    levelUpCelebrationTimersRef.current.push(timer);
  }, []);

  const scheduleLevelUpCelebration = useCallback((levelUps = [], monster = null, delayMs = 0) => {
    const celebration = buildLevelUpCelebrationPayload(levelUps, {
      monster,
      placeholderSprite: POKEMON_LOCAL_PLACEHOLDER,
      fallbackStats: monster ? getLevelUpStatSnapshot(monster) : null,
    });
    if (!celebration) return;
    enqueueLevelUpCelebrations([celebration], delayMs);
  }, [enqueueLevelUpCelebrations]);

  const scheduleLevelUpCelebrationsForTeam = useCallback((levelUps = [], teamSnapshot = [], delayMs = 0) => {
    const celebrations = buildLevelUpCelebrationsForRoster(levelUps, teamSnapshot, {
      placeholderSprite: POKEMON_LOCAL_PLACEHOLDER,
      buildFallbackStats: (monster) => (monster ? getLevelUpStatSnapshot(monster) : null),
    });
    enqueueLevelUpCelebrations(celebrations, delayMs);
  }, [enqueueLevelUpCelebrations]);

  useEffect(() => {
    if (isGrowthModalSuppressed || growthModalDelayActive || levelUpCelebration || levelUpCelebrationQueue.length === 0) return;
    const nextCelebration = levelUpCelebrationQueue[0];
    if (!nextCelebration) return;
    levelUpCelebrationRef.current = nextCelebration;
    setLevelUpCelebration(nextCelebration);
    setLevelUpCelebrationQueue((prev) => (prev[0]?.id === nextCelebration?.id ? prev.slice(1) : prev));
  }, [growthModalDelayActive, isGrowthModalSuppressed, levelUpCelebration, levelUpCelebrationQueue]);

  const dismissLevelUpCelebration = useCallback(() => {
    levelUpCelebrationRef.current = null;
    setLevelUpCelebration(null);
  }, []);

  useEffect(() => {
    levelUpCelebrationRef.current = levelUpCelebration;
  }, [levelUpCelebration]);

  useEffect(() => {
    if (!hasLoadedCloudSave) return;
    const progressRoster = normalizeRosterExpProgress({
      playerTeam: playerTeam.map(normalizeMonsterAssetSource),
      storageBox: storageBox.map(normalizeMonsterAssetSource),
      activePlayerId,
      pendingGrowthEvents,
    });
    if (progressRoster.levelUps.length === 0) return;
    scheduleLevelUpCelebrationsForTeam(progressRoster.levelUps, progressRoster.playerTeam);
  }, [activePlayerId, hasLoadedCloudSave, pendingGrowthEvents, playerTeam, scheduleLevelUpCelebrationsForTeam, storageBox]);

  // --- Cloud-only Save/Load Effects ---
  const applyCloudGameData = useCallback((gameData, resources = {}) => {
    const roster = sanitizeRoster(
      normalizeMonsterAssetList(gameData.playerTeam),
      normalizeMonsterAssetList(gameData.storageBox),
      gameData.activePlayerId
    );
    const progressRoster = normalizeRosterExpProgress({
      playerTeam: roster.playerTeam,
      storageBox: roster.storageBox,
      activePlayerId: roster.activePlayerId,
      pendingGrowthEvents: normalizePendingGrowthEvents(gameData.pendingGrowthEvents),
    });
    const playerTeam = progressRoster.playerTeam;
    const storageBox = progressRoster.storageBox;
    const enemyTeam = normalizeMonsterAssetList(gameData.enemyTeam);
    const pendingGrowthEvents = progressRoster.pendingGrowthEvents;
    const transientGrowthLevelUps = Array.isArray(gameData.transientGrowthLevelUps)
      ? gameData.transientGrowthLevelUps
      : progressRoster.levelUps;
    const pendingTeacherRewardClaim = normalizePendingTeacherRewardClaim(gameData.pendingTeacherRewardClaim);
    const appliedTeacherRewardIds = normalizeAppliedTeacherRewardIds(gameData.appliedTeacherRewardIds);
    const legacyTeacherRewardRecovery = normalizeLegacyTeacherRewardRecovery(gameData.legacyTeacherRewardRecovery);
    const pendingMonsterAcquisition = normalizePendingMonsterAcquisition(gameData.pendingMonsterAcquisition);
    const pendingBattleSwitch = normalizePendingBattleSwitch(gameData.pendingBattleSwitch);
    const battlePhase = normalizeBattlePhase(gameData.battlePhase);
    const battlePhaseData = normalizeBattlePhaseData(battlePhase, gameData.battlePhaseData);
    const captureSequenceData = normalizeCaptureSequenceData(gameData.captureSequenceData);
    const view = gameData.view || 'map';
    const isBattleFlow = view === 'battle' || Boolean(gameData.activeEnemyId);
    const rawBattleEnvironment = isBattleFlow
      ? normalizeBattleEnvironment(gameData.battleEnvironment || battlePhaseData?.battleEnvironment)
      : null;
    const battleEventCompletion = isBattleFlow
      ? normalizeBattleEventCompletion(
        gameData.battleEventCompletion ||
        rawBattleEnvironment?.battleEventCompletion ||
        battlePhaseData?.battleEventCompletion,
        rawBattleEnvironment
      )
      : null;
    const battleEnvironment = rawBattleEnvironment && battleEventCompletion
      ? { ...rawBattleEnvironment, battleEventCompletion }
      : rawBattleEnvironment;
    const resolvedBattlePhaseData = battlePhaseData && battleEventCompletion
      ? {
        ...battlePhaseData,
        battleEnvironment: battlePhaseData.battleEnvironment || battleEnvironment,
        battleEventCompletion
      }
      : battlePhaseData;
    const resolvedActivePlayerId = isBattleFlow
      ? progressRoster.activePlayerId
      : resolveDefaultActivePlayerId(playerTeam, progressRoster.activePlayerId);
    const isThrowingPokeball = Boolean(gameData.isThrowingPokeball) && !!captureSequenceData;
    const battleTurn = normalizeBattleTurn(gameData.turn, {
      view,
      battlePhase,
      isThrowingPokeball,
      captureSequenceData
    });
    const u = userRef.current;
    const backendGold = typeof resources.gold === 'number' ? resources.gold : u?.gold;
    const backendEnergy = typeof resources.energy === 'number' ? resources.energy : u?.energy;
    const backendMaxEnergy = typeof resources.max_energy === 'number' ? resources.max_energy : u?.max_energy;

    const cloudLogs = Array.isArray(gameData.logs) ? gameData.logs : ['在地图上探索吧！'];
    setView(view);
    setTurn(battleTurn);
    logsRef.current = cloudLogs;
    setLogs(cloudLogs);
    setShowLaunchScreen(Boolean(gameData.showLaunchScreen));
    setParticipatedMonIds(Array.isArray(gameData.participatedMonIds) ? gameData.participatedMonIds : []);
    setPendingGrowthEvents(pendingGrowthEvents);
    setPendingTeacherRewardClaim(pendingTeacherRewardClaim);
    setAppliedTeacherRewardIds(appliedTeacherRewardIds);
    setLegacyTeacherRewardRecovery(legacyTeacherRewardRecovery);
    setPendingMonsterAcquisition(pendingMonsterAcquisition);
    setPendingBattleSwitch(pendingBattleSwitch);
    setPlayerTeam(playerTeam);
    setStorageBox(storageBox);
    setEnemyTeam(enemyTeam);
    setActivePlayerId(resolvedActivePlayerId);
    setActiveEnemyId(gameData.activeEnemyId || null);
    setGameOver(Boolean(gameData.gameOver));
    setBattleKind(gameData.battleKind || 'wild');
    setBattlePhase(battlePhase);
    setBattlePhaseData(resolvedBattlePhaseData);
    setBattleEnvironment(battleEnvironment);
    setIsThrowingPokeball(isThrowingPokeball);
    setCaptureSequenceData(captureSequenceData);
    const resolvedBattleEnergyCost = normalizeBattleEnergyCost(gameData.activeBattleEnergyCost);
    activeBattleEnergyCostRef.current = resolvedBattleEnergyCost;
    setActiveBattleEnergyCost(resolvedBattleEnergyCost);
    setBattleEnergyRefundEligible(isBattleFlow && Boolean(gameData.battleEnergyRefundEligible));
    setPlayerGold(typeof backendGold === 'number' ? backendGold : (typeof gameData.playerGold === 'number' ? gameData.playerGold : DEFAULT_STARTING_GOLD));
    setPlayerEnergy(typeof backendEnergy === 'number' ? backendEnergy : DEFAULT_STARTING_ENERGY);
    setMaxEnergy(typeof backendMaxEnergy === 'number' ? backendMaxEnergy : DEFAULT_MAX_ENERGY);
    setPlayerInventory(sanitizePlayerInventory(gameData.playerInventory));
    setNextPlayerMonsterId(gameData.nextPlayerMonsterId || 100);
    setNextEnemyMonsterId(gameData.nextEnemyMonsterId || 200);
    const worldFallback = {
      currentMapName: gameData.currentMapName || DEFAULT_WORLD_MAP_NAME,
      playerPos: gameData.playerPos || gameData.world?.playerPos || getDefaultWorldPosition()
    };
    const baseNormalizedWorld = normalizeWorldState(gameData.world, worldFallback);
    const shouldPreserveLocalBattleProgress = Boolean(
      loadedCloudUserIdRef.current &&
      loadedCloudUserIdRef.current === (userRef.current?.id || null) &&
      !isFreshStartSnapshot(gameData) &&
      (
        completedBattleEventLockRef.current.size > 0 ||
        Object.keys(completedBattleEventVisualOverridesRef.current).length > 0
      )
    );
    const normalizedWorld = shouldPreserveLocalBattleProgress
      ? mergeLocalBattleProgressIntoWorld(baseNormalizedWorld, worldRef.current, worldFallback)
      : baseNormalizedWorld;
    const primedCompletedBattleEventState = buildCompletedBattleEventLocalPrimeState({
      snapshot: {
        ...gameData,
        world: normalizedWorld,
        currentMapName: normalizedWorld.currentMapName,
        playerPos: normalizedWorld.playerPos
      },
      world: normalizedWorld,
      fallbackMapName: normalizedWorld.currentMapName,
      currentOverrides: shouldPreserveLocalBattleProgress
        ? completedBattleEventVisualOverridesRef.current
        : {}
    });
    playerPosRef.current = normalizedWorld.playerPos;
    currentMapNameRef.current = normalizedWorld.currentMapName;
    worldRef.current = normalizedWorld;
    setPlayerPos(normalizedWorld.playerPos);
    const nextMapGrid = getInitialMapGrid({
      ...gameData,
      currentMapName: normalizedWorld.currentMapName,
      world: normalizedWorld,
      playerPos: normalizedWorld.playerPos
    });
    setMapGrid((prev) => (areMapGridsEqual(prev, nextMapGrid) ? prev : nextMapGrid));
    setMapLevel(gameData.mapLevel || 1);
    setMaxReachedLevel(gameData.maxReachedLevel || 1);
    setUseRealMaps(true);
    setCurrentMapName(normalizedWorld.currentMapName);
    setWorld(normalizedWorld);
    completedBattleEventLockRef.current = shouldPreserveLocalBattleProgress
      ? new Set([
        ...completedBattleEventLockRef.current,
        ...primedCompletedBattleEventState.lockKeys
      ])
      : new Set(primedCompletedBattleEventState.lockKeys);
    completedBattleEventVisualOverridesRef.current = primedCompletedBattleEventState.overrides;
    setCompletedBattleEventVisualOverrides(primedCompletedBattleEventState.overrides);
    const resolvedEncounterCooldown = Math.max(0, Math.trunc(Number(gameData.encounterCooldownSteps ?? 0)));
    encounterCooldownStepsRef.current = resolvedEncounterCooldown;
    setEncounterCooldownSteps(resolvedEncounterCooldown);
    scheduleLevelUpCelebrationsForTeam(transientGrowthLevelUps, playerTeam);
    // user 通过 userRef.current 读取，无需列入 deps，避免 callback 反复重建触发回闪
  }, [scheduleLevelUpCelebrationsForTeam]);

  const currentGameData = useMemo(() => createCloudSnapshot({
    showLaunchScreen,
    view: view === 'battle' && !activeEnemyId ? 'map' : view,
    turn,
    logs,
    participatedMonIds,
    pendingGrowthEvents,
    pendingTeacherRewardClaim,
    appliedTeacherRewardIds,
    legacyTeacherRewardRecovery,
    pendingMonsterAcquisition,
    pendingBattleSwitch,
    playerTeam,
    storageBox,
    enemyTeam,
    activePlayerId,
    activeEnemyId,
    gameOver,
    battleKind,
    battlePhase,
    battlePhaseData,
    battleEnvironment,
    isThrowingPokeball,
    captureSequenceData,
    activeBattleEnergyCost: (view === 'battle' || activeEnemyId)
      ? resolveTrackedActiveBattleEnergyCost(activeBattleEnergyCost)
      : 0,
    battleEnergyRefundEligible: (view === 'battle' || activeEnemyId) && battleEnergyRefundEligible,
    playerGold,
    playerInventory,
    nextPlayerMonsterId,
    nextEnemyMonsterId,
    playerPos,
    mapGrid,
    mapLevel,
    maxReachedLevel,
    useRealMaps,
    currentMapName,
    encounterCooldownSteps,
    world
  }), [
    showLaunchScreen,
    view,
    turn,
    logs,
    participatedMonIds,
    pendingGrowthEvents,
    pendingTeacherRewardClaim,
    appliedTeacherRewardIds,
    legacyTeacherRewardRecovery,
    pendingMonsterAcquisition,
    pendingBattleSwitch,
    playerTeam,
    storageBox,
    enemyTeam,
    activePlayerId,
    activeEnemyId,
    gameOver,
    battleKind,
    battlePhase,
    battlePhaseData,
    battleEnvironment,
    isThrowingPokeball,
    captureSequenceData,
    activeBattleEnergyCost,
    resolveTrackedActiveBattleEnergyCost,
    battleEnergyRefundEligible,
    playerGold,
    playerInventory,
    nextPlayerMonsterId,
    nextEnemyMonsterId,
    playerPos,
    mapGrid,
    mapLevel,
    maxReachedLevel,
    useRealMaps,
    currentMapName,
    encounterCooldownSteps,
    world
  ]);

  useEffect(() => {
    const committedSnapshot = readCloudSnapshotFromString(lastSavedSnapshotRef.current);
    latestCloudSnapshotRef.current = mergeMonotonicSnapshotProgress(
      committedSnapshot || latestCloudSnapshotRef.current,
      currentGameData
    );
  }, [currentGameData]);

  useEffect(() => {
    const normalizedCost = normalizeBattleEnergyCost(activeBattleEnergyCost);
    const isBattleFlow = view === 'battle' || Boolean(activeEnemyId);
    if (normalizedCost > 0 || !isBattleFlow) {
      activeBattleEnergyCostRef.current = normalizedCost;
    }
  }, [activeBattleEnergyCost, activeEnemyId, view]);

  useEffect(() => {
    if (view !== 'battle' && battleEnvironment) {
      setBattleEnvironment(null);
    }
  }, [battleEnvironment, view]);

  // 通过 ref 持有最新 applyCloudGameData，避免它的引用变化把 loadGameFromCloud 一起带得重建。
  const applyCloudGameDataRef = useRef(applyCloudGameData);
  useEffect(() => { applyCloudGameDataRef.current = applyCloudGameData; }, [applyCloudGameData]);

  // 首次加载成功后即便有奇怪原因再触发，也不再显示全屏"正在读取云端进度"覆盖，避免回闪。
  const hasCompletedInitialLoadRef = useRef(false);

  const loadGameFromCloud = useCallback(async ({ force = false } = {}) => {
    if (cloudLoadInFlightRef.current) return cloudLoadInFlightRef.current;

    const loadPromise = (async () => {
      const u = userRef.current;
      const targetUserId = u?.id || null;
      const isSameLoadedUser = Boolean(targetUserId && loadedCloudUserIdRef.current === targetUserId);

      if (!force && isSameLoadedUser && hasCompletedInitialLoadRef.current && !requiresCloudReloadRef.current) {
        return true;
      }

      const showOverlay = !hasCompletedInitialLoadRef.current || !isSameLoadedUser || force;
      if (showOverlay) {
        setCloudLoading(true);
        setHasLoadedCloudSave(false);
        setSaveStatus('idle');
      }
      setCloudError(null);
      if (!requiresCloudReloadRef.current) {
        setSyncError(null);
      }

      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      setIsOnline(online);

      if (!online) {
        setCloudError('当前没有网络连接。游戏必须连接后端并从云端读取进度。');
        if (showOverlay) setCloudLoading(false);
        return false;
      }

      if (!targetUserId) {
        setCloudError('未检测到登录用户,无法读取云端进度。');
        if (showOverlay) setCloudLoading(false);
        return false;
      }

      try {
        let saveRow = null;
        let resources = {};

        if (!atomicCloudLoadUnavailableRef.current) {
          const atomicLoadResult = await runCloudRequestWithRetry(() => supabase.rpc('load_cloud_game_state_with_resources', {
            p_user_id: targetUserId
          }));

          if (atomicLoadResult.error) {
            if (isMissingCloudRpcError(atomicLoadResult.error, 'load_cloud_game_state_with_resources')) {
              atomicCloudLoadUnavailableRef.current = true;
            } else {
              throw atomicLoadResult.error;
            }
          } else {
            const atomicRow = Array.isArray(atomicLoadResult.data) ? atomicLoadResult.data[0] : atomicLoadResult.data;
            if (atomicRow) {
              atomicCloudLoadUnavailableRef.current = false;
              saveRow = {
                game_data: atomicRow.game_data,
                last_saved: atomicRow.last_saved,
                save_revision: atomicRow.save_revision,
              };
              resources = {
                gold: atomicRow.gold,
                energy: atomicRow.energy,
                max_energy: atomicRow.max_energy,
              };
            }
          }
        }

        if (!saveRow) {
          const [saveResult, resourceResult] = await Promise.all([
            runCloudRequestWithRetry(() => supabase.rpc('load_cloud_game_save', {
              p_user_id: targetUserId
            })),
            runCloudRequestWithRetry(() => supabase.rpc('get_user_resources', {
              p_user_id: targetUserId
            }))
          ]);

          if (saveResult.error) throw saveResult.error;
          if (resourceResult.error) throw resourceResult.error;

          saveRow = Array.isArray(saveResult.data) ? saveResult.data[0] : saveResult.data;
          resources = Array.isArray(resourceResult.data) ? (resourceResult.data[0] || {}) : (resourceResult.data || {});
        }

        const backendGold = typeof resources.gold === 'number'
          ? resources.gold
          : (typeof u?.gold === 'number' ? u.gold : DEFAULT_STARTING_GOLD);
        const cloudGameData = saveRow?.game_data ?? createDefaultCloudGameData(backendGold);
        const normalized = normalizeCloudGameData(cloudGameData, backendGold);
        if (!normalized) throw new Error('云端存档格式无效。');
        const mapContentMigrated = shouldPersistMapContentMigration(cloudGameData);

        resetLocalBattleEventCompletionState();
        applyCloudGameDataRef.current(normalized, resources);
        cloudSaveRevisionRef.current = Number(saveRow?.save_revision) || getCloudSaveRevision(saveRow?.game_data);
        const normalizedSnapshot = JSON.stringify(createCloudSnapshot(normalized));
        const rawCloudSnapshot = saveRow?.game_data ? JSON.stringify(saveRow.game_data) : '';
        const hadExpOverflow = findExpOverflowMonsters([
          ...normalizeMonsterAssetList(cloudGameData.playerTeam),
          ...normalizeMonsterAssetList(cloudGameData.storageBox),
        ]).length > 0;
        const repairedBattleTurn = shouldRepairBattleTurnOnLoad(cloudGameData);
        latestCloudSnapshotRef.current = createCloudSnapshot(normalized);
        lastSavedSnapshotRef.current = saveRow?.game_data
          ? (hadExpOverflow || repairedBattleTurn || mapContentMigrated ? rawCloudSnapshot : normalizedSnapshot)
          : '';
        if (repairedBattleTurn || mapContentMigrated) {
          criticalCloudSaveRequestedRef.current = true;
        }
        setLastSavedAt(saveRow?.last_saved ?? null);
        setHasLoadedCloudSave(true);
        setRequiresCloudReload(false);
        setSyncError(null);
        setSaveStatus(saveRow?.game_data ? 'saved' : 'idle');
        hasCompletedInitialLoadRef.current = true;
        loadedCloudUserIdRef.current = targetUserId;
        return true;
      } catch (error) {
        console.error('Error loading cloud game save:', error);
        setCloudError(error.message || '云端进度读取失败,请检查网络或后端配置。');
        setHasLoadedCloudSave(false);
        return false;
      } finally {
        if (showOverlay) setCloudLoading(false);
      }
    })();

    cloudLoadInFlightRef.current = loadPromise;
    try {
      return await loadPromise;
    } finally {
      if (cloudLoadInFlightRef.current === loadPromise) {
        cloudLoadInFlightRef.current = null;
      }
    }
    // 仅在登录用户切换（id 变）时重建。user.gold/energy 等通过 userRef 读，不再列依赖。
  }, [resetLocalBattleEventCompletionState, user?.id]);

  const saveGameToCloud = useCallback(async ({ manual = false, force = false } = {}) => {
    if (!user?.id) {
      const message = '未登录，无法保存到云端。';
      setSyncError(message);
      if (manual) addNotification(message, 'error');
      return false;
    }

    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    setIsOnline(online);
    if (!online) {
      const message = '网络已断开，无法同步后端。';
      setSyncError(message);
      if (manual) addNotification(message, 'error');
      return false;
    }

    if (requiresCloudReloadRef.current) {
      setSyncError(CLOUD_SYNC_CONFLICT_MESSAGE);
      setSaveStatus('error');
      if (manual) addNotification('云端已有新进度，请重新读取。', 'error');
      return false;
    }

    if (!force && !hasLoadedCloudSave) return false;

    if (manual) {
      pendingManualSaveNoticeRef.current = true;
      setSaveStatus('manual-saving');
    }

    if (cloudSaveInFlightRef.current) {
      const queued = queuedCloudSaveRef.current || {};
      queuedCloudSaveRef.current = {
        manual: Boolean(queued.manual || manual),
        force: Boolean(queued.force || force)
      };
      return true;
    }

    const readLatestSnapshot = () => latestCloudSnapshotRef.current || currentGameData;
    const request = { manual, force };
    cloudSaveInFlightRef.current = true;

    try {
      let nextRequest = request;

      while (true) {
        const snapshot = readLatestSnapshot();
        const snapshotString = JSON.stringify(snapshot);

        if (nextRequest.force || snapshotString !== lastSavedSnapshotRef.current) {
          const revision = cloudSaveRevisionRef.current + 1;
          const payload = withCloudSaveMeta(snapshot, revision, cloudSaveSessionIdRef.current);
          const { data, error } = await runCloudRequestWithRetry(() => supabase.rpc('save_cloud_game_save', {
            p_user_id: user.id,
            p_game_data: payload
          }));

          if (error) throw error;

          const saveRow = Array.isArray(data) ? data[0] : data;
          const accepted = saveRow?.accepted !== false;
          const returnedRevision =
            Number(saveRow?.save_revision) ||
            getCloudSaveRevision(saveRow?.game_data) ||
            revision;

          if (!accepted) {
            throw new Error(CLOUD_SYNC_CONFLICT_MESSAGE);
          }

          cloudSaveRevisionRef.current = Math.max(cloudSaveRevisionRef.current, returnedRevision, revision);
          lastSavedSnapshotRef.current = snapshotString;
          setLastSavedAt(saveRow?.last_saved ?? new Date().toISOString());
          setRequiresCloudReload(false);
          setSyncError(null);
          setSaveStatus(prev => prev === 'error' ? 'idle' : prev);
        } else {
          setSyncError(null);
        }

        const queued = queuedCloudSaveRef.current;
        queuedCloudSaveRef.current = null;
        if (queued) {
          nextRequest = queued;
          continue;
        }

        const latestSnapshotString = JSON.stringify(readLatestSnapshot());
        if (latestSnapshotString !== lastSavedSnapshotRef.current) {
          nextRequest = { manual: false, force: false };
          continue;
        }

        break;
      }

      if (pendingManualSaveNoticeRef.current) {
        pendingManualSaveNoticeRef.current = false;
        setSaveStatus('saved');
        addNotification('进度已保存。', 'info');
      }

      return true;
    } catch (error) {
      console.error('Error saving cloud game save:', error);
      const message = error.message || '云端同步失败，稍后重试。';
      const isConflict = message === CLOUD_SYNC_CONFLICT_MESSAGE || isCloudSyncConflict(message);
      if (isConflict) {
        setRequiresCloudReload(true);
        setSyncError(CLOUD_SYNC_CONFLICT_MESSAGE);
      } else {
        setSyncError(`云端同步失败: ${message}`);
      }
      setSaveStatus('error');
      queuedCloudSaveRef.current = null;
      if (manual || pendingManualSaveNoticeRef.current) {
        pendingManualSaveNoticeRef.current = false;
        addNotification(isConflict ? '云端已有新进度，请重新读取。' : '云端保存失败。', 'error');
      }
      return false;
    } finally {
      cloudSaveInFlightRef.current = false;
    }
  }, [addNotification, currentGameData, hasLoadedCloudSave, user?.id]);

  const waitForCloudSaveIdle = useCallback(async (timeoutMs = 4000) => {
    const startedAt = Date.now();
    while (cloudSaveInFlightRef.current) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error('云端忙碌，稍后重试。');
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  }, []);

  const applyCommittedCloudState = useCallback((saveRow) => {
    const currentResources = latestPlayerResourcesRef.current || {};
    const currentUser = userRef.current || {};
    const backendGold = typeof saveRow?.gold_after === 'number'
      ? saveRow.gold_after
      : (typeof currentResources.gold === 'number' ? currentResources.gold : currentUser?.gold);
    const resources = {
      gold: backendGold,
      energy: typeof saveRow?.energy_after === 'number'
        ? saveRow.energy_after
        : (typeof currentResources.energy === 'number' ? currentResources.energy : currentUser?.energy),
      max_energy: typeof saveRow?.max_energy_after === 'number'
        ? saveRow.max_energy_after
        : (typeof currentResources.maxEnergy === 'number' ? currentResources.maxEnergy : currentUser?.max_energy)
    };
    const normalized = normalizeCloudGameData(
      saveRow?.game_data ?? createDefaultCloudGameData(backendGold),
      backendGold
    );
    if (!normalized) {
      throw new Error('原子提交返回了无效存档。');
    }

    applyCloudGameData(normalized, resources);
    const committedSnapshot = createCloudSnapshot(normalized);
    const returnedRevision =
      Number(saveRow?.save_revision) ||
      getCloudSaveRevision(saveRow?.game_data) ||
      cloudSaveRevisionRef.current;
    cloudSaveRevisionRef.current = Math.max(cloudSaveRevisionRef.current, returnedRevision);
    latestCloudSnapshotRef.current = committedSnapshot;
    lastSavedSnapshotRef.current = JSON.stringify(committedSnapshot);
    queuedCloudSaveRef.current = null;
    setLastSavedAt(saveRow?.last_saved ?? new Date().toISOString());
    setHasLoadedCloudSave(true);
    setRequiresCloudReload(false);
    setSyncError(null);
    setSaveStatus('saved');
  }, [applyCloudGameData]);

  const applyLocalCommittedCloudSnapshot = useCallback((snapshot) => {
    const currentResources = latestPlayerResourcesRef.current || {};
    applyCloudGameData(snapshot, {
      gold: typeof currentResources.gold === 'number'
        ? currentResources.gold
        : (typeof snapshot?.playerGold === 'number' ? snapshot.playerGold : undefined),
      energy: typeof currentResources.energy === 'number' ? currentResources.energy : undefined,
      max_energy: typeof currentResources.maxEnergy === 'number' ? currentResources.maxEnergy : undefined
    });
  }, [applyCloudGameData]);

  const markSnapshotCommitted = useCallback((saveRow, snapshot) => {
    const committedSnapshot = snapshot || latestCloudSnapshotRef.current || currentGameData;
    const returnedRevision =
      Number(saveRow?.save_revision) ||
      getCloudSaveRevision(saveRow?.game_data) ||
      cloudSaveRevisionRef.current;
    cloudSaveRevisionRef.current = Math.max(cloudSaveRevisionRef.current, returnedRevision);
    latestCloudSnapshotRef.current = committedSnapshot;
    lastSavedSnapshotRef.current = JSON.stringify(committedSnapshot);
    queuedCloudSaveRef.current = null;
    setLastSavedAt(saveRow?.last_saved ?? new Date().toISOString());
    setHasLoadedCloudSave(true);
    setRequiresCloudReload(false);
    setSyncError(null);
    setSaveStatus('saved');
  }, [currentGameData]);

  const commitCloudSnapshotWithResources = useCallback(async ({
    snapshot,
    buildSnapshot,
    goldDelta = 0,
    goldReason = '游戏金币变动',
    energyDelta = 0,
    energyReason = '能量变动'
  } = {}) => {
    if (!user?.id) {
      return { success: false, atomicUnavailable: false, message: '未登录，无法同步后端。' };
    }

    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    setIsOnline(online);
    if (!online) {
      return { success: false, atomicUnavailable: false, message: '网络已断开，无法同步后端。' };
    }
    if (requiresCloudReloadRef.current) {
      setSyncError(CLOUD_SYNC_CONFLICT_MESSAGE);
      setSaveStatus('error');
      return { success: false, atomicUnavailable: false, message: CLOUD_SYNC_CONFLICT_MESSAGE, requiresReload: true };
    }

    try {
      await waitForCloudSaveIdle();
    } catch (error) {
      return { success: false, atomicUnavailable: false, message: error.message || '云端忙碌，稍后重试。' };
    }

    cloudSaveInFlightRef.current = true;

    try {
      const latestBaseSnapshot = mergeMonotonicSnapshotProgress(
        readCloudSnapshotFromString(lastSavedSnapshotRef.current),
        latestCloudSnapshotRef.current || currentGameData
      );
      const resolvedSnapshot =
        typeof buildSnapshot === 'function'
          ? buildSnapshot(latestBaseSnapshot)
          : snapshot;
      if (isAbortedCloudSnapshotCommit(resolvedSnapshot)) {
        return {
          success: false,
          atomicUnavailable: false,
          message: resolvedSnapshot.message || '本次操作已取消。',
          aborted: true,
          notificationType: resolvedSnapshot.notificationType || 'warning'
        };
      }
      const normalizedSnapshot = createCloudSnapshot(resolvedSnapshot);
      const revision = cloudSaveRevisionRef.current + 1;
      const payload = withCloudSaveMeta(normalizedSnapshot, revision, cloudSaveSessionIdRef.current);

      const { data, error } = await runCloudRequestWithRetry(() => supabase.rpc('save_cloud_game_state_with_resources', {
        p_user_id: user.id,
        p_game_data: payload,
        p_gold_delta: goldDelta,
        p_gold_reason: goldReason,
        p_energy_delta: energyDelta,
        p_energy_reason: energyReason
      }));

      if (error) {
        const isMissingAtomicRpc = error.code === 'PGRST202' || error.message?.includes('save_cloud_game_state_with_resources');
        if (isMissingAtomicRpc) {
          return {
            success: false,
            atomicUnavailable: false,
            message: '后端尚未部署原子资源存档 RPC，请先同步 Supabase 数据库。'
          };
        }
        throw error;
      }

      const saveRow = Array.isArray(data) ? data[0] : data;
      if (saveRow?.accepted === false) {
        const message = saveRow?.error_message || '后端拒绝了本次资源同步。';
        if (isCloudSyncConflict(message)) {
          setRequiresCloudReload(true);
          setSyncError(CLOUD_SYNC_CONFLICT_MESSAGE);
          setSaveStatus('error');
          return {
            success: false,
            atomicUnavailable: false,
            message: CLOUD_SYNC_CONFLICT_MESSAGE,
            requiresReload: true
          };
        }
        return {
          success: false,
          atomicUnavailable: false,
          message
        };
      }

      applyCommittedCloudState(saveRow);
      return { success: true, atomicUnavailable: false, saveRow };
    } catch (error) {
      console.error('Error committing atomic cloud snapshot:', error);
      const message = getCloudRequestErrorMessage(error) || '资源同步失败，稍后重试。';
      const isTransientRequestError = isTransientCloudRequestError(error);
      if (message === CLOUD_SYNC_CONFLICT_MESSAGE || isCloudSyncConflict(message)) {
        setRequiresCloudReload(true);
        setSyncError(CLOUD_SYNC_CONFLICT_MESSAGE);
        setSaveStatus('error');
        return {
          success: false,
          atomicUnavailable: false,
          message: CLOUD_SYNC_CONFLICT_MESSAGE,
          requiresReload: true
        };
      } else if (!isTransientRequestError) {
        setSyncError(`云端同步失败: ${message}`);
        setSaveStatus('error');
        return { success: false, atomicUnavailable: false, message };
      }
      setSaveStatus((prev) => prev === 'error' ? 'idle' : prev);
      return {
        success: false,
        atomicUnavailable: false,
        message: '网络请求临时失败，系统已拦截本次购买，请稍后再点一次。',
        notificationType: 'warning',
        transient: true
      };
    } finally {
      cloudSaveInFlightRef.current = false;
    }
  }, [applyCommittedCloudState, currentGameData, setIsOnline, supabase, user?.id, waitForCloudSaveIdle]);

  const commitCloudSnapshot = useCallback(async ({
    snapshot,
    buildSnapshot,
    onCommitted
  } = {}) => {
    if (!user?.id) {
      return { success: false, message: '未登录，无法同步后端。' };
    }

    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    setIsOnline(online);
    if (!online) {
      return { success: false, message: '网络已断开，无法同步后端。' };
    }
    if (requiresCloudReloadRef.current) {
      setSyncError(CLOUD_SYNC_CONFLICT_MESSAGE);
      setSaveStatus('error');
      return { success: false, message: CLOUD_SYNC_CONFLICT_MESSAGE, requiresReload: true };
    }

    try {
      await waitForCloudSaveIdle();
    } catch (error) {
      return { success: false, message: error.message || '云端忙碌，稍后重试。' };
    }

    cloudSaveInFlightRef.current = true;

    try {
      const latestBaseSnapshot = mergeMonotonicSnapshotProgress(
        readCloudSnapshotFromString(lastSavedSnapshotRef.current),
        latestCloudSnapshotRef.current || currentGameData
      );
      const resolvedSnapshot =
        typeof buildSnapshot === 'function'
          ? buildSnapshot(latestBaseSnapshot)
          : snapshot;
      if (isAbortedCloudSnapshotCommit(resolvedSnapshot)) {
        return {
          success: false,
          message: resolvedSnapshot.message || '本次操作已取消。',
          aborted: true,
          notificationType: resolvedSnapshot.notificationType || 'warning'
        };
      }
      const normalizedSnapshot = createCloudSnapshot(resolvedSnapshot);
      const revision = cloudSaveRevisionRef.current + 1;
      const payload = withCloudSaveMeta(normalizedSnapshot, revision, cloudSaveSessionIdRef.current);

      const { data, error } = await runCloudRequestWithRetry(() => supabase.rpc('save_cloud_game_save', {
        p_user_id: user.id,
        p_game_data: payload
      }));

      if (error) throw error;

      const saveRow = Array.isArray(data) ? data[0] : data;
      if (saveRow?.accepted === false) {
        const message = CLOUD_SYNC_CONFLICT_MESSAGE;
        if (isCloudSyncConflict('后端拒绝了旧版本存档。')) {
          setRequiresCloudReload(true);
          setSyncError(CLOUD_SYNC_CONFLICT_MESSAGE);
          setSaveStatus('error');
          return { success: false, message, requiresReload: true };
        }
        return { success: false, message };
      }

      const applyAcceptedSnapshotLocally = () => {
        try {
          applyCommittedCloudState(saveRow);
        } catch (returnedApplyError) {
          console.error('Error applying returned cloud snapshot:', returnedApplyError);
          applyLocalCommittedCloudSnapshot(normalizedSnapshot);
          markSnapshotCommitted(saveRow, normalizedSnapshot);
        }
      };

      if (typeof onCommitted === 'function') {
        try {
          onCommitted({ saveRow, snapshot: normalizedSnapshot });
          markSnapshotCommitted(saveRow, normalizedSnapshot);
        } catch (callbackError) {
          console.error('Error applying local committed snapshot:', callbackError);
          applyAcceptedSnapshotLocally();
        }
      } else {
        applyAcceptedSnapshotLocally();
      }
      return { success: true, saveRow };
    } catch (error) {
      console.error('Error committing cloud snapshot:', error);
      const message = error.message || '云端同步失败，稍后重试。';
      if (message === CLOUD_SYNC_CONFLICT_MESSAGE || isCloudSyncConflict(message)) {
        setRequiresCloudReload(true);
        setSyncError(CLOUD_SYNC_CONFLICT_MESSAGE);
        setSaveStatus('error');
        return { success: false, message: CLOUD_SYNC_CONFLICT_MESSAGE, requiresReload: true };
      } else {
        setSyncError(`云端同步失败: ${message}`);
      }
      setSaveStatus('error');
      return { success: false, message };
    } finally {
      cloudSaveInFlightRef.current = false;
    }
  }, [applyCommittedCloudState, applyLocalCommittedCloudSnapshot, currentGameData, markSnapshotCommitted, setIsOnline, supabase, user?.id, waitForCloudSaveIdle]);

  useEffect(() => {
    loadGameFromCloud();
  }, [loadGameFromCloud]);

  // ref 持有最新的 saveGameToCloud，避免引用变化重置 debounce timer
  const saveGameToCloudRef = useRef(saveGameToCloud);
  useEffect(() => { saveGameToCloudRef.current = saveGameToCloud; }, [saveGameToCloud]);
  const localBattleSwitchInFlightRef = useRef(null);
  const isResolvingBattleTurn = view === 'battle' && turn === 'resolving';
  const handlePlayerMove = useCallback((position) => {
    const nextPosition = normalizeWorldPosition(position, playerPosRef.current);
    playerPosRef.current = nextPosition;
    setPlayerPos(nextPosition);

    if (mapMovementSaveTimerRef.current) {
      clearTimeout(mapMovementSaveTimerRef.current);
    }
    if (!hasLoadedCloudSave || cloudBlockedRef.current || requiresCloudReloadRef.current) {
      mapMovementSaveTimerRef.current = null;
      return;
    }
    mapMovementSaveTimerRef.current = setTimeout(() => {
      mapMovementSaveTimerRef.current = null;
      if (!cloudBlockedRef.current && !requiresCloudReloadRef.current) {
        saveGameToCloudRef.current({ force: true });
      }
    }, 900);
  }, [hasLoadedCloudSave]);

  const handleEncounterCooldownChange = useCallback((value) => {
    const nextValue = Math.max(0, Math.trunc(Number(value) || 0));
    encounterCooldownStepsRef.current = nextValue;
    setEncounterCooldownSteps(nextValue);
  }, []);

  useEffect(() => {
    if (!hasLoadedCloudSave || cloudLoading || cloudError || requiresCloudReload) return undefined;
    if (isResolvingBattleTurn) return undefined;
    if (showLaunchScreen && playerTeam.length === 0) return undefined;

    const timer = setTimeout(() => {
      saveGameToCloudRef.current();
    }, CLOUD_SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGameData, cloudError, cloudLoading, hasLoadedCloudSave, isResolvingBattleTurn, requiresCloudReload, showLaunchScreen]);

  useEffect(() => {
    if (!criticalCloudSaveRequestedRef.current) return;
    if (!hasLoadedCloudSave || cloudLoading || cloudError || requiresCloudReload) return;
    if (isResolvingBattleTurn) return;
    if (showLaunchScreen && playerTeam.length === 0) return;

    criticalCloudSaveRequestedRef.current = false;
    saveGameToCloudRef.current({ force: true });
  }, [currentGameData, cloudError, cloudLoading, hasLoadedCloudSave, isResolvingBattleTurn, requiresCloudReload, showLaunchScreen, playerTeam.length]);

  useEffect(() => {
    if (!hasLoadedCloudSave || cloudLoading || cloudError || requiresCloudReload) return undefined;
    if (isResolvingBattleTurn) return undefined;

    const interval = window.setInterval(() => {
      saveGameToCloudRef.current();
    }, CLOUD_SAVE_MAX_WAIT_MS);

    return () => window.clearInterval(interval);
  }, [cloudError, cloudLoading, hasLoadedCloudSave, isResolvingBattleTurn, requiresCloudReload]);

  useEffect(() => {
    if (!hasLoadedCloudSave || cloudLoading || cloudError || requiresCloudReload) return undefined;
    if (isResolvingBattleTurn) return undefined;

    const handlePageHide = () => {
      if (!requiresCloudReloadRef.current) {
        saveGameToCloudRef.current({ force: true });
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [cloudError, cloudLoading, hasLoadedCloudSave, isResolvingBattleTurn, requiresCloudReload]);

  useEffect(() => {
    if (!hasLoadedCloudSave) return;
    if (!isOnline && !requiresCloudReloadRef.current) {
      setSyncError('网络已断开，游戏必须重新同步后才能继续。');
    }
  }, [hasLoadedCloudSave, isOnline]);

  const resolveTeacherRewardApplication = useCallback((baseSnapshot, rewards = [], options = {}) => {
    const baseLogs = Array.isArray(baseSnapshot?.logs) ? baseSnapshot.logs : [];
    const baseRoster = sanitizeRoster(
      normalizeMonsterAssetList(baseSnapshot?.playerTeam),
      normalizeMonsterAssetList(baseSnapshot?.storageBox),
      baseSnapshot?.activePlayerId
    );
    const claimToken = typeof options.claimToken === 'string' && options.claimToken.length > 0
      ? options.claimToken
      : null;
    const rewardIds = Array.isArray(options.rewardIds)
      ? options.rewardIds.filter((id) => typeof id === 'string' && id.length > 0)
      : [];
    const baseAppliedRewardIds = normalizeAppliedTeacherRewardIds(baseSnapshot?.appliedTeacherRewardIds);
    const appliedRewardIds = new Set(baseAppliedRewardIds);
    const pendingClaimCreatedAt = typeof options.createdAt === 'string'
      ? options.createdAt
      : new Date().toISOString();

    let nextInventory = sanitizePlayerInventory(baseSnapshot?.playerInventory);
    let nextTeam = baseRoster.playerTeam;
    let nextStorageBox = baseRoster.storageBox;
    let nextActivePlayerId = baseRoster.activePlayerId;
    let nextMonsterId = Number.isInteger(Number(baseSnapshot?.nextPlayerMonsterId))
      ? Number(baseSnapshot.nextPlayerMonsterId)
      : 100;
    let nextPendingAcquisition = normalizePendingMonsterAcquisition(baseSnapshot?.pendingMonsterAcquisition);
    const logMessages = [];
    const notifications = [];

    for (let index = 0; index < rewards.length; index += 1) {
      const reward = rewards[index];
      if (!reward || typeof reward !== 'object') continue;
      const rewardId = typeof reward.reward_id === 'string' && reward.reward_id.length > 0
        ? reward.reward_id
        : null;
      if (rewardId && appliedRewardIds.has(rewardId)) {
        continue;
      }

      if (reward.reward_type === 'item') {
        const normalizedItemType = resolveInventoryItemType({
          itemType: reward.item_type,
          itemKey: reward.item_key
        });

        if (isLegacyInventoryItemType(normalizedItemType) || isLegacyInventoryItemType(reward.item_type)) {
          const legacyItem = EVOLUTION_ITEMS[reward.item_key];
          const legacyName = legacyItem?.name || reward.item_key || '旧版进化道具';
          logMessages.push(`老师奖励中的 ${legacyName} 属于旧版进化道具，现已停用，未加入背包。`);
          notifications.push({ message: `旧版奖励已停用：${legacyName}。`, type: 'info' });
          continue;
        }

        const quantity = Math.trunc(Number(reward.quantity ?? 1));
        if (!Number.isSafeInteger(quantity) || quantity <= 0) {
          return {
            success: false,
            message: '老师奖励数量无效。',
            notificationType: 'error'
          };
        }
        if (!normalizedItemType || !isActiveInventoryItemType(normalizedItemType)) {
          return {
            success: false,
            message: '老师奖励类型不支持。',
            notificationType: 'error'
          };
        }

        const item = resolveInventoryItemDetails(normalizedItemType, reward.item_key);
        if (!item) {
          return {
            success: false,
            message: `老师奖励道具不存在：${reward.item_key || '未知道具'}。`,
            notificationType: 'error'
          };
        }

        nextInventory = mergeInventoryEntries(nextInventory, normalizedItemType, reward.item_key, quantity);
        logMessages.push(`领取老师奖励: ${item.name} x${quantity}`);
        notifications.push({ message: `获得${item.name} x${quantity}。`, type: 'item' });
        if (rewardId) appliedRewardIds.add(rewardId);
        continue;
      }

      if (reward.reward_type === 'pokemon') {
        const baseMonster = getBaseMonsterDefinition(reward.pokemon_id);
        if (!baseMonster) {
          return {
            success: false,
            message: `老师奖励宝可梦不存在：#${reward.pokemon_id ?? '未知'}。`,
            notificationType: 'error'
          };
        }

        const rewardLevel = Math.max(1, Math.min(100, Math.trunc(Number(reward.pokemon_level ?? 1))));
        const rewardIdSuffix = typeof reward.reward_id === 'string'
          ? reward.reward_id.replace(/[^a-zA-Z0-9]/g, '').slice(-8)
          : String(index);
        const monsterId = `p${nextMonsterId}_${rewardIdSuffix || index}`;
        const newMonster = createMonsterInstance(baseMonster, rewardLevel, monsterId);
        nextMonsterId += 1;

        const result = acquireMonster({
          playerTeam: nextTeam,
          storageBox: nextStorageBox,
          activePlayerId: nextActivePlayerId
        }, newMonster);

        if (result.needsDecision) {
          if (!nextPendingAcquisition) {
            nextPendingAcquisition = {
              monster: sanitizeBattleRuntime(normalizeMonsterAssetSource(newMonster)),
              source: 'teacher_reward',
              createdAt: new Date().toISOString()
            };
            logMessages.push(`领取老师奖励: ${newMonster.name} Lv.${newMonster.level}，请在弹窗中选择安置方式。`);
            if (rewardId) appliedRewardIds.add(rewardId);
            continue;
          }

          const storageResult = addToStorage({
            playerTeam: nextTeam,
            storageBox: nextStorageBox,
            activePlayerId: nextActivePlayerId
          }, newMonster);
          if (!storageResult.success) {
            return {
              success: false,
              message: `仓库已满，无法领取 ${newMonster.name}。`,
              notificationType: 'warning'
            };
          }

          nextTeam = storageResult.playerTeam;
          nextStorageBox = storageResult.storageBox;
          nextActivePlayerId = storageResult.activePlayerId;
          logMessages.push(`领取老师奖励: ${newMonster.name} Lv.${newMonster.level}，已送入仓库`);
          notifications.push({ message: `${newMonster.name} 已入仓。`, type: 'item' });
          if (rewardId) appliedRewardIds.add(rewardId);
          continue;
        }

        nextTeam = result.playerTeam;
        nextStorageBox = result.storageBox;
        nextActivePlayerId = result.activePlayerId;
        logMessages.push(`领取老师奖励: ${newMonster.name} Lv.${newMonster.level}`);
        notifications.push({ message: `获得${newMonster.name} Lv.${newMonster.level}。`, type: 'item' });
        if (rewardId) appliedRewardIds.add(rewardId);
        continue;
      }

      return {
        success: false,
        message: '老师奖励类型未知。',
        notificationType: 'error'
      };
    }

    const roster = sanitizeRoster(nextTeam, nextStorageBox, nextActivePlayerId);
    const pendingClaim = claimToken
      ? {
        token: claimToken,
        rewardIds,
        createdAt: pendingClaimCreatedAt
      }
      : normalizePendingTeacherRewardClaim(baseSnapshot?.pendingTeacherRewardClaim);

    return {
      success: true,
      notifications,
      logMessages,
      snapshot: {
        ...baseSnapshot,
        logs: [...baseLogs, ...logMessages],
        playerInventory: nextInventory,
        playerTeam: roster.playerTeam,
        storageBox: roster.storageBox,
        activePlayerId: resolveDefaultActivePlayerId(roster.playerTeam, roster.activePlayerId),
        nextPlayerMonsterId: Math.max(
          Number.isInteger(Number(baseSnapshot?.nextPlayerMonsterId))
            ? Number(baseSnapshot.nextPlayerMonsterId)
            : 100,
          nextMonsterId
        ),
        pendingMonsterAcquisition: nextPendingAcquisition,
        pendingTeacherRewardClaim: pendingClaim,
        appliedTeacherRewardIds: Array.from(appliedRewardIds),
        legacyTeacherRewardRecovery: null
      }
    };
  }, [getBaseMonsterDefinition]);

  const applyTeacherRewardRows = useCallback((baseSnapshot, rewards = [], options = {}) => {
    const resolved = resolveTeacherRewardApplication(baseSnapshot, rewards, options);
    if (!resolved.success) {
      return resolved;
    }

    return resolved;
  }, [resolveTeacherRewardApplication]);

  const commitLegacyTeacherRewardRecovery = useCallback(async (recovery) => {
    if (!user?.id) return false;

    const normalizedRecovery = normalizeLegacyTeacherRewardRecovery(recovery);
    if (!normalizedRecovery) return false;

    let resolvedRewardCommit = null;
    const commitResult = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => {
        const resolved = applyTeacherRewardRows(baseSnapshot, normalizedRecovery.rewards, {
          rewardIds: normalizedRecovery.rewardIds,
          createdAt: normalizedRecovery.createdAt
        });
        if (!resolved.success) {
          return abortCloudSnapshotCommit(
            resolved.message || '老师奖励领取失败，稍后重试。',
            resolved.notificationType || 'error'
          );
        }

        resolvedRewardCommit = resolved;
        return {
          ...resolved.snapshot,
          legacyTeacherRewardRecovery: null
        };
      }
    });

    if (commitResult.success) {
      legacyTeacherRewardRecoveryRetryAtRef.current = 0;
      clearLegacyTeacherRewardRecoveryFromStorage(user.id);
      setLegacyTeacherRewardRecovery(null);
      resolvedRewardCommit?.notifications?.forEach(({ message, type }) => {
        addNotification(message, type);
      });
      return true;
    }

    legacyTeacherRewardRecoveryRetryAtRef.current = commitResult.requiresReload ? 0 : Date.now() + 10_000;
    writeLegacyTeacherRewardRecoveryToStorage(user.id, normalizedRecovery);
    setLegacyTeacherRewardRecovery(normalizedRecovery);
    const message = commitResult.message || '老师奖励已暂存，稍后重试。';
    addLog(`老师奖励领取失败: ${message}`);
    addNotification(
      message,
      commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
    );
    return false;
  }, [addLog, addNotification, applyTeacherRewardRows, commitCloudSnapshot, user?.id]);

  const beginTeacherRewardClaim = useCallback(async () => {
    if (
      !user?.id ||
      showLaunchScreen ||
      pendingTeacherRewardClaim ||
      legacyTeacherRewardRecovery ||
      cloudBlocked ||
      !hasLoadedCloudSave ||
      cloudLoading ||
      cloudError ||
      requiresCloudReload
    ) return;
    if (rewardClaimBeginInFlightRef.current) return;

    rewardClaimBeginInFlightRef.current = true;
    try {
      if (teacherRewardHandshakeRetryAtRef.current > Date.now()) {
        return;
      }

      const { data, error } = await supabase.rpc('begin_teacher_reward_claim', {
        p_student_id: user.id
      });
      if (error) {
        const isMissingBeginRpc = error.code === 'PGRST202' || error.message?.includes('begin_teacher_reward_claim');
        if (!isMissingBeginRpc) {
          console.error('Error beginning teacher reward claim:', error);
          return;
        }

        teacherRewardHandshakeRetryAtRef.current = Date.now() + 60_000;
        const message = '老师奖励接口未就绪。';
        console.error('begin_teacher_reward_claim is not available:', error);
        addLog(`老师奖励领取失败: ${message}`);
        addNotification(message, 'error');
        return;
      }

      const rewards = Array.isArray(data) ? data : [];
      if (rewards.length === 0) return;

      const claimToken = rewards[0]?.claim_token;
      if (typeof claimToken !== 'string' || claimToken.length === 0) {
        console.error('Teacher reward claim did not return a valid claim token.');
        return;
      }

      const rewardIds = rewards
        .map((reward) => (typeof reward.reward_id === 'string' ? reward.reward_id : null))
        .filter(Boolean);

      const createdAt = new Date().toISOString();
      let resolvedRewardCommit = null;
      const commitResult = await commitCloudSnapshot({
        buildSnapshot: (baseSnapshot) => {
          const resolved = resolveTeacherRewardApplication(baseSnapshot, rewards, {
            claimToken,
            rewardIds,
            createdAt
          });
          if (!resolved.success) {
            return abortCloudSnapshotCommit(
              resolved.message || '老师奖励领取失败，稍后重试。',
              resolved.notificationType || 'error'
            );
          }
          resolvedRewardCommit = resolved;
          return resolved.snapshot;
        }
      });
      if (!commitResult.success) {
        if (commitResult.message) {
          addLog(`老师奖励领取失败: ${commitResult.message}`);
          addNotification(
            commitResult.message,
            commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
          );
        }
        return;
      }

      resolvedRewardCommit?.notifications?.forEach(({ message, type }) => {
        addNotification(message, type);
      });
    } finally {
      rewardClaimBeginInFlightRef.current = false;
    }
  }, [
    addLog,
    addNotification,
    cloudBlocked,
    cloudError,
    cloudLoading,
    commitCloudSnapshot,
    hasLoadedCloudSave,
    legacyTeacherRewardRecovery,
    pendingTeacherRewardClaim,
    requiresCloudReload,
    resolveTeacherRewardApplication,
    showLaunchScreen,
    user?.id
  ]);

  const confirmTeacherRewardClaim = useCallback(async (claimToken) => {
    if (!user?.id || !claimToken) return false;

    const { data, error } = await supabase.rpc('confirm_teacher_reward_claim', {
      p_student_id: user.id,
      p_claim_token: claimToken
    });
    if (error) {
      console.error('Error confirming teacher reward claim:', error);
      teacherRewardConfirmRetryAtRef.current = Date.now() + 10_000;
      addLog(`老师奖励确认失败: ${error.message || '后端确认失败。'}`);
      addNotification('奖励确认中，请稍候。', 'warning');
      return false;
    }

    const result = typeof data === 'string' ? JSON.parse(data) : data;
    if (!result?.success) {
      console.error('Teacher reward claim confirmation failed:', result?.error || result);
      teacherRewardConfirmRetryAtRef.current = Date.now() + 10_000;
      addLog(`老师奖励确认失败: ${result?.error || '奖励确认未成功。'}`);
      addNotification('奖励确认未完成，稍后重试。', 'warning');
      return false;
    }

    teacherRewardConfirmRetryAtRef.current = 0;

    const commitResult = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => {
        const pendingClaim = normalizePendingTeacherRewardClaim(baseSnapshot.pendingTeacherRewardClaim);
        if (!pendingClaim?.token || pendingClaim.token !== claimToken) {
          return abortCloudSnapshotCommit('奖励批次已变化，请重新读取。', 'info');
        }

        return {
          ...baseSnapshot,
          pendingTeacherRewardClaim: null
        };
      }
    });

    if (commitResult.success) {
      gameAudio.playCaptureThrow();
      return true;
    }

    if (commitResult.message) {
      console.error('Teacher reward claim cleanup failed:', commitResult.message);
      addLog(`老师奖励确认清理失败: ${commitResult.message}`);
      addNotification(
        commitResult.message,
        commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
      );
    }
    if (commitResult.requiresReload) {
      teacherRewardConfirmRetryAtRef.current = 0;
    } else {
      teacherRewardConfirmRetryAtRef.current = Date.now() + 10_000;
      addNotification('奖励已发放，记录稍后同步。', 'warning');
    }
    return false;
  }, [addLog, addNotification, commitCloudSnapshot, user?.id]);

  useEffect(() => {
    beginTeacherRewardClaim();
  }, [beginTeacherRewardClaim]);

  useEffect(() => {
    if (legacyTeacherRewardRecovery || !user?.id) return;
    const storedRecovery = readLegacyTeacherRewardRecoveryFromStorage(user.id);
    if (storedRecovery) {
      setLegacyTeacherRewardRecovery(storedRecovery);
    }
  }, [legacyTeacherRewardRecovery, user?.id]);

  useEffect(() => {
    if (!legacyTeacherRewardRecovery?.rewards?.length) return;
    if (!user?.id || showLaunchScreen || cloudBlocked || !hasLoadedCloudSave || cloudLoading || cloudError || requiresCloudReload) return;
    if (rewardClaimBeginInFlightRef.current || rewardClaimConfirmInFlightRef.current) return;
    if (legacyTeacherRewardRecoveryInFlightRef.current) return;
    if (legacyTeacherRewardRecoveryRetryAtRef.current > Date.now()) return;

    const snapshotString = JSON.stringify(latestCloudSnapshotRef.current || currentGameData);
    if (snapshotString !== lastSavedSnapshotRef.current) return;

    legacyTeacherRewardRecoveryInFlightRef.current = true;
    commitLegacyTeacherRewardRecovery(legacyTeacherRewardRecovery)
      .finally(() => {
        legacyTeacherRewardRecoveryInFlightRef.current = false;
      });
  }, [
    cloudBlocked,
    cloudError,
    cloudLoading,
    commitLegacyTeacherRewardRecovery,
    currentGameData,
    hasLoadedCloudSave,
    legacyTeacherRewardRecovery,
    requiresCloudReload,
    showLaunchScreen,
    user?.id
  ]);

  useEffect(() => {
    const claimToken = pendingTeacherRewardClaim?.token;
    if (!claimToken) return;
    if (cloudBlocked || !hasLoadedCloudSave || cloudLoading || cloudError || showLaunchScreen) return;
    if (rewardClaimConfirmInFlightRef.current) return;
    if (teacherRewardConfirmRetryAtRef.current > Date.now()) return;

    const snapshotString = JSON.stringify(latestCloudSnapshotRef.current || currentGameData);
    if (snapshotString !== lastSavedSnapshotRef.current) return;

    rewardClaimConfirmInFlightRef.current = true;
    confirmTeacherRewardClaim(claimToken)
      .finally(() => {
        rewardClaimConfirmInFlightRef.current = false;
      });
  }, [pendingTeacherRewardClaim, cloudBlocked, hasLoadedCloudSave, cloudLoading, cloudError, showLaunchScreen, currentGameData, confirmTeacherRewardClaim]);

  const refreshGoldBalance = useCallback(async () => {
    if (!user?.id) return playerGold;

    const { data, error } = await runCloudRequestWithRetry(() => supabase.rpc('get_user_resources', {
      p_user_id: user.id
    }));

    if (error) {
      console.error('Error refreshing gold:', error);
      addLog(`金币刷新失败: ${error.message}`);
      return playerGold;
    }

    const row = Array.isArray(data) ? (data[0] || {}) : (data || {});
    const latestGold = typeof row.gold === 'number' ? row.gold : playerGold;
    setPlayerGold(latestGold);
    return latestGold;
  }, [user?.id, playerGold, addLog]);

  const refreshPlayerResources = useCallback(async () => {
    if (!user?.id) return { gold: playerGold, energy: playerEnergy, maxEnergy };

    const { data, error } = await runCloudRequestWithRetry(() => supabase.rpc('get_user_resources', {
      p_user_id: user.id
    }));

    if (error) {
      console.error('Error refreshing resources:', error);
      addLog(`资源刷新失败: ${error.message}`);
      return { gold: playerGold, energy: playerEnergy, maxEnergy };
    }

    const row = Array.isArray(data) ? (data[0] || {}) : (data || {});
    const latestGold = typeof row.gold === 'number' ? row.gold : playerGold;
    const latestEnergy = row.energy ?? DEFAULT_STARTING_ENERGY;
    const latestMaxEnergy = row.max_energy ?? DEFAULT_MAX_ENERGY;
    setPlayerGold(latestGold);
    setPlayerEnergy(latestEnergy);
    setMaxEnergy(latestMaxEnergy);
    return { gold: latestGold, energy: latestEnergy, maxEnergy: latestMaxEnergy };
  }, [addLog, maxEnergy, playerEnergy, playerGold, user?.id]);

  useEffect(() => {
    if (!hasLoadedCloudSave || cloudLoading || cloudError || showLaunchScreen || !user?.id) return undefined;
    refreshPlayerResources();

    const interval = window.setInterval(() => {
      refreshPlayerResources();
    }, 45000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshPlayerResources();
      } else if (document.visibilityState === 'hidden' && !requiresCloudReloadRef.current) {
        saveGameToCloudRef.current({ force: true });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cloudError, cloudLoading, hasLoadedCloudSave, refreshPlayerResources, showLaunchScreen, user?.id]);

  const grantBattleRewards = useCallback(async (defeatedMons, defeatedBattleKind = battleKind) => {
    const defeatedRewardMons = normalizeDefeatedRewardMons(defeatedMons);
    if (defeatedRewardMons.length === 0) return normalizeBattleRewardSummary(null);
    const participants = participatedMonIds.filter(Boolean);
    const targetParticipantIds = participants.length > 0 ? [...new Set(participants)] : [activePlayerId].filter(Boolean);
    const rewards = calculateBattleRewardTotals({
      defeatedMons: defeatedRewardMons,
      playerAverageLevel: getPlayerAverageLevel(playerTeam),
      battleKind: defeatedBattleKind,
      participants: targetParticipantIds.length || 1,
      trainerRole: battleEnvironment?.eventRole || 'normal'
    });

    const rewardGrowthPreview = applyBattleRewardGrowth({
      playerTeam,
      pendingGrowthEvents,
      participantIds: targetParticipantIds,
      totalExp: rewards.exp,
      getBaseMonsterDefinition
    });
    const expPerPokemon = rewards.exp > 0 && targetParticipantIds.length > 0
      ? Math.max(1, Math.round(rewards.exp / targetParticipantIds.length))
      : 0;
    const rewardSummary = {
      exp: rewards.exp,
      gold: rewards.gold,
      participantCount: targetParticipantIds.length,
      expPerPokemon,
      levelUps: rewardGrowthPreview.levelUps
    };

    const needsRewardCommit = rewards.gold > 0 || (rewards.exp > 0 && targetParticipantIds.length > 0);
    if (!needsRewardCommit) return rewardSummary;

    if (!user?.id || !hasLoadedCloudSave) {
      const message = '云端未就绪，战斗奖励未结算。';
      addLog(message);
      addNotification(message, 'error');
      return { ...rewardSummary, exp: 0, gold: 0, levelUps: [] };
    }

	    let committedRewardGrowthPreview = rewardGrowthPreview;
	    const atomicResult = await commitCloudSnapshotWithResources({
	      buildSnapshot: (baseSnapshot) => {
        const hydratedBattleSnapshot = hydrateCommittedBattleSnapshot(baseSnapshot);
        const rewardSnapshot = hydratedBattleSnapshot.snapshot;
	        const rewardCompletionMeta = getConfiguredBattleCompletionMeta({
	          snapshot: rewardSnapshot,
	          battleEnvironment: hydratedBattleSnapshot.battleEnvironment,
	          fallbackMapName: currentMapName
	        });
	        const shouldApplyBattleCompletionWithRewards =
	          defeatedBattleKind === 'trainer' &&
	          ['boss', 'trainer'].includes(rewardCompletionMeta.eventType) &&
	          rewardCompletionMeta.eventId;
	        const rewardCompletionResult = shouldApplyBattleCompletionWithRewards
	          ? applyConfiguredBattleCompletionToWorld(rewardSnapshot.world, rewardCompletionMeta)
	          : null;
          let rewardPhaseWorld = rewardCompletionResult?.world || rewardSnapshot.world;
          if (
            shouldApplyBattleCompletionWithRewards &&
            isDailyVariantBattleEvent(rewardCompletionMeta.eventType, rewardCompletionMeta.eventRole) &&
            rewardCompletionMeta.mapName &&
            rewardCompletionMeta.eventId &&
            !hasDailyTrainerBattleEvent(rewardPhaseWorld, rewardCompletionMeta.mapName, rewardCompletionMeta.eventId)
          ) {
            rewardPhaseWorld = appendDailyTrainerBattleEvent(
              rewardPhaseWorld,
              rewardCompletionMeta.mapName,
              rewardCompletionMeta.eventId
            );
            rewardPhaseWorld = incrementTrainerVictoryCount(
              rewardPhaseWorld,
              rewardCompletionMeta.eventId,
              isDailyScalingTrainerEvent(rewardCompletionMeta.eventType, rewardCompletionMeta.eventRole)
                ? rewardCompletionMeta.mapName
                : null
            );
            rewardPhaseWorld = withUpdatedMapProgress(rewardPhaseWorld, rewardCompletionMeta.mapName);
          }
	        const rewardGrowth = applyBattleRewardGrowth({
	          playerTeam: rewardSnapshot.playerTeam,
	          pendingGrowthEvents: rewardSnapshot.pendingGrowthEvents,
          participantIds: targetParticipantIds,
          totalExp: rewards.exp,
          getBaseMonsterDefinition
        });
        committedRewardGrowthPreview = rewardGrowth;
        const snapshotRewardLogs = [
          ...rewardGrowth.levelUps.map(({ name }) => getBattleLevelUpMessage(name)),
          ...(rewards.exp > 0 && targetParticipantIds.length > 0 ? ['参与战斗的宝可梦获得了经验。'] : []),
          ...(rewards.gold > 0 ? ['获得了战斗奖励。'] : [])
        ];
	        return {
	          ...rewardSnapshot,
	          world: rewardPhaseWorld,
	          playerTeam: rewardGrowth.playerTeam,
	          pendingGrowthEvents: rewardGrowth.pendingGrowthEvents,
	          logs: appendSnapshotLogs(rewardSnapshot, snapshotRewardLogs)
	        };
      },
      goldDelta: rewards.gold,
      goldReason: defeatedRewardMons.length > 1
        ? `训练家战胜利奖励: ${defeatedRewardMons.length} 只宝可梦`
        : `战斗胜利奖励: ${defeatedRewardMons[0].name} Lv.${defeatedRewardMons[0].level}`
    });

    if (atomicResult.success) {
      scheduleLevelUpCelebrationsForTeam(
        committedRewardGrowthPreview.levelUps,
        committedRewardGrowthPreview.playerTeam
      );
      return {
        ...rewardSummary,
        levelUps: committedRewardGrowthPreview.levelUps
      };
    }

    addLog(atomicResult.message || '战斗奖励结算失败。');
    addNotification('战斗奖励保存失败，请重新读取。', 'error');
    return { ...rewardSummary, exp: 0, gold: 0, levelUps: [] };
	  }, [activePlayerId, addLog, addNotification, battleEnvironment, battleKind, commitCloudSnapshotWithResources, currentMapName, getBaseMonsterDefinition, hasLoadedCloudSave, hydrateCommittedBattleSnapshot, participatedMonIds, pendingGrowthEvents, playerTeam, scheduleLevelUpCelebrationsForTeam, user?.id]);

  // ── 成长事件处理 ─────────────────────────────────────────────────────────────

  const hasMatchingPendingGrowthEvent = useCallback((expectedEvent) => {
    if (!expectedEvent) return true;
    const expectedKey = getPendingGrowthEventKey(expectedEvent);
    if (!expectedKey) return false;
    return getPendingGrowthEventKey(pendingGrowthEvents[0]) === expectedKey;
  }, [pendingGrowthEvents]);

  const dismissPendingGrowthEvent = useCallback(async (
    expectedEvent,
    {
      logMessage = null,
      notificationMessage = null,
      notificationType = 'warning'
    } = {}
  ) => {
    if (!expectedEvent) return false;

    if (user?.id && hasLoadedCloudSave) {
      const commitResult = await commitCloudSnapshot({
        buildSnapshot: (baseSnapshot) => {
          const resolvedHead = resolvePendingGrowthEventHead(baseSnapshot, expectedEvent);
          if (resolvedHead.aborted) {
            return resolvedHead.aborted;
          }

          return {
            ...baseSnapshot,
            pendingGrowthEvents: resolvedHead.remainingEvents,
            logs: logMessage ? appendSnapshotLogs(baseSnapshot, [logMessage]) : baseSnapshot.logs
          };
        }
      });

      if (commitResult.success) {
        if (notificationMessage) {
          addNotification(notificationMessage, notificationType);
        }
        return true;
      }

      if (commitResult.message) {
        addNotification(
          commitResult.message,
          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
        );
      }
      return false;
    }

    addNotification('云端未就绪，暂不能确认成长。', 'error');
    return false;
  }, [
    addLog,
    addNotification,
    commitCloudSnapshot,
    hasLoadedCloudSave,
    hasMatchingPendingGrowthEvent,
    user?.id,
  ]);

  const applyLearnMove = useCallback(async (monId, moveKey, expectedEvent = null) => {
    const moveName = MOVES[moveKey]?.name ?? moveKey;
    const effectiveExpectedEvent = expectedEvent || pendingGrowthEvents[0] || null;

    if (user?.id && hasLoadedCloudSave && effectiveExpectedEvent) {
      const commitResult = await commitCloudSnapshot({
        buildSnapshot: (baseSnapshot) => {
          const resolvedHead = resolvePendingGrowthEventHead(baseSnapshot, effectiveExpectedEvent);
          if (resolvedHead.aborted) {
            return resolvedHead.aborted;
          }

          const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [];
          const baseMon = baseTeam.find((monster) => monster.id === monId);
          const baseMoves = Array.isArray(baseMon?.moves) ? baseMon.moves : [];
          if (!baseMon || baseMoves.includes(moveKey)) {
            return {
              ...baseSnapshot,
              pendingGrowthEvents: resolvedHead.remainingEvents
            };
          }
          if (baseMoves.length >= 4) {
            return abortCloudSnapshotCommit(`${baseMon.name} 的技能已满，请先选择要遗忘的技能。`, 'info');
          }

          return {
            ...baseSnapshot,
            playerTeam: baseTeam.map((monster) => (
              monster.id === monId
                ? { ...monster, moves: [...baseMoves, moveKey].slice(0, 4) }
                : monster
            )),
            pendingGrowthEvents: resolvedHead.remainingEvents,
            logs: appendSnapshotLogs(baseSnapshot, [`学会了 ${moveName}！`])
          };
        }
      });

      if (commitResult.success) {
        return true;
      }
      if (commitResult.message) {
        addNotification(
          commitResult.message,
          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
        );
      }
      return false;
    }

    addNotification('云端未就绪，暂不能学习技能。', 'error');
    return false;
  }, [
    addLog,
    addNotification,
    commitCloudSnapshot,
    dismissPendingGrowthEvent,
    hasLoadedCloudSave,
    hasMatchingPendingGrowthEvent,
    pendingGrowthEvents,
    playerTeam,
    user?.id,
  ]);

  const handleLearnMoveChoice = useCallback(async (monId, newMoveKey, forgetIdx, expectedEvent = null) => {
    const moveName = MOVES[newMoveKey]?.name ?? newMoveKey;
    const effectiveExpectedEvent = expectedEvent || pendingGrowthEvents[0] || null;

    if (user?.id && hasLoadedCloudSave && effectiveExpectedEvent) {
      const commitResult = await commitCloudSnapshot({
        buildSnapshot: (baseSnapshot) => {
          const resolvedHead = resolvePendingGrowthEventHead(baseSnapshot, effectiveExpectedEvent);
          if (resolvedHead.aborted) {
            return resolvedHead.aborted;
          }

          const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [];
          const baseMon = baseTeam.find((monster) => monster.id === monId);
          const baseMoves = Array.isArray(baseMon?.moves) ? baseMon.moves : [];
          const learnLog =
            forgetIdx !== null && baseMon && !baseMoves.includes(newMoveKey) && baseMoves[forgetIdx] !== undefined
              ? `学会了 ${moveName}！`
              : `放弃了学习 ${moveName}。`;

          if (!baseMon || baseMoves.includes(newMoveKey)) {
            return {
              ...baseSnapshot,
              pendingGrowthEvents: resolvedHead.remainingEvents,
              logs: appendSnapshotLogs(baseSnapshot, [learnLog])
            };
          }

          if (forgetIdx === null || baseMoves[forgetIdx] === undefined) {
            return {
              ...baseSnapshot,
              pendingGrowthEvents: resolvedHead.remainingEvents,
              logs: appendSnapshotLogs(baseSnapshot, [`放弃了学习 ${moveName}。`])
            };
          }

          const newMoves = [...baseMoves];
          newMoves[forgetIdx] = newMoveKey;

          return {
            ...baseSnapshot,
            playerTeam: baseTeam.map((monster) => (
              monster.id === monId
                ? { ...monster, moves: newMoves }
                : monster
            )),
            pendingGrowthEvents: resolvedHead.remainingEvents,
            logs: appendSnapshotLogs(baseSnapshot, [`学会了 ${moveName}！`])
          };
        }
      });

      if (commitResult.success) {
        return true;
      }
      if (commitResult.message) {
        addNotification(
          commitResult.message,
          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
        );
      }
      return false;
    }

    addNotification('云端未就绪，暂不能确认技能。', 'error');
    return false;
  }, [
    addLog,
    addNotification,
    commitCloudSnapshot,
    hasLoadedCloudSave,
    hasMatchingPendingGrowthEvent,
    pendingGrowthEvents,
    playerTeam,
    user?.id,
  ]);

  const handleEvolution = useCallback(async (monId, targetId, expectedEvent = null) => {
    const targetBase = getBaseMonsterDefinition(targetId);
    if (!targetBase) {
      await dismissPendingGrowthEvent(expectedEvent || pendingGrowthEvents[0] || null, {
        notificationMessage: '进化事件已失效。'
      });
      return false;
    }
    const targetName = targetBase.name ?? '新形态';
    const effectiveExpectedEvent = expectedEvent || pendingGrowthEvents[0] || null;

    if (user?.id && hasLoadedCloudSave && effectiveExpectedEvent) {
      const commitResult = await commitCloudSnapshot({
        buildSnapshot: (baseSnapshot) => {
          const resolvedHead = resolvePendingGrowthEventHead(baseSnapshot, effectiveExpectedEvent);
          if (resolvedHead.aborted) {
            return resolvedHead.aborted;
          }

          if (
            resolvedHead.headEvent?.type === 'evolutionChoice' &&
            !resolvedHead.headEvent.targetOptions.includes(Number(targetId))
          ) {
            return abortCloudSnapshotCommit('进化分支已变化，请重选。');
          }
          const remainingGrowthEvents = pruneResolvedEvolutionEvents({
            remainingEvents: resolvedHead.remainingEvents,
            resolvedEvent: resolvedHead.headEvent,
            monId
          });

          const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [];
          const baseMon = baseTeam.find((monster) => monster.id === monId);
          if (!baseMon) {
            return {
              ...baseSnapshot,
              pendingGrowthEvents: remainingGrowthEvents
            };
          }
          const evolvedMon = evolveMonsterInstance(baseMon, targetBase);
          const evolutionLearnEvents = buildEvolutionFollowUpLearnMoveEvents({
            mon: evolvedMon,
            targetBase,
            level: resolvedHead.headEvent?.level || evolvedMon?.level,
            remainingEvents: remainingGrowthEvents,
          });
          const nextGrowthEvents = normalizePendingGrowthEvents([
            ...remainingGrowthEvents,
            ...evolutionLearnEvents,
          ]);
          const followUpLogs = evolutionLearnEvents.length > 0
            ? [`${targetName} 似乎还能领悟新的技能。`]
            : [];

          return {
            ...baseSnapshot,
            playerTeam: baseTeam.map((monster) => (
              monster.id === monId ? evolvedMon : monster
            )),
            pendingGrowthEvents: nextGrowthEvents,
            logs: appendSnapshotLogs(baseSnapshot, [`恭喜！${targetName} 进化完成！`, ...followUpLogs])
          };
        }
      });

      if (commitResult.success) {
        addNotification(`进化为 ${targetName}！`, 'info');
        return true;
      }
      if (commitResult.message) {
        addNotification(
          commitResult.message,
          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
        );
      }
      return false;
    }

    addNotification('云端未就绪，暂不能确认进化。', 'error');
    return false;
	  }, [
	    addNotification,
	    commitCloudSnapshot,
	    getBaseMonsterDefinition,
    hasLoadedCloudSave,
    pendingGrowthEvents,
    user?.id,
  ]);

  useEffect(() => {
    const evt = pendingGrowthEvents[0];
    if (!evt) return;

    let shouldDismiss = false;
    let notificationMessage = null;

    if (evt.type === 'evolutionChoice') {
      const mon = playerTeam.find((monster) => monster.id === evt.monId);
      const validTargets = (evt.targetOptions || [])
        .map((targetId) => getBaseMonsterDefinition(targetId))
        .filter(Boolean);
      shouldDismiss = !mon || validTargets.length < 2 || !doesGrowthEventSourceMatchMon(mon, evt);
      if (shouldDismiss) {
        notificationMessage = '进化选择已失效。';
      }
    } else if (evt.type === 'evolution') {
      const mon = playerTeam.find((monster) => monster.id === evt.monId);
      const targetBase = getBaseMonsterDefinition(evt.targetId);
      shouldDismiss = !mon || !targetBase || !doesGrowthEventSourceMatchMon(mon, evt);
      if (shouldDismiss) {
        notificationMessage = '进化事件已失效。';
      }
    } else if (evt.type === 'learnMove') {
      const mon = playerTeam.find((monster) => monster.id === evt.monId);
      const knownMoves = Array.isArray(mon?.moves) ? mon.moves : [];
      const move = MOVES[evt.moveKey];
      shouldDismiss = !mon || !move || knownMoves.includes(evt.moveKey);
      if (shouldDismiss) {
        notificationMessage = !mon
          ? '技能学习已失效。'
          : !move
          ? '技能数据缺失，已跳过。'
          : `${mon.name} 已会 ${move.name}。`;
      }
    }

    if (!shouldDismiss) return;

    const eventKey = getPendingGrowthEventKey(evt) || `${evt.type}:${evt.monId ?? 'unknown'}`;
    if (growthEventDismissInFlightRef.current === eventKey) return;

    growthEventDismissInFlightRef.current = eventKey;
    dismissPendingGrowthEvent(evt, { notificationMessage })
      .finally(() => {
        if (growthEventDismissInFlightRef.current === eventKey) {
          growthEventDismissInFlightRef.current = null;
        }
      });
  }, [dismissPendingGrowthEvent, getBaseMonsterDefinition, pendingGrowthEvents, playerTeam]);

  // 提前到此，让下面 useEffect 的 deps 数组里 activeEnemyMon 不会读到 TDZ 未初始化变量。
  const activePlayerMon = useMemo(() => playerTeam.find((m) => m.id === activePlayerId), [playerTeam, activePlayerId]);
  const activeEnemyMon = useMemo(() => enemyTeam.find((m) => m.id === activeEnemyId), [enemyTeam, activeEnemyId]);
  const battleEscapeRule = useMemo(() => getBattleEscapeRule({
    battleKind,
    battleEnvironment
  }), [battleEnvironment, battleKind]);
  const getEscapeChance = useCallback((playerMon, enemyMon) => {
    const playerLevel = Math.max(1, Math.trunc(Number(playerMon?.level)) || 1);
    const enemyLevel = Math.max(1, Math.trunc(Number(enemyMon?.level)) || 1);
    const levelDelta = playerLevel - enemyLevel;
    const playerSpeed = Math.max(1, getEffectiveBattleStat(playerMon, 'spd') || 1);
    const enemySpeed = Math.max(1, getEffectiveBattleStat(enemyMon, 'spd') || 1);
    const speedRatioDelta = (playerSpeed - enemySpeed) / enemySpeed;
    const speedAdjustment = Math.max(-0.08, Math.min(0.08, speedRatioDelta * 0.12));

    // 等级差决定主要趋势，速度差只做轻微修正，让高等级更容易跑，快攻型也有些体感优势。
    return Math.max(0.3, Math.min(0.97, 0.7 + levelDelta * 0.04 + speedAdjustment));
  }, []);

  useEffect(() => {
    if (view !== 'battle' || battlePhase !== 'active' || turn !== 'player' || gameOver) {
      battleNoMpResolutionKeyRef.current = null;
      return undefined;
    }

    if (!activePlayerMon || !activeEnemyMon || isBattleMonFainted(activePlayerMon)) {
      battleNoMpResolutionKeyRef.current = null;
      return undefined;
    }

    if (getAffordableBattleMoveKeys(activePlayerMon).length > 0) {
      battleNoMpResolutionKeyRef.current = null;
      return undefined;
    }

    if (hasBattleRecoveryPath({
      playerTeam,
      playerInventory,
      canRun: battleEscapeRule.canRun,
    })) {
      battleNoMpResolutionKeyRef.current = null;
      return undefined;
    }

    const resolutionKey = [
      activePlayerMon.id,
      activeEnemyMon.id,
      turn,
      battleKind,
      battlePhase,
    ].join('::');
    if (battleNoMpResolutionKeyRef.current === resolutionKey) return undefined;
    battleNoMpResolutionKeyRef.current = resolutionKey;

    let cancelled = false;
    (async () => {
      await addBattleLogAndWait(
        addLog,
        `${activePlayerMon.name} 已经没有可继续行动的技能，队伍也没有可恢复战斗的手段。`
      );
      if (cancelled) return;
      addNotification(getNoMpBattleDeadlockHint(), 'warning');
      await handleRecoverFromDefeat();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeEnemyMon,
    activePlayerMon,
    addLog,
    addNotification,
    battleEscapeRule.canRun,
    battleKind,
    battlePhase,
    gameOver,
    handleRecoverFromDefeat,
    playerInventory,
    playerTeam,
    turn,
    view,
  ]);

  useEffect(() => {
    if (!hasLoadedCloudSave) return;
    if (view === 'battle' || activeEnemyId) return;
    const defaultActiveId = resolveDefaultActivePlayerId(playerTeam, activePlayerId);
    if (defaultActiveId !== activePlayerId) {
      setActivePlayerId(defaultActiveId);
    }
  }, [activeEnemyId, activePlayerId, hasLoadedCloudSave, playerTeam, view]);

  // ── 成长事件处理结束 ─────────────────────────────────────────────────────────

  const handleGoToLaunchScreen = useCallback(async () => {
    if (isResettingProgress) return;
    if (!user?.id) {
      setSyncError('未登录，无法清空云端进度。');
      return;
    }

    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    setIsOnline(online);
    if (!online) {
      setSyncError('网络已断开，无法清空云端进度。');
      return;
    }

    clearNotifications();
    setIsResettingProgress(true);
    setSaveStatus('manual-saving');
    try {
      const { data, error } = await supabase.rpc('clear_cloud_game_save', {
        p_user_id: user.id
      });

      if (error) throw error;

      const resetResult = typeof data === 'string' ? JSON.parse(data) : (data || {});
      const resetGold = Number.isFinite(Number(resetResult?.goldAfter ?? resetResult?.gold_after))
        ? Number(resetResult?.goldAfter ?? resetResult?.gold_after)
        : DEFAULT_STARTING_GOLD;
      const resetEnergy = Number.isFinite(Number(resetResult?.energyAfter ?? resetResult?.energy_after))
        ? Number(resetResult?.energyAfter ?? resetResult?.energy_after)
        : DEFAULT_STARTING_ENERGY;
      const resetMaxEnergy = Number.isFinite(Number(resetResult?.maxEnergyAfter ?? resetResult?.max_energy_after))
        ? Number(resetResult?.maxEnergyAfter ?? resetResult?.max_energy_after)
        : DEFAULT_MAX_ENERGY;
      const resetResources = {
        gold: resetGold,
        energy: resetEnergy,
        max_energy: resetMaxEnergy,
      };
      const defaults = createDefaultCloudGameData(resetGold);
      userRef.current = {
        ...(userRef.current || user),
        gold: resetGold,
        energy: resetEnergy,
        max_energy: resetMaxEnergy,
      };
      activeBattleEnergyCostRef.current = 0;
      resetLocalBattleEventCompletionState();
      applyCloudGameData(defaults, resetResources);
      latestCloudSnapshotRef.current = createCloudSnapshot(defaults);
      lastSavedSnapshotRef.current = '';
      cloudSaveRevisionRef.current = 0;
      queuedCloudSaveRef.current = null;
      criticalCloudSaveRequestedRef.current = false;
      setLastSavedAt(null);
      setRequiresCloudReload(false);
      setSyncError(null);
      setSaveStatus('idle');
      setHasLoadedCloudSave(true);
      setResetConfirmOpen(false);
      clearNotifications();
    } catch (error) {
      console.error('Error clearing cloud save:', error);
      setSyncError(`清空云端进度失败: ${error.message || '稍后重试。'}`);
      setSaveStatus('error');
    } finally {
      setIsResettingProgress(false);
    }
  }, [applyCloudGameData, clearNotifications, isResettingProgress, resetLocalBattleEventCompletionState, user]);


	  async function finishEnemyDefeat(defeatedMon) {
	    if (!defeatedMon) return;
      gameAudio.playFaint({ side: 'enemy' });
	    await addBattleLogAndWait(addLog, `${defeatedMon.name} 倒下了！`);

    const currentEnemyTeam = enemyTeam.map((mon) => (
      mon.id === defeatedMon.id ? defeatedMon : mon
    ));
	    const remainingEnemies = currentEnemyTeam.filter((m) => m.id !== defeatedMon.id && hasBattleHp(m));
	    if (remainingEnemies.length > 0) {
	      await wait(500);
	      const nextEnemy = remainingEnemies[0];
	      const nextEnemyLog = `对手派出了 ${nextEnemy.name}！`;

	      if (!user?.id || !hasLoadedCloudSave) {
	        addNotification('云端未就绪，战斗暂停。', 'error');
	        return;
	      }

		      const commitResult = await commitCloudSnapshot({
		        buildSnapshot: (baseSnapshot) => {
              const hydratedBattleSnapshot = hydrateCommittedBattleSnapshot(baseSnapshot);
              const phaseBattleEnvironment = hydratedBattleSnapshot.battleEnvironment;
              const battleEventCompletion = hydratedBattleSnapshot.battleEventCompletion;
              const committedSnapshot = hydratedBattleSnapshot.snapshot;
		          const baseEnemyTeam = Array.isArray(committedSnapshot.enemyTeam) ? committedSnapshot.enemyTeam : [];
		          const baseNextEnemy = baseEnemyTeam.find((mon) => mon.id === nextEnemy.id && hasBattleHp(mon));
		          if (!baseNextEnemy) {
	            return abortCloudSnapshotCommit('对手状态已变化，请重新读取。');
	          }
            const baseParticipantIds = Array.isArray(committedSnapshot.participatedMonIds)
              ? committedSnapshot.participatedMonIds
              : [];
            const nextParticipantIds = battleKind === 'trainer'
              ? [...new Set([...baseParticipantIds, committedSnapshot.activePlayerId].filter(Boolean))]
              : [committedSnapshot.activePlayerId].filter(Boolean);

	          return {
	            ...committedSnapshot,
	            activeEnemyId: baseNextEnemy.id,
	            participatedMonIds: nextParticipantIds,
	            turn: 'player',
              battleEnvironment: phaseBattleEnvironment,
              battlePhase: battleKind === 'trainer' ? 'sendout' : 'active',
              battlePhaseData: battleKind === 'trainer'
                ? {
	                  enemyMon: baseNextEnemy,
	                  leadMonId: committedSnapshot.activePlayerId,
	                  message: nextEnemyLog,
	                  sendOutSide: 'enemy',
	                  battleEnvironment: phaseBattleEnvironment,
                    battleEventCompletion
	                }
	                : null,
                battleEventCompletion,
		            logs: appendSnapshotLogs(committedSnapshot, [nextEnemyLog])
		          };
		        }
	      });

	      if (commitResult.success) {
	        return;
	      }

	      if (commitResult.message) {
	        addLog(`战斗阶段推进失败: ${commitResult.message}`);
	        addNotification(
	          commitResult.message,
	          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
	        );
	      }
	      return;
	    }

	    await wait(600);
      const defeatedMonsForReward = battleKind === 'trainer'
        ? currentEnemyTeam.filter((mon) => isBattleMonFainted(mon))
        : [defeatedMon];
      const rewardSummary = await grantBattleRewards(
        defeatedMonsForReward.length > 0 ? defeatedMonsForReward : [defeatedMon],
        battleKind
      );
	    const fallbackVictoryEnemyName = getBattleVictoryDisplayName({
        battleKind,
        battleEnvironment,
        fallbackName: defeatedMon?.name ?? '对手'
      });
      const victoryPhaseData = { enemyName: fallbackVictoryEnemyName, isTrainer: battleKind === 'trainer', rewardSummary };
      let completionNotifications = [];
      let completedBattleEventLockKeys = [];
      let completedBattleEventWorld = null;
      let completedBattleEventMapName = null;
      let completedBattleEventLocalOverrideMeta = null;

	      if (!user?.id || !hasLoadedCloudSave) {
	        addNotification('云端未就绪，暂不能结算胜利。', 'error');
	        return;
	      }

		      const commitResult = await commitCloudSnapshot({
		        buildSnapshot: (baseSnapshot) => {
            const hydratedBattleSnapshot = hydrateCommittedBattleSnapshot(baseSnapshot);
            const committedSnapshot = hydratedBattleSnapshot.snapshot;
	          const completionMeta = getConfiguredBattleCompletionMeta({
              snapshot: committedSnapshot,
              battleEnvironment: hydratedBattleSnapshot.battleEnvironment,
              fallbackMapName: currentMapName
            });
            const eventMeta = completionMeta.eventMeta;
            const battleEventCompletion = completionMeta.battleEventCompletion;
	          const completedMapName = completionMeta.mapName;
	          const completedEvent = completionMeta.event;
	          const completedEventId = completionMeta.eventId;
	          const completedEventType = completionMeta.eventType;
	          const completedEventProps = completionMeta.eventProps;
	          const completedEventRole = completionMeta.eventRole;
	          const isDailyScalingTrainer = isDailyScalingTrainerEvent(completedEventType, completedEventRole);
	          const isDailyVariantBattle = isDailyVariantBattleEvent(completedEventType, completedEventRole);
          const victoryDisplayName = getBattleVictoryDisplayName({
            battleKind,
            battleEnvironment: eventMeta,
            eventProps: completedEventProps,
            fallbackName: fallbackVictoryEnemyName
          });
          let nextWorld = normalizeWorldState(committedSnapshot.world, {
            currentMapName: committedSnapshot.currentMapName,
            playerPos: committedSnapshot.playerPos
          });
          const completionKey = getConfiguredBattleCompletionKey(completedEventType);
          const wasAlreadyCompleted = completedEventType === 'boss'
            ? hasCompletedBossEvent(nextWorld, completedMapName, completedEventId)
            : completionKey
              ? hasMapScopedWorldEventId(nextWorld, completionKey, completedMapName, completedEventId)
              : true;
          const allowRewardSaveCompletionReplay = completedEventType !== 'challenge';
          const wasPreCompletedByCurrentBattleRewardSave =
            allowRewardSaveCompletionReplay &&
            wasAlreadyCompleted &&
            committedSnapshot.view === 'battle' &&
            committedSnapshot.battlePhase !== 'victory' &&
            battleEventCompletion?.mapName === completedMapName &&
            battleEventCompletion?.eventType === completedEventType &&
            battleEventCompletion?.eventId === completedEventId;
          const shouldGrantFirstClearCompletion = !wasAlreadyCompleted || wasPreCompletedByCurrentBattleRewardSave;
          const isRepeatableChallenge = completedEventType === 'challenge';
          const challengeRareUnlockStageBefore = isRepeatableChallenge
            ? getChallengeRareUnlockStage(nextWorld, completedEvent, completedMapName)
            : 0;
          const completedChallengeTeamSize = isRepeatableChallenge
            ? Math.max(
              3,
              Math.min(
                6,
                Array.isArray(committedSnapshot.enemyTeam) && committedSnapshot.enemyTeam.length > 0
                  ? committedSnapshot.enemyTeam.length
                  : currentEnemyTeam.length
              )
            )
            : 0;
          let eventRewardItems = [];
          let completionLogs = [];
          let unlockSummaries = [];

          let shouldRefreshMapProgress = Boolean(completedEventId);

          if (completionKey && completedEventId && shouldGrantFirstClearCompletion) {
            if (!wasAlreadyCompleted) {
              nextWorld = completedEventType === 'boss'
                ? appendCompletedBossEventIds(nextWorld, completedMapName, completedEventId)
                : appendBattleCompletionWorldEventId(nextWorld, completionKey, completedMapName, completedEventId);
            }
            eventRewardItems = normalizeMapRewardItems(completedEventProps.rewardItems);
            completionLogs = getBattleEventCompletionMessages({
              mapName: completedMapName,
              event: completedEvent,
              world: nextWorld,
              challengeRareUnlockBatch: isRepeatableChallenge ? [] : null,
              includeRewardItems: !isRepeatableChallenge
            });
            if (!isRepeatableChallenge) {
              unlockSummaries = buildBattleRareUnlockSummaries({
                mapName: completedMapName,
                event: completedEvent
              });
            }
          }

          if (isDailyVariantBattle && completedEventId) {
            const wasAlreadyDailyCompleted = hasDailyTrainerBattleEvent(nextWorld, completedMapName, completedEventId);
            const wasDailyPreCompletedByCurrentBattleRewardSave =
              wasAlreadyDailyCompleted &&
              committedSnapshot.view === 'battle' &&
              committedSnapshot.battlePhase !== 'victory' &&
              battleEventCompletion?.mapName === completedMapName &&
              battleEventCompletion?.eventType === completedEventType &&
              battleEventCompletion?.eventId === completedEventId;
            if (!wasAlreadyDailyCompleted || wasDailyPreCompletedByCurrentBattleRewardSave) {
              if (!wasAlreadyDailyCompleted) {
                nextWorld = appendDailyTrainerBattleEvent(nextWorld, completedMapName, completedEventId);
              }
              if (isRepeatableChallenge) {
                const challengeRareUnlockStage = challengeRareUnlockStageBefore + 1;
                const challengeRareUnlockBatch = getChallengeRareUnlockBatch(completedEvent, challengeRareUnlockStageBefore);
                const challengeRunRewardItems = getChallengeRunRewardItems({
                  mapName: completedMapName,
                  teamSize: completedChallengeTeamSize
                });
                const mergedChallengeRewardItems = mergeNormalizedMapRewardItems([
                  ...eventRewardItems,
                  ...challengeRunRewardItems
                ]);
                if (mergedChallengeRewardItems.length > 0) {
                  eventRewardItems = mergedChallengeRewardItems;
                  completionLogs.push(`${wasAlreadyCompleted ? '本次试炼奖励' : '试炼奖励'}：${describeMapRewardItems(eventRewardItems).join('、')}。`);
                }
                nextWorld = setTrainerVictoryCount(nextWorld, completedEventId, challengeRareUnlockStage, completedMapName);
                if (challengeRareUnlockBatch.length > 0) {
                  completionLogs.push(buildChallengeRareUnlockMessage({
                    mapName: completedMapName,
                    event: completedEvent,
                    rarePool: challengeRareUnlockBatch,
                    unlockStage: challengeRareUnlockStage
                  }));
                  unlockSummaries = [
                    ...unlockSummaries,
                    ...buildBattleRareUnlockSummaries({
                      mapName: completedMapName,
                      event: completedEvent,
                      rarePoolOverride: challengeRareUnlockBatch,
                      unlockStage: challengeRareUnlockStage,
                      unlockedCount: getChallengeRareUnlockedCountForStage(completedEvent, challengeRareUnlockStage)
                    })
                  ];
                } else if (getChallengeRarePool(completedEvent).length > 0) {
                  completionLogs.push(`${victoryDisplayName}隐藏生态已全部解锁，继续挑战会提升试炼强度。`);
                }
              } else {
                const dailyVictoryCountScope = isDailyScalingTrainer ? completedMapName : null;
                const hasRewardPhaseVictoryCount = getTrainerVictoryCount(nextWorld, completedEventId, dailyVictoryCountScope) > 0;
                if (!wasAlreadyDailyCompleted || !hasRewardPhaseVictoryCount) {
                  nextWorld = incrementTrainerVictoryCount(
                    nextWorld,
                    completedEventId,
                    dailyVictoryCountScope
                  );
                }
              }
              completionLogs.push(getDailyTrainerVictoryText({
                eventName: victoryDisplayName,
                mapName: completedMapName,
                world: nextWorld,
                eventId: completedEventId
              }));
            }
          }

          if (shouldRefreshMapProgress) {
            nextWorld = withUpdatedMapProgress(nextWorld, completedMapName);
          }
          completedBattleEventLockKeys = getBattleEventCompletedLockKeys({
            world: nextWorld,
            mapName: completedMapName,
            eventType: completedEventType,
            eventId: completedEventId,
            eventRole: completedEventRole
          });
          completedBattleEventLocalOverrideMeta = {
            world: nextWorld,
            mapName: completedMapName,
            eventType: completedEventType,
            eventId: completedEventId,
            eventRole: completedEventRole
          };
          completedBattleEventWorld = nextWorld;
          completedBattleEventMapName = completedMapName;
          completionNotifications = completionLogs;
          const finalEventRewardItems = mergeNormalizedMapRewardItems(eventRewardItems);
          const nextInventory = finalEventRewardItems.length > 0
            ? mergeMapRewardItems(committedSnapshot.playerInventory, finalEventRewardItems)
            : committedSnapshot.playerInventory;
          const victoryRewardSummary = {
            ...rewardSummary,
            items: finalEventRewardItems,
            unlocks: unlockSummaries
          };

          return {
	          ...committedSnapshot,
            world: nextWorld,
            playerInventory: nextInventory,
            battleEnvironment: eventMeta && battleEventCompletion
              ? { ...eventMeta, battleEventCompletion }
              : (eventMeta || hydratedBattleSnapshot.battleEnvironment),
	            playerTeam: battleKind === 'trainer'
		            ? (Array.isArray(committedSnapshot.playerTeam) ? committedSnapshot.playerTeam : []).map((mon) => (
		              sanitizeBattleRuntime({ ...mon, currentHp: getMonsterMaxHp(mon), currentMp: getMonsterMaxMp(mon) })
	            ))
		            : committedSnapshot.playerTeam,
	            logs: completionLogs.length > 0 ? appendSnapshotLogs(committedSnapshot, completionLogs) : committedSnapshot.logs,
		          battlePhaseData: {
                ...victoryPhaseData,
                enemyName: victoryDisplayName,
                rewardSummary: victoryRewardSummary,
                battleEnvironment: eventMeta,
                battleEventCompletion
              },
              battleEventCompletion,
		          battlePhase: 'victory'
		        };
        }
      });

      if (commitResult.success) {
        gameAudio.playVictory({ trainer: battleKind === 'trainer' });
        completedBattleEventLockKeys.forEach((key) => completedBattleEventLockRef.current.add(key));
        markCompletedBattleEventLocally(completedBattleEventLocalOverrideMeta || {});
          if (completedBattleEventWorld) {
            const syncedWorld = mergeMonotonicWorldProgress(worldRef.current, completedBattleEventWorld, {
              currentMapName: completedBattleEventMapName || currentMapName,
              playerPos: playerPosRef.current || playerPos
            });
            worldRef.current = syncedWorld;
            setWorld(syncedWorld);
            setMapGrid((prev) => buildMapGridForWorld(completedBattleEventMapName || currentMapName, syncedWorld, prev));
          }
          completionNotifications.forEach((message, index) => {
            addNotification(message, index === 0 ? 'success' : 'info');
          });
	        return;
	      }

	      if (commitResult.message) {
	        addLog(`胜利过场进入失败: ${commitResult.message}`);
	        addNotification(
	          commitResult.message,
	          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
	        );
	      }
		  }

	  // 使用函数声明避免 Hook 依赖数组读取 const 回调时触发暂时性死区。
	  async function handleRecoverFromDefeat() {
	    if (!user?.id || !hasLoadedCloudSave) {
	      addNotification('云端未就绪，暂不能结算失败。', 'error');
	      return false;
	    }

	    const commitResult = await commitCloudSnapshot({
	      buildSnapshot: (baseSnapshot) => ({
	        ...baseSnapshot,
	        battlePhase: 'defeat',
	        battlePhaseData: null,
	        turn: 'player'
	      })
	    });

	    if (commitResult.success) {
	      return true;
	    }

	    if (commitResult.message) {
	      addLog(`失败过场进入失败: ${commitResult.message}`);
	      addNotification(
	        commitResult.message,
	        commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
	      );
	    }
	    return false;
	  }

  const handlePlayerDefeatCheck = useCallback(async (faintedMon, currentPlayerTeam = playerTeam, options = {}) => {
    if (!faintedMon) return false;
    gameAudio.playFaint({ side: 'player' });
    await addBattleLogAndWait(addLog, `${faintedMon.name} 倒下了！`);
    const hasAlive = getAliveBattleBench(currentPlayerTeam, faintedMon.id).length > 0;
    const delayedEnemySendOutMon = options?.delayedEnemySendOutMon
      ? sanitizeBattleRuntime(normalizeMonsterAssetSource(options.delayedEnemySendOutMon))
      : null;
    const delayedEnemySendOutMessage = delayedEnemySendOutMon ? `对手派出了 ${delayedEnemySendOutMon.name}！` : '';
    if (!hasAlive) {
      await addBattleLogAndWait(addLog, '挑战失败。');
      await handleRecoverFromDefeat();
	    } else {
	      if (!user?.id || !hasLoadedCloudSave) {
	        addNotification('云端未就绪，暂不能换人。', 'error');
	        return true;
	      }
	      const commitResult = await commitCloudSnapshot({
	        buildSnapshot: (baseSnapshot) => {
            const hydratedBattleSnapshot = hydrateCommittedBattleSnapshot(baseSnapshot);
            const committedSnapshot = hydratedBattleSnapshot.snapshot;
	          const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [];
	          const baseActiveId = committedSnapshot.activePlayerId || faintedMon.id;
	          const baseActiveMon = baseTeam.find((mon) => mon.id === baseActiveId) || baseTeam.find((mon) => mon.id === faintedMon.id);
	          const hasAvailableBench = getAliveBattleBench(baseTeam, baseActiveMon?.id || baseActiveId).length > 0;
	          if (hasBattleHp(baseActiveMon) || !hasAvailableBench) {
	            return committedSnapshot;
	          }

            const queuedEnemySendOutPhaseData = buildQueuedEnemySendOutPhaseData({
              enemyMon: delayedEnemySendOutMon,
              leadMonId: baseActiveMon?.id || baseActiveId,
              message: delayedEnemySendOutMessage,
              battleEnvironment: hydratedBattleSnapshot.battleEnvironment,
              battleEventCompletion: hydratedBattleSnapshot.battleEventCompletion
            });

	          return {
	            ...committedSnapshot,
	            view: 'team',
              battleEnvironment: hydratedBattleSnapshot.battleEnvironment,
              battleEventCompletion: hydratedBattleSnapshot.battleEventCompletion,
	            battlePhase: queuedEnemySendOutPhaseData ? 'sendout' : 'active',
	            battlePhaseData: queuedEnemySendOutPhaseData,
	            turn: 'player',
	            pendingBattleSwitch: null,
	            logs: appendSnapshotLogs(committedSnapshot, ['请选择一只宝可梦继续战斗。'])
	          };
	        }
	      });
	      if (!commitResult.success) {
	        if (commitResult.message) {
	          addNotification(
	            commitResult.message,
	            commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
	          );
	        }
	        return true;
	      }
	    }
	    return true;
	  }, [addLog, addNotification, battleEnvironment, commitCloudSnapshot, handleRecoverFromDefeat, hasLoadedCloudSave, hydrateCommittedBattleSnapshot, playerTeam, user?.id]);

  const executeBattleMove = useCallback(async ({ attacker, defender, moveKey, attackerSide, canTargetStillAct = false }) => {
    const move = MOVES[moveKey];
    if (!move || !attacker || !defender) return { targetFainted: false };

    const defenderSide = attackerSide === 'player' ? 'enemy' : 'player';
    const attackerName = attackerSide === 'enemy' ? `敌方 ${attacker.name}` : attacker.name;
    const defenderName = defenderSide === 'enemy' ? `敌方 ${defender.name}` : defender.name;
    const playMovePhase = (phase, options = {}) => waitForBattleMoveVisual(moveKey, attackerSide, phase, options);
    const addResultLog = async (message) => {
      if (message) await addBattleLogAndWait(addLog, message);
    };
    let damage = 0;
    let effectiveness = 1;
    let updatedDefender = withBattleRuntimeDefaults(defender);
    let updatedAttacker = withBattleRuntimeDefaults(attacker);
    const playMovePhaseWithResult = async (phase, message, {
      targetSide = null,
      onImpact = null,
      durationMs = getBattleMovePhaseDuration(phase),
      minMs = 860,
      maxMs = 2300,
      extraMs = 130,
    } = {}) => {
      const impactDelayMs = getBattleMoveImpactDelay(phase, durationMs);
      let loggedAtImpact = false;

      await playMovePhase(phase, {
        targetSide,
        durationMs,
        onImpact: () => {
          onImpact?.();
          if (phase === 'heal' || phase === 'drain') {
            gameAudio.playBattleStatus('heal', 'recover');
          } else if (phase === 'secondary' || phase === 'status') {
            gameAudio.playBattleStatus(move?.status || move?.volatileStatus || (move?.category === 'status' ? 'buff' : 'status'));
          } else if (phase === 'hit') {
            gameAudio.playBattleImpact({ effectiveness, didHit: true, outcome: 'hit', targetFainted: updatedDefender?.currentHp <= 0 });
          } else if (phase === 'fizzle') {
            gameAudio.playBattleImpact({ effectiveness, didHit: effectiveness > 0, outcome: 'fizzle', targetFainted: false });
          } else if (phase === 'miss') {
            gameAudio.playBattleImpact({ didHit: false, outcome: 'miss' });
          }
          if (message) {
            addLog(message);
            loggedAtImpact = true;
          }
        }
      });

      if (!message) return;
      if (!loggedAtImpact) {
        await addBattleLogAndWait(addLog, message, { minMs, maxMs, extraMs });
        return;
      }

      const visualReadOverlapMs = Math.max(0, durationMs - impactDelayMs);
      const readDelayMs = getBattleLogReadDelay(message, { minMs, maxMs, extraMs });
      await wait(Math.max(220, readDelayMs - visualReadOverlapMs));
    };
    const markAttackerLastMove = (sourceMon) => {
      const normalized = withBattleRuntimeDefaults(sourceMon);
      const withLastMove = {
        ...normalized,
        volatileStatuses: {
          ...(normalized.volatileStatuses || {}),
          lastMoveKey: moveKey
        }
      };
      updateBattleMonBySide({
        side: attackerSide,
        monId: attacker.id,
        setPlayerTeam,
        setEnemyTeam,
        updater: (mon) => ({
          ...mon,
          volatileStatuses: {
            ...(withLastMove.volatileStatuses || {})
          }
        })
      });
      return withLastMove;
    };

    if (move.charge && !attacker.volatileStatuses?.chargingMove) {
      gameAudio.playBattleMove(move);
      const chargingAttacker = {
        ...withBattleRuntimeDefaults(attacker),
        volatileStatuses: {
          ...(withBattleRuntimeDefaults(attacker).volatileStatuses || {}),
          chargingMove: moveKey
        }
      };
      updateBattleMonBySide({
        side: attackerSide,
        monId: attacker.id,
        setPlayerTeam,
        setEnemyTeam,
        updater: () => chargingAttacker
      });
      await addBattleLogAndWait(addLog, `${attackerName} 正在蓄力，准备使出 ${move.name}！`, {
        minMs: 820,
        maxMs: 1300,
        extraMs: 80,
      });
      return {
        attacker: chargingAttacker,
        targetFainted: false,
        defender: withBattleRuntimeDefaults(defender)
      };
    }

    const attackerAfterCharge = attacker.volatileStatuses?.chargingMove === moveKey
      ? { ...attacker, volatileStatuses: { ...(attacker.volatileStatuses || {}), chargingMove: null } }
      : attacker;
    gameAudio.playBattleMove(move);
    if (attacker.volatileStatuses?.chargingMove === moveKey) {
      updateBattleMonBySide({
        side: attackerSide,
        monId: attacker.id,
        setPlayerTeam,
        setEnemyTeam,
        updater: (mon) => {
          const volatileStatuses = { ...(mon.volatileStatuses || {}) };
          delete volatileStatuses.chargingMove;
          return { ...mon, volatileStatuses };
        }
      });
    }

    if (move.requiresUserStatus && attackerAfterCharge.status !== move.requiresUserStatus) {
      await addResultLog(getUserStatusRequirementFailureMessage(move, attackerName));
      return {
        attacker: withBattleRuntimeDefaults(attackerAfterCharge),
        defender: withBattleRuntimeDefaults(defender),
        targetFainted: false,
        actorFainted: false
      };
    }

    if (move.requiresTargetStatus && defender.status !== move.requiresTargetStatus) {
      await addResultLog(`${move.name} 需要目标处于${STATUS_LABELS[move.requiresTargetStatus] || move.requiresTargetStatus}状态。`);
      return {
        attacker: withBattleRuntimeDefaults(attackerAfterCharge),
        defender: withBattleRuntimeDefaults(defender),
        targetFainted: false,
        actorFainted: false
      };
    }

    if (move.effect === 'mimic') {
      const mimickedMoveKey = getLastExecutedMoveKey(defender);
      if (!mimickedMoveKey || mimickedMoveKey === 'mimic') {
        await addResultLog(`${attackerName} 使用了 ${move.name}，但没有可模仿的技能。`);
        updateBattleMonBySide({
          side: attackerSide,
          monId: attacker.id,
          setPlayerTeam,
          setEnemyTeam,
          updater: (mon) => ({
            ...mon,
            volatileStatuses: {
              ...(mon.volatileStatuses || {}),
              lastMoveKey: moveKey
            }
          })
        });
        return {
          attacker: {
            ...withBattleRuntimeDefaults(attackerAfterCharge),
            volatileStatuses: {
              ...(withBattleRuntimeDefaults(attackerAfterCharge).volatileStatuses || {}),
              lastMoveKey: moveKey
            }
          },
          targetFainted: false,
          defender: withBattleRuntimeDefaults(defender)
        };
      }

      await addResultLog(`${attackerName} 模仿了 ${MOVES[mimickedMoveKey]?.name || mimickedMoveKey}！`);
      const mimicResult = await executeBattleMove({
        attacker: attackerAfterCharge,
        defender,
        moveKey: mimickedMoveKey,
        attackerSide,
        canTargetStillAct
      });
      const attackerAfterMimic = withBattleRuntimeDefaults(mimicResult.attacker || attackerAfterCharge);
      const attackerWithLastMove = {
        ...attackerAfterMimic,
        volatileStatuses: {
          ...(attackerAfterMimic.volatileStatuses || {}),
          lastMoveKey: moveKey
        }
      };
      updateBattleMonBySide({
        side: attackerSide,
        monId: attacker.id,
        setPlayerTeam,
        setEnemyTeam,
        updater: (mon) => ({
          ...mon,
          volatileStatuses: {
            ...(attackerWithLastMove.volatileStatuses || {})
          }
        })
      });
      return {
        attacker: attackerWithLastMove,
        targetFainted: mimicResult.targetFainted,
        defender: mimicResult.defender || withBattleRuntimeDefaults(defender)
      };
    }

    if (move.effect === 'teleport') {
      const attackerWithLastMove = markAttackerLastMove(attackerAfterCharge);
      const teleportEscaped = battleEscapeRule.canRun;
      const message = teleportEscaped
        ? `${attackerName} 使用 ${move.name} 脱离了战斗！`
        : `${attackerName} 使用了 ${move.name}，但${battleEscapeRule.blockedReason || '当前战斗不能脱离。'}`;
      await playMovePhaseWithResult(teleportEscaped ? 'status' : 'fizzle', message, {
        targetSide: attackerSide,
        minMs: 820,
        maxMs: 1700,
        extraMs: 80,
      });
      return {
        attacker: attackerWithLastMove,
        defender: withBattleRuntimeDefaults(defender),
        targetFainted: false,
        actorFainted: false,
        escaped: teleportEscaped,
        escapeSide: attackerSide
      };
    }

    if (!checkMoveHit(move, attackerAfterCharge, defender)) {
      updateBattleMonBySide({
        side: attackerSide,
        monId: attacker.id,
        setPlayerTeam,
        setEnemyTeam,
        updater: (mon) => ({
          ...mon,
          volatileStatuses: {
            ...(mon.volatileStatuses || {}),
            lastMoveKey: moveKey
          }
        })
      });
      await playMovePhaseWithResult('miss', `${attackerName} 的 ${move.name} 没有命中！`, {
        targetSide: defenderSide,
        minMs: 820,
        maxMs: 1800,
        extraMs: 100,
      });
      return {
        attacker: {
          ...withBattleRuntimeDefaults(attackerAfterCharge),
          volatileStatuses: {
            ...(withBattleRuntimeDefaults(attackerAfterCharge).volatileStatuses || {}),
            lastMoveKey: moveKey
          }
        },
        targetFainted: false,
        defender: withBattleRuntimeDefaults(defender)
      };
    }

    updatedAttacker = withBattleRuntimeDefaults(attackerAfterCharge);

    if (move.effect === 'nothing') {
      await playMovePhaseWithResult('status', `${attackerName} 使用了 ${move.name}，但没有任何效果。`, {
        targetSide: attackerSide,
        minMs: 820,
        maxMs: 1700,
        extraMs: 80,
      });
    }

    if (move.category !== 'status' && getDynamicBattleMovePower(moveKey, move, updatedAttacker, updatedDefender) > 0) {
      const hitCount = getBattleMoveHitCount(move);
      let capped = false;
      let resolvedHitCount = 0;
      for (let hitIndex = 0; hitIndex < hitCount && updatedDefender.currentHp > 0; hitIndex += 1) {
        const resolvedPower = getDynamicBattleMovePower(moveKey, move, updatedAttacker, updatedDefender);
        const result = calculateBattleDamage(updatedAttacker, updatedDefender, { ...move, power: resolvedPower });
        const hitDamage = Math.max(0, result.damage);
        damage += hitDamage;
        effectiveness = result.effectiveness;
        capped = capped || result.capped;
        resolvedHitCount += 1;
        updatedDefender = { ...updatedDefender, currentHp: Math.max(0, updatedDefender.currentHp - hitDamage) };
        if (result.effectiveness === 0) break;
      }
      if (damage > 0) {
        const defenderVolatileStatuses = { ...(updatedDefender.volatileStatuses || {}) };
        defenderVolatileStatuses.rageFistHits = Math.min(
          6,
          (Number(defenderVolatileStatuses.rageFistHits) || 0) + resolvedHitCount
        );
        updatedDefender = { ...updatedDefender, volatileStatuses: defenderVolatileStatuses };
      }
      const damageMessages = [];
      const effectivenessMessage = getTypeEffectivenessMessage({
        moveType: move.type,
        defender,
        defenderName,
        effectiveness
      });
      if (effectivenessMessage) damageMessages.push(effectivenessMessage);
      if (capped) damageMessages.push('对手稳住了。');
      if (resolvedHitCount > 1 && damage > 0) damageMessages.push(`连续命中了 ${resolvedHitCount} 次！`);
      if (damage > 0 && damageMessages.length === 0) {
        damageMessages.push(`${defenderName} 受到了伤害！`);
      }
      const damageMessage = damageMessages.join(' ') || `${defenderName} 没有受到伤害。`;
      if (effectiveness > 0 && damage > 0) {
        await playMovePhaseWithResult('hit', damageMessage, {
          targetSide: defenderSide,
          onImpact: () => {
            updateBattleMonBySide({
              side: defenderSide,
              monId: defender.id,
              setPlayerTeam,
              setEnemyTeam,
              updater: (mon) => ({
                ...mon,
                currentHp: updatedDefender.currentHp,
                volatileStatuses: updatedDefender.volatileStatuses
              })
            });
          }
        });
      } else {
        await playMovePhaseWithResult('fizzle', damageMessage, {
          targetSide: defenderSide,
          minMs: 820,
          maxMs: 1900,
          extraMs: 100,
        });
      }
    }

    if (updatedDefender.currentHp > 0 && updatedDefender.status === 'freeze' && damage > 0 && isFreezeThawingMove(move)) {
      updatedDefender = { ...updatedDefender, status: null, statusTurns: 0 };
      await playMovePhaseWithResult('secondary', `${defenderName} 被火焰解冻了！`, {
        targetSide: defenderSide,
        onImpact: () => {
          updateBattleMonBySide({
            side: defenderSide,
            monId: defender.id,
            setPlayerTeam,
            setEnemyTeam,
            updater: (mon) => ({ ...mon, status: null, statusTurns: 0 })
          });
        }
      });
    }

    if (move.effect === 'heal') {
      const nextHp = Math.min(updatedAttacker.maxHp, updatedAttacker.currentHp + Math.max(1, Math.floor(updatedAttacker.maxHp / 2)));
      updatedAttacker = { ...updatedAttacker, currentHp: nextHp };
      await playMovePhaseWithResult('heal', `${attackerName} 恢复了体力！`, {
        targetSide: attackerSide,
        onImpact: () => {
          updateBattleMonBySide({
            side: attackerSide,
            monId: attacker.id,
            setPlayerTeam,
            setEnemyTeam,
            updater: (mon) => ({ ...mon, currentHp: updatedAttacker.currentHp })
          });
        }
      });
    }

    if (move.effect === 'drain' && damage > 0) {
      const nextHp = Math.min(updatedAttacker.maxHp, updatedAttacker.currentHp + Math.max(1, Math.floor(damage / 2)));
      updatedAttacker = { ...updatedAttacker, currentHp: nextHp };
      await playMovePhaseWithResult('secondary', `${attackerName} 吸取了体力！`, {
        targetSide: attackerSide,
        onImpact: () => {
          updateBattleMonBySide({
            side: attackerSide,
            monId: attacker.id,
            setPlayerTeam,
            setEnemyTeam,
            updater: (mon) => ({ ...mon, currentHp: updatedAttacker.currentHp })
          });
        }
      });
    }

    if (move.recoilPercent && damage > 0) {
      const recoilDamage = Math.max(1, Math.floor(damage * (Number(move.recoilPercent) || 0) / 100));
      updatedAttacker = { ...updatedAttacker, currentHp: Math.max(0, updatedAttacker.currentHp - recoilDamage) };
      await playMovePhaseWithResult('secondary', `${attackerName} 受到了反作用力伤害！`, {
        targetSide: attackerSide,
        onImpact: () => {
          updateBattleMonBySide({
            side: attackerSide,
            monId: attacker.id,
            setPlayerTeam,
            setEnemyTeam,
            updater: (mon) => ({ ...mon, currentHp: updatedAttacker.currentHp })
          });
        }
      });
    }

    if (move.selfDestruct) {
      updatedAttacker = { ...updatedAttacker, currentHp: 0 };
      await playMovePhaseWithResult('secondary', `${attackerName} 用尽了全部体力！`, {
        targetSide: attackerSide,
        onImpact: () => {
          updateBattleMonBySide({
            side: attackerSide,
            monId: attacker.id,
            setPlayerTeam,
            setEnemyTeam,
            updater: (mon) => ({ ...mon, currentHp: 0 })
          });
        }
      });
    }

    const canApplySecondaryEffect = move.category === 'status' || move.power <= 0 || effectiveness > 0;
    const secondaryResultPhase = move.category === 'status' || move.power <= 0 ? 'status' : 'secondary';

    if (canApplySecondaryEffect && updatedDefender.currentHp > 0 && move.status && rollChance(move.statusChance ?? (move.category === 'status' ? 100 : 10))) {
      if (updatedDefender.status) {
        await playMovePhaseWithResult(secondaryResultPhase, `${defenderName} 已经处于${STATUS_LABELS[updatedDefender.status] || '异常'}状态。`, {
          targetSide: defenderSide,
          minMs: 820,
          maxMs: 1900,
          extraMs: 100,
        });
      } else if (hasStatusImmunity(updatedDefender, move.status)) {
        await playMovePhaseWithResult(secondaryResultPhase, `${defenderName} 不会陷入${STATUS_LABELS[move.status] || move.status}状态。`, {
          targetSide: defenderSide,
          minMs: 820,
          maxMs: 1900,
          extraMs: 100,
        });
      } else {
        const defenderAfterStatus = applyPrimaryStatusToMon(updatedDefender, move.status);
        updatedDefender = defenderAfterStatus;
        await playMovePhaseWithResult(secondaryResultPhase, getStatusAppliedBattleMessage(defenderName, move.status), {
          targetSide: defenderSide,
          onImpact: () => {
            updateBattleMonBySide({
              side: defenderSide,
              monId: defender.id,
              setPlayerTeam,
              setEnemyTeam,
              updater: (mon) => ({ ...mon, status: defenderAfterStatus.status, statusTurns: defenderAfterStatus.statusTurns })
            });
          }
        });
      }
    }

    const canApplyVolatileStatus = move.volatileStatus !== 'flinch' || canTargetStillAct;
    if (canApplySecondaryEffect && canApplyVolatileStatus && updatedDefender.currentHp > 0 && move.volatileStatus && rollChance(move.volatileChance ?? 100)) {
      if (move.volatileStatus === 'confusion' && updatedDefender.volatileStatuses?.confusion) {
        await playMovePhaseWithResult(secondaryResultPhase, `${defenderName} 已经混乱了。`, {
          targetSide: defenderSide,
          minMs: 820,
          maxMs: 1900,
          extraMs: 100,
        });
      } else {
        const defenderAfterVolatile = applyVolatileStatusToMon(updatedDefender, move.volatileStatus);
        updatedDefender = defenderAfterVolatile;
        await playMovePhaseWithResult(secondaryResultPhase, getStatusAppliedBattleMessage(defenderName, move.volatileStatus), {
          targetSide: defenderSide,
          onImpact: () => {
            updateBattleMonBySide({
              side: defenderSide,
              monId: defender.id,
              setPlayerTeam,
              setEnemyTeam,
              updater: (mon) => ({ ...mon, volatileStatuses: defenderAfterVolatile.volatileStatuses })
            });
          }
        });
      }
    }

    for (const statChange of getMoveStatChanges(move)) {
      if (!canApplySecondaryEffect || updatedDefender.currentHp <= 0 || !rollChance(statChange.chance ?? 100)) continue;
      const statTargetSide = statChange.target === 'attacker' ? attackerSide : defenderSide;
      const targetMon = statChange.target === 'attacker' ? updatedAttacker : updatedDefender;
      const targetName = statChange.target === 'attacker' ? attackerName : defenderName;
      const changedMon = applyStatChangeToMon(targetMon, statChange);
      if (statChange.target === 'attacker') {
        updatedAttacker = changedMon;
      } else {
        updatedDefender = changedMon;
      }
      await playMovePhaseWithResult(secondaryResultPhase, `${targetName} 的${STAT_LABELS[statChange.stat] || statChange.stat}${statChange.stages > 0 ? '提高了' : '降低了'}！`, {
        targetSide: statTargetSide,
        onImpact: () => {
          updateBattleMonBySide({
            side: statTargetSide,
            monId: targetMon.id,
            setPlayerTeam,
            setEnemyTeam,
            updater: (mon) => ({ ...mon, statStages: changedMon.statStages })
          });
        }
      });
    }

    const nextAttackerVolatileStatuses = { ...(updatedAttacker.volatileStatuses || {}) };
    if (moveKey === 'fury_cutter' && damage > 0) {
      nextAttackerVolatileStatuses.furyCutterCount = Math.min(3, (Number(nextAttackerVolatileStatuses.furyCutterCount) || 0) + 1);
    } else {
      delete nextAttackerVolatileStatuses.furyCutterCount;
    }
    if (moveKey === 'rollout' && damage > 0) {
      nextAttackerVolatileStatuses.rolloutCount = Math.min(4, (Number(nextAttackerVolatileStatuses.rolloutCount) || 0) + 1);
    } else {
      delete nextAttackerVolatileStatuses.rolloutCount;
    }
    nextAttackerVolatileStatuses.lastMoveKey = moveKey;
    updatedAttacker = {
      ...updatedAttacker,
      volatileStatuses: nextAttackerVolatileStatuses
    };
    updateBattleMonBySide({
      side: attackerSide,
      monId: attacker.id,
      setPlayerTeam,
      setEnemyTeam,
      updater: (mon) => ({
        ...mon,
        volatileStatuses: {
          ...(updatedAttacker.volatileStatuses || {})
        }
      })
    });

    return {
      attacker: updatedAttacker,
      targetFainted: updatedDefender.currentHp <= 0,
      actorFainted: updatedAttacker.currentHp <= 0,
      defender: updatedDefender
    };
  }, [addLog, battleEscapeRule, waitForBattleMoveVisual]);

  const chooseEnemyAction = useCallback((enemyMon, targetMon = activePlayerMon, options = {}) => {
    const battleLogs = Array.isArray(logsRef.current) ? logsRef.current : [];
    const allowSwitch = options.allowSwitch !== false && !didPlayerJustSwitchOnLastBattleLog(battleLogs, targetMon);
    return chooseTrainerBattleAction({
      enemyTeam,
      activeEnemyMon: enemyMon,
      targetMon,
      battleKind,
      trainerRole: battleEnvironment?.eventRole || 'normal',
      trainerStyle: battleEnvironment?.trainerStyle || null,
      battleLogs,
      allowSwitch
    });
  }, [activePlayerMon, battleEnvironment?.eventRole, battleEnvironment?.trainerStyle, battleKind, enemyTeam]);

  const commitBattleRuntimeCheckpoint = useCallback(async ({
    playerMon = null,
    enemyMon = null,
    turn: nextTurn = 'resolving',
    extraLogs = [],
    snapshotPatch = {}
  } = {}) => {
    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('云端未就绪，战斗暂停。', 'error');
      return false;
    }

    const commitResult = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => {
        const replaceMon = (team, replacement) => {
          if (!replacement || !Array.isArray(team)) return team;
          const normalizedReplacement = normalizeMonsterAssetSource(withBattleRuntimeDefaults(replacement));
          return team.map((mon) => (mon.id === normalizedReplacement.id ? normalizedReplacement : mon));
        };
        const liveLogs = Array.isArray(logsRef.current) && logsRef.current.length > 0
          ? logsRef.current
          : (Array.isArray(baseSnapshot.logs) ? baseSnapshot.logs : []);
        const mergedLogs = extraLogs.length > 0 ? [...liveLogs, ...extraLogs] : liveLogs;

        return {
          ...baseSnapshot,
          ...snapshotPatch,
          playerTeam: replaceMon(baseSnapshot.playerTeam, playerMon),
          enemyTeam: replaceMon(baseSnapshot.enemyTeam, enemyMon),
          turn: nextTurn,
          logs: mergedLogs,
          activeBattleEnergyCost: resolveTrackedActiveBattleEnergyCost(baseSnapshot.activeBattleEnergyCost),
          battleEnergyRefundEligible: false
        };
      }
    });

    if (commitResult.success) {
      criticalCloudSaveRequestedRef.current = false;
      return true;
    }

    if (commitResult.message) {
      addNotification(
        commitResult.message,
        commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
      );
    }
    return false;
  }, [
    addNotification,
    commitCloudSnapshot,
    hasLoadedCloudSave,
    resolveTrackedActiveBattleEnergyCost,
    user?.id
  ]);

  const runEnemyTrainerSwitch = useCallback(async ({ enemyMon, nextEnemy, playerMon }) => {
    if (battleKind !== 'trainer' || !enemyMon || !nextEnemy || enemyMon.id === nextEnemy.id) {
      return { switched: false, enemy: enemyMon };
    }
    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('云端未就绪，对手换人暂停。', 'error');
      return { switched: false, enemy: enemyMon, commitFailed: true };
    }

    const recallLog = `对手收回了 ${enemyMon.name}！`;
    const sendLog = `对手派出了 ${nextEnemy.name}！`;
    await addBattleLogAndWait(addLog, recallLog, { minMs: 520, maxMs: 980, extraMs: 40 });
    setSwitchVisualEvent({
      id: `enemy-switch-recall-${enemyMon.id}-${nextEnemy.id}-${Date.now()}`,
      side: 'enemy',
      phase: 'recall',
      monster: enemyMon,
      durationMs: BATTLE_SWITCH_RECALL_MS
    });
    await wait(BATTLE_SWITCH_RECALL_MS);

	    const commitResult = await commitCloudSnapshot({
	      buildSnapshot: (baseSnapshot) => {
	        const hydratedBattleSnapshot = hydrateCommittedBattleSnapshot(baseSnapshot);
	        const phaseBattleEnvironment = hydratedBattleSnapshot.battleEnvironment;
	        const battleEventCompletion = hydratedBattleSnapshot.battleEventCompletion;
	        const committedSnapshot = hydratedBattleSnapshot.snapshot;
	        const baseEnemyTeam = Array.isArray(committedSnapshot.enemyTeam) ? committedSnapshot.enemyTeam : [];
	        const baseNextEnemy = baseEnemyTeam.find((mon) => mon.id === nextEnemy.id && hasBattleHp(mon));
        if (!baseNextEnemy) {
          return abortCloudSnapshotCommit('对手状态已变化，请重新读取。');
        }
        const liveLogs = Array.isArray(logsRef.current) && logsRef.current.length > 0
          ? logsRef.current
          : appendSnapshotLogs(committedSnapshot, [recallLog]);
        const nextLogs = liveLogs[liveLogs.length - 1] === sendLog
          ? liveLogs
          : [...liveLogs, sendLog];
        return {
          ...committedSnapshot,
          activeEnemyId: baseNextEnemy.id,
          battleEnvironment: phaseBattleEnvironment,
          turn: 'player',
          battlePhase: 'sendout',
          battlePhaseData: {
            enemyMon: baseNextEnemy,
	            leadMonId: committedSnapshot.activePlayerId,
	            message: sendLog,
	            sendOutSide: 'enemy',
	            battleEnvironment: phaseBattleEnvironment,
              battleEventCompletion
	          },
            battleEventCompletion,
	          activeBattleEnergyCost: resolveTrackedActiveBattleEnergyCost(baseSnapshot.activeBattleEnergyCost),
          battleEnergyRefundEligible: false,
          logs: nextLogs
        };
      }
    });

    if (!commitResult.success) {
      setSwitchVisualEvent(null);
      if (commitResult.message) {
        addLog(`对手换人失败: ${commitResult.message}`);
        addNotification(
          commitResult.message,
          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
        );
      }
      return { switched: false, enemy: enemyMon, commitFailed: true };
    }

	    const runtimeNextEnemy = withBattleRuntimeDefaults(nextEnemy);
      const battleEventCompletion = normalizeBattleEventCompletion(
        battleEnvironment?.battleEventCompletion,
        battleEnvironment
      );
	    setActiveEnemyId(nextEnemy.id);
	    setBattlePhase('sendout');
	    setBattlePhaseData({
	      enemyMon: runtimeNextEnemy,
	      leadMonId: playerMon?.id || activePlayerId,
	      message: sendLog,
	      sendOutSide: 'enemy',
	      battleEnvironment: battleEventCompletion
          ? { ...battleEnvironment, battleEventCompletion }
          : battleEnvironment,
        battleEventCompletion
	    });
    setSwitchVisualEvent(null);
    await wait(BATTLE_SENDOUT_OVERLAY_MS + 120);
    return { switched: true, enemy: runtimeNextEnemy, player: playerMon };
  }, [
    activePlayerId,
    addLog,
    addNotification,
    battleEnvironment,
    battleKind,
    commitCloudSnapshot,
    hasLoadedCloudSave,
    hydrateCommittedBattleSnapshot,
    resolveTrackedActiveBattleEnergyCost,
    user?.id
  ]);

  const runEnemyAction = useCallback(async ({ enemyMon, playerMon, moveKey, canTargetStillAct = false }) => {
    if (!enemyMon || !playerMon || !moveKey) return { actorFainted: false, targetFainted: false };
    const move = MOVES[moveKey];
    if (!move) return { actorFainted: false, targetFainted: false };

    const turnStart = resolveTurnStart(enemyMon, moveKey);
    const resolvedEnemyAfterTurnStart = turnStart.events.length > 0
      ? (await playBattleStatusEvents({
        side: 'enemy',
        monId: enemyMon.id,
        events: turnStart.events
      })) || turnStart.mon
      : turnStart.mon;
    if (turnStart.fainted) {
      const checkpointReady = await commitBattleRuntimeCheckpoint({
        enemyMon: resolvedEnemyAfterTurnStart,
        playerMon
      });
      if (!checkpointReady) {
        return {
          actorFainted: true,
          targetFainted: false,
          commitFailed: true,
          attacker: resolvedEnemyAfterTurnStart,
          defender: playerMon
        };
      }
      await finishEnemyDefeat(resolvedEnemyAfterTurnStart);
      return {
        actorFainted: true,
        targetFainted: false,
        attacker: resolvedEnemyAfterTurnStart,
        defender: playerMon
      };
    }
    if (!turnStart.canAct) {
      const checkpointReady = await commitBattleRuntimeCheckpoint({
        enemyMon: resolvedEnemyAfterTurnStart,
        playerMon
      });
      if (!checkpointReady) {
        return {
          actorFainted: false,
          targetFainted: false,
          commitFailed: true,
          attacker: resolvedEnemyAfterTurnStart,
          defender: playerMon
        };
      }
      return {
        actorFainted: false,
        targetFainted: false,
        attacker: resolvedEnemyAfterTurnStart,
        defender: playerMon
      };
    }

    const userStatusRequirementMessage = getUserStatusRequirementFailureMessage(move, resolvedEnemyAfterTurnStart.name);
    if (userStatusRequirementMessage && resolvedEnemyAfterTurnStart.status !== move.requiresUserStatus) {
      await addBattleLogAndWait(addLog, userStatusRequirementMessage);
      const checkpointReady = await commitBattleRuntimeCheckpoint({
        enemyMon: resolvedEnemyAfterTurnStart,
        playerMon
      });
      if (!checkpointReady) {
        return {
          actorFainted: false,
          targetFainted: false,
          commitFailed: true,
          attacker: resolvedEnemyAfterTurnStart,
          defender: playerMon
        };
      }
      return {
        actorFainted: false,
        targetFainted: false,
        attacker: resolvedEnemyAfterTurnStart,
        defender: playerMon
      };
    }

    const isChargingRelease = resolvedEnemyAfterTurnStart.volatileStatuses?.chargingMove === moveKey;
    const moveCost = getMoveMpCost(move);
    const nextEnemyAfterCost = {
      ...resolvedEnemyAfterTurnStart,
      currentMp: isChargingRelease ? resolvedEnemyAfterTurnStart.currentMp : Math.max(0, resolvedEnemyAfterTurnStart.currentMp - moveCost)
    };
    setEnemyTeam((prev) => prev.map((m) => m.id === enemyMon.id ? { ...m, currentMp: nextEnemyAfterCost.currentMp } : m));
    addLog(getBattleMoveUseMessage(`敌方 ${resolvedEnemyAfterTurnStart.name}`, move.name, isChargingRelease));

    const result = await executeBattleMove({
      attacker: nextEnemyAfterCost,
      defender: playerMon,
      moveKey,
      attackerSide: 'enemy',
      canTargetStillAct
    });
    const committedEnemy = withBattleRuntimeDefaults(result.attacker || nextEnemyAfterCost);
    const committedPlayer = withBattleRuntimeDefaults(result.defender || playerMon);
    const checkpointReady = await commitBattleRuntimeCheckpoint({
      enemyMon: committedEnemy,
      playerMon: committedPlayer,
      turn: result.escaped ? 'player' : 'resolving',
      snapshotPatch: result.escaped
        ? {
          battlePhase: 'escape',
          battlePhaseData: {
            reason: 'teleport',
            side: result.escapeSide || 'enemy',
            actorName: committedEnemy.name
          }
        }
        : {}
    });
    if (!checkpointReady) {
      return {
        actorFainted: result.actorFainted,
        targetFainted: result.targetFainted,
        commitFailed: true,
        attacker: committedEnemy,
        defender: committedPlayer
      };
    }
    if (result.escaped) {
      setBattlePhase('escape');
      setBattlePhaseData({
        reason: 'teleport',
        side: result.escapeSide || 'enemy',
        actorName: committedEnemy.name
      });
      setTurn('player');
      setBattleEnergyRefundEligible(false);
    }

    return {
      actorFainted: result.actorFainted,
      targetFainted: result.targetFainted,
      escaped: Boolean(result.escaped),
      escapeSide: result.escapeSide,
      attacker: committedEnemy,
      defender: committedPlayer
    };
  }, [addLog, commitBattleRuntimeCheckpoint, executeBattleMove, finishEnemyDefeat, handlePlayerDefeatCheck, playBattleStatusEvents, playerTeam]);

  const runPlayerAction = useCallback(async ({ playerMon, enemyMon, moveKey, canTargetStillAct = false }) => {
    if (!playerMon || !enemyMon || !moveKey) return { actorFainted: false, targetFainted: false };
    const move = MOVES[moveKey];
    if (!move) return { actorFainted: false, targetFainted: false };
    if (isBattleMonFainted(playerMon)) {
      await handlePlayerDefeatCheck(playerMon);
      return { actorFainted: true, targetFainted: false };
    }

    const turnStart = resolveTurnStart(playerMon, moveKey);
    const resolvedPlayerAfterTurnStart = turnStart.events.length > 0
      ? (await playBattleStatusEvents({
        side: 'player',
        monId: playerMon.id,
        events: turnStart.events
      })) || turnStart.mon
      : turnStart.mon;
    if (turnStart.fainted) {
      const checkpointReady = await commitBattleRuntimeCheckpoint({
        playerMon: resolvedPlayerAfterTurnStart,
        enemyMon
      });
      if (!checkpointReady) {
        return {
          actorFainted: true,
          targetFainted: false,
          commitFailed: true,
          attacker: resolvedPlayerAfterTurnStart,
          defender: enemyMon
        };
      }
      await handlePlayerDefeatCheck(resolvedPlayerAfterTurnStart);
      return {
        actorFainted: true,
        targetFainted: false,
        attacker: resolvedPlayerAfterTurnStart,
        defender: enemyMon
      };
    }
    if (!turnStart.canAct) {
      const checkpointReady = await commitBattleRuntimeCheckpoint({
        playerMon: resolvedPlayerAfterTurnStart,
        enemyMon
      });
      if (!checkpointReady) {
        return {
          actorFainted: false,
          targetFainted: false,
          commitFailed: true,
          attacker: resolvedPlayerAfterTurnStart,
          defender: enemyMon
        };
      }
      return {
        actorFainted: false,
        targetFainted: false,
        attacker: resolvedPlayerAfterTurnStart,
        defender: enemyMon
      };
    }

    const userStatusRequirementMessage = getUserStatusRequirementFailureMessage(move, resolvedPlayerAfterTurnStart.name);
    if (userStatusRequirementMessage && resolvedPlayerAfterTurnStart.status !== move.requiresUserStatus) {
      await addBattleLogAndWait(addLog, userStatusRequirementMessage);
      const checkpointReady = await commitBattleRuntimeCheckpoint({
        playerMon: resolvedPlayerAfterTurnStart,
        enemyMon
      });
      if (!checkpointReady) {
        return {
          actorFainted: false,
          targetFainted: false,
          commitFailed: true,
          attacker: resolvedPlayerAfterTurnStart,
          defender: enemyMon
        };
      }
      return {
        actorFainted: false,
        targetFainted: false,
        attacker: resolvedPlayerAfterTurnStart,
        defender: enemyMon
      };
    }

    const isChargingRelease = resolvedPlayerAfterTurnStart.volatileStatuses?.chargingMove === moveKey;
    const moveCost = getMoveMpCost(move);
    const nextMp = isChargingRelease ? resolvedPlayerAfterTurnStart.currentMp : Math.max(0, resolvedPlayerAfterTurnStart.currentMp - moveCost);
    const actingPlayer = { ...resolvedPlayerAfterTurnStart, currentMp: nextMp };
    setPlayerTeam((prev) => prev.map((m) => {
      if (m.id !== playerMon.id) return m;
      return { ...m, currentMp: nextMp };
    }));
    addLog(getBattleMoveUseMessage(resolvedPlayerAfterTurnStart.name, move.name, isChargingRelease));

    const result = await executeBattleMove({
      attacker: actingPlayer,
      defender: enemyMon,
      moveKey,
      attackerSide: 'player',
      canTargetStillAct
    });
    const committedPlayer = withBattleRuntimeDefaults(result.attacker || actingPlayer);
    const committedEnemy = withBattleRuntimeDefaults(result.defender || enemyMon);
    const checkpointReady = await commitBattleRuntimeCheckpoint({
      playerMon: committedPlayer,
      enemyMon: committedEnemy,
      turn: result.escaped ? 'player' : 'resolving',
      snapshotPatch: result.escaped
        ? {
          battlePhase: 'escape',
          battlePhaseData: {
            reason: 'teleport',
            side: result.escapeSide || 'player',
            actorName: committedPlayer.name
          }
        }
        : {}
    });
    if (!checkpointReady) {
      return {
        actorFainted: result.actorFainted,
        targetFainted: result.targetFainted,
        commitFailed: true,
        attacker: committedPlayer,
        defender: committedEnemy
      };
    }
    if (result.escaped) {
      setBattlePhase('escape');
      setBattlePhaseData({
        reason: 'teleport',
        side: result.escapeSide || 'player',
        actorName: committedPlayer.name
      });
      setTurn('player');
      setBattleEnergyRefundEligible(false);
    }

    return {
      actorFainted: result.actorFainted,
      targetFainted: result.targetFainted,
      escaped: Boolean(result.escaped),
      escapeSide: result.escapeSide,
      attacker: committedPlayer,
      defender: committedEnemy
    };
  }, [addLog, commitBattleRuntimeCheckpoint, executeBattleMove, finishEnemyDefeat, handlePlayerDefeatCheck, playBattleStatusEvents, playerTeam]);

  const runEndOfTurnStatusResolution = useCallback(async ({ side, mon, opposingMon }) => {
    if (!mon) {
      return { mon, fainted: false, commitFailed: false };
    }

    const endOfTurn = resolveTurnEnd(mon);
    if (!endOfTurn.events.length) {
      return {
        mon: endOfTurn.mon || withBattleRuntimeDefaults(mon),
        fainted: Boolean(endOfTurn.fainted),
        commitFailed: false
      };
    }

    const resolvedMon = (await playBattleStatusEvents({
      side,
      monId: mon.id,
      events: endOfTurn.events
    })) || endOfTurn.mon || withBattleRuntimeDefaults(mon);

    const resolvedSelf = withBattleRuntimeDefaults(resolvedMon);
    const resolvedOpponent = withBattleRuntimeDefaults(opposingMon);
    const checkpointReady = await commitBattleRuntimeCheckpoint({
      playerMon: side === 'player' ? resolvedSelf : resolvedOpponent,
      enemyMon: side === 'enemy' ? resolvedSelf : resolvedOpponent,
    });

    if (!checkpointReady) {
      return {
        mon: resolvedSelf,
        fainted: resolvedSelf.currentHp <= 0,
        commitFailed: true
      };
    }

    return { mon: resolvedSelf, fainted: resolvedSelf.currentHp <= 0, commitFailed: false };
  }, [
    commitBattleRuntimeCheckpoint,
    playBattleStatusEvents
  ]);

  const resolveTurnAfterFaint = useCallback(async ({
    playerMon = null,
    enemyMon = null,
    playerFainted = false,
    enemyFainted = false,
  } = {}) => {
    let latestPlayer = playerMon ? withBattleRuntimeDefaults(playerMon) : null;
    let latestEnemy = enemyMon ? withBattleRuntimeDefaults(enemyMon) : null;
    let pendingPlayerFaint = Boolean(playerFainted || latestPlayer?.currentHp <= 0);
    let pendingEnemyFaint = Boolean(enemyFainted || latestEnemy?.currentHp <= 0);

    const finalizeResolvedFaints = async () => {
      if (pendingPlayerFaint && pendingEnemyFaint && latestPlayer && latestEnemy) {
        const latestPlayerTeam = playerTeam.map((teamMon) => (
          teamMon.id === latestPlayer.id ? latestPlayer : teamMon
        ));
        const playerHasBench = getAliveBattleBench(latestPlayerTeam, latestPlayer.id).length > 0;
        const latestEnemyTeam = enemyTeam.map((teamMon) => (
          teamMon.id === latestEnemy.id ? latestEnemy : teamMon
        ));
        const enemyHasBench = latestEnemyTeam.some((teamMon) => teamMon.id !== latestEnemy.id && hasBattleHp(teamMon));

        if (!playerHasBench) {
          await handlePlayerDefeatCheck(latestPlayer, latestPlayerTeam);
        } else if (!enemyHasBench) {
          await finishEnemyDefeat(latestEnemy);
        } else {
          const nextEnemy = latestEnemyTeam.find((teamMon) => teamMon.id !== latestEnemy.id && hasBattleHp(teamMon)) || null;
          await handlePlayerDefeatCheck(latestPlayer, latestPlayerTeam, {
            delayedEnemySendOutMon: nextEnemy
          });
        }

        return {
          commitFailed: false,
          playerMon: latestPlayer,
          enemyMon: latestEnemy,
          playerFainted: true,
          enemyFainted: true
        };
      }

      if (pendingEnemyFaint && latestEnemy) {
        await finishEnemyDefeat(latestEnemy);
        return {
          commitFailed: false,
          playerMon: latestPlayer,
          enemyMon: latestEnemy,
          playerFainted: pendingPlayerFaint,
          enemyFainted: true
        };
      }

      if (pendingPlayerFaint && latestPlayer) {
        const latestPlayerTeam = playerTeam.map((teamMon) => (
          teamMon.id === latestPlayer.id ? latestPlayer : teamMon
        ));
        await handlePlayerDefeatCheck(latestPlayer, latestPlayerTeam);
        return {
          commitFailed: false,
          playerMon: latestPlayer,
          enemyMon: latestEnemy,
          playerFainted: true,
          enemyFainted: pendingEnemyFaint
        };
      }

      return {
        commitFailed: false,
        playerMon: latestPlayer,
        enemyMon: latestEnemy,
        playerFainted: false,
        enemyFainted: false
      };
    };

    if (!pendingPlayerFaint && !pendingEnemyFaint && latestPlayer && latestEnemy) {
      const endOfTurnOrder = determineBattleEndOfTurnSideOrder(latestPlayer, latestEnemy);
      for (const side of endOfTurnOrder) {
        if (side === 'player' && !pendingPlayerFaint && latestPlayer.currentHp > 0) {
          const playerEndResult = await runEndOfTurnStatusResolution({
            side: 'player',
            mon: latestPlayer,
            opposingMon: latestEnemy
          });
          if (playerEndResult.commitFailed) {
            return { commitFailed: true };
          }
          latestPlayer = playerEndResult.mon || latestPlayer;
          pendingPlayerFaint = playerEndResult.fainted || latestPlayer.currentHp <= 0;
        }

        if (side === 'enemy' && !pendingEnemyFaint && latestEnemy.currentHp > 0) {
          const enemyEndResult = await runEndOfTurnStatusResolution({
            side: 'enemy',
            mon: latestEnemy,
            opposingMon: latestPlayer
          });
          if (enemyEndResult.commitFailed) {
            return { commitFailed: true };
          }
          latestEnemy = enemyEndResult.mon || latestEnemy;
          pendingEnemyFaint = enemyEndResult.fainted || latestEnemy.currentHp <= 0;
        }
      }

      return finalizeResolvedFaints();
    }

    if (!pendingPlayerFaint && latestPlayer) {
      const playerEndResult = await runEndOfTurnStatusResolution({
        side: 'player',
        mon: latestPlayer,
        opposingMon: latestEnemy
      });
      if (playerEndResult.commitFailed) {
        return { commitFailed: true };
      }
      latestPlayer = playerEndResult.mon || latestPlayer;
      pendingPlayerFaint = playerEndResult.fainted || latestPlayer.currentHp <= 0;
    }

    if (!pendingEnemyFaint && latestEnemy) {
      const enemyEndResult = await runEndOfTurnStatusResolution({
        side: 'enemy',
        mon: latestEnemy,
        opposingMon: latestPlayer
      });
      if (enemyEndResult.commitFailed) {
        return { commitFailed: true };
      }
      latestEnemy = enemyEndResult.mon || latestEnemy;
      pendingEnemyFaint = enemyEndResult.fainted || latestEnemy.currentHp <= 0;
    }

    return finalizeResolvedFaints();
  }, [enemyTeam, finishEnemyDefeat, handlePlayerDefeatCheck, playerTeam, runEndOfTurnStatusResolution]);

  const handleTurn = useCallback(async (moveKey) => {
    if (turn !== 'player' || gameOver) return;
    if (battleTurnInFlightRef.current) return;
    battleTurnInFlightRef.current = true;
    let restorePlayerTurn = null;

    try {
      const currentPlayer = withBattleRuntimeDefaults(activePlayerMon);
      const currentEnemy = withBattleRuntimeDefaults(activeEnemyMon);
      if (!currentPlayer || !currentEnemy) return;

      if (isBattleMonFainted(currentPlayer)) {
        const aliveBench = getAliveBattleBench(playerTeam, currentPlayer.id);
        if (aliveBench.length === 0) {
          await handlePlayerDefeatCheck(currentPlayer, playerTeam);
          return;
        }
        if (!user?.id || !hasLoadedCloudSave) {
          addNotification('云端未就绪，暂不能换人。', 'error');
          return;
        }

        const forceSwitchMessage = '宝可梦倒下了，请选择下一只。';
        const commitResult = await commitCloudSnapshot({
          buildSnapshot: (baseSnapshot) => {
            const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [];
            const baseActiveId = baseSnapshot.activePlayerId || currentPlayer.id;
            const baseActiveMon = baseTeam.find((mon) => mon.id === baseActiveId);
            const hasAvailableBench = getAliveBattleBench(baseTeam, baseActiveId).length > 0;
            if (hasBattleHp(baseActiveMon) || !hasAvailableBench) {
              return baseSnapshot;
            }

            return {
              ...baseSnapshot,
              view: 'team',
              battlePhase: 'active',
              battlePhaseData: null,
              turn: 'player',
              pendingBattleSwitch: null,
              logs: appendSnapshotLogs(baseSnapshot, [forceSwitchMessage])
            };
          }
        });

        if (!commitResult.success && commitResult.message) {
          addNotification(
            commitResult.message,
            commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
          );
        }
        return;
      }

      const chargingMove = currentPlayer.volatileStatuses?.chargingMove;
      const playerMoveKey = chargingMove && MOVES[chargingMove] ? chargingMove : moveKey;
      const playerMove = MOVES[playerMoveKey];
      const isChargingRelease = playerMoveKey === chargingMove;
      const playerMoveCost = getMoveMpCost(playerMove);

      if (!playerMove) return;
      if (!isChargingRelease && currentPlayer.currentMp < playerMoveCost) {
        const shortageMessage = getAffordableBattleMoveKeys(currentPlayer).length === 0
          ? getNoMpBattleHint(currentPlayer)
          : getMoveMpShortageHint(currentPlayer, playerMove);
        await addBattleLogAndWait(addLog, shortageMessage);
        addNotification(shortageMessage, 'warning');
        return;
      }
      if (!user?.id || !hasLoadedCloudSave) {
        addNotification('云端未就绪，战斗回合暂停。', 'error');
        return;
      }

      restorePlayerTurn = async (logMessage = null) => {
      const commitResult = await commitCloudSnapshot({
        buildSnapshot: (baseSnapshot) => ({
          ...baseSnapshot,
          turn: 'player',
          activeBattleEnergyCost: resolveTrackedActiveBattleEnergyCost(baseSnapshot.activeBattleEnergyCost),
          battleEnergyRefundEligible: false,
          logs: logMessage ? appendSnapshotLogs(baseSnapshot, [logMessage]) : baseSnapshot.logs
        })
      });
      if (!commitResult.success && commitResult.message) {
        addNotification(
          commitResult.message,
          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
        );
      }
    };

    const resolvingCommit = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => ({
        ...baseSnapshot,
        turn: 'resolving',
        activeBattleEnergyCost: resolveTrackedActiveBattleEnergyCost(baseSnapshot.activeBattleEnergyCost),
        battleEnergyRefundEligible: false
      })
    });
    if (!resolvingCommit.success) {
      if (resolvingCommit.message) {
        addNotification(
          resolvingCommit.message,
          resolvingCommit.notificationType || (resolvingCommit.requiresReload ? 'error' : 'warning')
        );
      }
      return;
    }

      const enemyAction = chooseEnemyAction(currentEnemy, currentPlayer);
      if (enemyAction.type === 'switch' && enemyAction.target) {
        const intentMessage = getEnemyAiSwitchIntentMessage(enemyAction);
        if (intentMessage) {
          await addBattleLogAndWait(addLog, intentMessage, {
            minMs: 620,
            maxMs: 1120,
            extraMs: 60,
          });
        }
        const switchResult = await runEnemyTrainerSwitch({
          enemyMon: currentEnemy,
          nextEnemy: enemyAction.target,
          playerMon: currentPlayer
        });
        if (switchResult.commitFailed) return;
        const switchedEnemy = switchResult.enemy || enemyAction.target;
        const playerResult = await runPlayerAction({
          playerMon: currentPlayer,
          enemyMon: switchedEnemy,
          moveKey: playerMoveKey,
          canTargetStillAct: false
        });
        if (playerResult.commitFailed) return;
        if (playerResult.escaped) return;
        const postSwitchTurnResult = await resolveTurnAfterFaint({
          playerMon: playerResult.attacker || currentPlayer,
          enemyMon: playerResult.defender || switchedEnemy,
          playerFainted: playerResult.actorFainted,
          enemyFainted: playerResult.targetFainted
        });
        if (postSwitchTurnResult.commitFailed || postSwitchTurnResult.playerFainted || postSwitchTurnResult.enemyFainted) return;
        if (!gameOver) {
          await restorePlayerTurn();
        }
        return;
      }

      const enemyMoveKey = enemyAction.moveKey;
      if (!enemyMoveKey) {
        const playerResult = await runPlayerAction({
          playerMon: currentPlayer,
          enemyMon: currentEnemy,
          moveKey: playerMoveKey
        });
        if (playerResult.commitFailed) return;
        if (playerResult.escaped) return;
        const noEnemyActionTurnResult = await resolveTurnAfterFaint({
          playerMon: playerResult.attacker || currentPlayer,
          enemyMon: playerResult.defender || currentEnemy,
          playerFainted: playerResult.actorFainted,
          enemyFainted: playerResult.targetFainted
        });
        if (!noEnemyActionTurnResult.commitFailed && !noEnemyActionTurnResult.playerFainted && !noEnemyActionTurnResult.enemyFainted) {
          if (!gameOver) {
            await restorePlayerTurn(`敌方 ${currentEnemy.name} 技能值不足，无法行动!`);
          }
        }
        return;
      }

      const actionOrder = determineBattleActionOrder(currentPlayer, currentEnemy, playerMove, MOVES[enemyMoveKey]);
      await addBattleLogAndWait(addLog, getBattleActionOrderReason(currentPlayer, currentEnemy, playerMove, MOVES[enemyMoveKey], actionOrder), {
        minMs: 760,
        maxMs: 1500,
        extraMs: 90,
      });
      let latestPlayer = currentPlayer;
      let latestEnemy = currentEnemy;
      let playerFaintedThisTurn = false;
      let enemyFaintedThisTurn = false;
      let battleEscapedThisTurn = false;

      for (const side of actionOrder) {
        if (side === 'player') {
          const playerResult = await runPlayerAction({
            playerMon: latestPlayer,
            enemyMon: latestEnemy,
            moveKey: playerMoveKey,
            canTargetStillAct: actionOrder.indexOf('enemy') > actionOrder.indexOf('player')
          });
          if (playerResult.commitFailed) return;
          if (playerResult.escaped) {
            battleEscapedThisTurn = true;
            break;
          }
          latestPlayer = playerResult.attacker || latestPlayer;
          latestEnemy = playerResult.defender || latestEnemy;
          if (playerResult.actorFainted || playerResult.targetFainted) {
            playerFaintedThisTurn = playerResult.actorFainted;
            enemyFaintedThisTurn = playerResult.targetFainted;
            break;
          }
        } else {
          const enemyResult = await runEnemyAction({
            enemyMon: latestEnemy,
            playerMon: latestPlayer,
            moveKey: enemyMoveKey,
            canTargetStillAct: actionOrder.indexOf('player') > actionOrder.indexOf('enemy')
          });
          if (enemyResult.commitFailed) return;
          if (enemyResult.escaped) {
            battleEscapedThisTurn = true;
            break;
          }
          latestEnemy = enemyResult.attacker || latestEnemy;
          latestPlayer = enemyResult.defender || latestPlayer;
          if (enemyResult.actorFainted || enemyResult.targetFainted) {
            enemyFaintedThisTurn = enemyResult.actorFainted;
            playerFaintedThisTurn = enemyResult.targetFainted;
            break;
          }
        }
      }
      if (battleEscapedThisTurn) return;

      const postTurnResult = await resolveTurnAfterFaint({
        playerMon: latestPlayer,
        enemyMon: latestEnemy,
        playerFainted: playerFaintedThisTurn,
        enemyFainted: enemyFaintedThisTurn
      });
      if (postTurnResult.commitFailed || postTurnResult.playerFainted || postTurnResult.enemyFainted) return;

      if (!gameOver) {
        await restorePlayerTurn();
      }
    } catch (error) {
      console.error('[Battle] turn resolution failed:', error);
      if (!gameOver) {
        await restorePlayerTurn?.('战斗结算出现异常，已恢复操作。');
      }
    } finally {
      battleTurnInFlightRef.current = false;
    }
  }, [activeEnemyMon, activePlayerMon, addLog, addNotification, chooseEnemyAction, commitCloudSnapshot, gameOver, handlePlayerDefeatCheck, hasLoadedCloudSave, playerTeam, resolveTrackedActiveBattleEnergyCost, resolveTurnAfterFaint, runEnemyAction, runEnemyTrainerSwitch, runPlayerAction, turn, user?.id]);

const handleEncounter = useCallback(async (encounterPayload) => {
    const payload =
      typeof encounterPayload === 'number'
        ? { level: encounterPayload }
        : encounterPayload || {}

    if (!user?.id || !hasLoadedCloudSave) {
      const message = '云端未就绪，暂不能战斗。';
      addLog(message);
      addNotification(message, 'error');
      return;
    }

    const rareEncounter = pickProgressRareEncounter({
      mapName: currentMapName,
      world,
      basePokemonId: payload.pokemonId,
      baseLevel: payload.level
    });
    const wildPokemonId =
      rareEncounter?.pokemonId ?? payload.pokemonId ?? getRandomWildPokemon(currentMapName)
    const newEnemyLevel = rareEncounter?.level ?? payload.level ?? getRandomWildLevel(currentMapName)

    const energyCost = getBattleEnergyCost({ battleKind: 'wild', mapLevel });
    const resources = await refreshPlayerResources();
    if (resources.energy < energyCost) {
      addLog(INSUFFICIENT_BATTLE_ENERGY_LOG);
      addNotification(INSUFFICIENT_BATTLE_ENERGY_NOTIFICATION, 'error');
      return;
    }

    let randomBaseMonster = MONSTERS.find((m) => m.id === wildPokemonId);
    if (!randomBaseMonster) {
      randomBaseMonster = MONSTERS.find((m) => m.id === 1) || MONSTERS[0];
    }

    const newEnemyInstance = createMonsterInstance(
      randomBaseMonster,
      newEnemyLevel,
      `e${nextEnemyMonsterId}`
    );

    const battleLeadId = resolveBattleLeadId(playerTeam);
    const battleLeadMon = playerTeam.find((mon) => mon.id === battleLeadId) || playerTeam[0];

    const mapInfo = getMapConfig(currentMapName).displayName;
    const battleEnvironment = createBattleEnvironment({
      battleKind: 'wild',
      currentMapName,
      mapInfo,
      zoneId: payload.zoneId,
      zoneName: payload.zoneName,
      terrainType: payload.terrainType,
      triggerPosition: payload.playerPos,
    });
    const zoneHint = payload.zoneName ? `【${payload.zoneName}】` : '';
    const encounterLog = rareEncounter?.bossRare
      ? `在 ${mapInfo}${zoneHint} 发现首领解锁的专属稀有生态，遇到了 ${newEnemyInstance.name}！`
      : rareEncounter?.challengeRare
      ? `在 ${mapInfo}${zoneHint} 发现试炼解锁的隐藏生态，遇到了稀有的 ${newEnemyInstance.name}！`
      : rareEncounter?.rare
      ? `在 ${mapInfo}${zoneHint} 感受到稀有气息，遇到了 ${newEnemyInstance.name}！`
      : rareEncounter?.progressTier >= 2
        ? `在 ${mapInfo}${zoneHint} 遇到了试炼后变强的 ${newEnemyInstance.name}！`
        : rareEncounter?.strengthened
          ? `在 ${mapInfo}${zoneHint} 遇到了气势更强的 ${newEnemyInstance.name}！`
          : `在 ${mapInfo}${zoneHint} 遇到了野生的 ${newEnemyInstance.name}！`;
    const sendOutMessage = getBattleSendOutMessage(battleLeadMon);
    const encounterPlayerPos = normalizeWorldPosition(payload.playerPos, playerPosRef.current || playerPos);
    const encounterCooldown = Math.max(0, Math.trunc(Number(payload.encounterCooldownSteps ?? encounterCooldownStepsRef.current ?? encounterCooldownSteps) || 0));
    const atomicResult = await commitCloudSnapshotWithResources({
      buildSnapshot: (baseSnapshot) => {
        const snapshotLeadId = resolveBattleLeadId(baseSnapshot.playerTeam) || battleLeadId || baseSnapshot.activePlayerId;
        const worldPositionPatch = buildWorldPositionPatch(baseSnapshot, encounterPlayerPos);
        return {
          ...baseSnapshot,
          ...worldPositionPatch,
          view: 'battle',
          turn: 'player',
          logs: [encounterLog],
          participatedMonIds: [snapshotLeadId].filter(Boolean),
          enemyTeam: [newEnemyInstance],
          activePlayerId: snapshotLeadId,
          activeEnemyId: newEnemyInstance.id,
          battleKind: 'wild',
          battlePhase: 'intro',
          battlePhaseData: { enemyMon: newEnemyInstance, mapInfo, leadMonId: snapshotLeadId, message: sendOutMessage, battleEnvironment },
          battleEnvironment,
          isThrowingPokeball: false,
          captureSequenceData: null,
          activeBattleEnergyCost: energyCost,
          battleEnergyRefundEligible: true,
          encounterCooldownSteps: encounterCooldown,
          nextEnemyMonsterId: (baseSnapshot.nextEnemyMonsterId || nextEnemyMonsterId) + 1
        };
      },
      energyDelta: -energyCost,
      energyReason: `战斗消耗（${getMapConfig(currentMapName).displayName}）`
    });
    if (atomicResult.success) {
      gameAudio.playEncounter({
        boss: Boolean(rareEncounter?.bossRare),
        challenge: Boolean(rareEncounter?.challengeRare),
        rare: Boolean(rareEncounter?.rare)
      });
      activeBattleEnergyCostRef.current = energyCost;
      setActiveBattleEnergyCost(energyCost);
      setBattleEnergyRefundEligible(true);
      return;
    }
    addLog(atomicResult.message || '战斗开始失败。');
    if (atomicResult.message?.includes('能量')) {
      addNotification(INSUFFICIENT_BATTLE_ENERGY_NOTIFICATION, 'error');
    } else {
      addNotification(atomicResult.message || '战斗开始失败，请重新读取。', atomicResult.requiresReload ? 'error' : 'warning');
    }
    return;
  }, [
    activePlayerId,
    addLog,
    addNotification,
    commitCloudSnapshotWithResources,
    currentMapName,
    encounterCooldownSteps,
    mapLevel,
    nextEnemyMonsterId,
    playerTeam,
    refreshPlayerResources,
    user?.id,
    hasLoadedCloudSave,
    world
  ]);

  const handlePurchase = async (itemType, itemKey, amount) => {
    const purchaseAmount = Math.trunc(Number(amount));
    if (!Number.isSafeInteger(purchaseAmount) || purchaseAmount <= 0) {
      addLog("商店: 购买数量无效。");
      addNotification('购买数量无效。', 'warning');
      return { success: false, message: '购买数量无效。' };
    }

    let itemDetails =
      itemType === 'expPotion' ? EXP_POTIONS[itemKey] :
      itemType === 'pokeball' ? POKEBALLS[itemKey] :
      itemType === 'potion' ? POTIONS[itemKey] :
      null;
    if (!itemDetails) {
      addLog("商店: 无效的物品。");
      addNotification('物品无效，无法购买。', 'warning');
      return { success: false, message: '物品无效。' };
    }
    if (!user?.id || !hasLoadedCloudSave) {
      const message = '云端未就绪，暂不能购买。';
      addLog(`商店: ${message}`);
      addNotification(message, 'error');
      return { success: false, message };
    }
    if (shopPurchaseInFlightRef.current) {
      return { success: false, busy: true, message: '上一笔购买正在处理中。' };
    }

    shopPurchaseInFlightRef.current = true;
    try {
      const totalPrice = itemDetails.price * purchaseAmount;
      const latestGold = await refreshGoldBalance();
      if (latestGold < totalPrice) {
        addLog("商店: 金币不足。");
        addNotification('金币不足。', 'warning');
        return { success: false, message: '金币不足。' };
      }
      const purchaseSuccess = {
        success: true,
        itemType,
        itemKey,
        itemName: itemDetails.name,
        quantity: purchaseAmount,
        totalPrice,
      };

      const atomicResult = await commitCloudSnapshotWithResources({
        buildSnapshot: (baseSnapshot) => ({
          ...baseSnapshot,
          playerInventory: mergeInventoryEntries(baseSnapshot.playerInventory, itemType, itemKey, purchaseAmount),
          logs: [...(Array.isArray(baseSnapshot.logs) ? baseSnapshot.logs : []), `商店: 购买了 ${purchaseAmount} 个 ${itemDetails.name}。`]
        }),
        goldDelta: -totalPrice,
        goldReason: `购买${itemDetails.name}`
      });
      if (atomicResult.success) {
        gameAudio.playItemUse({ category: 'shop' });
        return purchaseSuccess;
      }
      addLog(`商店: ${atomicResult.message || '购买失败。'}`);
      addNotification(
        atomicResult.message || '购买失败，请重试。',
        atomicResult.notificationType || (atomicResult.requiresReload ? 'error' : 'warning')
      );
      return { success: false, message: atomicResult.message || '购买失败。' };
    } finally {
      shopPurchaseInFlightRef.current = false;
    }
  };

  const handleCollect = useCallback(async (type, amount, context = {}) => {
    const tileX = toMapTileCoordinate(context.tileX);
    const tileY = toMapTileCoordinate(context.tileY);
    const mapEvent = context.mapEvent || (tileX !== null && tileY !== null ? getMapEventAt(currentMapName, tileX, tileY) : null);
    const mapEventProps = getMapEventProperties(mapEvent);
    const interactionWorldBase = normalizeWorldState(latestCloudSnapshotRef.current?.world || worldRef.current || world, {
      currentMapName,
      playerPos: playerPosRef.current || playerPos
    });
    const interactionWorld = mergeMonotonicWorldProgress(
      mergeMonotonicWorldProgress(
        interactionWorldBase,
        worldRef.current,
        {
          currentMapName,
          playerPos: playerPosRef.current || playerPos
        }
      ),
      readCloudSnapshotFromString(lastSavedSnapshotRef.current)?.world,
      {
        currentMapName,
        playerPos: playerPosRef.current || playerPos
      }
    );
    const effectiveType = (() => {
      if (!mapEvent?.type) return type;
      if (mapEvent.type === 'sign') return 'info';
      if (mapEvent.type === 'pickup') return 'item';
      if (['item', 'heal', 'trainer', 'boss', 'challenge', 'fast_travel'].includes(mapEvent.type)) return mapEvent.type;
      return type;
    })();
    const eventId = typeof mapEvent?.id === 'string' && mapEvent.id.length > 0 ? mapEvent.id : null;
    const canClearTile = shouldPersistMapTileClear(currentMapName, mapEvent, effectiveType, tileX, tileY);
    const eventPlayerPos = normalizeWorldPosition(
      context.playerPos || (tileX !== null && tileY !== null ? { x: tileX, y: tileY, direction: playerPosRef.current?.direction } : null),
      playerPosRef.current || playerPos
    );
    const eventCooldown = Math.max(0, Math.trunc(Number(context.encounterCooldownSteps ?? encounterCooldownStepsRef.current ?? encounterCooldownSteps) || 0));

    if (effectiveType === 'gold') {
      addNotification('地图金币已关闭。', 'info');
      return false;
    }

    if (effectiveType === 'info') {
      const signX = tileX ?? playerPos?.x;
      const signY = tileY ?? playerPos?.y;
      const battleEventInfoText = getConfiguredBattleEventInfoMessage({
        mapName: currentMapName,
        world: interactionWorld,
        event: mapEvent
      });
      if (battleEventInfoText) {
        addNotification(battleEventInfoText, 'info');
        return false;
      }
      const signText = getMapSignMessage(currentMapName, signX, signY);
      if (signText) {
        addNotification(signText, 'info');
      } else {
        const tips = [
          '深色高草丛里的野生宝可梦更多，不同区域种类不同。',
          '精灵之泉可以恢复全队体力与技能值，找到泉眼站上去试试。',
          '看到果树记得采集，果实可以恢复少量体力。',
          '属性克制是获胜的关键。',
          '队伍首位的宝可梦会首先出战。'
        ];
        const tip = tips[Math.floor(Math.random() * tips.length)];
        addNotification(`提示：${tip}`, 'info');
      }
      return false;
    }

    if (effectiveType === 'item') {
      const fixedItemType = resolveInventoryItemType({
        itemType: mapEventProps.itemType,
        itemKey: mapEventProps.itemKey
      });
      const fixedItemDetails = fixedItemType
        ? resolveInventoryItemDetails(fixedItemType, mapEventProps.itemKey)
        : null;
      const allItems = [...Object.keys(POKEBALLS), ...Object.keys(POTIONS)];
      const randomKey = allItems[Math.floor(Math.random() * allItems.length)];
      const isBall = Boolean(POKEBALLS[randomKey]);
      const itemType = fixedItemDetails ? fixedItemType : (isBall ? 'pokeball' : 'potion');
      const itemKey = fixedItemDetails ? mapEventProps.itemKey : randomKey;
      const itemDetails = fixedItemDetails || (isBall ? POKEBALLS[randomKey] : POTIONS[randomKey]);
      const quantity = Math.max(1, Math.trunc(Number(mapEventProps.quantity ?? 1)) || 1);

      const foundEffectText = itemType === 'potion' ? ` · ${getPotionEffectText(itemDetails)}` : '';
      if (!user?.id || !hasLoadedCloudSave) {
        addNotification('云端未就绪，暂不能拾取。', 'error');
        return false;
      }
      if (eventId && hasWorldEventId(interactionWorld, 'collectedEventIds', eventId)) {
        setWorld((current) => (
          JSON.stringify(uniqueStringList(current?.collectedEventIds)) === JSON.stringify(uniqueStringList(interactionWorld?.collectedEventIds))
            ? current
            : interactionWorld
        ));
        setMapGrid((prev) => buildMapGridForWorld(currentMapName, interactionWorld, prev));
        addNotification('这个补给已经领取了。', 'info');
        return true;
      }
      let committedPickupState = null;
      const commitResult = await commitCloudSnapshot({
        buildSnapshot: (baseSnapshot) => {
          const liveSnapshotPlayerPos = normalizeWorldPosition(
            playerPosRef.current || eventPlayerPos,
            eventPlayerPos
          );
          const liveSnapshotEncounterCooldown = Math.max(
            0,
            Math.trunc(
              Number(
                encounterCooldownStepsRef.current
                ?? encounterCooldownSteps
                ?? eventCooldown
              ) || 0
            )
          );
          const worldPositionPatch = buildWorldPositionPatch(baseSnapshot, liveSnapshotPlayerPos);
          const nextWorldBase = eventId
            ? appendWorldEventId(worldPositionPatch.world || baseSnapshot.world, 'collectedEventIds', eventId)
            : worldPositionPatch.world;
          const nextWorld = withUpdatedMapProgress(nextWorldBase, currentMapName);
          const nextInventory = mergeInventoryEntries(baseSnapshot.playerInventory, itemType, itemKey, quantity);
          const nextMapGrid = canClearTile ? clearMapTileInGrid(currentMapName, baseSnapshot.mapGrid, tileX, tileY) : baseSnapshot.mapGrid;
          const nextLogs = appendSnapshotLogs(baseSnapshot, [`地图: 获得了 ${itemDetails.name}${quantity > 1 ? ` x${quantity}` : ''}${foundEffectText}。`]);
          committedPickupState = {
            nextWorld,
            nextInventory,
            nextMapGrid,
            nextLogs,
            nextPlayerPos: liveSnapshotPlayerPos,
            nextEncounterCooldown: liveSnapshotEncounterCooldown
          };
          return {
            ...baseSnapshot,
            ...worldPositionPatch,
            world: nextWorld,
            encounterCooldownSteps: liveSnapshotEncounterCooldown,
            playerInventory: nextInventory,
            mapGrid: nextMapGrid,
            logs: nextLogs
          };
        },
        onCommitted: ({ snapshot }) => {
          if (!committedPickupState) return;
          const livePlayerPos = normalizeWorldPosition(
            playerPosRef.current || playerPos || committedPickupState.nextPlayerPos,
            committedPickupState.nextPlayerPos
          );
          const liveEncounterCooldown = Math.max(
            0,
            Math.trunc(
              Number(
                encounterCooldownStepsRef.current
                ?? encounterCooldownSteps
                ?? committedPickupState.nextEncounterCooldown
              ) || 0
            )
          );
          const mergedWorld = normalizeWorldState(committedPickupState.nextWorld, {
            currentMapName,
            playerPos: livePlayerPos
          });

          committedPickupState.nextWorld = mergedWorld;
          committedPickupState.nextPlayerPos = livePlayerPos;
          committedPickupState.nextEncounterCooldown = liveEncounterCooldown;
          playerPosRef.current = livePlayerPos;
          encounterCooldownStepsRef.current = liveEncounterCooldown;
          worldRef.current = mergedWorld;
          logsRef.current = committedPickupState.nextLogs;

          if (snapshot && typeof snapshot === 'object') {
            snapshot.playerPos = livePlayerPos;
            snapshot.encounterCooldownSteps = liveEncounterCooldown;
            snapshot.world = mergedWorld;
          }

          scheduleDeferredPickupUiSync(() => {
            setWorld(mergedWorld);
            setMapGrid((current) => (
              areMapGridsEqual(current, committedPickupState.nextMapGrid)
                ? current
                : committedPickupState.nextMapGrid
            ));
            setPlayerInventory((current) => (
              JSON.stringify(current) === JSON.stringify(committedPickupState.nextInventory)
                ? current
                : committedPickupState.nextInventory
            ));
            setLogs((current) => (
              arePrimitiveArraysEqual(current, committedPickupState.nextLogs)
                ? current
                : committedPickupState.nextLogs
            ));
          });
        }
      });
      if (!commitResult.success) {
        addLog(`地图道具拾取失败: ${commitResult.message || '云端保存失败。'}`);
        addNotification(commitResult.message || '拾取失败，请重试。', commitResult.requiresReload ? 'error' : 'warning');
        return false;
      }

      const rewardMessage = formatCollectedItemNotification({
        customText: mapEventProps.text,
        itemDetails,
        quantity
      });
      addNotification(rewardMessage, 'item');
      gameAudio.playItemUse({ category: 'pickup' });
      return true;
    }

    if (effectiveType === 'heal') {
      if (!user?.id || !hasLoadedCloudSave) {
        addNotification('云端未就绪，暂不能恢复。', 'error');
        return false;
      }
      const healEvent = tileX !== null && tileY !== null
        ? (mapEvent?.type === 'heal' ? mapEvent : getMapEventAt(currentMapName, tileX, tileY, 'heal'))
        : (mapEvent?.type === 'heal' ? mapEvent : null);
      const healProps = getMapEventProperties(healEvent);
      const healCost = Math.max(1, Math.trunc(Number(healProps.goldCost ?? 1)) || 1);
      const springName = healProps.label || '恢复泉水';
      const springKey = `${currentMapName}:${eventId || healEvent?.id || 'heal'}:${tileX ?? 'x'}:${tileY ?? 'y'}`;
      const currentGold = latestPlayerResourcesRef.current?.gold ?? playerGold;

      if (pendingSpringRestoreConfirm?.key === springKey || springRestoreBusy) {
        return false;
      }

      setPendingSpringRestoreConfirm({
        key: springKey,
        mapName: currentMapName,
        springName,
        healCost,
        currentGold,
        error: '',
        tileX,
        tileY,
        context: {
          ...context,
          tileX,
          tileY,
          mapEvent: healEvent || mapEvent,
          playerPos: eventPlayerPos,
          encounterCooldownSteps: eventCooldown
        }
      });
      refreshPlayerResources()
        .then((resources) => {
          setPendingSpringRestoreConfirm((current) => (
            current?.key === springKey
              ? { ...current, currentGold: resources.gold, error: resources.gold < healCost ? `泉水恢复需要 ${healCost} 金币，当前金币不足。` : '' }
              : current
          ));
        })
        .catch(() => {});
      return false;
    }

    if (effectiveType === 'fast_travel') {
      if (!user?.id || !hasLoadedCloudSave) {
        addNotification('云端未就绪，暂不能传送。', 'error');
        return false;
      }
      const travelEvent = tileX !== null && tileY !== null
        ? (mapEvent?.type === 'fast_travel' ? mapEvent : getMapEventAt(currentMapName, tileX, tileY, 'fast_travel'))
        : (mapEvent?.type === 'fast_travel' ? mapEvent : null);
      if (!travelEvent) {
        return false;
      }
      const travelProps = getMapEventProperties(travelEvent);
      const travelCost = Math.max(1, Math.trunc(Number(travelProps.goldCost ?? FAST_TRAVEL_COST)) || FAST_TRAVEL_COST);
      const travelKey = `${currentMapName}:${eventId || travelEvent?.id || 'fast_travel'}:${tileX ?? 'x'}:${tileY ?? 'y'}`;
      const currentGold = latestPlayerResourcesRef.current?.gold ?? playerGold;

      if (pendingFastTravel?.key === travelKey || fastTravelBusy) {
        return false;
      }

      setPendingFastTravel({
        key: travelKey,
        mapName: currentMapName,
        label: travelProps.label || '快速传送台',
        travelCost,
        currentGold,
        error: currentGold < travelCost ? `快速传送需要 ${travelCost} 金币，当前金币不足。` : '',
        tileX,
        tileY,
        context: {
          ...context,
          tileX,
          tileY,
          mapEvent: travelEvent || mapEvent,
          playerPos: eventPlayerPos,
          encounterCooldownSteps: eventCooldown
        }
      });
      refreshPlayerResources()
        .then((resources) => {
          setPendingFastTravel((current) => (
            current?.key === travelKey
              ? { ...current, currentGold: resources.gold, error: resources.gold < travelCost ? `快速传送需要 ${travelCost} 金币，当前金币不足。` : '' }
              : current
          ));
        })
        .catch(() => {});
      return false;
    }

    if (effectiveType === 'berry') {
      const healAmount = 20;
      if (!user?.id || !hasLoadedCloudSave) {
        addNotification('云端未就绪，暂不能采集。', 'error');
        return false;
      }
      const commitResult = await commitCloudSnapshot({
        buildSnapshot: (baseSnapshot) => {
          const worldPositionPatch = buildWorldPositionPatch(baseSnapshot, eventPlayerPos);
          return {
            ...baseSnapshot,
            ...worldPositionPatch,
            encounterCooldownSteps: eventCooldown,
            playerTeam: (Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : []).map((mon) => (
              sanitizeBattleRuntime({
                ...mon,
                currentHp: Math.min(getMonsterMaxHp(mon), getMonsterCurrentHp(mon) + healAmount)
              })
            )),
            mapGrid: canClearTile ? clearMapTileInGrid(currentMapName, baseSnapshot.mapGrid, tileX, tileY) : baseSnapshot.mapGrid,
            logs: appendSnapshotLogs(baseSnapshot, [`地图: 采集到甜甜蜜果，全员恢复了 ${healAmount} 点体力。`])
          };
        }
      });
      if (!commitResult.success) {
        addLog(`果实采集失败: ${commitResult.message || '云端保存失败。'}`);
        addNotification(commitResult.message || '采集失败，请重试。', commitResult.requiresReload ? 'error' : 'warning');
        return false;
      }

      addNotification('甜甜蜜果已采集，全队恢复。', 'item');
      gameAudio.playItemUse({ category: 'berry' });
      return true;
    }

    if (isConfiguredBattleEventType(effectiveType)) {
      if (!user?.id || !hasLoadedCloudSave) {
        const message = '云端未就绪，暂不能对战。';
        addLog(message);
        addNotification(message, 'error');
        return false;
      }
      const battleMapEvent = resolveConfiguredBattleMapEvent({
        mapName: currentMapName,
        eventType: effectiveType,
        eventId,
        mapEvent,
        tileX,
        tileY,
        eventPosition: mapEvent?.position,
        triggerPosition: eventPlayerPos
      });
      const battleEventType = battleMapEvent?.type || effectiveType;
      const battleEventId = typeof battleMapEvent?.id === 'string' && battleMapEvent.id.length > 0
        ? battleMapEvent.id
        : eventId;
      const battleEventProps = getMapEventProperties(battleMapEvent || mapEvent);

      if (!battleEventId) {
        console.warn('[OriginalGame] Blocked untracked configured battle event.', {
          currentMapName,
          effectiveType,
          tileX,
          tileY,
          mapEvent
        });
        addNotification('这个对战点信息未同步，请离开一步再回来。', 'warning');
        return false;
      }

      const battleEventRole = resolveConfiguredBattleRole(battleEventType, battleEventProps);
      const roleBalance = getTrainerRoleBalance(battleEventRole);
      const isDailyScalingTrainer = isDailyScalingTrainerEvent(battleEventType, battleEventRole);
      const isDailyVariantBattle = isDailyVariantBattleEvent(battleEventType, battleEventRole);
      const eventName = battleEventProps.name || (
        battleEventType === 'boss' ? '区域首领' : battleEventType === 'challenge' ? '区域试炼' : '训练家'
      );
      const completionKey = getConfiguredBattleCompletionKey(battleEventType);
      const isCompletedBattleEvent = battleEventType === 'boss'
        ? hasCompletedBossEvent(interactionWorld, currentMapName, battleEventId)
        : Boolean(
          battleEventId &&
          completionKey &&
          hasMapScopedWorldEventId(interactionWorld, completionKey, currentMapName, battleEventId)
        );
      const battleEventLockKey = getBattleEventInteractionLockKey({
        world: interactionWorld,
        mapName: currentMapName,
        eventType: battleEventType,
        eventId: battleEventId
      });
      const battleEventCompletedLockKeys = getBattleEventCompletedLockKeys({
        world: interactionWorld,
        mapName: currentMapName,
        eventType: battleEventType,
        eventId: battleEventId,
        eventRole: battleEventRole
      });
      const localCompletedBattleEventVisualState = getCompletedBattleEventVisualOverride(
        completedBattleEventVisualOverridesRef.current,
        {
          world: interactionWorld,
          mapName: currentMapName,
          eventId: battleEventId
        }
      );
      const completedBattleEventInfoText = getConfiguredBattleEventInfoMessage({
        mapName: currentMapName,
        world: interactionWorld,
        event: battleMapEvent || mapEvent,
        visualState: localCompletedBattleEventVisualState
      });

      if (['daily_complete', 'cleared', 'completed'].includes(localCompletedBattleEventVisualState?.status)) {
        addNotification(completedBattleEventInfoText || `${eventName}已完成。`, 'info');
        return false;
      }

      if (battleEventCompletedLockKeys.some((key) => completedBattleEventLockRef.current.has(key))) {
        markCompletedBattleEventLocally({
          world: interactionWorld,
          mapName: currentMapName,
          eventType: battleEventType,
          eventId: battleEventId,
          eventRole: battleEventRole
        });
        worldRef.current = mergeMonotonicWorldProgress(worldRef.current, interactionWorld, {
          currentMapName,
          playerPos: playerPosRef.current || playerPos
        });
        setWorld(worldRef.current);
        setMapGrid((prev) => buildMapGridForWorld(currentMapName, worldRef.current, prev));
        addNotification(
          battleEventType === 'challenge'
            ? getDailyTrainerBlockedText({ eventName, properties: battleEventProps })
            : battleEventProps.defeatedText || `${eventName}已完成。`,
          'info'
        );
        return false;
      }

      if (isDailyVariantBattle && battleEventId && hasDailyTrainerBattleEvent(interactionWorld, currentMapName, battleEventId)) {
        markCompletedBattleEventLocally({
          world: interactionWorld,
          mapName: currentMapName,
          eventType: battleEventType,
          eventId: battleEventId,
          eventRole: battleEventRole
        });
        addNotification(getDailyTrainerBlockedText({ eventName, properties: battleEventProps }), 'info');
        return false;
      }

      if (!isDailyScalingTrainer && battleEventType !== 'challenge' && isCompletedBattleEvent) {
        markCompletedBattleEventLocally({
          world: interactionWorld,
          mapName: currentMapName,
          eventType: battleEventType,
          eventId: battleEventId,
          eventRole: battleEventRole
        });
        const completedWorld = mergeMonotonicWorldProgress(worldRef.current, interactionWorld, {
          currentMapName,
          playerPos: playerPosRef.current || playerPos
        });
        worldRef.current = completedWorld;
        setWorld(completedWorld);
        setMapGrid((prev) => buildMapGridForWorld(currentMapName, completedWorld, prev));
        battleEventCompletedLockKeys.forEach((key) => completedBattleEventLockRef.current.add(key));
        addNotification(
          battleEventProps.defeatedText || `${eventName}已完成。`,
          'info'
        );
        return false;
      }
      if (battleEventType === 'boss') {
        const requiredTrainerIds = Array.isArray(battleEventProps.requiredTrainerIds)
          ? battleEventProps.requiredTrainerIds.filter((id) => typeof id === 'string' && id.length > 0)
          : [];
        const missingCount = Math.max(
          0,
          requiredTrainerIds.length - countMapScopedWorldEventIds(interactionWorld, 'defeatedTrainerIds', currentMapName, requiredTrainerIds)
        );
        if (missingCount > 0) {
          addNotification(battleEventProps.lockedText || `还需击败 ${missingCount} 名部下。`, 'warning');
          return false;
        }
      }
      const currentMapConfig = getMapConfig(currentMapName);
      const bossLevelCap = getMapBossLevelCap(currentMapName);
      const playerAvgLevel = getPlayerAverageLevel(playerTeam);
      const battleLeadId = resolveBattleLeadId(playerTeam);
      const battleLeadMon = playerTeam.find((mon) => mon.id === battleLeadId) || playerTeam[0];
      const playerPressureLevel = getTrainerBattlePressureLevel({
        playerAverageLevel: playerAvgLevel,
        leadLevel: battleLeadMon?.level
      });
      const baseResolvedTeamConfig = isDailyVariantBattle
        ? resolveDailyBattleTeamConfig(battleEventProps.team, {
          mapName: currentMapName,
          world: interactionWorld,
          eventId: battleEventId,
          eventType: battleEventType,
          role: battleEventRole,
          challengeRarePool: battleEventProps.challengeRarePool,
          dailyVariantSpeciesIds: battleEventProps.dailyVariantSpeciesIds,
          dailyVariantLevelJitter: battleEventProps.dailyVariantLevelJitter
        })
        : battleEventProps.team;
      const resolvedTeamConfig = rebalanceTrainerBattleTeamLevels(baseResolvedTeamConfig, {
        role: battleEventRole,
        mapConfig: currentMapConfig,
        bossLevelCap,
        playerLevel: playerPressureLevel
      });
      const energyCost = getBattleEnergyCost({ battleKind: 'trainer', mapLevel });
      const shouldStartBattleImmediately = battleEventType !== 'challenge' || context.skipBattleConfirm;
      let battleEventStartLockHeld = false;
      const releaseBattleEventStartLock = () => {
        if (!battleEventStartLockHeld || !battleEventLockKey) return;
        battleEventStartInFlightRef.current.delete(battleEventLockKey);
        battleEventStartLockHeld = false;
      };

      if (shouldStartBattleImmediately && battleEventLockKey && battleEventStartInFlightRef.current.has(battleEventLockKey)) {
        return false;
      }
      if (shouldStartBattleImmediately && battleEventLockKey) {
        battleEventStartInFlightRef.current.add(battleEventLockKey);
        battleEventStartLockHeld = true;
      }

      const resources = await refreshPlayerResources();
      if (resources.energy < energyCost) {
        releaseBattleEventStartLock();
        addLog(INSUFFICIENT_BATTLE_ENERGY_LOG);
        addNotification(INSUFFICIENT_BATTLE_ENERGY_NOTIFICATION, 'error');
        return false;
      }
      if (battleEventType === 'challenge' && !context.skipBattleConfirm) {
        const resolvedChallengeTeamSize = getConfiguredBattleOpponentCount(resolvedTeamConfig);
        const resolvedChallengeTitle = `${eventName} · ${resolvedChallengeTeamSize} 连战`;
        const challengeRarePool = getChallengeRarePool(battleMapEvent);
        const challengeRareUnlockStage = getChallengeRareUnlockStage(interactionWorld, battleMapEvent, currentMapName);
        const nextChallengeRareUnlockBatch = getChallengeRareUnlockBatch(battleMapEvent, challengeRareUnlockStage);
        const challengeRunRewardItems = getChallengeRunRewardItems({
          mapName: currentMapName,
          teamSize: resolvedChallengeTeamSize
        });
        const challengeDisplayRewardItems = mergeNormalizedMapRewardItems([
          ...(isCompletedBattleEvent ? [] : normalizeMapRewardItems(battleEventProps.rewardItems)),
          ...challengeRunRewardItems
        ]);
        setPendingBattleEventConfirm({
          type,
          amount,
          eventName,
          eventTitle: resolvedChallengeTitle,
          energyCost,
          teamSize: resolvedChallengeTeamSize,
          levelRangeText: getConfiguredBattleLevelRangeText(resolvedTeamConfig),
          rewardItems: challengeDisplayRewardItems,
          rewardLabel: isCompletedBattleEvent ? '本次挑战奖励' : '首通与本次奖励',
          rewardDescriptions: describeMapRewardItems(challengeDisplayRewardItems),
          unlockSpeciesPool: nextChallengeRareUnlockBatch,
          unlockDescription: nextChallengeRareUnlockBatch.length > 0
            ? `本次通关会解锁下一批隐藏生态。`
            : `本区域隐藏生态已全部解锁。`,
          unlockProgress: {
            unlockedCount: getChallengeRareUnlockedCountForStage(battleMapEvent, challengeRareUnlockStage),
            totalCount: challengeRarePool.length,
            nextBatchIndex: Math.min(getChallengeRareUnlockStageCount(battleMapEvent), challengeRareUnlockStage + 1)
          },
          battlePreviewTeam: resolvedTeamConfig,
          alreadyCompleted: isCompletedBattleEvent,
          context: {
            ...context,
            tileX,
            tileY,
            mapEvent: battleMapEvent,
            playerPos: eventPlayerPos,
            encounterCooldownSteps: eventCooldown,
            skipBattleConfirm: true
          }
        });
        return false;
      }

      let newTeam = buildConfiguredOpponentTeam(resolvedTeamConfig, battleEventId || battleEventType);
      if (newTeam.length === 0) {
        const fallbackLevelBonus = isDailyVariantBattle
          ? getTrainerVictoryCount(interactionWorld, battleEventId, currentMapName)
          : 0;
        const fallbackLevelCap = isDailyVariantBattle
          ? getTrainerDifficultyBounds({
            role: battleEventRole,
            mapConfig: currentMapConfig,
            bossLevelCap
          }).maxLevel
          : 100;
        newTeam = buildFallbackOpponentTeam({
          role: battleEventRole,
          eventId: battleEventId || battleEventType,
          currentMapName,
          playerAverageLevel: playerPressureLevel,
          mapRecommendedLevel: currentMapConfig.recommendedLevel || mapLevel,
          levelBonus: fallbackLevelBonus,
          levelCap: fallbackLevelCap
        });
      }
      newTeam = newTeam.slice(0, roleBalance.maxTeamSize);

      const sendOutMessage = getBattleSendOutMessage(battleLeadMon);
      const battleIntroText = battleEventProps.beforeBattleText || `${eventName}向你发起了挑战!`;
      const trainerLogs = [battleIntroText, `对手派出了 ${newTeam[0].name}！`];
      const battleEventCompletion = createBattleEventCompletion({
        currentMapName,
        eventType: battleEventType,
        eventId: battleEventId
      });
      const battleEnvironment = createBattleEnvironment({
        battleKind: 'trainer',
        currentMapName,
        mapInfo: currentMapConfig.displayName,
        zoneId: battleEventId || 'trainer_challenge',
        zoneName: eventName,
        terrainType: battleEventType,
        sceneClass: battleEventProps.sceneClass,
        eventId: battleEventId,
        eventType: battleEventType,
        eventRole: battleEventRole,
        trainerStyle: battleEventProps.battleStyle || null,
        eventName,
        eventTitle: battleEventProps.title || roleBalance.label,
        introText: battleIntroText,
        battleEventCompletion,
        eventPosition: battleMapEvent?.position || mapEvent?.position || { x: tileX, y: tileY },
        triggerPosition: eventPlayerPos,
      });
      const atomicResult = await commitCloudSnapshotWithResources({
        buildSnapshot: (baseSnapshot) => {
          const snapshotLeadId = resolveBattleLeadId(baseSnapshot.playerTeam) || battleLeadId || baseSnapshot.activePlayerId;
          const worldPositionPatch = buildWorldPositionPatch(baseSnapshot, eventPlayerPos);
          return {
            ...baseSnapshot,
            ...worldPositionPatch,
            view: 'battle',
            turn: 'player',
            logs: trainerLogs,
            enemyTeam: newTeam,
            activePlayerId: snapshotLeadId,
            activeEnemyId: newTeam[0].id,
            battleKind: 'trainer',
            battlePhase: 'intro',
            battlePhaseData: { enemyMon: newTeam[0], leadMonId: snapshotLeadId, message: sendOutMessage, sendOutSide: 'both', battleEnvironment, battleEventCompletion },
            battleEnvironment,
            battleEventCompletion,
            participatedMonIds: [snapshotLeadId].filter(Boolean),
            isThrowingPokeball: false,
            captureSequenceData: null,
            activeBattleEnergyCost: energyCost,
            battleEnergyRefundEligible: false,
            encounterCooldownSteps: eventCooldown
          };
      },
      energyDelta: -energyCost,
      energyReason: `战斗消耗（${eventName}）`
      });
      if (atomicResult.success) {
        gameAudio.playEncounter({ trainer: true, challenge: battleEventType === 'challenge', boss: battleEventType === 'boss' });
        activeBattleEnergyCostRef.current = energyCost;
        setActiveBattleEnergyCost(energyCost);
        setBattleEnergyRefundEligible(false);
        releaseBattleEventStartLock();
        return true;
      }
      releaseBattleEventStartLock();
      addLog(atomicResult.message || '训练家对战开始失败。');
      if (atomicResult.message?.includes('能量')) {
        addNotification(INSUFFICIENT_BATTLE_ENERGY_NOTIFICATION, 'error');
      } else {
        addNotification(atomicResult.message || '训练家对战开始失败，请重新读取。', atomicResult.requiresReload ? 'error' : 'warning');
      }
      return false;
    }

    return false;
  }, [addLog, addNotification, commitCloudSnapshot, commitCloudSnapshotWithResources, currentMapName, encounterCooldownSteps, fastTravelBusy, hasLoadedCloudSave, mapLevel, markCompletedBattleEventLocally, pendingFastTravel, pendingSpringRestoreConfirm, playerGold, playerPos, playerTeam, refreshPlayerResources, scheduleDeferredPickupUiSync, springRestoreBusy, user?.id, world]);

  const handleCancelBattleEventConfirm = useCallback(() => {
    if (battleEventConfirmBusy) return;
    setPendingBattleEventConfirm(null);
  }, [battleEventConfirmBusy]);

  const handleConfirmBattleEvent = useCallback(async () => {
    if (!pendingBattleEventConfirm || battleEventConfirmBusy || battleEventConfirmInFlightRef.current) return;
    battleEventConfirmInFlightRef.current = true;
    setBattleEventConfirmBusy(true);
    try {
      await handleCollect(
        pendingBattleEventConfirm.type,
        pendingBattleEventConfirm.amount,
        pendingBattleEventConfirm.context
      );
    } finally {
      battleEventConfirmInFlightRef.current = false;
      setBattleEventConfirmBusy(false);
      setPendingBattleEventConfirm(null);
    }
  }, [battleEventConfirmBusy, handleCollect, pendingBattleEventConfirm]);

  useEffect(() => {
    if (view === 'map' || !pendingBattleEventConfirm) return;
    setPendingBattleEventConfirm(null);
    setBattleEventConfirmBusy(false);
  }, [pendingBattleEventConfirm, view]);

  const handleCancelSpringRestoreConfirm = useCallback(() => {
    if (springRestoreBusy) return;
    setPendingSpringRestoreConfirm(null);
  }, [springRestoreBusy]);

  const handleConfirmSpringRestore = useCallback(async () => {
    if (!pendingSpringRestoreConfirm || springRestoreBusy) return;
    setSpringRestoreBusy(true);
    try {
      if (!user?.id || !hasLoadedCloudSave) {
        addNotification('云端未就绪，暂不能恢复。', 'error');
        return;
      }

      const healCost = Math.max(1, Math.trunc(Number(pendingSpringRestoreConfirm.healCost ?? 1)) || 1);
      const springName = pendingSpringRestoreConfirm.springName || '恢复泉水';
      const resources = await refreshPlayerResources();
      if (resources.gold < healCost) {
        const message = `泉水恢复需要 ${healCost} 金币，当前金币不足。`;
        setPendingSpringRestoreConfirm((current) => (
          current?.key === pendingSpringRestoreConfirm.key
            ? { ...current, currentGold: resources.gold, error: message }
            : current
        ));
        addNotification(message, 'warning');
        return;
      }

      const restoreContext = pendingSpringRestoreConfirm.context || {};
      const eventPlayerPos = normalizeWorldPosition(
        restoreContext.playerPos || (Number.isSafeInteger(pendingSpringRestoreConfirm.tileX) && Number.isSafeInteger(pendingSpringRestoreConfirm.tileY)
          ? { x: pendingSpringRestoreConfirm.tileX, y: pendingSpringRestoreConfirm.tileY, direction: playerPosRef.current?.direction }
          : null),
        playerPosRef.current || playerPos
      );
      const eventCooldown = Math.max(0, Math.trunc(Number(
        restoreContext.encounterCooldownSteps ?? encounterCooldownStepsRef.current ?? encounterCooldownSteps
      ) || 0));

      const commitResult = await commitCloudSnapshotWithResources({
        buildSnapshot: (baseSnapshot) => {
          const worldPositionPatch = buildWorldPositionPatch(baseSnapshot, eventPlayerPos);
          return {
            ...baseSnapshot,
            ...worldPositionPatch,
            encounterCooldownSteps: eventCooldown,
            playerTeam: (Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : []).map((mon) => (
              sanitizeBattleRuntime({
                ...mon,
                currentHp: getMonsterMaxHp(mon),
                currentMp: getMonsterMaxMp(mon)
              })
            )),
            mapGrid: baseSnapshot.mapGrid,
            logs: appendSnapshotLogs(baseSnapshot, [`地图: ${springName}消耗 ${healCost} 金币，队伍全员体力、技能值与异常状态已恢复。`])
          };
        },
        goldDelta: -healCost,
        goldReason: `${springName}全队恢复`
      });
      if (!commitResult.success) {
        addLog(`恢复点使用失败: ${commitResult.message || '云端保存失败。'}`);
        addNotification(commitResult.message || '恢复失败，请重试。', commitResult.requiresReload ? 'error' : 'warning');
        return;
      }
      gameAudio.playHeal({ strong: true });

      setPendingSpringRestoreConfirm(null);
      const nextAnimation = {
        id: `${pendingSpringRestoreConfirm.key}:${Date.now()}`,
        mapName: pendingSpringRestoreConfirm.mapName || currentMapName,
        tileX: pendingSpringRestoreConfirm.tileX,
        tileY: pendingSpringRestoreConfirm.tileY
      };
      setSpringRestoreAnimation(nextAnimation);
      if (springRestoreAnimationTimerRef.current) {
        window.clearTimeout(springRestoreAnimationTimerRef.current);
      }
      springRestoreAnimationTimerRef.current = window.setTimeout(() => {
        setSpringRestoreAnimation((current) => current?.id === nextAnimation.id ? null : current);
      }, 2600);
      addNotification(`${springName}已恢复全队并解除异常。`, 'info');
    } finally {
      setSpringRestoreBusy(false);
    }
  }, [
    addLog,
    addNotification,
    commitCloudSnapshotWithResources,
    currentMapName,
    encounterCooldownSteps,
    hasLoadedCloudSave,
    pendingSpringRestoreConfirm,
    playerPos,
    refreshPlayerResources,
    springRestoreBusy,
    user?.id
  ]);

  useEffect(() => {
    if (view === 'map' || !pendingSpringRestoreConfirm) return;
    setPendingSpringRestoreConfirm(null);
    setSpringRestoreBusy(false);
  }, [pendingSpringRestoreConfirm, view]);

  const handleCancelFastTravel = useCallback(() => {
    if (fastTravelBusy) return;
    setFastTravelTransitTarget(null);
    setPendingFastTravel(null);
  }, [fastTravelBusy]);

  const handleFastTravelToMap = useCallback(async (targetMapName) => {
    if (!pendingFastTravel || fastTravelBusy) return;
    if (!targetMapName || targetMapName === currentMapName) return;

    const travelRequest = pendingFastTravel;
    const mapConfig = getMapConfig(targetMapName);
    const lockState = getFastTravelMapLockState({
      targetMapName,
      currentMapName,
      world,
      playerTeam
    });
    if (lockState.locked) {
      setPendingFastTravel((current) => current ? { ...current, error: lockState.reason || '未解锁' } : current);
      addNotification(lockState.reason || '未解锁', 'warning');
      return;
    }
    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('云端未就绪，暂不能传送。', 'error');
      return;
    }

    const travelCost = Math.max(1, Math.trunc(Number(travelRequest.travelCost ?? FAST_TRAVEL_COST)) || FAST_TRAVEL_COST);
    const knownGold = Math.max(0, Math.trunc(Number(
      travelRequest.currentGold ?? latestPlayerResourcesRef.current?.gold ?? playerGold
    ) || 0));
    if (knownGold < travelCost) {
      const message = `快速传送需要 ${travelCost} 金币，当前金币不足。`;
      setPendingFastTravel((current) => current ? { ...current, currentGold: knownGold, error: message } : current);
      addNotification(message, 'warning');
      return;
    }

    const fromLabel = getMapConfig(currentMapName).displayName;
    const toLabel = mapConfig.displayName;
    const transitId = `${currentMapName}:${targetMapName}:${Date.now()}`;
    const baseTransit = {
      id: transitId,
      phase: 'departing',
      fromLabel,
      toLabel,
      terrain: getFastTravelStationMeta(targetMapName)?.terrain || 'meadow',
      renderMode: getAdventureMapInfo(currentMapName)?.renderMode || getAdventureMapInfo(targetMapName)?.renderMode || null,
      travelDirection: 'right'
    };
    let latestGoldForFailure = knownGold;
    setFastTravelBusy(true);
    setPendingFastTravel(null);
    setFastTravelTransitTarget(baseTransit);

    try {
      const resourcesPromise = refreshPlayerResources();
      await wait(920);
      setFastTravelTransitTarget((current) => current?.id === transitId ? { ...current, phase: 'syncing' } : current);

      const resources = await resourcesPromise;
      latestGoldForFailure = resources.gold;
      if (resources.gold < travelCost) {
        const message = `快速传送需要 ${travelCost} 金币，当前金币不足。`;
        setPendingFastTravel({ ...travelRequest, currentGold: resources.gold, error: message });
        addNotification(message, 'warning');
        return;
      }

      const targetStation = normalizeWorldPosition(
        getFastTravelStation(targetMapName) || getMapStartPosition(targetMapName),
        getMapStartPosition(targetMapName)
      );
      const nextPosition = {
        ...targetStation,
        direction: targetStation.direction || 'down'
      };
      const nextMapLevel = Math.max(1, Math.trunc(Number(mapConfig.recommendedLevel) || 1));
      const restoreContext = travelRequest.context || {};
      const eventCooldown = Math.max(0, Math.trunc(Number(
        restoreContext.encounterCooldownSteps ?? encounterCooldownStepsRef.current ?? encounterCooldownSteps
      ) || 0));

      const commitResult = await commitCloudSnapshotWithResources({
        buildSnapshot: (baseSnapshot) => {
          const nextWorld = normalizeWorldState(baseSnapshot.world, {
            currentMapName: targetMapName,
            playerPos: nextPosition
          });
          return {
            ...baseSnapshot,
            useRealMaps: true,
            currentMapName: targetMapName,
            mapGrid: buildMapGridForWorld(targetMapName, nextWorld, loadPokemonMap(targetMapName)),
            playerPos: nextPosition,
            mapLevel: nextMapLevel,
            maxReachedLevel: Math.max(Number(baseSnapshot.maxReachedLevel) || 1, nextMapLevel),
            encounterCooldownSteps: Math.max(2, eventCooldown),
            view: 'map',
            world: nextWorld,
            logs: appendSnapshotLogs(baseSnapshot, [`地图: 快速传送至${mapConfig.displayName}，消耗 ${travelCost} 金币。`])
          };
        },
        goldDelta: -travelCost,
        goldReason: `快速传送至${mapConfig.displayName}`
      });
      if (!commitResult.success) {
        const message = commitResult.message || '快速传送失败，请重试。';
        setPendingFastTravel({ ...travelRequest, currentGold: resources.gold, error: message });
        addNotification(message, commitResult.requiresReload ? 'error' : 'warning');
        return;
      }
      gameAudio.playTravel({ kind: 'fast' });

      setFastTravelTransitTarget((current) => current?.id === transitId ? {
        ...current,
        phase: 'arriving',
        travelDirection: nextPosition.direction || 'down',
        renderMode: getAdventureMapInfo(targetMapName)?.renderMode || null
      } : current);
      await wait(1120);
    } catch (error) {
      const message = error?.message || '快速传送失败，请重试。';
      setPendingFastTravel({ ...travelRequest, currentGold: latestGoldForFailure, error: message });
      addNotification(message, 'error');
    } finally {
      setFastTravelBusy(false);
      setFastTravelTransitTarget(null);
    }
  }, [
    addNotification,
    commitCloudSnapshotWithResources,
    currentMapName,
    encounterCooldownSteps,
    fastTravelBusy,
    hasLoadedCloudSave,
    pendingFastTravel,
    playerGold,
    playerTeam,
    refreshPlayerResources,
    user?.id,
    world
  ]);

  useEffect(() => {
    if (view === 'map' || !pendingFastTravel) return;
    setPendingFastTravel(null);
    setFastTravelBusy(false);
    setFastTravelTransitTarget(null);
  }, [pendingFastTravel, view]);

  const commitRosterMutation = useCallback(async (mutateRoster, options = {}) => {
    const {
      logMessage,
      notificationMessage,
      notificationType = 'info',
      includePendingMonsterAcquisition = false,
      nextPendingMonsterAcquisition = undefined,
    } = options;

    if (typeof mutateRoster !== 'function') {
      return false;
    }

    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('云端未就绪，队伍未保存。', 'error');
      return false;
    }

    const commitResult = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => {
        const baseResult = mutateRoster({
          playerTeam: Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [],
          storageBox: Array.isArray(baseSnapshot.storageBox) ? baseSnapshot.storageBox : [],
          activePlayerId: baseSnapshot.activePlayerId,
          pendingMonsterAcquisition: baseSnapshot.pendingMonsterAcquisition,
        });

        if (!baseResult?.success) {
          return abortCloudSnapshotCommit(
            baseResult?.message || '队伍已变化，请重试。',
            baseResult?.notificationType || 'warning'
          );
        }

        return {
          ...baseSnapshot,
          playerTeam: baseResult.playerTeam,
          storageBox: baseResult.storageBox,
          activePlayerId: resolveDefaultActivePlayerId(baseResult.playerTeam, baseResult.activePlayerId),
          pendingMonsterAcquisition: includePendingMonsterAcquisition
            ? (nextPendingMonsterAcquisition ?? null)
            : baseSnapshot.pendingMonsterAcquisition,
          logs: logMessage ? appendSnapshotLogs(baseSnapshot, [logMessage]) : baseSnapshot.logs
        };
      }
    });

    if (commitResult.success) {
      if (notificationMessage) {
        addNotification(notificationMessage, notificationType);
      }
      gameAudio.playUiConfirm();
      return true;
    }

    if (commitResult.message) {
      addNotification(
        commitResult.message,
        commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
      );
    }
    return false;
  }, [
    addNotification,
    commitCloudSnapshot,
    hasLoadedCloudSave,
    user?.id,
  ]);

  const handleUseItem = async (itemKey) => {
    if (turn !== 'player' || gameOver) return false;
    if (activeEnemyMon && isBattleMonFainted(activePlayerMon)) {
      addLog('宝可梦倒下了，请先替换上场。');
      return false;
    }
    if (battleKind === 'trainer') {
      addLog('训练家对战中不能使用精灵球。');
      return false;
    }
    const inventoryQuantity = getInventoryItemQuantity(playerInventory, 'pokeball', itemKey);
    if (inventoryQuantity <= 0) {
      addNotification('精灵球数量不足。', 'warning');
      return false;
    }
    const pokeball = POKEBALLS[itemKey];
    if (!pokeball) {
      addNotification('精灵球无效。', 'warning');
      return false;
    }

    const targetMon = activeEnemyMon;
    if (!targetMon || !activePlayerMon) {
      addNotification('没有可捕捉目标。', 'warning');
      return false;
    }
    if (isBattleMonFainted(targetMon)) {
      addLog('已经失去战斗能力的宝可梦无法捕捉。');
      return false;
    }

    const playerAvgLevel = getPlayerAverageLevel(playerTeam);
    const catchWarning = getCatchAttemptWarning(targetMon, playerAvgLevel);
    const finalCatchRate = calculateCatchRate({
      target: targetMon,
      ballMultiplier: pokeball.catchRateMultiplier,
      playerAverageLevel: playerAvgLevel
    });
    const caught = Math.random() * 100 < finalCatchRate;
    const caughtMonster = caught ? normalizeMonsterAssetSource({
      ...targetMon,
      id: `p${nextPlayerMonsterId}`,
      currentHp: getMonsterMaxHp(targetMon),
      currentMp: getMonsterMaxMp(targetMon),
      currentExp: 0,
      expToNextLevel: getExpToNextLevel(targetMon.level, targetMon)
    }) : null;

    const captureSequenceData = {
      success: caught,
      caughtMonster: caughtMonster ? sanitizeBattleRuntime(caughtMonster) : null,
      pokemonName: targetMon.name,
      pokemonSprite: targetMon.sprite,
      pokemonLevel: targetMon.level,
      ballName: pokeball.name,
      ballSprite: pokeball.sprite,
      catchRate: finalCatchRate
    };

    if (!user?.id || !hasLoadedCloudSave) {
      const message = '云端未就绪，暂不能捕捉。';
      addLog(`精灵球使用失败: ${message}`);
      addNotification(message, 'error');
      return false;
    }

    const captureLog = `${activePlayerMon.name} 使用了 ${pokeball.name}!`;
    const commitResult = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => {
        const nextInventory = consumeInventoryFromSnapshot(baseSnapshot, 'pokeball', itemKey, 1);
        if (!nextInventory || getInventoryItemQuantity(nextInventory, 'pokeball', itemKey) < 0) {
          return abortCloudSnapshotCommit('精灵球数量已变化，请重新读取。');
        }

        const snapshotLogs = [
          captureLog,
          ...(catchWarning ? [catchWarning] : [])
        ];

        return {
          ...baseSnapshot,
          view: 'battle',
          turn: 'capture',
          playerInventory: nextInventory,
          isThrowingPokeball: true,
          captureSequenceData,
          battlePhase: 'active',
          battlePhaseData: null,
          activeBattleEnergyCost: resolveTrackedActiveBattleEnergyCost(baseSnapshot.activeBattleEnergyCost),
          battleEnergyRefundEligible: false,
          logs: appendSnapshotLogs(baseSnapshot, snapshotLogs)
        };
      }
    });

    if (commitResult.success) {
      gameAudio.playItemUse({ category: 'potion' });
      return true;
    }

    if (commitResult.message) {
      addLog(`精灵球使用失败: ${commitResult.message}`);
      addNotification(
        commitResult.message,
        commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
      );
    }
    return false;
  };

  const handleCaptureSequenceComplete = useCallback(async (result) => {
    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('捕捉结果未保存，请重新读取。', 'error');
      return;
    }

    if (result?.success && result.caughtMonster) {
      const caughtMonster = sanitizeBattleRuntime(normalizeMonsterAssetSource(result.caughtMonster));
      const pendingCapture = {
        monster: caughtMonster,
        source: 'capture',
        createdAt: new Date().toISOString()
      };

      const commitResult = await commitCloudSnapshot({
        buildSnapshot: (baseSnapshot) => {
          const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam.map(clearBattleExitRuntime) : [];
          const baseStorageBox = Array.isArray(baseSnapshot.storageBox) ? baseSnapshot.storageBox : [];
          const baseActivePlayerId = resolveDefaultActivePlayerId(baseTeam, baseSnapshot.activePlayerId);
          const rosterResult = acquireMonster({
            playerTeam: baseTeam,
            storageBox: baseStorageBox,
            activePlayerId: baseActivePlayerId
          }, caughtMonster);

          if (!rosterResult?.success && !rosterResult?.needsDecision) {
            return abortCloudSnapshotCommit('捕捉结果未保存，请重新读取。', 'error');
          }

          return buildExitedBattleSnapshot(baseSnapshot, {
            playerTeam: rosterResult.needsDecision ? baseTeam : rosterResult.playerTeam,
            storageBox: rosterResult.needsDecision ? baseStorageBox : rosterResult.storageBox,
            activePlayerId: resolveDefaultActivePlayerId(
              rosterResult.needsDecision ? baseTeam : rosterResult.playerTeam,
              rosterResult.needsDecision ? baseActivePlayerId : rosterResult.activePlayerId
            ),
            nextPlayerMonsterId: Math.max(
              Number.isInteger(Number(baseSnapshot.nextPlayerMonsterId))
                ? Number(baseSnapshot.nextPlayerMonsterId)
                : 100,
              nextPlayerMonsterId + 1
            ),
            pendingMonsterAcquisition: rosterResult.needsDecision ? pendingCapture : null,
            logs: appendSnapshotLogs(baseSnapshot, [`成功捕捉到 ${result.pokemonName}!`])
          });
        }
      });

      if (commitResult.success) {
        activeBattleEnergyCostRef.current = 0;
        setBattleEnergyRefundEligible(false);
        gameAudio.playCaptureSuccess();
        if (result.pokemonName && !commitResult.saveRow?.game_data?.pendingMonsterAcquisition) {
          addNotification(`${result.pokemonName} 已加入队伍。`, 'item');
        }
        return;
      }

      if (commitResult.message) {
        addLog(`捕捉结算失败: ${commitResult.message}`);
        addNotification(
          commitResult.message,
          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
        );
      }
      return;
    }

    addLog(`哎呀！${result?.pokemonName || '野生宝可梦'} 挣脱了！`);
    const commitResult = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => ({
        ...baseSnapshot,
        turn: 'enemy',
        battlePhase: 'active',
        battlePhaseData: null,
        isThrowingPokeball: false,
        captureSequenceData: null,
        activeBattleEnergyCost: resolveTrackedActiveBattleEnergyCost(baseSnapshot.activeBattleEnergyCost),
        battleEnergyRefundEligible: false,
        logs: appendSnapshotLogs(baseSnapshot, [`哎呀！${result?.pokemonName || '野生宝可梦'} 挣脱了！`])
      })
    });

    if (commitResult.success) {
      gameAudio.playCaptureFail();
      return;
    }

    if (commitResult.message) {
      addLog(`捕捉结算失败: ${commitResult.message}`);
      addNotification(
        commitResult.message,
        commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
      );
    }
  }, [addLog, addNotification, commitCloudSnapshot, hasLoadedCloudSave, nextPlayerMonsterId, resolveTrackedActiveBattleEnergyCost, user?.id]);

  // 胜利过场结束后返回地图
  const handleVictoryContinue = useCallback(async () => {
    const exitLog = '你回到了地图上。';
    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('云端未就绪，胜利未保存。', 'error');
      return;
    }
    let completedBattleEventLockKeys = [];
    let completedBattleEventWorld = null;
    let completedBattleEventMapName = null;
    let completedBattleEventLocalOverrideMeta = null;

    const commitResult = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => {
        const hydratedBattleSnapshot = hydrateCommittedBattleSnapshot(baseSnapshot);
        const committedSnapshot = hydratedBattleSnapshot.snapshot;
        const completionMeta = getConfiguredBattleCompletionMeta({
          snapshot: committedSnapshot,
          battleEnvironment: hydratedBattleSnapshot.battleEnvironment,
          fallbackMapName: currentMapName
        });
        const completionResult = applyConfiguredBattleCompletionToWorld(committedSnapshot.world, completionMeta);
        completedBattleEventWorld = completionResult.world;
        completedBattleEventMapName = completionMeta.mapName;
        completedBattleEventLockKeys = getBattleEventCompletedLockKeys({
          world: completionResult.world,
          mapName: completionMeta.mapName,
          eventType: completionMeta.eventType,
          eventId: completionMeta.eventId,
          eventRole: completionMeta.eventRole
        });
        completedBattleEventLocalOverrideMeta = {
          world: completionResult.world,
          mapName: completionMeta.mapName,
          eventType: completionMeta.eventType,
          eventId: completionMeta.eventId,
          eventRole: completionMeta.eventRole
        };

        return buildExitedBattleSnapshot(committedSnapshot, {
          world: completionResult.world,
          playerTeam: (Array.isArray(committedSnapshot.playerTeam) ? committedSnapshot.playerTeam : []).map(clearBattleExitRuntime),
          logs: appendSnapshotLogs(committedSnapshot, [exitLog])
        });
      }
    });

    if (commitResult.success) {
      completedBattleEventLockKeys.forEach((key) => completedBattleEventLockRef.current.add(key));
      markCompletedBattleEventLocally(completedBattleEventLocalOverrideMeta || {});
      if (completedBattleEventWorld) {
        const syncedWorld = mergeMonotonicWorldProgress(worldRef.current, completedBattleEventWorld, {
          currentMapName: completedBattleEventMapName || currentMapName,
          playerPos: playerPosRef.current || playerPos
        });
        worldRef.current = syncedWorld;
        setWorld(syncedWorld);
        setMapGrid((prev) => buildMapGridForWorld(completedBattleEventMapName || currentMapName, syncedWorld, prev));
      }
      activeBattleEnergyCostRef.current = 0;
      setBattleEnergyRefundEligible(false);
      refreshPlayerResources();
      return;
    }

    if (commitResult.message) {
      addLog(`胜利结算收尾失败: ${commitResult.message}`);
      addNotification(
        commitResult.message,
        commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
      );
    }
  }, [addLog, addNotification, battleEnvironment, commitCloudSnapshot, currentMapName, hasLoadedCloudSave, hydrateCommittedBattleSnapshot, markCompletedBattleEventLocally, playerPos, refreshPlayerResources, user?.id]);

  // 逃跑过场结束后返回地图（成功逃跑退回本场已扣能量）
  const handleEscapeContinue = useCallback(async () => {
    const canRefundEnergy = Boolean(battleEnergyRefundEligible || latestCloudSnapshotRef.current?.battleEnergyRefundEligible);
    const refundAmount = canRefundEnergy
      ? resolveTrackedActiveBattleEnergyCost(latestCloudSnapshotRef.current?.activeBattleEnergyCost)
      : 0;
    const escapeLogs = refundAmount > 0
      ? ['逃跑成功，已退回战斗消耗的能量。', '你回到了地图上。']
      : ['你回到了地图上。'];
    const buildEscapeExitSnapshot = (baseSnapshot) => buildExitedBattleSnapshot(baseSnapshot, {
      playerTeam: (Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : []).map(clearBattleExitRuntime),
      logs: escapeLogs
    });

    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('云端未就绪，逃跑未保存。', 'error');
      return;
    }

    if (refundAmount <= 0) {
      const commitResult = await commitCloudSnapshot({
        buildSnapshot: buildEscapeExitSnapshot
      });
      if (commitResult.success) {
        activeBattleEnergyCostRef.current = 0;
        setBattleEnergyRefundEligible(false);
        gameAudio.playEscape({ success: true });
        return;
      }

      const recoveryMessage = commitResult.message || '逃跑未保存，请重新读取。';
      if (commitResult.requiresReload) {
        setRequiresCloudReload(true);
      }
      setSyncError(recoveryMessage);
      setSaveStatus('error');
      addLog(`逃跑结算: ${recoveryMessage}`);
      addNotification(
        recoveryMessage,
        commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
      );
      return;
    }

    const atomicResult = await commitCloudSnapshotWithResources({
      buildSnapshot: buildEscapeExitSnapshot,
      energyDelta: refundAmount,
      energyReason: '逃跑成功退回能量',
    });
    if (atomicResult.success) {
      gameAudio.playEscape({ success: true });
      activeBattleEnergyCostRef.current = 0;
      setBattleEnergyRefundEligible(false);
      return;
    }

    const recoveryMessage = atomicResult.message || '逃跑未保存，请重新读取。';
    if (atomicResult.requiresReload) {
      setRequiresCloudReload(true);
      setSyncError(recoveryMessage);
    }
    setSaveStatus('error');
    addLog(`逃跑结算: ${recoveryMessage}`);
    addNotification(
      recoveryMessage,
      atomicResult.requiresReload ? 'error' : 'warning'
    );
  }, [addLog, addNotification, battleEnergyRefundEligible, commitCloudSnapshot, commitCloudSnapshotWithResources, hasLoadedCloudSave, resolveTrackedActiveBattleEnergyCost, user?.id]);

  const handleRun = useCallback(async () => {
    if (turn !== 'player') return;
    if (activeEnemyMon && isBattleMonFainted(activePlayerMon)) {
      addLog('宝可梦倒下了，请先替换上场。');
      return;
    }
    if (!battleEscapeRule.canRun) {
      addLog(battleEscapeRule.blockedReason || '当前战斗不能逃跑。');
      return;
    }
    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('云端未就绪，暂不能逃跑。', 'error');
      return;
    }
    const escapeAttemptLog = '你尝试逃跑...';
    const escapeSuccessLog = battleEnergyRefundEligible
      ? '成功逃跑了!（未进入战斗，能量将退回）'
      : '成功逃跑了!';
    const escapeFailureLog = '没能甩开对手，逃跑失败！';
    const escapeChance = getEscapeChance(activePlayerMon, activeEnemyMon);
    const escapeSucceeded = Math.random() < escapeChance;

    if (escapeSucceeded) {
      gameAudio.playEscape({ success: true });
      const commitResult = await commitCloudSnapshot({
        buildSnapshot: (baseSnapshot) => ({
          ...baseSnapshot,
          battlePhase: 'escape',
          battlePhaseData: null,
          turn: 'player',
          activeBattleEnergyCost: resolveTrackedActiveBattleEnergyCost(baseSnapshot.activeBattleEnergyCost),
          battleEnergyRefundEligible: Boolean(battleEnergyRefundEligible),
          logs: appendSnapshotLogs(baseSnapshot, [escapeAttemptLog, escapeSuccessLog])
        })
      });
      if (!commitResult.success && commitResult.message) {
        addLog(`逃跑阶段切换失败: ${commitResult.message}`);
        addNotification(
          commitResult.message,
          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
        );
      }
      return;
    }

    gameAudio.playEscape({ success: false });
    const commitResult = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => ({
        ...baseSnapshot,
        turn: 'enemy',
        activeBattleEnergyCost: resolveTrackedActiveBattleEnergyCost(baseSnapshot.activeBattleEnergyCost),
        battleEnergyRefundEligible: false,
        logs: appendSnapshotLogs(baseSnapshot, [escapeAttemptLog, escapeFailureLog])
      })
    });
    if (!commitResult.success && commitResult.message) {
      addLog(`逃跑阶段切换失败: ${commitResult.message}`);
      addNotification(
        commitResult.message,
        commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
      );
    }
  }, [activeEnemyMon, activePlayerMon, addLog, addNotification, battleEnergyRefundEligible, battleEscapeRule, commitCloudSnapshot, getEscapeChance, hasLoadedCloudSave, resolveTrackedActiveBattleEnergyCost, turn, user?.id]);

  const handleUsePotion = useCallback(async (monsterId, potionKey) => {
    const potion = POTIONS[potionKey];
    if (!potion) {
      addNotification('药剂无效。', 'warning');
      return false;
    }
    if (getInventoryItemQuantity(playerInventory, 'potion', potionKey) <= 0) {
      addNotification(`${potion.name} 数量不足。`, 'warning');
      return false;
    }
    if (view === 'battle' && activeEnemyId && isBattleMonFainted(activePlayerMon)) {
      addNotification('宝可梦倒下了，请先替换上场。', 'warning');
      return false;
    }
    const shouldYieldTurnToEnemy = view === 'battle' && battlePhase === 'active' && !!activeEnemyId;

    const targetMon = playerTeam.find((m) => m.id === monsterId);
    if (!targetMon) {
      addNotification('只能对队伍宝可梦使用。', 'error');
      return false;
    }
    const maxHp = getMonsterMaxHp(targetMon);
    const maxMp = getMonsterMaxMp(targetMon);
    const currentHp = getMonsterCurrentHp(targetMon, maxHp);
    const currentMp = getMonsterCurrentMp(targetMon, maxMp);
    const recoveryProfile = getPotionRecoveryProfile(potion);
    const hpRestoreAmount = Math.max(0, Math.min(recoveryProfile.hp, maxHp - currentHp));
    const mpRestoreAmount = Math.max(0, Math.min(recoveryProfile.mp, maxMp - currentMp));
    const curesStatus = hasPotionCurableStatus(targetMon);
    if (hpRestoreAmount <= 0 && mpRestoreAmount <= 0 && !curesStatus) {
      addNotification(`${targetMon.name} 状态已满。`, 'info');
      return false;
    }

    if (!user?.id || !hasLoadedCloudSave) {
      const message = '云端未就绪，暂不能用药。';
      addLog(`药剂使用失败: ${message}`);
      addNotification(message, 'error');
      return false;
    }

    const commitResult = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => {
        const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [];
        const baseTarget = baseTeam.find((mon) => mon.id === monsterId);
        if (!baseTarget) {
          return abortCloudSnapshotCommit('目标已变化，请重试。');
        }

        const baseMaxHp = getMonsterMaxHp(baseTarget);
        const baseMaxMp = getMonsterMaxMp(baseTarget);
        const baseCurrentHp = getMonsterCurrentHp(baseTarget, baseMaxHp);
        const baseCurrentMp = getMonsterCurrentMp(baseTarget, baseMaxMp);
        const baseHpRestoreAmount = Math.max(0, Math.min(recoveryProfile.hp, baseMaxHp - baseCurrentHp));
        const baseMpRestoreAmount = Math.max(0, Math.min(recoveryProfile.mp, baseMaxMp - baseCurrentMp));
        const baseCuresStatus = hasPotionCurableStatus(baseTarget);
        if (baseHpRestoreAmount <= 0 && baseMpRestoreAmount <= 0 && !baseCuresStatus) {
          return abortCloudSnapshotCommit(`${baseTarget.name} 状态已满。`, 'info');
        }

        const nextInventory = consumeInventoryFromSnapshot(baseSnapshot, 'potion', potionKey, 1);
        if (!nextInventory || getInventoryItemQuantity(nextInventory, 'potion', potionKey) < 0) {
          return abortCloudSnapshotCommit('药剂数量已变化，请重新读取。');
        }

        return {
          ...baseSnapshot,
          playerTeam: baseTeam.map((mon) => (
            mon.id === monsterId
              ? clearPotionCurableStatus({
                ...mon,
                currentHp: Math.min(baseMaxHp, baseCurrentHp + recoveryProfile.hp),
                currentMp: Math.min(baseMaxMp, baseCurrentMp + recoveryProfile.mp)
              })
              : mon
          )),
          playerInventory: nextInventory,
          turn: shouldYieldTurnToEnemy ? 'enemy' : baseSnapshot.turn,
          activeBattleEnergyCost: shouldYieldTurnToEnemy
            ? resolveTrackedActiveBattleEnergyCost(baseSnapshot.activeBattleEnergyCost)
            : baseSnapshot.activeBattleEnergyCost,
          battleEnergyRefundEligible: shouldYieldTurnToEnemy ? false : baseSnapshot.battleEnergyRefundEligible,
          logs: appendSnapshotLogs(baseSnapshot, [
            `${baseTarget.name} 使用了 ${potion.name}，${getRecoveryBehaviorText({ hp: baseHpRestoreAmount, mp: baseMpRestoreAmount, curedStatus: baseCuresStatus })}！`
          ])
        };
      }
    });

    if (commitResult.success) {
      return true;
    }

    if (commitResult.message) {
      addLog(`药剂使用失败: ${commitResult.message}`);
      addNotification(
        commitResult.message,
        commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
      );
    }
    return false;
  }, [activeEnemyId, activePlayerMon, addLog, addNotification, battlePhase, commitCloudSnapshot, hasLoadedCloudSave, playerInventory, playerTeam, resolveTrackedActiveBattleEnergyCost, user?.id, view]);

  const handleUseExpPotion = useCallback(async (monsterId, potionKey) => {
    const potion = EXP_POTIONS[potionKey];
    if (!potion) {
      addNotification('经验药水无效。', 'warning');
      return false;
    }
    if (getInventoryItemQuantity(playerInventory, 'expPotion', potionKey) <= 0) {
      addNotification(`${potion.name} 数量不足。`, 'warning');
      return false;
    }
    if (view === 'battle' && activeEnemyId && isBattleMonFainted(activePlayerMon)) {
      addNotification('宝可梦倒下了，请先替换上场。', 'warning');
      return false;
    }

    const targetMon = playerTeam.find((m) => m.id === monsterId);
    if (!targetMon) {
      addNotification('只能对队伍宝可梦使用。', 'error');
      return false;
    }
    if (targetMon.level >= 100) {
      addNotification(`${targetMon.name} 已满级。`, 'info');
      return false;
    }

    const releaseGrowthModalDelay = holdGrowthModalsForItemAnimation();
    const fallbackGrowthPreview = simulateMonsterExpGain(
      targetMon,
      potion.expAmount,
      getBaseMonsterDefinition,
      pendingGrowthEvents
    );

    if (!user?.id || !hasLoadedCloudSave) {
      releaseGrowthModalDelay(0);
      const message = '云端未就绪，暂不能使用经验药水。';
      addLog(`经验药水使用失败: ${message}`);
      addNotification(message, 'error');
      return false;
    }

    let committedGrowthPreview = fallbackGrowthPreview;
    const commitResult = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => {
        const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [];
        const baseTarget = baseTeam.find((mon) => mon.id === monsterId);
        if (!baseTarget) {
          return abortCloudSnapshotCommit('目标已变化，请重试。');
        }
        if (baseTarget.level >= 100) {
          return abortCloudSnapshotCommit(`${baseTarget.name} 已满级。`, 'info');
        }

        const nextInventory = consumeInventoryFromSnapshot(baseSnapshot, 'expPotion', potionKey, 1);
        if (!nextInventory || getInventoryItemQuantity(nextInventory, 'expPotion', potionKey) < 0) {
          return abortCloudSnapshotCommit('经验药水数量已变化，请重新读取。');
        }

        committedGrowthPreview = simulateMonsterExpGain(
          baseTarget,
          potion.expAmount,
          getBaseMonsterDefinition,
          normalizePendingGrowthEvents(baseSnapshot.pendingGrowthEvents)
        );

        if (!committedGrowthPreview?.updatedMon) {
          return abortCloudSnapshotCommit('经验药水未产生有效成长结果，请重试。');
        }

        return {
          ...baseSnapshot,
          playerTeam: baseTeam.map((mon) => (
            mon.id === monsterId ? committedGrowthPreview.updatedMon : mon
          )),
          pendingGrowthEvents: normalizePendingGrowthEvents([
            ...normalizePendingGrowthEvents(baseSnapshot.pendingGrowthEvents),
            ...(Array.isArray(committedGrowthPreview.events) ? committedGrowthPreview.events : [])
          ]),
          playerInventory: nextInventory,
          logs: appendSnapshotLogs(baseSnapshot, [
            `${baseTarget.name} 获得了 ${potion.expAmount} 经验值！`,
            ...committedGrowthPreview.levelUps.map(({ name, fromLevel, toLevel }) => `${name} 升级了！Lv.${fromLevel} → Lv.${toLevel}`)
          ])
        };
      }
    });

    if (!commitResult.success) {
      releaseGrowthModalDelay(0);
      if (commitResult.message) {
        addLog(`经验药水使用失败: ${commitResult.message}`);
        addNotification(
          commitResult.message,
          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
        );
      }
      return false;
    }

    releaseGrowthModalDelay(EXP_ANIMATION_DURATION_MS);
    gameAudio.playItemUse({ category: 'exp' });
    scheduleLevelUpCelebration(
      committedGrowthPreview.levelUps,
      committedGrowthPreview.updatedMon || targetMon,
      EXP_ANIMATION_DURATION_MS
    );
    return {
      success: true,
      expAmount: potion.expAmount,
      levelUps: committedGrowthPreview.levelUps,
      hasEvolution: committedGrowthPreview.events.some((evt) => evt.type === 'evolution' || evt.type === 'evolutionChoice'),
    };
  }, [
    addLog,
    addNotification,
    commitCloudSnapshot,
    getBaseMonsterDefinition,
    hasLoadedCloudSave,
    holdGrowthModalsForItemAnimation,
    pendingGrowthEvents,
    playerInventory,
    playerTeam,
    scheduleLevelUpCelebration,
    user?.id,
    view
  ]);

  const handleReleaseMonster = useCallback(async (monsterId, from = 'party') => {
    if (activeEnemyMon && from === 'party') {
      addNotification('战斗中不能放生。', 'error');
      return false;
    }

    const releasedMon = from === 'party'
      ? playerTeam.find((mon) => mon.id === monsterId)
      : storageBox.find((mon) => mon.id === monsterId);

    return commitRosterMutation(({ playerTeam: baseTeam, storageBox: baseStorageBox, activePlayerId: baseActivePlayerId }) => {
      const result = releaseMonster({ playerTeam: baseTeam, storageBox: baseStorageBox, activePlayerId: baseActivePlayerId }, monsterId, { from });
      if (result.success) return result;
      if (result.error === 'min_party') {
        return { success: false, message: '队伍至少保留一只。', notificationType: 'error' };
      }
      return { success: false, message: '未找到目标宝可梦。', notificationType: 'warning' };
    }, {
      logMessage: `${releasedMon?.name || '宝可梦'} 已放生。`,
      notificationMessage: `${releasedMon?.name || '宝可梦'} 已放生。`
    });
  }, [activeEnemyMon, addNotification, commitRosterMutation, playerTeam, storageBox]);

  const handleDepositToStorage = useCallback(async (monsterId) => {
    const targetMon = playerTeam.find((mon) => mon.id === monsterId);
    return commitRosterMutation(({ playerTeam: baseTeam, storageBox: baseStorageBox, activePlayerId: baseActivePlayerId }) => {
      const result = depositToStorage({ playerTeam: baseTeam, storageBox: baseStorageBox, activePlayerId: baseActivePlayerId }, monsterId);
      if (result.success) return result;
      if (result.error === 'min_party') {
        return { success: false, message: '队伍至少保留一只。', notificationType: 'error' };
      }
      if (result.error === 'storage_full') {
        return { success: false, message: '仓库已满。', notificationType: 'error' };
      }
      return { success: false, message: '未找到目标宝可梦。', notificationType: 'warning' };
    }, {
      logMessage: `${targetMon?.name || '宝可梦'} 已存入仓库。`,
      notificationMessage: `${targetMon?.name || '宝可梦'} 已存入仓库。`
    });
  }, [commitRosterMutation, playerTeam]);

  const handleWithdrawFromStorage = useCallback(async (monsterId) => {
    const targetMon = storageBox.find((mon) => mon.id === monsterId);
    return commitRosterMutation(({ playerTeam: baseTeam, storageBox: baseStorageBox, activePlayerId: baseActivePlayerId }) => {
      const result = withdrawToParty({ playerTeam: baseTeam, storageBox: baseStorageBox, activePlayerId: baseActivePlayerId }, monsterId);
      if (result.success) return result;
      if (result.error === 'party_full') {
        return { success: false, message: '队伍已满，请先调整。', notificationType: 'error' };
      }
      return { success: false, message: '未找到目标宝可梦。', notificationType: 'warning' };
    }, {
      logMessage: `${targetMon?.name || '宝可梦'} 已加入队伍。`,
      notificationMessage: `${targetMon?.name || '宝可梦'} 已加入队伍。`
    });
  }, [commitRosterMutation, storageBox]);

  const handleSwapPartyAndStorage = useCallback(async (partyId, storageId) => {
    const oldPartyMon = playerTeam.find((mon) => mon.id === partyId);
    const oldStorageMon = storageBox.find((mon) => mon.id === storageId);
    return commitRosterMutation(({ playerTeam: baseTeam, storageBox: baseStorageBox, activePlayerId: baseActivePlayerId }) => {
      const result = swapPartyAndStorage({ playerTeam: baseTeam, storageBox: baseStorageBox, activePlayerId: baseActivePlayerId }, partyId, storageId);
      if (result.success) return result;
      return { success: false, message: '目标已变化，请重试。', notificationType: 'warning' };
    }, {
      logMessage: `${oldStorageMon?.name || '仓库宝可梦'} 与 ${oldPartyMon?.name || '队伍宝可梦'} 完成互换。`,
      notificationMessage: '队伍与仓库已互换。'
    });
  }, [commitRosterMutation, playerTeam, storageBox]);

  const handleSendPendingMonsterToStorage = useCallback(async () => {
    const pending = pendingMonsterAcquisition;
    if (!pending?.monster) return false;
    return commitRosterMutation(({ playerTeam: baseTeam, storageBox: baseStorageBox, activePlayerId: baseActivePlayerId, pendingMonsterAcquisition: basePending }) => {
      if (!basePending?.monster || basePending.monster.id !== pending.monster.id) {
        return { success: false, message: '待安置宝可梦已变化。', notificationType: 'warning' };
      }
      const result = addToStorage({ playerTeam: baseTeam, storageBox: baseStorageBox, activePlayerId: baseActivePlayerId }, basePending.monster);
      if (result.success) return result;
      return { success: false, message: '仓库已满，请替换或放弃。', notificationType: 'error' };
    }, {
      logMessage: `${pending.monster.name} 已送入仓库。`,
      notificationMessage: `${pending.monster.name} 已送入仓库。`,
      includePendingMonsterAcquisition: true,
      nextPendingMonsterAcquisition: null,
    });
  }, [commitRosterMutation, pendingMonsterAcquisition]);

  const handleReplaceWithPendingMonster = useCallback(async (partyId) => {
    const pending = pendingMonsterAcquisition;
    if (!pending?.monster) return false;
    const replacedMonster = playerTeam.find((mon) => mon.id === partyId);
    return commitRosterMutation(({ playerTeam: baseTeam, storageBox: baseStorageBox, activePlayerId: baseActivePlayerId, pendingMonsterAcquisition: basePending }) => {
      if (!basePending?.monster || basePending.monster.id !== pending.monster.id) {
        return { success: false, message: '待安置宝可梦已变化。', notificationType: 'warning' };
      }
      const result = replacePartyMember({ playerTeam: baseTeam, storageBox: baseStorageBox, activePlayerId: baseActivePlayerId }, partyId, basePending.monster);
      if (result.success) return result;
      if (result.error === 'storage_full') {
        return { success: false, message: '仓库已满，无法替换。', notificationType: 'error' };
      }
      return { success: false, message: '目标已变化，请重选。', notificationType: 'warning' };
    }, {
      logMessage: `${pending.monster.name} 替换了 ${replacedMonster?.name || '队伍宝可梦'}，${replacedMonster?.name || '原宝可梦'} 已送入仓库。`,
      notificationMessage: `${pending.monster.name} 已加入队伍。`
      ,
      includePendingMonsterAcquisition: true,
      nextPendingMonsterAcquisition: null,
    });
  }, [commitRosterMutation, pendingMonsterAcquisition, playerTeam]);

  const handleReleasePendingMonster = useCallback(async () => {
    const pending = pendingMonsterAcquisition;
    if (!pending?.monster) return false;
    const releaseLog = `${pending.monster.name} 已放回野外。`;

    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('云端未就绪，放弃未保存。', 'error');
      return false;
    }

    const commitResult = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => {
        const basePending = baseSnapshot.pendingMonsterAcquisition;
        if (!basePending?.monster || basePending.monster.id !== pending.monster.id) {
          return abortCloudSnapshotCommit('待安置宝可梦已变化。');
        }
        return {
          ...baseSnapshot,
          pendingMonsterAcquisition: null,
          logs: appendSnapshotLogs(baseSnapshot, [releaseLog])
        };
      }
    });

    if (commitResult.success) {
      addNotification(`${pending.monster.name} 已放回野外。`, 'info');
      return true;
    }
    if (commitResult.message) {
      addNotification(
        commitResult.message,
        commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
      );
    }
    return false;
  }, [addNotification, commitCloudSnapshot, hasLoadedCloudSave, pendingMonsterAcquisition, user?.id]);

const handleReorderTeam = useCallback((newTeam) => {
    const reorderRoster = sanitizeRoster(newTeam, storageBox, newTeam[0]?.id ?? activePlayerId);
    const nextLead = reorderRoster.playerTeam[0]?.id ?? null;
    const leadChanged = Boolean(nextLead && nextLead !== activePlayerId);
    const nextLeadName = reorderRoster.playerTeam[0]?.name || '宝可梦';

    const currentRoster = sanitizeRoster(playerTeam, storageBox, activePlayerId);
    const currentIds = currentRoster.playerTeam.map((mon) => mon.id).sort();
    const targetIds = reorderRoster.playerTeam.map((mon) => mon.id).sort();
    if (
      currentIds.length !== targetIds.length ||
      currentIds.some((id, index) => id !== targetIds[index])
    ) {
      addNotification('队伍已变化，请重排。', 'warning');
      return false;
    }

    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('云端未就绪，顺序未保存。', 'error');
      return false;
    }

    return commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => {
        const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [];
        const baseStorageBox = Array.isArray(baseSnapshot.storageBox) ? baseSnapshot.storageBox : [];
        const baseRoster = sanitizeRoster(baseTeam, baseStorageBox, baseSnapshot.activePlayerId);
        const baseCurrentIds = baseRoster.playerTeam.map((mon) => mon.id).sort();
        const nextRosterIds = reorderRoster.playerTeam.map((mon) => mon.id).sort();

        if (
          baseCurrentIds.length !== nextRosterIds.length ||
          baseCurrentIds.some((id, index) => id !== nextRosterIds[index])
        ) {
          return abortCloudSnapshotCommit('队伍已变化，请重排。');
        }

        return {
          ...baseSnapshot,
          playerTeam: reorderRoster.playerTeam,
          storageBox: reorderRoster.storageBox,
          activePlayerId: reorderRoster.activePlayerId,
          logs: appendSnapshotLogs(baseSnapshot, [
            leadChanged ? `首发宝可梦已切换为 ${nextLeadName}!` : '队伍顺序已调整。'
          ])
        };
      }
    }).then((commitResult) => {
      if (commitResult.success) {
        return true;
      }
      if (commitResult.message) {
        addNotification(
          commitResult.message,
          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
        );
      }
      return false;
    });
  }, [
    activePlayerId,
    addNotification,
    commitCloudSnapshot,
    hasLoadedCloudSave,
    playerTeam,
    storageBox,
    user?.id,
  ]);

  // 失败结算实际执行（由过场 onContinue 调用）
  const handleDefeatContinue = useCallback(async () => {
    const rawPenalty = getDefeatGoldPenalty({ battleKind, mapLevel });
    const payablePenalty = getPayableDefeatGoldPenalty(rawPenalty, playerGold);
    const defeatSummary = createDefeatSummary(payablePenalty, rawPenalty);
    const createBuildDefeatExitSnapshot = (summaryMessage) => (baseSnapshot) => buildExitedBattleSnapshot(baseSnapshot, {
      playerTeam: (Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : []).map((mon) => (
        sanitizeBattleRuntime({ ...mon, currentHp: getMonsterMaxHp(mon), currentMp: getMonsterMaxMp(mon) })
      )),
      logs: appendSnapshotLogs(baseSnapshot, [summaryMessage])
    });
    const buildDefeatExitSnapshot = createBuildDefeatExitSnapshot(defeatSummary);

    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('云端未就绪，战败未保存。', 'error');
      return;
    }

    if (payablePenalty <= 0) {
      const commitResult = await commitCloudSnapshot({
        buildSnapshot: buildDefeatExitSnapshot
      });
      if (commitResult.success) {
        activeBattleEnergyCostRef.current = 0;
        setBattleEnergyRefundEligible(false);
        gameAudio.playDefeat();
        return;
      }

      if (commitResult.message) {
        addLog(`战斗结算: ${commitResult.message}`);
        addNotification(
          commitResult.message,
          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
        );
      }
      return;
    }

      const goldReason = battleKind === 'trainer' ? '训练家对战失败损失' : '野外战斗失败损失';
      const atomicResult = await commitCloudSnapshotWithResources({
        buildSnapshot: buildDefeatExitSnapshot,
        goldDelta: -payablePenalty,
        goldReason,
      });
	      if (atomicResult.success) {
	        activeBattleEnergyCostRef.current = 0;
	        setBattleEnergyRefundEligible(false);
          gameAudio.playDefeat();
	        return;
	      }
      if (isInsufficientGoldMessage(atomicResult.message)) {
        const noPenaltySummary = createDefeatSummary(0, rawPenalty);
        const commitResult = await commitCloudSnapshot({
          buildSnapshot: createBuildDefeatExitSnapshot(noPenaltySummary)
        });
	        if (commitResult.success) {
	          refreshPlayerResources();
	          activeBattleEnergyCostRef.current = 0;
	          setBattleEnergyRefundEligible(false);
            gameAudio.playDefeat();
	          return;
	        }
        if (commitResult.message) {
          addLog(`战斗结算: ${commitResult.message}`);
          addNotification(
            commitResult.message,
            commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
          );
        }
        return;
      }
      addLog(`战斗结算: ${atomicResult.message || '战败未保存，请重新读取。'}`);
      addNotification(
        atomicResult.message || '战败未保存，请重新读取。',
        atomicResult.requiresReload ? 'error' : 'warning'
      );
      return;
  }, [
    addLog,
    addNotification,
    battleKind,
    commitCloudSnapshot,
    commitCloudSnapshotWithResources,
    hasLoadedCloudSave,
    mapLevel,
    playerGold,
    refreshPlayerResources,
    user?.id,
  ]);

  const handleBattleIntroComplete = useCallback(async () => {
    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('云端未就绪，入场暂停。', 'error');
      return;
    }

    const commitResult = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => {
        const baseActivePlayerId = baseSnapshot.activePlayerId || activePlayerId;
        const baseActivePlayer = (Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : []).find((mon) => mon.id === baseActivePlayerId) || activePlayerMon;
        const sendOutMessage = baseSnapshot.battlePhaseData?.message || getBattleSendOutMessage(baseActivePlayer);
        const preservedSendOutSide = baseSnapshot.battlePhaseData?.sendOutSide;
        const sendOutSide = ['player', 'enemy', 'both'].includes(preservedSendOutSide)
          ? preservedSendOutSide
          : ((baseSnapshot.battleKind || battleKind) === 'trainer' ? 'both' : 'player');
        const nextLogs = Array.isArray(baseSnapshot.logs) ? baseSnapshot.logs : [];
        return {
          ...baseSnapshot,
          battlePhase: 'sendout',
          battlePhaseData: {
            ...(baseSnapshot.battlePhaseData || {}),
            enemyMon: baseSnapshot.battlePhaseData?.enemyMon || baseSnapshot.enemyTeam?.find((mon) => mon.id === baseSnapshot.activeEnemyId) || activeEnemyMon,
            leadMonId: baseSnapshot.battlePhaseData?.leadMonId || baseActivePlayerId,
            message: sendOutMessage,
            sendOutSide
          },
          logs: nextLogs[nextLogs.length - 1] === sendOutMessage
            ? nextLogs
            : appendSnapshotLogs(baseSnapshot, [sendOutMessage]),
          turn: 'player'
        };
      }
    });

    if (commitResult.success) {
      return;
    }

    if (commitResult.message) {
      addLog(`战斗入场收尾失败: ${commitResult.message}`);
      addNotification(
        commitResult.message,
        commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
      );
    }
  }, [activeEnemyMon, activePlayerId, activePlayerMon, addLog, addNotification, battleKind, commitCloudSnapshot, hasLoadedCloudSave, user?.id]);

  const handleBattleSendOutComplete = useCallback(async () => {
    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('云端未就绪，出场暂停。', 'error');
      return;
    }

    const commitResult = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => {
        const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [];
        const baseActiveId = baseSnapshot.activePlayerId;
        const baseActiveMon = baseTeam.find((mon) => mon.id === baseActiveId);
        const hasAvailableBench = getAliveBattleBench(baseTeam, baseActiveId).length > 0;
        if (baseSnapshot.activeEnemyId && isBattleMonFainted(baseActiveMon) && hasAvailableBench) {
          return {
            ...baseSnapshot,
            view: 'team',
            battlePhase: 'active',
            battlePhaseData: null,
            turn: 'player',
            pendingBattleSwitch: null,
            logs: appendSnapshotLogs(baseSnapshot, ['宝可梦倒下了，请选择下一只。'])
          };
        }

        return {
          ...baseSnapshot,
          battlePhase: 'active',
          battlePhaseData: null,
          turn: 'player'
        };
      }
    });

    if (commitResult.success) {
      return;
    }

    if (commitResult.message) {
      addLog(`宝可梦出场收尾失败: ${commitResult.message}`);
      addNotification(
        commitResult.message,
        commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
      );
    }
  }, [addLog, addNotification, commitCloudSnapshot, hasLoadedCloudSave, user?.id]);

  useEffect(() => {
    if (view !== 'battle' || battlePhase !== 'active') {
      localBattleSwitchInFlightRef.current = null;
      return;
    }

    const normalizedPendingSwitch = normalizePendingBattleSwitch(pendingBattleSwitch);
    const activePendingSwitchKey = getPendingBattleSwitchKey(normalizedPendingSwitch);
    if (!activePendingSwitchKey) {
      localBattleSwitchInFlightRef.current = null;
      return;
    }

    if (localBattleSwitchInFlightRef.current?.key === activePendingSwitchKey) {
      if (localBattleSwitchInFlightRef.current?.source === 'live') return;
    }

    const targetMon = playerTeam.find((mon) => mon.id === normalizedPendingSwitch.nextActivePlayerId);
    if (!targetMon) {
      localBattleSwitchInFlightRef.current = null;
      return;
    }

    localBattleSwitchInFlightRef.current = {
      key: activePendingSwitchKey,
      previousActivePlayerId: normalizedPendingSwitch.previousActivePlayerId,
      nextActivePlayerId: normalizedPendingSwitch.nextActivePlayerId,
      forced: normalizedPendingSwitch.forced,
      source: 'recovery'
    };

    const recallMonster =
      playerTeam.find((mon) => mon.id === normalizedPendingSwitch.previousActivePlayerId) ||
      activePlayerMon ||
      null;

    setSwitchVisualEvent({
      id: `recover-switch-recall-${activePendingSwitchKey}`,
      phase: 'recall',
      monster: recallMonster,
      durationMs: BATTLE_SWITCH_RECALL_MS
    });

    const sendTimer = window.setTimeout(() => {
      if (localBattleSwitchInFlightRef.current?.key !== activePendingSwitchKey) return;
      setSwitchVisualEvent({
        id: `recover-switch-send-${activePendingSwitchKey}`,
        phase: 'send',
        monster: targetMon,
        durationMs: BATTLE_SWITCH_SEND_MS
      });
    }, BATTLE_SWITCH_RECALL_MS);

    const clearTimer = window.setTimeout(() => {
      if (localBattleSwitchInFlightRef.current?.key !== activePendingSwitchKey) return;
      setSwitchVisualEvent(null);
      localBattleSwitchInFlightRef.current = null;
    }, BATTLE_SWITCH_RECALL_MS + BATTLE_SWITCH_SEND_MS);

    return () => {
      window.clearTimeout(sendTimer);
      window.clearTimeout(clearTimer);
    };
  }, [activePlayerMon, battlePhase, pendingBattleSwitch, playerTeam, view]);

  useEffect(() => {
    const normalizedPendingSwitch = normalizePendingBattleSwitch(pendingBattleSwitch);
    const switchAlreadyInProgress =
      turn === 'resolving' ||
      Boolean(normalizedPendingSwitch?.nextActivePlayerId) ||
      Boolean(localBattleSwitchInFlightRef.current?.key);

    if (
      view !== 'battle' ||
      battlePhase !== 'active' ||
      gameOver ||
      !activeEnemyMon ||
      !activePlayerMon ||
      hasBattleHp(activePlayerMon) ||
      switchAlreadyInProgress
    ) {
      playerDefeatRecoveryInFlightRef.current = false;
      return;
    }

	    const hasAliveBench = getAliveBattleBench(playerTeam, activePlayerMon.id).length > 0;
	    if (!hasAliveBench || playerDefeatRecoveryInFlightRef.current) return;
	    if (!user?.id || !hasLoadedCloudSave) return;

	    playerDefeatRecoveryInFlightRef.current = true;
    const recoveryMessage = '你的宝可梦倒下了！请选择一只宝可梦继续战斗。';

    const recoverForcedSwitchState = async () => {
	      const commitResult = await commitCloudSnapshot({
	        buildSnapshot: (baseSnapshot) => {
	          const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [];
	          const currentMon = baseTeam.find((mon) => mon.id === baseSnapshot.activePlayerId);
	          const hasAvailableBench = getAliveBattleBench(baseTeam, baseSnapshot.activePlayerId).length > 0;
	          if (hasBattleHp(currentMon) || !hasAvailableBench) {
	            return baseSnapshot;
	          }

	          return {
	            ...baseSnapshot,
	            view: 'team',
	            battlePhase: 'active',
	            battlePhaseData: null,
	            turn: 'player',
	            pendingBattleSwitch: null,
	            logs: appendSnapshotLogs(baseSnapshot, [recoveryMessage])
	          };
	        }
	      });
	      if (commitResult.success || !commitResult.message) {
	        playerDefeatRecoveryInFlightRef.current = false;
	        return;
	      }
	      addNotification(
	        commitResult.message,
	        commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
	      );
	      playerDefeatRecoveryInFlightRef.current = false;
	    };

    recoverForcedSwitchState();
  }, [
    activeEnemyMon,
    activePlayerMon,
    addLog,
    addNotification,
    battlePhase,
    commitCloudSnapshot,
    gameOver,
    hasLoadedCloudSave,
    playerTeam,
    pendingBattleSwitch,
    user?.id,
    turn,
    view
  ]);

  // Effect to control body scrolling based on current view
  useEffect(() => {
    const nonScrollingViews = ['map', 'battle'];
    if (showLaunchScreen || nonScrollingViews.includes(view)) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [showLaunchScreen, view]);

	  useEffect(() => {
	    if (view !== 'battle' || gameOver || battlePhase !== 'active') return undefined;
	    if (!user?.id || !hasLoadedCloudSave) return undefined;

	    if (isThrowingPokeball && !captureSequenceData) {
	      const recoverCaptureState = async () => {
	        addLog('捕捉动画状态已恢复，请继续操作。');
	        const commitResult = await commitCloudSnapshot({
	          buildSnapshot: (baseSnapshot) => ({
	            ...baseSnapshot,
	            isThrowingPokeball: false,
	            captureSequenceData: null,
	            turn: 'player',
	            logs: appendSnapshotLogs(baseSnapshot, ['捕捉动画状态已恢复，请继续操作。'])
	          })
	        });
	        if (commitResult.success || !commitResult.message) return;
	        addNotification(
	          commitResult.message,
	          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
	        );
	      };
	      recoverCaptureState();
      return undefined;
    }

	    if (turn === 'capture' && !isThrowingPokeball) {
	      const recoverCaptureTurn = async () => {
	        const commitResult = await commitCloudSnapshot({
	          buildSnapshot: (baseSnapshot) => ({
	            ...baseSnapshot,
	            turn: 'player'
	          })
	        });
	        if (commitResult.success || !commitResult.message) return;
	        addNotification(
	          commitResult.message,
	          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
	        );
	      };
      recoverCaptureTurn();
      return undefined;
    }

    if (turn !== 'resolving') return undefined;

    const timer = window.setTimeout(() => {
      const recoverResolvingTurn = async () => {
        const normalizedPendingSwitch = normalizePendingBattleSwitch(pendingBattleSwitch);
        const activePendingSwitchKey = getPendingBattleSwitchKey(normalizedPendingSwitch);
        if (
          activePendingSwitchKey &&
          localBattleSwitchInFlightRef.current?.key === activePendingSwitchKey &&
          localBattleSwitchInFlightRef.current?.source === 'live'
        ) {
          return;
        }

        const resolvedPlayerMon = withBattleRuntimeDefaults(activePlayerMon);
        const resolvedEnemyMon = withBattleRuntimeDefaults(activeEnemyMon);
        const playerFainted = isBattleMonFainted(resolvedPlayerMon);
        const enemyFainted = isBattleMonFainted(resolvedEnemyMon);
        if ((playerFainted || enemyFainted) && resolvedPlayerMon && resolvedEnemyMon) {
          await resolveTurnAfterFaint({
            playerMon: resolvedPlayerMon,
            enemyMon: resolvedEnemyMon,
            playerFainted,
            enemyFainted
          });
          return;
        }

        if (
          normalizedPendingSwitch &&
          normalizedPendingSwitch.nextActivePlayerId &&
          normalizedPendingSwitch.nextActivePlayerId !== activePlayerId
        ) {
          const nextTurn = normalizedPendingSwitch.forced ? 'player' : 'enemy';
          const commitRecovery = async () => {
            const commitResult = await commitCloudSnapshot({
              buildSnapshot: (baseSnapshot) => {
                const basePendingSwitch = normalizePendingBattleSwitch(baseSnapshot.pendingBattleSwitch);
                const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [];
                const currentMon = baseTeam.find((mon) => mon.id === baseSnapshot.activePlayerId);
                const hasAvailableBench = getAliveBattleBench(baseTeam, baseSnapshot.activePlayerId).length > 0;
                const forceTeamSelectionSnapshot = (message) => ({
                  ...baseSnapshot,
                  view: 'team',
                  battlePhase: 'active',
                  battlePhaseData: null,
                  turn: 'player',
                  pendingBattleSwitch: null,
                  logs: appendSnapshotLogs(baseSnapshot, [message])
                });
                if (!basePendingSwitch) {
                  if (isBattleMonFainted(currentMon) && hasAvailableBench) {
                    return forceTeamSelectionSnapshot('换人状态已恢复，请重新选择可上场宝可梦。');
                  }
                  return {
                    ...baseSnapshot,
                    turn: 'player',
                    pendingBattleSwitch: null,
                    logs: appendSnapshotLogs(baseSnapshot, ['换人状态已恢复，请继续操作。'])
                  };
                }

                const targetMon = baseTeam.find((mon) => mon.id === basePendingSwitch.nextActivePlayerId);
                if (!targetMon || isBattleMonFainted(targetMon)) {
                  if (isBattleMonFainted(currentMon) && hasAvailableBench) {
                    return forceTeamSelectionSnapshot('换人目标已失效，请重新选择可上场宝可梦。');
                  }
                  return {
                    ...baseSnapshot,
                    turn: 'player',
                    pendingBattleSwitch: null,
                    logs: appendSnapshotLogs(baseSnapshot, ['换人目标已失效，请重新选择可上场宝可梦。'])
                  };
                }
                if (baseSnapshot.activePlayerId === targetMon.id) {
                  const hydratedBattleSnapshot = hydrateCommittedBattleSnapshot(baseSnapshot);
                  const queuedEnemySendOut = buildQueuedEnemySendOutPhaseData({
                    enemyMon: basePendingSwitch?.followUpEnemyMon || null,
                    leadMonId: targetMon.id,
                    message: basePendingSwitch?.followUpEnemyMessage || '',
                    battleEnvironment: hydratedBattleSnapshot.battleEnvironment,
                    battleEventCompletion: hydratedBattleSnapshot.battleEventCompletion
                  });
                  return {
                    ...baseSnapshot,
                    view: 'battle',
                    battleEnvironment: hydratedBattleSnapshot.battleEnvironment,
                    battleEventCompletion: hydratedBattleSnapshot.battleEventCompletion,
                    battlePhase: queuedEnemySendOut ? 'sendout' : 'active',
                    battlePhaseData: queuedEnemySendOut,
                    turn: nextTurn,
                    pendingBattleSwitch: null,
                    logs: appendSnapshotLogs(baseSnapshot, [
                      `上吧，${targetMon.name}！`,
                      ...(queuedEnemySendOut?.message ? [queuedEnemySendOut.message] : [])
                    ])
                  };
                }

                const cleanedTeam = baseTeam.map((mon) => (
                  mon.id === baseSnapshot.activePlayerId || mon.id === targetMon.id
                    ? clearTemporaryBattleRuntime(mon)
                    : mon
                ));

                const hydratedBattleSnapshot = hydrateCommittedBattleSnapshot(baseSnapshot);
                const queuedEnemySendOut = buildQueuedEnemySendOutPhaseData({
                  enemyMon: basePendingSwitch?.followUpEnemyMon || null,
                  leadMonId: targetMon.id,
                  message: basePendingSwitch?.followUpEnemyMessage || '',
                  battleEnvironment: hydratedBattleSnapshot.battleEnvironment,
                  battleEventCompletion: hydratedBattleSnapshot.battleEventCompletion
                });
                return {
                  ...baseSnapshot,
                  view: 'battle',
                  battleEnvironment: hydratedBattleSnapshot.battleEnvironment,
                  battleEventCompletion: hydratedBattleSnapshot.battleEventCompletion,
                  battlePhase: queuedEnemySendOut ? 'sendout' : 'active',
                  battlePhaseData: queuedEnemySendOut,
                  turn: nextTurn,
                  playerTeam: cleanedTeam,
                  activePlayerId: targetMon.id,
                  pendingBattleSwitch: null,
                  participatedMonIds: [...new Set([...(Array.isArray(baseSnapshot.participatedMonIds) ? baseSnapshot.participatedMonIds : []), currentMon?.id, targetMon.id].filter(Boolean))],
                  logs: appendSnapshotLogs(baseSnapshot, [
                    '换人状态已恢复，已继续完成换人。',
                    `上吧，${targetMon.name}！`,
                    ...(queuedEnemySendOut?.message ? [queuedEnemySendOut.message] : [])
                  ])
                };
              }
            });
            if (commitResult.success || !commitResult.message) return;
            addNotification(
              commitResult.message,
              commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
            );
          };

	          commitRecovery();
	          return;
	        }

	        addLog('战斗状态已恢复，请继续操作。');
	        const commitResult = await commitCloudSnapshot({
	          buildSnapshot: (baseSnapshot) => {
	            if (baseSnapshot.turn !== 'resolving') return baseSnapshot;
	            const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [];
	            const currentMon = baseTeam.find((mon) => mon.id === baseSnapshot.activePlayerId);
	            if (isBattleMonFainted(currentMon) && getAliveBattleBench(baseTeam, baseSnapshot.activePlayerId).length > 0) {
	              return {
	                ...baseSnapshot,
	                view: 'team',
	                battlePhase: 'active',
	                battlePhaseData: null,
	                turn: 'player',
	                pendingBattleSwitch: null,
	                logs: appendSnapshotLogs(baseSnapshot, ['战斗状态已恢复，请选择下一只宝可梦。'])
	              };
	            }

	            return {
	              ...baseSnapshot,
	              turn: 'player',
	              pendingBattleSwitch: null,
	              logs: appendSnapshotLogs(baseSnapshot, ['战斗状态已恢复，请继续操作。'])
	            };
	          }
	        });
	        if (commitResult.success || !commitResult.message) return;
	        addNotification(
	          commitResult.message,
	          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
	        );
	      };
      recoverResolvingTurn();
    }, BATTLE_TURN_RECOVERY_MS);

    return () => window.clearTimeout(timer);
  }, [
    activeEnemyMon,
    activePlayerMon,
    addLog,
    battlePhase,
    battleEnvironment,
    captureSequenceData,
    gameOver,
    isThrowingPokeball,
    logs.length,
    addNotification,
    activePlayerId,
    commitCloudSnapshot,
    hasLoadedCloudSave,
    pendingBattleSwitch,
    playerTeam,
    resolveTurnAfterFaint,
    turn,
    user?.id,
    view
  ]);

		  useEffect(() => {
		    if (!cloudBlocked && user?.id && hasLoadedCloudSave && turn === 'enemy' && !gameOver && !isThrowingPokeball) {
		      const enemyActionDelayMs = getEnemyTurnDelayMs(logsRef.current);
		      const timer = setTimeout(async () => {
		        if (cloudBlockedRef.current || enemyTurnInFlightRef.current) return;
            enemyTurnInFlightRef.current = true;
            try {
		        const currentEnemyMon = withBattleRuntimeDefaults(enemyTeam.find(m => m.id === activeEnemyId));
		        const currentPlayerMon = withBattleRuntimeDefaults(playerTeam.find(m => m.id === activePlayerId));
	        if (!currentEnemyMon || !currentPlayerMon) {
	          if (!gameOver) {
	            const commitResult = await commitCloudSnapshot({
	              buildSnapshot: (baseSnapshot) => ({
	                ...baseSnapshot,
	                turn: 'player'
	              })
	            });
	            if (!commitResult.success && commitResult.message) {
	              addNotification(
	                commitResult.message,
	                commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
	              );
	            }
	          }
	          return;
	        }
        const playerFainted = isBattleMonFainted(currentPlayerMon);
        const enemyFainted = isBattleMonFainted(currentEnemyMon);
        if (playerFainted || enemyFainted) {
          await resolveTurnAfterFaint({
            playerMon: currentPlayerMon,
            enemyMon: currentEnemyMon,
            playerFainted,
            enemyFainted
          });
          return;
        }

        const enemyAction = chooseEnemyAction(currentEnemyMon, currentPlayerMon);
        if (enemyAction.type === 'switch' && enemyAction.target) {
          const intentMessage = getEnemyAiSwitchIntentMessage(enemyAction);
          if (intentMessage) {
            await addBattleLogAndWait(addLog, intentMessage, {
              minMs: 620,
              maxMs: 1120,
              extraMs: 60,
            });
          }
          const switchResult = await runEnemyTrainerSwitch({
            enemyMon: currentEnemyMon,
            nextEnemy: enemyAction.target,
            playerMon: currentPlayerMon
          });
          if (switchResult.commitFailed) return;
          if (!gameOver) {
            const commitResult = await commitCloudSnapshot({
              buildSnapshot: (baseSnapshot) => ({
                ...baseSnapshot,
                turn: 'player'
              })
            });
            if (!commitResult.success && commitResult.message) {
              addNotification(
                commitResult.message,
                commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
              );
            }
          }
          return;
        }

        const randomMoveKey = enemyAction.moveKey;
	        if (!randomMoveKey) {
	          addLog(`敌方 ${currentEnemyMon.name} 技能值不足，无法行动!`);
	          if (!gameOver) {
	            const commitResult = await commitCloudSnapshot({
	              buildSnapshot: (baseSnapshot) => ({
	                ...baseSnapshot,
	                turn: 'player',
	                logs: appendSnapshotLogs(baseSnapshot, [`敌方 ${currentEnemyMon.name} 技能值不足，无法行动!`])
	              })
	            });
	            if (!commitResult.success && commitResult.message) {
	              addNotification(
	                commitResult.message,
	                commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
	              );
	            }
	          }
	          return;
	        }

        const result = await runEnemyAction({
          enemyMon: currentEnemyMon,
          playerMon: currentPlayerMon,
          moveKey: randomMoveKey
        });
	        if (result.commitFailed) return;
	        if (result.escaped) return;
	        if (result.actorFainted || result.targetFainted) {
          await resolveTurnAfterFaint({
            playerMon: result.defender || currentPlayerMon,
            enemyMon: result.attacker || currentEnemyMon,
            playerFainted: result.targetFainted,
            enemyFainted: result.actorFainted
          });
          return;
        }
	        if (!gameOver) {
	          const commitResult = await commitCloudSnapshot({
	            buildSnapshot: (baseSnapshot) => ({
	              ...baseSnapshot,
	              turn: 'player'
	            })
	          });
	          if (!commitResult.success && commitResult.message) {
	            addNotification(
	              commitResult.message,
	              commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
	            );
		          }
		        }
            } finally {
              enemyTurnInFlightRef.current = false;
            }
      }, enemyActionDelayMs);
      return () => clearTimeout(timer);
    }
	  }, [turn, cloudBlocked, gameOver, playerTeam, enemyTeam, activePlayerId, activeEnemyId, activeEnemyMon, isThrowingPokeball, addLog, addNotification, chooseEnemyAction, commitCloudSnapshot, hasLoadedCloudSave, resolveTurnAfterFaint, runEnemyAction, runEnemyTrainerSwitch, user?.id]);

  const handleSwitch = useCallback(async (newId) => {
    const isForced = activePlayerMon && isBattleMonFainted(activePlayerMon);
    const newMonster = playerTeam.find((m) => m.id === newId);
    if (!newMonster || isBattleMonFainted(newMonster) || newId === activePlayerId) {
      addLog("无法切换到该宝可梦。");
      return false;
    }
    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('云端未就绪，暂不能换人。', 'error');
      return false;
    }
    const queuedEnemySendOutData = isForced && battlePhase === 'sendout' && battlePhaseData?.enemyMon && battlePhaseData?.sendOutSide === 'enemy'
      ? normalizeBattlePhaseData('sendout', battlePhaseData)
      : null;
    const pendingSwitch = buildPendingBattleSwitch({
      previousActivePlayerId: activePlayerId,
      nextActivePlayerId: newId,
      forced: isForced,
      followUpEnemyMon: queuedEnemySendOutData?.enemyMon || null,
      followUpEnemyMessage: queuedEnemySendOutData?.message || ''
    });
    const pendingSwitchKey = getPendingBattleSwitchKey(pendingSwitch);
    localBattleSwitchInFlightRef.current = pendingSwitchKey
      ? { key: pendingSwitchKey, source: 'live' }
      : null;

    const oldMonName = activePlayerMon ? activePlayerMon.name : '宝可梦';
    const resolvingCommit = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => {
        const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [];
        const targetMon = baseTeam.find((mon) => mon.id === newId);
        const currentMon = baseTeam.find((mon) => mon.id === baseSnapshot.activePlayerId);
        if (!targetMon || isBattleMonFainted(targetMon)) {
          return abortCloudSnapshotCommit('目标无法上场，请重选。', 'warning');
        }
        if (baseSnapshot.activePlayerId === newId) {
          return abortCloudSnapshotCommit('这只宝可梦已在场。', 'info');
        }

        return {
          ...baseSnapshot,
          view: 'battle',
          battlePhase: 'active',
          battlePhaseData: null,
          turn: 'resolving',
          pendingBattleSwitch: pendingSwitch,
          activeBattleEnergyCost: resolveTrackedActiveBattleEnergyCost(baseSnapshot.activeBattleEnergyCost),
          battleEnergyRefundEligible: isForced ? baseSnapshot.battleEnergyRefundEligible : false,
          logs: appendSnapshotLogs(baseSnapshot, [`回来吧，${currentMon?.name || oldMonName}！`])
        };
      }
    });

    if (!resolvingCommit.success) {
      localBattleSwitchInFlightRef.current = null;
      if (resolvingCommit.message) {
        addLog(`换人失败: ${resolvingCommit.message}`);
        addNotification(
          resolvingCommit.message,
          resolvingCommit.notificationType || (resolvingCommit.requiresReload ? 'error' : 'warning')
        );
      }
      return false;
    }

    setView('battle');
    setBattlePhase('active');
    setBattlePhaseData(null);
    setTurn('resolving');
    setPendingBattleSwitch(pendingSwitch);
    setSwitchVisualEvent({
      id: `switch-recall-${activePlayerId || 'none'}-${newId}-${Date.now()}`,
      phase: 'recall',
      monster: activePlayerMon || null,
      durationMs: BATTLE_SWITCH_RECALL_MS
    });
    await wait(BATTLE_SWITCH_RECALL_MS);

    setSwitchVisualEvent({
      id: `switch-send-${newId}-${Date.now()}`,
      phase: 'send',
      monster: newMonster,
      durationMs: BATTLE_SWITCH_SEND_MS
    });
    await wait(BATTLE_SWITCH_SEND_MS);

    const nextTurn = isForced ? 'player' : 'enemy';
    const commitResult = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => {
        const basePendingSwitch = normalizePendingBattleSwitch(baseSnapshot.pendingBattleSwitch);
        const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [];
        const targetMon = baseTeam.find((mon) => mon.id === newId);
        const currentMon = baseTeam.find((mon) => mon.id === baseSnapshot.activePlayerId);
        const followUpEnemyMon = basePendingSwitch?.followUpEnemyMon || null;
        const followUpEnemyMessage = basePendingSwitch?.followUpEnemyMessage || '';
        const hydratedBattleSnapshot = hydrateCommittedBattleSnapshot(baseSnapshot);
        const queuedBattlePhaseData = isForced
          ? buildQueuedEnemySendOutPhaseData({
              enemyMon: followUpEnemyMon,
              leadMonId: newId,
              message: followUpEnemyMessage,
              battleEnvironment: hydratedBattleSnapshot.battleEnvironment,
              battleEventCompletion: hydratedBattleSnapshot.battleEventCompletion
            })
          : null;
        const queuedLogs = queuedBattlePhaseData?.message ? [queuedBattlePhaseData.message] : [];
        if (!targetMon || isBattleMonFainted(targetMon)) {
          return abortCloudSnapshotCommit('目标无法上场，请重选。', 'warning');
        }
        if (baseSnapshot.activePlayerId === newId) {
          return {
            ...baseSnapshot,
            view: 'battle',
            battleEnvironment: hydratedBattleSnapshot.battleEnvironment,
            battleEventCompletion: hydratedBattleSnapshot.battleEventCompletion,
            battlePhase: queuedBattlePhaseData ? 'sendout' : 'active',
            battlePhaseData: queuedBattlePhaseData,
            turn: nextTurn,
            pendingBattleSwitch: null,
            activeBattleEnergyCost: resolveTrackedActiveBattleEnergyCost(baseSnapshot.activeBattleEnergyCost),
            battleEnergyRefundEligible: isForced ? baseSnapshot.battleEnergyRefundEligible : false,
            logs: queuedLogs.length > 0 ? appendSnapshotLogs(baseSnapshot, queuedLogs) : baseSnapshot.logs
          };
        }

        const cleanedTeam = baseTeam.map((mon) => (
          mon.id === baseSnapshot.activePlayerId || mon.id === newId
            ? clearTemporaryBattleRuntime(mon)
            : mon
        ));

        return {
          ...baseSnapshot,
          view: 'battle',
          battleEnvironment: hydratedBattleSnapshot.battleEnvironment,
          battleEventCompletion: hydratedBattleSnapshot.battleEventCompletion,
          battlePhase: queuedBattlePhaseData ? 'sendout' : 'active',
          battlePhaseData: queuedBattlePhaseData,
          turn: nextTurn,
          playerTeam: cleanedTeam,
          activePlayerId: newId,
          pendingBattleSwitch: null,
          activeBattleEnergyCost: resolveTrackedActiveBattleEnergyCost(baseSnapshot.activeBattleEnergyCost),
          battleEnergyRefundEligible: isForced ? baseSnapshot.battleEnergyRefundEligible : false,
          participatedMonIds: [...new Set([...(Array.isArray(baseSnapshot.participatedMonIds) ? baseSnapshot.participatedMonIds : []), currentMon?.id, newId].filter(Boolean))],
          logs: appendSnapshotLogs(baseSnapshot, [
            `上吧，${targetMon.name}！`,
            ...queuedLogs
          ])
        };
      }
    });

    if (commitResult.success) {
      setPlayerTeam((prev) => prev.map((mon) => (
        mon.id === activePlayerId || mon.id === newId
          ? clearTemporaryBattleRuntime(mon)
          : mon
      )));
      setActivePlayerId(newId);
      setView('battle');
      setBattlePhase(queuedEnemySendOutData ? 'sendout' : 'active');
      setBattlePhaseData(queuedEnemySendOutData || null);
      setTurn(nextTurn);
      setPendingBattleSwitch(null);
      localBattleSwitchInFlightRef.current = null;
      setSwitchVisualEvent(null);
      return true;
    }

    localBattleSwitchInFlightRef.current = null;
    const rollbackCommit = await commitCloudSnapshot({
      buildSnapshot: (baseSnapshot) => {
        const hydratedBattleSnapshot = hydrateCommittedBattleSnapshot(baseSnapshot);
        const baseTeam = Array.isArray(baseSnapshot.playerTeam) ? baseSnapshot.playerTeam : [];
        const currentMon = baseTeam.find((mon) => mon.id === baseSnapshot.activePlayerId);
        const shouldForceTeam = isForced && isBattleMonFainted(currentMon) && getAliveBattleBench(baseTeam, baseSnapshot.activePlayerId).length > 0;
        return {
          ...baseSnapshot,
          view: shouldForceTeam ? 'team' : 'battle',
          battleEnvironment: hydratedBattleSnapshot.battleEnvironment,
          battleEventCompletion: hydratedBattleSnapshot.battleEventCompletion,
          battlePhase: shouldForceTeam && queuedEnemySendOutData ? 'sendout' : 'active',
          battlePhaseData: shouldForceTeam && queuedEnemySendOutData ? queuedEnemySendOutData : null,
          turn: 'player',
          pendingBattleSwitch: null
        };
      }
    });
    setView(isForced ? 'team' : 'battle');
    setBattlePhase(isForced && queuedEnemySendOutData ? 'sendout' : 'active');
    setBattlePhaseData(isForced && queuedEnemySendOutData ? queuedEnemySendOutData : null);
    setTurn('player');
    setPendingBattleSwitch(null);
    setSwitchVisualEvent(null);
    if (!rollbackCommit.success && rollbackCommit.message) {
      addNotification(
        rollbackCommit.message,
        rollbackCommit.notificationType || (rollbackCommit.requiresReload ? 'error' : 'warning')
      );
    }
    if (commitResult.message) {
      addLog(`换人失败: ${commitResult.message}`);
      addNotification(
        commitResult.message,
        commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
      );
    }
    return false;
  }, [activePlayerId, activePlayerMon, addLog, addNotification, battleEnvironment, battlePhase, battlePhaseData, commitCloudSnapshot, hasLoadedCloudSave, hydrateCommittedBattleSnapshot, playerTeam, resolveTrackedActiveBattleEnergyCost, user?.id]);

  const handleStartGame = useCallback(async (selectedMonster) => {
    if (!selectedMonster) return false;
    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('云端未就绪，暂不能开始。', 'error');
      return false;
    }

    const starterMeta = STARTER_STORY_META[selectedMonster.name] || {};
    const transitionBase = {
      monster: selectedMonster,
      color: starterMeta.color || '#f97316',
    };

    const startMapName = DEFAULT_WORLD_MAP_NAME;
    const starterInstance = createMonsterInstance(selectedMonster, 5, 'p1');
    const startPosition = getMapStartPosition(startMapName);
    const startLogs = [
      `初始补给已放入背包：精灵球 x5、超级球 x3、高级球 x1、伤药 x5、好伤药 x3、厉害伤药 x1。`,
      `${starterInstance.name} 站到了你的身旁。`,
      '先沿着营地土路往上走，熟悉移动、探索和第一场野外遭遇。',
      `目标：先查看${getMapConfig(startMapName).displayName}营地旁的路牌，再去上方的阳光草坡。`,
      starterMeta.earlyRouteHint || '觉得有压力时，就先回营地附近的阳光草坡稳稳练级。'
    ];
    const startWorld = normalizeWorldState({
      collectedEventIds: [],
      dailyTrainerBattleIds: [],
      defeatedTrainerIds: [],
      defeatedBossIds: [],
      completedChallengeIds: [],
      trainerVictoryCounts: {},
      usedHealPointIds: [],
      flags: {},
      mapProgress: {}
    }, {
      currentMapName: startMapName,
      playerPos: startPosition
    });
    const startMapGrid = buildMapGridForWorld(startMapName, startWorld, loadPokemonMap(startMapName));

    clearNotifications();
    setLaunchDepartureTransition({ ...transitionBase, stage: 'departing' });
    const departureStartedAt = Date.now();

    try {
      const commitResult = await commitCloudSnapshot({
        buildSnapshot: (baseSnapshot) => ({
          ...baseSnapshot,
          showLaunchScreen: false,
          view: 'map',
          turn: 'player',
          logs: startLogs,
          participatedMonIds: [],
          pendingGrowthEvents: [],
          pendingTeacherRewardClaim: null,
          pendingMonsterAcquisition: null,
          pendingBattleSwitch: null,
          playerTeam: [starterInstance],
          storageBox: [],
          enemyTeam: [],
          activePlayerId: starterInstance.id,
          activeEnemyId: null,
          gameOver: false,
	          battleKind: 'wild',
	          battlePhase: 'active',
	          battlePhaseData: null,
	          battleEnvironment: null,
	          battleEventCompletion: null,
	          isThrowingPokeball: false,
          captureSequenceData: null,
          activeBattleEnergyCost: 0,
          battleEnergyRefundEligible: false,
          playerInventory: sanitizePlayerInventory(getDefaultInventory()),
          nextPlayerMonsterId: 101,
          nextEnemyMonsterId: 200,
          playerPos: startPosition,
          mapGrid: startMapGrid,
          mapLevel: 1,
          maxReachedLevel: 1,
          useRealMaps: true,
          currentMapName: startMapName,
          encounterCooldownSteps: 0,
          world: startWorld
        })
      });
      if (!commitResult.success) {
        setLaunchDepartureTransition(null);
        const message = commitResult.message || '初始伙伴保存失败，请重试。';
        addLog(`开始冒险失败: ${message}`);
        addNotification(message, commitResult.requiresReload ? 'error' : 'warning');
        return false;
      }

      const departureElapsed = Date.now() - departureStartedAt;
      if (departureElapsed < 960) {
        await wait(960 - departureElapsed);
      }

      setLaunchDepartureTransition({ ...transitionBase, stage: 'arriving' });
      await wait(1240);
      setLaunchDepartureTransition(null);
      return true;
    } catch (error) {
      setLaunchDepartureTransition(null);
      const message = error?.message || '初始伙伴保存失败，请重试。';
      addLog(`开始冒险失败: ${message}`);
      addNotification(message, 'error');
      return false;
    }
  }, [addLog, addNotification, clearNotifications, commitCloudSnapshot, hasLoadedCloudSave, user?.id]);

  const handleZoneEnter = useCallback((zoneName, zoneMeta = {}) => {
    if (zoneMeta?.locked && zoneMeta?.lockReason) {
      addNotification(zoneMeta.lockReason, 'info');
      return;
    }
    if (zoneName) {
      addNotification(`已进入${zoneName}。`, 'info');
    }
  }, [addNotification]);

  const handleMapWarp = useCallback(async (warp) => {
    if (mapWarpBusyRef.current) return;
    const targetMapName = warp?.target?.mapName;
    if (!targetMapName || !hasAdventureMap(targetMapName)) {
      addNotification('道路未开放。', 'warning');
      return;
    }

    const mapConfig = getMapConfig(targetMapName);
    const playerAvgLevel = getPlayerAverageLevel(playerTeam);
    const bossGate = getForwardMapBossGate({
      currentMapName,
      targetMapName,
      world
    });
    const warpGate = getWarpEventLockState({
      currentMapName,
      warpEvent: warp,
      world,
      playerTeam
    });
    const levelLocked = isMapLockedForLevel(mapConfig, playerAvgLevel);

    if (warpGate.locked) {
      addNotification(warpGate.reason || '暂不能进入。', 'warning');
      return;
    }

    if (bossGate && levelLocked) {
      addNotification(`先击败${bossGate.mapName}的${bossGate.bossName}，再来${mapConfig.displayName}。`, 'warning');
      return;
    }

    if (bossGate) {
      addNotification(`先击败${bossGate.mapName}的${bossGate.bossName}。`, 'warning');
      return;
    }

    if (levelLocked) {
      addNotification(
        `平均 Lv.${Math.max(1, Math.trunc(Number(mapConfig.recommendedLevel) || 1))} 后可进入。`,
        'warning'
      );
      return;
    }

    if (!user?.id || !hasLoadedCloudSave) {
      addNotification('云端未就绪，暂不能切换地图。', 'error');
      return;
    }

    const nextPosition = warp.target.position || getMapStartPosition(targetMapName);
    const nextMapLevel = Math.max(1, Math.trunc(Number(mapConfig.recommendedLevel) || 1));
    const fromLabel = getMapConfig(currentMapName).displayName;
    const toLabel = mapConfig.displayName;
    const transitId = `${currentMapName}:${targetMapName}:${Date.now()}`;
    const currentDirection = playerPosRef.current?.direction || playerPos?.direction || 'right';
    const targetMapInfo = getAdventureMapInfo(targetMapName);
    const warmupPromise = preloadThreeLowPolyMapModelsOnDemand(targetMapName).catch((error) => {
      console.warn(`[OriginalGame] Failed to warm up map models for ${targetMapName}:`, error);
      return null;
    });

    mapWarpBusyRef.current = true;
    if (mapMovementSaveTimerRef.current) {
      clearTimeout(mapMovementSaveTimerRef.current);
      mapMovementSaveTimerRef.current = null;
    }
    setMapWarpBusy(true);
    setMapWarpTransitTarget({
      id: transitId,
      kind: 'warp',
      phase: 'departing',
      fromLabel,
      toLabel,
      terrain: getFastTravelStationMeta(targetMapName)?.terrain || 'meadow',
      renderMode: getAdventureMapInfo(currentMapName)?.renderMode || targetMapInfo?.renderMode || null,
      travelDirection: currentDirection
    });

    try {
      await wait(180);
      setMapWarpTransitTarget((current) => current?.id === transitId ? { ...current, phase: 'syncing' } : current);

      const commitResult = await commitCloudSnapshot({
        buildSnapshot: (baseSnapshot) => {
          const nextWorld = normalizeWorldState(baseSnapshot.world, {
            currentMapName: targetMapName,
            playerPos: nextPosition
          });
          return {
            ...baseSnapshot,
            useRealMaps: true,
            currentMapName: targetMapName,
            mapGrid: buildMapGridForWorld(targetMapName, nextWorld, loadPokemonMap(targetMapName)),
            playerPos: nextPosition,
            mapLevel: nextMapLevel,
            maxReachedLevel: Math.max(Number(baseSnapshot.maxReachedLevel) || 1, nextMapLevel),
            encounterCooldownSteps: 2,
            view: 'map',
            world: nextWorld
          };
        }
      });
      if (!commitResult.success) {
        addNotification(
          commitResult.message || '地图切换未保存，请重新读取。',
          commitResult.notificationType || (commitResult.requiresReload ? 'error' : 'warning')
        );
        return;
      }

      setMapWarpTransitTarget((current) => current?.id === transitId ? {
        ...current,
        phase: 'arriving',
        renderMode: targetMapInfo?.renderMode || null,
        travelDirection: nextPosition.direction || currentDirection
      } : current);
      await Promise.race([warmupPromise, wait(720)]);
      await wait(520);
      addNotification(`已进入${mapConfig.displayName}。`, 'info');
    } finally {
      mapWarpBusyRef.current = false;
      setMapWarpBusy(false);
      setMapWarpTransitTarget(null);
    }
  }, [addNotification, commitCloudSnapshot, currentMapName, hasLoadedCloudSave, playerPos?.direction, playerTeam, user?.id, world]);

  const handleManualSave = useCallback(() => {
    if (requiresCloudReload) {
      loadGameFromCloud({ force: true });
      return;
    }
    saveGameToCloud({ manual: true, force: true });
  }, [loadGameFromCloud, requiresCloudReload, saveGameToCloud]);

  const currentMapBossCompleted = hasCompletedBossEvent(world, currentMapName);
  const currentMapEventVisualState = useMemo(
    () => buildMapEventVisualState(currentMapName, world, completedBattleEventVisualOverrides),
    [completedBattleEventVisualOverrides, currentMapName, world]
  );
  const currentMapEncounterZoneLocks = useMemo(
    () => buildEncounterZoneLocks(currentMapName, world, playerTeam),
    [currentMapName, playerTeam, world]
  );

  if (!assetsReady) {
    const loaded = Number(assetLoadSummary?.loaded) || 0;
    const total = Number(assetLoadSummary?.total) || getCriticalGameImageAssetUrls().length;
    return (
      <CloudGateScreen
        title="正在准备本地素材"
        message={`正在预解码宝可梦、训练家和战斗素材。${loaded > 0 ? `已准备 ${loaded}/${total}。` : '马上就好。'}`}
        busy
      />
    );
  }

  if (cloudLoading) {
    return (
      <CloudGateScreen
        title="正在读取云端进度"
        message="游戏必须联网并连接后端。正在从后端读取你的最新进度。"
        busy
      />
    );
  }

  if (cloudError) {
    return (
      <CloudGateScreen
        title="无法进入游戏"
        message={`必须联网并成功连接后端才能游戏。不支持本地游戏。${cloudError}`}
        actionLabel="重新连接后端"
        onAction={() => loadGameFromCloud({ force: true })}
      />
    );
  }

  const launchOverlayOnMap = launchDepartureTransition?.stage === 'arriving' && Boolean(activePlayerMon);
  const showLaunchScreenUnderlay = showLaunchScreen && !launchOverlayOnMap;
  const hideAdventureTopBar = view === 'bag' || view === 'team' || view === 'dex' || view === 'shop';

  return (
    <>
      {showLaunchScreenUnderlay ? (
        <LaunchScreen onStartGame={handleStartGame} user={user} transition={launchDepartureTransition}>
          <CloudSyncBlocker
            isOnline={isOnline}
            syncError={syncError}
            saveStatus={saveStatus}
            requiresReload={requiresCloudReload}
            onRetry={handleManualSave}
          />
        </LaunchScreen>
      ) : !activePlayerMon ? (
        <div className="game-app-bg"><div className="game-card p-5 font-black text-slate-700">加载中...</div></div>
      ) : view === 'battle' && !activeEnemyMon ? (
        <div className="game-app-bg"><div className="game-card p-5 font-black text-slate-700">遭遇战...</div></div>
      ) : (
    <div className="game-app-bg">
      <div className={`game-console-shell${view === 'map' ? ' game-console-shell--map-overlay' : ''}${hideAdventureTopBar ? ' game-console-shell--panel-full' : ''}`}>
        {!hideAdventureTopBar && (
          <AdventureTopBar
            user={user}
            activeMon={activePlayerMon}
            playerGold={playerGold}
            playerEnergy={playerEnergy}
            maxEnergy={maxEnergy}
            onLogout={onLogout}
            onResetGame={() => setResetConfirmOpen(true)}
            resetDisabled={!hasLoadedCloudSave || isResettingProgress}
            audioSettings={audioSettings}
            onToggleAudio={handleToggleAudio}
            onVolumeChange={handleAudioVolumeChange}
            saveProps={{
              disabled: !hasLoadedCloudSave,
              isOnline,
              lastSavedAt,
              saveStatus,
              syncError,
              requiresReload: requiresCloudReload,
              onSave: handleManualSave
            }}
          />
        )}
      <div className="game-screen-frame">
      <div className="flex-1 min-h-0 flex flex-col relative z-10 h-full">
        {!showLaunchScreen && (
          <div className={view === 'map' ? 'flex flex-1 min-h-0 flex-col' : 'hidden'} aria-hidden={view !== 'map'}>
            <GameCanvas
              key={`${currentMapName}-${WORLD_MAP_CONTENT_VERSION}-${PLAYER_VISUAL_VERSION}`}
              playerTeam={playerTeam}
              onEncounter={handleEncounter}
              onNavigate={handleNavigateView}
              onCollect={handleCollect}
              playerPos={playerPos}
              onPlayerMove={handlePlayerMove}
              mapGrid={mapGrid}
              onMapGridChange={setMapGrid}
	              useRealMaps={useRealMaps}
	              currentMapName={currentMapName}
	              mapLevel={mapLevel}
	              onMapWarp={handleMapWarp}
	              onZoneEnter={handleZoneEnter}
              cloudBlocked={cloudBlocked || Boolean(pendingBattleEventConfirm) || battleEventConfirmBusy || Boolean(pendingSpringRestoreConfirm) || springRestoreBusy || Boolean(pendingFastTravel) || fastTravelBusy || Boolean(mapWarpTransitTarget) || mapWarpBusy}
	              encounterCooldownSteps={encounterCooldownSteps}
	              onEncounterCooldownChange={handleEncounterCooldownChange}
	              mapActive={view === 'map'}
	              collectedEventIds={world?.collectedEventIds || []}
	              springRestoreAnimation={springRestoreAnimation}
                currentMapBossCompleted={currentMapBossCompleted}
                mapEventVisualState={currentMapEventVisualState}
                encounterZoneLocks={currentMapEncounterZoneLocks}
	            />
          </div>
        )}
        {view === 'battle' && activeEnemyMon && <BattleScene playerMon={activePlayerMon} enemyMon={activeEnemyMon} logs={logs} playerGold={playerGold} onMove={handleTurn} onSwitch={handleSwitch} turn={turn} onNavigate={handleNavigateView} onRun={handleRun} escapeRule={battleEscapeRule} canUsePokeballs={battleKind !== 'trainer'} playerTeam={playerTeam} enemyTeam={enemyTeam} activeEnemyId={activeEnemyId} playerInventory={playerInventory} onUseItem={handleUseItem} onUsePotion={handleUsePotion} onUseExpPotion={handleUseExpPotion} addLog={addLog} isThrowingPokeball={isThrowingPokeball} onGoToLaunchScreen={handleGoToLaunchScreen} onModalScreenChange={setBattleModalScreenOpen} moveVisualEvent={moveVisualEvent} switchVisualEvent={switchVisualEvent} pendingBattleSwitch={pendingBattleSwitch} battleEnvironment={battleEnvironment} battleKind={battleKind} battlePhase={battlePhase} battlePhaseData={battlePhaseData} openingIntro={battlePhase === 'intro'} openingSendOut={battlePhase === 'sendout'} onOpeningIntroComplete={handleBattleIntroComplete} onOpeningSendOutComplete={handleBattleSendOutComplete} />}

        {/* ── 战斗过场 Overlay ────────────────────────────────────── */}
        {view === 'battle' && (
          <CaptureSequenceOverlay
            show={isThrowingPokeball}
            data={captureSequenceData}
            paused={cloudBlocked}
            onComplete={handleCaptureSequenceComplete}
          />
        )}
	        {view === 'battle' && battlePhase === 'victory' && (
	          <BattleVictoryOverlay
	            enemyName={battlePhaseData?.enemyName ?? '对手'}
	            isTrainer={battlePhaseData?.isTrainer ?? false}
	            rewardSummary={battlePhaseData?.rewardSummary}
	            onContinue={handleVictoryContinue}
	          />
	        )}
        {view === 'battle' && battlePhase === 'defeat' && (
          <BattleDefeatOverlay
            goldPenalty={getPayableDefeatGoldPenalty(getDefeatGoldPenalty({ battleKind, mapLevel }), playerGold)}
            onContinue={handleDefeatContinue}
          />
        )}
        {view === 'battle' && battlePhase === 'escape' && (
          <BattleEscapeOverlay
            onComplete={handleEscapeContinue}
            paused={cloudBlocked}
            refundEligible={battleEnergyRefundEligible}
            phaseData={battlePhaseData}
          />
        )}
        {pendingMonsterAcquisition && (
          <MonsterAcquisitionDecisionModal
            pending={pendingMonsterAcquisition}
            party={playerTeam}
            storageBox={storageBox}
            onSendToStorage={handleSendPendingMonsterToStorage}
            onReplacePartyMember={handleReplaceWithPendingMonster}
            onReleasePending={handleReleasePendingMonster}
          />
        )}
        {view === 'team' && (
          <Suspense fallback={<DeferredPanelFallback title="队伍加载中..." />}>
            <DeferredTeamScreen
              team={playerTeam}
              storageBox={storageBox}
              activeId={activePlayerId}
              onSelect={activeEnemyMon ? async (id) => {
                await handleSwitch(id);
                return false;
              } : undefined}
              onBack={() => {
                // 阵亡强制换人时禁止直接返回战场，必须选择替补宝可梦
                if (activeEnemyMon && isBattleMonFainted(activePlayerMon)) {
                  addNotification('宝可梦倒下了，请选择下一只。', 'error');
                  return;
                }
                handleNavigateView(activeEnemyMon ? 'battle' : 'map');
              }}
              onReorderTeam={handleReorderTeam}
              onRelease={handleReleaseMonster}
              onReleaseStorage={(monsterId) => handleReleaseMonster(monsterId, 'storage')}
              onDeposit={handleDepositToStorage}
              onWithdraw={handleWithdrawFromStorage}
              onSwapWithStorage={handleSwapPartyAndStorage}
            />
          </Suspense>
        )}
        {view === 'dex' && (
          <Suspense fallback={<DeferredPanelFallback title="图鉴加载中..." />}>
            <DeferredDexScreen onBack={() => handleNavigateView('map')} />
          </Suspense>
        )}
        {view === 'shop' && (
          <Suspense fallback={<DeferredPanelFallback title="商店加载中..." />}>
            <DeferredShopScreen
              playerGold={playerGold}
              playerInventory={playerInventory}
              onPurchase={handlePurchase}
              onBack={() => handleNavigateView('map')}
              getInventoryItemQuantity={getInventoryItemQuantity}
              getPotionEffectText={getPotionEffectText}
            />
          </Suspense>
        )}
        {view === 'bag' && (
          <Suspense fallback={<DeferredPanelFallback title="背包加载中..." />}>
            <DeferredBagScreen
              playerInventory={playerInventory}
              playerTeam={playerTeam}
              activePlayerMon={activePlayerMon}
              activeEnemyMon={activeEnemyMon}
              canUsePokeballs={battleKind !== 'trainer'}
              onUseItem={handleUseItem}
              onUsePotion={handleUsePotion}
              onUseExpPotion={handleUseExpPotion}
              onBack={() => handleNavigateView(activeEnemyMon ? 'battle' : 'map')}
              addLog={addLog}
            />
          </Suspense>
        )}
        {gameOver && <div className="absolute inset-0 bg-black/80 flex items-center justify-center flex-col z-50 animate-bounce-in">
          <div className="game-card p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">{playerTeam.some((m) => hasBattleHp(m)) ? '胜利!' : '失败'}</h2>
            <button onClick={handleRecoverFromDefeat} className="game-primary-button px-6 py-2">
              返回地图并恢复
            </button>
          </div>
        </div>}
      </div>
      <NotificationToast
        notifications={notificationDisplayBlocked ? [] : notifications}
        mode={notificationDisplayMode}
      />
      </div>
      <div className="game-console-overlay-host" aria-live="polite">
        <LaunchDepartureOverlay transition={launchOverlayOnMap ? launchDepartureTransition : null} />
        <CloudSyncBlocker
          isOnline={isOnline}
          syncError={syncError}
          saveStatus={saveStatus}
          requiresReload={requiresCloudReload}
          onRetry={handleManualSave}
        />
        <ResetProgressConfirmModal
          open={resetConfirmOpen}
          busy={isResettingProgress}
          onCancel={() => setResetConfirmOpen(false)}
          onConfirm={handleGoToLaunchScreen}
        />
        <ChallengeBattleConfirmModal
          open={Boolean(pendingBattleEventConfirm)}
          busy={battleEventConfirmBusy}
          eventName={pendingBattleEventConfirm?.eventName}
          eventTitle={pendingBattleEventConfirm?.eventTitle}
          energyCost={pendingBattleEventConfirm?.energyCost}
          teamSize={pendingBattleEventConfirm?.teamSize}
          levelRangeText={pendingBattleEventConfirm?.levelRangeText}
          rewardItems={pendingBattleEventConfirm?.rewardItems}
          rewardLabel={pendingBattleEventConfirm?.rewardLabel}
          rewardDescriptions={pendingBattleEventConfirm?.rewardDescriptions}
          unlockSpeciesPool={pendingBattleEventConfirm?.unlockSpeciesPool}
          unlockDescription={pendingBattleEventConfirm?.unlockDescription}
          unlockProgress={pendingBattleEventConfirm?.unlockProgress}
          battlePreviewTeam={pendingBattleEventConfirm?.battlePreviewTeam}
          alreadyCompleted={pendingBattleEventConfirm?.alreadyCompleted}
          onCancel={handleCancelBattleEventConfirm}
          onConfirm={handleConfirmBattleEvent}
        />
        <SpringRestoreConfirmModal
          open={Boolean(pendingSpringRestoreConfirm)}
          busy={springRestoreBusy}
          springName={pendingSpringRestoreConfirm?.springName}
          cost={pendingSpringRestoreConfirm?.healCost}
          currentGold={pendingSpringRestoreConfirm?.currentGold ?? playerGold}
          error={pendingSpringRestoreConfirm?.error}
          onCancel={handleCancelSpringRestoreConfirm}
          onConfirm={handleConfirmSpringRestore}
        />
	        <FastTravelMapModal
	          open={Boolean(pendingFastTravel)}
	          currentMapName={currentMapName}
	          currentGold={pendingFastTravel?.currentGold ?? playerGold}
	          playerTeam={playerTeam}
	          world={world}
	          busy={fastTravelBusy}
	          error={pendingFastTravel?.error}
	          onCancel={handleCancelFastTravel}
	          onTravel={handleFastTravelToMap}
	        />
	        <FastTravelTransitOverlay transit={fastTravelTransitTarget} />
	        <FastTravelTransitOverlay transit={mapWarpTransitTarget} />
        {levelUpCelebration && (
          <LevelUpCelebrationModal
            celebration={levelUpCelebration}
            onClose={dismissLevelUpCelebration}
          />
        )}
        {!isGrowthEventModalBlocked && pendingGrowthEvents[0]?.type === 'evolutionChoice' && (() => {
          const evt = pendingGrowthEvents[0];
          const mon = playerTeam.find(m => m.id === evt.monId);
          const targetBases = (evt.targetOptions || [])
            .map((targetId) => getBaseMonsterDefinition(targetId))
            .filter(Boolean);
          if (!mon || targetBases.length < 2) {
            return null;
          }
          return (
            <EvolutionCeremonyModal
              mon={mon}
              targetBases={targetBases}
              event={evt}
              onChoose={handleEvolution}
            />
          );
        })()}
        {!isGrowthEventModalBlocked && pendingGrowthEvents[0]?.type === 'evolution' && (() => {
          const evt = pendingGrowthEvents[0];
          const mon = playerTeam.find(m => m.id === evt.monId);
          const targetBase = getBaseMonsterDefinition(evt.targetId);
          if (!mon || !targetBase) {
            return null;
          }
          return (
            <EvolutionCeremonyModal
              mon={mon}
              targetBase={targetBase}
              event={evt}
              onChoose={handleEvolution}
            />
          );
        })()}
        {!isGrowthEventModalBlocked && pendingGrowthEvents[0]?.type === 'learnMove' && (() => {
          const evt = pendingGrowthEvents[0];
          const mon = playerTeam.find(m => m.id === evt.monId);
          if (!mon || !MOVES[evt.moveKey]) return null;
          return (
            <LearnMoveCeremonyModal
              mon={mon}
              moveKey={evt.moveKey}
              event={evt}
              onLearn={applyLearnMove}
              onChooseForget={handleLearnMoveChoice}
            />
          );
        })()}
      </div>
      </div>
    </div>
      )}
    </>
  );
};

// --- Notification System ---
const NOTIFICATION_ICON = {
  gold: { icon: 'fa-coins', bg: 'game-notification-toast__icon--gold' },
  item: { icon: 'fa-gift', bg: 'game-notification-toast__icon--item' },
  success: { icon: 'fa-circle-check', bg: 'game-notification-toast__icon--success' },
  info: { icon: 'fa-circle-info', bg: 'game-notification-toast__icon--info' },
  error: { icon: 'fa-circle-xmark', bg: 'game-notification-toast__icon--error' },
  warning: { icon: 'fa-triangle-exclamation', bg: 'game-notification-toast__icon--warning' }
}

const NotificationToastIcon = ({ type }) => {
  const meta = NOTIFICATION_ICON[type] || NOTIFICATION_ICON.info
  return (
    <div className={`game-notification-toast__icon ${meta.bg}`}>
      <i className={`fa-solid ${meta.icon}`} aria-hidden />
    </div>
  )
}

const NotificationToast = ({ notifications, mode = 'default' }) => (
  <div
    className={`game-notification-layer game-notification-layer--${mode}`}
    aria-hidden={notifications.length === 0}
  >
    <div className="game-notification-stack" role="status" aria-live="polite">
      {notifications.map((notif) => (
        <div
          key={notif.id}
          className={`game-notification-toast game-notification-toast--${notif.type || 'info'}`}
          style={{ '--toast-duration-ms': `${notif.durationMs || getNotificationDurationMs(notif.type, notif.message)}ms` }}
        >
          <NotificationToastIcon type={notif.type} />
          <p className="game-notification-toast__text">{notif.message}</p>
          <span className="game-notification-toast__timer" aria-hidden="true" />
        </div>
      ))}
    </div>
  </div>
);
