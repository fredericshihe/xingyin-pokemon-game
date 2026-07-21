import fs from 'node:fs'
import assert from 'node:assert/strict'

import {
  getMasterBallRegionPurchaseFlag,
  hasPurchasedMasterBallInRegion,
  isMasterBallShopItem,
  recordMasterBallPurchaseInRegion
} from '../src/utils/shopPurchaseLimits.js'

const originalGame = fs.readFileSync(new URL('../src/components/Game/OriginalGame.jsx', import.meta.url), 'utf8')
const deferredPanels = fs.readFileSync(new URL('../src/components/Game/DeferredGamePanels.jsx', import.meta.url), 'utf8')

const untouchedWorld = { flags: { reward_claimed: true }, defeatedBossIds: ['boss-1'] }
const purchasedWorld = recordMasterBallPurchaseInRegion(untouchedWorld, 'GodotMapV2_BossHighland')

assert.equal(isMasterBallShopItem('pokeball', 'pokeball_master'), true)
assert.equal(isMasterBallShopItem('pokeball', 'pokeball_ultra'), false)
assert.equal(hasPurchasedMasterBallInRegion(untouchedWorld, 'GodotMapV2_BossHighland'), false)
assert.equal(hasPurchasedMasterBallInRegion(purchasedWorld, 'GodotMapV2_BossHighland'), true)
assert.equal(hasPurchasedMasterBallInRegion(purchasedWorld, 'GodotMapV2_FrostDojo'), false)
assert.equal(purchasedWorld.flags.reward_claimed, true)
assert.deepEqual(purchasedWorld.defeatedBossIds, ['boss-1'])
assert.equal(untouchedWorld.flags[getMasterBallRegionPurchaseFlag('GodotMapV2_BossHighland')], undefined)
assert.notEqual(purchasedWorld, untouchedWorld)
assert.notEqual(purchasedWorld.flags, untouchedWorld.flags)

assert.match(originalGame, /isMasterBallPurchase && purchaseAmount !== 1/)
assert.match(originalGame, /hasPurchasedMasterBallInRegion\(baseSnapshot\.world, purchaseMapName\)/)
assert.match(originalGame, /world: isMasterBallPurchase[\s\S]*?recordMasterBallPurchaseInRegion\(baseSnapshot\.world, purchaseMapName\)/)
assert.equal((originalGame.match(/recordMasterBallPurchaseInRegion\(baseSnapshot\.world, purchaseMapName\)/g) || []).length, 1)
assert.match(deferredPanels, /regionPurchaseLimitReached[\s\S]*?disabled=\{cannotAfford \|\| regionPurchaseLimitReached \|\| isShopBusy\}/)
assert.match(deferredPanels, /本区域已购买/)

console.log('Master Ball regional purchase-limit audit passed.')
