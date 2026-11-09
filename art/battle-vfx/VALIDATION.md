# 验证与发布记录

日期：2026-09-17。版本：`battle-vfx-20260917-v1`，入口哈希：`Hg9zoiL9`。

## 完成的验证

- 全部 322 招式在编译后的 Chromium 页面实际生成非空画布，逐招式像素摘要不同，绘制次数均不超过 standard 预算 110。配方覆盖检查无遗漏，无文字/图标特效。
- 桌面 24 招代表截图与平板、手机各 4 招截图已复核，布局未横向溢出。火焰采用软纹理，水枪/水炮采用连续水流，冲浪采用浪面推进。
- 7 组阶段检查覆盖蓄力、落空、敌方治疗、吸取、敌方施加状态、追加效果、变身；攻击和作用目标符合方向，未生成图标层。
- 平板尺寸 768×1024、DPR 2、CPU 节流 3 倍的 8 组动画样本约 56.5–60 FPS；lite 最高 54 次绘制/帧，各动画结束后均释放画布。喷射火焰首次样本有 99.9ms 的单帧间隔，其余 7 组最大间隔约 16.8ms。该测试含画布像素读回，不能视为真实设备无卡顿保证。
- 减少动态效果的命中与蓄力阶段均不超过 6 次局部绘制。
- 使用正式 `BattleScene` 的 8 组集成检查全部通过：我方/敌方出手、角色动作、目标受击、出手先于伤害、伤害反馈时间、效果结束清理、状态和落空不伪造伤害。主要命中样本的反馈误差约 9–18ms。此预览使用本地数据，不是服务器战斗结算测试。
- 连续 12 次打开和关闭地图导航面板，使用与生产相同的 `MapSceneLayer`：同一个 WebGL canvas、就绪状态只经历初次 `[false,true]`、返回时无加载层、面板按下及松开方向键均不被地图拦截。正式云存档、计时保护、回合恢复、战斗完成等原有审计同时通过。
- 正式构建成功；P0 资源检查包含图片 242、音频 13、模型 160、Draco 2，无缺失。图集 151,931 字节，带内容哈希并加入预缓存。

所有帧率为本机 Chromium 模拟测试；没有真实 iPad Safari 实机测量。全部招式的像素检查只证明可绘制与有区别，画面质量依据代表截图和阶段回放复核。

## 发布范围

另一任务“丰富地图素材并平衡难度”的地图与天王难度更新被要求先本地预览，因此本轮在 `/tmp/pokemon-battle-release-20260917` 创建独立发布副本，从该副本排除了那部分改动。共享工作区保持该任务的当前代码。

独立副本对 14 张地图的格子、道路、遇敌区域、水体、桥梁、装饰和事件位置，以及两位天王配置做了 100 项前后对照，全部一致；未包含 `xingyin-environment-v2` 素材。随后再次运行窗口生命周期和正式战斗集成检查。发布源码存档（不含环境变量）和范围记录位于 `output/battle-vfx-v2/release-source-without-env.tar.gz`、`RELEASE-SCOPE.json`。

构建命令：

```sh
VITE_BASE_PATH=/ VITE_APP_BUILD_ID=battle-vfx-20260917-v1 VITE_ENABLE_BATTLE_VFX_LAB=false VITE_ENABLE_MAP_RUNTIME_PREVIEW=false npm run build
```

从原仓库通过 `npx gh-pages -d /tmp/pokemon-battle-release-20260917/dist` 发布，`CNAME` 为 `pokemongame.site`。gh-pages 提交：`776302e166411056077d4ec637e0dabc09caeba6`。

线上目标：https://pokemongame.site/ 。GitHub Pages 构建 `35225069771` 成功。`verify:deploy` 最终 11 项通过、0 警告、0 错误：线上入口、version.json 与 Service Worker 均为上述版本。生产首页经过浏览器刷新与截图复核。

线上图集 `battle-vfx-atlas-wK7cb-Mx.png` 正常返回，151,931 字节，SHA-256 与本地发布文件一致：`b292ffa3d4b44daa1705e113da6a018f6a7c50f61d990445916ce4ced2a4118b`。Service Worker 已预缓存该文件。最终报告位于 `output/battle-vfx-v2/release-deploy-verify.log` 与 `release-online-assets.json`。
