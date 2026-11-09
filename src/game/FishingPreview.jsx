import React, { useEffect, useMemo, useRef, useState } from 'react'
import FishingOverlay from '../components/Game/FishingOverlay'
import FishingPanel from '../components/Game/FishingPanel'
import { ShopScreen, UnifiedBagScreen } from '../components/Game/DeferredGamePanels'
import MapSceneLayer from './MapSceneLayer'
import { getMapInfo } from './data/mapCatalog'
import { loadAdventureMapGrid } from './data/overworldMaps'
import { applyMapEventsToGrid, getMapStartPosition } from './data/mapEvents'
import { FISHING_SPOT_PLACEMENTS } from './fishingMapEvents'
import { isWalkable } from './world/LegacyGridAdapter'
import { isEnvironmentTileBlocked } from './environmentNavigation'
import { FISHING_BAITS, FISHING_CATCHES, FISHING_MERCHANTS, FISHING_ROD, FISHING_SPOTS, FISHING_TIERS } from './fishingCatalog'
import { evaluateFishingReel, getFishingPool, normalizeFishingState } from './fishingRules'
import { getFishingComboBonuses, previewFishingAppraisal } from './fishingRewards'
import { POKEBALLS, POTIONS, EXP_POTIONS, STAT_BOOST_ITEMS } from '../utils/gameData'
import { BATTLE_ITEMS, KEY_ITEMS } from '../utils/adventureItems'
import { getInventoryItemQuantity, getPotionEffectText, mergeInventoryEntries } from '../utils/inventoryItems'
import '../components/Game/fishing.css'
import '../game.css'

const PREVIEW_WORLD = { currentMapName: 'GodotMapV2_PirateShore', defeatedBossIds: ['region_boss', 'mistlake_boss', 'farmtown_boss', 'pirateshore_boss'] }
const loadFishingMap = (spotId) => {
  const spot = FISHING_SPOTS[spotId], info = getMapInfo(spot.mapId)
  const grid = applyMapEventsToGrid(spot.mapId, loadAdventureMapGrid(spot.mapId)), placement = FISHING_SPOT_PLACEMENTS[spotId]
  const candidates = [
    { x: placement.x, y: placement.y - 1, direction: 'down' },
    { x: placement.x - 1, y: placement.y, direction: 'right' },
    { x: placement.x, y: placement.y + 1, direction: 'up' },
    { x: placement.x + 1, y: placement.y, direction: 'left' }
  ].sort((left, right) => Number(right.direction === placement.facing) - Number(left.direction === placement.facing))
  const playerPos = candidates.find((point) => isWalkable(grid, point.x, point.y) && !isEnvironmentTileBlocked(info, point.x, point.y)) || getMapStartPosition(spot.mapId)
  return { mapName: spot.mapId, grid, playerPos }
}
const createFixture = () => normalizeFishingState({
  hasRod: true, baitUses: { common: 20, aroma: 20, pearl: 20, starlight: 20, secret: 20 },
  catches: { c01: 5, c04: 3, u09: 2, r04: 2, e01: 2, l03: 1, t01: 3, t08: 1, j01: 2 },
  records: Object.fromEntries(['c01', 'c04', 'u09', 'r04', 'e01', 'l03', 't01', 't08', 'j01'].map((id) => [id, { firstCaughtAt: new Date().toISOString(), count: 5, maxWeight: FISHING_CATCHES[id].weightMax, perfectCount: 1 }])),
  hitStreak: Math.max(0,Math.min(20,Number(new URLSearchParams(window.location.search).get('streak'))||0)), fishingVersion:2,
  treasures:[
    {id:'00000000-0000-0000-0000-000000000001',catchId:'t01',price:52,appraisalGrade:'great'},
    {id:'00000000-0000-0000-0000-000000000002',catchId:'t01'},
    {id:'00000000-0000-0000-0000-000000000003',catchId:'t01'},
    {id:'00000000-0000-0000-0000-000000000008',catchId:'t08'}
  ], totals: { casts:12,caught:9,perfect:2,sold:0,earned:0,comboEarned:0 }
})
const selectCatch = (spotId, baitId, forcedId) => {
  if (forcedId && FISHING_CATCHES[forcedId]) return FISHING_CATCHES[forcedId]
  const pool = getFishingPool(spotId, baitId), roll = Math.random() * 100
  let cursor = 0, group = pool.groups.common
  Object.keys(pool.groups).some((id, index) => {
    cursor += pool.probabilities[index]
    if (roll < cursor) { group = pool.groups[id]; return true }
    return false
  })
  return group[Math.floor(Math.random() * group.length)] || pool.catches[0]
}

/** This page uses only an in-memory fixture and never contacts auth, Supabase or account saves. */
export default function FishingPreview() {
  const [state, setState] = useState(createFixture), [gold, setGold] = useState(3000)
  const [inventory, setInventory] = useState([
    { itemType: 'pokeball', itemKey: 'pokeball_basic', quantity: 5 },
    { itemType: 'potion', itemKey: Object.keys(POTIONS)[0], quantity: 3 },
    { itemType: 'expPotion', itemKey: Object.keys(EXP_POTIONS)[0], quantity: 2 },
    { itemType: 'battleItem', itemKey: 'dynamax_candy', quantity: 1 },
    { itemType: 'keyItem', itemKey: 'bicycle', quantity: 1 },
    { itemType: 'statBoost', itemKey: Object.keys(STAT_BOOST_ITEMS).find((id) => id !== 'rare_candy'), quantity: 2 }
  ])
  const stateRef = useRef(state), goldRef = useRef(gold)
  const [view, setView] = useState('water'), [spotId, setSpotId] = useState('valley_pond'), [merchantId, setMerchantId] = useState('shore')
  const [overlay, setOverlay] = useState(false), [fail, setFail] = useState(false), [forcedId, setForcedId] = useState('')
  const mapFixture = useMemo(() => loadFishingMap(spotId), [spotId])
  const [playerFixture, setPlayerFixture] = useState(() => ({ spotId: 'valley_pond', position: mapFixture.playerPos }))
  const playerPos = playerFixture.spotId === spotId ? playerFixture.position : mapFixture.playerPos
  const setPlayerPos = (position) => setPlayerFixture({ spotId, position })
  const [fishingActivity, setFishingActivity] = useState(null)
  const [sceneReady, setSceneReady] = useState(false)
  const activeMapRef = useRef(mapFixture.mapName)
  activeMapRef.current = mapFixture.mapName
  useEffect(() => { setSceneReady(false) }, [mapFixture.mapName])
  const [remainingSeconds, setRemainingSeconds] = useState(3600), [loading, setLoading] = useState(false)
  const [slowClock, setSlowClock] = useState(false)
  const [notice, setNotice] = useState('本地钓鱼预览，不写入账号存档。')
  const completedRef = useRef(new Map())
  const commit = (next, nextGold = goldRef.current) => { stateRef.current = normalizeFishingState(next); goldRef.current = nextGold; setState(stateRef.current); setGold(nextGold) }
  const canConnect = () => { if (fail) throw new Error('模拟网络中断：结果和资源未重复结算，关闭此开关后重试。') }
  const purchase = async (id, quantity = 1) => {
    canConnect()
    const item = id === FISHING_ROD.id ? FISHING_ROD : FISHING_BAITS[id]
    quantity = Math.max(1, Math.min(99, Math.trunc(quantity)))
    if (!item || (item === FISHING_ROD && stateRef.current.hasRod) || goldRef.current < item.price * quantity) throw new Error('无法购买，请检查金币与渔具。')
    const next = normalizeFishingState(stateRef.current)
    if (item === FISHING_ROD) { next.hasRod = true; next.baitUses.common = (next.baitUses.common || 0) + FISHING_ROD.giftBaitUses }
    else next.baitUses[id] = (next.baitUses[id] || 0) + item.uses * quantity
    commit(next, goldRef.current - item.price * quantity)
    return { success: true, state: next }
  }
  const start = async (nextSpotId, baitId) => {
    canConnect()
    if (remainingSeconds < 15) throw new Error('剩余游玩时长不足，不能开始新一竿。')
    const next = normalizeFishingState(stateRef.current)
    if (next.activeSession) return { success: true, state: next, session: { ...next.activeSession, elapsedMs: performance.now() - next.activeSession.startedAt } }
    if (!next.hasRod || !(next.baitUses[baitId] > 0)) throw new Error('鱼竿或鱼饵不足。')
    const item = selectCatch(nextSpotId, baitId, forcedId), tier = FISHING_TIERS[item.tier]
    const session = { id: `preview-${Date.now()}`, spotId: nextSpotId, baitId, tier: item.tier,
      width: tier.width, seconds: tier.seconds, targetCenter: .35 + Math.random() * .3,
      waitMs: 1500 + Math.floor(Math.random() * 1500), elapsedMs: 0, startedAt: performance.now(),
      clockUncertain: slowClock,
      catchId: item.id, weight: Number((item.weightMin + Math.random() * (item.weightMax - item.weightMin)).toFixed(2)) }
    next.baitUses[baitId]--; next.totals.casts++; next.activeSession = session; commit(next)
    return { success: true, state: next, session }
  }
  const settle = async (sessionId, totalElapsedMs) => {
    canConnect()
    if (completedRef.current.has(sessionId)) return completedRef.current.get(sessionId)
    const next = normalizeFishingState(stateRef.current), session = next.activeSession
    if (!session || session.id !== sessionId) throw new Error('没有这次钓鱼会话。')
    const tested = evaluateFishingReel({ ...session, elapsedMs: totalElapsedMs - session.waitMs })
    const item = FISHING_CATCHES[session.catchId]
    const firstCatch = !next.records[item.id]?.count
    if (tested.success) {
      next.catches[item.id] = (next.catches[item.id] || 0) + 1
      const old = next.records[item.id]
      next.records[item.id] = { firstCaughtAt: old?.firstCaughtAt || new Date().toISOString(), count: (old?.count || 0) + 1, maxWeight: Math.max(old?.maxWeight || 0, session.weight), perfectCount: (old?.perfectCount || 0) + (tested.perfect ? 1 : 0) }
      if(item.kind==='treasure') next.treasures.push({id:crypto.randomUUID(),catchId:item.id,caughtAt:new Date().toISOString()})
      next.totals.caught++; if (tested.perfect) next.totals.perfect++
    }
    next.hitStreak=tested.success ? next.hitStreak+1 : 0
    next.perfectStreak=next.hitStreak
    const {bonusGold,hitBonusGold,perfectBonusGold}=getFishingComboBonuses(next.hitStreak,tested.perfect)
    next.totals.comboEarned+=bonusGold
    next.activeSession = null; commit(next,goldRef.current+bonusGold)
    const response = { success: true, state: next, result: { ...tested, hitStreak:next.hitStreak,perfectStreak:next.hitStreak,bonusGold,hitBonusGold,perfectBonusGold,firstCatch: tested.success && firstCatch, reason: tested.success ? 'caught' : tested.timedOut ? 'timed_out' : 'missed', catchId: tested.success ? item.id : null, weight: tested.success ? session.weight : 0,
      message: tested.success ? `${tested.perfect ? '完美收杆！' : '钓到了！'}${item.name}已放进鱼篓。` : tested.timedOut ? '三次机会已过，鱼获游走了。' : '指针没在绿色区域，再试试。' } }
    completedRef.current.set(sessionId, response); return response
  }
  const cancel = async (sessionId) => {
    canConnect()
    if (stateRef.current.activeSession?.id === sessionId) commit({ ...stateRef.current, activeSession: null, hitStreak:0,perfectStreak:0 })
    return { success: true, state: stateRef.current }
  }
  const sell = async ({ merchantId: sellerId, catchId, treasureId, quantity, all }) => {
    canConnect()
    const merchant=FISHING_MERCHANTS[sellerId]
    if (!merchant) throw new Error('请在鱼商处出售。')
    const next=normalizeFishingState(stateRef.current)
    let earned=0,sold=0
    for(const id of all ? Object.keys(next.catches) : [catchId]) {
      const item=FISHING_CATCHES[id],available=next.catches[id]||0
      if(!item||item.kind==='treasure'||available<1)continue
      const amount=all?available:Math.min(available,Math.max(1,Math.trunc(quantity||1)))
      next.catches[id]-=amount;earned+=item.price*amount;sold+=amount
    }
    next.treasures=next.treasures.filter(treasure=>{
      if((all||treasure.id===treasureId)&&treasure.price&&merchant.treasureIds.includes(treasure.catchId)) {
        next.catches[treasure.catchId]--;earned+=treasure.price;sold++;return false
      }
      return true
    })
    if(!sold)throw new Error('没有可出售的鱼获。')
    next.totals.sold+=sold;next.totals.earned+=earned;commit(next,goldRef.current+earned)
    return{success:true,state:next,result:{quantity:sold,totalGold:earned}}
  }
  const appraise = async (sellerId,id) => {
    canConnect()
    const next=normalizeFishingState(stateRef.current),treasure=next.treasures.find(item=>item.id===id)
    if(!treasure||!FISHING_MERCHANTS[sellerId]?.treasureIds.includes(treasure.catchId))throw new Error('这位商人不能鉴定这件宝藏。')
    if(!treasure.price) {
      const bases={t01:40,t02:60,t03:90,t04:140,t05:200,t06:320,t07:500,t08:730}
      const forced=new URLSearchParams(window.location.search).get('appraisal')
      const roll={ordinary:.1,great:.6,precious:.85,exquisite:.97,legendary:.995}[forced]??Math.random()
      Object.assign(treasure,previewFishingAppraisal(bases[treasure.catchId],roll,Math.random()),{appraisedAt:new Date().toISOString()})
    }
    commit(next)
    return{success:true,state:next,result:{...treasure,treasureId:treasure.id,appraised:true}}
  }
  const refresh = async () => {
    canConnect()
    const next = normalizeFishingState(stateRef.current)
    if (next.activeSession) next.activeSession = { ...next.activeSession,
      elapsedMs: performance.now() - next.activeSession.startedAt, clockUncertain: false }
    commit(next)
    return { success: true, state: next, session: next.activeSession }
  }
  return <main className="fishing-preview" data-fishing-casts={state.totals.casts} data-fishing-caught={state.totals.caught} data-fishing-gold={gold} data-fishing-baits={JSON.stringify(state.baitUses)} data-hit-streak={state.hitStreak} data-perfect-streak={state.hitStreak} data-combo-earned={state.totals.comboEarned} data-treasures={JSON.stringify(state.treasures)}>
    <nav className="fishing-preview-nav"><b>本地钓鱼预览</b>{[['water', '钓点'], ['shop', '渔具'], ['basket', '鱼篓'], ['market', '鱼商'], ['dex', '图鉴']].map(([id, name]) => <button type="button" key={id} disabled={overlay} onClick={() => setView(id)}>{name}</button>)}<select aria-label="预览钓点" disabled={overlay} value={spotId} onChange={(event) => setSpotId(event.target.value)}>{Object.values(FISHING_SPOTS).map((spot) => <option value={spot.id} key={spot.id}>{spot.name}</option>)}</select><select aria-label="预览鱼商" value={merchantId} onChange={(event) => setMerchantId(event.target.value)}>{Object.values(FISHING_MERCHANTS).map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select><select aria-label="指定预览鱼获" value={forcedId} onChange={(event) => setForcedId(event.target.value)}><option value="">真实鱼获池</option>{Object.values(FISHING_CATCHES).map((item) => <option key={item.id} value={item.id}>{item.name} · {FISHING_TIERS[item.tier].label}</option>)}</select><select aria-label="预览剩余时长" value={remainingSeconds} onChange={(event) => setRemainingSeconds(Number(event.target.value))}><option value="3600">剩余 60 分钟</option><option value="14">剩余 14 秒</option><option value="15">剩余 15 秒</option><option value="0">时长已用完</option></select><label><input type="checkbox" checked={slowClock} onChange={(event) => setSlowClock(event.target.checked)} />模拟时钟待同步</label><label><input type="checkbox" checked={loading} onChange={(event) => setLoading(event.target.checked)} />模拟同步中</label><label><input type="checkbox" checked={fail} onChange={(event) => setFail(event.target.checked)} />模拟断网</label><button type="button" onClick={() => { commit(createFixture(), 3000); completedRef.current.clear(); setOverlay(false); setNotice('示例已重置。') }}>重置示例</button><button type="button" onClick={() => { commit(normalizeFishingState({}), 500); setOverlay(false); setView('shop') }}>首次购买示例</button><span role="status">{notice}</span></nav>
    <div className="fishing-preview-body">
      <div className="fishing-preview-map">
        <MapSceneLayer key={mapFixture.mapName} active={view === 'water'} playerPos={playerPos} mapGrid={mapFixture.grid}
          onPlayerMove={setPlayerPos} useRealMaps currentMapName={mapFixture.mapName} currentMapBossCompleted
          cloudBlocked={overlay} fishingActivity={fishingActivity}
          onSceneReadyChange={({ mapName, ready }) => { if (mapName === activeMapRef.current) setSceneReady(Boolean(ready)) }}
          onCollect={(type, quantity, context) => {
            const event = context?.mapEvent
            if (event?.properties?.interactionKind === 'fishing') { setSpotId(event.properties.spotId); setOverlay(true) }
            if (event?.properties?.shopMode === 'fish_market') { setMerchantId(event.properties.merchantId); setView('market') }
          }} />
        {view === 'water' && !overlay && <div className="fishing-preview-map-toolbar"><span>{FISHING_SPOTS[spotId].name} · 真实地图预览</span><button type="button" className="fishing-button" disabled={!sceneReady} onClick={() => setOverlay(true)}>{sceneReady ? '开始钓鱼' : '正在加载地图…'}</button></div>}
      </div>
      {view !== 'water' && <div className="fishing-preview-panel">
        {view === 'shop' ? <ShopScreen
          playerGold={gold} playerInventory={inventory} initialCategory="fishingGear"
          getInventoryItemQuantity={getInventoryItemQuantity} getPotionEffectText={getPotionEffectText}
          onBack={() => setView('water')}
          onPurchase={async (type, id, amount) => {
            canConnect()
            const item = { pokeball: POKEBALLS, potion: POTIONS, expPotion: EXP_POTIONS, battleItem: BATTLE_ITEMS, keyItem: KEY_ITEMS, statBoost: STAT_BOOST_ITEMS }[type]?.[id]
            if (!item || goldRef.current < item.price * amount || (item.permanent && getInventoryItemQuantity(inventory, type, id))) return { success: false }
            commit(stateRef.current, goldRef.current - item.price * amount)
            setInventory((current) => mergeInventoryEntries(current, type, id, amount))
            return { success: true, itemName: item.name, quantity: amount, totalPrice: item.price * amount }
          }}
          renderFishingGear={() => <FishingPanel embedded showTabs={false} mode="shop" state={loading ? null : state} world={PREVIEW_WORLD} currentMapId={PREVIEW_WORLD.currentMapName} playerGold={gold} onPurchase={purchase} onRefresh={refresh} />}
        /> : view === 'basket' ? <UnifiedBagScreen
          inventory={inventory} initialCategory="fishBasket" onClose={() => setView('water')}
          fishBasketCount={Object.values(state.catches).reduce((total, quantity) => total + quantity, 0)}
          renderFishBasket={() => <FishingPanel embedded mode="basket" state={loading ? null : state} world={PREVIEW_WORLD} currentMapId={PREVIEW_WORLD.currentMapName} playerGold={gold} onRefresh={refresh} />}
        /> : <FishingPanel mode={view} state={loading ? null : state} world={PREVIEW_WORLD} currentMapId={view === 'market' ? FISHING_MERCHANTS[merchantId].mapId : PREVIEW_WORLD.currentMapName} playerGold={gold} merchantId={view === 'market' ? merchantId : null} onPurchase={purchase} onSell={sell} onAppraise={appraise} onRefresh={refresh} onClose={() => setView('water')} />}
      </div>}
      {overlay && <FishingOverlay spot={FISHING_SPOTS[spotId]} state={loading ? null : state} world={PREVIEW_WORLD} playerGold={gold} remainingSeconds={remainingSeconds} onActivity={setFishingActivity} onRefresh={refresh} onPurchase={purchase} onStart={start} onSettle={settle} onCancel={cancel} onClose={() => setOverlay(false)} onChanged={(response) => { if (response.result) setNotice(response.result.message) }} />}
    </div>
  </main>
}
