import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { GAME_AUDIO_TRACK_MANIFEST } from './game-audio-track-manifest.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'public/assets/audio')
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json')
const CREDITS_PATH = path.join(OUT_DIR, 'CREDITS.md')

const FORCE = process.argv.includes('--force')

function readFileHeader(filePath, length = 4) {
  if (!fs.existsSync(filePath)) return null
  const fd = fs.openSync(filePath, 'r')
  const header = Buffer.alloc(length)
  fs.readSync(fd, header, 0, length, 0)
  fs.closeSync(fd)
  return header
}

function isValidOggFile(filePath) {
  if (!fs.existsSync(filePath)) return false
  if (fs.statSync(filePath).size < 1024) return false
  const header = readFileHeader(filePath, 4)
  return header?.toString('ascii') === 'OggS'
}

function isValidWavFile(filePath) {
  if (!fs.existsSync(filePath)) return false
  if (fs.statSync(filePath).size < 1024) return false
  const header = readFileHeader(filePath, 4)
  return header?.toString('ascii') === 'RIFF'
}

function isValidTrackFile(filePath) {
  if (filePath.endsWith('.ogg')) return isValidOggFile(filePath)
  if (filePath.endsWith('.wav')) return isValidWavFile(filePath)
  return fs.existsSync(filePath) && fs.statSync(filePath).size > 1024
}

async function downloadFile(url, destination, { retries = 3 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'xingyin-pokemon-game-audio-fetch/1.0' }
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.writeFileSync(destination, buffer)
      return buffer.length
    } catch (error) {
      if (attempt >= retries) throw error
      await new Promise((resolve) => setTimeout(resolve, attempt * 800))
    }
  }
  return 0
}

function runFallbackGenerator(extraArgs = []) {
  const scriptPath = path.join(__dirname, 'generate-game-audio-loops.mjs')
  const result = spawnSync(process.execPath, [scriptPath, ...extraArgs], { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error('fallback audio generator failed')
  }
}

function wavFallbackPath(oggOutput) {
  return oggOutput.replace(/\.ogg$/i, '.wav')
}

function writeCredits(manifestEntries) {
  const lines = [
    '# 游戏音频来源说明',
    '',
    '本项目**未使用**任天堂 GBA《宝可梦》原声提取（版权归属任天堂/Game Freak）。',
    '当前音轨为 OpenGameArt 等平台 **CC0 / 公共领域** 的 8-bit 风格循环曲，按 GBA 场景角色映射：',
    '',
    '| 游戏内文件 | GBA 场景对应 | 曲名 | 作者 | 许可 |',
    '| --- | --- | --- | --- | --- |'
  ]

  manifestEntries.forEach((entry) => {
    lines.push(`| \`${entry.output}\` | ${entry.gbaRole} | ${entry.title} | ${entry.author} | ${entry.license} |`)
    lines.push(`|  | 来源: ${entry.sourcePage} |  |  |  |`)
  })

  lines.push('', '如需替换为自有音轨，保持文件名不变覆盖 `public/assets/audio/` 下对应文件即可。')
  fs.writeFileSync(CREDITS_PATH, `${lines.join('\n')}\n`)
}

async function main() {
  fs.mkdirSync(path.join(OUT_DIR, 'maps'), { recursive: true })
  fs.mkdirSync(path.join(OUT_DIR, 'battle'), { recursive: true })

  const manifestEntries = []
  let downloaded = 0
  let skipped = 0
  let failed = 0

  for (const track of GAME_AUDIO_TRACK_MANIFEST) {
    const destination = path.join(OUT_DIR, track.output)
    if (!FORCE && isValidTrackFile(destination)) {
      skipped += 1
      manifestEntries.push({
        ...track,
        bytes: fs.statSync(destination).size,
        cached: true
      })
      continue
    }

    if (fs.existsSync(destination) && !isValidTrackFile(destination)) {
      console.warn(`[audio] removing invalid cached file ${track.output}`)
      fs.unlinkSync(destination)
    }

    try {
      const bytes = await downloadFile(track.url, destination)
      if (!isValidOggFile(destination)) {
        fs.unlinkSync(destination)
        throw new Error('downloaded payload is not a valid OGG file')
      }
      downloaded += 1
      manifestEntries.push({ ...track, bytes, cached: false })
      console.log(`[audio] downloaded ${track.output} (${bytes} bytes)`)
    } catch (error) {
      failed += 1
      console.warn(`[audio] failed ${track.output}:`, error?.message || error)
    }
  }

  const missingTracks = GAME_AUDIO_TRACK_MANIFEST.filter((track) => {
    const destination = path.join(OUT_DIR, track.output)
    return !isValidOggFile(destination)
  })

  if (missingTracks.length === GAME_AUDIO_TRACK_MANIFEST.length) {
    console.warn('[audio] all downloads failed, falling back to procedural wav loops')
    runFallbackGenerator()
    return
  }

  if (missingTracks.length > 0) {
    console.warn('[audio] generating wav fallbacks for missing tracks:', missingTracks.map((track) => track.output))
    runFallbackGenerator(missingTracks.map((track) => `--only=${track.output}`))
  }

  GAME_AUDIO_TRACK_MANIFEST.forEach((track) => {
    const destination = path.join(OUT_DIR, track.output)
    const fallbackPath = path.join(OUT_DIR, wavFallbackPath(track.output))
    if (isValidOggFile(destination)) {
      if (!manifestEntries.some((entry) => entry.output === track.output)) {
        manifestEntries.push({
          ...track,
          bytes: fs.statSync(destination).size,
          cached: true
        })
      }
      return
    }
    if (isValidWavFile(fallbackPath)) {
      manifestEntries.push({
        ...track,
        output: wavFallbackPath(track.output),
        title: `Procedural ${track.title}`,
        author: 'xingyin-pokemon-game',
        sourcePage: 'procedural',
        license: 'Project asset',
        bytes: fs.statSync(fallbackPath).size,
        cached: false
      })
    }
  })

  writeCredits(manifestEntries.filter((entry) => isValidTrackFile(path.join(OUT_DIR, entry.output))))

  const manifest = {
    generatedAt: new Date().toISOString(),
    format: 'ogg',
    source: 'OpenGameArt CC0 (GBA-style mapping, not Nintendo rips)',
    tracks: Object.fromEntries(
      manifestEntries
        .filter((entry) => isValidTrackFile(path.join(OUT_DIR, entry.output)))
        .map((entry) => [entry.output, {
          bytes: entry.bytes,
          gbaRole: entry.gbaRole,
          title: entry.title,
          author: entry.author,
          license: entry.license,
          sourcePage: entry.sourcePage,
          cached: entry.cached
        }])
    )
  }
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)

  console.log(JSON.stringify({
    downloaded,
    skipped,
    failed,
    total: GAME_AUDIO_TRACK_MANIFEST.length,
    outDir: 'public/assets/audio'
  }, null, 2))
}

main().catch((error) => {
  console.error('[audio] download script failed', error)
  try {
    runFallbackGenerator()
  } catch (fallbackError) {
    console.error('[audio] fallback generator also failed', fallbackError)
    process.exit(1)
  }
})
