import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { mergeBootProgress } from '../src/utils/bootProgress.js'

const source = await fs.readFile(new URL('../src/utils/gameEntryPreload.js', import.meta.url), 'utf8')
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))
async function until(predicate) {
  for (let i = 0; i < 30; i += 1) { if (predicate()) return; await tick() }
  assert.fail('Expected preload event did not occur')
}

async function harness({ imageCount = 3, modelCount = 2 } = {}) {
  const imageJobs = [], modelJobs = [], engine = deferred()
  const context = vm.createContext({ console, setTimeout, clearTimeout })
  let marks = 0, clears = 0, imageResets = 0, modelResets = 0
  const job = (keys, options, queue) => {
    const gate = deferred()
    const entry = { keys, options, loaded: 0, gate,
      complete(count = 1) {
        for (let i = 0; i < count; i += 1) {
          const key = keys[this.loaded++]
          options.onItemComplete?.({ ok: true, url: key }, { loaded: this.loaded, total: keys.length })
        }
        if (this.loaded === keys.length) gate.resolve({ ok: true, loaded: this.loaded, total: keys.length, failed: [] })
      },
      retry() { options.onRetryRound?.(1, keys.length - this.loaded, keys.length) }
    }
    queue.push(entry)
    return gate.promise
  }
  const definitions = {
    './gameAssetBootstrap': {
      getP0ImageAssetUrls: () => Array.from({ length: imageCount }, (_, i) => `base-${i}`),
      getP1ImageAssetUrls: () => ['base-0', 'party-a', 'party-b']
    },
    './localAssetPreloader': { preloadImageAssetsUntilComplete: (keys, options) => job(keys, options, imageJobs), clearDecodedImageCache() { imageResets += 1 } },
    './gameEntryPreloadMarks': { markEntryPreloadComplete: () => { marks += 1 }, clearEntryPreloadMarks() { clears += 1 }, getEntryPreloadStorageKey() {} },
    '../game/threeLowPolyModelCache': {
      collectMapModelKeys: () => Array.from({ length: modelCount }, (_, i) => `model-${i}`),
      preloadModelKeysUntilComplete: (keys, options) => job(keys, options, modelJobs), resetModelLoadCache() { modelResets += 1 }
    },
    '../game/threeLowPolyMap': {}
  }
  const modules = new Map()
  async function getModule(specifier) {
    if (specifier === '../game/threeLowPolyMap') await engine.promise
    if (!modules.has(specifier)) {
      const exports = definitions[specifier]
      assert.ok(exports, `Unexpected dependency ${specifier}`)
      const module = new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      }, { context })
      modules.set(specifier, module)
      await module.link(() => {})
      await module.evaluate()
    }
    return modules.get(specifier)
  }
  const module = new vm.SourceTextModule(source, { context, importModuleDynamically: getModule })
  await module.link(getModule)
  await module.evaluate()
  return { api: module.namespace, imageJobs, modelJobs, engine, get marks() { return marks },
    get resets() { return { clears, imageResets, modelResets } } }
}

function checkProgress(events, total) {
  assert.ok(events.length)
  let lastLoaded = 0
  for (const event of events) {
    assert.equal(event.total, total, 'The full plan must keep one denominator')
    assert.equal(event.percent, Math.floor(event.loaded / total * 100), 'Displayed percentage must match ready work')
    assert.ok(event.loaded >= lastLoaded, 'Completed work must not go backwards between phases')
    if (event.loaded < total) assert.ok(event.percent < 100, 'Incomplete resources must not round up to 100%')
    assert.equal(mergeBootProgress(false, event).percent, event.percent, 'UI must not inflate or clamp progress')
    lastLoaded = event.loaded
  }
}

// Cold entry: hold every boundary independently, including the final model.
{
  const h = await harness(), events = []
  const task = h.api.runGameEntryPreload({ mapName: 'current-map', onProgress: (p) => events.push(p) })
  await until(() => h.imageJobs.length === 1)
  h.imageJobs[0].complete(3)
  await tick()
  assert.equal(events.at(-1).loaded, 3)
  h.engine.resolve()
  await until(() => h.imageJobs.length === 2)
  assert.equal(events.at(-1).loaded, 5, 'Completed engine work must carry into the full plan')
  assert.equal(events.at(-1).percent, 55, 'Early prewarm completion is not full entry completion')
  assert.deepEqual(Array.from(h.imageJobs[1].keys), ['party-a', 'party-b'], 'Repeated URLs must be counted once')
  h.imageJobs[1].complete()
  const beforeRetry = events.at(-1).loaded
  h.imageJobs[1].retry()
  assert.equal(events.at(-1).loaded, beforeRetry, 'A retry is not completed work')
  h.imageJobs[1].complete()
  await until(() => h.modelJobs.length === 1)
  h.modelJobs[0].complete()
  assert.equal(events.at(-1).loaded, 8)
  assert.ok(events.at(-1).percent < 100)
  assert.equal(h.marks, 0)
  h.modelJobs[0].complete()
  await task
  checkProgress(events, 9)
  assert.equal(events.at(-1).percent, 100)
  assert.equal(events.at(-1).loaded, events.at(-1).total)
  assert.equal(h.marks, 1)
  console.log('PASS cold entry, one denominator, real counts, deduplication, retries and final readiness')
}

// Join ongoing prewarming, then reuse the completed session on another entry.
{
  const h = await harness(), earlyEvents = [], fullEvents = []
  const early = h.api.startEarlyEntryPreload({ onProgress: p => earlyEvents.push(p) })
  await until(() => h.imageJobs.length === 1)
  h.imageJobs[0].complete()
  const full = h.api.runGameEntryPreload({ onProgress: p => fullEvents.push(p) })
  await until(() => fullEvents.some(p => p.loaded === 1))
  h.imageJobs[0].complete(2)
  h.engine.resolve()
  await early
  await until(() => h.imageJobs.length === 2)
  const earlyEventCount = earlyEvents.length
  h.imageJobs[1].complete(2)
  await until(() => h.modelJobs.length === 1)
  h.modelJobs[0].complete(2)
  await full
  checkProgress(fullEvents, 9)
  assert.equal(earlyEvents.length, earlyEventCount, 'Full reports must not leak back into prewarm subscribers')
  const warmEvents = []
  const warm = h.api.runGameEntryPreload({ onProgress: p => warmEvents.push(p) })
  await until(() => h.imageJobs.length === 3)
  assert.equal(warmEvents.at(-1).loaded, 5, 'Cached early work must be replayed into the current denominator')
  h.imageJobs[2].complete(2)
  await until(() => h.modelJobs.length === 2)
  h.modelJobs[1].complete(2)
  await warm
  checkProgress(warmEvents, 9)
  console.log('PASS in-flight and cached prewarming, isolated subscribers and completion replay')
}

// Large plans must never display 100% with the last resource still pending.
{
  const h = await harness({ imageCount: 300, modelCount: 2 }), events = []
  const task = h.api.runGameEntryPreload({ onProgress: p => events.push(p) })
  await until(() => h.imageJobs.length === 1)
  h.imageJobs[0].complete(300); h.engine.resolve()
  await until(() => h.imageJobs.length === 2)
  h.imageJobs[1].complete(2)
  await until(() => h.modelJobs.length === 1)
  h.modelJobs[0].complete()
  assert.equal(events.at(-1).percent, 99)
  h.modelJobs[0].complete(); await task
  checkProgress(events, 306)
  console.log('PASS final-resource rounding for large plans')
}

// A failed shared prewarm rejects every subscriber without a detached rejection;
// the next attempt creates a new session and can complete.
{
  const h = await harness()
  const first = h.api.startEarlyEntryPreload()
  const joined = h.api.startEarlyEntryPreload({ onProgress() {} })
  const settled = Promise.allSettled([first, joined])
  await until(() => h.imageJobs.length === 1)
  h.imageJobs[0].gate.reject(new Error('test network interruption'))
  const results = await settled
  assert.ok(results.every(r => r.status === 'rejected'))
  const retry = h.api.startEarlyEntryPreload()
  await until(() => h.imageJobs.length === 2)
  h.engine.resolve(); h.imageJobs[1].complete(3); await retry
  console.log('PASS failed shared prewarm can retry without leaking subscribers')
}

// Force retry cancels pending prewarming, clears completion/cache state, and
// reports a fresh full plan without accepting late results from the old session.
{
  const h = await harness(), staleEvents = [], events = []
  const stale = h.api.startEarlyEntryPreload({ onProgress: p => staleEvents.push(p) })
  const cancelled = assert.rejects(stale, /aborted/)
  await until(() => h.imageJobs.length === 1)
  h.imageJobs[0].complete()
  const staleCount = staleEvents.length
  const retry = h.api.runGameEntryPreload({ force: true, onProgress: p => events.push(p) })
  await until(() => h.imageJobs.length === 2)
  assert.deepEqual(h.resets, { clears: 1, imageResets: 1, modelResets: 1 })
  assert.equal(events.at(-1).loaded, 0)
  h.imageJobs[0].complete(2)
  await cancelled
  assert.equal(staleEvents.length, staleCount, 'Cancelled prewarming must stop publishing')
  assert.equal(events.at(-1).loaded, 0, 'Old completions must not advance the new session')
  h.imageJobs[1].complete(3); h.engine.resolve()
  await until(() => h.imageJobs.length === 3)
  h.imageJobs[2].complete(2)
  await until(() => h.modelJobs.length === 1)
  h.modelJobs[0].complete(2); await retry
  checkProgress(events, 9)
  assert.equal(h.marks, 1)
  console.log('PASS forced retry clears caches and ignores cancelled prewarm completions')
}

assert.equal(mergeBootProgress(true, { percent: 80 }).percent, null)
assert.equal(mergeBootProgress(false, null).percent, null)
assert.equal(mergeBootProgress(false, { percent: 100 }, true).percent, null)
console.log('PASS unknown cloud/render work never receives an invented percentage')
console.log('Entry loading progress audit passed.')
