// Render overrides belong to a specific authored model and transform, never
// its position in an array. Inserting a new prop cannot hide or resize an NPC.
export function getEnvironmentObjectKey(object) {
  return JSON.stringify([
    object.type, object.sourceId ?? null, object.x, object.y,
    object.scale ?? null, object.rotation ?? null
  ])
}
