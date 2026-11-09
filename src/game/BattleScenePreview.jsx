import React, { useMemo, useRef, useState } from 'react'
import { BattleScene } from '../components/Game/OriginalGame'
import { MONSTERS, MOVES } from '../utils/gameData'
import { getMoveEffectConfig } from '../utils/moveVisuals'
import { buildBattleImpactFeedback, getBattleCinematicProfile } from '../utils/battleCinematics'
import { getBattleMoveImpactDelay } from '../utils/battlePacing'
import { createBattleVisualSession } from '../utils/battleVisualPlayback'
import { calculateStatsForLevel } from '../utils/pokemonStats'
import { BATTLE_BACKGROUNDS, snapshotBattleOpponent } from './data/battleBackgroundCatalog.js'
import { getMapInfo } from './data/mapCatalog.js'

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
  const query = new URLSearchParams(location.search)
  const [backgroundId, setBackgroundId] = useState(() => BATTLE_BACKGROUNDS[query.get('background')] ? query.get('background') : 'valley-meadow')
  const [battleMode, setBattleMode] = useState(() => query.get('mode') || 'wild')
  const [moveKey, setMoveKey] = useState(() => {
    const key = new URLSearchParams(location.search).get('move')
    return MOVES[key] ? key : 'flamethrower'
  })
  const [side, setSide] = useState('player')
  const [phase, setPhase] = useState('hit')
  const [resultMode, setResultMode] = useState('applied')
  const [event, setEvent] = useState(null)
  const [log, setLog] = useState('选择招式，验证正式战斗场景。')
  const started = useRef(0)
  const impactAt = useRef(0)
  const [playbackState, setPlaybackState] = useState('idle')
  const [hitChoice, setHitChoice] = useState('min')
  const [completedHits, setCompletedHits] = useState(0)
  const sequence = useRef(0)
  const player = useMemo(() => fixture(25, 'preview-player'), [])
  const [enemy, setEnemy] = useState(() => fixture(Number(query.get('opponent')) || 150, 'preview-enemy'))
  const trainer = battleMode !== 'wild' && battleMode !== 'rare'
  const introEvent = query.get('event') ? getMapInfo(query.get('map') || 'GodotMapV2_PirateShore').runtimeEvents.find(event => event.id === query.get('event')) : null
  const showIntro = query.get('intro') === '1' && trainer
  const environment = useMemo(() => ({
    backgroundId,
    mapName: introEvent ? query.get('map') || 'GodotMapV2_PirateShore' : BATTLE_BACKGROUNDS[backgroundId].mapName,
    eventId: introEvent?.id,
    eventName: introEvent?.properties.name,
    characterModel: introEvent?.properties.characterModel,
    battleKind: trainer ? 'trainer' : 'wild',
    eventRole: introEvent?.properties.role || (['boss', 'challenge'].includes(battleMode) ? battleMode : trainer ? 'normal' : 'wild'),
    encounterRarity: battleMode === 'rare' ? { tier: 'mythic', isExciting: true } : null,
    timberLeague: battleMode === 'league' ? { routeKey: 'steady', stage: 1 } : null,
    opponentSnapshot: snapshotBattleOpponent([enemy]),
  }), [backgroundId, battleMode, trainer, enemy.type, enemy.type2, enemy.pokedexId])
  const play = async (key = moveKey) => {
    const token = ++sequence.current
    const move = MOVES[key]
    const config = getMoveEffectConfig(key, move)
    const hitCount = phase === 'hit' ? Number(move.multiHit?.[hitChoice]) || 1 : 1
    const targetSide = move.category === 'status' && config.target === 'self' || ['charge','heal','drain'].includes(phase) ? side : side === 'player' ? 'enemy' : 'player'
    const stat = move.statChange || move.statChanges?.[0]
    const visualResult = !['status', 'secondary'].includes(phase) ? null : resultMode === 'blocked' ? { kind: 'blocked' }
      : move.status || move.volatileStatus ? { kind: 'status', status: move.status || move.volatileStatus }
        : stat ? { kind: 'stat', stat: stat.stat, stages: stat.stages }
          : ['heal', 'drain'].includes(move.effect) ? { kind: 'heal' } : null
    started.current = performance.now()
    impactAt.current = 0
    setCompletedHits(0)
    setEnemy(current => ({ ...current, currentHp: current.maxHp - 20 }))
    setPlaybackState('preparing')
    setLog(`${side === 'player' ? player.name : enemy.name}使用了${move.name}！`)
    for(let hitIndex=0;hitIndex<hitCount;hitIndex++) {
      if(sequence.current!==token)return
      const profile = getBattleCinematicProfile(key, move, config, { phase, hitCount, hitIndex })
      const feedback = phase === 'hit' && move.category !== 'status'
        ? buildBattleImpactFeedback({ damage: Math.round(37/hitCount), targetSide, moveType: move.type, intensity: profile.intensity, hitIndex, hitCount }) : null
      const playback = createBattleVisualSession({ onImpact: () => {
        impactAt.current = performance.now()
        setCompletedHits(hitIndex+1)
        if (feedback && targetSide === 'enemy') setEnemy(current => ({ ...current, currentHp: current.maxHp - 20 - Math.round(37*(hitIndex+1)/hitCount) }))
        setPlaybackState('impact')
      } })
      setEvent({ id: `preview-${started.current}-${hitIndex}`, moveKey: key, move, attackerSide: side,
        targetSide, phase, durationMs: profile.durationMs, profile, feedback, playback, visualResult, suppressActorMotion: hitIndex>0 })
      try { await playback.finished } catch { if(sequence.current===token)setPlaybackState('cancelled');return }
    }
    if(sequence.current===token)setPlaybackState('complete')
  }
  return <main data-battle-scene-preview="ready" data-battle-vfx-lab="actual" data-started={started.current}
    data-playback-state={playbackState} data-impact-at={impactAt.current} data-enemy-hp={enemy.currentHp}
    data-initial-enemy-hp={enemy.maxHp - 20}
    data-completed-hits={completedHits} data-hit-count={event?.profile?.hitCount || 1}
    data-impact-delay={event ? getBattleMoveImpactDelay(event.phase, event.durationMs) : 0}
    data-duration={event?.durationMs || 0} style={{ background: '#091627', height: '100dvh', display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', gap: 8, padding: 8, flexWrap: 'wrap' }}>
      <select aria-label="预览地点" value={backgroundId} onChange={e => setBackgroundId(e.target.value)}>
        {Object.values(BATTLE_BACKGROUNDS).map(bg => <option key={bg.id} value={bg.id}>{bg.label}</option>)}
      </select>
      <select aria-label="预览玩法" value={battleMode} onChange={e => setBattleMode(e.target.value)}>
        {[['wild', '野生'], ['rare', '稀有遭遇'], ['trainer', '训练家'], ['boss', '首领'], ['challenge', '试炼'], ['league', '训练联赛']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <select aria-label="预览对手" value={enemy.pokedexId} onChange={e => setEnemy(fixture(Number(e.target.value), 'preview-enemy'))}>
        {[4, 7, 25, 94, 131, 149, 150, 208].map(dex => <option key={dex} value={dex}>{MONSTERS.find(mon => mon.pokedexId === dex).name}</option>)}
      </select>
      <select aria-label="预览技能" value={moveKey} onChange={e => setMoveKey(e.target.value)}>
        {Object.entries(MOVES).map(([key, move]) => <option key={key} value={key}>{move.name}</option>)}
      </select>
      <select aria-label="预览攻击方" value={side} onChange={e => setSide(e.target.value)}><option value="player">我方</option><option value="enemy">敌方</option></select>
      <select aria-label="预览阶段" value={phase} onChange={e => setPhase(e.target.value)}>
        {['hit', 'charge', 'miss', 'heal', 'status', 'drain', 'secondary'].map(value => <option key={value}>{value}</option>)}
      </select>
      <select aria-label="预览效果结果" value={resultMode} onChange={e => setResultMode(e.target.value)}>
        <option value="applied">效果生效</option><option value="blocked">免疫／已存在</option>
      </select>
      <select aria-label="预览连击次数" value={hitChoice} onChange={e => setHitChoice(e.target.value)}><option value="min">最少连击</option><option value="max">最多连击</option></select>
      <button data-play-actual onClick={() => play()} style={{ color: '#fff' }}>播放正式场景</button>
    </div>
    <div style={{ flex: '1 1 0%', minHeight: 0 }}>
      <BattleScene playerMon={player} enemyMon={enemy} logs={[log]} onMove={play} onSwitch={noop}
        turn="player" onNavigate={noop} playerGold={100} playerTeam={[player]} enemyTeam={[enemy]}
        playerInventory={{}} onUseItem={noop} onUsePotion={noop} onUseExpPotion={noop}
        onUseStatBoostItem={noop} addLog={noop} onRun={noop} onSurrender={noop}
        battlePhase={showIntro ? 'intro' : 'active'} openingIntro={showIntro} onOpeningIntroComplete={noop} battleKind={trainer ? 'trainer' : 'wild'} moveVisualEvent={event}
        battleEnvironment={environment} />
    </div>
  </main>
}
