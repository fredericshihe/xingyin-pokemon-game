import { Suspense, useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { authService } from './utils/authService'
import { warmImageAssets } from './utils/localAssetPreloader'
import { pokemonArtUrl, pokemonArtPngUrl, POKEMON_PLACEHOLDER_URL } from './utils/mediaAssetUrl'
import { primeStudentSession } from './utils/primeStudentSession'
import { loadGameStyles } from './utils/loadGameStyles'
import { lazyWithRetry } from './utils/lazyWithRetry'
import AppLoadingScreen from './components/AppLoadingScreen'
import LazyRouteErrorBoundary from './components/LazyRouteErrorBoundary'

const Login = lazyWithRetry(() => import('./components/Auth/Login'))
const Register = lazyWithRetry(() => import('./components/Auth/Register'))
const GameWrapper = lazyWithRetry(() => import('./components/Game/GameWrapper'))
const TeacherDashboard = lazyWithRetry(() => import('./components/Teacher/Dashboard'))
const MapRuntimePreview = lazyWithRetry(() => import('./game/MapRuntimePreview'))

const AUTH_LOCAL_IMAGE_ASSETS = [
  POKEMON_PLACEHOLDER_URL,
  pokemonArtUrl(1),
  pokemonArtUrl(25),
  pokemonArtUrl(133),
  pokemonArtPngUrl(1),
  pokemonArtPngUrl(25),
  pokemonArtPngUrl(133)
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

function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authView, setAuthView] = useState('login') // 'login' or 'register'

  useEffect(() => {
    void import('./components/Auth/Login')
    void import('./components/Auth/Register')
    warmImageAssets(AUTH_LOCAL_IMAGE_ASSETS, { concurrency: 4, timeoutMs: 3500 })
  }, [])

  useEffect(() => {
    let cancelled = false

    const storedProfile = authService.getStoredProfile()
    if (storedProfile?.id) {
      setUser(storedProfile)
      setProfile(storedProfile)
      setLoading(false)
      void loadGameStyles()

      if (storedProfile.role === 'student') {
        primeStudentSession()
      }

      authService.refreshStoredProfile()
        .then((latestProfile) => {
          if (cancelled) return
          if (latestProfile?.id) {
            setUser(latestProfile)
            setProfile(latestProfile)
            return
          }
          if (storedProfile?.id) {
            setUser(null)
            setProfile(null)
          }
        })
        .catch((error) => {
          console.warn('[auth] 后台刷新登录状态失败', error)
        })

      return () => {
        cancelled = true
      }
    }

    setLoading(false)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!profile?.id) return
    void loadGameStyles()
    if (profile.role === 'student') {
      primeStudentSession()
    }
  }, [profile?.id, profile?.role])

  const handleLogin = async (username, password) => {
    const result = await authService.login(username, password)
    if (result.success) {
      const storedProfile = authService.getStoredProfile()
      setUser(storedProfile)
      setProfile(storedProfile)
      void loadGameStyles()
      if (storedProfile?.role === 'student') {
        primeStudentSession()
      }
    }
    return result
  }

  const handleRegister = async (formData) => {
    const result = await authService.register(formData)
    if (result.success && !result.pendingApproval) {
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

  if (!user || !profile) {
    return (
      <LazyRouteErrorBoundary>
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
      </LazyRouteErrorBoundary>
    )
  }

  const basename = import.meta.env.BASE_URL || '/'
  return (
    <>
      {profile.role !== 'student' && <GlobalLogoutButton onLogout={handleLogout} />}
      <Router basename={basename} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LazyRouteErrorBoundary>
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
        </LazyRouteErrorBoundary>
      </Router>
    </>
  )
}

export default App
