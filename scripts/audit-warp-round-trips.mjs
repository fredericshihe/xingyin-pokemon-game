import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
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
    '--no-sandbox',
    '--disable-dev-shm-usage',
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
  let closed = false
  const exitPromise = new Promise((resolve) => {
    chrome.once('exit', resolve)
  })

  return {
    port,
    async close() {
      if (!closed) {
        closed = true
        chrome.kill('SIGTERM')
      }
      await Promise.race([
        exitPromise,
        sleep(2500)
      ])
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          await rm(userDataDir, { recursive: true, force: true })
          return
        } catch (error) {
          if (attempt === 3) throw error
          await sleep(220 * (attempt + 1))
        }
      }
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

  async close() {
    await this.send('Page.close').catch(() => {})
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

async function waitForSceneReady(page, timeoutMs = 45000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const value = await evaluate(page, `(() => {
      const canvas = document.querySelector('canvas.three-map-canvas')
      return {
        ready: Boolean(canvas && window.__THREE_LOW_POLY_MAP_PERF__?.worldReady),
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


// 实机往返审计：每个出口旁出生 → 走进出口 → 到达后回头走一步 → 必须回到原出口旁。
// 需要开发服务器：BASE_URL=http://localhost:5173 node scripts/audit-warp-round-trips.mjs
const BASE = process.env.BASE_URL || 'http://localhost:5173'
const { MAP_CATALOG, MAP_CHAIN } = await import('../src/game/data/mapCatalog.js').catch(async () => {
  const { withViteAuditServer } = await import('./load-vite-module.mjs')
  let out
  await withViteAuditServer(async ({ loadModule }) => { out = await loadModule('/src/game/data/mapCatalog.js') })
  return out
})
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
const SCREEN_DIRECTIONS = ['up', 'right', 'down', 'left']
const screenDirectionFor = (worldDirection, cameraYawTarget) => SCREEN_DIRECTIONS[
  (SCREEN_DIRECTIONS.indexOf(worldDirection) + Math.round(cameraYawTarget / (Math.PI / 2)) % 4 + 4) % 4
]
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }
const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const CASES = []
for (const id of MAP_CHAIN) {
  for (const warp of MAP_CATALOG[id].mapInfo.runtimeEvents.filter((e) => e.type === 'warp')) {
    const target = MAP_CATALOG[warp.target.mapName].mapInfo
    const back = target.runtimeEvents.find((e) => e.type === 'warp' && e.target?.mapName === id &&
      Math.abs(e.position.x - warp.target.position.x) + Math.abs(e.position.y - warp.target.position.y) === 1)
    if (!back) { CASES.push({ id, warp, missingBack: true }); continue }
    // 从本出口的"返回落点"出发（即 back 的目标落点），朝出口方向走
    const start = back.target.position
    const goDir = Object.keys(STEP).find((d) => start.x + STEP[d][0] === warp.position.x && start.y + STEP[d][1] === warp.position.y)
    const landing = warp.target.position
    const backDir = Object.keys(STEP).find((d) => landing.x + STEP[d][0] === back.position.x && landing.y + STEP[d][1] === back.position.y)
    CASES.push({ id, warp, start, goDir, landing, backDir })
  }
}
let chrome = null
let browserMapId = null
let failures = 0
let checked = 0
try {
  for (const c of CASES) {
    const label = `${c.id}:${c.warp.id}`
    if (process.env.WARP_CASE && !label.includes(process.env.WARP_CASE)) continue
    checked += 1
    if (c.missingBack || !c.goDir || !c.backDir) {
      failures += 1
      console.log(`BAD ${label}: no paired return exit next to landing`)
      continue
    }
    if (browserMapId !== c.id) {
      await chrome?.close()
      chrome = await launchChrome()
      browserMapId = c.id
    }
    const page = await createPage(chrome.port)
    await navigateAndWait(page, `${BASE}/map-runtime-preview?map=${c.id}&spawn=${c.start.x},${c.start.y}&perf=1`)
    await waitForSceneReady(page, 60000)
    const tile = async () => JSON.parse(await evaluate(page, `JSON.stringify(({...((window.__THREE_LOW_POLY_MAP_PERF__||{}).playerTile||{}),mapName:(window.__THREE_LOW_POLY_MAP_PERF__||{}).mapName,cameraYawTarget:(window.__THREE_LOW_POLY_MAP_PERF__||{}).cameraYawTarget}))`))
    const press = async (key) => {
      await evaluate(page, `window.dispatchEvent(new KeyboardEvent('keydown',{key:'${key}',bubbles:true}))`)
      await sleep(160)
      await evaluate(page, `window.dispatchEvent(new KeyboardEvent('keyup',{key:'${key}',bubbles:true}))`)
    }
    // 预览出生朝上；按住超过转身延迟才会迈步。
    await press(KEY[c.goDir])
    await sleep(3200)
    await waitForSceneReady(page, 60000)
    const mid = await tile()
    const backScreenDirection = screenDirectionFor(c.backDir, mid.cameraYawTarget || 0)
    await press(KEY[backScreenDirection])
    await sleep(3200)
    await waitForSceneReady(page, 60000)
    const end = await tile()
    const ok = mid?.mapName === c.warp.target.mapName && mid?.x === c.landing.x && mid?.y === c.landing.y &&
      end?.mapName === c.id && end?.x === c.start.x && end?.y === c.start.y
    if (!ok) failures += 1
    console.log(`${ok ? 'OK ' : 'BAD'} ${label}: ${c.start.x},${c.start.y} -${c.goDir}-> arrive ${mid?.x},${mid?.y} (want ${c.landing.x},${c.landing.y}) -${c.backDir}-> ${end?.x},${end?.y} (want ${c.start.x},${c.start.y})`)
    await page.close()
  }
} finally {
  await chrome?.close()
}
console.log(failures ? `FAIL: ${failures}/${checked} round trips` : `PASS: ${checked} warp round trips land beside their paired exit both ways`)
process.exitCode = failures ? 1 : 0
