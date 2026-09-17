> 当前地图采用保留原有装饰的增补方案；最新说明与验证见 [exclusive-v3/README.md](exclusive-v3/README.md) 和 [exclusive-v3/VALIDATION.md](exclusive-v3/VALIDATION.md)。下文为早期资产制作记录。

# 地图环境设计 · environment-20260917-v1

本轮在现有 Three.js 地图框架内调整布景、生境、尺度和可通行空间。覆盖 13 张正式地图，并检查生产尚未开启的冠军挑战塔；没有开启冠军塔功能。

## 发现的问题与处理

- 旧占地参数明显大于部分 GLB 实际尺寸，清路时会删掉主要地标。现在读取 GLB 的真实包围盒，考虑偏心原点，再按模型缩放和旋转保留道路、桥梁及事件周围空间。
- 旧风车资产只有风轮，缺少完整建筑。新增 Blender 制作的完整风车、石拱和观星装置，共 3 款模型。
- 水生植物出现在干地，船只可能被普通清路算法移到岸上。船和荷花现在检查实际水域，岸边芦苇限制在湖岸附近。
- 随机散点混入推车、工具、棺材和假宝箱。改为地标组与小型环境点缀，货物和生活设施集中在符合用途的区域。
- 小装饰存在悬浮，围栏和木料方向混乱。按模型最低点贴地，围栏、树篱和木料方向对齐，麦田与墓碑按行排列。
- 路牌离开道路、事件同格和宝箱入口被挡。路牌沿实际道路布置并留间距，事件挪位预留新坐标，拾取物与传送点保护接近格。

## 逐图调整

| 地图 | 调整与检查 |
|---|---|
| 新手山谷 | 林缘增加成组乔木，减少多层散点；湖岸植物限制生境，检查起点和主路 |
| 星音草径 | 橡树与帐篷、木料形成明确地标，移除不合地形的独木舟 |
| 雾湖苇岸 | 船和荷花放入水域，芦苇沿岸分布，保留桥面与湖岸通路 |
| 风车农庄 | 完整风车建筑、集中集市、推车与长凳；麦田统一方向，减少随机栅栏 |
| 贝壳海岸 | 沉船与小艇保留在水中，木箱木桶集中码头区，保持棕榈海岸主题 |
| 月影墓园 | 石拱、长凳与灯具组成纪念区；24 座墓碑有序排列，去除随机散落棺材 |
| 六角遗迹 | 石拱、遗迹建筑和岩石成组布置；修复回收商与试炼事件重叠 |
| 铁木营地 | 帐篷、工作台和营地设施集中布置；移除散落工具，物资限制在营地区域 |
| 星雾高地 | 新观星地标、岩石与旗帜；替换不符合自然环境的浮空平台方块 |
| 霜镜道馆 | 检查主题模型贴地、道路与守关者通行、目标可见性 |
| 深潮道馆 | 随机门框改支撑石柱，保留专门设计的关卡入口 |
| 铁壁道馆 | 检查主题结构、地面装饰、守关者让路与交互空间 |
| 龙穹道馆 | 检查主题结构、地面装饰、守关者让路与交互空间 |
| 冠军挑战塔（未上线） | 去除室内错误生成的自然边界碎石和灌木，保留建筑式方尖碑 |

## 资产与重建

- Blender 源文件：`environment-landmarks.blend`
- 建模脚本：`scripts/blender/build_environment_landmarks.py`
- 发布模型：`public/assets/3d/xingyin-environment-v1/`
- 地标配置：`src/game/data/mapEnvironmentDesign.js`
- 自动占地数据：`src/game/data/environmentModelFootprints.generated.js`

新模型使用顶点色、单 mesh、单材质、无外部纹理；Draco 压缩后合计 41,644 字节。33 款关键模型的真实占地由脚本生成，不要手改生成文件。

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/blender/build_environment_landmarks.py
npm run environment:prepare
npm run generate:map-manifest
npm run map:audit-environments
```

修改地图后还应运行玩法通路审计，并查看实际 WebGL 截图。地标邻近的安全位置不足时可以略去次要道具，不能为保留道具而占用道路、草丛入口或交互接近格。

## 正式发布

```sh
VITE_BASE_PATH=/ VITE_APP_BUILD_ID=environment-20260917-v1 npm run build
npx gh-pages -d dist
npm run verify:deploy -- https://pokemongame.site/
```

正式构建不能携带 QA 的地图预览或冠军塔开关。CNAME 为 `pokemongame.site`。验证记录见 `VALIDATION.md`。
