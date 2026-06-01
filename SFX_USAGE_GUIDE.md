# 音效使用指南

## 快速开始

### 1. 在游戏中使用音效

音效系统已经集成到 `gameAudio` 中，有两种使用方式：

#### 方式1: 使用预定义的音效常量（推荐）

```javascript
import { gameAudio } from './utils/gameAudio'
import { UI_SFX, IMPACT_SFX, getMoveSfxUrl } from './utils/gameSfxCatalog'

// 播放UI音效
gameAudio.playSfx(UI_SFX.CONFIRM, { volume: 0.6 })

// 播放伤害音效
gameAudio.playSfx(IMPACT_SFX.HIT_SUPER_EFFECTIVE, { volume: 0.7 })

// 播放技能音效（带变体）
const moveUrl = getMoveSfxUrl(move.type)
gameAudio.playSfxVariant(moveUrl, 3, { volume: 0.6 })
```

#### 方式2: 直接使用URL

```javascript
gameAudio.playSfx('/assets/audio/sfx/ui/confirm.ogg', { volume: 0.6 })
```

### 2. 音效选项

```javascript
gameAudio.playSfx(url, {
  volume: 0.5,        // 音量 (0-1)
  playbackRate: 1.0,  // 播放速度 (0.5-2.0)
  loop: false         // 是否循环
})
```

### 3. 播放变体音效

对于有多个变体的音效（如技能音效），使用 `playSfxVariant`：

```javascript
// 随机播放 fire-attack-1.ogg, fire-attack-2.ogg, fire-attack-3.ogg 之一
const template = getMoveSfxUrl(TYPES.FIRE)
gameAudio.playSfxVariant(template, 3, { volume: 0.6 })
```

---

## 音效文件组织

### 目录结构

```
public/assets/audio/sfx/
├── ui/                    # UI音效
│   ├── select.ogg
│   ├── confirm.ogg
│   ├── cancel.ogg
│   └── ...
├── battle/
│   ├── moves/            # 技能音效（按属性分类）
│   │   ├── fire/
│   │   │   ├── fire-attack-1.ogg
│   │   │   ├── fire-attack-2.ogg
│   │   │   └── fire-attack-3.ogg
│   │   ├── water/
│   │   ├── grass/
│   │   └── ...
│   ├── impact/           # 伤害音效
│   │   ├── hit-normal.ogg
│   │   ├── hit-super-effective.ogg
│   │   └── ...
│   ├── status/           # 状态音效
│   │   ├── poison.ogg
│   │   ├── burn.ogg
│   │   └── ...
│   ├── events/           # 战斗事件
│   │   ├── encounter-wild.ogg
│   │   ├── faint.ogg
│   │   └── ...
│   └── pokeball/         # 精灵球
│       ├── throw.ogg
│       └── ...
├── items/                # 道具音效
│   ├── potion.ogg
│   └── ...
└── special/              # 特殊事件
    ├── level-up.ogg
    └── ...
```

### 文件命名规范

- 使用小写字母和连字符
- 变体音效使用数字后缀: `fire-attack-1.ogg`, `fire-attack-2.ogg`
- 格式: OGG Vorbis（推荐）或 MP3
- 文件大小: 尽量控制在 10KB 以下

---

## 音效预加载

### 自动预加载

核心音效会在游戏启动时自动预加载（在 `gameEntryPreload.js` 中）。

### 手动预加载

```javascript
import { preloadCoreSfx, preloadAllSfx } from './utils/gameSfxPreload'

// 预加载核心音效（UI、基础战斗音效）
await preloadCoreSfx()

// 预加载所有音效（包括所有技能变体）
await preloadAllSfx()
```

---

## 添加新音效

### 步骤1: 准备音效文件

1. 从免费资源网站下载音效（见下方资源列表）
2. 转换为 OGG 格式（推荐）
3. 压缩到合适大小（< 10KB）
4. 放到对应目录

### 步骤2: 添加到目录

编辑 `src/utils/gameSfxCatalog.js`：

```javascript
export const MY_NEW_SFX = {
  EXAMPLE: assetUrl(`${SFX_BASE}/category/example.ogg`),
}
```

### 步骤3: 在游戏中使用

```javascript
import { MY_NEW_SFX } from './utils/gameSfxCatalog'

gameAudio.playSfx(MY_NEW_SFX.EXAMPLE, { volume: 0.6 })
```

---

## 音效资源推荐

### 免费音效网站

1. **Freesound.org** ⭐ 推荐
   - https://freesound.org/
   - CC授权，质量高
   - 搜索: "game", "rpg", "magic", "impact"

2. **OpenGameArt.org**
   - https://opengameart.org/
   - 开源游戏素材
   - 分类: Sound Effects → RPG/Fantasy

3. **Zapsplat**
   - https://www.zapsplat.com/
   - 免费注册后下载
   - 分类: Game Sounds

4. **Mixkit**
   - https://mixkit.co/free-sound-effects/game/
   - 免费商用，高质量

5. **Sonniss GDC Bundle**
   - https://sonniss.com/gameaudiogdc
   - 年度免费音效包

### 推荐搜索关键词

#### 火系技能
- "fire whoosh"
- "flame burst"
- "explosion small"
- "fireball"

#### 水系技能
- "water splash"
- "liquid impact"
- "bubble pop"
- "water spray"

#### 电系技能
- "electric zap"
- "lightning strike"
- "spark"
- "electricity"

#### 伤害音效
- "punch impact"
- "hit body"
- "thud"
- "sword hit"

#### UI音效
- "button click"
- "menu select"
- "confirm beep"
- "error buzz"

---

## 音效转换工具

### 在线转换

1. **CloudConvert** - https://cloudconvert.com/
   - 支持 MP3 → OGG
   - 可调整比特率和质量

2. **Online Audio Converter** - https://online-audio-converter.com/
   - 简单易用
   - 支持批量转换

### 命令行工具

使用 FFmpeg 转换和压缩：

```bash
# 转换为 OGG（质量 5，文件较小）
ffmpeg -i input.mp3 -c:a libvorbis -q:a 5 output.ogg

# 批量转换
for file in *.mp3; do
  ffmpeg -i "$file" -c:a libvorbis -q:a 5 "${file%.mp3}.ogg"
done
```

---

## 调试音效

### 检查已加载的音效

在浏览器控制台运行：

```javascript
// 查看已加载的音效数量
console.log('已加载音效:', gameAudio.sfxBuffers.size)

// 查看所有已加载的音效URL
gameAudio.sfxBuffers.forEach((buffer, url) => {
  console.log(url, buffer.duration.toFixed(2) + 's')
})
```

### 测试音效播放

```javascript
// 测试UI音效
gameAudio.playSfx('/assets/audio/sfx/ui/confirm.ogg')

// 测试技能音效
gameAudio.playSfx('/assets/audio/sfx/battle/moves/fire/fire-attack-1.ogg')
```

---

## 性能优化

### 1. 延迟加载

非核心音效会在首次使用时自动加载，无需手动处理。

### 2. 音效缓存

已加载的音效会被缓存，重复播放不会重新下载。

### 3. 文件大小控制

- UI音效: < 5KB
- 技能音效: < 10KB
- 事件音效: < 15KB

### 4. 使用变体

为同类音效提供多个变体，增加多样性而不增加太多文件。

---

## 常见问题

### Q: 音效没有播放？

A: 检查以下几点：
1. AudioContext是否已解锁（需要用户手势）
2. 音效文件是否存在
3. 音量是否为0
4. 浏览器控制台是否有错误

### Q: 音效加载很慢？

A: 
1. 检查文件大小，压缩过大的文件
2. 使用核心音效预加载
3. 检查网络连接

### Q: 如何替换合成音效？

A: 在 `OriginalGame.jsx` 中找到对应的 `gameAudio.playXxx()` 调用，替换为：

```javascript
// 之前
gameAudio.playBattleMove(move)

// 之后
const moveUrl = getMoveSfxUrl(move.type)
gameAudio.playSfxVariant(moveUrl, 3, { volume: 0.6 })
```

### Q: 支持哪些音频格式？

A: 推荐使用 OGG Vorbis，也支持 MP3、WAV。OGG 文件更小，兼容性好。

---

## 下一步

1. **下载音效文件** - 从推荐网站下载需要的音效
2. **放到对应目录** - 按照目录结构组织文件
3. **测试播放** - 在游戏中测试音效是否正常
4. **逐步替换** - 将合成音效逐步替换为真实音效

需要帮助？查看 `SOUND_EFFECTS_UPGRADE_PLAN.md` 获取完整方案。
