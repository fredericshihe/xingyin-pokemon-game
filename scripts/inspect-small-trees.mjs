import { MAP_CATALOG, MAP_CHAIN } from '../src/game/data/mapCatalog.js'
import { getRenderedObjectScale } from '../src/game/mapModelScaleNormalization.js'
import { ENVIRONMENT_ORIGINAL_MEASUREMENTS } from '../src/game/data/environmentOriginalMeasurements.generated.js'
import { getDecorativeModel } from '../src/game/decorativeModelSpec.js'

for (const id of MAP_CHAIN) {
  const objects = MAP_CATALOG[id].mapInfo.decorativeObjects || []
  const relevant = objects.filter((object) => /tree|forest|bush|palm|shrub|willow/i.test(object.type))
  const groups = new Map()
  for (const object of relevant) {
    const key = getDecorativeModel(object.type, object)?.key || object.type
    const height = ENVIRONMENT_ORIGINAL_MEASUREMENTS[key]?.height
    const visualHeight = height && height * getRenderedObjectScale(object)
    const category = `${object.type} [${key}]`
    const group = groups.get(category) || { count: 0, minHeight: Infinity, maxHeight: 0, sources: new Map() }
    group.count++
    if (visualHeight) {
      group.minHeight = Math.min(group.minHeight, visualHeight)
      group.maxHeight = Math.max(group.maxHeight, visualHeight)
    }
    const source = object.sourceId?.replace(/_\d+$/, '') || '(authored)'
    group.sources.set(source, (group.sources.get(source) || 0) + 1)
    groups.set(category, group)
  }
  console.log(id, relevant.length)
  for (const [name, group] of [...groups].sort((a, b) => b[1].count - a[1].count)) {
    const range = Number.isFinite(group.minHeight) ? `${group.minHeight.toFixed(2)}-${group.maxHeight.toFixed(2)}m` : '?'
    console.log(' ', name, group.count, range, [...group.sources].sort((a, b) => b[1] - a[1]).slice(0, 4))
  }
}
