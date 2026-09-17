import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { launchChrome, createPage, preparePage, navigateAndWait, evaluate, waitForSceneReady, sleep } from './audit-mobile-map-performance.mjs'

const baseUrl = (process.argv[2] || 'http://127.0.0.1:4173').replace(/\/$/, '')
const outDir = new URL('../output/character-redesign/runtime/', import.meta.url)
await mkdir(outDir, { recursive: true })
const browser = await launchChrome()
const page = await createPage(browser.port)
const errors = []
let heldRequest = null
let releasePlayer = false
page.on('Runtime.exceptionThrown', ({ exceptionDetails }) => errors.push(exceptionDetails?.exception?.description || exceptionDetails?.text))
page.on('Fetch.requestPaused', ({ requestId }) => {
  if (releasePlayer) void page.send('Fetch.continueRequest', { requestId })
  else heldRequest = requestId
})

try {
  await preparePage(page, { id: 'ipad_mini', width: 768, height: 1024, dpr: 2, cpuThrottle: 3 }, true)
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*player_child_adventurer.glb*', requestStage: 'Request' }] })
  const url = `${baseUrl}/map-runtime-preview?map=GodotMap&perf=1&mapQuality=lite`
  await navigateAndWait(page, url)
  const timeout = Date.now() + 30000
  while (!heldRequest && Date.now() < timeout) await sleep(100)
  assert.ok(heldRequest, 'Player GLB must be requested from the new asset collection')
  const pending = await evaluate(page, `({
    ready: document.querySelector('.three-map-host')?.dataset.sceneReady,
    blocked: document.querySelector('.dpad-up')?.disabled,
    loading: document.body.innerText.includes('正在加载角色与地图')
  })`)
  assert.equal(pending.ready, 'false', 'An empty canvas must never signal readiness')
  assert.equal(pending.blocked, true, 'Movement must wait for the player model')
  assert.equal(pending.loading, true, 'Show loading feedback while an asset is delayed')
  releasePlayer = true
  await page.send('Fetch.continueRequest', { requestId: heldRequest })
  await waitForSceneReady(page, 60000)
  const ready = await evaluate(page, `window.__THREE_LOW_POLY_MAP_PERF__`)
  assert.equal(ready.playerModel, 'xingyin-player')
  assert.ok(ready.characterModelKeys.includes('player_child_adventurer'))
  assert.ok(ready.drawCalls > 20, 'Readiness must include map geometry')
  assert.equal(await evaluate(page, `document.querySelector('.dpad-up').disabled`), false)

  // A fresh document must decode the same current models when HTTP cache is warm.
  const reloaded = page.waitEvent('Page.loadEventFired', 30000)
  await page.send('Page.reload', { ignoreCache: false })
  await reloaded
  await waitForSceneReady(page, 60000)
  const cached = await evaluate(page, `window.__THREE_LOW_POLY_MAP_PERF__`)
  assert.equal(cached.playerModel, 'xingyin-player')
  assert.equal(cached.worldReady, true)
  assert.deepEqual(cached.characterModelKeys.sort(), ready.characterModelKeys.sort())
  const screenshot = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(new URL('cached-map.png', outDir), Buffer.from(screenshot.data, 'base64'))
  assert.deepEqual(errors, [])
  const report = { delayedAssetGate: pending, initial: ready, warmReload: cached, errors }
  await writeFile(new URL('report.json', outDir), JSON.stringify(report, null, 2))
  console.log('Character runtime audit passed: delayed GLB blocks readiness/input, complete first frame unlocks, warm-cache reload keeps new player/NPCs, no browser exceptions.')
} finally {
  page.close()
  await browser.close()
}
