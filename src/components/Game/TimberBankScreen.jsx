import React, { useEffect, useMemo, useState } from 'react'
import './timberBank.css'

const DAY_MS = 24 * 60 * 60 * 1000
const TERM_MS = 3 * DAY_MS

const gold = (value) => Math.floor(Number(value) || 0).toLocaleString('zh-CN')
const signedPercent = (bps) => `${Number(bps) > 0 ? '+' : ''}${(Number(bps || 0) / 100).toFixed(2)}%`
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function formatDate(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatCountdown(value, now) {
  const remaining = Math.max(0, new Date(value).getTime() - now)
  if (!Number.isFinite(remaining) || remaining <= 0) return '已到期'
  const days = Math.floor(remaining / DAY_MS)
  const hours = Math.floor((remaining % DAY_MS) / (60 * 60 * 1000))
  return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时后到期`
}

function formatQuoteCountdown(value, now) {
  const remaining = Math.max(0, new Date(value).getTime() - now)
  if (!Number.isFinite(remaining) || remaining <= 0) return '马上更新'
  const hours = Math.floor(remaining / (60 * 60 * 1000))
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000))
  return hours > 0 ? `${hours}小时${minutes}分后更新` : `${Math.max(1, minutes)}分钟后更新`
}

function formatQuoteTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })
}

function marketSignalText(signal) {
  return ({
    momentum_up: '顺风上涨',
    momentum_down: '顺风下跌',
    pullback: '短暂回调',
    range: '来回震荡',
    event: '出现小事件'
  })[signal] || '观察中'
}

function marketRiskText(volatilityBps) {
  const value = Number(volatilityBps || 0)
  if (value >= 760) return '波动较大'
  if (value >= 520) return '波动中等'
  return '波动较小'
}

const LEDGER_ACTION_TEXT = {
  stable_deposit: '存入稳稳存',
  stable_withdraw: '取出稳稳存',
  stable_renew: '本息续存',
  stable_interest: '每日利息',
  stable_interest_recalculated: '规则重算',
  market_buy: '买入商队',
  market_sell: '卖出商队',
  market_sell_all: '卖出全部商队',
  limit_buy_filled: '预约买入成交',
  limit_sell_filled: '预约卖出成交',
  limit_buy_cancelled: '撤销预约买入',
  limit_sell_cancelled: '撤销预约卖出'
}

function ledgerActionText(action) {
  return LEDGER_ACTION_TEXT[action] || '银行操作'
}

function ledgerIconClass(action) {
  if (action === 'stable_interest') return 'fa-piggy-bank'
  if (action === 'stable_interest_recalculated') return 'fa-rotate'
  if (action?.startsWith('market') || action?.startsWith('limit_sell')) return 'fa-route'
  if (action?.startsWith('limit_buy')) return 'fa-clock'
  return 'fa-piggy-bank'
}

function ledgerAmount(row) {
  const walletDelta = Number(row.walletDelta ?? 0)
  if (row.action === 'limit_sell_cancelled') {
    return `${Number(row.unitsDelta || 0).toFixed(2)} 份已解锁`
  }
  const amount = walletDelta !== 0 ? walletDelta : Number(row.amount || 0)
  return `${amount > 0 ? '+' : ''}${gold(amount)} 金币`
}

function Trend({ history }) {
  const points = useMemo(() => {
    const values = history.map((item) => Number(item.price)).filter(Number.isFinite)
    if (!values.length) return { line: '', area: '', last: { x: 34, y: 64 }, min: 0, max: 0, current: 0, start: '--', end: '--' }
    const minimum = Math.min(...values)
    const maximum = Math.max(...values)
    const span = Math.max(0.01, maximum - minimum)
    const coords = values.map((value, index) => ({ x: 34 + (index / Math.max(1, values.length - 1)) * 310, y: 112 - ((value - minimum) / span) * 88 }))
    const line = coords.map(({ x, y }) => `${x},${y}`).join(' ')
    return { line, area: `34,112 ${line} 344,112`, last: coords.at(-1), min: minimum, max: maximum, current: values.at(-1), start: history.at(0)?.date, end: history.at(-1)?.date }
  }, [history])
  const positive = Number(history.at(-1)?.changeBps || 0) >= 0
  const stroke = positive ? '#0f8b70' : '#c65b46'
  return <div className="timber-bank-chart-wrap">
    <div className="timber-bank-chart-head"><span><i className="fa-solid fa-chart-line" aria-hidden="true" /> 近30个价格点</span><b className={positive ? 'timber-bank-up' : 'timber-bank-down'}>{signedPercent(history.at(-1)?.changeBps)}</b></div>
    <svg className="timber-bank-trend" viewBox="0 0 360 142" role="img" aria-label="营地商队价格趋势">
      {[16, 48, 80, 112].map((y) => <line key={y} x1="34" x2="344" y1={y} y2={y} className="timber-bank-chart-grid" />)}
      {[34, 189, 344].map((x) => <line key={x} x1={x} x2={x} y1="16" y2="112" className="timber-bank-chart-grid timber-bank-chart-grid--vertical" />)}
      <text x="3" y="20" className="timber-bank-chart-axis">{points.max.toFixed(0)}</text>
      <text x="3" y="116" className="timber-bank-chart-axis">{points.min.toFixed(0)}</text>
      <path d={`M${points.area}`} fill={stroke} opacity=".1" />
      {points.line && <polyline points={points.line} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      <circle cx={points.last.x} cy={points.last.y} r="5" fill={stroke} stroke="#fff" strokeWidth="2.5" />
      <text x="344" y={Math.max(22, points.last.y - 9)} textAnchor="end" className="timber-bank-chart-current" fill={stroke}>{points.current.toFixed(0)}</text>
      <text x="34" y="135" className="timber-bank-chart-axis">{formatQuoteTime(points.start)}</text>
      <text x="344" y="135" textAnchor="end" className="timber-bank-chart-axis">{formatQuoteTime(points.end)}</text>
    </svg>
  </div>
}

function ProductIcon({ type }) {
  return <span className={`timber-bank-product-icon timber-bank-product-icon--${type}`} aria-hidden="true"><i className={`fa-solid ${type === 'stable' ? 'fa-piggy-bank' : 'fa-route'}`} /><b>{type === 'stable' ? '＋' : '↗'}</b></span>
}

function QuickAmount({ value, active, onClick, disabled }) {
  return <button type="button" className={`timber-bank-quick-amount ${active ? 'is-active' : ''}`} onClick={() => onClick(value)} disabled={disabled}>{gold(value)}</button>
}

function StableInterestChart({ ledger, interestHistory, stableRate, stableGold, stableRemaining }) {
  const points = useMemo(() => {
    const source = Array.isArray(interestHistory) && interestHistory.length
      ? interestHistory
      : (Array.isArray(ledger) ? ledger.filter((row) => row?.action === 'stable_interest') : [])
    const rows = source
      .filter((row) => Number(row.amount) > 0)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
      .slice(-7)
    const values = rows.map((row) => Math.max(0, Number(row.amount) || 0))
    const minimum = Math.min(0, ...values)
    const maximum = Math.max(1, ...values)
    const span = Math.max(1, maximum - minimum)
    const coords = values.map((value, index) => ({
      x: 34 + (index / Math.max(1, values.length - 1)) * 310,
      y: 112 - ((value - minimum) / span) * 88,
      value,
      date: formatDate(rows[index]?.date).split(' ')[0] || '--'
    }))
    const line = coords.map(({ x, y }) => `${x},${y}`).join(' ')
    return {
      rows,
      line,
      area: coords.length ? `34,112 ${line} 344,112` : '',
      last: coords.at(-1) || { x: 34, y: 112 },
      min: minimum,
      max: maximum,
      current: values.at(-1) || 0,
      total: values.reduce((sum, value) => sum + value, 0),
      start: coords.at(0)?.date || '--',
      end: coords.at(-1)?.date || '--'
    }
  }, [ledger, interestHistory])
  const hasData = points.rows.length > 0
  const stroke = '#2f896d'
  return <section className="timber-bank-stable-chart timber-bank-chart-wrap" aria-label="稳稳存收益趋势">
    <div className="timber-bank-chart-head"><span><i className="fa-solid fa-piggy-bank" aria-hidden="true" /> 稳稳存收益走势</span><b className="timber-bank-up">+{stableRate.toFixed(2)}% / 天</b></div>
    <div className="timber-bank-stable-summary">
      <div><span>存单余额</span><strong>{gold(stableGold)}</strong></div>
      <div><span>最近收益</span><strong className="timber-bank-up">+{gold(points.current)}</strong></div>
      <div><span>本期累计</span><strong className="timber-bank-up">+{gold(points.total)}</strong></div>
      <div><span>存单状态</span><strong>{stableRemaining}</strong></div>
    </div>
    {hasData ? <svg className="timber-bank-trend timber-bank-stable-trend" viewBox="0 0 360 142" role="img" aria-label="稳稳存最近每日收益趋势">
      {[16, 48, 80, 112].map((y) => <line key={y} x1="34" x2="344" y1={y} y2={y} className="timber-bank-chart-grid" />)}
      {[34, 189, 344].map((x) => <line key={x} x1={x} x2={x} y1="16" y2="112" className="timber-bank-chart-grid timber-bank-chart-grid--vertical" />)}
      <text x="3" y="20" className="timber-bank-chart-axis">{points.max.toFixed(0)}</text>
      <text x="3" y="116" className="timber-bank-chart-axis">{points.min.toFixed(0)}</text>
      <path d={`M${points.area}`} fill={stroke} opacity=".1" />
      <polyline points={points.line} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points.last.x} cy={points.last.y} r="5" fill={stroke} stroke="#fff" strokeWidth="2.5" />
      <text x="344" y={Math.max(22, points.last.y - 9)} textAnchor="end" className="timber-bank-chart-current" fill={stroke}>{points.current.toFixed(0)}</text>
      <text x="34" y="135" className="timber-bank-chart-axis">{points.start}</text>
      <text x="344" y="135" textAnchor="end" className="timber-bank-chart-axis">{points.end}</text>
    </svg> : <div className="timber-bank-interest-empty"><i className="fa-solid fa-chart-line" aria-hidden="true" /><span>存入后会显示每天的收益走势</span></div>}
  </section>
}

export default function TimberBankScreen({ state, playerGold, busy, error, onRefresh, onTransact, onLimitOrder, onCancelOrder, onBack }) {
  const [stableAmount, setStableAmount] = useState('')
  const [marketAmount, setMarketAmount] = useState('')
  const [marketMode, setMarketMode] = useState('buy')
  const [productTab, setProductTab] = useState('stable')
  const [limitSide, setLimitSide] = useState('buy')
  const [limitPrice, setLimitPrice] = useState('')
  const [limitAmount, setLimitAmount] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const history = Array.isArray(state?.history) ? state.history : []
  const stable = Math.floor(Number(state?.stableGold) || 0)
  const wallet = Math.floor(Number(state?.walletGold ?? playerGold) || 0)
  const marketValue = Math.floor(Number(state?.marketValue) || 0)
  const marketCost = Math.floor(Number(state?.marketCost) || 0)
  const marketProfit = Number(state?.marketUnrealizedPnl ?? (marketValue - marketCost))
  const marketUnits = Number(state?.marketUnits || 0)
  const marketReservedUnits = Number(state?.marketReservedUnits || 0)
  const marketAvailableUnits = Number(state?.marketAvailableUnits ?? Math.max(0, marketUnits - marketReservedUnits))
  const marketAvailableValue = Math.floor(marketAvailableUnits * Number(state?.marketPrice || 0))
  const marketAveragePrice = Number(state?.marketAveragePrice ?? (marketUnits > 0 ? marketCost / marketUnits : 0))
  const marketChange = Number(state?.marketChangeBps || 0)
  const marketQuoteSlot = state?.marketQuoteSlot
  const marketNextChangeAt = state?.marketNextChangeAt
  const marketSignal = state?.marketSignal
  const marketRisk = marketRiskText(state?.marketVolatilityBps)
  const marketEventLabel = state?.marketEventLabel
  const stableRate = Number(state?.stableRateBps || 0) / 100
  const stableInput = Number(stableAmount)
  const marketInput = Number(marketAmount)
  const validStable = Number.isSafeInteger(stableInput) && stableInput > 0
  const validMarket = Number.isSafeInteger(marketInput) && marketInput > 0
  const limitPriceInput = Number(limitPrice)
  const limitAmountInput = Number(limitAmount)
  const validLimit = Number.isFinite(limitPriceInput) && limitPriceInput > 0
    && Number.isFinite(limitAmountInput) && limitAmountInput > 0
    && (limitSide === 'sell' || Number.isSafeInteger(limitAmountInput))
    && (limitSide === 'buy' ? limitAmountInput <= wallet : limitAmountInput <= marketAvailableUnits)
  const stableActive = Boolean(state?.stableTermEnd)
  const stableMatured = stableActive && (Boolean(state?.stableTermMatured) || now >= Date.parse(state.stableTermEnd))
  const stableRemaining = stableActive && !stableMatured ? formatCountdown(state.stableTermEnd, now) : stableMatured ? '已到期，可处理' : '还没有存单'
  const stableProgress = stableActive ? stableMatured ? 100 : clamp(100 - ((Date.parse(state.stableTermEnd) - now) / TERM_MS) * 100, 4, 96) : 0
  const stableInterestPreview = validStable ? Math.floor(stableInput * stableRate / 100) : 0
  const marketPreview = validMarket ? marketMode === 'buy' ? marketInput : Math.min(marketAvailableValue, marketInput) : 0
  const quickMarketAmounts = marketMode === 'buy' ? [1000, 5000, 10000] : [Math.max(1, Math.floor(marketAvailableValue * .25)), Math.max(1, Math.floor(marketAvailableValue * .5)), Math.max(1, marketAvailableValue)]

  const trade = async (action, amount) => {
    const ok = await onTransact(action, amount)
    if (ok) {
      if (action.startsWith('stable')) setStableAmount('')
      else setMarketAmount('')
    }
  }

  const placeLimitOrder = async () => {
    if (!validLimit || !onLimitOrder) return
    const ok = await onLimitOrder(limitSide, limitPriceInput, limitAmountInput)
    if (ok) {
      setLimitPrice('')
      setLimitAmount('')
    }
  }

  return <div className="game-page timber-bank-page">
    <div className="game-page-header timber-bank-header">
      <div><h2 className="game-page-title"><i className="fa-solid fa-building-columns" aria-hidden="true" /> 铁木银行</h2><div className="game-page-subtitle">铁木营地 · {state?.quoteDate || '今日行情'}</div></div>
      <div className="timber-bank-header-actions"><button type="button" className="game-icon-button" title="更新余额和行情" aria-label="更新余额和行情" onClick={onRefresh} disabled={Boolean(busy)}><i className={`fa-solid ${busy === 'loading' ? 'fa-spinner fa-spin' : 'fa-rotate'}`} aria-hidden="true" /></button><button type="button" className="game-icon-button" title="返回地图" aria-label="返回地图" onClick={onBack} disabled={Boolean(busy)}><i className="fa-solid fa-arrow-left" aria-hidden="true" /></button></div>
    </div>

    <div className="game-scroll-area timber-bank-content">
      <section className="timber-bank-intro" aria-label="银行总览">
        <div className="timber-bank-intro-art" aria-hidden="true"><span className="timber-bank-art-coin timber-bank-art-coin--one"><i className="fa-solid fa-coins" /></span><span className="timber-bank-art-coin timber-bank-art-coin--two"><i className="fa-solid fa-coins" /></span><span className="timber-bank-art-roof" /><span className="timber-bank-art-door" /></div>
        <div className="timber-bank-intro-copy"><span className="timber-bank-eyebrow"><i className="fa-solid fa-sparkles" aria-hidden="true" /> 今日账本</span><h3>让金币先去工作</h3><p>一眼看清可用金币、锁定中的存单和商队今日涨跌。</p></div>
        <div className="timber-bank-wallet"><span>可用金币</span><strong><i className="fa-solid fa-coins" aria-hidden="true" /> {gold(wallet)}</strong><small>随时可以使用</small></div>
      </section>

      {error && <div className="timber-bank-error" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}</div>}
      {!state ? <div className="timber-bank-loading" role="status"><i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> 正在打开银行账本...</div> : <>
        <div className="timber-bank-product-tabs" role="tablist" aria-label="选择理财方式">
          <button type="button" role="tab" aria-selected={productTab === 'stable'} className={`timber-bank-product-tab timber-bank-product-tab--stable ${productTab === 'stable' ? 'is-active' : ''}`} onClick={() => setProductTab('stable')}>
            <span className="timber-bank-tab-icon"><i className="fa-solid fa-piggy-bank" aria-hidden="true" /></span>
            <span><b>稳稳存</b><small><i className="fa-solid fa-arrow-up" aria-hidden="true" /> +{stableRate.toFixed(2)}% / 天</small></span>
            <i className="fa-solid fa-chevron-right timber-bank-tab-arrow" aria-hidden="true" />
          </button>
          <button type="button" role="tab" aria-selected={productTab === 'market'} className={`timber-bank-product-tab timber-bank-product-tab--market ${productTab === 'market' ? 'is-active' : ''}`} onClick={() => setProductTab('market')}>
            <span className="timber-bank-tab-icon"><i className="fa-solid fa-route" aria-hidden="true" /></span>
            <span><b>商队计划</b><small className={marketChange < 0 ? 'timber-bank-down' : 'timber-bank-up'}><i className={`fa-solid ${marketChange < 0 ? 'fa-arrow-trend-down' : 'fa-arrow-trend-up'}`} aria-hidden="true" /> {signedPercent(marketChange)}</small></span>
            <i className="fa-solid fa-chevron-right timber-bank-tab-arrow" aria-hidden="true" />
          </button>
        </div>
        <div className="timber-bank-products">
          <section className={`timber-bank-product timber-bank-stable ${productTab === 'stable' ? 'is-active' : ''}`} aria-hidden={productTab !== 'stable'}>
            <div className="timber-bank-product-head"><ProductIcon type="stable" /><div><span className="timber-bank-product-kicker">稳健成长</span><h3>铁木稳稳存</h3><p>金币每天长一点</p></div><span className="timber-bank-product-badge"><i className="fa-solid fa-lock" aria-hidden="true" /> 3天</span></div>
            <div className="timber-bank-stable-visual"><div className="timber-bank-balance-block"><span>账面金币</span><strong>{gold(stable)}</strong><small>按全部本金计息</small></div><div className="timber-bank-term-visual"><div className="timber-bank-term-track"><i style={{ width: `${stableProgress}%` }} /></div><div><span>{stableActive ? (stableMatured ? '本期完成' : '正在积累') : '存入后开始计时'}</span><b>{stableRemaining}</b></div></div></div>
            <div className="timber-bank-rule-strip"><span><i className="fa-solid fa-arrow-up" aria-hidden="true" /> 只增不减</span><span><i className="fa-solid fa-lock" aria-hidden="true" /> 到期再取</span><span><i className="fa-solid fa-calendar" aria-hidden="true" /> 3天</span></div>
            {!stableActive && <><label className="timber-bank-input-label" htmlFor="stable-bank-amount">准备存入</label><div className="timber-bank-input-row"><input id="stable-bank-amount" type="number" min="1" step="1" inputMode="numeric" value={stableAmount} onChange={(event) => setStableAmount(event.target.value)} placeholder="输入金币" disabled={Boolean(busy)} /><span>金币</span></div><div className="timber-bank-quick-row"><QuickAmount value={Math.min(wallet, 500)} active={stableInput === Math.min(wallet, 500)} onClick={(value) => setStableAmount(String(value))} disabled={!wallet || Boolean(busy)} /><QuickAmount value={Math.min(wallet, 1000)} active={stableInput === Math.min(wallet, 1000)} onClick={(value) => setStableAmount(String(value))} disabled={!wallet || Boolean(busy)} /><QuickAmount value={Math.min(wallet, 10000)} active={stableInput === Math.min(wallet, 10000)} onClick={(value) => setStableAmount(String(value))} disabled={!wallet || Boolean(busy)} /></div></>}
            {validStable && !stableActive && <div className="timber-bank-preview"><span>按今日利率，今日计息约</span><strong>+{gold(stableInterestPreview)} 金币</strong></div>}
            <div className="timber-bank-actions">{!stableActive ? <button type="button" className="game-primary-button" disabled={Boolean(busy) || !validStable || stableInput > wallet} onClick={() => trade('stable_deposit', stableInput)}><i className="fa-solid fa-lock" aria-hidden="true" /> 存入并锁定</button> : <><button type="button" className="game-soft-button" disabled={Boolean(busy) || !stableMatured} onClick={() => trade('stable_withdraw', 0)}><i className="fa-solid fa-hand-holding-dollar" aria-hidden="true" /> 整笔取出</button><button type="button" className="game-primary-button" disabled={Boolean(busy) || !stableMatured} onClick={() => trade('stable_renew', 0)}><i className="fa-solid fa-rotate" aria-hidden="true" /> 本息续存</button></>}</div>
            <StableInterestChart ledger={state.ledger} interestHistory={state.stableInterestHistory} stableRate={stableRate} stableGold={stable} stableRemaining={stableRemaining} />
          </section>

          <section className={`timber-bank-product timber-bank-market ${productTab === 'market' ? 'is-active' : ''}`} aria-hidden={productTab !== 'market'}>
            <div className="timber-bank-product-head"><ProductIcon type="market" /><div><span className="timber-bank-product-kicker">灵活买卖</span><h3>营地商队计划</h3><p className={marketChange < 0 ? 'timber-bank-down' : 'timber-bank-up'}>每4小时更新一次</p></div><span className={`timber-bank-product-badge ${marketChange < 0 ? 'is-down' : ''}`}><i className={`fa-solid ${marketChange < 0 ? 'fa-arrow-trend-down' : 'fa-arrow-trend-up'}`} aria-hidden="true" /> {signedPercent(marketChange)}</span></div>
            <div className="timber-bank-market-signals"><span><i className="fa-solid fa-compass" aria-hidden="true" /> {marketSignalText(marketSignal)}</span><span><i className="fa-solid fa-wave-square" aria-hidden="true" /> {marketRisk}</span>{marketEventLabel && <span className="is-event"><i className="fa-solid fa-bolt" aria-hidden="true" /> {marketEventLabel}</span>}</div>
            <div className="timber-bank-market-hero"><div><span>我的仓位现值</span><strong>{gold(marketValue)}</strong><small className={marketProfit < 0 ? 'timber-bank-down' : 'timber-bank-up'}>{marketProfit >= 0 ? '赚 ' : '亏 '}{gold(Math.abs(marketProfit))} 金币</small></div><div className="timber-bank-market-price"><span>当前价格</span><b>{Number(state.marketPrice || 0).toFixed(2)}</b><em className={marketChange < 0 ? 'timber-bank-down' : 'timber-bank-up'}>{signedPercent(marketChange)}</em><small>{formatQuoteCountdown(marketNextChangeAt, now)}</small></div></div>
            <div className="timber-bank-position-grid"><div><span>实际份额</span><strong>{marketUnits.toFixed(2)}</strong></div><div><span>可用份额</span><strong>{marketAvailableUnits.toFixed(2)}</strong></div><div><span>持仓均价</span><strong>{marketAveragePrice > 0 ? marketAveragePrice.toFixed(2) : '--'}</strong></div><div><span>投入本金</span><strong>{gold(marketCost)}</strong></div><div><span>当前赚亏</span><strong className={marketProfit < 0 ? 'timber-bank-down' : 'timber-bank-up'}>{marketProfit >= 0 ? '+' : ''}{gold(marketProfit)}</strong></div></div>
            <Trend history={history} />
            <div className="timber-bank-market-meta"><span>本波开始 {formatQuoteTime(marketQuoteSlot)} · 下一波 {formatQuoteTime(marketNextChangeAt)}</span><span>{history.length} 个四小时价格点</span></div>
            <button type="button" className="timber-bank-history-toggle" onClick={() => setHistoryOpen((open) => !open)} aria-expanded={historyOpen}><i className={`fa-solid fa-chevron-${historyOpen ? 'up' : 'down'}`} aria-hidden="true" /> {historyOpen ? '收起趋势明细' : '展开最近价格走势'}</button>
            {historyOpen && <div className="timber-bank-history">{history.slice().reverse().map((item) => <div key={item.date}><span>{item.date}</span><b className={Number(item.changeBps) < 0 ? 'timber-bank-down' : 'timber-bank-up'}>{signedPercent(item.changeBps)}</b><strong>{Number(item.price).toFixed(2)}</strong></div>)}</div>}
            <div className="timber-bank-rule-strip timber-bank-rule-strip--market"><span><i className="fa-solid fa-arrows-left-right" aria-hidden="true" /> 随时买卖</span><span><i className="fa-solid fa-chart-line" aria-hidden="true" /> 看趋势</span><span><i className="fa-solid fa-clock" aria-hidden="true" /> 4小时一波</span></div>
            <div className="timber-bank-trade-switch" role="tablist" aria-label="商队操作"><button type="button" role="tab" aria-selected={marketMode === 'buy'} className={marketMode === 'buy' ? 'is-active' : ''} onClick={() => { setMarketMode('buy'); setMarketAmount('') }}>买入</button><button type="button" role="tab" aria-selected={marketMode === 'sell'} className={marketMode === 'sell' ? 'is-active' : ''} onClick={() => { setMarketMode('sell'); setMarketAmount('') }}>卖出</button></div>
            <label className="timber-bank-input-label" htmlFor="market-bank-amount">{marketMode === 'buy' ? '准备投入' : '准备取回'}</label><div className="timber-bank-input-row"><input id="market-bank-amount" type="number" min="1" step="1" inputMode="numeric" value={marketAmount} onChange={(event) => setMarketAmount(event.target.value)} placeholder="输入金币" disabled={Boolean(busy)} /><span>金币</span></div><div className="timber-bank-quick-row">{quickMarketAmounts.map((value, index) => <QuickAmount key={`${marketMode}-${index}`} value={value} active={marketInput === value} onClick={(next) => setMarketAmount(String(next))} disabled={Boolean(busy) || (marketMode === 'sell' && marketAvailableValue <= 0)} />)}</div>
            {validMarket && <div className="timber-bank-preview"><span>{marketMode === 'buy' ? '本次将投入' : '本次最多取回'}</span><strong>{gold(marketPreview)} 金币</strong></div>}
            <div className="timber-bank-actions"><button type="button" className="game-primary-button" disabled={Boolean(busy) || !validMarket || (marketMode === 'buy' ? marketInput > wallet : marketAvailableValue <= 0)} onClick={() => trade(marketMode === 'buy' ? 'market_buy' : 'market_sell', marketInput)}><i className={`fa-solid ${marketMode === 'buy' ? 'fa-cart-plus' : 'fa-hand-holding-dollar'}`} aria-hidden="true" /> {marketMode === 'buy' ? '买入份额' : '卖出部分'}</button><button type="button" className="game-soft-button" onClick={() => trade('market_sell_all', 0)} disabled={Boolean(busy) || marketReservedUnits > 0 || marketUnits <= 0}><i className="fa-solid fa-box-open" aria-hidden="true" /> {marketReservedUnits > 0 ? '先撤销预约' : '全部卖出'}</button></div>

            <div className="timber-bank-limit-box">
              <div className="timber-bank-limit-head"><div><span className="timber-bank-section-kicker">想等一等？</span><h4>预约买卖</h4></div><span>行情更新时自动成交</span></div>
              <div className="timber-bank-limit-switch" role="tablist" aria-label="预约方向"><button type="button" role="tab" aria-selected={limitSide === 'buy'} className={limitSide === 'buy' ? 'is-active' : ''} onClick={() => { setLimitSide('buy'); setLimitAmount('') }}>预约买入</button><button type="button" role="tab" aria-selected={limitSide === 'sell'} className={limitSide === 'sell' ? 'is-active' : ''} onClick={() => { setLimitSide('sell'); setLimitAmount('') }}>预约卖出</button></div>
              <div className="timber-bank-limit-fields"><label className="timber-bank-input-label" htmlFor="timber-limit-price">目标价格</label><div className="timber-bank-input-row"><input id="timber-limit-price" type="number" min="0.01" step="0.01" inputMode="decimal" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value)} placeholder="例如 95" disabled={Boolean(busy)} /><span>每份</span></div><label className="timber-bank-input-label" htmlFor="timber-limit-amount">{limitSide === 'buy' ? '锁定金币' : '卖出份额'}</label><div className="timber-bank-input-row"><input id="timber-limit-amount" type="number" min="0.01" step={limitSide === 'buy' ? '1' : '0.01'} inputMode="decimal" value={limitAmount} onChange={(event) => setLimitAmount(event.target.value)} placeholder={limitSide === 'buy' ? '准备投入多少金币' : '准备卖出多少份'} disabled={Boolean(busy)} /><span>{limitSide === 'buy' ? '金币' : '份'}</span></div></div>
              <p className="timber-bank-limit-hint">{limitSide === 'buy' ? `价格跌到目标价会买入，先锁定 ${limitAmountInput > 0 ? gold(limitAmountInput) : '相应'} 金币。` : `价格涨到目标价会卖出，当前可预约 ${marketAvailableUnits.toFixed(2)} 份。`}</p>
              <button type="button" className="game-primary-button timber-bank-limit-submit" disabled={Boolean(busy) || !validLimit} onClick={placeLimitOrder}><i className="fa-solid fa-clock" aria-hidden="true" /> {limitSide === 'buy' ? '挂出买单' : '挂出卖单'}</button>
              {Array.isArray(state.limitOrders) && state.limitOrders.length > 0 && <div className="timber-bank-open-orders"><div className="timber-bank-open-orders-title"><span>我的预约单</span><small>{state.limitOrders.length}/5</small></div>{state.limitOrders.map((order) => <div className="timber-bank-order-row" key={order.id}><div><strong>{order.side === 'buy' ? '买入' : '卖出'} · {Number(order.targetPrice).toFixed(2)}</strong><small>{order.side === 'buy' ? `${gold(order.amountGold)} 金币已锁定` : `${Number(order.amountUnits).toFixed(2)} 份已锁定`} · {formatDate(order.createdAt)}</small></div><button type="button" className="game-soft-button" onClick={() => onCancelOrder?.(order.id)} disabled={Boolean(busy)}><i className="fa-solid fa-xmark" aria-hidden="true" /> 撤单</button></div>)}</div>}
            </div>
          </section>
        </div>

        <section className="timber-bank-records"><div className="timber-bank-records-head"><div><span className="timber-bank-section-kicker">最近发生</span><h3>账本记录</h3></div><span>{(state.ledger || []).length} 笔</span></div>{(state.ledger || []).length ? state.ledger.map((row, index) => { const walletDelta = Number(row.walletDelta ?? 0); const isUnlock = row.action === 'limit_sell_cancelled'; const isStableInterest = row.action === 'stable_interest'; const isStableRecalculated = row.action === 'stable_interest_recalculated'; return <div className="timber-bank-ledger-row" key={`${row.date}-${index}`}><span className={`timber-bank-ledger-icon ${isStableInterest ? 'is-interest' : isStableRecalculated ? 'is-recalculated' : ''}`}><i className={`fa-solid ${ledgerIconClass(row.action)}`} aria-hidden="true" /></span><div><strong>{isStableInterest ? '稳稳存 · 每日利息' : isStableRecalculated ? '稳稳存 · 规则重算' : ledgerActionText(row.action)}</strong><small>{isUnlock ? `${Number(row.unitsDelta || 0).toFixed(2)} 份已解锁 · ${formatDate(row.date)}` : formatDate(row.date)}</small></div><b className={walletDelta > 0 || isStableInterest || (isStableRecalculated && Number(row.amount) > 0) ? 'timber-bank-up' : walletDelta < 0 || isStableRecalculated ? 'timber-bank-down' : ''}>{isStableInterest ? `+${gold(row.amount)} 金币` : ledgerAmount(row)}</b></div> }) : <p>第一笔交易会记在这里。</p>}</section>
      </>}
    </div>
  </div>
}
