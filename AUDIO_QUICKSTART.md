# 音频替换项目 - 快速开始指南

## 已完成的工作

✅ **创建了完整的自动化下载脚本**
- `scripts/download-audio.mjs` - Node.js下载脚本，支持重试和进度显示
- `scripts/compress-audio.sh` - Bash压缩脚本，自动压缩所有音频文件

✅ **配置了所有音频资源**
- 9个地图BGM（已验证的OpenGameArt.org下载链接）
- 48个战斗技能音效（Freesound.org CC0资源）

✅ **更新了package.json**
- 添加了 `npm run download:audio` 命令
- 添加了 `npm run compress:audio` 命令

✅ **创建了详细文档**
- `AUDIO_REPLACEMENT_PLAN.md` - 完整实施方案
- `AUDIO_RESOURCES_CONFIG.md` - 所有音频资源配置和下载链接

## 如何使用

### 第一步：下载音频文件

```bash
# 下载所有音频（地图BGM + 技能音效）
npm run download:audio

# 或者分别下载
npm run download:audio:maps  # 只下载地图BGM
npm run download:audio:sfx   # 只下载技能音效
```

**注意**: 
- 地图BGM的下载链接已验证可用（来自OpenGameArt.org）
- 技能音效的链接是示例链接，部分可能需要手动调整
- 下载过程支持自动重试（最多3次）

### 第二步：压缩音频文件

```bash
# 需要先安装ffmpeg
brew install ffmpeg  # macOS
# 或 sudo apt install ffmpeg  # Linux

# 压缩所有音频文件
npm run compress:audio
```

**压缩效果**:
- BGM: 96kbps 立体声 44.1kHz
- SFX: 64kbps 单声道 22.05kHz
- 预期减少 50-60% 文件大小

### 第三步：验证和测试

```bash
# 启动开发服务器
npm run dev

# 在游戏中测试：
# 1. 访问不同地图，听BGM是否正常
# 2. 进行战斗，测试技能音效
```

## 文件结构

下载完成后的目录结构：

```
public/assets/audio/
├── maps/
│   ├── godot-map.ogg          (新手村)
│   ├── godot-map-v2.ogg       (草径)
│   ├── mist-lake.ogg          (雾湖)
│   ├── farm-town.ogg          (农庄)
│   ├── pirate-shore.ogg       (海岸)
│   ├── graveyard.ogg          (墓园)
│   ├── hex-ruins.ogg          (遗迹)
│   ├── survival-ridge.ogg     (营地)
│   └── boss-highland.ogg      (高地)
├── battle/
│   └── (保持现有战斗BGM)
└── sfx/
    ├── normal/
    │   ├── tackle.ogg
    │   ├── scratch.ogg
    │   └── ...
    ├── fire/
    │   ├── ember.ogg
    │   ├── flamethrower.ogg
    │   └── fire_blast.ogg
    ├── water/
    ├── grass/
    ├── electric/
    ├── ice/
    ├── fighting/
    ├── poison/
    ├── ground/
    ├── flying/
    ├── psychic/
    ├── bug/
    ├── rock/
    ├── ghost/
    ├── dragon/
    ├── steel/
    └── fairy/
```

## 关于技能音效链接

**重要说明**: 

由于Freesound.org的音效需要逐个搜索和验证，我在脚本中提供的是**示例链接**。实际使用时，你有两个选择：

### 选项A：手动搜索真实音效（推荐）

1. 访问 https://freesound.org
2. 搜索关键词（参考 `AUDIO_RESOURCES_CONFIG.md`）
3. 筛选 CC0 授权
4. 下载音效并放到对应目录
5. 运行 `npm run compress:audio` 压缩

### 选项B：使用现成的游戏音效包

从以下来源获取现成的宝可梦风格音效：

1. **GBA Pokemon Sound Effects Pack**
   - 搜索 "pokemon gba sound effects"
   - 包含所有经典技能音效

2. **OpenGameArt Pokemon-style SFX**
   - https://opengameart.org/content/50-rpg-sound-effects
   - CC0授权的RPG音效包

3. **Freesound Collections**
   - https://freesound.org/people/LittleRobotSoundFactory/
   - 游戏音效专业制作者

### 选项C：AI生成音效

使用AI工具生成音效：
- **ElevenLabs** - 音效生成
- **Soundraw** - 游戏音效
- **Suno AI** - 音乐和音效

## 预期结果

完成后你将获得：

✅ **9个新的地图BGM**
- 不太吵但符合地图特点
- 文件大小优化（压缩后约 4-5 MB）

✅ **48个战斗技能音效**
- 每个技能都有专属音效
- 文件大小优化（压缩后约 1-2 MB）

✅ **总体优化**
- 原始大小: ~14 MB
- 压缩后: ~6-7 MB
- 减少约 50-60%

## 故障排除

### 下载失败
```bash
# 检查网络连接
curl -I https://opengameart.org

# 手动下载单个文件
curl -o public/assets/audio/maps/godot-map.ogg \
  "https://opengameart.org/sites/default/files/8bit%20attempt.ogg"
```

### 压缩失败
```bash
# 检查ffmpeg是否安装
ffmpeg -version

# 手动压缩单个文件
ffmpeg -i input.mp3 -c:a libvorbis -q:a 3 -ar 44100 -ac 2 output.ogg
```

### 音频不播放
1. 检查文件路径是否正确
2. 检查浏览器控制台是否有错误
3. 确认音频文件格式为 OGG
4. 检查 `manifest.json` 是否更新

## 下一步

1. **运行下载脚本**: `npm run download:audio`
2. **压缩音频**: `npm run compress:audio`
3. **测试游戏**: `npm run dev`
4. **调整音量**: 在 `src/utils/gameAudio.js` 中调整音量参数

## 需要帮助？

查看详细文档：
- `AUDIO_REPLACEMENT_PLAN.md` - 完整实施方案
- `AUDIO_RESOURCES_CONFIG.md` - 所有资源配置
- `AUDIO_DOWNLOAD_REPORT.md` - 下载报告（运行后生成）

---

**提示**: 由于技能音效数量较多（48个），建议先下载和测试地图BGM，确认流程正常后再处理技能音效。
