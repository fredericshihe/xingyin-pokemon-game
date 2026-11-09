import * as THREE from 'three'
import { getCachedModelScene } from './threeLowPolyModelCache'
import { animateLowPolyPlayer } from './playerFigureVisual'
import { configureCharacterSurfaceMaterial } from './characterSurfaceMaterial.js'
export const BICYCLE_MODEL_KEY = 'player_bicycle'
export const SPORTS_CAR_MODEL_KEY = 'player_sports_car'

const DOWN = new THREE.Vector3(0, -1, 0)
// Reused vectors keep pedalling out of the allocation/GC path.
const hip = new THREE.Vector3(), foot = new THREE.Vector3(), knee = new THREE.Vector3()
const delta = new THREE.Vector3(), bend = new THREE.Vector3(), direction = new THREE.Vector3()

export function createPlayerTravelRig(walkingFigure) {
  const player = new THREE.Group()
  player.add(walkingFigure)
  player.userData.kind = walkingFigure.userData.kind
  player.userData.walkingFigure = walkingFigure
  player.userData.riding = false
  player.userData.vehicle = null
  return player
}
export function attachBicycleModel(player) {
  if (!player?.userData?.walkingFigure) return false
  if (player.userData.bicycleFigure) return true
  const template = getCachedModelScene(BICYCLE_MODEL_KEY)
  if (!template) return false
  const bicycle = template.clone(true), parts = {}
  bicycle.traverse((part) => {
    if (!part.isMesh) return
    part.geometry = part.geometry.clone()
    part.material = Array.isArray(part.material) ? part.material.map((m) => m.clone()) : part.material.clone()
    configureCharacterSurfaceMaterial(part.material, part.geometry)
    part.castShadow = true
    part.receiveShadow = true
    parts[part.name] = part
  })
  bicycle.userData.parts = parts
  bicycle.userData.phase = 0
  bicycle.visible = false
  player.add(bicycle)
  player.userData.bicycleFigure = bicycle
  poseBicycle(bicycle, 0)
  return true
}
export function attachSportsCarModel(player) {
  if (!player?.userData?.walkingFigure) return false
  if (player.userData.sportsCarFigure) return true
  const template = getCachedModelScene(SPORTS_CAR_MODEL_KEY)
  if (!template || template.name.startsWith('missing-model:')) return false
  const car = template.clone(true)
  const wheels = []
  car.traverse((part) => {
    if (!part.isMesh) return
    part.geometry = part.geometry.clone()
    part.material = Array.isArray(part.material) ? part.material.map((m) => m.clone()) : part.material.clone()
    configureCharacterSurfaceMaterial(part.material, part.geometry)
    part.castShadow = true
    part.receiveShadow = true
    if (part.name.endsWith('Wheel')) wheels.push(part)
  })
  if (wheels.length !== 4) {
    car.traverse((part) => { if (part.isMesh) { part.geometry.dispose(); (Array.isArray(part.material) ? part.material : [part.material]).forEach((m) => m.dispose()) } })
    return false
  }
  car.userData.wheels = wheels
  car.userData.phase = 0
  car.visible = false
  player.add(car)
  player.userData.sportsCarFigure = car
  return true
}

export function setPlayerRiding(player, enabled, vehicle = 'bicycle') {
  if (!player?.userData?.walkingFigure) return false
  const figure = vehicle === 'sports_car' ? player.userData.sportsCarFigure : player.userData.bicycleFigure
  const riding = Boolean(enabled && figure)
  player.userData.riding = riding
  player.userData.vehicle = riding ? vehicle : null
  player.userData.walkingFigure.visible = !riding
  if (player.userData.bicycleFigure) player.userData.bicycleFigure.visible = riding && vehicle === 'bicycle'
  if (player.userData.sportsCarFigure) player.userData.sportsCarFigure.visible = riding && vehicle === 'sports_car'
  player.userData.kind = riding ? vehicle === 'sports_car' ? 'xingyin-player-sports-car' : 'xingyin-player-bicycle' : player.userData.walkingFigure.userData.kind
  return riding
}
function poseBicycle(bicycle, phase) {
  const parts = bicycle.userData.parts
  for (const [sign, label] of [[-1, 'left'], [1, 'right']]) {
    const angle = phase + (sign < 0 ? 0 : Math.PI)
    hip.set(sign * .12, .80, -.17)
    // +Z is forward: a pedal at the front of the crank must travel downward.
    foot.set(sign * .19, .35 - Math.sin(angle) * .115, -.09 + Math.cos(angle) * .115)
    delta.subVectors(foot, hip)
    const distance = delta.length()
    bend.set(0, -delta.z, delta.y).normalize()
    if (bend.z < 0) bend.negate()
    knee.copy(hip).addScaledVector(delta, .5).addScaledVector(bend, Math.sqrt(Math.max(0, .29 ** 2 - (distance * .5) ** 2)))
    for (const [name, start, end] of [[`${label}Thigh`, hip, knee], [`${label}Shin`, knee, foot]]) {
      const part = parts[name]
      if (!part) continue
      part.position.copy(start)
      part.quaternion.setFromUnitVectors(DOWN, direction.subVectors(end, start).normalize())
    }
    parts[`${label}Shoe`]?.position.copy(foot)
  }
  for (const key of ['frontWheel', 'rearWheel']) {
    if (parts[key]) parts[key].rotation.x = phase * 1.5
  }
}
export function animatePlayerTravelRig(player, moving, now, dt) {
  if (!player?.userData?.walkingFigure) return animateLowPolyPlayer(player, moving, now, dt)
  if (!player.userData.riding) return animateLowPolyPlayer(player.userData.walkingFigure, moving, now, dt)
  if (player.userData.vehicle === 'sports_car') {
    const car = player.userData.sportsCarFigure
    if (!car) return
    if (moving) car.userData.phase += Math.max(0, Math.min(.05, dt || 0)) * 60
    for (const wheel of car.userData.wheels) wheel.rotation.x = car.userData.phase
    return
  }
  const bicycle = player.userData.bicycleFigure
  if (moving) bicycle.userData.phase += Math.max(0, Math.min(.05, dt || 0)) * Math.PI * 4
  poseBicycle(bicycle, bicycle.userData.phase)
}
