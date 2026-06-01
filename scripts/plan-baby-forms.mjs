import { MONSTERS } from '../src/utils/gameData.js'
import { getSpeciesLevelBounds } from '../src/utils/wildEncounterRules.js'
const byId=new Map(MONSTERS.map(m=>[m.id,m]))
const name=id=>byId.get(id)?.name
const typ=id=>{const m=byId.get(id);return [m.type,m.type2].filter(Boolean).join('/')}
// 剩余8只非初代baby/前置
const gaps=[93,112,113,116,120,121,130,141]
console.log('=== 剩余8只非初代 → 落点规划 ===')
for(const id of gaps){
  const b=getSpeciesLevelBounds(id)
  const m=byId.get(id); const dex=m.dexNo??m.pokedexId
  // 推荐区域
  let rec=''; if(b.max<20)rec='星音/雾湖'; else if(b.max<30)rec='农庄/海岸'; else if(b.max<40)rec='墓园/遗迹'; else rec='营地/高地'
  console.log(`${String(id).padStart(3)} ${name(id).padEnd(6)} dex${String(dex).padStart(3)} ${typ(id).padEnd(14)} 合法[${b.min}-${b.max===100?'∞':b.max}] 推荐:${rec}`)
}
