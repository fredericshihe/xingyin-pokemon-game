import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { launchChrome, createPage, preparePage, navigateAndWait, evaluate, sleep } from './audit-mobile-map-performance.mjs'

const base=process.argv[2] || 'http://127.0.0.1:4176'
const out=process.argv[3] || 'output/battle-vfx-v2'
await fs.mkdir(out,{recursive:true})
const report={errors:[],phases:[],animation:[]}
const browser=await launchChrome()
async function waitReady(page) {
  for(let i=0;i<100;i++) {
    if(await evaluate(page,`document.querySelector('.battle-material-effect')?.dataset.ready==='true'`)) return
    await sleep(100)
  }
  throw new Error('Material renderer unavailable')
}
try {
  const page=await createPage(browser.port)
  page.on('Runtime.exceptionThrown',({exceptionDetails})=>report.errors.push(exceptionDetails.exception?.description||exceptionDetails.text))
  page.on('Network.responseReceived',({response})=>{if(response.status>=400)report.errors.push(`${response.status} ${response.url}`)})
  await preparePage(page,{id:'ipad',width:768,height:1024,dpr:2,cpuThrottle:3},true)
  // Calibrate against the browser's current refresh cadence. The host can cap
  // even an empty page at 30 Hz; compare VFX cost with that measured baseline.
  report.idleFps=await evaluate(page,`new Promise(resolve=>{const frames=[];let last=null;function tick(now){if(last!==null)frames.push(now-last);last=now;if(frames.length===45)resolve(1000/(frames.reduce((a,b)=>a+b,0)/frames.length));else requestAnimationFrame(tick)}requestAnimationFrame(tick)})`)
  assert.ok(report.idleFps>=27,'Host refresh rate too low for a meaningful runtime audit')
  for(const [move,phase,side] of [['hyper_beam','charge','player'],['flamethrower','miss','player'],['recover','heal','enemy'],['absorb','drain','player'],['toxic','status','enemy'],['thunderbolt','secondary','player'],['transform','copy','player']]) {
    await navigateAndWait(page,`${base}/battle-vfx-lab?move=${move}&phase=${phase}&side=${side}&autoplay=1&frame=.48&quality=lite`)
    await waitReady(page)
    await sleep(100)
    const stats=await evaluate(page,`(() => {const c=document.querySelector('.battle-material-effect');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let left=0,right=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]>12){if(x<c.width/2)left++;else right++;}return {left,right,draws:+c.dataset.maxDraws,glyphs:document.querySelectorAll('.battle-vfx-icon,.battle-vfx-symbol').length};})()`)
    assert.ok(stats.left+stats.right>30);assert.equal(stats.glyphs,0);assert.ok(stats.draws<=70)
    if(phase==='charge')assert.ok(stats.left>stats.right,'Charge should stay with the caster')
    if(phase==='heal')assert.ok(stats.right>stats.left,'Enemy healing should stay with the enemy')
    report.phases.push({move,phase,side,...stats})
  }
  for(const move of ['flamethrower','surf','blizzard','thunder','leaf_storm','explosion','hyper_beam','close_combat']) {
    await navigateAndWait(page,`${base}/battle-vfx-lab?move=${move}&quality=lite`)
    const ready=await evaluate(page,`new Promise(resolve=>{const end=performance.now()+10000;const poll=()=>{const b=document.querySelector('.battle-vfx-lab__controls button');if(b)return resolve(true);if(performance.now()>end)return resolve(false);setTimeout(poll,50)};poll()})`)
    assert.ok(ready)
    const sample=await evaluate(page,`new Promise(resolve=>{
      const samples=[], hashes=new Set();let maxDraws=0,start=performance.now(),last=start,seen=false,lastFrame=0;
      const click=document.querySelector('.battle-vfx-lab__controls button');click.click();
      function tick(now){const c=document.querySelector('.battle-material-effect');if(c?.dataset.ready==='true'){seen=true;const frame=+c.dataset.frame;if(frame!==lastFrame){samples.push(now-last);last=now;lastFrame=frame}maxDraws=Math.max(maxDraws,+c.dataset.maxDraws||0);if(frame%6===0){const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let h=0;for(let i=3;i<d.length;i+=96)h=Math.imul(h^d[i],16777619);hashes.add(h)}}if((seen&&!c)||now-start>6000){const valid=samples.slice(2);resolve({seen,frames:valid.length,avgFps:valid.length?1000/(valid.reduce((a,b)=>a+b,0)/valid.length):0,worstFrame:Math.max(...valid),maxDraws,distinctFrames:hashes.size,cleaned:!c});return}requestAnimationFrame(tick)}requestAnimationFrame(tick)
    })`)
    assert.ok(sample.seen&&sample.cleaned,`${move}: lifecycle failure`)
    assert.ok(sample.distinctFrames>=3,`${move}: motion missing`)
    assert.ok(sample.maxDraws<=70,`${move}: budget exceeded`)
    assert.ok(sample.avgFps>=Math.min(45,report.idleFps*.85),`${move}: low simulated FPS ${sample.avgFps} (idle ${report.idleFps})`)
    report.animation.push({move,...sample})
  }
  await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await navigateAndWait(page,`${base}/battle-vfx-lab?move=hyper_beam&autoplay=1&frame=.48&quality=lite`)
  await waitReady(page);await sleep(100)
  report.reducedMotion=await evaluate(page,`({draws:+document.querySelector('.battle-material-effect').dataset.draws,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches})`)
  assert.ok(report.reducedMotion.reduced&&report.reducedMotion.draws<=6)
  await navigateAndWait(page,`${base}/battle-vfx-lab?move=hyper_beam&phase=charge&autoplay=1&frame=.48&quality=lite`)
  await waitReady(page);await sleep(100)
  report.reducedMotion.chargeDraws=await evaluate(page,`+document.querySelector('.battle-material-effect').dataset.draws`)
  assert.ok(report.reducedMotion.chargeDraws<=6)
  assert.deepEqual(report.errors,[])
  console.log(JSON.stringify(report,null,2))
  page.close()
}finally{
  await browser.close()
  await fs.writeFile(`${out}/runtime-report.json`,JSON.stringify(report,null,2))
}
