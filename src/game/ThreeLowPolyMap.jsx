import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { clone as cloneSkeletonScene } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getAdventureMapInfo, getEncounterZoneAt, getMapSignMessage } from './data/overworldMaps'
import { getMapEventAt, getMapEvents } from './data/mapEvents'
import { getMapEventTile } from './data/mapEventTypes'
import { MAP_ASSET_CATALOG } from './data/mapAssetCatalog'
import { getLegacyTile, isWalkable } from './world/LegacyGridAdapter'
import { BLOCKED_LEGACY_TILES, ENCOUNTER_LEGACY_TILES, INTERACTION_LEGACY_TILES } from './world/constants'
import { getEncounterTable, pickWildPokemon } from './data/encounterTables'
import { resolveEncounterTableId } from './data/mapRegistry'
import { animateLowPolyPlayer, createLowPolyPlayer } from './playerFigureVisual'
import { createEliteFourCharacterTemplate, isEliteFourCharacterType } from './eliteFourCharacterVisual'
import {
  getEliteRouteBlockerInteractionTile,
  getEliteRouteStepAsideOffset,
  isEliteRouteBlockerCleared
} from './eliteRouteBlocker'
import { applyMapAssetMaterialStyle } from './mapMaterialStyle'
import { getDecorativeModel, getRequiredModelKeys, loadModels } from './threeLowPolyModelCache'
import { gameAudio } from '../utils/gameAudio'
import {
  REGION_MAP_TILE,
  isInsideDecorationFootprint,
  resolveThemeLandmarkRenderScale
} from './data/godotMaps/godot_region_maps.js'

const CELL = 1.55
const MOVE_MS = 285
const CONTINUOUS_MOVE_MS = 285
const TURN_TO_MOVE_DELAY_MS = 90
const VISUAL_PADDING_TILES = 5
const TRAMPLED_GRASS_MS = 520
const CAMERA_HEIGHT = 14.5
const CAMERA_FORWARD_OFFSET = 12.5
const CAMERA_LOOK_Y = 0.45
const CAMERA_EDGE_PADDING = CELL * 0.75
const PLAYER_BASE_Y = 0.16
const MAX_RENDERER_VIEWPORT_MULTIPLIER = 1.25
const MIN_RENDERER_DIMENSION = 1
const HIDDEN_ENCOUNTER_GATE_INTERACTION_KIND = 'hidden_zone_unlock'
const ENCOUNTER_ALERT_MS = 760

const GRASS_SWAY_KEYS = new Set(['grass', 'grassLarge'])
const GRASS_SWAY_DISABLED = -999
const grassSwayUniforms = { uMapTime: { value: 0 } }

function isMobileSafari() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua)
  return isIOS || (isSafari && /Mobile/.test(ua))
}

function isMobileDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  // 检测移动设备
  const ua = navigator.userAgent || ''
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const isSmallScreen = window.innerWidth <= 768
  return isMobileUA || (isTouchDevice && isSmallScreen)
}

function readMapVisualQualityPref() {
  if (typeof window === 'undefined') return 'high'
  const params = new URLSearchParams(window.location.search)
  const query = params.get('mapQuality') || params.get('hq')
  if (query === 'lite' || query === 'low') return 'lite'
  if (query === 'high' || query === 'hq' || query === '1') return 'high'

  // 自动检测：移动端Safari默认使用优化配置
  if (query === 'auto' || !query) {
    if (isMobileSafari() || isMobileDevice()) {
      return 'lite'
    }
  }

  try {
    const stored = window.localStorage.getItem('mapVisualQuality')
    if (stored === 'lite' || stored === 'high') return stored
  } catch {
    // ignore storage failures
  }

  // 移动设备默认lite，桌面默认high
  return (isMobileSafari() || isMobileDevice()) ? 'lite' : 'high'
}

function isMapRuntimeDebugEnabled() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('mapDebug') === '1' || params.get('debugMap') === '1' || params.get('perf') === '1'
}

function getViewportDimension(axis) {
  if (typeof window === 'undefined') return null
  const visualViewportSize = axis === 'width'
    ? window.visualViewport?.width
    : window.visualViewport?.height
  const innerSize = axis === 'width' ? window.innerWidth : window.innerHeight
  const candidates = [visualViewportSize, innerSize]
    .filter((value) => Number.isFinite(value) && value > 0)
  return candidates.length > 0 ? Math.min(...candidates) : null
}

function clampRendererDimension(rawValue, viewportValue) {
  if (!Number.isFinite(rawValue) || rawValue <= 0) return MIN_RENDERER_DIMENSION
  if (!Number.isFinite(viewportValue) || viewportValue <= 0) return Math.max(rawValue, MIN_RENDERER_DIMENSION)
  const maxValue = Math.max(viewportValue * MAX_RENDERER_VIEWPORT_MULTIPLIER, 320)
  return clamp(rawValue, MIN_RENDERER_DIMENSION, maxValue)
}

function getSafeRendererSize(host) {
  const rect = host.getBoundingClientRect()
  const rawWidth = rect.width
  const rawHeight = rect.height
  const width = clampRendererDimension(rawWidth, getViewportDimension('width'))
  const height = clampRendererDimension(rawHeight, getViewportDimension('height'))
  return {
    width,
    height,
    rawWidth,
    rawHeight,
    wasClamped: Math.abs(width - rawWidth) > 0.5 || Math.abs(height - rawHeight) > 0.5
  }
}

function resolveMapRendererProfile() {
  const pref = readMapVisualQualityPref()
  const liteTier = pref === 'lite'
  const isMobile = isMobileSafari() || isMobileDevice()

  // 移动端优化：即使在high模式也要限制某些参数
  const mobileOptimized = isMobile && !liteTier

  return {
    isMobile,
    liteTier,
    antialias: !liteTier,
    // 移动端：限制pixelRatio避免过高分辨率导致性能问题
    pixelRatioCap: liteTier ? 1.5 : (mobileOptimized ? 2 : 3),
    // 移动端：使用较小的阴影贴图以节省内存和带宽
    shadowMapSize: liteTier ? 1024 : (mobileOptimized ? 1536 : 2048),
    shadowType: THREE.PCFShadowMap,
    powerPreference: 'high-performance',
    // 移动端：降低各向异性过滤以提升性能
    maxAnisotropy: liteTier ? 4 : (mobileOptimized ? 6 : 8),
    // 默认要有”明显的方向阴影”（至少树/建筑），否则画面会显得很”贴纸”。
    // 只有 lite 模式才关掉装饰投影；high 模式允许更多小物件也投影。
    castDecorationShadows: !liteTier,
    castAllDecorationShadows: !liteTier && !mobileOptimized,
    idleFrameMs: isMobile ? 1000 / 24 : 1000 / 30,
    recoveryIdleFrameMs: isMobile ? 1000 / 18 : 1000 / 24
  }
}

function configureSunShadow(light, mapSize = 2048) {
  if (!light?.shadow) return
  light.shadow.mapSize.set(mapSize, mapSize)
  light.shadow.camera.near = 0.5
  light.shadow.camera.far = 80
  light.shadow.bias = -0.00035
  light.shadow.normalBias = 0.045
  if ('radius' in light.shadow) {
    light.shadow.radius = 2.2
  }
}

const SHADOW_CASTING_MODEL_KEYS = new Set(['treeOak', 'treeDefault', 'treePine'])

function applyGroundDecalMaterial(material) {
  if (!material) return material
  const mats = Array.isArray(material) ? material : [material]
  mats.forEach((mat) => {
    if (!mat) return
    mat.polygonOffset = true
    mat.polygonOffsetFactor = -2
    mat.polygonOffsetUnits = -2
    mat.depthWrite = true
  })
  return material
}

const _preparedGeometryCache = new WeakMap()

function prepareMeshGeometry(geometry) {
  if (!geometry?.isBufferGeometry) return geometry
  const cached = _preparedGeometryCache.get(geometry)
  if (cached) return cached

  let prepared = geometry.clone()
  if (!prepared.getAttribute('normal')) {
    try {
      const merged = mergeVertices(prepared)
      if (merged) prepared = merged
    } catch {
      // 个别模型 merge 失败时仍尝试平滑法线
    }
    prepared.computeVertexNormals()
  }
  _preparedGeometryCache.set(geometry, prepared)
  return prepared
}

function polishModelTexture(texture, maxAnisotropy = 8, colorSpace = THREE.NoColorSpace) {
  if (!texture) return
  let needsUpdate = false
  const nextAnisotropy = Math.max(1, Math.min(maxAnisotropy, 16))
  if (texture.colorSpace !== colorSpace) {
    texture.colorSpace = colorSpace
    needsUpdate = true
  }
  if (texture.anisotropy !== nextAnisotropy) {
    texture.anisotropy = nextAnisotropy
    needsUpdate = true
  }
  if (texture.minFilter !== THREE.NearestFilter && texture.minFilter !== THREE.NearestMipmapNearestFilter) {
    if (texture.minFilter !== THREE.LinearMipmapLinearFilter) {
      texture.minFilter = THREE.LinearMipmapLinearFilter
      needsUpdate = true
    }
    if (texture.magFilter !== THREE.LinearFilter) {
      texture.magFilter = THREE.LinearFilter
      needsUpdate = true
    }
    if (!texture.generateMipmaps) {
      texture.generateMipmaps = true
      needsUpdate = true
    }
  }
  if (needsUpdate) texture.needsUpdate = true
}

function convertToSmoothLitMaterial(material) {
  if (!material?.isMeshBasicMaterial) return material
  return new THREE.MeshStandardMaterial({
    name: material.name,
    color: material.color,
    map: material.map,
    alphaMap: material.alphaMap,
    transparent: material.transparent,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    side: material.side,
    depthWrite: material.depthWrite,
    depthTest: material.depthTest,
    roughness: 0.84,
    metalness: 0.02,
    flatShading: false
  })
}

function enhanceMeshMaterial(material, { maxAnisotropy = 8 } = {}) {
  if (!material) return material
  if (Array.isArray(material)) {
    return material.map((mat) => enhanceMeshMaterial(mat, { maxAnisotropy }))
  }
  const mat = convertToSmoothLitMaterial(material)
  mat.flatShading = false
  if (typeof mat.roughness === 'number') mat.roughness = Math.min(Math.max(mat.roughness, 0.72), 0.88)
  if (typeof mat.metalness === 'number') mat.metalness = Math.min(mat.metalness, 0.05)
  polishModelTexture(mat.map, maxAnisotropy, THREE.SRGBColorSpace)
  polishModelTexture(mat.normalMap, maxAnisotropy, THREE.NoColorSpace)
  mat.needsUpdate = true
  return mat
}

function cloneAndEnhanceMeshMaterial(material, options = {}) {
  if (!material) return material
  if (Array.isArray(material)) {
    return material.map((entry) => cloneAndEnhanceMeshMaterial(entry, options))
  }
  const clone = typeof material.clone === 'function' ? material.clone() : material
  return enhanceMeshMaterial(clone, options)
}

function ensureGrassSwayMaterial(material) {
  if (!material || material.userData?.grassSwayEnabled) return
  material.userData.grassSwayEnabled = true
  const previousOnBeforeCompile = material.onBeforeCompile
  material.onBeforeCompile = (shader) => {
    previousOnBeforeCompile?.(shader)
    shader.uniforms.uMapTime = grassSwayUniforms.uMapTime
    shader.vertexShader = `
attribute vec2 instanceSwaySeed;
uniform float uMapTime;
${shader.vertexShader}`
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#if defined( USE_INSTANCING )
if ( instanceSwaySeed.x > -500.0 ) {
  float phase = uMapTime * 0.0023809524 + instanceSwaySeed.x * 0.8 + instanceSwaySeed.y * 0.5;
  float sway = sin( phase ) * 0.035;
  transformed.x += transformed.y * sway * 0.55;
  transformed.z += transformed.y * sway;
  transformed.y += sin( phase * 0.73 ) * 0.012 * max( transformed.y, 0.08 );
}
#endif
`
    )
  }
  material.needsUpdate = true
}

function ensureGrassSwayGeometry(instancedMesh, capacity) {
  if (instancedMesh.geometry.getAttribute('instanceSwaySeed')) return
  const seeds = new Float32Array(capacity * 2)
  for (let i = 0; i < capacity; i += 1) {
    seeds[i * 2] = GRASS_SWAY_DISABLED
    seeds[i * 2 + 1] = GRASS_SWAY_DISABLED
  }
  const attr = new THREE.InstancedBufferAttribute(seeds, 2)
  attr.setUsage(THREE.DynamicDrawUsage)
  instancedMesh.geometry.setAttribute('instanceSwaySeed', attr)
  instancedMesh.userData.grassSwaySeedAttr = attr
}

function setGrassInstanceSwaySeed(instancedMesh, index, tileX, tileY) {
  const attr = instancedMesh.userData.grassSwaySeedAttr
    || instancedMesh.geometry.getAttribute('instanceSwaySeed')
  if (!attr) return
  attr.setXY(index, tileX, tileY)
  attr.needsUpdate = true
}

function disableGrassInstanceSway(instancedMesh, index) {
  setGrassInstanceSwaySeed(instancedMesh, index, GRASS_SWAY_DISABLED, GRASS_SWAY_DISABLED)
}

function restoreGrassClusterStatic(grass) {
  if (!grass?.subInstances?.length) return
  const dirtyMeshes = new Set()
  grass.subInstances.forEach((sub) => {
    if (sub.staticMatrix) {
      sub.mesh.setMatrixAt(sub.index, sub.staticMatrix)
      dirtyMeshes.add(sub.mesh)
    }
    setGrassInstanceSwaySeed(sub.mesh, sub.index, grass.tileX, grass.tileY)
  })
  dirtyMeshes.forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true
  })
  grass._swayDisabled = false
}

const LEGACY_DECORATIVE_ASSET_ALIASES = {
  'grass-small': 'nature_grass_small',
  'grass-large': 'nature_grass_large',
  'flower-yellow': 'nature_flower_yellow',
  'flower-red': 'nature_flower_red',
  'mushroom-red': 'nature_mushroom_red'
}

const LEGACY_LOW_VEGETATION_DECOR_TYPES = new Set([
  'grass-small',
  'grass-large',
  'flower-yellow',
  'flower-red',
  'mushroom-red',
  'wetland_reed_clump'
])

const LOW_VEGETATION_TAGS = new Set(['grass', 'flower', 'mushroom', 'reed'])
const BLOCKY_CHARACTER_RAW_HEIGHT = 2.7

const DIRS = {
  up: { x: 0, y: -1, rot: Math.PI },
  down: { x: 0, y: 1, rot: 0 },
  left: { x: -1, y: 0, rot: -Math.PI / 2 },
  right: { x: 1, y: 0, rot: Math.PI / 2 }
}

const NPC_INTERACTION_EVENT_TYPES = new Set(['trainer', 'boss', 'merchant'])
const BLOCKING_INTERACTIONS = new Set(['exit', 'heal', 'trainer', 'boss', 'challenge', 'objective', 'info', 'merchant'])
const MUTED_EVENT_VISUAL_STATES = new Set(['locked', 'daily_complete', 'cleared', 'completed'])
const NON_BATTLE_INFO_VISUAL_STATES = new Set(['daily_complete', 'cleared', 'completed', 'locked'])
let activeThreeMapRendererLease = null

function disposeActiveThreeMapRenderer(reason = 'handoff') {
  const lease = activeThreeMapRendererLease
  if (!lease?.teardown) return
  activeThreeMapRendererLease = null
  try {
    lease.teardown(reason)
  } catch (error) {
    console.warn('[ThreeLowPolyMap] Failed to dispose active renderer lease:', error)
  }
}

function registerActiveThreeMapRenderer(host, teardown) {
  activeThreeMapRendererLease = { host, teardown }
}

function clearActiveThreeMapRenderer(host, teardown) {
  if (activeThreeMapRendererLease?.host === host && activeThreeMapRendererLease?.teardown === teardown) {
    activeThreeMapRendererLease = null
  }
}

function releaseThreeRenderer(renderer, reason = 'cleanup') {
  if (!renderer) return
  try {
    const gl = renderer.getContext?.()
    const alreadyLost = typeof gl?.isContextLost === 'function' ? gl.isContextLost() : false
    if (!alreadyLost) {
      renderer.forceContextLoss?.()
    }
  } catch (error) {
    if (isMapRuntimeDebugEnabled()) {
      console.warn(`[ThreeLowPolyMap] WebGL context release skipped (${reason}):`, error)
    }
  }
  try {
    renderer.dispose?.()
  } catch (error) {
    if (isMapRuntimeDebugEnabled()) {
      console.warn(`[ThreeLowPolyMap] Renderer dispose failed (${reason}):`, error)
    }
  }
  try {
    renderer.domElement?.remove?.()
  } catch {
    // Canvas may already be detached.
  }
}

function isBlockingInteraction(interaction) {
  return BLOCKING_INTERACTIONS.has(interaction)
}

function isHiddenEncounterGateMapEvent(mapEvent) {
  return mapEvent?.type === 'sign' && mapEvent?.properties?.interactionKind === HIDDEN_ENCOUNTER_GATE_INTERACTION_KIND
}

function getLockedEncounterZoneAt(state, tileX, tileY) {
  if (!state?.currentMapName || !state?.encounterZoneLocks) return null
  const zone = getEncounterZoneAt(state.currentMapName, tileX, tileY)
  const zoneLock = zone?.id ? state.encounterZoneLocks?.[zone.id] : null
  if (!zoneLock?.blocked) return null
  return { zone, zoneLock }
}

function isMutedEventVisualState(status = 'available') {
  return MUTED_EVENT_VISUAL_STATES.has(status)
}

function resolveEventVisualStateValue(eventId, mapEventVisualState, fallback = 'available') {
  if (typeof eventId !== 'string' || eventId.length === 0) return fallback
  const status = mapEventVisualState?.[eventId]?.status
  return typeof status === 'string' && status.length > 0 ? status : fallback
}

function shouldRouteBattleEventToInfo(mapEvent, mapEventVisualState, currentMapBossCompleted = false) {
  if (!mapEvent || !['trainer', 'boss', 'challenge'].includes(mapEvent.type)) return false
  if (mapEvent.type === 'boss' && currentMapBossCompleted) return true
  const status = resolveEventVisualStateValue(mapEvent.id, mapEventVisualState, 'available')
  return NON_BATTLE_INFO_VISUAL_STATES.has(status)
}

function lerpAngle(current, target, alpha) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + delta * alpha
}

function getDirectionTowardTile(fromX, fromY, toX, toY) {
  const dx = Math.trunc(Number(toX)) - Math.trunc(Number(fromX))
  const dy = Math.trunc(Number(toY)) - Math.trunc(Number(fromY))
  if (dx === 0 && dy === 0) return null
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right'
  return dy < 0 ? 'up' : 'down'
}

function isCardinalAdjacentTile(leftX, leftY, rightX, rightY) {
  return Math.abs(Math.trunc(Number(leftX)) - Math.trunc(Number(rightX))) +
    Math.abs(Math.trunc(Number(leftY)) - Math.trunc(Number(rightY))) === 1
}

function isNpcInteractionDecoration(object, eventType) {
  return Boolean(
    object?.npcRole &&
    typeof object.eventId === 'string' &&
    NPC_INTERACTION_EVENT_TYPES.has(eventType)
  )
}

function worldFromTile(x, y, width, height) {
  return {
    x: (x - width / 2) * CELL + CELL / 2,
    z: (y - height / 2) * CELL + CELL / 2
  }
}

function seededRandom(x, y, salt = 0) {
  let n = x * 374761393 + y * 668265263 + salt * 2246822519
  n = (n ^ (n >>> 13)) * 1274126177
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

function makeHorizontalCircle(radius, material, segments = 28) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, segments), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true
  return mesh
}

function makeHorizontalShape(points, material) {
  const shape = new THREE.Shape()
  points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.z)
    else shape.lineTo(point.x, point.z)
  })
  shape.closePath()
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true
  applyGroundDecalMaterial(mesh.material)
  return mesh
}

function makeSoftTileBlob(pos, radius, material, salt, y = 0.045) {
  const points = []
  const segments = 20
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2
    const wobble = 0.86 + seededRandom(Math.round(pos.x * 10), Math.round(pos.z * 10), salt + i) * 0.24
    points.push({
      x: Math.cos(angle) * radius * wobble,
      z: Math.sin(angle) * radius * wobble * 0.78
    })
  }
  const mesh = makeHorizontalShape(points, material)
  mesh.position.set(pos.x, y, pos.z)
  mesh.rotation.z = seededRandom(Math.round(pos.x * 9), Math.round(pos.z * 9), salt + 99) * Math.PI
  return mesh
}

function makeOrganicEllipse(pos, rx, ry, material, {
  y = 0.045,
  rotation = 0,
  salt = 0,
  wobble = 0.08,
  segments = 44
} = {}) {
  const points = []
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2
    const noise = 1 - wobble / 2 + seededRandom(Math.round(pos.x * 9), Math.round(pos.z * 9), salt + i) * wobble
    points.push({
      x: Math.cos(angle) * rx * noise,
      z: Math.sin(angle) * ry * noise
    })
  }
  const mesh = makeHorizontalShape(points, material)
  mesh.position.set(pos.x, y, pos.z)
  mesh.rotation.z = rotation
  return mesh
}

function makeCapsuleSegment(start, end, radius, material, { y = 0.045, segments = 12 } = {}) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.max(Math.hypot(dx, dz), 0.001)
  const half = length / 2
  const points = []

  for (let i = 0; i <= segments; i += 1) {
    const angle = -Math.PI / 2 + (i / segments) * Math.PI
    points.push({ x: half + Math.cos(angle) * radius, z: Math.sin(angle) * radius })
  }
  for (let i = 0; i <= segments; i += 1) {
    const angle = Math.PI / 2 + (i / segments) * Math.PI
    points.push({ x: -half + Math.cos(angle) * radius, z: Math.sin(angle) * radius })
  }

  const mesh = makeHorizontalShape(points, material)
  mesh.position.set((start.x + end.x) / 2, y, (start.z + end.z) / 2)
  mesh.rotation.z = Math.atan2(dz, dx)
  return mesh
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function clampIndex(value, max) {
  return clamp(value, 0, max)
}

function getVisualTile(mapGrid, x, y) {
  const maxY = mapGrid.length - 1
  const maxX = mapGrid[0].length - 1
  return mapGrid[clampIndex(y, maxY)][clampIndex(x, maxX)]
}

function isLegacyTileWalkableValue(tile) {
  return tile != null && !BLOCKED_LEGACY_TILES.has(tile)
}

function getDecorativeAsset(type) {
  return MAP_ASSET_CATALOG[type] || MAP_ASSET_CATALOG[LEGACY_DECORATIVE_ASSET_ALIASES[type]] || null
}

function isLowVegetationDecorationType(type) {
  if (LEGACY_LOW_VEGETATION_DECOR_TYPES.has(type)) return true
  const asset = getDecorativeAsset(type)
  if (!asset?.decorativeOnly) return false
  return (asset.themeTags || []).some((tag) => LOW_VEGETATION_TAGS.has(tag))
}

function hasWalkableCardinalNeighbor(mapGrid, x, y) {
  return (
    isLegacyTileWalkableValue(mapGrid[y - 1]?.[x]) ||
    isLegacyTileWalkableValue(mapGrid[y + 1]?.[x]) ||
    isLegacyTileWalkableValue(mapGrid[y]?.[x - 1]) ||
    isLegacyTileWalkableValue(mapGrid[y]?.[x + 1])
  )
}

function shouldHideBlockedLowVegetation(object, mapGrid) {
  if (!isLowVegetationDecorationType(object.type)) return false
  if (!mapGrid?.length || !mapGrid[0]?.length) return false

  const x = Math.round(Number(object.x))
  const y = Math.round(Number(object.y))
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return false
  if (y < 0 || y >= mapGrid.length || x < 0 || x >= mapGrid[0].length) return false

  const tile = mapGrid[y]?.[x]
  return !isLegacyTileWalkableValue(tile) && hasWalkableCardinalNeighbor(mapGrid, x, y)
}

function cloneScene(scene, { scale = 1, shadows = true, maxAnisotropy = 8 } = {}) {
  if (!scene) return null
  const clone = cloneSkeletonScene(scene)
  clone.scale.setScalar(scale)
  clone.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = shadows
      child.receiveShadow = shadows
      if (child.isSkinnedMesh) child.frustumCulled = false
      child.geometry = prepareMeshGeometry(child.geometry)
      child.material = cloneAndEnhanceMeshMaterial(child.material, { maxAnisotropy })
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => {
        if (!material) return
        if (typeof material.roughness === 'number') material.roughness = 0.82
        if (typeof material.metalness === 'number') material.metalness = 0.03
      })
    }
  })
  return clone
}

function createSpringGlowMaterial(color, opacity, options = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: options.depthTest ?? true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
}

function createSignalCoreMaterial(color, opacity, options = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: options.depthTest ?? true,
    depthWrite: false,
    blending: THREE.NormalBlending
  })
}

function createSignalCoreGeometry(shape = 'octa', size = 0.14) {
  switch (shape) {
    case 'box':
      return new THREE.BoxGeometry(size * 1.4, size * 1.4, size * 1.4)
    case 'tetra':
      return new THREE.TetrahedronGeometry(size * 1.1, 0)
    case 'icosa':
      return new THREE.IcosahedronGeometry(size, 0)
    case 'dodeca':
      return new THREE.DodecahedronGeometry(size, 0)
    default:
      return new THREE.OctahedronGeometry(size, 0)
  }
}

const DEFAULT_EVENT_SIGNAL_STYLE = {
  tier: 1,
  colorA: 0xfbbf24,
  colorB: 0xfef08a,
  radius: 0.28,
  hoverY: 0.64,
  ringCount: 1,
  ringGap: 0.06,
  ringTube: 0.01,
  showBase: true,
  moteCount: 0,
  moteSize: 0.022,
  beamCount: 0,
  coreShape: 'octa',
  coreSize: 0.11,
  baseOpacity: 0.05,
  ringOpacity: 0.24,
  coreOpacity: 0.78,
  light: 0,
  lightRange: 1.6,
  pulseSpeed: 1.35,
  basePulseScale: 0.025,
  ringPulseScale: 0.045,
  corePulseScale: 0.08,
  bobAmount: 0.025,
  ringSpinSpeed: 0.1,
  coreSpinSpeed: 0.52,
  coreTilt: 0.08,
  npcBaseLift: 0.08,
  npcForwardOffset: 0
}

const FOOT_SAFE_EVENT_SIGNAL_TYPES = new Set(['warp', 'fast_travel', 'sign'])
const PICKUP_REWARD_EVENT_TYPES = new Set(['item', 'pickup'])
const ROAD_SIGN_DECORATION_TYPES = new Set(['sign', 'trail_sign'])
const ROADSIDE_SIGN_FACE_DOWN = Math.PI

// Unified map-event visual language.
// tier 1: passive information; tier 2: rewards; tier 3: services; tier 4: combat; tier 5: milestone gates.
const MAP_EVENT_SIGNAL_STYLES = {
  sign: {
    label: '路牌',
    tier: 1,
    colorA: 0x2563eb,
    colorB: 0xbfdbfe,
    radius: 0.18,
    hoverY: 0.52,
    coreShape: 'box',
    coreSize: 0.082,
    baseOpacity: 0.025,
    ringOpacity: 0.14,
    coreOpacity: 0.72,
    bobAmount: 0.012,
    corePulseScale: 0.035,
    ringSpinSpeed: 0.035
  },
  hidden_gate: {
    label: '隐藏入口',
    tier: 5,
    colorA: 0xf97316,
    colorB: 0x67e8f9,
    radius: 0.48,
    hoverY: 0.98,
    ringCount: 3,
    ringGap: 0.058,
    ringTube: 0.013,
    beamCount: 3,
    coreShape: 'dodeca',
    coreSize: 0.15,
    baseOpacity: 0.095,
    ringOpacity: 0.5,
    coreOpacity: 0.94,
    moteCount: 7,
    moteSize: 0.022,
    light: 0.24,
    lightRange: 2.85,
    pulseSpeed: 1.85,
    basePulseScale: 0.05,
    ringPulseScale: 0.085,
    corePulseScale: 0.14,
    bobAmount: 0.045,
    ringSpinSpeed: 0.34,
    coreSpinSpeed: 0.78,
    coreTilt: 0.14,
    objectAnchor: 'modelTop',
    objectTopGap: 0.14
  },
  info: {
    label: '提示',
    tier: 1,
    colorA: 0x60a5fa,
    colorB: 0xdbeafe,
    radius: 0.18,
    hoverY: 0.52,
    coreShape: 'box',
    coreSize: 0.082,
    baseOpacity: 0.025,
    ringOpacity: 0.14,
    coreOpacity: 0.72,
    bobAmount: 0.012,
    corePulseScale: 0.035,
    ringSpinSpeed: 0.035
  },
  item: {
    label: '补给',
    tier: 2,
    colorA: 0xf59e0b,
    colorB: 0xfef08a,
    radius: 0.28,
    hoverY: 0.72,
    ringCount: 1,
    ringGap: 0.05,
    showBase: false,
    coreShape: 'octa',
    coreSize: 0.118,
    baseOpacity: 0.055,
    ringOpacity: 0.32,
    coreOpacity: 0.86,
    light: 0,
    bobAmount: 0.028,
    ringSpinSpeed: 0.14,
    objectAnchor: 'modelTop',
    objectTopGap: 0.1
  },
  pickup: {
    label: '隐藏补给',
    tier: 2,
    colorA: 0xf59e0b,
    colorB: 0xfef08a,
    radius: 0.28,
    hoverY: 0.72,
    ringCount: 1,
    ringGap: 0.05,
    showBase: false,
    coreShape: 'octa',
    coreSize: 0.118,
    baseOpacity: 0.055,
    ringOpacity: 0.32,
    coreOpacity: 0.86,
    light: 0,
    bobAmount: 0.028,
    ringSpinSpeed: 0.14,
    objectAnchor: 'modelTop',
    objectTopGap: 0.1
  },
  heal: {
    label: '恢复点',
    tier: 3,
    colorA: 0x0d9488,
    colorB: 0x7dd3fc,
    radius: 0.3,
    hoverY: 0.72,
    coreShape: 'octa',
    coreSize: 0.118,
    baseOpacity: 0.05,
    ringOpacity: 0.3,
    coreOpacity: 0.82,
    light: 0.1,
    lightRange: 1.8,
    ringSpinSpeed: 0.12
  },
  warp: {
    label: '区域连接',
    tier: 5,
    colorA: 0xf97316,
    colorB: 0xfff7ed,
    radius: 0.5,
    hoverY: 1.08,
    ringCount: 3,
    ringGap: 0.058,
    ringTube: 0.012,
    beamCount: 2,
    coreShape: 'icosa',
    coreSize: 0.145,
    baseOpacity: 0.09,
    ringOpacity: 0.48,
    coreOpacity: 0.94,
    moteCount: 6,
    moteSize: 0.021,
    light: 0.23,
    lightRange: 2.7,
    pulseSpeed: 1.55,
    basePulseScale: 0.045,
    ringPulseScale: 0.075,
    corePulseScale: 0.12,
    bobAmount: 0.04,
    ringSpinSpeed: 0.28,
    coreSpinSpeed: 0.68,
    coreTilt: 0.12
  },
  fast_travel: {
    label: '快速传送台',
    tier: 5,
    colorA: 0x0f766e,
    colorB: 0xfde047,
    radius: 0.46,
    hoverY: 0.98,
    ringCount: 4,
    ringGap: 0.058,
    ringTube: 0.013,
    beamCount: 4,
    coreShape: 'dodeca',
    coreSize: 0.15,
    baseOpacity: 0.075,
    ringOpacity: 0.42,
    coreOpacity: 0.92,
    moteCount: 8,
    moteSize: 0.022,
    light: 0.2,
    lightRange: 2.8,
    pulseSpeed: 1.7,
    basePulseScale: 0.04,
    ringPulseScale: 0.075,
    corePulseScale: 0.12,
    bobAmount: 0.042,
    ringSpinSpeed: 0.32,
    coreSpinSpeed: 0.72,
    coreTilt: 0.14
  },
  trainer: {
    label: '普通训练家',
    tier: 4,
    colorA: 0x0f766e,
    colorB: 0xf97316,
    radius: 0.18,
    hoverY: 0.34,
    coreShape: 'tetra',
    coreSize: 0.095,
    baseOpacity: 0.05,
    ringOpacity: 0.28,
    coreOpacity: 0.74,
    npcBaseLift: 0.08,
    npcForwardOffset: 0.18
  },
  merchant: {
    label: '商人',
    tier: 4,
    colorA: 0xd97706,
    colorB: 0x14b8a6,
    radius: 0.2,
    hoverY: 0.34,
    coreShape: 'dodeca',
    coreSize: 0.1,
    baseOpacity: 0.055,
    ringOpacity: 0.3,
    coreOpacity: 0.78,
    npcBaseLift: 0.1,
    npcForwardOffset: 0.2
  },
  lieutenant: {
    label: '部下训练家',
    tier: 4,
    colorA: 0x2563eb,
    colorB: 0xfacc15,
    radius: 0.22,
    hoverY: 0.38,
    coreShape: 'octa',
    coreSize: 0.11,
    baseOpacity: 0.06,
    ringOpacity: 0.34,
    coreOpacity: 0.78,
    npcBaseLift: 0.12,
    npcForwardOffset: 0.24
  },
  boss: {
    label: '区域首领',
    tier: 5,
    colorA: 0xdc2626,
    colorB: 0xfbbf24,
    radius: 0.3,
    hoverY: 0.48,
    coreShape: 'icosa',
    coreSize: 0.13,
    baseOpacity: 0.07,
    ringOpacity: 0.36,
    coreOpacity: 0.82,
    light: 0.1,
    lightRange: 1.8,
    npcBaseLift: 0.16,
    npcForwardOffset: 0.28
  },
  objective: {
    label: '任务机关',
    tier: 5,
    colorA: 0x22d3ee,
    colorB: 0xfef08a,
    radius: 0.3,
    hoverY: 0.94,
    ringCount: 2,
    ringGap: 0.055,
    ringTube: 0.012,
    coreShape: 'icosa',
    coreSize: 0.12,
    baseOpacity: 0.07,
    ringOpacity: 0.4,
    coreOpacity: 0.9,
    moteCount: 5,
    moteSize: 0.02,
    light: 0.18,
    lightRange: 2.4,
    pulseSpeed: 1.7,
    basePulseScale: 0.05,
    ringPulseScale: 0.075,
    corePulseScale: 0.12,
    bobAmount: 0.04,
    ringSpinSpeed: 0.28,
    coreSpinSpeed: 0.72
  },
  challenge: {
    label: '区域试炼',
    tier: 5,
    colorA: 0x7c3aed,
    colorB: 0x67e8f9,
    radius: 0.36,
    hoverY: 0.84,
    ringCount: 2,
    ringGap: 0.05,
    coreShape: 'dodeca',
    coreSize: 0.13,
    baseOpacity: 0.058,
    ringOpacity: 0.32,
    coreOpacity: 0.84,
    moteCount: 3,
    moteSize: 0.02,
    light: 0.14,
    lightRange: 2.1,
    bobAmount: 0.035,
    ringSpinSpeed: 0.18,
    coreSpinSpeed: 0.7,
    objectAnchor: 'modelTop',
    objectTopGap: 0.08
  }
}

function getEventSignalStyleKey(eventType, npcRole = null) {
  if (eventType === 'boss' || npcRole === 'boss') return 'boss'
  if (eventType === 'trainer' && npcRole === 'lieutenant') return 'lieutenant'
  if (eventType === 'merchant' || npcRole === 'merchant') return 'merchant'
  if (eventType === 'trainer') return 'trainer'
  if (eventType === 'pickup') return 'item'
  if (MAP_EVENT_SIGNAL_STYLES[eventType]) return eventType
  return 'item'
}

function isPickupRewardDecoration(object) {
  return Boolean(object?.eventId && PICKUP_REWARD_EVENT_TYPES.has(object.eventType))
}

function isRoadSignDecoration(object) {
  return Boolean(
    object?.eventId &&
    object?.eventType === 'sign' &&
    ROAD_SIGN_DECORATION_TYPES.has(object.type)
  )
}

function resolvePickupRewardSignalEventType(eventType) {
  return PICKUP_REWARD_EVENT_TYPES.has(eventType) ? 'item' : eventType
}

const EVENT_VISUAL_ANCHOR_TYPES = {
  heal: ['town_fountain_round'],
  warp: ['nature_path_stone']
}

function getEventVisualAnchor(mapInfo, eventId, eventType) {
  if (typeof eventId !== 'string' || eventId.length === 0) return null
  if (typeof eventType !== 'string' || eventType.length === 0) return null

  const candidates = (Array.isArray(mapInfo?.decorativeObjects) ? mapInfo.decorativeObjects : [])
    .filter((object) => (
      object?.eventId === eventId &&
      (object?.eventType === eventType || object?.fixedSceneEventType === eventType)
    ))
  if (candidates.length === 0) return null

  const preferredTypes = EVENT_VISUAL_ANCHOR_TYPES[eventType] || []
  const selected = preferredTypes
    .map((type) => candidates.find((object) => object?.type === type))
    .find(Boolean) || candidates[0]
  const x = Number(selected?.x)
  const y = Number(selected?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null

  const offsetX = Number(selected?.offsetX)
  const offsetZ = Number(selected?.offsetZ)
  return {
    x,
    y,
    offsetX: Number.isFinite(offsetX) ? offsetX : 0,
    offsetZ: Number.isFinite(offsetZ) ? offsetZ : 0
  }
}

function resolveDecorationRotationY(object) {
  if (isRoadSignDecoration(object)) return ROADSIDE_SIGN_FACE_DOWN
  return object.rotation ?? Math.PI / 6
}

function getEventSignalSpec(eventType, options = {}) {
  const styleKey = getEventSignalStyleKey(eventType, options.npcRole || null)
  return {
    ...DEFAULT_EVENT_SIGNAL_STYLE,
    ...MAP_EVENT_SIGNAL_STYLES[styleKey],
    styleKey
  }
}

function getNpcModelTopY(modelScale = 1, modelLift = 0) {
  return modelLift + BLOCKY_CHARACTER_RAW_HEIGHT * modelScale
}

const MODEL_VISUAL_BOUNDS = new WeakMap()

function getModelVisualBounds(modelScene) {
  if (!modelScene) return null
  if (MODEL_VISUAL_BOUNDS.has(modelScene)) return MODEL_VISUAL_BOUNDS.get(modelScene)
  modelScene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(modelScene)
  const bounds = box.isEmpty()
    ? null
    : { minY: box.min.y, maxY: box.max.y, height: box.max.y - box.min.y }
  MODEL_VISUAL_BOUNDS.set(modelScene, bounds)
  return bounds
}

function getModelVisualTopY(modelScene, modelScale = 1, modelLift = 0) {
  const bounds = getModelVisualBounds(modelScene)
  if (!bounds) return modelLift + modelScale
  return modelLift + bounds.maxY * modelScale
}

function getEventSignalBaseY(eventType, npcRole = null, modelScale = 1, modelLift = 0, modelScene = null) {
  const spec = getEventSignalSpec(eventType, { npcRole })
  if (eventType === 'trainer' || eventType === 'boss' || eventType === 'merchant' || npcRole === 'boss' || npcRole === 'lieutenant' || npcRole === 'normal' || npcRole === 'merchant') {
    const topY = getNpcModelTopY(modelScale, modelLift)
    return topY + spec.npcBaseLift
  }
  if (spec.objectAnchor === 'modelTop') {
    return getModelVisualTopY(modelScene, modelScale, modelLift) + (spec.objectTopGap ?? 0.06)
  }
  return 0.02
}

function getNpcSignalForwardOffsetZ(eventType, npcRole = null) {
  if (eventType !== 'trainer' && eventType !== 'boss' && eventType !== 'merchant' && !npcRole) return 0
  return getEventSignalSpec(eventType, { npcRole }).npcForwardOffset ?? 0
}

function isAlwaysVisibleMapSignal(eventType, npcRole = null) {
  const spec = getEventSignalSpec(eventType, { npcRole })
  return spec.tier >= 4
}

function resolveDecorativeObjectSignalType(object, mapInfo, mapGrid) {
  if (object?.hiddenGateMarker === true) return 'hidden_gate'
  if (object?.eventType) return MAP_EVENT_SIGNAL_STYLES[object.eventType] ? object.eventType : null
  if (!object || !['sign', 'trail_sign'].includes(object.type)) return null

  const tileX = Math.trunc(Number(object.x))
  const tileY = Math.trunc(Number(object.y))
  if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)) return null

  const coordinateKey = `${tileX},${tileY}`
  const hasStaticSignText = Object.prototype.hasOwnProperty.call(mapInfo?.signs || {}, coordinateKey)
  const isLegacySignTile = getLegacyTile(mapGrid, tileX, tileY) === getMapEventTile('sign')
  return hasStaticSignText || isLegacySignTile ? 'sign' : null
}

function createEventSignal(eventType, options = {}) {
  const spec = getEventSignalSpec(eventType, options)
  const alwaysVisible = Boolean(options.alwaysVisible)
  const keepUnderPlayer = FOOT_SAFE_EVENT_SIGNAL_TYPES.has(eventType)
  const signalMaterialOptions = alwaysVisible && !keepUnderPlayer ? { depthTest: false } : {}
  const groundMaterialOptions = keepUnderPlayer ? { depthTest: true } : signalMaterialOptions
  const groundBaseY = keepUnderPlayer ? 0.018 : 0.06
  const groundRingY = keepUnderPlayer ? 0.034 : 0.12
  const groundRingGapY = keepUnderPlayer ? 0.014 : 0.04
  const renderOrder = 20 + (spec.tier || 1)
  const group = new THREE.Group()
  group.userData.kind = 'event-signal'
  group.userData.eventType = eventType
  group.userData.npcRole = options.npcRole || null
  group.userData.phase = (options.seed || 0) * 0.67
  group.userData.spec = spec
  group.userData.visualTier = spec.tier
  group.userData.eventId = typeof options.eventId === 'string' ? options.eventId : null
  group.userData.visualState = options.visualState || 'available'
  group.userData.muted = Boolean(options.muted)
  group.position.y = options.baseY ?? 0.02

  if (spec.showBase) {
    const base = new THREE.Mesh(
      new THREE.CircleGeometry(spec.radius * 1.08, 40),
      createSpringGlowMaterial(spec.colorA, spec.baseOpacity ?? 0.12, groundMaterialOptions)
    )
    base.rotation.x = -Math.PI / 2
    base.position.y = groundBaseY
    base.userData.signalPart = 'base'
    base.userData.baseOpacity = spec.baseOpacity ?? 0.12
    if (alwaysVisible && !keepUnderPlayer) base.renderOrder = renderOrder
    group.add(base)
  }

  for (let i = 0; i < spec.ringCount; i += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(spec.radius + i * spec.ringGap, spec.ringTube + i * 0.001, 8, 44),
      createSpringGlowMaterial(i % 2 === 0 ? spec.colorA : spec.colorB, spec.ringOpacity ?? (i === 0 ? 0.56 : 0.38), groundMaterialOptions)
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = groundRingY + i * groundRingGapY
    ring.userData.signalPart = 'ring'
    ring.userData.index = i
    ring.userData.baseOpacity = spec.ringOpacity ?? (i === 0 ? 0.56 : 0.38)
    if (alwaysVisible && !keepUnderPlayer) ring.renderOrder = renderOrder
    group.add(ring)
  }

  for (let i = 0; i < spec.beamCount; i += 1) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.03, 0.78 + i * 0.04, 8, 1, true),
      createSpringGlowMaterial(i % 2 === 0 ? spec.colorA : spec.colorB, 0.26, signalMaterialOptions)
    )
    const angle = (Math.PI * 2 * i) / Math.max(spec.beamCount, 1)
    beam.position.set(Math.cos(angle) * (spec.radius * 0.8), 0.56, Math.sin(angle) * (spec.radius * 0.62))
    beam.userData.signalPart = 'beam'
    beam.userData.angle = angle
    beam.userData.index = i
    beam.userData.baseOpacity = 0.26
    if (alwaysVisible) beam.renderOrder = renderOrder
    group.add(beam)
  }

  for (let i = 0; i < spec.moteCount; i += 1) {
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(spec.moteSize + (i % 2) * 0.004, 10, 8),
      createSpringGlowMaterial(i % 2 === 0 ? spec.colorB : spec.colorA, 0.44, signalMaterialOptions)
    )
    mote.userData.signalPart = 'mote'
    mote.userData.angle = (Math.PI * 2 * i) / Math.max(spec.moteCount, 1)
    mote.userData.radius = spec.radius * (0.48 + (i % 3) * 0.1)
    mote.userData.speed = 0.22 + (i % 3) * 0.05
    mote.userData.height = spec.hoverY * (0.78 + (i % 2) * 0.08)
    mote.userData.baseOpacity = 0.44
    if (alwaysVisible) mote.renderOrder = renderOrder
    group.add(mote)
  }

  const core = new THREE.Mesh(
    createSignalCoreGeometry(spec.coreShape, spec.coreSize ?? (eventType === 'challenge' ? 0.17 : eventType === 'boss' ? 0.18 : 0.145)),
    createSignalCoreMaterial(spec.colorB, spec.coreOpacity ?? 0.52, signalMaterialOptions)
  )
  core.position.y = spec.hoverY
  core.userData.signalPart = 'core'
  core.userData.baseOpacity = spec.coreOpacity ?? 0.52
  if (alwaysVisible) core.renderOrder = renderOrder + 1
  group.add(core)

  if (spec.light > 0) {
    const light = new THREE.PointLight(spec.colorA, spec.light, spec.lightRange ?? 4.8)
    light.position.y = spec.hoverY + 0.08
    light.userData.signalPart = 'light'
    light.userData.baseIntensity = spec.light
    group.add(light)
  }

  return group
}

function updateEventSignals(signals, now) {
  if (!Array.isArray(signals) || signals.length === 0) return
  const time = now * 0.001
  signals.forEach((signal, signalIndex) => {
    if (!signal?.visible) return
    const spec = signal.userData.spec || getEventSignalSpec(signal.userData.eventType)
    const muted = Boolean(signal.userData.muted)
    const phase = signal.userData.phase || 0
    const pulse = (Math.sin(time * spec.pulseSpeed + phase + signalIndex * 0.21) + 1) / 2
    const pulseScaleMultiplier = muted ? 0.22 : 1
    const opacityMultiplier = muted ? 0.5 : 1
    const spinSpeedMultiplier = muted ? 0.16 : 1
    const bobMultiplier = muted ? 0.3 : 1

    signal.children.forEach((part) => {
      if (part.userData.signalPart === 'base') {
        const scale = 1 + pulse * spec.basePulseScale * pulseScaleMultiplier
        part.scale.set(scale, scale, scale)
        part.material.opacity = (part.userData.baseOpacity || 0.1) * opacityMultiplier * (0.76 + pulse * 0.18)
      } else if (part.userData.signalPart === 'ring') {
        const index = part.userData.index || 0
        const scale = 1 + pulse * spec.ringPulseScale * pulseScaleMultiplier + index * 0.025
        part.scale.set(scale, scale, scale)
        part.rotation.z = time * spec.ringSpinSpeed * spinSpeedMultiplier * (index % 2 === 0 ? 1 : -1) + phase
        part.material.opacity = (part.userData.baseOpacity || 0.3) * opacityMultiplier * (0.64 + pulse * 0.24)
      } else if (part.userData.signalPart === 'beam') {
        const wave = (Math.sin(time * 1.5 + phase + (part.userData.index || 0)) + 1) / 2
        part.position.y = 0.5 + wave * 0.04 * bobMultiplier
        part.rotation.y = time * 0.12 * spinSpeedMultiplier + part.userData.angle
        part.material.opacity = (part.userData.baseOpacity || 0.2) * opacityMultiplier * (0.38 + wave * 0.28)
      } else if (part.userData.signalPart === 'mote') {
        const angle = part.userData.angle + time * part.userData.speed + phase
        const radius = part.userData.radius
        part.position.x = Math.cos(angle) * radius
        part.position.z = Math.sin(angle) * radius * 0.78
        part.position.y = part.userData.height + Math.sin(time * 1.8 + part.userData.angle) * (spec.bobAmount * 1.4 * bobMultiplier)
        part.material.opacity = (part.userData.baseOpacity || 0.5) * opacityMultiplier * (0.48 + pulse * 0.28)
      } else if (part.userData.signalPart === 'core') {
        part.position.y = spec.hoverY + Math.sin(time * 1.7 + phase) * spec.bobAmount * bobMultiplier
        part.rotation.y = time * spec.coreSpinSpeed * spinSpeedMultiplier
        part.rotation.x = Math.sin(time * 1.4 + phase) * spec.coreTilt * (muted ? 0.35 : 1)
        const scale = 1 + pulse * spec.corePulseScale * pulseScaleMultiplier
        part.scale.set(scale, scale, scale)
        part.material.opacity = (part.userData.baseOpacity || 0.5) * opacityMultiplier * (0.78 + pulse * 0.16)
      } else if (part.userData.signalPart === 'light') {
        part.intensity = muted ? 0 : (part.userData.baseIntensity || 0.5) * (0.74 + pulse * 0.24)
      }
    })
  })
}

const OBJECTIVE_DEVICE_THEMES = {
  tide: { base: 0x123f49, metal: 0x2a7980, accent: 0x22d3ee, glow: 0xa5f3fc, complete: 0x67e8f9, fins: 3 },
  iron: { base: 0x252b31, metal: 0x737b82, accent: 0xf59e0b, glow: 0xfde68a, complete: 0xfbbf24, fins: 4 },
  dragon: { base: 0x25182d, metal: 0x6d4a7f, accent: 0xa855f7, glow: 0xf5d0fe, complete: 0xfacc15, fins: 5 }
}

function createObjectiveDevice(theme = 'tide', visualKind = '', seed = 0) {
  const spec = OBJECTIVE_DEVICE_THEMES[theme] || OBJECTIVE_DEVICE_THEMES.tide
  const isCore = /altar|core|console/.test(visualKind)
  const group = new THREE.Group()
  group.userData.kind = 'elite-objective-device'
  group.userData.theme = theme
  group.userData.visualKind = visualKind
  group.userData.phase = seed * 0.57
  group.userData.visualState = 'available'
  group.userData.spec = spec

  const baseMaterial = new THREE.MeshStandardMaterial({
    color: spec.base,
    roughness: theme === 'iron' ? 0.48 : 0.68,
    metalness: theme === 'iron' ? 0.58 : 0.24
  })
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: spec.metal,
    roughness: 0.38,
    metalness: 0.62
  })
  const glowMaterial = createSpringGlowMaterial(spec.accent, 0.72)
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(isCore ? 0.38 : 0.3, isCore ? 0.46 : 0.37, isCore ? 0.34 : 0.28, theme === 'iron' ? 8 : theme === 'dragon' ? 6 : 12),
    baseMaterial
  )
  base.position.y = isCore ? 0.18 : 0.15
  base.castShadow = true
  base.receiveShadow = true
  base.userData.objectivePart = 'base'
  group.add(base)

  const trim = new THREE.Mesh(
    new THREE.TorusGeometry(isCore ? 0.36 : 0.29, 0.035, 8, theme === 'iron' ? 8 : 32),
    trimMaterial
  )
  trim.rotation.x = Math.PI / 2
  trim.position.y = isCore ? 0.37 : 0.31
  trim.castShadow = true
  trim.userData.objectivePart = 'trim'
  group.add(trim)

  const coreGeometry = theme === 'iron'
    ? new THREE.OctahedronGeometry(isCore ? 0.2 : 0.15, 0)
    : theme === 'dragon'
      ? new THREE.DodecahedronGeometry(isCore ? 0.19 : 0.145, 0)
      : new THREE.IcosahedronGeometry(isCore ? 0.18 : 0.14, 1)
  const core = new THREE.Mesh(coreGeometry, glowMaterial)
  core.position.y = isCore ? 0.74 : 0.62
  core.userData.objectivePart = 'core'
  core.userData.baseY = core.position.y
  group.add(core)

  for (let index = 0; index < spec.fins; index += 1) {
    const angle = (Math.PI * 2 * index) / spec.fins
    const finGeometry = theme === 'dragon'
      ? new THREE.ConeGeometry(0.075, isCore ? 0.42 : 0.34, 4)
      : new THREE.BoxGeometry(theme === 'iron' ? 0.11 : 0.075, isCore ? 0.38 : 0.3, theme === 'iron' ? 0.075 : 0.06)
    const fin = new THREE.Mesh(finGeometry, trimMaterial.clone())
    const radius = isCore ? 0.35 : 0.28
    fin.position.set(Math.cos(angle) * radius, isCore ? 0.55 : 0.48, Math.sin(angle) * radius)
    fin.rotation.y = -angle
    if (theme === 'dragon') fin.rotation.z = -0.18
    fin.castShadow = true
    fin.userData.objectivePart = 'fin'
    fin.userData.angle = angle
    group.add(fin)
  }

  const addVariantMesh = (geometry, material, position, objectivePart, rotation = null) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position)
    if (rotation) mesh.rotation.set(...rotation)
    mesh.castShadow = material !== glowMaterial
    mesh.userData.objectivePart = objectivePart
    mesh.userData.baseY = mesh.position.y
    mesh.userData.baseRotation = { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z }
    group.add(mesh)
    return mesh
  }

  // Each lieutenant trial has a readable silhouette on the map. These are kept
  // emissive/material-only so the extra detail does not add per-device lights.
  if (visualKind === 'tide_pressure') {
    ;[-0.18, 0.18].forEach((x, index) => {
      const piston = addVariantMesh(new THREE.CylinderGeometry(0.075, 0.085, 0.36, 10), trimMaterial.clone(), [x, 0.68, 0], 'variant-piston')
      piston.userData.index = index
      addVariantMesh(new THREE.SphereGeometry(0.09, 12, 8), glowMaterial.clone(), [x, 0.89, 0], 'variant-glow')
    })
    addVariantMesh(new THREE.BoxGeometry(0.5, 0.055, 0.08), trimMaterial.clone(), [0, 0.52, 0], 'variant-frame')
  } else if (visualKind === 'tide_gauge') {
    addVariantMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.055, 18), trimMaterial.clone(), [0, 0.7, 0.03], 'variant-frame', [Math.PI / 2, 0, 0])
    const needle = addVariantMesh(new THREE.BoxGeometry(0.025, 0.17, 0.025), glowMaterial.clone(), [0, 0.71, -0.01], 'variant-needle')
    needle.geometry.translate(0, 0.075, 0)
  } else if (visualKind === 'tide_anchor') {
    ;[0, 1, 2].forEach((index) => {
      const ring = addVariantMesh(new THREE.TorusGeometry(0.18 + index * 0.045, 0.018, 6, 24), index === 1 ? glowMaterial.clone() : trimMaterial.clone(), [0, 0.68, 0], 'variant-rotor', [index === 0 ? Math.PI / 2 : Math.PI / 3, index * 0.72, index * 0.42])
      ring.userData.index = index
    })
  } else if (visualKind === 'iron_forge') {
    addVariantMesh(new THREE.CylinderGeometry(0.21, 0.26, 0.19, 8), baseMaterial.clone(), [0, 0.54, 0], 'variant-frame')
    addVariantMesh(new THREE.OctahedronGeometry(0.12, 0), glowMaterial.clone(), [0, 0.66, 0], 'variant-glow')
    const hammer = addVariantMesh(new THREE.BoxGeometry(0.28, 0.1, 0.12), trimMaterial.clone(), [0.13, 0.91, 0], 'variant-hammer', [0, 0, -0.52])
    hammer.geometry.translate(-0.1, 0, 0)
  } else if (visualKind === 'iron_relay') {
    ;[-0.15, 0.15].forEach((x) => addVariantMesh(new THREE.BoxGeometry(0.08, 0.39, 0.08), trimMaterial.clone(), [x, 0.68, 0], 'variant-frame'))
    const arc = addVariantMesh(new THREE.TorusGeometry(0.15, 0.018, 6, 18, Math.PI), glowMaterial.clone(), [0, 0.83, 0], 'variant-arc', [0, 0, 0])
    arc.userData.baseOpacity = arc.material.opacity
  } else if (visualKind === 'iron_armor') {
    ;[-0.15, 0, 0.15].forEach((x, index) => {
      const plate = addVariantMesh(new THREE.BoxGeometry(0.16, 0.34 + index * 0.04, 0.07), index === 1 ? glowMaterial.clone() : trimMaterial.clone(), [x, 0.68, index === 1 ? 0.02 : 0], 'variant-plate')
      plate.rotation.z = (index - 1) * -0.11
      plate.userData.index = index
    })
  } else if (visualKind === 'dragon_fang') {
    ;[-0.16, 0, 0.16].forEach((x, index) => {
      const fang = addVariantMesh(new THREE.ConeGeometry(0.08, 0.42, 5), index === 1 ? glowMaterial.clone() : trimMaterial.clone(), [x, 0.72 + (index === 1 ? 0.09 : 0), 0], 'variant-fang')
      fang.userData.index = index
    })
  } else if (visualKind === 'dragon_beacon') {
    addVariantMesh(new THREE.OctahedronGeometry(0.2, 0), glowMaterial.clone(), [0, 0.74, 0], 'variant-star')
    ;[0, 1].forEach((index) => {
      const orbit = addVariantMesh(new THREE.TorusGeometry(0.25 + index * 0.06, 0.014, 5, 24), trimMaterial.clone(), [0, 0.74, 0], 'variant-rotor', [Math.PI / 2 - index * 0.55, index * 0.35, 0])
      orbit.userData.index = index
    })
  } else if (visualKind === 'dragon_seal') {
    addVariantMesh(new THREE.TorusGeometry(0.23, 0.045, 5, 6), trimMaterial.clone(), [0, 0.73, 0], 'variant-rune-ring', [Math.PI / 2, 0, 0])
    ;[0, 1, 2, 3].forEach((index) => {
      const angle = index * Math.PI / 2
      const rune = addVariantMesh(new THREE.TetrahedronGeometry(0.07, 0), glowMaterial.clone(), [Math.cos(angle) * 0.23, 0.74, Math.sin(angle) * 0.23], 'variant-rune')
      rune.userData.index = index
    })
  }

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(isCore ? 0.3 : 0.23, 0.018, 8, 40),
    createSpringGlowMaterial(spec.glow, 0.5)
  )
  halo.rotation.x = Math.PI / 2
  halo.position.y = isCore ? 0.73 : 0.61
  halo.userData.objectivePart = 'halo'
  halo.userData.baseOpacity = 0.5
  group.add(halo)

  const light = new THREE.PointLight(spec.accent, isCore ? 0.56 : 0.38, isCore ? 3.2 : 2.5)
  light.position.y = isCore ? 0.82 : 0.7
  light.userData.objectivePart = 'light'
  light.userData.baseIntensity = light.intensity
  // A point light on every multi-step objective forces all nearby map materials
  // through additional lighting passes. Keep one on the final altar/core only;
  // regular steps retain their emissive core, halo and activation burst.
  if (isCore) group.add(light)

  if (isCore) group.scale.setScalar(1.08)
  return group
}

function applyObjectiveDeviceVisualState(device, visualState = 'available') {
  if (!device) return
  const spec = device.userData.spec || OBJECTIVE_DEVICE_THEMES.tide
  const completed = visualState === 'completed' || visualState === 'cleared'
  const locked = visualState === 'locked'
  const previousState = device.userData.visualState
  if (completed && previousState !== 'completed' && previousState !== 'cleared') {
    device.userData.activatedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  }
  device.userData.visualState = visualState
  device.children.forEach((part) => {
    if (part.userData.objectivePart === 'core') {
      part.material.color.setHex(completed ? spec.complete : locked ? 0x64748b : spec.accent)
      part.material.opacity = completed ? 0.92 : locked ? 0.22 : 0.72
    } else if (part.userData.objectivePart === 'halo') {
      part.material.color.setHex(completed ? spec.complete : locked ? 0x64748b : spec.glow)
      part.material.opacity = completed ? 0.62 : locked ? 0.12 : 0.5
    } else if (part.userData.objectivePart === 'light') {
      part.color.setHex(completed ? spec.complete : spec.accent)
      part.intensity = locked ? 0.04 : completed ? part.userData.baseIntensity * 1.2 : part.userData.baseIntensity
    } else if (part.material?.emissive) {
      part.material.emissive.setHex(completed ? spec.complete : 0x000000)
      part.material.emissiveIntensity = completed ? 0.13 : 0
    }
  })
}

function updateObjectiveDevices(devices, now) {
  if (!Array.isArray(devices) || devices.length === 0) return
  const time = now * 0.001
  devices.forEach((device, deviceIndex) => {
    if (!device?.visible) return
    const visualState = device.userData.visualState || 'available'
    const locked = visualState === 'locked'
    const completed = visualState === 'completed' || visualState === 'cleared'
    const phase = device.userData.phase || 0
    const wave = (Math.sin(time * (completed ? 1.05 : 1.8) + phase + deviceIndex * 0.17) + 1) / 2
    const activationElapsed = device.userData.activatedAt ? now - device.userData.activatedAt : Number.POSITIVE_INFINITY
    const activationProgress = clamp(activationElapsed / 1300, 0, 1)
    const activationBurst = activationProgress < 1 ? Math.sin(activationProgress * Math.PI) : 0
    if (activationProgress >= 1) device.userData.activatedAt = 0
    device.children.forEach((part) => {
      if (part.userData.objectivePart === 'core') {
        part.position.y = part.userData.baseY + Math.sin(time * 1.5 + phase) * (locked ? 0.008 : 0.035)
        part.rotation.y = time * (locked ? 0.08 : completed ? 0.34 : 0.72) + phase
        const scale = 1 + wave * (locked ? 0.015 : 0.08) + activationBurst * 0.34
        part.scale.setScalar(scale)
      } else if (part.userData.objectivePart === 'halo') {
        part.rotation.z = time * (locked ? 0.05 : completed ? 0.16 : 0.42) + phase
        part.material.opacity = (part.userData.baseOpacity || 0.5) * (locked ? 0.24 : 0.72 + wave * 0.28)
        const haloScale = 1 + activationBurst * 1.65
        part.scale.setScalar(haloScale)
      } else if (part.userData.objectivePart === 'trim') {
        part.rotation.z = time * (locked ? 0.02 : 0.08) + phase
      } else if (part.userData.objectivePart === 'light' && !locked) {
        part.intensity = (part.userData.baseIntensity || 0.4) * (completed ? 0.95 : 0.7 + wave * 0.38) + activationBurst * 0.72
      } else if (part.userData.objectivePart === 'variant-piston') {
        part.position.y = part.userData.baseY + Math.sin(time * 2.4 + phase + (part.userData.index || 0) * Math.PI) * (locked ? 0.01 : 0.08)
      } else if (part.userData.objectivePart === 'variant-needle') {
        part.rotation.z = -0.8 + wave * (locked ? 0.12 : 1.6)
      } else if (part.userData.objectivePart === 'variant-rotor') {
        const base = part.userData.baseRotation || { x: 0, y: 0, z: 0 }
        part.rotation.y = base.y + time * (locked ? 0.04 : 0.32 + (part.userData.index || 0) * 0.12)
        part.rotation.z = base.z + time * (locked ? 0.02 : 0.15) * ((part.userData.index || 0) % 2 ? -1 : 1)
      } else if (part.userData.objectivePart === 'variant-hammer') {
        part.rotation.z = -0.52 + (locked ? 0 : Math.max(0, Math.sin(time * 2.1 + phase)) * 0.36)
      } else if (part.userData.objectivePart === 'variant-arc') {
        part.material.opacity = locked ? 0.08 : 0.28 + wave * 0.6
        part.visible = !locked && (completed || wave > 0.22)
      } else if (part.userData.objectivePart === 'variant-plate') {
        const lift = completed ? (part.userData.index || 0) * 0.025 : 0
        part.position.y = part.userData.baseY + lift + activationBurst * 0.12
      } else if (part.userData.objectivePart === 'variant-fang') {
        part.position.y = part.userData.baseY + Math.sin(time * 1.7 + phase + (part.userData.index || 0)) * (locked ? 0.004 : 0.025)
      } else if (part.userData.objectivePart === 'variant-star') {
        part.rotation.y = time * (locked ? 0.08 : 0.58)
        part.rotation.x = time * (locked ? 0.03 : 0.22)
      } else if (part.userData.objectivePart === 'variant-rune-ring') {
        part.rotation.z = time * (locked ? 0.04 : 0.24) + phase
      } else if (part.userData.objectivePart === 'variant-rune') {
        const angle = (part.userData.index || 0) * Math.PI / 2 + time * (locked ? 0.03 : 0.22)
        part.position.x = Math.cos(angle) * 0.23
        part.position.z = Math.sin(angle) * 0.23
      }
    })
  })
}

function createHealingSpringEffect(seed = 0) {
  const group = new THREE.Group()
  group.userData.kind = 'healing-spring-effect'
  group.userData.phase = seed * 0.73

  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(CELL * 0.42, 40),
    createSpringGlowMaterial(0x67e8f9, 0.34)
  )
  pool.rotation.x = -Math.PI / 2
  pool.position.y = 0.075
  pool.userData.springPart = 'pool'
  pool.userData.baseOpacity = 0.34
  group.add(pool)

  ;[0, 1].forEach((index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(CELL * (0.36 + index * 0.16), 0.014, 8, 48),
      createSpringGlowMaterial(index === 0 ? 0x7dd3fc : 0xcffafe, index === 0 ? 0.52 : 0.36)
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.12 + index * 0.05
    ring.userData.springPart = 'ring'
    ring.userData.index = index
    ring.userData.baseOpacity = index === 0 ? 0.52 : 0.36
    group.add(ring)
  })

  for (let i = 0; i < 8; i += 1) {
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(0.035 + (i % 3) * 0.006, 10, 8),
      createSpringGlowMaterial(i % 2 === 0 ? 0xe0f2fe : 0x99f6e4, 0.58)
    )
    mote.userData.springPart = 'mote'
    mote.userData.angle = (Math.PI * 2 * i) / 8
    mote.userData.radius = CELL * (0.2 + (i % 4) * 0.055)
    mote.userData.speed = 0.38 + (i % 5) * 0.06
    mote.userData.lift = (i % 3) * 0.08
    mote.userData.baseOpacity = 0.58
    group.add(mote)
  }

  const light = new THREE.PointLight(0x7dd3fc, 0.76, 4.2)
  light.position.y = 0.92
  light.userData.springPart = 'light'
  group.add(light)

  return group
}

function updateHealingSpringEffects(effects, now) {
  if (!Array.isArray(effects) || effects.length === 0) return
  const time = now * 0.001
  effects.forEach((effect, effectIndex) => {
    const phase = effect.userData.phase || 0
    effect.children.forEach((part) => {
      const wave = (Math.sin(time * 2.2 + phase + effectIndex * 0.31 + (part.userData.index || 0)) + 1) / 2
      if (part.userData.springPart === 'pool') {
        const scale = 0.94 + wave * 0.08
        part.scale.set(scale, scale, scale)
        part.material.opacity = (part.userData.baseOpacity || 0.3) * (0.72 + wave * 0.28)
      } else if (part.userData.springPart === 'ring') {
        const index = part.userData.index || 0
        const scale = 0.9 + wave * 0.18 + index * 0.04
        part.scale.set(scale, scale, scale)
        part.rotation.z = time * (0.42 + index * 0.18) + phase
        part.material.opacity = (part.userData.baseOpacity || 0.4) * (0.58 + wave * 0.42)
      } else if (part.userData.springPart === 'mote') {
        const angle = part.userData.angle + time * part.userData.speed + phase
        const radius = part.userData.radius
        part.position.x = Math.cos(angle) * radius
        part.position.z = Math.sin(angle) * radius * 0.82
        part.position.y = 0.26 + part.userData.lift + Math.sin(time * 2.7 + part.userData.angle) * 0.11
        part.material.opacity = (part.userData.baseOpacity || 0.5) * (0.46 + wave * 0.48)
      } else if (part.userData.springPart === 'light') {
        part.intensity = 0.62 + wave * 0.42
      }
    })
  })
}

function createRestoreBurstEffect() {
  const group = new THREE.Group()
  group.visible = false
  group.userData.kind = 'restore-burst-effect'

  for (let i = 0; i < 3; i += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.34 + i * 0.08, 0.018, 8, 56),
      createSpringGlowMaterial(i === 0 ? 0xfef9c3 : 0x7dd3fc, i === 0 ? 0.72 : 0.55)
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.12 + i * 0.12
    ring.userData.restorePart = 'ring'
    ring.userData.index = i
    ring.userData.baseOpacity = i === 0 ? 0.72 : 0.55
    group.add(ring)
  }

  for (let i = 0; i < 6; i += 1) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.038, 1.15, 8, 1, true),
      createSpringGlowMaterial(i % 2 === 0 ? 0xbfdbfe : 0xfef3c7, 0.38)
    )
    const angle = (Math.PI * 2 * i) / 6
    beam.position.set(Math.cos(angle) * 0.42, 0.68, Math.sin(angle) * 0.34)
    beam.userData.restorePart = 'beam'
    beam.userData.angle = angle
    beam.userData.baseOpacity = 0.38
    group.add(beam)
  }

  for (let i = 0; i < 10; i += 1) {
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(0.035 + (i % 2) * 0.008, 10, 8),
      createSpringGlowMaterial(i % 3 === 0 ? 0xfef08a : 0xbae6fd, 0.66)
    )
    mote.userData.restorePart = 'mote'
    mote.userData.angle = (Math.PI * 2 * i) / 10
    mote.userData.radius = 0.26 + (i % 4) * 0.08
    mote.userData.speed = 0.7 + (i % 5) * 0.08
    mote.userData.baseOpacity = 0.66
    group.add(mote)
  }

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 18, 12),
    createSpringGlowMaterial(0xe0f2fe, 0.5)
  )
  core.position.y = 0.86
  core.userData.restorePart = 'core'
  core.userData.baseOpacity = 0.5
  group.add(core)

  const light = new THREE.PointLight(0xfef08a, 0, 4.8)
  light.position.y = 1.05
  light.userData.restorePart = 'light'
  group.add(light)

  return group
}

function updateRestoreBurstEffect(group, animation, player, now) {
  if (!group || !player) return
  if (animation?.id && group.userData.activeId !== animation.id && group.userData.lastCompletedId !== animation.id) {
    group.userData.activeId = animation.id
    group.userData.startedAt = now
    group.userData.duration = 2200
    group.visible = true
  }

  if (!group.userData.activeId) {
    group.visible = false
    return
  }

  const duration = group.userData.duration || 2200
  const age = now - (group.userData.startedAt || now)
  const t = clamp(age / duration, 0, 1)
  if (t >= 1) {
    group.userData.lastCompletedId = group.userData.activeId
    group.userData.activeId = null
    group.visible = false
    player.scale.setScalar(1)
    return
  }

  const fade = 1 - t
  const easeOut = 1 - Math.pow(1 - t, 3)
  const pulse = Math.sin(t * Math.PI)
  group.visible = true
  group.position.set(player.position.x, PLAYER_BASE_Y + 0.02, player.position.z)
  player.scale.setScalar(1 + pulse * 0.045)

  group.children.forEach((part) => {
    if (part.userData.restorePart === 'ring') {
      const index = part.userData.index || 0
      const scale = 0.55 + easeOut * (1.35 + index * 0.42)
      part.scale.set(scale, scale, scale)
      part.rotation.z = now * 0.0012 * (1 + index * 0.24)
      part.material.opacity = (part.userData.baseOpacity || 0.5) * fade * (0.7 + pulse * 0.3)
    } else if (part.userData.restorePart === 'beam') {
      const angle = part.userData.angle + now * 0.0014
      const radius = 0.34 + pulse * 0.15
      part.position.x = Math.cos(angle) * radius
      part.position.z = Math.sin(angle) * radius * 0.82
      part.position.y = 0.42 + easeOut * 0.64
      part.rotation.y = angle
      part.scale.y = 0.7 + pulse * 0.45
      part.material.opacity = (part.userData.baseOpacity || 0.35) * fade
    } else if (part.userData.restorePart === 'mote') {
      const angle = part.userData.angle + now * 0.001 * part.userData.speed
      const radius = part.userData.radius + easeOut * 0.42
      part.position.x = Math.cos(angle) * radius
      part.position.z = Math.sin(angle) * radius * 0.84
      part.position.y = 0.22 + easeOut * (0.72 + (part.userData.radius || 0.2))
      part.material.opacity = (part.userData.baseOpacity || 0.6) * fade
    } else if (part.userData.restorePart === 'core') {
      const scale = 0.7 + pulse * 0.9
      part.scale.set(scale, scale, scale)
      part.material.opacity = (part.userData.baseOpacity || 0.5) * fade
    } else if (part.userData.restorePart === 'light') {
      part.intensity = 0.7 + pulse * 2.2
    }
  })
}

function createEncounterAlertSprite() {
  if (typeof document === 'undefined') {
    const fallback = new THREE.Mesh(
      createSignalCoreGeometry('octa', 0.14),
      createSignalCoreMaterial(0xffffff, 0.88, { depthTest: false })
    )
    fallback.userData.encounterPart = 'sprite'
    fallback.renderOrder = 72
    return fallback
  }

  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, size, size)
    ctx.shadowColor = 'rgba(15, 23, 42, 0.35)'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, 46, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 247, 167, 0.96)'
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = 7
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.98)'
    ctx.stroke()
    ctx.font = '900 76px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#7c2d12'
    ctx.fillText('!', size / 2, size / 2 + 4)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  }))
  sprite.userData.encounterPart = 'sprite'
  sprite.userData.texture = texture
  sprite.renderOrder = 72
  sprite.scale.set(0.54, 0.54, 0.54)
  return sprite
}

function createEncounterAlertEffect() {
  const group = new THREE.Group()
  group.visible = false
  group.userData.kind = 'encounter-alert-effect'
  group.userData.active = false
  group.userData.startedAt = 0
  group.userData.duration = ENCOUNTER_ALERT_MS
  group.userData.onComplete = null

  const groundRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.018, 8, 60),
    createSpringGlowMaterial(0xfef08a, 0.66, { depthTest: false })
  )
  groundRing.rotation.x = Math.PI / 2
  groundRing.position.y = 0.13
  groundRing.userData.encounterPart = 'ground-ring'
  groundRing.userData.baseOpacity = 0.66
  groundRing.renderOrder = 68
  group.add(groundRing)

  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 18, 12),
    createSpringGlowMaterial(0xffffff, 0.62, { depthTest: false })
  )
  flash.position.y = 0.86
  flash.userData.encounterPart = 'flash'
  flash.userData.baseOpacity = 0.62
  flash.renderOrder = 69
  group.add(flash)

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.012, 8, 44),
    createSpringGlowMaterial(0xfb923c, 0.78, { depthTest: false })
  )
  halo.position.y = 1.42
  halo.rotation.x = Math.PI / 2
  halo.userData.encounterPart = 'halo'
  halo.userData.baseOpacity = 0.78
  halo.renderOrder = 70
  group.add(halo)

  const sprite = createEncounterAlertSprite()
  sprite.position.y = 1.62
  group.add(sprite)

  for (let i = 0; i < 8; i += 1) {
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(0.028 + (i % 2) * 0.006, 10, 8),
      createSpringGlowMaterial(i % 2 === 0 ? 0xfef3c7 : 0xf97316, 0.64, { depthTest: false })
    )
    mote.userData.encounterPart = 'mote'
    mote.userData.angle = (Math.PI * 2 * i) / 8
    mote.userData.radius = 0.18 + (i % 4) * 0.035
    mote.userData.speed = 1.05 + (i % 3) * 0.18
    mote.userData.baseOpacity = 0.64
    mote.renderOrder = 71
    group.add(mote)
  }

  const light = new THREE.PointLight(0xfbbf24, 0, 4.2)
  light.position.y = 1.05
  light.userData.encounterPart = 'light'
  group.add(light)

  return group
}

function updateEncounterAlertEffect(effect, player, now) {
  if (!effect || !player) return
  if (!effect.userData.active) {
    effect.visible = false
    return
  }

  const duration = effect.userData.duration || ENCOUNTER_ALERT_MS
  const age = now - (effect.userData.startedAt || now)
  const t = clamp(age / duration, 0, 1)
  if (t >= 1) {
    const onComplete = effect.userData.onComplete
    effect.userData.active = false
    effect.userData.startedAt = 0
    effect.userData.onComplete = null
    effect.visible = false
    player.scale.setScalar(1)
    if (typeof onComplete === 'function') onComplete()
    return
  }

  const easeOut = 1 - Math.pow(1 - t, 3)
  const fade = Math.max(0, 1 - t)
  const pulse = Math.sin(t * Math.PI)
  effect.visible = true
  effect.position.set(player.position.x, PLAYER_BASE_Y + 0.02, player.position.z)
  player.scale.setScalar(1 + pulse * 0.035)

  effect.children.forEach((part) => {
    const kind = part.userData.encounterPart
    if (kind === 'ground-ring') {
      const scale = 0.72 + easeOut * 1.9
      part.scale.set(scale, scale, scale)
      part.rotation.z = now * 0.002
      part.material.opacity = (part.userData.baseOpacity || 0.6) * fade
    } else if (kind === 'flash') {
      const scale = 0.36 + pulse * 1.75
      part.scale.set(scale, scale, scale)
      part.material.opacity = (part.userData.baseOpacity || 0.55) * fade * (0.5 + pulse * 0.5)
    } else if (kind === 'halo') {
      const scale = 0.72 + pulse * 0.38 + easeOut * 0.34
      part.scale.set(scale, scale, scale)
      part.rotation.z = now * 0.004
      part.material.opacity = (part.userData.baseOpacity || 0.7) * fade
    } else if (kind === 'sprite') {
      const scale = 0.46 + pulse * 0.18
      part.position.y = 1.5 + Math.sin(t * Math.PI * 2) * 0.07
      part.scale.set(scale, scale, scale)
      if (part.material) part.material.opacity = Math.min(1, fade * 1.35)
      part.rotation.z = Math.sin(t * Math.PI * 2) * 0.08
    } else if (kind === 'mote') {
      const angle = part.userData.angle + now * 0.001 * part.userData.speed
      const radius = (part.userData.radius || 0.2) + easeOut * 0.42
      part.position.x = Math.cos(angle) * radius
      part.position.z = Math.sin(angle) * radius * 0.82
      part.position.y = 0.62 + easeOut * 0.72 + Math.sin(now * 0.006 + part.userData.angle) * 0.05
      part.material.opacity = (part.userData.baseOpacity || 0.6) * fade
    } else if (kind === 'light') {
      part.intensity = 0.45 + pulse * 1.8
    }
  })
}

function createPickupCollectBurstEffect(seed = 0) {
  const group = new THREE.Group()
  group.userData.kind = 'pickup-burst'
  group.userData.phase = seed * 0.53
  group.userData.startedAt = 0
  group.userData.duration = 460
  group.userData.baseY = 0.22
  group.userData.active = false
  group.visible = false

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.014, 8, 36),
    createSpringGlowMaterial(0xfef08a, 0.52)
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.12
  ring.userData.pickupPart = 'ring'
  ring.userData.baseOpacity = 0.52
  group.add(ring)

  const core = new THREE.Mesh(
    createSignalCoreGeometry('icosa', 0.072),
    createSpringGlowMaterial(0xffffff, 0.76)
  )
  core.position.y = 0.34
  core.userData.pickupPart = 'core'
  core.userData.baseOpacity = 0.76
  group.add(core)

  return group
}

function updatePickupCollectBursts(bursts, now) {
  if (!Array.isArray(bursts) || bursts.length === 0) return

  for (let index = bursts.length - 1; index >= 0; index -= 1) {
    const burst = bursts[index]
    if (!burst) {
      bursts.splice(index, 1)
      continue
    }

    const duration = burst.userData.duration || 460
    const age = now - (burst.userData.startedAt || now)
    const t = clamp(age / duration, 0, 1)
    if (t >= 1) {
      burst.visible = false
      burst.userData.active = false
      burst.userData.startedAt = 0
      bursts.splice(index, 1)
      continue
    }

    const fade = 1 - t
    const easeOut = 1 - Math.pow(1 - t, 3)
    const pulse = Math.sin(t * Math.PI)
    burst.position.y = (burst.userData.baseY || 0.22) + easeOut * 0.22

    burst.children.forEach((part) => {
      if (part.userData.pickupPart === 'ring') {
        const scale = 0.64 + easeOut * 1.28
        part.scale.set(scale, scale, scale)
        part.rotation.z = burst.userData.phase + now * 0.0015
        part.material.opacity = (part.userData.baseOpacity || 0.52) * fade
      } else if (part.userData.pickupPart === 'core') {
        const scale = 0.76 + pulse * 1.06
        part.scale.set(scale, scale, scale)
        part.rotation.y = burst.userData.phase + now * 0.0022
        part.rotation.x = easeOut * 0.55
        part.material.opacity = (part.userData.baseOpacity || 0.76) * fade
      }
    })
  }
}

function normalizeNpcRole(role) {
  if (role === 'boss') return 'boss'
  if (role === 'lieutenant') return 'lieutenant'
  if (role === 'merchant') return 'merchant'
  return role === 'normal' ? 'normal' : null
}

const NPC_ROLE_EFFECT_STYLES = {
  normal: {
    baseColor: 0x0f766e,
    accentColor: 0x5eead4,
    radius: CELL * 0.2,
    baseOpacity: 0.045,
    ringOpacity: 0.18,
    ringTube: 0.008,
    lightIntensity: 0,
    pulseScale: 0.018,
    spinSpeed: 0.06
  },
  lieutenant: {
    baseColor: 0x2563eb,
    accentColor: 0xfde68a,
    radius: CELL * 0.25,
    baseOpacity: 0.06,
    ringOpacity: 0.26,
    ringTube: 0.01,
    lightIntensity: 0.08,
    pulseScale: 0.032,
    spinSpeed: 0.11
  },
  merchant: {
    baseColor: 0xd97706,
    accentColor: 0x14b8a6,
    radius: CELL * 0.22,
    baseOpacity: 0.055,
    ringOpacity: 0.24,
    ringTube: 0.009,
    lightIntensity: 0.04,
    pulseScale: 0.026,
    spinSpeed: 0.09
  },
  boss: {
    baseColor: 0xdc2626,
    accentColor: 0xfbbf24,
    radius: CELL * 0.3,
    baseOpacity: 0.075,
    ringOpacity: 0.32,
    ringTube: 0.012,
    lightIntensity: 0.12,
    pulseScale: 0.04,
    spinSpeed: 0.16
  }
}

const ELITE_NPC_THEME_EFFECT_STYLES = {
  frost: { baseColor: 0x67e8f9, accentColor: 0xffffff, spinSpeed: 0.12 },
  tide: { baseColor: 0x14b8a6, accentColor: 0x99f6e4, spinSpeed: 0.15 },
  iron: { baseColor: 0x64748b, accentColor: 0xfbbf24, spinSpeed: 0.08 },
  dragon: { baseColor: 0x8b5cf6, accentColor: 0xf0abfc, spinSpeed: 0.19 }
}

function createNpcRoleEffect(role, seed = 0, options = {}) {
  const normalizedRole = normalizeNpcRole(role)
  if (!normalizedRole) return null

  const group = new THREE.Group()
  group.userData.kind = 'npc-role-effect'
  group.userData.role = normalizedRole
  group.userData.phase = seed * 0.47
  const eliteTheme = typeof options.visualTheme === 'string'
    ? ELITE_NPC_THEME_EFFECT_STYLES[options.visualTheme]
    : null
  group.userData.spec = eliteTheme
    ? { ...NPC_ROLE_EFFECT_STYLES[normalizedRole], ...eliteTheme }
    : NPC_ROLE_EFFECT_STYLES[normalizedRole]
  group.userData.eventId = typeof options.eventId === 'string' ? options.eventId : null
  group.userData.visualState = options.visualState || 'available'
  group.userData.muted = Boolean(options.muted)

  const roleConfig = group.userData.spec
  const mutedOpacityMultiplier = group.userData.muted ? 0.28 : 1
  const lightIntensity = group.userData.muted ? 0 : roleConfig.lightIntensity

  const base = new THREE.Mesh(
    new THREE.CircleGeometry(roleConfig.radius, 30),
    createSpringGlowMaterial(roleConfig.baseColor, roleConfig.baseOpacity * mutedOpacityMultiplier)
  )
  base.rotation.x = -Math.PI / 2
  base.position.y = 0.082
  base.userData.rolePart = 'base'
  base.userData.baseOpacity = roleConfig.baseOpacity * mutedOpacityMultiplier
  group.add(base)

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(roleConfig.radius * 0.94, roleConfig.ringTube, 8, 36),
    createSpringGlowMaterial(roleConfig.accentColor, roleConfig.ringOpacity * mutedOpacityMultiplier)
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.118
  ring.userData.rolePart = 'ring'
  ring.userData.baseOpacity = roleConfig.ringOpacity * mutedOpacityMultiplier
  group.add(ring)

  if (lightIntensity > 0) {
    const light = new THREE.PointLight(roleConfig.baseColor, lightIntensity, normalizedRole === 'boss' ? 1.9 : 1.45)
    light.position.y = 0.36
    light.userData.rolePart = 'light'
    light.userData.baseIntensity = lightIntensity
    group.add(light)
  }

  return group
}

function applyEventSignalVisualState(signal, visualState = 'available') {
  if (!signal) return
  signal.userData.visualState = visualState
  signal.userData.muted = isMutedEventVisualState(visualState)
}

function applyNpcRoleEffectVisualState(effect, visualState = 'available') {
  if (!effect) return
  effect.userData.visualState = visualState
  effect.userData.muted = isMutedEventVisualState(visualState)
}

function updateNpcRoleEffects(effects, now) {
  if (!Array.isArray(effects) || effects.length === 0) return
  const time = now * 0.001
  effects.forEach((effect, effectIndex) => {
    const role = effect.userData.role
    const roleConfig = effect.userData.spec || NPC_ROLE_EFFECT_STYLES[role] || NPC_ROLE_EFFECT_STYLES.normal
    const muted = Boolean(effect.userData.muted)
    const phase = effect.userData.phase || 0
    const wave = (Math.sin(time * 1.15 + phase + effectIndex * 0.23) + 1) / 2
    const pulseScaleMultiplier = muted ? 0.22 : 1
    const opacityMultiplier = muted ? 0.72 : 1
    const spinSpeedMultiplier = muted ? 0.14 : 1
    effect.children.forEach((part) => {
      const baseOpacity = part.userData.baseOpacity || 0.3
      if (part.userData.rolePart === 'base') {
        const scale = 1 + wave * roleConfig.pulseScale * 0.7 * pulseScaleMultiplier
        part.scale.set(scale, scale, scale)
        part.material.opacity = baseOpacity * opacityMultiplier * (0.72 + wave * 0.2)
      } else if (part.userData.rolePart === 'ring') {
        part.rotation.z = time * roleConfig.spinSpeed * spinSpeedMultiplier + phase
        const scale = 1 + wave * roleConfig.pulseScale * pulseScaleMultiplier
        part.scale.set(scale, scale, scale)
        part.material.opacity = baseOpacity * opacityMultiplier * (0.66 + wave * 0.22)
      } else if (part.userData.rolePart === 'light') {
        part.intensity = (part.userData.baseIntensity || 0.2) * (0.72 + wave * 0.28)
      }
    })
  })
}

const ELITE_FOUR_LANDMARK_TYPES = new Set([
  'elite_frost_portal',
  'elite_tide_portal',
  'elite_iron_portal',
  'elite_dragon_portal',
  'elite_champion_portal',
  'elite_frost_crystal',
  'elite_frost_mirror',
  'elite_tide_pillar',
  'elite_tide_gate',
  'elite_iron_bastion',
  'elite_iron_beacon',
  'elite_iron_gate',
  'elite_dragon_spire',
  'elite_dragon_arch',
  'elite_dragon_gate',
  'champion_tower',
  'champion_obelisk',
  'champion_gate'
])

const eliteFourLandmarkTemplateCache = new Map()

function createEliteFourLandmarkTemplate(type) {
  if (!ELITE_FOUR_LANDMARK_TYPES.has(type)) return null

  const group = new THREE.Group()
  const add = (geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position)
    mesh.rotation.set(...rotation)
    mesh.scale.set(...scale)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  const material = (color, options = {}) => new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.48,
    metalness: options.metalness ?? 0.08,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
    side: options.side ?? THREE.FrontSide
  })

  if (type.endsWith('_portal')) {
    const portalStyles = {
      elite_frost_portal: { frame: 0xb9f5ff, glow: 0x55d9ef, dark: 0x397f92, shape: 'crystal' },
      elite_tide_portal: { frame: 0x62e8dd, glow: 0x1eb9b4, dark: 0x17646d, shape: 'wave' },
      elite_iron_portal: { frame: 0xaab4ba, glow: 0xf3b83f, dark: 0x424c54, shape: 'iron' },
      elite_dragon_portal: { frame: 0xc28ae9, glow: 0x8b5cf6, dark: 0x4e2c62, shape: 'horn' },
      elite_champion_portal: { frame: 0xf4cf69, glow: 0x8d9cff, dark: 0x24263d, shape: 'crown' }
    }
    const portal = portalStyles[type]
    const frame = material(portal.frame, {
      roughness: portal.shape === 'iron' ? 0.28 : 0.34,
      metalness: portal.shape === 'iron' ? 0.72 : 0.28,
      emissive: portal.glow,
      emissiveIntensity: 0.18
    })
    const dark = material(portal.dark, {
      roughness: 0.5,
      metalness: portal.shape === 'iron' ? 0.62 : 0.16
    })
    const glow = material(portal.glow, {
      roughness: 0.12,
      emissive: portal.glow,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide
    })
    add(
      new THREE.CircleGeometry(1.72, portal.shape === 'iron' ? 4 : 32),
      glow,
      [0, 1.86, -0.02],
      [0, 0, portal.shape === 'iron' ? Math.PI / 4 : 0]
    )
    if (portal.shape === 'iron') {
      ;[-1.9, 1.9].forEach((x) => {
        add(new THREE.BoxGeometry(0.28, 2.3, 0.42), dark, [x, 1.15, 0])
        add(new THREE.BoxGeometry(0.42, 0.18, 0.56), frame, [x, 2.34, 0])
      })
      add(new THREE.BoxGeometry(4.1, 0.34, 0.48), frame, [0, 2.5, 0])
      add(new THREE.BoxGeometry(3.58, 0.08, 0.52), material(portal.glow, {
        emissive: portal.glow,
        emissiveIntensity: 0.42,
        metalness: 0.58
      }), [0, 2.28, 0])
    } else {
      add(new THREE.TorusGeometry(1.86, 0.13, 9, portal.shape === 'crystal' ? 12 : 30), frame, [0, 1.86, 0])
      ;[-1.88, 1.88].forEach((x) => {
        add(new THREE.CylinderGeometry(0.16, 0.24, 1.45, portal.shape === 'horn' ? 6 : 8), dark, [x, 0.74, 0])
      })
      if (portal.shape === 'crystal') {
        ;[-0.2, 0, 0.2].forEach((x, index) => {
          add(new THREE.OctahedronGeometry(index === 1 ? 0.22 : 0.15, 0), frame, [x, 3.82 + (index === 1 ? 0.12 : 0), 0], [0, index * 0.3, 0], [0.72, 1.5, 0.72])
        })
      } else if (portal.shape === 'wave') {
        ;[-1, 1].forEach((side) => {
          add(new THREE.ConeGeometry(0.22, 0.8, 7), frame, [side * 1.58, 3.12, 0], [0, 0, side * -0.85], [0.62, 1, 1])
        })
      } else if (portal.shape === 'crown') {
        add(new THREE.BoxGeometry(2.2, 0.12, 0.22), dark, [0, 3.28, 0])
        ;[-0.82, -0.42, 0, 0.42, 0.82].forEach((x, index) => {
          const center = index === 2
          add(
            new THREE.ConeGeometry(center ? 0.18 : 0.13, center ? 0.72 : 0.5, 5),
            frame,
            [x, center ? 3.68 : 3.56, 0]
          )
        })
        add(new THREE.OctahedronGeometry(0.17, 0), glow, [0, 3.32, 0.04], [0, Math.PI / 4, 0])
      } else {
        ;[-1, 1].forEach((side) => {
          add(new THREE.ConeGeometry(0.15, 0.9, 6), frame, [side * 1.2, 3.48, 0], [0, 0, side * -0.62])
        })
      }
    }
    const light = new THREE.PointLight(portal.glow, 0.65, 5.2)
    light.position.set(0, 1.9, 0.35)
    group.add(light)
  } else if (type === 'elite_frost_crystal') {
    const ice = material(0xa8edf7, { roughness: 0.2, emissive: 0x2aa9c2, emissiveIntensity: 0.16 })
    const iceLight = material(0xe9fdff, { roughness: 0.16, emissive: 0x73d9eb, emissiveIntensity: 0.18 })
    const base = material(0x6ba6b4, { roughness: 0.52 })
    add(new THREE.CylinderGeometry(0.44, 0.52, 0.18, 6), base, [0, 0.09, 0])
    add(new THREE.OctahedronGeometry(0.46, 0), ice, [0, 0.82, 0], [0, 0.28, 0], [0.72, 1.7, 0.72])
    add(new THREE.OctahedronGeometry(0.24, 0), iceLight, [0.38, 0.45, 0.08], [0, -0.22, 0.18], [0.7, 1.45, 0.7])
  } else if (type === 'elite_frost_mirror') {
    const frame = material(0xc9f5fb, { roughness: 0.18, metalness: 0.42, emissive: 0x4fc9df, emissiveIntensity: 0.14 })
    const glass = material(0x8adcec, { roughness: 0.06, metalness: 0.28, transparent: true, opacity: 0.54, depthWrite: false, side: THREE.DoubleSide })
    const base = material(0x618c99, { roughness: 0.5 })
    add(new THREE.CylinderGeometry(0.48, 0.58, 0.18, 8), base, [0, 0.09, 0])
    add(new THREE.TorusGeometry(0.44, 0.075, 10, 28), frame, [0, 0.72, 0])
    add(new THREE.CircleGeometry(0.38, 28), glass, [0, 0.72, -0.015])
  } else if (type === 'elite_tide_pillar') {
    const stone = material(0x176d73, { roughness: 0.36, metalness: 0.14 })
    const tide = material(0x5ee2dc, { roughness: 0.22, emissive: 0x0c8f95, emissiveIntensity: 0.2 })
    add(new THREE.CylinderGeometry(0.38, 0.48, 0.22, 8), stone, [0, 0.11, 0])
    add(new THREE.CylinderGeometry(0.22, 0.3, 1.5, 8), stone, [0, 0.92, 0])
    add(new THREE.TorusGeometry(0.3, 0.055, 8, 20), tide, [0, 0.58, 0], [Math.PI / 2, 0, 0])
    add(new THREE.TorusGeometry(0.27, 0.05, 8, 20), tide, [0, 1.22, 0], [Math.PI / 2, 0, 0])
    add(new THREE.ConeGeometry(0.32, 0.42, 8), tide, [0, 1.84, 0])
  } else if (type === 'elite_tide_gate') {
    const stone = material(0x1c7479, { roughness: 0.4, metalness: 0.12 })
    const tide = material(0x75eee4, { roughness: 0.2, emissive: 0x12939a, emissiveIntensity: 0.18 })
    add(new THREE.BoxGeometry(1.42, 0.18, 0.48), stone, [0, 0.09, 0])
    ;[-0.5, 0.5].forEach((x) => add(new THREE.CylinderGeometry(0.16, 0.21, 1.22, 8), stone, [x, 0.7, 0]))
    add(new THREE.BoxGeometry(1.28, 0.22, 0.28), tide, [0, 1.34, 0])
    add(new THREE.TorusGeometry(0.36, 0.05, 8, 24), tide, [0, 0.78, 0.02])
  } else if (type === 'elite_iron_bastion') {
    const steel = material(0x4c555d, { roughness: 0.34, metalness: 0.72 })
    const steelLight = material(0x89939a, { roughness: 0.3, metalness: 0.64 })
    const gold = material(0xe0ad3d, { roughness: 0.3, metalness: 0.7, emissive: 0x8a4f08, emissiveIntensity: 0.08 })
    add(new THREE.BoxGeometry(1.28, 0.34, 0.9), steel, [0, 0.17, 0])
    add(new THREE.BoxGeometry(1.08, 0.62, 0.76), steelLight, [0, 0.65, 0])
    ;[-0.42, 0, 0.42].forEach((x) => add(new THREE.BoxGeometry(0.24, 0.28, 0.82), steel, [x, 1.08, 0]))
    add(new THREE.BoxGeometry(1.12, 0.08, 0.84), gold, [0, 0.92, 0])
  } else if (type === 'elite_iron_beacon') {
    const steel = material(0x545e66, { roughness: 0.32, metalness: 0.72 })
    const gold = material(0xf0b83f, { roughness: 0.2, metalness: 0.62, emissive: 0xf59e0b, emissiveIntensity: 0.42 })
    add(new THREE.CylinderGeometry(0.38, 0.48, 0.2, 8), steel, [0, 0.1, 0])
    add(new THREE.CylinderGeometry(0.14, 0.24, 1.05, 8), steel, [0, 0.7, 0])
    add(new THREE.SphereGeometry(0.27, 12, 8), gold, [0, 1.34, 0])
    add(new THREE.TorusGeometry(0.34, 0.045, 8, 20), gold, [0, 1.34, 0], [Math.PI / 2, 0, 0])
  } else if (type === 'elite_iron_gate') {
    const steel = material(0x515b63, { roughness: 0.3, metalness: 0.74 })
    const steelLight = material(0x929ca3, { roughness: 0.28, metalness: 0.68 })
    const gold = material(0xe7b33d, { roughness: 0.24, metalness: 0.72, emissive: 0xa35d08, emissiveIntensity: 0.12 })
    ;[-2, 2].forEach((x) => {
      add(new THREE.BoxGeometry(0.3, 2.55, 0.36), steel, [x, 1.28, 0])
      add(new THREE.BoxGeometry(0.42, 0.18, 0.48), steelLight, [x, 2.62, 0])
    })
    add(new THREE.BoxGeometry(4.38, 0.3, 0.4), steelLight, [0, 2.78, 0])
    add(new THREE.BoxGeometry(3.74, 0.07, 0.43), gold, [0, 2.57, 0])
    add(new THREE.TorusGeometry(0.3, 0.05, 8, 20), gold, [0, 2.8, 0.02])
  } else if (type === 'elite_dragon_spire') {
    const stone = material(0x4e315f, { roughness: 0.42, metalness: 0.14 })
    const crystal = material(0xae6fe0, { roughness: 0.2, emissive: 0x7c3aed, emissiveIntensity: 0.26 })
    const gold = material(0xe3bd55, { roughness: 0.3, metalness: 0.58 })
    add(new THREE.CylinderGeometry(0.42, 0.54, 0.22, 6), stone, [0, 0.11, 0])
    add(new THREE.ConeGeometry(0.42, 1.7, 6), crystal, [0, 1.02, 0], [0, 0.28, 0])
    add(new THREE.TorusGeometry(0.38, 0.055, 8, 20), gold, [0, 0.55, 0], [Math.PI / 2, 0, 0])
  } else if (type === 'elite_dragon_arch') {
    const stone = material(0x5b386d, { roughness: 0.4, metalness: 0.12 })
    const crystal = material(0xb879e4, { roughness: 0.2, emissive: 0x7c3aed, emissiveIntensity: 0.22 })
    const gold = material(0xe6c15b, { roughness: 0.26, metalness: 0.62 })
    add(new THREE.BoxGeometry(1.5, 0.18, 0.5), stone, [0, 0.09, 0])
    ;[-0.54, 0.54].forEach((x) => add(new THREE.BoxGeometry(0.25, 1.28, 0.32), stone, [x, 0.73, 0]))
    add(new THREE.BoxGeometry(1.32, 0.25, 0.36), crystal, [0, 1.46, 0])
    add(new THREE.TorusGeometry(0.43, 0.055, 8, 24), gold, [0, 0.82, 0.02])
    ;[-0.46, 0.46].forEach((z) => add(new THREE.BoxGeometry(0.24, 1.12, 0.24), stone, [0, 0.65, z]))
    add(new THREE.BoxGeometry(0.36, 0.22, 1.22), crystal, [0, 1.35, 0])
    add(new THREE.TorusGeometry(0.35, 0.045, 8, 20), gold, [0.02, 0.78, 0], [0, Math.PI / 2, 0])
  } else if (type === 'elite_dragon_gate') {
    const stone = material(0x563268, { roughness: 0.4, metalness: 0.14 })
    const crystal = material(0xc084ed, { roughness: 0.2, emissive: 0x8b5cf6, emissiveIntensity: 0.26 })
    const gold = material(0xe8c75f, { roughness: 0.26, metalness: 0.62 })
    ;[-2, 2].forEach((x, xIndex) => {
      add(new THREE.BoxGeometry(0.3, 2.55, 0.38), stone, [x, 1.28, 0])
      add(new THREE.ConeGeometry(0.18, 0.72, 6), crystal, [x + (xIndex === 0 ? -0.08 : 0.08), 2.88, 0], [0, 0, xIndex === 0 ? 0.28 : -0.28])
    })
    add(new THREE.BoxGeometry(4.4, 0.28, 0.42), stone, [0, 2.78, 0])
    add(new THREE.BoxGeometry(3.74, 0.07, 0.46), gold, [0, 2.57, 0])
    add(new THREE.DodecahedronGeometry(0.24, 0), crystal, [0, 2.82, 0])
  } else if (type === 'champion_tower') {
    const basalt = material(0x171827, { roughness: 0.34, metalness: 0.36 })
    const basaltLight = material(0x303149, { roughness: 0.28, metalness: 0.44 })
    const crownGold = material(0xf4c95d, { roughness: 0.18, metalness: 0.82, emissive: 0xa86a12, emissiveIntensity: 0.2 })
    const starGlass = material(0xa9b8ff, { roughness: 0.08, metalness: 0.16, emissive: 0x6677ff, emissiveIntensity: 0.8, transparent: true, opacity: 0.76, depthWrite: false })
    const beam = material(0x8a9cff, { roughness: 0.02, emissive: 0x7185ff, emissiveIntensity: 1.15, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })
    add(new THREE.CylinderGeometry(2.5, 2.85, 0.42, 8), basalt, [0, 0.21, 0])
    add(new THREE.CylinderGeometry(2.15, 2.45, 0.35, 8), crownGold, [0, 0.52, 0])
    ;[0, 1, 2, 3].forEach((tier) => {
      const y = 1.2 + tier * 1.12
      const radius = 1.82 - tier * 0.22
      add(new THREE.CylinderGeometry(radius * 0.88, radius, 1.0, 8), tier % 2 ? basaltLight : basalt, [0, y, 0])
      add(new THREE.CylinderGeometry(radius + 0.12, radius + 0.12, 0.11, 8), crownGold, [0, y + 0.48, 0])
      ;[-1, 1].forEach((side) => add(new THREE.BoxGeometry(0.16, 0.55, 0.06), starGlass, [side * radius * 0.56, y, radius * 0.91]))
    })
    add(new THREE.CylinderGeometry(0.48, 0.62, 1.25, 8), basaltLight, [0, 5.5, 0])
    add(new THREE.ConeGeometry(1.18, 1.25, 8), crownGold, [0, 6.48, 0])
    add(new THREE.OctahedronGeometry(0.48, 0), starGlass, [0, 7.16, 0], [0, Math.PI / 8, 0], [0.78, 1.28, 0.78])
    add(new THREE.CylinderGeometry(0.18, 0.42, 5.7, 18, 1, true), beam, [0, 3.26, 0])
    const towerLight = new THREE.PointLight(0x8291ff, 1.05, 9)
    towerLight.position.set(0, 5.7, 0.8)
    group.add(towerLight)
  } else if (type === 'champion_obelisk') {
    const stone = material(0x24263b, { roughness: 0.31, metalness: 0.42 })
    const gold = material(0xf0c55b, { roughness: 0.2, metalness: 0.8, emissive: 0x8b580d, emissiveIntensity: 0.18 })
    const core = material(0x9caaff, { roughness: 0.08, emissive: 0x6677ff, emissiveIntensity: 0.76 })
    add(new THREE.CylinderGeometry(0.5, 0.62, 0.24, 8), stone, [0, 0.12, 0])
    add(new THREE.CylinderGeometry(0.2, 0.36, 1.42, 6), stone, [0, 0.93, 0])
    add(new THREE.TorusGeometry(0.34, 0.052, 8, 24), gold, [0, 0.62, 0], [Math.PI / 2, 0, 0])
    add(new THREE.TorusGeometry(0.28, 0.045, 8, 24), gold, [0, 1.28, 0], [Math.PI / 2, 0, 0])
    add(new THREE.OctahedronGeometry(0.28, 0), core, [0, 1.83, 0], [0, Math.PI / 6, 0], [0.76, 1.25, 0.76])
  } else if (type === 'champion_gate') {
    const stone = material(0x202238, { roughness: 0.3, metalness: 0.48 })
    const gold = material(0xf2c65a, { roughness: 0.18, metalness: 0.82, emissive: 0x94610d, emissiveIntensity: 0.2 })
    const star = material(0xa8b7ff, { roughness: 0.08, emissive: 0x6a7cff, emissiveIntensity: 0.82 })
    ;[-2.15, 2.15].forEach((x) => {
      add(new THREE.CylinderGeometry(0.28, 0.38, 2.85, 8), stone, [x, 1.43, 0])
      add(new THREE.ConeGeometry(0.34, 0.68, 8), gold, [x, 3.15, 0])
    })
    add(new THREE.BoxGeometry(4.7, 0.34, 0.48), stone, [0, 2.84, 0])
    add(new THREE.BoxGeometry(4.05, 0.075, 0.52), gold, [0, 2.62, 0])
    add(new THREE.OctahedronGeometry(0.3, 0), star, [0, 2.9, 0], [0, Math.PI / 4, 0])
  }

  group.userData.kind = 'elite-four-landmark'
  return group
}

function createEliteFourLandmark(type) {
  if (!ELITE_FOUR_LANDMARK_TYPES.has(type)) return null
  if (!eliteFourLandmarkTemplateCache.has(type)) {
    eliteFourLandmarkTemplateCache.set(type, createEliteFourLandmarkTemplate(type))
  }
  return eliteFourLandmarkTemplateCache.get(type)?.clone(true) || null
}

const ELITE_FOUR_LANDMARK_MAX_SCALES = {
  elite_frost_portal: 0.82,
  elite_tide_portal: 0.82,
  elite_iron_portal: 0.82,
  elite_dragon_portal: 0.82,
  elite_champion_portal: 0.82,
  elite_frost_crystal: 1.08,
  elite_frost_mirror: 0.92,
  elite_tide_pillar: 0.68,
  elite_tide_gate: 0.78,
  elite_iron_bastion: 0.9,
  elite_iron_beacon: 0.72,
  elite_iron_gate: 0.86,
  elite_dragon_spire: 0.82,
  elite_dragon_arch: 0.82,
  elite_dragon_gate: 0.82,
  champion_tower: 0.72,
  champion_obelisk: 0.86,
  champion_gate: 0.82
}

function resolveEliteFourLandmarkScale(type, scale) {
  const safeScale = Math.max(0.28, Number(scale) || 1)
  const maxScale = ELITE_FOUR_LANDMARK_MAX_SCALES[type]
  return Number.isFinite(maxScale) ? Math.min(safeScale, maxScale) : safeScale
}

function createBridge({ length = 3, width = 1.4, rotation = 0 } = {}, palette = {}) {
  const group = new THREE.Group()
  const deckMaterial = new THREE.MeshStandardMaterial({
    color: palette.bridgeDeck ?? 0xb9824b,
    roughness: palette.bridgeRoughness ?? 0.88,
    metalness: palette.bridgeMetalness ?? 0.02
  })
  const beamMaterial = new THREE.MeshStandardMaterial({
    color: palette.bridgeRail ?? 0x7a4d2b,
    roughness: palette.bridgeRoughness ?? 0.92,
    metalness: palette.bridgeMetalness ?? 0.02
  })
  const postMaterial = new THREE.MeshStandardMaterial({
    color: palette.bridgeAccent ?? 0x6b4125,
    roughness: palette.bridgeRoughness ?? 0.9,
    metalness: palette.bridgeMetalness ?? 0.02,
    emissive: palette.bridgeEmissive ?? 0x000000,
    emissiveIntensity: palette.bridgeEmissive ? 0.12 : 0
  })

  const visualWidth = clamp(Number(width) || 1.12, 0.84, 1.16)
  const bridgeLength = length * CELL
  const bridgeWidth = visualWidth * CELL
  const isEliteBridge = palette.bridgeStyle === 'elite'
  const plankCount = isEliteBridge ? 1 : 6
  for (let i = 0; i < plankCount; i += 1) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(
        bridgeLength,
        isEliteBridge ? 0.13 : 0.08,
        isEliteBridge ? bridgeWidth : bridgeWidth / plankCount * 0.72
      ),
      deckMaterial
    )
    plank.position.set(0, isEliteBridge ? 0.1 : 0.12, isEliteBridge ? 0 : -bridgeWidth / 2 + (i + 0.5) * (bridgeWidth / plankCount))
    plank.castShadow = true
    plank.receiveShadow = true
    group.add(plank)
  }

  const railZ = bridgeWidth / 2 + 0.08
  ;[-railZ, railZ].forEach((z) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(bridgeLength + 0.18, 0.13, 0.12), beamMaterial)
    rail.position.set(0, 0.26, z)
    rail.castShadow = true
    group.add(rail)

    ;[-bridgeLength / 2 + 0.24, bridgeLength / 2 - 0.24].forEach((x) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.35, 0.13), postMaterial)
      post.position.set(x, 0.28, z)
      post.castShadow = true
      group.add(post)
    })
  })

  if (isEliteBridge) {
    const seamCount = Math.max(3, Math.round(length))
    for (let i = 1; i < seamCount; i += 1) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, bridgeWidth * 0.82), postMaterial)
      seam.position.set(-bridgeLength / 2 + (i / seamCount) * bridgeLength, 0.18, 0)
      group.add(seam)
    }
  }

  group.rotation.y = rotation
  return group
}

function createTerrainTop(width, height, palette = {}) {
  const terrainW = (width + VISUAL_PADDING_TILES * 2) * CELL + 4
  const terrainH = (height + VISUAL_PADDING_TILES * 2) * CELL + 4
  const segX = Math.min(40, Math.max(12, Math.round(width / 2)))
  const segY = Math.min(40, Math.max(12, Math.round(height / 2)))
  const geometry = new THREE.PlaneGeometry(terrainW, terrainH, segX, segY)
  const positions = geometry.attributes.position
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i)
    const y = positions.getY(i)
    const wave = Math.sin(x * 0.22) * 0.018 + Math.cos(y * 0.2) * 0.016
    positions.setZ(i, wave)
  }
  geometry.computeVertexNormals()
  geometry.rotateX(-Math.PI / 2)

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: palette.terrainTop ?? 0x79d16b,
      roughness: 0.95,
      metalness: 0.02,
      flatShading: false
    })
  )
  mesh.position.y = -0.03
  mesh.receiveShadow = true
  mesh.castShadow = false
  return mesh
}

function createIslandBase(width, height, palette = {}) {
  const terrainW = (width + VISUAL_PADDING_TILES * 2) * CELL + 4.3
  const terrainH = (height + VISUAL_PADDING_TILES * 2) * CELL + 4.3
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(terrainW, 0.7, terrainH),
    new THREE.MeshStandardMaterial({
      color: palette.terrainBase ?? 0x67b457,
      roughness: 0.92
    })
  )
  base.position.y = -0.44
  base.receiveShadow = true
  base.castShadow = true
  return base
}

function tileObjectKey(x, y) {
  const v = (x * 17 + y * 31) % 3
  if (v === 0) return 'treeOak'
  if (v === 1) return 'treeDefault'
  return 'treePine'
}

const PROCEDURAL_TREE_MODEL_KEYS = ['treeOak', 'treeDefault', 'treePine']
const PROCEDURAL_FOREST_UNDERGROWTH_MODEL_KEYS = ['bush', 'stone', 'rock', 'grassLarge', 'mushroom', 'flowerYellow']
const PROCEDURAL_OPEN_GRASS_DETAIL_MODEL_KEYS = ['flowerYellow', 'flowerRed', 'bush', 'stone', 'mushroom']
const PROCEDURAL_DYNAMIC_BLOCKER_MODEL_KEYS = ['bush', 'stone', 'rock']

function collectRuntimeModelKeys(mapInfo, mapGrid) {
  const keys = new Set()
  const addKeys = (modelKeys) => modelKeys.forEach((key) => keys.add(key))
  const hasGrid = Array.isArray(mapGrid) && mapGrid.length > 0 && Array.isArray(mapGrid[0])

  if (hasGrid) {
    let hasForestTile = false
    let hasTallGrassTile = false
    let hasOpenGrassTile = false
    let hasDynamicBlockerTile = false

    for (let y = 0; y < mapGrid.length; y += 1) {
      const row = mapGrid[y]
      if (!Array.isArray(row)) continue
      for (let x = 0; x < row.length; x += 1) {
        const tile = row[x]
        if (tile === 1) hasForestTile = true
        else if (tile === 8) hasTallGrassTile = true
        else if (tile === 0) hasOpenGrassTile = true
        else if (tile === 20) hasDynamicBlockerTile = true
      }
    }

    if (hasForestTile) {
      if (mapInfo?.renderForestWallTrees !== false) addKeys(PROCEDURAL_TREE_MODEL_KEYS)
      addKeys(PROCEDURAL_FOREST_UNDERGROWTH_MODEL_KEYS)
    }
    if (hasTallGrassTile) addKeys(['grass', 'grassLarge'])
    if (hasOpenGrassTile) addKeys(PROCEDURAL_OPEN_GRASS_DETAIL_MODEL_KEYS)
    if (hasDynamicBlockerTile) addKeys(PROCEDURAL_DYNAMIC_BLOCKER_MODEL_KEYS)
  }

  ;(Array.isArray(mapInfo?.decorativeObjects) ? mapInfo.decorativeObjects : []).forEach((object) => {
    const spec = getDecorativeModel(object?.type)
    if (spec?.key) keys.add(spec.key)
  })

  if (keys.size === 0) {
    getRequiredModelKeys(mapInfo).forEach((key) => keys.add(key))
  }

  return keys
}

const ROAD_CLEAR_DECOR_TYPES = new Set([
  'tree-oak',
  'tree-default',
  'tree-pine',
  'bush-large',
  'rock-large',
  'stone-large',
  'grass-small',
  'grass-large',
  'flower-yellow',
  'flower-red',
  'mushroom-red'
])

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq <= 0.0001) return Math.hypot(px - ax, py - ay)
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1)
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

function isNearVisualPath(mapInfo, tileX, tileY, padding = 0) {
  if (!Array.isArray(mapInfo?.visualPaths)) return false
  return mapInfo.visualPaths.some((path) => {
    const points = Array.isArray(path.points) ? path.points : []
    if (points.length < 2) return false
    const radius = path.radius ?? 0.7
    for (let i = 0; i < points.length - 1; i += 1) {
      const [ax, ay] = points[i]
      const [bx, by] = points[i + 1]
      if (distanceToSegment(tileX, tileY, ax, ay, bx, by) <= radius + padding) return true
    }
    return false
  })
}

function isNearBridge(mapInfo, tileX, tileY, padding = 0) {
  if (!Array.isArray(mapInfo?.bridges)) return false
  return mapInfo.bridges.some((bridge) => {
    const rotation = bridge.rotation ?? 0
    const visualWidth = clamp(Number(bridge.width) || 1.12, 0.84, 1.16)
    const dx = tileX - bridge.x
    const dy = tileY - bridge.y
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const localX = dx * cos + dy * sin
    const localY = -dx * sin + dy * cos
    return (
      Math.abs(localX) <= (bridge.length ?? 3) / 2 + padding &&
      Math.abs(localY) <= visualWidth / 2 + padding
    )
  })
}

function isInRoadClearance(mapInfo, tileX, tileY, padding = 0.45) {
  return isNearVisualPath(mapInfo, tileX, tileY, padding) || isNearBridge(mapInfo, tileX, tileY, padding)
}

function getMapScopedCollectedEventId(mapName, eventId) {
  if (typeof mapName !== 'string' || mapName.length === 0) return null
  if (typeof eventId !== 'string' || eventId.length === 0) return null
  return `${mapName}:${eventId}`
}

function isCollectedMapEventId(collectedEventIdSet, mapName, eventId) {
  if (!(collectedEventIdSet instanceof Set) || typeof eventId !== 'string' || eventId.length === 0) return false
  return (
    collectedEventIdSet.has(eventId) ||
    collectedEventIdSet.has(getMapScopedCollectedEventId(mapName, eventId))
  )
}

function isRenderedDecorativeObject(object, collectedEventIdSet, mapName) {
  if (!object || typeof object !== 'object') return false
  if (
    (object.eventType === 'item' || object.eventType === 'pickup') &&
    typeof object.eventId === 'string' &&
    isCollectedMapEventId(collectedEventIdSet, mapName, object.eventId)
  ) {
    return false
  }
  return true
}

function isDynamicBlockerVisualSuppressed(mapInfo, activeMapGrid, tileX, tileY, collectedEventIdSet, mapName) {
  const sourceTile = mapInfo?.mapGrid?.[tileY]?.[tileX]
  if (sourceTile == null || sourceTile === activeMapGrid?.[tileY]?.[tileX]) return false
  if (sourceTile === 15) return true
  if (isNearBridge(mapInfo, tileX, tileY, 0.2)) return true

  return (mapInfo?.decorativeObjects || []).some((object) => (
    isRenderedDecorativeObject(object, collectedEventIdSet, mapName) &&
    isInsideDecorationFootprint(object, tileX, tileY, 0.14)
  ))
}

function ThreeLowPolyMap({
  playerPos,
  mapGrid,
  currentMapName,
  mapConfig,
  encounterCooldownSteps = 0,
  cloudBlocked = false,
  mapActive = true,
  onPlayerMove,
  onEncounter,
  onCollect,
  onMapWarp,
  onZoneEnter,
  onBlockedMove,
  onEncounterCooldownChange,
  onNavigate,
  collectedEventIds = [],
  springRestoreAnimation = null,
  currentMapBossCompleted = false,
  mapEventVisualState = {},
  encounterZoneLocks = {}
}) {
  const hostRef = useRef(null)
  const stateRef = useRef(null)
  const cooldownRef = useRef(encounterCooldownSteps)
  const recoverAttemptsRef = useRef(0)
  const [renderNonce, setRenderNonce] = useState(0)
  const [renderIssue, setRenderIssue] = useState(null)
  const mapDebugEnabled = useMemo(() => isMapRuntimeDebugEnabled(), [])

  const mapInfo = useMemo(() => {
    const info = getAdventureMapInfo(currentMapName)
    if (info && mapDebugEnabled) {
      console.log(`[Map Debug] ${currentMapName} - Total decorations:`, info.decorativeObjects?.length || 0)
      const rockStoneDecorations = (info.decorativeObjects || []).filter(d =>
        d.type?.includes('rock') || d.type?.includes('stone') || d.type?.includes('bush') || d.type?.includes('log')
      )
      console.log(`[Map Debug] ${currentMapName} - Rock/Stone/Bush/Log decorations:`, rockStoneDecorations.length)
      console.log(`[Map Debug] ${currentMapName} - Sample decorations:`, rockStoneDecorations.slice(0, 5).map(d => d.type))
    }
    return info
  }, [currentMapName, mapDebugEnabled])
  const requestRendererRestart = useCallback((reason = 'manual') => {
    console.warn(`[ThreeLowPolyMap] Restarting renderer: ${reason}`)
    setRenderNonce((value) => value + 1)
  }, [])

  const collectedEventIdSet = useMemo(
    () => new Set(Array.isArray(collectedEventIds) ? collectedEventIds.filter((id) => typeof id === 'string' && id.length > 0) : []),
    [collectedEventIds]
  )
  const normalizedMapEventVisualState = useMemo(
    () => (mapEventVisualState && typeof mapEventVisualState === 'object' ? mapEventVisualState : {}),
    [mapEventVisualState]
  )
  const normalizedEncounterZoneLocks = useMemo(
    () => (encounterZoneLocks && typeof encounterZoneLocks === 'object' ? encounterZoneLocks : {}),
    [encounterZoneLocks]
  )
  const collectedEventAnimationStateRef = useRef({
    mapName: currentMapName,
    ids: new Set(collectedEventIdSet)
  })
  const optimisticCollectedEventIdsRef = useRef({
    mapName: currentMapName,
    ids: new Set()
  })

  useEffect(() => {
    cooldownRef.current = encounterCooldownSteps
  }, [encounterCooldownSteps])

  useEffect(() => {
    if (optimisticCollectedEventIdsRef.current.mapName !== currentMapName) {
      optimisticCollectedEventIdsRef.current = {
        mapName: currentMapName,
        ids: new Set()
      }
    }
  }, [currentMapName])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !mapGrid?.length) return undefined

    disposeActiveThreeMapRenderer('effect-remount')

    let disposed = false
    let renderer = null
    let resizeObserver = null
    let healthTimerId = 0
    let recoveryTimerId = 0
    let rendererRestartPending = false
    let browserContextLost = false
    let cleanupRenderer = null
    const perfProbeEnabled = mapDebugEnabled

    const reportRenderIssue = (message, error) => {
      if (disposed) return
      console.warn('[ThreeLowPolyMap]', message, error || '')
      setRenderIssue({ message })
    }

    const scheduleRendererRestart = (reason, error, delay = 160) => {
      if (disposed || rendererRestartPending) return
      if (String(reason || '').startsWith('webgl-context')) {
        reportRenderIssue('地图渲染被浏览器暂停，请点击重建地图。', error)
        return
      }
      reportRenderIssue('地图渲染暂时失效，正在自动恢复...', error)
      recoverAttemptsRef.current += 1
      if (recoverAttemptsRef.current > 4) {
        reportRenderIssue('地图渲染连续恢复失败，请点击重建地图。', error)
        return
      }
      rendererRestartPending = true
      window.clearTimeout(recoveryTimerId)
      recoveryTimerId = window.setTimeout(() => {
        if (!disposed) requestRendererRestart(reason)
      }, delay)
    }

    setRenderIssue(null)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xbfe9ff)
    scene.fog = new THREE.Fog(0xbfe9ff, 28, 55)

    const renderProfile = resolveMapRendererProfile()
    const runtimeIsMobile = renderProfile.isMobile
    let idleFrameIntervalMs = renderProfile.idleFrameMs

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: renderProfile.antialias,
        alpha: false,
        powerPreference: renderProfile.powerPreference,
        logarithmicDepthBuffer: true
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, renderProfile.pixelRatioCap))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = renderProfile.shadowType
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.08
      renderer.setClearColor(0xbfe9ff, 1)
      renderProfile.maxAnisotropy = Math.min(
        renderProfile.maxAnisotropy,
        renderer.capabilities.getMaxAnisotropy?.() || renderProfile.maxAnisotropy
      )
      registerActiveThreeMapRenderer(host, (reason) => {
        if (typeof cleanupRenderer === 'function') {
          cleanupRenderer(reason)
          return
        }
        disposed = true
        releaseThreeRenderer(renderer, reason)
      })
    } catch (error) {
      scheduleRendererRestart('renderer-create-failed', error, 600)
      return undefined
    }

    host.replaceChildren()
    renderer.domElement.className = 'three-map-canvas'
    host.appendChild(renderer.domElement)

    const handleContextLost = (event) => {
      event.preventDefault()
      browserContextLost = true
      reportRenderIssue('地图渲染被浏览器暂停，请点击重建地图。')
    }
    const handleContextRestored = () => {
      browserContextLost = false
      requestRendererRestart('webgl-context-restored')
    }
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false)
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored, false)

    const usesCompactMapCamera = Number(mapInfo?.width) <= 28 && Number(mapInfo?.height) <= 24
    const cameraHeight = usesCompactMapCamera ? 11.8 : CAMERA_HEIGHT
    const cameraForwardOffset = usesCompactMapCamera ? 9.6 : CAMERA_FORWARD_OFFSET
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
    camera.position.set(0, cameraHeight, cameraForwardOffset)
    camera.lookAt(0, CAMERA_LOOK_Y, 0)

    // 视锥剔除复用对象（chunk-level frustum cull 用）
    const _viewFrustum = new THREE.Frustum()
    const _frustumMat = new THREE.Matrix4()

    // InstancedMesh 动画热路径复用对象（animate 循环里 setMatrixAt 用）
    const _instTmpMatrix = new THREE.Matrix4()
    const _instTmpComposed = new THREE.Matrix4()
    const _instTmpPos = new THREE.Vector3()
    const _instTmpQuat = new THREE.Quaternion()
    const _instTmpScale = new THREE.Vector3()
    const _instTmpEuler = new THREE.Euler(0, 0, 0, 'YXZ')

    const ambient = new THREE.HemisphereLight(0xffffff, 0x7fb06f, 1.55)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xfff6df, 2.35)
    sun.position.set(12, 22, 8)
    sun.castShadow = true
    configureSunShadow(sun, renderProfile.shadowMapSize)
    sun.shadow.camera.left = -22
    sun.shadow.camera.right = 22
    sun.shadow.camera.top = 22
    sun.shadow.camera.bottom = -22
    scene.add(sun)
    scene.add(sun.target)

    const root = new THREE.Group()
    scene.add(root)
    const grassObjects = new Map()
    const pathObjects = []
    const pointer = {
      tileX: playerPos?.x ?? mapInfo?.startPosition?.x ?? 1,
      tileY: playerPos?.y ?? mapInfo?.startPosition?.y ?? 1,
      direction: playerPos?.direction ?? 'down',
      moving: false,
      target: null,
      queued: null,
      holdDirection: null
    }

    let moveDelayTimerId = 0
    let keyboardDirection = null
    const cameraFocus = new THREE.Vector3()
    const cameraTarget = new THREE.Vector3()
    const clampCameraOut = new THREE.Vector3()
    const visibleChunkIds = new Set()
    const activeTrampleGrassKeys = new Set()
    let visibilityDirty = true
    let cachedVisibleChunkCount = 0

    function updateCameraBounds() {
      const width = mapGrid[0].length
      const height = mapGrid.length
      const worldHalfW = (width * CELL) / 2
      const worldHalfH = (height * CELL) / 2
      const cameraDistance = Math.max(camera.position.y - CAMERA_LOOK_Y, 1)
      const halfViewH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * cameraDistance
      const halfViewW = halfViewH * camera.aspect

      camera.userData.bounds = {
        minX: -worldHalfW + Math.max(halfViewW - CAMERA_EDGE_PADDING, 0),
        maxX: worldHalfW - Math.max(halfViewW - CAMERA_EDGE_PADDING, 0),
        minZ: -worldHalfH + Math.max(halfViewH - CAMERA_EDGE_PADDING, 0),
        maxZ: worldHalfH - Math.max(halfViewH - CAMERA_EDGE_PADDING, 0)
      }
    }

    function clampCameraTarget(x, z) {
      const bounds = camera.userData.bounds
      if (!bounds) {
        clampCameraOut.set(x, CAMERA_LOOK_Y, z)
        return clampCameraOut
      }

      const safeMinX = Math.min(bounds.minX, bounds.maxX)
      const safeMaxX = Math.max(bounds.minX, bounds.maxX)
      const safeMinZ = Math.min(bounds.minZ, bounds.maxZ)
      const safeMaxZ = Math.max(bounds.minZ, bounds.maxZ)
      clampCameraOut.set(
        clamp(x, safeMinX, safeMaxX),
        CAMERA_LOOK_Y,
        clamp(z, safeMinZ, safeMaxZ)
      )
      return clampCameraOut
    }

    function syncCameraTargetToTile(tileX, tileY, force = false) {
      const width = mapGrid[0].length
      const height = mapGrid.length
      const world = worldFromTile(tileX, tileY, width, height)
      const clamped = clampCameraTarget(world.x, world.z)
      cameraTarget.copy(clamped)
      if (force) cameraFocus.copy(clamped)
      visibilityDirty = true
    }

	    stateRef.current = {
      pointer,
      mapGrid,
      mapInfo,
      currentMapName,
      mapConfig,
      collectedEventIdSet,
      currentMapBossCompleted,
      mapEventVisualState: normalizedMapEventVisualState,
      encounterZoneLocks: normalizedEncounterZoneLocks,
      onPlayerMove,
      onEncounter,
      onCollect,
      onMapWarp,
      onZoneEnter,
      onBlockedMove,
      onEncounterCooldownChange,
      cloudBlocked,
      mapActive,
      encounterPending: false,
      springRestoreAnimation,
	      player: null,
	      springEffects: [],
	      eventSignals: [],
	      dynamicEventDecorations: [],
	      npcFacingControllers: [],
	      npcFacingControllersByEventId: new Map(),
		      npcRoleEffects: [],
        objectiveDevices: [],
        eventVisualBindings: [],
	      pickupBursts: [],
	      pickupBurstPool: [],
	      restoreBurst: null,
      encounterAlertEffect: null,
	      triggerPickupBurst: null,
	      cameraFocus,
	      cameraTarget,
      syncCameraTargetToTile
    }

    const resize = () => {
      if (!renderer) return
      const size = getSafeRendererSize(host)
      const { width, height } = size
      if (mapDebugEnabled && size.wasClamped && host.dataset.rendererSizeClamped !== '1') {
        host.dataset.rendererSizeClamped = '1'
        console.warn(
          '[ThreeLowPolyMap] Renderer host reported an abnormal size; clamped canvas buffer.',
          {
            rawWidth: Math.round(size.rawWidth),
            rawHeight: Math.round(size.rawHeight),
            width: Math.round(width),
            height: Math.round(height)
          }
        )
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, renderProfile.pixelRatioCap))
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      updateCameraBounds()
      syncCameraTargetToTile(pointer.tileX, pointer.tileY, true)
      visibilityDirty = true
    }

    const buildWorld = async () => {
      const height = mapGrid.length
      const width = mapGrid[0].length

      const start = worldFromTile(pointer.tileX, pointer.tileY, width, height)
      const fallbackPlayer = createLowPolyPlayer()
      fallbackPlayer.position.set(start.x, PLAYER_BASE_Y, start.z)
      fallbackPlayer.rotation.y = DIRS[pointer.direction]?.rot ?? 0
      root.add(fallbackPlayer)
      stateRef.current.player = fallbackPlayer

      const visualPalette = mapInfo?.visualPalette || {}
      root.add(createIslandBase(width, height, visualPalette))
      root.add(createTerrainTop(width, height, visualPalette))

	      const springEffects = []
	      const eventSignals = []
	      const dynamicEventDecorations = []
	      const npcFacingControllers = []
	      const npcFacingControllersByEventId = new Map()
		      const npcRoleEffects = []
        const objectiveDevices = []
        const eventVisualBindings = []
	      const pickupBursts = []
	      const pickupBurstPool = []
      const healEvents = (Array.isArray(mapInfo?.runtimeEvents) ? mapInfo.runtimeEvents : [])
        .filter((event) => event?.type === 'heal')
      healEvents.forEach((event, index) => {
        const eventX = Number(event.position?.x)
        const eventY = Number(event.position?.y)
        const anchor = getEventVisualAnchor(mapInfo, event.id, event.type) || { x: eventX, y: eventY, offsetX: 0, offsetZ: 0 }
        if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return
        const pos = worldFromTile(anchor.x, anchor.y, width, height)
        const effect = createHealingSpringEffect(index)
        effect.position.set(pos.x + (anchor.offsetX ?? 0), 0, pos.z + (anchor.offsetZ ?? 0))
        root.add(effect)
        springEffects.push(effect)
      })
	      const restoreBurst = createRestoreBurstEffect()
	      root.add(restoreBurst)
      const encounterAlertEffect = createEncounterAlertEffect()
      root.add(encounterAlertEffect)
	      const triggerPickupBurst = (controller, now = performance.now()) => {
	        if (!controller) return
	        let burst = pickupBurstPool.find((candidate) => !candidate?.userData?.active)
	        if (!burst) {
	          burst = createPickupCollectBurstEffect(pickupBurstPool.length)
	          pickupBurstPool.push(burst)
	          root.add(burst)
	        }
	        if (!pickupBursts.includes(burst)) pickupBursts.push(burst)
	        burst.visible = true
	        burst.userData.active = true
	        burst.position.set(controller.posX, 0, controller.posZ)
	        burst.userData.startedAt = now
	        burst.userData.baseY = Math.max(0.18, controller.posY + 0.04)
	      }
	      stateRef.current.springEffects = springEffects
	      stateRef.current.eventSignals = eventSignals
	      stateRef.current.dynamicEventDecorations = dynamicEventDecorations
	      stateRef.current.npcFacingControllers = npcFacingControllers
	      stateRef.current.npcFacingControllersByEventId = npcFacingControllersByEventId
		      stateRef.current.npcRoleEffects = npcRoleEffects
        stateRef.current.objectiveDevices = objectiveDevices
        stateRef.current.eventVisualBindings = eventVisualBindings
	      stateRef.current.pickupBursts = pickupBursts
	      stateRef.current.pickupBurstPool = pickupBurstPool
	      stateRef.current.restoreBurst = restoreBurst
      stateRef.current.encounterAlertEffect = encounterAlertEffect
	      stateRef.current.triggerPickupBurst = triggerPickupBurst

      const legacyRequiredModelKeys = getRequiredModelKeys(mapInfo)
      const runtimeRequiredModelKeys = collectRuntimeModelKeys(mapInfo, mapGrid)
      if (mapDebugEnabled) {
        const skippedKeys = [...legacyRequiredModelKeys].filter((key) => !runtimeRequiredModelKeys.has(key))
        console.log('[ThreeLowPolyMap] Runtime model key plan:', {
          mapName: currentMapName,
          legacyCount: legacyRequiredModelKeys.size,
          runtimeCount: runtimeRequiredModelKeys.size,
          skippedKeys
        })
      }
      const models = await loadModels(runtimeRequiredModelKeys, {
        concurrency: runtimeIsMobile ? 3 : 6
      })
      if (disposed) return

      const pathMaterial = new THREE.MeshStandardMaterial({
        color: visualPalette.path ?? 0xd9bd86,
        roughness: 0.96,
        metalness: visualPalette.pathMetalness ?? 0.01
      })
      const pathEdgeMaterial = new THREE.MeshStandardMaterial({
        color: visualPalette.pathEdge ?? 0xbe9461,
        roughness: 0.98,
        transparent: true,
        opacity: 0.46
      })
      const pathHighlightMaterial = new THREE.MeshStandardMaterial({
        color: visualPalette.pathHighlight ?? 0xf6dfa9,
        roughness: 0.9,
        transparent: true,
        opacity: 0.18
      })
      const waterMaterial = new THREE.MeshStandardMaterial({
        color: visualPalette.water ?? 0x74d7df,
        roughness: 0.5,
        metalness: 0.02,
        transparent: true,
        opacity: 0.97
      })
      const waterDeepMaterial = new THREE.MeshStandardMaterial({
        color: visualPalette.waterDeep ?? 0x2d9fc5,
        roughness: 0.34,
        metalness: 0.02,
        transparent: true,
        opacity: 0.28,
        depthWrite: false
      })
      const waterBankMaterial = new THREE.MeshStandardMaterial({
        color: visualPalette.waterBank ?? 0xe0c893,
        roughness: 0.94,
        metalness: 0.01,
        transparent: true,
        opacity: 0.5
      })
      const forestFloorMaterial = new THREE.MeshStandardMaterial({
        color: visualPalette.forestFloor ?? 0x5fa85a,
        roughness: 0.95,
        transparent: true,
        opacity: 0.14
      })
      const sandPatchMaterial = new THREE.MeshStandardMaterial({
        color: visualPalette.sandPatch ?? 0xe8d4a8,
        roughness: 0.96,
        transparent: true,
        opacity: 0.22
      })
      const paleGrassPatchMaterial = new THREE.MeshStandardMaterial({
        color: visualPalette.paleGrassPatch ?? 0xc8ddb8,
        roughness: 0.95,
        transparent: true,
        opacity: 0.18
      })
      const forestTrailMaterial = new THREE.MeshStandardMaterial({
        color: 0x8bcf72,
        roughness: 0.96,
        transparent: true,
        opacity: 0.32
      })
      applyGroundDecalMaterial(pathMaterial)
      applyGroundDecalMaterial(pathEdgeMaterial)
      applyGroundDecalMaterial(pathHighlightMaterial)
      applyGroundDecalMaterial(waterBankMaterial)
      applyGroundDecalMaterial(forestFloorMaterial)
      applyGroundDecalMaterial(sandPatchMaterial)
      applyGroundDecalMaterial(paleGrassPatchMaterial)
      applyGroundDecalMaterial(forestTrailMaterial)

      // === InstancedMesh 工厂 + Chunk 化 ===
      // 1) 把所有重复模型按 sub-mesh 建模板（draw call 从 ~1050 砍到 ~30）
      // 2) 地图按 CHUNK_TILES×CHUNK_TILES 分块，每块各自一组 InstancedMesh + 一个 THREE.Group
      //    后续 animate() 用 THREE.Frustum 测试每个 chunk 的 AABB，关掉视野外整个 group
      const CHUNK_TILES = 16
      const chunkCountX = Math.max(1, Math.ceil(width / CHUNK_TILES))
      const chunkCountY = Math.max(1, Math.ceil(height / CHUNK_TILES))

      // 总容量上限（全图），按 80×80 最坏估，per-chunk 容量 = total / chunkCount * 1.8
      const INSTANCE_CAPACITY = {
        treeOak: 2400, treeDefault: 2400, treePine: 2400,
        bush: 1200, rock: 600, stone: 600,
        grass: 1600, grassLarge: 1600,
        flowerYellow: 1000, flowerRed: 1000, mushroom: 600,
        sign: 12, tent: 8, campfire: 8
      }

      const _templateCache = {}
      const getInstanceTemplate = (key) => {
        if (key in _templateCache) return _templateCache[key]
        const scene = models[key] || createEliteFourCharacterTemplate(key)
        if (!scene) { _templateCache[key] = null; return null }
        const subMeshes = []
        scene.updateMatrixWorld(true)
        scene.traverse((child) => {
          if (!child.isMesh || !child.geometry) return
          const mat = cloneAndEnhanceMeshMaterial(child.material, {
            maxAnisotropy: renderProfile.maxAnisotropy
          })
          const materials = Array.isArray(mat) ? mat : [mat]
          materials.forEach((entry) => {
            if (!entry) return
            if (typeof entry.roughness === 'number') entry.roughness = 0.82
            if (typeof entry.metalness === 'number') entry.metalness = 0.03
          })
          applyMapAssetMaterialStyle(mat, MAP_ASSET_CATALOG[key])
          subMeshes.push({
            geometry: prepareMeshGeometry(child.geometry),
            material: mat,
            localMatrix: child.matrixWorld.clone()
          })
        })
        _templateCache[key] = subMeshes.length > 0 ? subMeshes : null
        return _templateCache[key]
      }

      const perChunkCapacity = (key) => {
        const total = INSTANCE_CAPACITY[key] ?? 256
        const share = total / (chunkCountX * chunkCountY)
        return Math.ceil(Math.max(24, share * 1.8))
      }

      // 预建 chunks
      const chunks = []
      for (let cy = 0; cy < chunkCountY; cy += 1) {
        for (let cx = 0; cx < chunkCountX; cx += 1) {
          const group = new THREE.Group()
          root.add(group)
          const minTileX = cx * CHUNK_TILES
          const maxTileX = Math.min(width, (cx + 1) * CHUNK_TILES)
          const minTileY = cy * CHUNK_TILES
          const maxTileY = Math.min(height, (cy + 1) * CHUNK_TILES)
          // chunk AABB（含 1 格 padding 防止边界树冠被裁掉）
          const minW = worldFromTile(minTileX, minTileY, width, height)
          const maxW = worldFromTile(maxTileX, maxTileY, width, height)
          const boundingBox = new THREE.Box3(
            new THREE.Vector3(Math.min(minW.x, maxW.x) - CELL, -2.5, Math.min(minW.z, maxW.z) - CELL),
            new THREE.Vector3(Math.max(minW.x, maxW.x) + CELL, 9, Math.max(minW.z, maxW.z) + CELL)
          )
          chunks.push({ id: cy * chunkCountX + cx, cx, cy, group, instancedSets: {}, boundingBox })
        }
      }

      const chunkIdFromWorld = (worldX, worldZ) => {
        const tileX = worldX / CELL + width / 2 - 0.5
        const tileY = worldZ / CELL + height / 2 - 0.5
        const cx = Math.max(0, Math.min(chunkCountX - 1, Math.floor(tileX / CHUNK_TILES)))
        const cy = Math.max(0, Math.min(chunkCountY - 1, Math.floor(tileY / CHUNK_TILES)))
        return cy * chunkCountX + cx
      }

      const buildInstancedSetForChunk = (chunk, key) => {
        const template = getInstanceTemplate(key)
        if (!template) return null
        const cap = perChunkCapacity(key)
        const usesGrassSway = GRASS_SWAY_KEYS.has(key)
        const set = template.map((sub) => {
          if (usesGrassSway) ensureGrassSwayMaterial(sub.material)
          const im = new THREE.InstancedMesh(sub.geometry, sub.material, cap)
          const isTreeLike = SHADOW_CASTING_MODEL_KEYS.has(key)
          im.castShadow = renderProfile.castDecorationShadows && (isTreeLike || renderProfile.castAllDecorationShadows)
          im.receiveShadow = true
          im.count = 0
          im.frustumCulled = false // chunk group 控制可见性
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
          if (usesGrassSway) ensureGrassSwayGeometry(im, cap)
          chunk.group.add(im)
          return { instancedMesh: im, localMatrix: sub.localMatrix }
        })
        chunk.instancedSets[key] = set
        return set
      }

      // tmp 复用对象在外层 effect 作用域声明，animate 与 buildWorld 共享
      const addInstanceMatrix = (key, worldMatrix, swaySeed = null) => {
        const worldX = worldMatrix.elements[12]
        const worldZ = worldMatrix.elements[14]
        const chunkId = chunkIdFromWorld(worldX, worldZ)
        const chunk = chunks[chunkId]
        if (!chunk) return null
        let set = chunk.instancedSets[key]
        if (!set) set = buildInstancedSetForChunk(chunk, key)
        if (!set) return null
        const refs = []
        const usesGrassSway = GRASS_SWAY_KEYS.has(key)
        for (let i = 0; i < set.length; i += 1) {
          const sub = set[i]
          const max = sub.instancedMesh.instanceMatrix.count
          if (sub.instancedMesh.count >= max) continue
          const instanceIndex = sub.instancedMesh.count
          _instTmpMatrix.multiplyMatrices(worldMatrix, sub.localMatrix)
          sub.instancedMesh.setMatrixAt(instanceIndex, _instTmpMatrix)
          if (usesGrassSway && swaySeed) {
            setGrassInstanceSwaySeed(sub.instancedMesh, instanceIndex, swaySeed.x, swaySeed.y)
          }
          refs.push({
            mesh: sub.instancedMesh,
            index: instanceIndex,
            localOffset: sub.localMatrix
          })
          sub.instancedMesh.count += 1
          sub.instancedMesh.instanceMatrix.needsUpdate = true
        }
        return refs.length > 0 ? refs : null
      }

      const addInstance = (key, posX, posY, posZ, rotationY = 0, scale = 1) => {
        _instTmpPos.set(posX, posY, posZ)
        _instTmpEuler.set(0, rotationY, 0)
        _instTmpQuat.setFromEuler(_instTmpEuler)
        _instTmpScale.setScalar(scale)
        _instTmpComposed.compose(_instTmpPos, _instTmpQuat, _instTmpScale)
        return addInstanceMatrix(key, _instTmpComposed)
      }

      const createDynamicEventDecorationController = ({
            eventType,
            eventId = null,
            tileX,
            tileY,
            visibleTiles = null,
            refs,
            object3D = null,
        posX,
          posY,
          posZ,
          rotationY,
          scale,
          lockedScale = null,
          lockedScaleTile = REGION_MAP_TILE.objectBlocker,
          signal = null
      }) => {
        const instancedRefs = Array.isArray(refs) ? refs : []
        if (instancedRefs.length === 0 && !object3D) return null
        const baseScale = Number.isFinite(Number(scale)) ? Number(scale) : 1
        const resolvedLockedScale = Number.isFinite(Number(lockedScale)) && Number(lockedScale) > baseScale
          ? Number(lockedScale)
          : baseScale
        const controller = {
          eventType,
          eventId,
          tileX,
          tileY,
          visibleTiles: Array.isArray(visibleTiles) ? visibleTiles : null,
          refs: instancedRefs,
          object3D,
          posX,
          posY,
          posZ,
          rotationY,
          scale: baseScale,
          lockedScale: resolvedLockedScale,
          lockedScaleTile,
          renderedScale: baseScale,
          signal,
          visible: true,
          collectingStartedAt: 0,
          collectingDurationMs: 260,
          resolveScaleForTile(tile) {
            return tile === this.lockedScaleTile ? this.lockedScale : this.scale
          },
          applyTransform(scaleValue = this.scale, liftY = 0, rotationValue = this.rotationY) {
            if (this.object3D) {
              this.object3D.position.set(this.posX, this.posY + liftY, this.posZ)
              this.object3D.rotation.set(0, rotationValue, 0)
              this.object3D.scale.setScalar(scaleValue)
            }
            _instTmpPos.set(this.posX, this.posY + liftY, this.posZ)
            _instTmpEuler.set(0, rotationValue, 0)
            _instTmpQuat.setFromEuler(_instTmpEuler)
            _instTmpScale.setScalar(scaleValue)
            _instTmpComposed.compose(_instTmpPos, _instTmpQuat, _instTmpScale)
            this.refs.forEach((ref) => {
              _instTmpMatrix.multiplyMatrices(_instTmpComposed, ref.localOffset)
              ref.mesh.setMatrixAt(ref.index, _instTmpMatrix)
              ref.mesh.instanceMatrix.needsUpdate = true
            })
          },
          setVisible(nextVisible, currentTile = null) {
            const nextScale = nextVisible ? this.resolveScaleForTile(currentTile) : 0.0001
            const scaleChanged = Math.abs((this.renderedScale ?? this.scale) - nextScale) > 0.001
            if (!nextVisible) {
              this.collectingStartedAt = 0
            }
            if (this.visible === nextVisible && !this.collectingStartedAt && !scaleChanged) {
              if (this.object3D) this.object3D.visible = nextVisible
              if (this.signal) {
                this.signal.visible = nextVisible
                this.signal.scale.setScalar(1)
              }
              return
            }
            this.visible = nextVisible
            this.renderedScale = nextScale
            this.applyTransform(nextScale, 0, this.rotationY)
            if (this.object3D) this.object3D.visible = nextVisible
            if (this.signal) {
              this.signal.visible = nextVisible
              this.signal.scale.setScalar(1)
            }
          },
          startCollect(now, onCollectVisual = null) {
            if (!this.visible || this.collectingStartedAt) return false
            this.collectingStartedAt = now
            if (this.signal) this.signal.visible = false
            onCollectVisual?.(this, now)
            return true
          },
          update(now) {
            if (!this.collectingStartedAt) return
            const t = clamp((now - this.collectingStartedAt) / this.collectingDurationMs, 0, 1)
            const easeOut = 1 - Math.pow(1 - t, 3)
            const scaleValue = Math.max(0.0001, this.scale * (1 - easeOut * 0.96))
            const liftY = easeOut * 0.18
            const rotationValue = this.rotationY + easeOut * 0.22
            this.applyTransform(scaleValue, liftY, rotationValue)
            if (t >= 1) {
              this.setVisible(false)
            }
          },
          syncFromState(grid, activeCollectedEventIdSet = new Set()) {
            if ((this.eventType === 'item' || this.eventType === 'pickup') && this.eventId) {
              const isCollected = isCollectedMapEventId(activeCollectedEventIdSet, currentMapName, this.eventId)
              if (mapDebugEnabled) {
                console.log(`[Treasure Visibility] ${this.eventId}:`, {
                  isCollected,
                  visible: this.visible,
                  collecting: !!this.collectingStartedAt,
                  collectedSet: Array.from(activeCollectedEventIdSet)
                })
              }
              if (isCollected) {
                if (!this.collectingStartedAt) this.setVisible(false)
                return
              }
              if (!this.visible || this.collectingStartedAt) {
                this.collectingStartedAt = 0
                this.setVisible(true)
              }
              return
            }
            const currentTile = getLegacyTile(grid, this.tileX, this.tileY)
            if (Array.isArray(this.visibleTiles) && this.visibleTiles.length > 0) {
              this.setVisible(this.visibleTiles.includes(currentTile), currentTile)
              return
            }
            const expectedTile = getMapEventTile(this.eventType)
            this.setVisible(Boolean(expectedTile && currentTile === expectedTile), currentTile)
          },
          syncFromGrid(grid) {
            this.syncFromState(grid)
          }
        }
        return controller
      }

      const createNpcFacingController = ({
        eventType,
        eventId = null,
        tileX,
        tileY,
        refs,
        posX,
        posY,
        posZ,
        rotationY,
        scale,
        routeBlockerEvent = null
      }) => {
        if (!NPC_INTERACTION_EVENT_TYPES.has(eventType) || typeof eventId !== 'string' || eventId.length === 0) return null
        const instancedRefs = Array.isArray(refs) ? refs : []
        if (instancedRefs.length === 0) return null
        const baseScale = Number.isFinite(Number(scale)) ? Number(scale) : 1
        const baseRotation = Number.isFinite(Number(rotationY)) ? Number(rotationY) : 0
        const stepAsideOffset = getEliteRouteStepAsideOffset(routeBlockerEvent)
        const asideOffsetX = stepAsideOffset.x * stepAsideOffset.distance * CELL
        const asideOffsetZ = stepAsideOffset.y * stepAsideOffset.distance * CELL
        const controller = {
          eventType,
          eventId,
          tileX,
          tileY,
          interactionTileX: tileX,
          interactionTileY: tileY,
          refs: instancedRefs,
          posX,
          posY,
          posZ,
          currentPosX: posX,
          currentPosZ: posZ,
          targetPosX: posX,
          targetPosZ: posZ,
          moveFromX: posX,
          moveFromZ: posZ,
          moveStartedAt: 0,
          moveDurationMs: 360,
          scale: baseScale,
          baseRotation,
          currentRotation: baseRotation,
          targetRotation: baseRotation,
          active: false,
          routeBlockerEvent,
          routeBlockerYielded: false,
          companions: [],
          addCompanions(objects = []) {
            this.companions = objects
              .filter(Boolean)
              .map((object3D) => ({
                object3D,
                baseX: object3D.position.x,
                baseZ: object3D.position.z
              }))
            this.applyTransform(this.currentRotation)
          },
          applyTransform(rotationValue = this.currentRotation) {
            _instTmpPos.set(this.currentPosX, this.posY, this.currentPosZ)
            _instTmpEuler.set(0, rotationValue, 0)
            _instTmpQuat.setFromEuler(_instTmpEuler)
            _instTmpScale.setScalar(this.scale)
            _instTmpComposed.compose(_instTmpPos, _instTmpQuat, _instTmpScale)
            this.refs.forEach((ref) => {
              _instTmpMatrix.multiplyMatrices(_instTmpComposed, ref.localOffset)
              ref.mesh.setMatrixAt(ref.index, _instTmpMatrix)
              ref.mesh.instanceMatrix.needsUpdate = true
            })
            const offsetX = this.currentPosX - this.posX
            const offsetZ = this.currentPosZ - this.posZ
            this.companions.forEach((companion) => {
              companion.object3D.position.x = companion.baseX + offsetX
              companion.object3D.position.z = companion.baseZ + offsetZ
            })
          },
          syncRouteBlockerState(visualState, options = {}) {
            if (stepAsideOffset.distance <= 0 || !this.routeBlockerEvent) return false
            const yielded = isEliteRouteBlockerCleared(
              this.routeBlockerEvent,
              visualState,
              Boolean(options.currentMapBossCompleted)
            )
            const nextTargetX = this.posX + (yielded ? asideOffsetX : 0)
            const nextTargetZ = this.posZ + (yielded ? asideOffsetZ : 0)
            const targetChanged = (
              this.routeBlockerYielded !== yielded ||
              Math.abs(this.targetPosX - nextTargetX) > 0.001 ||
              Math.abs(this.targetPosZ - nextTargetZ) > 0.001
            )
            if (!targetChanged) return false

            this.routeBlockerYielded = yielded
            this.interactionTileX = this.tileX + (yielded ? stepAsideOffset.x : 0)
            this.interactionTileY = this.tileY + (yielded ? stepAsideOffset.y : 0)
            this.targetPosX = nextTargetX
            this.targetPosZ = nextTargetZ
            this.targetRotation = this.baseRotation
            this.active = false
            if (options.immediate) {
              this.currentPosX = nextTargetX
              this.currentPosZ = nextTargetZ
              this.moveStartedAt = 0
              this.applyTransform(this.currentRotation)
              return true
            }

            this.moveFromX = this.currentPosX
            this.moveFromZ = this.currentPosZ
            this.moveStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
            return true
          },
          facePlayer(playerTileX, playerTileY) {
            if (!isCardinalAdjacentTile(this.interactionTileX, this.interactionTileY, playerTileX, playerTileY)) return false
            const direction = getDirectionTowardTile(this.interactionTileX, this.interactionTileY, playerTileX, playerTileY)
            const nextRotation = DIRS[direction]?.rot
            if (!Number.isFinite(nextRotation)) return false
            this.targetRotation = nextRotation
            this.active = true
            return true
          },
          restoreDefault() {
            if (!this.active && Math.abs(this.currentRotation - this.baseRotation) < 0.001) return false
            this.targetRotation = this.baseRotation
            this.active = false
            return true
          },
          syncWithPlayerTile(playerTileX, playerTileY) {
            if (!this.active) return false
            if (isCardinalAdjacentTile(this.interactionTileX, this.interactionTileY, playerTileX, playerTileY)) return false
            return this.restoreDefault()
          },
          update(now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
            let transformChanged = false
            if (this.moveStartedAt) {
              const progress = clamp((now - this.moveStartedAt) / this.moveDurationMs, 0, 1)
              const eased = 1 - Math.pow(1 - progress, 3)
              this.currentPosX = THREE.MathUtils.lerp(this.moveFromX, this.targetPosX, eased)
              this.currentPosZ = THREE.MathUtils.lerp(this.moveFromZ, this.targetPosZ, eased)
              transformChanged = true
              if (progress >= 1) this.moveStartedAt = 0
            }
            const delta = Math.atan2(
              Math.sin(this.targetRotation - this.currentRotation),
              Math.cos(this.targetRotation - this.currentRotation)
            )
            if (Math.abs(delta) < 0.002) {
              if (this.currentRotation !== this.targetRotation) {
                this.currentRotation = this.targetRotation
                transformChanged = true
              }
              if (transformChanged) this.applyTransform(this.currentRotation)
              return transformChanged
            }
            this.currentRotation = lerpAngle(this.currentRotation, this.targetRotation, 0.28)
            this.applyTransform(this.currentRotation)
            return true
          },
          isAnimating() {
            const delta = Math.atan2(
              Math.sin(this.targetRotation - this.currentRotation),
              Math.cos(this.targetRotation - this.currentRotation)
            )
            return this.moveStartedAt > 0 || Math.abs(delta) >= 0.002
          }
        }
        return controller
      }

      const addEventSignalAt = (tileX, tileY, eventType, options = {}) => {
        if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return null
        const signal = createEventSignal(eventType, { ...options, seed: eventSignals.length })
        const pos = worldFromTile(tileX, tileY, width, height)
        signal.position.x = pos.x + (options.offsetX ?? 0)
        signal.position.z = pos.z + (options.offsetZ ?? 0)
        root.add(signal)
        eventSignals.push(signal)
        return signal
      }

      const registerEventVisualBinding = ({
        eventId,
        eventType = null,
        signal = null,
        npcRoleEffect = null,
        objectiveDevice = null,
        npcFacingController = null,
        defaultState = 'available'
      } = {}) => {
        if (typeof eventId !== 'string' || eventId.length === 0) return
        const visualState = resolveEventVisualStateValue(eventId, normalizedMapEventVisualState, defaultState)
        applyEventSignalVisualState(signal, visualState)
        applyNpcRoleEffectVisualState(npcRoleEffect, visualState)
        applyObjectiveDeviceVisualState(objectiveDevice, visualState)
        npcFacingController?.syncRouteBlockerState?.(visualState, {
          immediate: true,
          currentMapBossCompleted
        })
        eventVisualBindings.push({
          eventId,
          eventType,
          signal,
          npcRoleEffect,
          objectiveDevice,
          npcFacingController,
          defaultState
        })
      }

      const finalizeInstancedMeshes = () => {
        chunks.forEach((chunk) => {
          Object.values(chunk.instancedSets).forEach((set) => {
            set.forEach((sub) => {
              sub.instancedMesh.instanceMatrix.needsUpdate = true
              sub.instancedMesh.computeBoundingSphere()
            })
          })
        })
      }

      // 让 animate() 可访问 chunks 做视锥剔除（Step 5）
      stateRef.current.mapChunks = chunks
      stateRef.current.chunkGrid = { chunkCountX, chunkTiles: CHUNK_TILES }

      const placeSmallDecoration = (key, pos, scale, rotation = 0, offsetX = 0, offsetZ = 0) => {
        return addInstance(key, pos.x + offsetX, 0.16, pos.z + offsetZ, rotation, scale)
      }

      const getRenderedTile = (tileX, tileY) => {
        if (tileX >= 0 && tileX < width && tileY >= 0 && tileY < height) {
          return mapGrid[tileY][tileX]
        }
        return getVisualTile(mapGrid, tileX, tileY)
      }

      const isForestEdge = (tileX, tileY) => {
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (ox === 0 && oy === 0) continue
            const neighbor = getRenderedTile(tileX + ox, tileY + oy)
            if (neighbor !== 1) return true
          }
        }
        return false
      }

      // 只测正方向贴边。高草 tile 仍会渲染，只是在贴路时压紧簇宽，避免道路边缘和高草视觉互相吞掉。
      const isNearRoad = (tileX, tileY) => (
        getRenderedTile(tileX - 1, tileY) === 12 ||
        getRenderedTile(tileX + 1, tileY) === 12 ||
        getRenderedTile(tileX, tileY - 1) === 12 ||
        getRenderedTile(tileX, tileY + 1) === 12
      )

      const isRoadJunctionTile = (tileX, tileY) => (
        Array.isArray(mapInfo?.roadJunctions) && mapInfo.roadJunctions.some((junction) => {
          const rx = junction.rx ?? 1
          const ry = junction.ry ?? 1
          const dx = (tileX - junction.x) / rx
          const dy = (tileY - junction.y) / ry
          return dx * dx + dy * dy <= 1.15
        })
      )

      const getForestEdgeNudge = (tileX, tileY) => {
        let nx = 0
        let nz = 0

        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const neighbor = getRenderedTile(tileX + ox, tileY + oy)
          if (neighbor !== 1 && neighbor !== 11) {
            nx += ox
            nz += oy
          }
        }

        const length = Math.hypot(nx, nz)
        if (length <= 0) return { x: 0, z: 0 }
        return {
          x: nx / length * CELL * 0.32,
          z: nz / length * CELL * 0.32
        }
      }

      const placeForestModel = (key, pos, scale, rotation, offsetX, offsetZ, y = 0.13) => {
        return addInstance(key, pos.x + offsetX, y, pos.z + offsetZ, rotation, scale)
      }

      const placeForestUndergrowth = (x, y, pos, {
        edge = false,
        heavy = false,
        force = false,
        preferClearance = false
      } = {}) => {
        const onBlockedTile = !isLegacyTileWalkableValue(getRenderedTile(x, y))
        const blockedEdgeTile = onBlockedTile && hasWalkableCardinalNeighbor(mapGrid, x, y)
        const decorationChance = onBlockedTile
          ? heavy ? 0.52 : edge ? 0.26 : 0.1
          : heavy ? 0.58 : edge ? 0.34 : 0.14
        if (!force && seededRandom(x, y, 121) > decorationChance) return

        if (!force && !onBlockedTile && seededRandom(x, y, 117) < (edge ? 0.22 : 0.08)) {
          const floor = makeSoftTileBlob(
            {
              x: pos.x + (seededRandom(x, y, 118) - 0.5) * CELL * 0.26,
              z: pos.z + (seededRandom(x, y, 119) - 0.5) * CELL * 0.26
            },
            CELL * (edge ? 0.52 : 0.44),
            forestFloorMaterial,
            230 + x * 5 + y,
            0.041
          )
          root.add(floor)
        }

        const count = force
          ? 1
          : heavy && seededRandom(x, y, 122) > 0.72 ? 2 : 1
        const choices = force
          ? preferClearance
            ? ['stone', 'stone', 'rock']
            : ['bush', 'stone', 'rock']
          : onBlockedTile
          ? (edge ? ['bush', 'bush', 'stone', 'rock'] : ['bush', 'stone', 'rock'])
          : edge
            ? ['bush', 'grassLarge', 'stone', 'mushroom', 'flowerYellow']
            : ['bush', 'grassLarge', 'stone', 'mushroom']
        const edgeNudge = blockedEdgeTile ? getForestEdgeNudge(x, y) : { x: 0, z: 0 }
        const baseSpread = force
          ? preferClearance ? 0.12 : 0.22
          : heavy ? 0.72 : 0.58

        for (let i = 0; i < count; i += 1) {
          const roll = seededRandom(x, y, 125 + i)
          const key = choices[Math.floor(roll * choices.length) % choices.length]
          const offsetX = edgeNudge.x * (force ? 0.45 : 0.2) + (seededRandom(x, y, 132 + i) - 0.5) * CELL * baseSpread
          const offsetZ = edgeNudge.z * (force ? 0.45 : 0.2) + (seededRandom(x, y, 139 + i) - 0.5) * CELL * baseSpread
          const rotation = seededRandom(x, y, 146 + i) * Math.PI * 2
          const baseScale = key === 'rock'
            ? preferClearance ? 0.74 : 0.82
            : key === 'stone'
              ? preferClearance ? 0.62 : 0.66
              : key.includes('flower')
                ? 0.74
                : key === 'mushroom'
                  ? 0.76
                  : force ? 0.9 : onBlockedTile ? 1.02 : 0.9
          const scale = force
            ? baseScale + seededRandom(x, y, 153 + i) * 0.12
            : baseScale + seededRandom(x, y, 153 + i) * (heavy ? 0.38 : 0.22)
          placeForestModel(key, pos, scale, rotation, offsetX, offsetZ, key.includes('flower') || key === 'mushroom' ? 0.14 : 0.13)
        }
      }

      // 每个 grass cluster 在 InstancedMesh 上分配若干 sub-instance。
      // 把 sub-instance 的"局部基矩阵 localBase"存下来，动画里只需要
      // clusterMatrix(基位置 + 静态/动画旋转 + trample 缩放) × localBase × subMeshLocal
      // 然后 setMatrixAt 即可，无需重新分解矩阵。
      const createGrassCluster = (x, y, pos, insidePlayableArea, { compact = false } = {}) => {
        const staticRotY = ((x * 13 + y * 7) % 8) * Math.PI / 4
        const cluster = {
          tileX: x,
          tileY: y,
          basePosX: pos.x,
          basePosY: 0.08,
          basePosZ: pos.z,
          staticRotY,
          trampleUntil: 0,
          subInstances: []
        }
        const clusterCount = insidePlayableArea ? (compact ? 3 : 4) : 2

        const initialClusterMat = new THREE.Matrix4().compose(
          new THREE.Vector3(cluster.basePosX, cluster.basePosY, cluster.basePosZ),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, staticRotY, 0)),
          new THREE.Vector3(1, 1, 1)
        )

        const localPos = new THREE.Vector3()
        const localQuat = new THREE.Quaternion()
        const localEuler = new THREE.Euler(0, 0, 0, 'YXZ')
        const localScale = new THREE.Vector3()
        const tmpWorld = new THREE.Matrix4()

        for (let i = 0; i < clusterCount; i += 1) {
          const key = i % 2 === 0 ? 'grassLarge' : 'grass'
          const subScale = (compact ? 0.86 : 0.98) + seededRandom(x, y, 30 + i) * (compact ? 0.28 : 0.38)
          const spread = compact ? 0.46 : 0.62
          const ox = (seededRandom(x, y, 34 + i) - 0.5) * CELL * spread
          const oy = 0.1 + seededRandom(x, y, 38 + i) * 0.06
          const oz = (seededRandom(x, y, 42 + i) - 0.5) * CELL * spread
          const rotY = seededRandom(x, y, 46 + i) * Math.PI * 2

          localPos.set(ox, oy, oz)
          localEuler.set(0, rotY, 0)
          localQuat.setFromEuler(localEuler)
          localScale.setScalar(subScale)
          const localBase = new THREE.Matrix4().compose(localPos, localQuat, localScale)

          // 初始 world = clusterMatrix × localBase
          tmpWorld.multiplyMatrices(initialClusterMat, localBase)
          const refs = addInstanceMatrix(key, tmpWorld, { x, y })
          if (!refs) continue
          refs.forEach((ref) => {
            ref.mesh.getMatrixAt(ref.index, _instTmpMatrix)
            cluster.subInstances.push({
              mesh: ref.mesh,
              index: ref.index,
              localBase,
              staticMatrix: _instTmpMatrix.clone()
            })
          })
        }

        return cluster.subInstances.length > 0 ? cluster : null
      }

      const renderWaterBodies = () => {
        mapInfo?.waterBodies?.forEach((body, index) => {
          if (body.type === 'stream' && Array.isArray(body.points)) {
            for (let i = 0; i < body.points.length - 1; i += 1) {
              const [sx, sy] = body.points[i]
              const [ex, ey] = body.points[i + 1]
              const start = worldFromTile(sx, sy, width, height)
              const end = worldFromTile(ex, ey, width, height)
              const bank = makeCapsuleSegment(start, end, (body.width + 0.28) * CELL, waterBankMaterial, {
                y: 0.078,
                segments: 18
              })
              root.add(bank)

              const water = makeCapsuleSegment(start, end, body.width * CELL, waterMaterial, {
                y: 0.088,
                segments: 20
              })
              root.add(water)

              if (i % 2 === 0) {
                const deep = makeCapsuleSegment(start, end, body.width * CELL * 0.42, waterDeepMaterial, {
                  y: 0.096,
                  segments: 18
                })
                root.add(deep)
              }
            }
            return
          }

          const center = worldFromTile(body.x, body.y, width, height)
          const rotation = body.rotation ?? 0
          const rx = (body.rx ?? 2) * CELL
          const ry = (body.ry ?? 1.4) * CELL
          const salt = body.salt ?? index * 23

          const bank = makeOrganicEllipse(center, rx + CELL * 0.5, ry + CELL * 0.42, waterBankMaterial, {
            y: 0.078,
            rotation,
            salt,
            wobble: 0.035,
            segments: 82
          })
          root.add(bank)

          const water = makeOrganicEllipse(center, rx, ry, waterMaterial, {
            y: 0.088,
            rotation,
            salt: salt + 100,
            wobble: 0.02,
            segments: 90
          })
          root.add(water)

          const deepCenter = {
            x: center.x + Math.cos(rotation + 0.8) * rx * 0.12,
            z: center.z + Math.sin(rotation + 0.8) * ry * 0.12
          }
          const deep = makeOrganicEllipse(deepCenter, rx * 0.42, ry * 0.34, waterDeepMaterial, {
            y: 0.096,
            rotation: rotation + 0.28,
            salt: salt + 200,
            wobble: 0.025,
            segments: 58
          })
          root.add(deep)
        })
      }

      renderWaterBodies()

      const renderSmoothRoads = () => {
        if (mapInfo?.roadRenderStyle === 'organic') return false
        if (!Array.isArray(mapInfo?.visualPaths) || mapInfo.visualPaths.length === 0) return false

        const joinPatches = new Map()
        const addJoinPatch = (point, {
          edgeRadiusX,
          edgeRadiusZ = edgeRadiusX,
          roadRadiusX,
          roadRadiusZ = roadRadiusX
        }) => {
          const key = `${point.x.toFixed(3)},${point.z.toFixed(3)}`
          const current = joinPatches.get(key)
          if (current) {
            current.edgeRadiusX = Math.max(current.edgeRadiusX, edgeRadiusX)
            current.edgeRadiusZ = Math.max(current.edgeRadiusZ, edgeRadiusZ)
            current.roadRadiusX = Math.max(current.roadRadiusX, roadRadiusX)
            current.roadRadiusZ = Math.max(current.roadRadiusZ, roadRadiusZ)
            return
          }
          joinPatches.set(key, {
            point,
            edgeRadiusX,
            edgeRadiusZ,
            roadRadiusX,
            roadRadiusZ
          })
        }

        const isTurnPoint = (points, index) => {
          if (index <= 0 || index >= points.length - 1) return false
          const [prevX, prevY] = points[index - 1]
          const [x, y] = points[index]
          const [nextX, nextY] = points[index + 1]
          const sameVertical = prevX === x && x === nextX
          const sameHorizontal = prevY === y && y === nextY
          return !(sameVertical || sameHorizontal)
        }

        mapInfo.visualPaths.forEach((path, pathIndex) => {
          const points = Array.isArray(path.points) ? path.points : []
          if (points.length < 2) return

          const radius = (path.radius ?? 0.86) * CELL
          const edgeRadius = (path.edgeRadius ?? (path.radius ?? 0.86) + 0.16) * CELL
          const worldPoints = points.map(([px, py]) => worldFromTile(px, py, width, height))

          for (let i = 0; i < worldPoints.length - 1; i += 1) {
            const edge = makeCapsuleSegment(worldPoints[i], worldPoints[i + 1], edgeRadius, pathEdgeMaterial, {
              y: 0.105,
              segments: 20
            })
            root.add(edge)
            pathObjects.push(edge)

            const road = makeCapsuleSegment(worldPoints[i], worldPoints[i + 1], radius, pathMaterial, {
              y: 0.118,
              segments: 22
            })
            root.add(road)
            pathObjects.push(road)
          }

          worldPoints.forEach((point, pointIndex) => {
            const bendBoost = isTurnPoint(points, pointIndex)
              ? { edge: CELL * 0.18, road: CELL * 0.16 }
              : { edge: 0, road: 0 }
            addJoinPatch(point, {
              edgeRadiusX: edgeRadius + bendBoost.edge,
              edgeRadiusZ: edgeRadius + bendBoost.edge,
              roadRadiusX: radius + bendBoost.road,
              roadRadiusZ: radius + bendBoost.road
            })

            if (pathIndex === 0 && pointIndex % 3 === 1) {
              const softTone = makeHorizontalCircle(radius * 0.26, pathHighlightMaterial, 20)
              softTone.position.set(
                point.x + (seededRandom(pointIndex, pathIndex, 301) - 0.5) * radius * 0.5,
                0.124,
                point.z + (seededRandom(pointIndex, pathIndex, 302) - 0.5) * radius * 0.42
              )
              root.add(softTone)
              pathObjects.push(softTone)
            }
          })
        })

        ;(mapInfo?.roadJunctions || []).forEach((junction) => {
          const point = worldFromTile(junction.x, junction.y, width, height)
          const rx = Number(junction.rx) || 1
          const ry = Number(junction.ry) || 1
          addJoinPatch(point, {
            edgeRadiusX: Math.max(CELL * rx * 0.88, CELL * 0.96),
            edgeRadiusZ: Math.max(CELL * ry * 0.88, CELL * 0.96),
            roadRadiusX: Math.max(CELL * rx * 0.74, CELL * 0.82),
            roadRadiusZ: Math.max(CELL * ry * 0.74, CELL * 0.82)
          })
        })

        joinPatches.forEach((patch) => {
          const edgeJoin = makeHorizontalCircle(1, pathEdgeMaterial, 28)
          edgeJoin.scale.set(patch.edgeRadiusX, patch.edgeRadiusZ, 1)
          edgeJoin.position.set(patch.point.x, 0.105, patch.point.z)
          root.add(edgeJoin)
          pathObjects.push(edgeJoin)

          const roadJoin = makeHorizontalCircle(1, pathMaterial, 30)
          roadJoin.scale.set(patch.roadRadiusX, patch.roadRadiusZ, 1)
          roadJoin.position.set(patch.point.x, 0.118, patch.point.z)
          root.add(roadJoin)
          pathObjects.push(roadJoin)
        })

        return true
      }

      const useSmoothRoads = renderSmoothRoads()

      const renderSmoothForestTrails = () => {
        if (!Array.isArray(mapInfo?.forestTrails) || mapInfo.forestTrails.length === 0) return

        mapInfo.forestTrails.forEach((trail, trailIndex) => {
          const points = Array.isArray(trail.points) ? trail.points : []
          if (points.length < 2) return

          const radius = (trail.radius ?? 0.48) * CELL
          const worldPoints = points.map(([px, py]) => worldFromTile(px, py, width, height))

          for (let i = 0; i < worldPoints.length - 1; i += 1) {
            const from = { ...worldPoints[i] }
            const to = { ...worldPoints[i + 1] }
            const [fromTileX, fromTileY] = points[i]
            const [toTileX, toTileY] = points[i + 1]
            const dx = to.x - from.x
            const dz = to.z - from.z
            const length = Math.max(Math.hypot(dx, dz), 0.001)
            const trim = Math.min(CELL * 0.55 / length, 0.42)

            if (getRenderedTile(fromTileX, fromTileY) === 12) {
              from.x += dx * trim
              from.z += dz * trim
            }
            if (getRenderedTile(toTileX, toTileY) === 12) {
              to.x -= dx * trim
              to.z -= dz * trim
            }

            const trailSegment = makeCapsuleSegment(from, to, radius, forestTrailMaterial, {
              y: 0.035,
              segments: 16
            })
            root.add(trailSegment)
          }

          worldPoints.forEach((point, pointIndex) => {
            const [tileX, tileY] = points[pointIndex]
            if (getRenderedTile(tileX, tileY) === 12) return
            const join = makeHorizontalCircle(radius, forestTrailMaterial, 18)
            join.position.set(point.x, 0.035 + (trailIndex + pointIndex) * 0.0001, point.z)
            root.add(join)
          })
        })
      }

      renderSmoothForestTrails()

      for (let y = -VISUAL_PADDING_TILES; y < height + VISUAL_PADDING_TILES; y += 1) {
        for (let x = -VISUAL_PADDING_TILES; x < width + VISUAL_PADDING_TILES; x += 1) {
          const insidePlayableArea = x >= 0 && x < width && y >= 0 && y < height
          const legacy = insidePlayableArea ? mapGrid[y][x] : getVisualTile(mapGrid, x, y)
          const pos = worldFromTile(x, y, width, height)
          const blockedEdgeTile = !isLegacyTileWalkableValue(legacy) && hasWalkableCardinalNeighbor(mapGrid, x, y)

          if (!useSmoothRoads && (legacy === 12 || legacy === 2)) {
            const isJunction = isRoadJunctionTile(x, y)
            const edge = makeSoftTileBlob(pos, CELL * (isJunction ? 0.96 : 0.78), pathEdgeMaterial, 100 + x * 3 + y, 0.039)
            root.add(edge)
            pathObjects.push(edge)

            const path = makeSoftTileBlob(pos, CELL * (isJunction ? 0.8 : 0.64), pathMaterial, 120 + x * 3 + y, 0.047)
            root.add(path)
            pathObjects.push(path)
          }

          if (legacy === 13 && insidePlayableArea) {
            const sandPatch = makeSoftTileBlob(
              pos,
              CELL * (0.66 + seededRandom(x, y, 201) * 0.08),
              sandPatchMaterial,
              200 + x * 3 + y,
              0.038
            )
            root.add(sandPatch)
          }

          if (legacy === 17 && insidePlayableArea) {
            const palePatch = makeSoftTileBlob(
              pos,
              CELL * (0.64 + seededRandom(x, y, 211) * 0.08),
              paleGrassPatchMaterial,
              210 + x * 3 + y,
              0.04
            )
            root.add(palePatch)
          }

          if (legacy === 8) {
            const grass = createGrassCluster(x, y, pos, insidePlayableArea, { compact: isNearRoad(x, y) })
            if (!grass) continue
            if (insidePlayableArea) {
              grassObjects.set(`${x},${y}`, grass)
            }
          }

          if (legacy === 0 && insidePlayableArea && !isNearRoad(x, y)) {
            const detailRoll = seededRandom(x, y, 70)
            const offsetX = (seededRandom(x, y, 71) - 0.5) * CELL * 0.58
            const offsetZ = (seededRandom(x, y, 72) - 0.5) * CELL * 0.58
            const rotation = seededRandom(x, y, 73) * Math.PI * 2

            if (detailRoll > 0.97) {
              placeSmallDecoration('flowerYellow', pos, 0.92, rotation, offsetX, offsetZ)
            } else if (detailRoll > 0.94) {
              placeSmallDecoration('flowerRed', pos, 0.88, rotation, offsetX, offsetZ)
            } else if (detailRoll > 0.91) {
              placeSmallDecoration('bush', pos, 0.72, rotation, offsetX, offsetZ)
            } else if (detailRoll > 0.89) {
              placeSmallDecoration('stone', pos, 0.56, rotation, offsetX, offsetZ)
            } else if (detailRoll > 0.87) {
              placeSmallDecoration('mushroom', pos, 0.72, rotation, offsetX, offsetZ)
            }
          }

          if (legacy === 1) {
            if (mapInfo?.renderForestWallUndergrowth === false) continue
            if (isInRoadClearance(mapInfo, x, y, 0.7)) {
              if (blockedEdgeTile) {
                placeForestUndergrowth(x, y, pos, {
                  edge: true,
                  heavy: true,
                  force: true,
                  preferClearance: true
                })
              }
              continue
            }

            const renderForestWallTrees = mapInfo?.renderForestWallTrees !== false
            if (!renderForestWallTrees) {
              if (blockedEdgeTile || seededRandom(x, y, 12) < 0.42) {
                placeForestUndergrowth(x, y, pos, {
                  edge: isForestEdge(x, y),
                  heavy: true,
                  force: blockedEdgeTile
                })
              }
              continue
            }

            const edge = isForestEdge(x, y)
            const treeRoll = seededRandom(x, y, 12)
            const shouldRenderTree = insidePlayableArea
              ? treeRoll < (edge ? 0.9 : 0.96)
              : treeRoll < 0.9

            if (!shouldRenderTree) {
              placeForestUndergrowth(x, y, pos, {
                edge,
                heavy: true,
                force: blockedEdgeTile
              })
              continue
            }

            const key = tileObjectKey(x, y)
            const baseScale = key === 'treePine' ? 1.62 : key === 'treeOak' ? 1.46 : 1.38
            const edgeScale = edge ? 0.84 : 1
            const treeScale = baseScale * edgeScale * (0.9 + seededRandom(x, y, 14) * 0.2)
            const finalScale = insidePlayableArea ? treeScale : treeScale * 0.94
            const edgeNudge = edge ? getForestEdgeNudge(x, y) : { x: 0, z: 0 }
            addInstance(
              key,
              pos.x + edgeNudge.x + (seededRandom(x, y, 15) - 0.5) * CELL * 0.16,
              0.08,
              pos.z + edgeNudge.z + (seededRandom(x, y, 16) - 0.5) * CELL * 0.16,
              ((x * 5 + y * 9) % 12) * Math.PI / 6,
              finalScale
            )

            if (seededRandom(x, y, 8) > (edge ? 0.78 : 0.9)) {
              placeForestUndergrowth(x, y, pos, { edge, heavy: false })
            }
          }

          if (
            legacy === 20 &&
            blockedEdgeTile &&
            mapInfo?.renderForestWallUndergrowth !== false &&
            !isDynamicBlockerVisualSuppressed(mapInfo, mapGrid, x, y, collectedEventIdSet, currentMapName)
          ) {
            placeForestUndergrowth(x, y, pos, {
              edge: true,
              heavy: true,
              force: true,
              preferClearance: isInRoadClearance(mapInfo, x, y, 0.68)
            })
          }
        }
      }

      mapInfo?.bridges?.forEach((bridge) => {
        const pos = worldFromTile(bridge.x, bridge.y, width, height)
        const model = createBridge(bridge, visualPalette)
        model.position.set(pos.x, 0.11, pos.z)
        root.add(model)
      })

      const signaledEventIds = new Set()
      const renderedPickupEventIds = new Set()
      const runtimeEventById = new Map(
        (Array.isArray(mapInfo?.runtimeEvents) ? mapInfo.runtimeEvents : [])
          .filter((event) => typeof event?.id === 'string')
          .map((event) => [event.id, event])
      )
      const decorationStats = mapDebugEnabled
        ? { total: 0, rendered: 0, skippedNoSpec: 0, skippedNoModel: 0, skippedBlocked: 0, skippedRoad: 0, treasures: 0, skippedCollected: 0, skippedDuplicateTreasures: 0 }
        : null
      const trackDecorationStat = (key) => {
        if (decorationStats && Object.prototype.hasOwnProperty.call(decorationStats, key)) {
          decorationStats[key] += 1
        }
      }
      mapInfo?.decorativeObjects?.forEach((object) => {
        trackDecorationStat('total')

        // 过滤已拾取的宝箱
        if ((object.eventType === 'item' || object.eventType === 'pickup') &&
            typeof object.eventId === 'string' &&
            isCollectedMapEventId(collectedEventIdSet, currentMapName, object.eventId)) {
          trackDecorationStat('skippedCollected')
          return
        }

        const spec = getDecorativeModel(object.type)
        if (!spec) {
          trackDecorationStat('skippedNoSpec')
          if (mapDebugEnabled && (object.eventType === 'item' || object.eventType === 'pickup')) {
            console.error(`[Treasure Debug] Missing spec for treasure type: ${object.type}`, object)
          }
          return
        }
        if (!models[spec.key] && !isEliteFourCharacterType(spec.key) && !ELITE_FOUR_LANDMARK_TYPES.has(spec.key)) {
          trackDecorationStat('skippedNoModel')
          if (mapDebugEnabled && (object.type?.includes('rock') || object.type?.includes('stone'))) {
            console.warn(`[Map Debug] Missing model for ${object.type} (key: ${spec.key})`)
          }
          if (mapDebugEnabled && (object.eventType === 'item' || object.eventType === 'pickup')) {
            console.error(`[Treasure Debug] Missing model for treasure:`, {
              type: object.type,
              specKey: spec.key,
              eventId: object.eventId,
              position: { x: object.x, y: object.y }
            })
          }
          return
        }
        if (object.eventType === 'item' || object.eventType === 'pickup') {
          trackDecorationStat('treasures')
          if (mapDebugEnabled) {
            console.log(`[Treasure Debug] Rendering treasure:`, {
              type: object.type,
              eventId: object.eventId,
              position: { x: object.x, y: object.y },
              hasSpec: true,
              hasModel: true,
              specKey: spec.key
            })
          }
        }
        if ((object.eventType === 'item' || object.eventType === 'pickup') && typeof object.eventId === 'string') {
          if (renderedPickupEventIds.has(object.eventId)) {
            trackDecorationStat('skippedDuplicateTreasures')
            return
          }
          renderedPickupEventIds.add(object.eventId)
        }
        if (!object.eventType && shouldHideBlockedLowVegetation(object, mapGrid)) {
          trackDecorationStat('skippedBlocked')
          return
        }
        if (ROAD_CLEAR_DECOR_TYPES.has(object.type) && isInRoadClearance(mapInfo, object.x, object.y, object.roadClearance ?? 0.65)) {
          trackDecorationStat('skippedRoad')
          return
        }
        trackDecorationStat('rendered')
        const pos = worldFromTile(object.x, object.y, width, height)
        const rawEventType = resolveDecorativeObjectSignalType(object, mapInfo, mapGrid) || object.eventType
        const eventType = rawEventType ? resolvePickupRewardSignalEventType(rawEventType) : null
        const dynamicTileEventType = typeof object.dynamicTileEventType === 'string' ? object.dynamicTileEventType : null
        const usesDynamicTileVisibility = Boolean(object.dynamicTileVisibility && dynamicTileEventType)
        const dynamicTileVisibleTiles = Array.isArray(object.dynamicTileVisibleTiles)
          ? object.dynamicTileVisibleTiles.map((tile) => Math.trunc(Number(tile))).filter(Number.isSafeInteger)
          : null
        const baseModelScale = resolveThemeLandmarkRenderScale(object.type, object.scale ?? spec.scale)
        const lockedModelScale = object.hiddenGateEntranceBlocker === true && Number.isFinite(Number(object.hiddenGateLockedScale))
          ? resolveThemeLandmarkRenderScale(object.type, object.hiddenGateLockedScale)
          : baseModelScale
        const objectTileX = Math.trunc(Number(object.x))
        const objectTileY = Math.trunc(Number(object.y))
        const currentObjectTile = Number.isSafeInteger(objectTileX) && Number.isSafeInteger(objectTileY)
          ? getLegacyTile(mapGrid, objectTileX, objectTileY)
          : null
        const modelScale = object.hiddenGateEntranceBlocker === true && currentObjectTile === REGION_MAP_TILE.objectBlocker
          ? lockedModelScale
          : baseModelScale
        const modelLift = (object.eventType === 'item' || object.eventType === 'pickup')
          ? (object.height ?? -0.05)
          : (object.height ?? 0.2)
        const decorationRotationY = resolveDecorationRotationY(object)
        const shouldAddGenericSignal = Boolean(eventType)
        const signalBaseY = eventType
          ? getEventSignalBaseY(eventType, object.npcRole, modelScale, modelLift, models[spec.key])
          : 0.02
        const signalOffsetZ = eventType
          ? getNpcSignalForwardOffsetZ(eventType, object.npcRole)
          : 0
        const alwaysVisibleSignal = Boolean(object.alwaysVisibleSignal) || isPickupRewardDecoration(object) || isAlwaysVisibleMapSignal(eventType, object.npcRole)
        const signal = shouldAddGenericSignal
          ? addEventSignalAt(
            Number(object.x),
            Number(object.y),
            eventType,
            {
              alwaysVisible: alwaysVisibleSignal,
              eventId: typeof object.eventId === 'string' ? object.eventId : null,
              npcRole: object.npcRole,
              baseY: signalBaseY,
              offsetX: object.offsetX ?? 0,
              offsetZ: (object.offsetZ ?? 0) + signalOffsetZ
            }
          )
          : null
        const eliteLandmark = createEliteFourLandmark(object.type)
        let refs = []
        if (eliteLandmark) {
          eliteLandmark.position.set(
            pos.x + (object.offsetX ?? 0),
            modelLift,
            pos.z + (object.offsetZ ?? 0)
          )
          eliteLandmark.rotation.y = decorationRotationY
          eliteLandmark.scale.setScalar(resolveEliteFourLandmarkScale(object.type, modelScale))
          root.add(eliteLandmark)
        } else {
          refs = addInstance(
            spec.key,
            pos.x + (object.offsetX ?? 0),
            modelLift,
            pos.z + (object.offsetZ ?? 0),
            decorationRotationY,
            modelScale
          )
        }
        let npcFacingController = null
        if (isNpcInteractionDecoration(object, eventType)) {
          npcFacingController = createNpcFacingController({
            eventType,
            eventId: object.eventId,
            tileX: objectTileX,
            tileY: objectTileY,
            refs,
            posX: pos.x + (object.offsetX ?? 0),
            posY: modelLift,
            posZ: pos.z + (object.offsetZ ?? 0),
            rotationY: decorationRotationY,
            scale: modelScale,
            routeBlockerEvent: runtimeEventById.get(object.eventId) || null
          })
          if (npcFacingController) {
            npcFacingControllers.push(npcFacingController)
            npcFacingControllersByEventId.set(object.eventId, npcFacingController)
          }
        }
        if (eventType && typeof object.eventId === 'string' && object.eventId.length > 0) {
          signaledEventIds.add(object.eventId)
        }
        if (eventType === 'item' || eventType === 'pickup' || usesDynamicTileVisibility) {
          const dynamicTileEventId = usesDynamicTileVisibility && typeof object.dynamicTileEventId === 'string'
            ? object.dynamicTileEventId
            : null
          const dynamicTileEvent = dynamicTileEventId ? runtimeEventById.get(dynamicTileEventId) : null
          const dynamicTileX = usesDynamicTileVisibility && dynamicTileEvent
            ? Math.trunc(Number(dynamicTileEvent.position?.x))
            : Math.trunc(Number(object.x))
          const dynamicTileY = usesDynamicTileVisibility && dynamicTileEvent
            ? Math.trunc(Number(dynamicTileEvent.position?.y))
            : Math.trunc(Number(object.y))
          const controller = createDynamicEventDecorationController({
            eventType: usesDynamicTileVisibility ? dynamicTileEventType : eventType,
            eventId: typeof (usesDynamicTileVisibility ? object.dynamicTileEventId : object.eventId) === 'string'
              ? (usesDynamicTileVisibility ? object.dynamicTileEventId : object.eventId)
              : null,
            tileX: dynamicTileX,
            tileY: dynamicTileY,
            visibleTiles: dynamicTileVisibleTiles,
            refs,
            object3D: null,
            posX: pos.x + (object.offsetX ?? 0),
            posY: modelLift,
            posZ: pos.z + (object.offsetZ ?? 0),
            rotationY: decorationRotationY,
            scale: baseModelScale,
            lockedScale: lockedModelScale,
            signal
          })
          if (controller) {
            controller.syncFromState(mapGrid, collectedEventIdSet)
            dynamicEventDecorations.push(controller)
          }
        }
        const npcRoleEffect = createNpcRoleEffect(object.npcRole, npcRoleEffects.length, {
          eventId: typeof object.eventId === 'string' ? object.eventId : null,
          modelScale,
          modelLift,
          visualTheme: object.visualTheme,
          muted: false
        })
        if (npcRoleEffect) {
          npcRoleEffect.position.set(
            pos.x + (object.offsetX ?? 0),
            0,
            pos.z + (object.offsetZ ?? 0)
          )
          root.add(npcRoleEffect)
          npcRoleEffects.push(npcRoleEffect)
        }
        npcFacingController?.addCompanions?.([signal, npcRoleEffect])
        registerEventVisualBinding({
          eventId: typeof object.eventId === 'string' ? object.eventId : null,
          eventType,
          signal,
          npcRoleEffect,
          npcFacingController
        })
      })
      if (mapDebugEnabled && decorationStats) {
        console.log(`[Map Debug] Decoration rendering stats:`, decorationStats)
      }

      ;(Array.isArray(mapInfo?.runtimeEvents) ? mapInfo.runtimeEvents : []).forEach((event) => {
        if (!event?.type || signaledEventIds.has(event.id)) return
        const eventX = Number(event.position?.x)
        const eventY = Number(event.position?.y)
        const visualAnchor = getEventVisualAnchor(mapInfo, event.id, event.type)
        const signalX = visualAnchor?.x ?? eventX
        const signalY = visualAnchor?.y ?? eventY
        const signalOffsetX = visualAnchor?.offsetX ?? 0
        const signalOffsetZ = visualAnchor?.offsetZ ?? 0
        if (!Number.isFinite(signalX) || !Number.isFinite(signalY)) return

        if (PICKUP_REWARD_EVENT_TYPES.has(event.type)) {
          if (isCollectedMapEventId(collectedEventIdSet, currentMapName, event.id)) return
          const pickupSignalType = resolvePickupRewardSignalEventType(event.type)
          const signal = addEventSignalAt(signalX, signalY, pickupSignalType, {
            alwaysVisible: true,
            eventId: typeof event.id === 'string' ? event.id : null,
            offsetX: signalOffsetX,
            offsetZ: signalOffsetZ
          })
          registerEventVisualBinding({
            eventId: typeof event.id === 'string' ? event.id : null,
            eventType: event.type,
            signal
          })
          return
        }

        if (!['warp', 'fast_travel', 'heal', 'challenge', 'objective', 'sign', 'info', 'merchant'].includes(event.type)) return
        let objectiveDevice = null
        if (event.type === 'objective') {
          objectiveDevice = createObjectiveDevice(
            event.properties?.theme,
            event.properties?.visualKind,
            objectiveDevices.length
          )
          const devicePos = worldFromTile(signalX, signalY, width, height)
          objectiveDevice.position.set(
            devicePos.x + signalOffsetX,
            0,
            devicePos.z + signalOffsetZ
          )
          root.add(objectiveDevice)
          objectiveDevices.push(objectiveDevice)
        }
        // Objective devices already carry a themed base, halo, emissive core and
        // state animation. Stacking the generic event beacon on every step added
        // duplicate transparent meshes and point lights across late-game maps.
        const signal = event.type === 'objective' ? null : addEventSignalAt(signalX, signalY, event.type, {
          alwaysVisible: isAlwaysVisibleMapSignal(event.type, event.properties?.role),
          eventId: typeof event.id === 'string' ? event.id : null,
          offsetX: signalOffsetX,
          offsetZ: signalOffsetZ
        })
        registerEventVisualBinding({
          eventId: typeof event.id === 'string' ? event.id : null,
          eventType: event.type,
          signal,
          objectiveDevice
        })
      })

      finalizeInstancedMeshes()

      resize()
      recoverAttemptsRef.current = 0
      setRenderIssue(null)
    }

    const handleResize = () => resize()
    window.addEventListener('resize', handleResize)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => resize())
      resizeObserver.observe(host)
    }

    resize()
    buildWorld().catch((error) => {
      scheduleRendererRestart('build-world-failed', error, 260)
    })

    const runHealthCheck = () => {
      if (disposed || !renderer) return
      const context = renderer.getContext?.()
      const contextLost = Boolean(context?.isContextLost?.())
      const missingCanvas = !host.contains(renderer.domElement)
      const missingPlayer = !stateRef.current?.player
      if (contextLost) {
        browserContextLost = true
        reportRenderIssue('地图渲染被浏览器暂停，请点击重建地图。')
        return
      }
      if (missingCanvas || missingPlayer) {
        scheduleRendererRestart(
          missingCanvas ? 'canvas-detached-health-check' : 'world-build-health-check'
        )
      }
    }
    healthTimerId = window.setTimeout(runHealthCheck, 1800)

    function notifyPlayerIdle(state) {
      if (!state?.pointer || state.pointer.moving) return
      state.onPlayerMove?.({
        x: state.pointer.tileX,
        y: state.pointer.tileY,
        direction: state.pointer.direction || 'down',
        idle: true,
        encounterCooldownSteps: cooldownRef.current
      })
    }

    function finishStep(step) {
      const state = stateRef.current
      if (!state) return true
      state.onPlayerMove?.({ x: step.tileX, y: step.tileY, direction: step.direction })
      state.syncCameraTargetToTile?.(step.tileX, step.tileY)
      syncNpcFacingWithPlayer(step.tileX, step.tileY)
      const zone = getEncounterZoneAt(state.currentMapName, step.tileX, step.tileY)
      const zoneLock = zone?.id ? state.encounterZoneLocks?.[zone.id] : null
      if (zone?.name && state.lastZoneId !== zone.id) {
        state.lastZoneId = zone.id
        state.onZoneEnter?.(zone.name, {
          zoneId: zone.id,
          locked: Boolean(zoneLock?.blocked),
          lockReason: zoneLock?.reason || ''
        })
      }

      const grass = grassObjects.get(`${step.tileX},${step.tileY}`)
      const isGrassStep = Boolean(grass) || ENCOUNTER_LEGACY_TILES.has(step.legacyTile)
      if (isGrassStep) {
        gameAudio.playMapTouch({ kind: 'grass' })
      }
      if (grass) {
        const grassKey = `${step.tileX},${step.tileY}`
        if (grass.subInstances) {
          grass.trampleUntil = performance.now() + TRAMPLED_GRASS_MS
          activeTrampleGrassKeys.add(grassKey)
        } else if (grass.userData) {
          grass.userData.trampleUntil = performance.now() + TRAMPLED_GRASS_MS
        }
      }

      return handleStepInteractionOrEncounter(step)
    }

    function faceNpcForInteraction(mapEvent, playerTileX, playerTileY) {
      if (!mapEvent?.id) return false
      const state = stateRef.current
      const controller = state?.npcFacingControllersByEventId?.get(mapEvent.id)
      if (!controller?.facePlayer) return false
      const changed = controller.facePlayer(playerTileX, playerTileY)
      if (changed) state?.kickAnimation?.()
      return changed
    }

    function syncNpcFacingWithPlayer(playerTileX, playerTileY) {
      const state = stateRef.current
      const controllers = state?.npcFacingControllers
      if (!Array.isArray(controllers) || controllers.length === 0) return false
      let changed = false
      controllers.forEach((controller) => {
        if (controller?.syncWithPlayerTile?.(playerTileX, playerTileY)) {
          changed = true
        }
      })
      if (changed) state?.kickAnimation?.()
      return changed
    }

    function setFacing(direction, options = {}) {
      const state = stateRef.current
      const vec = DIRS[direction]
      if (!state || !vec) return false
      const pointerState = state.pointer
      const changed = pointerState.direction !== direction
      pointerState.direction = direction
      if (state.player) {
        state.player.rotation.y = vec.rot
      }
      if (options.notify && changed) {
        state.onPlayerMove?.({ x: pointerState.tileX, y: pointerState.tileY, direction })
      }
      return true
    }

    function startMove(direction, options = {}) {
      const state = stateRef.current
      if (!state || state.cloudBlocked || state.encounterPending || !state.mapActive || !state.player) return
      const pointerState = state.pointer
      const vec = DIRS[direction]
      if (!vec) return false
      const nextX = pointerState.tileX + vec.x
      const nextY = pointerState.tileY + vec.y
      const legacyTile = getLegacyTile(state.mapGrid, nextX, nextY)
      const { interaction } = resolveInteractionFromEvent(nextX, nextY, INTERACTION_LEGACY_TILES[legacyTile])
      const lockedEncounterZone = getLockedEncounterZoneAt(state, nextX, nextY)
      const blockedByInteraction = isBlockingInteraction(interaction)

      if (lockedEncounterZone || !isWalkable(state.mapGrid, nextX, nextY) || blockedByInteraction) {
        setFacing(direction, { notify: true })
        state.onBlockedMove?.({
          tileX: pointerState.tileX,
          tileY: pointerState.tileY,
          targetX: nextX,
          targetY: nextY,
          direction,
          legacyTile,
          zone: lockedEncounterZone?.zone || null,
          zoneLock: lockedEncounterZone?.zoneLock || null
        })
        if (blockedByInteraction && interaction) {
          handleBlockedInteraction({
            tileX: pointerState.tileX,
            tileY: pointerState.tileY,
            targetX: nextX,
            targetY: nextY,
            legacyTile
          })
        }
        return false
      }

      const width = state.mapGrid[0].length
      const height = state.mapGrid.length
      const from = options.from ?? state.player.position.clone()
      const toPos = worldFromTile(nextX, nextY, width, height)
      pointerState.tileX = nextX
      pointerState.tileY = nextY
      pointerState.direction = direction
      pointerState.moving = true
      state.kickAnimation?.()
      state.player.rotation.y = vec.rot
      pointerState.target = {
        from,
        to: new THREE.Vector3(toPos.x, PLAYER_BASE_Y, toPos.z),
        rot: vec.rot,
        elapsed: 0,
        lastNow: options.now ?? performance.now(),
        continuous: Boolean(options.continuous),
        step: { tileX: nextX, tileY: nextY, direction, legacyTile }
      }
      return true
    }

    function requestMove(direction) {
      const state = stateRef.current
      if (!state || state.cloudBlocked || state.encounterPending || !state.mapActive || !state.player) return false
      const pointerState = state.pointer
      if (pointerState.moving) {
        pointerState.queued = direction
        return false
      }
      return startMove(direction)
    }

    function clearMoveDelayTimer() {
      if (!moveDelayTimerId) return
      window.clearTimeout(moveDelayTimerId)
      moveDelayTimerId = 0
    }

    function beginPress(direction) {
      const state = stateRef.current
      if (!state || state.cloudBlocked || state.encounterPending || !state.mapActive) return
      const vec = DIRS[direction]
      if (!vec) return
      clearMoveDelayTimer()

      state.pointer.holdDirection = direction
      state.kickAnimation?.()
      if (state.pointer.moving) {
        state.pointer.queued = direction
        return
      }

      setFacing(direction, { notify: true })
      const nextX = state.pointer.tileX + vec.x
      const nextY = state.pointer.tileY + vec.y
      const legacyTile = getLegacyTile(state.mapGrid, nextX, nextY)
      const { interaction } = resolveInteractionFromEvent(nextX, nextY, INTERACTION_LEGACY_TILES[legacyTile])
      if (getLockedEncounterZoneAt(state, nextX, nextY) || !isWalkable(state.mapGrid, nextX, nextY) || isBlockingInteraction(interaction)) {
        requestMove(direction)
        return
      }

      moveDelayTimerId = window.setTimeout(() => {
        moveDelayTimerId = 0
        const nextState = stateRef.current
        if (!nextState) return
        if (nextState.pointer.holdDirection !== direction) return
        if (nextState.pointer.moving) {
          nextState.pointer.queued = direction
        } else {
          requestMove(direction)
        }
      }, TURN_TO_MOVE_DELAY_MS)
    }

    function getActiveCollectedEventIds() {
      const ids = new Set(stateRef.current?.collectedEventIdSet || collectedEventIdSet)
      const optimistic = optimisticCollectedEventIdsRef.current
      if (optimistic?.mapName === currentMapName) {
        optimistic.ids?.forEach((eventId) => ids.add(eventId))
      }
      return ids
    }

    function setOptimisticConsumableCollected(mapEvent, collected) {
      if (!['item', 'pickup'].includes(mapEvent?.type) || typeof mapEvent.id !== 'string') return false

      if (optimisticCollectedEventIdsRef.current.mapName !== currentMapName) {
        optimisticCollectedEventIdsRef.current = {
          mapName: currentMapName,
          ids: new Set()
        }
      }

      if (collected) {
        optimisticCollectedEventIdsRef.current.ids.add(mapEvent.id)
      } else {
        optimisticCollectedEventIdsRef.current.ids.delete(mapEvent.id)
      }

      if (stateRef.current) {
        stateRef.current.collectedEventIdSet = getActiveCollectedEventIds()
        if (Array.isArray(stateRef.current.dynamicEventDecorations)) {
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
          stateRef.current.dynamicEventDecorations.forEach((controller) => {
            if (!['item', 'pickup'].includes(controller?.eventType) || controller.eventId !== mapEvent.id) return
            if (collected) {
              controller.startCollect?.(now, stateRef.current?.triggerPickupBurst)
            } else {
              controller.syncFromState?.(stateRef.current.mapGrid, stateRef.current.collectedEventIdSet)
            }
          })
        }
      }

      return true
    }

    function dispatchCollectInteraction(interaction, context) {
      const mapEvent = context?.mapEvent
      const isConsumable = interaction === 'item' && ['item', 'pickup'].includes(mapEvent?.type)
      const optimistic = isConsumable ? setOptimisticConsumableCollected(mapEvent, true) : false
      const collectHandler = stateRef.current?.onCollect || onCollect
      const result = collectHandler?.(interaction, 1, context)

      if (optimistic && result && typeof result.then === 'function') {
        result.then((success) => {
          if (success === false) setOptimisticConsumableCollected(mapEvent, false)
        }).catch(() => {
          setOptimisticConsumableCollected(mapEvent, false)
        })
      } else if (optimistic && result === false) {
        setOptimisticConsumableCollected(mapEvent, false)
      }

      return result
    }

    function endPress(direction) {
      clearMoveDelayTimer()
      const state = stateRef.current
      if (!state) return
      if (!direction) {
        state.pointer.holdDirection = null
        state.pointer.queued = null
        return
      }
      if (state.pointer.holdDirection === direction) {
        state.pointer.holdDirection = null
      }
    }

    function resolveInteractionFromEvent(tileX, tileY, fallbackInteraction) {
      const safeFallbackInteraction = ['fast_travel', 'item', 'pickup'].includes(fallbackInteraction) ? null : fallbackInteraction
      const activeVisualState = stateRef.current?.mapEventVisualState || normalizedMapEventVisualState
      const activeBossCompleted = Boolean(stateRef.current?.currentMapBossCompleted ?? currentMapBossCompleted)
      const activeMapEvents = Array.isArray(stateRef.current?.mapInfo?.runtimeEvents)
        ? stateRef.current.mapInfo.runtimeEvents
        : getMapEvents(currentMapName)
      const relocatedRouteBlocker = activeMapEvents.find((event) => {
        const visualState = resolveEventVisualStateValue(event.id, activeVisualState, 'available')
        const interactionTile = getEliteRouteBlockerInteractionTile(event, visualState, activeBossCompleted)
        return interactionTile?.x === tileX && interactionTile?.y === tileY
      }) || null
      const mapEvent = relocatedRouteBlocker || getMapEventAt(currentMapName, tileX, tileY)
      if (!mapEvent && getMapSignMessage(currentMapName, tileX, tileY)) {
        return { interaction: 'info', mapEvent: null }
      }
      if (!mapEvent) return { interaction: safeFallbackInteraction, mapEvent: null }
      if (mapEvent.type === 'sign') {
        const activeGrid = stateRef.current?.mapGrid || mapGrid
        const activeTile = getLegacyTile(activeGrid, tileX, tileY)
        const isSignTile = activeTile === getMapEventTile('sign')
        const isLockedHiddenGateTile = isHiddenEncounterGateMapEvent(mapEvent) && activeTile === REGION_MAP_TILE.objectBlocker
        if (!isSignTile && !isLockedHiddenGateTile) {
          return { interaction: safeFallbackInteraction, mapEvent: null }
        }
      }
      if (['item', 'pickup'].includes(mapEvent.type)) {
        const activeCollectedEventIdSet = getActiveCollectedEventIds()
        if (isCollectedMapEventId(activeCollectedEventIdSet, currentMapName, mapEvent.id)) {
          return { interaction: null, mapEvent: null }
        }
      }
      if (mapEvent.type === 'warp') return { interaction: 'exit', mapEvent }
      if (mapEvent.type === 'fast_travel') return { interaction: 'fast_travel', mapEvent }
      if (mapEvent.type === 'sign') return { interaction: 'info', mapEvent }
      const battleVisualState = resolveEventVisualStateValue(
        mapEvent.id,
        activeVisualState,
        'available'
      )
      if (isEliteRouteBlockerCleared(
        mapEvent,
        battleVisualState,
        activeBossCompleted
      )) {
        return relocatedRouteBlocker
          ? { interaction: 'info', mapEvent }
          : { interaction: null, mapEvent: null }
      }
      if (shouldRouteBattleEventToInfo(
        mapEvent,
        activeVisualState,
        activeBossCompleted
      )) {
        return { interaction: 'info', mapEvent }
      }
      if (mapEvent.type === 'pickup') return { interaction: 'item', mapEvent }
      if (['item', 'heal', 'trainer', 'boss', 'challenge', 'objective', 'merchant'].includes(mapEvent.type)) {
        return { interaction: mapEvent.type, mapEvent }
      }
      return { interaction: safeFallbackInteraction, mapEvent }
    }

    function handleBlockedInteraction({ tileX, tileY, targetX, targetY, legacyTile }) {
      const baseInteraction = INTERACTION_LEGACY_TILES[legacyTile]
      const { interaction, mapEvent } = resolveInteractionFromEvent(targetX, targetY, baseInteraction)
      if (!interaction) return
      faceNpcForInteraction(mapEvent, tileX, tileY)
      const state = stateRef.current
      if (interaction === 'exit') {
        const warp = mapEvent?.type === 'warp'
          ? mapEvent
          : getMapEventAt(currentMapName, targetX, targetY, 'warp')
        if (warp) {
          state?.onMapWarp?.(warp)
        } else {
          state?.onCollect?.('info', 1, { tileX: targetX, tileY: targetY, mapEvent })
        }
      } else if (interaction === 'info') {
        state?.onCollect?.('info', 1, { tileX: targetX, tileY: targetY, mapEvent })
      } else if (['heal', 'trainer', 'boss', 'challenge', 'objective', 'fast_travel', 'merchant'].includes(interaction)) {
        state?.onCollect?.(interaction, 1, {
          tileX: targetX,
          tileY: targetY,
          mapEvent,
          playerPos: {
            x: tileX,
            y: tileY,
            direction: state?.pointer?.direction || 'down'
          },
          encounterCooldownSteps: cooldownRef.current
        })
      }
    }

    function handleStepInteractionOrEncounter({ tileX, tileY, legacyTile }) {
      const baseInteraction = INTERACTION_LEGACY_TILES[legacyTile]
      const { interaction, mapEvent } = resolveInteractionFromEvent(tileX, tileY, baseInteraction)
      const stepPlayerPos = {
        x: tileX,
        y: tileY,
        direction: stateRef.current?.pointer?.direction || 'down'
      }
      if (interaction) {
        faceNpcForInteraction(mapEvent, stepPlayerPos.x, stepPlayerPos.y)
        if (interaction === 'exit') {
          const warp = mapEvent?.type === 'warp'
            ? mapEvent
            : getMapEventAt(currentMapName, tileX, tileY, 'warp')
          if (warp) stateRef.current?.onMapWarp?.(warp)
          return false
        }
        dispatchCollectInteraction(interaction, {
          tileX,
          tileY,
          mapEvent,
          playerPos: stepPlayerPos,
          encounterCooldownSteps: cooldownRef.current
        })
        return !['heal', 'fast_travel'].includes(interaction)
      }

      if (!ENCOUNTER_LEGACY_TILES.has(legacyTile)) return true
      const zone = getEncounterZoneAt(currentMapName, tileX, tileY)
      const zoneLock = zone?.id ? stateRef.current?.encounterZoneLocks?.[zone.id] : null
      if (zoneLock?.blocked) return true
      const rate = zone?.tallGrassRate ?? mapConfig?.tallGrassRate ?? 0.2

      if (cooldownRef.current > 0) {
        cooldownRef.current -= 1
        return true
      }
      if (Math.random() >= rate) return true

      const tableId = zone?.encounterTableId || resolveEncounterTableId(currentMapName, true)
      const table = getEncounterTable(tableId)
      const encounter = pickWildPokemon(tableId)
      if (!encounter) return true
      const safeStepsRaw = Number(table?.safeStepsAfterBattle)
      const nextCooldownSteps = Number.isFinite(safeStepsRaw)
        ? Math.max(0, Math.trunc(safeStepsRaw))
        : 5
      const encounterState = stateRef.current
      const encounterHandler = encounterState?.onEncounter
      if (!encounterState || encounterState.encounterPending || encounterState.cloudBlocked || !encounterState.mapActive) {
        return false
      }
      if (typeof encounterHandler !== 'function') return true
      encounterState.encounterPending = true
      if (encounterState.pointer) {
        encounterState.pointer.holdDirection = null
        encounterState.pointer.queued = null
      }
      cooldownRef.current = nextCooldownSteps
      encounterState.onEncounterCooldownChange?.(nextCooldownSteps)
      const encounterPayload = {
        pokemonId: encounter.id,
        level: encounter.level,
        encounterTableId: tableId,
        encounterRate: rate,
        zoneId: zone?.id ?? null,
        zoneName: zone?.name ?? null,
        terrainType: legacyTile,
        playerPos: stepPlayerPos,
        encounterCooldownSteps: cooldownRef.current
      }
      const releaseEncounterPending = () => {
        const liveState = stateRef.current
        if (liveState) liveState.encounterPending = false
      }
      const runEncounterHandler = () => {
        const liveState = stateRef.current
        if (!liveState || liveState.cloudBlocked || !liveState.mapActive) {
          releaseEncounterPending()
          return
        }
        let encounterResult
        try {
          encounterResult = encounterHandler(encounterPayload)
        } catch (error) {
          releaseEncounterPending()
          console.error('[ThreeLowPolyMap] Encounter handler failed:', error)
          return
        }
        if (encounterResult && typeof encounterResult.then === 'function') {
          encounterResult.then(releaseEncounterPending, (error) => {
            releaseEncounterPending()
            console.error('[ThreeLowPolyMap] Encounter handler failed:', error)
          })
        } else {
          releaseEncounterPending()
        }
      }
      const alertEffect = encounterState.encounterAlertEffect
      if (alertEffect && encounterState.player) {
        gameAudio.playMapTouch({ kind: 'wild-alert' })
        alertEffect.userData.active = true
        alertEffect.userData.startedAt = performance.now()
        alertEffect.userData.duration = ENCOUNTER_ALERT_MS
        alertEffect.userData.onComplete = runEncounterHandler
        alertEffect.visible = true
        encounterState.kickAnimation?.()
      } else {
        runEncounterHandler()
      }
      return false
    }

    const isGrassTileInVisibleChunk = (tileX, tileY, visibleChunkIds, chunkGrid) => {
      if (!visibleChunkIds || !chunkGrid) return true
      const cx = Math.floor(tileX / chunkGrid.chunkTiles)
      const cy = Math.floor(tileY / chunkGrid.chunkTiles)
      return visibleChunkIds.has(cy * chunkGrid.chunkCountX + cx)
    }

    let last = performance.now()
    let frameId = null
    let idleFrameTimerId = 0
    let lastRenderedAt = 0

    // 性能监控：用于检测低帧率
    const frameTimings = []
    const MAX_FRAME_SAMPLES = 60
    let lowFpsWarningShown = false

    const scheduleAnimation = (delayMs = 0) => {
      if (frameId != null || idleFrameTimerId || disposed) return
      if (delayMs > 1) {
        idleFrameTimerId = window.setTimeout(() => {
          idleFrameTimerId = 0
          if (!disposed && frameId == null) {
            frameId = requestAnimationFrame(animate)
          }
        }, delayMs)
        return
      }
      frameId = requestAnimationFrame(animate)
    }

    const kickAnimation = () => {
      if (disposed) return
      if (idleFrameTimerId) {
        window.clearTimeout(idleFrameTimerId)
        idleFrameTimerId = 0
      }
      scheduleAnimation()
    }
    stateRef.current.kickAnimation = kickAnimation

    const hasActiveDynamicDecorationAnimation = (decorations) => (
      Array.isArray(decorations) && decorations.some((controller) => Boolean(controller?.collectingStartedAt))
    )

    const hasActiveNpcFacingAnimation = (controllers) => (
      Array.isArray(controllers) && controllers.some((controller) => Boolean(controller?.isAnimating?.()))
    )

    const hasActivePickupBurst = (bursts) => (
      Array.isArray(bursts) && bursts.some((burst) => Boolean(burst?.visible || burst?.userData?.active))
    )

    const hasActiveRestoreAnimation = (restoreBurst, animation) => {
      const activeId = restoreBurst?.userData?.activeId
      if (activeId) return true
      const animationId = animation?.id
      return Boolean(animationId && restoreBurst?.userData?.lastCompletedId !== animationId)
    }

    const hasActiveEncounterAlert = (effect) => Boolean(effect?.userData?.active)

    const hasActiveObjectiveDeviceAnimation = (devices) => (
      Array.isArray(devices) && devices.some((device) => Boolean(device?.userData?.activatedAt))
    )

    const shouldRunFullSpeedFrame = (state) => Boolean(
      state?.pointer?.moving ||
      state?.pointer?.queued ||
      state?.pointer?.holdDirection ||
      activeTrampleGrassKeys.size > 0 ||
      hasActiveDynamicDecorationAnimation(state?.dynamicEventDecorations) ||
      hasActiveNpcFacingAnimation(state?.npcFacingControllers) ||
      hasActivePickupBurst(state?.pickupBursts) ||
      hasActiveRestoreAnimation(state?.restoreBurst, state?.springRestoreAnimation) ||
      hasActiveEncounterAlert(state?.encounterAlertEffect) ||
      hasActiveObjectiveDeviceAnimation(state?.objectiveDevices)
    )

    const animate = (now) => {
      frameId = null
      const state = stateRef.current
      const mapShouldRun = Boolean(
        state?.mapActive &&
        (typeof document === 'undefined' || document.visibilityState === 'visible')
      )

      if (!mapShouldRun) {
        return
      }

      const activeFrameNeeded = shouldRunFullSpeedFrame(state)
      if (!activeFrameNeeded && lastRenderedAt) {
        const elapsedSinceRender = now - lastRenderedAt
        if (elapsedSinceRender < idleFrameIntervalMs) {
          scheduleAnimation(idleFrameIntervalMs - elapsedSinceRender)
          return
        }
      }

      const dt = Math.min((now - last) / 1000, 0.05)
      const frameTime = now - last

      // 性能监控：记录帧时间
      if (runtimeIsMobile && activeFrameNeeded) {
        frameTimings.push(frameTime)
        if (frameTimings.length > MAX_FRAME_SAMPLES) {
          frameTimings.shift()
        }

        // 每60帧检查一次平均帧率
        if (frameTimings.length >= MAX_FRAME_SAMPLES && !lowFpsWarningShown) {
          const avgFrameTime = frameTimings.reduce((a, b) => a + b, 0) / frameTimings.length
          const avgFps = 1000 / avgFrameTime

          // 如果活跃操作期间低于25fps，先降低空闲刷新频率，避免非交互时继续消耗资源。
          if (avgFps < 25) {
            idleFrameIntervalMs = Math.max(idleFrameIntervalMs, renderProfile.recoveryIdleFrameMs)
            if (mapDebugEnabled) {
              console.warn(
                `[ThreeLowPolyMap] 检测到活跃低帧率 (${avgFps.toFixed(1)} FPS)，` +
                `已把空闲刷新间隔调整为 ${Math.round(idleFrameIntervalMs)}ms。`
              )
            }
            lowFpsWarningShown = true
          }
        }
      }

      last = now
      lastRenderedAt = now
      grassSwayUniforms.uMapTime.value = now
      const player = state?.player
      if (player && state.pointer.moving && state.pointer.target) {
        const target = state.pointer.target
        const stepDelta = Math.min(Math.max(0, now - target.lastNow), 50)
        target.elapsed += stepDelta
        target.lastNow = now
        const moveDuration = target.continuous ? CONTINUOUS_MOVE_MS : MOVE_MS
        const t = Math.min(target.elapsed / moveDuration, 1)
        const progress = t
        player.position.x = THREE.MathUtils.lerp(target.from.x, target.to.x, progress)
        player.position.z = THREE.MathUtils.lerp(target.from.z, target.to.z, progress)
        player.position.y = PLAYER_BASE_Y + Math.sin(t * Math.PI) * 0.035
        player.rotation.y = lerpAngle(player.rotation.y, target.rot, 0.74)
        if (t >= 1) {
          player.position.set(target.to.x, PLAYER_BASE_Y, target.to.z)
          const canContinue = finishStep(target.step)
          const nextDirection = state.pointer.queued || state.pointer.holdDirection
          const shouldContinue = Boolean(nextDirection && state.pointer.holdDirection === nextDirection)
          state.pointer.queued = null

          if (canContinue && nextDirection) {
            setFacing(nextDirection, { notify: nextDirection !== target.step.direction })
          }

          if (canContinue && shouldContinue) {
            const continued = startMove(nextDirection, {
              from: target.to.clone(),
              now,
              continuous: true
            })
            if (continued) {
              player.position.y = PLAYER_BASE_Y
            } else {
              state.pointer.moving = false
              state.pointer.target = null
              notifyPlayerIdle(state)
            }
          } else {
            state.pointer.moving = false
            state.pointer.target = null
            notifyPlayerIdle(state)
          }
        }
      }

      if (player) {
        animateLowPolyPlayer(player, Boolean(state?.pointer?.moving), now, dt)
      }

	      updateHealingSpringEffects(state?.springEffects, now)
	      updateEventSignals(state?.eventSignals, now)
	      updateObjectiveDevices(state?.objectiveDevices, now)
		      updateNpcRoleEffects(state?.npcRoleEffects, now)
		      updateRestoreBurstEffect(state?.restoreBurst, state?.springRestoreAnimation, player, now)
      updateEncounterAlertEffect(state?.encounterAlertEffect, player, now)
		      if (Array.isArray(state?.dynamicEventDecorations)) {
	        state.dynamicEventDecorations.forEach((controller) => controller?.update?.(now))
	      }
	      if (Array.isArray(state?.npcFacingControllers)) {
	        state.npcFacingControllers.forEach((controller) => controller?.update?.(now))
	      }
	      updatePickupCollectBursts(state?.pickupBursts, now)

      if (player) {
        const liveFocus = clampCameraTarget(player.position.x, player.position.z)
        cameraTarget.copy(liveFocus)
        cameraFocus.copy(liveFocus)
        camera.position.set(cameraFocus.x, cameraHeight, cameraFocus.z + cameraForwardOffset)
        camera.lookAt(cameraFocus.x, cameraFocus.y, cameraFocus.z)
        sun.position.set(player.position.x + 12, 22, player.position.z + 8)
        sun.target.position.set(player.position.x, 0, player.position.z)
        sun.target.updateMatrixWorld()
      }

      // === Chunk 视锥剔除 ===
      // 先剔除再更新草丛：屏幕外的 chunk 不再做 CPU 矩阵重算，也不产生 draw call。
      const mapChunks = state?.mapChunks
      const chunkGrid = state?.chunkGrid
      let visibleChunkCount = 0
      if (mapChunks && mapChunks.length > 0) {
        const shouldRefreshChunkVisibility = activeFrameNeeded || visibilityDirty || visibleChunkIds.size === 0
        if (shouldRefreshChunkVisibility) {
          _frustumMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
          _viewFrustum.setFromProjectionMatrix(_frustumMat)
          visibleChunkIds.clear()
          for (let i = 0; i < mapChunks.length; i += 1) {
            const ch = mapChunks[i]
            const visible = _viewFrustum.intersectsBox(ch.boundingBox)
            ch.group.visible = visible
            if (visible) {
              visibleChunkCount += 1
              visibleChunkIds.add(ch.id)
            }
          }
          cachedVisibleChunkCount = visibleChunkCount
          visibilityDirty = false
        } else {
          visibleChunkCount = cachedVisibleChunkCount
        }
      }

      // 优化：只更新可见chunk中的踩踏草丛动画
      if (activeTrampleGrassKeys.size > 0) {
      for (const key of activeTrampleGrassKeys) {
        const grass = grassObjects.get(key)
        if (!grass?.subInstances) {
          activeTrampleGrassKeys.delete(key)
          continue
        }

        const tx = grass.tileX
        const ty = grass.tileY

        // 跳过不可见chunk中的草丛，节省CPU
        if (!isGrassTileInVisibleChunk(tx, ty, visibleChunkIds, chunkGrid)) {
          continue
        }

        const trample = Math.max(0, ((grass.trampleUntil ?? 0) - now) / TRAMPLED_GRASS_MS)
        if (trample <= 0) {
          activeTrampleGrassKeys.delete(key)
          if (grass._swayDisabled) {
            restoreGrassClusterStatic(grass)
          }
          continue
        }

        if (!grass._swayDisabled) {
          grass.subInstances.forEach((sub) => disableGrassInstanceSway(sub.mesh, sub.index))
          grass._swayDisabled = true
        }

        const ambientSway = Math.sin(now / 420 + tx * 0.8 + ty * 0.5) * 0.035
        const stompShake = trample * Math.sin(now / 34 + tx) * 0.16
        const rotZ = ambientSway + stompShake
        const rotX = trample * Math.sin(now / 48 + ty) * 0.08
        const scaleFactor = 1 + trample * (0.1 + Math.abs(Math.sin(now / 45)) * 0.08)

        _instTmpPos.set(grass.basePosX, grass.basePosY, grass.basePosZ)
        _instTmpEuler.set(rotX, grass.staticRotY, rotZ)
        _instTmpQuat.setFromEuler(_instTmpEuler)
        _instTmpScale.setScalar(scaleFactor)
        _instTmpComposed.compose(_instTmpPos, _instTmpQuat, _instTmpScale)

        const dirtyMeshes = grass._dirtyMeshes || (grass._dirtyMeshes = new Set())
        for (let i = 0; i < grass.subInstances.length; i += 1) {
          const sub = grass.subInstances[i]
          _instTmpMatrix.multiplyMatrices(_instTmpComposed, sub.localBase)
          sub.mesh.setMatrixAt(sub.index, _instTmpMatrix)
          dirtyMeshes.add(sub.mesh)
        }
        dirtyMeshes.forEach((m) => { m.instanceMatrix.needsUpdate = true })
        dirtyMeshes.clear()
      }
      }

      if (!renderer.getContext?.()?.isContextLost?.()) {
        renderer.render(scene, camera)
      }

      // 性能监控：移动端减少性能统计的频率以节省CPU
      const shouldUpdatePerfStats = perfProbeEnabled && typeof window !== 'undefined'
      const isMobile = runtimeIsMobile
      const perfUpdateInterval = isMobile ? 60 : 1 // 移动端每60帧更新一次

      if (shouldUpdatePerfStats) {
        // 移动端降低性能统计频率
        if (!isMobile || (state.frameCount || 0) % perfUpdateInterval === 0) {
          window.__THREE_LOW_POLY_MAP_PERF__ = {
            mapName: currentMapName,
            mapVisualQuality: readMapVisualQualityPref(),
            isMobile,
            renderMode: activeFrameNeeded ? 'active' : 'idle',
            idleFrameMs: Math.round(idleFrameIntervalMs),
            canvasWidth: renderer.domElement.width,
            canvasHeight: renderer.domElement.height,
            cssWidth: renderer.domElement.clientWidth,
            cssHeight: renderer.domElement.clientHeight,
            devicePixelRatio: window.devicePixelRatio || 1,
            pixelRatio: renderer.getPixelRatio(),
            drawCalls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            points: renderer.info.render.points,
            lines: renderer.info.render.lines,
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
            sceneChildren: scene.children.length,
            rootChildren: root.children.length,
            visibleChunks: visibleChunkCount,
            totalChunks: mapChunks?.length || 0,
            avgFps: frameTimings.length > 0
              ? (1000 / (frameTimings.reduce((a, b) => a + b, 0) / frameTimings.length)).toFixed(1)
              : 'N/A'
          }
        }
        state.frameCount = (state.frameCount || 0) + 1
      }

      scheduleAnimation(activeFrameNeeded ? 0 : idleFrameIntervalMs)
    }
    scheduleAnimation()

    const keyDown = (event) => {
      let direction = null
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') direction = 'up'
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') direction = 'down'
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') direction = 'left'
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') direction = 'right'
      if (!direction) return
      event.preventDefault()
      if (keyboardDirection === direction) return
      if (keyboardDirection) endPress(keyboardDirection)
      keyboardDirection = direction
      beginPress(direction)
    }

    const keyUp = (event) => {
      let direction = null
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') direction = 'up'
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') direction = 'down'
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') direction = 'left'
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') direction = 'right'
      if (!direction) return
      event.preventDefault()
      if (keyboardDirection === direction) {
        keyboardDirection = null
        endPress(direction)
      }
    }

    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    stateRef.current.requestMove = requestMove
    stateRef.current.beginPress = beginPress
    stateRef.current.endPress = endPress

    cleanupRenderer = (reason = 'effect-cleanup') => {
      if (disposed) return
      disposed = true
      clearActiveThreeMapRenderer(host, cleanupRenderer)
      clearMoveDelayTimer()
      if (frameId != null) cancelAnimationFrame(frameId)
      if (idleFrameTimerId) window.clearTimeout(idleFrameTimerId)
      window.clearTimeout(healthTimerId)
      window.clearTimeout(recoveryTimerId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      resizeObserver?.disconnect?.()
      renderer?.domElement?.removeEventListener('webglcontextlost', handleContextLost, false)
      renderer?.domElement?.removeEventListener('webglcontextrestored', handleContextRestored, false)
      if (perfProbeEnabled && typeof window !== 'undefined') {
        delete window.__THREE_LOW_POLY_MAP_PERF__
      }
      root.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose?.()
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.())
          else child.material?.dispose?.()
        }
      })
      releaseThreeRenderer(renderer, reason)
      stateRef.current = null
    }

    registerActiveThreeMapRenderer(host, cleanupRenderer)

    return () => {
      cleanupRenderer('effect-cleanup')
    }
  }, [currentMapBossCompleted, currentMapName, mapDebugEnabled, renderNonce, requestRendererRestart])

  useEffect(() => {
    if (!stateRef.current) return
    stateRef.current.mapEventVisualState = normalizedMapEventVisualState
    if (!Array.isArray(stateRef.current.eventVisualBindings)) return
    stateRef.current.eventVisualBindings.forEach((binding) => {
      if (
        PICKUP_REWARD_EVENT_TYPES.has(binding?.eventType) &&
        isCollectedMapEventId(stateRef.current?.collectedEventIdSet || collectedEventIdSet, currentMapName, binding.eventId)
      ) {
        if (binding.signal) binding.signal.visible = false
        return
      }
      const visualState = resolveEventVisualStateValue(binding?.eventId, normalizedMapEventVisualState, binding?.defaultState || 'available')
      applyEventSignalVisualState(binding?.signal, visualState)
      applyNpcRoleEffectVisualState(binding?.npcRoleEffect, visualState)
      applyObjectiveDeviceVisualState(binding?.objectiveDevice, visualState)
      const routePositionChanged = binding?.npcFacingController?.syncRouteBlockerState?.(visualState, {
        currentMapBossCompleted
      })
      if (routePositionChanged) stateRef.current?.kickAnimation?.()
    })
  }, [collectedEventIdSet, currentMapBossCompleted, currentMapName, normalizedMapEventVisualState])

  useEffect(() => {
    const previous = collectedEventAnimationStateRef.current
    const nextIds = new Set(collectedEventIdSet)
    collectedEventAnimationStateRef.current = {
      mapName: currentMapName,
      ids: nextIds
    }

    if (!previous || previous.mapName !== currentMapName) return
    const controllers = stateRef.current?.dynamicEventDecorations
    if (!Array.isArray(controllers) || controllers.length === 0) return

    const newlyCollectedIds = []
    nextIds.forEach((eventId) => {
      if (!previous.ids?.has(eventId)) newlyCollectedIds.push(eventId)
    })
    if (newlyCollectedIds.length === 0) return

    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const newlyCollectedIdSet = new Set(newlyCollectedIds)
    controllers.forEach((controller) => {
      if (
        (controller?.eventType === 'item' || controller?.eventType === 'pickup') &&
        isCollectedMapEventId(newlyCollectedIdSet, currentMapName, controller.eventId)
      ) {
        controller.startCollect?.(startedAt, stateRef.current?.triggerPickupBurst)
      }
    })
  }, [collectedEventIdSet, currentMapName])

  useEffect(() => {
    if (!stateRef.current) return
    stateRef.current.mapGrid = mapGrid
    stateRef.current.mapInfo = mapInfo
    stateRef.current.currentMapName = currentMapName
    stateRef.current.mapConfig = mapConfig
    stateRef.current.currentMapBossCompleted = currentMapBossCompleted
    stateRef.current.mapEventVisualState = normalizedMapEventVisualState
    stateRef.current.encounterZoneLocks = normalizedEncounterZoneLocks
    stateRef.current.onPlayerMove = onPlayerMove
    stateRef.current.onEncounter = onEncounter
    stateRef.current.onCollect = onCollect
    stateRef.current.onMapWarp = onMapWarp
    stateRef.current.onZoneEnter = onZoneEnter
    stateRef.current.onBlockedMove = onBlockedMove
    stateRef.current.onEncounterCooldownChange = onEncounterCooldownChange
    stateRef.current.cloudBlocked = cloudBlocked
    stateRef.current.mapActive = mapActive
    stateRef.current.springRestoreAnimation = springRestoreAnimation
    if (cloudBlocked || !mapActive) {
      stateRef.current.pointer.queued = null
      stateRef.current.pointer.holdDirection = null
    }
    if (mapActive) {
      stateRef.current.kickAnimation?.()
    }
  }, [
    cloudBlocked,
    currentMapBossCompleted,
    currentMapName,
    mapActive,
    mapConfig,
    normalizedEncounterZoneLocks,
    normalizedMapEventVisualState,
    mapGrid,
    mapInfo,
    onCollect,
    onEncounter,
    onEncounterCooldownChange,
    onBlockedMove,
    onMapWarp,
    onPlayerMove,
    onZoneEnter,
    springRestoreAnimation
  ])

  useEffect(() => {
    if (!stateRef.current) return
    const activeCollectedEventIdSet = new Set(collectedEventIdSet)
    const optimistic = optimisticCollectedEventIdsRef.current
    if (optimistic?.mapName === currentMapName) {
      optimistic.ids?.forEach((eventId) => activeCollectedEventIdSet.add(eventId))
    }
    stateRef.current.collectedEventIdSet = activeCollectedEventIdSet
    if (Array.isArray(stateRef.current.dynamicEventDecorations)) {
      stateRef.current.dynamicEventDecorations.forEach((controller) => {
        controller?.syncFromState?.(mapGrid, activeCollectedEventIdSet)
      })
    }
    if (Array.isArray(stateRef.current.eventVisualBindings)) {
      stateRef.current.eventVisualBindings.forEach((binding) => {
        if (!PICKUP_REWARD_EVENT_TYPES.has(binding?.eventType)) return
        const isCollected = isCollectedMapEventId(activeCollectedEventIdSet, currentMapName, binding.eventId)
        if (isCollected) {
          if (binding.signal) binding.signal.visible = false
          return
        }
        const visualState = resolveEventVisualStateValue(
          binding.eventId,
          stateRef.current?.mapEventVisualState || normalizedMapEventVisualState,
          binding.defaultState || 'available'
        )
        applyEventSignalVisualState(binding.signal, visualState)
      })
    }
  }, [collectedEventIdSet, currentMapName, mapGrid, normalizedMapEventVisualState])

  useEffect(() => {
    if (!stateRef.current?.player || !playerPos || stateRef.current.pointer.moving) return
    if (
      stateRef.current.pointer.tileX === playerPos.x &&
      stateRef.current.pointer.tileY === playerPos.y
    ) {
      return
    }
    const width = mapGrid?.[0]?.length
    const height = mapGrid?.length
    if (!width || !height) return
    const pos = worldFromTile(playerPos.x, playerPos.y, width, height)
    stateRef.current.pointer.tileX = playerPos.x
    stateRef.current.pointer.tileY = playerPos.y
    if (playerPos.direction && DIRS[playerPos.direction]) {
      stateRef.current.pointer.direction = playerPos.direction
      stateRef.current.player.rotation.y = DIRS[playerPos.direction].rot
    }
    stateRef.current.player.position.set(pos.x, PLAYER_BASE_Y, pos.z)
    stateRef.current.syncCameraTargetToTile?.(playerPos.x, playerPos.y, true)
    stateRef.current.npcFacingControllers?.forEach((controller) => {
      controller?.syncWithPlayerTile?.(playerPos.x, playerPos.y)
    })
    stateRef.current.kickAnimation?.()
  }, [playerPos?.x, playerPos?.y, playerPos?.direction, currentMapName])

  const startMovePress = (direction) => {
    stateRef.current?.beginPress?.(direction)
  }

  const endMovePress = (direction) => {
    stateRef.current?.endPress?.(direction)
  }

  return (
    <div className="map-screen-v2 map-screen-v2--immersive">
      <div className="map-scene-area">
        <div className="map-viewport-shell">
          <div
            ref={hostRef}
            className="map-viewport three-map-host"
            style={{ width: '100%', height: '100%' }}
          />
          {renderIssue && (
            <div className="three-map-recovery-overlay">
              <div className="three-map-recovery-card">
                <div className="three-map-recovery-title">地图正在恢复</div>
                <div className="three-map-recovery-text">{renderIssue.message}</div>
                <button type="button" onClick={() => requestRendererRestart('manual-retry')}>
                  重建地图
                </button>
              </div>
            </div>
          )}
        </div>

      <div className="map-controls-v2 map-controls-v2--float">
        <div className="dpad dpad--minimal">
          <button
            type="button"
            disabled={cloudBlocked}
            onPointerDown={() => startMovePress('up')}
            onPointerUp={() => endMovePress('up')}
            onPointerLeave={() => endMovePress('up')}
            onPointerCancel={() => endMovePress('up')}
            className="dpad-button dpad-up"
            aria-label="向上移动"
          >
            <i className="fas fa-arrow-up"></i>
          </button>
          <button
            type="button"
            disabled={cloudBlocked}
            onPointerDown={() => startMovePress('down')}
            onPointerUp={() => endMovePress('down')}
            onPointerLeave={() => endMovePress('down')}
            onPointerCancel={() => endMovePress('down')}
            className="dpad-button dpad-down"
            aria-label="向下移动"
          >
            <i className="fas fa-arrow-down"></i>
          </button>
          <button
            type="button"
            disabled={cloudBlocked}
            onPointerDown={() => startMovePress('left')}
            onPointerUp={() => endMovePress('left')}
            onPointerLeave={() => endMovePress('left')}
            onPointerCancel={() => endMovePress('left')}
            className="dpad-button dpad-left"
            aria-label="向左移动"
          >
            <i className="fas fa-arrow-left"></i>
          </button>
          <button
            type="button"
            disabled={cloudBlocked}
            onPointerDown={() => startMovePress('right')}
            onPointerUp={() => endMovePress('right')}
            onPointerLeave={() => endMovePress('right')}
            onPointerCancel={() => endMovePress('right')}
            className="dpad-button dpad-right"
            aria-label="向右移动"
          >
            <i className="fas fa-arrow-right"></i>
          </button>
        </div>
        <div className="map-action-grid map-action-rail">
          <button type="button" disabled={cloudBlocked} onClick={() => onNavigate?.('bag')} className="map-action-button map-action-button--icon map-hud-icon-button map-hud-frosted" title="背包" aria-label="背包">
            <i className="fa-solid fa-bag-shopping"></i><span>背包</span>
          </button>
          <button type="button" disabled={cloudBlocked} onClick={() => onNavigate?.('team')} className="map-action-button map-action-button--icon map-hud-icon-button map-hud-frosted" title="宝可梦" aria-label="宝可梦">
            <i className="fa-solid fa-paw"></i><span>宝可梦</span>
          </button>
          <button type="button" disabled={cloudBlocked} onClick={() => onNavigate?.('dex')} className="map-action-button map-action-button--icon map-hud-icon-button map-hud-frosted" title="图鉴" aria-label="图鉴">
            <i className="fa-solid fa-book-open"></i><span>图鉴</span>
          </button>
          <button type="button" disabled={cloudBlocked} onClick={() => onNavigate?.('shop')} className="map-action-button map-action-button--icon map-hud-icon-button map-hud-frosted" title="商店" aria-label="商店">
            <i className="fa-solid fa-store"></i><span>商店</span>
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}

export default memo(ThreeLowPolyMap)
