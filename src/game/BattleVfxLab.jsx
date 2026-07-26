import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '../game.css'
import BattleMoveEffect, { BattleImpactFeedback } from '../components/Game/BattleMoveEffect'
import { MOVES } from '../utils/gameData'
import { getMoveEffectConfig } from '../utils/moveVisuals'
import { buildBattleImpactFeedback, getBattleCinematicProfile } from '../utils/battleCinematics'
import { getBattleMoveImpactDelay } from '../utils/battlePacing'
import { pokemonArtPngUrl, pokemonArtUrl } from '../utils/mediaAssetUrl'

const LAB_ANCHORS = {
  player: { x: '24%', y: '69%' },
  enemy: { x: '76%', y: '34%' },
}

const FEATURED_MOVES = [
  'solar_beam', 'hyper_beam', 'thunder', 'earthquake', 'surf', 'hydropump',
  'blizzard', 'fire_blast', 'psychic', 'dream_eater', 'future_sight',
  'brave_bird', 'sky_attack', 'self_destruct', 'explosion', 'dragon_claw',
  'shadow_ball', 'rock_slide', 'fury_attack', 'double_kick',
].filter((moveKey) => MOVES[moveKey])

const getInitialMoveKey = () => {
  if (typeof window === 'undefined') return FEATURED_MOVES[0] || Object.keys(MOVES)[0]
  const requested = new URLSearchParams(window.location.search).get('move')
  return MOVES[requested] ? requested : FEATURED_MOVES[0] || Object.keys(MOVES)[0]
}

export default function BattleVfxLab() {
  const [moveKey, setMoveKey] = useState(getInitialMoveKey)
  const [phase, setPhase] = useState('hit')
  const [attackerSide, setAttackerSide] = useState('player')
  const [effect, setEffect] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [query, setQuery] = useState('')
  const replayTimerRef = useRef(null)
  const feedbackTimerRef = useRef(null)
  const move = MOVES[moveKey]
  const config = getMoveEffectConfig(moveKey, move)
  const profile = getBattleCinematicProfile(moveKey, move, config, { phase })
  const targetSide = config.target === 'self' ? attackerSide : attackerSide === 'player' ? 'enemy' : 'player'

  const moveOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const entries = Object.entries(MOVES)
    if (!normalizedQuery) {
      const featured = FEATURED_MOVES.map((key) => [key, MOVES[key]])
      const rest = entries.filter(([key]) => !FEATURED_MOVES.includes(key))
      return [...featured, ...rest]
    }
    return entries.filter(([key, value]) => (
      key.toLowerCase().includes(normalizedQuery)
      || String(value?.name || '').toLowerCase().includes(normalizedQuery)
    ))
  }, [query])

  const play = useCallback(() => {
    if (replayTimerRef.current) window.clearTimeout(replayTimerRef.current)
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    const currentMove = MOVES[moveKey]
    const currentConfig = getMoveEffectConfig(moveKey, currentMove)
    const currentProfile = getBattleCinematicProfile(moveKey, currentMove, currentConfig, { phase })
    const currentTargetSide = currentConfig.target === 'self'
      ? attackerSide
      : attackerSide === 'player' ? 'enemy' : 'player'
    const currentFeedback = phase === 'hit'
      ? buildBattleImpactFeedback({
        damage: Math.max(1, Math.round((Number(currentMove.power) || 50) * 0.72)),
        effectiveness: 2,
        crit: currentProfile.intensity === 'ultimate',
        targetSide: currentTargetSide,
        moveType: currentMove.type,
        intensity: currentProfile.intensity,
      })
      : null
    const id = `lab-${moveKey}-${phase}-${Date.now()}`
    setFeedback(null)
    setEffect({
      id,
      moveKey,
      move: currentMove,
      attackerSide,
      target: currentTargetSide,
      phase,
      durationMs: currentProfile.durationMs,
      anchors: LAB_ANCHORS,
      feedback: currentFeedback,
      profile: currentProfile,
    })
    if (currentFeedback) {
      feedbackTimerRef.current = window.setTimeout(() => {
        setFeedback({ ...currentFeedback, anchors: LAB_ANCHORS })
      }, getBattleMoveImpactDelay(phase, currentProfile.durationMs))
    }
    replayTimerRef.current = window.setTimeout(() => {
      setEffect(null)
      setFeedback(null)
    }, currentProfile.durationMs + 120)
  }, [attackerSide, moveKey, phase])

  useEffect(() => () => {
    if (replayTimerRef.current) window.clearTimeout(replayTimerRef.current)
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('autoplay') === '1') play()
  }, [play])

  const stageCinematicClass = effect
    ? `battle-cinematic battle-cinematic--${effect.profile.intensity} battle-cinematic--type-${move.type} battle-cinematic--scene-${effect.profile.sceneFx} battle-cinematic--camera-${effect.profile.cameraStrength} battle-cinematic--signature-camera-${Number(effect.profile.signatureStyle?.impactPattern) || 0} is-impact`
    : ''

  return (
    <main className="battle-vfx-lab" data-battle-vfx-lab="ready">
      <header className="battle-vfx-lab__header">
        <div>
          <span>BATTLE CINEMATIC LAB</span>
          <h1>战斗特效实验室</h1>
          <p>无需登录，逐个回放全部技能的动作、轨迹、命中和镜头表现。</p>
        </div>
        <div className="battle-vfx-lab__metrics">
          <strong>{Object.keys(MOVES).length}<small>技能</small></strong>
          <strong>{profile.intensity}<small>强度</small></strong>
          <strong>{profile.travel}<small>轨迹</small></strong>
        </div>
      </header>

      <section className={`battle-vfx-lab__stage anime-battle-bg battle-scene--meadow ${stageCinematicClass}`} data-active-move={moveKey} data-move-signature={config.signatureStyle?.id} data-effect-active={effect ? 'true' : 'false'}>
        <div className="battle-environment-props" aria-hidden="true"><span className="battle-env-prop battle-env-prop--horizon" /><span className="battle-env-prop battle-env-prop--foreground" /></div>
        <BattleMoveEffect effect={effect} onDone={() => setEffect(null)} />
        <BattleImpactFeedback feedback={feedback} anchors={LAB_ANCHORS} />
        <div className="battle-vfx-lab__mon battle-vfx-lab__mon--enemy">
          <img src={pokemonArtUrl(150)} onError={(event) => { event.currentTarget.src = pokemonArtPngUrl(150) }} alt="敌方宝可梦" />
        </div>
        <div className="battle-vfx-lab__mon battle-vfx-lab__mon--player">
          <img src={pokemonArtUrl(25)} onError={(event) => { event.currentTarget.src = pokemonArtPngUrl(25) }} alt="我方宝可梦" />
        </div>
        <div className="battle-vfx-lab__move-title">
          <span>{move.type} · {move.category}</span>
          <strong>{move.name}</strong>
          <small>{moveKey} · 威力 {move.power || '—'} · {config.visual}/{config.motion}/{config.hitReaction}</small>
        </div>
      </section>

      <section className="battle-vfx-lab__controls">
        <label>搜索技能<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="中文名或 move_key" /></label>
        <label>选择技能<select value={moveKey} onChange={(event) => setMoveKey(event.target.value)}>{moveOptions.map(([key, value]) => <option key={key} value={key}>{value.name} · {key}</option>)}</select></label>
        <label>阶段<select value={phase} onChange={(event) => setPhase(event.target.value)}><option value="charge">蓄力</option><option value="hit">命中</option><option value="status">状态</option><option value="miss">未命中</option></select></label>
        <label>攻击方<select value={attackerSide} onChange={(event) => setAttackerSide(event.target.value)}><option value="player">我方</option><option value="enemy">敌方</option></select></label>
        <button type="button" onClick={play}><i className="fa-solid fa-play" /> 播放演出</button>
      </section>

      <section className="battle-vfx-lab__profile">
        <article><span>视觉</span><b>{config.visual}</b></article>
        <article><span>攻击动作</span><b>{config.motion}</b></article>
        <article><span>受击</span><b>{config.hitReaction}</b></article>
        <article><span>场景</span><b>{profile.sceneFx}</b></article>
        <article><span>时长</span><b>{profile.durationMs}ms</b></article>
        <article><span>命中停顿</span><b>{profile.hitStopMs}ms</b></article>
        <article><span>独立签名</span><b>{config.signatureStyle?.id}</b></article>
      </section>
    </main>
  )
}
