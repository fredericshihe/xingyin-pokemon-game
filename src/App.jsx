import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { authService } from './utils/authService'
import { preloadImageAssets } from './utils/localAssetPreloader'
import { assetUrl } from './utils/assetUrl'

const Login = lazy(() => import('./components/Auth/Login'))
const Register = lazy(() => import('./components/Auth/Register'))
const GameWrapper = lazy(() => import('./components/Game/GameWrapper'))
const TeacherDashboard = lazy(() => import('./components/Teacher/Dashboard'))
const MapRuntimePreview = lazy(() => import('./game/MapRuntimePreview'))

const AUTH_LOCAL_IMAGE_ASSETS = [
  assetUrl('/assets/pokemon/placeholder.svg'),
  assetUrl('/assets/pokemon/official-artwork/1.png'),
  assetUrl('/assets/pokemon/official-artwork/4.png'),
  assetUrl('/assets/pokemon/official-artwork/7.png'),
  assetUrl('/assets/pokemon/official-artwork/25.png'),
  assetUrl('/assets/pokemon/official-artwork/133.png')
]

function GlobalLogoutButton({ onLogout }) {
  return (
    <button
      onClick={onLogout}
      className="fixed right-3 top-3 z-[9999] game-danger-button px-3 text-sm"
      aria-label="退出登录"
      title="退出登录"
    >
      <i className="fa-solid fa-right-from-bracket mr-1"></i>
      退出
    </button>
  )
}

function AppLoadingScreen({ message = '加载中...' }) {
  return (
    <div className="game-app-bg">
      <div className="game-card p-5 text-2xl font-bold text-slate-700">{message}</div>
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authAssetsReady, setAuthAssetsReady] = useState(false)
  const [authView, setAuthView] = useState('login') // 'login' or 'register'

  useEffect(() => {
    let cancelled = false
    preloadImageAssets(AUTH_LOCAL_IMAGE_ASSETS, { concurrency: 4, timeoutMs: 8000 })
      .catch((error) => {
        console.warn('[assets] 登录素材预加载失败', error)
      })
      .finally(() => {
        if (!cancelled) setAuthAssetsReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const restoreBackendSession = async () => {
      const storedProfile = await authService.refreshStoredProfile()
      if (cancelled) return

      if (storedProfile?.id) {
        setUser(storedProfile)
        setProfile(storedProfile)
      }
      setLoading(false)
    }

    restoreBackendSession()
    return () => {
      cancelled = true
    }
  }, [])

  const handleLogin = async (username, password) => {
    const result = await authService.login(username, password)
    if (result.success) {
      const storedProfile = authService.getStoredProfile()
      setUser(storedProfile)
      setProfile(storedProfile)
    }
    return result
  }

  const handleRegister = async (formData) => {
    const result = await authService.register(formData)
    if (result.success && !result.pendingApproval) {
      // 注册成功后自动登录
      await handleLogin(formData.username, formData.password)
    }
    return result
  }

  const handleLogout = async () => {
    await authService.logout()
    setUser(null)
    setProfile(null)
  }

  const mapRuntimePreviewEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MAP_RUNTIME_PREVIEW === 'true'
  if (mapRuntimePreviewEnabled && window.location.pathname === '/map-runtime-preview') {
    return (
      <Suspense fallback={<AppLoadingScreen message="地图预览加载中..." />}>
        <MapRuntimePreview />
      </Suspense>
    )
  }

  if (loading) {
    return <AppLoadingScreen message="加载中..." />
  }

  // 未登录显示登录/注册页面
  if (!user || !profile) {
    if (!authAssetsReady) {
      return <AppLoadingScreen message="正在准备本地素材..." />
    }

    return (
      <Suspense fallback={<AppLoadingScreen message={authView === 'login' ? '登录界面加载中...' : '注册界面加载中...'} />}>
        {authView === 'login' ? (
          <Login
            onLogin={handleLogin}
            onSwitchToRegister={() => setAuthView('register')}
          />
        ) : (
          <Register
            onRegister={handleRegister}
            onSwitchToLogin={() => setAuthView('login')}
          />
        )}
      </Suspense>
    )
  }

  // 已登录，根据角色显示不同界面
  const basename = import.meta.env.BASE_URL || '/'
  return (
    <>
      {profile.role !== 'student' && <GlobalLogoutButton onLogout={handleLogout} />}
      <Router basename={basename} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<AppLoadingScreen message={profile.role === 'student' ? '游戏加载中...' : '教师后台加载中...'} />}>
          <Routes>
            {profile.role === 'student' ? (
              <Route
                path="/*"
                element={<GameWrapper user={profile} onLogout={handleLogout} />}
              />
            ) : (
              <Route
                path="/*"
                element={<TeacherDashboard profile={profile} />}
              />
            )}
          </Routes>
        </Suspense>
      </Router>
    </>
  )
}

export default App
