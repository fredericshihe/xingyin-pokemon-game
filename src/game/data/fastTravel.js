export const FAST_TRAVEL_EVENT_TYPE = 'fast_travel'
export const FAST_TRAVEL_COST = 5

export const FAST_TRAVEL_STATIONS = Object.freeze({
  GodotMap: { x: 5, y: 30, direction: 'up', anchor: 'camp-road' },
  GodotMapV2: { x: 6, y: 14, direction: 'down', anchor: 'west-gate' },
  GodotMapV2_MistLake: { x: 16, y: 14, direction: 'right', anchor: 'lake-causeway' },
  GodotMapV2_FarmTown: { x: 18, y: 6, direction: 'right', anchor: 'town-square' },
  GodotMapV2_PirateShore: { x: 6, y: 14, direction: 'down', anchor: 'landing-beach' },
  GodotMapV2_Graveyard: { x: 18, y: 6, direction: 'right', anchor: 'moon-gate' },
  GodotMapV2_HexRuins: { x: 6, y: 14, direction: 'down', anchor: 'ruin-gate' },
  GodotMapV2_SurvivalRidge: { x: 6, y: 14, direction: 'down', anchor: 'trailhead-camp' },
  GodotMapV2_BossHighland: { x: 6, y: 14, direction: 'down', anchor: 'summit-gate' },
  GodotMapV2_FrostDojo: { x: 18, y: 21, direction: 'left', anchor: 'frost-dojo-gate' },
  GodotMapV2_TideDojo: { x: 18, y: 21, direction: 'left', anchor: 'tide-dojo-gate' },
  GodotMapV2_IronDojo: { x: 18, y: 21, direction: 'left', anchor: 'iron-dojo-gate' },
  GodotMapV2_DragonDojo: { x: 20, y: 21, direction: 'left', anchor: 'dragon-dojo-gate' },
  GodotMapV2_ChampionTower: { x: 19, y: 23, direction: 'left', anchor: 'champion-tower-lobby' }
})

export const FAST_TRAVEL_STATION_META = Object.freeze({
  GodotMap: {
    terrain: 'valley',
    title: '营地星纹台',
    placement: '放在新手营地东侧主路旁的安全空地，离帐篷、篝火和教程牌最近，但不占用营地主路。',
    landmark: '营地补给路口',
    routeTone: '温暖安全',
    symbol: 'seed'
  },
  GodotMapV2: {
    terrain: 'meadow',
    title: '草径界碑台',
    placement: '放在西侧入口主路北侧草坡，承接新手山谷出口，但不占用通行道路，像地区交通的第一块界碑。',
    landmark: '草径西门',
    routeTone: '花草驿站',
    symbol: 'leaf'
  },
  GodotMapV2_MistLake: {
    terrain: 'lake',
    title: '雾湖栈桥台',
    placement: '放在雾湖栈桥西侧的岸边空地，靠近桥面和湖水，但留出主路通行空间。',
    landmark: '雾湖岸线',
    routeTone: '水雾航标',
    symbol: 'water'
  },
  GodotMapV2_FarmTown: {
    terrain: 'farm',
    title: '风车集市台',
    placement: '放在农庄北侧道路旁的田埂空地，靠近风车、货车和田垄，是农场运输的自然集散点。',
    landmark: '风车集市',
    routeTone: '田野货站',
    symbol: 'wheat'
  },
  GodotMapV2_PirateShore: {
    terrain: 'shore',
    title: '贝壳码头台',
    placement: '放在西侧登陆沙路北侧的沙地，不占主路，旁边可布置旗帜、木桶和码头元素，像真正的登陆点。',
    landmark: '海岸登陆点',
    routeTone: '潮汐航线',
    symbol: 'anchor'
  },
  GodotMapV2_Graveyard: {
    terrain: 'grave',
    title: '月影碑台',
    placement: '放在北侧主门内道路旁的 pale grass 空地，远离密集墓碑，像守墓灯引导玩家安全进入。',
    landmark: '月影北门',
    routeTone: '静默灯路',
    symbol: 'moon'
  },
  GodotMapV2_HexRuins: {
    terrain: 'ruins',
    title: '六角共鸣台',
    placement: '放在遗迹西门主轴北侧空地，和六角石阵形成“入口共鸣器”的关系，同时不压住主轴道路。',
    landmark: '遗迹西门',
    routeTone: '符文通路',
    symbol: 'hex'
  },
  GodotMapV2_SurvivalRidge: {
    terrain: 'ridge',
    title: '铁木营火台',
    placement: '放在营地入口道路北侧空地，靠近木材、帐篷和工具，让传送台像远征营地的补给坐标。',
    landmark: '铁木路标',
    routeTone: '山脊营线',
    symbol: 'camp'
  },
  GodotMapV2_BossHighland: {
    terrain: 'peak',
    title: '高地旗门台',
    placement: '放在高地入口道路北侧的 pale grass 空地，和旗帜、岩台形成仪式感，进入后就是最终挑战前的集结点。',
    landmark: '高地旗门',
    routeTone: '峰顶星线',
    symbol: 'flag'
  },
  GodotMapV2_FrostDojo: {
    terrain: 'peak',
    eliteTheme: 'frost',
    title: '霜镜门前台',
    placement: '位于折返镜廊入口东侧，霜晶门框与普通地区传送台完全区分。',
    landmark: '霜镜南门',
    routeTone: '冰镜试炼线',
    symbol: 'moon'
  },
  GodotMapV2_TideDojo: {
    terrain: 'lake',
    eliteTheme: 'tide',
    title: '深潮门前台',
    placement: '位于环潮水道入口东侧，以潮柱和水门标记第二馆。',
    landmark: '深潮南门',
    routeTone: '深潮航线',
    symbol: 'water'
  },
  GodotMapV2_IronDojo: {
    terrain: 'ruins',
    eliteTheme: 'iron',
    title: '铁壁门前台',
    placement: '位于三重折角闸门入口东侧，以金属堡垒和信标标记第三馆。',
    landmark: '铁壁南门',
    routeTone: '钢轨试炼线',
    symbol: 'hex'
  },
  GodotMapV2_DragonDojo: {
    terrain: 'ridge',
    eliteTheme: 'dragon',
    title: '龙穹门前台',
    placement: '位于收束龙脊入口东侧，以龙穹拱门和紫晶尖塔标记最终馆。',
    landmark: '龙穹南门',
    routeTone: '龙穹终局线',
    symbol: 'flag'
  },
  GodotMapV2_ChampionTower: {
    terrain: 'champion',
    eliteTheme: 'champion',
    title: '星冠塔大厅台',
    placement: '位于冠军挑战塔大厅东翼，金色星环围绕深色升降核心，保留中央仪式轴线。',
    landmark: '冠军塔大厅',
    routeTone: '星冠挑战线',
    symbol: 'crown'
  }
})

export const FAST_TRAVEL_WORLD_LAYOUT = Object.freeze({
  GodotMap: { x: 64, y: 270, w: 156, h: 96, terrain: 'valley', route: 0 },
  GodotMapV2: { x: 266, y: 248, w: 156, h: 96, terrain: 'meadow', route: 1 },
  GodotMapV2_MistLake: { x: 430, y: 105, w: 156, h: 96, terrain: 'lake', route: 2 },
  GodotMapV2_FarmTown: { x: 438, y: 374, w: 156, h: 96, terrain: 'farm', route: 3 },
  GodotMapV2_PirateShore: { x: 616, y: 234, w: 156, h: 96, terrain: 'shore', route: 4 },
  GodotMapV2_Graveyard: { x: 632, y: 444, w: 156, h: 96, terrain: 'grave', route: 5 },
  GodotMapV2_HexRuins: { x: 792, y: 322, w: 156, h: 96, terrain: 'ruins', route: 6 },
  GodotMapV2_SurvivalRidge: { x: 908, y: 166, w: 156, h: 96, terrain: 'ridge', route: 7 },
  GodotMapV2_BossHighland: { x: 904, y: 456, w: 156, h: 96, terrain: 'peak', route: 8 },
  GodotMapV2_FrostDojo: { x: 112, y: 34, w: 156, h: 96, terrain: 'peak', route: 9 },
  GodotMapV2_TideDojo: { x: 326, y: 34, w: 156, h: 96, terrain: 'lake', route: 10 },
  GodotMapV2_IronDojo: { x: 540, y: 34, w: 156, h: 96, terrain: 'ruins', route: 11 },
  GodotMapV2_DragonDojo: { x: 754, y: 34, w: 156, h: 96, terrain: 'ridge', route: 12 },
  GodotMapV2_ChampionTower: { x: 938, y: 34, w: 156, h: 96, terrain: 'champion', route: 13 }
})

export const FAST_TRAVEL_ROUTE_LINES = Object.freeze([
  [[222, 316], [270, 296]],
  [[420, 296], [430, 166]],
  [[420, 296], [440, 406]],
  [[580, 166], [610, 291]],
  [[590, 406], [610, 291]],
  [[760, 291], [780, 366]],
  [[770, 491], [780, 366]],
  [[930, 366], [905, 226]],
  [[930, 366], [910, 501]],
  [[982, 504], [190, 82]],
  [[190, 82], [404, 82]],
  [[404, 82], [618, 82]],
  [[618, 82], [832, 82]],
  [[832, 82], [1016, 82]]
])

export function getFastTravelStation(mapName) {
  return FAST_TRAVEL_STATIONS[mapName] || null
}

export function getFastTravelStationMeta(mapName) {
  return FAST_TRAVEL_STATION_META[mapName] || null
}

export function getFastTravelLayout(mapName) {
  return FAST_TRAVEL_WORLD_LAYOUT[mapName] || null
}
