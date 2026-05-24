import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import generatedMap from '../src/game/data/godotMaps/godot_map_v2.generated.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const sourcePath = path.join(repoRoot, 'src/game/data/mapSources/godotMapV2.source.json')
const outputPath = path.join(repoRoot, 'docs/godot-map-v2-layout-preview.svg')

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
const scale = 9
const margin = 48
const legendWidth = 280
const width = source.dimensions.width * scale + margin * 2 + legendWidth
const height = source.dimensions.height * scale + margin * 2

const colors = {
  A: '#9bdc68',
  B: '#a3a3a3',
  C: '#f9a8d4',
  D: '#7dd3fc',
  E: '#38bdf8',
  F: '#facc15',
  G: '#86efac',
  H: '#c084fc',
  I: '#bef264',
  J: '#67e8f9',
  K: '#f87171'
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function px(value) {
  return margin + value * scale
}

function polyline(points) {
  return points.map((point) => `${px(point.x)},${px(point.y)}`).join(' ')
}

const out = []
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`)
out.push('<rect width="100%" height="100%" fill="#f8fafc"/>')
out.push(`<rect x="${margin}" y="${margin}" width="${source.dimensions.width * scale}" height="${source.dimensions.height * scale}" fill="#d9f99d" stroke="#334155" stroke-width="2"/>`)

source.areas.forEach((area) => {
  const color = colors[area.id] || '#e2e8f0'
  out.push(`<rect x="${px(area.bounds.x)}" y="${px(area.bounds.y)}" width="${area.bounds.width * scale}" height="${area.bounds.height * scale}" fill="${color}" fill-opacity="0.23" stroke="${color}" stroke-width="2"/>`)
  out.push(`<text x="${px(area.bounds.x) + 5}" y="${px(area.bounds.y) + 16}" fill="#0f172a" font-size="12" font-family="Arial">${esc(area.id)} ${esc(area.name)}</text>`)
})

source.waterBodies.forEach((body) => {
  if (body.type === 'ellipse') {
    out.push(`<ellipse cx="${px(body.x)}" cy="${px(body.y)}" rx="${body.rx * scale}" ry="${body.ry * scale}" fill="#38bdf8" fill-opacity="0.5" stroke="#0284c7" stroke-width="2"/>`)
  } else {
    out.push(`<rect x="${px(body.x)}" y="${px(body.y)}" width="${body.width * scale}" height="${body.height * scale}" fill="#38bdf8" fill-opacity="0.5" stroke="#0284c7" stroke-width="2"/>`)
  }
})

source.encounterZones.forEach((zone) => {
  out.push(`<rect x="${px(zone.bounds.x)}" y="${px(zone.bounds.y)}" width="${zone.bounds.width * scale}" height="${zone.bounds.height * scale}" fill="#22c55e" fill-opacity="0.16" stroke="#15803d" stroke-width="1" stroke-dasharray="4 3"/>`)
  out.push(`<text x="${px(zone.bounds.x) + 3}" y="${px(zone.bounds.y) + 12}" fill="#14532d" font-size="9" font-family="Arial">${esc(zone.id)}</text>`)
})

source.routes.forEach((route) => {
  const isMain = route.role === 'main'
  const routeOpacity = isMain ? 0.88 : 0.18
  const dash = isMain ? '' : ' stroke-dasharray="4 4"'
  out.push(`<polyline points="${polyline(route.anchors)}" fill="none" stroke="${isMain ? '#b45309' : '#92400e'}" stroke-width="${Math.max(2, route.width * scale * 0.52)}" stroke-linecap="round" stroke-linejoin="round" opacity="${routeOpacity}"${dash}/>`)
})

source.bridges.forEach((bridge) => {
  out.push(`<circle cx="${px(bridge.x)}" cy="${px(bridge.y)}" r="${bridge.clearanceRadius * scale}" fill="none" stroke="#0f172a" stroke-opacity="0.2" stroke-width="1"/>`)
  out.push(`<rect x="${px(bridge.x) - (bridge.length * scale) / 2}" y="${px(bridge.y) - (bridge.width * scale) / 2}" width="${bridge.length * scale}" height="${bridge.width * scale}" fill="#92400e" stroke="#451a03" stroke-width="1" transform="rotate(${bridge.rotation * 57.2958} ${px(bridge.x)} ${px(bridge.y)})"/>`)
  out.push(`<text x="${px(bridge.x) + 8}" y="${px(bridge.y) - 8}" fill="#451a03" font-size="11" font-family="Arial">${esc(bridge.id)}</text>`)
})

source.safeClearings.forEach((clearing) => {
  out.push(`<circle cx="${px(clearing.x)}" cy="${px(clearing.y)}" r="${clearing.radius * scale}" fill="#ffffff" fill-opacity="0.35" stroke="#0f172a" stroke-opacity="0.35" stroke-width="1"/>`)
})

const eventColors = {
  trainer: '#2563eb',
  boss: '#dc2626',
  heal: '#16a34a',
  challenge: '#9333ea',
  pickup: '#f97316',
  secret: '#64748b'
}

source.events.forEach((event) => {
  const color = eventColors[event.type] || '#0f172a'
  const r = event.type === 'boss' ? 7 : 5
  out.push(`<circle cx="${px(event.position.x)}" cy="${px(event.position.y)}" r="${r}" fill="${color}" stroke="#ffffff" stroke-width="2"/>`)
  out.push(`<text x="${px(event.position.x) + 7}" y="${px(event.position.y) - 7}" fill="${color}" font-size="9" font-family="Arial">${esc(event.id.replace(/^(trainer_|boss_|pickup_|secret_|heal_|challenge_)/, ''))}</text>`)
})

source.assetPlacements.forEach((placement) => {
  out.push(`<rect x="${px(placement.x) - 3}" y="${px(placement.y) - 3}" width="6" height="6" fill="#111827" opacity="0.72"/>`)
})

;(generatedMap.decorativeObjects || [])
  .filter((object) => object.sourceRuleId)
  .forEach((object) => {
    out.push(`<circle cx="${px(object.x)}" cy="${px(object.y)}" r="2.2" fill="#334155" opacity="0.34"/>`)
  })

const legendX = margin + source.dimensions.width * scale + 34
let legendY = margin
out.push(`<text x="${legendX}" y="${legendY}" fill="#0f172a" font-size="20" font-weight="700" font-family="Arial">${esc(source.displayName)}</text>`)
legendY += 28
out.push(`<text x="${legendX}" y="${legendY}" fill="#475569" font-size="12" font-family="Arial">GodotMapV2 layout preview</text>`)
legendY += 30

source.areas.forEach((area) => {
  out.push(`<rect x="${legendX}" y="${legendY - 10}" width="14" height="14" fill="${colors[area.id] || '#e2e8f0'}" fill-opacity="0.45" stroke="${colors[area.id] || '#94a3b8'}"/>`)
  out.push(`<text x="${legendX + 22}" y="${legendY + 2}" fill="#0f172a" font-size="12" font-family="Arial">${esc(area.id)} ${esc(area.name)}</text>`)
  legendY += 20
})

legendY += 16
const eventLegend = [
  ['trainer', '训练师'],
  ['boss', 'Boss'],
  ['heal', '恢复点'],
  ['challenge', '连战点'],
  ['pickup', '可见道具'],
  ['secret', '隐藏点']
]
eventLegend.forEach(([type, label]) => {
  out.push(`<circle cx="${legendX + 7}" cy="${legendY - 4}" r="5" fill="${eventColors[type]}"/>`)
  out.push(`<text x="${legendX + 22}" y="${legendY}" fill="#0f172a" font-size="12" font-family="Arial">${label}</text>`)
  legendY += 20
})

out.push(`<text x="${legendX}" y="${height - margin - 34}" fill="#475569" font-size="11" font-family="Arial">Generated by scripts/render-map-preview.mjs</text>`)
out.push(`<text x="${legendX}" y="${height - margin - 16}" fill="#475569" font-size="11" font-family="Arial">Rule dots require npm run map:build first.</text>`)
out.push('</svg>')

fs.writeFileSync(outputPath, `${out.join('\n')}\n`)
console.log(`Wrote ${path.relative(repoRoot, outputPath)}`)
