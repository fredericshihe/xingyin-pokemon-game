import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './shell.css'
import App from './App.jsx'

if (typeof window !== 'undefined') {
  const registerServiceWorker = () => {
    void import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({ immediate: true })
    }).catch((error) => {
      console.warn('[pwa] service worker registration skipped', error)
    })
  }

  const deferServiceWorkerRegistration = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => registerServiceWorker(), { timeout: 8000 })
      return
    }
    window.setTimeout(registerServiceWorker, 2500)
  }

  window.addEventListener('load', deferServiceWorkerRegistration, { once: true })
}

// GitHub Pages SPA fallback: 404.html rewrites to /?p=<path>. Restore it here.
try {
  const url = new URL(window.location.href)
  const p = url.searchParams.get('p')
  if (p && typeof p === 'string') {
    url.searchParams.delete('p')
    const cleanedSearch = url.searchParams.toString()
    const base = url.pathname.replace(/\/$/, '')
    const nextUrl = base + p + (cleanedSearch ? `?${cleanedSearch}` : '')
    window.history.replaceState(null, '', nextUrl)
  }
} catch {
  // ignore
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
