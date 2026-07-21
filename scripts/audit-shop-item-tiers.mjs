#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withViteAuditServer } from './load-vite-module.mjs'

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8')

const originalGame = read('src/components/Game/OriginalGame.jsx')
const deferredGamePanels = read('src/components/Game/DeferredGamePanels.jsx')
const battleAi = read('src/utils/battleAi.js')

const requiredShopTextChecks = [
  {
    name: 'shop_screen_sells_catalog_items_unless_not_for_sale',
    passed: /Object\.entries\(itemsMap\)\.filter\(\(\[, item\]\) => !item\.notForSale\)/.test(deferredGamePanels),
  },
  {
    name: 'pokeball_cards_show_simple_reference_percentages',
    passed: /getPokeballEffectText\(item\)/.test(deferredGamePanels) &&
      /getPokeballEffectText\(item\)/.test(originalGame) &&
      /getPokeballEffectText\(item\)/.test(read('src/components/Teacher/Dashboard.jsx')),
  },
  {
    name: 'purchase_accepts_all_three_shop_item_types',
    passed: /itemType === 'expPotion' \? EXP_POTIONS\[itemKey\][\s\S]*?itemType === 'pokeball' \? POKEBALLS\[itemKey\][\s\S]*?itemType === 'potion' \? POTIONS\[itemKey\]/.test(originalGame),
  },
  {
    name: 'battle_ai_knows_fourth_potion_tier',
    passed: /\['potion', 'super_potion', 'hyper_potion', 'max_potion'\]/.test(battleAi) &&
      /getPotionRecoveryProfile\(POTIONS\[key\]\)/.test(battleAi),
  },
  {
    name: 'strong_heal_audio_includes_full_restore_potion',
    passed: /itemKey === 'hyper_potion' \|\| itemKey === 'max_potion'/.test(originalGame),
  },
  {
    name: 'premium_shop_items_are_excluded_from_random_supply_pool',
    passed: /Object\.entries\(POKEBALLS\)\.filter\(\(\[, item\]\) => !item\.randomDropDisabled\)/.test(originalGame) &&
      /Object\.entries\(POTIONS\)\.filter\(\(\[, item\]\) => !item\.randomDropDisabled\)/.test(originalGame),
  },
]

const isPositivePrice = (item) => Number.isFinite(Number(item?.price)) && Number(item.price) > 0 && item.notForSale !== true
const isAscending = (values) => values.every((value, index) => index === 0 || value > values[index - 1])

await withViteAuditServer(async ({ loadModule }) => {
  const [{ POKEBALLS, POTIONS, EXP_POTIONS }, { getPokeballEffectText, getPotionEffectText, getPotionRecoveryProfile }] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/inventoryItems.js'),
  ])

  const ballKeys = ['pokeball_basic', 'pokeball_great', 'pokeball_ultra', 'pokeball_master']
  const potionKeys = ['potion', 'super_potion', 'hyper_potion', 'max_potion']
  const expPotionKeys = ['exp_potion_small', 'exp_potion_medium', 'exp_potion_large', 'exp_potion_super']

  const checks = [
    ...requiredShopTextChecks,
    {
      name: 'four_sellable_pokeball_tiers',
      passed: ballKeys.every((key) => isPositivePrice(POKEBALLS[key])) &&
        isAscending(ballKeys.map((key) => Number(POKEBALLS[key].price))) &&
        Number(POKEBALLS.pokeball_master.catchRateMultiplier) >= 255 &&
        POKEBALLS.pokeball_master.randomDropDisabled === true,
    },
    {
      name: 'pokeball_effect_text_is_child_readable_percentages',
      passed: JSON.stringify(ballKeys.map((key) => getPokeballEffectText(POKEBALLS[key]))) === JSON.stringify([
        '黄血约30%（3次约1次）',
        '黄血约46%（2次约1次）',
        '黄血约61%（2次约1次）',
        '成功率100%（必定成功）',
      ]),
    },
    {
      name: 'four_sellable_potion_tiers_with_full_restore',
      passed: potionKeys.every((key) => isPositivePrice(POTIONS[key])) &&
        isAscending(potionKeys.map((key) => Number(POTIONS[key].price))) &&
        POTIONS.max_potion.fullRestore === true &&
        POTIONS.max_potion.randomDropDisabled === true &&
        getPotionRecoveryProfile(POTIONS.max_potion).fullRestore === true &&
        getPotionEffectText(POTIONS.max_potion) === 'HP/MP 全满 / 解除异常',
    },
    {
      name: 'four_sellable_exp_potion_tiers',
      passed: expPotionKeys.every((key) => isPositivePrice(EXP_POTIONS[key])) &&
        isAscending(expPotionKeys.map((key) => Number(EXP_POTIONS[key].price))) &&
        isAscending(expPotionKeys.map((key) => Number(EXP_POTIONS[key].expAmount))),
    },
  ]

  const failed = checks.filter((check) => !check.passed)
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      checkCount: checks.length,
      failedCount: failed.length,
    },
    shopTiers: {
      pokeballs: ballKeys.map((key) => ({ key, name: POKEBALLS[key]?.name, price: POKEBALLS[key]?.price, effect: getPokeballEffectText(POKEBALLS[key]) })),
      potions: potionKeys.map((key) => ({ key, name: POTIONS[key]?.name, price: POTIONS[key]?.price, effect: getPotionEffectText(POTIONS[key]) })),
      expPotions: expPotionKeys.map((key) => ({ key, name: EXP_POTIONS[key]?.name, price: EXP_POTIONS[key]?.price, expAmount: EXP_POTIONS[key]?.expAmount })),
    },
    checks,
  }, null, 2))

  if (failed.length > 0) process.exitCode = 1
})
