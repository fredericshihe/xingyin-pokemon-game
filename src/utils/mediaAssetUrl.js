import { assetUrl } from './assetUrl.js'

export const POKEMON_ART_DIR = '/assets/pokemon/official-artwork'
export const ITEM_ART_DIR = '/assets/items/official-artwork'
export const POKEMON_PLACEHOLDER_URL = assetUrl('/assets/pokemon/placeholder.svg')

export function pokemonArtUrl(dexNo, format = 'webp') {
  const id = Math.trunc(Number(dexNo))
  if (!Number.isFinite(id) || id <= 0) return POKEMON_PLACEHOLDER_URL
  return assetUrl(`${POKEMON_ART_DIR}/${id}.${format}`)
}

export function pokemonArtPngUrl(dexNo) {
  return pokemonArtUrl(dexNo, 'png')
}

export function itemArtUrl(fileName, format = 'webp') {
  const base = String(fileName || '').replace(/\.(png|webp)$/i, '')
  if (!base) return ''
  return assetUrl(`${ITEM_ART_DIR}/${base}.${format}`)
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
