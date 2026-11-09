import * as THREE from 'three'

// 地图镜头：immersive = 低角度第三人称跟随（默认），classic = 旧版高俯视。
// 水平朝向只由玩家手动控制，切图和场景重建沿用离开时的视角。
let retainedCameraYaw = 0
export const readMapCameraYaw = () => retainedCameraYaw
export function rememberMapCameraYaw(yaw) {
  if (Number.isFinite(yaw)) retainedCameraYaw = yaw
}
export const MAP_CAMERA_PROFILES = {
  immersive: { pitchDeg: 21, distance: 9.6, fov: 54, lookY: 1.2, lead: 1.2, damping: 7.5 },
  // 旧版参数：高度 14.5 / 前移 12.5 / lookY 0.45 → 约 48.3° / 18.8
  classic: { pitchDeg: 48.341, distance: 18.806, fov: 42, lookY: 0.45, lead: 0, damping: 0 }
}

// 超过雾远端这么远的 chunk 直接不画（雾参数按地图主题，见 mapHorizonScenery）
export const CHUNK_CULL_BEYOND_FOG = 10

export function readMapCameraModePref() {
  if (typeof window === 'undefined') return 'immersive'
  const query = new URLSearchParams(window.location.search).get('camera')
  if (query === 'classic' || query === 'immersive') return query
  try {
    const stored = window.localStorage.getItem('mapCameraMode')
    if (stored === 'classic' || stored === 'immersive') return stored
  } catch {
    // localStorage 不可用时走默认
  }
  return 'immersive'
}

export function resolveMapCameraProfile(mode) {
  // Crossing a smaller map must not change pitch, zoom or viewing distance.
  return mode === 'classic' ? MAP_CAMERA_PROFILES.classic : MAP_CAMERA_PROFILES.immersive
}

// 竖屏时横向视野太窄，适当加宽 FOV
export function resolveCameraFov(profile, aspect) {
  if (!Number.isFinite(aspect) || aspect >= 1.2) return profile.fov
  return Math.min(profile.fov + (1.2 - aspect) * 16, profile.fov + 12)
}

// 相对注视点的镜头偏移
export function getCameraOffset(profile, out = new THREE.Vector3()) {
  const pitch = THREE.MathUtils.degToRad(profile.pitchDeg)
  return out.set(0, profile.lookY + Math.sin(pitch) * profile.distance, Math.cos(pitch) * profile.distance)
}

// === 遮挡淡出 ===
// 位于"镜头 → 玩家"连线附近的装饰物片元按 Bayer 抖动丢弃，保留轮廓。
export const occluderUniforms = {
  uOccluderPlayer: { value: new THREE.Vector3() },
  uOccluderCamera: { value: new THREE.Vector3() },
  uOccluderRadius: { value: 0 }
}

export function ensureOccluderFadeMaterial(material) {
  if (!material) return
  if (Array.isArray(material)) {
    material.forEach(ensureOccluderFadeMaterial)
    return
  }
  if (material.userData?.occluderFadeEnabled) return
  material.userData.occluderFadeEnabled = true
  const previousOnBeforeCompile = material.onBeforeCompile
  const previousCacheKey = material.customProgramCacheKey?.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile?.(shader, renderer)
    Object.assign(shader.uniforms, occluderUniforms)
    shader.vertexShader = `
varying vec3 vOccluderWorld;
${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
vec4 occluderWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
occluderWorld = instanceMatrix * occluderWorld;
#endif
vOccluderWorld = ( modelMatrix * occluderWorld ).xyz;
`
    )
    shader.fragmentShader = `
varying vec3 vOccluderWorld;
uniform vec3 uOccluderPlayer;
uniform vec3 uOccluderCamera;
uniform float uOccluderRadius;
${shader.fragmentShader}`.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
// 只淡出比人物腰部高的部分：脚下的桥面、台阶、矮石不该变成网格
if ( uOccluderRadius > 0.0 && vOccluderWorld.y > 1.1 ) {
  vec3 seg = uOccluderCamera - uOccluderPlayer;
  float segLenSq = max( dot( seg, seg ), 1e-4 );
  float t = dot( vOccluderWorld - uOccluderPlayer, seg ) / segLenSq;
  // t 从玩家（0）到镜头（1）；只处理玩家与镜头之间、离玩家至少一段距离的遮挡
  if ( t > 0.12 && t < 1.0 ) {
    float dist = length( vOccluderWorld - ( uOccluderPlayer + seg * t ) );
    float fade = 1.0 - smoothstep( uOccluderRadius * 0.35, uOccluderRadius, dist );
    fade *= smoothstep( 0.12, 0.28, t );
    ivec2 p = ivec2( mod( gl_FragCoord.xy, 4.0 ) );
    int idx = p.x + p.y * 4;
    float bayer = float( idx == 0 ? 0 : idx == 1 ? 8 : idx == 2 ? 2 : idx == 3 ? 10 :
      idx == 4 ? 12 : idx == 5 ? 4 : idx == 6 ? 14 : idx == 7 ? 6 :
      idx == 8 ? 3 : idx == 9 ? 11 : idx == 10 ? 1 : idx == 11 ? 9 :
      idx == 12 ? 15 : idx == 13 ? 7 : idx == 14 ? 13 : 5 ) / 16.0;
    // 紧贴玩家的遮挡掏空到约 85%（能看清人物），靠近镜头的只掏空约 45%（保留轮廓）
    float strength = mix( 0.85, 0.45, smoothstep( 0.15, 0.6, t ) );
    if ( bayer < fade * strength ) discard;
  }
}
`
    )
  }
  // onBeforeCompile 默认按函数源码做缓存键，叠加补丁时必须显式区分
  material.customProgramCacheKey = () => `${previousCacheKey ? previousCacheKey() : ''}|occluderFade`
  material.needsUpdate = true
}
