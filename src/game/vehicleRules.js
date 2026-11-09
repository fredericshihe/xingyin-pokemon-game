export const VEHICLE_KEYS = Object.freeze(['bicycle', 'sports_car'])

export function normalizeEquippedVehicle(value, options) {
  if (!options) return VEHICLE_KEYS.includes(value) ? value : null
  const { hasBicycle = false, hasSportsCar = false } = options
  const owned = value === 'sports_car' && hasSportsCar
    ? 'sports_car'
    : value === 'bicycle' && hasBicycle
      ? 'bicycle'
      : hasBicycle
        ? 'bicycle'
        : hasSportsCar
          ? 'sports_car'
          : null
  return owned
}

export function getVehicleDisplayName(vehicle) {
  return vehicle === 'sports_car' ? '跑车' : '自行车'
}
