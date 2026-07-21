import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'public/assets/audio')

const SAMPLE_RATE = 11025
const LOOP_SECONDS = 4
const SAMPLE_COUNT = SAMPLE_RATE * LOOP_SECONDS

const TRACKS = [
  { file: 'maps/godot-map.wav', seed: 11, tempo: 1.5, bass: 55, melody: [220, 277.18, 329.63], padMix: 0.22, shimmer: 0.04, gain: 0.9 },
  { file: 'maps/godot-map-v2.wav', seed: 21, tempo: 2, bass: 62, melody: [293.66, 369.99, 440], padMix: 0.2, shimmer: 0.05, gain: 0.92 },
  { file: 'maps/mist-lake.wav', seed: 31, tempo: 1.25, bass: 49, melody: [196, 246.94, 293.66], padMix: 0.26, shimmer: 0.08, gain: 0.88 },
  { file: 'maps/farm-town.wav', seed: 41, tempo: 1.75, bass: 58, melody: [174.61, 220, 261.63], padMix: 0.18, shimmer: 0.03, gain: 0.9 },
  { file: 'maps/pirate-shore.wav', seed: 51, tempo: 1.6, bass: 52, melody: [185, 233.08, 277.18], padMix: 0.16, shimmer: 0.1, gain: 0.86 },
  { file: 'maps/graveyard.wav', seed: 61, tempo: 1.1, bass: 46, melody: [155.56, 196, 233.08], padMix: 0.28, shimmer: 0.06, gain: 0.84 },
  { file: 'maps/hex-ruins.wav', seed: 71, tempo: 1.4, bass: 65, melody: [207.65, 261.63, 311.13], padMix: 0.24, shimmer: 0.07, gain: 0.88 },
  { file: 'maps/survival-ridge.wav', seed: 81, tempo: 1.35, bass: 50, melody: [164.81, 207.65, 246.94], padMix: 0.2, shimmer: 0.05, gain: 0.9 },
  { file: 'maps/boss-highland.wav', seed: 91, tempo: 1.2, bass: 43, melody: [146.83, 185, 220], padMix: 0.3, shimmer: 0.09, gain: 0.82 },
  { file: 'battle/wild.wav', seed: 101, tempo: 3.5, bass: 82.41, melody: [329.63, 392, 493.88, 587.33], padMix: 0.08, pulse: 0.18, gain: 1.05 },
  { file: 'battle/trainer.wav', seed: 111, tempo: 4, bass: 87.31, melody: [349.23, 440, 523.25, 659.25], padMix: 0.06, pulse: 0.22, gain: 1.08 },
  { file: 'battle/lieutenant.wav', seed: 121, tempo: 4.5, bass: 92.5, melody: [369.99, 466.16, 554.37, 698.46], padMix: 0.05, pulse: 0.26, gain: 1.1 },
  { file: 'battle/boss.wav', seed: 131, tempo: 3.25, bass: 73.42, melody: [293.66, 369.99, 440, 554.37], padMix: 0.1, pulse: 0.3, gain: 1.12 },
  { file: 'battle/challenge.wav', seed: 141, tempo: 4.25, bass: 98, melody: [392, 493.88, 587.33, 739.99], padMix: 0.07, pulse: 0.24, gain: 1.1 }
]

const ONLY_ARGS = process.argv
  .filter((arg) => arg.startsWith('--only='))
  .map((arg) => arg.slice('--only='.length))
  .filter(Boolean)
const WRITE_MANIFEST = !process.argv.includes('--no-manifest')

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const fract = (value) => value - Math.floor(value)

const seeded = (index, seed) => fract(Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453)

function renderLoop(recipe) {
  const samples = new Float32Array(SAMPLE_COUNT)
  const { seed, tempo, bass, melody, padMix = 0.2, shimmer = 0, pulse = 0, gain = 1 } = recipe

  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const t = i / SAMPLE_RATE
    let value = 0

    value += Math.sin(2 * Math.PI * bass * t) * 0.18

    const step = Math.floor(t * tempo) % melody.length
    const nextStep = (step + 1) % melody.length
    const stepT = fract(t * tempo)
    const freq = melody[step] + (melody[nextStep] - melody[step]) * stepT
    value += Math.sin(2 * Math.PI * freq * t) * 0.11

    melody.forEach((note, index) => {
      value += Math.sin(2 * Math.PI * note * 0.5 * t + index) * padMix * 0.015
    })

    value += Math.sin(2 * Math.PI * (bass * 2) * t + seeded(i, seed) * 0.4) * shimmer * 0.08
    value += Math.sin(2 * Math.PI * tempo * 2 * t) * pulse * 0.12
    value += (seeded(i, seed + 17) * 2 - 1) * shimmer * 0.015

    samples[i] = clamp(Math.tanh(value * gain) * 0.82, -0.98, 0.98)
  }

  const fadeSamples = Math.min(256, Math.floor(SAMPLE_COUNT * 0.01))
  for (let i = 0; i < fadeSamples; i += 1) {
    const fade = i / fadeSamples
    samples[i] *= fade
    samples[SAMPLE_COUNT - 1 - i] *= fade
  }

  return samples
}

function writeWav(filePath, samples) {
  const byteRate = SAMPLE_RATE * 2
  const blockAlign = 2
  const dataSize = samples.length * 2
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < samples.length; i += 1) {
    const pcm = clamp(Math.round(samples[i] * 32767), -32768, 32767)
    buffer.writeInt16LE(pcm, 44 + i * 2)
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, buffer)
}

fs.mkdirSync(path.join(OUT_DIR, 'maps'), { recursive: true })
fs.mkdirSync(path.join(OUT_DIR, 'battle'), { recursive: true })

const selectedTracks = ONLY_ARGS.length > 0
  ? TRACKS.filter((track) => ONLY_ARGS.some((target) => {
    const normalizedTarget = target.replace(/\.ogg$/i, '.wav')
    return track.file === normalizedTarget || track.file === target
  }))
  : TRACKS

if (ONLY_ARGS.length > 0 && selectedTracks.length === 0) {
  console.error('[audio] no procedural tracks matched --only filters:', ONLY_ARGS)
  process.exit(1)
}

const manifest = {}
selectedTracks.forEach((track) => {
  const outputPath = path.join(OUT_DIR, track.file)
  writeWav(outputPath, renderLoop(track))
  manifest[track.file] = {
    bytes: fs.statSync(outputPath).size,
    seconds: LOOP_SECONDS,
    sampleRate: SAMPLE_RATE
  }
})

if (WRITE_MANIFEST) {
  fs.writeFileSync(
    path.join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), tracks: manifest }, null, 2)}\n`
  )
}

console.log(JSON.stringify({
  tracks: selectedTracks.length,
  outDir: 'public/assets/audio',
  sampleRate: SAMPLE_RATE,
  loopSeconds: LOOP_SECONDS,
  only: ONLY_ARGS,
  manifest: WRITE_MANIFEST ? 'written' : 'skipped'
}, null, 2))
