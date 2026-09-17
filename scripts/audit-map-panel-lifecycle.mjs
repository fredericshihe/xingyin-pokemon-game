import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { launchChrome, createPage, preparePage, navigateAndWait, evaluate, waitForSceneReady, sleep } from './audit-mobile-map-performance.mjs'
const base=process.argv[2] || 'http://127.0.0.1:4176'
const browser=await launchChrome()
const report={errors:[],cycles:[]}
try {
  const page=await createPage(browser.port)
  page.on('Runtime.exceptionThrown',({exceptionDetails})=>report.errors.push(exceptionDetails.exception?.description || exceptionDetails.text))
  await preparePage(page,{id:'ipad',width:768,height:1024,dpr:2,cpuThrottle:3},true)
  await navigateAndWait(page,`${base}/map-runtime-preview?map=GodotMap&perf=1`)
  await waitForSceneReady(page,60000)
  await evaluate(page,`window.__retainedCanvas=document.querySelector('canvas.three-map-canvas')`)
  for (let cycle=0;cycle<12;cycle++) {
    const opened=await evaluate(page,`(() => {const available=[...document.querySelectorAll('.map-action-grid button')];const button=available[${cycle}%available.length];if(!button)return false;button.click();return true})()`)
    assert.ok(opened,'No map panel navigation button found')
    await sleep(100)
    const hidden=await evaluate(page,`(() => {const c=document.querySelector('canvas.three-map-canvas');const input=document.querySelector('[role=dialog] input');input?.focus();const events=['keydown','keyup'].map(type=>new KeyboardEvent(type,{key:'ArrowLeft',bubbles:true,cancelable:true}));events.forEach(e=>input?.dispatchEvent(e));return {same:c===window.__retainedCanvas,hidden:c?.getBoundingClientRect().width===0,intercepted:events.some(e=>e.defaultPrevented),ready:JSON.parse(document.querySelector('[data-ready-transitions]').dataset.readyTransitions)};})()`)
    assert.ok(hidden.same&&hidden.hidden);assert.equal(hidden.intercepted,false);assert.deepEqual(hidden.ready,[false,true])
    await evaluate(page,`[...document.querySelectorAll('button')].find(b=>b.textContent==='关闭窗口').click()`)
    await sleep(140)
    const restored=await evaluate(page,`(() => {const c=document.querySelector('canvas.three-map-canvas');return {same:c===window.__retainedCanvas,visible:c?.getBoundingClientRect().width>0,loading:Boolean(document.querySelector('.three-map-recovery-overlay')),ready:JSON.parse(document.querySelector('[data-ready-transitions]').dataset.readyTransitions)}})()`)
    assert.ok(restored.same&&restored.visible);assert.equal(restored.loading,false);assert.deepEqual(restored.ready,[false,true])
    report.cycles.push({cycle,hidden,restored})
  }
  const shot=await page.send('Page.captureScreenshot',{format:'png'})
  await fs.writeFile('output/battle-vfx-v2/map-after-panels.png',Buffer.from(shot.data,'base64'))
  assert.deepEqual(report.errors,[])
  // Check the production screen consumes exactly the component exercised above.
  const source=await fs.readFile('src/components/Game/OriginalGame.jsx','utf8')
  assert.match(source,/<MapSceneLayer[\s\S]*?active=\{view === 'map'\}/)
  assert.doesNotMatch(source,/view === 'map' && \([\s\S]{0,120}<MapSceneLayer/)
  console.log('12 panel open/close cycles: same WebGL canvas, no readiness reset, no loading overlay, panel keyboard input preserved.')
  page.close()
} finally {
  await browser.close()
  await fs.writeFile('output/battle-vfx-v2/map-panel-lifecycle.json',JSON.stringify(report,null,2))
}
