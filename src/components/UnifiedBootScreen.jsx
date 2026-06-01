import { useEffect, useState } from 'react'

function getEstimatedTimeHint(percent) {
  if (typeof navigator === 'undefined') return null
  if (percent > 85) return '即将完成'

  const connection = navigator.connection
    || navigator.mozConnection
    || navigator.webkitConnection
  const effectiveType = connection?.effectiveType || ''

  const estimates = {
    'slow-2g': '预计还需 2-3 分钟',
    '2g': '预计还需 2-3 分钟',
    '3g': '预计还需 1-2 分钟',
    '4g': '预计还需 30-60 秒'
  }

  return estimates[effectiveType] || '预计还需 20-40 秒'
}

/**
 * 统一启动屏：登录模块 / 云端 / 全量素材 共用同一布局，避免多次换屏。
 */
export default function UnifiedBootScreen({
  title = null,
  phase = '',
  detail = null,
  progress = null,
  percent = null,
  error = null,
  actionLabel = null,
  onAction = null,
  secondaryActionLabel = null,
  onSecondaryAction = null,
  showProgressBar = true,
  slowHintAfterMs = 8000,
  slowHint = '首次进入需下载完整游戏资源（约 30MB）：146 种宝可梦高清立绘、9 张地图的 3D 场景、背景音乐和音效。下载完成后，游戏将保存在您的设备上，下次打开只需 1-2 秒！网络较慢时会自动重试，请保持页面打开。',
  idleHint = '加载完成后将自动进入游戏'
}) {
  const resolvedPercent = percent ?? progress?.percent ?? null
  const displayPercent = Number.isFinite(resolvedPercent)
    ? Math.min(100, Math.max(0, Number(resolvedPercent)))
    : null
  const displayPhase = phase || progress?.phase || ''
  const displayDetail = detail ?? progress?.detail ?? null
  const displayTitle = title || (error ? '无法进入游戏' : '正在准备冒险世界')
  const [showSlowHint, setShowSlowHint] = useState(false)

  useEffect(() => {
    if (error) {
      setShowSlowHint(false)
      return undefined
    }
    const timer = window.setTimeout(() => setShowSlowHint(true), slowHintAfterMs)
    return () => window.clearTimeout(timer)
  }, [error, displayPhase, slowHintAfterMs])

  return (
    <div className="game-app-bg">
      <div className="game-gate-card game-card game-entry-loading p-5 text-center space-y-4 relative z-[1]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-600">
          <i className={`fa-solid ${error ? 'fa-triangle-exclamation' : 'fa-spinner fa-spin'}`} aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-black text-slate-800">{displayTitle}</h2>
          <p className="text-sm font-semibold text-slate-600">
            {error || displayPhase || '正在连接服务器并加载游戏素材…'}
          </p>
          {!error && displayDetail ? (
            <p className="text-xs text-slate-500">{displayDetail}</p>
          ) : null}
        </div>

        {!error && showProgressBar ? (
          <>
            {displayPercent !== null ? (
              <>
                <div
                  className="game-entry-loading__bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={displayPercent}
                >
                  <span className="game-entry-loading__bar-fill" style={{ width: `${displayPercent}%` }} />
                </div>
                <p className="text-sm font-bold text-sky-700">{displayPercent}%</p>
              </>
            ) : null}
            {Number.isFinite(progress?.loaded) && Number.isFinite(progress?.total) ? (
              <p className="text-xs text-slate-500">
                已加载 {progress.loaded} / {progress.total} 项
                {Number.isFinite(progress?.mapCount) ? ` · ${progress.mapCount} 张地图` : ''}
              </p>
            ) : null}
            {showSlowHint && displayPercent !== null ? (
              <p className="text-xs text-amber-600 font-semibold">
                {getEstimatedTimeHint(displayPercent)}
              </p>
            ) : null}
            <p className="text-xs text-slate-500">
              {showSlowHint ? slowHint : idleHint}
            </p>
            {onSecondaryAction && secondaryActionLabel ? (
              <button
                type="button"
                className="w-full py-2 text-sm font-semibold rounded-xl border border-sky-300 bg-white text-sky-700"
                onClick={onSecondaryAction}
              >
                {secondaryActionLabel}
              </button>
            ) : null}
          </>
        ) : null}

        {error ? (
          <>
            <p className="text-xs leading-relaxed text-rose-600">{error}</p>
            {onAction && actionLabel ? (
              <button type="button" className="game-primary-button w-full py-2" onClick={onAction}>
                {actionLabel}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
