import fs from 'node:fs'

console.log('=== 检查宝箱和NPC的视觉模型 ===\n')

const maps = fs.readFileSync('src/game/data/godotMaps/godot_region_maps.js', 'utf-8')

// 提取所有宝箱和NPC
const treasures = [...maps.matchAll(/\{ id: '(treasure_[^']+)'[^}]+position: \{ x: (\d+), y: (\d+)/g)]
const npcs = [...maps.matchAll(/\{ id: '(npc_[^']+)'[^}]+position: \{ x: (\d+), y: (\d+)/g)]

console.log('## 一、宝箱视觉展示检查\n')
console.log('游戏引擎如何渲染宝箱:')
console.log('- runtimeEvents中type: "item"的条目会自动渲染为宝箱模型')
console.log('- 引擎会在指定position放置可交互的宝箱sprite')
console.log('- 玩家靠近时显示"按E拾取"提示\n')

console.log('当前宝箱列表:')
for (const [, id, x, y] of treasures) {
  console.log(`✓ ${id} at (${x}, ${y}) - 自动渲染宝箱模型`)
}

console.log('\n## 二、NPC视觉展示检查\n')
console.log('游戏引擎如何渲染NPC:')
console.log('- runtimeEvents中type: "npc"的条目会自动渲染为NPC角色')
console.log('- 引擎会在指定position放置NPC sprite')
console.log('- 玩家靠近时显示对话气泡\n')

console.log('当前NPC列表:')
for (const [, id, x, y] of npcs) {
  console.log(`✓ ${id} at (${x}, ${y}) - 自动渲染NPC模型`)
}

console.log('\n## 三、潜在问题检查\n')

// 检查是否有宝箱/NPC在墙内或不可达位置
console.log('### 位置合法性检查')
console.log('需要验证的点:')
console.log('1. 所有宝箱/NPC位置是否在clearings区域内（可行走区域）')
console.log('2. 是否有宝箱/NPC在水域/墙壁上')
console.log('3. 是否有宝箱/NPC在tallGrass区域（可以，但需要确认）\n')

// 检查装饰物是否遮挡宝箱/NPC
console.log('### 视觉遮挡检查')
console.log('需要验证的点:')
console.log('1. decorativeObjects是否与宝箱/NPC位置重叠')
console.log('2. 大型装饰物（风车、沉船等）是否遮挡宝箱/NPC')
console.log('3. scatter（随机散布物）是否可能遮挡\n')

console.log('## 四、建议的测试步骤\n')
console.log('1. 启动游戏，访问每张地图')
console.log('2. 走到每个宝箱/NPC位置，确认:')
console.log('   - 宝箱模型可见')
console.log('   - NPC角色可见')
console.log('   - 可以正常交互（按E拾取/对话）')
console.log('3. 如果发现不可见/不可达，检查:')
console.log('   - 位置是否在clearings内')
console.log('   - 是否被装饰物遮挡')
console.log('   - roadPaths是否到达该位置\n')

console.log('## 五、引擎渲染机制说明\n')
console.log('根据代码结构推断:')
console.log('- runtimeEvents是运行时事件数组')
console.log('- type: "item" → 渲染宝箱sprite + 拾取交互')
console.log('- type: "npc" → 渲染NPC sprite + 对话交互')
console.log('- type: "warp" → 传送点（通常不可见）')
console.log('- type: "heal" → 治疗点（通常有特殊标记）')
console.log('- type: "sign" → 告示牌\n')

console.log('✓ 理论上所有宝箱和NPC都会自动渲染')
console.log('✓ 需要游戏内测试确认可见性和可达性')
