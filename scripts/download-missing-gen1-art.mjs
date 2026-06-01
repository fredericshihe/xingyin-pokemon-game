import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import sharp from 'sharp'

const root = process.cwd()
const pokemonDir = path.join(root, 'public/assets/pokemon/official-artwork')
const POKEAPI_ART = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'

// 缺失的42只(13独角虫/132百变怪图片已存在)
const TARGET_DEX = [10,11,12,14,15,16,17,18,19,20,21,22,23,24,27,28,29,30,31,35,36,41,42,43,46,47,48,49,50,51,60,61,69,70,71,72,73,86,104,114,118,119]

const download = (url) => new Promise((resolve) => {
  const req = https.get(url, { timeout: 25000 }, (res) => {
    if (res.statusCode !== 200) { res.resume(); resolve({ ok:false, status:res.statusCode }); return }
    const chunks = []
    res.on('data', c => chunks.push(c))
    res.on('end', () => resolve({ ok:true, buffer: Buffer.concat(chunks) }))
  })
  req.on('timeout', () => req.destroy(new Error('timeout')))
  req.on('error', (e) => resolve({ ok:false, error:e.message }))
})

await fs.mkdir(pokemonDir, { recursive: true })
let ok=0, failed=[]
for (const dex of TARGET_DEX) {
  const pngDest = path.join(pokemonDir, `${dex}.png`)
  const webpDest = path.join(pokemonDir, `${dex}.webp`)
  const r = await download(`${POKEAPI_ART}/${dex}.png`)
  if (!r.ok) { failed.push({dex, ...r}); continue }
  await fs.writeFile(pngDest, r.buffer)
  try {
    await sharp(r.buffer).resize(475,475,{fit:'inside',withoutEnlargement:true}).webp({quality:82,effort:4}).toFile(webpDest)
    ok++
  } catch(e){ failed.push({dex, error:'webp:'+e.message}) }
}
console.log(JSON.stringify({ requested: TARGET_DEX.length, ok, failed: failed.length, failedSamples: failed.slice(0,8) }, null, 2))
