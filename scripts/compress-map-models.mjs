import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = process.cwd()
const assetsRoot = path.join(root, 'public/assets/3d')
const markerPath = path.join(assetsRoot, '.draco-compressed.json')

const walkGlbFiles = async (dir, files = []) => {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkGlbFiles(fullPath, files)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.glb')) {
      files.push(fullPath)
    }
  }
  return files
}

const runGltfTransform = (inputPath, outputPath) => new Promise((resolve, reject) => {
  const cliPath = fileURLToPath(new URL('../node_modules/@gltf-transform/cli/bin/cli.js', import.meta.url))
  // 避免 Draco 过度量化法线导致地图装饰明显“切面化”。需要缩体积时优先 meshopt。
  const child = spawn(
    process.execPath,
    [cliPath, 'optimize', inputPath, outputPath, '--compress', 'meshopt'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
  child.on('error', reject)
  child.on('close', (code) => {
    if (code === 0) resolve(undefined)
    else reject(new Error(stderr || `gltf-transform failed (${code})`))
  })
})

let markerData = {}
try {
  markerData = JSON.parse(await fs.readFile(markerPath, 'utf8'))
} catch {
  markerData = {}
}

const glbFiles = await walkGlbFiles(assetsRoot)
let compressed = 0
let skipped = 0
let failed = 0
let bytesBefore = 0
let bytesAfter = 0
const nextMarker = {}

for (const filePath of glbFiles) {
  const relative = path.relative(root, filePath)
  const beforeStat = await fs.stat(filePath)
  bytesBefore += beforeStat.size

  if (markerData[relative]?.size === beforeStat.size) {
    skipped += 1
    bytesAfter += beforeStat.size
    nextMarker[relative] = markerData[relative]
    continue
  }

  const tempPath = `${filePath}.draco.tmp.glb`
  try {
    await runGltfTransform(filePath, tempPath)
    const afterStat = await fs.stat(tempPath)
    await fs.rename(tempPath, filePath)
    compressed += 1
    bytesAfter += afterStat.size
    nextMarker[relative] = {
      size: afterStat.size,
      originalSize: beforeStat.size,
      compressedAt: new Date().toISOString()
    }
  } catch (error) {
    failed += 1
    bytesAfter += beforeStat.size
    try { await fs.unlink(tempPath) } catch { /* ignore */ }
    console.warn('[compress-map-models] failed', relative, error.message)
  }
}

await fs.writeFile(markerPath, JSON.stringify(nextMarker, null, 2))

console.log(JSON.stringify({
  compressed,
  skipped,
  failed,
  total: glbFiles.length,
  savedBytes: bytesBefore - bytesAfter
}, null, 2))

if (failed > 0) process.exitCode = 1
