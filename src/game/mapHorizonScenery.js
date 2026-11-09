import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createWaterMaterial } from './mapShaders'
import { distanceToExitCorridor } from './mapExitRunways'

// 每张地图的天空 / 雾 / 光照 / 远景。
// 远景不吃场景雾（否则全是一片白），改用分层"空气透视"：
// haze 越大越接近地平线色，贴地部分再额外淡出，和雾里的外围地面接上。

const DEG = Math.PI / 180

const DEFAULT_CLOUDS = { type: 'clouds', color: 0xffffff, count: 12, ring: [8, 60], size: [5, 9], y: [15, 24], haze: 0.08 }

export const MAP_HORIZON_THEMES = {
  // 新手山谷：晴朗清晨，近处绿丘，远处蓝色山脉
  GodotMap: {
    sky: { top: 0x4fa8f0, horizon: 0xd6f0ff, bottom: 0xe9f6ff },
    fog: { color: 0xcfe9f5, near: 34, far: 92 },
    sun: { azimuth: 25, elevation: 4, color: 0xfff1c2, size: 2.2, glow: 0.35 },
    layers: [
      { type: 'hills', color: 0x6fcb5c, count: 34, ring: [3, 20], radius: [7, 13], height: [3, 6], haze: 0.1 },
      { type: 'peaks', color: 0x7fa3c6, count: 22, ring: [34, 54], radius: [14, 22], height: [14, 24], haze: 0.34 },
      DEFAULT_CLOUDS
    ]
  },
  // 星音草径：暖色午后草原，地平线上一排圆冠树，远处淡紫色山
  GodotMapV2: {
    sky: { top: 0x5aa8ea, horizon: 0xf2e9d0, bottom: 0xf6efdc },
    fog: { color: 0xe6ecd4, near: 34, far: 92 },
    sun: { azimuth: -30, elevation: 3, color: 0xffe2a8, size: 2.4, glow: 0.45 },
    light: { sun: 0xfff0d2 },
    layers: [
      { type: 'roundTrees', color: 0x4f9d4a, trunk: 0x7a5a3a, count: 46, ring: [2, 14], size: [3.6, 5], haze: 0.06 },
      { type: 'hills', color: 0x7cc46a, count: 30, ring: [14, 30], radius: [8, 14], height: [3, 6], haze: 0.16 },
      { type: 'peaks', color: 0x9ba6cf, count: 20, ring: [40, 60], radius: [14, 22], height: [12, 20], haze: 0.42 },
      DEFAULT_CLOUDS
    ]
  },
  // 雾湖苇岸：保留雾感但带青绿色调，湖面一直铺到天边，层叠的淡青山影
  GodotMapV2_MistLake: {
    sky: { top: 0x8fb9c9, horizon: 0xd8ebe5, bottom: 0xe2efeb },
    fog: { color: 0xd0e4df, near: 26, far: 78 },
    sun: { azimuth: 40, elevation: 6, color: 0xf6fbff, size: 3, glow: 0.55 },
    light: { sun: 0xf2f7ff, sunIntensity: 2.0, hemiIntensity: 1.65 },
    outer: 'water',
    water: 0x5fa9a4,
    layers: [
      { type: 'reeds', color: 0x6f8f5a, count: 140, ring: [1, 8], height: [1.2, 2.4], haze: 0.05 },
      { type: 'roundTrees', color: 0x3f7a6a, trunk: 0x4a3a2c, count: 14, ring: [10, 20], size: [3.6, 5.4], haze: 0.25 },
      { type: 'peaks', color: 0x86ada8, count: 18, ring: [26, 40], radius: [10, 16], height: [8, 13], haze: 0.4 },
      { type: 'peaks', color: 0x9dbdb8, count: 16, ring: [44, 62], radius: [14, 22], height: [12, 18], haze: 0.58 }
    ]
  },
  // 风车农庄：金色麦田丘陵，缓慢转动的风车
  GodotMapV2_FarmTown: {
    sky: { top: 0x4aa3f0, horizon: 0xfbe8c0, bottom: 0xfbefd6 },
    fog: { color: 0xf0e4c4, near: 36, far: 96 },
    sun: { azimuth: 10, elevation: 4, color: 0xfff0c0, size: 2.4, glow: 0.4 },
    light: { sun: 0xfff2d6 },
    layers: [
      { type: 'hills', colors: [0xd8c050, 0x9ccd4a, 0xc9a94a, 0xb5c94a], count: 40, ring: [8, 26], radius: [6, 11], height: [1.8, 3.6], haze: 0.06 },
      { type: 'windmills', tower: 0xf3eee3, blades: 0x8a5a3a, count: 7, ring: [6, 20], height: [5.5, 7.5], haze: 0.08 },
      { type: 'hills', color: 0x8fb85a, count: 26, ring: [28, 44], radius: [12, 18], height: [4, 7], haze: 0.3 },
      DEFAULT_CLOUDS
    ]
  },
  // 贝壳海岸：四面海平线，红岩海岛和远处的帆船
  GodotMapV2_PirateShore: {
    sky: { top: 0x2f9be8, horizon: 0xc9f1ff, bottom: 0xd9f6ff },
    fog: { color: 0xc4ecf6, near: 40, far: 110 },
    sun: { azimuth: -15, elevation: 5, color: 0xfff6d8, size: 2.2, glow: 0.4 },
    outer: 'water',
    water: 0x33b5d6,
    layers: [
      { type: 'mesas', color: 0xc86a3a, count: 10, ring: [12, 40], radius: [3, 7], height: [4, 9], haze: 0.14 },
      { type: 'ships', hull: 0x7a4a2a, sail: 0xfbf6ea, count: 4, ring: [16, 40], size: [3, 4.5], haze: 0.12 },
      DEFAULT_CLOUDS
    ]
  },
  // 墓园：紫红黄昏、月亮和星星，近处枯树剪影，远处锯齿状暗山
  GodotMapV2_Graveyard: {
    sky: { top: 0x2b2450, horizon: 0xb07a9c, bottom: 0x6a5575 },
    fog: { color: 0x8a6c8c, near: 24, far: 76 },
    sun: { azimuth: 20, elevation: 6, color: 0xfff1dc, size: 2.8, glow: 0.55 },
    stars: 0.7,
    light: { sun: 0xffc8b8, sunIntensity: 1.7, hemiSky: 0xb3a6d3, hemiGround: 0x625265, hemiIntensity: 1.45 },
    layers: [
      { type: 'deadTrees', color: 0x2c2733, count: 40, ring: [2, 14], height: [4, 7], haze: 0.06 },
      { type: 'peaks', color: 0x3d3450, count: 26, ring: [16, 34], radius: [7, 12], height: [5, 10], haze: 0.26 },
      { type: 'peaks', color: 0x5a4a6a, count: 18, ring: [40, 58], radius: [12, 20], height: [10, 16], haze: 0.45 }
    ]
  },
  // 六角遗迹：尘土色的午后，残柱和倒塌石块，远处台地
  GodotMapV2_HexRuins: {
    sky: { top: 0x5b9fd8, horizon: 0xf1dcb0, bottom: 0xf4e6c8 },
    fog: { color: 0xe5d5ae, near: 32, far: 92 },
    sun: { azimuth: -40, elevation: 4, color: 0xffe0a0, size: 2.4, glow: 0.45 },
    light: { sun: 0xffe2b0 },
    layers: [
      { type: 'pillars', color: 0xcdbd98, count: 30, ring: [2, 16], width: [0.8, 1.5], height: [2, 7], haze: 0.08 },
      { type: 'mesas', color: 0xb59a6a, count: 16, ring: [18, 40], radius: [8, 15], height: [4, 8], haze: 0.28 },
      { type: 'peaks', color: 0xa9a2b8, count: 16, ring: [44, 62], radius: [14, 22], height: [14, 20], haze: 0.5 }
    ]
  },
  // 求生山脊：层层松林，远处雪山
  GodotMapV2_SurvivalRidge: {
    sky: { top: 0x4e8fcf, horizon: 0xcfe3ea, bottom: 0xdcebef },
    fog: { color: 0xb9d1d5, near: 30, far: 90 },
    sun: { azimuth: 30, elevation: 5, color: 0xfff6e0, size: 2.2, glow: 0.35 },
    layers: [
      { type: 'pines', color: 0x2f5a2c, trunk: 0x654a35, count: 240, ring: [1, 14], height: [4, 6.5], haze: 0.05 },
      { type: 'pines', color: 0x3e6b5a, trunk: 0x59483a, count: 180, ring: [16, 30], height: [5, 8], haze: 0.26 },
      { type: 'peaks', color: 0x6c8aa0, snow: 0xf2f6fa, count: 18, ring: [36, 56], radius: [12, 20], height: [20, 30], haze: 0.34 }
    ]
  },
  // 首领高地：高海拔晴空，雪顶群峰，脚下云海
  GodotMapV2_BossHighland: {
    sky: { top: 0x3572c9, horizon: 0xdbe6f7, bottom: 0xe8eef9 },
    fog: { color: 0xd4deee, near: 36, far: 100 },
    sun: { azimuth: -20, elevation: 5, color: 0xffffff, size: 2, glow: 0.3 },
    light: { sun: 0xf5f3ff },
    layers: [
      { type: 'peaks', color: 0x8c86a4, snow: 0xffffff, count: 20, ring: [8, 28], radius: [8, 14], height: [12, 22], haze: 0.12 },
      { type: 'clouds', color: 0xffffff, count: 34, ring: [16, 50], size: [6, 11], y: [0.5, 3], haze: 0.05, baseHaze: 0 },
      { type: 'peaks', color: 0xa9b3d0, snow: 0xffffff, count: 16, ring: [40, 60], radius: [14, 22], height: [24, 36], haze: 0.42 }
    ]
  },
  // 冰霜道馆：雪松、白色雪山
  GodotMapV2_FrostDojo: {
    sky: { top: 0x7ab4de, horizon: 0xeef7fb, bottom: 0xf3f9fc },
    fog: { color: 0xe4eff5, near: 30, far: 90 },
    sun: { azimuth: 15, elevation: 5, color: 0xffffff, size: 2.2, glow: 0.4 },
    light: { sun: 0xf0f6ff },
    layers: [
      { type: 'pines', color: 0x9fc3c0, trunk: 0x68787a, count: 140, ring: [1, 14], height: [4, 6], haze: 0.06 },
      { type: 'peaks', color: 0xcfe0ea, snow: 0xffffff, count: 22, ring: [18, 50], radius: [10, 18], height: [14, 28], haze: 0.3 }
    ]
  },
  // 潮汐道馆：深青色海面和海蚀柱
  GodotMapV2_TideDojo: {
    sky: { top: 0x2a7fb8, horizon: 0xa9e4ea, bottom: 0xbdebef },
    fog: { color: 0x9ed7dc, near: 36, far: 104 },
    sun: { azimuth: -25, elevation: 4, color: 0xf2fdff, size: 2.4, glow: 0.4 },
    outer: 'water',
    layers: [
      { type: 'seaStacks', color: 0x2e4f55, count: 16, ring: [6, 34], radius: [1.5, 3.5], height: [4, 11], haze: 0.14 },
      DEFAULT_CLOUDS
    ]
  },
  // 钢铁道馆：烟尘黄昏，厂房和冒火光的烟囱
  GodotMapV2_IronDojo: {
    sky: { top: 0x44505f, horizon: 0xd79a6a, bottom: 0xb89078 },
    fog: { color: 0xa88c78, near: 28, far: 86 },
    sun: { azimuth: 0, elevation: 3, color: 0xffb070, size: 3, glow: 0.6 },
    light: { sun: 0xffd2a4, sunIntensity: 2.2, hemiSky: 0xc4c0b8, hemiGround: 0x857568, hemiIntensity: 1.55 },
    layers: [
      { type: 'blocks', color: 0x3a3f46, count: 44, ring: [4, 24], width: [3, 7], height: [4, 12], haze: 0.1 },
      { type: 'chimneys', color: 0x2d3137, glow: 0xff8a3a, count: 12, ring: [8, 24], radius: [0.7, 1.1], height: [10, 16], haze: 0.12 },
      { type: 'peaks', color: 0x5a5460, count: 16, ring: [36, 54], radius: [14, 20], height: [10, 16], haze: 0.4 }
    ]
  },
  // 龙之道馆：赤红天空，喷着岩浆光的火山
  GodotMapV2_DragonDojo: {
    sky: { top: 0x2a1530, horizon: 0xd4553a, bottom: 0x5a2a3a },
    fog: { color: 0x7a3a44, near: 26, far: 82 },
    sun: { azimuth: -10, elevation: 3, color: 0xff8a5a, size: 3.2, glow: 0.7 },
    stars: 0.2,
    light: { sun: 0xffaa80, sunIntensity: 2.1, hemiSky: 0xd499ac, hemiGround: 0x65404a, hemiIntensity: 1.5 },
    layers: [
      { type: 'peaks', color: 0x3a2640, count: 26, ring: [4, 20], radius: [6, 10], height: [4, 9], haze: 0.12 },
      { type: 'volcanoes', color: 0x2b2030, glow: 0xff6a2a, count: 6, ring: [16, 38], radius: [10, 16], height: [10, 20], haze: 0.18 }
    ]
  },
  // 冠军塔：星空与云海，远处发光的尖塔
  GodotMapV2_ChampionTower: {
    sky: { top: 0x0f1030, horizon: 0x6a5a9a, bottom: 0x2a2350 },
    fog: { color: 0x514c79, near: 30, far: 92 },
    sun: { azimuth: 30, elevation: 7, color: 0xf0eaff, size: 2.6, glow: 0.5 },
    stars: 1,
    light: { sun: 0xe2dfff, sunIntensity: 2.0, hemiSky: 0xaaa6dc, hemiGround: 0x605879, hemiIntensity: 1.6 },
    layers: [
      { type: 'clouds', color: 0xb8b0e0, count: 60, ring: [0, 50], size: [6, 12], y: [-1.5, 1.5], haze: 0.12, baseHaze: 0 },
      { type: 'spires', color: 0x2a2745, glow: 0xc8a8ff, count: 8, ring: [18, 45], radius: [1, 2], height: [12, 24], haze: 0.15 }
    ]
  }
}

const FALLBACK_THEME = MAP_HORIZON_THEMES.GodotMap

// Near silhouettes surround open biomes with their own dominant landforms.
// They sit outside the playable rectangle and share the exit-corridor cutouts.
const THEMED_EDGE_LAYERS = {
  GodotMapV2_MistLake: [
    { type: 'seaStacks', color: 0x638780, count: 72, ring: [1, 4], radius: [1.6, 3.1], height: [4.6, 7.2], haze: 0.08 },
    { type: 'reeds', color: 0x648264, count: 130, ring: [0.5, 2.8], height: [2.5, 4.2], haze: 0.04 }
  ],
  GodotMapV2_PirateShore: [
    { type: 'mesas', color: 0xb76c43, count: 66, ring: [1, 5], radius: [2.3, 4.8], height: [5.5, 9], haze: 0.08 }
  ],
  GodotMapV2_HexRuins: [
    { type: 'pillars', color: 0xb7a37d, count: 82, ring: [0.8, 4.2], width: [1.4, 2.2], height: [5, 9], haze: 0.07 }
  ],
  GodotMapV2_BossHighland: [
    { type: 'peaks', color: 0x777e98, snow: 0xe6edf4, count: 62, ring: [1.5, 6], radius: [3, 5.4], height: [9, 16], haze: 0.08 }
  ],
  GodotMapV2_TideDojo: [
    { type: 'seaStacks', color: 0x426d70, count: 78, ring: [1, 5], radius: [1.8, 3.5], height: [5.5, 10], haze: 0.08 }
  ],
  GodotMapV2_IronDojo: [
    { type: 'blocks', color: 0x55565a, count: 72, ring: [1, 5], width: [3.2, 5.4], height: [6, 12], haze: 0.08 }
  ],
  GodotMapV2_DragonDojo: [
    { type: 'peaks', color: 0x54343e, count: 70, ring: [1, 5], radius: [3, 5], height: [7, 13], haze: 0.08 }
  ],
  GodotMapV2_ChampionTower: [
    { type: 'blocks', color: 0x4d496a, count: 70, ring: [1, 5], width: [2.7, 4.5], height: [5, 9], haze: 0.09 },
    { type: 'spires', color: 0x383354, glow: 0xd9c9ff, count: 58, ring: [2, 7], radius: [1, 2], height: [10, 17], haze: 0.08 }
  ]
}

export function resolveHorizonTheme(mapId) {
  return MAP_HORIZON_THEMES[mapId] || FALLBACK_THEME
}

export function applyHorizonLighting(theme, { hemisphere, sun }) {
  const light = theme?.light
  if (!light) return
  if (hemisphere) {
    if (light.hemiSky != null) hemisphere.color.setHex(light.hemiSky)
    if (light.hemiGround != null) hemisphere.groundColor.setHex(light.hemiGround)
    if (light.hemiIntensity != null) hemisphere.intensity = light.hemiIntensity
  }
  if (sun) {
    if (light.sun != null) sun.color.setHex(light.sun)
    if (light.sunIntensity != null) sun.intensity = light.sunIntensity
  }
}

function celestialDirection(sun) {
  const az = (sun?.azimuth ?? 0) * DEG
  const el = (sun?.elevation ?? 5) * DEG
  // azimuth 0 = 初始镜头正前方（-Z）
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
}

// === 天空：三色渐变 + 太阳/月亮 + 可选星空 ===
export function createSkyDome(theme = FALLBACK_THEME) {
  const sky = theme.sky || FALLBACK_THEME.sky
  const sun = theme.sun || {}
  const geometry = new THREE.SphereGeometry(150, 32, 16)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(sky.top) },
      uHorizon: { value: new THREE.Color(sky.horizon) },
      uBottom: { value: new THREE.Color(sky.bottom ?? sky.horizon) },
      uSunDir: { value: celestialDirection(sun) },
      uSunColor: { value: new THREE.Color(sun.color ?? 0xffffff) },
      uSunCos: { value: Math.cos((sun.size ?? 2.2) * DEG) },
      uSunGlow: { value: sun.glow ?? 0.35 },
      uStars: { value: theme.stars ?? 0 }
    },
    vertexShader: `
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,
    fragmentShader: `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunCos;
uniform float uSunGlow;
uniform float uStars;
varying vec3 vDir;
void main() {
  vec3 dir = normalize( vDir );
  float h = dir.y;
  vec3 col = h > 0.0
    ? mix( uHorizon, uTop, pow( smoothstep( 0.0, 0.55, h ), 0.75 ) )
    : mix( uHorizon, uBottom, smoothstep( 0.0, -0.2, h ) );
  if ( uStars > 0.0 && h > 0.0 ) {
    vec3 cell = floor( dir * 520.0 );
    float r = fract( sin( dot( cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
    float twinkle = fract( r * 91.7 );
    col += step( 0.9982, r ) * smoothstep( 0.02, 0.25, h ) * uStars * ( 0.55 + twinkle * 0.45 );
  }
  float sunDot = dot( dir, uSunDir );
  float glow = pow( max( sunDot, 0.0 ), 60.0 ) * uSunGlow + pow( max( sunDot, 0.0 ), 7.0 ) * uSunGlow * 0.28;
  col = mix( col, uSunColor, clamp( glow, 0.0, 1.0 ) );
  col = mix( col, uSunColor, smoothstep( uSunCos, uSunCos + 0.00025, sunDot ) );
  gl_FragColor = vec4( col, 1.0 );
  #include <colorspace_fragment>
}`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'map-sky-dome'
  mesh.renderOrder = -1000
  mesh.frustumCulled = false
  return mesh
}

// === 远景材质：Lambert + 分层空气透视（不吃场景雾） ===
function createBackdropMaterial(color, hazeColor, { haze = 0, baseHaze = 0.3, flat = true, emissive = null } = {}) {
  const material = new THREE.MeshLambertMaterial({ color, flatShading: flat, fog: false })
  if (emissive != null) {
    material.emissive = new THREE.Color(emissive)
    material.emissiveIntensity = 1
  }
  const uniforms = {
    uHaze: { value: haze },
    uBaseHaze: { value: baseHaze },
    uHazeColor: { value: new THREE.Color(hazeColor) }
  }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = `varying float vBackdropY;\n${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
vec4 backdropWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
backdropWorld = instanceMatrix * backdropWorld;
#endif
vBackdropY = ( modelMatrix * backdropWorld ).y;`
    )
    shader.fragmentShader = `varying float vBackdropY;\nuniform float uHaze;\nuniform float uBaseHaze;\nuniform vec3 uHazeColor;\n${shader.fragmentShader}`.replace(
      '#include <opaque_fragment>',
      `outgoingLight = mix( outgoingLight, uHazeColor, clamp( uHaze + ( 1.0 - smoothstep( 0.0, 1.4, vBackdropY ) ) * uBaseHaze, 0.0, 1.0 ) );
#include <opaque_fragment>`
    )
  }
  material.customProgramCacheKey = () => 'mapBackdropHaze'
  return material
}

function seeded(index, salt) {
  const v = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453
  return v - Math.floor(v)
}

const lerp = (range, t) => range[0] + (range[1] - range[0]) * t

// === 单位几何体（底部 y=0） ===
function unitCone(radialSegments = 7) {
  const g = new THREE.ConeGeometry(1, 1, radialSegments, 1)
  g.translate(0, 0.5, 0)
  return g
}

function unitHill() {
  return new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2)
}

function unitCylinder(top, bottom, segments) {
  const g = new THREE.CylinderGeometry(top, bottom, 1, segments, 1)
  g.translate(0, 0.5, 0)
  return g
}

function pineCanopyGeometry() {
  const lower = new THREE.ConeGeometry(0.36, 0.48, 7)
  lower.translate(0, 0.48, 0)
  const middle = new THREE.ConeGeometry(0.3, 0.5, 7)
  middle.translate(0, 0.66, 0)
  const upper = new THREE.ConeGeometry(0.24, 0.52, 7)
  upper.translate(0, 0.74, 0)
  const canopy = mergeGeometries([lower, middle, upper])
  lower.dispose()
  middle.dispose()
  upper.dispose()
  return canopy
}

function snowCapGeometry() {
  // 与 unitCone 同顶点：高度 0.68 处半径 0.32，稍放大防 z-fighting
  const g = new THREE.ConeGeometry(0.32, 0.32, 7, 1)
  g.translate(0, 1 - 0.16, 0)
  g.scale(1.05, 1.004, 1.05)
  return g
}

function deadTreeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.045, 0.1, 1, 5)
  trunk.translate(0, 0.5, 0)
  const branchA = new THREE.CylinderGeometry(0.02, 0.045, 0.5, 4)
  branchA.translate(0, 0.25, 0)
  branchA.rotateZ(0.9)
  branchA.translate(0, 0.62, 0)
  const branchB = new THREE.CylinderGeometry(0.018, 0.04, 0.42, 4)
  branchB.translate(0, 0.21, 0)
  branchB.rotateZ(-0.75)
  branchB.rotateY(1.3)
  branchB.translate(0, 0.78, 0)
  const branchC = new THREE.CylinderGeometry(0.015, 0.03, 0.3, 4)
  branchC.translate(0, 0.15, 0)
  branchC.rotateX(0.8)
  branchC.translate(0, 0.45, 0)
  return mergeGeometries([trunk, branchA, branchB, branchC])
}

function cloudGeometry() {
  const parts = [
    [0, 0, 0, 1],
    [0.95, -0.12, 0.2, 0.72],
    [-0.85, -0.16, -0.1, 0.66],
    [0.3, 0.2, -0.45, 0.6]
  ].map(([x, y, z, r]) => {
    const g = new THREE.IcosahedronGeometry(r, 1)
    g.translate(x, y, z)
    return g
  })
  return mergeGeometries(parts)
}

function bladeGeometry() {
  const blades = []
  for (let i = 0; i < 4; i += 1) {
    const b = new THREE.BoxGeometry(0.09, 0.62, 0.02)
    b.translate(0, 0.33, 0)
    b.rotateZ((i * Math.PI) / 2)
    blades.push(b)
  }
  return mergeGeometries(blades)
}

// === 摆放 ===
function ringPosition(i, count, ring, halfW, halfH, salt, out) {
  const angle = (i / count) * Math.PI * 2 + (seeded(i, salt) - 0.5) * (Math.PI * 2 / count) * 1.6
  const dist = lerp(ring, seeded(i, salt + 1))
  return out.set(Math.cos(angle) * (halfW + dist), 0, Math.sin(angle) * (halfH + dist))
}

function createInstanced(geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.frustumCulled = false
  return mesh
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _p = new THREE.Vector3()
const _e = new THREE.Euler()
const _c = new THREE.Color()

function jitterColor(base, i, salt, amount = 0.07) {
  _c.set(base)
  const k = 1 + (seeded(i, salt) - 0.5) * 2 * amount
  return _c.multiplyScalar(k)
}

const _corridorPos = new THREE.Vector3()
const _corridorScale = new THREE.Vector3()
const _corridorQuat = new THREE.Quaternion()

function buildLayer(layer, layerIndex, ctx) {
  const { group, halfW, halfH, hazeColor, updaters, exits } = ctx
  // 出口方向留走廊：实例中心离出口射线太近就缩成 0（半宽 = 自身半径 + 余量）
  const hideInExitCorridor = (matrix) => {
    if (!exits?.length || layer.type === 'clouds') return matrix
    matrix.decompose(_corridorPos, _corridorQuat, _corridorScale)
    const radius = Math.max(_corridorScale.x, _corridorScale.z)
    const blocked = exits.some((exit) => distanceToExitCorridor(exit, _corridorPos.x, _corridorPos.z) < radius + 3.2)
    if (blocked) matrix.scale(_corridorScale.set(0.0001, 0.0001, 0.0001))
    return matrix
  }
  const salt = 10 + layerIndex * 17
  const count = layer.count ?? 10
  const hazeOpts = { haze: layer.haze ?? 0, baseHaze: layer.baseHaze ?? 0.3 }
  const place = (i, out = _p) => ringPosition(i, count, layer.ring ?? [4, 20], halfW, halfH, salt, out)

  const simple = (geometry, materialColor, transform, colorOf = null, extraOpts = {}) => {
    const mesh = createInstanced(geometry, createBackdropMaterial(colorOf ? 0xffffff : materialColor, hazeColor, { ...hazeOpts, ...extraOpts }), count)
    for (let i = 0; i < count; i += 1) {
      transform(i, _m)
      hideInExitCorridor(_m)
      mesh.setMatrixAt(i, _m)
      if (colorOf) mesh.setColorAt(i, colorOf(i))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    group.add(mesh)
    return mesh
  }
  const composeAt = (i, sx, sy, sz, y = 0, tiltX = 0, tiltZ = 0) => {
    place(i)
    _p.y = y
    _e.set(tiltX, seeded(i, salt + 5) * Math.PI * 2, tiltZ)
    _q.setFromEuler(_e)
    _s.set(sx, sy, sz)
    return _m.compose(_p, _q, _s)
  }
  const colorPick = (i) => {
    if (layer.colors?.length) return jitterColor(layer.colors[Math.floor(seeded(i, salt + 9) * layer.colors.length) % layer.colors.length], i, salt + 8)
    return jitterColor(layer.color, i, salt + 8)
  }

  switch (layer.type) {
    case 'hills': {
      simple(unitHill(), layer.color, (i) => {
        const r = lerp(layer.radius, seeded(i, salt + 2))
        return composeAt(i, r, lerp(layer.height, seeded(i, salt + 3)), r * (0.7 + seeded(i, salt + 4) * 0.5), -0.1)
      }, colorPick)
      break
    }
    case 'peaks': {
      const transform = (i) => {
        const r = lerp(layer.radius, seeded(i, salt + 2))
        return composeAt(i, r, lerp(layer.height, seeded(i, salt + 3)), r * (0.75 + seeded(i, salt + 4) * 0.5), -0.2)
      }
      simple(unitCone(7), layer.color, transform, colorPick)
      if (layer.snow != null) simple(snowCapGeometry(), layer.snow, transform)
      break
    }
    case 'mesas': {
      simple(unitCylinder(0.78, 1, 8), layer.color, (i) => {
        const r = lerp(layer.radius, seeded(i, salt + 2))
        return composeAt(i, r, lerp(layer.height, seeded(i, salt + 3)), r * (0.8 + seeded(i, salt + 4) * 0.4), -0.3)
      }, colorPick)
      break
    }
    case 'pines': {
      const transform = (i) => {
        const h = lerp(layer.height, seeded(i, salt + 3))
        const r = h * (0.72 + seeded(i, salt + 2) * 0.18)
        return composeAt(i, r, h, r, -0.05)
      }
      const trunk = unitCylinder(0.045, 0.09, 7)
      trunk.scale(1, 0.8, 1)
      simple(trunk, layer.trunk ?? 0x645341, transform)
      simple(pineCanopyGeometry(), layer.color, transform, colorPick)
      break
    }
    case 'reeds': {
      simple(unitCone(4), layer.color, (i) => {
        const h = lerp(layer.height, seeded(i, salt + 3))
        const r = h * 0.05
        return composeAt(i, r, h, r, -0.05, (seeded(i, salt + 6) - 0.5) * 0.3, (seeded(i, salt + 7) - 0.5) * 0.3)
      }, colorPick)
      break
    }
    case 'roundTrees': {
      const sizeOf = (i) => lerp(layer.size, seeded(i, salt + 2))
      const trunk = unitCylinder(0.08, 0.12, 5)
      trunk.scale(1, 0.5, 1)
      const canopy = new THREE.IcosahedronGeometry(0.42, 0)
      canopy.translate(0, 0.72, 0)
      simple(trunk, layer.trunk ?? 0x6a4a30, (i) => { const k = sizeOf(i); return composeAt(i, k, k, k, -0.05) })
      simple(canopy, layer.color, (i) => { const k = sizeOf(i); return composeAt(i, k, k, k, -0.05) }, colorPick)
      break
    }
    case 'deadTrees': {
      simple(deadTreeGeometry(), layer.color, (i) => {
        const h = lerp(layer.height, seeded(i, salt + 3))
        return composeAt(i, h * 0.9, h, h * 0.9, -0.05, (seeded(i, salt + 6) - 0.5) * 0.2, (seeded(i, salt + 7) - 0.5) * 0.2)
      })
      break
    }
    case 'pillars': {
      simple(unitCylinder(0.5, 0.56, 6), layer.color, (i) => {
        const w = lerp(layer.width, seeded(i, salt + 2))
        const broken = seeded(i, salt + 6) < 0.35
        const h = lerp(layer.height, seeded(i, salt + 3)) * (broken ? 0.45 : 1)
        return composeAt(i, w, h, w, -0.05, broken ? 0.06 : 0, broken ? (seeded(i, salt + 7) - 0.5) * 0.25 : 0)
      }, colorPick)
      // 倒塌的石块
      const rubble = new THREE.BoxGeometry(1, 1, 1)
      rubble.translate(0, 0.5, 0)
      simple(rubble, layer.color, (i) => {
        const w = lerp(layer.width, seeded(i, salt + 2)) * 1.2
        place(i)
        _p.x += (seeded(i, salt + 11) - 0.5) * 4
        _p.z += (seeded(i, salt + 12) - 0.5) * 4
        _p.y = -0.1
        _e.set(0, seeded(i, salt + 13) * Math.PI, (seeded(i, salt + 14) - 0.5) * 0.4)
        _q.setFromEuler(_e)
        _s.set(w * 1.6, w * 0.7, w)
        return _m.compose(_p, _q, _s)
      }, colorPick)
      break
    }
    case 'blocks': {
      const box = new THREE.BoxGeometry(1, 1, 1)
      box.translate(0, 0.5, 0)
      simple(box, layer.color, (i) => {
        const w = lerp(layer.width, seeded(i, salt + 2))
        return composeAt(i, w, lerp(layer.height, seeded(i, salt + 3)), w * (0.6 + seeded(i, salt + 4) * 0.8), -0.05)
      }, colorPick)
      break
    }
    case 'chimneys':
    case 'spires':
    case 'volcanoes':
    case 'seaStacks': {
      const isVolcano = layer.type === 'volcanoes'
      const isSpire = layer.type === 'spires'
      const body = isVolcano
        ? unitCylinder(0.16, 1, 9)
        : isSpire
          ? unitCone(6)
          : layer.type === 'seaStacks'
            ? unitCylinder(0.68, 1, 6)
            : unitCylinder(0.46, 0.6, 8)
      const transform = (i) => {
        const r = lerp(layer.radius, seeded(i, salt + 2))
        const h = lerp(layer.height, seeded(i, salt + 3))
        const tilt = layer.type === 'seaStacks' ? (seeded(i, salt + 6) - 0.5) * 0.16 : 0
        return composeAt(i, r, h, r * (isVolcano ? 0.85 + seeded(i, salt + 4) * 0.3 : 1), isVolcano ? -0.4 : -0.1, tilt, tilt * 0.6)
      }
      simple(body, layer.color, transform, colorPick)
      if (layer.glow != null) {
        // 顶部发光：火山口岩浆 / 烟囱火光 / 尖塔光点，不做空气透视（夜里要亮）
        const glowGeometry = isSpire ? new THREE.OctahedronGeometry(0.16, 0) : unitCylinder(isVolcano ? 0.15 : 0.44, isVolcano ? 0.15 : 0.44, 9)
        glowGeometry.translate(0, isSpire ? 1.02 : 0.985, 0)
        glowGeometry.scale(isSpire ? 1.8 : 1, isSpire ? 0.12 : 0.03, isSpire ? 1.8 : 1)
        const glowMaterial = new THREE.MeshBasicMaterial({ color: layer.glow, fog: false })
        const glowMesh = createInstanced(glowGeometry, glowMaterial, count)
        for (let i = 0; i < count; i += 1) {
          transform(i)
          hideInExitCorridor(_m)
          glowMesh.setMatrixAt(i, _m)
        }
        glowMesh.instanceMatrix.needsUpdate = true
        group.add(glowMesh)
        const base = new THREE.Color(layer.glow)
        updaters.push((now) => {
          glowMaterial.color.copy(base).multiplyScalar(0.8 + Math.sin(now * 0.0021) * 0.2)
        })
      }
      break
    }
    case 'windmills': {
      const heightOf = (i) => lerp(layer.height, seeded(i, salt + 3))
      const towerTransform = (i) => { const h = heightOf(i); return composeAt(i, h * 0.9, h, h * 0.9, -0.05) }
      simple(unitCylinder(0.1, 0.18, 6), layer.tower, towerTransform)
      const roof = new THREE.ConeGeometry(0.16, 0.18, 6)
      roof.translate(0, 1.07, 0)
      simple(roof, layer.blades, towerTransform)
      const bladeMaterial = createBackdropMaterial(layer.blades, hazeColor, hazeOpts)
      const blades = createInstanced(bladeGeometry(), bladeMaterial, count)
      group.add(blades)
      const towers = []
      for (let i = 0; i < count; i += 1) towers.push(hideInExitCorridor(towerTransform(i)).clone())
      const hub = new THREE.Matrix4()
      const spin = new THREE.Matrix4()
      const bladeM = new THREE.Matrix4()
      const update = (now) => {
        for (let i = 0; i < count; i += 1) {
          hub.makeTranslation(0, 0.95, 0.2)
          spin.makeRotationZ(now * 0.0006 * (0.8 + seeded(i, salt + 20) * 0.5) + i)
          bladeM.copy(towers[i]).multiply(hub).multiply(spin)
          blades.setMatrixAt(i, bladeM)
        }
        blades.instanceMatrix.needsUpdate = true
      }
      update(0)
      updaters.push(update)
      break
    }
    case 'ships': {
      const sizeOf = (i) => lerp(layer.size, seeded(i, salt + 2))
      const hull = new THREE.BoxGeometry(1, 0.26, 0.34)
      hull.translate(0, 0.08, 0)
      const sail = new THREE.ConeGeometry(0.34, 0.9, 3)
      sail.scale(1, 1, 0.12)
      sail.translate(0, 0.66, 0)
      const shipTransform = (i) => { const k = sizeOf(i); return composeAt(i, k, k, k, -0.02) }
      simple(hull, layer.hull, shipTransform)
      simple(sail, layer.sail, shipTransform)
      break
    }
    case 'clouds': {
      const cloudGroup = new THREE.Group()
      const mesh = createInstanced(cloudGeometry(), createBackdropMaterial(layer.color, hazeColor, { ...hazeOpts, flat: false }), count)
      for (let i = 0; i < count; i += 1) {
        const k = lerp(layer.size, seeded(i, salt + 2))
        place(i)
        _p.y = lerp(layer.y ?? [15, 24], seeded(i, salt + 3))
        _e.set(0, seeded(i, salt + 5) * Math.PI * 2, 0)
        _q.setFromEuler(_e)
        _s.set(k, k * 0.42, k * 0.7)
        mesh.setMatrixAt(i, _m.compose(_p, _q, _s))
      }
      mesh.instanceMatrix.needsUpdate = true
      cloudGroup.add(mesh)
      group.add(cloudGroup)
      // 整圈云缓慢漂移
      updaters.push((now) => { cloudGroup.rotation.y = now * 0.0000035 })
      break
    }
    default:
      break
  }
}

// 地图外围：外围地面（或海面）+ 按主题的分层远景
export function createHorizonScenery(worldW, worldH, theme = FALLBACK_THEME, { palette = {}, timeUniform, exits = [] } = {}) {
  const group = new THREE.Group()
  group.name = 'map-horizon-scenery'
  const hazeColor = theme.fog?.color ?? theme.sky?.horizon ?? 0xcdeeff

  const groundGeometry = new THREE.PlaneGeometry(460, 460)
  groundGeometry.rotateX(-Math.PI / 2)
  let ground
  if (theme.outer === 'water' && timeUniform) {
    ground = new THREE.Mesh(
      groundGeometry,
      createWaterMaterial({ color: theme.water ?? palette.water ?? 0x3fb2d0, opacity: 1, skyColor: theme.sky?.horizon ?? 0xcdeeff }, timeUniform)
    )
    ground.name = 'map-outer-sea'
    ground.position.y = -0.07
  } else {
    ground = new THREE.Mesh(groundGeometry, new THREE.MeshLambertMaterial({ color: palette.terrainTop ?? 0x79d16b }))
    ground.name = 'map-outer-ground'
    ground.position.y = -0.06
  }
  ground.receiveShadow = false
  group.add(ground)

  const updaters = []
  const ctx = { group, halfW: worldW / 2, halfH: worldH / 2, hazeColor, updaters, exits }
  const edgeTheme = Object.keys(THEMED_EDGE_LAYERS).find((id) => MAP_HORIZON_THEMES[id] === theme)
  ;(THEMED_EDGE_LAYERS[edgeTheme] || []).forEach((layer, index) => buildLayer(layer, -index - 1, ctx))
  ;(theme.layers || []).forEach((layer, index) => buildLayer(layer, index, ctx))
  group.userData.update = (now) => {
    for (let i = 0; i < updaters.length; i += 1) updaters[i](now)
  }
  return group
}
