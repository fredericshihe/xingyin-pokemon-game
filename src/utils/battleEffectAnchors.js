export const BATTLE_EFFECT_FALLBACK_ANCHORS = {
  enemy: { x: '74%', y: '31%' },
  player: { x: '25%', y: '69%' }
}

const toPercentAnchor = (stageRect, spriteRect, fallback) => {
  if (!stageRect?.width || !stageRect?.height || !spriteRect?.width || !spriteRect?.height) {
    return fallback
  }

  const centerX = spriteRect.left + spriteRect.width / 2 - stageRect.left
  const centerY = spriteRect.top + spriteRect.height / 2 - stageRect.top

  return {
    x: `${(centerX / stageRect.width) * 100}%`,
    y: `${(centerY / stageRect.height) * 100}%`
  }
}

/**
 * 读取战斗场景内双方宝可梦精灵中心点，供技能特效锚定。
 * 坐标系与 `.battle-move-effect`（absolute + inset:0）一致。
 */
export function measureBattleEffectAnchors(stageEl, playerAnchorEl, enemyAnchorEl) {
  if (!stageEl) {
    return { ...BATTLE_EFFECT_FALLBACK_ANCHORS }
  }

  const stageRect = stageEl.getBoundingClientRect()
  const readSide = (anchorEl, fallback) => {
    if (!anchorEl) return fallback
    const visualEl = anchorEl.querySelector?.('.relative') || anchorEl
    return toPercentAnchor(stageRect, visualEl.getBoundingClientRect(), fallback)
  }

  return {
    player: readSide(playerAnchorEl, BATTLE_EFFECT_FALLBACK_ANCHORS.player),
    enemy: readSide(enemyAnchorEl, BATTLE_EFFECT_FALLBACK_ANCHORS.enemy)
  }
}
