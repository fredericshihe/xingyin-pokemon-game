import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
const __dirname=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(__dirname,'..')
const file=path.join(root,'src/game/data/encounterTables.js')
let txt=fs.readFileSync(file,'utf-8')

// [id, tableId, minLevel, maxLevel, weight]  (等级取区域内合法区间)
const adds=[
  [158,'region_farm_17_24',17,21,10],
  [20,'region_farm_west_17_24',17,24,10],   // 鬼斯改农庄
  [83,'region_shore_23_30',23,29,8],
  [84,'region_shore_south_23_30',23,29,8],
  [85,'region_ruin_35_42',35,39,8],
  [90,'region_shore_wreck_23_30',23,29,8],
  [91,'region_grave_29_36',29,29,6],
  [97,'region_farm_east_17_24',17,24,10],
  [107,'region_farm_17_24',17,24,8],
  [110,'region_lake_11_18',11,15,8],
  [22,'region_shore_23_30',23,30,8],
  [23,'region_farm_17_24',17,24,8],
  [65,'region_shore_23_30',23,29,6],
  [56,'region_ruin_35_42',35,41,8],
  [32,'region_grave_29_36',29,35,8],
  [48,'region_grave_south_29_36',29,36,8],
  [49,'region_ridge_41_47',41,47,8],
  [10,'region_ridge_east_41_47',41,47,8],
  [52,'region_shore_south_23_30',23,29,6],
  [61,'region_ridge_41_47',41,47,8],
  [60,'region_ruin_east_35_42',35,42,8],
  [124,'region_grave_moon_29_36',29,29,8],
  [57,'region_peak_52_60',52,60,8],
]

let applied=0, failed=[]
for(const [id,table,mn,mx,w] of adds){
  // 定位 table 的 pokemon: [ ，在其后插入一行
  const re=new RegExp(`(${table}:\\s*\\{[\\s\\S]*?pokemon:\\s*\\[\\n)`)
  const m=txt.match(re)
  if(!m){ failed.push(`${id}@${table} 未找到表`); continue }
  const entry=`      { id: ${id}, minLevel: ${mn}, maxLevel: ${mx}, weight: ${w} },\n`
  txt=txt.replace(re, m[1]+entry)
  applied++
}
fs.writeFileSync(file,txt)
console.log(`✓ 插入 ${applied} 条`, failed.length?`\n✗ 失败: ${failed.join('; ')}`:'')
