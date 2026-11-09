import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MODEL_ASSET_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets/3d')

function collectFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) return collectFiles(absolute, relative)
      return entry.isFile() ? [[relative, absolute]] : []
    })
}

// Content hash of public/assets/3d. Model URLs carry it as ?v= so code-only
// releases keep the URLs, and the players' cached GLBs, unchanged.
export function resolveModelAssetVersion(root = MODEL_ASSET_ROOT) {
  try {
    const hash = createHash('sha256')
    for (const [relative, absolute] of collectFiles(root)) {
      hash.update(relative).update('\0').update(readFileSync(absolute)).update('\0')
    }
    return `m${hash.digest('hex').slice(0, 12)}`
  } catch {
    return null
  }
}
