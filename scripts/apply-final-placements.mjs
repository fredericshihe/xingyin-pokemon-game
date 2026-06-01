import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
const __dirname=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(__dirname,'..')
const file=path.join(root,'src/game/data/encounterTables.js')
let txt=fs.readFileSync(file,'utf-8')
// 根/baby形态补入 + 传说稀有(低权重)
const adds=[
  [4,'region_grave_moon_29_36',29,29,6],     // 皮卡丘 电 →顺带解锁雷丘
  [5,'region_lake_east_11_18',12,18,8],       // 呆呆兽 水超 →顺带呆壳兽
  [9,'region_peak_52_60',52,60,6],            // 拉普拉斯 水冰(终局)
  [92,'region_ruin_east_35_42',35,39,6],      // 电击怪 →电击兽
  [95,'region_ruin_35_42',35,39,6],           // 鸭嘴宝宝 →鸭嘴火兽
  [26,'region_peak_south_52_60',55,60,3],     // 急冻鸟(传说,低权重)
  [27,'region_peak_east_52_60',55,60,3],      // 闪电鸟
  [25,'region_peak_52_60',55,60,3],           // 火焰鸟
]
let applied=0,failed=[]
for(const [id,table,mn,mx,w] of adds){
  const re=new RegExp(`(${table}:\\s*\\{[\\s\\S]*?pokemon:\\s*\\[\\n)`)
  const m=txt.match(re); if(!m){failed.push(`${id}@${table}`);continue}
  txt=txt.replace(re,m[1]+`      { id: ${id}, minLevel: ${mn}, maxLevel: ${mx}, weight: ${w} },\n`)
  applied++
}
fs.writeFileSync(file,txt)
console.log(`✓ 插入 ${applied} 条`, failed.length?`✗失败:${failed.join(',')}`:'')
