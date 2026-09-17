import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import { launchChrome, createPage, preparePage, navigateAndWait, evaluate, sleep } from './audit-mobile-map-performance.mjs'

const base = process.argv[2] || 'http://127.0.0.1:4176'
const out = process.argv[3] || 'output/battle-vfx-v3/contact'
await fs.mkdir(out, { recursive: true })
const browser = await launchChrome()
const report = []
try {
  const page = await createPage(browser.port)
  for (const device of [{ id: 'phone', width: 390, height: 844, dpr: 2, cpuThrottle: 1 }, { id: 'tablet', width: 768, height: 1024, dpr: 1, cpuThrottle: 1 }]) {
    await preparePage(page, device, false)
    const tiles = []
    for (const [row, move] of ['bodyslam', 'dragon_rush', 'outrage', 'tackle', 'scratch', 'slam', 'dragonclaw'].entries()) {
      for (const [column, progress] of [.18, .43, .68].entries()) {
        await navigateAndWait(page, `${base}/battle-vfx-lab?scene=actual&move=${move}&frame=${progress}`)
        for (let i = 0; i < 100; i++) {
          if (await evaluate(page, `Boolean(document.querySelector('[data-play-actual]') && document.querySelector('.battle-sprite-enemy img')?.naturalWidth)`)) break
          await sleep(80)
        }
        await evaluate(page, `document.querySelector('[data-play-actual]').click()`)
        for (let i = 0; i < 100; i++) {
          if (await evaluate(page, `Number(document.querySelector('.battle-material-effect')?.dataset.frame)>0`)) break
          await sleep(50)
        }
        const sample = await evaluate(page, `(() => {
          const c=document.querySelector('.battle-material-effect'),r=c.getBoundingClientRect(),data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
          let visible=0;for(let i=3;i<data.length;i+=4)if(data[i]>50)visible++;
          return {visibleCssPixels:visible/(c.width/r.width)**2,rect:{x:r.x,y:r.y,width:r.width,height:r.height},draws:+c.dataset.draws};
        })()`)
        assert.ok(sample.visibleCssPixels > 200, `${device.id}/${move}/${progress}: insufficient visible material`)
        const shot = await page.send('Page.captureScreenshot', { format: 'png' })
        const file = `${out}/${device.id}-${move}-${progress}.png`
        await fs.writeFile(file, Buffer.from(shot.data, 'base64'))
        const r = sample.rect
        const left = Math.max(0, Math.round(r.x * device.dpr)), top = Math.max(0, Math.round(r.y * device.dpr))
        const tile = await sharp(file).extract({ left, top, width: Math.min(device.width * device.dpr - left, Math.floor(r.width * device.dpr)), height: Math.min(device.height * device.dpr - top, Math.floor(r.height * device.dpr)) }).resize(300, 350, { fit: 'contain', background: '#0b1829' }).toBuffer()
        tiles.push({ input: tile, left: column * 300, top: row * 378 })
        tiles.push({ input: Buffer.from(`<svg width="300" height="28"><rect width="300" height="28" fill="#fff"/><text x="8" y="20" font-size="14">${move} / ${progress}</text></svg>`), left: column * 300, top: row * 378 + 350 })
        report.push({ device: device.id, move, progress, ...sample })
      }
    }
    await sharp({ create: { width: 900, height: 7 * 378, channels: 3, background: '#fff' } }).composite(tiles).png().toFile(`${out}/${device.id}-sequence.png`)
  }
  page.close()
} finally {
  await browser.close()
  await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2))
}
