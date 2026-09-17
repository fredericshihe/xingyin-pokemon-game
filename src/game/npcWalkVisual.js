import * as THREE from 'three'

export function hasNpcWalkRig(geometry) {
  return Boolean(geometry?.getAttribute('_npc_pivot') && geometry?.getAttribute('_npc_swing'))
}

export function createNpcWalkGeometry(geometry, capacity) {
  // Templates are shared across chunks; stride buffers must belong to one batch.
  const animated = geometry.clone()
  animated.setAttribute('npcWalkStride', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
    .setUsage(THREE.DynamicDrawUsage))
  return animated
}

export function configureNpcWalkMaterial(material) {
  if (!material || material.userData.npcWalkEnabled) return
  material.userData.npcWalkEnabled = true
  const previousCompile = material.onBeforeCompile
  const previousCacheKey = material.customProgramCacheKey.bind(material)
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile?.call(this, shader, renderer)
    shader.vertexShader = `
#ifdef USE_INSTANCING
attribute vec3 _npc_pivot;
attribute float _npc_swing;
attribute float npcWalkStride;
vec3 npcWalkRotate(vec3 value) {
  // Draco's generic quantization can turn authored zero into a tiny value.
  float swing = abs(_npc_swing) < 0.001 ? 0.0 : _npc_swing;
  float angle = swing * npcWalkStride;
  float c = cos(angle);
  float s = sin(angle);
  return vec3(value.x, c * value.y - s * value.z, s * value.y + c * value.z);
}
#endif
${shader.vertexShader}`
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
#include <beginnormal_vertex>
#ifdef USE_INSTANCING
objectNormal = npcWalkRotate(objectNormal);
#ifdef USE_TANGENT
objectTangent = npcWalkRotate(objectTangent);
#endif
#endif`)
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
#include <begin_vertex>
#ifdef USE_INSTANCING
transformed = _npc_pivot + npcWalkRotate(transformed - _npc_pivot);
#endif`)
  }
  material.customProgramCacheKey = () => `${previousCacheKey()}:npc-walk-v1`
  material.needsUpdate = true
}

export function setNpcWalkStride(mesh, index, stride) {
  const attribute = mesh.geometry.getAttribute('npcWalkStride')
  if (!attribute || attribute.getX(index) === Math.fround(stride)) return
  attribute.setX(index, stride)
  attribute.addUpdateRange(index, 1)
  attribute.needsUpdate = true
}

export function getNpcWalkStride(walk, { standing = false } = {}) {
  return walk?.moving && !standing ? Math.sin(walk.stepProgress * Math.PI * 2) : 0
}

export function attachNpcWalkShadows(mesh) {
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial()
  configureNpcWalkMaterial(mesh.customDepthMaterial)
  configureNpcWalkMaterial(mesh.customDistanceMaterial)
}
