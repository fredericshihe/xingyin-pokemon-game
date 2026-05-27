#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAP_CATALOG, MAP_CHAIN } from '../src/game/data/mapCatalog.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..')

const DEFAULT_DEVICES = [
  { id: 'iphone_se', label: 'iPhone SE 375x667 DPR2 CPUx4', width: 375, height: 667, dpr: 2, cpuThrottle: 4 },
  { id: 'iphone_14', label: 'iPhone 14 390x844 DPR3 CPUx4', width: 390, height: 844, dpr: 3, cpuThrottle: 4 },
  { id: 'android_mid', label: 'Android Mid 412x915 DPR2.625 CPUx6', width: 412, height: 915, dpr: 2.625, cpuThrottle: 6 },
  { id: 'ipad_mini', label: 'iPad Mini 768x1024 DPR2 CPUx3', width: 768, height: 1024, dpr: 2, cpuThrottle: 3 }
]

const REGION_MAPS = MAP_CHAIN.filter((mapId) => mapId !== 'GodotMap')

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:4173',
    durationMs: 5000,
    warmupMs: 1800,
    mapSet: 'all',
    maps: null,
    devices: null,
    cpuThrottle: true,
    outDir: path.join(PROJECT_ROOT, 'reports', 'mobile-map-performance')
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const [flag, inlineValue] = arg.split('=')
    const readValue = () => inlineValue ?? argv[++i]

    if (flag === '--base-url') args.baseUrl = readValue()
    else if (flag === '--duration-ms') args.durationMs = Number(readValue())
    else if (flag === '--warmup-ms') args.warmupMs = Number(readValue())
    else if (flag === '--map-set') args.mapSet = readValue()
    else if (flag === '--maps') args.maps = readValue().split(',').map((value) => value.trim()).filter(Boolean)
    else if (flag === '--devices') args.devices = readValue().split(',').map((value) => value.trim()).filter(Boolean)
    else if (flag === '--out-dir') args.outDir = path.resolve(PROJECT_ROOT, readValue())
    else if (flag === '--no-cpu-throttle') args.cpuThrottle = false
    else if (flag === '--help' || flag === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  if (!Number.isFinite(args.durationMs) || args.durationMs < 1000) args.durationMs = 5000
  if (!Number.isFinite(args.warmupMs) || args.warmupMs < 0) args.warmupMs = 1800
  return args
}

function printHelp() {
  console.log(`Usage:
  node scripts/audit-mobile-map-performance.mjs [options]

Options:
  --base-url URL          Built app URL. Default: http://127.0.0.1:4173
  --duration-ms N         Frame sample duration per map/device. Default: 5000
  --warmup-ms N           Wait after scene is ready before sampling. Default: 1800
  --map-set all|regions   all includes starter + 8 region maps. regions tests only the 8 region maps.
  --maps a,b,c            Explicit comma-separated map ids.
  --devices a,b           Device ids: ${DEFAULT_DEVICES.map((device) => device.id).join(', ')}
  --no-cpu-throttle       Disable synthetic mobile CPU throttling.
  --out-dir DIR           Report output directory. Default: reports/mobile-map-performance
`)
}

function selectMaps(args) {
  if (args.maps?.length) return args.maps
  if (args.mapSet === 'regions') return REGION_MAPS
  return MAP_CHAIN
}

function selectDevices(args) {
  if (!args.devices?.length) return DEFAULT_DEVICES
  const requested = new Set(args.devices)
  return DEFAULT_DEVICES.filter((device) => requested.has(device.id))
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean)
  return candidates.find((candidate) => existsSync(candidate))
}

async function waitForFile(filePath, timeoutMs = 10000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (existsSync(filePath)) return readFile(filePath, 'utf8')
    await sleep(80)
  }
  throw new Error(`Timed out waiting for ${filePath}`)
}

async function launchChrome() {
  const chromePath = findChromeExecutable()
  if (!chromePath) {
    throw new Error('Google Chrome/Chromium was not found. Set CHROME_PATH to a Chrome executable.')
  }

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'pokemon-map-perf-chrome-'))
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-popup-blocking',
    '--disable-sync',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const portText = await waitForFile(path.join(userDataDir, 'DevToolsActivePort'))
  const port = Number(portText.split('\n')[0])
  if (!Number.isFinite(port)) throw new Error(`Invalid DevToolsActivePort: ${portText}`)

  return {
    port,
    async close() {
      chrome.kill('SIGTERM')
      await rm(userDataDir, { recursive: true, force: true })
    }
  }
}

async function createPage(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
  if (!res.ok) throw new Error(`Failed to create Chrome tab: ${res.status}`)
  const target = await res.json()
  return new CDPSession(target.webSocketDebuggerUrl)
}

class CDPSession {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })
    this.ws.addEventListener('message', (event) => this.handleMessage(event))
  }

  handleMessage(event) {
    const message = JSON.parse(event.data)
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id)
      this.pending.delete(message.id)
      if (message.error) reject(new Error(`${message.error.message}: ${message.error.data || ''}`))
      else resolve(message.result)
      return
    }
    if (message.method) {
      const listeners = this.listeners.get(message.method)
      if (listeners) listeners.forEach((listener) => listener(message.params || {}))
    }
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set())
    this.listeners.get(method).add(listener)
    return () => this.listeners.get(method)?.delete(listener)
  }

  waitEvent(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`Timed out waiting for ${method}`))
      }, timeoutMs)
      const cleanup = this.on(method, (params) => {
        clearTimeout(timer)
        cleanup()
        resolve(params)
      })
    })
  }

  async send(method, params = {}) {
    await this.ready
    const id = this.nextId++
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
    this.ws.send(JSON.stringify({ id, method, params }))
    return promise
  }

  close() {
    this.ws.close()
  }
}

async function preparePage(page, device, useCpuThrottle) {
  await page.send('Page.enable')
  await page.send('Runtime.enable')
  await page.send('Log.enable')
  await page.send('Network.enable')
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: device.width,
    height: device.height,
    deviceScaleFactor: device.dpr,
    mobile: true,
    screenWidth: device.width,
    screenHeight: device.height
  })
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await page.send('Emulation.setUserAgentOverride', {
    userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 ${device.id}`
  })
  await page.send('Emulation.setCPUThrottlingRate', { rate: useCpuThrottle ? device.cpuThrottle : 1 })
}

async function navigateAndWait(page, url) {
  const loadPromise = page.waitEvent('Page.loadEventFired', 20000).catch(() => null)
  await page.send('Page.navigate', { url })
  await loadPromise
}

async function evaluate(page, expression, timeoutMs = 30000) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: timeoutMs
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed')
  }
  return result.result?.value
}

async function waitForSceneReady(page, timeoutMs = 25000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const value = await evaluate(page, `(() => {
      const canvas = document.querySelector('canvas.three-map-canvas')
      return {
        ready: Boolean(canvas && window.__THREE_LOW_POLY_MAP_PERF__),
        now: performance.now(),
        title: document.title,
        bodyText: document.body?.innerText?.slice(0, 160) || ''
      }
    })()`)
    if (value?.ready) return value.now
    await sleep(180)
  }
  throw new Error('Map canvas/performance probe did not become ready')
}

function buildMeasureExpression(durationMs) {
  return `new Promise((resolve) => {
    const durationMs = ${JSON.stringify(durationMs)};
    const frames = [];
    const longTasks = [];
    const keyPlan = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    let keyIndex = 0;
    let last = performance.now();
    let stopped = false;
    let observer = null;

    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch (error) {}

    function pulseMovement() {
      const key = keyPlan[keyIndex % keyPlan.length];
      keyIndex += 1;
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      window.setTimeout(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
      }, 640);
    }

    const movementTimer = window.setInterval(pulseMovement, 760);
    pulseMovement();

    function tick(now) {
      frames.push(now - last);
      last = now;
      if (!stopped) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    window.setTimeout(() => {
      stopped = true;
      window.clearInterval(movementTimer);
      for (const key of keyPlan) {
        window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
      }
      observer?.disconnect?.();

      const samples = frames.slice(1).filter((value) => Number.isFinite(value) && value >= 0);
      const sorted = [...samples].sort((a, b) => a - b);
      const sum = samples.reduce((total, value) => total + value, 0);
      const percentile = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))] : null;
      const averageFrameMs = samples.length ? sum / samples.length : null;
      const p90FrameMs = percentile(0.9);
      const p95FrameMs = percentile(0.95);
      const p99FrameMs = percentile(0.99);
      const worstFrameMs = sorted.length ? sorted[sorted.length - 1] : null;
      const resources = performance.getEntriesByType('resource');
      const assetResources = resources.filter((entry) => /\\/assets\\/3d\\//.test(entry.name));
      const transferSize = resources.reduce((total, entry) => total + (entry.transferSize || 0), 0);
      const assetTransferSize = assetResources.reduce((total, entry) => total + (entry.transferSize || 0), 0);
      const navigation = performance.getEntriesByType('navigation')[0] || null;
      const perfProbe = window.__THREE_LOW_POLY_MAP_PERF__ || null;

      resolve({
        sampleCount: samples.length,
        averageFrameMs,
        avgFps: averageFrameMs ? 1000 / averageFrameMs : null,
        p10Fps: p90FrameMs ? 1000 / p90FrameMs : null,
        p5Fps: p95FrameMs ? 1000 / p95FrameMs : null,
        p1Fps: p99FrameMs ? 1000 / p99FrameMs : null,
        p90FrameMs,
        p95FrameMs,
        p99FrameMs,
        worstFrameMs,
        framesOver33ms: samples.filter((value) => value > 33.4).length,
        framesOver50ms: samples.filter((value) => value > 50).length,
        longTaskCount: longTasks.length,
        longTaskTotalMs: longTasks.reduce((total, entry) => total + entry.duration, 0),
        longTaskMaxMs: longTasks.reduce((max, entry) => Math.max(max, entry.duration), 0),
        readyAtMs: performance.now() - durationMs,
        resourceCount: resources.length,
        assetResourceCount: assetResources.length,
        transferSize,
        assetTransferSize,
        navigation: navigation ? {
          domContentLoaded: navigation.domContentLoadedEventEnd,
          load: navigation.loadEventEnd,
          transferSize: navigation.transferSize || 0
        } : null,
        heap: performance.memory ? {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
        } : null,
        perfProbe
      });
    }, durationMs);
  })`
}

function classify(result) {
  if (result.error) return 'FAIL'
  if (Array.isArray(result.assetFailures) && result.assetFailures.length > 0) return 'FAIL'
  if (Array.isArray(result.browserErrors) && result.browserErrors.length > 0) return 'FAIL'
  if (result.avgFps == null || result.p10Fps == null) return 'FAIL'
  if (result.avgFps < 24 || result.p10Fps < 15 || result.framesOver50ms > 12 || result.longTaskCount > 8) return 'FAIL'
  if (result.avgFps < 45 || result.p10Fps < 28 || result.framesOver50ms > 0 || result.longTaskCount > 0 || result.readyMs > 4500) return 'WARN'
  return 'PASS'
}

function fmt(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-'
}

function bytesToKb(value) {
  return Number.isFinite(value) ? `${Math.round(value / 1024)} KB` : '-'
}

async function runBenchmark(args) {
  const maps = selectMaps(args)
  const devices = selectDevices(args)
  const invalidMaps = maps.filter((mapId) => !MAP_CATALOG[mapId])
  if (invalidMaps.length > 0) throw new Error(`Unknown map id(s): ${invalidMaps.join(', ')}`)
  if (devices.length === 0) throw new Error('No devices selected')

  const chrome = await launchChrome()
  const results = []

  try {
    for (const device of devices) {
      const page = await createPage(chrome.port)
      const browserErrors = []
      const networkFailures = []
      const assetFailures = []
      page.on('Runtime.exceptionThrown', (event) => {
        const details = event.exceptionDetails
        browserErrors.push(details?.text || details?.exception?.description || 'Runtime exception')
      })
      page.on('Log.entryAdded', (event) => {
        const entry = event.entry
        if (entry?.level === 'error' && !/^Failed to load resource\b/.test(entry.text || '')) {
          browserErrors.push(entry.text)
        }
      })
      page.on('Network.responseReceived', (event) => {
        const response = event.response
        if (!response || response.status < 400) return
        if (/\/favicon\.ico(?:[?#]|$)/.test(response.url)) return
        const failure = {
          status: response.status,
          type: event.type,
          url: response.url
        }
        networkFailures.push(failure)
        if (/\/assets\/(?:3d|pokemon|characters)\//.test(response.url)) {
          assetFailures.push(failure)
        }
      })

      await preparePage(page, device, args.cpuThrottle)

      for (const mapId of maps) {
        const mapEntry = MAP_CATALOG[mapId]
        const url = `${args.baseUrl.replace(/\/$/, '')}/map-runtime-preview?map=${encodeURIComponent(mapId)}&perf=1`
        browserErrors.length = 0
        networkFailures.length = 0
        assetFailures.length = 0
        const started = Date.now()
        try {
          await navigateAndWait(page, url)
          const readyAtMs = await waitForSceneReady(page)
          await sleep(args.warmupMs)
          const measured = await evaluate(page, buildMeasureExpression(args.durationMs), args.durationMs + 10000)
          const result = {
            mapId,
            mapName: mapEntry.config.displayName,
            deviceId: device.id,
            deviceLabel: device.label,
            width: device.width,
            height: device.height,
            dpr: device.dpr,
            cpuThrottle: args.cpuThrottle ? device.cpuThrottle : 1,
            readyMs: readyAtMs,
            wallMs: Date.now() - started,
            browserErrors: [...browserErrors],
            networkFailures: [...networkFailures],
            assetFailures: [...assetFailures],
            ...measured
          }
          result.status = classify(result)
          results.push(result)
          console.log(`${result.status.padEnd(4)} ${device.id.padEnd(12)} ${mapId.padEnd(26)} avg=${fmt(result.avgFps)} p10=${fmt(result.p10Fps)} long=${result.longTaskCount} calls=${result.perfProbe?.drawCalls ?? '-'}`)
        } catch (error) {
          const result = {
            mapId,
            mapName: mapEntry.config.displayName,
            deviceId: device.id,
            deviceLabel: device.label,
            width: device.width,
            height: device.height,
            dpr: device.dpr,
            cpuThrottle: args.cpuThrottle ? device.cpuThrottle : 1,
            error: error.message,
            browserErrors: [...browserErrors],
            networkFailures: [...networkFailures],
            assetFailures: [...assetFailures],
            status: 'FAIL'
          }
          results.push(result)
          console.log(`${result.status.padEnd(4)} ${device.id.padEnd(12)} ${mapId.padEnd(26)} ${error.message}`)
        }
      }

      page.close()
    }
  } finally {
    await chrome.close()
  }

  return { maps, devices, results }
}

function toMarkdown({ args, maps, devices, results, jsonPath }) {
  const lines = []
  lines.push('# Mobile Map Performance Audit')
  lines.push('')
  lines.push(`- Base URL: ${args.baseUrl}`)
  lines.push(`- Maps tested: ${maps.length} (${maps.join(', ')})`)
  lines.push(`- Devices: ${devices.map((device) => device.id).join(', ')}`)
  lines.push(`- Sample: warmup ${args.warmupMs}ms, measure ${args.durationMs}ms, CPU throttle ${args.cpuThrottle ? 'on' : 'off'}`)
  lines.push(`- Raw JSON: ${path.relative(PROJECT_ROOT, jsonPath)}`)
  lines.push('')
  lines.push('| Status | Device | Map | Ready ms | Avg FPS | P10 FPS | >50ms Frames | Long Tasks | Draw Calls | Triangles | 3D Assets | Asset Failures | Transfer |')
  lines.push('|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const result of results) {
    lines.push(`| ${result.status} | ${result.deviceId} | ${result.mapName || result.mapId} | ${fmt(result.readyMs, 0)} | ${fmt(result.avgFps)} | ${fmt(result.p10Fps)} | ${result.framesOver50ms ?? '-'} | ${result.longTaskCount ?? '-'} | ${result.perfProbe?.drawCalls ?? '-'} | ${result.perfProbe?.triangles ?? '-'} | ${result.assetResourceCount ?? '-'} | ${result.assetFailures?.length ?? 0} | ${bytesToKb(result.assetTransferSize)} |`)
  }

  const byMap = new Map()
  for (const result of results) {
    if (!byMap.has(result.mapId)) byMap.set(result.mapId, [])
    byMap.get(result.mapId).push(result)
  }
  lines.push('')
  lines.push('## Worst Per Map')
  lines.push('')
  lines.push('| Map | Worst Status | Lowest Avg FPS | Lowest P10 FPS | Max Long Tasks | Max Draw Calls | Max Triangles |')
  lines.push('|---|---|---:|---:|---:|---:|---:|')
  for (const mapId of maps) {
    const group = byMap.get(mapId) || []
    const status = group.some((item) => item.status === 'FAIL') ? 'FAIL' : group.some((item) => item.status === 'WARN') ? 'WARN' : 'PASS'
    const lowestAvg = Math.min(...group.map((item) => item.avgFps).filter(Number.isFinite))
    const lowestP10 = Math.min(...group.map((item) => item.p10Fps).filter(Number.isFinite))
    const maxLong = Math.max(...group.map((item) => item.longTaskCount || 0))
    const maxCalls = Math.max(...group.map((item) => item.perfProbe?.drawCalls || 0))
    const maxTriangles = Math.max(...group.map((item) => item.perfProbe?.triangles || 0))
    lines.push(`| ${MAP_CATALOG[mapId]?.config.displayName || mapId} | ${status} | ${fmt(lowestAvg)} | ${fmt(lowestP10)} | ${maxLong} | ${maxCalls || '-'} | ${maxTriangles || '-'} |`)
  }
  lines.push('')
  lines.push('## Notes')
  lines.push('')
  lines.push('- PASS means the throttled mobile profile stayed near a smooth 60 FPS with no meaningful long-task pressure.')
  lines.push('- WARN means the map is playable but has a mobile risk signal: lower FPS, long tasks, slow readiness, or visible frame spikes.')
  lines.push('- FAIL means the map failed to render or fell below the target comfort floor in this synthetic mobile browser test.')
  return lines.join('\n')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const args = parseArgs(process.argv.slice(2))
const startedAt = new Date()
const { maps, devices, results } = await runBenchmark(args)
await mkdir(args.outDir, { recursive: true })
const stamp = startedAt.toISOString().replace(/[:.]/g, '-')
const jsonPath = path.join(args.outDir, `mobile-map-performance-${stamp}.json`)
const mdPath = path.join(args.outDir, `mobile-map-performance-${stamp}.md`)
await writeFile(jsonPath, JSON.stringify({ startedAt: startedAt.toISOString(), args, maps, devices, results }, null, 2))
await writeFile(mdPath, toMarkdown({ args, maps, devices, results, jsonPath }))

const failures = results.filter((result) => result.status === 'FAIL')
const warnings = results.filter((result) => result.status === 'WARN')
console.log('')
console.log(`Report: ${path.relative(PROJECT_ROOT, mdPath)}`)
console.log(`Raw:    ${path.relative(PROJECT_ROOT, jsonPath)}`)
console.log(`Summary: ${results.length} runs, ${failures.length} fail, ${warnings.length} warn`)

process.exitCode = failures.length > 0 ? 1 : 0
