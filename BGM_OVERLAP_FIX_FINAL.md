# BGM叠加问题修复 - 最终版

## 修复的问题

### 问题：刷新后多个BGM重叠播放

**原因**：
1. `playMapAmbient` 和 `playBattleBgm` 在播放新BGM前没有立即停止旧BGM
2. `stop({ immediate: false })` 使用40ms淡出，在快速切换时可能导致叠加
3. `scheduleLayerTeardown` 的immediate模式仍然有40ms延迟

## 修复内容

### 1. 立即停止机制
在播放新BGM前，强制立即停止所有现有BGM：

```javascript
// playMapAmbient 和 playBattleBgm 中
await this.stop({ immediate: true })
```

### 2. 真正的立即停止
修改 `stop()` 方法，immediate模式使用0ms延迟：

```javascript
const fadeMs = immediate ? 0 : FADE_MS  // 之前是40ms
```

### 3. 改进 scheduleLayerTeardown
immediate模式下立即停止音频源，不等待：

```javascript
if (immediate) {
  // 立即停止，不淡出
  try {
    layer.source.stop(now)
    layer.source.disconnect()
  } catch { /* ignore */ }
  try { layer.gain.disconnect() } catch { /* ignore */ }
  resolve()
}
```

---

## 防止BGM叠加的完整机制

### 1. playToken检查
每次播放递增token，加载完成后检查是否被取消：
```javascript
const playToken = ++this.playToken
// ... 加载音频 ...
if (playToken !== this.playToken) return false
```

### 2. 重复播放检查
如果已经在播放相同的BGM，只同步音量：
```javascript
if (this.currentTrackKey === trackKey && this.activeLayer) {
  this.syncBgmBusGain(0.05)
  this.syncActiveLayerGain(0.05)
  return true
}
```

### 3. 强制停止旧BGM
播放新BGM前立即停止所有旧BGM：
```javascript
await this.stop({ immediate: true })
```

### 4. fadeOutAllLayers清理
停止所有层并清除定时器：
```javascript
this.pendingStopTimers.forEach(timerId => clearTimeout(timerId))
this.pendingStopTimers.clear()
```

### 5. transitionChain队列
所有操作串行执行，防止并发冲突：
```javascript
enqueueTransition(task) {
  const run = this.transitionChain.then(task, task)
  this.transitionChain = run.catch(() => {})
  return run
}
```

---

## 测试场景

### ✅ 场景1: 快速刷新
1. 刷新页面
2. 立即再次刷新
3. 应该只有一个BGM播放

### ✅ 场景2: 快速切换场景
1. 在地图上
2. 快速进入战斗
3. 快速返回地图
4. 应该只有一个BGM播放

### ✅ 场景3: 连续刷新
1. 连续刷新5次
2. 每次都应该只有一个BGM

### ✅ 场景4: 地图切换
1. 在地图A
2. 移动到地图B
3. 应该平滑切换，无叠加

---

## 修改的文件

`src/utils/gameBgm.js`:
1. `stop()` - immediate模式使用0ms延迟
2. `scheduleLayerTeardown()` - immediate模式立即停止
3. `playMapAmbient()` - 播放前强制停止
4. `playBattleBgm()` - 播放前强制停止

---

## 构建状态

✅ 构建成功

---

## 测试步骤

1. **刷新页面** (Cmd+R)
2. **点击页面解锁音频**
3. **再次刷新**
4. **应该只听到一个BGM**

如果还有叠加，请告诉我具体情况！
