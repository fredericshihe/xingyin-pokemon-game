# 音效集成示例

## 如何替换现有的合成音效

以下是具体的代码修改示例，展示如何将合成音效替换为真实音效文件。

### 1. UI音效替换

#### 之前（合成音效）
```javascript
gameAudio.playUiSelect()
gameAudio.playUiConfirm()
gameAudio.playUiBack()
```

#### 之后（真实音效）
```javascript
import { UI_SFX } from './utils/gameSfxCatalog'

gameAudio.playSfx(UI_SFX.SELECT, { volume: 0.5 })
gameAudio.playSfx(UI_SFX.CONFIRM, { volume: 0.6 })
gameAudio.playSfx(UI_SFX.CANCEL, { volume: 0.5 })
```

---

### 2. 战斗技能音效替换

#### 之前（合成音效）
```javascript
gameAudio.playBattleMove(move)
```

#### 之后（真实音效 - 带变体）
```javascript
import { getMoveSfxUrl } from './utils/gameSfxCatalog'

// 获取技能音效模板URL
const moveUrl = getMoveSfxUrl(move.type)

// 随机播放3个变体之一
gameAudio.playSfxVariant(moveUrl, 3, { volume: 0.6 })

// 或者指定变体
const variant = Math.floor(Math.random() * 3) + 1
const specificUrl = getMoveSfxUrl(move.type, variant)
gameAudio.playSfx(specificUrl, { volume: 0.6 })
```

---

### 3. 伤害音效替换

#### 之前（合成音效）
```javascript
gameAudio.playBattleImpact({ 
  effectiveness, 
  didHit: true, 
  outcome: 'hit', 
  targetFainted: false 
})
```

#### 之后（真实音效）
```javascript
import { getImpactSfxUrl, IMPACT_SFX } from './utils/gameSfxCatalog'

if (!didHit || outcome === 'miss') {
  gameAudio.playSfx(IMPACT_SFX.MISS, { volume: 0.5 })
} else if (outcome === 'fizzle' || effectiveness <= 0) {
  gameAudio.playSfx(IMPACT_SFX.FIZZLE, { volume: 0.4 })
} else {
  const isCritical = false // 从战斗数据中获取
  const impactUrl = getImpactSfxUrl(effectiveness, isCritical)
  gameAudio.playSfx(impactUrl, { volume: 0.7 })
  
  if (targetFainted) {
    // 延迟播放濒死音效
    setTimeout(() => {
      gameAudio.playSfx(BATTLE_EVENT_SFX.FAINT, { volume: 0.6 })
    }, 300)
  }
}
```

---

### 4. 状态音效替换

#### 之前（合成音效）
```javascript
gameAudio.playBattleStatus('poison', 'apply')
gameAudio.playBattleStatus('heal', 'recover')
```

#### 之后（真实音效）
```javascript
import { getStatusSfxUrl, STATUS_SFX } from './utils/gameSfxCatalog'

// 应用状态
const statusUrl = getStatusSfxUrl('poison')
gameAudio.playSfx(statusUrl, { volume: 0.5 })

// 治疗
gameAudio.playSfx(STATUS_SFX.HEAL, { volume: 0.6 })

// 能力提升/下降
gameAudio.playSfx(STATUS_SFX.BUFF, { volume: 0.5 })
gameAudio.playSfx(STATUS_SFX.DEBUFF, { volume: 0.5 })
```

---

### 5. 遇敌音效替换

#### 之前（合成音效）
```javascript
gameAudio.playEncounter({ 
  trainer: false, 
  boss: false, 
  rare: false 
})
```

#### 之后（真实音效）
```javascript
import { getEncounterSfxUrl } from './utils/gameSfxCatalog'

const encounterUrl = getEncounterSfxUrl({ 
  trainer: battleKind === 'trainer',
  boss: eventType === 'boss',
  rare: isRareEncounter
})
gameAudio.playSfx(encounterUrl, { volume: 0.7 })
```

---

### 6. 精灵球音效替换

#### 之前（合成音效）
```javascript
gameAudio.playCaptureThrow()
gameAudio.playCaptureSuccess()
gameAudio.playCaptureFail()
```

#### 之后（真实音效）
```javascript
import { POKEBALL_SFX } from './utils/gameSfxCatalog'

// 投掷
gameAudio.playSfx(POKEBALL_SFX.THROW, { volume: 0.6 })

// 摇晃（可以播放多次）
setTimeout(() => {
  gameAudio.playSfx(POKEBALL_SFX.SHAKE, { volume: 0.5 })
}, 500)

// 捕获成功/失败
if (captured) {
  gameAudio.playSfx(POKEBALL_SFX.CATCH, { volume: 0.7 })
} else {
  gameAudio.playSfx(POKEBALL_SFX.BREAK, { volume: 0.6 })
}
```

---

### 7. 道具音效替换

#### 之前（合成音效）
```javascript
gameAudio.playItemUse({ category: 'potion' })
gameAudio.playItemUse({ category: 'shop' })
gameAudio.playItemUse({ category: 'pickup' })
```

#### 之后（真实音效）
```javascript
import { ITEM_SFX } from './utils/gameSfxCatalog'

// 使用药水
gameAudio.playSfx(ITEM_SFX.POTION, { volume: 0.6 })

// 购买道具
gameAudio.playSfx(ITEM_SFX.PURCHASE, { volume: 0.7 })

// 拾取道具
gameAudio.playSfx(ITEM_SFX.PICKUP, { volume: 0.5 })

// 使用经验糖果
gameAudio.playSfx(ITEM_SFX.EXP, { volume: 0.6 })
```

---

### 8. 特殊事件音效

#### 升级音效
```javascript
import { SPECIAL_SFX } from './utils/gameSfxCatalog'

// 宝可梦升级
gameAudio.playSfx(SPECIAL_SFX.LEVEL_UP, { volume: 0.7 })
```

#### 进化音效
```javascript
// 进化开始
gameAudio.playSfx(SPECIAL_SFX.EVOLUTION_START, { volume: 0.7 })

// 进化完成（延迟播放）
setTimeout(() => {
  gameAudio.playSfx(SPECIAL_SFX.EVOLUTION_COMPLETE, { volume: 0.8 })
}, 2000)
```

#### 传送音效
```javascript
// 普通传送
gameAudio.playSfx(SPECIAL_SFX.WARP, { volume: 0.6 })

// 快速旅行
gameAudio.playSfx(SPECIAL_SFX.FAST_TRAVEL, { volume: 0.7 })
```

---

## 完整示例：战斗回合音效序列

```javascript
import { 
  getMoveSfxUrl, 
  getImpactSfxUrl, 
  getStatusSfxUrl,
  BATTLE_EVENT_SFX,
  STATUS_SFX 
} from './utils/gameSfxCatalog'

async function playBattleTurnSfx(move, attacker, defender, result) {
  // 1. 播放技能使用音效
  const moveUrl = getMoveSfxUrl(move.type)
  gameAudio.playSfxVariant(moveUrl, 3, { volume: 0.6 })
  
  // 2. 等待技能动画
  await wait(500)
  
  // 3. 播放伤害音效
  if (result.didHit) {
    const impactUrl = getImpactSfxUrl(result.effectiveness, result.isCritical)
    gameAudio.playSfx(impactUrl, { volume: 0.7 })
  } else {
    gameAudio.playSfx(IMPACT_SFX.MISS, { volume: 0.5 })
  }
  
  // 4. 如果造成状态异常
  if (result.statusInflicted) {
    await wait(300)
    const statusUrl = getStatusSfxUrl(result.statusInflicted)
    gameAudio.playSfx(statusUrl, { volume: 0.5 })
  }
  
  // 5. 如果目标濒死
  if (result.targetFainted) {
    await wait(400)
    gameAudio.playSfx(BATTLE_EVENT_SFX.FAINT, { volume: 0.6 })
  }
  
  // 6. 如果战斗胜利
  if (result.battleWon) {
    await wait(800)
    gameAudio.playSfx(BATTLE_EVENT_SFX.VICTORY, { volume: 0.8 })
  }
}
```

---

## 音效音量建议

根据音效类型设置合适的音量：

```javascript
const VOLUME_PRESETS = {
  // UI音效 - 较小
  UI: 0.4 - 0.5,
  
  // 技能音效 - 中等
  MOVE: 0.5 - 0.7,
  
  // 伤害音效 - 较大
  IMPACT: 0.6 - 0.8,
  
  // 状态音效 - 较小
  STATUS: 0.4 - 0.6,
  
  // 事件音效 - 较大
  EVENT: 0.7 - 0.9,
  
  // 道具音效 - 中等
  ITEM: 0.5 - 0.6,
}
```

---

## 渐进式替换策略

建议按以下顺序逐步替换音效：

### 第1步：UI音效（最简单）
- 选择、确认、取消音效
- 影响范围小，容易测试

### 第2步：核心战斗音效
- 伤害音效（普通、效果拔群、效果不好）
- 遇敌音效
- 濒死音效

### 第3步：技能音效（最耗时）
- 先做常见属性（火、水、草、电）
- 再补充其他属性

### 第4步：其他音效
- 道具音效
- 特殊事件音效
- 环境音效

---

## 测试清单

替换音效后，测试以下场景：

- [ ] UI操作（选择、确认、取消）
- [ ] 野生宝可梦遇敌
- [ ] 训练师战斗遇敌
- [ ] 使用不同属性的技能
- [ ] 造成普通伤害
- [ ] 造成效果拔群伤害
- [ ] 造成效果不好伤害
- [ ] 会心一击
- [ ] 未命中
- [ ] 造成状态异常
- [ ] 使用治疗技能
- [ ] 宝可梦濒死
- [ ] 战斗胜利
- [ ] 投掷精灵球
- [ ] 捕获成功/失败
- [ ] 使用道具
- [ ] 宝可梦升级
- [ ] 宝可梦进化

---

## 下一步

1. **准备音效文件** - 从免费资源网站下载
2. **创建目录结构** - 按照规范组织文件
3. **逐步替换** - 从UI音效开始
4. **测试验证** - 确保音效正常播放
5. **调整音量** - 平衡各类音效的音量

需要帮助？查看 `SFX_USAGE_GUIDE.md` 获取详细说明。
