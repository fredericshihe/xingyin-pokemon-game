import { MONSTERS } from '../src/utils/gameData.js'
import { getSpeciesLevelBounds } from '../src/utils/wildEncounterRules.js'
const byId=new Map(MONSTERS.map(m=>[m.id,m])); const name=id=>byId.get(id)?.name
// 初代根形态缺口 → 指定落点区域表(按主题+合法等级)
// 表id: meadow/lake/farm/shore/grave/ruin/ridge/peak  + zone
const place = {
  158:'region_farm_17_24',      // 阿柏蛇 毒 Lv≤21
  20:'region_grave_29_36',      // 鬼斯 幽灵 Lv≤24 → 但墓园29起>24! 需农庄
  83:'region_shore_23_30',      // 卡蒂狗 火 Lv≤29
  84:'region_shore_south_23_30',// 六尾 火 Lv≤29
  85:'region_ruin_35_42',       // 小火马 火 Lv≤39
  90:'region_shore_wreck_23_30',// 小磁怪 电钢 Lv≤29
  91:'region_grave_29_36',      // 霹雳电球 电 Lv≤29 → 墓园29>... 合法≤29 ok 29
  97:'region_farm_east_17_24',  // 猴怪 格斗 Lv≤27
  107:'region_farm_17_24',      // 催眠貘 超能 Lv≤25
  110:'region_lake_11_18',      // 凯西 超能 Lv≤15
  22:'region_shore_23_30',      // 大岩蛇 岩地 Lv≤35
  23:'region_farm_17_24',       // 飞天螳螂 虫飞 Lv≤29
  65:'region_shore_23_30',      // 3D龙 普通 Lv≤29
  56:'region_ruin_35_42',       // 魔墙人偶 超能妖 Lv≤41
  32:'region_grave_29_36',      // 火爆猴 格斗 Lv≤35
  48:'region_grave_south_29_36',// 飞腿郎 格斗
  49:'region_ridge_41_47',      // 快拳郎 格斗
  10:'region_ridge_east_41_47', // 卡比兽 普通
  52:'region_shore_south_23_30',// 吉利蛋 普通 Lv≤29
  61:'region_ridge_41_47',      // 肯泰罗 普通
  60:'region_ruin_east_35_42',  // 大甲 虫
  124:'region_grave_moon_29_36',// 大舌头 普通 Lv≤29
  57:'region_peak_52_60',       // 迷唇姐 冰超 Lv30+
}
const REGION_MIN={region_meadow:5,region_lake:11,region_farm:17,region_shore:23,region_grave:29,region_ruin:35,region_ridge:41,region_peak:52}
const REGION_MAX={region_meadow:12,region_lake:18,region_farm:24,region_shore:30,region_grave:36,region_ruin:42,region_ridge:47,region_peak:60}
const keyOf=t=>Object.keys(REGION_MIN).find(k=>t.startsWith(k))
let bad=0
for(const [id,table] of Object.entries(place)){
  const b=getSpeciesLevelBounds(+id); const k=keyOf(table)
  const lo=Math.max(b.min,REGION_MIN[k]), hi=Math.min(b.max,REGION_MAX[k])
  const ok=lo<=hi
  if(!ok)bad++
  console.log(`${ok?'✓':'✗'} ${String(id).padStart(3)} ${name(+id).padEnd(6)} → ${table} 刷出[${ok?lo+'-'+hi:'空!'}]`)
}
console.log(bad?`\n⚠️ ${bad}处落点等级为空,需调整`:'\n✅ 全部落点等级有效')
