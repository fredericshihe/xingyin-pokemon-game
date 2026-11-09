import { useEffect, useState } from 'react'
import { getCharacterPortraitDataUrl, resolveBattleCharacterModel } from '../../game/characterPortrait.js'
import { preloadModelKeysStrict } from '../../game/threeLowPolyModelCache.js'

export default function NpcBattlePortrait({ environment, name }) {
  const key = resolveBattleCharacterModel(environment)
  const [portrait, setPortrait] = useState(() => ({ key, url: getCharacterPortraitDataUrl(key) }))
  useEffect(() => {
    let cancelled = false
    const cached = getCharacterPortraitDataUrl(key)
    if (cached) { setPortrait({ key, url: cached }); return }
    setPortrait({ key, url: null })
    preloadModelKeysStrict([key], { allowMissingPlaceholder: false, retries: 1, maxRounds: 2, shouldContinue: () => !cancelled })
      .then(result => { if (!cancelled && result.ok) setPortrait({ key, url: getCharacterPortraitDataUrl(key) }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [key])
  return portrait.key === key && portrait.url
    ? <img src={portrait.url} alt={name} data-character-model-key={key} loading="eager" decoding="sync" draggable="false" />
    : <span className="battle-intro-portrait-loading" data-character-model-key={key}>正在准备对手形象…</span>
}
