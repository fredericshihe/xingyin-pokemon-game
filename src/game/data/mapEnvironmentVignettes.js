import { MAP_EXCLUSIVE_SETS } from './mapExclusiveAssets.generated.js'

// Asset recipes use real metre dimensions. These roles keep a bench, a tool and
// a building at compatible human scales, independent of their place in a scene.
const roles = {
  tree: { scale: 1.65, span: 2.6, maxHeight: 4.8, facing: 'natural' },
  building: { scale: 1.45, span: 2.6, maxHeight: 4.0, facing: 'road' },
  monument: { scale: 1.35, span: 2.3, maxHeight: 3.4, facing: 'road' },
  machine: { scale: 1.15, span: 2.3, maxHeight: 2.7, facing: 'road' },
  furniture: { scale: 1.05, span: 1.9, maxHeight: 1.65, facing: 'road' },
  post: { scale: 1.1, span: 1.6, maxHeight: 2.5, facing: 'road' },
  accessory: { scale: 1.1, span: 1.35, maxHeight: 1.2, facing: 'scene' },
  plant: { scale: 1.3, span: 1.9, maxHeight: 2.0, facing: 'natural' },
  rock: { scale: 1.5, span: 2.6, maxHeight: 2.4, facing: 'natural' },
  garden: { scale: 1.2, span: 2.8, maxHeight: 1.6, facing: 'scene' },
  naturalGround: { scale: 1.35, span: 3.0, maxHeight: 1.65, facing: 'natural' }
}
// Four distinct places per map. Every slot occurs once; a missing safe space
// leaves the asset unplaced instead of moving it to an unrelated scene.
const designs = {
  GodotMap: {
    roles: 'tree post furniture accessory post plant building rock plant accessory post furniture garden garden garden garden',
    scenes: [
      ['玉兰歇脚庭', .17,.12,[0,2,8,14]], ['花架入口', .81,.12,[6,4,13,15]],
      ['蜂房花园', .12,.77,[1,3,5,12]], ['园丁角落', .62,.73,[10,11,7,9]]
    ]
  },
  GodotMapV2: {
    roles: 'tree plant monument rock post plant rock garden rock accessory post plant naturalGround naturalGround naturalGround naturalGround',
    scenes: [
      ['风铃种荚林',.18,.12,[0,1,5,12]], ['风弦花台',.82,.11,[2,4,10,13]],
      ['菌生枯木角',.12,.79,[6,7,8,14]], ['采花休憩地',.70,.97,[3,9,11,15]]
    ]
  },
  GodotMapV2_MistLake: {
    roles: 'tree post building accessory furniture rock plant rock naturalGround post machine post naturalGround naturalGround naturalGround naturalGround',
    scenes: [
      ['编苇渔棚',.56,.06,[2,3,10,11]], ['雾柳鹭巢',.89,.69,[0,1,6,12]],
      ['苇筏水湾',.55,.60,[4,8,15,9]], ['苔石湿岸',.46,.78,[5,7,13,14]]
    ],
    habitats: {4:'water',8:'water',15:'water',6:'shore',9:'shore',12:'shore',13:'shore',14:'shore'}
  },
  GodotMapV2_FarmTown: {
    roles: 'building tree rock furniture plant machine building machine post accessory machine garden garden garden garden garden',
    scenes: [
      ['收获风磨',.77,.13,[0,2,3,15]], ['梨树菜圃',.16,.94,[1,4,11,12]],
      ['粮仓作业区',.85,.77,[6,7,9,13]], ['授粉种植角',.2,.12,[8,10,14,5]]
    ], habitats: {5:'shore'}
  },
  GodotMapV2_PirateShore: {
    roles: 'building rock machine machine building tree monument accessory accessory furniture accessory accessory naturalGround naturalGround naturalGround naturalGround',
    scenes: [
      ['海防瞭望点',.81,.12,[4,5,2,10]], ['旧船打捞场',.12,.16,[0,7,11,12]],
      ['渔网晾晒场',.15,.78,[3,8,9,14]], ['巨贝风蚀滩',.88,.79,[6,1,13,15]]
    ]
  },
  GodotMapV2_Graveyard: {
    roles: 'building tree monument furniture post monument monument monument plant accessory furniture garden garden garden naturalGround garden',
    scenes: [
      ['月门追思台',.01,.17,[0,4,9,15]], ['旧碑石庭',.81,.12,[2,6,7,12]],
      ['幽花纪念庭',.18,.95,[5,10,8,13]], ['夜柏断墙',.84,.78,[1,3,11,14]]
    ]
  },
  GodotMapV2_HexRuins: {
    roles: 'building monument garden monument monument garden furniture rock garden accessory rock garden naturalGround garden naturalGround naturalGround',
    scenes: [
      ['六棱门遗址',.27,.02,[0,1,7,12]], ['石盘拓印台',.82,.11,[4,2,6,14]],
      ['祭壁碎片场',.13,.79,[3,8,9,15]], ['蕨根旧池',.85,.78,[5,10,11,13]]
    ]
  },
  GodotMapV2_SurvivalRidge: {
    roles: 'building tree machine furniture monument accessory machine rock accessory furniture garden post naturalGround naturalGround naturalGround naturalGround',
    scenes: [
      ['山杉远征营',.28,.02,[0,5,9,15]], ['攀登准备处',.8,.02,[2,3,8,11]],
      ['木工作业区',.18,.97,[6,7,10,14]], ['山脊杉林',.99,.79,[1,4,12,13]]
    ]
  },
  GodotMapV2_BossHighland: {
    roles: 'monument rock building monument plant machine garden rock plant furniture post naturalGround naturalGround naturalGround naturalGround naturalGround',
    scenes: [
      ['观星记录台',.82,.13,[0,5,9,13]], ['陨痕日晷庭',.15,.12,[3,6,10,14]],
      ['风洞花境',.12,.79,[2,4,8,15]], ['高原岩层',.86,.79,[1,7,11,12]]
    ]
  },
  GodotMapV2_FrostDojo: {
    roles: 'building tree monument building garden garden plant furniture post rock rock monument naturalGround naturalGround garden naturalGround',
    scenes: [
      ['冰亭休憩处',.22,.22,[3,7,8,14]], ['雪莲霜门',.76,.17,[0,1,6,13]],
      ['冰笋风琴台',.25,.66,[2,10,9,15]], ['断冰陈列庭',.78,.72,[11,4,5,12]]
    ]
  },
  GodotMapV2_TideDojo: {
    roles: 'building monument plant plant monument post accessory furniture plant accessory accessory monument naturalGround naturalGround garden naturalGround',
    scenes: [
      ['珊瑚潮门',.32,.12,[0,3,5,12]], ['育珠庭',.787,.37,[1,7,9,14]],
      ['海绵海葵园',.14,.83,[2,8,10,15]], ['潮纹仪庭',.8,1.02,[4,6,11,13]]
    ]
  },
  GodotMapV2_IronDojo: {
    roles: 'building machine machine machine accessory machine furniture machine furniture accessory accessory post garden garden naturalGround garden',
    scenes: [
      ['熔炉锻造区',.28,.22,[0,4,10,14]], ['锻压备料区',.62,.45,[1,3,6,13]],
      ['起吊装配区',.27,.62,[7,8,9,12]], ['冷却检修区',.7,.79,[2,5,11,15]]
    ]
  },
  GodotMapV2_DragonDojo: {
    roles: 'monument monument rock monument garden monument monument rock rock rock furniture accessory naturalGround naturalGround naturalGround naturalGround',
    scenes: [
      ['翼骨研究台',.27,.26,[0,3,10,13]], ['龙首祭庭',.74,.26,[1,5,11,15]],
      ['龙卵遗存',.30,.99,[4,8,7,14]], ['黑曜龙脊',.73,.65,[2,9,6,12]]
    ]
  },
  GodotMapV2_ChampionTower: {
    roles: 'monument building tree post furniture monument monument garden post garden post monument garden garden garden garden',
    scenes: [
      ['凯旋荣誉庭',.23,.17,[0,1,8,14]], ['月桂修剪园',.77,.18,[2,7,9,12]],
      ['冠军礼仪台',.17,.72,[6,3,10,13]], ['荣耀天球庭',.8,.75,[5,4,11,15]]
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
      dx: (mapId === 'GodotMapV2_DragonDojo' ? [0,-.4,.35,.2] : [0,-1.9,1.8,.5])[k],
      dy: (mapId === 'GodotMapV2_DragonDojo' ? [0,2,-2,3.4] : [0,.9,1.1,-1.9])[k],
      rotation: [-.18,.32,-.4,.14][k], habitat: design.habitats?.[slot] || 'ground'
    }))
  }))]
}))
