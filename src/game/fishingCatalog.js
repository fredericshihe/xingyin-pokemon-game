import { assetUrl } from '../utils/assetUrl.js'

const sprite = (id) => assetUrl(`/assets/fishing/${id}.svg`)
export const FISHING_CATEGORY_IDS = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'legendary', 'treasure', 'junk'])
export const FISHING_TIER_IDS = Object.freeze(FISHING_CATEGORY_IDS.slice(0, 5))

export const FISHING_TIERS = Object.freeze({
  common: { label: '普通', width: 0.16, seconds: 1.4, color: '#8dc5a5' },
  uncommon: { label: '不常见', width: 0.13, seconds: 1.3, color: '#62c8ba' },
  rare: { label: '稀有', width: 0.09, seconds: 1.08, color: '#61aeea' },
  epic: { label: '珍稀', width: 0.0675, seconds: .99, color: '#b294ed' },
  legendary: { label: '传说', width: 0.0495, seconds: .9, color: '#e6bc67' }
})

export const FISHING_ROD = Object.freeze({
  id: 'fishing_rod', name: '旅行钓鱼竿', englishName: 'Travel Fishing Rod', price: 400, sprite: sprite('fishing_rod'),
  permanent: true, giftBaitId: 'common', giftBaitUses: 5,
  description: '购买一次永久拥有，可使用所有鱼饵，在开放的钓点垂钓。附赠普通鱼饵 5 次。'
})
export const FISHING_BASKET_SPRITE = sprite('fish_basket')

export const FISHING_BAITS = Object.freeze({
  common: { id: 'common', name: '普通蚯蚓饵', englishName: 'Common Worm Bait', price: 60, uses: 10,
    probabilities: [70, 23, 5, 0.5, 0, 1, 0.5], sprite: sprite('bait_common'),
    description: '一包可抛竿 10 次。价格实惠，适合浅滩与入门垂钓。' },
  aroma: { id: 'aroma', name: '香味谷物饵', englishName: 'Aromatic Grain Bait', price: 180, uses: 12,
    probabilities: [50, 31, 14, 2, 0.1, 2.4, 0.5], requiredMapId: 'GodotMapV2_MistLake', sprite: sprite('bait_aroma'),
    description: '一包可抛竿 12 次。更容易吸引不常见和稀有鱼获。' },
  pearl: { id: 'pearl', name: '珍珠诱鱼饵', englishName: 'Pearl Lure Bait', price: 350, uses: 10,
    probabilities: [28, 35, 26, 6, 0.3, 4.2, 0.5], requiredBossMapId: 'GodotMapV2_MistLake', sprite: sprite('bait_pearl'),
    description: '一包可抛竿 10 次。适合雾湖深水鱼、稀有虾蟹与沉水宝藏。' },
  starlight: { id: 'starlight', name: '星辉混合饵', englishName: 'Starlight Mixed Bait', price: 460, uses: 8,
    probabilities: [12, 29, 39, 13, 0.8, 5.7, 0.5], requiredMapId: 'GodotMapV2_PirateShore', sprite: sprite('bait_starlight'),
    description: '一包可抛竿 8 次。稀有与珍稀海货机会更高，适合宝藏收藏。' },
  secret: { id: 'secret', name: '深潮秘制饵', englishName: 'Deep Tide Secret Bait', price: 540, uses: 6,
    probabilities: [5, 17, 43, 27.5, 1.5, 5.5, 0.5], requiredBossMapId: 'GodotMapV2_PirateShore', sprite: sprite('bait_secret'),
    description: '一包可抛竿 6 次。专注珍稀与传说鱼获，需要准确收杆。' }
})
export const FISHING_BAIT_IDS = Object.freeze(Object.keys(FISHING_BAITS))

export const FISHING_SPOTS = Object.freeze({
  valley_shallows: { id: 'valley_shallows', name: '山谷浅滩', mapId: 'GodotMap', maxTier: 'uncommon', waterType: 'freshwater' },
  valley_pond: { id: 'valley_pond', name: '营地南池', mapId: 'GodotMap', maxTier: 'rare', waterType: 'freshwater' },
  lake_reeds: { id: 'lake_reeds', name: '西岸苇台', mapId: 'GodotMapV2_MistLake', maxTier: 'rare', waterType: 'freshwater' },
  lake_deep: { id: 'lake_deep', name: '雾湖深湾', mapId: 'GodotMapV2_MistLake', maxTier: 'legendary', requiredBossMapId: 'GodotMapV2_MistLake', waterType: 'freshwater' },
  shore_dock: { id: 'shore_dock', name: '贝壳码头', mapId: 'GodotMapV2_PirateShore', maxTier: 'epic', waterType: 'saltwater' },
  shipwreck_bay: { id: 'shipwreck_bay', name: '沉船外湾', mapId: 'GodotMapV2_PirateShore', maxTier: 'legendary', requiredBossMapId: 'GodotMapV2_PirateShore', waterType: 'saltwater' }
})

const SP = { S: 'valley_shallows', P: 'valley_pond', W: 'lake_reeds', D: 'lake_deep', H: 'shore_dock', B: 'shipwreck_bay' }
const spots = (codes) => codes.split('').map((code) => SP[code])
const ENGLISH_NAMES = Object.freeze({
  c01: 'Stone Moroko', c02: 'Young Crucian Carp', c03: 'Pond Loach', c04: 'Creek Shrimp', c05: 'River Crab',
  c06: 'Sardine', c07: 'Silver Anchovy', c08: 'Sand Shrimp', c09: 'Sand Crab', c10: 'Silverfin Minnow',
  u01: 'Greenback Carp', u02: 'Speckled Crucian Carp', u03: 'Ricefield Eel', u04: 'Bamboo-striped Bass',
  u05: 'River Prawn', u06: 'Green-shell River Crab', u07: 'Sea Bass', u08: 'Blue Mackerel', u09: 'Swimming Crab', u10: 'Tiger Prawn',
  r01: 'Mirror-scale Carp', r02: 'Spotted Mandarin Fish', r03: 'Mistlake Silver Eel', r04: 'Blue Crystal River Shrimp',
  r05: 'Crimson-shell River Crab', r06: 'Coral Grouper', r07: 'Silver-ring Sea Bream', r08: 'Moon-marked Sea Bass',
  r09: 'Snow-pattern Swimming Crab', r10: 'Crimson-tail Prawn',
  e01: 'Moonveil Eel', e02: 'Amethyst Crayfish', e03: 'Amber Giant Crab', e04: 'Jade Lobster',
  e05: 'Star-spotted Tuna', e06: 'Blue Lanternfish',
  l01: 'Mistlake Golden Carp King', l02: 'Starstream Silver Trout', l03: 'Tidal Crown Crab', l04: 'Shipwreck Rainbowfin',
  t01: 'Corroded Copper Coin', t02: 'Polished Rainbow Shell', t03: 'Lost Silver Jewelry', t04: 'White Pearl',
  t05: 'Sunken Ancient Coin', t06: "Captain's Pocket Watch", t07: 'Coral Treasure Casket', t08: 'Starlight Relic',
  j01: 'Old Boot', j02: 'Broken Fishhook', j03: 'Weed Tangle'
})
const entry = (id, name, kind, tier, price, codes, weightMin, weightMax, extra = {}) => ({
  id, name, englishName: ENGLISH_NAMES[id], kind, tier, ...(kind === 'treasure' ? {} : { price }), spotIds: spots(codes), weightMin, weightMax, sprite: sprite(id), ...extra
})

export const FISHING_CATCHES = Object.freeze(Object.fromEntries([
  entry('c01', '麦穗鱼', 'fish', 'common', 12, 'SPW', .03, .12),
  entry('c02', '小鲫鱼', 'fish', 'common', 16, 'PWD', .1, .5),
  entry('c03', '泥鳅', 'fish', 'common', 12, 'PW', .05, .2),
  entry('c04', '溪虾', 'shrimp', 'common', 14, 'SPW', .02, .06),
  entry('c05', '小河蟹', 'crab', 'common', 16, 'PWD', .1, .3),
  entry('c06', '沙丁鱼', 'fish', 'common', 14, 'HB', .08, .3),
  entry('c07', '银鳀鱼', 'fish', 'common', 10, 'HB', .03, .12),
  entry('c08', '沙虾', 'shrimp', 'common', 14, 'HB', .02, .08),
  entry('c09', '沙蟹', 'crab', 'common', 16, 'HB', .1, .35),
  entry('c10', '银鳍白条', 'fish', 'common', 14, 'SWD', .05, .25),
  entry('u01', '青背鲤', 'fish', 'uncommon', 38, 'PWD', .6, 3.5),
  entry('u02', '花纹鲫', 'fish', 'uncommon', 34, 'SPW', .3, 1.2),
  entry('u03', '黄鳝', 'fish', 'uncommon', 44, 'PWD', .15, .7),
  entry('u04', '竹纹鲈', 'fish', 'uncommon', 48, 'SWD', .4, 2.5),
  entry('u05', '大河虾', 'shrimp', 'uncommon', 38, 'SPW', .05, .15),
  entry('u06', '青壳河蟹', 'crab', 'uncommon', 50, 'PWD', .2, .8),
  entry('u07', '海鲈', 'fish', 'uncommon', 42, 'HB', .8, 4.0),
  entry('u08', '青花鲭', 'fish', 'uncommon', 38, 'HB', .2, 1.0),
  entry('u09', '梭子蟹', 'crab', 'uncommon', 54, 'HB', .3, 1.0),
  entry('u10', '斑节虾', 'shrimp', 'uncommon', 54, 'HB', .08, .25),
  entry('r01', '镜鳞鲤', 'fish', 'rare', 130, 'PWD', 1.2, 5.0),
  entry('r02', '斑点鳜', 'fish', 'rare', 140, 'WD', .6, 3.5),
  entry('r03', '雾湖银鳗', 'fish', 'rare', 160, 'D', .8, 4.0),
  entry('r04', '蓝晶河虾', 'shrimp', 'rare', 150, 'WD', .08, .3),
  entry('r05', '绯壳河蟹', 'crab', 'rare', 140, 'PD', .3, 1.2),
  entry('r06', '珊瑚石斑', 'fish', 'rare', 180, 'HB', 1.0, 7.0),
  entry('r07', '银环海鲷', 'fish', 'rare', 160, 'HB', .7, 4.0),
  entry('r08', '月纹海鲈', 'fish', 'rare', 150, 'HB', 1.0, 5.0),
  entry('r09', '雪纹梭蟹', 'crab', 'rare', 150, 'HB', .4, 1.4),
  entry('r10', '绯尾对虾', 'shrimp', 'rare', 160, 'HB', .08, .35),
  entry('e01', '月纱鳗', 'fish', 'epic', 400, 'D', 1.5, 6.0),
  entry('e02', '紫晶螯虾', 'shrimp', 'epic', 360, 'D', .12, .5),
  entry('e03', '琥珀巨蟹', 'crab', 'epic', 420, 'HB', 1.0, 3.0),
  entry('e04', '翡翠龙虾', 'shrimp', 'epic', 440, 'HB', .6, 2.5),
  entry('e05', '星斑金枪鱼', 'fish', 'epic', 460, 'HB', 6.0, 25.0),
  entry('e06', '幽蓝灯笼鱼', 'fish', 'epic', 400, 'B', .3, 1.8),
  entry('l01', '雾湖金鳞王', 'fish', 'legendary', 1000, 'D', 5.0, 15.0),
  entry('l02', '星河银鳟', 'fish', 'legendary', 1100, 'D', 2.0, 8.0),
  entry('l03', '潮汐皇冠蟹', 'crab', 'legendary', 1200, 'B', 2.0, 6.0),
  entry('l04', '沉船虹鳍鱼', 'fish', 'legendary', 1200, 'B', 1.5, 6.0),
  entry('t01', '锈蚀铜币', 'treasure', 'uncommon', null, 'SPWDHB', 0, 0, { minimumBaitId: 'common' }),
  entry('t02', '磨圆彩贝', 'treasure', 'uncommon', null, 'PWH', 0, 0, { minimumBaitId: 'common' }),
  entry('t03', '遗失银饰', 'treasure', 'rare', null, 'WDHB', 0, 0, { minimumBaitId: 'aroma' }),
  entry('t04', '白珍珠', 'treasure', 'rare', null, 'DHB', 0, 0, { minimumBaitId: 'aroma' }),
  entry('t05', '沉水古币', 'treasure', 'epic', null, 'DB', 0, 0, { minimumBaitId: 'pearl' }),
  entry('t06', '船长怀表', 'treasure', 'epic', null, 'B', 0, 0, { minimumBaitId: 'pearl' }),
  entry('t07', '珊瑚宝匣', 'treasure', 'legendary', null, 'B', 0, 0, { minimumBaitId: 'starlight' }),
  entry('t08', '星辉遗物', 'treasure', 'legendary', null, 'B', 0, 0, { minimumBaitId: 'secret' }),
  entry('j01', '旧靴子', 'junk', 'common', 2, 'SPWDHB', 0, 0),
  entry('j02', '断钩', 'junk', 'common', 3, 'SPWDHB', 0, 0),
  entry('j03', '水草团', 'junk', 'common', 1, 'SPWDHB', 0, 0)
].map((item) => [item.id, Object.freeze(item)])))

export const FISHING_MERCHANTS = Object.freeze({
  valley: { id: 'valley', name: '山谷渔夫·阿川', mapId: 'GodotMap', treasureIds: ['t01', 't02', 't03', 't04'] },
  lake: { id: 'lake', name: '雾湖鱼商·芦伯', mapId: 'GodotMapV2_MistLake', treasureIds: ['t01', 't02', 't03', 't04', 't05'] },
  shore: { id: 'shore', name: '海产商·贝露', mapId: 'GodotMapV2_PirateShore', treasureIds: ['t01', 't02', 't03', 't04', 't05', 't06', 't07', 't08'] }
})
