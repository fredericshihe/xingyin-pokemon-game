import assert from 'node:assert/strict'
import { withViteAuditServer } from './load-vite-module.mjs'
await withViteAuditServer(async({loadModule}) => {
  const { MAP_CATALOG } = await loadModule('/src/game/data/mapCatalog.js')
  const { BLOCKED_LEGACY_TILES } = await loadModule('/src/game/world/constants.js')
  const { findEnvironmentSpawn } = await loadModule('/src/game/environmentNavigation.js')
  const { getEnvironmentObjectBounds, isSafeEnvironmentBackground, isProtectedEnvironmentObject } = await loadModule('/src/game/data/mapEnvironmentComposition.js')
  const { composeMapEnvironment } = await loadModule('/src/game/data/mapEnvironmentComposition.js')
  const { GODOT_REGION_MAPS } = await loadModule('/src/game/data/godotMaps/godot_region_maps.js')
  const { default: starter } = await loadModule('/src/game/data/godotMaps/my_first_map.js')
  const { getEnvironmentObjectKey } = await loadModule('/src/game/data/mapEnvironmentObjectKey.js')
  const { getTreeModelScale } = await loadModule('/src/game/modelScaleReference.js')
  const { collectVisualSolidFootprints, distanceToFootprint, CHARACTER_BODY_RADIUS_TILES } = await loadModule('/src/game/mapVisualCollision.js')
  let blocks=0, resized=0
  for (const [id,{mapInfo:map}] of Object.entries(MAP_CATALOG)) {
    const blocked=map.environmentBlockedTiles
    assert.ok(blocked instanceof Set,`${id}: missing scenery collision mask`)
    const walkable=(x,y,mask)=>map.mapGrid[y]?.[x]!=null && !BLOCKED_LEGACY_TILES.has(map.mapGrid[y][x]) && !mask.has(`${x},${y}`)
    const invalidPositions = [{ x: -1, y: -1 }, { x: map.width + 2, y: map.height + 2 },
      ...(id === 'GodotMapV2_MistLake' ? [{ x: 20, y: 2 }] : [])]
    for (const value of [1, 11, 20]) {
      const y = map.mapGrid.findIndex(row => row.includes(value))
      if (y >= 0) invalidPositions.push({ x: map.mapGrid[y].indexOf(value), y })
    }
    for (const position of invalidPositions) {
      const safe = findEnvironmentSpawn(map, { ...position, direction: 'left' })
      assert.ok(walkable(safe.x, safe.y, blocked), `${id}: invalid native tile/save must recover safely`)
      assert.equal(safe.direction, 'left')
      assert.ok(!map.runtimeEvents.some(event => event.position.x === safe.x && event.position.y === safe.y), `${id}: recovery landed on an interaction`)
    }
    for (const entry of Object.values(MAP_CATALOG)) for (const warp of entry.mapInfo.runtimeEvents) {
      if (warp.type === 'warp' && warp.target?.mapName === id) {
        assert.equal(findEnvironmentSpawn(map, warp.target.position), warp.target.position, `${id}: moved a valid paired arrival`)
      }
    }
    const raw={...(id==='GodotMap'?starter:GODOT_REGION_MAPS[id]),id}
    const before=composeMapEnvironment(raw).decorativeObjects
    const after=composeMapEnvironment({...raw,decorativeObjects:[...raw.decorativeObjects].reverse()}).decorativeObjects
    const overrides=objects=>Object.fromEntries(objects.map(o=>[getEnvironmentObjectKey(o),[o.environmentRenderScale??null,o.environmentHiddenBoundary??false]]))
    assert.deepEqual(overrides(after),overrides(before),`${id}: changing decoration order misapplies render overrides`)
    const flood=(start,mask)=>{
      const stack=[start],seen=new Set()
      while(stack.length){const [x,y]=stack.pop(),key=`${x},${y}`;if(seen.has(key)||!walkable(x,y,mask))continue;seen.add(key);stack.push([x-1,y],[x+1,y],[x,y-1],[x,y+1])}
      return seen
    }
    const checked=new Set()
    for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
      const key=`${x},${y}`
      if(checked.has(key)||!walkable(x,y,new Set()))continue
      const original=flood([x,y],new Set());original.forEach(k=>checked.add(k))
      const survivors=[...original].filter(k=>!blocked.has(k))
      assert.ok(survivors.length,`${id}: erased walkable area`)
      assert.equal(flood(survivors[0].split(',').map(Number),blocked).size,survivors.length,`${id}: scenery partitions accessible ground`)
    }
    const footprints=map.decorativeObjects.filter(o=>o.environmentComposition||o.environmentBoundary||o.environmentRenderScale).map(o=>getEnvironmentObjectBounds(o))
    const visualFootprints=collectVisualSolidFootprints(map)
    for(const key of blocked){
      const [x,y]=key.split(',').map(Number)
      assert.ok([0,13,17].includes(map.mapGrid[y][x]),`${id}: collision changes road/grass/interaction`)
      assert.ok(footprints.some(b=>x>=b.x1-.25&&x<=b.x2+.25&&y>=b.y1-.25&&y<=b.y2+.25) ||
        visualFootprints.some(f=>distanceToFootprint(f,x,y)<=CHARACTER_BODY_RADIUS_TILES),`${id}: invisible collision`)
      const safe=findEnvironmentSpawn(map,{x,y,direction:'left'})
      assert.ok(walkable(safe.x,safe.y,blocked),`${id}: saved player is trapped`)
      assert.equal(safe.direction,'left')
    }
    for(const event of map.runtimeEvents)for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
      assert.ok(!blocked.has(`${event.position.x+dx},${event.position.y+dy}`),`${id}: scenery blocks event approach ${event.id}`)
    }
    for(const object of map.decorativeObjects.filter(o=>o.environmentRenderScale)){
      const calibratedGateTree = getTreeModelScale(object.type) != null && object.environmentScaleNormalized
      assert.ok(!isProtectedEnvironmentObject(object) || calibratedGateTree,`${id}: resized an interaction`)
      // 尺寸统一（mapModelScaleNormalization）允许缩小，由 map:audit-model-scales 检查一致性；
      // 这里只要求：没经过统一的放大仍然只放大，且作者占地 scale 从不被放大。
      if(!object.environmentScaleNormalized){
        assert.ok(object.environmentRenderScale > (object.scale || 1),`${id}: shrinking existing scenery`)
        assert.ok(isSafeEnvironmentBackground(map,object,.1),`${id}: enlarged tree/rock obstructs gameplay`)
      }
      resized++
    }
    const note=map.generationNotes.environmentComposition
    assert.ok(note.interior/note.added >= .55,`${id}: decorations still concentrate at the rim`)
    blocks+=blocked.size
  }
  console.log(`PASS: all original walkable areas remain connected, event approaches clear; ${blocks} visible scenery collision tiles and saved-position recovery checked; ${resized} tree/rock sizes safely enlarged; every map has a majority of new props inside the map.`)
})
