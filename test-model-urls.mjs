// Test model loading
import { MODEL_URLS } from './src/game/threeLowPolyModelCache.js'

console.log('=== Model URL Check ===\n')

const testModels = [
  'nature_rock_large',
  'nature_stone_large',
  'nature_bush_large',
  'nature_log_stack',
  'rock',
  'stone',
  'bush'
]

testModels.forEach(key => {
  const url = MODEL_URLS[key]
  console.log(`${key}: ${url ? '✓ ' + url : '✗ NOT FOUND'}`)
})
