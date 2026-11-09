import * as THREE from 'three'
import { getMapInfo } from './data/mapCatalog.js'
import { getCharacterIdentity, isCharacterModelKey } from './data/characterAssets.js'
import { getDecorativeModel } from './decorativeModelSpec.js'
import { getCachedModelScene } from './threeLowPolyModelCache.js'
import { configureCharacterSurfaceMaterial } from './characterSurfaceMaterial.js'

const portraits = new Map()

/** Prefer the encounter snapshot, then the exact map/event visual identity. */
export function resolveBattleCharacterModel(environment = {}) {
  if (isCharacterModelKey(environment.characterModel)) return environment.characterModel
  const mapId = environment.mapName, eventId = environment.eventId
  const identity = getCharacterIdentity(mapId, eventId)
  if (identity) return identity.id
  const map = mapId ? getMapInfo(mapId) : null
  const event = map?.runtimeEvents.find(event => event.id === eventId)
  if (isCharacterModelKey(event?.properties?.characterModel)) return event.properties.characterModel
  const object = map?.decorativeObjects.find(object => object.eventId === eventId && isCharacterModelKey(getDecorativeModel(object.type, object)?.key))
  if (object) return getDecorativeModel(object.type, object).key
  return ({ boss: 'trainer_boss', lieutenant: 'trainer_lieutenant', challenge: 'trainer_challenge' })[environment.eventRole] || 'blocky_character_a'
}

/** Render the same cached GLB used on the map, without changing its resources. */
export function getCharacterPortraitDataUrl(key) {
  if (portraits.has(key)) return portraits.get(key)
  const source = getCachedModelScene(key)
  if (!source || source.name.startsWith('missing-model:') || typeof document === 'undefined') return null
  let renderer, figure
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(360, 440); renderer.setPixelRatio(1)
    renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1
    const scene = new THREE.Scene()
    figure = source.clone(true)
    figure.traverse(child => {
      if (!child.isMesh) return
      child.geometry = child.geometry.clone()
      child.material = child.material.clone()
      configureCharacterSurfaceMaterial(child.material, child.geometry)
    })
    const sourceBounds = new THREE.Box3().setFromObject(figure)
    figure.scale.multiplyScalar(1.55 / (sourceBounds.max.y - sourceBounds.min.y))
    figure.rotation.y = -.12
    let bounds = new THREE.Box3().setFromObject(figure)
    const center = bounds.getCenter(new THREE.Vector3())
    // The authored body axis is X=0. A flag or basket on one side must not
    // shift the face away from the centered name underneath the portrait.
    figure.position.y -= center.y
    figure.position.z -= center.z
    figure.position.x += .025
    bounds = new THREE.Box3().setFromObject(figure)
    const size = bounds.getSize(new THREE.Vector3()), aspect = 360 / 440
    const centeredWidth = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) * 2
    const span = Math.max(size.y * 1.08, centeredWidth / aspect * 1.08)
    const camera = new THREE.OrthographicCamera(-span * aspect / 2, span * aspect / 2, span / 2, -span / 2, .1, 20)
    camera.position.set(0, .1, 5); camera.lookAt(0, 0, 0)
    scene.add(figure, new THREE.HemisphereLight(0xffffff, 0x859488, 2.2))
    const keyLight = new THREE.DirectionalLight(0xffeee0, 2.6); keyLight.position.set(-3, 5, 4); scene.add(keyLight)
    const rim = new THREE.DirectionalLight(0xcbe5ff, 1.2); rim.position.set(3, 2, -2); scene.add(rim)
    renderer.render(scene, camera)
    const url = renderer.domElement.toDataURL('image/png')
    portraits.set(key, url)
    return url
  } catch (error) {
    console.warn('[characterPortrait] Portrait unavailable:', key, error)
    return null
  } finally {
    figure?.traverse(child => { child.geometry?.dispose(); child.material?.dispose() })
    renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove()
  }
}
