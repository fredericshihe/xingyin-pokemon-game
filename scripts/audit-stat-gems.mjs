#!/usr/bin/env node
import assert from 'node:assert/strict'
import { withViteAuditServer } from './load-vite-module.mjs'

await withViteAuditServer(async ({ loadModule }) => {
  const [data, stats, progress, roster, inventory, React, serverRender, panels] = await Promise.all([
    loadModule('/src/utils/gameData.js'), loadModule('/src/utils/pokemonStats.js'),
    loadModule('/src/utils/pokemonProgress.js'), loadModule('/src/utils/pokemonRoster.js'),
    loadModule('/src/utils/inventoryItems.js'), import('react'), import('react-dom/server'),
    loadModule('/src/components/Game/DeferredGamePanels.jsx'),
  ])
  const { MONSTERS, STAT_BOOST_ITEMS } = data
  const { OFFICIAL_STAT_KEYS, prepareStatBoostItemUse, getStatGemUsage, calculateStatsForLevel, applyBaseStatBoosts } = stats
  const lookup = (id) => MONSTERS.find((mon) => mon.id === Number(id))
  const lucario = MONSTERS.find((mon) => mon.name === '路卡利欧')
  const makeMon = () => ({ ...lucario, ...calculateStatsForLevel(lucario, 80), baseId: lucario.id,
    id: 1001, level: 80, currentExp: 0, currentHp: 100, currentMp: 80, moves: ['aura_sphere'] })
  const checks = []
  const check = (name, run) => { run(); checks.push(name) }
  const apply = (mon, item) => {
    const result = prepareStatBoostItemUse(mon, item)
    assert.equal(result.success, true)
    return { ...mon, statGemUses: result.statGemUses, statBoosts: result.statBoosts }
  }
  const prices = { hp_stone: [20000, 5], attack_stone: [20000, 3], defense_stone: [20000, 3],
    sp_attack_stone: [20000, 3], sp_defense_stone: [20000, 3], speed_stone: [25000, 2] }

  check('six prices and small single-stat effects', () => {
    for (const [key, [price, amount]] of Object.entries(prices)) {
      assert.equal(STAT_BOOST_ITEMS[key].price, price)
      assert.equal(STAT_BOOST_ITEMS[key].boostAmount, amount)
      assert.notEqual(STAT_BOOST_ITEMS[key].notForSale, true)
    }
    assert.equal(STAT_BOOST_ITEMS.rare_candy.notForSale, true)
  })
  check('all species at levels 50/80/100 only gain the chosen stat; MP unchanged', () => {
    for (const base of MONSTERS) for (const level of [50, 80, 100]) {
      const before = calculateStatsForLevel(base, level)
      for (const key of Object.keys(prices)) {
        const item = STAT_BOOST_ITEMS[key]
        const result = prepareStatBoostItemUse({}, item)
        const field = getStatGemUsage({}, item).statKey
        const after = calculateStatsForLevel(applyBaseStatBoosts(base, result.statBoosts), level)
        for (const stat of [...OFFICIAL_STAT_KEYS, 'maxMp']) {
          const delta = after[stat] - before[stat]
          if (stat === field) assert.ok(delta >= Math.floor(2 * item.boostAmount * level / 100) && delta <= Math.ceil(2 * item.boostAmount * level / 100))
          else assert.equal(delta, 0)
        }
      }
    }
  })
  check('four uses allowed; fifth rejected without mutating prior state', () => {
    let mon = makeMon()
    for (let i = 0; i < 4; i++) mon = apply(mon, STAT_BOOST_ITEMS.attack_stone)
    const snapshot = structuredClone(mon)
    assert.equal(prepareStatBoostItemUse(mon, STAT_BOOST_ITEMS.attack_stone).success, false)
    assert.deepEqual(mon, snapshot)
    assert.equal(mon.statBoosts.atk, 12)
    assert.equal(getStatGemUsage(mon, STAT_BOOST_ITEMS.hp_stone).canUse, true)
  })
  let capped = makeMon()
  for (const key of ['attack_stone', 'defense_stone', 'speed_stone']) {
    for (let i = 0; i < (key === 'speed_stone' ? 2 : 4); i++) capped = apply(capped, STAT_BOOST_ITEMS[key])
  }
  check('total ten blocks a new stat and all later uses', () => {
    for (const key of Object.keys(prices)) {
      assert.equal(getStatGemUsage(capped, STAT_BOOST_ITEMS[key]).remaining, 0)
      assert.equal(prepareStatBoostItemUse(capped, STAT_BOOST_ITEMS[key]).success, false)
    }
  })
  check('legacy bonuses stay intact and do not invent gem counts', () => {
    const legacy = { ...makeMon(), statBoosts: { attack: 80, hp: 20, spDefense: 5 } }
    const result = apply(legacy, STAT_BOOST_ITEMS.attack_stone)
    assert.deepEqual(result.statBoosts, { atk: 83, maxHp: 20, spDef: 5 })
    assert.deepEqual(result.statGemUses, { atk: 1 })
    assert.deepEqual(legacy.statBoosts, { attack: 80, hp: 20, spDefense: 5 })
  })
  check('exploration rare candy leaves gem quota unchanged', () => {
    const after = apply(capped, STAT_BOOST_ITEMS.rare_candy)
    assert.deepEqual(after.statGemUses, capped.statGemUses)
    for (const key of OFFICIAL_STAT_KEYS) assert.equal(after.statBoosts[key], (capped.statBoosts[key] || 0) + 5)
  })
  check('JSON reload retains the cap and original bonuses', () => {
    const restored = JSON.parse(JSON.stringify(capped))
    assert.deepEqual(restored.statBoosts, capped.statBoosts)
    assert.equal(getStatGemUsage(restored, STAT_BOOST_ITEMS.hp_stone).canUse, false)
  })
  check('real XP upgrade and progress repair retain the quota', () => {
    const exp = progress.getExpPotionExpAmount(capped, { levelGain: 1 }, lookup)
    const result = progress.simulateMonsterExpGain(capped, exp, lookup)
    assert.equal(result.updatedMon.level, 81)
    assert.deepEqual(result.updatedMon.statGemUses, capped.statGemUses)
    assert.deepEqual(result.updatedMon.statBoosts, capped.statBoosts)
    const repaired = progress.simulateMonsterExpGain(capped, 0, lookup).updatedMon
    assert.deepEqual(repaired.statGemUses, capped.statGemUses)
  })
  check('deposit and withdrawal retain per-individual quotas', () => {
    const otherBase = MONSTERS.find((mon) => mon.name === '喷火龙')
    const other = { ...otherBase, baseId: otherBase.id, id: 1002, level: 80 }
    const deposited = roster.depositToStorage({ playerTeam: [capped, other], storageBox: [], activePlayerId: capped.id }, capped.id)
    assert.equal(deposited.success, true)
    const withdrawn = roster.withdrawToParty(deposited, capped.id)
    assert.equal(withdrawn.success, true)
    assert.deepEqual(withdrawn.playerTeam.find((mon) => mon.id === capped.id).statGemUses, capped.statGemUses)
  })
  check('shop renders six gems, new prices and short rule; excludes rare candy', () => {
    const html = serverRender.renderToStaticMarkup(React.createElement(panels.ShopScreen, {
      playerGold: 30000, playerInventory: [], playerTeam: [capped], initialCategory: 'statBoost',
      getInventoryItemQuantity: inventory.getInventoryItemQuantity,
      getPotionEffectText: inventory.getPotionEffectText,
    }))
    assert.ok(html.includes('属性宝石') && html.includes('同一项最多4颗') && html.includes('25000'))
    for (const key of Object.keys(prices)) assert.ok(html.includes(STAT_BOOST_ITEMS[key].name))
    assert.equal(html.includes('神奇糖果'), false)
    assert.ok(html.includes('当前队伍这项已用满'))
  })
  console.log(JSON.stringify({ checks: checks.length, failed: 0, speciesStatCases: MONSTERS.length * 3 * 6, names: checks }, null, 2))
}, { define: { 'import.meta.env': '{}' } })
