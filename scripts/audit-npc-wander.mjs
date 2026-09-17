#!/usr/bin/env node
import assert from 'node:assert/strict'
import { NPC_WANDER_RADIUS, buildNpcWanderArea, createNpcWanderer, isNpcWanderEnabled } from '../src/game/npcWander.js'
import { ELITE_FOUR_CEREMONY_MAP_IDS } from '../src/game/data/eliteFourCeremony.js'

let checkCount = 0
function check(name, run) {
  run()
  checkCount += 1
  console.log(`PASS ${name}`)
}

const home = { x: 5, y: 5 }
const corridor = new Set(['5,5', '6,5', '7,5'])
const walker = (options = {}) => createNpcWanderer({ home, area: corridor, random: () => 0.5, ...options })
const snapshot = (value) => JSON.parse(JSON.stringify(value))

check('Only ordinary NPCs wander, including BossHighland trainers and eventless characters', () => {
  for (const type of ['trainer', 'merchant']) {
    assert.equal(isNpcWanderEnabled({ mapId: 'GodotMapV2_BossHighland', event: { type } }), true)
    assert.equal(isNpcWanderEnabled({ mapId: 'GodotMapV2_ChampionTower', event: { type } }), true)
  }
  for (const role of ['normal', 'lieutenant', 'reward', 'minigame']) {
    assert.equal(isNpcWanderEnabled({ event: { type: 'trainer', properties: { role } } }), true)
  }
  assert.equal(isNpcWanderEnabled({ event: null, npcRole: 'normal' }), true)
  assert.equal(isNpcWanderEnabled({ event: { type: 'boss' } }), false)
  assert.equal(isNpcWanderEnabled({ event: { type: 'trainer', properties: { role: 'boss' } } }), false)
  assert.equal(isNpcWanderEnabled({ event: { type: 'trainer', role: 'boss' } }), false)
  assert.equal(isNpcWanderEnabled({ event: null, npcRole: 'boss' }), false)
  assert.equal(isNpcWanderEnabled({ event: { type: 'objective' } }), false)
  for (const mapId of ELITE_FOUR_CEREMONY_MAP_IDS) {
    assert.equal(isNpcWanderEnabled({ mapId, event: { type: 'trainer' } }), false)
    assert.equal(isNpcWanderEnabled({ mapId, event: null }), false)
  }
})

check('Area stays within the two-tile radius and cannot cross blocked ground diagonally', () => {
  assert.equal(NPC_WANDER_RADIUS, 2)
  const open = buildNpcWanderArea({ home })
  assert.equal(open.size, 25)
  for (const key of open) {
    const [x, y] = key.split(',').map(Number)
    assert.ok(Math.max(Math.abs(x - home.x), Math.abs(y - home.y)) <= 2)
  }
  const behindWall = buildNpcWanderArea({ home, canVisit: (x) => x !== 6 })
  assert.equal(behindWall.has('7,5'), false)
  const diagonalOnly = buildNpcWanderArea({ home, canVisit: (x, y) => x === 6 && y === 6 })
  assert.deepEqual([...diagonalOnly], ['5,5'])
  assert.deepEqual([...buildNpcWanderArea({ home, canVisit: () => false })], ['5,5'])
})

check('Waiting and movement use active elapsed time; paused updates cannot advance either', () => {
  const npc = walker()
  npc.update(2000)
  const idle = snapshot(npc.state)
  npc.update(60000, { paused: true })
  assert.deepEqual(npc.state, idle)
  npc.update(749)
  assert.equal(npc.state.moving, false)
  npc.update(1)
  assert.equal(npc.state.moving, true)
  npc.update(450)
  assert.equal(npc.state.x, 5.5)
  assert.equal(npc.state.stepProgress, 0.5)
  const moving = snapshot(npc.state)
  npc.update(60000, { paused: true })
  assert.deepEqual(npc.state, moving)
  npc.update(450)
  assert.equal(npc.state.tileX, 6)
  assert.equal(npc.state.moving, false)
})

check('A moving NPC reserves source and destination, releasing its source after landing', () => {
  const npc = walker()
  npc.update(2750)
  assert.deepEqual(npc.state.target, { x: 6, y: 5 })
  assert.deepEqual(npc.state.occupiedTiles, [{ x: 5, y: 5 }, { x: 6, y: 5 }])
  npc.update(450)
  assert.equal(npc.state.tileX, 5)
  assert.deepEqual(npc.state.occupiedTiles, [{ x: 5, y: 5 }, { x: 6, y: 5 }])
  npc.update(450)
  assert.deepEqual(npc.state.occupiedTiles, [{ x: 6, y: 5 }])
  assert.equal(npc.state.target, null)
})

check('A nearby player blocks new steps while allowing an already reserved step to finish', () => {
  const npc = walker()
  npc.update(60000, { nearPlayer: true })
  npc.update(2749)
  assert.equal(npc.state.moving, false)
  npc.update(1)
  npc.update(900, { nearPlayer: true })
  assert.equal(npc.state.tileX, 6)
  assert.equal(npc.state.moving, false)
  npc.update(60000, { nearPlayer: true })
  assert.equal(npc.state.tileX, 6)
  assert.equal(npc.state.moving, false)
})

check('Idle choices can turn without walking, then wait before another decision', () => {
  const npc = walker({ random: () => 0 })
  npc.update(1499)
  assert.equal(npc.state.direction, 'down')
  npc.update(1)
  assert.equal(npc.state.direction, 'up')
  assert.equal(npc.state.moving, false)
  assert.equal(npc.state.x, 5)
  npc.update(1499)
  assert.equal(npc.state.direction, 'up')
})

check('Pause and step durations stay within the advertised ranges', () => {
  for (const [durationSample, waitMs, stepMs] of [[0, 1500, 700], [1, 4000, 1100]]) {
    const samples = [durationSample, 0.5, 0.5, durationSample, 0]
    const npc = walker({ random: () => samples.length ? samples.shift() : 0.5 })
    npc.update(waitMs - 1)
    assert.equal(npc.state.moving, false)
    npc.update(1)
    assert.equal(npc.state.moving, true)
    npc.update(stepMs - 1)
    assert.equal(npc.state.moving, true)
    npc.update(1)
    assert.equal(npc.state.moving, false)
    assert.equal(npc.state.tileX, 6)
  }
})

check('Live occupancy is rechecked at every step, including a walking burst', () => {
  const npc = walker()
  const queried = []
  npc.update(2750, { canOccupy: (x, y) => { queried.push([x, y]); return true } })
  assert.deepEqual(queried, [[6, 5]])
  npc.update(900)
  npc.update(1, { canOccupy: () => false })
  assert.equal(npc.state.moving, false)
  assert.equal(npc.state.tileX, 6)
  assert.deepEqual(npc.state.occupiedTiles, [{ x: 6, y: 5 }])
})

check('Two NPCs cannot claim the same destination or cross each other through a reserved source', () => {
  const left = walker({ home: { x: 5, y: 5 } })
  const right = walker({ home: { x: 7, y: 5 } })
  const canOccupy = (other) => (x, y) => !other.state.occupiedTiles.some((tile) => tile.x === x && tile.y === y)
  left.update(2750, { canOccupy: canOccupy(right) })
  right.update(2750, { canOccupy: canOccupy(left) })
  assert.equal(left.state.target.x, 6)
  assert.equal(right.state.moving, false)
  const neighbour = walker({ home: { x: 4, y: 5 }, area: new Set(['4,5', '5,5']) })
  neighbour.update(2750, { canOccupy: canOccupy(left) })
  assert.equal(neighbour.state.moving, false)
})

check('Congested and isolated NPCs finish updates without a retry loop or area escape', () => {
  for (const area of [corridor, new Set(['5,5'])]) {
    const npc = walker({ area })
    for (let index = 0; index < 100; index += 1) npc.update(1e9, { canOccupy: () => false })
    assert.equal(npc.state.moving, false)
    assert.deepEqual(npc.state.occupiedTiles, [{ x: 5, y: 5 }])
  }
  let seed = 7
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const area = buildNpcWanderArea({ home })
  const npc = walker({ area, random })
  let moved = false
  let waited = false
  for (let index = 0; index < 10000; index += 1) {
    npc.update(50)
    moved ||= npc.state.moving
    waited ||= !npc.state.moving
    for (const tile of npc.state.occupiedTiles) assert.ok(area.has(`${tile.x},${tile.y}`))
    if (npc.state.target) assert.equal(Math.abs(npc.state.target.x - npc.state.tileX) + Math.abs(npc.state.target.y - npc.state.tileY), 1)
  }
  assert.ok(moved && waited)
})

check('Invalid deltas do not change the simulation and a long update completes at most one step', () => {
  const npc = walker()
  const initial = snapshot(npc.state)
  for (const delta of [0, -1, Infinity, NaN]) npc.update(delta)
  assert.deepEqual(npc.state, initial)
  npc.update(1e9)
  assert.equal(npc.state.tileX, 5)
  assert.equal(npc.state.moving, true)
  npc.update(1e9)
  assert.equal(npc.state.tileX, 6)
  assert.equal(npc.state.moving, false)
})

console.log(`NPC wander audit passed: ${checkCount} behavior checks.`)
