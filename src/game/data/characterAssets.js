import identityManifest from './characterIdentityProfiles.json' with { type: 'json' }

// Logical IDs and event identities stay stable across authored collection versions.
export const CHARACTER_ASSET_VERSION = 'xingyin-characters-v2'
export const PLAYER_CHARACTER_KEY = 'player_child_adventurer'
export const CHARACTER_BASE_MODEL_KEYS = Object.freeze([
  PLAYER_CHARACTER_KEY,
  ...'abcdef'.split('').map((letter) => `blocky_character_${letter}`),
  'trainer_lieutenant', 'trainer_boss', 'trainer_merchant', 'trainer_breeder', 'trainer_challenge',
  'grave_character_ghost', 'grave_character_skeleton', 'grave_character_zombie',
  ...['sentinel', 'mystic', 'warden', 'master'].map((role) => `elite_frost_${role}`),
  ...['diver', 'hunter', 'priest', 'master'].map((role) => `elite_tide_${role}`),
  ...['smith', 'engineer', 'royal_guard', 'master'].map((role) => `elite_iron_${role}`),
  ...['examiner', 'hunter', 'gatekeeper', 'master'].map((role) => `elite_dragon_${role}`)
])
export const CHARACTER_IDENTITY_PROFILES = Object.freeze(identityManifest.identities.map((profile) => Object.freeze({
  ...identityManifest.maps[profile.mapId], ...profile, id: `npc_${profile.eventId}`,
  height: profile.role === 'boss' ? 1.84 : profile.role === 'lieutenant' ? 1.72 : profile.age === 'young' ? 1.48 : profile.age === 'elder' ? 1.52 : 1.58
})))
export const CHARACTER_MODEL_KEYS = Object.freeze([...CHARACTER_BASE_MODEL_KEYS, ...CHARACTER_IDENTITY_PROFILES.map((profile) => profile.id)])
const IDENTITY_BY_EVENT = new Map(CHARACTER_IDENTITY_PROFILES.map((profile) => [`${profile.mapId}:${profile.eventId}`, profile]))
export const getCharacterIdentity = (mapId, eventId) => IDENTITY_BY_EVENT.get(`${mapId}:${eventId}`) || null
const CHARACTER_KEYS = new Set(CHARACTER_MODEL_KEYS)
export const isCharacterModelKey = (key) => CHARACTER_KEYS.has(key)
export const characterAssetPath = (key) => `/assets/3d/${CHARACTER_ASSET_VERSION}/${key}.glb`

export function resolveCharacterModelKey(type, decoration = {}) {
  if (!type?.startsWith('blocky_character_')) return type
  const role = decoration.npcRole || decoration.eventType
  if (['lieutenant', 'boss', 'merchant', 'challenge'].includes(role)) return `trainer_${role}`
  return type
}
