import * as THREE from 'three'

const GROUND_ACCENTS = {
  GodotMap: 0x697a49, GodotMapV2: 0x97a850,
  GodotMapV2_MistLake: 0x527e79, GodotMapV2_FarmTown: 0xb2a078,
  GodotMapV2_PirateShore: 0xd2b07c, GodotMapV2_Graveyard: 0x6c748b,
  GodotMapV2_HexRuins: 0x7a9183, GodotMapV2_SurvivalRidge: 0x637d6f,
  GodotMapV2_BossHighland: 0x777caa, GodotMapV2_FrostDojo: 0xb9d6e6,
  GodotMapV2_TideDojo: 0x75b7b2, GodotMapV2_IronDojo: 0xa59270,
  GodotMapV2_DragonDojo: 0x84709f, GodotMapV2_ChampionTower: 0x988874
}

// One static vertex-colored surface joins each set of scenery visually. Color
// fades into the original ground; route, grass and water cells are never painted.
export function createEnvironmentGroundPatches(map, cell = 1.55) {
  if (!map.environmentGroundPatches?.length) return null
  const accent = new THREE.Color(GROUND_ACCENTS[map.id] ?? 0x82966d)
  const positions = [], colors = []
  const strength = (x, y) => Math.max(0, ...map.environmentGroundPatches.map(patch => {
    const distance = Math.hypot((x - patch.x) / patch.rx, (y - patch.y) / patch.ry)
    return Math.max(0, 1 - distance) ** .65
  }))
  for (let y = -4; y < map.height + 4; y++) {
    for (let x = -4; x < map.width + 4; x++) {
      const inside = x >= 0 && y >= 0 && x < map.width && y < map.height
      if (inside && ![1, 20].includes(map.mapGrid[y][x])) continue
      if (strength(x, y) < .015) continue
      for (const [dx, dy] of [[-.5, -.5], [-.5, .5], [.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]]) {
        const px = x + dx, py = y + dy
        positions.push((px - map.width / 2 + .5) * cell, .026, (py - map.height / 2 + .5) * cell)
        colors.push(accent.r, accent.g, accent.b, strength(px, py) * .32)
      }
    }
  }
  if (!positions.length) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .95, transparent: true, depthWrite: false
  }))
  mesh.name = 'Authored scenery ground'
  mesh.receiveShadow = true
  return mesh
}
