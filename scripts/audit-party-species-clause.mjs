import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  MAX_STORAGE_SIZE,
  acquireMonster,
  getMonsterSpeciesKey,
  getPartySpeciesClauseViolation,
  releaseMonster,
  replacePartyMember,
  sanitizeRoster,
  swapPartyAndStorage,
  updateRosterMonster,
  withdrawToParty,
} from '../src/utils/pokemonRoster.js'

const serverMigration = fs.readFileSync(
  new URL('../supabase/migrations/202607200001_enforce_party_species_clause.sql', import.meta.url),
  'utf8'
)

assert.match(serverMigration, /game_save_has_duplicate_party_species\(NEW\.game_data\)/)
assert.match(serverMigration, /game_save_has_active_battle\(NEW\.game_data\)/)
assert.match(serverMigration, /NOT v_previous_battle_active/)
assert.match(serverMigration, /出战队伍不能包含重复物种/)

const monster = (id, baseId, name = `Pokemon ${baseId}`) => ({ id, baseId, name })

assert.equal(getMonsterSpeciesKey({ id: 'instance-a', baseId: 25, dexNo: 999 }), 'base:25')
assert.equal(getMonsterSpeciesKey({ id: 'instance-b', speciesId: '25' }), 'base:25')
assert.equal(getMonsterSpeciesKey({ id: 'instance-c', templateId: 25 }), 'base:25')
assert.equal(getMonsterSpeciesKey({ id: 'instance-d', monsterId: 25 }), 'base:25')
assert.equal(getMonsterSpeciesKey({ id: 'instance-e', dexNo: 25 }), 'dex:25')
assert.equal(getMonsterSpeciesKey({ id: 'instance-only' }), null)

const garchompA = monster('garchomp-a', 208, '烈咬陆鲨')
const garchompB = monster('garchomp-b', 208, '烈咬陆鲨')
const metagross = monster('metagross', 204, '巨金怪')
const lucario = monster('lucario', 205, '路卡利欧')

const repairedRoster = sanitizeRoster(
  [garchompA, garchompB, metagross],
  [lucario],
  garchompB.id
)
assert.deepEqual(repairedRoster.playerTeam.map(({ id }) => id), ['garchomp-a', 'metagross'])
assert.deepEqual(repairedRoster.storageBox.map(({ id }) => id), ['garchomp-b', 'lucario'])
assert.equal(repairedRoster.activePlayerId, garchompA.id)
assert.deepEqual(repairedRoster.movedToStorageIds, [garchompB.id])
assert.equal(repairedRoster.speciesClauseViolation, null)

const fullStorage = Array.from({ length: MAX_STORAGE_SIZE }, (_, index) => (
  monster(`stored-${index}`, 1000 + index)
))
const blockedRepairRoster = sanitizeRoster([garchompA, garchompB], fullStorage, garchompB.id)
assert.deepEqual(blockedRepairRoster.playerTeam.map(({ id }) => id), ['garchomp-a', 'garchomp-b'])
assert.equal(blockedRepairRoster.storageBox.length, MAX_STORAGE_SIZE)
assert.equal(blockedRepairRoster.activePlayerId, garchompB.id)
assert.equal(blockedRepairRoster.requiresRosterRepair, true)
assert.equal(blockedRepairRoster.speciesClauseViolation?.speciesKey, 'base:208')
assert.equal(
  blockedRepairRoster.playerTeam.length + blockedRepairRoster.storageBox.length,
  2 + MAX_STORAGE_SIZE
)

const repairedAfterRelease = releaseMonster(
  blockedRepairRoster,
  fullStorage[0].id,
  { from: 'storage' }
)
assert.equal(repairedAfterRelease.success, true)
assert.deepEqual(repairedAfterRelease.playerTeam.map(({ id }) => id), ['garchomp-a'])
assert.equal(repairedAfterRelease.storageBox.some(({ id }) => id === garchompB.id), true)
assert.equal(repairedAfterRelease.speciesClauseViolation, null)
assert.equal(
  repairedAfterRelease.playerTeam.length + repairedAfterRelease.storageBox.length,
  1 + MAX_STORAGE_SIZE
)

const duplicateCapture = acquireMonster(
  { playerTeam: [garchompA], storageBox: [], activePlayerId: garchompA.id },
  garchompB
)
assert.equal(duplicateCapture.success, true)
assert.equal(duplicateCapture.outcome, 'storage')
assert.deepEqual(duplicateCapture.playerTeam.map(({ id }) => id), ['garchomp-a'])
assert.deepEqual(duplicateCapture.storageBox.map(({ id }) => id), ['garchomp-b'])

const duplicateCaptureWithFullStorage = acquireMonster(
  { playerTeam: [garchompA], storageBox: fullStorage, activePlayerId: garchompA.id },
  garchompB
)
assert.equal(duplicateCaptureWithFullStorage.needsDecision, true)
assert.deepEqual(duplicateCaptureWithFullStorage.options, ['release'])

const duplicateWithdraw = withdrawToParty(
  { playerTeam: [garchompA], storageBox: [garchompB], activePlayerId: garchompA.id },
  garchompB.id
)
assert.equal(duplicateWithdraw.success, false)
assert.equal(duplicateWithdraw.error, 'duplicate_species')

const duplicateSwap = swapPartyAndStorage(
  { playerTeam: [garchompA, metagross], storageBox: [garchompB], activePlayerId: garchompA.id },
  metagross.id,
  garchompB.id
)
assert.equal(duplicateSwap.success, false)
assert.equal(duplicateSwap.error, 'duplicate_species')

const sameSpeciesSwap = swapPartyAndStorage(
  { playerTeam: [garchompA, metagross], storageBox: [garchompB], activePlayerId: garchompA.id },
  garchompA.id,
  garchompB.id
)
assert.equal(sameSpeciesSwap.success, true)
assert.deepEqual(sameSpeciesSwap.playerTeam.map(({ id }) => id), ['garchomp-b', 'metagross'])

const duplicateReplacement = replacePartyMember(
  { playerTeam: [garchompA, metagross], storageBox: [], activePlayerId: garchompA.id },
  metagross.id,
  garchompB
)
assert.equal(duplicateReplacement.success, false)
assert.equal(duplicateReplacement.error, 'duplicate_species')

const speciesChangingUpdate = updateRosterMonster(
  { playerTeam: [garchompA, metagross], storageBox: [], activePlayerId: metagross.id },
  metagross.id,
  { ...metagross, baseId: garchompA.baseId, name: garchompA.name }
)
assert.equal(speciesChangingUpdate.success, true)
assert.deepEqual(speciesChangingUpdate.playerTeam.map(({ id }) => id), ['garchomp-a'])
assert.deepEqual(speciesChangingUpdate.storageBox.map(({ id }) => id), ['metagross'])
assert.equal(speciesChangingUpdate.activePlayerId, garchompA.id)
assert.equal(speciesChangingUpdate.from, 'storage')

assert.equal(getPartySpeciesClauseViolation([garchompA, metagross]), null)
assert.equal(getPartySpeciesClauseViolation([garchompA, garchompB])?.speciesName, '烈咬陆鲨')
assert.equal(getPartySpeciesClauseViolation([]), null)

const storageDuplicatesRemainUnrestricted = sanitizeRoster([], [garchompA, garchompB], null)
assert.deepEqual(storageDuplicatesRemainUnrestricted.storageBox.map(({ id }) => id), [
  'garchomp-a',
  'garchomp-b',
])

console.log('Party species clause audit passed.')
