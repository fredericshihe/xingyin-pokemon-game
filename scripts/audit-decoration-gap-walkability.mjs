// Invisible-wall audit for the first nine adventure maps.
// A tile may block only when a solid model's measured footprint (GLB bounds ×
// render scale, at its rendered position) touches the character's body circle
// at that tile's centre, or when it is an intentional blocker (water, cliff,
// map rim, hidden-zone seal, bridge, building, event).
import { withViteAuditServer } from './load-vite-module.mjs'

await withViteAuditServer(async ({ loadModule }) => {
  const { MAP_CATALOG, MAP_CHAIN } = await loadModule('/src/game/data/mapCatalog.js')
  const { composeMapEnvironment } = await loadModule('/src/game/data/mapEnvironmentComposition.js')
  const { narrowBridgeDecksToModels } = await loadModule('/src/game/bridgeDeckCollision.js')
  const { GODOT_REGION_MAPS } = await loadModule('/src/game/data/godotMaps/godot_region_maps.js')
  const { default: starter } = await loadModule('/src/game/data/godotMaps/my_first_map.js')
  const { BLOCKED_LEGACY_TILES } = await loadModule('/src/game/world/constants.js')
  const V = await loadModule('/src/game/mapVisualCollision.js')

  const failures = []
  const fail = (id, message) => failures.push(`${id}: ${message}`)
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  const mapIds = MAP_CHAIN.slice(0, 9)
  const rows = []

  const isOpen = (map, x, y) => {
    const tile = map.mapGrid[y]?.[x]
    return tile != null && !BLOCKED_LEGACY_TILES.has(tile) && !map.environmentBlockedTiles?.has(`${x},${y}`)
  }
  // Wrongly blocked = blocked, no solid footprint within the body radius, not
  // protected, and directly next to ground the player can stand on.
  const wronglyBlocked = (map) => {
    const { unsupported } = V.findUnsupportedBlockedTiles(map)
    const frontier = unsupported.filter((t) => DIRS.some(([dx, dy]) => isOpen(map, t.x + dx, t.y + dy)))
    return { wrong: frontier.filter((t) => !t.protected), kept: frontier.filter((t) => t.protected), interior: unsupported.length - frontier.length }
  }
  const components = (map, gates) => {
    const label = new Map()
    let next = 0
    for (let y = 0; y < map.height; y += 1) for (let x = 0; x < map.width; x += 1) {
      const key = `${x},${y}`
      if (label.has(key) || gates.has(key) || BLOCKED_LEGACY_TILES.has(map.mapGrid[y][x])) continue
      const queue = [[x, y]]
      label.set(key, next)
      for (let i = 0; i < queue.length; i += 1) {
        const [cx, cy] = queue[i]
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx, ny = cy + dy, nk = `${nx},${ny}`
          const tile = map.mapGrid[ny]?.[nx]
          if (tile == null || BLOCKED_LEGACY_TILES.has(tile) || gates.has(nk) || label.has(nk)) continue
          label.set(nk, next); queue.push([nx, ny])
        }
      }
      next += 1
    }
    return label
  }
  // Mirrors the module rule: tiny empty pockets (no grass/event, < 6 tiles) are not areas.
  const significantLabels = (map, labels) => {
    const size = new Map(), content = new Set()
    const events = new Set(V.getEventTilePositions(map).map(({ x, y }) => `${x},${y}`))
    labels.forEach((label, key) => {
      size.set(label, (size.get(label) || 0) + 1)
      const [x, y] = key.split(',').map(Number)
      if (map.mapGrid[y][x] === 8 || events.has(key)) content.add(label)
    })
    return new Set([...size].filter(([label, count]) => count >= V.SIGNIFICANT_REGION_TILES || content.has(label)).map(([label]) => label))
  }

  // Self-test: two rooms split by bare wall must stay split (gate guard works).
  {
    const W = 12, H = 7
    const mapGrid = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (
      y >= 2 && y <= 4 && ((x >= 1 && x <= 3) || (x >= 8 && x <= 10)) ? 0 : 1)))
    const synthetic = V.alignMapCollisionToVisibleModels({ id: 'GodotMap', width: W, height: H, mapGrid, decorativeObjects: [], runtimeEvents: [], encounterZones: [], renderForestWallUndergrowth: false, environmentBlockedTiles: new Set() })
    const labels = components(synthetic, new Set())
    if (labels.get('1,2') === labels.get('10,2')) fail('self-test', 'gate guard failed to keep two separate areas apart')
    if (synthetic.generationNotes.visualCollision.openedTiles === 0) fail('self-test', 'model-free wall next to a room was not opened')
    if (!synthetic.generationNotes.visualCollision.gateKeptTiles.length) fail('self-test', 'gate guard reported no kept tiles')
  }

  // A facility already explains its blocked tile; forest filler must not grow inside it.
  {
    const map = {
      mapGrid: Array.from({ length: 9 }, () => Array(9).fill(0)),
      decorativeObjects: [{ type: 'town_stall_green', x: 4, y: 4, scale: 1.7, rotation: Math.PI / 4 }]
    }
    const clear = V.createProceduralSceneryClearance(map)
    if (clear('bush', 4, 4, 1.05)) fail('self-test', 'bush allowed inside a rotated stall')
    if (clear('grassLarge', 4, 4, .9)) fail('self-test', 'ambient vegetation allowed inside a stall')
    if (!clear('bush', 7, 4, 1.05)) fail('self-test', 'clear ground beside a stall was rejected')
    if (clear('bush', 7, 4, 1.05, 0, -3 * V.VISUAL_COLLISION_CELL, 0)) fail('self-test', 'rendered foliage offsets were ignored')
    const bridge = { ...map, decorativeObjects: [], bridges: [{ x: 4, y: 4, length: 3, width: 1.12, rotation: Math.PI / 2 }] }
    if (V.createProceduralSceneryClearance(bridge)('treeDefault', 4, 4, 1)) fail('self-test', 'tree allowed through a bridge deck')
  }

  let facilityCount = 0
  for (const [id, { mapInfo: map }] of Object.entries(MAP_CATALOG)) {
    const reserved = V.collectSceneryExclusionFootprints(map)
    facilityCount += reserved.length
    for (const footprint of V.collectProceduralForestFootprints(map, map.mapGrid)) {
      if (reserved.some((facility) => V.footprintsOverlap(footprint, facility))) {
        fail(id, `${footprint.source} overlaps a facility at ${footprint.x.toFixed(2)},${footprint.y.toFixed(2)}`)
      }
    }
  }

  for (const id of mapIds) {
    const after = MAP_CATALOG[id].mapInfo
    const raw = { ...(id === 'GodotMap' ? starter : GODOT_REGION_MAPS[id]), id }
    // 桥面收窄（bridgeDeckCollision）是有意的：以收窄后的地形为基准
    const before = composeMapEnvironment(narrowBridgeDecksToModels(raw))
    const b = wronglyBlocked(before)
    const a = wronglyBlocked(after)
    // A model-free tile may stay blocked only if opening it would join two
    // separate significant areas around a gate; verify that independently.
    const gateKept = new Set(after.generationNotes?.visualCollision?.gateKeptTiles || [])
    const afterGates = V.collectProgressionGateTiles(after)
    const gateLabels = components(after, afterGates)
    const gateSignificant = significantLabels(after, gateLabels)
    a.wrong = a.wrong.filter((t) => {
      if (!gateKept.has(t.key)) return true
      const sides = new Set(DIRS.map(([dx, dy]) => gateLabels.get(`${t.x + dx},${t.y + dy}`)).filter((label) => gateSignificant.has(label)))
      if (sides.size < 2) return true
      a.kept.push({ ...t, protected: 'progression-gate' })
      return false
    })
    a.wrong.forEach((t) => fail(id, `tile ${t.key} (grid ${t.tile}${t.envBlocked ? ', scenery mask' : ''}) blocks with no solid model within ${V.CHARACTER_BODY_RADIUS_WORLD} world units`))

    // Opened tiles must be clear of every solid model and never be intentional blockers.
    const { covered } = V.findUnsupportedBlockedTiles(after)
    const keep = V.collectProtectedBlockedTiles(before)
    let opened = 0
    for (let y = 0; y < after.height; y += 1) for (let x = 0; x < after.width; x += 1) {
      const from = before.mapGrid[y][x], to = after.mapGrid[y][x], key = `${x},${y}`
      if (from === to) continue
      opened += 1
      if (![1, 20].includes(from)) fail(id, `${key} changed intentional tile ${from} -> ${to}`)
      if (BLOCKED_LEGACY_TILES.has(to)) fail(id, `${key} changed to another blocking tile ${to}`)
      if (keep.has(key)) fail(id, `${key} opened a protected tile (${keep.get(key)})`)
      if (covered.has(key)) fail(id, `${key} opened under a solid model (${covered.get(key)})`)
    }
    for (const key of after.environmentBlockedTiles) if (!covered.has(key)) fail(id, `scenery mask ${key} has no solid model`)

    // Progression: with gates closed, no opening may join two areas that were
    // separate before (locked zones, route blockers, NPCs, signs, warps).
    const gates = V.collectProgressionGateTiles(before)
    const beforeLabels = components(before, gates)
    const significant = significantLabels(before, beforeLabels)
    const afterLabels = components(after, gates)
    const joined = new Map()
    beforeLabels.forEach((label, key) => {
      if (!significant.has(label)) return
      const group = afterLabels.get(key)
      if (group == null) return
      if (!joined.has(group)) joined.set(group, label)
      else if (joined.get(group) !== label) fail(id, `opening joins separated areas at ${key}; a gate can be bypassed`)
    })

    const keptReasons = {}
    a.kept.forEach((t) => { const reason = String(t.protected).split(':')[0]; keptReasons[reason] = (keptReasons[reason] || 0) + 1 })
    rows.push({ id, before: b.wrong.length, after: a.wrong.length, opened, prunedMask: before.environmentBlockedTiles.size - after.environmentBlockedTiles.size, keptGaps: a.kept.length, keptReasons })
  }

  console.table(rows.map(({ keptReasons, ...row }) => ({ ...row, keptReasons: JSON.stringify(keptReasons) })))
  console.log('keptGaps = blocked tiles still clear of any model, deliberately kept (map rim, hidden-zone seals, bridges, buildings, events, progression gates).')
  if (failures.length) {
    console.error(`FAIL: ${failures.length} invisible-wall problem(s)`)
    failures.slice(0, 60).forEach((line) => console.error(`  ${line}`))
    process.exitCode = 1
    return
  }
  console.log(`PASS: ${mapIds.length} maps; every non-intentional blocked tile next to walkable ground is occupied by a solid model within ${V.CHARACTER_BODY_RADIUS_WORLD} world units, and no opening bypasses a gate.`)
  console.log(`PASS: ${Object.keys(MAP_CATALOG).length} maps, ${facilityCount} facility footprints; no procedural trees or bushes overlap facilities.`)
})
