import { getCharacterIdentity, isCharacterModelKey } from './data/characterAssets.js'
import { getDecorativeModel } from './decorativeModelSpec.js'

/** Identity authoring replaces visual assets while retaining the exact gameplay event. */
export function applyCharacterMapIdentities(map) {
  const profiles = new Map()
  const decorativeObjects = (map.decorativeObjects || []).map((object) => {
    const key = getDecorativeModel(object.type, object)?.key
    if (!isCharacterModelKey(key)) return object
    const identity = getCharacterIdentity(map.id, object.eventId)
    if (identity) {
      profiles.set(object.eventId, identity)
      return { ...object, type: identity.id, scale: 1, characterIdentity: identity.id }
    }
    // The distinct dojo models use their source height plus an authored scale.
    // Fit the total height to the common world reference rather than multiplying two large values.
    if (key.startsWith('elite_')) {
      const master = key.endsWith('_master')
      return { ...object, scale: (master ? 1.94 : 1.73) / (master ? 2.96 : 2.63) }
    }
    return object
  })
  const runtimeEvents = (map.runtimeEvents || []).map((event) => {
    const identity = profiles.get(event.id)
    return identity ? { ...event, properties: { ...event.properties, characterModel: identity.id, characterIdentity: identity.id } } : event
  })
  return { ...map, decorativeObjects, runtimeEvents }
}
