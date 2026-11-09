import * as THREE from 'three'
import { FISHING_CATCHES, FISHING_SPOTS, FISHING_TIERS } from './fishingCatalog.js'
import { FISHING_SPOT_PLACEMENTS } from './fishingMapEvents.js'
import { getFishingCelebration } from './fishingCelebration.js'

const CELL = 1.55
const TAU = Math.PI * 2
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const ease = (value) => 1 - Math.pow(1 - clamp(value), 3)
const VALID_PHASES = new Set(['casting', 'waiting', 'reeling', 'settling', 'result', 'idle'])
const POSED_PARTS = ['rightArm', 'leftArm', 'rightForearm', 'leftForearm', 'body', 'head']
const HOLDING_ARMS = ['leftArm', 'rightArm']

/** Visual-only controller. The caller owns the frame loop, session clock and every game outcome. */
export function createFishingSceneVisual({ root, player, width, height, mapInfo, camera = null }) {
  const container = new THREE.Group()
  container.name = 'fishing-live-scene'
  container.visible = false
  root.add(container)
  const geometries = new Set(), materials = new Set(), textures = new Map()
  const geometry = (value) => { geometries.add(value); return value }
  const material = (value) => { materials.add(value); return value }
  const wood = material(new THREE.MeshStandardMaterial({ color: 0x704d32, roughness: .7 }))
  const graphite = material(new THREE.MeshStandardMaterial({ color: 0x26434b, metalness: .15, roughness: .42 }))
  const gold = material(new THREE.MeshStandardMaterial({ color: 0xd6ae66, metalness: .46, roughness: .34 }))
  const floatRed = material(new THREE.MeshStandardMaterial({ color: 0xf37658, roughness: .25 }))
  const floatCream = material(new THREE.MeshStandardMaterial({ color: 0xf7ebcc, roughness: .38 }))
  const catchMaterial = material(new THREE.MeshStandardMaterial({ color: 0x85bfb3, roughness: .4, metalness: .12 }))
  const catchDetail = material(new THREE.MeshStandardMaterial({ color: 0x447b91, roughness: .42, metalness: .18 }))
  const eyes = material(new THREE.MeshStandardMaterial({ color: 0x193039, roughness: .3 }))
  const spriteMaterial = material(new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide, alphaTest: .02, toneMapped: false }))
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 7))
  const sphere = geometry(new THREE.SphereGeometry(1, 10, 7))
  const box = geometry(new THREE.BoxGeometry(1, 1, 1))
  const fin = geometry(new THREE.ConeGeometry(1, 1, 3))
  const plane = geometry(new THREE.PlaneGeometry(1, 1))
  const ringGeometry = geometry(new THREE.RingGeometry(.78, 1, 32))
  const mesh = (parent, shape, paint, position, scale) => {
    const item = new THREE.Mesh(shape, paint)
    if (position) item.position.set(...position)
    if (scale) item.scale.set(...scale)
    parent.add(item)
    return item
  }

  const rod = new THREE.Group()
  rod.name = 'fishing-held-rod'
  container.add(rod)
  mesh(rod, cylinder, wood, [0,.14,0], [.04,.32,.04])
  const rodSegments = Array.from({ length: 6 }, () => mesh(rod, cylinder, graphite))
  mesh(rod, cylinder, gold, [0,.35,0], [.033,.05,.033])
  const reel = mesh(rod, cylinder, gold, [.06,.22,0], [.075,.05,.075])
  reel.rotation.z = Math.PI / 2
  mesh(rod, sphere, graphite, [.11,.23,0], [.024,.024,.024])
  const rodGuides = [.65,1.1,1.5,1.79].map((y) => ({ y,
    mesh: mesh(rod, sphere, gold, [.018,y,0], [.023,.023,.018]) }))

  const bobber = new THREE.Group()
  bobber.name = 'fishing-live-float'
  container.add(bobber)
  mesh(bobber, sphere, floatCream, [0,-.02,0], [.068,.075,.068])
  mesh(bobber, sphere, floatRed, [0,.032,0], [.062,.049,.062])
  mesh(bobber, cylinder, graphite, [0,.12,0], [.012,.16,.012])
  const linePositions = new Float32Array(18 * 3)
  const lineGeometry = geometry(new THREE.BufferGeometry())
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage))
  const lineMaterial = material(new THREE.LineBasicMaterial({ color: 0xc7eee7, transparent: true, opacity: .84, depthWrite: false }))
  const line = new THREE.Line(lineGeometry, lineMaterial)
  line.frustumCulled = false
  container.add(line)

  const ripples = Array.from({ length: 3 }, () => {
    const paint = material(new THREE.MeshBasicMaterial({ color: 0xc1f5ed, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))
    const ripple = mesh(container, ringGeometry, paint)
    ripple.rotation.x = -Math.PI / 2
    return ripple
  })
  const particleCount = 30
  const particlePositions = new Float32Array(particleCount * 3)
  const particleGeometry = geometry(new THREE.BufferGeometry())
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3).setUsage(THREE.DynamicDrawUsage))
  const particleMaterial = material(new THREE.PointsMaterial({ color: 0xc0f4f1, size: .064, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true }))
  const splashes = new THREE.Points(particleGeometry, particleMaterial)
  splashes.frustumCulled = false
  container.add(splashes)
  const particleVelocity = new Float32Array(particleCount * 3)
  for (let i=0; i<particleCount; i++) {
    const angle = i * 2.399963, speed = .36 + (i % 5) * .13
    particleVelocity[i*3] = Math.cos(angle) * speed
    particleVelocity[i*3+1] = .8 + (i % 7) * .14
    particleVelocity[i*3+2] = Math.sin(angle) * speed
  }

  const catchRoot = new THREE.Group()
  catchRoot.name = 'fishing-landed-catch'
  catchRoot.visible = false
  container.add(catchRoot)
  const bodies = {}
  const makeBody = (kind) => {
    const group = new THREE.Group()
    group.visible = false
    catchRoot.add(group)
    bodies[kind] = group
    return group
  }
  const fish = makeBody('fish')
  const fishBody = mesh(fish, sphere, catchMaterial, [0,0,0], [.32,.14,.105])
  const fishTail = mesh(fish, fin, catchDetail, [-.36,0,0], [.18,.22,.06])
  fishTail.rotation.z = Math.PI / 2
  const dorsal = mesh(fish, fin, catchDetail, [-.025,.15,0], [.12,.19,.035])
  dorsal.rotation.z = .35
  mesh(fish, sphere, eyes, [.22,.055,.095], [.024,.024,.013])
  mesh(fish, sphere, eyes, [.22,.055,-.095], [.024,.024,.013])
  const crab = makeBody('crab')
  mesh(crab, sphere, catchMaterial, [0,0,0], [.23,.115,.19])
  for (const side of [-1,1]) {
    for (let i=0; i<3; i++) {
      const leg = mesh(crab, cylinder, catchDetail, [side*(.22+i*.025),-.015,.12-i*.12], [.018,.23,.018])
      leg.rotation.z = side*1.0
      leg.rotation.x = .25*(i-1)
    }
    mesh(crab, sphere, catchDetail, [side*.29,.09,.17], [.08,.1,.06])
    mesh(crab, sphere, eyes, [side*.09,.12,.12], [.025,.04,.025])
  }
  const shrimp = makeBody('shrimp')
  for(let i=0;i<5;i++) {
    const angle = -.7+i*.4
    mesh(shrimp, sphere, catchMaterial, [Math.cos(angle)*.16-.1,Math.sin(angle)*.16,0], [.075,.065,.07])
  }
  const shrimpTail = mesh(shrimp, fin, catchDetail, [-.17,.16,0], [.13,.11,.04])
  shrimpTail.rotation.z = -.5
  for(const side of [-1,1]) {
    const antenna = mesh(shrimp,cylinder,catchDetail,[.19,-.07,side*.04],[.009,.31,.009])
    antenna.rotation.z=-.7
    mesh(shrimp,sphere,eyes,[.17,-.02,side*.055],[.018,.018,.012])
  }
  const treasure = makeBody('treasure')
  mesh(treasure,box,gold,[0,0,0],[.32,.22,.23])
  mesh(treasure,box,wood,[0,0,.121],[.27,.15,.018])
  mesh(treasure,box,gold,[0,0,.14],[.07,.09,.022])
  const junk = makeBody('junk')
  mesh(junk,sphere,wood,[0,0,0],[.2,.15,.11])
  const catchSprite = mesh(catchRoot,plane,spriteMaterial,[0,0,.135],[.82,.82,1])
  catchSprite.renderOrder = 2

  // Fixed geometry and buffers keep each tier's short celebration within four draws.
  const celebrationRoot = new THREE.Group()
  celebrationRoot.name = 'fishing-tier-celebration'
  celebrationRoot.visible = false
  container.add(celebrationRoot)
  const glowPositions = new Float32Array(48 * 3)
  const glowGeometry = geometry(new THREE.BufferGeometry())
  glowGeometry.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3).setUsage(THREE.DynamicDrawUsage))
  const glowPaint = material(new THREE.PointsMaterial({ color:0xffffff, size:.065, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, toneMapped:false }))
  const glow = new THREE.Points(glowGeometry, glowPaint)
  glow.frustumCulled = false
  celebrationRoot.add(glow)
  const haloGeometry = geometry(new THREE.TorusGeometry(.56,.016,5,48))
  const halos = Array.from({length:2},()=>mesh(celebrationRoot,haloGeometry,material(new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}))))
  const rayPositions = new Float32Array(12 * 2 * 3)
  const rayGeometry = geometry(new THREE.BufferGeometry())
  rayGeometry.setAttribute('position',new THREE.BufferAttribute(rayPositions,3).setUsage(THREE.DynamicDrawUsage))
  const rayPaint = material(new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}))
  const rays = new THREE.LineSegments(rayGeometry,rayPaint)
  rays.frustumCulled=false
  celebrationRoot.add(rays)
  const comboCoins = new THREE.InstancedMesh(cylinder,material(new THREE.MeshBasicMaterial({color:0xffd368,toneMapped:false})),16)
  comboCoins.name='fishing-combo-coins'
  comboCoins.visible=false
  comboCoins.frustumCulled=false
  comboCoins.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  container.add(comboCoins)
  const coinMatrix=new THREE.Matrix4(),coinPosition=new THREE.Vector3(),coinScale=new THREE.Vector3(.055,.012,.055)
  const coinRotation=new THREE.Quaternion(),coinEuler=new THREE.Euler()

  const hand = new THREE.Vector3(), handWorld = new THREE.Vector3(), water = new THREE.Vector3()
  const tip = new THREE.Vector3(), floatStart = new THREE.Vector3(), catchStart = new THREE.Vector3()
  const toward = new THREE.Vector3(), rodDirection = new THREE.Vector3(), up = new THREE.Vector3(0,1,0)
  const localHand = new THREE.Vector3(.19,.88,.22)
  const armHand = new THREE.Vector3(0,-.22,0)
  const tipLocal = new THREE.Vector3(0,1.82,0)
  const originalCameraRotation = new THREE.Quaternion()
  const rodStart = new THREE.Vector3(), rodEnd = new THREE.Vector3(), rodAxis = new THREE.Vector3()
  const projection = new THREE.Vector3()
  const loader = new THREE.TextureLoader()
  let disposed = false, activity = null, phaseStartedAt = null, sessionStartedAt = null
  let sessionId = null, originalYaw = null, activeCatchId = null, splashStartedAt = -Infinity
  let reducedMotion = false, spriteReady = false
  const resultFloatStart = new THREE.Vector3()
  let captureResultFloat = false
  const waterY = .18
  const rig = player?.userData?.walkingFigure?.userData?.rig
  const holdingArm = rig?.parts?.rightForearm || rig?.parts?.rightArm
  const gripSocket = player?.userData?.walkingFigure?.getObjectByName?.('rightGrip')
  if(holdingArm?.geometry) {
    holdingArm.geometry.computeBoundingBox()
    const bounds=holdingArm.geometry.boundingBox
    if(bounds) armHand.set((bounds.min.x+bounds.max.x)/2,bounds.min.y+.018,(bounds.min.z+bounds.max.z)/2)
  }

  function restorePose() {
    if (!rig?.parts || !rig?.base) return
    for(const key of POSED_PARTS) {
      const part=rig.parts[key], base=rig.base[key]
      if (!part || !base) continue
      if(base.position) part.position.copy(base.position)
      if(base.rotation) part.rotation.copy(base.rotation)
    }
  }
  function restorePlayer() {
    restorePose()
    if(originalYaw !== null && player) player.rotation.y=originalYaw
    originalYaw=null
  }
  function loadCatch(id) {
    if (activeCatchId===id) return
    activeCatchId=id
    spriteReady=false
    catchSprite.visible=false
    const item=FISHING_CATCHES[id]
    for(const [kind, body] of Object.entries(bodies)) body.visible=Boolean(item && item.kind===kind)
    if (!item) return
    const tier=FISHING_TIERS[item.tier] || FISHING_TIERS.common
    catchMaterial.color.set(tier.color)
    catchDetail.color.set(tier.color).multiplyScalar(.66)
    const elongated = item.kind==='fish' && /鳗|泥鳅|黄鳝/.test(item.name)
    catchSprite.position.z=item.kind==='crab'?.205:.145
    fishBody.scale.set(elongated?.43:.32,elongated?.07:.14,.105)
    fishTail.position.x=elongated?-.46:-.36
    dorsal.visible=!elongated
    const cached=textures.get(id)
    if(cached) { spriteMaterial.map=cached; spriteMaterial.needsUpdate=true; spriteReady=true; return }
    loader.load(item.sprite,(texture)=>{
      if(disposed) { texture.dispose(); return }
      texture.colorSpace=THREE.SRGBColorSpace
      texture.anisotropy=2
      textures.set(id,texture)
      if(activeCatchId===id) { spriteMaterial.map=texture; spriteMaterial.needsUpdate=true; spriteReady=true }
    },undefined,()=>{
      // The solid 3D body remains visible when an optional side texture cannot load.
      if(!disposed && activeCatchId===id) { spriteMaterial.map=null; spriteReady=false }
    })
  }
  function setActivity(next) {
    if(disposed) return
    const placement = next && FISHING_SPOT_PLACEMENTS[next.spotId]
    const spot = next && FISHING_SPOTS[next.spotId]
    if(!next || next.phase==='idle' || !placement || !spot || (mapInfo?.id && spot.mapId!==mapInfo.id) || !VALID_PHASES.has(next.phase)) {
      activity=null; container.visible=false; catchRoot.visible=false; celebrationRoot.visible=false; comboCoins.visible=false; restorePlayer()
      sessionId=null; phaseStartedAt=null; sessionStartedAt=null; return
    }
    const nextId=next.sessionId || next.session_id || `${next.spotId}:activity`
    if(originalYaw===null && player) originalYaw=player.rotation.y
    if(nextId!==sessionId) {
      sessionId=nextId; sessionStartedAt=null; phaseStartedAt=null
      catchRoot.visible=false; splashStartedAt=-Infinity; captureResultFloat=false
    } else if(next.phase!==activity?.phase) {
      if(next.phase==='result') { resultFloatStart.copy(bobber.position); captureResultFloat=true }
      if(next.phase === 'waiting' && activity?.phase === 'casting') splashStartedAt = -1
      phaseStartedAt=null
    }
    reducedMotion = typeof next.reducedMotion==='boolean' ? next.reducedMotion : Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    activity={...next}
    water.set((placement.waterX-width/2)*CELL+CELL/2,waterY,(placement.waterY-height/2)*CELL+CELL/2)
    container.visible=true
    if(next.catchId) loadCatch(next.catchId)
  }

  function update(now) {
    if(disposed || !activity || !container.visible || !player || !Number.isFinite(now)) return
    if(sessionStartedAt===null) sessionStartedAt=now
    if(phaseStartedAt===null) {
      phaseStartedAt=now
      if(['reeling','settling','result'].includes(activity.phase) || splashStartedAt === -1) splashStartedAt=now
      catchStart.copy(water)
    }
    const elapsed=(now-phaseStartedAt)/1000
    const total=(now-sessionStartedAt)/1000
    const phase=activity.phase
    toward.set(water.x-player.position.x,0,water.z-player.position.z)
    player.rotation.y=Math.atan2(toward.x,toward.z)
    let tilt=.74, pose=-.65, tug=0
    if(phase==='casting') {
      const duration=reducedMotion?.24:.38, t=clamp(elapsed/duration)
      tilt=t<.32 ? -.35*Math.sin(t/.32*Math.PI/2) : -.35+1.38*ease((t-.32)/.68)
      tilt+=Math.sin(t*Math.PI*4)*.07*(1-t)
      pose=-.45-tilt*.53
    } else if(phase==='waiting' || phase==='idle') {
      tilt=.8+(reducedMotion?0:Math.sin(total*1.5)*.025)
      pose=-.78
    } else if(phase==='reeling') {
      tug=reducedMotion?.06:Math.sin(elapsed*7)*.13
      tilt=.86+tug
      pose=-.9-tug*.4
    } else if(phase==='settling') {
      tilt=.82-ease(elapsed/.38)*1.02
      pose=-.54
    } else if(phase==='result') {
      tilt=.82-ease(elapsed/.16)*1.02+ease((elapsed-.16)/.64)*.5
      pose=-.55+ease(elapsed/1.4)*.17
    }
    if(rig?.parts && rig?.base) {
      restorePose()
      for(const key of HOLDING_ARMS) {
        const part=rig.parts[key], base=rig.base[key]
        if(!part || !base?.rotation) continue
        part.rotation.x=base.rotation.x+pose
        part.rotation.z=base.rotation.z+(key==='rightArm'?-.12:.13)
      }
      for(const key of ['rightForearm','leftForearm']) {
        const part=rig.parts[key],base=rig.base[key]
        if(part&&base?.rotation)part.rotation.x=base.rotation.x-.28+(phase==='reeling'?-tug*.25:0)
      }
      if(rig.parts.body && rig.base.body?.rotation) rig.parts.body.rotation.x=rig.base.body.rotation.x+(phase==='casting'?.04:phase==='reeling'?.035*Math.sin(elapsed*7):0)
      if(rig.parts.head && rig.base.head?.rotation) rig.parts.head.rotation.x=rig.base.head.rotation.x-.08
    }
    player.updateWorldMatrix(true,true)
    if(gripSocket) gripSocket.getWorldPosition(handWorld)
    else if(holdingArm) { handWorld.copy(armHand); holdingArm.localToWorld(handWorld) }
    else { handWorld.copy(localHand); player.localToWorld(handWorld) }
    root.worldToLocal(hand.copy(handWorld))
    toward.copy(water).sub(hand); toward.y=0; toward.normalize()
    rod.position.copy(hand)
    rodDirection.copy(toward).multiplyScalar(Math.sin(tilt))
    rodDirection.y=Math.cos(tilt)
    rod.quaternion.setFromUnitVectors(up,rodDirection.normalize())
    const bend = phase === 'reeling' ? .16 + Math.sin(elapsed * 7) * .035
      : phase === 'casting' ? Math.sin(clamp(elapsed / .38) * Math.PI) * .11
      : phase === 'settling' || phase === 'result' ? .15 * (1 - ease(elapsed / .38)) : .035
    for (let i = 0; i < rodSegments.length; i++) {
      const t0 = i / rodSegments.length, t1 = (i + 1) / rodSegments.length
      rodStart.set(0, .3 + t0 * 1.52, bend * t0 * t0)
      rodEnd.set(0, .3 + t1 * 1.52, bend * t1 * t1)
      const segment = rodSegments[i]
      segment.position.copy(rodStart).add(rodEnd).multiplyScalar(.5)
      rodAxis.subVectors(rodEnd, rodStart)
      segment.scale.set(.022 - t0 * .011, rodAxis.length() + .006, .022 - t0 * .011)
      segment.quaternion.setFromUnitVectors(up, rodAxis.normalize())
    }
    for (const guide of rodGuides) guide.mesh.position.z = bend * ((guide.y - .3) / 1.52) ** 2
    tipLocal.z = bend
    rod.updateWorldMatrix(true,true)
    tip.copy(tipLocal); rod.localToWorld(tip); root.worldToLocal(tip)
    floatStart.copy(hand).addScaledVector(toward,.22)
    if(phase==='casting') {
      const t=ease(elapsed/(reducedMotion?.24:.38))
      bobber.position.lerpVectors(floatStart,water,t)
      bobber.position.y+=Math.sin(t*Math.PI)*(reducedMotion?.35:1.25)
    } else if(phase==='waiting' || phase==='idle') {
      bobber.position.copy(water)
      bobber.position.y+=(reducedMotion?.008:Math.sin(total*2.7)*.035)
    } else if(phase==='reeling') {
      bobber.position.copy(water)
      bobber.position.y-=.08+Math.abs(Math.sin(elapsed*5.5))*.06
      bobber.position.x+=toward.x*Math.sin(elapsed*7)*.035
      bobber.position.z+=toward.z*Math.sin(elapsed*7)*.035
    } else {
      const t=ease(elapsed/(phase==='result'?.58:.4))
      bobber.position.lerpVectors(phase==='result' && captureResultFloat ? resultFloatStart : water,hand,t)
      bobber.position.y+=Math.sin(t*Math.PI)*.55
    }
    bobber.rotation.z=phase==='reeling'?Math.sin(elapsed*7)*.2:Math.sin(total*1.7)*.04
    bobber.visible=phase!=='result' || elapsed<.7
    line.visible=bobber.visible
    const sag=phase==='waiting'||phase==='idle'?.12:phase==='casting'?.24:.025
    for(let i=0;i<18;i++) {
      const t=i/17, index=i*3
      linePositions[index]=tip.x+(bobber.position.x-tip.x)*t
      linePositions[index+1]=tip.y+(bobber.position.y-tip.y)*t-Math.sin(t*Math.PI)*sag
      linePositions[index+2]=tip.z+(bobber.position.z-tip.z)*t
    }
    lineGeometry.attributes.position.needsUpdate=true
    const quiet=phase==='casting'||phase==='result'||phase==='settling'
    for(let i=0;i<ripples.length;i++) {
      const t=((total*(phase==='reeling'?1.55:.6)+i/3)%1)
      const ring=ripples[i]
      ring.position.copy(water); ring.position.y=waterY-.036+i*.001
      const scale=.12+t*(phase==='reeling'?.5:.32)
      ring.scale.setScalar(scale)
      ring.material.opacity=quiet?0:(1-t)*(phase==='reeling'?.48:.2)*(reducedMotion?.5:1)
    }
    const splashAge=(now-splashStartedAt)/1000
    const splashLife=reducedMotion?.32:.8
    particleMaterial.opacity=splashAge>=0&&splashAge<splashLife?(1-splashAge/splashLife)*(reducedMotion?.3:.85):0
    if(particleMaterial.opacity>0) {
      for(let i=0;i<particleCount;i++) {
        const index=i*3, t=splashAge
        particlePositions[index]=water.x+particleVelocity[index]*t
        particlePositions[index+1]=waterY+particleVelocity[index+1]*t-2.1*t*t
        particlePositions[index+2]=water.z+particleVelocity[index+2]*t
      }
      particleGeometry.attributes.position.needsUpdate=true
    }
    catchRoot.visible=phase==='result'&&activity.success===true&&elapsed>=.1&&elapsed<3.2&&Boolean(activity.catchId&&FISHING_CATCHES[activeCatchId])
    catchSprite.visible=spriteReady
    if(catchRoot.visible) {
      const t=ease((elapsed-.1)/(reducedMotion?.45:.85))
      catchRoot.position.lerpVectors(catchStart,hand,t)
      catchRoot.position.y+=Math.sin(t*Math.PI)*(reducedMotion?.45:1.5)+.12
      catchRoot.rotation.set(Math.sin(t*Math.PI)*.15,Math.sin(elapsed*3)*.16,(1-t)*-.32)
      if(camera) {
        camera.getWorldQuaternion(originalCameraRotation)
        catchSprite.quaternion.copy(originalCameraRotation)
      }
      const scale=clamp((3.2-elapsed)/.5)*(.8+Math.sin(t*Math.PI)*.17)
      catchRoot.scale.setScalar(scale)
      fishTail.rotation.y = Math.sin(elapsed * 23) * .28 * (1 - t * .7)
      shrimpTail.rotation.x = Math.sin(elapsed * 19) * .2 * (1 - t * .7)
    }
    const profile = getFishingCelebration(FISHING_CATCHES[activeCatchId]?.tier)
    const celebrationAge = elapsed - .35
    const progress = clamp(celebrationAge / profile.duration)
    celebrationRoot.visible = catchRoot.visible && celebrationAge >= 0 && progress < 1
    if (celebrationRoot.visible) {
      celebrationRoot.position.copy(catchRoot.position)
      const fade = Math.sin(Math.PI * progress) * (reducedMotion ? .35 : .85)
      const particleLimit = reducedMotion ? Math.min(8,profile.particles) : profile.particles
      glowGeometry.setDrawRange(0,particleLimit)
      glowPaint.color.set(profile.color)
      glowPaint.opacity = fade
      glowPaint.size = profile.style === 'crown' ? .095 : .065
      for (let i=0;i<particleLimit;i++) {
        const seed=i/particleLimit, angle=seed*TAU+(profile.style==='spiral'?progress*TAU*1.7:progress*.8)
        const radius=profile.style==='ripple' ? .3+progress*.65 : profile.style==='spiral' ? .38+seed*.25 : .15+ease(progress)*(.45+seed*.4)
        const index=i*3
        glowPositions[index]=Math.cos(angle)*radius
        glowPositions[index+2]=Math.sin(angle)*radius
        glowPositions[index+1]=profile.style==='spiral' ? seed*.95-progress*.22 : profile.style==='crown' ? .3+Math.abs(Math.sin(angle*3))*.45+progress*.25 : Math.sin(seed*13)*.18+progress*.35
      }
      glowGeometry.attributes.position.needsUpdate=true
      for (let i=0;i<halos.length;i++) {
        const halo=halos[i]
        halo.visible=!reducedMotion && i<profile.rings
        halo.material.color.set(profile.color)
        halo.material.opacity=fade*.65
        halo.scale.setScalar(.45+ease(progress)*(.8+i*.3))
        halo.rotation.set(profile.style==='spiral' ? .7+i*.8 : Math.PI/2,progress*1.4,i*.55)
        halo.position.y=profile.style==='crown'?.48:i*.12
      }
      rays.visible=!reducedMotion && profile.rays>0
      rayGeometry.setDrawRange(0,profile.rays*2)
      rayPaint.color.set(profile.color); rayPaint.opacity=fade*.8
      for (let i=0;i<profile.rays;i++) {
        const angle=i/profile.rays*TAU+progress*.25, index=i*6
        const inner=.32+ease(progress)*.18, outer=inner+.2*Math.sin(Math.PI*progress)
        rayPositions[index]=Math.cos(angle)*inner;rayPositions[index+1]=Math.sin(angle)*inner+.25;rayPositions[index+2]=0
        rayPositions[index+3]=Math.cos(angle)*outer;rayPositions[index+4]=Math.sin(angle)*outer+.25;rayPositions[index+5]=0
      }
      rayGeometry.attributes.position.needsUpdate=true
      if(camera) { camera.getWorldQuaternion(originalCameraRotation); rays.quaternion.copy(originalCameraRotation) }
    }
    const comboAge=elapsed-.55
    comboCoins.visible=phase==='result'&&activity.success===true&&(activity.hitStreak ?? activity.perfectStreak ?? 0)>=2&&comboAge>=0&&comboAge<1.6&&!reducedMotion
    if(comboCoins.visible) {
      comboCoins.count=(activity.hitStreak ?? activity.perfectStreak ?? 0)>=8?16:(activity.hitStreak ?? activity.perfectStreak ?? 0)>=5?12:8
      const t=clamp(comboAge/1.6),radius=Math.sin(Math.PI*t)*.8
      for(let i=0;i<comboCoins.count;i++) {
        const angle=i/comboCoins.count*TAU+t*TAU
        coinPosition.copy(hand);coinPosition.x+=Math.cos(angle)*radius;coinPosition.z+=Math.sin(angle)*radius
        coinPosition.y+=.25+Math.sin(Math.PI*t)*(1+(i%3)*.15)
        coinRotation.setFromEuler(coinEuler.set(Math.PI/2,angle+t*6,t*5))
        coinScale.setScalar(.055*(1-t*.65));coinScale.y*=.22
        coinMatrix.compose(coinPosition,coinRotation,coinScale);comboCoins.setMatrixAt(i,coinMatrix)
      }
      comboCoins.instanceMatrix.needsUpdate=true
    }
  }
  function dispose() {
    if(disposed) return
    disposed=true
    restorePlayer()
    root.remove(container)
    comboCoins.dispose()
    for(const texture of textures.values()) texture.dispose()
    for(const item of geometries) item.dispose()
    for(const item of materials) item.dispose()
    textures.clear(); geometries.clear(); materials.clear()
    activity=null
  }
  function getDebugState() {
    const projected = (position) => {
      if (!camera) return null
      projection.copy(position).applyMatrix4(root.matrixWorld).project(camera)
      return { x: projection.x, y: projection.y, z: projection.z }
    }
    return { phase:activity?.phase || null, sessionId, visible:container.visible,
      rodTip:{ x:tip.x, y:tip.y, z:tip.z }, bobber:{ x:bobber.position.x, y:bobber.position.y, z:bobber.position.z },
      fishPosition:{ x:catchRoot.position.x, y:catchRoot.position.y, z:catchRoot.position.z },
      fishVisible:catchRoot.visible, textureReady:spriteReady, lineVertexCount:lineGeometry.attributes.position.count,
      celebrationVisible:celebrationRoot.visible, celebrationStyle:getFishingCelebration(FISHING_CATCHES[activeCatchId]?.tier).style,
      celebrationParticles:glowGeometry.drawRange.count, celebrationRings:halos.filter((halo)=>halo.visible).length,
      comboCoinsVisible:comboCoins.visible, comboCoinCount:comboCoins.visible?comboCoins.count:0,
      bobberNdc:projected(bobber.position), rodTipNdc:projected(tip), fishNdc:projected(catchRoot.position) }
  }
  return { setActivity, update, dispose, getDebugState }
}
