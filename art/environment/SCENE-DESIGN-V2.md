# 地图场景 V2

> 当前实现已升级为每图独立模型套装；本页保留为上一版记录。最新设计与验收见 [exclusive-v3/README.md](exclusive-v3/README.md)。

本轮目标是让各区域拥有不同的景观与生活痕迹，同时保留现有道路、草丛、泉水、试炼场、NPC 和地图连接。

## 布景方式

`src/game/data/mapEnvironmentVignettes.js` 按地图配置独立场景。场景有名称、位置及各个互补道具；不使用按密度铺满地图的随机散点。同一整组原创模型每图最多 3 次，普通配件最多 5 次。主题主景配低矮设施和自然景物，场景之间保留留白。

`src/game/data/mapEnvironmentComposition.js` 在原地图完成后添加视觉层。它不修改地图格子、碰撞、事件坐标、遇敌区域或连接，仅在既有不可通行背景和地图外缘选择安全位置。空间不足时略去次要配件。保护原地标、隐藏入口、墓碑行列和麦田，并删除被新景观覆盖的普通碎片。

新道具按 GLB 实测可见宽度换算，不依赖模型作者不一致的原始单位。最高轮廓限制在 6.8 米；使用旋转后的完整包围盒预留道路和交互净空。渲染器一次性合并真实实例包围盒，防止更大的树冠或外围布景在镜头边缘突然消失。

## 模型

- `scripts/blender/build_environment_biomes.py`：18 件 Blender 原创模型与可复现导出/压缩流程。
- `art/environment/environment-biomes.blend`：可编辑源模型。
- `public/assets/3d/xingyin-environment-v2/`：发布用 GLB，全部单网格、单材质、顶点色、无纹理和动画，使用 Draco。
- `src/game/data/environmentBiomeAssets.js`：原创资产目录。
- `src/game/data/environmentSceneryMeasurements.generated.js`：所有本轮使用道具的实测宽度与高度。

当前 18 件原创 GLB 总计 95,624 字节、9,442 三角面，单件最高 916 面。不增加灯光、粒子或逐帧行为；静态道具复用现有分块实例化。

## 重建和验证

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/blender/build_environment_biomes.py
npm run environment:prepare
npm run generate:map-manifest
node scripts/audit-map-environment-composition.mjs
npm run map:audit-environments
node scripts/audit-elite-endgame-balance.mjs
```

只创建本地 QA 预览，不发布正式网站：

```sh
VITE_BASE_PATH=/ VITE_ENABLE_MAP_RUNTIME_PREVIEW=true VITE_ENABLE_CHAMPION_TOWER_V1=true npx vite build --outDir output/map-refresh-v2/build --emptyOutDir
npx vite preview --host 127.0.0.1 --port 4189 --outDir output/map-refresh-v2/build
MAP_REVIEW_OUT=output/map-refresh-v2/overview npx vite-node --script scripts/review-map-environments.mjs http://127.0.0.1:4189
```

难度分析独立记录在 `docs/elite-endgame-balance-2026-09-17.md`。截图、性能报告和修改前布局快照保存在 `output/map-refresh-v2/`；最终验收结果和性能限制见同目录的 [VALIDATION-V2.md](VALIDATION-V2.md)。
