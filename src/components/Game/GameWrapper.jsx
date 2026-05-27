import { Suspense, useEffect } from 'react'
import AppLoadingScreen from '../AppLoadingScreen'
import LazyRouteErrorBoundary from '../LazyRouteErrorBoundary'
import { loadGameStyles } from '../../utils/loadGameStyles'
import { lazyWithRetry } from '../../utils/lazyWithRetry'

const OriginalGame = lazyWithRetry(() => import('./OriginalGame'))

export default function GameWrapper({ user, onLogout }) {
  useEffect(() => {
    void loadGameStyles()
  }, [])

  return (
    <div className="h-screen w-full overflow-hidden">
      <LazyRouteErrorBoundary>
        <Suspense fallback={<AppLoadingScreen message="游戏加载中..." />}>
          <OriginalGame user={user} onLogout={onLogout} />
        </Suspense>
      </LazyRouteErrorBoundary>
    </div>
  )
}
