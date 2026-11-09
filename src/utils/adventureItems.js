import { assetUrl } from './assetUrl'

export const BATTLE_ITEMS = {
  dynamax_candy: {
    name: '极巨糖果', englishName: 'Dynamax Candy', price: 1000,
    sprite: assetUrl('/assets/items/dynamax-candy.svg'),
    description: '攻击、特攻、防御、特防都提升10%，速度提升5%。每场战斗只能用一次；宝可梦倒下或战斗结束后恢复原样。用了糖果还能马上出招。',
    shortEffect: '攻防更强、速度更快；用了还能出招',
  },
}
export const KEY_ITEMS = {
  bicycle: {
    name: '旅行自行车', englishName: 'Travel Bicycle', price: 2000, permanent: true,
    sprite: assetUrl('/assets/items/travel-bicycle.svg'),
    description: '买一次，以后都能骑。点击地图右侧的自行车按钮，移动速度提高60%；进入草丛会自动下车。',
    shortEffect: '买一次一直用 · 骑行快60%',
  },
  sports_car: {
    name: '旅行跑车', englishName: 'Travel Sports Car', price: 10000, permanent: true,
    sprite: assetUrl('/assets/items/travel-sports-car.svg'),
    description: '买一次，以后都能开。点击地图右侧的跑车按钮，移动速度变为步行的4倍；进入草丛会自动下车。',
    shortEffect: '买一次一直用 · 开车速度4倍',
  },
}
