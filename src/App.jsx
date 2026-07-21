import { Suspense, useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { authService } from './utils/authService'
import { warmImageAssets } from './utils/localAssetPreloader'
import { pokemonArtUrl, pokemonArtPngUrl, POKEMON_PLACEHOLDER_URL } from './utils/mediaAssetUrl'
import { primeStudentSession } from './utils/primeStudentSession'
import { loadGameStyles } from './utils/loadGameStyles'
import { lazyWithRetry } from './utils/lazyWithRetry'
import { markAppReady } from './utils/clientUpdate'
import { gameAudio } from './utils/gameAudio'
import { gameBgm } from './utils/gameBgm'
import UnifiedBootScreen from './components/UnifiedBootScreen'
import LazyRouteErrorBoundary from './components/LazyRouteErrorBoundary'

const Login = lazyWithRetry(() => import('./components/Auth/Login'))
const Register = lazyWithRetry(() => import('./components/Auth/Register'))
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

function preloadStudentGameModule(setStudentGameComponent) {
  return import('./components/Game/GameWrapper').then((module) => {
    setStudentGameComponent(() => module.default)
  })
}

function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authView, setAuthView] = useState('login') // 'login' or 'register'
  const [StudentGameComponent, setStudentGameComponent] = useState(null)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const unlockAudioOnGesture = () => {
      void gameAudio.unlock().then((unlocked) => {
        if (unlocked && typeof gameBgm?.resumeAfterUnlock === 'function') {
          void gameBgm.resumeAfterUnlock()
        }
      })
    }

    window.addEventListener('pointerdown', unlockAudioOnGesture, { passive: true, capture: true })
    window.addEventListener('touchstart', unlockAudioOnGesture, { passive: true, capture: true })
    window.addEventListener('keydown', unlockAudioOnGesture, { capture: true })

    return () => {
      window.removeEventListener('pointerdown', unlockAudioOnGesture, { capture: true })
      window.removeEventListener('touchstart', unlockAudioOnGesture, { capture: true })
      window.removeEventListener('keydown', unlockAudioOnGesture, { capture: true })
    }
  }, [])

  useEffect(() => {
    void import('./components/Auth/Login')
    void import('./components/Auth/Register')
    warmImageAssets(AUTH_LOCAL_IMAGE_ASSETS, { concurrency: 4, timeoutMs: 3500 })
    const storedProfile = authService.getStoredProfile()
    if (storedProfile?.role === 'student') {
      primeStudentSession()
      void preloadStudentGameModule(setStudentGameComponent)
    }
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
        void import('./components/Game/GameWrapper').then((module) => {
          if (!cancelled) setStudentGameComponent(() => module.default)
        })
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
      void preloadStudentGameModule(setStudentGameComponent)
    }
  }, [profile?.id, profile?.role])

  useEffect(() => {
    if (!loading) markAppReady()
  }, [loading])

  const handleLogin = async (username, password) => {
    const result = await authService.login(username, password)
    if (result.success) {
      const storedProfile = authService.getStoredProfile()
      setUser(storedProfile)
      setProfile(storedProfile)
      void loadGameStyles()
      if (storedProfile?.role === 'student') {
        primeStudentSession()
        void preloadStudentGameModule(setStudentGameComponent)
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
    if (typeof gameAudio?.stopAll === 'function') {
      gameAudio.stopAll()
    }
    if (typeof gameBgm?.stop === 'function') {
      await gameBgm.stop({ immediate: true })
    }
    await authService.logout()
    setUser(null)
    setProfile(null)
    setStudentGameComponent(null)
  }

  const mapRuntimePreviewEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MAP_RUNTIME_PREVIEW === 'true'
  const isMapRuntimePreviewPath = typeof window !== 'undefined' && (
    window.location.pathname === '/map-runtime-preview' ||
    window.location.pathname.endsWith('/map-runtime-preview')
  )
  if (mapRuntimePreviewEnabled && isMapRuntimePreviewPath) {
    return (
      <Suspense fallback={<UnifiedBootScreen phase="正在打开地图预览..." showProgressBar={false} />}>
        <MapRuntimePreview />
      </Suspense>
    )
  }

  if (loading) {
    return <UnifiedBootScreen phase="正在检查登录状态..." showProgressBar={false} />
  }

  if (!user || !profile) {
    return (
      <LazyRouteErrorBoundary>
        <Suspense fallback={<UnifiedBootScreen phase={authView === 'login' ? '正在打开登录界面...' : '正在打开注册界面...'} showProgressBar={false} />}>
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
          {profile.role === 'student' ? (
            StudentGameComponent ? (
              <Routes>
                <Route
                  path="/*"
                  element={<StudentGameComponent user={profile} onLogout={handleLogout} />}
                />
              </Routes>
            ) : (
              <UnifiedBootScreen phase="正在打开冒险入口..." showProgressBar={false} />
            )
          ) : (
            <Suspense fallback={<UnifiedBootScreen phase="正在打开教师工作台..." showProgressBar={false} />}>
              <Routes>
                <Route
                  path="/*"
                  element={<TeacherDashboard profile={profile} />}
                />
              </Routes>
            </Suspense>
          )}
        </LazyRouteErrorBoundary>
      </Router>
    </>
  )
}

export default App
