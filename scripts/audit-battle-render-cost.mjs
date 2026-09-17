import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { launchChrome, createPage, preparePage, navigateAndWait, evaluate, sleep } from './audit-mobile-map-performance.mjs'

const base = process.argv[2] || 'http://127.0.0.1:4179'
const label = process.argv[3] || 'after'
const out = `output/battle-vfx-v4/${label}`
await fs.mkdir(out, { recursive: true })
const browser = await launchChrome()
const report = { label, errors: [], cases: [], trace: {} }
try {
  const page = await createPage(browser.port)
  if (process.argv[4] === 'software') await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,options){return get.call(this,type,type==='2d'&&this.classList.contains('battle-material-effect')?{...options,willReadFrequently:true}:options)}})()` })
  page.on('Runtime.exceptionThrown', ({ exceptionDetails: e }) => report.errors.push(e.exception?.description || e.text))
  await preparePage(page, { id: 'large-tablet', width: 1024, height: 1366, dpr: 2, cpuThrottle: 4 }, true)
  report.idleFps = await evaluate(page, `new Promise(resolve=>{let last=null;const a=[];function f(t){if(last!==null)a.push(t-last);last=t;if(a.length===60)resolve(1000/(a.reduce((x,y)=>x+y,0)/a.length));else requestAnimationFrame(f)}requestAnimationFrame(f)})`)
  await navigateAndWait(page, `${base}/battle-vfx-lab?scene=actual&move=tackle`)
  for (let i = 0; i < 100; i++) {
    if (await evaluate(page, `Boolean(document.querySelector('[data-play-actual]') && document.querySelector('.battle-sprite-player img')?.naturalWidth)`)) break
    await sleep(100)
  }
  const events = []
  page.on('Tracing.dataCollected', event => events.push(...event.value))
  await page.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink,cc,gpu', options: 'record-as-much-as-possible' })
  for (const move of ['tackle', 'flamethrower', 'surf', 'dragon_rush', 'scratch', 'outrage', 'hyper_beam', 'blizzard']) {
    await evaluate(page, `(()=>{const s=document.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(move)});s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await sleep(40)
    const sample = await evaluate(page, `new Promise(resolve=>{
      const frames=[];let last=null,seen=false,pixels=0,seeks=0,draw=0,lastIndex=0,repeated=0;
      const previousCanvas=window.__lastVfxCanvas;let sameCanvas=true;
      document.querySelector('[data-play-actual]').click();const end=performance.now()+7000;
      function tick(now){const c=document.querySelector('.battle-material-effect'),host=document.querySelector('[data-battle-scene-preview]');
        if(c?.dataset.ready==='true' && +c.dataset.frame>0){
          if(!seen){sameCanvas=!previousCanvas||previousCanvas===c;window.__lastVfxCanvas=c;}
          if(last!==null)frames.push(now-last);last=now;seen=true;pixels=c.width*c.height;
          if(+c.dataset.frame===lastIndex)repeated++;lastIndex=+c.dataset.frame;
          seeks=Math.max(seeks,+c.dataset.actorSeeks||0);draw=Math.max(draw,+c.dataset.maxDrawMs||0);
        }
        if((seen&&!c)||now>end){const a=frames.slice().sort((x,y)=>x-y);resolve({frames:frames.length,avgFps:1000/(frames.reduce((x,y)=>x+y,0)/frames.length),p95:a[Math.floor(a.length*.95)],worst:Math.max(...a),over25:a.filter(x=>x>25).length,over50:a.filter(x=>x>50).length,repeated,pixels,seeks,maxDrawMs:draw,sameCanvas,state:host.dataset.playbackState});return}
        requestAnimationFrame(tick)
      }requestAnimationFrame(tick)
    })`)
    report.cases.push({ move, ...sample })
    assert.equal(sample.state, 'complete', `${move}: unfinished session`)
    if (label !== 'before') try {
      assert.ok(sample.pixels <= 651500, `${move}: pixel budget`)
      assert.ok(sample.sameCanvas, `${move}: backing canvas recreated`)
      assert.ok(sample.seeks <= 8, `${move}: repeated animation seeks`)
      assert.ok(sample.avgFps >= Math.min(55, report.idleFps * .93), `${move}: relative throughput regression`)
      assert.ok(sample.p95 <= 1000 / report.idleFps * 1.15, `${move}: frame pacing regression`)
      assert.equal(sample.over50, 0, `${move}: visible stall`)
    } catch (error) { report.errors.push(error.message) }
    console.log(`${move}: ${sample.avgFps.toFixed(1)} FPS, p95 ${sample.p95.toFixed(1)}ms, GPU pixels ${sample.pixels}, animation syncs ${sample.seeks}`)
  }
  const complete = page.waitEvent('Tracing.tracingComplete', 20000)
  await page.send('Tracing.end'); await complete
  await fs.writeFile(`${out}/trace.json`, JSON.stringify({ traceEvents: events }))
  for (const name of ['GPUTask', 'RasterTask', 'RasterDecoderImpl::DoEndRasterCHROMIUM', 'UpdateLayoutTree', 'Paint', 'PrePaint', 'FireAnimationFrame']) {
    const values = events.filter(e => e.name === name && e.ph === 'X' && e.dur).map(e => e.dur / 1000).sort((a,b) => a-b)
    report.trace[name] = { count: values.length, totalMs: values.reduce((a,b) => a+b,0), p95: values[Math.floor(values.length*.95)] || 0, max: Math.max(0,...values) }
  }
  assert.deepEqual(report.errors, [])
  page.close()
} finally {
  await browser.close()
  await fs.writeFile(`${out}/render-cost.json`, JSON.stringify(report, null, 2))
}
