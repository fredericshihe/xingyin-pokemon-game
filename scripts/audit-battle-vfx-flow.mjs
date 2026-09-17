import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { launchChrome, createPage, preparePage, navigateAndWait, evaluate, sleep } from './audit-mobile-map-performance.mjs'

const base = process.argv[2] || 'http://127.0.0.1:4176'
const label = process.argv[3] || 'after'
const out = process.argv[4] || `output/battle-vfx-v3/${label}`
await fs.mkdir(out, { recursive: true })
const report = { label, errors: [], cases: [] }
const browser = await launchChrome()
try {
  const page = await createPage(browser.port)
  page.on('Runtime.exceptionThrown', ({ exceptionDetails }) => report.errors.push(exceptionDetails.exception?.description || exceptionDetails.text))
  for (const device of [
    { id: 'tablet', width: 768, height: 1024, dpr: 2, cpuThrottle: 3 },
    { id: 'phone', width: 390, height: 844, dpr: 3, cpuThrottle: 4 },
  ]) {
    await preparePage(page, device, true)
    await navigateAndWait(page, `${base}/battle-vfx-lab?scene=actual&move=bodyslam`)
    for (let i = 0; i < 120; i++) {
      if (await evaluate(page, `Boolean(document.querySelector('[data-play-actual]') && document.querySelector('.battle-sprite-enemy img')?.naturalWidth)`)) break
      await sleep(100)
    }
    for (const move of ['bodyslam', 'dragon_rush', 'outrage', 'tackle', 'scratch', 'slam', 'dragonclaw', 'flamethrower', 'surf', 'blizzard', 'hyper_beam']) {
      await evaluate(page, `(() => {const select=document.querySelector('select[aria-label="预览技能"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(move)});select.dispatchEvent(new Event('change',{bubbles:true}));})()`)
      await sleep(40)
      // No canvas pixel reads or screenshots inside the timed playback.
      const sample = await evaluate(page, `new Promise((resolve,reject) => {
        const frames=[],longTasks=[];let previous=null,firstCanvas=null,firstFeedback=null,firstHp=null,hpProgress=null,seen=false,maxDraws=0,started=0,actorSeen=false,lastFrame=-1;
        const observer=new PerformanceObserver(list=>list.getEntries().forEach(e=>longTasks.push({start:e.startTime,duration:e.duration})));
        observer.observe({type:'longtask',buffered:false});
        const deadline=performance.now()+9000;
        document.querySelector('[data-play-actual]').click();
        function tick(now) {
          const host=document.querySelector('[data-battle-scene-preview]');started=+host.dataset.started;
          const canvas=document.querySelector('.battle-material-effect');
          if(canvas?.dataset.ready==='true' && +canvas.dataset.frame>lastFrame){
            if(firstCanvas===null)firstCanvas=now-started;
            if(previous!==null)frames.push(now-previous);
            previous=now;lastFrame=+canvas.dataset.frame;seen=true;
            maxDraws=Math.max(maxDraws,+canvas.dataset.maxDraws||0);
          }
          actorSeen ||= Boolean(document.querySelector('.battle-actor-motion'));
          if(document.querySelector('.battle-impact-feedback') && firstFeedback===null)firstFeedback=now-started;
          if(+host.dataset.enemyHp < +host.dataset.initialEnemyHp && firstHp===null){firstHp=now-started;hpProgress=Number(canvas?.dataset.elapsed)||0;}
          if((seen&&!canvas)||now>deadline){
            observer.disconnect();const sorted=frames.slice().sort((a,b)=>a-b);
            resolve({firstCanvas,firstFeedback,firstHp,hpProgress,playbackState:host.dataset.playbackState,actorSeen,frames:frames.length,avgFps:1000/(frames.reduce((a,b)=>a+b,0)/frames.length),p95:sorted[Math.floor(sorted.length*.95)]||0,worstFrame:Math.max(0,...frames),over50ms:frames.filter(t=>t>50).length,maxDraws,longTasks:longTasks.filter(e=>e.start>=started),duration:+host.dataset.duration,expectedImpact:+host.dataset.impactDelay,cleaned:!canvas,quality:document.querySelector('.anime-battle-bg')?.className});return;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      })`)
      report.cases.push({ device: device.id, move, ...sample })
      assert.ok(sample.cleaned && sample.actorSeen && sample.frames > 5, `${device.id}/${move}: playback missing`)
      if (label !== 'before') {
        assert.ok(sample.firstCanvas < sample.firstFeedback, `${move}: damage precedes visible playback`)
        assert.equal(sample.playbackState, 'complete', `${move}: gameplay did not finish the rendered session`)
        assert.ok(sample.hpProgress >= sample.expectedImpact, `${move}: HP advanced before the impact frame`)
        assert.ok(Math.abs(sample.firstHp - sample.firstFeedback) < 34, `${move}: feedback/HP clock mismatch`)
        assert.ok(sample.p95 <= 40, `${move}: animation p95 frame interval ${sample.p95}`)
      }
      console.log(`${device.id} ${move}: ${sample.avgFps.toFixed(1)} FPS, p95 ${sample.p95.toFixed(1)} ms, worst ${sample.worstFrame.toFixed(1)} ms`)
    }
  }
  if (label !== 'before') {
    await navigateAndWait(page, `${base}/battle-vfx-lab?scene=actual&move=dragon_rush`)
    for (let i=0;i<100;i++) { if(await evaluate(page, `Boolean(document.querySelector('[data-play-actual]'))`))break; await sleep(100) }
    report.stall = await evaluate(page, `new Promise(resolve=>{
      document.querySelector('[data-play-actual]').click();
      setTimeout(()=>{const until=performance.now()+280;while(performance.now()<until){}},90);
      const end=performance.now()+8000;
      function check(){const host=document.querySelector('[data-battle-scene-preview]'),c=document.querySelector('.battle-material-effect');
        if(+host.dataset.enemyHp < +host.dataset.initialEnemyHp)return resolve({impactElapsed:+c.dataset.elapsed,expectedImpact:+host.dataset.impactDelay,wallImpact:+host.dataset.impactAt-(+host.dataset.started)});
        if(performance.now()>end)return resolve(null);requestAnimationFrame(check);
      }requestAnimationFrame(check);
    })`)
    assert.ok(report.stall && report.stall.impactElapsed >= report.stall.expectedImpact)
    assert.ok(report.stall.wallImpact >= report.stall.expectedImpact + 160, 'A stalled frame consumed the attack before players could see it')
  }
  assert.deepEqual(report.errors, [])
  page.close()
} finally {
  await browser.close()
  await fs.writeFile(`${out}/flow-report.json`, JSON.stringify(report, null, 2))
}
