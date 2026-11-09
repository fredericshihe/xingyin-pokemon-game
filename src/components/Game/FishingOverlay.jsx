import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FISHING_BAITS, FISHING_CATCHES, FISHING_ROD, FISHING_SPOTS, FISHING_TIERS } from '../../game/fishingCatalog'
import { getFishingDeadlineMs, getFishingPool, getFishingPosition, isFishingBaitUnlocked, isFishingSpotUnlocked, normalizeFishingState } from '../../game/fishingRules'
import { gameAudio } from '../../utils/gameAudio'
import { getMapCatalogEntry } from '../../game/data/mapCatalog'
import { getFishingCelebration } from '../../game/fishingCelebration'
import './fishing.css'

const clock = () => performance.now()
const RESULT_REASONS = {
  timed_out: '三次收杆机会已过，鱼获游走了。',
  missed: '指针没有落在绿色区域，这次没有钓到。',
  cancelled: '本竿已取消，已使用的鱼饵不会返还。',
  expired: '本竿已过期，已使用的鱼饵不会返还。'
}
const messageOf = (error) => error?.message || (typeof error === 'string' ? error : '连接暂时中断，请重试。')
const checkResponse = (response) => {
  if (!response || response.success === false || response.error) throw new Error(response?.message || messageOf(response?.error) || '操作未完成。')
  return response
}

/** The server elapsedMs and onSettle elapsedMs include waitMs; only the pointer clock subtracts it. */
export default function FishingOverlay({ spot: spotProp, state: stateProp, world, playerGold = 0, remainingSeconds,
  onPurchase, onStart, onSettle, onCancel, onClose, onChanged, onRefresh, onActivity, error: externalError = '', busy: externalBusy = false, hapticsEnabled = false }) {
  const state = normalizeFishingState(stateProp)
  const stateLoaded = Boolean(stateProp)
  const requestedSpot = (typeof spotProp === 'string' ? FISHING_SPOTS[spotProp] : spotProp) || FISHING_SPOTS.valley_shallows
  const [baitId, setBaitId] = useState(() => Object.keys(FISHING_BAITS).find((id) => state.baitUses[id] > 0) || 'common')
  const [session, setSession] = useState(state.activeSession)
  const [phase, setPhase] = useState(state.activeSession?.clockUncertain ? 'syncing' : state.activeSession ? 'waiting' : 'idle')
  const [result, setResult] = useState(null)
  const [revealReady, setRevealReady] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [animationEpoch, setAnimationEpoch] = useState(0)
  const spot = session && !result ? FISHING_SPOTS[session.spotId] || requestedSpot : requestedSpot
  const markerRef = useRef(null), progressRef = useRef(null), passRef = useRef(null)
  const soundEventRef = useRef('')
  const sessionRef = useRef(state.activeSession), baseRef = useRef({ at: clock(), elapsed: state.activeSession?.elapsedMs || 0 })
  const settleRef = useRef(null), lockedRef = useRef(false), busyRef = useRef(false), mountedRef = useRef(true)
  const resultRef = useRef(null), onChangedRef = useRef(onChanged), reelRef = useRef(null)
  const activityRef = useRef(onActivity)
  activityRef.current = onActivity
  onChangedRef.current = onChanged
  const totalElapsed = useCallback(() => Math.max(0, baseRef.current.elapsed + clock() - baseRef.current.at), [])
  const changeBusy = (value) => { busyRef.current = value; if (mountedRef.current) setBusy(value) }
  const adoptSession = useCallback((next) => {
    sessionRef.current = next; baseRef.current = { at: clock(), elapsed: Number(next.elapsedMs) || 0 }
    settleRef.current = null; lockedRef.current = false; resultRef.current = null
    setSession(next); setResult(null); setError(''); setPhase(next.clockUncertain ? 'syncing' : (next.elapsedMs || 0) >= next.waitMs ? 'reeling' : 'casting')
  }, [])
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; activityRef.current?.(null) }
  }, [])
  useEffect(() => {
    activityRef.current?.({ sessionId: session?.id || null, spotId: spot.id, phase: phase === 'syncing' ? 'waiting' : phase, tier: session?.tier,
      catchId: result?.catchId || null, success: result?.success, perfect: result?.perfect,
      hitStreak: result?.hitStreak ?? result?.perfectStreak ?? 0, bonusGold: result?.bonusGold || 0 })
  }, [session?.id, spot.id, phase, session?.tier, result?.catchId, result?.success, result?.perfect, result?.hitStreak, result?.perfectStreak, result?.bonusGold])
  useEffect(() => {
    const soundPhase = { casting: 'cast', reeling: 'bite', result: result?.success ? 'success' : 'miss' }[phase]
    if (!soundPhase) return
    const eventId = `${session?.id}:${soundPhase}`
    if (soundEventRef.current === eventId) return
    soundEventRef.current = eventId
    gameAudio.playFishing?.({ phase: soundPhase, tier: session?.tier, perfect: Boolean(result?.perfect) })
    if (hapticsEnabled && gameAudio.canPlay() && navigator.vibrate && ['bite', 'success'].includes(soundPhase)) {
      try { navigator.vibrate(soundPhase === 'bite' ? 18 : 25) } catch { /* Haptics are optional. */ }
    }
  }, [phase, result, session?.tier, hapticsEnabled])
  useEffect(() => {
    if (!result) return
    const tier = FISHING_CATCHES[result.catchId]?.tier
    const duration = result.success ? Math.max((result.hitStreak ?? result.perfectStreak ?? 0) >= 2 ? 2200 : 1200, getFishingCelebration(tier).duration * 1000 + 400) : 1200
    const timer = window.setTimeout(() => setRevealReady(true), duration)
    return () => window.clearTimeout(timer)
  }, [result])
  useEffect(() => {
    const incoming = stateProp?.activeSession
    if (incoming && (incoming.id !== sessionRef.current?.id || (!settleRef.current && Boolean(incoming.clockUncertain) !== Boolean(sessionRef.current?.clockUncertain)))) adoptSession(incoming)
  }, [stateProp?.activeSession?.id, stateProp?.activeSession?.clockUncertain, adoptSession])

  const deliverResult = useCallback((response) => {
    onChangedRef.current?.(response)
    if (!mountedRef.current) return
    const raw = response.result || { success: false }
    const item = FISHING_CATCHES[raw.catchId]
    const resolved = { ...raw, message: raw.message || (raw.success
      ? `${raw.perfect ? '完美收杆！' : '钓到了！'}${item?.name || '鱼获'}已放进鱼篓。`
      : RESULT_REASONS[raw.reason] || response.message || '这次没有钓到，下一竿再试试。') }
    resultRef.current = resolved; setRevealReady(false); setResult(resolved); setPhase('result'); setError('')
  }, [])
  const submitReel = useCallback(async () => {
    const active = sessionRef.current
    if (!active || busyRef.current || !settleRef.current) return
    changeBusy(true); setError(''); setPhase('settling')
    try {
      deliverResult(checkResponse(await onSettle?.(active.id, settleRef.current.elapsedMs)))
    } catch (reason) {
      if (mountedRef.current) { setError(messageOf(reason)); setPhase('settling') }
    } finally { changeBusy(false) }
  }, [deliverResult, onSettle])
  const reel = useCallback((timedOut = false) => {
    const active = sessionRef.current
    if (!active || active.clockUncertain || lockedRef.current || totalElapsed() < active.waitMs || busyRef.current) return
    lockedRef.current = true
    soundEventRef.current = `${active.id}:reel`
    gameAudio.playFishing?.({ phase: 'reel', tier: active.tier, perfect: false })
    const deadline = active.waitMs + getFishingDeadlineMs(active.width, active.seconds, active.targetCenter)
    settleRef.current = { elapsedMs: timedOut ? Math.max(totalElapsed(), deadline + 1) : totalElapsed() }
    const position = getFishingPosition(settleRef.current.elapsedMs - active.waitMs, active.seconds)
    if (markerRef.current) markerRef.current.style.left = `${position * 100}%`
    void submitReel()
  }, [submitReel, totalElapsed])
  reelRef.current = reel

  useEffect(() => {
    if (!session || session.clockUncertain || result || lockedRef.current) return
    let frame, timer, previousPhase = ''
    const tick = () => {
      if (!mountedRef.current || lockedRef.current || resultRef.current) return
      const active = sessionRef.current
      if (!active) return
      const total = totalElapsed(), elapsed = Math.max(0, total - active.waitMs)
      const nextPhase = total < Math.min(550, active.waitMs) ? 'casting' : total < active.waitMs ? 'waiting' : 'reeling'
      if (nextPhase !== previousPhase) { previousPhase = nextPhase; setPhase(nextPhase) }
      if (markerRef.current) markerRef.current.style.left = `${getFishingPosition(elapsed, active.seconds) * 100}%`
      const deadline = getFishingDeadlineMs(active.width, active.seconds, active.targetCenter)
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${Math.max(0, 1 - elapsed / deadline)})`
      const firstPassed = elapsed > (active.targetCenter + active.width / 2) * active.seconds * 1000
      const secondPassed = elapsed > (2 - active.targetCenter + active.width / 2) * active.seconds * 1000
      if (passRef.current) passRef.current.textContent = `${1 + Number(firstPassed) + Number(secondPassed)} / 3 次经过`
      if (elapsed > deadline) { reelRef.current(true); return }
      frame = requestAnimationFrame(tick)
    }
    const visibility = () => { if (!document.hidden) { cancelAnimationFrame(frame); tick() } }
    tick()
    // A wall-clock deadline also resolves when rAF is suspended by an inactive browser tab.
    timer = window.setTimeout(() => reelRef.current(true), Math.max(0, session.waitMs + getFishingDeadlineMs(session.width, session.seconds, session.targetCenter) - totalElapsed() + 8))
    document.addEventListener('visibilitychange', visibility)
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); document.removeEventListener('visibilitychange', visibility) }
  }, [session, result, totalElapsed, animationEpoch])

  const start = async () => {
    if (busyRef.current || externalBusy || (resultRef.current && !revealReady) || (sessionRef.current && !resultRef.current) || externalError || !stateLoaded || (remainingSeconds != null && remainingSeconds < 15)) return
    changeBusy(true); setError(''); setNotice('')
    try {
      const response = checkResponse(await onStart?.(spot.id, baitId))
      if (!response.session) throw new Error('未取得钓鱼会话，请刷新后重试。')
      onChangedRef.current?.(response)
      if (mountedRef.current) adoptSession(response.session)
    } catch (reason) { if (mountedRef.current) setError(messageOf(reason)) }
    finally { changeBusy(false) }
  }
  const close = useCallback(async () => {
    if (busyRef.current) return
    const active = sessionRef.current
    if (active && !resultRef.current) {
      changeBusy(true); lockedRef.current = true
      try { onChangedRef.current?.(checkResponse(await onCancel?.(active.id))) }
      catch (reason) {
        lockedRef.current = Boolean(settleRef.current)
        if (mountedRef.current) { setError(messageOf(reason)); if (!settleRef.current) setAnimationEpoch((value) => value + 1) }
        changeBusy(false); return
      }
      changeBusy(false)
    }
    onClose?.()
  }, [onCancel, onClose])
  const refresh = async () => {
    if (busyRef.current || !onRefresh) return
    changeBusy(true); setError('')
    try {
      const response = checkResponse(await onRefresh())
      onChangedRef.current?.(response)
      const incoming = response.state?.activeSession || response.session
      if (incoming && !settleRef.current && mountedRef.current) adoptSession(incoming)
      else if (!incoming && sessionRef.current?.clockUncertain && !settleRef.current && onSettle) {
        // A fresh authoritative snapshot has no active session: this RPC reads its stored terminal result.
        lockedRef.current = true; settleRef.current = { elapsedMs: totalElapsed() }
        deliverResult(checkResponse(await onSettle(sessionRef.current.id, settleRef.current.elapsedMs)))
      }
    } catch (reason) { if (mountedRef.current) setError(messageOf(reason)) }
    finally { changeBusy(false) }
  }
  useEffect(() => {
    const keyboard = (event) => {
      const editable = /INPUT|SELECT|TEXTAREA|BUTTON|A/.test(event.target?.tagName || '') || event.target?.isContentEditable
      if (!editable && (event.code === 'Space' || event.code === 'Enter') && phase === 'reeling') { event.preventDefault(); if (!event.repeat) reelRef.current() }
      if (event.key === 'Escape') { event.preventDefault(); void close() }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [close, phase])

  const bait = FISHING_BAITS[baitId], pool = getFishingPool(spot.id, baitId)
  const active = session && !result, caught = FISHING_CATCHES[result?.catchId]
  const open = isFishingSpotUnlocked(spot, { ...world, currentMapName: world?.currentMapName || spot.mapId })
  const canStart = stateLoaded && !externalError && state.hasRod && (state.baitUses[baitId] || 0) > 0 && open && isFishingBaitUnlocked(baitId, world, spot.mapId) && (remainingSeconds == null || remainingSeconds >= 15)
  const target = session?.targetCenter ?? .5, width = session?.width ?? FISHING_TIERS.common.width
  const buyRod = async () => {
    if (busyRef.current || externalBusy || !stateLoaded) return
    changeBusy(true); setError('')
    try {
      const response = checkResponse(await onPurchase?.(FISHING_ROD.id, 1))
      onChangedRef.current?.(response)
      if (mountedRef.current) {
        setBaitId(FISHING_ROD.giftBaitId)
        setNotice(`鱼竿已永久解锁，赠送 ${FISHING_ROD.giftBaitUses} 次普通鱼饵，可以直接抛竿。`)
      }
    }
    catch (reason) { if (mountedRef.current) setError(messageOf(reason)) }
    finally { changeBusy(false) }
  }
  return <div className={`fishing-overlay fishing-hud fishing-hud--${phase}`} data-fishing-phase={phase} role="region" aria-labelledby="fishing-title">
    {result?.success && (result.hitStreak ?? result.perfectStreak ?? 0) >= 2 && <div key={session?.id} className={`fishing-combo-banner fishing-combo-banner--${(result.hitStreak ?? result.perfectStreak ?? 0) >= 8 ? 'grand' : (result.hitStreak ?? result.perfectStreak ?? 0) >= 5 ? 'bright' : 'start'}`} role="status" aria-label={`连续命中${(result.hitStreak ?? result.perfectStreak ?? 0)}次，奖励${result.bonusGold}金币`}>
      <span className="fishing-combo-sparks" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ '--i': index }} />)}</span>
      <strong>命中连击 <b>×{(result.hitStreak ?? result.perfectStreak ?? 0)}</b></strong><span><i className="fa-solid fa-coins" aria-hidden="true" /> +{result.bonusGold} 金币{result.perfectBonusGold > 0 ? ` · 完美 +${result.perfectBonusGold}` : ''}</span>
    </div>}
    <section className="fishing-card">
      <header className="fishing-heading"><div><span className="game-page-subtitle">{getMapCatalogEntry(spot.mapId).mapInfo.displayName} · {spot.waterType === 'saltwater' ? '海水' : '淡水'}</span><h2 id="fishing-title" className="game-page-title"><i className="fa-solid fa-fish text-teal-600" aria-hidden="true" />{spot.name}</h2></div><button className="game-icon-button fishing-icon-button" type="button" aria-label={active ? '取消本竿并离开' : '离开钓点'} disabled={busy || Boolean(externalBusy)} title={active ? '取消本竿，已消耗的鱼饵不返还' : '离开钓点'} onClick={close}><i className="fa-solid fa-xmark" aria-hidden="true" /></button></header>
      <div className="fishing-overlay-content">
        <div className="fishing-stage-copy" role="status" aria-live="polite"><strong>{({ idle: '选择鱼饵后抛竿', syncing: '网络较慢，请重新同步本竿', casting: '抛竿入水…', waiting: '等待咬钩…', reeling: '指针进入绿色区域时收杆', settling: error ? '收杆已保存，可以重试' : '正在收杆…', result: result?.message || (result?.success ? '钓到了！' : '鱼获游走了') })[phase]}</strong></div>
        {active && !session.clockUncertain && <div className={`fishing-timing${phase === 'reeling' ? ' is-active' : ''}`}>
          <div className="fishing-timing-label"><span>{FISHING_TIERS[session.tier]?.label || '鱼获'} · 鱼在拉线</span><span ref={passRef}>1 / 3 次经过</span></div>
          <div className="fishing-track" aria-label="摆动指针与绿色收杆区"><div className="fishing-target" style={{ left: `${(target - width / 2) * 100}%`, width: `${width * 100}%` }}><span style={{ width: '33.333%' }} /></div><div ref={markerRef} className="fishing-pointer" style={{ left: '0%' }}><i /></div></div>
          <div className="fishing-timer"><i ref={progressRef} /></div>
          <button type="button" className="game-primary-button fishing-button fishing-button--reel" title="指针进入绿色区域时点击，或按空格、回车收杆" aria-keyshortcuts="Space Enter" disabled={phase !== 'reeling' || busy} onPointerDown={(event) => { if (event.button === 0) { event.preventDefault(); reel() } }} onClick={() => reel()}>{phase === 'reeling' ? '收杆' : phase === 'settling' ? '收杆处理中' : '等待咬钩'}</button>
        </div>}
        {result && <div className={`fishing-reveal${result.success ? ' is-success' : ''}`} data-catch-tier={caught?.tier} style={caught ? { '--catch-color': FISHING_TIERS[caught.tier]?.color } : undefined} role="status" aria-live="polite">
          {caught ? <img src={caught.sprite} alt={caught.name} /> : <svg viewBox="0 0 90 90" aria-hidden="true"><path d="M9 48q18-25 43-4l20-12v30L52 52Q24 70 9 48Z" fill="#98b8aa" /><circle cx="24" cy="46" r="3" fill="#315e51" /><path d="m61 14 9 9m-9 0 9-9" stroke="#6f9085" strokeWidth="3" /></svg>}
          <div><span className="fishing-eyebrow">{caught ? `${FISHING_TIERS[caught.tier]?.label}鱼获${result.perfect ? ' · 完美收杆' : ''}` : '本次未钓获'}</span><h3>{caught?.name || (result.reason === 'cancelled' ? '本竿已取消' : result.reason === 'expired' ? '本竿已过期' : '鱼获游走了')}</h3>{caught && <div className="fishing-catch-english" lang="en">{caught.englishName}</div>}<p>{caught ? caught.kind === 'treasure' ? '待鉴定 · 带给地图鱼商揭晓价值' : `${result.weight ? `${Number(result.weight).toFixed(2)} kg · ` : ''}售价 ${caught.price} 金币` : result.message}</p>{result.success && result.firstCatch && <span className="fishing-first-catch">首次发现 · 已加入图鉴</span>}</div>
        </div>}
        {!active && <><div className="fishing-bait-picker">{Object.values(FISHING_BAITS).map((item) => <button type="button" key={item.id} aria-pressed={baitId === item.id} className={baitId === item.id ? 'is-selected' : ''} disabled={busy || Boolean(externalBusy)} onClick={() => setBaitId(item.id)}><img src={item.sprite} alt="" /><strong>{item.name}</strong><span>剩余 {state.baitUses[item.id] || 0} 次</span></button>)}</div><div className="fishing-tip"><span>{bait.description}</span><strong>水域最高：{FISHING_TIERS[pool?.maxTier]?.label}</strong></div>{pool && FISHING_TIERS[pool.maxTier] && bait.probabilities[4] > 0 && pool.maxTier !== 'legendary' && <div className="fishing-soft-notice">这个水域不会出现传说鱼；超出水域等级的概率会转为较低等级鱼获。</div>}
          <div className="fishing-actions">{!state.hasRod ? <button type="button" className="game-primary-button fishing-button" disabled={busy || Boolean(externalBusy) || !stateLoaded || playerGold < FISHING_ROD.price || !onPurchase} onClick={buyRod}>{busy ? '购买中…' : externalBusy ? '同步中…' : `购买钓鱼竿 · ${FISHING_ROD.price} 金币`}</button> : <button type="button" className="game-primary-button fishing-button" disabled={busy || Boolean(externalBusy) || (result && !revealReady) || !canStart} onClick={() => start()}>{busy || externalBusy ? '准备中…' : `抛竿 · 消耗 ${bait.name} 1 次`}</button>}</div>{!state.hasRod && stateLoaded && <p className="fishing-empty-hint">{playerGold < FISHING_ROD.price ? `还差 ${FISHING_ROD.price - playerGold} 金币购买鱼竿。` : '鱼竿购买一次永久拥有，赠送 5 次普通鱼饵。'}</p>}{state.hasRod && !canStart && !externalError && <p className="fishing-empty-hint">{!open ? '完成此地首领挑战后开放。' : remainingSeconds != null && remainingSeconds < 15 ? '剩余游玩时长不足 15 秒，暂时不能开启新一竿。' : !state.baitUses[baitId] ? '这款鱼饵已经用完，可以去商店的渔具分栏补充。' : '这款鱼饵尚未解锁。'}</p>}
        </>}
        {result && <button type="button" className="fishing-hud-change-bait" disabled={busy || !revealReady} onClick={() => {
          sessionRef.current = null; resultRef.current = null; settleRef.current = null; lockedRef.current = false
          setSession(null); setResult(null); setPhase('idle'); setError('')
        }}>更换鱼饵</button>}
        {notice && <div className="fishing-panel-status fishing-panel-status--success" role="status">{notice}</div>}
        {error && <div className="fishing-error" role="alert">{error}{settleRef.current && <button type="button" disabled={busy} onClick={submitReel}>重试本次收杆</button>}</div>}
        {active && session.clockUncertain && onRefresh && <button type="button" className="game-primary-button fishing-button fishing-hud-resync" disabled={busy} onClick={refresh}>重新同步本竿</button>}
        {!stateLoaded && !externalError && <div className="fishing-soft-notice" role="status">正在同步鱼篓与渔具…</div>}
        {externalError && <div className="fishing-error" role="alert">{externalError}{onRefresh && <button type="button" disabled={busy} onClick={refresh}>重新同步</button>}</div>}
      </div>
    </section>
  </div>
}
