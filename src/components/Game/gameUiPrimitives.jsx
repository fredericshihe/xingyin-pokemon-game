import React from 'react'
import { TYPE_NAMES_CN } from '../../utils/constants'

export const CollectionGrid = ({ children, className = '' }) => (
  <div className={`game-collection-grid ${className}`.trim()}>{children}</div>
)

export const CollectionCard = ({
  children,
  onClick,
  active = false,
  disabled = false,
  className = '',
  asButton = true
}) => {
  const classes = [
    'game-card game-collection-card',
    active ? 'game-card-active' : '',
    disabled ? 'game-collection-card--disabled' : '',
    className
  ].filter(Boolean).join(' ')

  if (onClick && asButton) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={classes}>
        {children}
      </button>
    )
  }

  const handleKeyDown = (event) => {
    if (!onClick || disabled) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onClick(event)
  }

  return (
    <div
      className={classes}
      onClick={disabled ? undefined : onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      aria-disabled={onClick && disabled ? 'true' : undefined}
    >
      {children}
    </div>
  )
}

export const TypeBadge = ({ type, small = false }) => {
  const colors = {
    normal: 'from-slate-400 to-slate-500',
    fire: 'from-orange-400 to-red-500',
    water: 'from-sky-300 to-blue-500',
    grass: 'from-emerald-300 to-green-500',
    electric: 'from-yellow-300 to-amber-400 text-slate-900',
    ghost: 'from-violet-500 to-purple-700',
    psychic: 'from-pink-400 to-fuchsia-600',
    poison: 'from-fuchsia-600 to-purple-800',
    ice: 'from-cyan-200 to-sky-400 text-slate-900',
    dragon: 'from-indigo-500 to-violet-700',
    flying: 'from-sky-200 to-cyan-500',
    fighting: 'from-red-500 to-rose-800',
    bug: 'from-lime-300 to-green-600',
    rock: 'from-yellow-600 to-stone-700',
    ground: 'from-amber-500 to-orange-800',
    dark: 'from-slate-700 to-slate-950',
    steel: 'from-slate-300 to-slate-500',
    fairy: 'from-pink-200 to-rose-400 text-slate-900'
  }
  const darkTextTypes = new Set(['electric', 'ice', 'fairy'])
  const textColor = darkTextTypes.has(type) ? 'text-slate-900' : 'text-white'
  return (
    <span className={`type-badge ${small ? 'type-badge--small' : ''} bg-gradient-to-r ${colors[type] || 'from-gray-400 to-gray-600'} ${textColor} rounded-full font-black border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_10px_rgba(0,0,0,0.18)] ${small ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2.5 py-1'}`}>
      {TYPE_NAMES_CN[type] || type}
    </span>
  )
}
