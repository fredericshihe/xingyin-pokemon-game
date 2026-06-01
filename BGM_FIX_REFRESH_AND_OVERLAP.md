# BGM刷新和叠加问题修复

## 修复的问题

### 问题1: 页面刷新后BGM无法恢复
**原因**: `pendingScene`在stop时没有被清除，导致刷新后无法记住新的场景

**修复**: 在`stop()`方法中清除`pendingScene`
```javascript
async stop({ immediate = false } = {}) {
  this.playToken += 1
  this.currentMode = null
  this.currentTrackKey = null
  this.pendingScene = null  // ✅ 清除待处理场景
  // ...
}
```

### 问题2: 可能出现两个BGM叠加播放
**原因**: 
1. `fadeOutAllLayers`没有清除待处理的停止定时器
2. `transitionTo`在切换BGM时可能没有完全停止旧的BGM

**修复**: 
1. 在`fadeOutAllLayers`中清除所有待处理的定时器
2. 在`transitionTo`中添加注释说明防止叠加的逻辑
3. 在`playMapAmbient`和`playBattleBgm`中添加注释说明重复播放检查

```javascript
async fadeOutAllLayers({ fadeMs = FADE_MS, immediate = false } = {}) {
  const layers = [this.activeLayer, ...this.retiringLayers].filter(Boolean)
  this.activeLayer = null
  this.retiringLayers = []

  // ✅ 清除所有待处理的停止定时器，防止旧BGM继续播放
  this.pendingStopTimers.forEach(timerId => clearTimeout(timerId))
  this.pendingStopTimers.clear()

  if (!layers.length) return
  await Promise.all(layers.map((layer) => this.scheduleLayerTeardown(layer, { fadeMs, immediate })))
}
```

### 问题3: useEffect中的BGM控制逻辑不够清晰
**原因**: 注释不够详细，容易误解逻辑

**修复**: 添加详细注释说明每个分支的作用

```javascript
useEffect(() => {
  // 停止所有BGM，防止叠加
  if (!bgmPrefs.enabled || bgmPrefs.volume <= 0) {
    void gameBgm.stop({ immediate: false });
    return undefined;
  }

  // 播放战斗BGM
  if (view === 'battle' && battleEnvironment) {
    void gameBgm.playBattleBgm({...});
    return undefined;
  }

  // 播放地图BGM
  if (view === 'map' && !showLaunchScreen && currentMapName) {
    void gameBgm.playMapAmbient(currentMapName);
    return undefined;
  }

  // 其他情况停止BGM
  void gameBgm.stop({ immediate: false });
  return undefined;
}, [...]);
```

---

## 防止BGM叠加的机制

### 1. playToken机制
每次调用`playMapAmbient`或`playBattleBgm`时，`playToken`会递增。如果在加载音频期间用户切换了场景，旧的播放请求会被取消。

```javascript
const playToken = ++this.playToken
const buffer = await this.preloadUrl(...)
// 检查是否被取消
if (playToken !== this.playToken) return false
```

### 2. 重复播放检查
如果已经在播放相同的BGM，只同步音量，不重新播放。

```javascript
if (this.currentTrackKey === trackKey && this.activeLayer) {
  this.syncBgmBusGain(0.05)
  this.syncActiveLayerGain(0.05)
  return true  // 不重新播放
}
```

### 3. transitionTo中的fadeOutAllLayers
在启动新BGM前，先停止所有现有的BGM层。

```javascript
// 停止所有现有的BGM层，防止叠加
await this.fadeOutAllLayers({ fadeMs, immediate: false })

// 启动新的BGM层
const layer = this.startLayer(buffer, { fadeMs, loop })
```

### 4. 清除待处理的定时器
在`fadeOutAllLayers`中清除所有待处理的停止定时器。

```javascript
this.pendingStopTimers.forEach(timerId => clearTimeout(timerId))
this.pendingStopTimers.clear()
```

### 5. transitionChain队列
所有BGM切换操作都通过`enqueueTransition`排队，确保串行执行。

```javascript
enqueueTransition(task) {
  const run = this.transitionChain.then(task, task)
  this.transitionChain = run.catch(() => {})
  return run
}
```

---

## 刷新后BGM恢复的流程

1. **页面加载** → `audioSettings`从localStorage恢复
2. **useEffect触发** → 根据`view`和`currentMapName`决定播放哪个BGM
3. **用户手势** → 解锁AudioContext
4. **resumeAfterUnlock** → 根据`pendingScene`恢复BGM播放

---

## 测试场景

### 场景1: 页面刷新
1. 在地图上播放BGM
2. 刷新页面（F5）
3. ✅ 点击页面后，BGM应该恢复播放
4. ✅ 不应该有两个BGM叠加

### 场景2: 地图切换
1. 在地图A播放BGM
2. 移动到地图B
3. ✅ 应该平滑切换到地图B的BGM
4. ✅ 不应该有两个BGM叠加

### 场景3: 进入战斗
1. 在地图上播放BGM
2. 进入战斗
3. ✅ 应该切换到战斗BGM
4. ✅ 不应该有两个BGM叠加

### 场景4: 战斗结束
1. 在战斗中播放BGM
2. 战斗结束返回地图
3. ✅ 应该恢复地图BGM
4. ✅ 不应该有两个BGM叠加

### 场景5: 快速切换
1. 快速在地图和战斗之间切换
2. ✅ 应该只播放最后一个场景的BGM
3. ✅ 不应该有多个BGM叠加

### 场景6: 音量调节
1. 播放BGM
2. 调节音量滑块
3. ✅ 音量应该实时变化
4. ✅ 不应该重新播放BGM

### 场景7: 开关BGM
1. 播放BGM
2. 点击🎵按钮关闭
3. ✅ BGM应该停止
4. 再次点击🎵按钮打开
5. ✅ BGM应该恢复播放
6. ✅ 不应该有两个BGM叠加

---

## 修改的文件

1. `src/utils/gameBgm.js`
   - `stop()` - 清除pendingScene
   - `fadeOutAllLayers()` - 清除待处理的定时器
   - `transitionTo()` - 添加注释
   - `playMapAmbient()` - 添加注释
   - `playBattleBgm()` - 添加注释

2. `src/components/Game/OriginalGame.jsx`
   - BGM控制useEffect - 添加详细注释

---

## 构建状态

✅ 构建成功，无错误

---

## 下一步测试

请按照以下步骤测试：

1. **启动开发服务器**
   ```bash
   npm run dev
   ```

2. **测试刷新恢复**
   - 进入游戏
   - 点击页面（解锁AudioContext）
   - 确认BGM播放
   - 刷新页面（F5）
   - 再次点击页面
   - ✅ BGM应该恢复播放

3. **测试场景切换**
   - 在地图上移动
   - 进入战斗
   - 返回地图
   - ✅ 每次切换都应该只有一个BGM播放

4. **测试音量控制**
   - 拖动BGM音量滑块
   - ✅ 音量应该实时变化
   - ✅ 不应该重新播放BGM

5. **测试开关**
   - 点击🎵按钮关闭BGM
   - ✅ BGM应该停止
   - 再次点击打开
   - ✅ BGM应该恢复
   - ✅ 不应该有叠加

如果发现任何问题，请告诉我具体的现象！
