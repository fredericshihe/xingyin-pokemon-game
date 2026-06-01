import { MONSTERS } from '../src/utils/gameData.js'
import fs from 'node:fs'

const byId = new Map(MONSTERS.map(m => [m.id, m]))
const name = id => byId.get(id)?.name ?? `?${id}?`

// 定义稀有度分类
const LEGENDARY = [25, 26, 27, 68, 69] // 三神鸟, 超梦, 梦幻
const PSEUDO_LEGENDARY = [129, 130, 131, 142] // 快龙线, 班基拉斯线
const RARE_EVOLVED = [123, 150, 153, 164, 180, 182, 187] // 巴大蝶, 大针蜂, 大比鸟, 尼多后, 大食花, 毒刺水母, 金鱼王等终极进化
const MID_EVOLVED = [118, 149, 152, 155, 157, 159, 161, 163, 166, 168, 171, 173, 175, 177, 179] // 中间进化形态
const STARTERS = [1, 2, 3, 71, 72, 73, 74, 75, 76] // 御三家全线
const RARE_BASE = [4, 10, 52, 65, 83, 84, 85, 90, 91, 188] // 皮卡丘, 卡比兽, 吉利蛋, 3D龙, 卡蒂狗, 六尾, 小火马, 小磁怪, 霹雳电球, 百变怪

const file = 'src/game/data/encounterTables.js'
let txt = fs.readFileSync(file, 'utf-8')

console.log('=== 调整野生遭遇权重 ===\n')
console.log('权重梯度:')
console.log('- 传说/准神: 2-3 (ultra-rare)')
console.log('- 稀有进化形态: 4-5 (rare)')
console.log('- 中间进化: 6-8 (uncommon)')
console.log('- 稀有基础: 6-8 (uncommon)')
console.log('- 普通基础: 10-15 (common)\n')

let adjusted = 0

// 调整传说宝可梦权重为2-3
for (const id of LEGENDARY) {
  const re = new RegExp(`(\\{\\s*id:\\s*${id}\\s*,\\s*minLevel:[^}]*?weight:\\s*)\\d+`, 'g')
  const matches = txt.match(re)
  if (matches) {
    txt = txt.replace(re, '$1' + (id === 69 ? 2 : 3)) // 梦幻最稀有
    adjusted += matches.length
    console.log(`  ${name(id)} → 权重${id === 69 ? 2 : 3}`)
  }
}

// 调整准神权重为3
for (const id of PSEUDO_LEGENDARY) {
  const re = new RegExp(`(\\{\\s*id:\\s*${id}\\s*,\\s*minLevel:[^}]*?weight:\\s*)\\d+`, 'g')
  const matches = txt.match(re)
  if (matches) {
    txt = txt.replace(re, '$13')
    adjusted += matches.length
    console.log(`  ${name(id)} → 权重3`)
  }
}

// 调整稀有进化形态权重为4-5
for (const id of RARE_EVOLVED) {
  const re = new RegExp(`(\\{\\s*id:\\s*${id}\\s*,\\s*minLevel:[^}]*?weight:\\s*)\\d+`, 'g')
  const matches = txt.match(re)
  if (matches) {
    txt = txt.replace(re, '$15')
    adjusted += matches.length
    console.log(`  ${name(id)} → 权重5`)
  }
}

// 调整中间进化权重为6-7
for (const id of MID_EVOLVED) {
  const re = new RegExp(`(\\{\\s*id:\\s*${id}\\s*,\\s*minLevel:[^}]*?weight:\\s*)\\d+`, 'g')
  const matches = txt.match(re)
  if (matches) {
    txt = txt.replace(re, '$17')
    adjusted += matches.length
  }
}

// 调整稀有基础形态权重为6-8
for (const id of RARE_BASE) {
  const re = new RegExp(`(\\{\\s*id:\\s*${id}\\s*,\\s*minLevel:[^}]*?weight:\\s*)\\d+`, 'g')
  const matches = txt.match(re)
  if (matches) {
    txt = txt.replace(re, '$17')
    adjusted += matches.length
    console.log(`  ${name(id)} → 权重7`)
  }
}

fs.writeFileSync(file, txt)
console.log(`\n✓ 调整了 ${adjusted} 处权重`)
