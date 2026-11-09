import { useEffect, useState } from 'react'
import { BATTLE_BACKGROUND_ASSETS } from '../../game/data/battleBackgroundAssets.generated.js'
import { BATTLE_BACKGROUNDS } from '../../game/data/battleBackgroundCatalog.js'
import { assetUrl } from '../../utils/assetUrl'
import { preloadImageAsset } from '../../utils/localAssetPreloader'
import './battleBackground.css'

export function getBattleBackgroundUrl(backgroundId) {
  const variants = BATTLE_BACKGROUND_ASSETS[backgroundId]
  if (!variants) return null
  const compact = typeof window !== 'undefined' && window.innerWidth <= 720
  return assetUrl(variants[compact ? 960 : 1536].path)
}

export async function preloadBattleBackgroundsForMap(mapName, shouldContinue = () => true) {
  // P1 warm-up is scoped to the current map and runs sequentially so it cannot
  // monopolize downloads needed by map models and combatant artwork.
  for (const background of Object.values(BATTLE_BACKGROUNDS)) {
    if (!shouldContinue()) return
    if (background.mapName !== mapName) continue
    const url = getBattleBackgroundUrl(background.id)
    if (url) await preloadImageAsset(url, { timeoutMs: 12000 })
  }
}

export function useBattleBackgroundPlate(backgroundId) {
  const url = getBattleBackgroundUrl(backgroundId)
  const [decodedUrl, setDecodedUrl] = useState(null)
  useEffect(() => {
    let cancelled = false
    if (url) {
      preloadImageAsset(url, { timeoutMs: 12000 }).then(result => {
        if (!cancelled) setDecodedUrl(result.ok ? url : null)
      })
    }
    return () => { cancelled = true }
  }, [url])
  return decodedUrl === url ? url : null
}

export default function BattleBackgroundPlate({ url, backgroundId }) {
  if (!url) return null
  return <img className="battle-background-plate" src={url} alt="" aria-hidden="true"
    data-background-id={backgroundId} decoding="async" draggable="false" />
}
