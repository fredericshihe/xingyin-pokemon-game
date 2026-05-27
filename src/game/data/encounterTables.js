/** 草丛遇敌表：仅基础形态，等级区间与进化阶段一致 */
import { pickWildEncounter } from '../../utils/wildEncounterRules'

export const ENCOUNTER_TABLES = {
  /** 新手山谷安全草坡：第一场战斗练手区，避免 Lv.5 初始伙伴开局被压制 */
  valley_safe_grass: {
    baseRate: 0.08,
    tallGrassRate: 0.14,
    safeStepsAfterBattle: 8,
    pokemon: [
      { id: 114, minLevel: 2, maxLevel: 3, weight: 24 },  // 宝宝丁
      { id: 98, minLevel: 2, maxLevel: 3, weight: 20 },   // 尼多朗
      { id: 13, minLevel: 2, maxLevel: 3, weight: 18 },   // 伊布
      { id: 119, minLevel: 2, maxLevel: 3, weight: 18 },  // 喵喵
      { id: 16, minLevel: 2, maxLevel: 3, weight: 12 },   // 鲤鱼王
      { id: 110, minLevel: 2, maxLevel: 3, weight: 8 }    // 凯西
    ]
  },
  /** 新手山谷花丘：轻微进阶，仍以中性练手对局为主 */
  valley_flower_meadow: {
    baseRate: 0.09,
    tallGrassRate: 0.16,
    safeStepsAfterBattle: 7,
    pokemon: [
      { id: 13, minLevel: 3, maxLevel: 4, weight: 26 },
      { id: 114, minLevel: 3, maxLevel: 4, weight: 24 },
      { id: 119, minLevel: 3, maxLevel: 4, weight: 14 },
      { id: 98, minLevel: 3, maxLevel: 4, weight: 18 },
      { id: 110, minLevel: 4, maxLevel: 5, weight: 12 },
      { id: 20, minLevel: 4, maxLevel: 5, weight: 6 }
    ]
  },
  /** 新手山谷湖北浅滩：更适合练手与补经验，先让孩子熟悉湖边草丛节奏 */
  valley_lake_shallows: {
    baseRate: 0.08,
    tallGrassRate: 0.15,
    safeStepsAfterBattle: 7,
    pokemon: [
      { id: 16, minLevel: 3, maxLevel: 4, weight: 42 },
      { id: 114, minLevel: 3, maxLevel: 4, weight: 18 },
      { id: 13, minLevel: 3, maxLevel: 4, weight: 16 },
      { id: 119, minLevel: 3, maxLevel: 4, weight: 14 },
      { id: 110, minLevel: 3, maxLevel: 4, weight: 10 }
    ]
  },
  /** 新手山谷湖边芦草：水系教学区，等级低但生态有差异 */
  valley_lake_reeds: {
    baseRate: 0.08,
    tallGrassRate: 0.16,
    safeStepsAfterBattle: 7,
    pokemon: [
      { id: 16, minLevel: 4, maxLevel: 5, weight: 36 },
      { id: 14, minLevel: 4, maxLevel: 5, weight: 14 },
      { id: 13, minLevel: 4, maxLevel: 5, weight: 16 },
      { id: 119, minLevel: 4, maxLevel: 5, weight: 14 },
      { id: 114, minLevel: 4, maxLevel: 5, weight: 12 },
      { id: 110, minLevel: 4, maxLevel: 5, weight: 8 }
    ]
  },
  /** 新手山谷密林：在上方教学线之后开放，作为第一片进阶练级区 */
  valley_training_thicket: {
    baseRate: 0.09,
    tallGrassRate: 0.16,
    safeStepsAfterBattle: 6,
    pokemon: [
      { id: 13, minLevel: 4, maxLevel: 4, weight: 28 },
      { id: 119, minLevel: 4, maxLevel: 6, weight: 16 },
      { id: 110, minLevel: 4, maxLevel: 6, weight: 20 },
      { id: 20, minLevel: 4, maxLevel: 6, weight: 8 },
      { id: 114, minLevel: 4, maxLevel: 5, weight: 18 },
      { id: 98, minLevel: 4, maxLevel: 4, weight: 10 }
    ]
  },
  /** 新手山谷东南草坡：当前图最高等级区，作为去下一张图前的准备区 */
  valley_southeast_clearing: {
    baseRate: 0.10,
    tallGrassRate: 0.18,
    safeStepsAfterBattle: 6,
    pokemon: [
      { id: 13, minLevel: 5, maxLevel: 8, weight: 22 },
      { id: 39, minLevel: 5, maxLevel: 8, weight: 20 },
      { id: 119, minLevel: 5, maxLevel: 8, weight: 18 },
      { id: 106, minLevel: 6, maxLevel: 8, weight: 14 },
      { id: 110, minLevel: 6, maxLevel: 8, weight: 12 },
      { id: 4, minLevel: 5, maxLevel: 8, weight: 14 }
    ]
  },

  /** 新手入口草坡：给 Lv.5 初始宝可梦的安全练习区 */
  route102_grass: {
    baseRate: 0.10,
    tallGrassRate: 0.22,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 1, minLevel: 3, maxLevel: 6, weight: 30 },    // 妙蛙种子
      { id: 13, minLevel: 3, maxLevel: 6, weight: 24 },   // 伊布
      { id: 39, minLevel: 3, maxLevel: 6, weight: 18 },   // 大葱鸭
      { id: 98, minLevel: 3, maxLevel: 6, weight: 18 },   // 尼多朗
      { id: 114, minLevel: 3, maxLevel: 6, weight: 10 }   // 宝宝丁
    ]
  },
  /** 花丘草地：普通/可爱系偏多，略高于入口区 */
  route102_meadow: {
    baseRate: 0.11,
    tallGrassRate: 0.18,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 13, minLevel: 4, maxLevel: 7, weight: 28 },   // 伊布
      { id: 114, minLevel: 4, maxLevel: 7, weight: 24 },  // 宝宝丁
      { id: 119, minLevel: 4, maxLevel: 7, weight: 18 },  // 喵喵
      { id: 39, minLevel: 4, maxLevel: 7, weight: 18 },   // 大葱鸭
      { id: 1, minLevel: 4, maxLevel: 7, weight: 12 }     // 妙蛙种子
    ]
  },
  /** 密林草丛：更适合练级，开始出现超能/幽灵系 */
  route102_thicket: {
    baseRate: 0.13,
    tallGrassRate: 0.28,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 1, minLevel: 6, maxLevel: 10, weight: 30 },   // 妙蛙种子
      { id: 98, minLevel: 6, maxLevel: 10, weight: 24 },  // 尼多朗
      { id: 110, minLevel: 6, maxLevel: 10, weight: 18 }, // 凯西
      { id: 20, minLevel: 6, maxLevel: 10, weight: 14 },  // 鬼斯
      { id: 39, minLevel: 6, maxLevel: 10, weight: 14 }   // 大葱鸭
    ]
  },
  /** 湖畔芦草：水系主题区，等级中等但遇敌率较低 */
  route102_lake: {
    baseRate: 0.10,
    tallGrassRate: 0.22,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 14, minLevel: 5, maxLevel: 9, weight: 44 },   // 可达鸭
      { id: 16, minLevel: 4, maxLevel: 9, weight: 34 },   // 鲤鱼王
      { id: 13, minLevel: 5, maxLevel: 8, weight: 12 },   // 伊布
      { id: 39, minLevel: 5, maxLevel: 8, weight: 10 }    // 大葱鸭
    ]
  },
  /** 东南草坡：当前新手山谷的进阶捕捉区 */
  route102_clearing: {
    baseRate: 0.12,
    tallGrassRate: 0.26,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 13, minLevel: 7, maxLevel: 12, weight: 24 },  // 伊布
      { id: 39, minLevel: 7, maxLevel: 12, weight: 22 },  // 大葱鸭
      { id: 119, minLevel: 7, maxLevel: 12, weight: 20 }, // 喵喵
      { id: 106, minLevel: 8, maxLevel: 12, weight: 18 }, // 嘟嘟
      { id: 110, minLevel: 7, maxLevel: 12, weight: 16 }  // 凯西
    ]
  },
  /** 备用通道表：给后续地图出口/更深草丛使用 */
  route102_pass: {
    baseRate: 0.12,
    tallGrassRate: 0.28,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 13, minLevel: 8, maxLevel: 12, weight: 26 },
      { id: 39, minLevel: 8, maxLevel: 12, weight: 24 },
      { id: 119, minLevel: 8, maxLevel: 12, weight: 20 },
      { id: 106, minLevel: 8, maxLevel: 12, weight: 16 },
      { id: 20, minLevel: 8, maxLevel: 12, weight: 14 }
    ]
  },

  /** 默认森林（非分区） */
  forest_grass: {
    baseRate: 0.12,
    tallGrassRate: 0.30,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 1, minLevel: 4, maxLevel: 12, weight: 28 },   // 妙蛙种子 <16
      { id: 13, minLevel: 4, maxLevel: 12, weight: 22 },  // 伊布
      { id: 15, minLevel: 4, maxLevel: 12, weight: 18 },  // 胖丁
      { id: 39, minLevel: 4, maxLevel: 12, weight: 18 },  // 大葱鸭
      { id: 98, minLevel: 4, maxLevel: 12, weight: 14 }  // 尼多朗 <16
    ]
  },

  /** 苔原猎场：草/毒/虫 */
  forest_moss: {
    baseRate: 0.14,
    tallGrassRate: 0.38,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 1, minLevel: 5, maxLevel: 14, weight: 35 },   // 妙蛙种子
      { id: 98, minLevel: 5, maxLevel: 14, weight: 25 },  // 尼多朗
      { id: 110, minLevel: 5, maxLevel: 14, weight: 18 }, // 凯西 <16
      { id: 39, minLevel: 4, maxLevel: 12, weight: 12 },
      { id: 13, minLevel: 4, maxLevel: 10, weight: 10 }
    ]
  },

  /** 萤火树林：幽灵/超能 */
  forest_spirit: {
    baseRate: 0.13,
    tallGrassRate: 0.34,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 20, minLevel: 5, maxLevel: 24, weight: 40 },  // 鬼斯 <25
      { id: 110, minLevel: 5, maxLevel: 14, weight: 25 }, // 凯西
      { id: 13, minLevel: 5, maxLevel: 12, weight: 20 },
      { id: 15, minLevel: 4, maxLevel: 12, weight: 15 }
    ]
  },

  /** 花之草甸：普通系 */
  forest_meadow: {
    baseRate: 0.12,
    tallGrassRate: 0.28,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 13, minLevel: 4, maxLevel: 12, weight: 30 },
      { id: 15, minLevel: 4, maxLevel: 12, weight: 28 },
      { id: 39, minLevel: 4, maxLevel: 12, weight: 25 },
      { id: 119, minLevel: 4, maxLevel: 12, weight: 12 }, // 喵喵
      { id: 106, minLevel: 5, maxLevel: 14, weight: 5 }   // 嘟嘟 <31，稀有
    ]
  },

  /** 镜湖岸：水系 */
  forest_pond: {
    baseRate: 0.10,
    tallGrassRate: 0.22,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 14, minLevel: 5, maxLevel: 20, weight: 45 },  // 可达鸭 <33
      { id: 16, minLevel: 4, maxLevel: 18, weight: 35 },  // 鲤鱼王 <20
      { id: 13, minLevel: 4, maxLevel: 10, weight: 12 },
      { id: 39, minLevel: 4, maxLevel: 10, weight: 8 }
    ]
  },

  /** 星音草径西草丛：草/毒系教学位，围绕 Lv.8 上下浮动 */
  region_meadow_5_12: {
    baseRate: 0.11,
    tallGrassRate: 0.22,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 1, minLevel: 5, maxLevel: 12, weight: 28 },
      { id: 98, minLevel: 5, maxLevel: 12, weight: 22 },
      { id: 13, minLevel: 5, maxLevel: 12, weight: 18 },
      { id: 39, minLevel: 5, maxLevel: 12, weight: 14 },
      { id: 114, minLevel: 5, maxLevel: 12, weight: 10 },
      { id: 119, minLevel: 6, maxLevel: 12, weight: 8 }
    ]
  },
  /** 星音草径南草坡：普通/飞行练级位 */
  region_meadow_south_5_12: {
    baseRate: 0.11,
    tallGrassRate: 0.24,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 13, minLevel: 5, maxLevel: 12, weight: 24 },
      { id: 39, minLevel: 5, maxLevel: 12, weight: 22 },
      { id: 119, minLevel: 6, maxLevel: 12, weight: 18 },
      { id: 114, minLevel: 5, maxLevel: 12, weight: 16 },
      { id: 98, minLevel: 5, maxLevel: 12, weight: 12 },
      { id: 1, minLevel: 5, maxLevel: 12, weight: 8 }
    ]
  },
  /** 星音草径东花地：可爱系和稀有电系提示位 */
  region_meadow_east_5_12: {
    baseRate: 0.10,
    tallGrassRate: 0.20,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 114, minLevel: 5, maxLevel: 12, weight: 24 },
      { id: 1, minLevel: 5, maxLevel: 12, weight: 22 },
      { id: 119, minLevel: 6, maxLevel: 12, weight: 18 },
      { id: 13, minLevel: 5, maxLevel: 12, weight: 16 },
      { id: 39, minLevel: 5, maxLevel: 12, weight: 12 },
      { id: 98, minLevel: 5, maxLevel: 12, weight: 8 }
    ]
  },

  /** 雾湖苇岸西岸芦草：可达鸭与鲤鱼王更常见，围绕 Lv.14 */
  region_lake_11_18: {
    baseRate: 0.11,
    tallGrassRate: 0.22,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 14, minLevel: 11, maxLevel: 18, weight: 32 },
      { id: 16, minLevel: 11, maxLevel: 18, weight: 28 },
      { id: 77, minLevel: 12, maxLevel: 18, weight: 14 },
      { id: 13, minLevel: 11, maxLevel: 16, weight: 12 },
      { id: 80, minLevel: 12, maxLevel: 18, weight: 10 },
      { id: 78, minLevel: 12, maxLevel: 18, weight: 4 }
    ]
  },
  /** 雾湖苇岸南岸芦草：贝壳、水草与湖面鱼群混合 */
  region_lake_south_11_18: {
    baseRate: 0.11,
    tallGrassRate: 0.24,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 16, minLevel: 11, maxLevel: 18, weight: 30 },
      { id: 14, minLevel: 11, maxLevel: 18, weight: 24 },
      { id: 78, minLevel: 12, maxLevel: 18, weight: 18 },
      { id: 77, minLevel: 12, maxLevel: 18, weight: 14 },
      { id: 80, minLevel: 12, maxLevel: 18, weight: 10 },
      { id: 13, minLevel: 11, maxLevel: 16, weight: 4 }
    ]
  },
  /** 雾湖苇岸东岸潮草：湖心边缘，墨海马/大舌贝/海星星偏多 */
  region_lake_east_11_18: {
    baseRate: 0.11,
    tallGrassRate: 0.23,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 77, minLevel: 12, maxLevel: 18, weight: 28 },
      { id: 78, minLevel: 12, maxLevel: 18, weight: 22 },
      { id: 80, minLevel: 12, maxLevel: 18, weight: 18 },
      { id: 14, minLevel: 11, maxLevel: 18, weight: 16 },
      { id: 16, minLevel: 11, maxLevel: 18, weight: 10 },
      { id: 13, minLevel: 11, maxLevel: 16, weight: 6 }
    ]
  },

  /** 风车农庄北田垄：草/普通系农田生态，围绕 Lv.20 */
  region_farm_17_24: {
    baseRate: 0.12,
    tallGrassRate: 0.20,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 87, minLevel: 17, maxLevel: 24, weight: 28 },
      { id: 88, minLevel: 17, maxLevel: 24, weight: 22 },
      { id: 119, minLevel: 17, maxLevel: 24, weight: 18 },
      { id: 106, minLevel: 17, maxLevel: 24, weight: 14 },
      { id: 96, minLevel: 17, maxLevel: 24, weight: 12 },
      { id: 102, minLevel: 17, maxLevel: 24, weight: 6 }
    ]
  },
  /** 风车农庄西麦田：普通系和格斗练级位 */
  region_farm_west_17_24: {
    baseRate: 0.12,
    tallGrassRate: 0.23,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 119, minLevel: 17, maxLevel: 24, weight: 26 },
      { id: 106, minLevel: 17, maxLevel: 24, weight: 22 },
      { id: 96, minLevel: 17, maxLevel: 24, weight: 18 },
      { id: 88, minLevel: 17, maxLevel: 24, weight: 16 },
      { id: 87, minLevel: 17, maxLevel: 24, weight: 12 },
      { id: 102, minLevel: 17, maxLevel: 24, weight: 6 }
    ]
  },
  /** 风车农庄东麦田：靠近低坡，格斗/岩石系更常见 */
  region_farm_east_17_24: {
    baseRate: 0.12,
    tallGrassRate: 0.23,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 96, minLevel: 17, maxLevel: 24, weight: 26 },
      { id: 102, minLevel: 17, maxLevel: 24, weight: 22 },
      { id: 106, minLevel: 17, maxLevel: 24, weight: 18 },
      { id: 87, minLevel: 17, maxLevel: 24, weight: 14 },
      { id: 88, minLevel: 17, maxLevel: 24, weight: 12 },
      { id: 119, minLevel: 17, maxLevel: 24, weight: 8 }
    ]
  },

  /** 贝壳海岸沙丘草丛：沙岸水系与化石系入口，围绕 Lv.26 */
  region_shore_23_30: {
    baseRate: 0.12,
    tallGrassRate: 0.22,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 79, minLevel: 23, maxLevel: 30, weight: 24 },
      { id: 80, minLevel: 23, maxLevel: 30, weight: 22 },
      { id: 82, minLevel: 23, maxLevel: 30, weight: 18 },
      { id: 81, minLevel: 23, maxLevel: 30, weight: 16 },
      { id: 77, minLevel: 23, maxLevel: 30, weight: 14 },
      { id: 5, minLevel: 23, maxLevel: 30, weight: 6 }
    ]
  },
  /** 贝壳海岸南岸潮草：水边练级位 */
  region_shore_south_23_30: {
    baseRate: 0.12,
    tallGrassRate: 0.24,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 77, minLevel: 23, maxLevel: 30, weight: 26 },
      { id: 79, minLevel: 23, maxLevel: 30, weight: 24 },
      { id: 80, minLevel: 23, maxLevel: 30, weight: 18 },
      { id: 81, minLevel: 23, maxLevel: 30, weight: 14 },
      { id: 82, minLevel: 23, maxLevel: 30, weight: 12 },
      { id: 5, minLevel: 23, maxLevel: 30, weight: 6 }
    ]
  },
  /** 贝壳海岸沉船潮草：高等级水系与化石系更集中 */
  region_shore_wreck_23_30: {
    baseRate: 0.12,
    tallGrassRate: 0.25,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 44, minLevel: 28, maxLevel: 30, weight: 22 },
      { id: 82, minLevel: 23, maxLevel: 30, weight: 20 },
      { id: 81, minLevel: 23, maxLevel: 30, weight: 18 },
      { id: 80, minLevel: 23, maxLevel: 30, weight: 16 },
      { id: 77, minLevel: 23, maxLevel: 30, weight: 14 },
      { id: 79, minLevel: 23, maxLevel: 30, weight: 10 }
    ]
  },

  /** 月影墓园北墓草丛：幽灵系入口，围绕 Lv.32 */
  region_grave_29_36: {
    baseRate: 0.13,
    tallGrassRate: 0.24,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 21, minLevel: 29, maxLevel: 36, weight: 30 },
      { id: 100, minLevel: 29, maxLevel: 36, weight: 20 },
      { id: 101, minLevel: 29, maxLevel: 36, weight: 18 },
      { id: 43, minLevel: 29, maxLevel: 36, weight: 16 },
      { id: 6, minLevel: 29, maxLevel: 36, weight: 10 },
      { id: 137, minLevel: 30, maxLevel: 36, weight: 6 }
    ]
  },
  /** 月影墓园南墓荒草：毒系浓度更高 */
  region_grave_south_29_36: {
    baseRate: 0.13,
    tallGrassRate: 0.28,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 100, minLevel: 29, maxLevel: 36, weight: 28 },
      { id: 101, minLevel: 29, maxLevel: 36, weight: 24 },
      { id: 21, minLevel: 29, maxLevel: 36, weight: 18 },
      { id: 43, minLevel: 29, maxLevel: 36, weight: 14 },
      { id: 6, minLevel: 29, maxLevel: 36, weight: 10 },
      { id: 137, minLevel: 30, maxLevel: 36, weight: 6 }
    ]
  },
  /** 月影墓园月影荒草：幽灵/恶系稀有位 */
  region_grave_moon_29_36: {
    baseRate: 0.13,
    tallGrassRate: 0.27,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 6, minLevel: 29, maxLevel: 36, weight: 26 },
      { id: 21, minLevel: 29, maxLevel: 36, weight: 22 },
      { id: 43, minLevel: 29, maxLevel: 36, weight: 16 },
      { id: 137, minLevel: 30, maxLevel: 36, weight: 14 },
      { id: 101, minLevel: 29, maxLevel: 36, weight: 12 },
      { id: 100, minLevel: 29, maxLevel: 36, weight: 10 }
    ]
  },

  /** 六角遗迹北遗迹草丛：电/超能混合入口，围绕 Lv.38 */
  region_ruin_35_42: {
    baseRate: 0.13,
    tallGrassRate: 0.24,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 38, minLevel: 35, maxLevel: 42, weight: 24 },
      { id: 45, minLevel: 35, maxLevel: 42, weight: 20 },
      { id: 11, minLevel: 35, maxLevel: 42, weight: 16 },
      { id: 108, minLevel: 35, maxLevel: 42, weight: 16 },
      { id: 135, minLevel: 35, maxLevel: 42, weight: 14 },
      { id: 103, minLevel: 35, maxLevel: 42, weight: 10 }
    ]
  },
  /** 六角遗迹西遗迹草丛：岩石/地面训练位 */
  region_ruin_west_35_42: {
    baseRate: 0.13,
    tallGrassRate: 0.26,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 103, minLevel: 35, maxLevel: 42, weight: 24 },
      { id: 105, minLevel: 35, maxLevel: 42, weight: 22 },
      { id: 135, minLevel: 35, maxLevel: 42, weight: 18 },
      { id: 38, minLevel: 35, maxLevel: 42, weight: 14 },
      { id: 108, minLevel: 35, maxLevel: 42, weight: 12 },
      { id: 45, minLevel: 35, maxLevel: 42, weight: 10 }
    ]
  },
  /** 六角遗迹东遗迹草丛：电系机关与超能残响更明显 */
  region_ruin_east_35_42: {
    baseRate: 0.13,
    tallGrassRate: 0.27,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 45, minLevel: 35, maxLevel: 42, weight: 24 },
      { id: 38, minLevel: 35, maxLevel: 42, weight: 22 },
      { id: 108, minLevel: 35, maxLevel: 42, weight: 18 },
      { id: 11, minLevel: 35, maxLevel: 42, weight: 14 },
      { id: 105, minLevel: 35, maxLevel: 42, weight: 12 },
      { id: 135, minLevel: 35, maxLevel: 42, weight: 10 }
    ]
  },

  /** 铁木营地北岭草丛：格斗/岩地混合，围绕 Lv.44 */
  region_ridge_41_47: {
    baseRate: 0.13,
    tallGrassRate: 0.26,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 34, minLevel: 41, maxLevel: 47, weight: 24 },
      { id: 35, minLevel: 41, maxLevel: 47, weight: 22 },
      { id: 51, minLevel: 42, maxLevel: 47, weight: 18 },
      { id: 139, minLevel: 41, maxLevel: 47, weight: 14 },
      { id: 131, minLevel: 41, maxLevel: 47, weight: 12 },
      { id: 109, minLevel: 41, maxLevel: 47, weight: 10 }
    ]
  },
  /** 铁木营地南岭草丛：岩石/地面系更集中 */
  region_ridge_south_41_47: {
    baseRate: 0.13,
    tallGrassRate: 0.27,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 35, minLevel: 41, maxLevel: 47, weight: 26 },
      { id: 51, minLevel: 42, maxLevel: 47, weight: 22 },
      { id: 131, minLevel: 41, maxLevel: 47, weight: 18 },
      { id: 109, minLevel: 41, maxLevel: 47, weight: 14 },
      { id: 139, minLevel: 41, maxLevel: 47, weight: 12 },
      { id: 34, minLevel: 41, maxLevel: 47, weight: 8 }
    ]
  },
  /** 铁木营地东岭草丛：钢系和后期普通系更突出 */
  region_ridge_east_41_47: {
    baseRate: 0.13,
    tallGrassRate: 0.27,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 139, minLevel: 41, maxLevel: 47, weight: 26 },
      { id: 109, minLevel: 41, maxLevel: 47, weight: 20 },
      { id: 51, minLevel: 42, maxLevel: 47, weight: 18 },
      { id: 35, minLevel: 41, maxLevel: 47, weight: 14 },
      { id: 34, minLevel: 41, maxLevel: 47, weight: 12 },
      { id: 131, minLevel: 41, maxLevel: 47, weight: 10 }
    ]
  },

  /** 星雾高地西高地草丛：御三家与龙/岩混合，终局 Lv.52-60 区域 */
  region_peak_52_60: {
    baseRate: 0.14,
    tallGrassRate: 0.27,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 72, minLevel: 52, maxLevel: 60, weight: 22 },
      { id: 129, minLevel: 52, maxLevel: 60, weight: 20 },
      { id: 131, minLevel: 52, maxLevel: 60, weight: 18 },
      { id: 143, minLevel: 52, maxLevel: 60, weight: 16 },
      { id: 74, minLevel: 52, maxLevel: 60, weight: 12 },
      { id: 76, minLevel: 52, maxLevel: 60, weight: 12 }
    ]
  },
  /** 星雾高地南高地草丛：火/水强敌练级位 */
  region_peak_south_52_60: {
    baseRate: 0.14,
    tallGrassRate: 0.28,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 76, minLevel: 52, maxLevel: 60, weight: 22 },
      { id: 74, minLevel: 52, maxLevel: 60, weight: 20 },
      { id: 131, minLevel: 52, maxLevel: 60, weight: 18 },
      { id: 129, minLevel: 52, maxLevel: 60, weight: 16 },
      { id: 143, minLevel: 52, maxLevel: 60, weight: 12 },
      { id: 72, minLevel: 52, maxLevel: 60, weight: 12 }
    ]
  },
  /** 星雾高地东高地草丛：电/龙/终盘混合位，遇敌率最高 */
  region_peak_east_52_60: {
    baseRate: 0.14,
    tallGrassRate: 0.30,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 143, minLevel: 52, maxLevel: 60, weight: 22 },
      { id: 129, minLevel: 52, maxLevel: 60, weight: 20 },
      { id: 74, minLevel: 52, maxLevel: 60, weight: 18 },
      { id: 76, minLevel: 52, maxLevel: 60, weight: 16 },
      { id: 72, minLevel: 52, maxLevel: 60, weight: 12 },
      { id: 131, minLevel: 52, maxLevel: 60, weight: 12 }
    ]
  }
}

export function getEncounterTable(tableId) {
  return ENCOUNTER_TABLES[tableId] || ENCOUNTER_TABLES.route102_grass
}

export function pickWildPokemon(tableId) {
  const encounter = pickWildEncounter(getEncounterTable(tableId))
  return encounter || pickWildEncounter(ENCOUNTER_TABLES.route102_grass)
}

/** @deprecated 请使用 pickWildPokemon，等级已包含在返回值中 */
export function pickWildLevel(row) {
  if (row?.level) return row.level
  return row?.minLevel ?? 5
}
