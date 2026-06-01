import { MONSTERS } from '../src/utils/gameData.js'
import { getSpeciesLevelBounds } from '../src/utils/wildEncounterRules.js'
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname,'..')
const byId = new Map(MONSTERS.map(m=>[m.id,m]))
const name = id => byId.get(id)?.name ?? `?${id}?`

const enc = fs.readFileSync(path.join(root,'src/game/data/encounterTables.js'),'utf-8')
const maps = fs.readFileSync(path.join(root,'src/game/data/godotMaps/godot_region_maps.js'),'utf-8')

// 直接捕捉: 野生表
const wild = new Set()
for (const m of enc.split('region_').slice(1).join('region_').matchAll(/\bid:\s*(\d+)\s*,\s*minLevel/g)) wild.add(+m[1])
// Boss稀有
const bossRare = new Set()
for (const m of maps.matchAll(/bossRarePokemon:\s*\{\s*pokemonId:\s*(\d+)/g)) bossRare.add(+m[1])
// 试炼 (粗略:出现在challengeRarePool)
const REGION_RANGES={GodotMapV2:[5,12],GodotMapV2_MistLake:[11,18],GodotMapV2_FarmTown:[17,24],GodotMapV2_PirateShore:[23,30],GodotMapV2_Graveyard:[29,36],GodotMapV2_HexRuins:[35,42],GodotMapV2_SurvivalRidge:[41,47],GodotMapV2_BossHighland:[52,60]}
const trial = new Set()
for (const [mapId,[mn,mx]] of Object.entries(REGION_RANGES)){
  const s = maps.search(new RegExp(`${mapId}:\\s*\\{`)); if(s<0)continue
  const slice = maps.slice(s,s+2200); const pm = slice.match(/challengeRarePool:\s*\[([\s\S]*?)\]/); if(!pm)continue
  const body=pm[1]
  const objs=[...body.matchAll(/\{\s*pokemonId:\s*(\d+)[^}]*?\}/g)].map(o=>({id:+o[1],min:(o[0].match(/minLevel:\s*(\d+)/)||[])[1],max:(o[0].match(/maxLevel:\s*(\d+)/)||[])[1]}))
  const objIds=new Set(objs.map(o=>o.id))
  const plain=[...body.matchAll(/(?:^|[,[\s])(\d+)(?=\s*[,\]])/g)].map(p=>+p[1]).filter(id=>!objIds.has(id))
  for(const e of [...objs,...plain.map(id=>({id,min:null,max:null}))]){
    const b=getSpeciesLevelBounds(e.id)
    const lo=Math.max(e.min?+e.min:mn,b.min,mn), hi=Math.min(e.max?+e.max:mx,b.max,mx)
    if(lo<=hi) trial.add(e.id)
  }
}
// 御三家初始可选
const starters = new Set([1,2,3])

// 直接获得集合
let direct = new Set([...wild,...bossRare,...trial,...starters])
// 迭代: 任何"可获得"宝可梦的进化目标也可获得(通过进化)
const evoFrom = new Map() // parent -> [targets]
for(const m of MONSTERS){
  const evos=[m.evolvesTo,...(m.alternateEvolutions||[])].filter(Boolean)
  for(const e of evos) if(e.targetId){ if(!evoFrom.has(m.id))evoFrom.set(m.id,[]); evoFrom.get(m.id).push(e.targetId) }
}
const obtainable = new Set(direct)
let changed=true
while(changed){ changed=false
  for(const id of [...obtainable]) for(const t of (evoFrom.get(id)||[])) if(!obtainable.has(t)){obtainable.add(t);changed=true}
}
const all = MONSTERS.map(m=>m.id)
const notObtain = all.filter(id=>!obtainable.has(id)).sort((a,b)=>a-b)
console.log('直接捕捉/试炼/Boss/御三家:', direct.size)
console.log('含进化可获得:', obtainable.size, '/', MONSTERS.length)
console.log(`\n仍无法获得 (${notObtain.length}只):`)
notObtain.forEach(id=>console.log(`  ${String(id).padStart(3)} ${name(id)}`))

// 初代151可获得性
const gen1Obtain = MONSTERS.filter(m=>obtainable.has(m.id) && (m.dexNo??m.pokedexId)<=151)
const gen1Total = MONSTERS.filter(m=>(m.dexNo??m.pokedexId)<=151)
console.log(`\n初代151可获得: ${gen1Obtain.length}/${gen1Total.length}`)
