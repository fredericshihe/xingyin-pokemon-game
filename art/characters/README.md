# 星音角色系列 v1

用户选定方向：精致日系卡通。以圆润面部、分层发束、清晰眼睛、服装滚边与配饰区分职业和道馆主题。

- 可编辑源文件：`xingyin-character-collection.blend`，包含 30 个命名角色。
- 建模脚本：`scripts/blender/build_character_collection.py`，使用 Blender 5.2。
- 运行资源：`public/assets/3d/xingyin-characters-v1/`，GLB 自包含，使用顶点色，无外部贴图请求。
- 注册与职业映射：`src/game/data/characterAssets.js`。保留旧地图事件 ID、位置与碰撞格，部下、首领和商人自动映射到各自造型。

## 覆盖

主角 1、普通职业 6、训练家职业 4、幽谷人物 3、四大道馆各 4，共 30 款。包含所有现有人形角色资源 ID；未放置的职业变体也可继续用于地图编辑。

## 重建流程

在项目根目录执行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/blender/build_character_collection.py
npm run characters:optimize
npm run generate:map-manifest
npm run audit:character-assets
npm run audit:elite-models
```

完整重建会重导出整套模型及 manifest。优化脚本跳过已压缩记录，避免重复减面。修改源脚本后先重新导出，再优化。

## 运行约束

- 地面为 Y=0，朝向为 +Z。主角高 1.55；普通源模型高 2.5，由已有地图缩放控制最终高度。
- 主角有 `body/head/leftArm/rightArm/leftLeg/rightLeg` 六个动作枢轴，通过现有步态驱动。这是轻量分部件动画，不是骨骼蒙皮或动作捕捉。
- NPC 合并为单网格、单材质，沿用地图 InstancedMesh、面向玩家和战后让路逻辑。碰撞仍由地图网格控制。
- Draco 压缩沿用站内解码器。整套 1,167,224 字节，最大单款 54,924 字节，最多 13,400 三角形。复用角色几何并按地图块剔除；当前视距与重复数量下无需再下载独立 LOD。
- 主角实例拥有独立几何和材质，地图/过场销毁不会破坏缓存模板。过场图片缓存区分旧回退与新模型。
- 角色缺失时显示加载/恢复状态；全部场景构建并渲染首帧后才开放移动。学生地图计时也等待该状态，地图恢复期间暂停会话。

## 验证

```sh
node scripts/audit-character-runtime.mjs http://127.0.0.1:4173
node scripts/audit-mobile-map-performance.mjs --base-url http://127.0.0.1:4173 --devices ipad_mini --map-quality lite
```

需要启用地图预览的本地开发服务，或以 `VITE_ENABLE_MAP_RUNTIME_PREVIEW=true` 构建的测试包。正式发布不启用预览入口。

渲染预览和浏览器证据保存在 `output/character-redesign/`（不打入生产包）。移动性能检测为桌面 Chromium 的视口/CPU 模拟，不等同于真实 iPad Safari 验收。
