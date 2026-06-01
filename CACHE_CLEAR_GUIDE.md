# 清除地图缓存指南

## 问题
地图修改后没有生效，因为多层缓存在使用旧的资源。

## 解决步骤

### 1. 清除 Service Worker 缓存（最重要）

在浏览器中打开开发者工具：

**Chrome/Edge:**
1. 按 F12 打开开发者工具
2. 进入 "Application" 标签
3. 左侧找到 "Storage" → 点击 "Clear site data"
4. 或者在 "Service Workers" 中点击 "Unregister"
5. 在 "Cache Storage" 中删除所有缓存

**Firefox:**
1. 按 F12 打开开发者工具  
2. 进入 "Storage" 标签
3. 右键点击域名 → "Delete All"

### 2. 硬刷新浏览器

- **Windows/Linux:** Ctrl + Shift + R 或 Ctrl + F5
- **Mac:** Cmd + Shift + R

### 3. 清除浏览器缓存

- **Chrome:** 设置 → 隐私和安全 → 清除浏览数据 → 选择"缓存的图片和文件"
- **Firefox:** 设置 → 隐私与安全 → Cookie 和网站数据 → 清除数据

### 4. 重启开发服务器

```bash
# 停止当前服务器 (Ctrl+C)
# 然后重新启动
npm run dev
```

### 5. 使用隐身/无痕模式测试

这样可以避免所有缓存，确认修改是否生效。

## 开发时避免缓存问题

### 方法 1: 禁用 Service Worker（推荐开发时使用）

在浏览器开发者工具中：
- Application → Service Workers → 勾选 "Bypass for network"

### 方法 2: 使用 URL 参数强制刷新

在 URL 后添加时间戳：
```
http://localhost:3000/?t=123456
```

### 方法 3: 开发时禁用缓存

在开发者工具的 Network 标签中勾选 "Disable cache"

## 验证缓存已清除

1. 打开开发者工具 → Network 标签
2. 刷新页面
3. 查找 `.glb` 文件请求
4. 确认 "Size" 列显示实际大小而不是 "(disk cache)" 或 "(memory cache)"
