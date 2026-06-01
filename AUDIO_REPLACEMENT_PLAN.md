# 音频替换实施方案

## 项目概述
替换所有地图BGM和战斗技能音效，要求：
1. 地图BGM：不太吵但符合地图特点
2. 战斗技能音效：为每个技能找到最恰当的音效
3. 所有文件压缩到最小体积

## 当前音频资源分析

### 地图BGM（9个）
| 地图ID | 当前BGM | 特点 | 文件大小 |
|--------|---------|------|----------|
| godot-map | Summer Park 8bit tune | 新手村/城镇氛围 | 850KB |
| godot-map-v2 | Meadow Thoughts | 草径/101号道路 | 2.4MB |
| mist-lake | Wind | 雾湖/水边路线 | 957KB |
| farm-town | Honey Bear Loop | 农庄/友好小镇 | 794KB |
| pirate-shore | Sailor Waltz | 海岸/港口 | 478KB |
| graveyard | Dungeon 002 | 墓园/洞窟 | 1.2MB |
| hex-ruins | Theme Loop | 遗迹/神秘区域 | 633KB |
| survival-ridge | Melodic Adventure Theme | 营地/长途路线 | 1.4MB |
| boss-highland | Flora | 高地/冠军之路 | 773KB |

### 战斗技能音效（需要搜索的技能类型）

#### 普通系 (10个技能)
- tackle (撞击)
- scratch (抓)
- horn_attack (角撞)
- quickattack (电光一闪)
- flail (挣扎)
- fury_attack (乱击)
- bite (咬住)
- bodyslam (泰山压顶)
- slash (劈开)
- extremespeed (神速)
- recover (自我再生)
- mimic (模仿)

#### 火系 (3个技能)
- ember (火花)
- flamethrower (喷射火焰)
- fire_blast (大字爆炎)

#### 水系 (3个技能)
- watergun (水枪)
- surf (冲浪)
- hydropump (水炮)

#### 草系 (2个技能)
- vinewhip (藤鞭)
- razorleaf (飞叶快刀)

#### 电系 (3个技能)
- thundershock (电击)
- thunderbolt (十万伏特)
- zap_cannon (电磁炮)

#### 冰系 (2个技能)
- icebeam (冰冻光束)
- blizzard (暴风雪)

#### 格斗系 (3个技能)
- karate_chop (空手劈)
- double_kick (二连踢)
- low_kick (下踢)

#### 毒系 (2个技能)
- poison_sting (毒针)
- poison_jab (毒击)

#### 地面系 (1个技能)
- earthquake (地震)

#### 飞行系 (5个技能)
- peck (啄)
- wing_attack (翅膀攻击)
- fly (飞翔)
- drill_peck (钻孔啄)
- hurricane (暴风)
- sky_attack (神鸟猛击)

#### 超能力系 (3个技能)
- psychic (精神强念)
- hypnosis (催眠术)
- dream_eater (食梦)

#### 虫系 (1个技能)
- fury_cutter (连斩)

#### 岩石系 (3个技能)
- rock_throw (落石)
- rock_slide (岩崩)
- rollout (滚动)

#### 幽灵系 (3个技能)
- lick (舔)
- shadowball (暗影球)
- rage_fist (愤怒之拳)

#### 龙系 (1个技能)
- dragonclaw (龙爪)

#### 钢系 (1个技能)
- iron_tail (铁尾)

#### 妖精系 (1个技能)
- moonblast (月亮之力)

**总计：约48个技能需要音效**

## 实施步骤

### 第一阶段：搜索和下载音频资源

#### 1. 地图BGM搜索策略

推荐音频资源网站：
- **Freesound.org** (CC0/CC-BY授权)
- **OpenGameArt.org** (游戏音乐专用)
- **Incompetech.com** (Kevin MacLeod免费音乐)
- **ZapSplat.com** (免费音效库)
- **Pixabay Music** (CC0音乐)

搜索关键词建议：
```
godot-map (新手村): "peaceful town", "village theme", "calm rpg town"
godot-map-v2 (草径): "meadow", "grassland", "peaceful journey", "calm adventure"
mist-lake (雾湖): "misty lake", "water ambient", "calm lake", "mysterious water"
farm-town (农庄): "farm theme", "countryside", "pastoral", "harvest"
pirate-shore (海岸): "beach theme", "calm ocean", "seaside", "gentle waves"
graveyard (墓园): "dungeon ambient", "mysterious cave", "dark ambient calm"
hex-ruins (遗迹): "ancient ruins", "mystery theme", "exploration calm"
survival-ridge (营地): "campfire", "wilderness", "survival ambient"
boss-highland (高地): "mountain theme", "highland", "epic calm", "pre-battle"
```

#### 2. 技能音效搜索策略

推荐音效资源网站：
- **Freesound.org** (最全面的音效库)
- **ZapSplat.com** (游戏音效专用)
- **Sonniss.com** (年度免费GDC音效包)
- **OpenGameArt.org** (游戏音效)

按属性分类搜索关键词：

**火系音效：**
```
ember: "small fire", "fire whoosh", "flame ignite"
flamethrower: "flamethrower", "fire blast", "fire stream"
fire_blast: "explosion fire", "fire burst", "big flame"
```

**水系音效：**
```
watergun: "water spray", "water shot", "water squirt"
surf: "wave crash", "water wave", "surf"
hydropump: "water blast", "water cannon", "high pressure water"
```

**电系音效：**
```
thundershock: "electric zap", "small shock", "spark"
thunderbolt: "thunder", "lightning strike", "electric blast"
zap_cannon: "electric cannon", "big zap", "power surge"
```

**草系音效：**
```
vinewhip: "whip crack", "vine swing", "plant whip"
razorleaf: "leaf cut", "blade swish", "sharp leaves"
```

**冰系音效：**
```
icebeam: "ice beam", "freeze ray", "ice magic"
blizzard: "blizzard", "ice storm", "freezing wind"
```

**格斗系音效：**
```
karate_chop: "karate chop", "hand strike", "martial arts hit"
double_kick: "double kick", "two kicks", "rapid kicks"
low_kick: "kick impact", "leg sweep", "low strike"
```

**毒系音效：**
```
poison_sting: "poison dart", "sting", "toxic needle"
poison_jab: "poison impact", "toxic hit", "venom strike"
```

**地面系音效：**
```
earthquake: "earthquake", "ground rumble", "earth shake"
```

**飞行系音效：**
```
peck: "bird peck", "beak strike", "quick peck"
wing_attack: "wing flap", "wing strike", "bird attack"
fly: "dive bomb", "swoosh", "aerial strike"
drill_peck: "drill", "spinning attack", "rapid peck"
hurricane: "wind storm", "hurricane", "strong wind"
sky_attack: "dive attack", "sky strike", "powerful swoosh"
```

**超能力系音效：**
```
psychic: "psychic power", "mind blast", "telekinesis"
hypnosis: "hypnotic", "sleep spell", "trance"
dream_eater: "ethereal", "dream magic", "soul drain"
```

**虫系音效：**
```
fury_cutter: "rapid slashes", "insect buzz attack", "quick cuts"
```

**岩石系音效：**
```
rock_throw: "rock throw", "stone impact", "boulder hit"
rock_slide: "rockslide", "falling rocks", "avalanche"
rollout: "rolling stone", "boulder roll", "rock spin"
```

**幽灵系音效：**
```
lick: "ghost lick", "eerie touch", "spectral"
shadowball: "dark energy", "shadow blast", "ghost attack"
rage_fist: "ghost punch", "spectral hit", "dark impact"
```

**龙系音效：**
```
dragonclaw: "dragon claw", "beast slash", "powerful swipe"
```

**钢系音效：**
```
iron_tail: "metal whip", "steel impact", "iron strike"
```

**妖精系音效：**
```
moonblast: "fairy magic", "moon beam", "sparkle blast"
```

**普通系音效：**
```
tackle: "body slam", "tackle", "impact"
scratch: "claw scratch", "scratch", "swipe"
horn_attack: "horn strike", "ram", "charge"
quickattack: "quick strike", "fast hit", "speed attack"
flail: "struggle", "wild swing", "desperate attack"
fury_attack: "rapid hits", "fury strikes", "multiple hits"
bite: "bite", "chomp", "jaw snap"
bodyslam: "heavy impact", "body slam", "crush"
slash: "sword slash", "cut", "blade strike"
extremespeed: "sonic boom", "extreme speed", "blur attack"
recover: "heal", "recovery", "restore"
mimic: "copy", "mimic", "transform"
```

### 第二阶段：音频处理和压缩

#### 压缩工具和参数

使用 **ffmpeg** 进行音频压缩：

```bash
# BGM压缩（OGG格式，64kbps单声道或96kbps立体声）
ffmpeg -i input.mp3 -c:a libvorbis -q:a 3 -ar 44100 -ac 2 output.ogg

# 音效压缩（OGG格式，48kbps单声道）
ffmpeg -i input.wav -c:a libvorbis -q:a 2 -ar 22050 -ac 1 output.ogg

# 批量压缩脚本
for file in *.mp3; do
  ffmpeg -i "$file" -c:a libvorbis -q:a 3 -ar 44100 -ac 2 "${file%.mp3}.ogg"
done
```

**压缩参数说明：**
- `-c:a libvorbis`: 使用Vorbis编码器（OGG格式）
- `-q:a 3`: 质量等级3（约96kbps，适合BGM）
- `-q:a 2`: 质量等级2（约64kbps，适合音效）
- `-ar 44100`: 采样率44.1kHz（BGM）
- `-ar 22050`: 采样率22.05kHz（音效）
- `-ac 2`: 立体声（BGM）
- `-ac 1`: 单声道（音效）

**预期文件大小：**
- BGM（3分钟）：约1.5-2MB → 压缩后 500-800KB
- 音效（1-2秒）：约100-200KB → 压缩后 10-30KB

### 第三阶段：集成到项目

#### 1. 更新文件结构

```
public/assets/audio/
├── maps/
│   ├── godot-map.ogg (新)
│   ├── godot-map-v2.ogg (新)
│   ├── mist-lake.ogg (新)
│   ├── farm-town.ogg (新)
│   ├── pirate-shore.ogg (新)
│   ├── graveyard.ogg (新)
│   ├── hex-ruins.ogg (新)
│   ├── survival-ridge.ogg (新)
│   └── boss-highland.ogg (新)
├── battle/
│   ├── wild.ogg (保留)
│   ├── trainer.ogg (保留)
│   ├── lieutenant.ogg (保留)
│   ├── boss.ogg (保留)
│   └── challenge.ogg (保留)
└── sfx/
    ├── normal/
    │   ├── tackle.ogg
    │   ├── scratch.ogg
    │   └── ... (其他普通系技能)
    ├── fire/
    │   ├── ember.ogg
    │   ├── flamethrower.ogg
    │   └── fire_blast.ogg
    ├── water/
    │   ├── watergun.ogg
    │   ├── surf.ogg
    │   └── hydropump.ogg
    └── ... (其他属性文件夹)
```

#### 2. 更新 manifest.json

需要添加所有新的音效条目：

```json
{
  "generatedAt": "2026-05-28T...",
  "format": "ogg",
  "tracks": {
    "maps/godot-map.ogg": { ... },
    "sfx/fire/ember.ogg": {
      "bytes": 15000,
      "type": "fire",
      "move": "ember",
      "title": "Fire Spark Sound Effect",
      "license": "CC0",
      "cached": true
    },
    ...
  }
}
```

#### 3. 更新代码以支持技能音效

需要修改 `src/utils/gameAudio.js` 添加技能音效播放功能：

```javascript
async playMoveSfx(moveKey, options = {}) {
  const moveType = MOVES[moveKey]?.type || 'normal'
  const typeFolder = moveType.toLowerCase()
  const url = `/assets/audio/sfx/${typeFolder}/${moveKey}.ogg`
  return this.playSfx(url, options)
}
```

## 实施时间估算

- **搜索和下载音频**：8-12小时
  - 地图BGM：2-3小时
  - 技能音效：6-9小时
- **音频处理和压缩**：2-3小时
- **集成和测试**：2-3小时
- **总计**：12-18小时

## 自动化脚本建议

创建下载和处理脚本：

```bash
#!/bin/bash
# download-and-compress.sh

# 1. 下载音频文件（需要手动从网站下载）
# 2. 自动压缩所有音频文件

INPUT_DIR="./raw_audio"
OUTPUT_DIR="./public/assets/audio"

# 压缩BGM
for file in "$INPUT_DIR/maps"/*.{mp3,wav,flac}; do
  [ -f "$file" ] || continue
  filename=$(basename "$file")
  name="${filename%.*}"
  ffmpeg -i "$file" -c:a libvorbis -q:a 3 -ar 44100 -ac 2 "$OUTPUT_DIR/maps/$name.ogg"
done

# 压缩音效
for type_dir in "$INPUT_DIR/sfx"/*; do
  [ -d "$type_dir" ] || continue
  type_name=$(basename "$type_dir")
  mkdir -p "$OUTPUT_DIR/sfx/$type_name"
  
  for file in "$type_dir"/*.{mp3,wav,flac}; do
    [ -f "$file" ] || continue
    filename=$(basename "$file")
    name="${filename%.*}"
    ffmpeg -i "$file" -c:a libvorbis -q:a 2 -ar 22050 -ac 1 "$OUTPUT_DIR/sfx/$type_name/$name.ogg"
  done
done

echo "压缩完成！"
```

## 注意事项

1. **版权问题**：确保所有音频文件使用CC0或CC-BY授权
2. **文件命名**：保持与技能key一致
3. **音频长度**：
   - BGM：循环播放，建议2-4分钟
   - 音效：0.5-2秒
4. **音质平衡**：压缩后保持可接受的音质
5. **测试**：每个音效都要在游戏中测试

## 下一步行动

由于这是一个需要大量手动工作的任务，建议：

1. **优先级排序**：先替换最重要的音频（如主要地图BGM和常用技能音效）
2. **分批实施**：
   - 第一批：3个主要地图BGM + 10个常用技能音效
   - 第二批：剩余地图BGM + 20个技能音效
   - 第三批：所有剩余音效
3. **使用AI辅助**：可以使用AI音频生成工具（如Suno AI, Soundraw）生成部分音效

## 快速启动命令

```bash
# 安装ffmpeg（如果未安装）
# macOS
brew install ffmpeg

# 创建目录结构
mkdir -p raw_audio/{maps,sfx/{normal,fire,water,grass,electric,ice,fighting,poison,ground,flying,psychic,bug,rock,ghost,dragon,steel,fairy}}

# 下载音频文件后，运行压缩脚本
chmod +x download-and-compress.sh
./download-and-compress.sh
```

---

**建议：** 这个任务工作量很大，建议分阶段实施或考虑使用现有的游戏音效包（如GBA Pokemon音效包）来加速开发。
