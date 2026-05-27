import { useEffect, useState } from 'react'

export default function AppLoadingScreen({ message = '加载中...', slowHintAfterMs = 12000 }) {
  const [showSlowHint, setShowSlowHint] = useState(false)

  useEffect(() => {
    if (!slowHintAfterMs || slowHintAfterMs <= 0) return undefined
    const timer = window.setTimeout(() => setShowSlowHint(true), slowHintAfterMs)
    return () => window.clearTimeout(timer)
  }, [message, slowHintAfterMs])

  return (
    <div className="game-app-bg">
      <div className="game-card p-5 max-w-md mx-auto text-center space-y-3">
        <p className="text-2xl font-bold text-slate-700">{message}</p>
        {showSlowHint ? (
          <p className="text-sm text-slate-600 leading-relaxed">
            首次打开需要下载游戏资源，弱网下会较慢。若超过 1 分钟仍无反应，请刷新页面或换网络后重试。
          </p>
        ) : null}
      </div>
    </div>
  )
}
