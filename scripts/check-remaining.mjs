import { MONSTERS } from '../src/utils/gameData.js'
import { getSpeciesLevelBounds } from '../src/utils/wildEncounterRules.js'
const byId=new Map(MONSTERS.map(m=>[m.id,m])); const name=id=>byId.get(id)?.name; const typ=id=>{const m=byId.get(id);return [m.type,m.type2].filter(Boolean).join('/')}
const parent=new Map();for(const m of MONSTERS){const evos=[m.evolvesTo,...(m.alternateEvolutions||[])].filter(Boolean);for(const e of evos)if(e.targetId)parent.set(e.targetId,m.id)}
for(const id of [4,5,9,25,26,27,28,37,58,59,69]){
  const m=byId.get(id); const b=getSpeciesLevelBounds(id); const dex=m.dexNo??m.pokedexId
  const p=parent.has(id)?`前置${name(parent.get(id))}(id${parent.get(id)})`:'根形态'
  console.log(`${String(id).padStart(3)} ${name(id).padEnd(6)} dex${dex} ${typ(id).padEnd(14)} 合法[${b.min}-${b.max===100?'∞':b.max}] ${p}`)
}
