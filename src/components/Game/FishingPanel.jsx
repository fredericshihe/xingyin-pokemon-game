import React, { useEffect, useId, useRef, useState } from 'react'
import { FISHING_BAITS, FISHING_BASKET_SPRITE, FISHING_CATCHES, FISHING_MERCHANTS, FISHING_ROD, FISHING_SPOTS, FISHING_TIERS } from '../../game/fishingCatalog'
import { getFishingBasketRows, getFishingBaitStock, getFishingSaleTotals, isFishingBaitUnlocked, normalizeFishingState } from '../../game/fishingRules'
import { FISHING_APPRAISAL_GRADES } from '../../game/fishingRewards'
import { getMapCatalogEntry } from '../../game/data/mapCatalog'
import { CollectionCard, CollectionGrid } from './gameUiPrimitives'
import { gameAudio } from '../../utils/gameAudio'
import './fishing.css'

const KIND_LABEL = { fish: '鱼', shrimp: '虾', crab: '蟹', treasure: '宝藏', junk: '杂物' }
const MODES = [['shop', '渔具', 'fa-fish'], ['basket', '鱼篓', 'fa-basket-shopping'], ['bait', '鱼饵', 'fa-box'], ['dex', '图鉴', 'fa-book-open'], ['market', '出售与鉴定', 'fa-coins']]
const BAIT_COPY = {
  common: '入门鱼饵，适合浅滩。',
  aroma: '更容易钓到不常见与稀有鱼。',
  pearl: '适合深水鱼、稀有虾蟹与宝藏。',
  starlight: '提高稀有海货与宝藏的机会。',
  secret: '珍稀、传说机会最高，收杆更难。'
}
const mapName = (id) => getMapCatalogEntry(id).mapInfo.displayName
const catchLocations = (item) => [...new Set(item.spotIds.map((id) => FISHING_SPOTS[id].mapId))].map((id) => ({ map: mapName(id) }))
const errorMessage = (reason) => reason?.message || (typeof reason === 'string' ? reason : '操作未完成，请重试。')

export default function FishingPanel({ state: stateProp, world, currentMapId, playerGold = 0, mode = 'basket', merchantId,
  onPurchase, onSell, onAppraise, onClose, onRefresh, busy = false, error = '', embedded = false, showTabs = true }) {
  const state = normalizeFishingState(stateProp)
  const [tab, setTab] = useState(mode), [filter, setFilter] = useState('all'), [tierFilter, setTierFilter] = useState('all')
  const [localBusy, setLocalBusy] = useState(false), [localError, setLocalError] = useState('')
  const [updatedItem, setUpdatedItem] = useState(null)
  const [appraisalReveal, setAppraisalReveal] = useState(null)
  const operationRef = useRef(false), contentRef = useRef(null)
  const tabRefs = useRef({}), panelId = useId()
  const merchant = FISHING_MERCHANTS[merchantId]?.mapId === currentMapId ? FISHING_MERCHANTS[merchantId] : null
  const blocked = busy || localBusy
  const tabs = MODES.filter(([id]) => embedded || mode !== 'shop' ? id !== 'shop' && (!embedded || id !== 'market') : true)
  const visibleTabs = showTabs && mode !== 'market' && !(embedded && mode === 'shop')
  const stateLoaded = Boolean(stateProp)
  useEffect(() => { setTab(mode); setFilter('all'); setTierFilter('all'); setLocalError('') }, [mode])
  useEffect(() => {
    if (!updatedItem) return
    const timeout = setTimeout(() => setUpdatedItem(null), 1500)
    return () => clearTimeout(timeout)
  }, [updatedItem])
  const catches = Object.values(FISHING_CATCHES)
  const owned = getFishingBasketRows(state)
  const entries = (tab === 'dex' ? catches : owned).filter((item) => (filter === 'all' || item.kind === filter) && (tierFilter === 'all' || item.tier === tierFilter))
  const completed = catches.filter((item) => state.records[item.id]?.count > 0).length
  const totalCount = owned.reduce((sum, item) => sum + item.quantity, 0)
  const ownedBaits = Object.values(FISHING_BAITS).filter((item) => state.baitUses[item.id] > 0)
  const merchantMaps = Object.values(FISHING_MERCHANTS).map((item) => mapName(item.mapId)).join('、')
  const saleTotals = getFishingSaleTotals(owned, merchant)
  const run = async (callback, itemId) => {
    if (blocked || operationRef.current || !callback) return
    operationRef.current = true
    setLocalBusy(true); setLocalError('')
    try {
      const response = await callback()
      if (!response || response.success === false || response.error) throw new Error(response?.message || errorMessage(response?.error))
      if (response.result?.appraised) setAppraisalReveal({ ...response.result, key: Date.now() })
      if (itemId) setUpdatedItem({ id: response.result?.appraised ? `${response.result.catchId}:${response.result.appraisalGrade}:${response.result.price}` : itemId, key: Date.now() })
    } catch (reason) { setLocalError(errorMessage(reason)) }
    finally { operationRef.current = false; setLocalBusy(false) }
  }
  const selectTab = (id, moveFocus = false) => {
    setTab(id); setLocalError(''); setFilter('all'); setTierFilter('all')
    if (contentRef.current) contentRef.current.scrollTop = 0
    const button = tabRefs.current[id]
    if (moveFocus) button?.focus({ preventScroll: true })
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
  const handleTabKey = (event, id) => {
    const index = tabs.findIndex(([key]) => key === id)
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (next === null || blocked) return
    event.preventDefault(); selectTab(tabs[next][0], true)
  }
  const sectionHeading = (title, description) => <div className="game-collection-section__head fishing-section-heading"><h3 className="game-collection-section__title">{title}</h3><span className="game-collection-section__desc">{description}</span></div>
  const changedClass = (id) => updatedItem?.id === id ? ' shop-item-card--purchased' : ''
  const sprite = (item) => <div className="game-collection-card__sprite-wrap"><img src={item.sprite} alt={item.name} className="game-collection-card__sprite" /></div>
  const title = MODES.find(([id]) => id === tab)?.[1]
  useEffect(() => {
    if (!appraisalReveal) return
    gameAudio.playFishing({ phase: 'success', tier: { ordinary:'common', great:'uncommon', precious:'rare', exquisite:'epic', legendary:'legendary' }[appraisalReveal.appraisalGrade] })
    const duration = ['exquisite','legendary'].includes(appraisalReveal.appraisalGrade) ? 2600 : 1800
    const timer = window.setTimeout(() => setAppraisalReveal(null), duration)
    return () => window.clearTimeout(timer)
  }, [appraisalReveal])

  return <section className={`fishing-panel${embedded ? ' fishing-panel--embedded' : ' game-page shop-page'}`} aria-label={embedded ? title : undefined}>
    {!embedded && <div className="game-page-header"><div><h2 className="game-page-title"><i className={`fa-solid ${merchant ? 'fa-coins' : 'fa-fish'} text-teal-600`} aria-hidden="true" />{merchant?.name || title}</h2></div><div className="flex items-center gap-2 text-sm font-bold"><span className="adventure-chip"><i className="fa-solid fa-coins text-amber-500" aria-hidden="true" />金币 {Number(playerGold).toLocaleString()}</span><button type="button" className="game-icon-button" disabled={blocked} title="返回" aria-label="返回" onClick={onClose}><i className="fa-solid fa-arrow-left" aria-hidden="true" /></button></div></div>}
    {visibleTabs && <div className="shop-category-tabs fishing-panel-tabs" role="tablist" aria-label="渔具内容">{tabs.map(([id, name, icon]) => <button type="button" role="tab" id={`${panelId}-tab-${id}`} aria-selected={tab === id} aria-controls={`${panelId}-content`} tabIndex={tab === id ? 0 : -1} key={id} className={`shop-category-tab${tab === id ? ' shop-category-tab--active' : ''}`} disabled={blocked} ref={(button) => { tabRefs.current[id] = button }} onClick={() => selectTab(id)} onKeyDown={(event) => handleTabKey(event, id)}><i className={`fa-solid ${icon}`} aria-hidden="true" /><span>{name}</span>{(id === 'basket' || id === 'dex') && <span className="shop-category-tab__count" aria-hidden="true">{id === 'basket' ? totalCount : completed}</span>}</button>)}</div>}
    <div className={`fishing-panel-scroll${embedded ? '' : ' game-scroll-area shop-products'}`} ref={contentRef} id={`${panelId}-content`} role={visibleTabs ? 'tabpanel' : undefined} aria-labelledby={visibleTabs ? `${panelId}-tab-${tab}` : undefined} tabIndex={visibleTabs ? 0 : undefined} aria-busy={blocked}>
      {(error || localError) && <div className="fishing-panel-status fishing-panel-status--error" role="alert"><span><i className="fa-solid fa-circle-exclamation" aria-hidden="true" />{error || localError}</span>{onRefresh && <button type="button" className="game-soft-button" disabled={blocked} onClick={() => run(onRefresh)}><i className="fa-solid fa-rotate" aria-hidden="true" />重新同步</button>}</div>}
      {!stateLoaded && !error && <div className="fishing-panel-status" role="status"><i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />正在同步鱼篓与渔具</div>}
      {appraisalReveal && <div key={appraisalReveal.key} className="fishing-appraisal-reveal" data-appraisal-grade={appraisalReveal.appraisalGrade} style={{ '--appraisal-color': FISHING_APPRAISAL_GRADES[appraisalReveal.appraisalGrade]?.color }} role="status">
        <img src={FISHING_CATCHES[appraisalReveal.catchId]?.sprite} alt="" />
        <div><span>{FISHING_APPRAISAL_GRADES[appraisalReveal.appraisalGrade]?.label}宝藏</span><strong>{FISHING_CATCHES[appraisalReveal.catchId]?.name}</strong><small className="fishing-catch-english" lang="en">{FISHING_CATCHES[appraisalReveal.catchId]?.englishName}</small></div>
        <b><i className="fa-solid fa-coins" aria-hidden="true" /> {Number(appraisalReveal.price).toLocaleString()} 金币</b>
        <span className="fishing-appraisal-stars" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} style={{ '--i': index }} />)}</span>
      </div>}
      {tab === 'shop' ? <section className="game-collection-section">{sectionHeading('渔具', '永久鱼竿 · 按次消耗鱼饵')}
        <CollectionGrid className="fishing-equipment-grid">
          <CollectionCard className={`shop-item-card fishing-equipment-card${changedClass(FISHING_ROD.id)}`}>
            <span className="game-collection-card__corner"><span className="game-collection-card__qty">永久</span></span>
            {sprite(FISHING_ROD)}<div className="game-collection-card__name">{FISHING_ROD.name}</div><div className="fishing-catch-english" lang="en">{FISHING_ROD.englishName}</div><div className="game-collection-card__desc">买一次，所有钓点都能用。<br />赠送 5 次普通鱼饵。</div>
            {!state.hasRod && <div className="game-collection-card__price"><i className="fa-solid fa-coins" aria-hidden="true" />{FISHING_ROD.price} 金币</div>}
            <div className="game-collection-card__footer"><button type="button" className="game-primary-button" disabled={blocked || !stateLoaded || state.hasRod || playerGold < FISHING_ROD.price || !onPurchase} onClick={() => run(() => onPurchase(FISHING_ROD.id, 1), FISHING_ROD.id)}><i className={`fa-solid ${state.hasRod ? 'fa-check' : 'fa-cart-shopping'}`} aria-hidden="true" />{state.hasRod ? '已永久解锁' : '购买'}</button></div>
          </CollectionCard>
          {Object.values(FISHING_BAITS).map((item, index) => {
            const unlocked = isFishingBaitUnlocked(item, world, currentMapId)
            const disabled = blocked || !stateLoaded || !state.hasRod || !unlocked || playerGold < item.price || !onPurchase
            return <CollectionCard key={item.id} className={`shop-item-card fishing-equipment-card${!unlocked ? ' fishing-equipment-card--locked' : ''}${changedClass(item.id)}`}>
              <span className="game-collection-card__corner"><span key={updatedItem?.id === item.id ? updatedItem.key : 'idle'} className={`game-collection-card__qty${updatedItem?.id === item.id ? ' shop-item-card__qty-bump' : ''}`}>剩余 {state.baitUses[item.id] || 0} 次</span></span>
              {sprite(item)}<div className="game-collection-card__name">{item.name}</div><div className="fishing-catch-english" lang="en">{item.englishName}</div><div className="game-collection-card__meta">等级 {index + 1} · 每包 {item.uses} 次</div><div className="game-collection-card__desc">{BAIT_COPY[item.id]}</div>
              <details className="fishing-probability-details"><summary>鱼获概率</summary><div className="fishing-probabilities">{['common', 'uncommon', 'rare', 'epic', 'legendary', 'treasure', 'junk'].map((id, categoryIndex) => <span key={id}>{FISHING_TIERS[id]?.label || (id === 'treasure' ? '宝藏' : '杂物')}<b>{item.probabilities[categoryIndex]}%</b></span>)}</div><small>水域缺少的等级概率合并到较低等级。</small></details>
              {!unlocked && <div className="shop-item-card__hint">{item.requiredBossMapId ? `战胜${item.requiredBossMapId.includes('MistLake') ? '雾湖' : '海盗海岸'}首领后解锁` : `到达${item.requiredMapId?.includes('MistLake') ? '雾湖' : '海盗海岸'}后解锁`}</div>}
              {!state.hasRod && <div className="shop-item-card__hint">需先拥有钓鱼竿</div>}
              <div className="game-collection-card__price"><i className="fa-solid fa-coins" aria-hidden="true" />{item.price} 金币</div>
              <div className="game-collection-card__footer"><button type="button" className="game-primary-button" disabled={disabled} onClick={() => run(() => onPurchase(item.id, 1), item.id)}><i className="fa-solid fa-cart-shopping" aria-hidden="true" />购买</button></div>
            </CollectionCard>
          })}
        </CollectionGrid>
      </section> : tab === 'bait' ? <section className="game-collection-section">
        {sectionHeading('鱼饵', `可抛竿 ${Object.values(state.baitUses).reduce((total, uses) => total + uses, 0)} 次`)}
        <CollectionGrid>{ownedBaits.map((item) => {
          const stock = getFishingBaitStock(item.id, state.baitUses[item.id])
          return <CollectionCard key={item.id} className="shop-item-card fishing-bait-stock-card">
            {sprite(item)}<div className="game-collection-card__name">{item.name}</div><div className="fishing-catch-english" lang="en">{item.englishName}</div>
            <div className="game-collection-card__meta">每包 {item.uses} 次</div>
            <div className="fishing-bait-stock-count">{stock.packs > 0 ? `${stock.packs} 包` : ''}{stock.packs > 0 && stock.remainder > 0 ? ' + ' : ''}{stock.remainder > 0 ? `${stock.remainder} 次余饵` : ''}</div>
            <div className="fishing-bait-stock-uses">还能钓 <strong>{stock.uses}</strong> 次</div>
          </CollectionCard>
        })}</CollectionGrid>
        {!ownedBaits.length && <div className="game-collection-empty">没有鱼饵，去商店的渔具分栏补充吧。</div>}
      </section> : <>
        {sectionHeading(tab === 'dex' ? '水域图鉴' : tab === 'market' ? '鱼篓' : '鱼篓', tab === 'dex' ? `已发现 ${completed} / ${catches.length}` : tab === 'market' ? `共 ${totalCount} 件` : `共 ${totalCount} 件`)}
        {tab === 'basket' && <div className="fishing-panel-note"><i className="fa-solid fa-location-dot" aria-hidden="true" /><span>卖鱼请找地图鱼商：{merchantMaps}。</span></div>}
        {tab === 'market' && !merchant && <div className="fishing-panel-note">前往{merchantMaps}，与地图上的鱼商交易。</div>}
        {tab === 'market' && merchant && <div className="fishing-market-summary"><div><span>全部可售 · {saleTotals.quantity} 件</span><strong><i className="fa-solid fa-coins" aria-hidden="true" /> {saleTotals.gold.toLocaleString()} 金币</strong></div><button type="button" className="game-primary-button" disabled={blocked || saleTotals.quantity === 0 || !onSell} onClick={() => run(() => onSell({ merchantId, all: true }))}>{blocked ? '出售中…' : '一键全部出售'}</button></div>}
        <div className="fishing-filters">
          <div className="fishing-filter-row" role="group" aria-label="鱼获种类"><span>种类</span><div>{[['all', '全部'], ...Object.entries(KIND_LABEL)].map(([id, label]) => <button type="button" key={id} disabled={blocked} aria-pressed={filter === id} className={`fishing-filter-option${filter === id ? ' is-active' : ''}`} onClick={() => setFilter(id)}>{label}</button>)}</div></div>
          <div className="fishing-filter-row" role="group" aria-label="鱼获等级"><span>等级</span><div>{[['all', '全部'], ...Object.entries(FISHING_TIERS).map(([id, tier]) => [id, tier.label])].map(([id, label]) => <button type="button" key={id} disabled={blocked} aria-pressed={tierFilter === id} className={`fishing-filter-option${tierFilter === id ? ' is-active' : ''}`} onClick={() => setTierFilter(id)}>{label}</button>)}</div></div>
        </div>
        <CollectionGrid className="fishing-catch-grid">{entries.map((item) => {
          const discovered = !!state.records[item.id]?.count, quantity = item.quantity || 0, available = quantity
          const needsAppraisal = item.kind === 'treasure' && !item.price, canAppraise = merchant?.treasureIds.includes(item.id)
          const accepted = item.kind !== 'treasure' || canAppraise
          const locations = catchLocations(item)
          return <CollectionCard key={item.key || item.id} className={`shop-item-card fishing-catch-card${tab === 'dex' && !discovered ? ' is-undiscovered' : ''}${changedClass(item.key || item.id)}`}>
            {tab !== 'dex' && <span className="game-collection-card__corner"><span className="game-collection-card__qty">x{quantity}</span></span>}
            <div className="game-collection-card__sprite-wrap"><img src={item.sprite} alt={tab === 'dex' && !discovered ? '未发现的鱼获剪影' : item.name} className="game-collection-card__sprite" /></div>
            <div className="game-collection-card__name">{tab === 'dex' && !discovered ? '尚未发现' : item.name}</div>
            <div className="fishing-catch-english" lang="en">{tab === 'dex' && !discovered ? 'Undiscovered' : item.englishName}</div>
            <div className="game-collection-card__meta"><span className="fishing-tier-dot" style={{ background: FISHING_TIERS[item.tier]?.color }} />{FISHING_TIERS[item.tier]?.label} · {KIND_LABEL[item.kind]}</div>
            {tab === 'dex' ? <div className="fishing-catch-location"><div className="fishing-location-maps"><i className="fa-solid fa-location-dot" aria-hidden="true" />{locations.map((location) => <span key={location.map}>{location.map}</span>)}</div></div> : <div className="game-collection-card__price"><i className="fa-solid fa-coins" aria-hidden="true" />{needsAppraisal ? '待鉴定' : `${item.price} 金币 / 件`}</div>}
            {tab !== 'dex' && item.appraisalGrade && <div className="fishing-appraisal-grade" style={{ color: FISHING_APPRAISAL_GRADES[item.appraisalGrade]?.color }}>{FISHING_APPRAISAL_GRADES[item.appraisalGrade]?.label}宝藏</div>}
            {tab === 'market' && <div className="game-collection-card__footer fishing-catch-actions">
              {tab === 'market' && merchant && (needsAppraisal ? <button type="button" className="game-primary-button" disabled={blocked || !canAppraise || !onAppraise || !item.treasureIds?.length} onClick={() => run(() => onAppraise(merchantId, item.treasureIds[0]), item.key)}><i className="fa-solid fa-magnifying-glass" aria-hidden="true" />{canAppraise ? '免费鉴定' : '请找海岸鉴定师'}</button> : <div className="fishing-single-sale"><button type="button" className="game-primary-button" disabled={blocked || !accepted || available < 1 || !onSell} onClick={() => run(() => onSell({ merchantId, catchId: item.id, treasureId: item.treasureIds?.[0], quantity: 1, all: false }), item.key)}><i className="fa-solid fa-coins" aria-hidden="true" />{accepted ? '出售' : '本店不收'}</button></div>)}
            </div>}
          </CollectionCard>
        })}</CollectionGrid>
        {!entries.length && <div className="fishing-empty"><img src={FISHING_BASKET_SPRITE} alt="" /><h3>{owned.length || tab === 'dex' ? '没有符合条件的鱼获' : '鱼篓还空着'}</h3><p>{owned.length || tab === 'dex' ? '请选择其它种类或等级。' : '带上鱼竿和鱼饵，去水边试试吧。'}</p></div>}
      </>}
    </div>

  </section>
}
