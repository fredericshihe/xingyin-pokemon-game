import { useEffect, useState } from 'react'

export default function AppLoadingScreen({ message = '加载中...', slowHintAfterMs = 5000 }) {
  const [showSlowHint, setShowSlowHint] = useState(false)

  useEffect(() => {
    if (!slowHintAfterMs || slowHintAfterMs <= 0) return undefined
    const timer = window.setTimeout(() => setShowSlowHint(true), slowHintAfterMs)
    return () => window.clearTimeout(timer)
  }, [message, slowHintAfterMs])

  return (
    <div className="game-app-bg">
      <div className="game-gate-card game-card p-5 text-center space-y-3 relative z-[1]">
        <div className="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-600">
          <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
        </div>
        <p className="text-2xl font-bold text-slate-700">{message}</p>
        {showSlowHint ? (
          <p className="text-sm text-slate-600 leading-relaxed">
            正在下载游戏模块，首次打开约需 10–30 秒。请保持网络畅通；若超过 1 分钟仍停在这里，请刷新页面或换 Wi‑Fi 后重试。
          </p>
        ) : (
          <p className="text-sm text-slate-500">请稍候，正在准备游戏…</p>
        )}
      </div>
    </div>
  )
}
