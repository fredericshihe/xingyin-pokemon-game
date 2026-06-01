import { MONSTERS } from '../src/utils/gameData.js'
import { getSpeciesLevelBounds } from '../src/utils/wildEncounterRules.js'
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
const __dirname=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(__dirname,'..')
const byId=new Map(MONSTERS.map(m=>[m.id,m])); const name=id=>byId.get(id)?.name??`?${id}?`
const typ=id=>{const m=byId.get(id);return m?[m.type,m.type2].filter(Boolean).join('/'):'?'}
const enc=fs.readFileSync(path.join(root,'src/game/data/encounterTables.js'),'utf-8')
const maps=fs.readFileSync(path.join(root,'src/game/data/godotMaps/godot_region_maps.js'),'utf-8')
const wild=new Set(); for(const m of enc.split('region_').slice(1).join('region_').matchAll(/\bid:\s*(\d+)\s*,\s*minLevel/g))wild.add(+m[1])
const bossRare=new Set(); for(const m of maps.matchAll(/bossRarePokemon:\s*\{\s*pokemonId:\s*(\d+)/g))bossRare.add(+m[1])
const REGION_RANGES={GodotMapV2:[5,12],GodotMapV2_MistLake:[11,18],GodotMapV2_FarmTown:[17,24],GodotMapV2_PirateShore:[23,30],GodotMapV2_Graveyard:[29,36],GodotMapV2_HexRuins:[35,42],GodotMapV2_SurvivalRidge:[41,47],GodotMapV2_BossHighland:[52,60]}
const trial=new Set()
for(const [mapId,[mn,mx]] of Object.entries(REGION_RANGES)){const s=maps.search(new RegExp(`${mapId}:\\s*\\{`));if(s<0)continue;const slice=maps.slice(s,s+2200);const pm=slice.match(/challengeRarePool:\s*\[([\s\S]*?)\]/);if(!pm)continue;const body=pm[1];const objs=[...body.matchAll(/\{\s*pokemonId:\s*(\d+)[^}]*?\}/g)].map(o=>({id:+o[1],min:(o[0].match(/minLevel:\s*(\d+)/)||[])[1],max:(o[0].match(/maxLevel:\s*(\d+)/)||[])[1]}));const objIds=new Set(objs.map(o=>o.id));const plain=[...body.matchAll(/(?:^|[,[\s])(\d+)(?=\s*[,\]])/g)].map(p=>+p[1]).filter(id=>!objIds.has(id));for(const e of [...objs,...plain.map(id=>({id,min:null,max:null}))]){const b=getSpeciesLevelBounds(e.id);const lo=Math.max(e.min?+e.min:mn,b.min,mn),hi=Math.min(e.max?+e.max:mx,b.max,mx);if(lo<=hi)trial.add(e.id)}}
const starters=new Set([1,2,3])
const direct=new Set([...wild,...bossRare,...trial,...starters])
const evoFrom=new Map();for(const m of MONSTERS){const evos=[m.evolvesTo,...(m.alternateEvolutions||[])].filter(Boolean);for(const e of evos)if(e.targetId){if(!evoFrom.has(m.id))evoFrom.set(m.id,[]);evoFrom.get(m.id).push(e.targetId)}}
const obtainable=new Set(direct);let ch=true;while(ch){ch=false;for(const id of [...obtainable])for(const t of(evoFrom.get(id)||[]))if(!obtainable.has(t)){obtainable.add(t);ch=true}}
// 前置形态映射
const parent=new Map();for(const m of MONSTERS){const evos=[m.evolvesTo,...(m.alternateEvolutions||[])].filter(Boolean);for(const e of evos)if(e.targetId)parent.set(e.targetId,m.id)}
const notObtain=MONSTERS.map(m=>m.id).filter(id=>!obtainable.has(id))
const REGS=[['星音',5,12],['雾湖',11,18],['农庄',17,24],['海岸',23,30],['墓园',29,36],['遗迹',35,42],['营地',41,47],['高地',52,60]]
console.log('=== 无法获得且为"根/前置不可得"的宝可梦 → 需放入野生表 ===')
for(const id of notObtain){
  const isBase=!parent.has(id) || !obtainable.has(parent.get(id))
  const b=getSpeciesLevelBounds(id)
  const fit=REGS.filter(([,mn,mx])=>!(b.max<mn||b.min>mx)).map(r=>r[0]).join('/')
  const pinfo=parent.has(id)?`前置${name(parent.get(id))}(${obtainable.has(parent.get(id))?'可得':'不可得'})`:'根形态'
  console.log(`  ${String(id).padStart(3)} ${name(id).padEnd(6)} ${typ(id).padEnd(14)} 合法[${b.min}-${b.max===100?'∞':b.max}] ${pinfo.padEnd(16)} 可落:${fit}`)
}
