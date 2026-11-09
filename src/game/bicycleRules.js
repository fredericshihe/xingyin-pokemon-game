import { ENCOUNTER_LEGACY_TILES } from './world/constants'
export const BICYCLE_SPEED_MULTIPLIER = 1.6
export const SPORTS_CAR_SPEED_MULTIPLIER = 4
export const isBicycleGrassTile = (tile, hasGrassModel = false) => hasGrassModel || ENCOUNTER_LEGACY_TILES.has(tile)
export const getBicycleStepDuration = ({ riding, vehicle = 'bicycle', fromGrass = false, toGrass = false, walkDuration = 285 }) => (
  Math.round(walkDuration / (riding && !fromGrass && !toGrass
    ? vehicle === 'sports_car' ? SPORTS_CAR_SPEED_MULTIPLIER : BICYCLE_SPEED_MULTIPLIER : 1))
)
