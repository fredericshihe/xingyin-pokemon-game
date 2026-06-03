import { assetUrl, versionedAssetUrl } from './assetUrl.js'

export const POKEMON_ART_DIR = '/assets/pokemon/official-artwork'
export const ITEM_ART_DIR = '/assets/items/official-artwork'
export const POKEMON_PLACEHOLDER_URL = assetUrl('/assets/pokemon/placeholder.svg')
const POKEMON_ART_VERSION = 'pokemon-art-20260601'
const ITEM_ART_VERSION = 'item-art-20260602-stones'

export function pokemonArtUrl(dexNo, format = 'webp') {
  const id = Math.trunc(Number(dexNo))
  if (!Number.isFinite(id) || id <= 0) return POKEMON_PLACEHOLDER_URL
  return versionedAssetUrl(`${POKEMON_ART_DIR}/${id}.${format}`, POKEMON_ART_VERSION)
}

export function pokemonArtPngUrl(dexNo) {
  return pokemonArtUrl(dexNo, 'png')
}

export function itemArtUrl(fileName, format = 'webp') {
  const base = String(fileName || '').replace(/\.(png|webp)$/i, '')
  if (!base) return ''
  return versionedAssetUrl(`${ITEM_ART_DIR}/${base}.${format}`, ITEM_ART_VERSION)
}

export function itemArtPngUrl(fileName) {
  return itemArtUrl(fileName, 'png')
}

export function toPngFallbackUrl(url) {
  if (typeof url !== 'string' || !url.includes('.webp')) return url
  return url.replace(/\.webp(\?.*)?$/i, '.png$1')
}

export function extractPokedexIdFromArtUrl(url) {
  if (typeof url !== 'string') return null
  const match = url.match(/\/official-artwork\/(\d+)\.(?:webp|png)(?:\?.*)?$/i)
  const id = match ? Number(match[1]) : null
  return Number.isFinite(id) && id > 0 ? id : null
}
