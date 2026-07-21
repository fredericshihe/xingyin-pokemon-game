# 长线内容更新素材清单

> 建立日期：2026-07-20
> 用途：记录本次更新新增素材的来源、生成方式、项目路径、用途和审核状态。所有运行时素材必须存放于项目本地，不依赖外部网络。

## 1. 冒险完成度图册主视觉

- 项目路径：`public/assets/ui/adventure-progress/adventure-atlas-v1.png`
- 生成工具：OpenAI 内置 ImageGen
- 来源类型：本项目原创生成
- 运行时用途：十四章冒险完成度页面主视觉背景
- 当前状态：已接入；桌面与 390px 窄屏浏览器视觉审核通过
- 生成提示词：

```text
Use case: stylized-concept
Asset type: premium game UI background for an in-game adventure completion atlas
Primary request: an open fantasy adventure atlas spread that visually traces one continuous journey through fourteen distinct regions, beginning with a green beginner valley and meadow, then mist lake, windmill farmland, shell coast, moonlit graveyard, violet hex ruins, rugged survival ridge, starry highland, icy mirror sanctuary, deep teal tide sanctuary, iron fortress, violet dragon sky temple, and finally a distant golden champion tower
Style/medium: polished stylized low-poly game diorama blended with tactile embossed parchment and subtle hand-painted map details; cohesive with a colorful low-poly 3D exploration game
Composition/framing: wide open-book composition, centered winding route with clear visual rhythm and generous calm margins for overlay UI; no characters or creatures
Lighting/mood: warm explorer-lantern light around early chapters transitioning to cool mystical light and a radiant gold destination; inviting, triumphant, immersive
Color palette: moss green, lake teal, farm amber, ocean blue, moon violet, iron charcoal, dragon amethyst, champion gold
Materials/textures: premium paper grain, embossed route line, tiny dimensional terrain landmarks, restrained foil accents
Constraints: no readable text, no numbers, no logos, no trademarks, no watermark; avoid copying any existing franchise interface; practical background with enough contrast control for white and dark UI cards
```

## 2. 冠军挑战塔主视觉

- 项目路径：`public/assets/ui/champion-tower/champion-tower-key-art-v1.png`
- 生成工具：OpenAI 内置 ImageGen
- 来源类型：本项目原创生成
- 运行时用途：第 14 章章节卡、挑战塔页面与进入塔楼前的主视觉
- 当前状态：已接入完成度页面、冠军塔地图、战斗场景、入场/升层/登顶演出；浏览器视觉审核通过
- 生成提示词：

```text
Use case: stylized-concept
Asset type: champion challenge tower chapter key art and in-game progress-page hero background
Primary request: a majestic golden champion challenge tower rising above floating dark-stone terraces, with a luminous vertical elevator beam visible through its center, ten subtle architectural tiers, a welcoming exploration lobby at the base, and a radiant trophy chamber at the summit
Scene/backdrop: twilight starfield and soft clouds, distant violet dragon-sky temple far below to imply the previous chapter
Style/medium: polished colorful low-poly 3D game environment concept art, tactile faceted stone and metal, premium but playful, coherent with a top-down low-poly exploration game
Composition/framing: wide three-quarter establishing view, tower centered slightly off-axis with calm darker edges suitable for UI overlay; no characters or creatures
Lighting/mood: deep indigo dusk, warm champion-gold window light, violet energy accents, aspirational and inviting rather than ominous
Materials/textures: dark basalt, brushed gold, glowing crystal, cloth banners, restrained star particles
Constraints: no readable text, no numbers, no logos, no trademarks, no watermark; no copied franchise architecture; clearly traversable game space, not an abstract poster; avoid photorealism and excessive bloom
```

## 3. 上线约束

- 不使用外部热链；素材必须随构建离线加载。
- 必须通过桌面、窄屏、低性能设备和“减少动态效果”验收。
- 如果主视觉影响文字对比度，只允许调整遮罩、裁切或安全区，不用低质量占位图替换。
- 后续深潮、铁壁、龙穹机关和冠军塔场景素材继续追加到本清单，并记录版本与回退素材。

## 4. 程序化场景素材

以下素材由项目内 Three.js 几何、材质和动画代码原创组合生成，不依赖远程文件，也不复用未授权模型：

- 深潮任务机关：潮压石、潮位仪、漩涡锚、潮汐祭坛；青蓝晶体、潮环与水光节奏。
- 铁壁任务机关：锻炉节点、磁力继电器、护甲节点、王座核心；钢铁、琥珀炉光与机械环结构。
- 龙穹任务机关：龙牙柱、星标信标、封印柱、龙印祭坛；黑曜紫、金边、悬浮核心与星轨光环。
- 冠军塔场景：`champion_tower`、`champion_obelisk`、`champion_gate`、`elite_champion_portal`；深色玄武岩、冠军金和紫蓝星光。

主要实现路径：`src/game/ThreeLowPolyMap.jsx`、`src/game/data/mapAssetCatalog.js`、`src/game/data/godotMaps/godot_region_maps.js`。

性能验收记录：普通任务步骤取消重复的通用信标和逐物件点光源，保留主题化发光材质、光环与激活爆发；两档移动设备、四张后期地图共 8 组测试 0 fail。正式报告位于 `reports/mobile-map-performance/long-term-update-enabled-optimized-v2/`。
