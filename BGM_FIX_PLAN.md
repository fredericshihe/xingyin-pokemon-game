# BGM叠加问题修复方案

## 问题根源

在`OriginalGame.jsx`中，BGM管理存在以下问题：

### 1. battleEnvironment清除时机不当（第10970-10974行）

```javascript
useEffect(() => {
  if (view !== 'battle' && battleEnvironment) {
    setBattleEnvironment(null);
  }
}, [battleEnvironment, view]);
```

**问题**：这个useEffect在`view`变化后才清除`battleEnvironment`，但BGM的useEffect（第9965-9998行）同时依赖这两个值，可能导致竞态条件。

### 2. BGM useEffect的判断逻辑（第9965-9998行）

```javascript
useEffect(() => {
  if (!bgmPrefs.enabled || bgmPrefs.volume <= 0) {
    void gameBgm.stop({ immediate: true });
    return undefined;
  }

  // 战斗期间：始终播放战斗BGM
  if (battleEnvironment) {
    void gameBgm.playBattleBgm({...});
    return undefined;
  }

  // 地图期间：始终播放地图BGM
  if (!showLaunchScreen && currentMapName) {
    void gameBgm.playMapAmbient(currentMapName);
    return undefined;
  }

  void gameBgm.stop({ immediate: true });
  return undefined;
}, [
  bgmPrefs.enabled,
  bgmPrefs.volume,
  battleEnvironment,
  currentMapName,
  showLaunchScreen,
  view  // ⚠️ view在依赖数组中但逻辑中未使用
]);
```

**问题**：
- 依赖数组包含`view`但判断逻辑中没有使用
- 只依赖`battleEnvironment`来判断是否播放战斗BGM
- 当`view`变化但`battleEnvironment`还未清除时，可能导致错误的BGM播放

## 修复方案

### 方案1：在BGM useEffect中同时检查view和battleEnvironment

```javascript
useEffect(() => {
  if (!bgmPrefs.enabled || bgmPrefs.volume <= 0) {
    void gameBgm.stop({ immediate: true });
    return undefined;
  }

  // 战斗期间：同时检查view和battleEnvironment
  if (view === 'battle' && battleEnvironment) {
    void gameBgm.playBattleBgm({
      battleKind: battleEnvironment.battleKind,
      eventRole: battleEnvironment.eventRole,
      eventType: battleEnvironment.eventType
    });
    return undefined;
  }

  // 地图期间：确保不在战斗中
  if (view === 'map' && !showLaunchScreen && currentMapName) {
    void gameBgm.playMapAmbient(currentMapName);
    return undefined;
  }

  // 其他情况停止BGM
  void gameBgm.stop({ immediate: true });
  return undefined;
}, [
  bgmPrefs.enabled,
  bgmPrefs.volume,
  battleEnvironment,
  currentMapName,
  showLaunchScreen,
  view
]);
```

### 方案2：移除view依赖，只依赖battleEnvironment和activeEnemyId

```javascript
useEffect(() => {
  if (!bgmPrefs.enabled || bgmPrefs.volume <= 0) {
    void gameBgm.stop({ immediate: true });
    return undefined;
  }

  // 战斗期间：检查battleEnvironment或activeEnemyId
  const isBattleActive = Boolean(battleEnvironment || activeEnemyId);
  
  if (isBattleActive && battleEnvironment) {
    void gameBgm.playBattleBgm({
      battleKind: battleEnvironment.battleKind,
      eventRole: battleEnvironment.eventRole,
      eventType: battleEnvironment.eventType
    });
    return undefined;
  }

  // 地图期间
  if (!isBattleActive && !showLaunchScreen && currentMapName) {
    void gameBgm.playMapAmbient(currentMapName);
    return undefined;
  }

  void gameBgm.stop({ immediate: true });
  return undefined;
}, [
  bgmPrefs.enabled,
  bgmPrefs.volume,
  battleEnvironment,
  activeEnemyId,
  currentMapName,
  showLaunchScreen
]);
```

## 推荐方案

**方案1**更简单直接，通过同时检查`view`和`battleEnvironment`来确保BGM切换的准确性。

## 额外改进

在`gameBgm.js`中，`playBattleBgm`和`playMapAmbient`都已经调用了`stop({ immediate: true })`来停止现有BGM，这是正确的。但我们需要确保React层面的判断逻辑也是正确的。
