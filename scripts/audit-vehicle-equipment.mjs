import assert from 'node:assert/strict'
import { normalizeEquippedVehicle } from '../src/game/vehicleRules.js'

assert.equal(normalizeEquippedVehicle('bicycle', { hasBicycle: true, hasSportsCar: true }), 'bicycle')
assert.equal(normalizeEquippedVehicle('sports_car', { hasBicycle: true, hasSportsCar: true }), 'sports_car')
assert.equal(normalizeEquippedVehicle('sports_car', { hasBicycle: true, hasSportsCar: false }), 'bicycle')
assert.equal(normalizeEquippedVehicle('bicycle', { hasBicycle: false, hasSportsCar: true }), 'sports_car')
assert.equal(normalizeEquippedVehicle(null, { hasBicycle: false, hasSportsCar: true }), 'sports_car')
assert.equal(normalizeEquippedVehicle('sports_car'), 'sports_car', 'Legacy save keeps the selected vehicle until inventory is checked')
assert.equal(normalizeEquippedVehicle('invalid'), null)
console.log(JSON.stringify({ ok: true, checks: 7, rule: 'inventory-validated equipment with legacy-safe fallback' }))
