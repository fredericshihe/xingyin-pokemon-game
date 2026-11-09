import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { launchChrome, createPage, preparePage, navigateAndWait, evaluate, waitForSceneReady, sleep } from './audit-mobile-map-performance.mjs'
import { withViteAuditServer } from './load-vite-module.mjs'

await withViteAuditServer(async ({ loadModule }) => {
const { MAP_CHAIN, getMapInfo } = await loadModule('/src/game/data/mapCatalog.js')
const base = process.argv[2] || 'http://127.0.0.1:4173'
const maps = process.argv[3] ? process.argv[3].split(',') : MAP_CHAIN
const focus = process.argv[4]
const spawn = process.env.MAP_REVIEW_SPAWN
const bicycle = process.env.MAP_REVIEW_BICYCLE === '1'
const out = process.env.MAP_REVIEW_OUT || 'output/map-environment-review/overview'
const width = Number(process.env.MAP_REVIEW_WIDTH || 1440)
const height = Number(process.env.MAP_REVIEW_HEIGHT || 1080)
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
      await preparePage(page, { id: 'environment_review', width, height, dpr: 1, cpuThrottle: 1 }, false)
      const params = new URLSearchParams({ map: mapId, perf: '1', mapQuality: 'high' })
      if (spawn) params.set('spawn', spawn)
      else if (focus) params.set('focus', focus)
      else params.set('view', 'overview')
      if (bicycle) params.set('bicycle', '1')
      await navigateAndWait(page, `${base}/map-runtime-preview?${params}`)
      await waitForSceneReady(page, 60000).catch(async error => {
        console.error({ mapId, errors, page: await evaluate(page, '({text:document.body.innerText, url:location.href})') })
        throw error
      })
      await sleep(300)
      const probe = await evaluate(page, 'window.__THREE_LOW_POLY_MAP_PERF__')
      if (probe.mapName !== mapId) throw new Error(`Wrong map: ${probe.mapName}`)
      const screenshot = await page.send('Page.captureScreenshot', { format: 'png' })
      const pixels = Buffer.from(screenshot.data, 'base64')
      const { data: channels } = await sharp(pixels).resize(32, 32).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      const colors = new Set()
      for (let i = 0; i < channels.length; i += 3) colors.add(channels.subarray(i, i + 3).toString('hex'))
      if (colors.size < 24) throw new Error(`${mapId}: 3D screenshot is blank or nearly uniform (${colors.size} colors)`)
      await writeFile(`${out}/${mapId}${focus ? '-detail' : ''}.png`, pixels)
      report.push({ mapId, name: getMapInfo(mapId).displayName, viewport: { width, height }, sampledColors: colors.size, probe, errors })
      console.log(mapId, errors.length ? errors : 'rendered')
    } finally { page.close() }
  }
} finally {
  await browser.close()
  const reportName = process.argv[3] ? `report-${maps.join('_')}${focus ? '-detail' : ''}` : 'report'
  await writeFile(`${out}/${reportName}.json`, JSON.stringify(report, null, 2))
}
if (report.some(entry => entry.errors.length)) process.exitCode = 1
})
