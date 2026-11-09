import * as THREE from 'three'
import { getCharacterGaitBodyOffset, solveCharacterLegGait } from './characterGait.js'

export const NPC_GAIT_HALF_STRIDE = .16
export const NPC_GAIT_CYCLE_DISTANCE = NPC_GAIT_HALF_STRIDE * 4

export function hasNpcWalkRig(geometry) {
  return Boolean(geometry?.getAttribute('_npc_pivot') && (geometry?.getAttribute('_npc_swing') || geometry?.getAttribute('npcRigWeights')))
}

export function createNpcWalkGeometry(geometry, capacity) {
  // Templates are shared across chunks; stride buffers must belong to one batch.
  const animated = geometry.clone()
  animated.setAttribute('npcWalkStride', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2)
    .setUsage(THREE.DynamicDrawUsage))
  animated.setAttribute('npcLegAngles', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage))
  const swing = geometry.getAttribute('_npc_swing'), pivot = geometry.getAttribute('_npc_pivot')
  const knee = geometry.getAttribute('_npc_joint'), ankle = geometry.getAttribute('_npc_ankle')
  if (swing && pivot && knee && ankle) {
    for (let i = 0; i < swing.count; i++) {
      if (Math.abs(Math.abs(swing.getX(i)) - .4) > .001) continue
      animated.userData.gait = { hipY: pivot.getY(i), ankleY: ankle.getY(i),
        standingHeight: pivot.getY(i) - ankle.getY(i), upperLength: pivot.getY(i) - knee.getY(i),
        lowerLength: Math.hypot(knee.getY(i) - ankle.getY(i), ankle.getZ(i) - knee.getZ(i)),
        lowerBindAngle: Math.atan2(ankle.getZ(i) - knee.getZ(i), knee.getY(i) - ankle.getY(i)) }
      break
    }
  }
  // Pack the scalar weights into one vertex slot; instancing already uses four.
  // Keeping them separate exceeds the 16-attribute limit on mobile GPUs.
  const bend = geometry.getAttribute('_npc_bend'), foot = geometry.getAttribute('_npc_foot')
  if (swing) {
    const weights = new Float32Array(swing.count * 3)
    for (let i = 0; i < swing.count; i++) weights.set([swing.getX(i), bend?.getX(i) || 0, foot?.getX(i) || 0], i * 3)
    animated.setAttribute('npcRigWeights', new THREE.BufferAttribute(weights, 3))
    animated.deleteAttribute('_npc_swing'); animated.deleteAttribute('_npc_bend'); animated.deleteAttribute('_npc_foot')
    animated.userData.groundedGait = Boolean(ankle && foot)
  }
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
attribute vec3 npcRigWeights;
#define _npc_swing npcRigWeights.x
#define _npc_bend npcRigWeights.y
#define _npc_foot npcRigWeights.z
attribute vec2 npcWalkStride;
#ifdef NPC_JOINTS_V2
attribute vec3 _npc_joint;
#endif
#ifdef NPC_GROUNDED_V2
attribute vec4 npcLegAngles;
attribute vec3 _npc_ankle;
vec3 npcRotateX(vec3 value, float angle) {
  float c = cos(angle), s = sin(angle);
  return vec3(value.x, c * value.y - s * value.z, s * value.y + c * value.z);
}
vec3 npcGroundedNormal(vec3 value) {
  if (abs(abs(_npc_swing) - 0.4) < 0.001) {
    vec2 angles = _npc_swing > 0.0 ? npcLegAngles.xy : npcLegAngles.zw;
    value = npcRotateX(value, -(angles.x + angles.y) * _npc_foot);
    value = npcRotateX(value, angles.y * max(_npc_bend, 0.0));
    return npcRotateX(value, angles.x);
  }
  value = npcRotateX(value, min(_npc_bend, 0.0) * abs(npcWalkStride.x) * 0.18);
  return npcRotateX(value, (abs(_npc_swing) < 0.001 ? 0.0 : _npc_swing) * npcWalkStride.x);
}
vec3 npcGroundedPosition(vec3 value) {
  if (abs(abs(_npc_swing) - 0.4) < 0.001) {
    vec2 angles = _npc_swing > 0.0 ? npcLegAngles.xy : npcLegAngles.zw;
    value = _npc_ankle + npcRotateX(value - _npc_ankle, -(angles.x + angles.y) * _npc_foot);
    value = _npc_joint + npcRotateX(value - _npc_joint, angles.y * max(_npc_bend, 0.0));
    value = _npc_pivot + npcRotateX(value - _npc_pivot, angles.x);
  } else {
    value = _npc_joint + npcRotateX(value - _npc_joint, min(_npc_bend, 0.0) * abs(npcWalkStride.x) * 0.18);
    value = _npc_pivot + npcRotateX(value - _npc_pivot, (abs(_npc_swing) < 0.001 ? 0.0 : _npc_swing) * npcWalkStride.x);
  }
  value.y += npcWalkStride.y;
  return value;
}
#endif
#ifdef NPC_JOINTS_V2
vec3 npcJointRotate(vec3 value) {
  float angle = _npc_bend < 0.0 ? _npc_bend * abs(npcWalkStride.x) * 0.22
    : _npc_bend * max(-npcWalkStride.x * sign(_npc_swing), 0.0) * 0.52;
  float c = cos(angle), s = sin(angle);
  return vec3(value.x, c * value.y - s * value.z, s * value.y + c * value.z);
}
#endif
vec3 npcWalkRotate(vec3 value) {
  // Draco's generic quantization can turn authored zero into a tiny value.
  float swing = abs(_npc_swing) < 0.001 ? 0.0 : _npc_swing;
  float angle = swing * npcWalkStride.x;
  float c = cos(angle);
  float s = sin(angle);
  return vec3(value.x, c * value.y - s * value.z, s * value.y + c * value.z);
}
#endif
${shader.vertexShader}`
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
#include <beginnormal_vertex>
#ifdef USE_INSTANCING
#ifdef NPC_GROUNDED_V2
objectNormal = npcGroundedNormal(objectNormal);
#else
#ifdef NPC_JOINTS_V2
objectNormal = npcJointRotate(objectNormal);
#endif
objectNormal = npcWalkRotate(objectNormal);
#endif
#ifdef USE_TANGENT
objectTangent = npcWalkRotate(objectTangent);
#endif
#endif`)
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
#include <begin_vertex>
#ifdef USE_INSTANCING
#ifdef NPC_GROUNDED_V2
transformed = npcGroundedPosition(transformed);
#else
#ifdef NPC_JOINTS_V2
transformed = _npc_joint + npcJointRotate(transformed - _npc_joint);
#endif
transformed = _npc_pivot + npcWalkRotate(transformed - _npc_pivot);
#endif
#endif`)
  }
  material.customProgramCacheKey = () => `${previousCacheKey()}:npc-walk-grounded-v2`
  material.needsUpdate = true
}

export function configureNpcJointDefines(material, geometry) {
  if (!geometry?.getAttribute('_npc_joint') || !(geometry?.getAttribute('_npc_bend') || geometry?.getAttribute('npcRigWeights'))) return
  material.defines = { ...material.defines, NPC_JOINTS_V2: 1 }
  if (geometry.getAttribute('_npc_ankle') && geometry.userData.groundedGait) material.defines.NPC_GROUNDED_V2 = 1
  material.needsUpdate = true
}

export function setNpcWalkStride(mesh, index, stride) {
  const attribute = mesh.geometry.getAttribute('npcWalkStride')
  if (!attribute || attribute.getX(index) === Math.fround(stride)) return
  attribute.setX(index, stride)
  attribute.addUpdateRange(index * 2, 1)
  attribute.needsUpdate = true
}

export function setNpcWalkGait(mesh, index, { phase = 0, blend = 0, scale = 1 } = {}) {
  const rig = mesh.geometry.userData.gait
  setNpcWalkStride(mesh, index, Math.sin(phase) * blend)
  if (!rig) return
  const halfStride = Math.min(NPC_GAIT_HALF_STRIDE / Math.max(.1, scale), (rig.upperLength + rig.lowerLength) * .48)
  const bodyOffset = getCharacterGaitBodyOffset({ phase, blend, legLength: rig.upperLength + rig.lowerLength, standingHeight: rig.standingHeight, halfStride })
  const angles = mesh.geometry.getAttribute('npcLegAngles'), hipOffset = mesh.geometry.getAttribute('npcWalkStride')
  for (const [offset, channel] of [[0, 0], [Math.PI, 2]]) {
    const solved = blend < .0001 ? { upperAngle: 0, lowerAngle: 0 } : solveCharacterLegGait({ ...rig,
      phase: phase + offset, blend, hipY: rig.hipY + bodyOffset, halfStride, swingHeight: .045 / Math.max(.1, scale) })
    angles.setComponent(index, channel, solved.upperAngle)
    angles.setComponent(index, channel + 1, solved.lowerAngle)
  }
  angles.addUpdateRange(index * 4, 4); angles.needsUpdate = true
  hipOffset.setY(index, blend < .0001 ? 0 : bodyOffset)
  hipOffset.addUpdateRange(index * 2 + 1, 1); hipOffset.needsUpdate = true
}

export function getNpcWalkStride(walk, { standing = false } = {}) {
  return walk?.moving && !standing ? Math.sin(walk.stepProgress * Math.PI * 2) : 0
}

export function attachNpcWalkShadows(mesh) {
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial()
  configureNpcWalkMaterial(mesh.customDepthMaterial)
  configureNpcWalkMaterial(mesh.customDistanceMaterial)
  configureNpcJointDefines(mesh.customDepthMaterial, mesh.geometry)
  configureNpcJointDefines(mesh.customDistanceMaterial, mesh.geometry)
}
