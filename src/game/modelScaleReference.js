import { ENVIRONMENT_ORIGINAL_MEASUREMENTS } from './data/environmentOriginalMeasurements.generated.js'

export const PLAYER_REFERENCE_HEIGHT = 1.55
export const TREE_MIN_HEIGHT_RATIO = 2.5

const TREE_SPECIES = {
  oak: { type: 'nature_tree_oak', heightRatio: 3.15 },
  default: { type: 'nature_tree_default', heightRatio: 2.9 },
  pine: { type: 'nature_tree_pine', heightRatio: 3.4 },
  palm: { type: 'pirate_palm_detailed_straight', heightRatio: 3.1 }
}
const TREE_SPECIES_BY_MODEL = {
  treeOak: 'oak', 'tree-oak': 'oak', nature_tree_oak: 'oak',
  treeDefault: 'default', 'tree-default': 'default', nature_tree_default: 'default',
  treePine: 'pine', 'tree-pine': 'pine', nature_tree_pine: 'pine',
  town_tree: 'default', town_tree_high: 'oak', platformer_tree_pine: 'pine',
  hex_unit_tree: 'default', hex_grass_forest: 'default', pirate_palm_detailed_straight: 'palm'
}

export const TREE_CATALOG_MODEL_KEYS = Object.keys(TREE_SPECIES_BY_MODEL).filter(key => key.includes('_'))

export function getTreeModelHeight(type) {
  const profile = TREE_SPECIES[TREE_SPECIES_BY_MODEL[type]]
  return profile ? ENVIRONMENT_ORIGINAL_MEASUREMENTS[profile.type]?.height ?? null : null
}

export function getTreeModelScale(type, heightRatio = null) {
  const profile = TREE_SPECIES[TREE_SPECIES_BY_MODEL[type]]
  const height = getTreeModelHeight(type)
  if (!profile || !(height > 0)) return null
  return Number((PLAYER_REFERENCE_HEIGHT * (heightRatio ?? profile.heightRatio) / height).toFixed(3))
}

export function getTreeModelMinimumScale(type) {
  const height = getTreeModelHeight(type)
  // Round upward: a fitted tree must remain at least 2.5 player heights.
  return height > 0 ? Math.ceil(PLAYER_REFERENCE_HEIGHT * TREE_MIN_HEIGHT_RATIO / height * 1000) / 1000 : 0
}
