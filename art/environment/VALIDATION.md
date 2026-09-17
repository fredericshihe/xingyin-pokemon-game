# 环境更新验证记录

日期：2026-09-17。目标版本：`environment-20260917-v1`。

## 自动检查

- 环境审计通过：14 张地图、2,439 件显式装饰、34 个新配置地标、12 件水域道具。验证 GLB 实际尺寸、模型预算、主要地标保留、道路净空、事件坐标唯一、船与荷花的水域归属、麦田和墓碑朝向。
- 玩法通路、区域地图、32 条地图连接、隐藏区域规则与奖励、四道馆道路净空及 16 名守关者顺序检查通过。
- 地图材质检查、入口预加载检查（241 图片 / 13 音频 / 160 模型 / 2 Draco 文件）、30 款角色资产审计通过。
- 墓碑最后一轮调整后重新运行环境与玩法通路审计通过。墓园保留 24 座墓碑。
- 玩法审计仍有原有队伍数量及进化阶段建议性警告，0 错误；本轮未调整战斗配置。

## 画面检查

使用正式编译后的 QA 预览执行实际 WebGL 渲染，逐图保存 14 张全景截图并检查网络及浏览器异常：0 HTTP 错误、0 运行时异常。查看了全景联系表，以及海岸、墓园、冠军塔和风车近景。

最终墓园与风车近景另行重拍，结果正常。证据在 `output/map-environment-review/overview/`；全量报告为 `report.json`，墓园最终报告为 `report-GodotMapV2_Graveyard.json`，风车近景报告为 `report-GodotMapV2_FarmTown-detail.json`。墓园最终截图覆盖了原图，全量报告中该图的旧探针由单图报告补充。

截图可重现：

```sh
VITE_BASE_PATH=/ VITE_APP_BUILD_ID=environment-qa VITE_ENABLE_MAP_RUNTIME_PREVIEW=true VITE_ENABLE_CHAMPION_TOWER_V1=true npm run build -- --outDir /tmp/pokemon-environment-qa
npx vite preview --host 127.0.0.1 --port 4175 --outDir /tmp/pokemon-environment-qa
# 另开终端
npx vite-node --script scripts/review-map-environments.mjs http://127.0.0.1:4175
# 可选参数：地图 ID、近景地标类型
npx vite-node --script scripts/review-map-environments.mjs http://127.0.0.1:4175 GodotMapV2_FarmTown environment_farm_windmill
```

## 性能结果与边界

桌面 Chromium 模拟 iPad Mini：768×1024、DPR 2、CPU 降速 3 倍、lite 画质；每图就绪后预热 2.5 秒，采样 5 秒。

- 14 图平均约 60 FPS，P10 约 59.9 FPS，采样期间超过 50ms 的帧为 0，素材加载失败为 0。
- 本地预览就绪时间约 6.1–6.5 秒，高于脚本 4.5 秒的目标，因此结果是 14 WARN、0 FAIL，不能视为首屏性能全部达标。
- 新手山谷出现 1 次长任务；最终墓园单图复测约 60 FPS、6.4 秒就绪、1 次长任务、0 素材失败。
- 最终墓园约 140 draw calls、104,262 三角形。新增 3 款模型合计仅约 41 KB，保持实例化使用。
- 这是本地桌面浏览器的短时模拟，尚未验证真实 iPad Safari、学校网络、长时间运行或生产登录后整条学生流程。不能承诺所有设备恒定 60 FPS。
- 既有角色与地图首帧就绪门禁继续保留，资源准备期间不开始倒计时；本轮没有更改该计时逻辑。

报告：`output/map-environment-review/performance-final/mobile-map-performance-2026-09-17T11-13-41-107Z.md`；墓园最终复测：`output/map-environment-review/performance-graveyard-final/mobile-map-performance-2026-09-17T11-20-25-757Z.md`。

## 发布验证

- 已运行 `VITE_BASE_PATH=/ VITE_APP_BUILD_ID=environment-20260917-v1 npm run build` 和 `npx gh-pages -d dist`，CNAME 为 `pokemongame.site`。
- GitHub Pages 构建成功：`ef0d2afe3d6da9575af217e55880450411103da3`；上线前 gh-pages 提交为 `827946a300ab17ebcfb837cceb7fa93e8f2170e7`，可用作回退参照。
- 线上 `version.json`：buildId `environment-20260917-v1`，entryHash `CHhd2oHg`，与本地 dist 一致。
- `npm run verify:deploy -- https://pokemongame.site/`：11 OK、0 WARN、0 ERR。首页入口、版本检查、Service Worker 接管和按构建隔离缓存全部一致。
- 3 款新增 GLB 均 HTTP 200，线上文件 SHA-256 与本地生产包完全相同。
- 浏览器重新打开生产首页，登录页图文正常、没有浏览器警告或错误；未登录学生账号或修改学生数据。
- 生产验证日志：`output/map-environment-review/verify-deploy.log`、`verify-models.log`。首次校验发生在 Pages 构建完成前，显示上一版本；构建完成后重新校验已通过。
