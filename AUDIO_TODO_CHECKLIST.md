# 音频替换项目 - 执行清单

## ✅ 已完成 (25%)

- [x] 创建自动化下载脚本
- [x] 创建音频压缩脚本
- [x] 下载所有9个地图BGM
- [x] 更新 package.json
- [x] 创建完整文档系统
- [x] 配置所有48个技能音效的下载链接

## ⏳ 待完成 (75%)

### 第一步：安装 ffmpeg 并压缩音频

```bash
# 安装 ffmpeg
brew install ffmpeg

# 压缩所有地图BGM
npm run compress:audio
```

**预期结果**: 
- 文件大小从 8.3 MB 减少到 4-5 MB
- 节省 3-4 MB 空间

**检查点**:
- [ ] ffmpeg 安装成功
- [ ] 压缩脚本运行成功
- [ ] 所有9个BGM文件已压缩
- [ ] 文件大小明显减少

---

### 第二步：测试地图BGM

```bash
# 启动开发服务器
npm run dev

# 在浏览器中测试
# 访问每个地图，确认BGM正常播放
```

**测试清单**:
- [ ] godot-map (新手村) - BGM播放正常
- [ ] godot-map-v2 (草径) - BGM播放正常
- [ ] mist-lake (雾湖) - BGM播放正常 ⚠️ 文件较小，重点测试
- [ ] farm-town (农庄) - BGM播放正常
- [ ] pirate-shore (海岸) - BGM播放正常
- [ ] graveyard (墓园) - BGM播放正常
- [ ] hex-ruins (遗迹) - BGM播放正常
- [ ] survival-ridge (营地) - BGM播放正常
- [ ] boss-highland (高地) - BGM播放正常

---

### 第三步：处理技能音效 (48个)

#### 选项A：使用现成音效包（推荐，最快）

```bash
# 1. 创建目录结构
mkdir -p public/assets/audio/sfx/{normal,fire,water,grass,electric,ice,fighting,poison,ground,flying,psychic,bug,rock,ghost,dragon,steel,fairy}

# 2. 下载 GBA Pokemon 音效包
# 搜索: "pokemon gba sound effects pack"
# 或访问: https://www.sounds-resource.com/game_boy_advance/

# 3. 解压并复制音效到对应目录
# 按照 AUDIO_RESOURCES_CONFIG.md 中的文件名命名

# 4. 压缩音效
npm run compress:audio
```

**检查点**:
- [ ] 创建了所有类型目录
- [ ] 下载了音效包
- [ ] 复制了所有48个音效
- [ ] 运行了压缩脚本
- [ ] 文件大小合理（每个10-30KB）

#### 选项B：手动搜索下载（最准确）

访问 https://freesound.org，按照 `AUDIO_RESOURCES_CONFIG.md` 中的关键词逐个搜索：

**普通系** (12个):
- [ ] tackle (撞击)
- [ ] scratch (抓)
- [ ] horn_attack (角撞)
- [ ] quickattack (电光一闪)
- [ ] flail (挣扎)
- [ ] fury_attack (乱击)
- [ ] bite (咬住)
- [ ] bodyslam (泰山压顶)
- [ ] slash (劈开)
- [ ] extremespeed (神速)
- [ ] recover (自我再生)
- [ ] mimic (模仿)

**火系** (3个):
- [ ] ember (火花)
- [ ] flamethrower (喷射火焰)
- [ ] fire_blast (大字爆炎)

**水系** (3个):
- [ ] watergun (水枪)
- [ ] surf (冲浪)
- [ ] hydropump (水炮)

**草系** (2个):
- [ ] vinewhip (藤鞭)
- [ ] razorleaf (飞叶快刀)

**电系** (3个):
- [ ] thundershock (电击)
- [ ] thunderbolt (十万伏特)
- [ ] zap_cannon (电磁炮)

**冰系** (2个):
- [ ] icebeam (冰冻光束)
- [ ] blizzard (暴风雪)

**格斗系** (3个):
- [ ] karate_chop (空手劈)
- [ ] double_kick (二连踢)
- [ ] low_kick (下踢)

**毒系** (2个):
- [ ] poison_sting (毒针)
- [ ] poison_jab (毒击)

**地面系** (1个):
- [ ] earthquake (地震)

**飞行系** (6个):
- [ ] peck (啄)
- [ ] wing_attack (翅膀攻击)
- [ ] fly (飞翔)
- [ ] drill_peck (钻孔啄)
- [ ] hurricane (暴风)
- [ ] sky_attack (神鸟猛击)

**超能力系** (3个):
- [ ] psychic (精神强念)
- [ ] hypnosis (催眠术)
- [ ] dream_eater (食梦)

**虫系** (1个):
- [ ] fury_cutter (连斩)

**岩石系** (3个):
- [ ] rock_throw (落石)
- [ ] rock_slide (岩崩)
- [ ] rollout (滚动)

**幽灵系** (3个):
- [ ] lick (舔)
- [ ] shadowball (暗影球)
- [ ] rage_fist (愤怒之拳)

**龙系** (1个):
- [ ] dragonclaw (龙爪)

**钢系** (1个):
- [ ] iron_tail (铁尾)

**妖精系** (1个):
- [ ] moonblast (月亮之力)

#### 选项C：AI生成音效

使用以下工具生成：
- ElevenLabs: https://elevenlabs.io
- Suno AI: https://suno.ai
- Soundraw: https://soundraw.io

---

### 第四步：更新代码以支持技能音效

修改 `src/utils/gameAudio.js`，添加技能音效播放功能：

```javascript
// 在 GameAudioController 类中添加方法
async playMoveSfx(moveKey, options = {}) {
  const move = MOVES[moveKey]
  if (!move) return
  
  const moveType = move.type || 'normal'
  const typeFolder = moveType.toLowerCase()
  const url = `/assets/audio/sfx/${typeFolder}/${moveKey}.ogg`
  
  return this.playSfx(url, {
    volume: 0.6,
    ...options
  })
}
```

**检查点**:
- [ ] 添加了 playMoveSfx 方法
- [ ] 在战斗系统中调用该方法
- [ ] 测试技能音效播放

---

### 第五步：更新 manifest.json

将所有新音频文件添加到配置中：

```json
{
  "tracks": {
    "maps/godot-map.ogg": { ... },
    "sfx/fire/ember.ogg": {
      "bytes": 15000,
      "type": "fire",
      "move": "ember",
      "license": "CC0"
    },
    ...
  }
}
```

**检查点**:
- [ ] 添加了所有地图BGM条目
- [ ] 添加了所有技能音效条目
- [ ] 验证JSON格式正确

---

### 第六步：最终测试

```bash
# 运行完整测试
npm run dev

# 测试清单
```

**功能测试**:
- [ ] 所有地图BGM正常播放
- [ ] 地图切换时BGM正确切换
- [ ] 所有技能音效正常播放
- [ ] 音量控制正常工作
- [ ] 音频开关正常工作

**性能测试**:
- [ ] 音频加载速度快
- [ ] 不影响游戏帧率
- [ ] 内存占用合理

**兼容性测试**:
- [ ] Chrome 浏览器正常
- [ ] Safari 浏览器正常
- [ ] Firefox 浏览器正常
- [ ] 移动端浏览器正常

---

## 📊 进度追踪

```
总任务: 6个主要步骤
已完成: 0个
进度: 0%

预计时间:
- 步骤1 (ffmpeg安装压缩): 30分钟
- 步骤2 (测试BGM): 20分钟
- 步骤3 (技能音效): 2-4小时
- 步骤4 (代码更新): 30分钟
- 步骤5 (配置更新): 30分钟
- 步骤6 (最终测试): 1小时

总计: 5-7小时
```

## 🎯 优先级建议

### 高优先级（立即执行）
1. ✅ 安装 ffmpeg
2. ✅ 压缩地图BGM
3. ✅ 测试地图BGM

### 中优先级（本周完成）
4. ⏳ 下载常用技能音效（火、水、草、电）
5. ⏳ 更新代码支持音效播放
6. ⏳ 测试常用技能

### 低优先级（有时间再做）
7. ⏳ 下载剩余技能音效
8. ⏳ 更新完整配置
9. ⏳ 完整测试

## 📁 相关文档

- 完整方案: `AUDIO_REPLACEMENT_PLAN.md`
- 资源配置: `AUDIO_RESOURCES_CONFIG.md`
- 快速指南: `AUDIO_QUICKSTART.md`
- 进度报告: `AUDIO_DOWNLOAD_PROGRESS.md`
- 项目总结: `AUDIO_PROJECT_SUMMARY.md`

---

**创建时间**: 2026-05-28
**最后更新**: 2026-05-28 11:55
**当前状态**: 地图BGM已下载，等待压缩和技能音效处理
