# 地图缓存问题诊断报告

## 问题总结

地图修改后没有显示变化，主要原因是**多层缓存机制**在使用旧资源。

## 缓存层级分析

### 1. Service Worker PWA 缓存 ⚠️ **最关键**

**位置:** `vite.config.js` 第 50-129 行

```javascript
VitePWA({
  workbox: {
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.pathname.endsWith('.glb'),
        handler: 'CacheFirst',
        options: {
          cacheName: `game-glb-${appBuildId}`,
          expiration: {
            maxEntries: 220,
            maxAgeSeconds: 60 * 60 * 24 * 30  // 30天
          }
        }
      }
    ]
  }
})
```

**问题:** 
- GLB 3D模型文件被缓存30天
- 即使代码更新，浏览器仍使用旧的缓存模型
- 缓存名称包含 `buildId`，但如果 buildId 没变，缓存不会更新

### 2. 浏览器缓存

**位置:** 浏览器内置缓存机制

**问题:**
- 静态资源（GLB、图片等）被浏览器缓存
- 需要硬刷新才能清除

### 3. Three.js 内存缓存

**位置:** `src/game/threeLowPolyModelCache.js` 第 55-56 行

```javascript
const MODEL_SCENE_CACHE = new Map()
const MODEL_LOAD_PROMISE_CACHE = new Map()
```

**问题:**
- 页面刷新后会清除，影响较小
- 但在同一会话中会一直使用缓存的模型

## 地图数据流分析

### 数据流路径

```
godot_region_maps.js (定义)
  ↓
buildGodotRegionMap() (构建)
  ↓
decorativeObjects (装饰物数组)
  ↓
buildBoundaryVisualBlockers() (边界装饰)
  ↓
GODOT_REGION_MAPS (导出)
  ↓
mapCatalog.js (目录)
  ↓
overworldMaps.js (适配层)
  ↓
ThreeLowPolyMap.jsx (渲染)
  ↓
threeLowPolyModelCache.js (加载模型)
  ↓
MAP_MODEL_MANIFEST.generated.js (模型清单)
```

### 关键发现

1. **边界装饰生成逻辑** (`godot_region_maps.js:2155`)
   - `buildBoundaryVisualBlockers()` 函数负责生成边界装饰
   - 使用 `BOUNDARY_VISUAL_BLOCKER_PROFILES` 配置不同地图的边界样式
   - 最近的修改将 `nature_rock_large` 和 `nature_stone_large` 添加到了多个地图配置中

2. **装饰物过滤** (`godot_region_maps.js:5131-5214`)
   - 多个过滤步骤可能会移除装饰物：
     - `filterPathClearanceDecorations()` - 清除路径上的装饰
     - `filterFixedLandmarkOverlaps()` - 清除与地标重叠的装饰
     - `filterBridgeSurfaceDecorations()` - 清除桥面上的装饰
     - `filterBlockedLowVegetationDecorations()` - 清除被阻挡的低矮植被

3. **SOFTENABLE_BOUNDARY_BLOCKER_TYPES 已清空** (`godot_region_maps.js:1595`)
   ```javascript
   const SOFTENABLE_BOUNDARY_BLOCKER_TYPES = new Set([])
   ```
   - 之前可能包含 `nature_rock_large` 和 `nature_stone_large`
   - 现在为空，意味着这些装饰不会被"软化"处理

## 模型清单更新

**文件:** `src/game/data/mapModelManifest.generated.js`

最近的修改添加了新模型到各个地图：
- `nature_stone_large`
- `nature_log_stack`
- `nature_rock_large`

这些模型已经在清单中，但可能：
1. GLB 文件被缓存了旧版本
2. 模型加载失败但被静默处理
3. 装饰物被过滤逻辑移除了

## 潜在问题点

### 1. 缓存未清除
- **最可能的原因**
- Service Worker 仍在使用旧的 GLB 文件

### 2. 模型加载失败
检查浏览器控制台是否有：
```
[ThreeLowPolyMap] Failed to load nature_rock_large
```

### 3. 装饰物被过滤
- 边界装饰可能被路径清除逻辑移除
- 检查 `filterPathClearanceDecorations()` 是否过于激进

### 4. 渲染配置问题
检查 `resolveMapRendererProfile()` (`ThreeLowPolyMap.jsx:48-64`)：
```javascript
castDecorationShadows: !liteTier,
castAllDecorationShadows: !liteTier
```

如果用户在 lite 模式，某些装饰可能不显示阴影。

## 解决方案

### 立即解决（用户端）

1. **清除 Service Worker 缓存**
   - F12 → Application → Clear site data
   
2. **硬刷新**
   - Ctrl+Shift+R (Windows) 或 Cmd+Shift+R (Mac)
   
3. **使用隐身模式测试**
   - 完全避开缓存

### 开发时避免（开发者端）

1. **禁用 Service Worker**
   - Application → Service Workers → Bypass for network
   
2. **禁用缓存**
   - Network → Disable cache
   
3. **修改 buildId**
   - 每次修改地图后更新 buildId，强制缓存失效

### 代码层面修复

1. **添加版本控制到 GLB URL**
   ```javascript
   const MODEL_URLS = {
     rock: `${MODEL_BASE}rock_largeA.glb?v=${__APP_BUILD_ID__}`
   }
   ```

2. **添加调试日志**
   在 `ThreeLowPolyMap.jsx` 中添加：
   ```javascript
   console.log('[Map] Decorations count:', mapInfo?.decorativeObjects?.length)
   console.log('[Map] Models loaded:', Object.keys(models))
   ```

3. **检查过滤逻辑**
   在 `filterPathClearanceDecorations()` 中添加日志，查看哪些装饰被移除了

## 验证步骤

1. 打开浏览器开发者工具
2. Network 标签 → 刷新页面
3. 查找 `.glb` 文件请求
4. 确认 Size 列显示实际大小，而不是 "(disk cache)"
5. Console 标签 → 查找地图相关日志
6. 检查是否有模型加载失败的警告

## 结论

**主要问题:** Service Worker PWA 缓存导致旧的 GLB 模型文件被持续使用。

**次要问题:** 可能存在装饰物过滤逻辑过于激进，移除了新添加的边界装饰。

**建议:** 
1. 先清除缓存验证是否是缓存问题
2. 如果清除缓存后仍无变化，检查装饰物过滤逻辑
3. 添加调试日志追踪装饰物的生成和过滤过程
