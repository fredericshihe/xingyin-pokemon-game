# 战斗材质特效与地图面板生命周期

本轮用单个 Canvas 2D 材质层替换旧的招式图标、文字形状和大量 DOM 粒子；沿用正式战斗场景的角色动作、受击、镜头、伤害反馈与服务器结果。

## 招式设计

- `src/utils/battleVfxRecipes.js` 为当前 322 招式分别配置技法、材质、粒子数量、空间范围、弯曲和旋转。30 类技法共享底层渲染实现，每招式的完整配方不同；并非 322 张独立图片。
- 20 款原创透明材质由 `scripts/generate-battle-vfx-atlas.mjs` 生成，源文件保存在 `materials/`。火焰、烟雾、薄雾和扬尘使用确定性的细碎噪声。无字体、符号或图标库。
- 发布图集为 `src/assets/battle-vfx-atlas.png`，640×512，151,931 字节。Vite 生成带内容哈希的 URL，P0 预加载与 Service Worker 预缓存均包含它。
- 火花是散射火焰，喷射火焰是持续热流，大字爆炎是向外翻卷的火团；特效不绘制“大”字。水枪、水炮、冲浪分别表现为细水流、宽水流和推进浪面。电击、十万伏特与打雷的分支数量、跨度和落雷方向不同。
- 威力按照 0、1–59、60–94、95–129、130 以上划分 5 层，并连续影响尺寸和能量；配方决定具体形态，威力决定其力度。实际多段伤害仍由战斗结算逐段触发。
- 蓄力在施法者附近，落空偏离目标且不播放命中，治疗作用于指定对象，吸取向施法者回流，追加阶段只保留短暂余效。伤害数字仍作为战斗信息显示，不作为招式图形。

## 生命周期与性能

`MapSceneLayer` 在打开背包、队伍等面板时保留地图实例，以 `mapActive=false` 暂停渲染和输入。关闭后恢复同一个 WebGL 画布。原先条件挂载会卸载地图并将首帧就绪状态置为 false，使计时会话重启并闪出加载屏；当前修复消除了这次不必要的重建。真正切地图或丢失 WebGL 上下文时仍有加载和计时保护。

战斗特效从出手时启动，使用完整招式时长；画布命中与正式场景的伤害、受击使用同一个 `getBattleMoveImpactDelay`。每次演出结束取消 RAF、断开 ResizeObserver 并清空画布。单帧绘制预算分别为 lite 70、standard 110、high 160，DPR 上限 1.25 / 1.75，调色图块缓存最多 128 项。减少动态效果时每阶段最多 6 次局部绘制。

## 重建与检查

```sh
node scripts/generate-battle-vfx-atlas.mjs
npm run audit:move-signatures
npm run audit:move-visuals
npm run audit:battle-visual
VITE_BASE_PATH=/ VITE_ENABLE_BATTLE_VFX_LAB=true VITE_ENABLE_MAP_RUNTIME_PREVIEW=true npx vite build --outDir /tmp/pokemon-battle-qa --emptyOutDir
npx vite preview --host 127.0.0.1 --port 4176 --outDir /tmp/pokemon-battle-qa
npx vite-node --script scripts/review-battle-vfx.mjs http://127.0.0.1:4176 all
npx vite-node --script scripts/review-battle-vfx.mjs http://127.0.0.1:4176 gallery
npx vite-node --script scripts/review-battle-vfx.mjs http://127.0.0.1:4176 mobile
npx vite-node --script scripts/audit-battle-material-runtime.mjs http://127.0.0.1:4176
npx vite-node --script scripts/audit-battle-scene-integration.mjs http://127.0.0.1:4176
npx vite-node --script scripts/audit-map-panel-lifecycle.mjs http://127.0.0.1:4176
```

开发实验页 `/battle-vfx-lab` 支持 `move`、`phase`、`side`、`quality`、`autoplay=1` 和固定帧 `frame=.48`；`scene=actual` 使用正式 BattleScene 与本地测试精灵，验证真实布局和时间轴，不操作玩家云数据。正式构建不启用这些入口。

最终测试与发布记录见 `VALIDATION.md`。模拟平板的 Chromium 结果不能视为真实 iPad Safari 的帧率保证。
