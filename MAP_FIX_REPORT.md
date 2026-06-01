# 地图装饰物修复报告

## 问题根源

找到了！问题是**装饰物类型名称不匹配**：

### 命名冲突

**地图数据中使用的名称：**
- `nature_rock_large`
- `nature_stone_large`
- `nature_bush_large`
- `nature_log_stack`

**模型加载器识别的名称：**
- `rock-large` (带连字符)
- `stone-large` (带连字符)
- `bush-large` (带连字符)
- ❌ `nature_log_stack` 完全缺失

### 数据验证

运行测试脚本确认装饰物数据存在：

```
GodotMapV2: 177 个装饰物，其中 43 个岩石/石头
GodotMapV2_MistLake: 147 个装饰物，其中 68 个岩石/石头
GodotMapV2_FarmTown: 193 个装饰物，其中 12 个岩石/石头
...
```

✅ 数据正常生成
❌ 但因为名称不匹配，模型无法加载

## 修复内容

### 1. 添加下划线命名支持

**文件：** `src/game/threeLowPolyModelCache.js`

```javascript
case 'bush-large':
case 'nature_bush_large':  // ✓ 新增
  return { key: 'bush', scale: 1.18 }
  
case 'rock-large':
case 'nature_rock_large':  // ✓ 新增
  return { key: 'rock', scale: 1.08 }
  
case 'stone-large':
case 'nature_stone_large':  // ✓ 新增
  return { key: 'stone', scale: 1.02 }
  
case 'nature_log_stack':  // ✓ 新增
  return { key: 'logStack', scale: 1.0 }
```

### 2. 添加 logStack 模型

```javascript
const MODEL_URLS = {
  ...
  logStack: `${MODEL_BASE}log_stack.glb`,  // ✓ 新增
  ...
}

const CORE_MODEL_KEYS = new Set([
  ...
  'logStack',  // ✓ 新增到核心模型
  ...
])
```

### 3. 添加调试日志

**文件：** `src/game/ThreeLowPolyMap.jsx`

添加了详细的装饰物渲染统计：
- 总装饰物数量
- 成功渲染数量
- 跳过原因统计（无规格、无模型、被阻挡、路径清除）

## 影响范围

修复后，以下装饰物将正确显示：
- ✅ `nature_rock_large` → 大岩石
- ✅ `nature_stone_large` → 大石头
- ✅ `nature_bush_large` → 大灌木
- ✅ `nature_log_stack` → 木材堆

## 测试步骤

1. **清除缓存**（仍然需要）
   - F12 → Application → Clear site data
   
2. **硬刷新**
   - Ctrl+Shift+R 或 Cmd+Shift+R
   
3. **查看控制台日志**
   ```
   [Map Debug] GodotMapV2 - Total decorations: 177
   [Map Debug] GodotMapV2 - Rock/Stone/Bush/Log decorations: 70
   [Map Debug] Decoration rendering stats: { total: 177, rendered: 170, ... }
   ```

4. **验证地图**
   - 检查地图边界是否有更多岩石/石头装饰
   - 检查是否有木材堆装饰

## 为什么之前没有显示

1. **缓存问题**（次要）
   - Service Worker 缓存了旧的 GLB 文件
   
2. **命名不匹配**（主要）⚠️
   - `getDecorativeModel('nature_rock_large')` 返回 `null`
   - 装饰物被跳过，从未渲染
   - 即使清除缓存也看不到，因为代码根本不加载这些模型

## 下一步

修复已完成，现在需要：
1. 清除浏览器缓存
2. 刷新页面
3. 查看控制台确认装饰物正确加载
4. 在地图中验证视觉效果
