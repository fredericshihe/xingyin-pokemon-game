const clamp = (value, low, high) => Math.max(low, Math.min(high, value))

export const CHARACTER_WALK_DUTY = .5

/** The supporting leg stays almost straight; the hip follows its reachable arc. */
export function getCharacterGaitBodyOffset({ phase, blend, legLength, standingHeight = legLength, halfStride, stanceFraction = CHARACTER_WALK_DUTY }) {
  const cycle = ((phase / (Math.PI * 2)) % .5 + .5) % .5
  const duty = clamp(stanceFraction, .28, .5)
  const reach = halfStride * blend
  const drop = z => Math.sqrt(Math.max(.0001, legLength * legLength - z * z)) - legLength
  const neutral = (legLength - standingHeight - .001) * blend
  if (cycle < duty) return drop(reach * (1 - 2 * cycle / duty)) + neutral
  const flight = (cycle - duty) / (.5 - duty)
  const edge = drop(reach) + neutral
  return edge + Math.sin(flight * Math.PI) * (-edge + .008 * blend)
}

/** Foot placement and two-link angles in the character's local Y-up space. */
export function solveCharacterLegGait({ phase, blend, hipY, upperLength, lowerLength, lowerBindAngle = 0, ankleY, halfStride = .16, swingHeight = .045, stanceFraction = CHARACTER_WALK_DUTY }) {
  const cycle = ((phase / (Math.PI * 2)) % 1 + 1) % 1
  const duty = clamp(stanceFraction, .28, .5)
  const stance = cycle < duty
  const progress = stance ? cycle / duty : (cycle - duty) / (1 - duty)
  const eased = progress * progress * (3 - 2 * progress)
  const footZ = (stance ? halfStride * (1 - progress * 2) : halfStride * (eased * 2 - 1)) * blend
  const footY = ankleY + (stance ? 0 : Math.sin(progress * Math.PI) * swingHeight * blend)
  const dy = footY - hipY, dz = footZ
  const distance = clamp(Math.hypot(dy, dz), .001, upperLength + lowerLength - .0001)
  const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance)
  const front = Math.sqrt(Math.max(0, upperLength * upperLength - along * along))
  const actualDistance = Math.max(.001, Math.hypot(dy, dz))
  const kneeY = dy / actualDistance * along + dz / actualDistance * front
  const kneeZ = dz / actualDistance * along - dy / actualDistance * front
  const upperAngle = -Math.atan2(kneeZ, -kneeY)
  const lowerWorldAngle = -Math.atan2(dz - kneeZ, -(dy - kneeY)) + lowerBindAngle
  return { upperAngle, lowerAngle: lowerWorldAngle - upperAngle, footY, footZ, stance }
}
