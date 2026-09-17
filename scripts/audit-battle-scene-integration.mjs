import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { launchChrome, createPage, preparePage, navigateAndWait, evaluate, sleep } from './audit-mobile-map-performance.mjs'

const base = process.argv[2] || 'http://127.0.0.1:4176'
const out = process.argv[3] || 'output/battle-vfx-v2'
await fs.mkdir(out, { recursive: true })
const report = { errors: [], cases: [] }
const browser = await launchChrome()
try {
  const page = await createPage(browser.port)
  page.on('Runtime.exceptionThrown', ({ exceptionDetails }) => report.errors.push(exceptionDetails.exception?.description || exceptionDetails.text))
  page.on('Network.responseReceived', ({ response }) => { if (response.status >= 400) report.errors.push(`${response.status} ${response.url}`) })
  await preparePage(page, { id: 'ipad', width: 768, height: 1024, dpr: 2, cpuThrottle: 3 }, true)
  await navigateAndWait(page, `${base}/battle-vfx-lab?scene=actual`)
  for (let i = 0; i < 100; i++) {
    if (await evaluate(page, `Boolean(document.querySelector('.battle-sprite-player img')?.complete && document.querySelector('.battle-sprite-enemy img')?.complete)`)) break
    await sleep(100)
  }
  assert.ok(await evaluate(page, `Boolean(document.querySelector('.battle-sprite-player img')?.naturalWidth)`), 'Real combatant sprite failed to load')
  for (const [move, side, phase] of [['flamethrower', 'player', 'hit'], ['hydropump', 'enemy', 'hit'], ['thunder', 'player', 'hit'], ['close_combat', 'enemy', 'hit'], ['drain_punch', 'player', 'hit'], ['recover', 'player', 'heal'], ['hyper_beam', 'player', 'charge'], ['surf', 'enemy', 'miss']]) {
    for (const [label, value] of [['预览技能', move], ['预览攻击方', side], ['预览阶段', phase]]) {
      await evaluate(page, `(() => { const el = document.querySelector('select[aria-label=${JSON.stringify(label)}]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('change', { bubbles: true })); })()`)
    }
    const sample = await evaluate(page, `new Promise((resolve, reject) => {
      let firstCanvas = null, firstFeedback = null, actorSeen = false, reactionSeen = false, maxPixels = 0, maxDraws = 0;
      const timeout = setTimeout(() => reject(new Error('Battle animation sampler timed out')), 9000);
      document.querySelector('[data-play-actual]').click();
      const deadline = performance.now() + 7000;
      function tick(now) {
        try {
        const host = document.querySelector('[data-battle-scene-preview]'), start = +host.dataset.started;
        const c = document.querySelector('.battle-material-effect'), feedback = document.querySelector('.battle-impact-feedback');
        if(c?.dataset.ready === 'true') {
          if(firstCanvas === null) firstCanvas = now - start;
          maxDraws = Math.max(maxDraws, +c.dataset.maxDraws || 0);
          if(maxPixels === 0 || +c.dataset.frame % 8 === 0) { const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let pixels=0; for(let i=3;i<d.length;i+=16)if(d[i]>12)pixels++; maxPixels=Math.max(maxPixels,pixels); }
        }
        if(feedback && firstFeedback === null) firstFeedback = now-start;
        actorSeen ||= Boolean(document.querySelector('.battle-actor-motion'));
        reactionSeen ||= Boolean(document.querySelector('.battle-hit-reaction'));
        if((firstCanvas !== null && !c) || now>deadline) {clearTimeout(timeout); return resolve({firstCanvas, firstFeedback, actorSeen, reactionSeen, maxPixels, maxDraws, cleaned:!c, expectedImpact:+host.dataset.impactDelay, duration:+host.dataset.duration, overflow:document.documentElement.scrollWidth>innerWidth});}
        requestAnimationFrame(tick);
        } catch(error) { clearTimeout(timeout); reject(error); }
      }
      requestAnimationFrame(tick);
    })`)
    report.cases.push({ move, side, phase, ...sample })
    await fs.writeFile(`${out}/battle-scene-integration.json`, JSON.stringify(report, null, 2))
    assert.ok(sample.firstCanvas !== null && sample.cleaned, `${move}: effect lifecycle`)
    assert.ok(sample.actorSeen && sample.maxPixels > 30, `${move}: missing actor/material animation`)
    assert.ok(sample.firstCanvas < sample.expectedImpact, `${move}: effect started after impact`)
    assert.ok(sample.maxDraws <= 110 && !sample.overflow, `${move}: budget/layout`)
    if (phase === 'hit') {
      assert.ok(sample.reactionSeen, `${move}: missing target reaction`)
      assert.ok(Math.abs(sample.firstFeedback - sample.expectedImpact) < 140, `${move}: feedback clock drift`)
    } else assert.equal(sample.firstFeedback, null, `${move}: fabricated damage`)
  }
  // Capture the actual HUD, actor sprites and material effect together.
  await evaluate(page, `(() => {for(const [label,value] of [['预览技能','surf'],['预览攻击方','player'],['预览阶段','hit']]){const el=document.querySelector('select[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('change',{bubbles:true}));}})()`)
  await sleep(50)
  await evaluate(page, `document.querySelector('[data-play-actual]').click()`)
  await sleep(750)
  const shot = await page.send('Page.captureScreenshot', { format: 'png' })
  await fs.writeFile(`${out}/actual-battle-ipad.png`, Buffer.from(shot.data, 'base64'))
  assert.deepEqual(report.errors, [])
  console.log(JSON.stringify(report, null, 2))
  page.close()
} finally {
  await browser.close()
  await fs.writeFile(`${out}/battle-scene-integration.json`, JSON.stringify(report, null, 2))
}
