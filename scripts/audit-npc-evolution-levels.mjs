#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

await withViteAuditServer(async ({ loadModule }) => {
  const [
    mapsModule,
    rulesModule,
    dataModule,
  ] = await Promise.all([
    loadModule('/src/game/data/godotMaps/godot_region_maps.js'),
    loadModule('/src/utils/wildEncounterRules.js'),
    loadModule('/src/utils/gameData.js'),
  ])

  const maps = mapsModule.default
  const { isLevelValidForSpecies, getSpeciesLevelBounds } = rulesModule
  const { MONSTERS } = dataModule
  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))

  const invalid = []
  const summaryByRole = new Map()
  let checkedTeamCount = 0
  let checkedCount = 0

  const bumpRoleCount = (role) => {
    summaryByRole.set(role, (summaryByRole.get(role) || 0) + 1)
  }

  for (const [mapId, map] of Object.entries(maps)) {
    for (const event of map?.runtimeEvents || []) {
      const properties = event?.properties || {}
      const team = Array.isArray(properties.team) ? properties.team : []
      if (team.length === 0) continue

      checkedTeamCount += 1
      const role = properties.role || event.type || 'unknown'
      const eventName = properties.name || event.id || '未命名事件'

      team.forEach((member, index) => {
        const pokemonId = Math.trunc(Number(member?.pokemonId ?? member?.id))
        const level = Math.trunc(Number(member?.level))
        checkedCount += 1
        bumpRoleCount(role)

        if (Number.isInteger(pokemonId) && Number.isInteger(level) && isLevelValidForSpecies(pokemonId, level)) {
          return
        }

        const monster = monsterById.get(pokemonId)
        const bounds = Number.isInteger(pokemonId) ? getSpeciesLevelBounds(pokemonId) : null
        invalid.push({
          mapId,
          eventId: event?.id || null,
          eventType: event?.type || null,
          role,
          eventName,
          slot: index + 1,
          pokemonId,
          pokemonName: monster?.name || null,
          level,
          allowedLevelRange: bounds
            ? `Lv.${bounds.min}-${bounds.max === 100 ? '100' : bounds.max}`
            : null,
        })
      })
    }
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      checkedTeamCount,
      checkedCount,
      invalidCount: invalid.length,
      summaryByRole: [...summaryByRole.entries()]
        .map(([role, count]) => ({ role, checkedCount: count }))
        .sort((left, right) => left.role.localeCompare(right.role, 'zh-Hans-CN')),
    },
    invalid,
  }, null, 2))

  if (invalid.length > 0) process.exitCode = 1
})
