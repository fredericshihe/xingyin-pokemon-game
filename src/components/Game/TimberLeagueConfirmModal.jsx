import React from 'react'
import { MONSTERS } from '../../utils/gameData.js'
import { TypeBadge } from './gameUiPrimitives.jsx'
import {
  calculateTimberLeagueStageGold,
  getTimberLeagueNextTeam, getTimberLeagueRoute,
  getTimberVoucherBalance,
  normalizeTimberLeagueState,
} from '../../game/timberLeague.js'

const MEDALS = [
  { key: 'gold', label: '金奖', icon: 'fa-trophy' },
  { key: 'silver', label: '银奖', icon: 'fa-medal' },
  { key: 'bronze', label: '铜奖', icon: 'fa-medal' },
]

const speciesById = new Map(MONSTERS.map((monster) => [monster.id, monster]))

export function TimberLeagueOpponentTeam({ team, title = '本场对手' }) {
  return <div className="timber-league-opponents">
    <strong>{title}</strong>
    <div className="timber-league-opponents__list">
      {team.map((entry, index) => {
        const monster = speciesById.get(entry.pokemonId)
        const types = [monster?.type, monster?.type2].filter(Boolean)
        return <div className={`timber-league-opponents__mon${index === 0 ? ' timber-league-opponents__mon--lead' : ''}`} key={`${entry.pokemonId}-${index}`}>
          <div className="timber-league-opponents__portrait">
            {monster?.sprite ? <img src={monster.sprite} alt="" loading="lazy" /> : <i className="fa-solid fa-circle-question" aria-hidden="true" />}
            {index === 0 && <b className="timber-league-opponents__lead">首发</b>}
          </div>
          <div className="timber-league-opponents__details">
            <span className="timber-league-opponents__name">{monster?.name || '宝可梦'}</span>
            <small>Lv.{entry.level}</small>
            <div className="timber-league-opponents__types" aria-label="属性">
              {types.map((type) => <TypeBadge key={type} type={type} small />)}
            </div>
          </div>
        </div>
      })}
    </div>
  </div>
}

export default function TimberLeagueConfirmModal({ leagueState, playerTeam = [], busy, onCancel, onConfirm }) {
  const route = getTimberLeagueRoute()
  const state = normalizeTimberLeagueState(leagueState)
  const opponentTeam = getTimberLeagueNextTeam(route.key, 1, state, playerTeam)
  const goldByTier = Object.fromEntries(MEDALS.map((medal) => [
    medal.key,
    calculateTimberLeagueStageGold(opponentTeam, medal.key, route.key)
  ]))
  return (
    <div className="reset-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="timber-league-title">
      <div className="timber-league-panel">
        <header className="timber-league-panel__header">
          <span className="timber-league-panel__emblem" aria-hidden="true"><i className="fa-solid fa-trophy" /></span>
          <span className="timber-league-panel__heading"><small>铁木计时员</small><h2 id="timber-league-title">训练联赛</h2></span>
          <span className="timber-league-panel__balance"><i className="fa-solid fa-ticket" aria-hidden="true" /> 凭证 {getTimberVoucherBalance(state)}</span>
        </header>

        <div className="timber-league-panel__content">
          <div className="timber-league-panel__goal">
            <div><small>一场挑战</small><strong>打赢 6 只对手</strong></div>
            <div><small>消耗能量</small><strong>{route.energyCost} 个</strong></div>
          </div>
          <TimberLeagueOpponentTeam team={opponentTeam} />
          <p className="timber-league-panel__route-hint">可回「队伍」调整首发。调队只变对手等级，种类和顺序不变；赢了才换阵容。</p>
          <p className="timber-league-panel__route-hint">等级逐只匹配，不满 6 只就按已有等级补齐，开打后固定。</p>

          <div className="timber-league-panel__section-label">赢得越快，凭证越多</div>
          <div className="timber-league-panel__rewards" aria-label="联赛奖牌奖励">
            {MEDALS.map((medal) => {
              return <div key={medal.key} className={`timber-league-panel__medal timber-league-panel__medal--${medal.key}`}>
                <i className={`fa-solid ${medal.icon}`} aria-hidden="true" />
                <strong>{medal.label}</strong>
                <span>{medal.key === 'gold' ? `${route.thresholds.gold} 回合内` : medal.key === 'silver' ? `${route.thresholds.gold + 1}~${route.thresholds.silver} 回合` : `${route.thresholds.silver + 1} 回合起`}</span>
                <b><i className="fa-solid fa-ticket" aria-hidden="true" /> {route.rewards[medal.key]} 张</b>
                <b className="timber-league-panel__medal-gold"><i className="fa-solid fa-coins" aria-hidden="true" /> {goldByTier[medal.key]} 金币</b>
              </div>
            })}
          </div>
          <p className="timber-league-panel__route-hint">每次赢都有凭证，不限每天领取次数。</p>

          <div className="timber-league-panel__how">
            <strong>怎么算回合？</strong><span>你每行动 1 次，就算 1 回合：</span>
            <div className="timber-league-panel__actions-list">
              <span><i className="fa-solid fa-bolt" aria-hidden="true" /> 出招</span>
              <span><i className="fa-solid fa-flask" aria-hidden="true" /> 喝药</span>
              <span><i className="fa-solid fa-right-left" aria-hidden="true" /> 自己换人</span>
            </div>
            <small>对手出招和被打倒后换人不算。</small>
          </div>

          <div className="timber-league-panel__reminders">
            <span><i className="fa-solid fa-coins" aria-hidden="true" /> 金币按奖牌档位发放</span>
            <span><i className="fa-solid fa-flask" aria-hidden="true" /> 只能用伤药，不能用战斗道具</span>
            <span><i className="fa-solid fa-people-group" aria-hidden="true" /> 对手不会喝药，每场最多主动换人 2 次</span>
          </div>
        </div>

        <footer className="timber-league-panel__footer">
          <button type="button" className="game-soft-button" disabled={busy} onClick={onCancel}>返回</button>
          <button type="button" className="game-primary-button" disabled={busy || opponentTeam.length === 0} onClick={() => onConfirm(route.key)}>
            {busy ? '进入中' : `开始挑战 · ${route.energyCost} 能量`}
          </button>
        </footer>
      </div>
    </div>
  )
}
