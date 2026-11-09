import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { withViteAuditServer } from './load-vite-module.mjs'
const source=fs.readFileSync(new URL('../src/components/Game/OriginalGame.jsx',import.meta.url),'utf8')
const between=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start+a.length);assert(start>=0&&end>start,a);return source.slice(start,end)}
await withViteAuditServer(async({loadModule})=>{
 const [catalog,data,inv,dy,damage,rules,limits,timber]=await Promise.all([
  loadModule('/src/utils/adventureItems.js'),loadModule('/src/utils/gameData.js'),loadModule('/src/utils/inventoryItems.js'),
  loadModule('/src/utils/dynamax.js'),loadModule('/src/utils/battleDamage.js'),loadModule('/src/game/bicycleRules.js'),loadModule('/src/utils/shopPurchaseLimits.js'),loadModule('/src/game/timberLeague.js')])
 const mon={id:'hero',name:'皮卡丘',level:50,currentHp:180,maxHp:200,currentMp:40,maxMp:60,atk:120,def:100,spAtk:130,spDef:90,spd:101,moves:['tackle'],volatileStatuses:{confusion:2},statStages:{atk:1}}
 // Reordering uses fresh saved partners, rejects duplicate IDs and cannot edit battles.
 const checkReorder=async(order,{battle=false}={})=>{
  let snapshot={view:battle?'battle':'team',playerTeam:[{id:'a',currentHp:22},{id:'b',currentHp:35}]},commits=0
  const context={useCallback:fn=>fn,user:{id:'audit'},hasLoadedCloudSave:true,addNotification(){},isPokemonReleaseBlockedByBattle:s=>s.view==='battle',abortCloudSnapshotCommit:message=>({aborted:true,message}),commitCloudSnapshot:async({buildSnapshot})=>{const next=buildSnapshot(snapshot);if(next.aborted)return{success:false};snapshot=next;commits++;return{success:true}}}
  const reorder=vm.runInNewContext(between('  const handleReorderTeam =','  const handleReleaseMonster =')+'\nhandleReorderTeam',context)
  const result=await reorder(order.map(id=>({id,currentHp:999})))
  return{result,snapshot,commits}
 }
 const reordered=await checkReorder(['b','a']);assert.equal(reordered.result,true);assert.equal(reordered.snapshot.playerTeam[0].currentHp,35)
 assert.equal((await checkReorder(['a','a'])).commits,0)
 assert.equal((await checkReorder(['a','missing'])).commits,0)
 assert.equal((await checkReorder(['b','a'],{battle:true})).commits,0)
 const boosted=dy.activateDynamax(mon)
 assert.equal(mon.volatileStatuses.dynamaxActive,undefined)
 for(const key of ['maxHp','currentHp','maxMp','currentMp','atk','def','spAtk','spDef','spd'])assert.equal(boosted[key],mon[key],'Base stats and meters are untouched')
 for(const key of ['atk','def','spAtk','spDef','spd']){
  const expected=Math.floor(mon[key]*damage.getStageMultiplier(mon.statStages[key])*dy.DYNAMAX_STAT_MULTIPLIERS[key])
  assert.equal(damage.resolveBattleStat(boosted,key),expected)
 }
 assert.equal(damage.resolveBattleStat({...boosted,status:'paralysis'},'spd'),Math.floor(101*.5*1.05))
 assert.equal(dy.isDynamaxed(JSON.parse(JSON.stringify(boosted))),true,'Cloud reload keeps the form')
 assert.equal(dy.isDynamaxed(dy.activateDynamax(boosted)),true)
 assert.equal(damage.resolveBattleStat(dy.activateDynamax(boosted),'atk'),damage.resolveBattleStat(boosted,'atk'),'No stacking')
 const fainted=dy.normalizeDynamaxRuntime({...boosted,currentHp:0})
 assert.equal(dy.isDynamaxed({...fainted,currentHp:100}),false,'Healing after fainting cannot restore the form')
 assert.equal(dy.hasUsedDynamax([fainted]),true,'Fainting does not reset the per-battle limit')
 const cleanup=vm.runInNewContext([between('const clearTemporaryBattleRuntime =','const getStatusBadgeMeta ='),'({clearTemporaryBattleRuntime,clearBattleExitRuntime})'].join('\n'))
 assert.equal(dy.isDynamaxed(cleanup.clearTemporaryBattleRuntime(boosted)),true,'Switching preserves the form')
 assert.equal(dy.hasUsedDynamax([cleanup.clearBattleExitRuntime(boosted)]),false,'Battle exit resets activation')
 assert.equal(dy.isDynamaxed(cleanup.clearBattleExitRuntime(boosted)),false)
 const inventory=[{itemType:'battleItem',itemKey:'dynamax_candy',quantity:2},{itemType:'keyItem',itemKey:'bicycle',quantity:1}]
 assert.deepEqual(inv.sanitizePlayerInventory(inventory),inventory)
 assert.equal(inv.isSellableInventoryItem('keyItem','bicycle'),false)
 for(const item of [...Object.values(data.POKEBALLS),...Object.values(data.POTIONS),...Object.values(data.EXP_POTIONS),...Object.values(data.STAT_BOOST_ITEMS),...Object.values(data.EVOLUTION_ITEMS),...Object.values(catalog.BATTLE_ITEMS),...Object.values(catalog.KEY_ITEMS)]){
  assert.ok(typeof item.englishName==='string'&&item.englishName.length>0,'Every inventory definition needs an English label')
  assert(fs.existsSync(new URL('../public'+item.sprite,import.meta.url)),item.sprite)
 }
 const runUse=async(patch={}, {fail=false,busy=false,savedPatch={}}={})=>{
  const displayed={view:'battle',turn:'player',battlePhase:'active',battleEnvironment:null,activePlayerId:'hero',activeEnemyId:'foe',playerTeam:[mon],playerInventory:inventory,logs:[],...patch}
  let snapshot={...displayed,...savedPatch}
  const original=snapshot,before=JSON.stringify(snapshot);let commits=0
  const context={...inv,...dy,...timber,battleTurnInFlightRef:{current:busy},enemyTurnInFlightRef:{current:false},...displayed,user:{id:'audit'},hasLoadedCloudSave:true,gameOver:false,pendingBattleSwitch:null,addNotification(){},recordGameLog(){},gameAudio:{playItemUse(){}},getAffordableBattleMoveKeys:m=>m.currentMp>0?m.moves:[],appendSnapshotLogs:(s,logs)=>[...s.logs,...logs],commitCloudSnapshot:async({buildSnapshot})=>{
   const next=buildSnapshot(snapshot);assert.equal(JSON.stringify(snapshot),before);if(next.__cloudSnapshotCommitAborted)return{success:false,...next};if(fail)return{success:false};snapshot=next;commits++;return{success:true}
  }}
  const use=vm.runInNewContext([between('const abortCloudSnapshotCommit =','const isAbortedCloudSnapshotCommit ='),between('const consumeInventoryFromSnapshot =','const getDefaultWorldPosition ='),between('  const handleUseBattleItem =','  const handleUseExpPotion ='),'handleUseBattleItem'].join('\n'),context)
  const result=await use('dynamax_candy')
  if(!result){assert.equal(snapshot,original);assert.equal(commits,0)}
  return{result,snapshot}
 }
 const used=await runUse();assert.equal(used.result.success,true);assert.equal(used.snapshot.turn,'player','Item leaves the current action available')
 assert.equal(inv.getInventoryItemQuantity(used.snapshot.playerInventory,'battleItem','dynamax_candy'),1)
 assert.equal(used.snapshot.playerTeam[0].volatileStatuses.confusion,2,'Do not cure existing statuses')
 const blocked=[{view:'map'},{turn:'enemy'},{battlePhase:'sendout'},{playerTeam:[boosted]},{playerTeam:[{...mon,currentHp:0}]},{playerTeam:[{...mon,currentMp:0}]},{playerInventory:[]},{playerTeam:[{...mon,volatileStatuses:{chargingMove:'solar_beam'}}]}]
 for(const patch of blocked)assert.equal((await runUse(patch)).result,false)
 assert.equal((await runUse({}, {fail:true})).result,false)
 assert.equal((await runUse({}, {busy:true})).result,false)
 for(const routeKey of ['training','steady','sprint','gauntlet']){
  const battleEnvironment={timberLeague:{routeKey,runId:'audit-item-restriction',stage:1,turns:0,potions:0}}
  for(const view of ['battle','bag']){
   assert.equal((await runUse({view,battleEnvironment})).result,false,'Training and legacy league battles reject candy before any commit')
   assert.equal((await runUse({view},{savedPatch:{battleEnvironment}})).result,false,'Queued snapshot rechecks league rules after stale UI')
  }
 }
 // Run the production healing handler and league accounting for every healing potion.
 for(const potionKey of Object.keys(data.POTIONS)){
  const injured={...mon,currentHp:100,currentMp:10,status:'poison'}
  let snapshot={view:'battle',turn:'player',battlePhase:'active',activePlayerId:mon.id,activeEnemyId:'foe',playerTeam:[injured],playerInventory:[{itemType:'potion',itemKey:potionKey,quantity:2}],activeBattleEnergyCost:2,battleEnergyRefundEligible:true,logs:[],battleEnvironment:{timberLeague:{routeKey:'training',runId:'audit-healing',stage:1,turns:4,potions:0}}}
  const before=JSON.stringify(snapshot)
  const context={...data,...inv,...snapshot,activePlayerMon:injured,useCallback:fn=>fn,user:{id:'audit'},hasLoadedCloudSave:true,addLog(){},addNotification(){},recordGameLog(){},gameAudio:{playError(){},playItemUse(){}},isBattleMonFainted:m=>m.currentHp<=0,resolveTrackedActiveBattleEnergyCost:cost=>cost,appendSnapshotLogs:(s,logs)=>[...s.logs,...logs],commitCloudSnapshot:async({buildSnapshot})=>{
   const next=buildSnapshot(snapshot);assert.equal(JSON.stringify(snapshot),before);if(next.__cloudSnapshotCommitAborted)return{success:false,...next};snapshot=timber.trackTimberLeagueTransition(snapshot,next);return{success:true}
  }}
  const use=vm.runInNewContext([between('const getMonsterMaxHp =','const getMoveMpCost ='),between('const getRecoveryBehaviorText =','const getBattleMovePressure ='),between('const abortCloudSnapshotCommit =','const isAbortedCloudSnapshotCommit ='),between('const consumeInventoryFromSnapshot =','const getDefaultWorldPosition ='),between('  const handleUsePotion =','  const handleUseBattleItem ='),'handleUsePotion'].join('\n'),context)
  assert.equal(await use(mon.id,potionKey),true,potionKey)
  const recovery=inv.getPotionRecoveryProfile(data.POTIONS[potionKey])
  assert.equal(snapshot.playerTeam[0].currentHp,Math.min(mon.maxHp,100+recovery.hp))
  assert.equal(snapshot.playerTeam[0].currentMp,Math.min(mon.maxMp,10+recovery.mp))
  assert.equal(snapshot.playerTeam[0].status,null)
  assert.equal(inv.getInventoryItemQuantity(snapshot.playerInventory,'potion',potionKey),1)
  assert.equal(snapshot.turn,'enemy')
  assert.equal(snapshot.battleEnvironment.timberLeague.turns,5)
  assert.equal(snapshot.battleEnvironment.timberLeague.potions,1)
  assert.equal(snapshot.activeBattleEnergyCost,2)
 }
 const {UnifiedBagScreen}=await loadModule('/src/components/Game/DeferredGamePanels.jsx')
 const bagProps={inventory:[inventory[0],{itemType:'potion',itemKey:'potion',quantity:2}],team:[mon],isBattle:true,canUseBattleBalls:false,canUseDynamax:true,battleItemBlockedReason:'训练赛禁用，伤药可用'}
 const bagHtml=renderToStaticMarkup(React.createElement(UnifiedBagScreen,{...bagProps,initialCategory:'battleItem'}))
 assert.match(bagHtml,/<button[^>]*disabled=""[^>]*>训练赛禁用<\/button>/)
 const potionBagHtml=renderToStaticMarkup(React.createElement(UnifiedBagScreen,{...bagProps,initialCategory:'potion'}))
 assert.match(potionBagHtml,/<button(?![^>]*disabled)[^>]*>使用<\/button>/,'Healing stays enabled in its tab while candy is locked')
 assert(bagHtml.includes('训练赛禁用，伤药可用'))
 // Real purchase handler: resource delta and inventory form one mocked atomic boundary.
 const buy=async(type,key,{stock=[],gold=6000,amount=1,fail=false,vouchers=1}={})=>{
  let snapshot={playerInventory:stock,world:{timberLeague:{voucherBalance:vouchers}},logs:[]},spent=0,commits=0
  const context={...catalog,...data,...inv,...limits,...timber,createCloudSaveSessionId:()=> 'audit-purchase',currentMapName:'audit',currentMapNameRef:{current:'audit'},worldRef:{current:{}},playerInventory:[],user:{id:'audit'},hasLoadedCloudSave:true,shopPurchaseInFlightRef:{current:false},addLog(){},addNotification(){},recordGameLog(){},gameAudio:{playError(){},playItemUse(){}},refreshGoldBalance:async()=>gold,
   commitCloudSnapshotWithResources:async({buildSnapshot,goldDelta})=>{const next=buildSnapshot(snapshot);if(next.__cloudSnapshotCommitAborted)return{success:false,...next};if(fail)return{success:false};snapshot=next;spent=-goldDelta;commits++;return{success:true}}}
  const handler=vm.runInNewContext([between('const abortCloudSnapshotCommit =','const isAbortedCloudSnapshotCommit ='),between('  const handlePurchase =','  const handleSellItem ='),'handlePurchase'].join('\n'),context)
  const result=await handler(type,key,amount);return{result,snapshot,spent,commits}
 }
 const bike=await buy('keyItem','bicycle');assert.equal(bike.spent,2000);assert.equal(inv.getInventoryItemQuantity(bike.snapshot.playerInventory,'keyItem','bicycle'),1)
 const car=await buy('keyItem','sports_car',{gold:10000,stock:inventory});assert.equal(car.result.success,true);assert.equal(car.spent,10000);assert.equal(inv.getInventoryItemQuantity(car.snapshot.playerInventory,'keyItem','sports_car'),1)
 assert.equal(inv.getInventoryItemQuantity(car.snapshot.playerInventory,'keyItem','bicycle'),1,'Old bicycle inventory survives')
 const carStock=JSON.parse(JSON.stringify(car.snapshot.playerInventory))
 assert.equal(inv.getInventoryItemQuantity(inv.sanitizePlayerInventory(carStock),'keyItem','sports_car'),1,'Save reload keeps the permanent car')
 assert.equal(inv.isSellableInventoryItem('keyItem','sports_car'),false)
 for(const options of [{gold:9999},{gold:20000,amount:2},{gold:20000,stock:carStock},{gold:10000,fail:true}]){const r=await buy('keyItem','sports_car',options);assert.equal(r.result.success,false);assert.equal(r.spent,0);assert.equal(r.commits,0)}
 for(const options of [{stock:inventory},{gold:1999},{amount:2},{fail:true}]){const r=await buy('keyItem','bicycle',options);assert.equal(r.result.success,false);assert.equal(r.spent,0);assert.equal(r.commits,0)}
 assert.equal((await buy('battleItem','dynamax_candy')).spent,1000)
 assert.equal((await buy('expPotion','exp_potion_small')).spent,120)
 assert.equal((await buy('expPotion','exp_potion_medium')).spent,300)
 assert.equal((await buy('expPotion','exp_potion_large')).spent,700)
 const superPurchase=await buy('expPotion','exp_potion_super');assert.equal(superPurchase.spent,2000);assert.equal(timber.getTimberVoucherBalance(superPurchase.snapshot.world.timberLeague),0)
 const noVouchers=await buy('expPotion','exp_potion_super',{vouchers:0});assert.equal(noVouchers.commits,0);assert.equal(noVouchers.spent,0)
 assert.equal(rules.getBicycleStepDuration({riding:true}),178)
 assert.equal(rules.getBicycleStepDuration({riding:true,vehicle:'sports_car'}),71)
 for(const options of [{riding:false},{riding:true,fromGrass:true},{riding:true,toGrass:true}])assert.equal(rules.getBicycleStepDuration({...options,vehicle:'sports_car'}),285)
 for(const options of [{riding:false},{riding:true,fromGrass:true},{riding:true,toGrass:true}])assert.equal(rules.getBicycleStepDuration(options),285)
 assert.equal(rules.isBicycleGrassTile('anything',true),true)
 console.log(JSON.stringify({ok:true,checked:['five moderate multipliers, status stacking','no HP/MP refill','cloud and switch persistence','faint and battle-exit cleanup','same-turn attack availability','training and legacy league candy rejection, including queued stale UI','all four healing potions remain usable and count one turn','training bag locks battle items and keeps healing enabled','atomic use and purchases','duplicate bike purchase rejection','inventory survival','grass and speed rules','item asset availability']},null,2))
}, { define: { 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, SSR: true, BASE_URL: '/' }) } })
