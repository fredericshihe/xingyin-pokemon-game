import * as THREE from 'three'
import { MAP_ASSET_CATALOG } from '../src/game/data/mapAssetCatalog.js'
import {
  applyMapAssetMaterialStyle,
  readOptionalFiniteNumber
} from '../src/game/mapMaterialStyle.js'

const failures = []

for (const value of [null, undefined, '', Number.NaN, Infinity, 'not-a-number']) {
  if (readOptionalFiniteNumber(value) !== null) {
    failures.push(`Optional material value ${String(value)} must not coerce to a style number.`)
  }
}

const unchangedMaterial = new THREE.MeshStandardMaterial({
  color: 0xabcdef,
  emissive: 0x123456,
  emissiveIntensity: 0.37,
  metalness: 0.31,
  roughness: 0.67
})
applyMapAssetMaterialStyle(unchangedMaterial, MAP_ASSET_CATALOG.town_fountain_round)
if (
  unchangedMaterial.color.getHex() !== 0xabcdef ||
  unchangedMaterial.emissive.getHex() !== 0x123456 ||
  unchangedMaterial.emissiveIntensity !== 0.37 ||
  unchangedMaterial.metalness !== 0.31 ||
  unchangedMaterial.roughness !== 0.67
) {
  failures.push('Assets without explicit material styles must retain their loaded GLB material values.')
}

const styledMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0x000000,
  metalness: 0.05,
  roughness: 0.82
})
const frostStyle = MAP_ASSET_CATALOG.elite_frost_crystal
applyMapAssetMaterialStyle(styledMaterial, frostStyle)
if (styledMaterial.color.getHex() !== frostStyle.materialTint) {
  failures.push('Explicit material tint was not applied to the Elite Four landmark material.')
}
if (styledMaterial.emissive.getHex() !== frostStyle.emissiveTint) {
  failures.push('Explicit emissive tint was not applied to the Elite Four landmark material.')
}

if (failures.length > 0) {
  console.error('[audit-map-material-styles] FAILED')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('[audit-map-material-styles] OK: optional styles preserve source materials and explicit styles apply deterministically.')
