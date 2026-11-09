export const DYNAMAX_STAT_MULTIPLIERS = Object.freeze({ atk: 1.1, def: 1.1, spAtk: 1.1, spDef: 1.1, spd: 1.05 })
export const DYNAMAX_VISUAL_SCALE = 1.35
export const DYNAMAX_ANIMATION_MS = 1200

const hasHp = (mon) => Number(mon?.currentHp ?? mon?.maxHp ?? 0) > 0
export const isDynamaxed = (mon) => Boolean(mon?.volatileStatuses?.dynamaxActive && hasHp(mon))
export const getDynamaxStatMultiplier = (mon, stat) => isDynamaxed(mon) ? (DYNAMAX_STAT_MULTIPLIERS[stat] || 1) : 1
export const hasUsedDynamax = (team = []) => team.some((mon) => mon?.volatileStatuses?.dynamaxUsed)
export const activateDynamax = (mon) => ({
  ...mon, volatileStatuses: { ...mon.volatileStatuses, dynamaxActive: true, dynamaxUsed: true },
})
// Keep the once-per-battle marker after fainting, so healing or switching cannot buy another activation.
export const normalizeDynamaxRuntime = (mon) => mon?.volatileStatuses?.dynamaxActive && !hasHp(mon)
  ? { ...mon, volatileStatuses: { ...mon.volatileStatuses, dynamaxActive: false } }
  : mon
export const getDynamaxUseError = (snapshot = {}) => {
  if (!['battle', 'bag'].includes(snapshot.view) || !snapshot.activeEnemyId || snapshot.gameOver || snapshot.battlePhase !== 'active') return '极巨糖果只能在正式战斗中使用。'
  if (snapshot.turn !== 'player' || snapshot.pendingBattleSwitch) return '请等待你的行动回合。'
  const team = Array.isArray(snapshot.playerTeam) ? snapshot.playerTeam : []
  const mon = team.find((entry) => entry.id === snapshot.activePlayerId)
  if (!mon || !hasHp(mon)) return '请先派出可以战斗的宝可梦。'
  if (hasUsedDynamax(team)) return '本场战斗已经使用过极巨化。'
  if (mon.volatileStatuses?.chargingMove) return '蓄力招式完成后才能使用极巨糖果。'
  return ''
}
