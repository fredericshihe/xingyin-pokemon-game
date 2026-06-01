import { MOVES } from '../src/utils/gameData.js'
import fs from 'node:fs'
const block = fs.readFileSync('/tmp/new_monsters_block.txt','utf-8')
const used = new Set()
for (const m of block.matchAll(/'([a-z_]+)'/g)) used.add(m[1])
const missing = [...used].filter(k => !MOVES[k])
console.log('新定义引用的技能:', [...used].sort().join(', '))
console.log('\n缺失(MOVES中不存在)的技能:', missing.length ? missing.join(', ') : '无 ✓')
