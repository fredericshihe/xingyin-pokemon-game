import { VFX_ATLAS } from './battleVfxAtlas.generated.js'
import { BATTLE_EFFECT_FALLBACK_ANCHORS } from './battleEffectAnchors'
import { getBattleMoveImpactDelay } from './battlePacing'

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
  const index = Math.max(0, VFX_ATLAS.sprites.indexOf(material))
  const tile = document.createElement('canvas')
  tile.width = tile.height = VFX_ATLAS.size
  const ctx = tile.getContext('2d')
  const draw = () => ctx.drawImage(image, index % VFX_ATLAS.columns * tile.width, Math.floor(index / VFX_ATLAS.columns) * tile.height, tile.width, tile.height, 0, 0, tile.width, tile.height)
  draw()
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, tile.width, tile.height)
  ctx.globalCompositeOperation = 'destination-in'
  draw()
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
    slam: ['dust'], quake: ['dust'], eruption: ['dust'],
    orb: ['smoke'], explosion: ['smoke'], fang: ['tooth'],
    wave: ['mist', 'droplet'], jet: ['droplet'],
    storm: ['mist'], vortex: ['mist'], barrier: ['bubble'],
    hammer: ['dust', 'splash'], burrow: ['dust'], toss: ['dust'], hop: ['dust'],
    heal: ['shell', 'leaf', 'droplet'], 'egg-heal': ['shell'],
    'rock-prison': ['dust'], 'sword-dance': ['metal'],
  })[recipe.technique] || []
  const resultMaterial = { burn: 'flame', poison: 'droplet', paralysis: 'spark', sleep: 'mist', freeze: 'frost', confusion: 'mist' }[effect.visualResult?.status]
  for (const material of new Set([recipe.material, 'light', 'spark', ...extraMaterials, ...(resultMaterial ? [resultMaterial] : []), ...(recipe.key === 'soft_boiled' ? ['shell'] : [])])) {
    for (const color of recipe.palette) getSprite(material, color)
  }
  const result = effect.visualResult
  const healing = result?.kind === 'heal' || effect.feedback?.kind === 'heal'
  const falling = result?.kind === 'stat' && result.stages < 0
  const resultColor = healing ? '#b0f6cb' : result?.kind === 'stat' ? falling ? '#a598d3' : '#f4dc92' : main
  if (healing || result?.kind === 'stat') getSprite('light', resultColor)
  if (recipe.technique === 'tears') getSprite('droplet', '#b8e5fa')
  let draws = 0
  const stamp = (material, x, y, size, rotation = 0, alpha = 1, color = main, aspect = 1) => {
    if (alpha <= .003 || size <= .1 || draws >= budget) return
    draws++
    ctx.save()
    ctx.globalAlpha = clamp(alpha)
    // The atlas already carries soft transparent glow. Repeated screen blends
    // force destination reads on mobile GPUs for every flame/spark.
    ctx.translate(x, y)
    ctx.rotate(rotation)
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
      if (recipe.gesture === 'kick') target[1] += size * .36
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
      const pathPoint = (t, offset = 0, bend = recipe.bend) => [
        lerp(source[0], target[0], t) - Math.sin(direction) * offset,
        lerp(source[1], target[1], t) + Math.sin(t * Math.PI) * bend * size * 1.4 + Math.cos(direction) * offset,
      ]
      const motes = (center, material, amount, radius, alpha, flow = 'out', color = main) => {
        for (let i = 0; i < amount; i++) {
          const n = noise(i + 3), angle = i * 2.399 + recipe.rotation + (flow === 'orbit' ? p * 4 : 0)
          const r = radius * (flow === 'in' ? 1 - age : flow === 'orbit' ? .7 + n * .3 : .2 + ease(age) * (.5 + n))
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
          stamp(recipe.material, ...center, size * scale * 1.5, recipe.rotation, globalAlpha * .85)
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
              const w = beamWidth * (.25 + Math.sin(q * Math.PI) * .7) * side
              const point = pathPoint(q, w + Math.sin(q * 19 - p * 14) * size * .018)
              if (side < 0 && i === 0) ctx.moveTo(...point); else ctx.lineTo(...point)
            }
            ctx.closePath(); ctx.fill(); ctx.restore()
          }
          for (let i = 0; i < Math.min(26, count * 2); i++) {
            const q = (p * 2 + i / Math.min(26, count * 2)) % 1
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
          const n = technique === 'orb' ? 1 : Math.min(12, count)
          for (let i = 0; i < n; i++) {
            const f = clamp(flight * 1.22 - i / Math.max(1, n - 1) * .22)
            const offset = (i - (n - 1) / 2) * size * .16 * scale
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
              } else stamp(recipe.material, x, y, size * .56 * scale, direction + p * recipe.rotation * 4, .95, i % 3 ? main : light, recipe.material === 'ice' || recipe.material === 'claw' ? 1.5 : 1)
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
            stamp('flame', ...head, size * scale * 1.4, direction + Math.PI / 2, globalAlpha, light, 1.65)
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
          stamp('light', source[0], source[1] - size * .28, size * .9, 0, globalAlpha * tail * .55, main, .35)
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
          const center = hit ? target : pathPoint(flight * .58)
          const swing = hit ? age * .7 : -1.5 + flight * 1.5
          stamp(recipe.material, center[0], center[1] - size * (hit ? .1 : .55), size * scale * 1.5,
            recipe.rotation + swing, hit ? tail : globalAlpha, light)
          if (hit) {
            motes(target, recipe.material, 7, size * scale, tail * .8)
            if (recipe.key === 'crabhammer') motes(target, 'splash', 9, size * 1.5, tail)
            ellipse(target[0], target[1] + size * .5, size * (1 + age * 1.8), size * (.2 + age * .3), tail * .8, 3 * unit, dark)
          }
          break
        }
        case 'boomerang': {
          const q = hit ? 1 - ease(age) : flight
          const point = pathPoint(q, Math.sin(q * Math.PI) * size * (hit ? 1 : -1), hit ? .7 : -.7)
          stamp(recipe.material, ...point, size * 1.25, p * 20, globalAlpha, light)
          if (hit && age < .35) motes(target, recipe.material, 5, size * .7, tail * .7)
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
          if (['splash','droplet','mist','foam'].includes(recipe.material)) {
            ctx.save();ctx.globalAlpha=globalAlpha*tail*.8
            const backX=front[0]-Math.cos(direction)*size*1.4,backY=front[1]-Math.sin(direction)*size*1.4
            const gradient=ctx.createLinearGradient(backX,backY,front[0],front[1])
            gradient.addColorStop(0,'transparent');gradient.addColorStop(.4,dark);gradient.addColorStop(.88,main);gradient.addColorStop(1,light)
            ctx.fillStyle=gradient;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y))
            for(let i=points.length-1;i>=0;i--)ctx.lineTo(points[i][0]-Math.cos(direction)*size*1.4,points[i][1]-Math.sin(direction)*size*1.4)
            ctx.closePath();ctx.fill();ctx.restore();draws++
            ribbon(points,size*.1,globalAlpha*tail*.8)
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
          for (let i = 0; i < (technique === 'quake' ? 5 : 3); i++) {
            const points = Array.from({ length: 10 }, (_, j) => {
              const q = j / 9, angle = i * TAU / 5 + recipe.rotation
              return [target[0] + Math.cos(angle) * q * size * scale * 2.1 + (noise(i * 41 + j) - .5) * size * .3, target[1] + size * .65 + Math.sin(angle) * q * size * scale * .65]
            })
            line(points, 4 * unit * tail, tail * .8, dark)
            line(points, 1.2 * unit, tail * .8, light)
          }
          for (let i = 0; i < Math.min(25, count); i++) {
            const n = noise(i + 88), x = target[0] + (n - .5) * size * scale * 2.5
            const jump = Math.sin(Math.min(1, age * (1.2 + n)) * Math.PI)
            const y = target[1] + size * .65 - jump * size * (technique === 'eruption' ? 1.2 + scale : .4 + n)
            stamp(recipe.material, x, y, size * (.35 + n * .55), i + age * recipe.rotation, tail, i % 4 ? main : light, recipe.key === 'stone_edge' ? 2 : 1)
          }
          stamp('dust', target[0], target[1] + size * .6, size * scale * 3.6, 0, tail * .55, main, .45)
          break
        }
        case 'sound': {
          for (let i = 0; i < Math.min(10, count); i++) {
            const q = clamp(flight - i * .075 + age * .5)
            if (q <= 0) continue
            const [x, y] = pathPoint(q)
            const r = size * scale * (.25 + q * 1.35)
            ellipse(x, y, r * .5, r, globalAlpha * tail * .65, unit * (2 + recipe.energy), i % 2 ? light : main, direction)
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
            const radius = size * scale * (.3 + n * .8) * (.3 + flight * .7)
            const x = center[0] + Math.cos(a) * radius, y = center[1] + Math.sin(a) * radius * .75 - age * size * .5
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
              stamp(recipe.material, center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r * .7,
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
              const r = size * scale * (technique === 'shatter' ? .4 + age * 1.5 : .55 + n * .6)
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
