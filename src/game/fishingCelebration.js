/** Presentation only: every successful catch has a distinct tier celebration. */
export const FISHING_CELEBRATIONS = Object.freeze({
  common: { style: 'sparkle', color: '#8dc5a5', duration: .9, particles: 16, rings: 0, rays: 0 },
  uncommon: { style: 'ripple', color: '#62c8ba', duration: 1.2, particles: 24, rings: 1, rays: 0 },
  rare: { style: 'starburst', color: '#61aeea', duration: 1.55, particles: 32, rings: 1, rays: 8 },
  epic: { style: 'spiral', color: '#b294ed', duration: 1.9, particles: 40, rings: 2, rays: 0 },
  legendary: { style: 'crown', color: '#e6bc67', duration: 2.3, particles: 48, rings: 2, rays: 12 }
})

export const getFishingCelebration = (tier) => FISHING_CELEBRATIONS[tier] || FISHING_CELEBRATIONS.common
