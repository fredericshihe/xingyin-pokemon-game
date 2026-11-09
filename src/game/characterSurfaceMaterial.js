export const CHARACTER_SURFACE_CLOCK = { value: 0 }

/** Physical surface regions stay in one shared material, preserving NPC batching. */
export function configureCharacterSurfaceMaterial(material, geometry) {
  if (!geometry?.getAttribute('_char_surface')) return
  const list = Array.isArray(material) ? material : [material]
  for (const entry of list) {
    if (!entry?.isMeshStandardMaterial || entry.userData.characterSurfaceEnabled) continue
    entry.userData.characterSurfaceEnabled = true
    const before = entry.onBeforeCompile
    const previousKey = entry.customProgramCacheKey.bind(entry)
    entry.onBeforeCompile = function (shader, renderer) {
      before?.call(this, shader, renderer)
      shader.uniforms.characterSurfaceTime = CHARACTER_SURFACE_CLOCK
      shader.vertexShader = `attribute vec3 _char_surface;\nuniform float characterSurfaceTime;\nvarying vec2 vCharacterSurface;\n${shader.vertexShader}`
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
vCharacterSurface = _char_surface.xy;
#ifdef USE_INSTANCING
float breathingSeed = instanceMatrix[3].x * 0.73 + instanceMatrix[3].z * 1.17;
transformed.y += sin(characterSurfaceTime * 1.65 + breathingSeed) * 0.003 * smoothstep(0.15, 0.8, transformed.y);
#endif`)
      shader.fragmentShader = `varying vec2 vCharacterSurface;\n${shader.fragmentShader}`
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(vCharacterSurface.x, 0.15, 1.0);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = clamp(vCharacterSurface.y, 0.0, 0.85);')
    }
    entry.customProgramCacheKey = () => `${previousKey()}:character-surface-v2`
    entry.needsUpdate = true
  }
}
