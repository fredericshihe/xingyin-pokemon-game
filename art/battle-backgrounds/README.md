# 战斗背景制作清单

状态：44 个地点已使用 Blender 和项目本地地图模型制作背景，输出 88 个桌面/手机 WebP，并接入真实战斗画面。此轮已完成本地构建与浏览器检查，尚未发布到线上。

## 当前制作与验证

- `scripts/blender/render_battle_backgrounds.py`：固定种子、统一镜头、地点布景与占地过滤。大型地标优先放置，植被避开中央战斗区和既有占地；普通石块只用于少量山脊/岩坡，采用低矮灰色碎石。
- `battle-background-studio.blend`：草地场景的可编辑 Blender 示例；其他场景由同一脚本复现。
- `src/game/data/battleBackgroundAssets.generated.js`：实际图片的内容哈希、路径及字节数。
- `src/components/Game/BattleBackgroundPlate.jsx`：预解码、当前地图后台预载、图片失败回退。新底图出现后隐藏旧 CSS 地形道具，避免重复叠放。
- 战斗保存地点背景 ID 和开战对手快照，换人/恢复不跳景；训练联赛新一场更新对手氛围，继续使用训练林。
- 44 个背景的占地报告和 57 个桌面/手机运行检查已通过；图片失败时可继续使用战斗界面。

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python scripts/blender/render_battle_backgrounds.py
node scripts/optimize-battle-backgrounds.mjs output/battle-backgrounds/blender
node scripts/audit-battle-background-assets.mjs
node scripts/audit-battle-background-selection.mjs
node scripts/audit-battle-scenes.mjs
node scripts/audit-battle-background-runtime.mjs http://127.0.0.1:5173
```

本地预览入口：`/battle-vfx-lab?scene=actual`。下面保留此前的 AI 图片制作计划供未来美术升级参考，该计划不表示当前渲染流程仍待接入。

用户已在本任务明确同意 API/CLI 生图。内置生图工具在本会话不可用；本机进程环境和项目 `.env.local` 均尚未配置 `OPENAI_API_KEY`。不要把密钥写入本目录或聊天。

## 已完成的准备

- `map-context.json`：通过 Vite 模块加载导出的 14 张地图、38 个遇敌区和 100 个训练家/首领/试炼事件的实际地图上下文。
- `prompts.jsonl`：每个场景独立提示词，统一精致日系卡通风格，1536×1024、环境画面、留出双方站位和 HUD 空间，兼容竖屏中心裁切。
- `src/game/data/battleBackgroundCatalog.js`：44 场景的地图归属、独立地点名称与生成描述；地图内 zone 匹配；有限距离的实际位置回退；事件地标、四天王对战台、冠军塔顶层；对手的开战快照。
- `scripts/audit-battle-background-selection.mjs`：138 个战斗触发点全部覆盖；测试同名区域跨地图隔离、沉船内舱/风车塔顶/封印密室、跨地点不误吸附、水系对手不凭空切换为湖泊、换人/恢复存档不跳景。
- `scripts/optimize-battle-backgrounds.mjs`：全批源图存在后才输出 960/1536 两级 WebP 和内容哈希文件名，不生成假图或缺图清单。

## 已授权的生成方式

使用 imagegen 技能自带 CLI，模型 `gpt-image-2`，每个场景一个任务：

```sh
/tmp/pokemon-imagegen-venv/bin/python /Users/shihe/.codex/skills/.system/imagegen/scripts/image_gen.py generate-batch --input art/battle-backgrounds/prompts.jsonl --out-dir output/imagegen/battle-backgrounds --concurrency 3
node scripts/optimize-battle-backgrounds.mjs
```

生成后必须逐张查看，检查地理逻辑、地面透视、竖屏裁切和留白。当前没有真实生成结果，不能将本清单当作已完成素材。

## 原 AI 图片接入计划

1. 开战时将 `backgroundId` 和对手类型快照写入 `battleEnvironment`，恢复战斗复用该 ID；换人不会重选。
2. 当前地图的背景加入 P1 预载，其他地图不进入全局 P0；使用按内容哈希缓存，不依赖旧缓存标记判断已解码。
3. 战斗画面使用已解码图片；等待图片时暂停入场、操作和学生计时，失败提供重试，不在空白画面里结算。
4. 旧渐变地形和装饰层仅作为旧存档/缺少图集时的现有背景；新图片显示时去除重复地形层。
5. 桌面、平板、手机裁切；冷缓存、弱网、重入、换人、恢复；确认后从独立发布副本发布。另一个任务仅授权本地预览的地图 v2 与天王难度变更继续排除。

以上是原 AI 图片方案的待办；本轮采用 Blender 预渲染底图，并保留已可用的旧场景作为加载期间/失败回退。
