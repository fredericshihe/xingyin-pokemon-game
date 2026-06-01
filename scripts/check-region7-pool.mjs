import { MONSTERS } from '../src/utils/gameData.js'
import { getSpeciesLevelBounds } from '../src/utils/wildEncounterRules.js'
const byId=new Map(MONSTERS.map(m=>[m.id,m]))
const name=id=>byId.get(id)?.name??`?${id}?`
// 区域7试炼池条目(从代码中提取)
const entries=[
  {id:23,min:24,max:29},{id:36},{id:47},{id:60},{id:61},
  {id:92,min:24,max:29},{id:95,min:24,max:29},{id:97,min:24,max:27},
  {id:99,min:24,max:29},{id:107,min:24,max:25},{id:111,min:24,max:29},
  {id:117},{id:124,min:24,max:29},{id:125},{id:127},{id:130,min:24,max:29},
  {id:141},{id:133,min:41,max:47}
]
const MAP_MIN=41,MAP_MAX=47
console.log('=== 区域7铁木营地试炼池(地图41-47) ===')
let dead=[]
for(const e of entries){
  const b=getSpeciesLevelBounds(e.id)
  const lo=Math.max(e.min??MAP_MIN,b.min,MAP_MIN)
  const hi=Math.min(e.max??MAP_MAX,b.max,MAP_MAX)
  const isDead=lo>hi
  const decl=e.min?`[${e.min}-${e.max}]`:'[无]'
  console.log(`${isDead?'✗死':'✓'} ${String(e.id).padStart(3)} ${name(e.id).padEnd(6)} 进化[${b.min}-${b.max===100?'∞':b.max}] 声明${decl.padEnd(8)} 刷出[${isDead?'空':lo+'-'+hi}]`)
  if(isDead)dead.push(e)
}
console.log(`\n死配置 ${dead.length} 条:`,dead.map(d=>`${d.id}${name(d.id)}`).join(', '))
