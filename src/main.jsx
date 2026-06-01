import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './shell.css'
import App from './App.jsx'
import { dismissUpdateOverlay, ensureClientMatchesBuild, initPwaUpdates } from './utils/clientUpdate'

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

const appBase = import.meta.env.BASE_URL || '/'
if (typeof window !== 'undefined' && appBase !== '/' && appBase !== './') {
  const normalizedBase = appBase.endsWith('/') ? appBase.slice(0, -1) : appBase
  const { pathname } = window.location
  if (pathname !== normalizedBase && !pathname.startsWith(`${normalizedBase}/`)) {
    window.location.replace(appBase)
  }
}

async function bootstrap() {
  dismissUpdateOverlay()
  await ensureClientMatchesBuild()
  initPwaUpdates()

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  window.addEventListener('load', dismissUpdateOverlay, { once: true })
}

void bootstrap()
