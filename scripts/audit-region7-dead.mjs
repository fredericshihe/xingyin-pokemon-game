import { getSpeciesLevelBounds } from '../src/utils/wildEncounterRules.js'
import fs from 'node:fs'
const maps=fs.readFileSync('src/game/data/godotMaps/godot_region_maps.js','utf-8')
const r7Start=maps.search(/GodotMapV2_SurvivalRidge:\s*\{/)
const r7Slice=maps.slice(r7Start,r7Start+2500)
const poolMatch=r7Slice.match(/challengeRarePool:\s*\[([\s\S]*?)\]/)
if(!poolMatch){console.log('未找到区域7试炼池');process.exit(1)}
const body=poolMatch[1]
// 解析对象条目
const objs=[...body.matchAll(/\{\s*pokemonId:\s*(\d+)[^}]*?\}/g)].map(o=>{
  const id=+o[1]
  const minM=o[0].match(/minLevel:\s*(\d+)/); const maxM=o[0].match(/maxLevel:\s*(\d+)/)
  return {id, declMin:minM?+minM[1]:null, declMax:maxM?+maxM[1]:null, raw:o[0]}
})
const objIds=new Set(objs.map(o=>o.id))
const plain=[...body.matchAll(/(?:^|[,[\s])(\d+)(?=\s*[,\]])/g)].map(p=>+p[1]).filter(id=>!objIds.has(id))
const MAP_MIN=41, MAP_MAX=47
console.log('=== 区域7铁木营地 试炼池条目(地图41-47) ===')
let dead=[]
for(const e of [...objs,...plain.map(id=>({id,declMin:null,declMax:null,raw:id}))]){
  const b=getSpeciesLevelBounds(e.id)
  const lo=Math.max(e.declMin??MAP_MIN, b.min, MAP_MIN)
  const hi=Math.min(e.declMax??MAP_MAX, b.max, MAP_MAX)
  const isDead=lo>hi
  const decl=e.declMin?`声明[${e.declMin}-${e.declMax}]`:'声明[无]'
  console.log(`${isDead?'✗死配置':'✓有效'} id${String(e.id).padStart(3)} 进化合法[${b.min}-${b.max===100?'∞':b.max}] ${decl} 刷出[${isDead?'空':lo+'-'+hi}]`)
  if(isDead)dead.push(e)
}
console.log(`\n死配置${dead.length}条，需清理:`, dead.map(d=>d.id).join(','))
