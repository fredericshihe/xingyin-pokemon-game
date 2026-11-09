import React, { useEffect, useState } from 'react'
import { MONSTERS } from '../../utils/gameData.js'
import { getPokemonBreederRefreshPrice } from '../../utils/pokemonBreeder.js'
import { POKEMON_PLACEHOLDER_URL } from '../../utils/mediaAssetUrl.js'
import './pokemonBreeder.css'

const formatGold = (amount) => Number(amount || 0).toLocaleString('zh-CN')

export default function PokemonBreederScreen({ state, playerGold, busy, onRefresh, onLock, onPurchase, onBack }) {
  const refreshPrice = getPokemonBreederRefreshPrice(state)
  const [confirmRefresh, setConfirmRefresh] = useState(false)
  const lockedCount = (state?.offers || []).filter((offer) => offer.locked && !offer.purchased).length
  const cannotRefresh = busy || !state || refreshPrice === null || playerGold < refreshPrice
  useEffect(() => { setConfirmRefresh(false) }, [state])

  return (
    <div className="game-page breeder-page">
      <div className="game-page-header">
        <div>
          <h2 className="game-page-title"><i className="fa-solid fa-heart text-rose-600" aria-hidden="true" />宝可梦饲养家</h2>
          <div className="game-page-subtitle">星雾高地 · 今日寄售 · 仅已解锁</div>
        </div>
        <div className="breeder-header-actions">
          <span className="adventure-chip"><i className="fa-solid fa-coins text-amber-500" aria-hidden="true" /> {formatGold(playerGold)}</span>
          <button type="button" onClick={onBack} disabled={Boolean(busy)} className="game-icon-button" title="返回地图" aria-label="返回地图">
            <i className="fa-solid fa-arrow-left" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="game-scroll-area breeder-content">
        <div className="breeder-toolbar">
          <span>已锁定 {lockedCount} 只 · 今日刷新 {state?.refreshCount || 0} 次</span>
          <button
            type="button"
            className="game-primary-button breeder-refresh-button"
            onClick={() => lockedCount > 0 ? setConfirmRefresh(true) : onRefresh()}
            disabled={cannotRefresh}
            title="全部换新，并解除所有锁定"
          >
            <i className={`fa-solid ${busy === 'refresh' ? 'fa-spinner fa-spin' : 'fa-rotate'}`} aria-hidden="true" />
            {refreshPrice === null ? '今日刷新已达上限' : `全部刷新 · ${formatGold(refreshPrice)} 金币`}
          </button>
        </div>
        <p className="breeder-rule"><i className="fa-solid fa-lock" aria-hidden="true" /> 只会出现已解锁的宝可梦；价格只看宝可梦等级，不看你的金币数量，等级越高价格越高，每只会有少量浮动。每天只换未锁定的，手动刷新会全部换新并解除锁定。</p>
        {confirmRefresh && (
          <div className="breeder-refresh-confirm" role="alert">
            <span>花费 {formatGold(refreshPrice)} 金币，换掉全部宝可梦并解锁？</span>
            <div>
              <button type="button" className="game-soft-button" onClick={() => setConfirmRefresh(false)} disabled={Boolean(busy)}>取消</button>
              <button type="button" className="game-primary-button" onClick={() => { setConfirmRefresh(false); onRefresh() }} disabled={cannotRefresh}>确认刷新</button>
            </div>
          </div>
        )}
        <div className="breeder-offers">
          {!state && <div className="breeder-loading" role="status">正在准备今日寄售...</div>}
          {(state?.offers || []).map((offer) => {
            const monster = MONSTERS.find((entry) => entry.id === offer.pokemonId)
            const cannotAfford = playerGold < offer.price
            const locked = offer.locked === true && !offer.purchased
            return (
              <article className={`breeder-offer ${offer.purchased ? 'breeder-offer--sold' : locked ? 'breeder-offer--locked' : ''}`} key={offer.id}>
                <div className="breeder-offer-image">
                  <img src={monster?.sprite || POKEMON_PLACEHOLDER_URL} alt={monster?.name || '宝可梦'} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = POKEMON_PLACEHOLDER_URL }} />
                </div>
                <div className="breeder-offer-info">
                  <h3>{monster?.name || `#${offer.pokemonId}`}</h3>
                  <span>Lv.{offer.level}</span>
                  {!offer.purchased && <span className={`breeder-lock-status ${locked ? 'breeder-lock-status--locked' : ''}`}>{locked ? '已锁定' : '每日换新'}</span>}
                </div>
                <button
                  type="button"
                  className="game-icon-button breeder-lock-button"
                  onClick={() => onLock(offer.id, !locked)}
                  disabled={Boolean(busy) || offer.purchased}
                  aria-pressed={locked}
                  aria-label={`${locked ? '解锁' : '锁定'}${monster?.name || '宝可梦'}`}
                  title={offer.purchased ? '已售出' : locked ? '解锁：下次每日换新不再保留' : '锁定：每日换新时保留'}
                >
                  <i className={`fa-solid ${busy === `lock:${offer.id}` ? 'fa-spinner fa-spin' : locked ? 'fa-lock' : 'fa-unlock'}`} aria-hidden="true" />
                </button>
                <div className="breeder-offer-actions">
                  <strong><i className="fa-solid fa-coins" aria-hidden="true" /> {formatGold(offer.price)}</strong>
                  <button
                    type="button"
                    className="game-primary-button"
                    onClick={() => onPurchase(offer.id)}
                    disabled={busy || offer.purchased || cannotAfford}
                  >
                    {offer.purchased ? '已售出' : busy === offer.id ? '购买中' : cannotAfford ? '金币不足' : '购买'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
