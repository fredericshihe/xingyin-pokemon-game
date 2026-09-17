import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { launchChrome, createPage, preparePage, navigateAndWait, evaluate, sleep } from './audit-mobile-map-performance.mjs'
import { MOVES } from '../src/utils/gameData.js'

const base = process.argv[2] || 'http://127.0.0.1:4176'
const mode = process.argv[3] || 'gallery'
const featured = ['ember','flamethrower','fire_blast','watergun','hydropump','surf','icebeam','blizzard','thundershock','thunderbolt','thunder','razorleaf','leaf_storm','rock_slide','earthquake','shadowball','slash','close_combat','poison_gas','recover','swords_dance','dream_eater','solar_beam','hyper_beam']
const out = process.argv[4] || 'output/battle-vfx-v2'
await fs.mkdir(`${out}/screenshots`, {recursive:true})
const browser = await launchChrome()
const report = []
async function waitEffect(page, moveKey) {
  for (let attempt=0;attempt<100;attempt++) {
    const ready=await evaluate(page,`(() => {const c=document.querySelector('.battle-material-effect');return c?.dataset.renderedMove===${JSON.stringify(moveKey)} && c.dataset.ready==='true' && +c.dataset.frame>0})()`)
    if (ready) return
    await sleep(100)
  }
  throw new Error(`Effect did not become ready: ${moveKey}`)
}
try {
  const page = await createPage(browser.port)
  const errors = []
  page.on('Runtime.exceptionThrown', ({exceptionDetails}) => errors.push(exceptionDetails.exception?.description || exceptionDetails.text))
  page.on('Network.responseReceived', ({response}) => {if(response.status >= 400) errors.push(`${response.status} ${response.url}`)})
  await preparePage(page, {id:'vfx-desktop',width:1440,height:1000,dpr:1,cpuThrottle:1},false)
  if (mode === 'all') {
    await preparePage(page, {id:'all-moves-phone',width:390,height:844,dpr:2,cpuThrottle:1},false)
    await navigateAndWait(page, `${base}/battle-vfx-lab?move=ember&autoplay=1&frame=.48`)
    await waitEffect(page, 'ember')
    for (const moveKey of Object.keys(MOVES)) {
      await evaluate(page, `(() => {const select=document.querySelectorAll('select')[0];const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(select,${JSON.stringify(moveKey)});select.dispatchEvent(new Event('change',{bubbles:true}));})()`)
      await waitEffect(page, moveKey)
      const probe = await evaluate(page, `(() => { const c=document.querySelector('.battle-material-effect'); if(!c)return null;const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let pixels=0,hash=2166136261;for(let i=3;i<data.length;i+=4){if(data[i]>50)pixels++;hash=Math.imul(hash ^ data[i] ^ data[i-1],16777619)>>>0}return {move:c.dataset.move,draws:+c.dataset.draws,pixels,cssPixels:pixels/(c.width/c.clientWidth)**2,hash,ready:c.dataset.ready};})()`)
      assert.equal(probe?.move,moveKey);assert.ok(probe?.cssPixels>120,`${moveKey}: insufficient visible effect (${probe?.cssPixels} CSS pixels)`);assert.ok(probe.draws<=110)
      report.push(probe)
    }
    console.log(`Rendered all ${report.length} moves; no blank canvases.`)
    const duplicates=report.filter((r,i)=>report.findIndex(other=>other.hash===r.hash)!==i)
    assert.deepEqual(duplicates,[], 'Distinct recipes must also produce distinct rendered pixels')
  } else {
    const devices = mode === 'mobile' ? [{id:'ipad',width:768,height:1024,dpr:2,cpuThrottle:3},{id:'phone',width:390,height:844,dpr:2,cpuThrottle:3}] : [{id:'desktop',width:1440,height:1000,dpr:1,cpuThrottle:1}]
    for (const device of devices) {
      await preparePage(page, device, mode === 'mobile')
      for (const moveKey of mode === 'mobile' ? ['fire_blast','surf','blizzard','swords_dance'] : featured) {
        await navigateAndWait(page, `${base}/battle-vfx-lab?move=${moveKey}&autoplay=1&frame=.48&quality=${mode==='mobile'?'lite':'standard'}`)
        await waitEffect(page, moveKey)
        const probe=await evaluate(page,`(() => {const c=document.querySelector('.battle-material-effect');if(!c)return null;const r=document.querySelector('.battle-vfx-lab__stage').getBoundingClientRect(); const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let pixels=0;for(let i=3;i<data.length;i+=4)if(data[i]>12)pixels++;return {move:c.dataset.move,pixels,draws:+c.dataset.draws,rect:{x:r.x,y:r.y,width:r.width,height:r.height},overflow:document.documentElement.scrollWidth>innerWidth};})()`)
        assert.ok(probe?.pixels>30,`${moveKey}: blank`); assert.equal(probe.overflow,false)
        const shot=await page.send('Page.captureScreenshot',{format:'png'})
        const name=`${device.id}-${moveKey}`
        await fs.writeFile(`${out}/screenshots/${name}.png`,Buffer.from(shot.data,'base64'))
        report.push({device:device.id,dpr:device.dpr,...probe,name})
      }
    }
    const tiles=[];const columns=4
    for (const [i,row] of report.entries()) {
      const file=`${out}/screenshots/${row.name}.png`
      const rect=row.rect
      const dpr=row.dpr || 1
      const input=await sharp(file).extract({left:Math.round(rect.x*dpr),top:Math.round(rect.y*dpr),width:Math.floor(rect.width*dpr),height:Math.floor(rect.height*dpr)}).resize(400,235).png().toBuffer()
      tiles.push({input,left:i%columns*400,top:Math.floor(i/columns)*265})
      tiles.push({input:Buffer.from(`<svg width="400" height="30"><rect width="400" height="30" fill="#fafafa"/><text x="12" y="20" font-family="Arial" font-size="16">${row.name}</text></svg>`),left:i%columns*400,top:Math.floor(i/columns)*265+235})
    }
    await sharp({create:{width:1600,height:Math.ceil(report.length/columns)*265,channels:3,background:'#ddd'}}).composite(tiles).png().toFile(`${out}/${mode}-contact.png`)
  }
  assert.deepEqual(errors,[])
  page.close()
} finally {
  await browser.close()
  await fs.writeFile(`${out}/${mode}-report.json`,JSON.stringify(report,null,2))
}
