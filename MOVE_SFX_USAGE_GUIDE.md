# 技能音效使用指南

## 已集成的功能

✅ 在 `src/utils/gameAudio.js` 中添加了以下方法：

### 1. playMoveSfx(moveKey, options)

播放指定技能的音效。

**参数**:
- `moveKey` (string): 技能key，如 'ember', 'watergun', 'thunderbolt'
- `options` (object): 可选配置
  - `volume` (number): 音量 0-1，默认 0.6
  - `playbackRate` (number): 播放速度，默认 1
  - `loop` (boolean): 是否循环，默认 false

**示例**:
```javascript
import { gameAudio } from './utils/gameAudio.js'

// 播放火花音效
await gameAudio.playMoveSfx('ember')

// 播放水枪音效，音量0.8
await gameAudio.playMoveSfx('watergun', { volume: 0.8 })

// 播放十万伏特音效，速度1.2倍
await gameAudio.playMoveSfx('thunderbolt', { playbackRate: 1.2 })
```

### 2. preloadMoveSfx(moveKeys)

预加载多个技能音效。

**参数**:
- `moveKeys` (string[]): 技能key数组

**返回**:
- `Promise<{ total: number, loaded: number }>`

**示例**:
```javascript
// 预加载常用技能音效
const result = await gameAudio.preloadMoveSfx([
  'ember', 'flamethrower', 'fire_blast',
  'watergun', 'surf', 'hydropump',
  'thundershock', 'thunderbolt'
])

console.log(`预加载完成: ${result.loaded}/${result.total}`)
```

## 在战斗系统中使用

### 方法1: 在技能使用时播放

在 `src/utils/battleLogic.js` 或战斗相关文件中：

```javascript
import { gameAudio } from './gameAudio.js'

// 当宝可梦使用技能时
async function executeMove(attacker, defender, moveKey) {
  // 播放技能音效
  await gameAudio.playMoveSfx(moveKey)
  
  // 执行技能逻辑
  const damage = calculateDamage(attacker, defender, moveKey)
  // ...
}
```

### 方法2: 在战斗动画中播放

```javascript
// 在技能动画开始时播放音效
function playMoveAnimation(moveKey) {
  // 播放音效
  gameAudio.playMoveSfx(moveKey)
  
  // 播放视觉效果
  showMoveVisual(moveKey)
}
```

### 方法3: 预加载战斗音效

在战斗开始时预加载双方宝可梦的技能音效：

```javascript
async function startBattle(playerPokemon, enemyPokemon) {
  // 收集所有技能
  const allMoves = [
    ...playerPokemon.moves,
    ...enemyPokemon.moves
  ]
  
  // 预加载音效
  await gameAudio.preloadMoveSfx(allMoves)
  
  // 开始战斗
  // ...
}
```

## 音效文件路径规则

音效文件按照技能类型自动组织：

```
public/assets/audio/sfx/
├── normal/
│   ├── tackle.ogg
│   ├── scratch.ogg
│   └── ...
├── fire/
│   ├── ember.ogg
│   ├── flamethrower.ogg
│   └── fire_blast.ogg
├── water/
│   ├── watergun.ogg
│   ├── surf.ogg
│   └── hydropump.ogg
└── ...
```

**路径格式**: `/assets/audio/sfx/{type}/{moveKey}.ogg`

例如:
- 火花 (ember, 火系) → `/assets/audio/sfx/fire/ember.ogg`
- 水枪 (watergun, 水系) → `/assets/audio/sfx/water/watergun.ogg`
- 十万伏特 (thunderbolt, 电系) → `/assets/audio/sfx/electric/thunderbolt.ogg`

## 错误处理

如果音效文件不存在，方法会静默失败（不会抛出错误），游戏继续正常运行。

```javascript
// 即使音效文件不存在，也不会影响游戏
await gameAudio.playMoveSfx('nonexistent_move') // 静默失败
```

## 调试

在开发模式下，可以在浏览器控制台查看音频调试信息：

```javascript
// 查看音频状态
console.log(window.__POKEMON_GAME_AUDIO_DEBUG__)

// 输出示例:
// {
//   supported: true,
//   contextState: "running",
//   loadedSfxCount: 12,
//   ...
// }
```

## 性能优化建议

### 1. 预加载常用技能
```javascript
// 在游戏启动时预加载常用技能
const commonMoves = [
  'tackle', 'scratch', 'ember', 'watergun', 
  'thundershock', 'vinewhip'
]
await gameAudio.preloadMoveSfx(commonMoves)
```

### 2. 按需加载
```javascript
// 只在需要时加载音效
// playMoveSfx 会自动加载未缓存的音效
await gameAudio.playMoveSfx('rare_move')
```

### 3. 批量预加载
```javascript
// 在战斗开始时批量预加载
async function prepareBattle(pokemon1, pokemon2) {
  const moves = [...pokemon1.moves, ...pokemon2.moves]
  await gameAudio.preloadMoveSfx(moves)
}
```

## 音效文件要求

- **格式**: OGG Vorbis
- **采样率**: 22050 Hz (推荐)
- **声道**: 单声道 (mono)
- **比特率**: 48-64 kbps
- **时长**: 0.5-2秒
- **文件大小**: 10-30 KB

## 下一步

1. ✅ 代码已集成
2. ⏳ 下载技能音效文件
3. ⏳ 在战斗系统中调用 `playMoveSfx`
4. ⏳ 测试音效播放

## 示例：完整集成

```javascript
// src/components/Battle/BattleScene.jsx
import { gameAudio } from '../../utils/gameAudio.js'

export function BattleScene({ playerPokemon, enemyPokemon }) {
  // 预加载音效
  useEffect(() => {
    const moves = [
      ...playerPokemon.moves,
      ...enemyPokemon.moves
    ]
    gameAudio.preloadMoveSfx(moves)
  }, [playerPokemon, enemyPokemon])
  
  // 使用技能
  const handleUseMove = async (moveKey) => {
    // 播放音效
    await gameAudio.playMoveSfx(moveKey)
    
    // 执行技能
    executeMove(moveKey)
  }
  
  return (
    <div className="battle-scene">
      {/* 战斗UI */}
    </div>
  )
}
```

---

**文档更新时间**: 2026-05-28  
**状态**: 代码已集成，等待音效文件
