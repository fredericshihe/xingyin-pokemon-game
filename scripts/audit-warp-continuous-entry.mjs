import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { launchChrome, createPage, preparePage, navigateAndWait, evaluate, waitForSceneReady, sleep } from './audit-mobile-map-performance.mjs'
import { withViteAuditServer } from './load-vite-module.mjs'

const base = process.env.BASE_URL || 'http://127.0.0.1:5175'
const out = process.env.WARP_REPORT_DIR || 'reports/model-refinement/continuous-warps'
const directions = ['up', 'right', 'down', 'left']
const steps = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const keyFor = direction => `Arrow${direction[0].toUpperCase()}${direction.slice(1)}`
const selectedCases = (process.env.WARP_CASE || '').split(',').filter(Boolean)
await mkdir(out, { recursive: true })
await withViteAuditServer(async ({ loadModule }) => {
  const { MAP_CATALOG } = await loadModule('/src/game/data/mapCatalog.js')
  const cases = Object.values(MAP_CATALOG).flatMap(({ id, mapInfo }) => mapInfo.runtimeEvents
    .filter(event => event.type === 'warp').map(warp => ({ id, mapInfo, warp })))
    .filter(({ warp }) => !selectedCases.length || selectedCases.some(id => warp.id.includes(id)))
  const results = []
  for (const [caseIndex, { id, mapInfo, warp }] of cases.entries()) {
    const target = MAP_CATALOG[warp.target.mapName].mapInfo
    const back = target.runtimeEvents.find(event => event.type === 'warp' && event.target?.mapName === id)
    const landing = back.target.position
    const direction = directions.find(d => landing.x + steps[d][0] === warp.position.x && landing.y + steps[d][1] === warp.position.y)
    const [dx, dy] = steps[direction]
    // Start a full step before the return landing, then HOLD through the exit.
    const start = { x: landing.x - dx, y: landing.y - dy }
    const chrome = await launchChrome()
    const page = await createPage(chrome.port)
    try {
      await preparePage(page, { id: 'continuous_warp', width: 1000, height: 820, dpr: 1, cpuThrottle: 1 }, false)
      await navigateAndWait(page, `${base}/map-runtime-preview?map=${id}&spawn=${start.x},${start.y}&perf=1`)
      await waitForSceneReady(page, 60000)
      await page.send('Page.bringToFront')
      await sleep(350)
      const read = () => evaluate(page, `(() => { const p=window.__THREE_LOW_POLY_MAP_PERF__; return p && {map:p.mapName,tile:p.playerTile,yaw:p.cameraYawTarget,actualYaw:p.cameraYaw,pitch:p.cameraPitch,distance:p.cameraDistance,fov:p.cameraFov,ready:p.worldReady,fading:!!document.querySelector('.map-warp-fade')} })()`)
      await evaluate(page, `(() => {
        window.__warpFrames = [];
        const frame = () => {
          const fade = document.querySelector('.map-warp-fade');
          const p = window.__THREE_LOW_POLY_MAP_PERF__;
          window.__warpFrames.push({time:performance.now(),map:p?.mapName,ready:p?.worldReady,phase:fade?.dataset.phase || null,opacity:fade ? Number(getComputedStyle(fade).opacity) : 0});
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      })()`)
      // Deliberately rotate by different quarter turns: every entry must retain
      // the manual angle, including destinations with a different entry facing.
      const quarterTurns = Number(process.env.WARP_CAMERA_TURNS) || (caseIndex % 3 + 1)
      for (let turn = 0; turn < quarterTurns; turn++) {
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'e', code: 'KeyE' })
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'e', code: 'KeyE' })
      }
      const expectedYaw = -quarterTurns * Math.PI / 2
      for (let retry = 0; retry < 100; retry++) {
        const p = await read()
        if (Math.abs(p.yaw - expectedYaw) < 0.001 && Math.abs(p.actualYaw - expectedYaw) < 0.001) break
        await sleep(100)
      }
      const initial = await read()
      assert.ok(Math.abs(initial.yaw - expectedYaw) < 0.001, 'Manual rotation must take effect before the warp test')
      const screenFor = (worldDirection, yaw) => directions[(directions.indexOf(worldDirection) + Math.round(yaw / (Math.PI / 2)) % 4 + 4) % 4]
      const input = process.env.WARP_INPUT || (caseIndex % 2 ? 'touch' : 'keyboard')
      const press = async (screen) => {
        if (input === 'touch') {
          const point = await evaluate(page, `(() => { const r=document.querySelector('.dpad-${screen}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2} })()`)
          await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{...point, id: 1}] })
        } else await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyFor(screen), code: keyFor(screen) })
      }
      const release = async screen => input === 'touch'
        ? page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        : page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyFor(screen), code: keyFor(screen) })
      const cross = async (event, worldDirection) => {
        const before = await read()
        const screen = screenFor(worldDirection, before.yaw)
        await press(screen)
        const deadline = Date.now() + 45000
        let arrival
        while (Date.now() < deadline) {
          await sleep(100)
          const p = await read()
          if (p?.map === event.target.mapName && p.ready && !p.fading) { arrival = p; break }
        }
        await release(screen)
        await sleep(350)
        return await read() || arrival
      }
      const atLanding = (p, event) => p?.map === event.target.mapName && p?.tile?.x === event.target.position.x && p?.tile?.y === event.target.position.y
      const sameYaw = p => p && Math.abs(p.yaw - initial.yaw) < 0.001 && Math.abs(p.actualYaw - initial.actualYaw) < 0.01 && p.pitch === initial.pitch && p.distance === initial.distance && p.fov === initial.fov
      let arrival = await cross(warp, direction)
      const crossings = [{ expected: warp.target, arrival, ok: atLanding(arrival, warp) && sameYaw(arrival) }]
      // Repeat the reported lake/shore loop in one mounted preview. Before
      // each return walk inward one tile, then hold back through the exit.
      if (warp.id === 'warp_shore_to_lake' && crossings[0].ok) {
        let next = back
        for (let n = 0; n < 4; n++) {
          const here = await read()
          const outward = directions.find(d => here.tile.x + steps[d][0] === next.position.x && here.tile.y + steps[d][1] === next.position.y)
          const inward = directions[(directions.indexOf(outward) + 2) % 4]
          const screen = screenFor(inward, here.yaw)
          await press(screen)
          await sleep(160)
          await release(screen)
          await sleep(700)
          const result = await cross(next, outward)
          crossings.push({ expected: next.target, arrival: result, ok: atLanding(result, next) && sameYaw(result) })
          if (!crossings.at(-1).ok) break
          next = next === back ? warp : back
        }
      }
      const pixels = await page.send('Page.captureScreenshot', { format: 'png' })
      await writeFile(`${out}/${warp.id}.png`, Buffer.from(pixels.data, 'base64'))
      const frames = await evaluate(page, 'window.__warpFrames')
      await writeFile(`${out}/${warp.id}-fade.json`, JSON.stringify(frames, null, 2))
      const departures = frames.filter(frame => frame.phase === 'departing')
      const reveals = frames.filter(frame => frame.phase === 'arriving')
      let lastMap = id
      const transitions = frames.filter(frame => {
        if (!frame.map || frame.map === lastMap) return false
        lastMap = frame.map
        return true
      })
      const fadeOk = departures.some(frame => frame.opacity > 0 && frame.opacity < 0.95)
        && reveals.some(frame => frame.opacity > 0 && frame.opacity < 0.95)
        && transitions.length === crossings.length
        && transitions.every(frame => frame.opacity > 0.98)
        && frames.filter(frame => frame.phase === 'loading').every(frame => frame.opacity === 1)
      const ok = crossings.every(crossing => crossing.ok) && fadeOk
      results.push({ id, warp: warp.id, start, input, initialYaw: initial.yaw, expected: warp.target, arrival, crossings, fadeOk, transitions, ok })
      console.log(`${ok ? 'PASS' : 'FAIL'} ${warp.id}: ${JSON.stringify(arrival)} expected ${JSON.stringify(warp.target.position)}`)
    } finally {
      page.close()
      await chrome.close()
      await writeFile(`${out}/report.json`, JSON.stringify(results, null, 2))
    }
  }
  assert.ok(results.every(result => result.ok), 'Continuous entry must retain paired landings and manual camera heading')
  console.log(`PASS: ${results.length} continuous exit approaches`)
})
