# 地图目录统一说明

## 目标

把原本分散在多处的地图实例、地图配置、遭遇表映射、起点、来源信息收敛到一个单一事实源，降低后续扩图和维护成本。

## 统一后的单一入口

- 核心目录层: `src/game/data/mapCatalog.js`

这里统一维护并导出：

- 地图链顺序 `MAP_CHAIN`
- 地图总目录 `MAP_CATALOG`
- 地图运行时实例 `mapInfo`
- 地图配置 `config`
- 地图注册信息 `registry`
- 地图来源元数据 `sources`

## 现在各层职责

### 1. 地图目录层

- 文件: `src/game/data/mapCatalog.js`
- 职责:
  - 统一拼装所有地图
  - 提供地图实例、配置、遭遇表、起点、来源信息
  - 作为地图系统唯一事实源

### 2. 兼容导出层

这些文件保留原有 API，内部改为转发到目录层：

- `src/game/data/overworldMaps.js`
- `src/game/data/mapRegistry.js`
- `src/game/data/mapEvents.js`
- `src/data/maps/mapConfig.js`

这样旧调用方无需一次性大改。

### 3. 管理与审计层

- 文件: `src/game/data/mapManagement.js`
- 职责:
  - 基于 `mapCatalog` 汇总地图事件、路牌、遇敌区、来源信息
  - 输出审计和管理视图使用的数据

## 地图数据来源划分

### 新手地图

- 运行时地图: `src/game/data/godotMaps/my_first_map.js`
- 目录注册: `src/game/data/mapCatalog.js`

### 分区地图链

- 运行时与定义源: `src/game/data/godotMaps/godot_region_maps.js`
- 旧快照: `src/game/data/godotMaps/godot_map_v2.generated.js`
- 旧设计源: `src/game/data/mapSources/godotMapV2.source.json`
- 目录注册: `src/game/data/mapCatalog.js`

## 后续维护规则

### 新增一张地图

1. 先新增运行时地图定义文件
2. 在 `mapCatalog.js` 注册
3. 填入：
   - `mapInfo`
   - `config`
   - `registry.encounterTableId`
   - `sources`
4. 其余旧模块无需再分别补一份

### 修改地图基础信息

只改 `mapCatalog.js` 对应条目，不再分别改：

- `mapRegistry.js`
- `mapConfig.js`
- `overworldMaps.js`

### 修改地图实例内容

- 地图格子、事件、装饰、路径:
  - 改对应 runtime map 文件
- 配置、遭遇表映射、来源说明:
  - 改 `mapCatalog.js`

## 当前收敛结果

已经从多源重复改成：

- 地图实例: 单源
- 地图配置: 单源
- 遭遇表映射: 单源
- 起点: 从地图实例自动派生
- 来源说明: 单源

## 建议的后续方向

下一步最值得继续做的是把地图遭遇表定义也进一步从 `mapConfig` 风格调用里继续下沉到目录层旁边的专属 encounter source 文件，形成：

- `mapCatalog.js`: 地图目录
- `mapEncounterCatalog.js`: 地图遭遇目录
- `godot_region_maps.js`: 地图内容定义

这样地图系统会更像一套稳定的数据平台，而不是若干历史模块并存。
