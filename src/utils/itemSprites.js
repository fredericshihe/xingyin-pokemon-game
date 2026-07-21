import { itemArtUrl } from './mediaAssetUrl.js'
import { assetUrl } from './assetUrl.js'

export const ITEM_ARTWORK_DIR = assetUrl('/assets/items/official-artwork')

/** 下载后长边目标像素（宝可梦立绘约 475px，道具插画源图较小，放大后供 UI 缩放） */
export const ITEM_ARTWORK_TARGET_MAX = 384

export const itemSprite = (fileName) => itemArtUrl(fileName)

/**
 * 本地文件名 → PokeAPI dream-world 道具 slug（矢量插画，非像素图标）
 * @see https://github.com/PokeAPI/sprites/tree/master/sprites/items/dream-world
 */
export const ITEM_ARTWORK_SLUGS = {
  'poke-ball.png': 'poke-ball',
  'great-ball.png': 'great-ball',
  'ultra-ball.png': 'ultra-ball',
  'master-ball.png': 'master-ball',
  'potion.png': 'potion',
  'super-potion.png': 'super-potion',
  'hyper-potion.png': 'hyper-potion',
  'max-potion.png': 'max-potion',
  'exp-potion-small.png': 'ether',
  'exp-potion-medium.png': 'exp-share',
  'exp-potion-large.png': 'star-piece',
  'rare-candy.png': 'rare-candy',
  'water-stone.png': 'water-stone',
  'thunder-stone.png': 'thunder-stone',
  'fire-stone.png': 'fire-stone',
  'leaf-stone.png': 'leaf-stone',
  'ice-stone.png': 'never-melt-ice',
  'moon-stone.png': 'moon-stone',
  'black-augurite.png': 'kings-rock',
  'hp-stone.png': 'sun-stone',
  'attack-stone.png': 'hard-stone',
  'defense-stone.png': 'everstone',
  'sp-attack-stone.png': 'shiny-stone',
  'sp-defense-stone.png': 'dawn-stone',
  'speed-stone.png': 'dusk-stone',
  'dragon-scale.png': 'dragon-scale',
  'magmarizer.png': 'magmarizer',
  'electirizer.png': 'electirizer',
  'protector.png': 'protector',
  'up-grade.png': 'up-grade',
  'dubious-disc.png': 'dubious-disc',
  'oval-stone.png': 'oval-stone',
}

export const getAllItemSpritePaths = () => (
  Object.keys(ITEM_ARTWORK_SLUGS).map((fileName) => itemSprite(fileName))
)

/** @deprecated 旧像素图目录，仅兼容引用 */
export const ITEM_SPRITE_DIR = ITEM_ARTWORK_DIR
