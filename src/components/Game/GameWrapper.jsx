import { useEffect } from 'react'
import LazyRouteErrorBoundary from '../LazyRouteErrorBoundary'
import { loadGameStyles } from '../../utils/loadGameStyles'
import { markAppReady } from '../../utils/clientUpdate'
import OriginalGame from './OriginalGame'

export default function GameWrapper({ user, onLogout }) {
  useEffect(() => {
    void loadGameStyles()
    markAppReady()
  }, [])

  return (
    <div className="h-screen w-full overflow-hidden">
      <LazyRouteErrorBoundary>
        <OriginalGame user={user} onLogout={onLogout} />
      </LazyRouteErrorBoundary>
    </div>
  )
}
