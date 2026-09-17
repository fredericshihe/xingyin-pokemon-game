import fs from 'node:fs/promises'
import { withViteAuditServer } from './load-vite-module.mjs'

await withViteAuditServer(async ({loadModule}) => {
  const {MOVES}=await loadModule('/src/utils/gameData.js')
  const {getMoveVfxRecipe}=await loadModule('/src/utils/battleVfxRecipes.js')
  const {getMoveEffectConfig}=await loadModule('/src/utils/moveVisuals.js')
  const status={burn:'灼伤',poison:'中毒',paralysis:'麻痹',sleep:'睡眠',freeze:'冰冻',confusion:'混乱',flinch:'畏缩'}
  const stat={atk:'攻击',def:'防御',spAtk:'特攻',spDef:'特防',spd:'速度',accuracy:'命中',evasion:'闪避'}
  const effect={heal:'回复',drain:'吸取',nothing:'无效果',mimic:'模仿技能',teleport:'脱离战斗'}
  const rows=Object.entries(MOVES).map(([key,move])=>{
    const recipe=getMoveVfxRecipe(key,move,getMoveEffectConfig(key,move))
    const changes=Array.isArray(move.statChanges)?move.statChanges:move.statChange?[move.statChange]:[]
    const mechanics=[move.power?`威力 ${move.power}`:'',move.status?`${move.statusChance ?? 100}% ${status[move.status] || move.status}`:'',
      move.volatileStatus?status[move.volatileStatus]||move.volatileStatus:'',
      ...changes.map(c=>`${c.target==='attacker'?'自身':'对方'}${stat[c.stat]||c.stat}${c.stages>0?'提升':'降低'} ${Math.abs(c.stages)} 级`),effect[move.effect]||'',move.charge?'蓄力':''].filter(Boolean)
    return {key,name:move.name,mechanics:mechanics.join('；'),technique:recipe.technique,material:recipe.material,gesture:recipe.gesture,direction:recipe.direction,powerLevel:recipe.powerLevel}
  })
  await fs.mkdir('art/battle-vfx',{recursive:true})
  await fs.writeFile('art/battle-vfx/MOVE-DIRECTIONS.json',JSON.stringify(rows,null,2))
  await fs.writeFile('art/battle-vfx/MOVE-DIRECTIONS.md',[
    '# 战斗招式表现清单', '',
    '由当前 322 条招式数据与实际渲染配置生成。机制栏对应游戏数据；动作栏是已实现的表现方式。本表是覆盖核对依据，不代表每个设备上每一帧均已人工验收。', '',
    '| 招式 | 游戏机制 | 动作／材料 | 表现方式 |','|---|---|---|---|',
    ...rows.map(r=>`| ${r.name} (${r.key}) | ${r.mechanics} | ${r.technique} / ${r.material} / ${r.gesture} | ${r.direction} |`),''
  ].join('\n'))
  console.log(`Exported ${rows.length} move directions from live game data.`)
})
