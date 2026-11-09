import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { launchChrome, createPage, preparePage, navigateAndWait, evaluate, sleep } from './audit-mobile-map-performance.mjs'
import { MOVES } from '../src/utils/gameData.js'
import { getMoveVfxRecipe } from '../src/utils/battleVfxRecipes.js'

const base=process.argv[2] || 'http://127.0.0.1:4181'
const out=process.argv[3] || 'output/battle-vfx-v5/all'
await fs.mkdir(`${out}/frames`,{recursive:true})
const keys=Object.keys(MOVES).sort((a,b)=>getMoveVfxRecipe(a,MOVES[a]).technique.localeCompare(getMoveVfxRecipe(b,MOVES[b]).technique)||a.localeCompare(b))
const frames=[.2,.46,.72], report=[], errors=[]
const browser=await launchChrome()
try {
  const page=await createPage(browser.port)
  page.on('Runtime.exceptionThrown',({exceptionDetails})=>errors.push(exceptionDetails.exception?.description || exceptionDetails.text))
  await preparePage(page,{id:'semantics-phone',width:390,height:844,dpr:2,cpuThrottle:1},false)
  for(const frame of frames) {
    await navigateAndWait(page,`${base}/battle-vfx-lab?move=tackle&autoplay=1&frame=${frame}`)
    for(let i=0;i<100;i++) {
      if(await evaluate(page,"Boolean(document.querySelector('select')?.options.length>300)"))break
      await sleep(100)
    }
    await evaluate(page,"document.querySelector('.battle-vfx-lab__move-title').style.visibility='hidden'")
    for(const key of keys) {
      await evaluate(page,`(()=>{const s=document.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(key)});s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
      let ready=false
      for(let i=0;i<80;i++) {
        ready=await evaluate(page,`(()=>{const c=document.querySelector('.battle-material-effect');return c?.dataset.renderedMove===${JSON.stringify(key)} && c.dataset.ready==='true' && +c.dataset.frame>0})()`)
        if(ready)break
        await sleep(50)
      }
      assert.ok(ready,key)
      const sample=await evaluate(page,`(()=>{const c=document.querySelector('.battle-material-effect'),r=document.querySelector('.battle-vfx-lab__stage').getBoundingClientRect(),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let pixels=0;for(let i=3;i<d.length;i+=4)if(d[i]>50)pixels++;return {pixels:pixels/(c.width/c.clientWidth)**2,draws:+c.dataset.draws,rect:{x:r.x,y:r.y,width:r.width,height:r.height}}})()`)
      assert.ok(sample.draws<=110,`${key}: draw budget exceeded`)
      if(frame===.46)assert.ok(sample.pixels>120,`${key}: insufficient visible pixels ${sample.pixels}`)
      const shot=await page.send('Page.captureScreenshot',{format:'png'})
      const r=sample.rect
      await sharp(Buffer.from(shot.data,'base64')).extract({left:Math.round(r.x*2),top:Math.round(r.y*2),width:Math.floor(r.width*2),height:Math.floor(r.height*2)}).resize(210,220,{fit:'contain',background:'#0c192a'}).png().toFile(`${out}/frames/${key}-${frame}.png`)
      report.push({key,frame,pixels:sample.pixels,draws:sample.draws})
    }
    console.log(`${keys.length} moves captured at ${frame}`)
  }
  for(let start=0;start<keys.length;start+=12) {
    const group=keys.slice(start,start+12),tiles=[]
    for(const [i,key] of group.entries()) {
      const left=i%2*630,top=Math.floor(i/2)*245
      for(const [j,frame] of frames.entries())tiles.push({input:`${out}/frames/${key}-${frame}.png`,left:left+j*210,top})
      tiles.push({input:Buffer.from(`<svg width="630" height="25"><rect width="630" height="25" fill="#f4f1e9"/><text x="8" y="18" font-size="15">${key} / ${getMoveVfxRecipe(key,MOVES[key]).technique} — .20 / .46 / .72</text></svg>`),left,top:top+220})
    }
    await sharp({create:{width:1260,height:Math.ceil(group.length/2)*245,channels:3,background:'#fff'}}).composite(tiles).png().toFile(`${out}/sheet-${String(start/12+1).padStart(2,'0')}.png`)
  }
  await fs.writeFile(`${out}/index.html`,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>322 招式分阶段验收</title><style>body{margin:24px;background:#102031;color:#eef4fa;font:15px system-ui}header{position:sticky;top:0;padding:16px;background:#102031;z-index:1}input{padding:12px;width:min(80%,500px);border-radius:8px;border:1px solid #607080}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px}article{background:#1c3043;border-radius:12px;padding:15px}article div{display:flex}img{width:33.333%;object-fit:contain}p{color:#c1d5e5;line-height:1.7}small{color:#85a2ba}</style><header><h1>322 招式分阶段验收</h1><p>起手 20% · 命中 46% · 收尾 72%。静帧用于核对材料与落点；时序和连击另有正式场景测试。</p><input aria-label="搜索招式" placeholder="搜索中文名称、英文键或动作"></header><main>${keys.map(key=>{const r=getMoveVfxRecipe(key,MOVES[key]);return `<article><h2>${MOVES[key].name}</h2><small>${key} · ${r.technique} · ${r.motion}</small><p>${r.direction}</p><div>${frames.map(f=>`<img loading="lazy" src="frames/${key}-${f}.png" alt="${MOVES[key].name} ${f}">`).join('')}</div></article>`}).join('')}</main><script>document.querySelector('input').addEventListener('input',e=>{const q=e.target.value.toLowerCase();for(const card of document.querySelectorAll('article'))card.hidden=!card.textContent.toLowerCase().includes(q)})</script></html>`)
  assert.deepEqual(errors,[])
  page.close()
} finally {
  await browser.close()
  await fs.writeFile(`${out}/report.json`,JSON.stringify({frames,report,errors},null,2))
}
