import { VFX_ATLAS } from './battleVfxAtlas.generated.js'
import { BATTLE_EFFECT_FALLBACK_ANCHORS } from './battleEffectAnchors'
import { getBattleMoveImpactDelay } from './battlePacing'
import { getContactPlacement } from './battleVfxChoreography.js'

const TAU = Math.PI * 2
const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n))
const lerp = (a, b, t) => a + (b - a) * t
const ease = n => 1 - (1 - clamp(n)) ** 3
const noise = n => { const f = Math.sin(n * 127.1 + 311.7) * 43758.5453; return f - Math.floor(f) }
const spritesByImage = new WeakMap()

function materialSprite(image, material, color) {
  let cache = spritesByImage.get(image)
  if (!cache) { cache = new Map(); spritesByImage.set(image, cache) }
  const key = `${material}:${color}`
  if (cache.has(key)) return cache.get(key)
  const neutral = color === 'natural' ? -1 : VFX_ATLAS.sprites.indexOf(`${material}-neutral`)
  const index = Math.max(0, neutral >= 0 ? neutral : VFX_ATLAS.sprites.indexOf(material))
  const tile = document.createElement('canvas')
  tile.width = tile.height = VFX_ATLAS.size
  const ctx = tile.getContext('2d')
  const draw = () => ctx.drawImage(image, index % VFX_ATLAS.columns * tile.width, Math.floor(index / VFX_ATLAS.columns) * tile.height, tile.width, tile.height, 0, 0, tile.width, tile.height)
  draw()
  if (color !== 'natural') {
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = color
    ctx.fillRect(0, 0, tile.width, tile.height)
    ctx.globalCompositeOperation = 'destination-in'
    draw()
  }
  // Bound memory across a long session visiting many move palettes.
  if (cache.size >= 128) cache.delete(cache.keys().next().value)
  cache.set(key, tile)
  return tile
}

export function createBattleVfxRenderer(ctx, image, recipe, effect, { quality = 'standard', reducedMotion = false } = {}) {
  const budget = { lite: 70, standard: 110, high: 160 }[quality] || 110
  const density = quality === 'lite' ? .65 : quality === 'high' ? 1.2 : 1
  const [main, dark, light] = recipe.palette
  const prepared = new Map()
  const getSprite = (material, color) => {
    const key = `${material}:${color}`
    if (!prepared.has(key)) prepared.set(key, materialSprite(image, material, color))
    return prepared.get(key)
  }
  // All textures used by this move are prepared before its first visible frame,
  // including impact dust and dark flame. No new canvas/texture at impact.
  const extraMaterials = ({
    slam: ['dust'], quake: ['dust'], eruption: ['dust', 'splash'],
    anatomy: [(['head','knee'].includes(recipe.subject) ? 'metal' : recipe.subject), 'dust',
      ...({fire_punch:['flame','firetongue'],blaze_kick:['flame','firetongue'],ice_punch:['ice'],aqua_tail:['droplet'],rage_fist:['smoke']}[recipe.key] || []),
      ...(recipe.subject === 'wing' ? ['feather'] : [])],
    frenzy: ['horn', 'claw', 'fist', 'sole', 'palm', 'dust', 'scale', 'flame'],
    vine: ['leaf'], tongue: ['droplet'], armor: ['shell', 'metal', 'scale', 'droplet'],
    'bone-swing': ['dust'], boomerang: ['dust'], 'dragon-dive': ['horn', 'scale'],
    orb: ['smoke'], explosion: ['smoke'], fang: ['tooth'],
    wave: ['mist', 'droplet', 'foam'], jet: ['droplet'],
    storm: ['mist'], vortex: ['mist'], barrier: ['bubble'],
    hammer: ['dust', 'splash'], burrow: ['dust'], toss: ['dust'], hop: ['dust'],
    heal: ['shell', 'leaf', 'droplet'], 'egg-heal': ['shell'],
    'rock-prison': ['dust'], 'sword-dance': ['metal'],
  })[recipe.technique] || []
  const resultMaterial = { burn: 'flame', poison: 'droplet', paralysis: 'spark', sleep: 'mist', freeze: 'frost', confusion: 'mist' }[effect.visualResult?.status]
  const authoredDetails = { quiver_dance: ['wing'], dragon_dance: ['scale'], hone_claws: ['claw'], growth: ['leaf'], lava_plume: ['smoke'] }[recipe.key] || []
  for (const material of new Set([recipe.material, 'light', 'spark', ...extraMaterials, ...authoredDetails, ...(resultMaterial ? [resultMaterial] : []), ...(recipe.key === 'soft_boiled' ? ['shell'] : [])])) {
    for (const color of recipe.palette) getSprite(material, color)
    getSprite(material, 'natural')
  }
  const result = effect.visualResult
  const healing = result?.kind === 'heal' || effect.feedback?.kind === 'heal'
  const falling = result?.kind === 'stat' && result.stages < 0
  const resultColor = healing ? '#b0f6cb' : result?.kind === 'stat' ? falling ? '#a598d3' : '#f4dc92' : main
  if (healing || result?.kind === 'stat') getSprite('light', resultColor)
  if (recipe.technique === 'tears') getSprite('droplet', '#b8e5fa')
  let draws = 0
  const stamp = (material, x, y, size, rotation = 0, alpha = 1, color = main, aspect = 1, mirror = 1) => {
    if (alpha <= .003 || size <= .1 || draws >= budget) return
    draws++
    ctx.save()
    ctx.globalAlpha = clamp(alpha)
    // The atlas already carries soft transparent glow. Repeated screen blends
    // force destination reads on mobile GPUs for every flame/spark.
    ctx.translate(x, y)
    ctx.rotate(rotation)
    if (mirror < 0) ctx.scale(-1, 1)
    ctx.drawImage(getSprite(material, color), -size / 2, -size * aspect / 2, size, size * aspect)
    ctx.restore()
  }
  const line = (points, width, alpha = 1, color = main) => {
    if (alpha <= .003 || points.length < 2 || draws >= budget) return
    draws++
    ctx.save()
    ctx.globalAlpha = clamp(alpha)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(.4, width)
    ctx.beginPath()
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
    ctx.stroke()
    ctx.restore()
  }
  const ribbon = (points, width, alpha) => {
    line(points, width * 1.7, alpha * .42, dark)
    line(points, width, alpha * .8, main)
    line(points, width * .28, alpha, light)
  }
  const ellipse = (x, y, rx, ry, alpha, width = 2, color = main, rotation = 0) => {
    if (alpha <= .003 || draws >= budget) return
    draws++
    ctx.save(); ctx.globalAlpha = clamp(alpha); ctx.strokeStyle = color; ctx.lineWidth = width
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), rotation, 0, TAU); ctx.stroke(); ctx.restore()
  }
  const fillShape = (points, color, alpha = 1) => {
    if (alpha <= .003 || draws >= budget) return
    draws++
    ctx.save(); ctx.globalAlpha = clamp(alpha); ctx.fillStyle = color; ctx.beginPath()
    points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y))
    ctx.closePath(); ctx.fill(); ctx.restore()
  }

  return {
    warmup() {
      ctx.save()
      ctx.globalAlpha = .01
      for (const sprite of prepared.values()) ctx.drawImage(sprite, 0, 0, 1, 1)
      ctx.restore()
    },
    render(progress, width, height) {
      draws = 0
      ctx.clearRect(0, 0, width, height)
      const p = clamp(progress)
      if (p >= 1) return { draws, finished: true }
      const phase = effect.visualResult?.kind === 'blocked' ? 'fizzle' : effect.phase || 'hit'
      const anchors = effect.anchors || BATTLE_EFFECT_FALLBACK_ANCHORS
      const actorSide = effect.attackerSide === 'enemy' ? 'enemy' : 'player'
      const targetSide = ['player', 'enemy'].includes(effect.target) ? effect.target
        : recipe.target === 'self' ? actorSide : actorSide === 'player' ? 'enemy' : 'player'
      const unit = clamp(Math.min(width / 900, height / 540), .72, 1.35)
      const targetRadius = Number(anchors[targetSide]?.radius) || Math.min(width, height) * .15
      // Scale against the combatant, not the full viewport width. A 390px
      // portrait screen still needs a readable 90–160px contact effect.
      const size = clamp(targetRadius * .9, 48, 96) * (.85 + recipe.energy * .15)
      const scale = recipe.spread
      const position = side => {
        const a = anchors[side] || BATTLE_EFFECT_FALLBACK_ANCHORS[side]
        return [parseFloat(a.x) / 100 * width, parseFloat(a.y) / 100 * height]
      }
      const source = position(actorSide), target = position(recipe.selfOnly ? actorSide : targetSide)
      if (phase === 'miss') { target[0] += (actorSide === 'player' ? 1 : -1) * size * 1.3; target[1] -= size * 1.5 }
      const dx = target[0] - source[0], dy = target[1] - source[1]
      const direction = Math.atan2(dy, dx)
      const duration = effect.durationMs || effect.profile?.durationMs || 1420
      const hitT = getBattleMoveImpactDelay(phase, duration) / duration
      const flight = clamp((p - .035) / Math.max(.1, hitT - .035))
      const age = clamp((p - hitT) / (1 - hitT))
      const hit = p >= hitT && !['miss', 'fizzle', 'charge', 'start'].includes(phase)
      const tail = (1 - age) ** 1.7
      const globalAlpha = Math.min(1, p * 14) * Math.min(1, (1 - p) * 7)
      const count = Math.max(1, Math.round(recipe.count * density))
      const motion = recipe.motion
      const hitIndex = Math.max(0, Number(effect.feedback?.hitIndex ?? effect.profile?.hitIndex) || 0)
      const pathPoint = (t, offset = 0, bend = recipe.bend) => {
        const bow = Math.sin(t * Math.PI)
        const bendByMotion = { straight: 0, thrust: 0, arc: -.9, overhead: -1.7, low: .75, drop: -1.5, home: .8, hook: -.65 }
        const curve = bendByMotion[motion] ?? bend
        const spiral = ['helix','coil','ripple'].includes(motion) ? Math.sin(t * Math.PI * 4) * size * .28 * bow : 0
        return [lerp(source[0], target[0], t) - Math.sin(direction) * (offset + spiral),
          lerp(source[1], target[1], t) + bow * curve * size * 1.4 + Math.cos(direction) * (offset + spiral)]
      }
      const motes = (center, material, amount, radius, alpha, flow = 'out', color = main) => {
        for (let i = 0; i < amount; i++) {
          const n = noise(i + 3), angle = i * 2.399 + recipe.rotation + (flow === 'orbit' ? p * 4 : 0)
          const r = radius * (flow === 'in' || motion === 'compress' || motion === 'implode' ? 1 - age : flow === 'orbit' ? .7 + n * .3 : .2 + ease(age) * (.5 + n))
          const x = center[0] + Math.cos(angle) * r, y = center[1] + Math.sin(angle) * r * .7 - (flow === 'rise' ? age * size : 0)
          stamp(material, x, y, size * (.18 + n * .25), angle + p * recipe.rotation * 2, alpha * (.5 + n * .5), color)
        }
      }
      const impact = (material = recipe.material, strength = 1) => {
        if (!hit) return
        stamp('light', ...target, size * scale * (2 + age * 1.8) * strength, 0, tail * .55, light)
        if (recipe.power > 0) ellipse(target[0], target[1] + size * .25, size * scale * (1 + age * 2), size * scale * (.3 + age * .4), tail * .35, unit * 2, main)
        motes(target, material, Math.min(18, count + 3), size * scale * 1.2, tail * .85)
      }
      const contactBurst = (strength = 1) => {
        if (!hit) return
        const hold = 1 - clamp((age - .18) / .82)
        const radius = size * scale * strength
        stamp('light', ...target, radius * (1.4 + age), 0, hold * .34, main)
        stamp(recipe.material, ...target, radius * (1.15 + ease(age) * .6), recipe.rotation, hold * .72, main)
        for (let i = 0; i < Math.min(7, count + 2); i++) {
          const a = direction + (noise(i + 43) - .5) * 2.5
          const r = radius * (.35 + ease(age) * (1 + noise(i)))
          const points = [[target[0] + Math.cos(a) * r * .7, target[1] + Math.sin(a) * r * .7],
            [target[0] + Math.cos(a) * r, target[1] + Math.sin(a) * r]]
          line(points, Math.max(1, size * .035 * hold), hold * .7, dark)
          stamp('spark', points[1][0], points[1][1], size * .45 * hold, a, hold * .75, light)
        }
        motes(target, recipe.material, Math.min(12, count + 2), radius, hold * .8)
      }
      const sweep = (center, angle, radius, thickness, alpha, material = recipe.material) => {
        if (alpha <= .003) return
        // Crescent-shaped material with a taper at both ends, never a capsule.
        if (draws >= budget) return
        draws++
        ctx.save(); ctx.globalAlpha = alpha * .86; ctx.fillStyle = main; ctx.beginPath()
        for (let i = 0; i <= 16; i++) {
          const t = i / 16, a = angle + (t - .5) * 1.8
          const x = center[0] + Math.cos(a) * radius, y = center[1] + Math.sin(a) * radius * .8
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y)
        }
        for (let i = 16; i >= 0; i--) {
          const t = i / 16, a = angle + (t - .5) * 1.8, r = radius - Math.sin(t * Math.PI) * thickness
          ctx.lineTo(center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r * .8)
        }
        ctx.closePath(); ctx.fill(); ctx.restore()
        for (let i = 0; i < 3; i++) {
          const t = .28 + i * .22, a = angle + (t - .5) * 1.8
          stamp(material, center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius * .8,
            thickness * (1.4 + i * .2), a, alpha * .7, i % 2 ? light : main)
        }
      }
      const clawStroke = (center, angle, length, thickness, alpha) => {
        if (alpha <= .003 || draws >= budget) return
        if (draws + 3 > budget) return
        draws += 3
        ctx.save(); ctx.translate(...center); ctx.rotate(angle); ctx.globalAlpha = clamp(alpha)
        // A tapered, curved gash with a dark rim remains readable over a pale
        // monster and a bright battlefield. It is a material stroke, no glyph.
        ctx.beginPath(); ctx.moveTo(-length * .54, thickness * .9)
        ctx.quadraticCurveTo(-length * .06, -thickness * 1.7, length * .53, -thickness * .4)
        ctx.quadraticCurveTo(length * .12, thickness * .4, -length * .54, thickness * .9)
        ctx.fillStyle = dark; ctx.fill()
        ctx.beginPath(); ctx.moveTo(-length * .52, thickness * .6)
        ctx.quadraticCurveTo(-length * .03, -thickness, length * .52, -thickness * .37)
        ctx.quadraticCurveTo(length * .08, thickness * .05, -length * .52, thickness * .6)
        ctx.fillStyle = main; ctx.fill()
        ctx.beginPath(); ctx.moveTo(-length * .4, thickness * .2)
        ctx.quadraticCurveTo(length * .06, -thickness * .65, length * .47, -thickness * .38)
        ctx.lineWidth = Math.max(1.4, thickness * .16); ctx.strokeStyle = light; ctx.stroke()
        ctx.restore()
      }
      const showResult = () => {
        if (!hit || !result || result.kind === 'blocked') return
        if (result.kind === 'stat' || healing) {
          // Changes begin at the same visible impact as the actual stat/HP update.
          const magnitude = Math.min(3, Math.abs(result.stages || 1))
          for (let i = 0; i < 6 + magnitude * 2; i++) {
            const q = (age * 1.3 + i * .13) % 1
            const x = target[0] + (noise(i + 90) - .5) * size * 1.5
            const y = target[1] + (falling ? q - .5 : .5 - q) * size * 1.7
            stamp('light', x, y, size * (.2 + magnitude * .07), 0, Math.sin(q * Math.PI) * tail, resultColor, 1.8)
          }
        } else if (result.status === 'freeze') {
          for (let i = 0; i < 5; i++) stamp('frost', target[0] + (i - 2) * size * .3, target[1] + size * .28,
            size * .9, (i - 2) * .15, tail * .8, light)
        } else if (result.status === 'confusion') {
          for (let i = 0; i < 3; i++) {
            const a = age * 7 + i * TAU / 3
            stamp('mist', target[0] + Math.cos(a) * size * .7, target[1] - size * .7 + Math.sin(a) * size * .15,
              size * .65, a, tail * .75, main)
          }
        } else if (resultMaterial) {
          motes(target, resultMaterial, 9, size * .7, tail * .8, result.status === 'sleep' ? 'orbit' : 'rise')
        }
      }

      // Accessibility applies to every phase, including charge and secondary.
      // Retain a local material cue, without travelling particles or screen motion.
      if (reducedMotion) {
        const actorFocused = ['charge', 'start', 'fizzle'].includes(phase)
        const center = actorFocused ? source : target
        if (actorFocused || hit) {
          const subject = recipe.subject && !['head','knee'].includes(recipe.subject) ? recipe.subject : recipe.material
          stamp(subject, ...center, size * Math.max(.8,scale) * 1.5, recipe.rotation, globalAlpha * .85, recipe.subject ? 'natural' : main)
          for (let i = 0; i < 5; i++) {
            const a = i * TAU / 5 + recipe.rotation
            stamp(recipe.material, center[0] + Math.cos(a) * size * .65, center[1] + Math.sin(a) * size * .4, size * .2, a, globalAlpha * .5)
          }
        }
        return { draws }
      }
      // Charge stays on the caster; miss/fizzle never fabricate a target impact.
      if (['charge', 'start', 'fizzle'].includes(phase)) {
        const charge = phase === 'fizzle' ? (1 - p) : ease(p)
        stamp('light', ...source, size * (1.1 + charge * 1.5), 0, globalAlpha * .48, main)
        for (let i = 0; i < Math.min(20, count + 4); i++) {
          const q = (p * 1.4 + i / (count + 4)) % 1, angle = i * 2.399 + recipe.rotation
          const r = size * (2.5 - q * 2.1) * scale
          stamp(recipe.material, source[0] + Math.cos(angle) * r, source[1] + Math.sin(angle) * r * .75, size * (.15 + q * .3), angle + p, globalAlpha * q * .8)
        }
        return { draws }
      }
      if (phase === 'secondary') {
        showResult()
        if (!result && hit) motes(target, recipe.material, 9, size * .75, tail * .8, 'rise')
        return { draws }
      }
      const technique = phase === 'heal' ? recipe.key === 'soft_boiled' ? 'egg-heal' : 'heal' : phase === 'drain' ? 'drain' : phase === 'copy' ? 'warp' : recipe.technique

      switch (technique) {
        case 'anatomy': {
          const subject = recipe.subject
          // Legacy double_kick stores combined damage. Choreograph two contacts
          // within its one visual session; never introduce a second HP callback.
          const combinedDouble = recipe.key === 'double_kick' && (effect.feedback?.hitCount || effect.profile?.hitCount || 1) === 1
          const visualIndex = hitIndex + (combinedDouble && hit && age >= .26 ? 1 : 0)
          const [ox, oy, tilt] = getContactPlacement(motion, visualIndex)
          const swaying = recipe.key === 'tail_whip'
          const destination = swaying ? source : [target[0] + ox * size, target[1] + oy * size]
          const approaching = hit ? 1 : ease(clamp((flight - .35) / .65))
          const center = [destination[0] - Math.cos(direction) * size * (1 - approaching) * .9,
            destination[1] - (motion === 'overhead' ? size * 1.5 * (1 - approaching) : Math.sin(direction) * size * (1 - approaching))]
          const hold = hit ? 1 - clamp((age - .43) / .57) : globalAlpha * flight
          const footprint = ['sole','hoof'].includes(subject)
          const tinted = ['iron_tail','iron_head','bullet_punch','meteor_mash','shadow_punch'].includes(recipe.key)
          const color = tinted || subject === 'leaf' ? main : 'natural'
          const r = size * (footprint ? 1.35 : 1.2) * (.88 + recipe.powerLevel * .1)
          let angle = tilt + (subject === 'fist' ? direction + Math.PI / 2 : 0)
          if (motion === 'sweep' || motion === 'diagonal') angle += -.8 + approaching * 1.1
          if (motion === 'helix') angle += p * 13
          const element = { fire_punch: 'flame', blaze_kick: 'flame', ice_punch: 'ice', aqua_tail: 'droplet', drain_punch: 'light', rage_fist: 'smoke', zen_headbutt: 'light' }[recipe.key]
          if (element) {
            // The material wraps the limb; the limb stays readable in front.
            for (let i = 0; i < 8; i++) {
              const a = i * TAU / 8, rad = r * .35
              stamp(element === 'flame' ? 'firetongue' : element, center[0] + Math.cos(a) * rad, center[1] + Math.sin(a) * rad - age * size * .18,
                size * (.5 + noise(i) * .3), element === 'flame' ? -.2 + Math.sin(p * 16 + i) * .25 : a,
                hold * .95, element === 'flame' ? 'natural' : i % 3 ? main : light, element === 'flame' ? 1.5 : 1)
            }
          }
          if (subject === 'head' || subject === 'knee') {
            // A rounded forehead/knee compression silhouette, never a projectile.
            const radius = r * .46
            ellipse(...center, radius, radius * .7, hold, size * .14, dark, angle)
            ellipse(center[0], center[1] - size * .08, radius * .82, radius * .63, hold, size * .13, main, angle)
            if (recipe.key === 'nuzzle' || recipe.key === 'iron_head') stamp('metal', ...center, r * .9, angle, hold * .75, main)
          } else if (subject === 'tail') {
            const c = swaying ? [source[0] + Math.cos(p * 8) * size * .65, source[1] + size * .35] : center
            stamp('tail', ...c, r * 1.6, -1.3 + (swaying ? Math.sin(p * 8) : approaching * 1.5 + age * .4), hold,
              recipe.key === 'iron_tail' ? main : recipe.key === 'dragon_tail' ? main : 'natural')
          } else if (subject === 'wing') {
            const sides = recipe.key === 'dual_wingbeat' ? [hitIndex % 2 ? 1 : -1] : [-1, 1]
            for (const side of sides) stamp('wing', center[0] + side * size * .4, center[1], r * 1.6,
              side * (.15 + (1 - approaching) * .8), hold, 'natural', 1, side)
            if (hit) motes(destination, 'feather', 7, size, tail * .7)
          } else if (subject === 'palm' && ['fake_out','cross_chop'].includes(recipe.key)) {
            for (const side of [-1, 1]) stamp('palm', center[0] + side * size * (recipe.key === 'fake_out' ? .2 + (1 - approaching) : .25),
              center[1], r, side * (recipe.key === 'fake_out' ? 1.2 : .7), hold, 'natural', 1, side)
          } else {
            if (['horn','beak'].includes(subject)) angle += subject === 'beak' ? direction : direction + Math.PI / 2
            if (combinedDouble && visualIndex === 1) {
              const [px,py,pa]=getContactPlacement(motion,0)
              stamp('sole',target[0]+px*size,target[1]+py*size,r,pa,tail*.4,'natural')
            }
            stamp(subject, ...center, r, angle, hold, color, 1, footprint && visualIndex % 2 ? -1 : 1)
          }
          if (['thunder_punch','nuzzle'].includes(recipe.key)) {
            for (let i = 0; i < 4; i++) {
              const a = i * TAU / 4 + p * 2, rad = size * .5
              const c = [center[0] + Math.cos(a) * rad, center[1] + Math.sin(a) * rad]
              line([[c[0]-size*.15,c[1]-size*.2],[c[0]+size*.08,c[1]-size*.04],[c[0]-size*.04,c[1]+size*.09],[c[0]+size*.2,c[1]+size*.2]], 2 * unit, hold, main)
            }
          }
          if (hit && recipe.power > 0) {
            // Keep the contact mark dominant; debris stays outside its silhouette.
            for (let i = 0; i < Math.min(7, 3 + recipe.powerLevel); i++) {
              const a = i * 2.399, rad = size * (.7 + age * .9)
              stamp('dust', destination[0] + Math.cos(a) * rad, destination[1] + Math.sin(a) * rad * .7,
                size * .42, a, tail * .5, dark)
            }
            if (recipe.powerLevel >= 3 || subject === 'hoof') ellipse(destination[0], destination[1] + size * .4,
              size * (.65 + age * 1.4), size * (.22 + age * .4), tail * .5, 2 * unit, dark)
          }
          break
        }
        case 'vine':
        case 'tongue': {
          const tongue = technique === 'tongue'
          const reach = hit ? 1 - ease(clamp((age - .22) / .78)) : ease(flight)
          const strands = tongue ? 1 : recipe.key === 'power_whip' ? 2 : 1
          for (let strand = 0; strand < strands; strand++) {
            const points = Array.from({ length: 33 }, (_, i) => {
              const q = i / 32
              const wave = Math.sin(q * Math.PI * 2 - p * 10 + strand * 2) * size * (tongue ? .16 : .5) * Math.sin(q * Math.PI)
              return [lerp(source[0], target[0], q * reach), lerp(source[1], target[1], q * reach) + wave + Math.sin(q * Math.PI) * size * (strand ? -.9 : .45)]
            })
            const thick = size * (tongue ? .2 : recipe.key === 'power_whip' ? .18 : .105)
            const outline = []
            for (const side of [-1,1]) for (let j=0;j<=32;j++) {
              const i = side < 0 ? j : 32-j, q=i/32, current=points[i], next=points[Math.min(32,i+1)], prev=points[Math.max(0,i-1)]
              const a = Math.atan2(next[1]-prev[1],next[0]-prev[0]), w=thick*(tongue ? .6+Math.sin(q*Math.PI)*.4 : 1-q*.88)
              outline.push([current[0]-Math.sin(a)*w*side,current[1]+Math.cos(a)*w*side])
            }
            fillShape(outline, tongue ? '#a95472' : '#244e2b', globalAlpha)
            line(points, thick * (tongue ? .9 : .7), globalAlpha, tongue ? '#e8a1b1' : '#70aa45')
            if (tongue) stamp('droplet', ...points.at(-1), size * .22, 0, globalAlpha * .8, light)
            else for (let i=4;i<31;i+=5) {
              const a=Math.atan2(points[i+1][1]-points[i-1][1],points[i+1][0]-points[i-1][0]),c=points[i]
              const w=thick*(1-i/32*.88)
              line([[c[0]-Math.sin(a)*w,c[1]+Math.cos(a)*w],[c[0]+Math.sin(a)*w,c[1]-Math.cos(a)*w]],2*unit,globalAlpha,'#395d29')
              stamp('leaf',c[0]+Math.cos(a+1.1)*size*.1,c[1]+Math.sin(a+1.1)*size*.1,size*(.34-i/32*.14),a+(i%2?1.4:-1.1),globalAlpha,main)
            }
          }
          if(hit) {
            if (!tongue) clawStroke(target, recipe.rotation + 1, size * .9, size * .07, tail * .7)
            motes(target,tongue?'droplet':'leaf',tongue?3:6,size*.6,tail*.7)
          }
          break
        }
        case 'frenzy': {
          const multi = (effect.feedback?.hitCount || effect.profile?.hitCount || 1) > 1
          const beats = multi ? 1 : recipe.key === 'close_combat' ? 4 : 3
          for (let i=0;i<beats;i++) {
            if (!hit && i > 0) continue
            const [ox,oy,a] = getContactPlacement('flank',hitIndex+i)
            const q=hit?clamp(age*1.65-i*.16):0
            if(hit && age*1.65<i*.16)continue
            const hold=hit?1-clamp((q-.28)/.72):globalAlpha*flight*.85
            const lunge=hit?0:(1-ease(flight))*size
            const c=[target[0]+ox*size-Math.cos(a)*lunge,target[1]+oy*size-Math.sin(a)*lunge]
            if(recipe.key==='fury_attack') stamp('horn',...c,size*1.3,a+Math.PI/2,hold,'natural')
            else if(['fury_swipes','outrage'].includes(recipe.key)) {
              for(let claw=0;claw<3;claw++)clawStroke([c[0],c[1]+(claw-1)*size*.15],a,size*(.8+q*.4),size*.065,hold)
              if(recipe.key==='outrage') {
                stamp('scale',c[0]-Math.cos(a)*size*.5,c[1]-Math.sin(a)*size*.5,size*.6,a,hold,main)
                stamp('flame',...c,size*1.5,a,hold*.7,dark)
              }
            } else stamp(i%2?'sole':'fist',...c,size*(1+recipe.powerLevel*.08),a,hold,'natural')
            if(hit)stamp('dust',c[0]+Math.cos(a)*q*size,c[1]+Math.sin(a)*q*size,size*(.8+q),a,hold*.4,dark)
          }
          break
        }
        case 'armor': {
          const shell=recipe.key==='withdraw', liquid=recipe.key==='acid_armor'
          const material=liquid?'droplet':shell?'shell':recipe.key==='iron_defense'?'metal':'scale'
          const radius=size*(1.05-ease(flight)*.3)
          for(let i=0;i<(shell?3:8);i++) {
            const a=i*TAU/(shell?3:8), r=radius*(hit?1-age*.1:1)
            stamp(material,source[0]+Math.cos(a)*r*.7,source[1]+Math.sin(a)*r,
              size*(shell?1.2:.8),a+Math.PI/2,globalAlpha*tail,liquid?main:'natural')
          }
          if(recipe.key==='coil')for(let i=0;i<3;i++)ellipse(source[0],source[1]+(i-1)*size*.3,radius,size*.22,globalAlpha*tail,size*.1,dark)
          break
        }
        case 'jet':
        case 'beam': {
          const sustain = p < hitT ? 1 : (1 - age) ** 1.1
          const fluidJet = technique === 'jet' && ['droplet', 'splash'].includes(recipe.material)
          const beamWidth = size * (.12 + recipe.energy * .13) * scale
          if (technique === 'beam') {
            // Only real beam moves connect the combatants: translucent tapered
            // energy, without opaque white rods or rounded end caps.
            draws++
            ctx.save(); ctx.globalAlpha = sustain * globalAlpha * .65
            const tip = pathPoint(flight), gradient = ctx.createLinearGradient(...source, ...tip)
            gradient.addColorStop(0, dark); gradient.addColorStop(.38, main); gradient.addColorStop(1, light)
            ctx.fillStyle = gradient; ctx.beginPath()
            for (let side = -1; side <= 1; side += 2) for (let i = 0; i <= 20; i++) {
              const q = (side < 0 ? i : 20 - i) / 20 * flight
              const w = beamWidth * Math.sin(Math.PI * clamp(q / Math.max(.001,flight))) ** .5 * side
              const point = pathPoint(q, w + Math.sin(q * 19 - p * 14) * size * .018)
              if (side < 0 && i === 0) ctx.moveTo(...point); else ctx.lineTo(...point)
            }
            ctx.closePath(); ctx.fill(); ctx.restore()
          }
          // Hyper Beam is the only beam with the maximum authored particle
          // count. Keep its broad core and impact burst, while capping the
          // moving edge motes so CPU-limited WebKit devices stay at 60 FPS.
          const beamParticleCount = Math.min(26, count * 2, recipe.key === 'hyper_beam' ? 14 : Infinity)
          for (let i = 0; i < beamParticleCount; i++) {
            const q = (p * 2 + i / beamParticleCount) % 1
            if (q > flight) continue
            const side = (noise(i + 71) - .5) * size * scale * q
            const [x, y] = pathPoint(q, side)
            const life = Math.sin(Math.PI * clamp(q)) ** .5
            stamp(fluidJet ? 'droplet' : recipe.material, x, y, size * (technique === 'beam' ? .3 : fluidJet ? .24 + q * .4 : .55 + q * .8), direction + Math.PI / 2 + (noise(i) - .5) * .9, sustain * life * (.6 + q * .4), i % 3 === 0 ? light : main, technique === 'jet' ? 1.45 : 1)
          }
          stamp('light', ...source, size * .85, 0, sustain * .8, light)
          impact(fluidJet ? 'droplet' : recipe.material, .85)
          break
        }
        case 'volley':
        case 'orb': {
          const n = technique === 'orb' || (effect.feedback?.hitCount || effect.profile?.hitCount || 1) > 1 ? 1 : Math.min(12, count)
          for (let i = 0; i < n; i++) {
            const f = clamp(flight * 1.22 - i / Math.max(1, n - 1) * .22)
            const offset = (i - (n - 1) / 2) * size * (motion === 'fan' ? .3 : .16) * scale
            const [x, y] = pathPoint(f, offset)
            if (p < hitT + .07) {
              for (let j = 5; j > 0; j--) {
                const [tx, ty] = pathPoint(Math.max(0, f - j * .04), offset)
                stamp(technique === 'orb' ? 'smoke' : recipe.material, tx, ty, size * (technique === 'orb' ? 1 - j * .1 : .22) * scale, direction, .12 * (6 - j) * globalAlpha)
              }
              if (technique === 'orb') {
                stamp('light', x, y, size * 2.1 * scale, 0, .45, main)
                stamp(recipe.material, x, y, size * scale, p * 7 * recipe.rotation, .95, main)
                for (let j = 0; j < 5; j++) {
                  const a = p * 10 + j * TAU / 5
                  stamp(recipe.material, x + Math.cos(a) * size * .34 * scale, y + Math.sin(a) * size * .25 * scale, size * .38 * scale, a, .8, j % 2 ? light : dark)
                }
              } else stamp(recipe.material, x, y, size * (n === 1 ? .95 : .65) * Math.max(.7,scale),
                ['needle','ice'].includes(recipe.material) ? direction + Math.PI/2 : direction + p * recipe.rotation * 4,
                .95, ['coin','bone'].includes(recipe.material) ? 'natural' : i % 3 ? main : light, recipe.material === 'ice' ? 1.5 : 1)
            }
          }
          impact()
          break
        }
        case 'lightning': {
          const fromSky = recipe.key === 'thunder'
          const a = fromSky ? [target[0] - size * .4, -size] : source
          const endpoint = [lerp(a[0], target[0], flight), lerp(a[1], target[1], flight)]
          const flicker = .65 + Math.sin(p * 72) ** 2 * .35
          for (let branch = 0; branch < Math.min(7, count); branch++) {
            const points = Array.from({ length: 15 }, (_, i) => {
              const q = i / 14, n = (noise(i * 9 + branch * 81 + Math.floor(p * 16)) - .5)
              return [lerp(a[0], endpoint[0], q) + n * size * scale * Math.sin(q * Math.PI), lerp(a[1], endpoint[1], q) + (branch - count / 3) * size * .13 * Math.sin(q * Math.PI)]
            })
            ribbon(points, unit * (2 + recipe.energy * 1.5), globalAlpha * tail * flicker / (1 + branch * .25))
          }
          impact('spark')
          break
        }
        case 'slash': {
          if (!hit) {
            const front = pathPoint(flight * .58)
            for (let i = 0; i < Math.min(3, recipe.count); i++) {
              const offset = (i - 1) * size * .2
              clawStroke([front[0] - Math.sin(direction) * offset, front[1] + Math.cos(direction) * offset],
                recipe.rotation - .7 + flight * 1.1, size * (.45 + flight * .3), size * .08, globalAlpha * flight * .65)
            }
            break
          }
          const strokes = Math.min(5, recipe.count)
          const theta = recipe.rotation + (Number(effect.feedback?.hitIndex) || 0) * .45
          for (let i = 0; i < strokes; i++) {
            const strokeAge = clamp((age - i * .035) / .78)
            const visible = age >= i * .035 ? (1 - clamp((strokeAge - .3) / .7)) : 0
            if (['kick', 'chop', 'tail'].includes(recipe.gesture) || ['air_slash', 'air_cutter', 'psycho_cut'].includes(recipe.key)) {
              sweep(target, theta - 1 + ease(strokeAge * 2) * 1.8, size * scale * 1.2, size * .24, visible)
            } else {
              const cross = ['x_scissor', 'cross_chop', 'cross_poison'].includes(recipe.key)
              const angle = cross ? (i % 2 ? -theta : theta) : theta
              const offset = (i - (strokes - 1) / 2) * size * .24
              const center = [target[0] - Math.sin(angle) * offset, target[1] + Math.cos(angle) * offset]
              const length = size * (1.15 + scale * .45) * (.4 + ease(strokeAge * 5) * .6)
              clawStroke(center, angle, length, size * (.12 + recipe.powerLevel * .03), visible)
              stamp(recipe.material, center[0] + Math.cos(angle) * length * .35, center[1] + Math.sin(angle) * length * .35,
                size * .6, angle, visible * .85, light)
            }
          }
          motes(target, recipe.material, 8, size * scale, tail * .75)
          break
        }
        case 'whip': {
          if (recipe.gesture === 'tail') {
            const center = hit ? target : pathPoint(flight * .35)
            sweep(center, recipe.rotation - 1.4 + (hit ? ease(age) * 2.1 : flight), size * scale * 1.3, size * .22,
              hit ? tail : globalAlpha * .55)
          } else {
            const reach = hit ? 1 - ease(age) * .8 : flight
            const points = Array.from({ length: 25 }, (_, i) => {
              const q = i / 24 * reach
              return pathPoint(q, Math.sin(q * Math.PI * 2 - p * 7) * size * .5 * q, .2)
            })
            line(points, size * .095, globalAlpha * tail, dark)
            line(points, size * .045, globalAlpha * tail, main)
            stamp(recipe.material, ...points.at(-1), size * .45, p * 5, globalAlpha * tail)
          }
          if (hit) motes(target, recipe.material, Math.min(9, count + 3), size * scale, tail * .7)
          break
        }
        case 'slam': {
          if (!hit) {
            const point = pathPoint(flight * .58, 0, -1.5)
            stamp('dust', source[0], source[1] + size * .6, size * (1 + flight), 0, globalAlpha * .6, main, .35)
            for (let i = 0; i < 4; i++) {
              const x = point[0] + (i - 1.5) * size * .3
              stamp('dust', x, point[1] + size * (.3 + i * .12), size * .32, 0, globalAlpha * flight * .7, main, 1.5)
            }
          } else {
            const ground = [target[0], target[1] + size * .45]
            for (let i = 0; i < 3; i++) {
              const t = clamp(age * 1.5 - i * .13)
              ellipse(...ground, size * scale * (.55 + t * 1.65), size * (.18 + t * .42), (1 - t) * .85,
                (6 - i) * unit, i % 2 ? light : dark)
            }
            stamp('dust', ground[0], ground[1], size * scale * (1.5 + age * 2.2), 0, tail * .8, main, .42)
            contactBurst(1.15)
          }
          break
        }
        case 'dragon-dive': {
          if (p < hitT + .045) {
            const f = flight
            for (let i = 0; i < 10; i++) {
              const t = Math.max(0, f - i * .024)
              const center = pathPoint(t, 0, -1.25)
              center[0] += Math.sin(i * 2 + p * 12) * size * .16
              stamp('flame', ...center, size * scale * (1.1 - i * .065), direction + Math.PI / 2 + Math.sin(i + p * 9) * .3,
                (1 - i / 11) * globalAlpha * .85, i % 3 ? main : dark, 1.4)
            }
            const head = pathPoint(f, 0, -1.25)
            stamp('horn', head[0] + size * .12, head[1] - size * .24, size * .85, direction + Math.PI/2, globalAlpha, main)
            for (let i=0;i<4;i++) {
              const c=pathPoint(Math.max(0,f-i*.025))
              stamp('scale',...c,size*(.9-i*.12),direction,globalAlpha*(1-i*.18),main)
            }
          }
          if (hit) {
            for (let i = 0; i < 7; i++) {
              const angle = direction + (i - 3) * .4
              const r = size * scale * (.3 + age * 1.35)
              stamp('flame', target[0] + Math.cos(angle) * r, target[1] + Math.sin(angle) * r,
                size * (1.35 - age * .65), angle + Math.PI / 2, tail * .95, i % 2 ? main : dark, 1.6)
            }
            contactBurst(1.25)
          }
          break
        }
        case 'rampage': {
          const center = pathPoint(ease(flight))
          const radius = size * scale
          if (!hit) {
            for (let i = 0; i < 7; i++) {
              const a = i * TAU / 7 + p * 12
              stamp(recipe.material, center[0] + Math.cos(a) * radius * .4, center[1] + Math.sin(a) * radius * .3,
                size, a, globalAlpha * .8, i % 2 ? main : dark, 1.4)
            }
          } else {
            for (let i = 0; i < 3; i++) {
              const q = clamp(age * 2.1 - i * .18)
              if (q <= 0) continue
              const angle = recipe.rotation + i * 1.15
              sweep([target[0], target[1] + (i - 1) * size * .22], angle + q * 2, radius, size * .25 * (1 - q * .6), (1 - q) * .9, recipe.material)
            }
            motes(target, recipe.material, 13, radius * 1.05, tail * .9, 'orbit', main)
            contactBurst(.85)
          }
          break
        }
        case 'strike':
        case 'dash':
        case 'drill':
        case 'dive': {
          const dive = technique === 'dive'
          const start = dive ? [target[0] - size * scale * 2, -size] : source
          const travel = dive ? flight : flight * .58
          const tip = [lerp(start[0], target[0], travel), lerp(start[1], target[1], travel)]
          if (!hit) {
            // Contact moves stay attached to the attacking body. Short material
            // wisps replace the former shared rod drawn between both monsters.
            for (let i = 0; i < Math.min(9, count + 2); i++) {
              const behind = size * (.15 + i * .065), side = (noise(i + 24) - .5) * size * .8
              stamp(recipe.material, tip[0] - Math.cos(direction) * behind - Math.sin(direction) * side,
                tip[1] - Math.sin(direction) * behind + Math.cos(direction) * side,
                size * (.45 + noise(i) * .4) * Math.max(.85, scale), direction + recipe.rotation + p * 3,
                globalAlpha * (.55 + flight * .45) * (1 - i / 12), i % 3 ? main : light)
            }
            if (technique === 'drill') {
              for (let i = 0; i < 3; i++) ellipse(tip[0] + i * size * .12, tip[1], size * (.28 - i * .05), size * .14,
                globalAlpha * flight, 2 * unit, i % 2 ? main : light, direction + p * 9)
            } else if (recipe.gesture === 'punch' || recipe.gesture === 'palm') {
              stamp(recipe.material, tip[0] + Math.cos(direction) * size * .3, tip[1] + Math.sin(direction) * size * .3,
                size * .8, direction, globalAlpha * flight * .85)
            }
          }
          if (hit) {
            const a = recipe.rotation + (Number(effect.feedback?.hitIndex) || 0) * .6
            for (let i = 0; i < Math.min(12, count); i++) {
              const angle = a + i * TAU / count
              const r = size * scale * (.15 + age * 1.9)
              stamp('spark', target[0] + Math.cos(angle) * r, target[1] + Math.sin(angle) * r * .6, size * (.55 + recipe.energy * .35) * (1 - age), angle, tail, light)
            }
            if (recipe.gesture === 'kick') sweep(target, recipe.rotation + age * 2, size * scale, size * .3, tail)
            if (['punch', 'palm', 'head', 'body'].includes(recipe.gesture)) {
              const compression = size * scale * (.45 + ease(age) * .55)
              ellipse(...target, compression, compression * .68, tail * .8, size * .08 * tail, main, direction)
            }
            contactBurst(technique === 'strike' ? 1.15 : 1)
          }
          break
        }
        case 'roll': {
          const center = hit ? target : pathPoint(flight * .58)
          for (let i = 0; i < Math.min(12, count + 3); i++) {
            const angle = i * TAU / Math.min(12, count + 3) + p * (9 + recipe.rotation)
            const r = size * scale * .7
            stamp(recipe.material, center[0] + Math.cos(angle) * r, center[1] + Math.sin(angle) * r,
              size * .65, angle + Math.PI / 2, globalAlpha * tail * .85, i % 3 ? main : light)
          }
          if (hit) contactBurst(1.1)
          break
        }
        case 'gaze': {
          for (const side of [-1,1]) {
            stamp('light', source[0]+side*size*.2, source[1] - size * .28, size * .42,
              recipe.key==='baby_doll_eyes'?0:-side*.2, globalAlpha * tail, main, recipe.key==='baby_doll_eyes'?1:.45)
          }
          if (hit) {
            for (let i = 0; i < 6; i++) {
              const a = i * TAU / 6 + age * .6, r = size * (.9 - age * .4)
              stamp(recipe.material, target[0] + Math.cos(a) * r, target[1] + Math.sin(a) * r * .7,
                size * .5, a, tail * .8, i % 2 ? main : dark)
            }
          }
          break
        }
        case 'bone-swing':
        case 'hammer': {
          const [ox,oy,tilt]=getContactPlacement(motion,hitIndex)
          const center = hit ? [target[0]+ox*size,target[1]+oy*size] : pathPoint(flight)
          const swing = hit ? age * .7 : -1.5 + flight * 1.5
          stamp(recipe.material, center[0], center[1] - size * (hit ? .1 : .55), size * Math.max(1,scale) * 1.8,
            tilt + swing, hit ? 1-clamp((age-.4)/.6) : globalAlpha, recipe.material==='bone'?'natural':main)
          if (hit) {
            motes(target, 'dust', 7, size * scale, tail * .7)
            if (recipe.key === 'crabhammer') motes(target, 'splash', 9, size * 1.5, tail)
            ellipse(target[0], target[1] + size * .5, size * (1 + age * 1.8), size * (.2 + age * .3), tail * .8, 3 * unit, dark)
          }
          break
        }
        case 'boomerang': {
          const multiple=(effect.feedback?.hitCount || effect.profile?.hitCount || 1)>1
          const returning=multiple && hitIndex>0
          const q = hit ? (multiple && !returning ? 1 : 1 - ease(age)) : returning ? 1 + Math.sin(flight*Math.PI)*.25 : flight
          const point = pathPoint(q, Math.sin(q * Math.PI) * size * (hit ? 1 : -1), hit ? .7 : -.7)
          stamp(recipe.material, ...point, size * 1.65, p * 16, globalAlpha, 'natural')
          if (hit && age < .35) motes(target, 'dust', 5, size * .7, tail * .7)
          break
        }
        case 'clamp': {
          const gap = hit ? size * (.35 + age * .3) : size * (1.3 - flight * .6)
          for (const side of [-1,1]) {
            stamp('pincer', target[0] + side * gap, target[1], size * 1.35, side < 0 ? Math.PI / 2 : -Math.PI / 2, globalAlpha * tail, light)
          }
          if (hit) contactBurst(.65)
          break
        }
        case 'burrow': {
          const center = hit ? target : source
          const r = size * (hit ? .6 + age : .7 + flight * .3)
          ellipse(center[0], center[1] + size * .6, r, r * .22, globalAlpha * tail, size * .12, dark)
          for (let i=0;i<9;i++) {
            const a = i * 2.399, jump = hit ? Math.sin(age*Math.PI) : Math.sin(flight*Math.PI)
            stamp(recipe.material, center[0] + Math.cos(a)*r, center[1]+size*.55-jump*size*(.4+noise(i)),
              size*(.32+noise(i)*.3),a+p*2,globalAlpha*tail)
          }
          break
        }
        case 'toss': {
          if (!hit) { sweep(pathPoint(flight*.58), -1+flight*2, size, size*.18,globalAlpha*.7,'dust');break }
          const ground=[target[0],target[1]+size*.6]
          stamp('dust',...ground,size*scale*(1.2+age*1.8),0,tail*.85,main,.4)
          motes(ground,'dust',10,size*scale,tail*.8)
          break
        }
        case 'tears': {
          const pleading = recipe.key === 'tearful_look'
          for(let i=0;i<(pleading?4:8);i++) {
            const q=(p*(pleading?.55:1.25)+i/(pleading?4:8))%1,side=i%2?1:-1
            const fall = pleading ? clamp((q-.35)/.65) : q
            stamp('droplet',source[0]+side*size*(.2+(pleading?0:Math.sin(q*Math.PI)*.45)),source[1]-size*.35+fall*size*1.1,
              size*(pleading?.34:.28),pleading?0:-side*.3,Math.sin(q*Math.PI)*globalAlpha*.95,'#b8e5fa')
          }
          break
        }
        case 'hop': {
          stamp('dust',source[0],source[1]+size*.6,size*(1+p),0,globalAlpha*.7,main,.25)
          break
        }
        case 'egg-heal': {
          const center = [source[0], source[1] - size * .7]
          if (!hit) stamp('egg', ...center, size * 1.1, 0, globalAlpha, light)
          else {
            for (const side of [-1, 1]) stamp('shell', center[0] + side * age * size, center[1] + age * size * .6,
              size * .65, side * age * 2, tail, light)
            for (let i = 0; i < 10; i++) {
              const q = clamp(age * 1.5 - i * .04)
              stamp('light', source[0] + Math.sin(i * 2.4) * size * (1 - q), source[1] - (1 - q) * size,
                size * .4, 0, Math.sin(q * Math.PI) * .9, main)
            }
          }
          break
        }
        case 'sword-dance': {
          for (let i = 0; i < 3; i++) {
            const a = p * 5 + i * TAU / 3
            stamp('blade', source[0] + Math.cos(a) * size, source[1] + Math.sin(a) * size * .35,
              size * 1.6, Math.sin(a) * .35, globalAlpha, light)
          }
          break
        }
        case 'rock-prison': {
          if (!hit) { stamp('dust', ...target, size * 1.4, 0, globalAlpha * flight * .6, main); break }
          for (let i = 0; i < 5; i++) {
            const a = i * TAU / 5, fall = clamp(age * 5 - i * .13)
            stamp('rock', target[0] + Math.cos(a) * size * .8, target[1] + Math.sin(a) * size * .3 - (1 - fall) * size * 2,
              size * .95, i, tail, i % 2 ? main : dark)
          }
          stamp('dust', target[0], target[1] + size * .6, size * (2 + age), 0, tail * .8, main, .4)
          break
        }
        case 'fang': {
          const gap = size * scale * (hit ? age * .2 : 1 - ease(flight))
          for (let row = -1; row <= 1; row += 2) for (let i = 0; i < 3; i++) {
            stamp('tooth', target[0] + (i - 1) * size * .35 * scale, target[1] + row * (size * .2 + gap), size * .5 * scale, row === 1 ? Math.PI : 0, globalAlpha * tail, light)
          }
          if (hit) motes(target, recipe.material, count + 3, size * scale, tail * .8)
          break
        }
        case 'wave': {
          const front = pathPoint(ease(flight))
          const span = Math.min(height * .6, size * scale * 2.7)
          const points = Array.from({length:33},(_,i)=>{
            const q=i/32, cross=(q-.5)*span, curl=Math.sin(q*Math.PI)*size*.45+Math.sin(q*12+p*8)*size*.07
            return [front[0]-Math.sin(direction)*cross-Math.cos(direction)*curl,front[1]+Math.cos(direction)*cross-Math.sin(direction)*curl]
          })
          if (['splash','droplet','foam'].includes(recipe.material)) {
            ctx.save();ctx.globalAlpha=globalAlpha*tail*.8
            const backX=front[0]-Math.cos(direction)*size*1.4,backY=front[1]-Math.sin(direction)*size*1.4
            const gradient=ctx.createLinearGradient(backX,backY,front[0],front[1])
            gradient.addColorStop(0,'transparent');gradient.addColorStop(.4,dark);gradient.addColorStop(.88,main);gradient.addColorStop(1,light)
            ctx.fillStyle=gradient;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y))
            for(let i=points.length-1;i>=0;i--) {
              const q=i/(points.length-1),depth=size*1.4*Math.sin(q*Math.PI)**.6
              ctx.lineTo(points[i][0]-Math.cos(direction)*depth,points[i][1]-Math.sin(direction)*depth)
            }
            ctx.closePath();ctx.fill();ctx.restore();draws++
            line(points,size*.05,globalAlpha*tail*.65,light)
            for(let i=3;i<30;i+=4)stamp('foam',...points[i],size*.6,direction+Math.PI/2,globalAlpha*tail*.9,light,.6)
          } else if(recipe.material==='mist') {
            for(let k=0;k<3;k++)line(points.map(([x,y])=>[x-Math.cos(direction)*size*k*.24,y-Math.sin(direction)*size*k*.24]),size*.025,globalAlpha*tail*(.65-k*.15),light)
          }
          for (let i = 0; i < Math.min(32, count + 5); i++) {
            const q = i / Math.max(1, count + 4), cross = (q - .5) * span
            const curl = Math.sin(q * Math.PI + p * 7) * size * .3
            const x = front[0] - Math.sin(direction) * cross - Math.cos(direction) * curl
            const y = front[1] + Math.cos(direction) * cross - size * .18
            const watery=['splash','droplet','foam'].includes(recipe.material)
            stamp(watery?'droplet':recipe.material, x + Math.sin(i*3)*size*.25, y + Math.cos(i*2)*size*.3, size * (watery ? .16+noise(i)*.26 : .45+noise(i)*.6), direction + Math.PI / 2 + noise(i), globalAlpha * tail * .85, i % 4 === 0 ? light : main, 1.3)
            if (i % 3 === 0) stamp('mist', x - Math.cos(direction) * size * .7, y, size, direction, globalAlpha * tail * .4)
          }
          impact(['splash', 'droplet'].includes(recipe.material) ? 'droplet' : recipe.material, .7)
          break
        }
        case 'storm':
        case 'vortex': {
          if (!hit) { stamp('mist', ...source, size * 1.5, p, globalAlpha * .4); break }
          const vortex = technique === 'vortex'
          for (let i = 0; i < Math.min(38, count + 4); i++) {
            const n = noise(i + 41), q = (age * (1.1 + n) + i / (count + 4)) % 1
            const angle = i * 2.399 + age * (5 + recipe.bend * 4)
            const r = size * scale * (.25 + q * .95)
            const x = target[0] + (vortex ? Math.cos(angle) * r : (n - .5) * size * scale * 3 + q * size * recipe.bend)
            const y = target[1] + (vortex ? Math.sin(angle) * r * .32 - (1 - q) * size * 1.6 : (q - .65) * size * scale * 3)
            stamp(recipe.material, x, y, size * (.24 + n * .55), angle + recipe.rotation, tail * (.5 + n * .5), i % 4 ? main : light, recipe.key.includes('icicle') ? 2 : 1)
          }
          if (vortex) for (let i = 0; i < 3; i++) ellipse(target[0], target[1] - size * i * .45, size * scale * (1 - i * .2), size * .22, tail * .25, 2 * unit, light)
          break
        }
        case 'quake':
        case 'eruption': {
          if (!hit) break
          const fluid = ['inferno','lava_plume','waterfall'].includes(recipe.key)
          for (let i = 0; i < (fluid ? 0 : technique === 'quake' ? 5 : 3); i++) {
            const points = Array.from({ length: 10 }, (_, j) => {
              const q = j / 9, angle = i * TAU / 5 + recipe.rotation
              return [target[0] + Math.cos(angle) * q * size * scale * 2.1 + (noise(i * 41 + j) - .5) * size * .3, target[1] + size * .65 + Math.sin(angle) * q * size * scale * .65]
            })
            line(points, 4 * unit * tail, tail * .8, dark)
            line(points, 1.2 * unit, tail * .8, light)
          }
          for (let i = 0; i < Math.min(25, count); i++) {
            const n = noise(i + 88), x = target[0] + (n - .5) * size * scale * 2.5
            const jump = Math.sin(clamp((age - (i%3)*.035) * (1.2 + noise(i+144))) * Math.PI)
            const ground=target[1]+size*.65
            if (recipe.key==='stone_edge') {
              const growth=ease(age*5),column=size*(.8+noise(i+51)*1.4)*growth
              stamp('rock',x,ground-column*.48,size*(.45+n*.4),0,tail, i%2?main:dark,column/(size*(.45+n*.4)))
            } else if(fluid) {
              const q=(age*1.3+i/count)%1
              stamp(recipe.key==='waterfall'?'splash':'flame',target[0]+(n-.5)*size*scale*1.2,
                ground-q*size*(1.5+scale),size*(.65+noise(i+71)*.4),Math.sin(i+p*12)*.15,
                tail*Math.sin(q*Math.PI),i%3?main:light,1.8)
            } else {
              const y = ground - jump * size * (technique === 'eruption' ? .8 + noise(i+221)*scale : .25 + noise(i+221)*.7)
              stamp(recipe.material,x,y,size*(.3+noise(i+71)*.5),i+age*recipe.rotation,tail,i%4?main:light)
            }
          }
          stamp(fluid?recipe.material:'dust', target[0], target[1] + size * .6, size * scale * 2.6, 0, tail * .55, main, .45)
          break
        }
        case 'sound': {
          for (let i = 0; i < Math.min(10, count); i++) {
            const spacing = motion==='echo'?.14:motion==='ripple'?.04:.075
            const q = clamp(flight - i * spacing + age * .5)
            if (q <= 0) continue
            const [x, y] = pathPoint(q)
            const r = size * scale * (.25 + q * 1.35)
            const tremor = motion==='ripple' ? Math.sin(p*45+i)*size*.06 : 0
            ellipse(x, y, r * .5+tremor, r, globalAlpha * tail * .65 * (motion==='echo'?1-i*.07:1), unit * (2 + recipe.energy), i % 2 ? light : main, direction)
            if (i % 2 === 0) stamp(recipe.material, x, y, r * 1.4, p + i, tail * .3)
          }
          break
        }
        case 'bind': {
          for (let i = 0; i < 4; i++) {
            const reach = hit ? 1 : flight
            const points = Array.from({length:25},(_,j)=>pathPoint(j/24*reach, Math.sin(j/24*Math.PI*3+p*3+i)*size*.16+(i-1.5)*size*.08,.15))
            line(points, unit * 1.4, globalAlpha * tail * .9, light)
          }
          if (hit) for (let i = 0; i < 4; i++) ellipse(target[0],target[1]+(i-1.5)*size*.23,size*(.8-age*.25),size*.18,tail*.85,unit*1.5,light,(i-1.5)*.13)
          break
        }
        case 'spore':
        case 'shroud': {
          const center = pathPoint(ease(flight))
          for (let i = 0; i < Math.min(32, count); i++) {
            const n = noise(i + 51), a = i * 2.399 + p * recipe.bend * 3
            const radius = size * scale * (.3 + n * .8) * (.3 + flight * .7) * (motion==='expand'?1+age*.7:motion==='compress'?1-age*.55:1)
            const x = center[0] + Math.cos(a) * radius, y = center[1] + Math.sin(a) * radius * .75 + age * size * (['scatter','drop'].includes(motion)?.7:-.5)
            stamp(recipe.material, x, y, size * (technique === 'spore' ? .24 + n * .28 : .6 + n * .65), a + p, globalAlpha * tail * (technique === 'shroud' ? .45 : .85), i % 3 ? main : light)
          }
          break
        }
        case 'heal':
        case 'aura':
        case 'barrier':
        case 'warp':
        case 'shatter':
        case 'levitate': {
          if (!hit) { stamp('light', ...source, size, 0, globalAlpha * .3, main); break }
          const center = target
          const orbit = technique === 'aura' || technique === 'levitate'
          if (technique === 'heal') {
            const sky = ['moonlight', 'morning_sun', 'synthesis'].includes(recipe.key)
            if (sky) {
              stamp('light', center[0], center[1] - size * 2.1, size * 2.1, 0, tail * .75, light)
              for (let i = 0; i < 7; i++) {
                const q = (age * 1.3 + i / 7) % 1
                stamp('light', center[0] + (noise(i) - .5) * size, center[1] - (1 - q) * size * 2,
                  size * .36, 0, Math.sin(q * Math.PI) * tail, main, 2)
              }
            }
            for (let i = 0; i < Math.min(18, count); i++) {
              const q = clamp(age * 1.6 - i * .025), a = i * 2.399
              const r = size * scale * 1.5 * (1 - q)
              stamp(recipe.material, center[0] + Math.cos(a) * r, center[1] + (motion==='drop' ? -(1-q)*size*1.5 : Math.sin(a) * r * .7),
                size * .38, a, Math.sin(q * Math.PI) * .9, i % 3 ? main : light)
            }
          } else if (technique === 'barrier') {
            const r = size * scale * 1.35
            stamp('bubble', center[0], center[1] - size * .15, r * 2, 0, tail * .7, main, 1.2)
            for (let i = 0; i < Math.min(8, count); i++) stamp(recipe.material, center[0] + Math.cos(i * TAU / count + age * 2) * r * .7, center[1] + Math.sin(i * TAU / count + age * 2) * r * .8, size * .6, i, tail * .65, light)
          } else if (technique === 'warp') {
            for (let i = 0; i < count; i++) {
              const x = center[0] + Math.sin(p * 4 + i * 2) * size * scale * (1 - age) * 1.2
              stamp(recipe.material, x, center[1], size * 1.4, 0, tail * .45, i % 2 ? main : light, 1.8)
            }
          } else {
            for (let i = 0; i < Math.min(25, count); i++) {
              const n = noise(i + 21), a = i * 2.399 + age * (2 + recipe.bend * 4)
              const r = size * scale * (technique === 'shatter' ? .4 + age * 1.5 : motion==='compress' || motion==='implode' ? 1.3-age : .55 + n * .6)
              const x = center[0] + Math.cos(a) * r
              const y = center[1] + (orbit ? Math.sin(a) * r * .35 : (n - .5) * size * 1.5) - age * size * (technique === 'shatter' ? -.8 : 1.1)
              stamp(recipe.material, x, y, size * (.2 + n * .4), a + recipe.rotation, tail * .85, i % 4 ? main : light)
            }
            stamp('light', ...center, size * scale * 2.8, 0, tail * .25, main)
            if (orbit) for (let i = 0; i < 2; i++) ellipse(center[0], center[1] - size * i * .4, size * scale, size * .32, tail * .4, 2 * unit, light, Math.sin(age * 4 + i) * .35)
          }
          break
        }
        case 'drain': {
          if (!hit) break
          stamp('light', ...target, size * scale * 2, 0, tail * .3, dark)
          for (let i = 0; i < Math.min(24, count); i++) {
            const q = clamp(age * 1.6 - i / count * .45), a = q * Math.PI
            if (q <= 0 || q >= 1) continue
            const x = lerp(target[0], source[0], q), y = lerp(target[1], source[1], q) - Math.sin(a) * size * (recipe.bend + .3) + Math.sin(i * 2 + age * 10) * size * .15
            stamp(recipe.material, x, y, size * (.16 + Math.sin(a) * .22), -direction + q * 4, globalAlpha * .85, i % 3 ? main : light)
          }
          stamp('light', ...source, size * scale * (1 + age), 0, age * tail * 1.5, light)
          break
        }
        case 'explosion':
        case 'burst': {
          if (!hit) { stamp('light', ...source, size * (1 + flight), 0, globalAlpha * .6, light); break }
          const center = technique === 'explosion' ? source : target
          const radius = size * scale * (technique === 'explosion' ? 1.4 : 1)
          stamp('light', ...center, radius * (2 + ease(age) * 2), 0, tail * .8, light)
          for (let i = 0; i < Math.min(32, count * 2); i++) {
            const angle = i * TAU / Math.min(32, count * 2) + recipe.rotation, r = radius * ease(age) * (1 + noise(i) * .5)
            stamp(recipe.material, center[0] + Math.cos(angle) * r, center[1] + Math.sin(angle) * r * .7 - age * size * .4, size * (.55 + noise(i + 5) * .7) * scale, angle + Math.PI / 2, tail * .85, i % 3 ? main : light)
          }
          ellipse(center[0], center[1] + size * .3, radius * (1 + age * 3), radius * (.3 + age * .8), tail * .5, 4 * unit, light)
          if (technique === 'explosion') stamp('smoke', center[0], center[1] - age * size, radius * 3, 0, Math.sin(age * Math.PI) * .35, dark)
          break
        }
      }
      if (hit && authoredDetails.length) {
        if (recipe.key==='quiver_dance') for(const side of [-1,1])stamp('wing',source[0]+side*size*.6,source[1],size*1.35,side*(.4+Math.sin(p*24)*.14),tail*.85,'natural',1,side)
        if (recipe.key==='dragon_dance') for(let i=0;i<5;i++) {
          const a=p*7+i*TAU/5
          stamp('scale',source[0]+Math.cos(a)*size,source[1]+Math.sin(a)*size*.4-age*size*.5,size*.48,a,tail,main)
        }
        if (recipe.key==='hone_claws') for(const side of [-1,1])stamp('claw',source[0]+side*size*.16,source[1],size*1.2,side*(.6+Math.sin(p*20)*.12),tail,light)
        if (recipe.key==='growth') for(let i=0;i<3;i++)stamp('leaf',source[0]+(i-1)*size*.5,source[1]+size*(.5-age),size*(.7+age*.5),i*.9,tail,main)
        if (recipe.key==='lava_plume')stamp('smoke',target[0],target[1]-age*size,size*(1.4+age*1.7),p,tail*.6,dark)
      }
      if (phase === 'status') showResult()
      // Contact drain moves keep their punch/bite choreography, then return
      // energy to the caster without fabricating a second impact or HP event.
      if (recipe.drain && technique !== 'drain' && hit) {
        for (let i = 0; i < 6; i++) {
          const q = clamp(age * 1.8 - i * .065)
          if (q <= 0 || q >= 1) continue
          stamp('light', lerp(target[0], source[0], q), lerp(target[1], source[1], q) - Math.sin(q * Math.PI) * size * .7,
            size * .35, 0, globalAlpha * .8, light)
        }
      }
      return { draws, finished: false }
    },
  }
}
