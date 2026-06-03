#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const toIds = (entries = []) => entries.map((entry) => Math.trunc(Number(entry?.pokemonId ?? entry?.id ?? entry)))

const sameIds = (left = [], right = []) => {
  const leftIds = toIds(left)
  const rightIds = toIds(right)
  return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index])
}

const formatNames = (entries = [], monsterById) => {
  const names = toIds(entries)
    .filter(Number.isInteger)
    .map((id) => monsterById.get(id)?.name || `#${id}`)
  return names.length > 0 ? names.join('、') : '无新增'
}

const getSnapshotUnlockContext = ({
  pool,
  completedStage,
  snapshot,
  getChallengeRareUnlockBatch,
  getChallengeRareUnlockedCountForStage,
}) => {
  const contextHasBatch = Array.isArray(snapshot?.challengeRareUnlockBatch)
  const contextStage = Math.trunc(Number(snapshot?.challengeRareUnlockStage))
  const unlockStage = Number.isSafeInteger(contextStage) && contextStage > 0
    ? contextStage
    : completedStage + 1
  const batchCompletedStage = Number.isSafeInteger(contextStage) && contextStage > 0
    ? Math.max(0, contextStage - 1)
    : completedStage
  const unlockBatch = contextHasBatch
    ? snapshot.challengeRareUnlockBatch
    : getChallengeRareUnlockBatch(pool, batchCompletedStage)
  const totalCount = pool.length
  const previousUnlockedCount = getChallengeRareUnlockedCountForStage(totalCount, completedStage)
  const fallbackUnlockedCount = getChallengeRareUnlockedCountForStage(totalCount, unlockStage)
  const contextUnlockedCount = Math.trunc(Number(snapshot?.challengeRareUnlockedCount))
  const unlockedCount = Math.min(
    totalCount,
    Math.max(
      previousUnlockedCount,
      fallbackUnlockedCount,
      Number.isSafeInteger(contextUnlockedCount) ? contextUnlockedCount : 0
    )
  )

  return {
    unlockStage,
    unlockBatch,
    previousUnlockedCount,
    unlockedCount,
    totalCount,
  }
}

await withViteAuditServer(async ({ loadModule }) => {
  const { ADVENTURE_MAP_CHAIN, getAdventureMapInfo } = await loadModule('/src/game/data/overworldMaps.js')
  const { getMapConfig } = await loadModule('/src/data/maps/mapConfig.js')
  const { MONSTERS } = await loadModule('/src/utils/gameData.js')
  const {
    normalizeChallengeRarePool,
    getChallengeRareUnlockBatch,
    getChallengeRareUnlockedCountForStage,
    getChallengeRareUnlockStageCount,
    getChallengeBattleGroupSize,
    MIN_CHALLENGE_RARE_UNLOCK_BATCH_SIZE,
  } = await loadModule('/src/utils/challengeRareUnlock.js')

  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))
  const errors = []
  const checks = []

  for (const mapId of ADVENTURE_MAP_CHAIN) {
    const mapInfo = getAdventureMapInfo(mapId)
    const mapLabel = getMapConfig(mapId)?.displayName || mapInfo?.displayName || mapId
    const challenge = (Array.isArray(mapInfo?.runtimeEvents) ? mapInfo.runtimeEvents : [])
      .find((event) => event?.type === 'challenge')
    const props = challenge?.properties && typeof challenge.properties === 'object'
      ? challenge.properties
      : {}
    const pool = normalizeChallengeRarePool(props.challengeRarePool)
    if (pool.length === 0) continue

    const stageCount = getChallengeRareUnlockStageCount(pool.length)
    const stagesToCheck = Array.from({ length: stageCount + 2 }, (_, index) => index)
    for (const completedStage of stagesToCheck) {
      const previewBatch = getChallengeRareUnlockBatch(pool, completedStage)
      const previewUnlockStage = completedStage + 1
      const previewUnlockedCount = getChallengeRareUnlockedCountForStage(pool.length, previewUnlockStage)
      const previewSnapshot = {
        challengeRareUnlockBatch: previewBatch,
        challengeRareUnlockStage: previewUnlockStage,
        challengeRareUnlockedCount: previewUnlockedCount,
        challengeRareTotalCount: pool.length,
      }
      const settlement = getSnapshotUnlockContext({
        pool,
        completedStage,
        snapshot: previewSnapshot,
        getChallengeRareUnlockBatch,
        getChallengeRareUnlockedCountForStage,
      })
      const passed = (
        settlement.unlockStage === previewUnlockStage &&
        settlement.unlockedCount === previewUnlockedCount &&
        settlement.totalCount === pool.length &&
        sameIds(settlement.unlockBatch, previewBatch)
      )
      const label = `${mapLabel} 第 ${previewUnlockStage} 次试炼`
      checks.push({
        mapId,
        mapName: mapLabel,
        eventId: challenge.id,
        completedStage,
        battleCount: getChallengeBattleGroupSize(completedStage),
        previewUnlockStage,
        previewUnlockedCount,
        previewBatch: toIds(previewBatch),
        previewNames: formatNames(previewBatch, monsterById),
        settlementUnlockStage: settlement.unlockStage,
        settlementUnlockedCount: settlement.unlockedCount,
        settlementBatch: toIds(settlement.unlockBatch),
        settlementNames: formatNames(settlement.unlockBatch, monsterById),
        passed,
      })
      if (!passed) {
        errors.push(`${label} 战前显示 ${formatNames(previewBatch, monsterById)}，战后结算 ${formatNames(settlement.unlockBatch, monsterById)}`)
      }
      if (previewBatch.length > 0 && previewBatch.length < MIN_CHALLENGE_RARE_UNLOCK_BATCH_SIZE) {
        errors.push(`${label} 解锁批次只有 ${previewBatch.length} 只：${formatNames(previewBatch, monsterById)}，至少需要 ${MIN_CHALLENGE_RARE_UNLOCK_BATCH_SIZE} 只`)
      }
    }
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      checkedMapCount: new Set(checks.map((check) => check.mapId)).size,
      checkedStageCount: checks.length,
      minUnlockBatchSize: MIN_CHALLENGE_RARE_UNLOCK_BATCH_SIZE,
      failedCount: errors.length,
    },
    checks,
  }, null, 2))

  if (errors.length > 0) {
    errors.forEach((error) => console.error(`- ${error}`))
    process.exitCode = 1
    return
  }

  console.log('[audit-trial-unlock-consistency] OK')
})
