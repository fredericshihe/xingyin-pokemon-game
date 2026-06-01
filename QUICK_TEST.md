# 快速测试步骤

## 在浏览器中测试音频

1. **启动开发服务器**
   ```bash
   npm run dev
   ```

2. **打开浏览器访问**
   http://127.0.0.1:5173/xingyin-pokemon-game/

3. **打开开发者工具** (F12)

4. **在Console中运行诊断**
   ```javascript
   // 加载调试工具
   const script = document.createElement('script');
   script.src = '/xingyin-pokemon-game/audio-debug.js';
   document.head.appendChild(script);
   
   // 等待加载完成后运行
   setTimeout(() => audioDebug.diagnose(), 1000);
   ```

5. **检查关键指标**
   - `contextState` 应该是 "running" 或 "suspended"
   - `bgmEnabled` 应该是 true
   - `bgmVolume` 应该是 0.72

6. **如果contextState是suspended，手动解锁**
   ```javascript
   audioDebug.unlockAudio()
   ```

7. **测试音效**
   ```javascript
   audioDebug.testSfx()
   ```
   应该听到"哔"的一声

8. **检查BGM状态**
   ```javascript
   audioDebug.testBgm()
   ```

9. **如果还是没声音，检查HTML属性**
   ```javascript
   console.log(document.documentElement.dataset)
   ```

## 预期结果

正常情况下应该看到：
- ✅ AudioContext state: running
- ✅ BGM enabled: true
- ✅ BGM volume: 0.72
- ✅ 已缓存音频文件: 14个
- ✅ 当前播放: map:GodotMap

## 如果仍然没有声音

请将以下信息发给我：
1. `audioDebug.diagnose()` 的完整输出
2. Console中的任何错误信息（红色文字）
3. Network标签中是否有404错误
4. 浏览器名称和版本
