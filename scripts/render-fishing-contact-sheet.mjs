#!/usr/bin/env node
import sharp from 'sharp'
import { resolve, dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { FISHING_CATCHES, FISHING_BAITS, FISHING_ROD } from '../src/game/fishingCatalog.js'

const file = resolve(process.argv[2] || '/private/tmp/fishing-assets-contact.png')
const items = [...Object.values(FISHING_CATCHES), FISHING_ROD, ...Object.values(FISHING_BAITS).map((item) => ({ ...item, id: `bait_${item.id}` })), { id:'fish_basket', name:'鱼篓' }]
const columns = 8, cellWidth = 176, cellHeight = 187, margin = 22, header = 66
const width = columns * cellWidth + margin * 2
const height = Math.ceil(items.length / columns) * cellHeight + header + margin
const escape = (value) => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
const layers = [{ input: Buffer.from(`<svg width="${width}" height="${header}"><text x="26" y="32" font-family="sans-serif" font-size="23" font-weight="700" fill="#27474c">FISHING COLLECTION</text><text x="26" y="54" font-family="sans-serif" font-size="12" fill="#617e7b">40 species · 8 treasures · 3 curios · 7 equipment icons</text></svg>`), top:0, left:0 }]
for (let i=0;i<items.length;i++) {
  const item=items[i], left=margin+(i%columns)*cellWidth, top=header+Math.floor(i/columns)*cellHeight
  layers.push({ input: Buffer.from(`<svg width="170" height="181"><rect x="0" y="0" width="170" height="181" rx="14" fill="#ffffff"/><text x="85" y="162" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#244b50">${escape(item.name)}</text><text x="85" y="177" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#79908c">${item.id}</text></svg>`), top, left })
  const png=await sharp(resolve('public/assets/fishing',`${item.id}.svg`)).resize(144,144).png().toBuffer()
  layers.push({ input: png, left:left+13, top:top+3 })
}
await mkdir(dirname(file),{recursive:true})
await sharp({ create:{width,height,channels:4,background:'#edf3ef'} }).composite(layers).png().toFile(file)
console.log(file)
