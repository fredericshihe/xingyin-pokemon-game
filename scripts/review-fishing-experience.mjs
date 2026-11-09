#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { launchChrome, createPage, preparePage, navigateAndWait, sleep } from './audit-mobile-map-performance.mjs'

const base = process.argv[2] || 'http://127.0.0.1:5182'
const out = path.resolve(process.argv[3] || 'output/fishing-experience')
await mkdir(out, { recursive: true })
const browser = await launchChrome(), results = [], errors = []
try {
  const page = await createPage(browser.port)
  page.on('Runtime.exceptionThrown', ({ exceptionDetails }) => errors.push(exceptionDetails.exception?.description || exceptionDetails.text))
  const read = async expression => {
    const result = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 30000 })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  const until = async expression => {
    for (let i = 0; i < 700; i++) {
      if (await read(`Boolean(${expression})`)) return
      await sleep(70)
    }
    throw new Error(`Timed out: ${expression}`)
  }
  const click = text => read(`(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(text)});
    if (!button || button.disabled) throw Error('Unavailable button'); button.click(); return true;
  })()`)
  const select = (label, value) => read(`(() => {
    const element = document.querySelector('select[aria-label=${JSON.stringify(label)}]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('change', {bubbles:true})); return true;
  })()`)
  const close = async () => {
    await read(`document.querySelector('.fishing-heading .fishing-icon-button').click()`)
    await until(`!document.querySelector('.fishing-hud')`)
  }
  const open = async () => {
    await until(`[...document.querySelectorAll('button')].some(button => button.textContent === '开始钓鱼' && !button.disabled)`)
    await click('开始钓鱼')
  }
  const screenshot = async name => {
    const response = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const bytes = Buffer.from(response.data, 'base64')
    const channels = await sharp(bytes).resize(80, 80).removeAlpha().raw().toBuffer()
    const colors = new Set()
    for (let i = 0; i < channels.length; i += 3) colors.add(channels.subarray(i, i + 3).toString('hex'))
    assert.ok(colors.size > 200, 'Scene should have actual rendered pixels')
    await writeFile(path.join(out, `${name}.png`), bytes)
    return colors.size
  }
  const hit = () => read(`new Promise((resolve, reject) => {
    const end = performance.now() + 12000;
    function tick() {
      const button = document.querySelector('.fishing-button--reel');
      const pointer = document.querySelector('.fishing-pointer'), target = document.querySelector('.fishing-target');
      if (button && !button.disabled && Math.abs(parseFloat(pointer.style.left) - parseFloat(target.style.left) - parseFloat(target.style.width) / 2) < 1.5) {
        button.click(); resolve(true); return;
      }
      if (performance.now() > end) { reject(Error('No hit opportunity')); return; }
      requestAnimationFrame(tick);
    } requestAnimationFrame(tick);
  })`)
  for (const device of [
    { id: 'desktop', width: 1280, height: 900, dpr: 1, cpuThrottle: 1 },
    { id: 'phone', width: 390, height: 844, dpr: 1, cpuThrottle: 4 },
  ]) {
    await preparePage(page, device, device.id === 'phone')
    await navigateAndWait(page, `${base}/fishing-preview?perf=1`)
    await until(`document.querySelector('.fishing-preview')`)
    for (const spotId of ['valley_pond', 'valley_shallows', 'lake_reeds', 'lake_deep', 'shore_dock', 'shipwreck_bay']) {
      await select('预览钓点', spotId)
      await open()
      await read(`[...document.querySelector('.fishing-hud').querySelectorAll('button')].find(button => button.textContent.startsWith('抛竿')).click()`)
      await until(`document.querySelector('[data-fishing-phase="waiting"]')`)
      await sleep(220)
      const a = await read(`window.__THREE_LOW_POLY_MAP_PERF__.fishing`)
      await sleep(150)
      const b = await read(`window.__THREE_LOW_POLY_MAP_PERF__.fishing`)
      assert.equal(a.visible, true)
      assert.notEqual(a.bobber.y, b.bobber.y, 'Float should move on real map frames')
      const framing = await read(`(() => {
        const debug = window.__THREE_LOW_POLY_MAP_PERF__, canvas = document.querySelector('canvas.three-map-canvas').getBoundingClientRect();
        const hud = document.querySelector('.fishing-card').getBoundingClientRect();
        return { fps: debug.avgFps, drawCalls: debug.drawCalls, textures: debug.textures,
          hudHeight: hud.height, floatY: canvas.top + (1 - debug.fishing.bobberNdc.y) * canvas.height / 2,
          hudTop: hud.top, overflow: document.documentElement.scrollWidth > innerWidth,
          pointerEvents: getComputedStyle(document.querySelector('.fishing-hud')).pointerEvents };
      })()`)
      assert.ok(Math.abs(b.bobberNdc.x) < .9 && Math.abs(b.bobberNdc.y) < .9 && b.bobberNdc.z < 1)
      assert.ok(framing.floatY < framing.hudTop - 20, 'HUD must leave the water and float visible')
      assert.ok(framing.hudHeight < 200 && !framing.overflow, JSON.stringify(framing))
      assert.equal(framing.pointerEvents, 'none')
      const pixelColors = await screenshot(`${device.id}-${spotId}-waiting`)
      results.push({ device: device.id, spotId, framing, pixelColors })
      await close()
      await until(`window.__THREE_LOW_POLY_MAP_PERF__.fishing.visible === false`)
    }
    await select('预览钓点', 'valley_pond')
    for (const catchId of ['c01', 'c04', 'c05', 't01', 'j01', 'u01', 'r01', 'e01', 'l01']) {
      await select('指定预览鱼获', catchId)
      await open()
      await read(`[...document.querySelector('.fishing-hud').querySelectorAll('button')].find(button => button.textContent.startsWith('抛竿')).click()`)
      await hit(); await until(`document.querySelector('[data-fishing-phase="result"]')`)
      await sleep(400)
      const a = await read(`window.__THREE_LOW_POLY_MAP_PERF__.fishing`)
      await sleep(190)
      const b = await read(`window.__THREE_LOW_POLY_MAP_PERF__.fishing`)
      assert.equal(b.fishVisible, true)
      assert.equal(b.textureReady, true, 'Species texture must render with solid 3D catch')
      assert.equal(b.celebrationVisible, true, 'Tier celebration must render in the real map')
      const styles={c01:'sparkle',c04:'sparkle',c05:'sparkle',j01:'sparkle',t01:'ripple',u01:'ripple',r01:'starburst',e01:'spiral',l01:'crown'}
      assert.equal(b.celebrationStyle,styles[catchId])
      assert.ok(b.celebrationParticles <= 48)
      assert.notDeepEqual(a.fishPosition, b.fishPosition, 'Catch should travel from water to player')
      assert.ok(Math.abs(b.fishNdc.x) < .9 && Math.abs(b.fishNdc.y) < .9 && b.fishNdc.z < 1)
      await screenshot(`${device.id}-${catchId}-landed`)
      results.push({ device: device.id, catchId, catchAnimation: b })
      await close()
    }
  }
  assert.deepEqual(errors, [])
  page.close()
} finally {
  await browser.close()
  await writeFile(path.join(out, 'report.json'), JSON.stringify({ results, errors }, null, 2))
}
console.log(`Fishing experience: ${results.length} rendered map/catch cases passed; ${out}`)
