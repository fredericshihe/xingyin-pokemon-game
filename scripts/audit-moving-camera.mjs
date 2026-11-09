import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { launchChrome, createPage, preparePage, navigateAndWait, evaluate, waitForSceneReady, sleep } from './audit-mobile-map-performance.mjs'

const base = process.env.BASE_URL || 'http://127.0.0.1:5175'
const out = 'reports/model-refinement/moving-camera'
await mkdir(out, { recursive: true })
const results = []
const chrome = await launchChrome()
const page = await createPage(chrome.port)
const read = () => evaluate(page, `(() => { const p=window.__THREE_LOW_POLY_MAP_PERF__; return {tile:p.playerTile,moving:p.moving,yaw:p.cameraYawTarget,actualYaw:p.cameraYaw,riding:document.querySelector('.map-bicycle-button')?.getAttribute('aria-pressed')==='true'} })()`)
const waitFor = async (predicate, message, timeout = 6000) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const p = await read()
    if (predicate(p)) return p
    await sleep(30)
  }
  throw new Error(`${message}: ${JSON.stringify(await read())}`)
}
const key = (type, code, value = code) => page.send('Input.dispatchKeyEvent', { type, code, key: value })
const point = selector => evaluate(page, `(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2} })()`)
const touch = (type, touchPoints) => page.send('Input.dispatchTouchEvent', { type, touchPoints })

try {
  await preparePage(page, { id: 'moving_camera', width: 1000, height: 820, dpr: 1, cpuThrottle: 1 }, false)
  for (const riding of [false, true]) for (const method of ['keyboard', 'touch-button', 'touch-drag']) {
    const result = { riding, method }
    try {
      // Wide, dry road clear of entrances, grass and event NPCs.
      await navigateAndWait(page, `${base}/map-runtime-preview?map=GodotMapV2_FarmTown&spawn=8,16&perf=1&bicycle=1`)
      await waitForSceneReady(page, 60000)
      await page.send('Page.bringToFront')
      if (riding) {
        const deadline = Date.now() + 15000
        while (await evaluate(page, `document.querySelector('.map-bicycle-button').disabled`)) {
          assert.ok(Date.now() < deadline, 'Bicycle must become ready')
          await sleep(100)
        }
        await key('keyDown', 'KeyR', 'r')
        await key('keyUp', 'KeyR', 'r')
        await waitFor(p => p.riding, 'Bicycle must engage')
      }
      const held = { ...await point('.dpad-right'), id: 1 }
      if (method === 'keyboard') await key('keyDown', 'ArrowRight')
      else await touch('touchStart', [held])
      result.before = await waitFor(p => p.moving && p.tile.x > 8, 'Movement must start')

      if (method === 'keyboard') {
        await key('keyDown', 'KeyE', 'e')
        await key('keyUp', 'KeyE', 'e')
      } else if (method === 'touch-button') {
        const rotate = { ...await point('[aria-label="镜头向右转"]'), id: 2 }
        await touch('touchStart', [held, rotate])
        await sleep(50)
        await touch('touchEnd', [rotate])
      } else {
        const bounds = await evaluate(page, `(() => {const r=document.querySelector('canvas.three-map-canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height} })()`)
        const drag = { x: bounds.x + bounds.width * 0.26, y: bounds.y + bounds.height * 0.35, id: 2 }
        await touch('touchStart', [held, drag])
        for (let i = 1; i <= 6; i++) {
          await touch('touchMove', [held, { ...drag, x: drag.x + bounds.width * 0.5 * i / 6 }])
          await sleep(20)
        }
        await touch('touchEnd', [{ ...drag, x: drag.x + bounds.width * 0.5 }])
      }
      result.rotated = await waitFor(p => Math.abs(p.yaw + Math.PI / 2) < 0.001, 'Camera must rotate while movement remains held')
      result.continued = await waitFor(p => p.tile.x >= result.rotated.tile.x + 2 && p.moving, 'Releasing the rotation finger must preserve forward movement')
      assert.equal(result.continued.tile.y, 16, 'Held movement must keep its original world direction')
      assert.equal(result.continued.riding, riding, 'Rotation must preserve walk/cycle mode')
      if (method === 'keyboard') await key('keyUp', 'ArrowRight')
      else await touch('touchEnd', [])
      result.stopped = await waitFor(p => !p.moving, 'Releasing the original direction must stop movement')
      await sleep(500)
      assert.deepEqual((await read()).tile, result.stopped.tile, 'Rotation must not leave a stuck direction')
      // With the camera rotated right, screen-down now means world-left.
      await key('keyDown', 'ArrowDown')
      result.nextPress = await waitFor(p => p.tile.x < result.stopped.tile.x, 'New direction must use the rotated camera')
      await key('keyUp', 'ArrowDown')
      assert.equal(result.nextPress.tile.y, 16)
      assert.equal(result.nextPress.yaw, result.rotated.yaw, 'Walking must not automatically rotate the camera')
      await waitFor(p => !p.moving, 'Next press must release')
      const pixels = await page.send('Page.captureScreenshot', { format: 'png' })
      await writeFile(`${out}/${riding ? 'cycle' : 'walk'}-${method}.png`, Buffer.from(pixels.data, 'base64'))
      result.ok = true
    } catch (error) {
      result.ok = false
      result.error = error.message
    } finally {
      await key('keyUp', 'ArrowRight')
      await key('keyUp', 'ArrowDown')
      await touch('touchEnd', []).catch(() => {})
      results.push(result)
      console.log(`${result.ok ? 'PASS' : 'FAIL'} ${riding ? 'cycle' : 'walk'} ${method}${result.error ? `: ${result.error}` : ''}`)
      await writeFile(`${out}/report.json`, JSON.stringify(results, null, 2))
    }
  }
} finally {
  page.close()
  await chrome.close()
}
assert.ok(results.every(result => result.ok), 'Camera rotation must work while walking/cycling with keyboard and multi-touch')
