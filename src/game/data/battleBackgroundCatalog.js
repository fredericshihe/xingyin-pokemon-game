// One authored environment per materially different location. The opening
// opponent snapshot may refine a waterside composition, never replace its biome.
// Image files are registered separately, only after generation and visual review.
const rows = [
  ['valley-camp', 'GodotMap', '山谷营地', 'A sheltered green valley campsite, canvas tents, stacked firewood and a small oak tree behind a wide packed-earth practice clearing.'],
  ['valley-meadow', 'GodotMap', '阳光草坡', 'A gentle sunny valley meadow with low wild grass, distant rounded hills and a narrow earthen footpath.'],
  ['valley-flowers', 'GodotMap', '花丘草地', 'A sunlit hillside in the starter valley, small white and yellow wildflowers along a grassy clearing, rounded oaks in the distance.'],
  ['valley-grove', 'GodotMap', '山谷密林', 'A sheltered oak grove inside the starter valley, mossy roots at the edges and filtered sunlight on a broad forest floor.'],
  ['valley-lakeshore', 'GodotMap', '山谷湖畔', 'A freshwater valley lake beyond a broad firm grassy shore, reeds, a few smooth pale rocks, gentle ripples and distant green hills.'],
  ['valley-rocks', 'GodotMap', '东南岩坡', 'A slightly rocky grassy slope above the southern valley lake, warm granite outcrops at the edges, clear open turf in front.'],
  ['meadow-trail', 'GodotMapV2', '星音草径', 'An open emerald meadow trail, mature oak trees, low camp tents far to one side, a worn path crossing spacious turf.'],
  ['meadow-flowers', 'GodotMapV2', '星音东花地', 'An eastern wildflower field with scattered pink and white flowers, lush green grass, low rolling hills and warm afternoon sky.'],
  ['meadow-sanctuary', 'GodotMapV2', '星音秘境', 'A secluded grove with an ancient spreading oak and a small spring behind the clearing, speckled sunlight, lush foliage at the edges.'],
  ['meadow-arena', 'GodotMapV2', '草径试炼场', 'A well-used outdoor training clearing within an oak meadow, a low timber boundary and modest plain pennants in the distance, wide unobstructed grass and earth.'],
  ['mist-reeds', 'GodotMapV2_MistLake', '雾湖苇岸', 'A misty freshwater lake viewed from a firm reed-lined shore, a small wooden canoe pulled onto the far bank, distant blue-green woodland.'],
  ['mist-shallows', 'GodotMapV2_MistLake', '雾湖浅滩', 'A very shallow clear lake margin, smooth pebbles and wet sand in front, reeds and water lilies to the sides, soft low lake mist.'],
  ['mist-islet', 'GodotMapV2_MistLake', '湖畔对战台', 'A broad weathered stone lakeside platform, lake water behind it, small wooden mooring posts and reeds at its outer edges, low blue morning mist.'],
  ['mist-sanctuary', 'GodotMapV2_MistLake', '环湖秘径', 'An intimate hidden path around a quiet misty lake, arching willow branches and tall reeds surrounding a dry clearing, water glimpsed through foliage.'],
  ['farm-rows', 'GodotMapV2_FarmTown', '农庄田垄', 'An orderly farm with wheat rows behind a broad flat earthen field margin, a timber fence and distant windmill, honey-gold afternoon light.'],
  ['farm-yard', 'GodotMapV2_FarmTown', '农庄仓场', 'A spacious windmill farmyard of warm packed soil, a barn, wooden cart, stacked hay bales and produce crates arranged along the perimeter.'],
  ['farm-windmill', 'GodotMapV2_FarmTown', '风车塔顶', 'A broad safe wooden upper windmill deck, curved masonry wall on one side, timber railing and far wheat fields, a small portion of the windmill sail above.'],
  ['shore-dunes', 'GodotMapV2_PirateShore', '海岸沙丘', 'A broad sandy dune hollow with coastal grass, pale shell fragments and a blue ocean beyond low dunes, fresh sea breeze.'],
  ['shore-tidepools', 'GodotMapV2_PirateShore', '礁湾浅滩', 'A low coastal tidal shore with shallow blue tide pools and rounded rock shelves, wet sand in front, ocean waves further back.'],
  ['shore-dock', 'GodotMapV2_PirateShore', '船坞码头', 'A wide old wooden dockside court beside the sea, moored small boat, rope coils, barrels and cargo crates kept at the far perimeter.'],
  ['shore-wreck', 'GodotMapV2_PirateShore', '沉船潮草', 'A coastal sandy clearing beside the weathered hull of a grounded wooden sailing ship, broken mast and rope in the distance, sea grass and tide beyond.'],
  ['shore-cabin', 'GodotMapV2_PirateShore', '沉船内舱', 'Inside a spacious abandoned wooden ship hold, curved ribs, weathered deck planks, light through a broken hull window, a few crates at the edges.'],
  ['grave-path', 'GodotMapV2_Graveyard', '墓园古道', 'A quiet old cemetery path under blue moonlight, orderly small headstones, a weathered stone arch and glass lanterns, restrained ground mist, gentle non-horror atmosphere.'],
  ['grave-mooncourt', 'GodotMapV2_Graveyard', '月影庭院', 'A broad moonlit cemetery courtyard of aged stone, distant old memorial stones and a low arch, a pale full moon, faint lavender mist at the perimeter.'],
  ['grave-deepwood', 'GodotMapV2_Graveyard', '墓园深林', 'A secluded moonlit forest behind an old cemetery, gnarled tree trunks, moss and a few distant weathered stones, open dark earth with soft silver light.'],
  ['ruins-courtyard', 'GodotMapV2_HexRuins', '六角遗迹外庭', 'An ancient stone courtyard built from large hexagonal paving blocks, broken stone arches, sparse grass in seams and weathered pillars, cool teal ambient light.'],
  ['ruins-galleries', 'GodotMapV2_HexRuins', '遗迹回廊', 'A sheltered archaeological stone gallery with tall worn arches and hexagonal architectural blocks, subtle old machinery far to the side, open stone floor.'],
  ['ruins-vault', 'GodotMapV2_HexRuins', '封印密室', 'An enclosed ancient vault of dark hexagonal stone masonry, recessed blue-green crystal lighting and a sealed stone doorway in the distance, spacious unmarked stone floor.'],
  ['ridge-trail', 'GodotMapV2_SurvivalRidge', '铁木山脊', 'A mountain ridge trail with dark rocks, hardy grass and ironwood trees, distant rocky slopes, broad level gravel and earth in front.'],
  ['ridge-camp', 'GodotMapV2_SurvivalRidge', '铁木营地', 'A rugged expedition camp in rocky highlands, tents, a workbench, cut logs and barrels neatly at the edges of a large firm training clearing.'],
  ['ridge-training', 'GodotMapV2_SurvivalRidge', '铁木训练林', 'An ironwood training grove, tall straight trunks, low wooden balance beams and cut logs at the perimeter, clean hard-packed earth in the center.'],
  ['peak-meadow', 'GodotMapV2_BossHighland', '星雾高地', 'A high alpine meadow above a sea of clouds, sparse blue-green grass, dark mountain rocks and small plain summit pennants, pale lilac mountain light.'],
  ['peak-observatory', 'GodotMapV2_BossHighland', '观星秘径', 'A secluded high mountain observation clearing with an old brass telescope and weathered low stone markers near the edges, clouds and distant peaks under a faint starry twilight.'],
  ['peak-throne', 'GodotMapV2_BossHighland', '星雾峰顶', 'A grand open mountain summit court, weathered stone platform, distant plain summit banners and craggy rocks framing a vast cloud sea, luminous blue-violet twilight.'],
  ['frost-court', 'GodotMapV2_FrostDojo', '霜镜道馆阶庭', 'A refined ice-themed open dojo court, pale frost-covered stone, frozen mirror ponds beside the walkway and tall icy crystal monuments, calm blue-white light.'],
  ['frost-throne', 'GodotMapV2_FrostDojo', '霜镜天王台', 'An imposing upper frost dojo arena of pale stone and clear ice, paired ice crystal monuments behind a broad court, distant snowy walls, silver-blue light.'],
  ['tide-causeway', 'GodotMapV2_TideDojo', '深潮环湖台', 'A wide pale stone causeway in a deep-blue tidal dojo, concentric pools and restrained water channels around a dry fighting floor, graceful aquatic stone monuments.'],
  ['tide-throne', 'GodotMapV2_TideDojo', '深潮天王台', 'A broad dry stone dais beside a deep circular tidal pool, monumental water gates and distant cascading water, clear turquoise accents and dark blue depth.'],
  ['iron-court', 'GodotMapV2_IronDojo', '铁壁要塞庭', 'An outdoor steel fortress dojo court, dark stone floor with restrained metal inlay, defensive bastions, compact beacons and heavy industrial columns at the perimeter.'],
  ['iron-throne', 'GodotMapV2_IronDojo', '铁壁天王台', 'A monumental upper fortress arena, layered steel bastions and heavy stone pillars behind a wide dark steel-and-stone floor, warm small beacon lights and cool steel reflections.'],
  ['dragon-terrace', 'GodotMapV2_DragonDojo', '龙穹天桥', 'A wide elevated stone skybridge in a dragon-themed mountain dojo, carved stone archways, tall dark spires at the edges, narrow water channels below and clouds beyond.'],
  ['dragon-throne', 'GodotMapV2_DragonDojo', '龙穹天王台', 'A majestic summit stone arena in the dragon dojo, tall carved arches and paired dragon-inspired architectural spires, open sky and distant clouds, restrained violet and gold light.'],
  ['champion-hall', 'GodotMapV2_ChampionTower', '冠军塔对战厅', 'An elegant champion tower battle hall, refined pale stone floor, tall blue-and-gold architectural gates and slender obelisks at the edges, open windows with distant clouds.'],
  ['champion-summit', 'GodotMapV2_ChampionTower', '冠军塔巅峰', 'The uppermost champion tower arena, a broad polished stone terrace framed by slim gold-trimmed columns, vast cloud sea and luminous dawn sky, ceremonial but uncluttered.'],
]

export const BATTLE_BACKGROUNDS = Object.fromEntries(rows.map(([id, mapName, label, scene]) => [id, Object.freeze({ id, mapName, label, scene })]))
export const BATTLE_BACKGROUND_MAP_DEFAULTS = Object.fromEntries(rows.map(row => row[1]).map(map => [map, rows.find(row => row[1] === map)[0]]))

export const BATTLE_BACKGROUND_ZONES = {
  GodotMap: { sunny_meadow: 'valley-meadow', upper_flower_grass: 'valley-flowers', grove_grass: 'valley-grove', lake_north_reeds: 'valley-lakeshore', lake_south_reeds: 'valley-lakeshore', southeast_meadow: 'valley-rocks' },
  GodotMapV2: { meadow_west_grass: 'meadow-trail', meadow_south_grass: 'meadow-trail', meadow_east_flowers: 'meadow-flowers', meadow_hidden_grove: 'meadow-sanctuary' },
  GodotMapV2_MistLake: { lake_west_reeds: 'mist-reeds', lake_south_reeds: 'mist-reeds', lake_east_reeds: 'mist-shallows', lake_hidden_path: 'mist-sanctuary' },
  GodotMapV2_FarmTown: { farm_north_rows: 'farm-rows', farm_west_rows: 'farm-rows', farm_east_rows: 'farm-rows', farm_windmill_top: 'farm-windmill' },
  GodotMapV2_PirateShore: { shore_dune_grass: 'shore-dunes', shore_south_grass: 'shore-tidepools', shore_wreck_grass: 'shore-wreck', shore_wreck_inner: 'shore-cabin' },
  GodotMapV2_Graveyard: { grave_north_thicket: 'grave-path', grave_south_thicket: 'grave-path', grave_moon_grass: 'grave-mooncourt', grave_deep_forest: 'grave-deepwood' },
  GodotMapV2_HexRuins: { hex_north_ruins: 'ruins-courtyard', hex_west_ruins: 'ruins-galleries', hex_east_ruins: 'ruins-courtyard', hex_sealed_chamber: 'ruins-vault' },
  GodotMapV2_SurvivalRidge: { ridge_north_grass: 'ridge-trail', ridge_south_grass: 'ridge-trail', ridge_east_grass: 'ridge-trail', ridge_training_grove: 'ridge-training' },
  GodotMapV2_BossHighland: { peak_west_grass: 'peak-meadow', peak_south_grass: 'peak-meadow', peak_east_grass: 'peak-meadow', peak_starwatch_path: 'peak-observatory' },
}

const EVENT_BACKGROUNDS = {
  valley_trainer_camp_path: 'valley-camp', valley_trainer_grove_guard: 'valley-grove', valley_trainer_flower_hill: 'valley-flowers', valley_trainer_lake_path: 'valley-lakeshore',
  region_boss: 'meadow-arena', region_challenge_stone: 'meadow-arena',
  mistlake_boss: 'mist-islet', mistlake_challenge_stone: 'mist-islet', mistlake_trainer_2: 'mist-shallows', mistlake_trainer_4: 'mist-shallows',
  farmtown_boss: 'farm-yard', farmtown_challenge_stone: 'farm-yard', farmtown_trainer_2: 'farm-yard', farmtown_trainer_3: 'farm-yard', farmtown_trainer_4: 'farm-yard',
  pirateshore_boss: 'shore-dock', pirateshore_challenge_stone: 'shore-dock', pirateshore_lieutenant_3: 'shore-dock', pirateshore_trainer_2: 'shore-tidepools', pirateshore_trainer_4: 'shore-wreck', npc_shore_pirate_reward: 'shore-dock',
  graveyard_boss: 'grave-mooncourt', graveyard_challenge_stone: 'grave-mooncourt', npc_grave_keeper_reward: 'grave-mooncourt',
  hexruins_boss: 'ruins-courtyard', hexruins_challenge_stone: 'ruins-courtyard', npc_hex_researcher_reward: 'ruins-galleries',
  survivalridge_boss: 'ridge-camp', survivalridge_challenge_stone: 'ridge-camp', survivalridge_trainer_3: 'ridge-camp', npc_ridge_training_reward: 'ridge-training', npc_ridge_coin_sprint: 'ridge-training',
  bosshighland_boss: 'peak-throne', bosshighland_challenge_stone: 'peak-throne', npc_peak_stargazer_reward: 'peak-observatory',
  elite_frost_boss: 'frost-throne', elite_tide_boss: 'tide-throne', elite_iron_boss: 'iron-throne', elite_dragon_boss: 'dragon-throne',
}

const point = value => value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))
  ? { x: Number(value.x), y: Number(value.y) } : null
const distanceToZone = (p, z) => Math.hypot(Math.max(z.x - p.x, 0, p.x - (z.x + z.width)), Math.max(z.y - p.y, 0, p.y - (z.y + z.height)))

export function snapshotBattleOpponent(team = []) {
  const first = team[0] || {}
  return { speciesId: Number(first.pokedexId || first.dexNo || first.baseId) || null,
    types: [...new Set(team.flatMap(mon => [mon.type, mon.type2]).filter(type => typeof type === 'string'))].slice(0, 18),
    teamSize: Math.max(1, Math.min(6, team.length)) }
}

export function resolveBattleBackgroundId(environment = {}, map = {}, events = []) {
  // This immutable ID is saved at encounter start. Switching the active enemy
  // or restoring the battle never rerolls a scene.
  if (BATTLE_BACKGROUNDS[environment.backgroundId]) return environment.backgroundId
  const mapName = environment.mapName || 'GodotMap'
  if (mapName === 'GodotMapV2_ChampionTower') return Number(environment.championTowerFloor) >= 10 ? 'champion-summit' : 'champion-hall'
  if (mapName === 'GodotMapV2_SurvivalRidge' && environment.timberLeague?.routeKey) return 'ridge-training'
  const zones = BATTLE_BACKGROUND_ZONES[mapName] || {}
  const isWild = environment.battleKind !== 'trainer'
  const position = isWild ? point(environment.triggerPosition) : point(environment.eventPosition) || point(environment.triggerPosition)
  const eventAsset = EVENT_BACKGROUNDS[environment.eventId]
  if (eventAsset && BATTLE_BACKGROUNDS[eventAsset].mapName === mapName) {
    const actualEvent = events.find(event => event.id === environment.eventId)
    const eventPoint = point(actualEvent?.position)
    if (!position || !eventPoint || Math.hypot(position.x - eventPoint.x, position.y - eventPoint.y) <= 2) return eventAsset
  }
  const candidates = (map.encounterZones || []).filter(zone => zones[zone.id] && [zone.x, zone.y, zone.width, zone.height].every(Number.isFinite))
  const explicit = candidates.find(zone => zone.id === environment.zoneId)
  let selected = explicit && (!position || distanceToZone(position, explicit) < .01) ? explicit : null
  if (!selected && position) {
    // Prefer the smaller specific zone when map areas overlap (e.g. valley
    // southeast meadow and south reeds). Never snap across the entire map.
    const inside = candidates.filter(zone => position.x >= zone.x && position.x < zone.x + zone.width && position.y >= zone.y && position.y < zone.y + zone.height)
    selected = inside.sort((a, b) => a.width * a.height - b.width * b.height)[0]
    if (!selected) selected = candidates.filter(zone => distanceToZone(position, zone) <= 1.5).sort((a, b) => distanceToZone(position, a) - distanceToZone(position, b))[0]
  }
  let id = selected ? zones[selected.id] : BATTLE_BACKGROUND_MAP_DEFAULTS[mapName] || 'valley-meadow'
  // An aquatic opponent can bring the shallow bank into the composition only
  // if this encounter is actually within 2 tiles of that map's water edge.
  const opponent = environment.opponentSnapshot || environment.opponent
  if (id === 'mist-reeds' && isWild && position && opponent?.types?.includes('water')) {
    const byWater = (map.waterBodies || []).some(water => {
      const angle = -(Number(water.rotation) || 0), dx = position.x - water.x, dy = position.y - water.y
      const x = dx * Math.cos(angle) - dy * Math.sin(angle), y = dx * Math.sin(angle) + dy * Math.cos(angle)
      return (x / (water.rx + 2)) ** 2 + (y / (water.ry + 2)) ** 2 <= 1
    })
    if (byWater) id = 'mist-shallows'
  }
  return id
}
