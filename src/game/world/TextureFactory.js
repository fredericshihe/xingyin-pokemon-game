import { TILE_SIZE } from './constants'

const TAU = Math.PI * 2
export const PLAYER_VISUAL_VERSION = 3
export const PLAYER_TEXTURE_KEY = `player-trainer-v${PLAYER_VISUAL_VERSION}`

export const getPlayerWalkAnimKey = (direction) =>
  `player_trainer_v${PLAYER_VISUAL_VERSION}_walk_${direction}`

const roundedRect = (ctx, x, y, w, h, r) => {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

const fillRoundedRect = (ctx, x, y, w, h, r, fill) => {
  roundedRect(ctx, x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
}

const strokeRoundedRect = (ctx, x, y, w, h, r, stroke, lineWidth = 2) => {
  roundedRect(ctx, x, y, w, h, r)
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.stroke()
}

const makeLinear = (ctx, x0, y0, x1, y1, stops) => {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color))
  return gradient
}

const makeRadial = (ctx, x0, y0, r0, x1, y1, r1, stops) => {
  const gradient = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1)
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color))
  return gradient
}

const drawBlade = (ctx, x, y, h, color, lean = 0) => {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x + lean, y - h * 0.58, x + lean * 0.45, y - h)
  ctx.quadraticCurveTo(x + lean * 0.12, y - h * 0.45, x - 2, y)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

const drawGroundGlow = (ctx, x, colors) => {
  const s = TILE_SIZE
  ctx.fillStyle = colors.base
  ctx.fillRect(x, 0, s, s)
  ctx.fillStyle = makeRadial(ctx, x + s * 0.28, s * 0.16, 0, x + s * 0.28, s * 0.16, s * 0.95, [
    [0, colors.light],
    [1, 'rgba(255,255,255,0)']
  ])
  ctx.fillRect(x, 0, s, s)
  ctx.fillStyle = makeRadial(ctx, x + s * 0.78, s * 0.92, 0, x + s * 0.78, s * 0.92, s * 0.9, [
    [0, colors.shadow],
    [1, 'rgba(0,0,0,0)']
  ])
  ctx.fillRect(x, 0, s, s)
}

const drawGrassBase = (ctx, x, variant = 0) => {
  const s = TILE_SIZE
  drawGroundGlow(ctx, x, {
    base: variant === 1 ? '#80cf67' : '#78c95e',
    light: 'rgba(198,244,134,0.56)',
    shadow: 'rgba(28,112,62,0.28)'
  })

  const tufts = [
    [0.16, 0.35, 10, '#5daf52', -3],
    [0.42, 0.22, 8, '#9bdc68', 2],
    [0.74, 0.44, 9, '#529d4b', 3],
    [0.28, 0.78, 8, '#69b958', -2],
    [0.62, 0.72, 7, '#a7e077', 2]
  ]
  tufts.forEach(([tx, ty, h, color, lean], index) => {
    drawBlade(ctx, x + s * tx + variant * 2, s * ty, h + (index % 2) * 2, color, lean)
  })
}

const drawRoad = (ctx, x) => {
  const s = TILE_SIZE
  ctx.fillStyle = makeLinear(ctx, x, 0, x, s, [
    [0, '#efd884'],
    [0.52, '#d4b56a'],
    [1, '#bd9550']
  ])
  ctx.fillRect(x, 0, s, s)

  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.beginPath()
  ctx.ellipse(x + s * 0.42, s * 0.18, s * 0.45, s * 0.13, -0.16, 0, TAU)
  ctx.fill()

  ;[
    [0.18, 0.32, 5, 3],
    [0.74, 0.26, 4, 3],
    [0.38, 0.68, 6, 4],
    [0.82, 0.78, 4, 3]
  ].forEach(([px, py, w, h]) => {
    fillRoundedRect(ctx, x + s * px, s * py, w, h, 2, 'rgba(132,96,50,0.28)')
  })
}

const drawTree = (ctx, x) => {
  const s = TILE_SIZE
  drawGroundGlow(ctx, x, {
    base: '#69bd55',
    light: 'rgba(191,235,125,0.45)',
    shadow: 'rgba(42,111,52,0.24)'
  })
  ctx.fillStyle = 'rgba(25,69,37,0.2)'
  ctx.beginPath()
  ctx.ellipse(x + s * 0.5, s * 0.55, s * 0.32, s * 0.18, -0.2, 0, TAU)
  ctx.fill()
  fillRoundedRect(ctx, x + s * 0.36, s * 0.3, s * 0.28, s * 0.42, 9, 'rgba(92,62,39,0.52)')
  drawBlade(ctx, x + s * 0.18, s * 0.82, 12, '#458f44', -2)
  drawBlade(ctx, x + s * 0.78, s * 0.76, 14, '#84cf62', 2)
}

const drawWarp = (ctx, x) => {
  const s = TILE_SIZE
  drawRoad(ctx, x)
  ctx.fillStyle = 'rgba(79,70,229,0.2)'
  ctx.beginPath()
  ctx.ellipse(x + s / 2, s * 0.53, s * 0.32, s * 0.18, 0, 0, TAU)
  ctx.fill()

  const portal = makeRadial(ctx, x + s / 2, s * 0.48, 2, x + s / 2, s * 0.48, s * 0.28, [
    [0, '#ffffff'],
    [0.22, '#d9f99d'],
    [0.62, '#38bdf8'],
    [1, '#4f46e5']
  ])
  ctx.strokeStyle = portal
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(x + s / 2, s * 0.48, s * 0.2, 0, TAU)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255,255,255,0.72)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x + s * 0.34, s * 0.48)
  ctx.lineTo(x + s * 0.66, s * 0.48)
  ctx.moveTo(x + s * 0.5, s * 0.32)
  ctx.lineTo(x + s * 0.5, s * 0.64)
  ctx.stroke()
}

const drawItemPatch = (ctx, x) => {
  const s = TILE_SIZE
  drawGrassBase(ctx, x)
  ctx.fillStyle = 'rgba(30,41,59,0.18)'
  ctx.beginPath()
  ctx.ellipse(x + s * 0.5, s * 0.72, s * 0.18, s * 0.06, 0, 0, TAU)
  ctx.fill()

  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.arc(x + s * 0.5, s * 0.48, s * 0.13, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(x + s * 0.5, s * 0.48, s * 0.13, 0, Math.PI)
  ctx.fill()
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x + s * 0.37, s * 0.48)
  ctx.lineTo(x + s * 0.63, s * 0.48)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(x + s * 0.5, s * 0.48, s * 0.045, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 2
  ctx.stroke()
}

const drawHeal = (ctx, x) => {
  const s = TILE_SIZE
  drawGrassBase(ctx, x)
  fillRoundedRect(ctx, x + s * 0.2, s * 0.24, s * 0.6, s * 0.5, 12, '#ffffff')
  strokeRoundedRect(ctx, x + s * 0.2, s * 0.24, s * 0.6, s * 0.5, 12, 'rgba(59,130,246,0.28)', 3)
  fillRoundedRect(ctx, x + s * 0.45, s * 0.32, s * 0.1, s * 0.34, 4, '#fb7185')
  fillRoundedRect(ctx, x + s * 0.33, s * 0.44, s * 0.34, s * 0.1, 4, '#fb7185')
}

const drawSign = (ctx, x) => {
  const s = TILE_SIZE
  drawGrassBase(ctx, x)
  fillRoundedRect(ctx, x + s * 0.25, s * 0.24, s * 0.5, s * 0.25, 6, '#b77942')
  fillRoundedRect(ctx, x + s * 0.29, s * 0.29, s * 0.42, s * 0.11, 4, '#e7b873')
  fillRoundedRect(ctx, x + s * 0.46, s * 0.48, s * 0.08, s * 0.3, 3, '#805233')
}

const drawTrainer = (ctx, x) => {
  const s = TILE_SIZE
  drawGrassBase(ctx, x)
  ctx.fillStyle = 'rgba(15,23,42,0.2)'
  ctx.beginPath()
  ctx.ellipse(x + s * 0.5, s * 0.8, s * 0.18, s * 0.06, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#f7c7a3'
  ctx.beginPath()
  ctx.arc(x + s * 0.5, s * 0.31, s * 0.11, 0, TAU)
  ctx.fill()
  fillRoundedRect(ctx, x + s * 0.38, s * 0.42, s * 0.24, s * 0.24, 8, '#ef4444')
  fillRoundedRect(ctx, x + s * 0.34, s * 0.36, s * 0.32, s * 0.08, 6, '#f8fafc')
  fillRoundedRect(ctx, x + s * 0.4, s * 0.65, s * 0.08, s * 0.16, 4, '#1d4ed8')
  fillRoundedRect(ctx, x + s * 0.52, s * 0.65, s * 0.08, s * 0.16, 4, '#1d4ed8')
}

const drawTallGrass = (ctx, x, variant = 0) => {
  const s = TILE_SIZE
  const sway = variant === 0 ? -4 : 4
  for (let blade = 0; blade < 11; blade += 1) {
    const bx = x + 5 + blade * 5.5
    const h = 21 + ((blade + variant) % 4) * 3
    const by = s - 6 + ((blade + variant) % 2) * 2
    const color = blade % 3 === 0 ? '#2f8d46' : blade % 3 === 1 ? '#52b85a' : '#8bd85f'
    drawBlade(ctx, bx, by, h, color, sway + (blade % 3) * 2)
  }
  ctx.fillStyle = 'rgba(30,110,50,0.38)'
  ctx.fillRect(x, s - 11, s, 11)
}

const drawWater = (ctx, x) => {
  const s = TILE_SIZE
  ctx.fillStyle = makeLinear(ctx, x, 0, x, s, [
    [0, '#7dd3fc'],
    [0.5, '#38bdf8'],
    [1, '#0284c7']
  ])
  ctx.fillRect(x, 0, s, s)

  ctx.strokeStyle = 'rgba(255,255,255,0.62)'
  ctx.lineWidth = 3
  ;[0.24, 0.56, 0.84].forEach((py, index) => {
    ctx.beginPath()
    ctx.moveTo(x + s * 0.12, s * py)
    ctx.bezierCurveTo(
      x + s * 0.32,
      s * (py - 0.06),
      x + s * 0.48,
      s * (py + 0.06),
      x + s * 0.68,
      s * py
    )
    ctx.bezierCurveTo(
      x + s * 0.8,
      s * (py - 0.04),
      x + s * 0.9,
      s * (py - 0.02),
      x + s * 0.98,
      s * (py - 0.04 + index * 0.02)
    )
    ctx.stroke()
  })
}

const drawBerry = (ctx, x) => {
  const s = TILE_SIZE
  drawGrassBase(ctx, x)
  ctx.strokeStyle = '#3f7f37'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(x + s * 0.5, s * 0.72)
  ctx.quadraticCurveTo(x + s * 0.47, s * 0.42, x + s * 0.55, s * 0.26)
  ctx.stroke()
  ctx.fillStyle = '#55b44b'
  ctx.beginPath()
  ctx.ellipse(x + s * 0.42, s * 0.38, s * 0.12, s * 0.06, -0.45, 0, TAU)
  ctx.ellipse(x + s * 0.58, s * 0.42, s * 0.12, s * 0.06, 0.45, 0, TAU)
  ctx.fill()
  ;[
    [0.44, 0.56],
    [0.56, 0.58],
    [0.5, 0.48]
  ].forEach(([px, py]) => {
    ctx.fillStyle = '#f59e0b'
    ctx.beginPath()
    ctx.arc(x + s * px, s * py, s * 0.055, 0, TAU)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.beginPath()
    ctx.arc(x + s * (px - 0.018), s * (py - 0.018), s * 0.016, 0, TAU)
    ctx.fill()
  })
}

const drawMerchant = (ctx, x) => {
  const s = TILE_SIZE
  drawRoad(ctx, x)
  fillRoundedRect(ctx, x + s * 0.21, s * 0.22, s * 0.58, s * 0.5, 10, '#2563eb')
  fillRoundedRect(ctx, x + s * 0.16, s * 0.18, s * 0.68, s * 0.16, 7, '#f8fafc')
  ctx.fillStyle = '#ef4444'
  ctx.fillRect(x + s * 0.18, s * 0.18, s * 0.12, s * 0.16)
  ctx.fillRect(x + s * 0.43, s * 0.18, s * 0.12, s * 0.16)
  ctx.fillRect(x + s * 0.68, s * 0.18, s * 0.12, s * 0.16)
  fillRoundedRect(ctx, x + s * 0.35, s * 0.44, s * 0.3, s * 0.17, 5, '#dbeafe')
}

const drawSand = (ctx, x) => {
  const s = TILE_SIZE
  ctx.fillStyle = makeLinear(ctx, x, 0, x, s, [
    [0, '#f7e39b'],
    [0.54, '#e9cb70'],
    [1, '#d7ad54']
  ])
  ctx.fillRect(x, 0, s, s)
  ctx.fillStyle = 'rgba(255,255,255,0.24)'
  ctx.beginPath()
  ctx.ellipse(x + s * 0.32, s * 0.22, s * 0.32, s * 0.08, -0.12, 0, TAU)
  ctx.fill()
  ctx.fillStyle = 'rgba(138,93,44,0.22)'
  ;[
    [0.18, 0.58, 2],
    [0.42, 0.38, 1.6],
    [0.68, 0.72, 2],
    [0.82, 0.3, 1.5],
    [0.26, 0.82, 1.4]
  ].forEach(([px, py, r]) => {
    ctx.beginPath()
    ctx.arc(x + s * px, s * py, r, 0, TAU)
    ctx.fill()
  })
}

const drawCliff = (ctx, x) => {
  const s = TILE_SIZE
  ctx.fillStyle = makeLinear(ctx, x, 0, x, s, [
    [0, '#a7755a'],
    [0.4, '#8d5c49'],
    [1, '#5f3f36']
  ])
  ctx.fillRect(x, 0, s, s)
  ctx.fillStyle = 'rgba(255,230,190,0.22)'
  ctx.beginPath()
  ctx.moveTo(x, s * 0.12)
  ctx.lineTo(x + s * 0.26, s * 0.3)
  ctx.lineTo(x + s * 0.08, s * 0.45)
  ctx.lineTo(x + s * 0.42, s * 0.66)
  ctx.lineTo(x + s * 0.28, s)
  ctx.lineTo(x, s)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(57,36,31,0.34)'
  ctx.lineWidth = 3
  ;[0.2, 0.5, 0.78].forEach((py, index) => {
    ctx.beginPath()
    ctx.moveTo(x + s * (0.16 + index * 0.1), s * py)
    ctx.quadraticCurveTo(x + s * 0.48, s * (py + 0.08), x + s * 0.82, s * (py - 0.04))
    ctx.stroke()
  })
}

const drawBridge = (ctx, x) => {
  const s = TILE_SIZE
  ctx.fillStyle = makeLinear(ctx, x, 0, x, s, [
    [0, '#d7a85d'],
    [1, '#9c6a35']
  ])
  ctx.fillRect(x, 0, s, s)
  ctx.strokeStyle = 'rgba(90,52,23,0.62)'
  ctx.lineWidth = 3
  for (let px = 8; px < s; px += 14) {
    ctx.beginPath()
    ctx.moveTo(x + px, 4)
    ctx.lineTo(x + px, s - 4)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255,234,185,0.42)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x + 4, 9)
  ctx.lineTo(x + s - 4, 9)
  ctx.moveTo(x + 4, s - 10)
  ctx.lineTo(x + s - 4, s - 10)
  ctx.stroke()
}

const drawFlowers = (ctx, x) => {
  const s = TILE_SIZE
  drawGrassBase(ctx, x)
  ;[
    [0.24, 0.34, '#f97316'],
    [0.52, 0.46, '#facc15'],
    [0.76, 0.3, '#fb7185'],
    [0.34, 0.72, '#facc15'],
    [0.68, 0.72, '#f97316']
  ].forEach(([px, py, color]) => {
    ctx.fillStyle = '#3f8e3d'
    ctx.fillRect(x + s * px - 1, s * py + 2, 2, 8)
    ctx.fillStyle = color
    for (let petal = 0; petal < 5; petal += 1) {
      const angle = (petal / 5) * TAU
      ctx.beginPath()
      ctx.ellipse(
        x + s * px + Math.cos(angle) * 4,
        s * py + Math.sin(angle) * 3,
        3,
        2,
        angle,
        0,
        TAU
      )
      ctx.fill()
    }
    ctx.fillStyle = '#fff7ad'
    ctx.beginPath()
    ctx.arc(x + s * px, s * py, 2, 0, TAU)
    ctx.fill()
  })
}

const drawPaleGrass = (ctx, x) => {
  const s = TILE_SIZE
  drawGroundGlow(ctx, x, {
    base: '#a7d9ba',
    light: 'rgba(226,255,226,0.44)',
    shadow: 'rgba(43,128,84,0.2)'
  })
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.beginPath()
  ctx.ellipse(x + s * 0.52, s * 0.45, s * 0.34, s * 0.13, -0.18, 0, TAU)
  ctx.fill()
}

const drawDock = (ctx, x) => {
  const s = TILE_SIZE
  drawWater(ctx, x)
  fillRoundedRect(ctx, x + s * 0.08, s * 0.28, s * 0.84, s * 0.44, 4, '#b9803e')
  ctx.strokeStyle = 'rgba(83,48,25,0.58)'
  ctx.lineWidth = 3
  for (let px = 10; px < s - 2; px += 12) {
    ctx.beginPath()
    ctx.moveTo(x + px, s * 0.3)
    ctx.lineTo(x + px, s * 0.7)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255,232,181,0.44)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x + s * 0.1, s * 0.34)
  ctx.lineTo(x + s * 0.9, s * 0.34)
  ctx.stroke()
}

const TILE_DRAWERS = [
  drawGrassBase,
  drawTree,
  drawWarp,
  drawItemPatch,
  drawHeal,
  drawSign,
  drawTrainer,
  drawTallGrass,
  drawWater,
  drawRoad,
  (ctx, x) => drawTallGrass(ctx, x, 1),
  drawBerry,
  drawMerchant,
  drawSand,
  drawCliff,
  drawBridge,
  drawFlowers,
  drawPaleGrass,
  drawDock
]

export function createOverworldTileset(scene, key = 'overworld-tiles') {
  if (scene.textures.exists(key)) return key

  const tileSize = TILE_SIZE
  const count = TILE_DRAWERS.length
  const canvas = document.createElement('canvas')
  canvas.width = tileSize * count
  canvas.height = tileSize
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  TILE_DRAWERS.forEach((draw, index) => {
    const x = index * tileSize
    draw(ctx, x)
  })

  scene.textures.addCanvas(key, canvas)
  return key
}

const addCanvasTexture = (scene, key, width, height, draw) => {
  if (scene.textures.exists(key)) return key

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  draw(ctx, width, height)
  scene.textures.addCanvas(key, canvas)
  return key
}

const drawTreeObject = (ctx, width, height) => {
  const cx = width / 2
  const baseY = height - 14

  ctx.fillStyle = 'rgba(16, 45, 28, 0.28)'
  ctx.beginPath()
  ctx.ellipse(cx + 8, baseY - 2, width * 0.34, 10, -0.08, 0, TAU)
  ctx.fill()

  const trunk = makeLinear(ctx, cx - 16, baseY - 48, cx + 14, baseY, [
    [0, '#b36b37'],
    [0.5, '#85502f'],
    [1, '#5f3b26']
  ])
  fillRoundedRect(ctx, cx - 14, baseY - 58, 28, 58, 12, trunk)
  ctx.strokeStyle = 'rgba(59,35,23,0.28)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx - 5, baseY - 52)
  ctx.quadraticCurveTo(cx - 12, baseY - 30, cx - 4, baseY - 8)
  ctx.moveTo(cx + 7, baseY - 50)
  ctx.quadraticCurveTo(cx + 13, baseY - 34, cx + 8, baseY - 10)
  ctx.stroke()

  const canopy = makeRadial(ctx, cx - 20, 25, 4, cx, 44, 66, [
    [0, '#b7f06e'],
    [0.35, '#65bd4e'],
    [0.74, '#2f833f'],
    [1, '#1f5f32']
  ])
  ctx.fillStyle = canopy
  ;[
    [0.27, 0.32, 0.26],
    [0.45, 0.2, 0.3],
    [0.64, 0.27, 0.27],
    [0.75, 0.45, 0.25],
    [0.48, 0.48, 0.33],
    [0.27, 0.5, 0.25]
  ].forEach(([px, py, r]) => {
    ctx.beginPath()
    ctx.arc(width * px, height * py, width * r, 0, TAU)
    ctx.fill()
  })

  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx - 18, 30, 18, Math.PI * 1.05, Math.PI * 1.75)
  ctx.arc(cx + 16, 42, 20, Math.PI * 1.1, Math.PI * 1.55)
  ctx.stroke()

  ctx.fillStyle = 'rgba(18, 65, 35, 0.26)'
  ctx.beginPath()
  ctx.ellipse(cx + 18, 72, 32, 16, -0.08, 0, TAU)
  ctx.fill()
}

const drawTallGrassObject = (ctx, width, height, variant = 0) => {
  const sway = variant === 0 ? -5 : 5
  ctx.fillStyle = 'rgba(28, 95, 45, 0.22)'
  ctx.beginPath()
  ctx.ellipse(width / 2, height - 8, width * 0.46, 7, 0, 0, TAU)
  ctx.fill()
  for (let blade = 0; blade < 15; blade += 1) {
    const bx = 5 + blade * ((width - 10) / 14)
    const h = 24 + ((blade + variant) % 5) * 4
    const by = height - 6 + ((blade + variant) % 2)
    const color = blade % 3 === 0 ? '#2c8841' : blade % 3 === 1 ? '#4db556' : '#93dd65'
    drawBlade(ctx, bx, by, h, color, sway + (blade % 4) * 2)
  }
}

const drawRockObject = (ctx, width, height) => {
  const cx = width / 2
  const baseY = height - 10
  ctx.fillStyle = 'rgba(10,24,50,0.3)'
  ctx.beginPath()
  ctx.ellipse(cx + 6, baseY, width * 0.32, 8, -0.08, 0, TAU)
  ctx.fill()

  const rock = makeLinear(ctx, cx - 20, 10, cx + 18, baseY, [
    [0, '#c58d72'],
    [0.52, '#9d6656'],
    [1, '#654239']
  ])
  ctx.fillStyle = rock
  ctx.beginPath()
  ctx.moveTo(cx - 22, baseY - 8)
  ctx.lineTo(cx - 13, baseY - 36)
  ctx.lineTo(cx + 5, baseY - 48)
  ctx.lineTo(cx + 22, baseY - 30)
  ctx.lineTo(cx + 18, baseY - 6)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = 'rgba(69,42,37,0.35)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx - 8, baseY - 34)
  ctx.lineTo(cx + 2, baseY - 14)
  ctx.moveTo(cx + 8, baseY - 28)
  ctx.lineTo(cx + 17, baseY - 11)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255,229,205,0.32)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx - 13, baseY - 30)
  ctx.quadraticCurveTo(cx - 3, baseY - 42, cx + 8, baseY - 33)
  ctx.stroke()
}

const drawHouseObject = (ctx, width, height) => {
  const cx = width / 2
  const baseY = height - 10
  ctx.fillStyle = 'rgba(15, 23, 42, 0.22)'
  ctx.beginPath()
  ctx.ellipse(cx + 6, baseY, width * 0.34, 10, 0, 0, TAU)
  ctx.fill()

  fillRoundedRect(ctx, cx - 48, baseY - 54, 96, 48, 7, '#f8fafc')
  strokeRoundedRect(ctx, cx - 48, baseY - 54, 96, 48, 7, 'rgba(71,85,105,0.34)', 3)
  ctx.fillStyle = makeLinear(ctx, cx - 56, baseY - 76, cx + 56, baseY - 50, [
    [0, '#fb7185'],
    [1, '#dc2626']
  ])
  ctx.beginPath()
  ctx.moveTo(cx - 58, baseY - 52)
  ctx.lineTo(cx, baseY - 88)
  ctx.lineTo(cx + 58, baseY - 52)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(127,29,29,0.42)'
  ctx.lineWidth = 3
  ctx.stroke()
  fillRoundedRect(ctx, cx - 12, baseY - 36, 24, 30, 5, '#8b5e34')
  fillRoundedRect(ctx, cx - 38, baseY - 41, 20, 14, 4, '#93c5fd')
  fillRoundedRect(ctx, cx + 18, baseY - 41, 20, 14, 4, '#93c5fd')
  ctx.fillStyle = '#facc15'
  ctx.beginPath()
  ctx.arc(cx + 8, baseY - 22, 2, 0, TAU)
  ctx.fill()
}

export function createWorldObjectTextures(scene) {
  addCanvasTexture(scene, 'tree-object', 112, 126, drawTreeObject)
  addCanvasTexture(scene, 'tall-grass-object-0', TILE_SIZE, 46, (ctx, width, height) => {
    drawTallGrassObject(ctx, width, height, 0)
  })
  addCanvasTexture(scene, 'tall-grass-object-1', TILE_SIZE, 46, (ctx, width, height) => {
    drawTallGrassObject(ctx, width, height, 1)
  })
  addCanvasTexture(scene, 'rock-object', 72, 70, drawRockObject)
  addCanvasTexture(scene, 'house-object', 144, 118, drawHouseObject)
}

const drawCap = (ctx, cx, cy, direction) => {
  const brim = direction === 'left' ? -8 : direction === 'right' ? 8 : 0
  const capGradient = makeLinear(ctx, cx - 12, cy - 10, cx + 12, cy + 6, [
    [0, '#67e8f9'],
    [0.62, '#38bdf8'],
    [1, '#2563eb']
  ])
  ctx.fillStyle = capGradient
  ctx.beginPath()
  ctx.ellipse(cx, cy, 14, 8, 0, Math.PI, TAU)
  ctx.fill()
  fillRoundedRect(ctx, cx - 13, cy - 1, 26, 5, 3, '#f8fafc')
  if (direction !== 'up') {
    ctx.fillStyle = '#0ea5e9'
    ctx.beginPath()
    ctx.ellipse(cx + brim, cy + 1, direction === 'down' ? 11 : 8, 3.5, 0, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#fde68a'
    ctx.beginPath()
    ctx.arc(cx + brim * 0.32, cy - 2, 2.2, 0, TAU)
    ctx.fill()
  }
}

const drawPlayerFrame = (ctx, ox, oy, direction, frame) => {
  const step = frame === 1 ? -4 : frame === 3 ? 4 : 0
  const bob = frame === 0 || frame === 2 ? 0 : -1.2
  const cx = ox + 32
  const footY = oy + 82
  const side = direction === 'left' || direction === 'right'
  const sideSign = direction === 'left' ? -1 : 1

  ctx.clearRect(ox, oy, 64, 96)

  ctx.fillStyle = 'rgba(15,23,42,0.2)'
  ctx.beginPath()
  ctx.ellipse(cx + 2, footY + 3, 16, 5.5, -0.04, 0, TAU)
  ctx.fill()

  const bodyY = oy + 37 + bob
  const headX = cx + (side ? sideSign * 3 : 0)
  const headY = oy + 27 + bob

  ctx.strokeStyle = 'rgba(43,34,31,0.2)'
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - 9, bodyY + 29)
  ctx.lineTo(cx - 9 + step, footY - 8)
  ctx.moveTo(cx + 9, bodyY + 29)
  ctx.lineTo(cx + 9 - step, footY - 8)
  ctx.stroke()

  if (direction === 'up') {
    fillRoundedRect(ctx, cx - 17, bodyY + 3, 34, 25, 10, '#7c3aed')
    fillRoundedRect(ctx, cx - 11, bodyY + 7, 22, 19, 8, '#fbbf24')
  } else {
    fillRoundedRect(ctx, cx - 18, bodyY + 8, 36, 16, 8, '#fbbf24')
    fillRoundedRect(ctx, cx - 14, bodyY + 1, 28, 31, 11, '#8b5cf6')
    fillRoundedRect(ctx, cx - 10, bodyY + 5, 20, 9, 6, '#ede9fe')
    ctx.fillStyle = 'rgba(255,255,255,0.84)'
    ctx.beginPath()
    ctx.moveTo(cx - 6, bodyY + 5)
    ctx.lineTo(cx, bodyY + 16)
    ctx.lineTo(cx + 6, bodyY + 5)
    ctx.closePath()
    ctx.fill()
  }

  ctx.strokeStyle = '#f3c7a3'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (direction === 'left') {
    ctx.moveTo(cx - 12, bodyY + 10)
    ctx.lineTo(cx - 21, bodyY + 19 - step * 0.14)
    ctx.moveTo(cx + 11, bodyY + 11)
    ctx.lineTo(cx + 17, bodyY + 21 + step * 0.1)
  } else if (direction === 'right') {
    ctx.moveTo(cx + 12, bodyY + 10)
    ctx.lineTo(cx + 21, bodyY + 19 + step * 0.14)
    ctx.moveTo(cx - 11, bodyY + 11)
    ctx.lineTo(cx - 17, bodyY + 21 - step * 0.1)
  } else {
    ctx.moveTo(cx - 11, bodyY + 10)
    ctx.lineTo(cx - 17, bodyY + 22 + step * 0.1)
    ctx.moveTo(cx + 11, bodyY + 10)
    ctx.lineTo(cx + 17, bodyY + 22 - step * 0.1)
  }
  ctx.stroke()

  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(cx - 7, bodyY + 28)
  ctx.lineTo(cx - 8 + step, footY - 8)
  ctx.moveTo(cx + 7, bodyY + 28)
  ctx.lineTo(cx + 8 - step, footY - 8)
  ctx.stroke()

  ctx.strokeStyle = '#fb7185'
  ctx.lineWidth = 4.5
  ctx.beginPath()
  ctx.moveTo(cx - 8 + step, footY - 4)
  ctx.lineTo(cx - 16 + step, footY - 4)
  ctx.moveTo(cx + 8 - step, footY - 4)
  ctx.lineTo(cx + 16 - step, footY - 4)
  ctx.stroke()

  fillRoundedRect(ctx, headX - 5, headY + 9, 10, 9, 4, '#f3c7a3')

  ctx.fillStyle = '#3b2f57'
  ctx.beginPath()
  if (direction === 'up') {
    ctx.ellipse(headX, headY - 3, 12, 11, 0, 0, TAU)
  } else {
    ctx.ellipse(headX, headY - 4, side ? 10 : 12, 10.5, side ? sideSign * 0.12 : 0, 0, TAU)
  }
  ctx.fill()

  ctx.fillStyle = '#f3c7a3'
  ctx.beginPath()
  ctx.ellipse(headX, headY, side ? 9.5 : 10.5, 11.5, 0, 0, TAU)
  ctx.fill()

  if (direction !== 'up') {
    ctx.fillStyle = '#3b2f57'
    ctx.beginPath()
    ctx.ellipse(headX - (side ? sideSign * 2 : 7), headY + 4, 3.6, 8, -0.25, 0, TAU)
    ctx.ellipse(headX + (side ? sideSign * 6 : 7), headY + 4, 3.4, 7, 0.25, 0, TAU)
    ctx.fill()
  }

  drawCap(ctx, headX, headY - 11, direction)

  if (direction !== 'up') {
    ctx.fillStyle = '#1f2937'
    if (side) {
      ctx.beginPath()
      ctx.arc(headX + sideSign * 4, headY, 1.55, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = 'rgba(127,29,29,0.45)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(headX + sideSign * 4, headY + 6)
      ctx.lineTo(headX + sideSign * 8, headY + 5)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(headX - 3.8, headY, 1.45, 0, TAU)
      ctx.arc(headX + 3.8, headY, 1.45, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = 'rgba(127,29,29,0.45)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(headX - 4, headY + 6.5)
      ctx.quadraticCurveTo(headX, headY + 8.5, headX + 4, headY + 6.5)
      ctx.stroke()
    }
  }
}

const PLAYER_FIGURE_DATA_URL_CACHE = new Map()

export function getPlayerFigureDataUrl({
  direction = 'right',
  frame = 1,
  scale = 2
} = {}) {
  if (typeof document === 'undefined') return null

  const safeDirection = ['down', 'left', 'right', 'up'].includes(direction)
    ? direction
    : 'right'
  const safeFrame = Math.max(0, Math.min(3, Math.trunc(Number(frame) || 0)))
  const safeScale = Math.max(1, Math.min(4, Math.trunc(Number(scale) || 2)))
  const cacheKey = `${safeDirection}:${safeFrame}:${safeScale}`
  if (PLAYER_FIGURE_DATA_URL_CACHE.has(cacheKey)) {
    return PLAYER_FIGURE_DATA_URL_CACHE.get(cacheKey)
  }

  const canvas = document.createElement('canvas')
  canvas.width = 64 * safeScale
  canvas.height = 96 * safeScale
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.scale(safeScale, safeScale)
  drawPlayerFrame(ctx, 0, 0, safeDirection, safeFrame)

  const dataUrl = canvas.toDataURL('image/png')
  PLAYER_FIGURE_DATA_URL_CACHE.set(cacheKey, dataUrl)
  return dataUrl
}

export function createPlayerPlaceholder(scene, key = PLAYER_TEXTURE_KEY) {
  if (scene.textures.exists(key)) return key

  const frameW = 64
  const frameH = 96
  const directions = ['down', 'left', 'right', 'up']
  const framesPerDir = 4
  const canvas = document.createElement('canvas')
  canvas.width = frameW * framesPerDir
  canvas.height = frameH * directions.length
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  directions.forEach((direction, row) => {
    for (let f = 0; f < framesPerDir; f += 1) {
      drawPlayerFrame(ctx, f * frameW, row * frameH, direction, f)
    }
  })

  scene.textures.addCanvas(key, canvas)

  const texture = scene.textures.get(key)
  directions.forEach((_, row) => {
    for (let f = 0; f < framesPerDir; f += 1) {
      const frameIndex = row * framesPerDir + f
      texture.add(frameIndex, 0, f * frameW, row * frameH, frameW, frameH)
    }
  })

  return key
}

export function registerPlayerAnimations(scene, textureKey = PLAYER_TEXTURE_KEY) {
  const dirs = ['down', 'left', 'right', 'up']
  dirs.forEach((dir, row) => {
    const animKey = getPlayerWalkAnimKey(dir)
    if (scene.anims.exists(animKey)) return
    scene.anims.create({
      key: animKey,
      frames: scene.anims.generateFrameNumbers(textureKey, {
        start: row * 4,
        end: row * 4 + 3
      }),
      frameRate: 11,
      repeat: -1
    })
  })
}
