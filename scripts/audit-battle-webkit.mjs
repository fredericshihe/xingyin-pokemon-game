import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const runtime = process.env.PLAYWRIGHT_MODULE || '/Users/shihe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
const { webkit } = await import(pathToFileURL(runtime).href)
const base = process.argv[2] || 'http://127.0.0.1:4179'
const out = process.argv[3] || 'output/battle-vfx-v4/webkit'
await fs.mkdir(out, { recursive: true })
const browser = await webkit.launch({ headless: true })
const report = { engine: 'Playwright WebKit on macOS; simulated tablet viewport, not physical iPad Safari', errors: [], cases: [] }
try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })
  const page = await context.newPage()
  page.on('pageerror', e => report.errors.push(e.message))
  await page.goto(`${base}/battle-vfx-lab?scene=actual&move=tackle`)
  await page.waitForSelector('[data-play-actual]')
  await page.waitForFunction(() => [...document.querySelectorAll('.battle-sprite-player img,.battle-sprite-enemy img')].every(img => img.naturalWidth > 0))
  const coldRuns = Math.max(0, Number(process.env.VFX_COLD_START_RUNS) || 0)
  const moves = [...Array(coldRuns).fill('tackle'),'tackle','double_kick','triple_kick','fury_attack','vinewhip','power_whip','blaze_kick','fire_punch','wing_attack','dragon_rush','outrage','flamethrower','surf','hyper_beam','bone_rush','bonemerang','wood_hammer','soft_boiled','swords_dance','dig','vice_grip']
  const cases = process.env.VFX_MAX_HITS_ONLY === '1' ? [] : moves.map((move,index) => ({move,side:'player',hits:'min',coldReload:index<coldRuns}))
  for (const side of ['player','enemy']) for (const move of ['bone_rush','triple_kick']) cases.push({move,side,hits:'max',coldReload:false})
  for (const {move,side,hits,coldReload} of cases) {
    if (coldReload) {
      await page.reload()
      await page.waitForSelector('[data-play-actual]')
      await page.waitForFunction(() => [...document.querySelectorAll('.battle-sprite-player img,.battle-sprite-enemy img')].every(img => img.naturalWidth > 0))
    }
    await page.selectOption('[aria-label="预览技能"]', move)
    await page.selectOption('[aria-label="预览攻击方"]', side)
    await page.selectOption('[aria-label="预览连击次数"]', hits)
    const sample = await page.evaluate(() => new Promise(resolve => {
      const times = [], gaps = []; let prev = null, seen = false, hp = null, feedback = null, maxSeeks = 0, pixels = 0, nativeMotion = false, firstFrameMs = null
      const oldCanvas = window.__webkitCanvas
      const feedbackSurface = document.querySelector('.battle-feedback-surface')
      let sameCanvas = true
      document.querySelector('[data-play-actual]').click()
      const deadline = performance.now() + 8000
      function tick(now) {
        const c = document.querySelector('.battle-material-effect'), host = document.querySelector('[data-battle-scene-preview]')
        // Include inter-hit preparation frames, so a continuous multi-hit run
        // is measured with one rAF stream instead of a gap between ready flags.
        if(seen && prev !== null) { times.push(now-prev); if(now-prev>50)gaps.push({ms:now-prev,elapsed:+c?.dataset.elapsed,frame:+c?.dataset.frame,completedHits:+host.dataset.completedHits,feedback:Boolean(document.querySelector('.battle-impact-feedback'))});prev=now }
        if(c?.dataset.ready === 'true' && +c.dataset.frame > 0) {
          if(!seen) { sameCanvas = !oldCanvas || oldCanvas === c; window.__webkitCanvas = c; firstFrameMs = now - Number(host.dataset.started) }
          seen = true
          prev = now; pixels = c.width*c.height; maxSeeks = Math.max(maxSeeks,+c.dataset.actorSeeks || 0)
          nativeMotion ||= [...document.querySelectorAll('.battle-sprite-player,.battle-sprite-enemy')].some(el => el.getAnimations().some(a => a.playState === 'running'))
          if(hp === null && +host.dataset.enemyHp < +host.dataset.initialEnemyHp) hp = +c.dataset.elapsed
          if(feedback === null && document.querySelector('.battle-impact-feedback')) feedback = +c.dataset.elapsed
        }
        if((seen && host.dataset.playbackState === 'complete') || now > deadline) {
          times.sort((a,b)=>a-b)
          resolve({ state:host.dataset.playbackState,hitCount:+host.dataset.hitCount,completedHits:+host.dataset.completedHits,firstFrameMs,pixels,maxSeeks,sameCanvas,sameFeedback:feedbackSurface===document.querySelector('.battle-feedback-surface'),nativeMotion,hp,feedback,gaps,impact:+host.dataset.impactDelay,
            frames:times.length,p95:times[Math.floor(times.length*.95)],worst:Math.max(0,...times),over50:times.filter(t=>t>50).length,avgFps:1000/(times.reduce((a,b)=>a+b,0)/times.length) })
        } else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }))
    report.cases.push({ move, side, hits, coldReload, ...sample })
    assert.equal(sample.state,'complete',`${move}: session did not finish`)
    assert.equal(sample.completedHits,sample.hitCount,`${move}: missing or extra hit callback`)
    assert.ok(sample.nativeMotion && sample.sameCanvas,`${move}: missing compositor animation or canvas replaced`)
    assert.ok(sample.pixels <= 651500 && sample.maxSeeks <= 8,`${move}: exceeded rendering budget`)
    assert.ok(sample.frames > 10 && sample.p95 < 42,`${move}: poor frame pacing`)
    assert.ok(sample.sameFeedback, `${move}: feedback layer replaced during impact`)
    assert.equal(sample.over50, 0, `${move}: visible animation stall`)
    if(sample.hp !== null) assert.ok(sample.hp >= sample.impact && Math.abs(sample.hp-sample.feedback) < 42,`${move}: damage/visual mismatch`)
    console.log(`${side}/${move}/${hits}: ${sample.avgFps.toFixed(1)} FPS; p95 ${sample.p95.toFixed(1)} ms; ${sample.state}`)
  }
  assert.deepEqual(report.errors,[])
} finally {
  await browser.close()
  await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2))
}
