import React, { useMemo, useRef, useState } from 'react'
import { BattleScene } from '../components/Game/OriginalGame'
import { MONSTERS, MOVES } from '../utils/gameData'
import { getMoveEffectConfig } from '../utils/moveVisuals'
import { buildBattleImpactFeedback, getBattleCinematicProfile } from '../utils/battleCinematics'
import { getBattleMoveImpactDelay } from '../utils/battlePacing'
import { createBattleVisualSession } from '../utils/battleVisualPlayback'
import { calculateStatsForLevel } from '../utils/pokemonStats'

// The existing development-only lab mounts the real battle component with local
// fixtures. No player account, saved roster or cloud RPC is used by this preview.
const fixture = (dex, id) => {
  const base = MONSTERS.find(mon => mon.pokedexId === dex)
  const stats = base.stats
  const scaled = calculateStatsForLevel(stats ? { maxHp: stats.hp, maxMp: Math.floor((stats.sp_attack || 50) * .8) + 20,
    atk: stats.attack, def: stats.defense, spAtk: stats.sp_attack, spDef: stats.sp_defense, spd: stats.speed } : base, 50)
  return { ...base, ...scaled, id, baseId: base.id, level: 50, currentHp: scaled.maxHp - 20, currentMp: scaled.maxMp,
    currentExp: 50, expToNextLevel: 200, moves: ['flamethrower', 'thunderbolt', 'surf', 'recover'] }
}
const noop = () => {}

export default function BattleScenePreview() {
  const [moveKey, setMoveKey] = useState(() => {
    const key = new URLSearchParams(location.search).get('move')
    return MOVES[key] ? key : 'flamethrower'
  })
  const [side, setSide] = useState('player')
  const [phase, setPhase] = useState('hit')
  const [event, setEvent] = useState(null)
  const [log, setLog] = useState('选择招式，验证正式战斗场景。')
  const started = useRef(0)
  const impactAt = useRef(0)
  const [playbackState, setPlaybackState] = useState('idle')
  const player = useMemo(() => fixture(25, 'preview-player'), [])
  const [enemy, setEnemy] = useState(() => fixture(150, 'preview-enemy'))
  const play = (key = moveKey) => {
    const move = MOVES[key]
    const config = getMoveEffectConfig(key, move)
    const profile = getBattleCinematicProfile(key, move, config, { phase })
    const targetSide = config.target === 'self' ? side : side === 'player' ? 'enemy' : 'player'
    const feedback = phase === 'hit' && move.category !== 'status'
      ? buildBattleImpactFeedback({ damage: 37, targetSide, moveType: move.type, intensity: profile.intensity })
      : null
    started.current = performance.now()
    impactAt.current = 0
    setEnemy(current => ({ ...current, currentHp: current.maxHp - 20 }))
    setPlaybackState('preparing')
    const playback = createBattleVisualSession({ onImpact: () => {
      impactAt.current = performance.now()
      if (feedback && targetSide === 'enemy') setEnemy(current => ({ ...current, currentHp: current.maxHp - 57 }))
      setPlaybackState('impact')
    } })
    void playback.finished.then(() => setPlaybackState('complete'), () => setPlaybackState('cancelled'))
    setEvent({ id: `preview-${started.current}`, moveKey: key, move, attackerSide: side,
      targetSide, phase, durationMs: profile.durationMs, profile, feedback, playback })
    setLog(`${side === 'player' ? player.name : enemy.name}使用了${move.name}！`)
  }
  return <main data-battle-scene-preview="ready" data-battle-vfx-lab="actual" data-started={started.current}
    data-playback-state={playbackState} data-impact-at={impactAt.current} data-enemy-hp={enemy.currentHp}
    data-initial-enemy-hp={enemy.maxHp - 20}
    data-impact-delay={event ? getBattleMoveImpactDelay(event.phase, event.durationMs) : 0}
    data-duration={event?.durationMs || 0} style={{ background: '#091627', height: '100dvh', display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', gap: 8, padding: 8, flexWrap: 'wrap' }}>
      <select aria-label="预览技能" value={moveKey} onChange={e => setMoveKey(e.target.value)}>
        {Object.entries(MOVES).map(([key, move]) => <option key={key} value={key}>{move.name}</option>)}
      </select>
      <select aria-label="预览攻击方" value={side} onChange={e => setSide(e.target.value)}><option value="player">我方</option><option value="enemy">敌方</option></select>
      <select aria-label="预览阶段" value={phase} onChange={e => setPhase(e.target.value)}>
        {['hit', 'charge', 'miss', 'heal', 'status', 'drain', 'secondary'].map(value => <option key={value}>{value}</option>)}
      </select>
      <button data-play-actual onClick={() => play()} style={{ color: '#fff' }}>播放正式场景</button>
    </div>
    <div style={{ flex: '1 1 0%', minHeight: 0 }}>
      <BattleScene playerMon={player} enemyMon={enemy} logs={[log]} onMove={play} onSwitch={noop}
        turn="player" onNavigate={noop} playerGold={100} playerTeam={[player]} enemyTeam={[enemy]}
        playerInventory={{}} onUseItem={noop} onUsePotion={noop} onUseExpPotion={noop}
        onUseStatBoostItem={noop} addLog={noop} onRun={noop} onSurrender={noop}
        battlePhase="active" battleKind="wild" moveVisualEvent={event} />
    </div>
  </main>
}
