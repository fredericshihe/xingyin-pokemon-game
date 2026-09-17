import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { MAP_CATALOG } from '../src/game/data/mapCatalog.js'
import { findEnvironmentSpawn } from '../src/game/environmentNavigation.js'
import { launchChrome, createPage, preparePage, navigateAndWait, evaluate, waitForSceneReady, sleep } from './audit-mobile-map-performance.mjs'

const base = process.argv[2] || 'http://127.0.0.1:4193'
const out = 'output/interior-navigation-browser'
await mkdir(out, { recursive: true })
const directions = [[0, 1, 'ArrowDown'], [1, 0, 'ArrowRight'], [0, -1, 'ArrowUp'], [-1, 0, 'ArrowLeft']]
const requested = process.argv[3]?.split(',')
const fixtures = []
for (const [id, { mapInfo: map }] of Object.entries(MAP_CATALOG)) {
  if (requested && !requested.includes(id)) continue
  const clear = (x, y) => [0, 12, 13, 15, 17].includes(map.mapGrid[y]?.[x]) && !map.environmentBlockedTiles.has(`${x},${y}`) && !map.runtimeEvents.some(e => Math.hypot(e.position.x - x, e.position.y - y) < 1.1)
  let fixture
  for (const blocked of map.environmentBlockedTiles) {
    const [x, y] = blocked.split(',').map(Number)
    for (const [dx, dy, key] of directions) {
      const spawn = [x - dx, y - dy]
      if (!clear(...spawn)) continue
      const escape = directions.find(([ex, ey]) => clear(spawn[0] + ex, spawn[1] + ey))
      if (escape) { fixture = { id, blocked: [x, y], spawn, key, escape }; break }
    }
    if (fixture) break
  }
  if (fixture) fixtures.push(fixture)
}
assert.ok(fixtures.length >= (requested ? requested.length : 10), 'Expected scenery collision fixtures across the map collection')
const browser = await launchChrome(), results = []
try {
  for (const fixture of fixtures) {
    const page = await createPage(browser.port), errors = []
    page.on('Runtime.exceptionThrown', ({ exceptionDetails }) => errors.push(exceptionDetails.text))
    try {
      await preparePage(page, { id: 'navigation', width: 1280, height: 900, dpr: 1, cpuThrottle: 1 }, false)
      const open = async spawn => {
        await navigateAndWait(page, `${base}/map-runtime-preview?map=${fixture.id}&spawn=${spawn.join(',')}&mapDebug=1&mapQuality=high`)
        await waitForSceneReady(page, 60000)
        await sleep(250)
      }
      const position = async () => (await evaluate(page, "document.querySelector('.map-runtime-preview__position span').textContent")).split(',').map(Number)
      const press = async key => {
        await evaluate(page, `window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true}))`)
        await sleep(140)
        await evaluate(page, `window.dispatchEvent(new KeyboardEvent('keyup',{key:${JSON.stringify(key)},bubbles:true}))`)
        await sleep(380)
      }
      await open(fixture.spawn)
      assert.deepEqual(await position(), fixture.spawn, `${fixture.id}: incorrect initial position`)
      await press(fixture.key)
      assert.deepEqual(await position(), fixture.spawn, `${fixture.id}: player entered a visible solid model`)
      await press(fixture.escape[2])
      assert.deepEqual(await position(), [fixture.spawn[0] + fixture.escape[0], fixture.spawn[1] + fixture.escape[1]], `${fixture.id}: nearby free terrain is blocked`)
      await open(fixture.blocked)
      const map = MAP_CATALOG[fixture.id].mapInfo
      const expected = findEnvironmentSpawn(map, { x: fixture.blocked[0], y: fixture.blocked[1] })
      assert.deepEqual(await position(), [expected.x, expected.y], `${fixture.id}: old saved position was not recovered`)
      const log = await evaluate(page, "document.querySelector('.map-runtime-preview__logs').textContent")
      assert.ok(!/Encounter |Entered /.test(log), `${fixture.id}: spawn recovery triggered gameplay`)
      assert.deepEqual(errors, [])
      const shot = await page.send('Page.captureScreenshot', { format: 'png' })
      await writeFile(`${out}/${fixture.id}.png`, Buffer.from(shot.data, 'base64'))
      results.push({ ...fixture, recovered: [expected.x, expected.y], ok: true })
      console.log(`${fixture.id}: collision, adjacent movement and saved-position recovery passed`)
    } finally { page.close() }
  }
} finally {
  await browser.close()
  await writeFile(`${out}/report.json`, JSON.stringify(results, null, 2) + '\n')
}
