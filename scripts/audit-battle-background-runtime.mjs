import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import { BATTLE_BACKGROUNDS } from '../src/game/data/battleBackgroundCatalog.js'

const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { chromium } = playwright.default || playwright
const base = process.argv[2] || 'http://127.0.0.1:5173'
const out = 'output/battle-backgrounds/runtime'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE || undefined,
  args: ['--no-sandbox', '--disable-gpu']
})
const errors = []
const results = []
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' })
    page.on('pageerror', error => errors.push(error.message))
    const ids = viewport.width > 720 ? Object.keys(BATTLE_BACKGROUNDS) : [
      'valley-meadow', 'mist-islet', 'farm-rows', 'shore-cabin', 'grave-mooncourt',
      'ruins-vault', 'ridge-training', 'peak-observatory', 'frost-throne',
      'tide-throne', 'iron-throne', 'dragon-throne', 'champion-summit'
    ]
    for (const id of ids) {
      const mode = id.endsWith('throne') ? 'boss' : id === 'ridge-training' ? 'league' : 'wild'
      await page.goto(`${base}/battle-vfx-lab?scene=actual&background=${id}&mode=${mode}`, { waitUntil: 'domcontentloaded' })
      await page.locator('.battle-background-ready .battle-background-plate').waitFor()
      const state = await page.evaluate(() => {
        const host = document.querySelector('.anime-battle-bg')
        const img = host.querySelector('.battle-background-plate')
        return {
          id: host.dataset.battleBackground,
          width: img.naturalWidth,
          height: img.naturalHeight,
          src: img.currentSrc,
          propsHidden: getComputedStyle(host.querySelector('.battle-environment-props')).display === 'none',
          overflow: document.documentElement.scrollWidth > innerWidth,
          themeBelowSprites: +getComputedStyle(host.querySelector('.battle-theme-visual')).zIndex <
            +getComputedStyle(host.querySelector('.battle-sprite-slot')).zIndex
        }
      })
      assert.equal(state.id, id)
      assert.ok(state.width >= 960 && state.height >= 640, `${id}: missing decoded image`)
      assert.ok(state.propsHidden && state.themeBelowSprites, `${id}: duplicated scenery or overlay blocks actors`)
      assert.equal(state.overflow, false, `${id}: horizontal overflow`)
      const file = `${out}/${id}-${viewport.width}.png`
      await page.screenshot({ path: file })
      const stats = await sharp(file).stats()
      assert.ok(stats.channels.slice(0, 3).some(channel => channel.stdev > 15), `${id}: blank screenshot`)
      results.push({ viewport: viewport.width, ...state })
    }
    // An unavailable plate must leave the legacy scene and battle controls usable.
    await page.route('**/assets/battle-backgrounds/**', route => route.abort())
    await page.goto(`${base}/battle-vfx-lab?scene=actual&background=peak-observatory`)
    await page.locator('.battle-sprite-enemy img').waitFor()
    assert.equal(await page.locator('.battle-background-ready').count(), 0)
    assert.ok(await page.getByRole('button', { name: /战斗$/ }).isEnabled())
    await page.close()
  }
  assert.deepEqual(errors, [])
  console.log(`Battle backgrounds: ${results.length} desktop/mobile scenes, decoded assets, fallback and layering passed.`)
} finally {
  await browser.close()
  await fs.writeFile(`${out}/verification.json`, JSON.stringify({ results, errors }, null, 2))
}
