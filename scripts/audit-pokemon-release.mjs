import assert from 'node:assert/strict'
import fs from 'node:fs'
import { withViteAuditServer } from './load-vite-module.mjs'

await withViteAuditServer(async ({loadModule}) => {
  const {MONSTERS}=await loadModule('/src/utils/gameData.js')
  const {getPokemonReleaseQuote,preparePokemonRelease}=await loadModule('/src/utils/pokemonRelease.js')
  const catalog=JSON.parse(fs.readFileSync('src/utils/pokemonReleaseCatalog.json','utf8'))
  assert.equal(catalog.species.length,MONSTERS.length)
  assert.equal(new Set(catalog.species.map(m=>m.baseId)).size,MONSTERS.length)
  assert.equal(new Set(catalog.species.map(m=>m.dexNo)).size,MONSTERS.length)
  const migration=fs.readFileSync('supabase/migrations/202610100001_pokemon_release_compensation.sql','utf8')
  for(const species of MONSTERS) {
    const fixed=catalog.species.find(m=>m.baseId===species.id)
    assert.equal(fixed.dexNo,species.dexNo)
    const tier=catalog.tiers[fixed.tier]
    assert.ok(migration.includes(`(${species.id},${species.dexNo},'${species.name}','${fixed.tier}','${tier.label}',${tier.multiplier})`),'backend catalog mismatch')
    for(let level=1;level<=100;level++) {
      const quote=getPokemonReleaseQuote({...species,baseId:species.id,id:'instance-1',level})
      assert.equal(quote.gold,Math.floor(((50+level*5)*tier.multiplier)/10+.5)*10)
    }
  }
  const partner=(dexNo,id,level)=>{const m=MONSTERS.find(m=>m.dexNo===dexNo);return {...m,id,baseId:m.id,level}}
  for (const [dex,level,gold] of [[129,10,100],[25,80,680],[149,80,1130],[151,100,2200],[144,80,1800]])
    assert.equal(getPokemonReleaseQuote(partner(dex,'p1',level)).gold,gold)
  const old={view:'team',playerGold:500,playerTeam:[partner(129,'p1',10),partner(25,'p2',50)],storageBox:[partner(149,'s1',80)],activePlayerId:'p1',world:{dexProgress:{registeredSpeciesKeys:['dex:129']}},playerInventory:[{itemKey:'hp_stone',quantity:8}],pendingMonsterAcquisition:{monster:partner(151,'pending1',100)}}
  const immutable=JSON.stringify(old)
  for(const [id,from,gold] of [['p1','party',100],['s1','storage',1130],['pending1','pending',2200]]) {
    const result=preparePokemonRelease(old,id,from,gold)
    assert.equal(result.success,true)
    assert.equal(result.snapshot.playerGold,500,'frontend must not pay before server acknowledgement')
    assert.deepEqual(result.snapshot.world,old.world)
    assert.deepEqual(result.snapshot.playerInventory,old.playerInventory)
    assert.equal(JSON.stringify(old),immutable,'preview mutated live snapshot')
    assert.equal(preparePokemonRelease(result.snapshot,id,from,gold).success,false)
    assert.equal(preparePokemonRelease({...old,activeEnemyId:'enemy1'},id,from,gold).success,false)
    assert.equal(preparePokemonRelease({...old,view:'battle'},id,from,gold).success,false)
    assert.equal(preparePokemonRelease(old,id,from,gold+10).success,false)
  }
  assert.equal(preparePokemonRelease({...old,playerTeam:[old.playerTeam[0]]},'p1','party',100).success,false)
  const legacy={...old.playerTeam[0]}; delete legacy.baseId
  assert.equal(getPokemonReleaseQuote(legacy).gold,100,'legacy dex identity')
  assert.equal(getPokemonReleaseQuote({...legacy,dexNo:999999}),null)
  assert.equal(getPokemonReleaseQuote({...old.playerTeam[0],dexNo:151}),null)
  assert.equal(getPokemonReleaseQuote({...old.playerTeam[0],level:101}),null)
  console.log(`Release audit passed: ${MONSTERS.length} species × 100 levels; legacy identity, all sources, battle guards, quote changes, no local payout and snapshot preservation.`)
})
