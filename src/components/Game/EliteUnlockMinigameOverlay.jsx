import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gameAudio } from '../../utils/gameAudio'

const SYMBOLS = {
  crest: { glyph: '≋', name: '潮冠' },
  abyss: { glyph: '◆', name: '深渊' },
  shell: { glyph: '◉', name: '海螺' },
  moon: { glyph: '☾', name: '月湾' },
  violet: { glyph: '✦', name: '紫微' },
  cyan: { glyph: '✧', name: '青澜' },
  gold: { glyph: '✷', name: '金衡' },
  white: { glyph: '✥', name: '白曜' },
  red: { glyph: '✹', name: '赤灼' },
  blue: { glyph: '✺', name: '苍渊' },
  crown: { glyph: '♛', name: '王冠' },
  fang: { glyph: '◇', name: '牙' },
  wing: { glyph: '⌁', name: '翼' },
  flame: { glyph: '♨', name: '焰' }
}

const THEME_META = {
  tide: { icon: 'fa-water', eyebrow: '深潮试炼', accent: '潮汐机关台' },
  iron: { icon: 'fa-gears', eyebrow: '铁壁试炼', accent: '机械游戏台' },
  dragon: { icon: 'fa-dragon', eyebrow: '龙穹试炼', accent: '星穹机关台' }
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const arrayEquals = (left, right) => left.length === right.length && left.every((value, index) => value === right[index])
const TURN_DIRECTIONS = ['↑ 上', '→ 右', '↓ 下', '← 左']

function initialSession(task) {
  const game = task.minigame
  switch (game.kind) {
    case 'pressure_balance':
      return { pressure: game.start, moves: 0, hold: 0, message: '先看下一轮变化，再选一个按钮。' }
    case 'sonar_memory':
      return { phase: 'idle', lit: null, input: [], mistakes: 0, message: '先点播放，记住图案亮起的顺序。' }
    case 'vortex_rotation':
    case 'circuit_rotation':
    case 'resonance_tuning':
      return { values: [...game.start], moves: 0, message: '点击机关转动，观察画面中的提示。' }
    case 'forge_rhythm':
      return { round: 0, misses: 0, hits: [], cycleKey: 0, message: '白色游标进入绿色区域时，点击落锤。' }
    case 'armor_distribution':
      return { assignments: game.plates.map(() => -1), moves: 0, message: '点击装甲片，将它依次分配到甲、乙、丙墙。' }
    case 'constellation_path':
      return { path: [game.path[0]], mistakes: 0, message: '从紫微星出发，根据线索选择下一颗星。' }
    case 'rune_code':
      return { guess: game.target.map((_, index) => game.runes[index % game.runes.length]), attempts: [], message: '点击三个符文换图案，再提交答案。' }
    default:
      return { message: '机关已准备好，可以开始了。' }
  }
}

const MiniStatus = ({ solved, failed, message }) => (
  <div className={`elite-minigame-status${solved ? ' is-solved' : failed ? ' is-failed' : ''}`} role="status">
    <i className={`fa-solid ${solved ? 'fa-circle-check' : failed ? 'fa-triangle-exclamation' : 'fa-wave-square'}`} aria-hidden />
    <span>{message}</span>
  </div>
)

const SymbolButton = ({ symbol, active = false, disabled = false, onClick }) => {
  const meta = SYMBOLS[symbol] || { glyph: symbol, name: symbol }
  return (
    <button type="button" className={`elite-symbol-button${active ? ' is-active' : ''}`} disabled={disabled} onClick={onClick} aria-label={meta.name}>
      <span>{meta.glyph}</span>
      <small>{meta.name}</small>
    </button>
  )
}

export default function EliteUnlockMinigameOverlay({ task, busy = false, onCommit, onClose }) {
  const game = task?.minigame
  const theme = task?.theme || 'tide'
  const themeMeta = THEME_META[theme] || THEME_META.tide
  const [session, setSession] = useState(() => initialSession(task))
  const [solved, setSolved] = useState(false)
  const [failed, setFailed] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [commitError, setCommitError] = useState('')
  const playbackTimersRef = useRef([])
  const rhythmStartedAtRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now())
  const rhythmTrackRef = useRef(null)
  const rhythmMarkerRef = useRef(null)

  const clearPlayback = useCallback(() => {
    playbackTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    playbackTimersRef.current = []
  }, [])

  useEffect(() => clearPlayback, [clearPlayback])
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy && !confirmed) onClose?.()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, confirmed, onClose])

  const markSolved = useCallback((message = '小游戏完成，现在可以保存解锁结果。') => {
    setSolved(true)
    setFailed(false)
    setSession((current) => ({ ...current, message }))
    gameAudio.playUiConfirm()
  }, [])

  const markFailed = useCallback((message) => {
    setFailed(true)
    setSession((current) => ({ ...current, message }))
    gameAudio.playError()
  }, [])

  const restart = useCallback(() => {
    clearPlayback()
    setSession(initialSession(task))
    setSolved(false)
    setFailed(false)
    setConfirmed(false)
    setCommitError('')
    rhythmStartedAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now()
    gameAudio.playUiSelect()
  }, [clearPlayback, task])

  const commit = useCallback(async () => {
    if (!solved || busy || confirmed) return
    setCommitError('')
    const success = await onCommit?.(task.id)
    if (success) {
      setConfirmed(true)
      gameAudio.playUiConfirm()
    } else {
      setCommitError('这次没有保存成功，你的解题结果还在，可以直接再试。')
      gameAudio.playError()
    }
  }, [busy, confirmed, onCommit, solved, task.id])

  const pressureMove = (delta) => {
    if (solved || failed) return
    const drift = game.drift[session.moves % game.drift.length]
    const nextPressure = clamp(session.pressure + delta + drift, 0, 100)
    const nextMoves = session.moves + 1
    const stable = Math.abs(nextPressure - game.target) <= game.tolerance
    const nextHold = stable ? session.hold + 1 : 0
    const outOfRange = nextPressure <= 0 || nextPressure >= 100
    setSession({ pressure: nextPressure, moves: nextMoves, hold: nextHold, message: stable ? `进入绿色区！连续成功 ${nextHold}/${game.holdRounds}` : '还没进入绿色区，看看下一轮变化再试。' })
    gameAudio.playMapTouch({ kind: 'trial' })
    if (nextHold >= game.holdRounds) markSolved('水压连续 3 次停在绿色区域，成功！')
    else if (outOfRange || nextMoves >= game.maxMoves) markFailed(outOfRange ? '指针碰到边界了，点击重新挑战再试一次。' : '本轮按钮次数用完了，换一种顺序再试。')
  }

  const playSonar = () => {
    if (solved || session.phase === 'playing') return
    clearPlayback()
    setFailed(false)
    setSession((current) => ({ ...current, phase: 'playing', input: [], lit: null, message: '声呐播放中…' }))
    game.pattern.forEach((symbol, index) => {
      playbackTimersRef.current.push(window.setTimeout(() => {
        setSession((current) => ({ ...current, lit: symbol }))
        gameAudio.playMapTouch({ kind: 'trial' })
      }, 420 + index * 680))
      playbackTimersRef.current.push(window.setTimeout(() => {
        setSession((current) => ({ ...current, lit: null }))
      }, 790 + index * 680))
    })
    playbackTimersRef.current.push(window.setTimeout(() => {
      setSession((current) => ({ ...current, phase: 'input', lit: null, message: '轮到你了，请按顺序点击 5 个图案。' }))
    }, 420 + game.pattern.length * 680))
  }

  const inputSonar = (symbol) => {
    if (session.phase !== 'input' || solved || failed) return
    const index = session.input.length
    if (game.pattern[index] !== symbol) {
      const mistakes = session.mistakes + 1
      setSession((current) => ({ ...current, mistakes, input: [], phase: 'idle', message: `顺序不对，可以重新播放。剩余机会 ${Math.max(0, game.maxMistakes - mistakes)}。` }))
      if (mistakes >= game.maxMistakes) markFailed('这轮机会用完了，点击重新挑战会得到同一组顺序。')
      else gameAudio.playError()
      return
    }
    const input = [...session.input, symbol]
    setSession((current) => ({ ...current, input, message: `已按对 ${input.length}/${game.pattern.length} 个` }))
    gameAudio.playUiSelect()
    if (input.length === game.pattern.length) markSolved('5 个图案的顺序全部正确，成功！')
  }

  const rotateValue = (index) => {
    if (solved || failed) return
    const modulus = game.kind === 'resonance_tuning' ? game.levels : 4
    const values = session.values.map((value, valueIndex) => valueIndex === index ? (value + 1) % modulus : value)
    const moves = session.moves + 1
    const correctCount = values.filter((value, valueIndex) => value === game.target[valueIndex]).length
    setSession({ values, moves, message: game.kind === 'resonance_tuning' ? `已有 ${correctCount}/3 个旋钮对准。` : game.kind === 'circuit_rotation' ? `继续转动弯轨，已操作 ${moves}/${game.maxMoves} 次。` : `已有 ${correctCount}/3 层水环对准。` })
    gameAudio.playUiSelect()
    if (arrayEquals(values, game.target)) {
      markSolved(game.kind === 'resonance_tuning' ? '三个旋钮全部变绿，龙息机关对准成功！' : game.kind === 'circuit_rotation' ? '电流通过全部弯轨，成功到达出口！' : '三层箭头全部对准，漩涡机关稳定！')
    } else if (moves >= game.maxMoves) markFailed('本轮转动次数用完了，点击重新挑战再试。')
  }

  const strikeForge = () => {
    if (solved || failed) return
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const raw = ((now - rhythmStartedAtRef.current) % game.cycleMs) / game.cycleMs
    const fallbackPosition = raw <= 0.5 ? raw * 2 : (1 - raw) * 2
    const trackRect = rhythmTrackRef.current?.getBoundingClientRect?.()
    const markerRect = rhythmMarkerRef.current?.getBoundingClientRect?.()
    const visibleTravel = trackRect && markerRect ? trackRect.width - markerRect.width : 0
    const position = visibleTravel > 0
      ? clamp((markerRect.left - trackRect.left) / visibleTravel, 0, 1)
      : fallbackPosition
    const target = game.centers[session.round]
    const hit = Math.abs(position - target) <= game.tolerance
    if (hit) {
      const hits = [...session.hits, position]
      const nextRound = session.round + 1
      setSession((current) => ({ ...current, hits, round: nextRound, cycleKey: current.cycleKey + 1, message: `打中了！已命中 ${nextRound}/${game.centers.length}` }))
      rhythmStartedAtRef.current = now
      gameAudio.playMapTouch({ kind: 'trial' })
      if (nextRound >= game.centers.length) markSolved('三次都打中绿色区域，锻造完成！')
    } else {
      const misses = session.misses + 1
      setSession((current) => ({ ...current, misses, cycleKey: current.cycleKey + 1, message: `差一点！等白色游标进入绿色区再点。剩余机会 ${Math.max(0, game.maxMisses - misses)}。` }))
      rhythmStartedAtRef.current = now
      if (misses >= game.maxMisses) markFailed('这轮落锤机会用完了，点击重新挑战再试。')
      else gameAudio.playError()
    }
  }

  const assignPlate = (index) => {
    if (solved || failed) return
    const assignments = session.assignments.map((value, valueIndex) => valueIndex === index ? (value + 2) % 4 - 1 : value)
    const moves = session.moves + 1
    const sums = game.capacities.map((_, wall) => game.plates.reduce((sum, weight, plateIndex) => sum + (assignments[plateIndex] === wall ? weight : 0), 0))
    setSession({ assignments, moves, message: `当前总数：甲 ${sums[0]}/6，乙 ${sums[1]}/7，丙 ${sums[2]}/8。` })
    gameAudio.playUiSelect()
    if (arrayEquals(sums, game.capacities) && assignments.every((value) => value >= 0)) markSolved('三面墙的数字都刚刚好，装甲分配成功！')
    else if (moves >= game.maxMoves) markFailed('本轮分配次数用完了，点击重新挑战再组合。')
  }

  const chooseStar = (node) => {
    if (solved || failed) return
    const current = session.path.at(-1)
    if (node === current) return
    const linked = game.edges.some(([a, b]) => (a === current && b === node) || (a === node && b === current))
    const expected = game.path[session.path.length]
    if (!linked || node !== expected) {
      const mistakes = session.mistakes + 1
      if (mistakes >= game.maxMistakes) {
        markFailed('三颗星光都用完了，点击重新挑战再读一次线索。')
      } else {
        setSession((currentSession) => ({
          ...currentSession,
          path: [game.path[0]],
          mistakes,
          message: `${!linked ? '这两颗星之间没有连线。' : '这条路不符合线索。'}已回到起点，还剩 ${game.maxMistakes - mistakes} 颗星光。`
        }))
        gameAudio.playError()
      }
      return
    }
    const path = [...session.path, node]
    setSession((currentSession) => ({ ...currentSession, path, message: `安全航路 ${path.length}/${game.path.length}` }))
    gameAudio.playUiSelect()
    if (path.length === game.path.length) markSolved('星光抵达王冠，唯一安全航路已经绘成。')
  }

  const cycleRune = (index) => {
    if (solved || failed) return
    const current = session.guess[index]
    const next = game.runes[(game.runes.indexOf(current) + 1) % game.runes.length]
    setSession((value) => ({ ...value, guess: value.guess.map((rune, runeIndex) => runeIndex === index ? next : rune) }))
    gameAudio.playUiSelect()
  }

  const submitRunes = () => {
    if (solved || failed) return
    const exact = session.guess.filter((value, index) => value === game.target[index]).length
    const total = game.runes.reduce((count, rune) => count + Math.min(session.guess.filter((value) => value === rune).length, game.target.filter((value) => value === rune).length), 0)
    const attempt = { guess: [...session.guess], exact, displaced: total - exact }
    const attempts = [...session.attempts, attempt]
    setSession((current) => ({ ...current, attempts, message: `位置正确 ${exact} 个；图案正确但位置不对 ${total - exact} 个。` }))
    if (exact === game.target.length) markSolved('三个符文的图案和位置全部正确，符文锁打开了！')
    else if (attempts.length >= game.maxAttempts) markFailed('六次机会用完了，点击重新挑战再来一轮。')
    else gameAudio.playMapTouch({ kind: 'trial' })
  }

  const board = useMemo(() => {
    if (!game) return null
    if (game.kind === 'pressure_balance') {
      const drift = game.drift[session.moves % game.drift.length]
      const previewPressure = (delta) => clamp(session.pressure + delta + drift, 0, 100)
      return <div className="elite-pressure-board">
        <div className="elite-pressure-readout"><span>现在的水压</span><strong>{session.pressure}</strong><small>绿色目标 {game.target - game.tolerance}–{game.target + game.tolerance}</small></div>
        <div className="elite-pressure-gauge"><span className="elite-pressure-gauge__safe" style={{ left: `${game.target - game.tolerance}%`, width: `${game.tolerance * 2}%` }} /><i style={{ left: `${session.pressure}%` }} /></div>
        <div className="elite-pressure-actions">
          <div><span>下一轮变化</span><strong>{drift >= 0 ? '+' : ''}{drift}</strong><small>连续成功 {session.hold}/{game.holdRounds}</small></div>
          <button type="button" onClick={() => pressureMove(game.intake)} disabled={solved || failed}><i className="fa-solid fa-arrow-up" /><span>进水</span><small>会到 {previewPressure(game.intake)}</small></button>
          <button type="button" onClick={() => pressureMove(0)} disabled={solved || failed}><i className="fa-solid fa-pause" /><span>稳流</span><small>会到 {previewPressure(0)}</small></button>
          <button type="button" onClick={() => pressureMove(game.release)} disabled={solved || failed}><i className="fa-solid fa-arrow-down" /><span>泄压</span><small>会到 {previewPressure(game.release)}</small></button>
        </div>
      </div>
    }
    if (game.kind === 'sonar_memory') {
      const symbols = ['crest', 'abyss', 'shell', 'moon']
      return <div className="elite-sonar-board">
        <div className={`elite-sonar-orb${session.phase === 'playing' ? ' is-playing' : ''}`}><span>{session.lit ? SYMBOLS[session.lit].glyph : '∿'}</span><small>{session.phase === 'playing' ? '播放图案' : session.phase === 'input' ? '请按顺序点击' : '等待播放'}</small></div>
        <div className="elite-symbol-grid">{symbols.map((symbol) => <SymbolButton key={symbol} symbol={symbol} active={session.lit === symbol} disabled={session.phase !== 'input' || solved || failed} onClick={() => inputSonar(symbol)} />)}</div>
        <button type="button" className="elite-minigame-secondary" disabled={session.phase === 'playing' || solved} onClick={playSonar}><i className="fa-solid fa-play" />{session.phase === 'idle' ? '播放声呐' : '重新播放'}</button>
      </div>
    }
    if (game.kind === 'vortex_rotation') {
      return <div className="elite-vortex-wrap"><div className="elite-vortex-board">{session.values.map((value, index) => <div className={`elite-vortex-ring elite-vortex-ring--${index + 1}${value === game.target[index] ? ' is-aligned' : ''}`} style={{ '--ring-turn': `${value * 90}deg` }} key={index}><button type="button" aria-label={`转动${['外环', '内环', '核心'][index]}，当前${TURN_DIRECTIONS[value]}`} onClick={() => rotateValue(index)} disabled={solved || failed}><span>↑</span></button></div>)}</div><div className="elite-vortex-targets">{game.target.map((target, index) => <span className={session.values[index] === target ? 'is-aligned' : ''} key={index}><strong>{['外环', '内环', '核心'][index]}</strong><small>目标 {TURN_DIRECTIONS[target]}</small><i className={`fa-solid ${session.values[index] === target ? 'fa-circle-check' : 'fa-rotate'}`} /></span>)}</div><div className="elite-board-counter">转动 {session.moves}/{game.maxMoves}</div></div>
    }
    if (game.kind === 'forge_rhythm') {
      const center = game.centers[Math.min(session.round, game.centers.length - 1)]
      return <div className="elite-forge-board">
        <div className="elite-forge-flame"><i className="fa-solid fa-fire-flame-curved" /><span>锻次 {Math.min(session.round + 1, game.centers.length)}/{game.centers.length}</span></div>
        <div ref={rhythmTrackRef} className="elite-rhythm-track" style={{ '--cycle-ms': `${game.cycleMs / 2}ms` }} key={session.cycleKey}><span className="elite-rhythm-zone" style={{ left: `${(center - game.tolerance) * 100}%`, width: `${game.tolerance * 200}%` }} /><i ref={rhythmMarkerRef} /></div>
        <button type="button" className="elite-strike-button" onClick={strikeForge} disabled={solved || failed}><i className="fa-solid fa-hammer" />精准落锤</button>
        <div className="elite-forge-marks"><span>命中 {session.hits.length}</span><span>失误 {session.misses}/{game.maxMisses}</span></div>
      </div>
    }
    if (game.kind === 'circuit_rotation') {
      const powered = new Set()
      for (const index of game.pathOrder) {
        if (session.values[index] !== game.target[index]) break
        powered.add(index)
      }
      return <div className="elite-circuit-board"><div className="elite-circuit-source"><i className="fa-solid fa-bolt" /><span>入口</span></div><div className="elite-circuit-grid">{session.values.map((rotation, index) => <button type="button" aria-label={`旋转第 ${index + 1} 块弯轨`} key={index} className={`elite-circuit-tile is-${game.shapes[index]}${powered.has(index) ? ' is-powered' : ''}`} style={{ '--tile-turn': `${rotation * 90}deg` }} onClick={() => rotateValue(index)} disabled={solved || failed}><span /><small>{powered.has(index) ? '已通电' : index + 1}</small></button>)}</div><div className={`elite-circuit-gate${powered.size === game.pathOrder.length ? ' is-powered' : ''}`}><i className="fa-solid fa-door-open" /><span>出口</span></div><div className="elite-board-counter">已通电 {powered.size}/6 · 旋转 {session.moves}/{game.maxMoves}</div></div>
    }
    if (game.kind === 'armor_distribution') {
      const sums = game.capacities.map((_, wall) => game.plates.reduce((sum, weight, index) => sum + (session.assignments[index] === wall ? weight : 0), 0))
      return <div className="elite-armor-board">
        <div className="elite-wall-grid">{game.capacities.map((capacity, index) => <div className={sums[index] === capacity ? 'is-balanced' : sums[index] > capacity ? 'is-over' : ''} key={capacity}><span>{['甲墙', '乙墙', '丙墙'][index]}</span><strong>{sums[index]} / {capacity}</strong><i style={{ '--load': `${Math.min(100, sums[index] / capacity * 100)}%` }} /></div>)}</div>
        <div className="elite-plate-grid">{game.plates.map((weight, index) => <button type="button" aria-label={`${weight} 号装甲，${session.assignments[index] < 0 ? '还未分配' : `现在在${['甲', '乙', '丙'][session.assignments[index]]}墙`}`} className={`assignment-${session.assignments[index]}`} key={weight} onClick={() => assignPlate(index)} disabled={solved || failed}><strong>{weight}</strong><small>{session.assignments[index] < 0 ? '未分配' : `${['甲', '乙', '丙'][session.assignments[index]]}墙`}</small></button>)}</div>
      </div>
    }
    if (game.kind === 'resonance_tuning') {
      return <div className="elite-resonance-board"><div className="elite-resonance-wave">{session.values.map((value, index) => { const distance = Math.min(Math.abs(value - game.target[index]), game.levels - Math.abs(value - game.target[index])); return <span className={distance === 0 ? 'is-perfect' : distance === 1 ? 'is-near' : ''} key={index} style={{ height: `${36 + (game.levels - distance) * 10}px` }} /> })}</div><div className="elite-dial-grid">{session.values.map((value, index) => { const distance = Math.min(Math.abs(value - game.target[index]), game.levels - Math.abs(value - game.target[index])); return <button type="button" aria-label={`第 ${index + 1} 个旋钮，${distance === 0 ? '已经对准' : distance === 1 ? '接近正确档位' : '偏离正确档位'}`} className={distance === 0 ? 'is-perfect' : distance === 1 ? 'is-near' : ''} key={index} onClick={() => rotateValue(index)} disabled={solved || failed} style={{ '--dial-turn': `${value * (360 / game.levels)}deg` }}><i /><strong>{value + 1}</strong><small>{distance === 0 ? '✓ 对准' : distance === 1 ? '接近' : '偏离'}</small></button> })}</div><div className="elite-board-counter">对准 {session.values.filter((value, index) => value === game.target[index]).length}/3 · 调整 {session.moves}/{game.maxMoves}</div></div>
    }
    if (game.kind === 'constellation_path') {
      const positions = { violet: [12, 72], red: [28, 24], gold: [34, 64], cyan: [53, 43], blue: [58, 78], white: [73, 28], crown: [88, 52] }
      return <div className="elite-star-board"><div className="elite-star-lives" aria-label={`剩余 ${game.maxMistakes - session.mistakes} 次机会`}><span>剩余星光</span>{Array.from({ length: game.maxMistakes }, (_, index) => <i className={`fa-solid fa-star${index < game.maxMistakes - session.mistakes ? '' : ' is-used'}`} key={index} />)}</div><div className="elite-star-clues"><span>① 紫微不走赤灼</span><span>② 金衡后面是青澜</span><span>③ 白曜之后到王冠</span><span>④ 不经过苍渊</span></div><div className="elite-star-field">{game.edges.map(([a, b]) => { const [ax, ay] = positions[a]; const [bx, by] = positions[b]; const length = Math.hypot(bx - ax, by - ay); const angle = Math.atan2(by - ay, bx - ax) * 180 / Math.PI; const active = session.path.some((node, index) => index > 0 && ((session.path[index - 1] === a && node === b) || (session.path[index - 1] === b && node === a))); return <i className={active ? 'is-active' : ''} key={`${a}-${b}`} style={{ left: `${ax}%`, top: `${ay}%`, width: `${length}%`, transform: `rotate(${angle}deg)` }} /> })}{game.nodes.map((node) => { const [x, y] = positions[node]; return <button type="button" aria-label={`${SYMBOLS[node].name}星`} className={session.path.includes(node) ? 'is-active' : ''} key={node} style={{ left: `${x}%`, top: `${y}%` }} onClick={() => chooseStar(node)} disabled={solved || failed}><span>{SYMBOLS[node].glyph}</span><small>{SYMBOLS[node].name}</small></button> })}</div></div>
    }
    if (game.kind === 'rune_code') {
      return <div className="elite-rune-board"><div className="elite-rune-slots" style={{ '--rune-count': session.guess.length }}>{session.guess.map((rune, index) => <button type="button" aria-label={`第 ${index + 1} 位，现在是${SYMBOLS[rune].name}符文，点击更换`} key={index} onClick={() => cycleRune(index)} disabled={solved || failed}><span>{SYMBOLS[rune].glyph}</span><small>第 {index + 1} 位 · {SYMBOLS[rune].name}</small><i className="fa-solid fa-rotate" /></button>)}</div><button type="button" className="elite-minigame-secondary" onClick={submitRunes} disabled={solved || failed}>提交答案（{session.attempts.length}/{game.maxAttempts}）</button><div className="elite-rune-history">{session.attempts.length === 0 ? <span><b className="is-exact" />绿色：位置正确　<b className="is-displaced" />黄色：图案正确但位置不对</span> : session.attempts.map((attempt, index) => <div key={index}><span>{attempt.guess.map((rune) => SYMBOLS[rune].glyph).join(' ')}</span><strong><em className="is-exact">{attempt.exact} 个位置正确</em><em className="is-displaced">{attempt.displaced} 个位置不对</em></strong></div>)}</div></div>
    }
    return null
  }, [failed, game, session, solved])

  if (!task || !game) return null
  return (
    <div
      className={`elite-minigame-overlay theme-${theme}${confirmed ? ' is-confirmed' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="elite-minigame-title"
      data-theme={theme}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="elite-minigame-atmosphere" aria-hidden><i /><i /><i /></div>
      <section className="elite-minigame-panel">
        <header className="elite-minigame-header">
          <div className="elite-minigame-sigil"><i className={`fa-solid ${themeMeta.icon}`} /></div>
          <div><span className="elite-minigame-eyebrow">{themeMeta.eyebrow} · {themeMeta.accent}</span><h2 id="elite-minigame-title">{task.title}</h2><p>{task.description}</p></div>
          <button type="button" className="elite-minigame-close" onClick={onClose} disabled={busy} aria-label="关闭试炼"><i className="fa-solid fa-xmark" /></button>
        </header>
        <div className="elite-minigame-missionbar"><span><i className="fa-solid fa-gamepad" />{game.label}</span><span><i className="fa-solid fa-brain" />{game.skill}</span><span><i className="fa-solid fa-shield-halved" />失败不扣除任何资源</span></div>
        <main className="elite-minigame-board">
          <div className="elite-minigame-guide">
            <span><b>目标</b>{game.guide?.goal}</span>
            <span><b>怎么玩</b>{game.guide?.action}</span>
          </div>
          {board}
        </main>
        <MiniStatus solved={solved} failed={failed} message={confirmed ? '解锁结果已安全保存，现在可以挑战对应部下。' : session.message} />
        {commitError && <div className="elite-minigame-commit-error"><i className="fa-solid fa-cloud-arrow-up" />{commitError}</div>}
        <footer className="elite-minigame-footer">
          <button type="button" className="elite-minigame-secondary" onClick={restart} disabled={busy}>{confirmed ? '再玩一次' : '重新开始'}</button>
          {confirmed ? <button type="button" className="elite-minigame-primary is-confirmed" onClick={onClose}><i className="fa-solid fa-khanda" />前往挑战</button> : solved ? <button type="button" className="elite-minigame-primary" onClick={commit} disabled={busy}><i className={`fa-solid ${busy ? 'fa-circle-notch fa-spin' : 'fa-cloud-arrow-up'}`} />{busy ? '正在保存…' : '保存并解锁'}</button> : failed ? <button type="button" className="elite-minigame-primary" onClick={restart}><i className="fa-solid fa-rotate-right" />重新挑战</button> : <span className="elite-minigame-hint"><i className="fa-solid fa-circle-info" />完成小游戏后才能解锁部下</span>}
        </footer>
      </section>
    </div>
  )
}
