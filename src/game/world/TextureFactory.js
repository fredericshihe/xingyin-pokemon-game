const TAU = Math.PI * 2

export const PLAYER_VISUAL_VERSION = 4

const PLAYER_FIGURE_DATA_URL_CACHE = new Map()

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

const makeLinear = (ctx, x0, y0, x1, y1, stops) => {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color))
  return gradient
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

export function getPlayerFigureDataUrl({
  direction = 'right',
  frame = 1,
  scale = 2
} = {}) {
  if (typeof document === 'undefined') return null

  const safeDirection = ['down', 'left', 'right', 'up'].includes(direction) ? direction : 'right'
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
