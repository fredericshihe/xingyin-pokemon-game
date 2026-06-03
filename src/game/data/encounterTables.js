/** 草丛遇敌表：仅基础形态，等级区间与进化阶段一致 */
import { pickWildEncounter } from '../../utils/wildEncounterRules'

export const DEFAULT_FALLBACK_ENCOUNTER_TABLE_ID = 'valley_safe_grass'
export const LEGACY_UNUSED_ENCOUNTER_TABLE_IDS = new Set([
  'route102_grass',
  'route102_meadow',
  'route102_thicket',
  'route102_lake',
  'route102_clearing',
  'route102_pass',
  'forest_grass',
  'forest_moss',
  'forest_spirit',
  'forest_meadow',
  'forest_pond'
])

export const ENCOUNTER_TABLES = {
  /** 新手山谷安全草坡：第一场战斗练手区，避免 Lv.5 初始伙伴开局被压制 */
  valley_safe_grass: {
    baseRate: 0.08,
    tallGrassRate: 0.14,
    safeStepsAfterBattle: 8,
    pokemon: [
      { id: 16, minLevel: 3, maxLevel: 4, weight: 70 },   // 鲤鱼王
      { id: 89, minLevel: 4, maxLevel: 6, weight: 20 },   // 绿毛虫
      { id: 151, minLevel: 3, maxLevel: 4, weight: 5 },   // 波波
      { id: 154, minLevel: 3, maxLevel: 4, weight: 5 }    // 小拉达
    ]
  },
  /** 新手山谷花丘：轻微进阶，仍以中性练手对局为主 */
  valley_flower_meadow: {
    baseRate: 0.09,
    tallGrassRate: 0.16,
    safeStepsAfterBattle: 7,
    pokemon: [
      { id: 13, minLevel: 3, maxLevel: 4, weight: 22 },
      { id: 89, minLevel: 4, maxLevel: 6, weight: 36 },
      { id: 119, minLevel: 3, maxLevel: 4, weight: 14 },
      { id: 114, minLevel: 3, maxLevel: 4, weight: 10 },
      { id: 98, minLevel: 3, maxLevel: 4, weight: 10 },
      { id: 151, minLevel: 3, maxLevel: 4, weight: 8 },
      { id: 20, minLevel: 4, maxLevel: 5, weight: 4 }
    ]
  },
  /** 新手山谷湖北浅滩：更适合练手与补经验，先让孩子熟悉湖边草丛节奏 */
  valley_lake_shallows: {
    baseRate: 0.08,
    tallGrassRate: 0.15,
    safeStepsAfterBattle: 7,
    pokemon: [
      { id: 16, minLevel: 3, maxLevel: 4, weight: 60 },
      { id: 89, minLevel: 4, maxLevel: 6, weight: 28 },
      { id: 13, minLevel: 3, maxLevel: 4, weight: 12 },
      { id: 119, minLevel: 3, maxLevel: 4, weight: 8 },
      { id: 151, minLevel: 3, maxLevel: 4, weight: 6 }
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
      { id: 89, minLevel: 5, maxLevel: 6, weight: 64 },
      { id: 119, minLevel: 4, maxLevel: 5, weight: 16 },
      { id: 151, minLevel: 4, maxLevel: 5, weight: 12 },
      { id: 154, minLevel: 4, maxLevel: 5, weight: 8 }
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
      { id: 4, minLevel: 5, maxLevel: 8, weight: 7 }
    ]
  },

  /** legacy: Route102 旧切片地图入口草坡，保留给旧运行时/历史预览引用 */
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
  /** legacy: Route102 旧切片地图花丘草地，当前 9 张正式地图不再直接引用 */
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
  /** legacy: Route102 旧切片地图密林草丛，当前 9 张正式地图不再直接引用 */
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
  /** legacy: Route102 旧切片地图湖畔芦草，当前 9 张正式地图不再直接引用 */
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
  /** legacy: Route102 旧切片地图东南草坡，当前 9 张正式地图不再直接引用 */
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
  /** legacy: Route102 旧切片地图备用通道表，当前 9 张正式地图不再直接引用 */
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

  /** legacy: 旧森林地图默认草丛，保留给历史生成脚本引用 */
  forest_grass: {
    baseRate: 0.12,
    tallGrassRate: 0.30,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 1, minLevel: 4, maxLevel: 12, weight: 28 },   // 妙蛙种子 <16
      { id: 13, minLevel: 4, maxLevel: 12, weight: 22 },  // 伊布
      { id: 114, minLevel: 4, maxLevel: 12, weight: 18 }, // 宝宝丁
      { id: 39, minLevel: 4, maxLevel: 12, weight: 18 },  // 大葱鸭
      { id: 98, minLevel: 4, maxLevel: 12, weight: 14 }  // 尼多朗 <16
    ]
  },

  /** legacy: 旧森林地图苔原猎场，当前 9 张正式地图不再直接引用 */
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

  /** legacy: 旧森林地图萤火树林，当前 9 张正式地图不再直接引用 */
  forest_spirit: {
    baseRate: 0.13,
    tallGrassRate: 0.34,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 20, minLevel: 5, maxLevel: 24, weight: 40 },  // 鬼斯 <25
      { id: 110, minLevel: 5, maxLevel: 14, weight: 25 }, // 凯西
      { id: 13, minLevel: 5, maxLevel: 12, weight: 20 },
      { id: 114, minLevel: 4, maxLevel: 12, weight: 15 }
    ]
  },

  /** legacy: 旧森林地图花之草甸，当前 9 张正式地图不再直接引用 */
  forest_meadow: {
    baseRate: 0.12,
    tallGrassRate: 0.28,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 13, minLevel: 4, maxLevel: 12, weight: 30 },
      { id: 114, minLevel: 4, maxLevel: 12, weight: 28 },
      { id: 39, minLevel: 4, maxLevel: 12, weight: 25 },
      { id: 119, minLevel: 4, maxLevel: 12, weight: 12 }, // 喵喵
      { id: 106, minLevel: 5, maxLevel: 14, weight: 5 }   // 嘟嘟 <31，稀有
    ]
  },

  /** legacy: 旧森林地图镜湖岸，当前 9 张正式地图不再直接引用 */
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
      { id: 162, minLevel: 5, maxLevel: 12, weight: 6 },
      { id: 1, minLevel: 5, maxLevel: 12, weight: 24 },
      { id: 89, minLevel: 5, maxLevel: 6, weight: 22 },
      { id: 148, minLevel: 5, maxLevel: 6, weight: 20 },
      { id: 151, minLevel: 5, maxLevel: 12, weight: 18 },
      { id: 98, minLevel: 5, maxLevel: 12, weight: 14 },
      { id: 13, minLevel: 5, maxLevel: 12, weight: 12 },
      { id: 118, minLevel: 7, maxLevel: 9, weight: 7 },
      { id: 149, minLevel: 7, maxLevel: 9, weight: 7 },
      { id: 114, minLevel: 5, maxLevel: 12, weight: 8 },
      { id: 119, minLevel: 6, maxLevel: 12, weight: 6 }
    ]
  },
  /** 星音草径南草坡：普通/飞行练级位 */
  region_meadow_south_5_12: {
    baseRate: 0.11,
    tallGrassRate: 0.24,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 119, minLevel: 5, maxLevel: 12, weight: 6 },
      { id: 154, minLevel: 5, maxLevel: 12, weight: 26 },
      { id: 156, minLevel: 5, maxLevel: 12, weight: 22 },
      { id: 151, minLevel: 5, maxLevel: 12, weight: 18 },
      { id: 169, minLevel: 6, maxLevel: 12, weight: 16 },
      { id: 39, minLevel: 5, maxLevel: 12, weight: 12 },
      { id: 114, minLevel: 5, maxLevel: 12, weight: 10 },
      { id: 1, minLevel: 5, maxLevel: 12, weight: 8 }
    ]
  },
  /** 星音草径东花地：可爱系和稀有电系提示位 */
  region_meadow_east_5_12: {
    baseRate: 0.10,
    tallGrassRate: 0.20,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 167, minLevel: 5, maxLevel: 12, weight: 6 },
      { id: 165, minLevel: 5, maxLevel: 12, weight: 24 },
      { id: 162, minLevel: 5, maxLevel: 12, weight: 20 },
      { id: 178, minLevel: 6, maxLevel: 12, weight: 18 },
      { id: 114, minLevel: 5, maxLevel: 12, weight: 14 },
      { id: 1, minLevel: 5, maxLevel: 12, weight: 12 },
      { id: 119, minLevel: 6, maxLevel: 12, weight: 8 },
      { id: 39, minLevel: 5, maxLevel: 12, weight: 4 }
    ]
  },
  /** 星音秘境：星光催化出的首领级隐藏生态 */
  region_meadow_hidden_grove_5_12: {
    baseRate: 0.12,
    tallGrassRate: 0.34,
    safeStepsAfterBattle: 4,
    pokemon: [
      { id: 154, minLevel: 17, maxLevel: 19, weight: 14 },
      { id: 156, minLevel: 17, maxLevel: 19, weight: 13 },
      { id: 169, minLevel: 17, maxLevel: 19, weight: 13 },
      { id: 111, minLevel: 17, maxLevel: 19, weight: 10 },
      { id: 178, minLevel: 17, maxLevel: 19, weight: 9 },
      { id: 165, minLevel: 17, maxLevel: 19, weight: 8 },
      { id: 189, minLevel: 17, maxLevel: 19, weight: 14 },
      { id: 190, minLevel: 17, maxLevel: 19, weight: 14 },
      { id: 191, minLevel: 17, maxLevel: 19, weight: 12 }
    ]
  },

  /** 雾湖苇岸西岸芦草：可达鸭与鲤鱼王更常见，围绕 Lv.14 */
  region_lake_11_18: {
    baseRate: 0.11,
    tallGrassRate: 0.22,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 121, minLevel: 11, maxLevel: 18, weight: 6 },
      { id: 110, minLevel: 11, maxLevel: 15, weight: 8 },
      { id: 14, minLevel: 11, maxLevel: 18, weight: 26 },
      { id: 176, minLevel: 11, maxLevel: 18, weight: 22 },
      { id: 186, minLevel: 11, maxLevel: 18, weight: 18 },
      { id: 16, minLevel: 11, maxLevel: 18, weight: 16 },
      { id: 77, minLevel: 12, maxLevel: 18, weight: 10 },
      { id: 80, minLevel: 12, maxLevel: 18, weight: 8 },
      { id: 78, minLevel: 12, maxLevel: 18, weight: 4 }
    ]
  },
  /** 雾湖苇岸南岸芦草：贝壳、水草与湖面鱼群混合 */
  region_lake_south_11_18: {
    baseRate: 0.11,
    tallGrassRate: 0.24,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 116, minLevel: 11, maxLevel: 18, weight: 6 },
      { id: 181, minLevel: 11, maxLevel: 18, weight: 26 },
      { id: 183, minLevel: 11, maxLevel: 18, weight: 22 },
      { id: 16, minLevel: 11, maxLevel: 18, weight: 18 },
      { id: 14, minLevel: 11, maxLevel: 18, weight: 14 },
      { id: 78, minLevel: 12, maxLevel: 18, weight: 10 },
      { id: 77, minLevel: 12, maxLevel: 18, weight: 6 },
      { id: 186, minLevel: 11, maxLevel: 18, weight: 4 }
    ]
  },
  /** 雾湖苇岸东岸潮草：湖心边缘，墨海马/大舌贝/海星星偏多 */
  region_lake_east_11_18: {
    baseRate: 0.11,
    tallGrassRate: 0.23,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 5, minLevel: 12, maxLevel: 18, weight: 8 },
      { id: 77, minLevel: 12, maxLevel: 18, weight: 24 },
      { id: 167, minLevel: 11, maxLevel: 18, weight: 20 },
      { id: 78, minLevel: 12, maxLevel: 18, weight: 18 },
      { id: 181, minLevel: 16, maxLevel: 18, weight: 7 },
      { id: 80, minLevel: 12, maxLevel: 18, weight: 12 },
      { id: 14, minLevel: 11, maxLevel: 18, weight: 8 },
      { id: 16, minLevel: 11, maxLevel: 18, weight: 4 }
    ]
  },
  /** 环湖秘径：雾水倒影里的星光水系与少量迷雾异客 */
  region_lake_hidden_path_11_18: {
    baseRate: 0.12,
    tallGrassRate: 0.36,
    safeStepsAfterBattle: 4,
    pokemon: [
      { id: 14, minLevel: 23, maxLevel: 25, weight: 15 },
      { id: 77, minLevel: 23, maxLevel: 25, weight: 13 },
      { id: 78, minLevel: 23, maxLevel: 25, weight: 11 },
      { id: 80, minLevel: 23, maxLevel: 25, weight: 10 },
      { id: 181, minLevel: 23, maxLevel: 25, weight: 9 },
      { id: 183, minLevel: 23, maxLevel: 25, weight: 8 },
      { id: 186, minLevel: 23, maxLevel: 25, weight: 7 },
      { id: 192, minLevel: 23, maxLevel: 25, weight: 14 },
      { id: 193, minLevel: 23, maxLevel: 25, weight: 14 },
      { id: 194, minLevel: 23, maxLevel: 25, weight: 12 }
    ]
  },

  /** 风车农庄北田垄：草/普通系农田生态，围绕 Lv.20 */
  region_farm_17_24: {
    baseRate: 0.12,
    tallGrassRate: 0.20,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 23, minLevel: 17, maxLevel: 24, weight: 8 },
      { id: 107, minLevel: 17, maxLevel: 24, weight: 8 },
      { id: 158, minLevel: 17, maxLevel: 21, weight: 10 },
      { id: 87, minLevel: 17, maxLevel: 24, weight: 24 },
      { id: 160, minLevel: 17, maxLevel: 21, weight: 22 },
      { id: 170, minLevel: 17, maxLevel: 23, weight: 18 },
      { id: 88, minLevel: 17, maxLevel: 24, weight: 16 },
      { id: 106, minLevel: 17, maxLevel: 24, weight: 12 },
      { id: 96, minLevel: 17, maxLevel: 24, weight: 8 },
      { id: 102, minLevel: 17, maxLevel: 24, weight: 6 },
      { id: 92, minLevel: 20, maxLevel: 24, weight: 4 },
      { id: 95, minLevel: 20, maxLevel: 24, weight: 4 },
      { id: 99, minLevel: 20, maxLevel: 24, weight: 4 },
      { id: 111, minLevel: 20, maxLevel: 24, weight: 4 },
      { id: 171, minLevel: 24, maxLevel: 24, weight: 4 },
      { id: 179, minLevel: 21, maxLevel: 24, weight: 4 }
    ]
  },
  /** 风车农庄西麦田：普通系和格斗练级位 */
  region_farm_west_17_24: {
    baseRate: 0.12,
    tallGrassRate: 0.23,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 20, minLevel: 17, maxLevel: 24, weight: 10 },
      { id: 155, minLevel: 20, maxLevel: 24, weight: 7 },
      { id: 157, minLevel: 20, maxLevel: 24, weight: 7 },
      { id: 106, minLevel: 17, maxLevel: 24, weight: 18 },
      { id: 96, minLevel: 17, maxLevel: 24, weight: 14 },
      { id: 88, minLevel: 17, maxLevel: 24, weight: 12 },
      { id: 87, minLevel: 17, maxLevel: 24, weight: 8 },
      { id: 102, minLevel: 17, maxLevel: 24, weight: 4 }
    ]
  },
  /** 风车农庄东麦田：靠近低坡，格斗/岩石系更常见 */
  region_farm_east_17_24: {
    baseRate: 0.12,
    tallGrassRate: 0.23,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 97, minLevel: 17, maxLevel: 24, weight: 10 },
      { id: 172, minLevel: 17, maxLevel: 24, weight: 24 },
      { id: 174, minLevel: 17, maxLevel: 24, weight: 20 },
      { id: 96, minLevel: 17, maxLevel: 24, weight: 18 },
      { id: 102, minLevel: 17, maxLevel: 24, weight: 14 },
      { id: 106, minLevel: 17, maxLevel: 24, weight: 12 },
      { id: 87, minLevel: 17, maxLevel: 24, weight: 8 },
      { id: 88, minLevel: 17, maxLevel: 24, weight: 4 }
    ]
  },
  /** 风车塔顶：机械火花、风向鸟影和湿木蘑菇混成的首领级隐藏生态 */
  region_farm_windmill_top_17_24: {
    baseRate: 0.13,
    tallGrassRate: 0.38,
    safeStepsAfterBattle: 4,
    pokemon: [
      { id: 155, minLevel: 29, maxLevel: 31, weight: 13 },
      { id: 171, minLevel: 29, maxLevel: 31, weight: 12 },
      { id: 38, minLevel: 30, maxLevel: 31, weight: 10 },
      { id: 45, minLevel: 30, maxLevel: 31, weight: 10 },
      { id: 157, minLevel: 29, maxLevel: 31, weight: 10 },
      { id: 179, minLevel: 29, maxLevel: 31, weight: 8 },
      { id: 11, minLevel: 30, maxLevel: 31, weight: 8 },
      { id: 195, minLevel: 29, maxLevel: 31, weight: 14 },
      { id: 196, minLevel: 29, maxLevel: 31, weight: 14 },
      { id: 197, minLevel: 29, maxLevel: 31, weight: 12 }
    ]
  },

  /** 贝壳海岸沙丘草丛：沙岸水系与化石系入口，围绕 Lv.26 */
  region_shore_23_30: {
    baseRate: 0.12,
    tallGrassRate: 0.22,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 93, minLevel: 23, maxLevel: 29, weight: 6 },
      { id: 65, minLevel: 23, maxLevel: 29, weight: 7 },
      { id: 22, minLevel: 23, maxLevel: 30, weight: 8 },
      { id: 83, minLevel: 23, maxLevel: 29, weight: 7 },
      { id: 79, minLevel: 23, maxLevel: 30, weight: 22 },
      { id: 184, minLevel: 23, maxLevel: 27, weight: 20 },
      { id: 185, minLevel: 23, maxLevel: 30, weight: 16 },
      { id: 80, minLevel: 23, maxLevel: 30, weight: 14 },
      { id: 82, minLevel: 23, maxLevel: 30, weight: 12 },
      { id: 81, minLevel: 23, maxLevel: 30, weight: 10 },
      { id: 77, minLevel: 23, maxLevel: 30, weight: 6 }
    ]
  },
  /** 贝壳海岸南岸潮草：水边练级位 */
  region_shore_south_23_30: {
    baseRate: 0.12,
    tallGrassRate: 0.24,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 52, minLevel: 23, maxLevel: 29, weight: 7 },
      { id: 84, minLevel: 23, maxLevel: 29, weight: 7 },
      { id: 183, minLevel: 23, maxLevel: 30, weight: 5 },
      { id: 177, minLevel: 25, maxLevel: 30, weight: 7 },
      { id: 79, minLevel: 23, maxLevel: 30, weight: 18 },
      { id: 77, minLevel: 23, maxLevel: 30, weight: 14 },
      { id: 80, minLevel: 23, maxLevel: 30, weight: 12 },
      { id: 81, minLevel: 23, maxLevel: 30, weight: 8 },
      { id: 82, minLevel: 23, maxLevel: 30, weight: 6 }
    ]
  },
  /** 贝壳海岸沉船潮草：高等级水系与化石系更集中 */
  region_shore_wreck_23_30: {
    baseRate: 0.12,
    tallGrassRate: 0.25,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 130, minLevel: 23, maxLevel: 29, weight: 3 },
      { id: 90, minLevel: 23, maxLevel: 29, weight: 7 },
      { id: 175, minLevel: 26, maxLevel: 30, weight: 7 },
      { id: 185, minLevel: 28, maxLevel: 30, weight: 7 },
      { id: 44, minLevel: 28, maxLevel: 30, weight: 16 },
      { id: 82, minLevel: 23, maxLevel: 30, weight: 14 },
      { id: 81, minLevel: 23, maxLevel: 30, weight: 12 },
      { id: 80, minLevel: 23, maxLevel: 30, weight: 12 },
      { id: 79, minLevel: 23, maxLevel: 30, weight: 10 }
    ]
  },
  /** 沉船内舱：海雾、化石壳与船舱灵影交错的首领级隐藏生态 */
  region_shore_wreck_inner_23_30: {
    baseRate: 0.13,
    tallGrassRate: 0.40,
    safeStepsAfterBattle: 4,
    pokemon: [
      { id: 81, minLevel: 35, maxLevel: 37, weight: 13 },
      { id: 44, minLevel: 35, maxLevel: 37, weight: 12 },
      { id: 82, minLevel: 35, maxLevel: 37, weight: 11 },
      { id: 54, minLevel: 35, maxLevel: 37, weight: 10 },
      { id: 175, minLevel: 35, maxLevel: 37, weight: 9 },
      { id: 188, minLevel: 35, maxLevel: 37, weight: 8 },
      { id: 131, minLevel: 35, maxLevel: 37, weight: 8 },
      { id: 198, minLevel: 35, maxLevel: 37, weight: 14 },
      { id: 199, minLevel: 35, maxLevel: 37, weight: 14 },
      { id: 200, minLevel: 35, maxLevel: 37, weight: 12 }
    ]
  },

  /** 月影墓园北墓草丛：幽灵系入口，围绕 Lv.32 */
  region_grave_29_36: {
    baseRate: 0.13,
    tallGrassRate: 0.24,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 32, minLevel: 29, maxLevel: 35, weight: 8 },
      { id: 91, minLevel: 29, maxLevel: 29, weight: 7 },
      { id: 43, minLevel: 29, maxLevel: 36, weight: 26 },
      { id: 171, minLevel: 31, maxLevel: 36, weight: 7 },
      { id: 188, minLevel: 32, maxLevel: 36, weight: 5 },
      { id: 168, minLevel: 29, maxLevel: 36, weight: 14 },
      { id: 159, minLevel: 29, maxLevel: 36, weight: 12 },
      { id: 124, minLevel: 29, maxLevel: 36, weight: 10 },
      { id: 137, minLevel: 30, maxLevel: 36, weight: 6 }
    ]
  },
  /** 月影墓园南墓荒草：毒系浓度更高 */
  region_grave_south_29_36: {
    baseRate: 0.13,
    tallGrassRate: 0.28,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 48, minLevel: 29, maxLevel: 36, weight: 8 },
      { id: 159, minLevel: 29, maxLevel: 36, weight: 24 },
      { id: 171, minLevel: 33, maxLevel: 36, weight: 5 },
      { id: 153, minLevel: 36, maxLevel: 36, weight: 5 },
      { id: 168, minLevel: 29, maxLevel: 36, weight: 14 },
      { id: 188, minLevel: 29, maxLevel: 36, weight: 12 },
      { id: 185, minLevel: 29, maxLevel: 36, weight: 12 },
      { id: 137, minLevel: 30, maxLevel: 36, weight: 8 }
    ]
  },
  /** 月影墓园月影荒草：幽灵/恶系稀有位 */
  region_grave_moon_29_36: {
    baseRate: 0.13,
    tallGrassRate: 0.27,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 4, minLevel: 29, maxLevel: 29, weight: 7 },
      { id: 124, minLevel: 29, maxLevel: 29, weight: 8 },
      { id: 171, minLevel: 29, maxLevel: 36, weight: 24 },
      { id: 188, minLevel: 29, maxLevel: 36, weight: 7 },
      { id: 187, minLevel: 33, maxLevel: 36, weight: 5 },
      { id: 43, minLevel: 29, maxLevel: 36, weight: 14 },
      { id: 168, minLevel: 29, maxLevel: 36, weight: 12 },
      { id: 137, minLevel: 30, maxLevel: 36, weight: 12 },
      { id: 159, minLevel: 29, maxLevel: 36, weight: 8 }
    ]
  },
  /** 墓园深林：月影、毒雾、拟态与恶系回声组成的首领级隐藏生态 */
  region_grave_deep_forest_29_36: {
    baseRate: 0.14,
    tallGrassRate: 0.42,
    safeStepsAfterBattle: 4,
    pokemon: [
      { id: 171, minLevel: 41, maxLevel: 43, weight: 12 },
      { id: 188, minLevel: 41, maxLevel: 43, weight: 11 },
      { id: 153, minLevel: 41, maxLevel: 43, weight: 10 },
      { id: 157, minLevel: 41, maxLevel: 43, weight: 9 },
      { id: 43, minLevel: 41, maxLevel: 43, weight: 8 },
      { id: 137, minLevel: 41, maxLevel: 43, weight: 8 },
      { id: 185, minLevel: 41, maxLevel: 43, weight: 8 },
      { id: 201, minLevel: 41, maxLevel: 43, weight: 14 },
      { id: 202, minLevel: 41, maxLevel: 43, weight: 14 },
      { id: 203, minLevel: 41, maxLevel: 43, weight: 12 }
    ]
  },

  /** 六角遗迹北遗迹草丛：电/超能混合入口，围绕 Lv.38 */
  region_ruin_35_42: {
    baseRate: 0.13,
    tallGrassRate: 0.24,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 143, minLevel: 35, maxLevel: 42, weight: 6 },
      { id: 56, minLevel: 35, maxLevel: 41, weight: 8 },
      { id: 85, minLevel: 35, maxLevel: 39, weight: 7 },
      { id: 38, minLevel: 35, maxLevel: 42, weight: 22 },
      { id: 45, minLevel: 35, maxLevel: 42, weight: 18 },
      { id: 153, minLevel: 36, maxLevel: 42, weight: 5 },
      { id: 11, minLevel: 35, maxLevel: 42, weight: 14 },
      { id: 108, minLevel: 35, maxLevel: 42, weight: 14 },
      { id: 157, minLevel: 35, maxLevel: 42, weight: 10 },
      { id: 103, minLevel: 35, maxLevel: 42, weight: 6 },
      { id: 18, minLevel: 35, maxLevel: 39, weight: 4 },
      { id: 54, minLevel: 35, maxLevel: 39, weight: 4 }
    ]
  },
  /** 六角遗迹西遗迹草丛：岩石/地面训练位 */
  region_ruin_west_35_42: {
    baseRate: 0.13,
    tallGrassRate: 0.26,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 103, minLevel: 35, maxLevel: 42, weight: 22 },
      { id: 105, minLevel: 35, maxLevel: 42, weight: 20 },
      { id: 175, minLevel: 35, maxLevel: 42, weight: 7 },
      { id: 161, minLevel: 35, maxLevel: 42, weight: 14 },
      { id: 38, minLevel: 35, maxLevel: 42, weight: 12 },
      { id: 108, minLevel: 35, maxLevel: 42, weight: 10 },
      { id: 45, minLevel: 35, maxLevel: 42, weight: 6 }
    ]
  },
  /** 六角遗迹东遗迹草丛：电系机关与超能残响更明显 */
  region_ruin_east_35_42: {
    baseRate: 0.13,
    tallGrassRate: 0.27,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 143, minLevel: 35, maxLevel: 42, weight: 6 },
      { id: 56, minLevel: 35, maxLevel: 42, weight: 8 },
      { id: 45, minLevel: 35, maxLevel: 42, weight: 22 },
      { id: 157, minLevel: 35, maxLevel: 42, weight: 7 },
      { id: 38, minLevel: 35, maxLevel: 42, weight: 18 },
      { id: 108, minLevel: 35, maxLevel: 42, weight: 14 },
      { id: 11, minLevel: 35, maxLevel: 42, weight: 12 },
      { id: 105, minLevel: 35, maxLevel: 42, weight: 10 },
      { id: 153, minLevel: 35, maxLevel: 42, weight: 6 }
    ]
  },
  /** 六角遗迹封印密室：机关核心旁的首领级隐藏生态，偏机械与终局守护者 */
  region_ruin_sealed_chamber_35_42: {
    baseRate: 0.14,
    tallGrassRate: 0.36,
    safeStepsAfterBattle: 4,
    pokemon: [
      { id: 45, minLevel: 47, maxLevel: 49, weight: 11 },
      { id: 11, minLevel: 47, maxLevel: 49, weight: 10 },
      { id: 175, minLevel: 47, maxLevel: 49, weight: 10 },
      { id: 109, minLevel: 47, maxLevel: 49, weight: 9 },
      { id: 143, minLevel: 47, maxLevel: 49, weight: 8 },
      { id: 204, minLevel: 47, maxLevel: 49, weight: 14 },
      { id: 205, minLevel: 47, maxLevel: 49, weight: 14 },
      { id: 206, minLevel: 47, maxLevel: 49, weight: 12 }
    ]
  },

  /** 铁木营地北岭草丛：格斗/岩地混合，围绕 Lv.44 */
  region_ridge_41_47: {
    baseRate: 0.13,
    tallGrassRate: 0.26,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 33, minLevel: 41, maxLevel: 47, weight: 6 },
      { id: 48, minLevel: 41, maxLevel: 47, weight: 6 },
      { id: 135, minLevel: 41, maxLevel: 47, weight: 7 },
      { id: 105, minLevel: 41, maxLevel: 47, weight: 8 },
      { id: 49, minLevel: 41, maxLevel: 47, weight: 8 },
      { id: 51, minLevel: 42, maxLevel: 47, weight: 22 },
      { id: 159, minLevel: 41, maxLevel: 47, weight: 7 },
      { id: 157, minLevel: 41, maxLevel: 47, weight: 7 },
      { id: 161, minLevel: 41, maxLevel: 47, weight: 14 },
      { id: 175, minLevel: 42, maxLevel: 47, weight: 12 },
      { id: 45, minLevel: 41, maxLevel: 47, weight: 6 },
      { id: 109, minLevel: 41, maxLevel: 47, weight: 10 },
      { id: 131, minLevel: 41, maxLevel: 47, weight: 3 }
    ]
  },
  /** 铁木训练林：体能器械旁的格斗/岩地训练生态，区别于北岭 */
  region_ridge_training_41_47: {
    baseRate: 0.14,
    tallGrassRate: 0.29,
    safeStepsAfterBattle: 4,
    pokemon: [
      { id: 49, minLevel: 41, maxLevel: 47, weight: 18 },
      { id: 48, minLevel: 41, maxLevel: 47, weight: 18 },
      { id: 146, minLevel: 41, maxLevel: 47, weight: 10 },
      { id: 51, minLevel: 42, maxLevel: 47, weight: 16 },
      { id: 105, minLevel: 41, maxLevel: 47, weight: 14 },
      { id: 33, minLevel: 41, maxLevel: 47, weight: 8 },
      { id: 159, minLevel: 41, maxLevel: 47, weight: 10 },
      { id: 157, minLevel: 41, maxLevel: 47, weight: 8 },
      { id: 56, minLevel: 41, maxLevel: 41, weight: 6 },
      { id: 188, minLevel: 41, maxLevel: 47, weight: 6 },
      { id: 155, minLevel: 41, maxLevel: 47, weight: 8 },
      { id: 109, minLevel: 41, maxLevel: 47, weight: 6 },
      { id: 131, minLevel: 41, maxLevel: 47, weight: 4 }
    ]
  },
  /** 铁木营地南岭草丛：岩石/地面系更集中 */
  region_ridge_south_41_47: {
    baseRate: 0.13,
    tallGrassRate: 0.27,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 105, minLevel: 41, maxLevel: 47, weight: 24 },
      { id: 17, minLevel: 41, maxLevel: 47, weight: 12 },
      { id: 161, minLevel: 41, maxLevel: 47, weight: 7 },
      { id: 51, minLevel: 42, maxLevel: 47, weight: 18 },
      { id: 131, minLevel: 41, maxLevel: 47, weight: 3 },
      { id: 109, minLevel: 41, maxLevel: 47, weight: 12 },
      { id: 175, minLevel: 41, maxLevel: 47, weight: 8 },
      { id: 135, minLevel: 41, maxLevel: 47, weight: 8 },
      { id: 188, minLevel: 41, maxLevel: 47, weight: 6 },
      { id: 48, minLevel: 41, maxLevel: 47, weight: 6 }
    ]
  },
  /** 铁木营地东岭草丛：钢系和后期普通系更突出 */
  region_ridge_east_41_47: {
    baseRate: 0.13,
    tallGrassRate: 0.27,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 49, minLevel: 41, maxLevel: 47, weight: 7 },
      { id: 145, minLevel: 41, maxLevel: 47, weight: 12 },
      { id: 143, minLevel: 41, maxLevel: 47, weight: 24 },
      { id: 45, minLevel: 41, maxLevel: 47, weight: 10 },
      { id: 155, minLevel: 41, maxLevel: 47, weight: 7 },
      { id: 188, minLevel: 41, maxLevel: 47, weight: 6 },
      { id: 109, minLevel: 41, maxLevel: 47, weight: 16 },
      { id: 51, minLevel: 42, maxLevel: 47, weight: 14 },
      { id: 105, minLevel: 41, maxLevel: 47, weight: 12 },
      { id: 48, minLevel: 41, maxLevel: 47, weight: 10 },
      { id: 131, minLevel: 41, maxLevel: 47, weight: 3 }
    ]
  },

  /** 星雾高地西高地草丛：草/龙/岩旁系集中，终局 Lv.52-60 区域 */
  region_peak_52_60: {
    baseRate: 0.14,
    tallGrassRate: 0.27,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 131, minLevel: 52, maxLevel: 60, weight: 24 },
      { id: 129, minLevel: 52, maxLevel: 60, weight: 18 },
      { id: 46, minLevel: 52, maxLevel: 60, weight: 14 },
      { id: 133, minLevel: 52, maxLevel: 60, weight: 12 },
      { id: 136, minLevel: 52, maxLevel: 60, weight: 12 },
      { id: 123, minLevel: 52, maxLevel: 60, weight: 10 },
      { id: 17, minLevel: 52, maxLevel: 60, weight: 6 },
      { id: 19, minLevel: 52, maxLevel: 60, weight: 5 },
      { id: 144, minLevel: 52, maxLevel: 60, weight: 6 },
      { id: 180, minLevel: 52, maxLevel: 60, weight: 5 }
    ]
  },
  /** 星雾高地南高地草丛：火/水强敌练级位 */
  region_peak_south_52_60: {
    baseRate: 0.14,
    tallGrassRate: 0.28,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 182, minLevel: 52, maxLevel: 60, weight: 16 },
      { id: 57, minLevel: 52, maxLevel: 60, weight: 12 },
      { id: 40, minLevel: 52, maxLevel: 60, weight: 12 },
      { id: 33, minLevel: 52, maxLevel: 60, weight: 11 },
      { id: 29, minLevel: 52, maxLevel: 60, weight: 10 },
      { id: 36, minLevel: 52, maxLevel: 60, weight: 10 },
      { id: 64, minLevel: 52, maxLevel: 60, weight: 8 },
      { id: 138, minLevel: 52, maxLevel: 60, weight: 7 },
      { id: 25, minLevel: 55, maxLevel: 60, weight: 6 },
      { id: 26, minLevel: 55, maxLevel: 60, weight: 6 }
    ]
  },
  /** 星雾高地东高地草丛：电/龙/终盘混合位，遇敌率最高 */
  region_peak_east_52_60: {
    baseRate: 0.14,
    tallGrassRate: 0.30,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 143, minLevel: 52, maxLevel: 60, weight: 24 },
      { id: 129, minLevel: 52, maxLevel: 60, weight: 14 },
      { id: 28, minLevel: 52, maxLevel: 60, weight: 12 },
      { id: 150, minLevel: 52, maxLevel: 60, weight: 10 },
      { id: 109, minLevel: 52, maxLevel: 60, weight: 10 },
      { id: 11, minLevel: 52, maxLevel: 60, weight: 8 },
      { id: 164, minLevel: 52, maxLevel: 60, weight: 7 },
      { id: 188, minLevel: 52, maxLevel: 60, weight: 6 },
      { id: 27, minLevel: 55, maxLevel: 60, weight: 6 },
      { id: 69, minLevel: 58, maxLevel: 60, weight: 4 }
    ]
  },
  /** 星雾高地观星秘径：终局首领级隐藏区，偏传说/龙/岩的高风险高回报遭遇 */
  region_peak_starwatch_52_60: {
    baseRate: 0.16,
    tallGrassRate: 0.38,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 25, minLevel: 65, maxLevel: 67, weight: 10 },
      { id: 26, minLevel: 65, maxLevel: 67, weight: 10 },
      { id: 27, minLevel: 65, maxLevel: 67, weight: 9 },
      { id: 109, minLevel: 65, maxLevel: 67, weight: 8 },
      { id: 143, minLevel: 65, maxLevel: 67, weight: 8 },
      { id: 207, minLevel: 69, maxLevel: 70, weight: 14 },
      { id: 208, minLevel: 69, maxLevel: 70, weight: 14 },
      { id: 209, minLevel: 69, maxLevel: 70, weight: 12 }
    ]
  }
}

export function getEncounterTable(tableId) {
  return ENCOUNTER_TABLES[tableId] || ENCOUNTER_TABLES[DEFAULT_FALLBACK_ENCOUNTER_TABLE_ID]
}

export function pickWildPokemon(tableId) {
  const encounter = pickWildEncounter(getEncounterTable(tableId))
  return encounter || pickWildEncounter(ENCOUNTER_TABLES[DEFAULT_FALLBACK_ENCOUNTER_TABLE_ID])
}

/** @deprecated 请使用 pickWildPokemon，等级已包含在返回值中 */
export function pickWildLevel(row) {
  if (row?.level) return row.level
  return row?.minLevel ?? 5
}
