import * as THREE from 'three'
import { getCachedModelScene } from './threeLowPolyModelCache'
import { PLAYER_CHARACTER_KEY, CHARACTER_ASSET_VERSION } from './data/characterAssets.js'
import { configureCharacterSurfaceMaterial } from './characterSurfaceMaterial.js'
import { getCharacterGaitBodyOffset, solveCharacterLegGait } from './characterGait.js'

const WALK_CYCLE_MS = 540
const PREVIEW_CACHE = new Map()

const PREVIEW_DIRECTION_ROTATIONS = {
  up: Math.PI,
  down: 0,
  left: -Math.PI / 2,
  right: Math.PI / 2
}

const PREVIEW_CAMERA_PRESETS = {
  portrait: {
    fov: 24,
    cameraPosition: [0.76, 1.24, 4.18],
    lookAt: [0, 0.82, 0],
    scaleMultiplier: 1.58,
    lights: 'portrait'
  },
  map: {
    fov: 42,
    cameraPosition: [0, 3.62, 3.12],
    lookAt: [0, 0.45, 0],
    scaleMultiplier: 1.72,
    lights: 'map'
  },
  travel: {
    fov: 25,
    cameraPosition: [0.92, 1.18, 4.28],
    lookAt: [0, 0.8, 0],
    scaleMultiplier: 1.42,
    lights: 'portrait'
  }
}

function rememberBaseTransform(part) {
  return {
    position: part.position.clone(),
    rotation: part.rotation.clone(),
    scale: part.scale.clone()
  }
}

function setAnimatedTransform(part, base, blend, changes = {}) {
  if (!part || !base) return
  part.position.x = THREE.MathUtils.lerp(base.position.x, base.position.x + (changes.x ?? 0), blend)
  part.position.y = THREE.MathUtils.lerp(base.position.y, base.position.y + (changes.y ?? 0), blend)
  part.position.z = THREE.MathUtils.lerp(base.position.z, base.position.z + (changes.z ?? 0), blend)
  part.rotation.x = THREE.MathUtils.lerp(base.rotation.x, base.rotation.x + (changes.rotX ?? 0), blend)
  part.rotation.y = THREE.MathUtils.lerp(base.rotation.y, base.rotation.y + (changes.rotY ?? 0), blend)
  part.rotation.z = THREE.MathUtils.lerp(base.rotation.z, base.rotation.z + (changes.rotZ ?? 0), blend)
  part.scale.x = THREE.MathUtils.lerp(base.scale.x, base.scale.x + (changes.scaleX ?? 0), blend)
  part.scale.y = THREE.MathUtils.lerp(base.scale.y, base.scale.y + (changes.scaleY ?? 0), blend)
  part.scale.z = THREE.MathUtils.lerp(base.scale.z, base.scale.z + (changes.scaleZ ?? 0), blend)
}

function applyLowPolyPlayerPose(rig, blend, phase) {
  if (!rig?.parts || !rig?.base) return

  const stride = Math.sin(phase)
  const counterStride = Math.sin(phase + Math.PI)
  const bounce = Math.abs(Math.sin(phase))
  const headLag = Math.sin(phase - 0.28)
  const delayedBounce = Math.abs(Math.sin(phase - 0.18))
  const torsoRoll = stride * 0.055
  const shoulderTwist = stride * 0.07
  const leftFootLift = Math.max(stride, 0)
  const rightFootLift = Math.max(counterStride, 0)

  setAnimatedTransform(rig.parts.body, rig.base.body, blend, {
    x: stride * 0.012,
    y: bounce * 0.06,
    z: -bounce * 0.018,
    rotX: -0.06 + bounce * 0.035,
    rotY: shoulderTwist,
    rotZ: torsoRoll,
    scaleX: bounce * 0.006,
    scaleY: -bounce * 0.014
  })
  setAnimatedTransform(rig.parts.backpack, rig.base.backpack, blend, {
    x: -stride * 0.012,
    y: bounce * 0.048,
    z: -bounce * 0.036,
    rotX: -stride * 0.06 - bounce * 0.018,
    rotY: -shoulderTwist * 0.7,
    rotZ: -torsoRoll * 1.15
  })
  setAnimatedTransform(rig.parts.head, rig.base.head, blend, {
    x: -headLag * 0.006,
    y: delayedBounce * 0.046,
    z: -bounce * 0.006,
    rotX: -0.035 + delayedBounce * 0.026,
    rotY: headLag * 0.028,
    rotZ: -torsoRoll * 0.5
  })
  setAnimatedTransform(rig.parts.hair, rig.base.hair, blend, {
    x: -headLag * 0.006,
    y: delayedBounce * 0.048,
    z: -bounce * 0.006,
    rotX: -0.035 + delayedBounce * 0.028,
    rotY: headLag * 0.03,
    rotZ: -torsoRoll * 0.52
  })
  setAnimatedTransform(rig.parts.cap, rig.base.cap, blend, {
    x: -headLag * 0.006,
    y: delayedBounce * 0.05,
    z: -bounce * 0.006,
    rotX: -0.03 + delayedBounce * 0.026,
    rotY: headLag * 0.03,
    rotZ: -torsoRoll * 0.52
  })
  setAnimatedTransform(rig.parts.brim, rig.base.brim, blend, {
    x: -headLag * 0.006,
    y: delayedBounce * 0.05,
    z: -bounce * 0.006,
    rotX: -0.03 + delayedBounce * 0.026,
    rotY: headLag * 0.03,
    rotZ: -torsoRoll * 0.52
  })

  setAnimatedTransform(rig.parts.leftArm, rig.base.leftArm, blend, {
    y: bounce * 0.02,
    z: counterStride * 0.018,
    rotX: counterStride * 0.56,
    rotY: -shoulderTwist * 0.45,
    rotZ: 0.1 + stride * 0.07 + torsoRoll * 0.5
  })
  setAnimatedTransform(rig.parts.rightArm, rig.base.rightArm, blend, {
    y: bounce * 0.02,
    z: stride * 0.018,
    rotX: stride * 0.56,
    rotY: -shoulderTwist * 0.45,
    rotZ: -0.1 + stride * 0.07 + torsoRoll * 0.5
  })
  setAnimatedTransform(rig.parts.leftLeg, rig.base.leftLeg, blend, {
    x: stride * 0.006,
    y: bounce * 0.018,
    z: stride * 0.05,
    rotX: stride * 0.5,
    rotY: -shoulderTwist * 0.35,
    rotZ: -stride * 0.038 + torsoRoll * 0.25
  })
  setAnimatedTransform(rig.parts.rightLeg, rig.base.rightLeg, blend, {
    x: stride * 0.006,
    y: bounce * 0.018,
    z: counterStride * 0.05,
    rotX: counterStride * 0.5,
    rotY: -shoulderTwist * 0.35,
    rotZ: -counterStride * 0.038 + torsoRoll * 0.25
  })
  setAnimatedTransform(rig.parts.leftShoe, rig.base.leftShoe, blend, {
    x: stride * 0.006,
    y: leftFootLift * 0.072,
    z: stride * 0.098,
    rotX: stride * 0.3 + leftFootLift * 0.08,
    rotZ: -stride * 0.02
  })
  setAnimatedTransform(rig.parts.rightShoe, rig.base.rightShoe, blend, {
    x: stride * 0.006,
    y: rightFootLift * 0.072,
    z: counterStride * 0.098,
    rotX: counterStride * 0.3 + rightFootLift * 0.08,
    rotZ: -counterStride * 0.02
  })
  setAnimatedTransform(rig.parts.leftForearm, rig.base.leftForearm, blend, { rotX: -.12 - Math.max(counterStride, 0) * .25 })
  setAnimatedTransform(rig.parts.rightForearm, rig.base.rightForearm, blend, { rotX: -.12 - Math.max(stride, 0) * .25 })
  setAnimatedTransform(rig.parts.leftShin, rig.base.leftShin, blend, { rotX: Math.max(-stride, 0) * .62 })
  setAnimatedTransform(rig.parts.rightShin, rig.base.rightShin, blend, { rotX: Math.max(-counterStride, 0) * .62 })
}

function disposeObject(object) {
  object?.traverse?.((child) => {
    child.geometry?.dispose?.()
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material?.dispose?.())
      return
    }
    child.material?.dispose?.()
  })
}

function addMapPreviewShadow(scene) {
  if (!scene) return null
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 32),
    new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.18,
      depthWrite: false
    })
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.set(0.02, -0.01, 0.18)
  shadow.scale.set(1.22, 0.72, 1)
  scene.add(shadow)
  return shadow
}

export function createLowPolyPlayerBody({ castShadow = true } = {}) {
  const group = new THREE.Group()

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4f8df7, roughness: 0.72 })
  const faceMaterial = new THREE.MeshStandardMaterial({ color: 0xffc9a5, roughness: 0.74 })
  const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x45312a, roughness: 0.88 })
  const backpackMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.76 })
  const legMaterial = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.84 })
  const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.48 })
  const armMaterial = new THREE.MeshStandardMaterial({ color: 0xffc9a5, roughness: 0.76 })

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 6, 20), bodyMaterial)
  body.position.y = 0.72
  body.castShadow = castShadow
  group.add(body)

  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.28, 6, 16), armMaterial)
  leftArm.position.set(-0.28, 0.72, 0)
  leftArm.rotation.z = Math.PI / 10
  leftArm.castShadow = castShadow
  group.add(leftArm)

  const rightArm = leftArm.clone()
  rightArm.position.x = 0.28
  rightArm.rotation.z = -Math.PI / 10
  group.add(rightArm)

  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.34, 6, 16), legMaterial)
  leftLeg.position.set(-0.12, 0.3, 0)
  leftLeg.castShadow = castShadow
  group.add(leftLeg)

  const rightLeg = leftLeg.clone()
  rightLeg.position.x = 0.12
  group.add(rightLeg)

  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.28), shoeMaterial)
  leftShoe.position.set(-0.12, 0.05, 0.04)
  leftShoe.castShadow = castShadow
  group.add(leftShoe)

  const rightShoe = leftShoe.clone()
  rightShoe.position.x = 0.12
  group.add(rightShoe)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 20), faceMaterial)
  head.position.set(0, 1.22, 0.02)
  head.castShadow = castShadow
  group.add(head)

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.295, 22, 18), hairMaterial)
  hair.position.set(0, 1.31, -0.02)
  hair.scale.set(1.03, 0.58, 1)
  hair.castShadow = castShadow
  group.add(hair)

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.18), backpackMaterial)
  backpack.position.set(0, 0.8, -0.27)
  backpack.castShadow = castShadow
  group.add(backpack)

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.3, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.62 })
  )
  cap.position.set(0, 1.45, 0)
  cap.castShadow = castShadow
  group.add(cap)

  const brim = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.04, 0.18),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.58 })
  )
  brim.position.set(0, 1.41, 0.2)
  brim.castShadow = castShadow
  group.add(brim)

  const parts = {
    body,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    leftShoe,
    rightShoe,
    head,
    hair,
    backpack,
    cap,
    brim
  }

  group.userData.rig = {
    parts,
    base: Object.fromEntries(
      Object.entries(parts).map(([name, part]) => [name, rememberBaseTransform(part)])
    ),
    walkBlend: 0
  }

  group.position.y = 0.02
  return group
}

export function createLowPolyPlayer() {
  const template = getCachedModelScene(PLAYER_CHARACTER_KEY)
  if (template) {
    const player = template.clone(true)
    const parts = {}
    const base = {}
    player.traverse((child) => {
      if (!child.isMesh) return
      // Each map/portrait owns its GPU buffers; disposing a preview cannot invalidate the cache.
      child.geometry = child.geometry.clone()
      child.material = child.material.clone()
      configureCharacterSurfaceMaterial(child.material, child.geometry)
      child.castShadow = true
      child.receiveShadow = true
      parts[child.name] = child
      base[child.name] = rememberBaseTransform(child)
    })
    player.userData.kind = 'xingyin-player'
    player.userData.rig = { parts, base, walkBlend: 0, authored: true }
    return player
  }
  const group = new THREE.Group()
  const body = createLowPolyPlayerBody()
  group.add(body)
  group.userData.kind = 'fallback-player'
  group.userData.rig = body.userData.rig
  return group
}

export function setLowPolyPlayerPose(player, { moving = false, phase = 0 } = {}) {
  const rig = player?.userData?.rig
  if (!rig) return
  rig.walkBlend = moving ? 1 : 0
  rig.gaitDuty = .5
  rig.gaitHalfStride = .16
  if (rig.authored) applyAuthoredPlayerPose(rig, rig.walkBlend, phase)
  else applyLowPolyPlayerPose(rig, rig.walkBlend, phase)
}

function applyAuthoredPlayerPose(rig, blend, phase, now = 0) {
  const stride = Math.sin(phase) * blend
  const upperLength = Math.abs(rig.base.leftShin?.position.y || 0)
  const lowerLength = Math.hypot(rig.base.leftFoot?.position.y || 0, rig.base.leftFoot?.position.z || 0)
  const halfStride = rig.gaitHalfStride ?? .16
  const bodyOffset = upperLength && lowerLength ? getCharacterGaitBodyOffset({
    phase, blend, legLength: upperLength + lowerLength, standingHeight: upperLength + Math.abs(rig.base.leftFoot.position.y), halfStride, stanceFraction: rig.gaitDuty ?? .5
  }) : 0
  Object.entries(rig.parts).forEach(([name, part]) => {
    const base = rig.base[name]
    part.position.copy(base.position)
    part.rotation.copy(base.rotation)
    // Nested forearms and shins inherit the torso-side bounce from their parent.
    if (part.parent === rig.parts.leftArm || part.parent === rig.parts.rightArm || part.parent === rig.parts.leftLeg || part.parent === rig.parts.rightLeg || part.parent === rig.parts.leftShin || part.parent === rig.parts.rightShin) return
    // Keep the head, coat and shoulders stable. Only the covered hip joints
    // follow the contact arc; rapid foot cycles must not shake the whole body.
    if (name === 'leftLeg' || name === 'rightLeg') part.position.y += bodyOffset
  })
  for (const [name, angle] of Object.entries({ leftArm: -stride * .46, rightArm: stride * .46, leftLeg: stride * .40, rightLeg: -stride * .40 })) {
    const part = rig.parts[name]
    if (part) part.rotateX(angle)
  }
  rig.parts.body?.rotateY(stride * .012)
  rig.parts.leftForearm?.rotateX(-Math.max(-stride, 0) * .24)
  rig.parts.rightForearm?.rotateX(-Math.max(stride, 0) * .24)
  rig.parts.leftShin?.rotateX(Math.max(-stride, 0) * .58)
  rig.parts.rightShin?.rotateX(Math.max(stride, 0) * .58)
  for (const [side, offset] of [['left', 0], ['right', Math.PI]]) {
    const thigh = rig.parts[`${side}Leg`], shin = rig.parts[`${side}Shin`]
    if (!thigh || !shin || blend < .001) continue
    const upperLength = Math.abs(rig.base[`${side}Shin`].position.y)
    const foot = rig.parts[`${side}Foot`]
    const footBase = rig.base[`${side}Foot`]?.position
    const lowerLength = foot ? Math.hypot(footBase.y, footBase.z) : upperLength * .38 / .33
    const ankleY = rig.base[`${side}Leg`].position.y - upperLength - Math.abs(footBase?.y ?? lowerLength)
    const gait = solveCharacterLegGait({ phase: phase + offset, blend, hipY: thigh.position.y, upperLength, lowerLength, ankleY,
      halfStride, lowerBindAngle: Math.atan2(footBase?.z || 0, Math.abs(footBase?.y ?? lowerLength)), stanceFraction: rig.gaitDuty ?? .5 })
    thigh.rotation.x = rig.base[`${side}Leg`].rotation.x + gait.upperAngle
    shin.rotation.x = rig.base[`${side}Shin`].rotation.x + gait.lowerAngle
    if (foot) foot.rotation.x = rig.base[`${side}Foot`].rotation.x - gait.upperAngle - gait.lowerAngle
  }
  const breath = Math.sin(now * .00165) * .004 * (1 - blend)
  for (const name of ['body','head','leftArm','rightArm']) if (rig.parts[name]) rig.parts[name].position.y += breath
}

export function animateLowPolyPlayer(player, moving, now, dt) {
  const rig = player?.userData?.rig
  if (!rig) return

  const blendTarget = moving ? 1 : 0
  const delta = Number.isFinite(dt) ? dt : 1
  const smooth = 1 - Math.pow(moving ? 0.001 : 0.02, delta)
  rig.walkBlend = THREE.MathUtils.lerp(rig.walkBlend ?? 0, blendTarget, smooth)
  const phase = (now / WALK_CYCLE_MS) * Math.PI * 2
  if (rig.authored) {
    rig.motionPoint ||= new THREE.Vector3()
    player.getWorldPosition(rig.motionPoint)
    const previous = rig.previousMotionPoint
    const distance = previous ? Math.hypot(rig.motionPoint.x - previous.x, rig.motionPoint.z - previous.z) : 0
    rig.previousMotionPoint ||= new THREE.Vector3()
    rig.previousMotionPoint.copy(rig.motionPoint)
    rig.gaitPhase ??= 0
    if (moving) {
      const seconds = Math.max(.001, delta)
      if (distance > .00001 && distance < .5) {
        const speed = distance / seconds, duty = THREE.MathUtils.clamp(.5 - speed * .04, .28, .5)
        rig.gaitDuty = THREE.MathUtils.lerp(rig.gaitDuty ?? .5, duty, 1 - Math.exp(-seconds * 12))
        rig.gaitHalfStride = THREE.MathUtils.clamp(.14 + speed * .015, .14, .22)
        // The support foot moves backward by exactly the travelled distance.
        rig.gaitPhase += distance / (2 * rig.gaitHalfStride / rig.gaitDuty) * Math.PI * 2
      } else {
        rig.gaitDuty = .5
        rig.gaitHalfStride = .16
        rig.gaitPhase += seconds / (WALK_CYCLE_MS / 1000) * Math.PI * 2
      }
    }
    applyAuthoredPlayerPose(rig, rig.walkBlend, rig.gaitPhase, now)
  }
  else applyLowPolyPlayerPose(rig, rig.walkBlend, phase)
}

export function getLowPolyPlayerFigureDataUrl({
  direction = 'right',
  pose = 'idle',
  width = 176,
  height = 176,
  scale = 1,
  cameraPreset = 'portrait',
  requireAuthored = false
} = {}) {
  if (typeof document === 'undefined') return null
  const cached = getCachedModelScene(PLAYER_CHARACTER_KEY)
  if (requireAuthored && (!cached || cached.name.startsWith('missing-model:'))) return null

  const safeDirection = PREVIEW_DIRECTION_ROTATIONS[direction] != null ? direction : 'right'
  const safePose = pose === 'run' ? 'run' : 'idle'
  const safeWidth = Math.max(72, Math.trunc(Number(width) || 176))
  const safeHeight = Math.max(72, Math.trunc(Number(height) || 176))
  const safeScale = Math.max(0.6, Number(scale) || 1)
  const safeCameraPreset = PREVIEW_CAMERA_PRESETS[cameraPreset] ? cameraPreset : 'portrait'
  const cameraConfig = PREVIEW_CAMERA_PRESETS[safeCameraPreset]
  const modelFamily = cached ? CHARACTER_ASSET_VERSION : 'fallback'
  const cacheKey = `${modelFamily}:${safeDirection}:${safePose}:${safeWidth}:${safeHeight}:${safeScale.toFixed(2)}:${safeCameraPreset}`

  if (PREVIEW_CACHE.has(cacheKey)) {
    return PREVIEW_CACHE.get(cacheKey)
  }

  let renderer = null
  let canvas = null
  let scene = null
  let player = null
  let shadow = null

  try {
    canvas = document.createElement('canvas')
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
      premultipliedAlpha: true
    })
    const devicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    renderer.setSize(safeWidth, safeHeight, false)
    renderer.shadowMap.enabled = false
    renderer.setClearColor(0x000000, 0)
    if ('outputColorSpace' in renderer) {
      renderer.outputColorSpace = THREE.SRGBColorSpace
    }
    if ('toneMapping' in renderer) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.08
    }

    scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(cameraConfig.fov, safeWidth / safeHeight, 0.1, 20)
    camera.position.set(...cameraConfig.cameraPosition)
    camera.lookAt(...cameraConfig.lookAt)

    if (cameraConfig.lights === 'map') {
      scene.add(new THREE.HemisphereLight(0xffffff, 0x7fb06f, 1.55))
      const sun = new THREE.DirectionalLight(0xfff6df, 2.55)
      sun.position.set(12, 22, 8)
      scene.add(sun)
    } else {
      scene.add(new THREE.AmbientLight(0xffffff, 2.18))

      const keyLight = new THREE.DirectionalLight(0xffffff, 1.42)
      keyLight.position.set(2.8, 3.8, 3.6)
      scene.add(keyLight)

      const rimLight = new THREE.DirectionalLight(0x8be9fd, 0.58)
      rimLight.position.set(-2.2, 2.4, -1.8)
      scene.add(rimLight)

      const bounceLight = new THREE.PointLight(0xffffff, 0.28, 8)
      bounceLight.position.set(0, -0.4, 2.3)
      scene.add(bounceLight)
    }

    player = createLowPolyPlayer()
    player.position.set(0, safeCameraPreset === 'map' ? -0.08 : (safePose === 'run' ? -0.02 : -0.05), 0)
    player.rotation.y = PREVIEW_DIRECTION_ROTATIONS[safeDirection]
    player.scale.setScalar(cameraConfig.scaleMultiplier * safeScale)
    if (safePose === 'run') {
      setLowPolyPlayerPose(player, { moving: true, phase: Math.PI * 0.34 })
    } else {
      setLowPolyPlayerPose(player, { moving: false })
    }
    scene.add(player)
    if (safeCameraPreset === 'map') {
      shadow = addMapPreviewShadow(scene)
    }

    renderer.render(scene, camera)
    const dataUrl = canvas.toDataURL('image/png')
    PREVIEW_CACHE.set(cacheKey, dataUrl)
    return dataUrl
  } catch (error) {
    console.warn('[playerFigureVisual] Failed to render player preview:', error)
    PREVIEW_CACHE.set(cacheKey, null)
    return null
  } finally {
    disposeObject(player)
    shadow?.geometry?.dispose?.()
    shadow?.material?.dispose?.()
    renderer?.renderLists?.dispose?.()
    const gl = renderer?.getContext?.()
    const contextAlreadyLost = typeof gl?.isContextLost === 'function' ? gl.isContextLost() : false
    if (!contextAlreadyLost) {
      renderer?.forceContextLoss?.()
    }
    renderer?.dispose?.()
    canvas?.remove?.()
  }
}
