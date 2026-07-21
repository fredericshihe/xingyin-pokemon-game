import * as THREE from 'three'

export function readOptionalFiniteNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function applyMapAssetMaterialStyle(material, style) {
  if (!material || !style) return material
  const materials = Array.isArray(material) ? material : [material]
  const materialTint = readOptionalFiniteNumber(style.materialTint)
  const emissiveTint = readOptionalFiniteNumber(style.emissiveTint)
  const materialMetalness = readOptionalFiniteNumber(style.materialMetalness)
  const materialRoughness = readOptionalFiniteNumber(style.materialRoughness)

  materials.forEach((entry) => {
    if (!entry) return
    if (materialTint != null && entry.color) {
      entry.color.multiply(new THREE.Color(materialTint))
    }
    if (emissiveTint != null && entry.emissive) {
      entry.emissive.setHex(emissiveTint)
      entry.emissiveIntensity = Math.max(0, Number(style.emissiveIntensity) || 0)
    }
    if (materialMetalness != null && typeof entry.metalness === 'number') {
      entry.metalness = materialMetalness
    }
    if (materialRoughness != null && typeof entry.roughness === 'number') {
      entry.roughness = materialRoughness
    }
  })

  return material
}
