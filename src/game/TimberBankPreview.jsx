import React, { useMemo, useState } from 'react'
import TimberBankScreen from '../components/Game/TimberBankScreen'

const DAY_MS = 24 * 60 * 60 * 1000

function createHistory() {
  const today = new Date()
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today.getTime() - (29 - index) * DAY_MS)
    const wave = Math.sin(index / 3.3) * 7
    const drift = index * 0.8
    const price = 100 + wave + drift
    const previous = index === 0 ? 100 : 100 + Math.sin((index - 1) / 3.3) * 7 + (index - 1) * 0.8
    return { date: date.toISOString().slice(0, 10), price, changeBps: Math.round(((price / previous) - 1) * 10000) }
  })
}

export default function TimberBankPreview() {
  const [state, setState] = useState(() => ({
    walletGold: 14800,
    stableGold: 1200,
    stableTermEnd: new Date(Date.now() + 1.5 * DAY_MS).toISOString(),
    stableTermMatured: false,
    stableRateBps: 137,
    stableInterestHistory: [
      { amount: 15, date: new Date(Date.now() - 3 * DAY_MS).toISOString() },
      { amount: 16, date: new Date(Date.now() - 2 * DAY_MS).toISOString() },
      { amount: 16, date: new Date(Date.now() - DAY_MS).toISOString() }
    ],
    marketUnits: 86.42,
    marketCost: 6800,
    marketAveragePrice: 78.73,
    marketValue: 7420,
    marketUnrealizedPnl: 620,
    marketPrice: 108.31,
    marketChangeBps: 426,
    marketQuoteSlot: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    marketNextChangeAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    marketWaveHours: 4,
    marketSignal: 'pullback',
    marketVolatilityBps: 610,
    marketEventLabel: null,
    quoteDate: new Date().toISOString().slice(0, 10),
    history: createHistory(),
    ledger: [
      { action: 'market_buy', amount: 1200, walletDelta: -1200, date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
      { action: 'stable_interest', amount: 16, walletDelta: 0, date: new Date(Date.now() - DAY_MS).toISOString() },
      { action: 'stable_deposit', amount: 1200, walletDelta: -1200, date: new Date(Date.now() - 3 * DAY_MS).toISOString() }
    ]
  }))

  const playerGold = state.walletGold
  const previewTransaction = async (action, amount) => {
    setState((current) => {
      const next = { ...current, ledger: [{ action, amount: amount || current.stableGold, walletDelta: action.includes('buy') || action.includes('deposit') ? -amount : amount, date: new Date().toISOString() }, ...current.ledger] }
      if (action === 'market_buy') {
        const nextCost = current.marketCost + amount
        const nextUnits = current.marketUnits + amount / current.marketPrice
        const nextValue = current.marketValue + amount
        return { ...next, walletGold: current.walletGold - amount, marketCost: nextCost, marketValue: nextValue, marketUnits: nextUnits, marketAveragePrice: nextCost / nextUnits, marketUnrealizedPnl: nextValue - nextCost }
      }
      if (action === 'market_sell_all') return { ...next, walletGold: current.walletGold + current.marketValue, marketCost: 0, marketValue: 0, marketUnits: 0, marketAveragePrice: 0, marketUnrealizedPnl: 0 }
      if (action === 'market_sell') {
        const payout = Math.min(current.marketValue, amount)
        const soldUnits = Math.min(current.marketUnits, amount / current.marketPrice)
        const nextUnits = Math.max(0, current.marketUnits - soldUnits)
        const nextCost = Math.max(0, current.marketCost - Math.round(current.marketCost * soldUnits / Math.max(current.marketUnits, 1)))
        const nextValue = Math.max(0, current.marketValue - payout)
        return { ...next, walletGold: current.walletGold + payout, marketCost: nextCost, marketValue: nextValue, marketUnits: nextUnits, marketAveragePrice: nextUnits > 0 ? nextCost / nextUnits : 0, marketUnrealizedPnl: nextValue - nextCost }
      }
      if (action === 'stable_withdraw') return { ...next, walletGold: current.walletGold + current.stableGold, stableGold: 0, stableTermEnd: null, stableTermMatured: false }
      if (action === 'stable_renew') return { ...next, stableTermEnd: new Date(Date.now() + 3 * DAY_MS).toISOString(), stableTermMatured: false }
      if (action === 'stable_deposit') return { ...next, walletGold: current.walletGold - amount, stableGold: amount, stableTermEnd: new Date(Date.now() + 3 * DAY_MS).toISOString(), stableTermMatured: false }
      return current
    })
    return true
  }

  const previewState = useMemo(() => state, [state])
  return <TimberBankScreen state={previewState} playerGold={playerGold} busy={null} error="开发预览：交易只在本页面模拟，不会写入云端存档。" onRefresh={() => {}} onTransact={previewTransaction} onBack={() => {}} />
}
