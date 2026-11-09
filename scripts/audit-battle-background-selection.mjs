import assert from 'node:assert/strict'
import { MAP_IDS, getMapInfo, getMapRuntimeEvents } from '../src/game/data/mapCatalog.js'
import { BATTLE_BACKGROUNDS, resolveBattleBackgroundId, snapshotBattleOpponent } from '../src/game/data/battleBackgroundCatalog.js'
import { resolveBattleElementTheme, resolveBattlePresentationClasses } from '../src/game/data/battleBackgroundPresentation.js'

let cases = 0
for (const mapName of MAP_IDS) {
  const map = getMapInfo(mapName), events = getMapRuntimeEvents(mapName)
  for (const zone of map.encounterZones || []) {
    const environment = { battleKind: 'wild', mapName, zoneId: zone.id, triggerPosition: { x: zone.x + .5, y: zone.y + .5 } }
    const id = resolveBattleBackgroundId(environment, map, events)
    assert.equal(BATTLE_BACKGROUNDS[id].mapName, mapName)
    assert.equal(resolveBattleBackgroundId({ ...environment, backgroundId: id, opponent: { types: ['water', 'dragon'] } }, map, events), id)
    cases++
  }
  for (const event of events.filter(event => ['trainer', 'boss', 'challenge'].includes(event.type))) {
    const environment = { mapName, battleKind: 'trainer', eventId: event.id, eventPosition: event.position }
    const id = resolveBattleBackgroundId(environment, map, events)
    assert.equal(BATTLE_BACKGROUNDS[id].mapName, mapName)
    assert.equal(resolveBattleBackgroundId(JSON.parse(JSON.stringify({ ...environment, backgroundId: id })), map, events), id)
    cases++
  }
}
const resolve = (mapName, props) => resolveBattleBackgroundId({ mapName, ...props }, getMapInfo(mapName), getMapRuntimeEvents(mapName))
assert.equal(resolve('GodotMapV2_PirateShore', { zoneId: 'shore_wreck_inner', triggerPosition: { x: 35, y: 23 } }), 'shore-cabin')
assert.equal(resolve('GodotMapV2_HexRuins', { zoneId: 'hex_sealed_chamber', triggerPosition: { x: 31, y: 9 } }), 'ruins-vault')
assert.equal(resolve('GodotMapV2_FarmTown', { zoneId: 'farm_windmill_top', triggerPosition: { x: 7, y: 7 } }), 'farm-windmill')
assert.equal(resolve('GodotMap', { zoneId: 'lake_south_reeds' }), 'valley-lakeshore')
assert.equal(resolve('GodotMapV2_MistLake', { zoneId: 'lake_south_reeds' }), 'mist-reeds')
assert.equal(resolve('GodotMapV2_ChampionTower', { championTowerFloor: 10 }), 'champion-summit')
assert.equal(resolve('GodotMapV2_ChampionTower', { championTowerFloor: 9 }), 'champion-hall')
assert.equal(resolve('GodotMapV2', { triggerPosition: { x: 20, y: 17 }, opponent: { types: ['water'] } }), 'meadow-trail', 'Aquatic opponent cannot invent a lake')
assert.equal(resolve('GodotMapV2_HexRuins', { triggerPosition: { x: 1, y: 17 } }), 'ruins-courtyard', 'Remote locations cannot snap to a far encounter zone')
assert.deepEqual(snapshotBattleOpponent([{ pokedexId: 130, type: 'water', type2: 'flying' }]), { speciesId: 130, types: ['water', 'flying'], teamSize: 1 })
assert.equal(resolveBattleElementTheme(snapshotBattleOpponent([{ pokedexId: 4, type: 'fire' }])), 'ember')
assert.equal(resolveBattleElementTheme(snapshotBattleOpponent([{ pokedexId: 7, type: 'water' }])), 'water')
assert.equal(resolveBattleElementTheme(snapshotBattleOpponent([{ pokedexId: 131, type: 'ice' }])), 'frost')
assert.match(resolveBattlePresentationClasses({ opponentSnapshot: { types: ['dragon'], teamSize: 3 }, eventRole: 'boss', encounterRarity: { tier: 'mythic' } }, { battleKind: 'trainer', battlePhase: 'active' }), /battle-theme-dragon/)
assert.match(resolveBattlePresentationClasses({ opponentSnapshot: { types: ['dragon'], teamSize: 3 }, eventRole: 'boss', encounterRarity: { tier: 'mythic' } }, { battleKind: 'trainer', battlePhase: 'active' }), /battle-presentation-boss/)
assert.match(resolveBattlePresentationClasses({ opponentSnapshot: { types: ['dragon'], teamSize: 3 }, eventRole: 'boss', encounterRarity: { tier: 'mythic' } }, { battleKind: 'trainer', battlePhase: 'active' }), /battle-presentation-rarity-mythic/)
assert.equal(resolveBattleElementTheme({}), 'neutral', 'Old saves without an opponent snapshot use a neutral theme')
const stableTheme = resolveBattlePresentationClasses({ opponentSnapshot: { types: ['water'], teamSize: 1 }, eventRole: 'normal' }, { battleKind: 'wild', battlePhase: 'active' })
assert.match(stableTheme, /battle-theme-water/)
assert.match(stableTheme, /battle-presentation-wild/)
console.log(`Background selection: ${MAP_IDS.length} maps, ${cases} encounters, ${Object.keys(BATTLE_BACKGROUNDS).length} authored environments, restore/switch/location guards passed.`)
