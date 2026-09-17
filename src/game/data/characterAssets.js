// Original Blender-authored collection. IDs remain compatible with saved map events.
export const CHARACTER_ASSET_VERSION = 'xingyin-characters-v1'
export const PLAYER_CHARACTER_KEY = 'player_child_adventurer'
export const CHARACTER_MODEL_KEYS = Object.freeze([
  PLAYER_CHARACTER_KEY,
  ...'abcdef'.split('').map((letter) => `blocky_character_${letter}`),
  'trainer_lieutenant', 'trainer_boss', 'trainer_merchant', 'trainer_challenge',
  'grave_character_ghost', 'grave_character_skeleton', 'grave_character_zombie',
  ...['sentinel', 'mystic', 'warden', 'master'].map((role) => `elite_frost_${role}`),
  ...['diver', 'hunter', 'priest', 'master'].map((role) => `elite_tide_${role}`),
  ...['smith', 'engineer', 'royal_guard', 'master'].map((role) => `elite_iron_${role}`),
  ...['examiner', 'hunter', 'gatekeeper', 'master'].map((role) => `elite_dragon_${role}`)
])
const CHARACTER_KEYS = new Set(CHARACTER_MODEL_KEYS)
export const isCharacterModelKey = (key) => CHARACTER_KEYS.has(key)
export const characterAssetPath = (key) => `/assets/3d/${CHARACTER_ASSET_VERSION}/${key}.glb`

export function resolveCharacterModelKey(type, decoration = {}) {
  if (!type?.startsWith('blocky_character_')) return type
  const role = decoration.npcRole || decoration.eventType
  if (['lieutenant', 'boss', 'merchant', 'challenge'].includes(role)) return `trainer_${role}`
  return type
}
