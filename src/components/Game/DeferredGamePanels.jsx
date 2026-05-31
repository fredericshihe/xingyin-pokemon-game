import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EXP_POTIONS, MOVES, OFFICIAL_DEX_MONSTERS, POKEBALLS, POTIONS } from '../../utils/gameData'
import {
  getInventoryItemQuantity,
  hasPotionCurableStatus,
  getPotionEffectParts,
  getPotionEffectText,
  getPotionRecoveryProfile,
  resolveInventoryItemDetails,
  resolveInventoryItemType,
  sortInventorySlots,
} from '../../utils/inventoryItems'
import { getEvolutionLevelForBranch } from '../../utils/pokemonGrowth'
import { MAX_PARTY_SIZE, MAX_STORAGE_SIZE } from '../../utils/pokemonRoster'
import { applyImageFallback, handlePokemonImageError } from '../../utils/localAssetPreloader'
import { CollectionCard, CollectionGrid, TypeBadge } from './gameUiPrimitives'
import { assetUrl } from '../../utils/assetUrl'
import { gameAudio } from '../../utils/gameAudio'

const POKEMON_LOCAL_PLACEHOLDER = assetUrl('/assets/pokemon/placeholder.svg')
const SHOP_PURCHASE_FEEDBACK_MS = 1250
const HEAL_ANIMATION_DURATION_MS = 950
const EXP_ANIMATION_DURATION_MS = 1150

const STATUS_LABELS = {
  sleep: '睡眠',
  poison: '中毒',
  burn: '灼伤',
  paralysis: '麻痹',
  freeze: '冰冻',
  confusion: '混乱',
  flinch: '畏缩'
}

const STATUS_BATTLE_HINTS = {
  sleep: '醒来前无法行动',
  poison: '每回合损失体力',
  burn: '每回合损失体力',
  paralysis: '可能无法行动，速度降低',
  freeze: '每回合尝试解冻',
  confusion: '可能攻击自己',
  flinch: '本回合无法行动'
}

const getStatusBadgeMeta = (status) => {
  const meta = {
    sleep: { label: '眠', className: 'battle-status-sleep' },
    poison: { label: '毒', className: 'battle-status-poison' },
    burn: { label: '灼', className: 'battle-status-burn' },
    paralysis: { label: '麻', className: 'battle-status-paralysis' },
    freeze: { label: '冻', className: 'battle-status-freeze' },
    confusion: { label: '乱', className: 'battle-status-confusion' },
    flinch: { label: '畏', className: 'battle-status-flinch' }
  }[status]
  if (!meta) return null
  return {
    ...meta,
    fullLabel: STATUS_LABELS[status] || status,
    hint: STATUS_BATTLE_HINTS[status] || '状态异常'
  }
}

const getPokemonStatusSummary = (mon) => {
  const meta = getStatusBadgeMeta(mon?.status)
  if (!meta) return null
  const sleepTurns = mon?.status === 'sleep' ? Math.max(0, Math.trunc(Number(mon?.statusTurns) || 0)) : 0
  return {
    ...meta,
    hint: sleepTurns > 0 ? `${meta.hint}，约${sleepTurns}回合` : meta.hint
  }
}

const PokemonStatusBadges = ({
  monster,
  compact = true,
  showNormal = false,
  className = ''
}) => {
  const status = getPokemonStatusSummary(monster)
  const classes = [
    'pokemon-status-badges',
    compact ? 'pokemon-status-badges--compact' : 'pokemon-status-badges--full',
    !status ? 'pokemon-status-badges--normal' : '',
    className
  ].filter(Boolean).join(' ')

  if (!status) {
    if (!showNormal) return null
    return (
      <div className={classes} aria-label={`${monster?.name || '宝可梦'}状态正常`} title="状态正常">
        <span className="pokemon-status-normal">
          <i className="fa-solid fa-circle-check"></i>
          状态正常
        </span>
      </div>
    )
  }

  const label = `${monster?.name || '宝可梦'}异常状态：${status.fullLabel}，${status.hint}`

  return (
    <div className={classes} aria-label={label} title={`${status.fullLabel} · ${status.hint}`}>
      <span className={`battle-status-badge ${compact ? 'battle-status-badge--tiny' : ''} ${status.className}`}>
        {status.label}
      </span>
      {!compact && (
        <span className="pokemon-status-badges__text">
          <strong>{status.fullLabel}</strong>
          <em>{status.hint}</em>
        </span>
      )}
    </div>
  )
}

const STAT_LABELS = {
  atk: '攻击',
  def: '防御',
  spAtk: '特攻',
  spDef: '特防',
  spd: '速度',
  accuracy: '命中',
  evasion: '闪避'
}

const STAT_SHORT_LABELS = {
  atk: '攻',
  def: '防',
  spAtk: '特攻',
  spDef: '特防',
  spd: '速',
  accuracy: '命中',
  evasion: '闪避'
}

const MOVE_CATEGORY_LABELS = {
  physical: '物理',
  special: '特殊',
  status: '变化'
}

const DEX_STAT_DEFINITIONS = [
  { key: 'maxHp', label: '生命', code: 'HP', max: 255, className: 'dex-stat-hp' },
  { key: 'atk', label: '攻击', code: 'ATK', max: 180, className: 'dex-stat-atk' },
  { key: 'def', label: '防御', code: 'DEF', max: 180, className: 'dex-stat-def' },
  { key: 'spAtk', label: '特攻', code: 'SPA', max: 180, className: 'dex-stat-spa' },
  { key: 'spDef', label: '特防', code: 'SPD', max: 180, className: 'dex-stat-spd' },
  { key: 'spd', label: '速度', code: 'SPE', max: 180, className: 'dex-stat-spe' }
]

const DEX_EVOLUTION_METHOD_LABELS = {
  thunder_stone: '雷之石',
  trade_item: '使用道具',
  level_up_item_day: '白天道具',
  move_known: '学会招式'
}

const handleItemImageError = (event) => {
  applyImageFallback(event, POKEBALLS.pokeball_basic.sprite || POKEMON_LOCAL_PLACEHOLDER)
}

const formatDexNo = (mon) => String(mon?.dexNo ?? mon?.pokedexId ?? mon?.id ?? 0).padStart(3, '0')

const getMoveMpCost = (move) => Math.max(0, Math.trunc(Number(move?.cost) || 0))
const getMonsterMaxHp = (mon) => Math.max(0, Number(mon?.maxHp ?? mon?.stats?.hp ?? 0) || 0)
const getMonsterMaxMp = (mon) => {
  const directMaxMp = Number(mon?.maxMp)
  if (Number.isFinite(directMaxMp) && directMaxMp > 0) return directMaxMp
  const spAttack = Number(mon?.stats?.sp_attack ?? mon?.stats?.spAtk ?? mon?.spAtk)
  return Number.isFinite(spAttack) && spAttack > 0 ? Math.floor(spAttack * 0.8) + 20 : 0
}
const clampMonsterMeter = (value, maxValue) => {
  const safeMax = Math.max(0, Math.trunc(Number(maxValue) || 0))
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return safeMax
  return Math.max(0, Math.min(safeMax, Math.trunc(numeric)))
}
const getMonsterCurrentMeter = (mon, keys, maxValue) => {
  for (const key of keys) {
    const value = mon?.[key]
    if (value === undefined || value === null || value === '') continue
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return clampMonsterMeter(numeric, maxValue)
  }
  return clampMonsterMeter(maxValue, maxValue)
}
const getMonsterCurrentHp = (mon, maxHp = getMonsterMaxHp(mon)) => (
  getMonsterCurrentMeter(mon, ['currentHp', 'hp'], maxHp)
)
const getMonsterCurrentMp = (mon, maxMp = getMonsterMaxMp(mon)) => (
  getMonsterCurrentMeter(mon, ['currentMp', 'mp'], maxMp)
)

const getDexStatRows = (mon) => DEX_STAT_DEFINITIONS.map((stat) => {
  const value = Number(mon?.[stat.key]) || 0
  return {
    ...stat,
    value,
    percent: Math.max(4, Math.min(100, Math.round(value / stat.max * 100)))
  }
})

const getStrongestDexStat = (statRows) => (
  [...statRows].sort((a, b) => b.value - a.value)[0] || statRows[0]
)

const getMoveStatChangeEntries = (move) => {
  const entries = []
  if (move?.statChange) entries.push(move.statChange)
  if (Array.isArray(move?.statChanges)) entries.push(...move.statChanges)
  return entries.filter((entry) => entry?.stat && Number(entry.stages) !== 0)
}

const getMoveStatChangeLabel = (entry) => (
  `${STAT_LABELS[entry.stat] || '能力'}${Number(entry.stages) > 0 ? '提升' : '降低'}`
)

const getMoveEffectLabels = (move) => {
  const labels = []
  if (!move) return labels
  if (move.status) labels.push(STATUS_LABELS[move.status] || '异常')
  if (move.volatileStatus) labels.push(move.volatileStatus === 'flinch' ? '畏缩' : move.volatileStatus === 'confusion' ? '混乱' : move.volatileStatus)
  getMoveStatChangeEntries(move).forEach((entry) => labels.push(getMoveStatChangeLabel(entry)))
  if (move.effect === 'heal') labels.push('回复')
  if (move.effect === 'drain') labels.push('吸取')
  if (move.effect === 'mimic') labels.push('模仿技能')
  if (move.effect === 'teleport') labels.push('脱离战斗')
  if (move.effect === 'nothing') labels.push('无效果')
  if (move.requiresTargetStatus) labels.push(`需要${STATUS_LABELS[move.requiresTargetStatus] || '状态'}`)
  if (move.priority) labels.push(`先制 +${move.priority}`)
  if (move.charge) labels.push('蓄力')
  return labels.slice(0, 3)
}

const getMovePrimaryEffectDisplay = (move) => {
  if (Number(move?.power) > 0) return { label: '威力', value: String(move.power) }
  if (!move) return { label: '效果', value: '--' }
  if (move.status) return { label: '效果', value: STATUS_LABELS[move.status] || '异常' }
  if (move.volatileStatus) {
    return {
      label: '效果',
      value: move.volatileStatus === 'flinch' ? '畏缩' : move.volatileStatus === 'confusion' ? '混乱' : String(move.volatileStatus)
    }
  }
  if (move.effect === 'heal') return { label: '效果', value: '回复' }
  if (move.effect === 'mimic') return { label: '效果', value: '模仿' }
  if (move.effect === 'teleport') return { label: '效果', value: '脱离' }
  if (move.effect === 'nothing') return { label: '效果', value: '无效果' }

  const statChanges = getMoveStatChangeEntries(move)
  if (statChanges.length > 0) {
    const positives = statChanges.filter((entry) => Number(entry.stages) > 0)
    const negatives = statChanges.filter((entry) => Number(entry.stages) < 0)
    const compactStats = (entries) => entries
      .slice(0, 3)
      .map((entry) => STAT_SHORT_LABELS[entry.stat] || STAT_LABELS[entry.stat] || '能力')
      .join('/')
    if (positives.length > 0 && negatives.length > 0) {
      return { label: '效果', value: `${compactStats(positives)}升/${compactStats(negatives)}降` }
    }
    const entries = positives.length > 0 ? positives : negatives
    return { label: '效果', value: `${compactStats(entries)}${positives.length > 0 ? '提升' : '降低'}` }
  }

  const labels = getMoveEffectLabels(move)
  return { label: '效果', value: labels[0] || '辅助' }
}

const getEvolutionConditionLabel = (sourceMon, evolution) => {
  if (!evolution) return ''
  const simplifiedLevel = getEvolutionLevelForBranch(sourceMon, evolution)
  if (Number.isInteger(simplifiedLevel)) return `Lv.${simplifiedLevel}`
  if (evolution.method && DEX_EVOLUTION_METHOD_LABELS[evolution.method]) return DEX_EVOLUTION_METHOD_LABELS[evolution.method]
  if (evolution.item) return '道具'
  if (evolution.move) return '学会招式'
  return '特殊条件'
}

const isEnabledDexEvolution = (evolution) => Boolean(evolution) && evolution.disabled !== true

const getDexEvolutionLinks = (mon) => {
  const previous = OFFICIAL_DEX_MONSTERS.flatMap((candidate) => {
    const direct = isEnabledDexEvolution(candidate.evolvesTo) && candidate.evolvesTo?.targetId === mon.id
      ? [{ mon: candidate, condition: getEvolutionConditionLabel(candidate, candidate.evolvesTo) }]
      : []
    const alternate = (candidate.alternateEvolutions || [])
      .filter((evolution) => isEnabledDexEvolution(evolution) && evolution.targetId === mon.id)
      .map((evolution) => ({ mon: candidate, condition: getEvolutionConditionLabel(candidate, evolution) }))
    return [...direct, ...alternate]
  })

  const next = [
    ...(isEnabledDexEvolution(mon.evolvesTo) && mon.evolvesTo?.targetId
      ? [{ mon: OFFICIAL_DEX_MONSTERS.find((candidate) => candidate.id === mon.evolvesTo.targetId), condition: getEvolutionConditionLabel(mon, mon.evolvesTo) }]
      : []),
    ...(mon.alternateEvolutions || []).filter(isEnabledDexEvolution).map((evolution) => ({
      mon: OFFICIAL_DEX_MONSTERS.find((candidate) => candidate.id === evolution.targetId),
      condition: getEvolutionConditionLabel(mon, evolution)
    }))
  ].filter((link) => link.mon)

  return { previous, next }
}

export function DexScreen({ onBack }) {
  const [selectedMon, setSelectedMon] = useState(null)
  const dexListScrollRef = useRef(0)
  const dexListScrollAreaRef = useRef(null)
  const shouldRestoreDexListScrollRef = useRef(false)

  useLayoutEffect(() => {
    if (selectedMon) return
    if (!shouldRestoreDexListScrollRef.current) return

    const scrollArea = dexListScrollAreaRef.current
    if (!scrollArea) return

    shouldRestoreDexListScrollRef.current = false
    scrollArea.scrollTop = dexListScrollRef.current
  }, [selectedMon])

  const rememberDexListScroll = useCallback(() => {
    dexListScrollRef.current = dexListScrollAreaRef.current?.scrollTop || 0
  }, [])

  const handleDexCardClick = useCallback((mon) => {
    rememberDexListScroll()
    shouldRestoreDexListScrollRef.current = true
    setSelectedMon(mon)
    gameAudio.playUiSelect()
  }, [rememberDexListScroll])

  const handleDexDetailBack = useCallback(() => {
    setSelectedMon(null)
    gameAudio.playUiBack()
  }, [])

  if (selectedMon) {
    const moves = selectedMon.moves
      .map((moveKey) => ({ key: moveKey, ...MOVES[moveKey] }))
      .filter((move) => move.name)
    const statRows = getDexStatRows(selectedMon)
    const statTotal = statRows.reduce((sum, stat) => sum + stat.value, 0)
    const strongestStat = getStrongestDexStat(statRows)
    const evolutionLinks = getDexEvolutionLinks(selectedMon)

    return (
      <div className="game-page dex-detail-page">
        <div className="game-page-header">
          <div>
            <h2 className="game-page-title">
              <i className="fa-solid fa-fingerprint text-teal-600"></i>
              {selectedMon.name}
            </h2>
            <div className="game-page-subtitle">No.{formatDexNo(selectedMon)} 图鉴资料</div>
          </div>
          <button onClick={handleDexDetailBack} className="game-icon-button" title="返回列表" aria-label="返回列表">
            <i className="fa-solid fa-arrow-left"></i>
          </button>
        </div>
        <div className="game-scroll-area dex-detail-scroll">
          <section className="dex-hero-panel">
            <div className="dex-hero-copy">
              <div className="dex-number-chip">No.{formatDexNo(selectedMon)}</div>
              <h3>{selectedMon.name}</h3>
              <div className="dex-type-row">
                {selectedMon.type2 && <TypeBadge type={selectedMon.type2} />}
                <TypeBadge type={selectedMon.type} />
              </div>
              <div className="dex-hero-metrics">
                <div>
                  <span>种族总和</span>
                  <b>{statTotal}</b>
                </div>
                <div>
                  <span>最高能力</span>
                  <b>{strongestStat.label} {strongestStat.value}</b>
                </div>
                <div>
                  <span>技能值</span>
                  <b>{selectedMon.maxMp}</b>
                </div>
              </div>
            </div>
            <div className="dex-sprite-stage">
              <img src={selectedMon.sprite} onError={handlePokemonImageError} alt={selectedMon.name} />
            </div>
          </section>

          <div className="dex-detail-grid">
            <section className="dex-panel dex-stat-panel">
              <div className="dex-section-heading">
                <span>能力分析</span>
                <b>Base Stats</b>
              </div>
              <div className="dex-stat-list">
                {statRows.map((stat) => (
                  <div key={stat.key} className="dex-stat-row">
                    <div className="dex-stat-label">
                      <b>{stat.code}</b>
                      <span>{stat.label}</span>
                    </div>
                    <div className="dex-stat-track">
                      <div className={`dex-stat-fill ${stat.className}`} style={{ width: `${stat.percent}%` }}></div>
                    </div>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="dex-panel dex-evolution-panel">
              <div className="dex-section-heading">
                <span>进化关系</span>
                <b>Evolution</b>
              </div>
              <div className="dex-evolution-flow">
                {evolutionLinks.previous.map((link) => (
                  <button key={`prev-${link.mon.id}`} type="button" className="dex-evolution-tile" onClick={() => { setSelectedMon(link.mon); gameAudio.playUiSelect(); }}>
                    <img src={link.mon.sprite} onError={handlePokemonImageError} alt={link.mon.name} />
                    <span>No.{formatDexNo(link.mon)}</span>
                    <b>{link.mon.name}</b>
                  </button>
                ))}
                <div className="dex-evolution-tile dex-evolution-current">
                  <img src={selectedMon.sprite} onError={handlePokemonImageError} alt={selectedMon.name} />
                  <span>No.{formatDexNo(selectedMon)}</span>
                  <b>{selectedMon.name}</b>
                </div>
                {evolutionLinks.next.map((link) => (
                  <button key={`next-${link.mon.id}`} type="button" className="dex-evolution-tile" onClick={() => { setSelectedMon(link.mon); gameAudio.playUiSelect(); }}>
                    <img src={link.mon.sprite} onError={handlePokemonImageError} alt={link.mon.name} />
                    <span>{link.condition}</span>
                    <b>{link.mon.name}</b>
                  </button>
                ))}
              </div>
              {evolutionLinks.previous.length === 0 && evolutionLinks.next.length === 0 && (
                <div className="dex-empty-evolution">暂无可展示的进化路线</div>
              )}
            </section>
          </div>

          <section className="dex-panel">
            <div className="dex-section-heading">
              <span>可学习技能</span>
              <b>Moves</b>
            </div>
            <div className="dex-move-grid">
              {moves.map((move) => {
                const effectLabels = getMoveEffectLabels(move)
                const powerDisplay = getMovePrimaryEffectDisplay(move)
                const moveCost = getMoveMpCost(move)
                return (
                  <div key={move.key} className="dex-move-card">
                    <div className="dex-move-card-top">
                      <div>
                        <h4>{move.name}</h4>
                        <span>{MOVE_CATEGORY_LABELS[move.category] || '招式'} · Lv.{move.unlockLevel || 1}</span>
                      </div>
                      <TypeBadge type={move.type} small />
                    </div>
                    <div className="dex-move-stats">
                      <div><span>{powerDisplay.label}</span><b>{powerDisplay.value}</b></div>
                      <div><span>命中</span><b>{move.accuracy || '--'}</b></div>
                      <div><span>MP</span><b>{moveCost}</b></div>
                    </div>
                    {effectLabels.length > 0 && (
                      <div className="dex-effect-row">
                        {effectLabels.map((label) => <span key={label}>{label}</span>)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="game-page">
      <div className="game-page-header">
        <div>
          <h2 className="game-page-title">
            <i className="fa-solid fa-book-open text-teal-600"></i>
            图鉴
          </h2>
          <div className="game-page-subtitle">查看宝可梦资料与技能</div>
        </div>
        <button onClick={onBack} className="game-icon-button" title="返回" aria-label="返回">
          <i className="fa-solid fa-arrow-left"></i>
        </button>
      </div>
      <div
        ref={dexListScrollAreaRef}
        className="game-scroll-area"
        onScroll={rememberDexListScroll}
      >
        <CollectionGrid>
          {OFFICIAL_DEX_MONSTERS.map((mon) => (
            <CollectionCard key={mon.id} onClick={() => handleDexCardClick(mon)}>
              <div className="game-collection-card__sprite-wrap">
                <img src={mon.sprite} decoding="async" onError={handlePokemonImageError} alt={mon.name} className="game-collection-card__sprite" style={{ imageRendering: 'auto' }} />
              </div>
              <div className="game-collection-card__dexno">No.{formatDexNo(mon)}</div>
              <div className="game-collection-card__name">{mon.name}</div>
              <div className="game-collection-card__types">
                {mon.type2 && <TypeBadge type={mon.type2} small />}
                <TypeBadge type={mon.type} small />
              </div>
            </CollectionCard>
          ))}
        </CollectionGrid>
      </div>
    </div>
  )
}

export function ShopScreen({
  playerGold,
  playerInventory,
  onPurchase,
  onBack,
  getInventoryItemQuantity,
  getPotionEffectText
}) {
  const [pendingPurchaseKey, setPendingPurchaseKey] = useState(null)
  const [purchaseFeedback, setPurchaseFeedback] = useState(null)
  const pendingPurchaseKeyRef = useRef(null)
  const purchaseFeedbackTimerRef = useRef(null)
  const purchaseFeedbackFrameRef = useRef(null)
  const allItems = {
    pokeball: POKEBALLS,
    potion: POTIONS,
    expPotion: EXP_POTIONS
  }
  const sectionLabels = {
    pokeball: '精灵球',
    potion: '回复药',
    expPotion: '经验药水'
  }
  const sectionDescriptions = {
    pokeball: '用于捕捉野生宝可梦',
    potion: '用于恢复宝可梦体力与技能值',
    expPotion: '用于提升宝可梦经验'
  }

  const showPurchaseFeedback = (feedback) => {
    if (purchaseFeedbackTimerRef.current) {
      clearTimeout(purchaseFeedbackTimerRef.current)
      purchaseFeedbackTimerRef.current = null
    }
    if (purchaseFeedbackFrameRef.current) {
      cancelAnimationFrame(purchaseFeedbackFrameRef.current)
      purchaseFeedbackFrameRef.current = null
    }
    setPurchaseFeedback(null)
    const feedbackId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    purchaseFeedbackFrameRef.current = requestAnimationFrame(() => {
      purchaseFeedbackFrameRef.current = null
      setPurchaseFeedback({ ...feedback, id: feedbackId })
      purchaseFeedbackTimerRef.current = setTimeout(() => {
        setPurchaseFeedback(null)
        purchaseFeedbackTimerRef.current = null
      }, SHOP_PURCHASE_FEEDBACK_MS)
    })
  }

  useEffect(() => () => {
    if (purchaseFeedbackTimerRef.current) {
      clearTimeout(purchaseFeedbackTimerRef.current)
    }
    if (purchaseFeedbackFrameRef.current) {
      cancelAnimationFrame(purchaseFeedbackFrameRef.current)
    }
  }, [])

  const handleBuy = async (itemType, itemKey, amount = 1) => {
    const purchaseKey = `${itemType}:${itemKey}`
    if (pendingPurchaseKeyRef.current) return
    pendingPurchaseKeyRef.current = purchaseKey
    setPendingPurchaseKey(purchaseKey)
    try {
      const result = await Promise.resolve(onPurchase(itemType, itemKey, amount))
      if (result?.success) {
        showPurchaseFeedback({
          key: purchaseKey,
          itemName: result.itemName,
          quantity: result.quantity || amount,
          totalPrice: result.totalPrice || 0,
        })
      }
    } finally {
      if (pendingPurchaseKeyRef.current === purchaseKey) {
        pendingPurchaseKeyRef.current = null
        setPendingPurchaseKey(null)
      }
    }
  }

  const isShopBusy = Boolean(pendingPurchaseKey)

  return (
    <div className="game-page">
      <div className="game-page-header">
        <div>
          <h2 className="game-page-title">
            <i className="fa-solid fa-store text-teal-600"></i>
            商店
          </h2>
          <div className="game-page-subtitle">购买捕捉、回复和经验道具</div>
        </div>
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className="adventure-chip">
            <i className="fa-solid fa-coins text-amber-500"></i>
            {playerGold}
          </span>
          <button onClick={onBack} className="game-icon-button" title="返回" aria-label="返回">
            <i className="fa-solid fa-arrow-left"></i>
          </button>
        </div>
      </div>
      <div className="game-scroll-area">
        {Object.entries(allItems).map(([itemType, itemsMap]) => (
          <section key={itemType} className="game-collection-section">
            <div className="game-collection-section__head">
              <h3 className="game-collection-section__title">{sectionLabels[itemType]}</h3>
              <span className="game-collection-section__desc">{sectionDescriptions[itemType]}</span>
            </div>
            <CollectionGrid>
              {Object.entries(itemsMap).map(([key, item]) => {
                const currentQuantity = getInventoryItemQuantity(playerInventory, itemType, key)
                const cannotAfford = playerGold < item.price
                const purchaseKey = `${itemType}:${key}`
                const isPending = pendingPurchaseKey === purchaseKey
                const purchaseFeedbackId = purchaseFeedback?.id || 'idle'
                const isPurchased = purchaseFeedback?.key === purchaseKey
                return (
                  <CollectionCard
                    key={key}
                    className={[
                      'shop-item-card',
                      cannotAfford ? 'game-collection-card--disabled' : '',
                      isPurchased ? 'shop-item-card--purchased' : ''
                    ].filter(Boolean).join(' ')}
                  >
                    <span className="game-collection-card__corner">
                      <span className={`game-collection-card__qty ${isPurchased ? 'shop-item-card__qty-bump' : ''}`}>
                        x{currentQuantity}
                      </span>
                    </span>
                    <div className={`game-collection-card__sprite-wrap ${isPurchased ? 'shop-item-card__sprite-wrap--purchased' : ''}`}>
                      <img src={item.sprite} alt={item.name} className="game-collection-card__sprite" style={{ imageRendering: 'auto' }} onError={handleItemImageError} />
                      {isPurchased && (
                        <span key={`sparkles-${purchaseFeedbackId}`} className="shop-item-card__sparkles" aria-hidden="true">
                          {Array.from({ length: 8 }, (_, index) => <i key={index} style={{ '--i': index }} />)}
                        </span>
                      )}
                    </div>
                    <div className="game-collection-card__name">{item.name}</div>
                    <div className="game-collection-card__desc">
                      {itemType === 'expPotion'
                        ? `经验 +${item.expAmount}`
                        : itemType === 'potion'
                          ? getPotionEffectText(item)
                          : '用于捕捉'}
                    </div>
                    <div className="game-collection-card__price">
                      <i className="fa-solid fa-coins"></i>
                      {item.price}
                    </div>
                    <div className="game-collection-card__footer">
                      <button
                        type="button"
                        onClick={() => handleBuy(itemType, key, 1)}
                        disabled={cannotAfford || isShopBusy}
                        className={`game-primary-button ${isPurchased ? 'shop-item-card__buy-button--done' : ''}`}
                      >
                        {isPending ? (
                          <>
                            <i className="fa-solid fa-spinner fa-spin"></i>
                            购买中
                          </>
                        ) : isPurchased ? (
                          <>
                            <i className="fa-solid fa-check"></i>
                            继续购买
                          </>
                        ) : '购买'}
                      </button>
                    </div>
                    {isPurchased && (
                      <div key={`feedback-${purchaseFeedbackId}`} className="shop-purchase-feedback" role="status" aria-live="polite">
                        <i className="fa-solid fa-bag-shopping"></i>
                        <span>已放入背包</span>
                        <b>+{purchaseFeedback.quantity}</b>
                      </div>
                    )}
                  </CollectionCard>
                )
              })}
            </CollectionGrid>
          </section>
        ))}
      </div>
    </div>
  )
}

const PokemonDetailDialog = ({
  monster,
  stats,
  moves = [],
  onClose,
  contextLabel = '出战队伍',
  children
}) => {
  if (!monster || !stats) return null

  const hpPercent = stats.maxHp > 0 ? Math.max(0, Math.min(100, (stats.currentHp / stats.maxHp) * 100)) : 0
  const mpPercent = stats.maxMp > 0 ? Math.max(0, Math.min(100, (stats.currentMp / stats.maxMp) * 100)) : 0
  const expToNextLevel = monster.expToNextLevel || 0
  const currentExp = monster.currentExp || 0
  const expPercent = expToNextLevel > 0 ? Math.max(0, Math.min(100, (currentExp / expToNextLevel) * 100)) : 0
  const statTiles = [
    { label: '生命', value: `${stats.currentHp}/${stats.maxHp}`, icon: 'fa-heart-pulse', tone: 'hp' },
    { label: '技能值', value: `${stats.currentMp}/${stats.maxMp}`, icon: 'fa-droplet', tone: 'mp' },
    { label: '速度', value: monster.spd || 0, icon: 'fa-wind', tone: 'speed' },
    { label: '攻击', value: monster.atk || 0, icon: 'fa-hand-fist', tone: 'attack' },
    { label: '防御', value: monster.def || 0, icon: 'fa-shield-halved', tone: 'defense' },
    { label: '特攻', value: monster.spAtk || 0, icon: 'fa-wand-sparkles', tone: 'spattack' },
    { label: '特防', value: monster.spDef || 0, icon: 'fa-gem', tone: 'spdefense' }
  ]
  const dialogTitleId = `pokemon-detail-title-${monster.id || 'monster'}`

  return (
    <div
      className="game-screen-dialog-overlay game-screen-dialog-overlay--detail"
      role="dialog"
      aria-modal="true"
      aria-labelledby={dialogTitleId}
      onClick={onClose}
    >
      <div className="pokemon-detail-modal animate-bounce-in" onClick={(event) => event.stopPropagation()}>
        <div className="pokemon-detail-hero">
          <div className="pokemon-detail-art">
            <img src={monster.sprite} onError={handlePokemonImageError} alt={monster.name} style={{ imageRendering: 'auto' }} />
          </div>
          <div className="pokemon-detail-hero-copy">
            <div className="pokemon-detail-eyebrow">{contextLabel}</div>
            <div className="pokemon-detail-name-row">
              <h3 id={dialogTitleId}>{monster.name}</h3>
              <span>Lv.{monster.level}</span>
            </div>
            <div className="pokemon-detail-type-row">
              {monster.type2 && <TypeBadge type={monster.type2} />}
              <TypeBadge type={monster.type} />
            </div>
            <div className="pokemon-detail-exp">
              <div className="pokemon-detail-exp__top">
                <span>距离下一级</span>
                <b>{currentExp}/{expToNextLevel || '--'}</b>
              </div>
              <div className="game-collection-card__bar">
                <div className="game-collection-card__bar-fill game-collection-card__bar-fill--exp" style={{ width: `${expPercent}%` }}></div>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="game-icon-button pokemon-detail-close" title="关闭" aria-label="关闭">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="pokemon-detail-body">
          <section className="pokemon-detail-panel">
            <div className="pokemon-detail-section-title">
              <span>当前状态</span>
              <b>Status</b>
            </div>
            <div className="pokemon-detail-vitals">
              <div className="pokemon-detail-vital-row pokemon-detail-vital-row--hp">
                <span>HP</span>
                <div className="game-collection-card__bar">
                  <div className="game-collection-card__bar-fill game-collection-card__bar-fill--hp" style={{ width: `${hpPercent}%` }}></div>
                </div>
                <b>{stats.currentHp}/{stats.maxHp}</b>
              </div>
              <div className="pokemon-detail-vital-row pokemon-detail-vital-row--mp">
                <span>MP</span>
                <div className="game-collection-card__bar">
                  <div className="game-collection-card__bar-fill game-collection-card__bar-fill--mp" style={{ width: `${mpPercent}%` }}></div>
                </div>
                <b>{stats.currentMp}/{stats.maxMp}</b>
              </div>
              <PokemonStatusBadges
                monster={monster}
                compact={false}
                showNormal
                className="pokemon-detail-status-summary"
              />
            </div>
          </section>

          <section className="pokemon-detail-panel">
            <div className="pokemon-detail-section-title">
              <span>能力值</span>
              <b>Stats</b>
            </div>
            <div className="pokemon-detail-stat-grid">
              {statTiles.map((stat) => (
                <div key={stat.label} className={`pokemon-detail-stat-tile pokemon-detail-stat-tile--${stat.tone}`}>
                  <i className={`fa-solid ${stat.icon}`}></i>
                  <span>{stat.label}</span>
                  <b>{stat.value}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="pokemon-detail-panel">
            <div className="pokemon-detail-section-title">
              <span>已学技能</span>
              <b>Moves</b>
            </div>
            <div className="pokemon-detail-move-grid">
              {moves.length === 0 && <div className="pokemon-detail-empty">暂未学习技能</div>}
              {moves.map((move) => {
                const moveCost = getMoveMpCost(move)
                const powerDisplay = getMovePrimaryEffectDisplay(move)
                return (
                  <div key={move.name} className="pokemon-detail-move-card">
                    <div className="pokemon-detail-move-card__top">
                      <div>
                        <h4>{move.name}</h4>
                        <span>{MOVE_CATEGORY_LABELS[move.category] || '招式'}</span>
                      </div>
                      <TypeBadge type={move.type} small />
                    </div>
                    <div className="pokemon-detail-move-card__meta">
                      <span>{powerDisplay.label} <b>{powerDisplay.value}</b></span>
                      <span>MP <b>{moveCost}</b></span>
                      <span>命中 <b>{move.accuracy || '--'}</b></span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {children && <div className="pokemon-detail-actions">{children}</div>}
      </div>
    </div>
  )
}

const GameConfirmDialog = ({
  open,
  title,
  message,
  icon = 'fa-triangle-exclamation',
  confirmLabel = '确认',
  cancelLabel = '取消',
  busy = false,
  onCancel,
  onConfirm
}) => {
  if (!open) return null

  return (
    <div className="reset-confirm-overlay game-local-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="game-local-confirm-title">
      <div className="reset-confirm-card game-local-confirm-card">
        <div className="reset-confirm-card__icon game-local-confirm-card__icon" aria-hidden="true">
          <i className={`fa-solid ${busy ? 'fa-rotate fa-spin' : icon}`}></i>
        </div>
        <div className="reset-confirm-card__body">
          <p className="reset-confirm-card__eyebrow">需要确认</p>
          <h2 id="game-local-confirm-title">{title}</h2>
          <p>{message}</p>
        </div>
        <div className="reset-confirm-card__actions">
          <button type="button" className="game-soft-button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className="game-danger-button" onClick={onConfirm} disabled={busy}>
            <i className={`fa-solid ${busy ? 'fa-rotate fa-spin' : icon}`}></i>
            {busy ? '处理中' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function TeamScreen({
  team = [],
  storageBox = [],
  onSelect,
  activeId,
  onBack,
  onReorderTeam,
  onRelease,
  onReleaseStorage,
  onDeposit,
  onWithdraw,
  onSwapWithStorage
}) {
  const [selectedPartyMonsterId, setSelectedPartyMonsterId] = useState(null)
  const [selectedStorageMonsterId, setSelectedStorageMonsterId] = useState(null)
  const [activeRosterTab, setActiveRosterTab] = useState('party')
  const [storageSwapTargetId, setStorageSwapTargetId] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [releaseConfirm, setReleaseConfirm] = useState(null)

  const normalizeStats = (mon) => {
    if (!mon) return { currentHp: 0, maxHp: 0, currentMp: 0, maxMp: 0 }
    const maxHp = getMonsterMaxHp(mon)
    const currentHp = getMonsterCurrentHp(mon, maxHp)
    const maxMp = getMonsterMaxMp(mon)
    const currentMp = getMonsterCurrentMp(mon, maxMp)
    return { currentHp, maxHp, currentMp, maxMp }
  }

  useEffect(() => {
    if (selectedPartyMonsterId && !team.some((mon) => mon.id === selectedPartyMonsterId)) {
      setSelectedPartyMonsterId(null)
    }
    if (releaseConfirm?.from === 'party' && !team.some((mon) => mon.id === releaseConfirm.monId)) {
      setReleaseConfirm(null)
    }
  }, [releaseConfirm, selectedPartyMonsterId, team])

  useEffect(() => {
    if (selectedStorageMonsterId && !storageBox.some((mon) => mon.id === selectedStorageMonsterId)) {
      setSelectedStorageMonsterId(null)
    }
    if (storageSwapTargetId && !storageBox.some((mon) => mon.id === storageSwapTargetId)) {
      setStorageSwapTargetId(null)
    }
    if (releaseConfirm?.from === 'storage' && !storageBox.some((mon) => mon.id === releaseConfirm.monId)) {
      setReleaseConfirm(null)
    }
  }, [releaseConfirm, selectedStorageMonsterId, storageBox, storageSwapTargetId])

  const handleMonsterSelect = (monId) => {
    if (selectedPartyMonsterId === monId) {
      setSelectedPartyMonsterId(null)
    } else {
      setSelectedPartyMonsterId(monId)
    }
  }

  const handleReleaseClick = async (event, mon) => {
    event.stopPropagation()
    if (!onRelease || team.length <= 1 || isBusy) return
    setReleaseConfirm({
      from: 'party',
      monId: mon.id,
      title: `放生 ${mon.name}？`,
      message: '放生后会从队伍中移除，无法直接找回。'
    })
  }

  const handleStorageReleaseClick = async (event, mon) => {
    event.stopPropagation()
    if (!onReleaseStorage || isBusy) return
    setReleaseConfirm({
      from: 'storage',
      monId: mon.id,
      title: `放生仓库中的 ${mon.name}？`,
      message: '放生后会从仓库中移除，无法找回。'
    })
  }

  const handleConfirmRelease = async () => {
    if (!releaseConfirm || isBusy) return
    const isStorageRelease = releaseConfirm.from === 'storage'
    const target = isStorageRelease
      ? storageBox.find((mon) => mon.id === releaseConfirm.monId)
      : team.find((mon) => mon.id === releaseConfirm.monId)
    if (!target) {
      setReleaseConfirm(null)
      return
    }

    setIsBusy(true)
    try {
      const success = isStorageRelease
        ? await onReleaseStorage?.(target.id)
        : await onRelease?.(target.id)
      if (success) {
        if (isStorageRelease) {
          setSelectedStorageMonsterId(null)
          setStorageSwapTargetId(null)
        } else {
          setSelectedPartyMonsterId(null)
        }
        setReleaseConfirm(null)
      }
    } finally {
      setIsBusy(false)
    }
  }

  const handleDepositClick = async (event, mon) => {
    event.stopPropagation()
    if (!onDeposit || isBusy) return
    setIsBusy(true)
    try {
      const success = await onDeposit(mon.id)
      if (success) {
        setSelectedPartyMonsterId(null)
      }
    } finally {
      setIsBusy(false)
    }
  }

  const handleWithdrawClick = async (event, mon) => {
    event.stopPropagation()
    if (!onWithdraw || isBusy) return
    setIsBusy(true)
    try {
      const success = await onWithdraw(mon.id)
      if (success) {
        setSelectedStorageMonsterId(null)
      }
    } finally {
      setIsBusy(false)
    }
  }

  const handleSwapChoice = async (partyId) => {
    if (!onSwapWithStorage || !storageSwapTargetId || isBusy) return
    setIsBusy(true)
    try {
      const success = await onSwapWithStorage(partyId, storageSwapTargetId)
      if (success) {
        setStorageSwapTargetId(null)
        setSelectedStorageMonsterId(null)
      }
    } finally {
      setIsBusy(false)
    }
  }

  const isSwitching = Boolean(onSelect)
  const selectedMonster = !isSwitching ? team.find((mon) => mon.id === selectedPartyMonsterId) : null
  const selectedStorageMonster = !isSwitching ? storageBox.find((mon) => mon.id === selectedStorageMonsterId) : null
  const selectedStats = selectedMonster ? normalizeStats(selectedMonster) : null
  const selectedStorageStats = selectedStorageMonster ? normalizeStats(selectedStorageMonster) : null
  const selectedMoves = selectedMonster?.moves?.map((moveKey) => MOVES[moveKey]).filter(Boolean) || []
  const selectedStorageMoves = selectedStorageMonster?.moves?.map((moveKey) => MOVES[moveKey]).filter(Boolean) || []
  const canManageRoster = !isSwitching

  const handleMove = async (event, index, direction) => {
    event.stopPropagation()
    if (!onReorderTeam || isBusy) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= team.length) return

    const newTeam = [...team]
    ;[newTeam[index], newTeam[targetIndex]] = [newTeam[targetIndex], newTeam[index]]

    setIsBusy(true)
    try {
      await onReorderTeam(newTeam)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="game-page relative overflow-hidden">
      <div className="game-page-header">
        <div>
          <h2 className="game-page-title">
            <i className={`fa-solid ${isSwitching ? 'fa-users' : 'fa-paw'} text-teal-600`}></i>
            {isSwitching ? '选择替换的宝可梦' : '宝可梦管理'}
          </h2>
          <div className="game-page-subtitle">
            {isSwitching ? '仅出战队伍可上场' : '队伍与仓库分开管理，道具只对出战队伍生效'}
          </div>
        </div>
        <button onClick={onBack} disabled={isBusy} className="game-icon-button" title="返回" aria-label="返回">
          <i className="fa-solid fa-arrow-left"></i>
        </button>
      </div>
      {canManageRoster && (
        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          <button
            type="button"
            onClick={() => {
              setActiveRosterTab('party')
              setSelectedStorageMonsterId(null)
            }}
            disabled={isBusy}
            className={`${activeRosterTab === 'party' ? 'game-primary-button' : 'game-soft-button'} min-h-9 text-sm`}
          >
            队伍 ({team.length}/{MAX_PARTY_SIZE})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveRosterTab('storage')
              setSelectedPartyMonsterId(null)
            }}
            disabled={isBusy}
            className={`${activeRosterTab === 'storage' ? 'game-primary-button' : 'game-soft-button'} min-h-9 text-sm`}
          >
            仓库 ({storageBox.length}/{MAX_STORAGE_SIZE})
          </button>
        </div>
      )}
      <div className="game-scroll-area">
        {(activeRosterTab === 'party' || isSwitching) ? (
          <div className="pokemon-roster-list">
            {team.map((mon, index) => {
              const stats = normalizeStats(mon)
              const isFainted = stats.currentHp <= 0
              const isActive = activeId === mon.id
              const canSelect = !isFainted && !isActive
              const hpPercent = stats.maxHp > 0 ? Math.max(0, Math.min(100, (stats.currentHp / stats.maxHp) * 100)) : 0
              const mpPercent = stats.maxMp > 0 ? Math.max(0, Math.min(100, (stats.currentMp / stats.maxMp) * 100)) : 0
              const expPercent = mon.expToNextLevel > 0 ? Math.max(0, Math.min(100, ((mon.currentExp || 0) / mon.expToNextLevel) * 100)) : 0

              const handleCardClick = async () => {
                if (isSwitching) {
                  if (!canSelect || isBusy) return
                  setIsBusy(true)
                  try {
                    const switched = await onSelect(mon.id)
                    if (switched) {
                      onBack()
                    }
                  } finally {
                    setIsBusy(false)
                  }
                } else {
                  handleMonsterSelect(mon.id)
                }
              }

              return (
                <CollectionCard
                  key={mon.id}
                  onClick={handleCardClick}
                  asButton={false}
                  active={isActive || (!isSwitching && selectedPartyMonsterId === mon.id)}
                  disabled={(isSwitching && !canSelect) || isBusy}
                  className={`pokemon-roster-row ${isFainted ? 'opacity-50 grayscale' : ''}`}
                >
                  <div className="pokemon-roster-row__sprite">
                    <img src={mon.sprite} onError={handlePokemonImageError} alt={mon.name} style={{ imageRendering: 'auto' }} />
                  </div>
                  <div className="pokemon-roster-row__main">
                    <div className="pokemon-roster-row__title">
                      {!isSwitching && <span className="pokemon-roster-row__rank-chip">#{index + 1}</span>}
                      <span className="pokemon-roster-row__name">{mon.name}</span>
                      <b>Lv.{mon.level}</b>
                      {isActive && <em className="pokemon-roster-row__active-chip">出战</em>}
                    </div>
                    <div className="pokemon-roster-row__types">
                      {mon.type2 && <TypeBadge type={mon.type2} small />}
                      <TypeBadge type={mon.type} small />
                      <PokemonStatusBadges monster={mon} className="pokemon-roster-row__status-badges" />
                    </div>
                    <div className="pokemon-roster-row__bars">
                      <div className="pokemon-roster-row__bar-line">
                        <span>HP</span>
                        <div className="game-collection-card__bar">
                          <div className="game-collection-card__bar-fill game-collection-card__bar-fill--hp" style={{ width: `${hpPercent}%` }}></div>
                        </div>
                        <b>{stats.currentHp}/{stats.maxHp}</b>
                      </div>
                      <div className="pokemon-roster-row__bar-line">
                        <span>MP</span>
                        <div className="game-collection-card__bar">
                          <div className="game-collection-card__bar-fill game-collection-card__bar-fill--mp" style={{ width: `${mpPercent}%` }}></div>
                        </div>
                        <b>{stats.currentMp}/{stats.maxMp}</b>
                      </div>
                      <div className="pokemon-roster-row__bar-line">
                        <span>EXP</span>
                        <div className="game-collection-card__bar">
                          <div className="game-collection-card__bar-fill game-collection-card__bar-fill--exp" style={{ width: `${expPercent}%` }}></div>
                        </div>
                        <b>{mon.currentExp || 0}/{mon.expToNextLevel || '--'}</b>
                      </div>
                    </div>
                  </div>
                  {!isSwitching && (
                    <div className="pokemon-roster-row__actions">
                      <button
                        type="button"
                        onClick={(event) => handleMove(event, index, 'up')}
                        disabled={index === 0}
                        className="game-icon-button !h-8 !min-h-8"
                        title="上移"
                        aria-label="上移"
                      >
                        <i className="fa-solid fa-arrow-up"></i>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => handleMove(event, index, 'down')}
                        disabled={index === team.length - 1}
                        className="game-icon-button !h-8 !min-h-8"
                        title="下移"
                        aria-label="下移"
                      >
                        <i className="fa-solid fa-arrow-down"></i>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => handleDepositClick(event, mon)}
                        disabled={!onDeposit || team.length <= 1 || storageBox.length >= MAX_STORAGE_SIZE}
                        className="game-soft-button !min-h-8 text-xs"
                      >
                        存
                      </button>
                    </div>
                  )}
                </CollectionCard>
              )
            })}
          </div>
        ) : (
          <CollectionGrid>
            {storageBox.length === 0 && <div className="game-collection-empty">仓库还是空的</div>}
            {storageBox.map((mon) => {
              const stats = normalizeStats(mon)
              const hpPercent = stats.maxHp > 0 ? Math.max(0, Math.min(100, (stats.currentHp / stats.maxHp) * 100)) : 0
              const mpPercent = stats.maxMp > 0 ? Math.max(0, Math.min(100, (stats.currentMp / stats.maxMp) * 100)) : 0
              const expPercent = mon.expToNextLevel > 0 ? Math.max(0, Math.min(100, ((mon.currentExp || 0) / mon.expToNextLevel) * 100)) : 0
              return (
                <CollectionCard
                  key={mon.id}
                  onClick={() => setSelectedStorageMonsterId(mon.id)}
                  asButton={false}
                  active={selectedStorageMonsterId === mon.id}
                >
                  <div className="game-collection-card__sprite-wrap">
                    <img src={mon.sprite} loading="lazy" decoding="async" onError={handlePokemonImageError} alt={mon.name} className="game-collection-card__sprite" style={{ imageRendering: 'auto' }} />
                  </div>
                  <div className="game-collection-card__name">{mon.name}</div>
                  <div className="game-collection-card__meta">Lv.{mon.level}</div>
                  <div className="game-collection-card__types">
                    {mon.type2 && <TypeBadge type={mon.type2} small />}
                    <TypeBadge type={mon.type} small />
                    <PokemonStatusBadges monster={mon} className="game-collection-card__status-badges" />
                  </div>
                  <div className="game-collection-card__bars">
                    <div className="game-collection-card__bar">
                      <div className="game-collection-card__bar-fill game-collection-card__bar-fill--hp" style={{ width: `${hpPercent}%` }}></div>
                    </div>
                    <div className="game-collection-card__bar">
                      <div className="game-collection-card__bar-fill game-collection-card__bar-fill--mp" style={{ width: `${mpPercent}%` }}></div>
                    </div>
                    <div className="game-collection-card__bar">
                      <div className="game-collection-card__bar-fill game-collection-card__bar-fill--exp" style={{ width: `${expPercent}%` }}></div>
                    </div>
                  </div>
                  <div className="game-collection-card__desc">
                    HP {stats.currentHp}/{stats.maxHp} · MP {stats.currentMp}/{stats.maxMp}
                  </div>
                  <div className="game-collection-card__footer-row">
                    <button
                      type="button"
                      onClick={(event) => handleWithdrawClick(event, mon)}
                      disabled={!onWithdraw || team.length >= MAX_PARTY_SIZE}
                      className="game-primary-button !min-h-8 !w-full text-xs"
                    >
                      取出
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setStorageSwapTargetId(mon.id)
                      }}
                      disabled={!onSwapWithStorage || team.length === 0}
                      className="game-soft-button !min-h-8 !w-full text-xs"
                    >
                      互换
                    </button>
                  </div>
                </CollectionCard>
              )
            })}
          </CollectionGrid>
        )}
      </div>
      {selectedMonster && (
        <PokemonDetailDialog
          monster={selectedMonster}
          stats={selectedStats}
          moves={selectedMoves}
          contextLabel="出战队伍"
          onClose={() => {
            if (!isBusy) setSelectedPartyMonsterId(null)
          }}
        >
          <div className="pokemon-detail-action-group pokemon-detail-action-group--manage">
            <span>管理</span>
            <div>
              <button
                onClick={(event) => handleDepositClick(event, selectedMonster)}
                disabled={!onDeposit || team.length <= 1 || storageBox.length >= MAX_STORAGE_SIZE}
                className="game-soft-button min-h-9 text-xs"
              >
                <i className="fa-solid fa-box-archive"></i>
                存入仓库
              </button>
              <button
                onClick={(event) => handleReleaseClick(event, selectedMonster)}
                disabled={!onRelease || team.length <= 1}
                className="game-danger-button min-h-9 text-xs"
              >
                <i className="fa-solid fa-right-from-bracket"></i>
                {team.length <= 1 ? '保留最后一只' : '放生'}
              </button>
            </div>
          </div>
        </PokemonDetailDialog>
      )}
      {selectedStorageMonster && (
        <PokemonDetailDialog
          monster={selectedStorageMonster}
          stats={selectedStorageStats}
          moves={selectedStorageMoves}
          contextLabel="仓库收藏"
          onClose={() => {
            if (!isBusy) setSelectedStorageMonsterId(null)
          }}
        >
          <div className="pokemon-detail-action-group pokemon-detail-action-group--manage">
            <span>管理</span>
            <div>
              <button
                onClick={(event) => handleWithdrawClick(event, selectedStorageMonster)}
                disabled={!onWithdraw || team.length >= MAX_PARTY_SIZE}
                className="game-primary-button min-h-9 text-xs"
              >
                <i className="fa-solid fa-person-walking-arrow-right"></i>
                取出到队伍
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  setStorageSwapTargetId(selectedStorageMonster.id)
                }}
                disabled={!onSwapWithStorage || team.length === 0}
                className="game-soft-button min-h-9 text-xs"
              >
                <i className="fa-solid fa-right-left"></i>
                与队伍互换
              </button>
              <button
                onClick={(event) => handleStorageReleaseClick(event, selectedStorageMonster)}
                disabled={!onReleaseStorage}
                className="game-danger-button min-h-9 text-xs"
              >
                <i className="fa-solid fa-right-from-bracket"></i>
                放生
              </button>
            </div>
          </div>
        </PokemonDetailDialog>
      )}
      {storageSwapTargetId && (
        <div
          className="game-screen-dialog-overlay game-screen-dialog-overlay--swap"
          role="dialog"
          aria-modal="true"
          aria-labelledby="storage-swap-title"
          onClick={() => setStorageSwapTargetId(null)}
        >
          <div className="game-card game-screen-swap-card animate-bounce-in" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-black/10 p-3">
              <div>
                <h3 id="storage-swap-title" className="text-lg font-black text-slate-900">选择互换对象</h3>
                <p className="text-xs font-bold text-slate-500">仓库宝可梦会与所选队伍宝可梦交换位置</p>
              </div>
              <button onClick={() => setStorageSwapTargetId(null)} disabled={isBusy} className="game-icon-button !h-9 !min-h-9 !w-9" title="关闭" aria-label="关闭">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="game-screen-swap-list">
              <CollectionGrid>
                {team.map((mon) => (
                  <CollectionCard key={mon.id} onClick={() => handleSwapChoice(mon.id)}>
                    <div className="game-collection-card__sprite-wrap">
                      <img src={mon.sprite} loading="lazy" decoding="async" onError={handlePokemonImageError} alt={mon.name} className="game-collection-card__sprite" style={{ imageRendering: 'auto' }} />
                    </div>
                    <div className="game-collection-card__name">{mon.name}</div>
                    <div className="game-collection-card__meta">Lv.{mon.level}</div>
                  </CollectionCard>
                ))}
              </CollectionGrid>
            </div>
          </div>
        </div>
      )}
      <GameConfirmDialog
        open={Boolean(releaseConfirm)}
        title={releaseConfirm?.title}
        message={releaseConfirm?.message}
        icon="fa-person-walking-arrow-right"
        confirmLabel="确认放生"
        cancelLabel="再想想"
        busy={isBusy}
        onCancel={() => {
          if (!isBusy) setReleaseConfirm(null)
        }}
        onConfirm={handleConfirmRelease}
      />
    </div>
  )
}

const HealingBurst = ({ amount = 0, compact = false }) => {
  const restoreParts = typeof amount === 'object' && amount !== null
    ? [
      Number(amount.hp) > 0 ? { key: 'hp', text: `+${amount.hp} HP` } : null,
      Number(amount.mp) > 0 ? { key: 'mp', text: `+${amount.mp} MP` } : null,
      amount.status ? { key: 'status', text: '异常解除' } : null,
    ].filter(Boolean)
    : [{ key: 'hp', text: `+${amount} HP` }]
  const hasMp = restoreParts.some((part) => part.key === 'mp')
  const sparkles = useMemo(() => (
    Array.from({ length: compact ? 6 : hasMp ? 10 : 7 }, (_, index) => ({
      left: `${18 + (index * 13) % 66}%`,
      top: `${24 + (index * 17) % 48}%`,
      delay: `${index * 70}ms`,
    }))
  ), [compact, hasMp])

  return (
    <div className={`pokemon-heal-effect ${compact ? 'pokemon-heal-effect--compact' : ''} ${hasMp ? 'pokemon-heal-effect--hp-mp' : ''}`} aria-hidden="true">
      <span className="pokemon-heal-ring" />
      <span className="pokemon-heal-ring pokemon-heal-ring--delay" />
      {hasMp && <span className="pokemon-heal-ring pokemon-heal-ring--mp" />}
      {sparkles.map((sparkle, index) => (
        <span
          key={index}
          className={`pokemon-heal-spark ${hasMp && index % 2 === 1 ? 'pokemon-heal-spark--mp' : ''}`}
          style={{ left: sparkle.left, top: sparkle.top, animationDelay: sparkle.delay }}
        />
      ))}
      <span className="pokemon-heal-plus-stack">
        {restoreParts.map((part) => (
          <span key={part.key} className={`pokemon-heal-plus pokemon-heal-plus--${part.key}`}>
            {part.text}
          </span>
        ))}
      </span>
    </div>
  )
}

const ExpBurst = ({ amount = 0, levelUps = [], compact = false }) => {
  const motes = useMemo(() => (
    Array.from({ length: 10 }, (_, index) => ({
      left: `${14 + (index * 19) % 72}%`,
      top: `${18 + (index * 23) % 58}%`,
      delay: `${index * 55}ms`,
    }))
  ), [])
  const hasLevelUp = levelUps.length > 0

  return (
    <div className={`pokemon-exp-effect ${compact ? 'pokemon-exp-effect--compact' : ''} ${hasLevelUp ? 'pokemon-exp-effect--levelup' : ''}`} aria-hidden="true">
      <span className="pokemon-exp-aura" />
      <span className="pokemon-exp-orbit pokemon-exp-orbit--outer" />
      {motes.map((mote, index) => (
        <span
          key={index}
          className="pokemon-exp-mote"
          style={{ left: mote.left, top: mote.top, animationDelay: mote.delay }}
        />
      ))}
      <span className="pokemon-exp-plus">+{amount} EXP</span>
      {hasLevelUp && <span className="pokemon-exp-levelup">LEVEL UP</span>}
    </div>
  )
}

export function UnifiedBagScreen({
  inventory = [],
  onClose,
  onUseItem,
  onUsePotion,
  onUseExpPotion,
  onBattleItemConsumed,
  team = [],
  isBattle = false,
  canUseBattleBalls = true,
  addLog
}) {
  const [selectedItem, setSelectedItem] = useState(null)
  const [showTeamSelect, setShowTeamSelect] = useState(false)
  const [itemUseEffect, setItemUseEffect] = useState(null)
  const [targetItemNotice, setTargetItemNotice] = useState(null)
  const [targetItemHeaderNotice, setTargetItemHeaderNotice] = useState(null)
  const [pendingItemTargetId, setPendingItemTargetId] = useState(null)
  const itemUseEffectTimerRef = useRef(null)
  const pendingItemTargetIdRef = useRef(null)

  const stackedInventory = useMemo(() => sortInventorySlots(inventory), [inventory])
  const isItemUsePending = pendingItemTargetId !== null
  const selectedItemQuantity = selectedItem
    ? getInventoryItemQuantity(inventory, selectedItem.inventoryType, selectedItem.itemKey)
    : 0
  const selectedItemIsDepleted = Boolean(selectedItem) && selectedItemQuantity <= 0
  const selectedItemEffectText = selectedItem?.type === 'expPotion'
    ? `经验 +${selectedItem?.expAmount || 0}`
    : getPotionEffectParts(selectedItem).join(' · ')
  const selectedItemStockText = selectedItem
    ? (targetItemHeaderNotice?.text || (selectedItemIsDepleted ? '数量不足' : `剩余 x${selectedItemQuantity}`))
    : ''

  const clearItemUseEffectTimer = useCallback(() => {
    if (itemUseEffectTimerRef.current) {
      clearTimeout(itemUseEffectTimerRef.current)
      itemUseEffectTimerRef.current = null
    }
  }, [])

  const resetItemUseEffect = useCallback(() => {
    clearItemUseEffectTimer()
    setItemUseEffect(null)
  }, [clearItemUseEffectTimer])

  useEffect(() => () => {
    clearItemUseEffectTimer()
    pendingItemTargetIdRef.current = null
  }, [clearItemUseEffectTimer])

  const playItemUseEffect = useCallback((payload, durationMs = HEAL_ANIMATION_DURATION_MS) => new Promise((resolve) => {
    clearItemUseEffectTimer()
    setItemUseEffect({ ...payload, startedAt: Date.now() })
    itemUseEffectTimerRef.current = setTimeout(() => {
      setItemUseEffect(null)
      itemUseEffectTimerRef.current = null
      resolve()
    }, durationMs)
  }), [clearItemUseEffectTimer])

  const handleCloseBag = useCallback(() => {
    if (pendingItemTargetIdRef.current) return
    onClose?.()
  }, [onClose])

  const handleCancelTargetSelect = useCallback(() => {
    if (pendingItemTargetIdRef.current) return
    resetItemUseEffect()
    setTargetItemNotice(null)
    setTargetItemHeaderNotice(null)
    setSelectedItem(null)
    setShowTeamSelect(false)
  }, [resetItemUseEffect])

  const items = stackedInventory.map((slot) => {
    const inventoryType = resolveInventoryItemType(slot)
    const details = resolveInventoryItemDetails(inventoryType, slot.itemKey)
    const type = inventoryType === 'pokeball' ? 'ball' : inventoryType
    return { ...slot, ...details, inventoryType, type }
  }).filter((item) => item.name)

  const handleItemClick = async (item) => {
    if (pendingItemTargetIdRef.current) return

    if (item.type === 'potion' || item.type === 'expPotion') {
      if (isBattle && item.type === 'expPotion') {
        addLog?.('经验药水只能在战斗之外使用。')
        return
      }
      resetItemUseEffect()
      setTargetItemNotice(null)
      setTargetItemHeaderNotice(null)
      setSelectedItem(item)
      setShowTeamSelect(true)
    } else if (item.type === 'evolutionItem') {
      addLog?.(`${item.name} 已停用，宝可梦现在只会在达到等级时进化。`)
    } else if (item.type === 'ball' && isBattle) {
      if (!canUseBattleBalls) {
        addLog?.('训练家对战中不能使用精灵球。')
        return
      }
      const used = await Promise.resolve(onUseItem(item.itemKey))
      if (used) {
        handleCloseBag()
      }
    }
  }

  const handlePotionUse = async (monId) => {
    if (!selectedItem || pendingItemTargetIdRef.current) return

    const item = selectedItem
    const targetMon = team.find((mon) => mon.id === monId)
    const maxHp = getMonsterMaxHp(targetMon)
    const currentHp = targetMon ? getMonsterCurrentHp(targetMon, maxHp) : 0
    const maxMp = getMonsterMaxMp(targetMon)
    const currentMp = targetMon ? getMonsterCurrentMp(targetMon, maxMp) : 0
    const recoveryProfile = item.type === 'potion' ? getPotionRecoveryProfile(item) : { hp: 0, mp: 0 }
    const healAmount = item.type === 'potion'
      ? Math.max(0, Math.min(recoveryProfile.hp, maxHp - currentHp))
      : 0
    const mpRestoreAmount = item.type === 'potion'
      ? Math.max(0, Math.min(recoveryProfile.mp, maxMp - currentMp))
      : 0
    const curesStatus = item.type === 'potion' && hasPotionCurableStatus(targetMon)
    const remainingQuantityBeforeUse = getInventoryItemQuantity(
      inventory,
      item.inventoryType,
      item.itemKey
    )
    if (remainingQuantityBeforeUse <= 0) {
      setTargetItemNotice(null)
      setTargetItemHeaderNotice({ text: `${item.name} 数量不足。`, tone: 'empty' })
      return
    }

    setTargetItemNotice(null)
    setTargetItemHeaderNotice(null)
    pendingItemTargetIdRef.current = monId
    setPendingItemTargetId(monId)
    let used = false
    let usageResult = null
    let closeBattleBagAfterUse = false
    try {
      if (item.type === 'expPotion') {
        usageResult = await Promise.resolve(onUseExpPotion(monId, item.itemKey))
      } else {
        usageResult = await Promise.resolve(onUsePotion(monId, item.itemKey))
      }
      used = usageResult === true || usageResult?.success === true

      if (!used) return

      addLog?.(`使用了 ${item.name}`)

      if (item.type === 'potion') {
        await playItemUseEffect({
          type: 'heal',
          monId,
          amount: { hp: healAmount, mp: mpRestoreAmount, status: curesStatus },
          itemName: item.name
        }, HEAL_ANIMATION_DURATION_MS)
      } else if (item.type === 'expPotion') {
        await playItemUseEffect({
          type: 'exp',
          monId,
          amount: item.expAmount || usageResult?.expAmount || 0,
          itemName: item.name,
          levelUps: Array.isArray(usageResult?.levelUps) ? usageResult.levelUps : [],
        }, EXP_ANIMATION_DURATION_MS)
      }

      const remainingQuantityAfterUse = Math.max(0, remainingQuantityBeforeUse - 1)
      setTargetItemNotice(null)
      setTargetItemHeaderNotice(
        remainingQuantityAfterUse <= 0
          ? { text: `${item.name} 数量不足。`, tone: 'empty' }
          : null
      )

      if (isBattle && item.type === 'potion') {
        closeBattleBagAfterUse = true
        await Promise.resolve(onBattleItemConsumed?.({
          itemType: item.type,
          itemKey: item.itemKey,
          targetId: monId
        }))
      }
    } finally {
      pendingItemTargetIdRef.current = null
      setPendingItemTargetId(null)
    }

    if (closeBattleBagAfterUse) {
      resetItemUseEffect()
      setTargetItemNotice(null)
      setTargetItemHeaderNotice(null)
      setSelectedItem(null)
      setShowTeamSelect(false)
      onClose?.()
    }
  }

  return (
    <div className="absolute inset-0 z-50 game-page">
      <div className="game-page-header">
        <div>
          <h2 className="game-page-title">
            <i className="fa-solid fa-bag-shopping text-teal-600"></i>
            背包
          </h2>
          <div className="game-page-subtitle">道具、药水与精灵球</div>
        </div>
        <button
          onClick={handleCloseBag}
          disabled={isItemUsePending}
          className="game-icon-button"
          title="关闭"
          aria-label="关闭"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div className="game-scroll-area">
        <CollectionGrid>
          {items.length === 0 && <div className="game-collection-empty">背包是空的</div>}
          {items.map((item) => {
            const isLegacyEvolutionItem = item.type === 'evolutionItem'
            const battleLocked = item.type === 'ball' && !isBattle
            const trainerBattleLocked = item.type === 'ball' && isBattle && !canUseBattleBalls
            const battleExpLocked = item.type === 'expPotion' && isBattle
            const noTargetLocked = isLegacyEvolutionItem
            const itemLocked = battleLocked || trainerBattleLocked || battleExpLocked || noTargetLocked
            const effectText = trainerBattleLocked
              ? '训练家对战中不能捕捉'
              : battleExpLocked
                ? '仅战斗外使用'
                : item.type === 'ball'
                  ? '用于捕捉宝可梦'
                  : item.type === 'expPotion'
                    ? `经验 +${item.expAmount}`
                    : isLegacyEvolutionItem
                      ? '旧版进化道具，现已停用'
                      : getPotionEffectText(item)

            return (
              <CollectionCard key={`${item.inventoryType}-${item.itemKey}`} className={itemLocked ? 'game-collection-card--disabled' : ''}>
                <span className="game-collection-card__corner">
                  <span className="game-collection-card__qty">x{item.quantity}</span>
                </span>
                <div className="game-collection-card__sprite-wrap">
                  <img
                    src={item.sprite}
                    alt={item.name}
                    className="game-collection-card__sprite"
                    style={{ imageRendering: 'auto' }}
                    onError={handleItemImageError}
                  />
                </div>
                <div className="game-collection-card__name">{item.name}</div>
                <div className="game-collection-card__desc">{effectText}</div>
                <div className="game-collection-card__footer">
                  <button
                    type="button"
                    onClick={() => handleItemClick(item)}
                    disabled={itemLocked}
                    className="game-primary-button"
                  >
                    {battleLocked ? '仅战斗' : trainerBattleLocked ? '仅野外' : battleExpLocked ? '仅地图' : noTargetLocked ? '已停用' : '使用'}
                  </button>
                </div>
              </CollectionCard>
            )
          })}
        </CollectionGrid>
      </div>

      {showTeamSelect && (
        <div
          className="bag-target-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bag-target-title"
        >
          <section className="bag-target-modal animate-bounce-in">
            <header className="bag-target-header">
              <div className="bag-target-item-panel">
                <div className="bag-target-item-panel__icon">
                  <img src={selectedItem?.sprite} alt={selectedItem?.name || '道具'} onError={handleItemImageError} />
                </div>
                <div className="bag-target-item-panel__body">
                  <div className="bag-target-kicker">选择目标</div>
                  <h3 id="bag-target-title">{selectedItem?.name || '道具'}</h3>
                  <p>{selectedItemEffectText || '恢复'}</p>
                </div>
                <span className={`bag-target-stock ${selectedItemIsDepleted ? 'bag-target-stock--empty' : ''}`}>
                  {selectedItemStockText}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancelTargetSelect}
                disabled={isItemUsePending}
                className="bag-target-close"
                title="关闭"
                aria-label="关闭"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>

            {targetItemNotice && (
              <div className={`bag-target-notice ${selectedItemIsDepleted ? 'bag-target-notice--empty' : ''}`}>
                <i className={`fa-solid ${selectedItemIsDepleted ? 'fa-circle-exclamation' : 'fa-circle-check'}`}></i>
                {targetItemNotice}
              </div>
            )}

            <div className="bag-target-list">
              {(!team || team.length === 0) && <div className="bag-target-empty">没有可用的队伍信息</div>}
              {team.map((mon) => {
                const maxHp = getMonsterMaxHp(mon) || 100
                const currentHp = getMonsterCurrentHp(mon, maxHp)
                const maxMp = getMonsterMaxMp(mon)
                const currentMp = getMonsterCurrentMp(mon, maxMp)
                const hpPercent = Math.max(0, Math.min(100, (currentHp / maxHp) * 100))
                const mpPercent = maxMp > 0 ? Math.max(0, Math.min(100, (currentMp / maxMp) * 100)) : 100
                const selectedExpPotion = selectedItem?.type === 'expPotion' ? selectedItem : null
                const selectedPotion = selectedItem?.type === 'potion' ? selectedItem : null
                const selectedPotionRecovery = selectedPotion ? getPotionRecoveryProfile(selectedPotion) : { hp: 0, mp: 0 }
                const expToNextLevel = Number(mon.expToNextLevel)
                const isMaxLevel = Number(mon.level) >= 100
                const expPercent = selectedExpPotion
                  ? isMaxLevel
                    ? 100
                    : Number.isFinite(expToNextLevel) && expToNextLevel > 0
                      ? Math.max(0, Math.min(100, ((mon.currentExp || 0) / expToNextLevel) * 100))
                      : 0
                  : 0
                const isHealing = itemUseEffect?.type === 'heal' && itemUseEffect.monId === mon.id
                const isExpBoosting = itemUseEffect?.type === 'exp' && itemUseEffect.monId === mon.id
                const isPending = pendingItemTargetId === mon.id
                const canPotionRestoreHp = Boolean(selectedPotion && selectedPotionRecovery.hp > 0 && currentHp < maxHp)
                const canPotionRestoreMp = Boolean(selectedPotion && selectedPotionRecovery.mp > 0 && currentMp < maxMp)
                const canPotionCureStatus = Boolean(selectedPotion && hasPotionCurableStatus(mon))
                const hpPreview = Math.min(selectedPotionRecovery.hp, Math.max(0, maxHp - currentHp))
                const mpPreview = Math.min(selectedPotionRecovery.mp, Math.max(0, maxMp - currentMp))
                const isUnavailable = selectedExpPotion
                  ? isMaxLevel
                  : !canPotionRestoreHp && !canPotionRestoreMp && !canPotionCureStatus
                const isTargetDisabled = isUnavailable || isItemUsePending || selectedItemIsDepleted
                const statusLabel = selectedItemIsDepleted
                  ? '无库存'
                  : selectedExpPotion
                    ? isMaxLevel ? '满级' : `+${selectedExpPotion.expAmount || 0}`
                    : isUnavailable
                      ? '已满'
                      : canPotionCureStatus && !canPotionRestoreHp && !canPotionRestoreMp
                        ? '解异常'
                        : '可用'

                return (
                  <button
                    key={mon.id}
                    type="button"
                    onClick={!isTargetDisabled ? () => handlePotionUse(mon.id) : undefined}
                    disabled={isTargetDisabled}
                    className={[
                      'bag-target-option',
                      isUnavailable || selectedItemIsDepleted ? 'bag-target-option--disabled' : '',
                      isHealing ? 'bag-target-option--healing' : '',
                      isExpBoosting ? 'bag-target-option--exp' : ''
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="bag-target-option__sprite">
                      <img src={mon.sprite} onError={handlePokemonImageError} alt={mon.name} />
                      {isHealing && <HealingBurst amount={itemUseEffect.amount} compact />}
                      {isExpBoosting && <ExpBurst amount={itemUseEffect.amount} levelUps={itemUseEffect.levelUps || []} compact />}
                    </div>
                    <div className="bag-target-option__main">
                      <div className="bag-target-option__top">
                        <div className="bag-target-option__name">
                          <strong>{mon.name}</strong>
                          <span>Lv.{mon.level}</span>
                          <PokemonStatusBadges monster={mon} className="bag-target-option__status-badges" />
                        </div>
                        <span className={`bag-target-option__status ${isUnavailable || selectedItemIsDepleted ? 'bag-target-option__status--muted' : ''}`}>
                          {isPending && !isHealing && !isExpBoosting ? '处理中' : statusLabel}
                        </span>
                      </div>
                      {!selectedExpPotion && selectedPotion && (
                        <div className="bag-target-restore-preview">
                          <span className={canPotionRestoreHp ? 'bag-target-restore-preview--active' : ''}>HP +{hpPreview}</span>
                          <span className={canPotionRestoreMp ? 'bag-target-restore-preview--active bag-target-restore-preview--mp' : ''}>MP +{mpPreview}</span>
                          <span className={canPotionCureStatus ? 'bag-target-restore-preview--active bag-target-restore-preview--status' : ''}>解除异常</span>
                        </div>
                      )}
                      <div className="bag-target-option__bars">
                        <div className="bag-target-meter">
                          <span>{selectedExpPotion ? 'EXP' : 'HP'}</span>
                          <div><i className="bag-target-meter__hp" style={{ width: selectedExpPotion ? `${expPercent}%` : `${hpPercent}%` }}></i></div>
                          <b>{selectedExpPotion ? (isMaxLevel ? 'MAX' : `${mon.currentExp || 0}/${Number.isFinite(expToNextLevel) ? expToNextLevel : '--'}`) : `${currentHp}/${maxHp}`}</b>
                        </div>
                        {!selectedExpPotion && selectedPotion && (
                          <div className="bag-target-meter">
                            <span>MP</span>
                            <div><i className="bag-target-meter__mp" style={{ width: `${mpPercent}%` }}></i></div>
                            <b>{currentMp}/{maxMp}</b>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <footer className="bag-target-footer">
              <button
                type="button"
                onClick={handleCancelTargetSelect}
                disabled={isItemUsePending}
                className="bag-target-footer-button"
              >
                {isItemUsePending ? '处理中...' : selectedItemIsDepleted ? '返回背包' : '取消'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}

export function BagScreen({
  playerInventory = [],
  activePlayerMon,
  activeEnemyMon,
  onUseItem,
  onBack,
  addLog,
  playerTeam = [],
  onUsePotion,
  onUseExpPotion,
  canUsePokeballs = true
}) {
  const effectiveTeam = playerTeam && playerTeam.length > 0 ? playerTeam : (activePlayerMon ? [activePlayerMon] : [])

  return (
    <UnifiedBagScreen
      inventory={playerInventory}
      onClose={onBack}
      onUseItem={onUseItem}
      onUsePotion={onUsePotion}
      onUseExpPotion={onUseExpPotion}
      team={effectiveTeam}
      isBattle={Boolean(activeEnemyMon)}
      canUseBattleBalls={canUsePokeballs}
      addLog={addLog}
    />
  )
}
