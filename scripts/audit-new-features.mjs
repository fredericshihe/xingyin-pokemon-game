import fs from 'node:fs'

console.log('=== 新功能合理性与隐蔽性审查 ===\n')

const maps = fs.readFileSync('src/game/data/godotMaps/godot_region_maps.js', 'utf-8')

// 提取所有宝箱和NPC的位置
const treasures = [...maps.matchAll(/\{ id: '(treasure_[^']+)'[^}]+position: \{ x: (\d+), y: (\d+)[^}]+itemKey: '([^']+)', quantity: (\d+)/g)]
const npcs = [...maps.matchAll(/\{ id: '(npc_[^']+)'[^}]+position: \{ x: (\d+), y: (\d+)[^}]+name: '([^']+)'[^}]+itemKey: '([^']+)', quantity: (\d+)/g)]

console.log('## 一、隐藏宝箱位置分析\n')

const treasureData = [
  { id: 'treasure_meadow_hidden', map: '星音草径', expected: '(33, 6)', item: '3个高级球', hiddenPath: '(33,16)→(33,8)', distance: '主路→隐藏支路→宝箱' },
  { id: 'treasure_lake_hidden', map: '雾湖苇岸', expected: '(28, 10)', item: '2个好伤药', hiddenPath: '环湖路径', distance: '主路→环湖→宝箱' },
  { id: 'treasure_shore_wreck', map: '贝壳海岸', expected: '(35, 26)', item: '2个究极球', hiddenPath: '(31,28)→(35,28)→(35,24)', distance: '主路→沉船支路→宝箱' },
  { id: 'treasure_farm_windmill', map: '风车农庄', expected: '(8, 8)', item: '3个厉害伤药', hiddenPath: '(12,12)→(8,12)→(8,8)', distance: '主路→风车支路→宝箱' },
  { id: 'treasure_grave_deep', map: '月影墓园', expected: '(12, 30)', item: '1个HP之石', hiddenPath: '森林小径→深处', distance: '主路→森林→宝箱' },
  { id: 'treasure_hex_chamber', map: '六角遗迹', expected: '(33, 12)', item: '1个特攻之石', hiddenPath: '(28,16)→(33,16)→(33,12)', distance: '主路→密室支路→宝箱' },
  { id: 'treasure_ridge_camp', map: '铁木营地', expected: '(16, 12)', item: '1个攻击之石', hiddenPath: '(20,16)→(20,12)→(16,12)', distance: '主路→营地支路→宝箱' },
  { id: 'treasure_ridge_defense', map: '铁木营地', expected: '(16, 10)', item: '1个防御之石', hiddenPath: '同上', distance: '主路→营地支路→宝箱' },
  { id: 'treasure_highland_secret', map: '星雾高地', expected: '(35, 10)', item: '1个大师球', hiddenPath: '(28,16)→(35,16)→(35,10)', distance: '主路→秘境支路→宝箱' }
]

for (const t of treasureData) {
  const found = treasures.find(tr => tr[1] === t.id)
  if (found) {
    const [, id, x, y, item, qty] = found
    const actualPos = `(${x}, ${y})`
    const match = actualPos === t.expected ? '✓' : '✗'
    console.log(`${match} ${t.map}`)
    console.log(`  宝箱ID: ${id}`)
    console.log(`  位置: ${actualPos} ${match === '✗' ? `(预期${t.expected})` : ''}`)
    console.log(`  道具: ${qty}个${item}`)
    console.log(`  隐藏路径: ${t.hiddenPath}`)
    console.log(`  距离评估: ${t.distance}`)
    console.log()
  }
}

console.log('## 二、NPC位置分析\n')

const npcData = [
  { id: 'npc_meadow_hermit', map: '星音草径', expected: '(33, 7)', name: '隐居老人', item: '1个速度之石', hiddenPath: '秘境深处', visibility: '隐藏支路尽头' },
  { id: 'npc_shore_pirate', map: '贝壳海岸', expected: '(35, 25)', name: '老海盗', item: '3个究极球', hiddenPath: '沉船内部', visibility: '隐藏支路尽头' },
  { id: 'npc_grave_keeper', map: '月影墓园', expected: '(12, 29)', name: '墓园守护者', item: '1个特防之石', hiddenPath: '森林深处', visibility: '隐藏小径尽头' },
  { id: 'npc_hex_researcher', map: '六角遗迹', expected: '(33, 13)', name: '遗迹研究员', item: '1个神奇糖果', hiddenPath: '密室内部', visibility: '隐藏支路尽头' }
]

for (const n of npcData) {
  const found = npcs.find(npc => npc[1] === n.id)
  if (found) {
    const [, id, x, y, name, item, qty] = found
    const actualPos = `(${x}, ${y})`
    const match = actualPos === n.expected ? '✓' : '✗'
    console.log(`${match} ${n.map}`)
    console.log(`  NPC: ${name}`)
    console.log(`  位置: ${actualPos} ${match === '✗' ? `(预期${n.expected})` : ''}`)
    console.log(`  奖励: ${qty}个${item}`)
    console.log(`  隐藏路径: ${n.hiddenPath}`)
    console.log(`  可见性: ${n.visibility}`)
    console.log()
  }
}

console.log('## 三、隐蔽性问题诊断\n')

console.log('### 问题1: 宝箱与NPC距离过近')
console.log('- 星音草径: 宝箱(33,6) + NPC(33,7) 距离1格 ⚠️')
console.log('  建议: NPC移到(31,8)或(35,8)，增加探索感')
console.log()
console.log('- 六角遗迹: 宝箱(33,12) + NPC(33,13) 距离1格 ⚠️')
console.log('  建议: NPC移到(35,12)或(33,10)，分散奖励')
console.log()

console.log('### 问题2: 治疗点位置暴露')
console.log('- 星音草径: 治疗点(33,8)在隐藏支路上，但宝箱(33,6)和NPC(33,7)都在同一直线')
console.log('  建议: 治疗点保持，但宝箱/NPC分散到周边')
console.log()
console.log('- 贝壳海岸: 治疗点(35,24)在沉船内部，宝箱(35,26)和NPC(35,25)都在同一直线')
console.log('  建议: 宝箱移到沉船另一侧，如(33,26)')
console.log()

console.log('### 问题3: 铁木营地双宝箱距离过近')
console.log('- 攻击之石(16,12) + 防御之石(16,10) 距离2格，在同一条直线上')
console.log('  建议: 防御之石移到(14,12)或(18,12)，形成"探索两个角落"的感觉')
console.log()

console.log('### 问题4: 视觉线索不足')
console.log('- 当前只有装饰物标记入口，缺少"路径引导"')
console.log('  建议: 在隐藏路径中段添加小型装饰物，形成"面包屑"引导')
console.log()

console.log('## 四、道具数量合理性分析\n')

const itemAnalysis = [
  { item: '高级球', qty: 3, value: 3600, stage: '早期', assessment: '✓ 合理（新手实用）' },
  { item: '好伤药', qty: 2, value: 1400, stage: '早期', assessment: '✓ 合理（早期实用）' },
  { item: '究极球', qty: 2, value: 2400, stage: '中期', assessment: '✓ 合理（中期实用）' },
  { item: '厉害伤药', qty: 3, value: 3600, stage: '中期', assessment: '✓ 合理（中期实用）' },
  { item: 'HP之石', qty: 1, value: '无价', stage: '后期', assessment: '✓ 合理（稀缺性高）' },
  { item: '特攻之石', qty: 1, value: '无价', stage: '后期', assessment: '✓ 合理（稀缺性高）' },
  { item: '攻击之石', qty: 1, value: '无价', stage: '后期', assessment: '✓ 合理（稀缺性高）' },
  { item: '防御之石', qty: 1, value: '无价', stage: '后期', assessment: '✓ 合理（稀缺性高）' },
  { item: '速度之石', qty: 1, value: '无价', stage: '后期', assessment: '✓ 合理（稀缺性高）' },
  { item: '特防之石', qty: 1, value: '无价', stage: '后期', assessment: '✓ 合理（稀缺性高）' },
  { item: '神奇糖果', qty: 1, value: '无价', stage: '终极', assessment: '✓ 合理（终极奖励）' },
  { item: '大师球', qty: 1, value: '无价', stage: '终极', assessment: '✓ 合理（传说级）' },
  { item: '究极球(NPC)', qty: 3, value: 3600, stage: '中期', assessment: '⚠️ 偏多（建议改为2个）' }
]

console.log('| 道具 | 数量 | 价值 | 阶段 | 评估 |')
console.log('|------|------|------|------|------|')
for (const a of itemAnalysis) {
  console.log(`| ${a.item} | ${a.qty} | ${a.value} | ${a.stage} | ${a.assessment} |`)
}

console.log('\n## 五、优化建议汇总\n')

console.log('### 高优先级（影响隐蔽性）')
console.log('1. **分散宝箱与NPC位置**')
console.log('   - 星音草径: NPC从(33,7)移到(31,8)')
console.log('   - 贝壳海岸: 宝箱从(35,26)移到(33,26)')
console.log('   - 六角遗迹: NPC从(33,13)移到(35,12)')
console.log('   - 铁木营地: 防御之石从(16,10)移到(14,12)')
console.log()

console.log('2. **增加视觉引导**')
console.log('   - 在隐藏路径中段添加小型装饰物')
console.log('   - 形成"面包屑"引导，而非直接暴露终点')
console.log()

console.log('### 中优先级（优化体验）')
console.log('3. **调整NPC奖励数量**')
console.log('   - 老海盗: 3个究极球 → 2个究极球')
console.log('   - 保持稀缺感')
console.log()

console.log('4. **添加"假宝箱"或"诱饵"**')
console.log('   - 在主路上放置普通宝箱（低价值道具）')
console.log('   - 让玩家意识到"隐藏区域才有好东西"')
console.log()

console.log('### 低优先级（锦上添花）')
console.log('5. **添加环境叙事**')
console.log('   - NPC对话提示"更深处还有宝藏"')
console.log('   - 增加探索动机')
console.log()
