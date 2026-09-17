import { mkdir, writeFile } from 'node:fs/promises'
import { MAP_CHAIN, getMapInfo } from '../src/game/data/mapCatalog.js'
import { launchChrome, createPage, preparePage, navigateAndWait, evaluate, waitForSceneReady, sleep } from './audit-mobile-map-performance.mjs'

const base = process.argv[2] || 'http://127.0.0.1:4173'
const maps = process.argv[3] ? process.argv[3].split(',') : MAP_CHAIN
const focus = process.argv[4]
const out = process.env.MAP_REVIEW_OUT || 'output/map-environment-review/overview'
await mkdir(out, { recursive: true })
const browser = await launchChrome()
const report = []
try {
  for (const mapId of maps) {
    const page = await createPage(browser.port)
    const errors = []
    page.on('Runtime.exceptionThrown', ({ exceptionDetails }) => errors.push(exceptionDetails?.text))
    page.on('Network.responseReceived', ({ response }) => { if (response.status >= 400 && !/\/favicon\.ico(?:[?#]|$)/.test(response.url)) errors.push(`${response.status}: ${response.url}`) })
    try {
      await preparePage(page, { id: 'environment_review', width: 1440, height: 1080, dpr: 1, cpuThrottle: 1 }, false)
      await navigateAndWait(page, `${base}/map-runtime-preview?map=${mapId}&perf=1&mapQuality=high&${focus ? `focus=${encodeURIComponent(focus)}` : 'view=overview'}`)
      await waitForSceneReady(page, 60000).catch(async error => {
        console.error({ mapId, errors, page: await evaluate(page, '({text:document.body.innerText, url:location.href})') })
        throw error
      })
      await sleep(300)
      const probe = await evaluate(page, 'window.__THREE_LOW_POLY_MAP_PERF__')
      if (probe.mapName !== mapId) throw new Error(`Wrong map: ${probe.mapName}`)
      const screenshot = await page.send('Page.captureScreenshot', { format: 'png' })
      await writeFile(`${out}/${mapId}${focus ? '-detail' : ''}.png`, Buffer.from(screenshot.data, 'base64'))
      report.push({ mapId, name: getMapInfo(mapId).displayName, probe, errors })
      console.log(mapId, errors.length ? errors : 'rendered')
    } finally { page.close() }
  }
} finally {
  await browser.close()
  const reportName = process.argv[3] ? `report-${maps.join('_')}${focus ? '-detail' : ''}` : 'report'
  await writeFile(`${out}/${reportName}.json`, JSON.stringify(report, null, 2))
}
if (report.some(entry => entry.errors.length)) process.exitCode = 1
