import { execSync } from 'node:child_process'

export function resolveBuildId() {
  if (process.env.VITE_APP_BUILD_ID?.trim()) {
    return process.env.VITE_APP_BUILD_ID.trim()
  }
  try {
    const gitId = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    if (gitId) return gitId
  } catch {
    // ignore — not a git repo or git unavailable
  }
  return `t${Date.now().toString(36)}`
}
