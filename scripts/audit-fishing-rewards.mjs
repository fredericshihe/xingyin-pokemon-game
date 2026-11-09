import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FISHING_CATCHES, FISHING_MERCHANTS } from '../src/game/fishingCatalog.js'
import { getFishingComboReward, previewFishingAppraisal } from '../src/game/fishingRewards.js'
import { getFishingBasketRows, getFishingSaleTotals, normalizeFishingState } from '../src/game/fishingRules.js'
import { withViteAuditServer } from './load-vite-module.mjs'

assert.deepEqual(Array.from({ length:10 },(_,i)=>getFishingComboReward(i+1,false)),[0,1,2,3,4,5,6,7,8,8])
assert.deepEqual(Array.from({ length:10 },(_,i)=>getFishingComboReward(i+1,true)),[0,2,3,5,6,8,9,11,12,12])
assert.equal(Array.from({length:10},(_,i)=>getFishingComboReward(i+1,false)).reduce((a,b)=>a+b,0),44)
for(const item of Object.values(FISHING_CATCHES).filter(item=>item.kind==='treasure')) assert.equal('price' in item,false,'Treasure catalogue must not disclose fixed prices')
const buckets={}
for(let i=0;i<10000;i++) {
  const outcome=previewFishingAppraisal(730,(i+.5)/10000,.5)
  buckets[outcome.appraisalGrade]=(buckets[outcome.appraisalGrade]||0)+1
}
assert.deepEqual(buckets,{ordinary:5000,great:3000,precious:1500,exquisite:400,legendary:100})
const snapshot=normalizeFishingState({fishingVersion:2,hasRod:true,catches:{c01:3,t01:999},treasures:[
  {id:'00000000-0000-0000-0000-000000000001',catchId:'t01'},
  {id:'00000000-0000-0000-0000-000000000002',catchId:'t01',appraisalGrade:'great',price:52},
  {id:'00000000-0000-0000-0000-000000000003',catchId:'t01',appraisalGrade:'legendary',price:1100},
  {id:'00000000-0000-0000-0000-000000000008',catchId:'t08',appraisalGrade:'exquisite',price:5000},
  {id:'00000000-0000-0000-0000-000000000001',catchId:'t01',price:99999},
  {id:'malformed',catchId:'t01',price:99999}
]})
assert.equal(snapshot.catches.t01,3)
assert.equal(snapshot.treasures.length,4)
assert.equal('price' in snapshot.treasures[0],false)
assert.deepEqual(normalizeFishingState(snapshot),snapshot,'Normalization must preserve instance identities and prices')
const rows=getFishingBasketRows(snapshot)
assert.equal(rows.filter(row=>row.id==='t01').length,3,'Different appraisals require separate sale rows')
assert.deepEqual(getFishingSaleTotals(rows,FISHING_MERCHANTS.valley),{quantity:5,gold:1188})
assert.deepEqual(getFishingSaleTotals(rows,FISHING_MERCHANTS.shore),{quantity:6,gold:6188})

await withViteAuditServer(async({loadModule})=>{
  const [logs,{GameplayLogList},{default:FishingPanel}]=await Promise.all([
    loadModule('/src/utils/gameplayLogs.js'),loadModule('/src/components/Teacher/Dashboard.jsx'),loadModule('/src/components/Game/FishingPanel.jsx')
  ])
  for(const type of ['purchase','start','settle','cancel','expired','appraise','sell']) assert.equal(logs.getGameplayLogEventMeta(`fishing_${type}`).category,'fishing')
  assert.ok(logs.GAMEPLAY_LOG_FILTERS.some(filter=>filter.id==='fishing'))
  const records=[{id:'combo',event_type:'fishing_settle',title:'钓获鱼获',summary:'连续命中3次，奖励3金币，其中完美加成1金币。',created_at:new Date().toISOString(),map_display_name:'新手山谷',details:{result:{catchId:'c01',hitStreak:3,perfectBonusGold:1,bonusGold:3},spotName:'营地南池'}},
    {id:'appraisal',event_type:'fishing_appraise',title:'宝藏鉴定',created_at:new Date().toISOString(),details:{result:{catchId:'t08',appraised:true,appraisalGrade:'legendary',price:21900}}}]
  const rendered=renderToStaticMarkup(React.createElement(GameplayLogList,{logs:records,emptyText:'空'}))
  assert.ok(rendered.includes('连续命中 ×3')&&rendered.includes('21900'))
  assert.ok(!rendered.includes('[object Object]'))
  const panel=renderToStaticMarkup(React.createElement(FishingPanel,{state:snapshot,mode:'market',currentMapId:FISHING_MERCHANTS.shore.mapId,merchantId:'shore'}))
  assert.ok(panel.includes('6188')||panel.includes('6,188'))
  assert.ok(panel.includes('待鉴定'))
  assert.ok(!panel.includes('40 金币 / 件')&&!panel.includes('730 金币 / 件'))
}, {define:{'import.meta.env':JSON.stringify({DEV:false,PROD:true,SSR:true,BASE_URL:'/',VITE_SUPABASE_URL:'https://example.invalid',VITE_SUPABASE_ANON_KEY:'isolated-audit-placeholder'})}})
console.log('Fishing rewards audit passed: combo schedule, hidden treasure prices, independent sale rows, exact probability buckets and teacher rendering.')
