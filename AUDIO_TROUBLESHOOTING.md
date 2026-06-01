# 音频问题诊断指南

## 问题：没有任何音效或BGM

### 快速诊断步骤

1. **打开浏览器开发者工具**
   - Chrome/Edge: 按 `F12` 或 `Ctrl+Shift+I` (Mac: `Cmd+Option+I`)
   - 切换到 Console 标签页

2. **加载调试工具**
   在控制台输入：
   ```javascript
   const script = document.createElement('script');
   script.src = '/xingyin-pokemon-game/audio-debug.js';
   document.head.appendChild(script);
   ```

3. **运行诊断**
   ```javascript
   audioDebug.diagnose()
   ```

4. **查看输出**
   检查以下关键信息：
   - `contextState` - 应该是 "running" 或 "suspended"
   - `audioEnabled` - 应该是 "true"
   - `bgmEnabled` - 应该是 true
   - `bgmVolume` - 应该大于 0
   - `已缓存的音频文件数量` - 应该大于 0

### 常见问题和解决方案

#### 问题1: contextState 是 "suspended"
**原因**: AudioContext未解锁（浏览器要求用户手势）

**解决方案**:
```javascript
audioDebug.unlockAudio()
```
然后点击页面任意位置。

#### 问题2: bgmEnabled 是 false 或 bgmVolume 是 0
**原因**: BGM被关闭或音量为0

**解决方案**:
1. 点击右上角的🎵按钮打开BGM
2. 或在控制台运行：
```javascript
localStorage.setItem('pokemon-game:audio-settings:v2', JSON.stringify({
  sfxEnabled: true,
  sfxVolume: 0.72,
  bgmEnabled: true,
  bgmVolume: 0.72
}));
location.reload();
```

#### 问题3: 已缓存的音频文件数量是 0
**原因**: 音频文件未加载

**解决方案**:
1. 检查网络连接
2. 检查浏览器Network标签，看是否有404错误
3. 确认音频文件存在于 `public/assets/audio/` 目录

#### 问题4: contextState 是 "closed"
**原因**: AudioContext被意外关闭

**解决方案**:
```javascript
location.reload();
```

### 手动测试

#### 测试SFX（音效）
```javascript
audioDebug.testSfx()
```
应该听到一个确认音效。

#### 测试BGM（背景音乐）
```javascript
// 先解锁
await audioDebug.unlockAudio()

// 检查BGM状态
audioDebug.testBgm()

// 如果pendingScene不为null但没有播放，手动触发
gameBgm.playMapAmbient('GodotMap')
```

### 检查HTML元素

在控制台运行：
```javascript
document.documentElement.dataset
```

查看：
- `audioState` - AudioContext状态
- `audioEnabled` - 音效是否启用
- `audioVolume` - 音效音量
- `audioSupported` - 是否支持AudioContext

### 浏览器兼容性检查

```javascript
console.log('AudioContext:', window.AudioContext || window.webkitAudioContext);
console.log('User Agent:', navigator.userAgent);
```

### 如果以上都不行

1. **清除缓存和localStorage**
   ```javascript
   localStorage.clear();
   location.reload();
   ```

2. **检查浏览器控制台是否有错误**
   查找红色的错误信息

3. **尝试不同的浏览器**
   - Chrome
   - Firefox
   - Edge
   - Safari

4. **检查浏览器音频权限**
   - Chrome: 地址栏左侧的锁图标 → 网站设置 → 声音
   - 确保"声音"设置为"允许"

### 提供反馈

如果问题仍然存在，请提供以下信息：
1. `audioDebug.diagnose()` 的完整输出
2. 浏览器控制台的错误信息（如果有）
3. 浏览器名称和版本
4. 操作系统

## 预期的正常输出

```
=== AudioContext调试信息 ===
- 是否支持: true
- 状态: running
- 原因: unlocked
- 错误: 
- 音效已启用: true
- 音效音量: 0.72

=== localStorage音频设置 ===
- SFX启用: true
- SFX音量: 0.72
- BGM启用: true
- BGM音量: 0.72

=== BGM状态 ===
- enabled: true
- volume: 0.72
- currentTrackKey: map:GodotMap
- activeLayer: [object Object]
- pendingScene: {kind: 'map', mapName: 'GodotMap'}
- bufferCache size: 14

=== 已缓存的音频文件 ===
14个文件已加载
```
