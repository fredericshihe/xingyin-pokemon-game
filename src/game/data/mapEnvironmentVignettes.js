import { MAP_EXCLUSIVE_SETS } from './mapExclusiveAssets.generated.js'

// Asset recipes use real metre dimensions. These roles keep a bench, a tool and
// a building at compatible human scales, independent of their place in a scene.
const roles = {
  tree: { scale: 2.2, span: 3.2, maxHeight: 5.5, facing: 'natural' },
  building: { scale: 1.45, span: 2.6, maxHeight: 4.0, facing: 'road' },
  monument: { scale: 1.35, span: 2.3, maxHeight: 3.4, facing: 'road' },
  machine: { scale: 1.15, span: 2.3, maxHeight: 2.7, facing: 'road' },
  furniture: { scale: 1.05, span: 1.9, maxHeight: 1.65, facing: 'road' },
  post: { scale: 1.1, span: 1.6, maxHeight: 2.5, facing: 'road' },
  accessory: { scale: 1.1, span: 1.35, maxHeight: 1.2, facing: 'scene' },
  plant: { scale: 1.3, span: 1.9, maxHeight: 2.0, facing: 'natural' },
  rock: { scale: 1.85, span: 2.8, maxHeight: 3.0, facing: 'natural' },
  garden: { scale: 1.2, span: 2.8, maxHeight: 1.6, facing: 'scene' },
  naturalGround: { scale: 1.35, span: 3.0, maxHeight: 1.65, facing: 'natural' }
}
// Four distinct places per map. Every slot occurs once; a missing safe space
// leaves the asset unplaced instead of moving it to an unrelated scene.
const designs = {
  GodotMap: {
    roles: 'tree post furniture accessory post plant building rock plant accessory post furniture garden garden garden garden',
    scenes: [
      ['玉兰歇脚庭', 0.29,0.59,[0,2,8,14]], ['花架入口', 0.58,0.46,[6,4,13,15]],
      ['蜂房花园', 0.71,0.68,[1,3,5,12]], ['园丁角落', 0.39,0.71,[10,11,7,9]]
    ]
  },
  GodotMapV2: {
    roles: 'tree plant monument rock post plant rock garden rock accessory post plant naturalGround naturalGround naturalGround naturalGround',
    scenes: [
      ['风铃种荚林',0.42,0.34,[0,1,5,12]], ['风弦花台',0.67,0.31,[2,4,10,13]],
      ['菌生枯木角',0.4,0.67,[6,7,8,14]], ['采花休憩地',0.74,0.65,[3,9,11,15]]
    ]
  },
  GodotMapV2_MistLake: {
    roles: 'tree post building accessory furniture rock plant rock naturalGround post machine post naturalGround naturalGround naturalGround naturalGround',
    scenes: [
      ['编苇渔棚',0.3,0.68,[2,3,10,11]], ['雾柳鹭巢',0.42,0.42,[0,1,6,12]],
      ['苇筏水湾',0.68,0.6,[4,8,15,9]], ['苔石湿岸',0.81,0.72,[5,7,13,14]]
    ],
    habitats: {4:'water',8:'water',15:'water',6:'shore',9:'shore',12:'shore',13:'shore',14:'shore'}
  },
  GodotMapV2_FarmTown: {
    roles: 'building tree rock furniture plant machine building machine post accessory machine garden garden garden garden garden',
    scenes: [
      ['收获风磨',0.4,0.33,[0,2,3,15]], ['梨树菜圃',0.28,0.67,[1,4,11,12]],
      ['粮仓作业区',0.72,0.69,[6,7,9,13]], ['授粉种植角',0.7,0.34,[8,10,14,5]]
    ], habitats: {5:'shore'}
  },
  GodotMapV2_PirateShore: {
    roles: 'building rock machine machine building tree monument accessory accessory furniture accessory accessory naturalGround naturalGround naturalGround naturalGround',
    scenes: [
      ['海防瞭望点',0.76,0.37,[4,5,2,10]], ['海锚打捞场',0.4,0.37,[7,0,11,12]],
      ['渔网晾晒场',0.39,0.67,[3,8,9,14]], ['巨贝风蚀滩',0.68,0.66,[6,1,13,15]]
    ]
  },
  GodotMapV2_Graveyard: {
    roles: 'building tree monument furniture post monument monument monument plant accessory furniture garden garden garden naturalGround garden',
    scenes: [
      ['月门追思台',0.34,0.38,[0,4,9,15]], ['旧碑石庭',0.57,0.34,[2,6,7,12]],
      ['幽花纪念庭',0.47,0.69,[5,10,8,13]], ['夜柏断墙',0.76,0.64,[1,3,11,14]]
    ]
  },
  GodotMapV2_HexRuins: {
    roles: 'building monument garden monument monument garden furniture rock garden accessory rock garden naturalGround garden naturalGround naturalGround',
    scenes: [
      ['六棱门遗址',0.67,0.36,[0,1,7,12]], ['石盘拓印台',0.57,0.63,[4,2,6,14]],
      ['祭壁碎片场',0.41,0.61,[3,8,9,15]], ['蕨根旧池',0.82,0.7,[5,10,11,13]]
    ]
  },
  GodotMapV2_SurvivalRidge: {
    roles: 'building tree machine furniture monument accessory machine rock accessory furniture garden post naturalGround naturalGround naturalGround naturalGround',
    scenes: [
      ['山杉远征营',0.35,0.38,[0,5,9,15]], ['攀登准备处',0.72,0.36,[2,3,8,11]],
      ['木工作业区',0.37,0.62,[6,7,10,14]], ['山脊杉林',0.62,0.68,[1,4,12,13]]
    ]
  },
  GodotMapV2_BossHighland: {
    roles: 'monument rock building monument plant machine garden rock plant furniture post naturalGround naturalGround naturalGround naturalGround naturalGround',
    scenes: [
      ['观星记录台',0.41,0.38,[0,5,9,13]], ['陨痕日晷庭',0.7,0.31,[3,6,10,14]],
      ['风洞花境',0.69,0.66,[2,4,8,15]], ['高原岩层',0.3,0.64,[1,7,11,12]]
    ]
  },
  GodotMapV2_FrostDojo: {
    roles: 'building tree monument building garden garden plant furniture post rock rock monument naturalGround naturalGround garden naturalGround',
    scenes: [
      ['冰亭休憩处',0.33,0.31,[3,7,8,14]], ['雪莲霜门',0.63,0.32,[0,1,6,13]],
      ['冰笋风琴台',0.35,0.55,[2,10,9,15]], ['断冰陈列庭',0.67,0.64,[11,4,5,12]]
    ]
  },
  GodotMapV2_TideDojo: {
    roles: 'building monument plant plant monument post accessory furniture plant accessory accessory monument naturalGround naturalGround garden naturalGround',
    scenes: [
      ['珊瑚潮门',0.32,0.36,[0,3,5,12]], ['育珠庭',0.7,0.37,[1,7,9,14]],
      ['海绵海葵园',0.33,0.64,[2,8,10,15]], ['潮纹仪庭',0.69,0.65,[4,6,11,13]]
    ]
  },
  GodotMapV2_IronDojo: {
    roles: 'building machine machine machine accessory machine furniture machine furniture accessory accessory post garden garden naturalGround garden',
    scenes: [
      ['熔炉锻造区',0.33,0.26,[0,4,10,14]], ['锻压备料区',0.64,0.43,[1,3,6,13]],
      ['起吊装配区',0.35,0.59,[7,8,9,12]], ['冷却检修区',0.64,0.72,[2,5,11,15]]
    ]
  },
  GodotMapV2_DragonDojo: {
    roles: 'monument monument rock monument garden monument monument rock rock rock furniture accessory naturalGround naturalGround naturalGround naturalGround',
    scenes: [
      ['翼骨研究台',0.28,0.3,[0,3,10,13]], ['龙首祭庭',0.71,0.33,[1,5,11,15]],
      ['龙卵遗存',0.33,0.65,[4,8,7,14]], ['黑曜龙脊',0.71,0.62,[2,9,6,12]]
    ]
  },
  GodotMapV2_ChampionTower: {
    roles: 'monument building tree post furniture monument monument garden post garden post monument garden garden garden garden',
    scenes: [
      ['凯旋荣誉庭',0.36,0.24,[0,1,8,14]], ['月桂修剪园',0.64,0.32,[2,7,9,12]],
      ['冠军礼仪台',0.36,0.55,[6,3,10,13]], ['荣耀天球庭',0.65,0.68,[5,4,11,15]]
    ]
  }
}

export const MAP_ENVIRONMENT_VIGNETTES = Object.fromEntries(Object.entries(designs).map(([mapId, design]) => {
  const kinds = design.roles.split(' ')
  const set = MAP_EXCLUSIVE_SETS[mapId]
  return [mapId, design.scenes.map(([name,x,y,slots], index) => ({
    id: `${mapId}_place_${index}`, name, x, y,
    props: slots.map((slot,k) => ({
      type: set[slot], role: kinds[slot], ...roles[kinds[slot]],
      ...(mapId === 'GodotMap' && slot === 0 ? { span: 2.6 } : {}),
      ...(mapId === 'GodotMapV2_MistLake' && slot === 0 ? { span: 2.4 } : {}),
      dx: (mapId === 'GodotMapV2_DragonDojo' ? [0,-.4,.35,.2] : [0,-1.9,1.8,.5])[k],
      dy: (mapId === 'GodotMapV2_DragonDojo' ? [0,2,-2,3.4] : [0,.9,1.1,-1.9])[k],
      rotation: [-.18,.32,-.4,.14][k], habitat: mapId === 'GodotMapV2_TideDojo' && [2,8,10,15].includes(slot) ? 'water' : design.habitats?.[slot] || 'ground'
    }))
  }))]
}))
