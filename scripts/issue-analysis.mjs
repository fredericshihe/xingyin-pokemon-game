import fs from 'node:fs'
const maps = fs.readFileSync('src/game/data/godotMaps/godot_region_maps.js', 'utf-8')

console.log('# 发现的关键问题\n')

console.log('## 问题1: 试炼池配置错误 - 所有区域使用相同池')
console.log('当前所有8个区域的 challengeRarePool 都显示相同的9只宝可梦：')
console.log('杰尼龟, 魔尼尼, 小卡比兽, 小福蛋, 盆才怪, 无畏小子, 卡蒂狗, 巴大蝶, 大针蜂')
console.log('\n这是因为脚本解析错误。让我检查实际配置...\n')

// 精确提取每个区域的试炼池
const regions = [
  'GodotMapV2',
  'GodotMapV2_MistLake', 
  'GodotMapV2_FarmTown',
  'GodotMapV2_PirateShore',
  'GodotMapV2_Graveyard',
  'GodotMapV2_HexRuins',
  'GodotMapV2_SurvivalRidge',
  'GodotMapV2_BossHighland'
]

for (const region of regions) {
  const start = maps.indexOf(`${region}: {`)
  if (start === -1) continue
  const slice = maps.slice(start, start + 3000)
  const match = slice.match(/challengeRarePool:\s*\[([\s\S]*?)\],/)
  if (match) {
    const pool = match[1].replace(/\s+/g, ' ').substring(0, 200)
    console.log(`${region}: ${pool}...`)
  }
}

console.log('\n## 问题2: 训练师池配置错误 - 所有区域使用相同池')
console.log('所有区域的 speciesPool 都显示相同的12只，这也是解析错误\n')

for (const region of regions) {
  const start = maps.indexOf(`${region}: {`)
  if (start === -1) continue
  const slice = maps.slice(start, start + 3000)
  const match = slice.match(/speciesPool:\s*\[([^\]]+)\]/)
  if (match) {
    console.log(`${region}: [${match[1].trim().substring(0, 100)}...]`)
  }
}

console.log('\n## 问题3: Boss配置错误 - 所有区域显示相同Boss')
console.log('所有区域都显示"小火龙"，这也是解析问题\n')

for (const region of regions) {
  const start = maps.indexOf(`${region}: {`)
  if (start === -1) continue  
  const slice = maps.slice(start, start + 3000)
  const match = slice.match(/bossRarePokemon:\s*\{\s*pokemonId:\s*(\d+)/)
  if (match) {
    console.log(`${region}: Boss稀有 pokemonId=${match[1]}`)
  }
}
