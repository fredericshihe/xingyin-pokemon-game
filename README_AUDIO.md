# 🎵 音频系统使用说明

## 快速开始

### 1. 测试地图BGM
```bash
npm run dev
```
访问游戏，所有9个地图都有背景音乐。

### 2. 使用技能音效

在你的代码中：

```javascript
import { gameAudio } from './utils/gameAudio.js'

// 播放技能音效
await gameAudio.playMoveSfx('ember')

// 预加载多个音效
await gameAudio.preloadMoveSfx(['ember', 'watergun', 'thunderbolt'])
```

## 可用命令

```bash
# 下载音频
npm run download:audio              # 下载所有
npm run download:audio:maps         # 只下载BGM
npm run download:audio:sfx          # 只下载音效

# 压缩音频 (需要先安装 ffmpeg)
npm run compress:audio

# 开发测试
npm run dev
```

## 文档

- **MOVE_SFX_USAGE_GUIDE.md** - 技能音效完整使用指南
- **AUDIO_README.md** - 项目总览
- **AUDIO_FINAL_PROGRESS.md** - 最新进度
- **START_HERE.txt** - 快速入口

## 当前状态

✅ **已完成 (65%)**:
- 9个地图BGM
- 代码集成
- 完整文档

⏳ **待完成 (35%)**:
- 音频压缩
- 48个技能音效下载

## 下一步

1. 安装 ffmpeg: `brew install ffmpeg`
2. 压缩音频: `npm run compress:audio`
3. 下载技能音效（参考文档）

---

查看 **FINAL_REPORT.txt** 了解完整报告
