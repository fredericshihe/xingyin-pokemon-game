import React from 'react'
import { getPokemonReleaseQuote, POKEMON_RELEASE_WARNING } from '../../utils/pokemonRelease'
import { handlePokemonImageError } from '../../utils/localAssetPreloader'
import './pokemonRelease.css'

export default function PokemonReleaseSummary({ monster }) {
  const quote = getPokemonReleaseQuote(monster)
  if (!quote) return <p role="alert">无法确认补偿，请重新读取进度。</p>
  return <div className="pokemon-release-summary" data-rarity={quote.rarity}>
    <div className="pokemon-release-summary__partner">
      <img src={monster.sprite} onError={handlePokemonImageError} alt={quote.name} />
      <div><strong>{quote.name}</strong><span>Lv.{quote.level} <b>{quote.rarityLabel}</b></span></div>
    </div>
    <div className="pokemon-release-summary__coins">
      <span>本次获得</span>
      <strong><i className="fa-solid fa-coins" aria-hidden="true" /> +{quote.gold.toLocaleString('zh-CN')}</strong>
      <span>金币</span>
    </div>
    {quote.precious && <p className="pokemon-release-summary__rare">这只伙伴很难获得，请谨慎放生。</p>}
    <p className="pokemon-release-summary__warning">{POKEMON_RELEASE_WARNING}</p>
  </div>
}
