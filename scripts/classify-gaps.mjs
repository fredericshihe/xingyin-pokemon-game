import { MONSTERS } from '../src/utils/gameData.js'
const byId=new Map(MONSTERS.map(m=>[m.id,m]))
const gaps=[57,32,48,49,22,23,56,65,20,10,52,61,60,25,69,83,84,85,90,91,92,93,94,95,97,107,110,111,112,113,116,117,120,121,122,124,125,127,130,138,141,158]
const gen1=[], nongen1=[], legend=[]
for(const id of gaps){const m=byId.get(id);const dex=m.dexNo??m.pokedexId;const isLegend=[25,26,27,68,69].includes(id)
  const info=`${id} ${m.name}(dex${dex})`
  if(isLegend) legend.push(info)
  else if(dex<=151) gen1.push(info); else nongen1.push(info)}
console.log('初代(dex≤151)根形态缺口 — 应补野生:', gen1.length)
console.log('  '+gen1.join('\n  '))
console.log('\n传说(三神鸟/超梦/梦幻) — 特殊处理:', legend.join(', '))
console.log('\n非初代(dex>151) — 本次可选:', nongen1.length)
console.log('  '+nongen1.join('\n  '))
