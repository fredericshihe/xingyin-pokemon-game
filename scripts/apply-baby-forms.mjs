import fs from 'node:fs'
const file='src/game/data/encounterTables.js'
let txt=fs.readFileSync(file,'utf-8')
// [id, table, minLv, maxLv, weight]
const adds=[
  [112,'region_meadow_east_5_12',5,12,6],      // 魔尼尼 超能妖
  [113,'region_meadow_south_5_12',5,12,6],     // 小卡比兽 普通
  [116,'region_lake_south_11_18',11,18,6],     // 小福蛋 普通
  [120,'region_meadow_5_12',5,12,6],           // 盆才怪 岩石
  [121,'region_lake_11_18',11,18,6],           // 无畏小子 格斗
  [93,'region_shore_23_30',23,29,6],           // 迷唇娃 冰超
  [130,'region_shore_wreck_23_30',23,29,6],    // 幼基拉斯 岩地
  [141,'region_ridge_41_47',41,47,6],          // 战舞郎 格斗
]
let applied=0
for(const [id,table,mn,mx,w] of adds){
  const re=new RegExp(`(${table}:\\s*\\{[\\s\\S]*?pokemon:\\s*\\[\\n)`)
  const m=txt.match(re); if(!m){console.log(`✗ ${id}@${table} 未找到`);continue}
  txt=txt.replace(re,m[1]+`      { id: ${id}, minLevel: ${mn}, maxLevel: ${mx}, weight: ${w} },\n`)
  applied++
}
fs.writeFileSync(file,txt)
console.log(`✓ 插入 ${applied}/8 只baby形态`)
