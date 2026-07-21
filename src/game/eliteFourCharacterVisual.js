import * as THREE from 'three'

export const ELITE_FOUR_CHARACTER_PROFILES = Object.freeze({
  elite_frost_sentinel: {
    displayName: '霜纹哨兵',
    theme: 'frost',
    rank: 'lieutenant',
    archetype: 'frost-sentinel',
    proportions: [1.12, 0.98, 1.04],
    coat: 0x247f9a,
    cloth: 0xd8f7fb,
    accent: 0x6ee7f2,
    dark: 0x164e63,
    skin: 0xf3c7ad,
    hair: 0xdffbff
  },
  elite_frost_mystic: {
    displayName: '镜湖术士',
    theme: 'frost',
    rank: 'lieutenant',
    archetype: 'frost-mystic',
    proportions: [0.88, 1.08, 0.92],
    coat: 0x87cbd8,
    cloth: 0xf2fdff,
    accent: 0x8cf3ff,
    dark: 0x245f73,
    skin: 0xe9bfa8,
    hair: 0xf8ffff
  },
  elite_frost_warden: {
    displayName: '白雾守卫',
    theme: 'frost',
    rank: 'lieutenant',
    archetype: 'frost-warden',
    proportions: [1.18, 0.94, 1.08],
    coat: 0xdceff2,
    cloth: 0x4a91a7,
    accent: 0xb6f7ff,
    dark: 0x173e52,
    skin: 0xefc5ad,
    hair: 0xb9dce4
  },
  elite_frost_master: {
    displayName: '霜镜天王',
    theme: 'frost',
    rank: 'master',
    archetype: 'frost-master',
    proportions: [1.08, 1.14, 1.04],
    coat: 0xe8fbff,
    cloth: 0x4fbfd2,
    accent: 0x8cf3ff,
    dark: 0x155e75,
    skin: 0xf1c4aa,
    hair: 0xf8ffff
  },
  elite_tide_diver: {
    displayName: '潮汐潜员',
    theme: 'tide',
    rank: 'lieutenant',
    archetype: 'tide-diver',
    proportions: [1.17, 0.92, 1.12],
    coat: 0x125d68,
    cloth: 0x2fb6b2,
    accent: 0x67e8d8,
    dark: 0x123f4a,
    skin: 0xdcae92,
    hair: 0x102f3c
  },
  elite_tide_hunter: {
    displayName: '深海猎手',
    theme: 'tide',
    rank: 'lieutenant',
    archetype: 'tide-hunter',
    proportions: [0.9, 1.06, 0.94],
    coat: 0x0e7480,
    cloth: 0x164c63,
    accent: 0x58e5d3,
    dark: 0x092f3a,
    skin: 0xd5a58a,
    hair: 0x0b2633
  },
  elite_tide_priest: {
    displayName: '漩涡祭司',
    theme: 'tide',
    rank: 'lieutenant',
    archetype: 'tide-priest',
    proportions: [1.02, 1.05, 1.02],
    coat: 0x3c9f99,
    cloth: 0xd7f7ef,
    accent: 0x8af4df,
    dark: 0x164957,
    skin: 0xe1b499,
    hair: 0xc9f4e9
  },
  elite_tide_master: {
    displayName: '深潮天王',
    theme: 'tide',
    rank: 'master',
    archetype: 'tide-master',
    proportions: [1.07, 1.15, 1.08],
    coat: 0x153f5d,
    cloth: 0x29b7ad,
    accent: 0x8af4df,
    dark: 0x0b2737,
    skin: 0xd8a88c,
    hair: 0xd7fff7
  },
  elite_iron_smith: {
    displayName: '铸盾工匠',
    theme: 'iron',
    rank: 'lieutenant',
    archetype: 'iron-smith',
    proportions: [1.2, 0.94, 1.1],
    coat: 0x565f66,
    cloth: 0x8b633d,
    accent: 0xf0b63f,
    dark: 0x292e33,
    skin: 0xc9997b,
    hair: 0x242424
  },
  elite_iron_engineer: {
    displayName: '磁轨技师',
    theme: 'iron',
    rank: 'lieutenant',
    archetype: 'iron-engineer',
    proportions: [0.9, 1.06, 0.94],
    coat: 0x566a70,
    cloth: 0x91a1a6,
    accent: 0x57d6d0,
    dark: 0x252c33,
    skin: 0xd0a083,
    hair: 0x38444a
  },
  elite_iron_royal_guard: {
    displayName: '王座禁卫',
    theme: 'iron',
    rank: 'lieutenant',
    archetype: 'iron-royal-guard',
    proportions: [1.24, 1.01, 1.14],
    coat: 0x414a52,
    cloth: 0x737f87,
    accent: 0xe8be5a,
    dark: 0x1f252a,
    skin: 0xc79577,
    hair: 0x2b3034
  },
  elite_iron_master: {
    displayName: '铁壁天王',
    theme: 'iron',
    rank: 'master',
    archetype: 'iron-master',
    proportions: [1.16, 1.13, 1.12],
    coat: 0x343d45,
    cloth: 0xa8b1b7,
    accent: 0xf3c451,
    dark: 0x171d22,
    skin: 0xc79577,
    hair: 0xd6d9dc
  },
  elite_dragon_examiner: {
    displayName: '龙牙试炼官',
    theme: 'dragon',
    rank: 'lieutenant',
    archetype: 'dragon-examiner',
    proportions: [0.92, 1.08, 0.96],
    coat: 0x674080,
    cloth: 0xb18bd0,
    accent: 0xd4a0ff,
    dark: 0x2c1838,
    skin: 0xd4a58e,
    hair: 0x24152d
  },
  elite_dragon_hunter: {
    displayName: '天穹追猎者',
    theme: 'dragon',
    rank: 'lieutenant',
    archetype: 'dragon-hunter',
    proportions: [1.03, 1.03, 0.92],
    coat: 0x3f2754,
    cloth: 0x7c4d9f,
    accent: 0xc28cff,
    dark: 0x1d1027,
    skin: 0xc99982,
    hair: 0x17101d
  },
  elite_dragon_gatekeeper: {
    displayName: '终焉守门人',
    theme: 'dragon',
    rank: 'lieutenant',
    archetype: 'dragon-gatekeeper',
    proportions: [1.22, 1, 1.12],
    coat: 0x57366e,
    cloth: 0x8f68a7,
    accent: 0xe1b4ff,
    dark: 0x261431,
    skin: 0xd0a088,
    hair: 0x2d1837
  },
  elite_dragon_master: {
    displayName: '龙穹天王',
    theme: 'dragon',
    rank: 'master',
    archetype: 'dragon-master',
    proportions: [1.1, 1.16, 1.08],
    coat: 0x21132b,
    cloth: 0x75469b,
    accent: 0xd6a4ff,
    dark: 0x110a17,
    skin: 0xd1a087,
    hair: 0xe7d8f4
  }
})

const ELITE_FOUR_CHARACTER_TYPES = new Set(Object.keys(ELITE_FOUR_CHARACTER_PROFILES))
const HEAVY_ARCHETYPES = new Set([
  'frost-sentinel',
  'frost-warden',
  'tide-diver',
  'iron-smith',
  'iron-royal-guard',
  'iron-master',
  'dragon-gatekeeper'
])
const ROBED_ARCHETYPES = new Set([
  'frost-mystic',
  'frost-master',
  'tide-priest',
  'tide-master',
  'dragon-examiner',
  'dragon-master'
])

function makeMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.7,
    metalness: options.metalness ?? 0.06,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    flatShading: true,
    side: options.side ?? THREE.FrontSide
  })
}

function addMesh(group, geometry, material, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  mesh.scale.set(...scale)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

function addPair(callback) {
  ;[-1, 1].forEach((side) => callback(side))
}

function addCrystal(group, material, position, size = 0.16, rotation = [0, 0, 0], scale = [0.78, 1.35, 0.78]) {
  return addMesh(
    group,
    new THREE.OctahedronGeometry(size, 0),
    material,
    position,
    rotation,
    scale
  )
}

function addBaseFace(group, profile, materials) {
  addMesh(group, new THREE.SphereGeometry(0.28, 12, 9), materials.skin, [0, 2.18, 0.03], [0, 0, 0], [0.94, 1.05, 0.9])
  addMesh(group, new THREE.SphereGeometry(0.032, 8, 6), materials.eye, [-0.1, 2.21, 0.275])
  addMesh(group, new THREE.SphereGeometry(0.032, 8, 6), materials.eye, [0.1, 2.21, 0.275])

  const enclosedHelmet = ['tide-diver', 'iron-royal-guard', 'iron-master'].includes(profile.archetype)
  if (!enclosedHelmet) {
    addMesh(
      group,
      new THREE.SphereGeometry(0.292, 10, 8),
      materials.hair,
      [0, 2.3, -0.045],
      [0, 0, 0],
      [1, 0.7, 1]
    )
  }
}

function addThemeEmblem(group, profile, materials) {
  if (profile.theme === 'frost') {
    addCrystal(group, materials.glow, [0, 1.53, 0.34], 0.12, [0, 0.2, 0], [0.72, 1.42, 0.45])
  } else if (profile.theme === 'tide') {
    addMesh(group, new THREE.TorusGeometry(0.13, 0.035, 6, 14), materials.glow, [0, 1.53, 0.34])
    addMesh(group, new THREE.SphereGeometry(0.045, 7, 5), materials.accent, [0, 1.53, 0.36])
  } else if (profile.theme === 'iron') {
    addMesh(group, new THREE.BoxGeometry(0.24, 0.24, 0.07), materials.metal, [0, 1.53, 0.34], [0, 0, Math.PI / 4])
    addMesh(group, new THREE.BoxGeometry(0.08, 0.08, 0.09), materials.accent, [0, 1.53, 0.38])
  } else {
    addMesh(group, new THREE.DodecahedronGeometry(0.13, 0), materials.glow, [0, 1.53, 0.34], [0, 0.25, 0])
  }
}

function addBaseBody(group, profile, materials) {
  const master = profile.rank === 'master'
  const heavy = HEAVY_ARCHETYPES.has(profile.archetype)
  const robed = ROBED_ARCHETYPES.has(profile.archetype)
  const stance = heavy ? 0.19 : 0.16
  const torsoWidth = master ? 0.39 : heavy ? 0.38 : 0.33

  addPair((side) => {
    addMesh(group, new THREE.BoxGeometry(0.24, 0.24, heavy ? 0.43 : 0.36), materials.dark, [side * stance, 0.16, 0.07])
    addMesh(group, new THREE.CylinderGeometry(0.115, 0.135, 0.62, 7), materials.cloth, [side * stance, 0.56, 0])
  })

  if (robed) {
    addMesh(group, new THREE.CylinderGeometry(master ? 0.35 : 0.31, master ? 0.52 : 0.46, 0.9, 9), materials.coat, [0, 0.91, -0.02])
  } else {
    addMesh(group, new THREE.CylinderGeometry(torsoWidth - 0.02, torsoWidth + 0.1, 0.86, 8), materials.coat, [0, 0.92, -0.01])
  }

  addMesh(group, new THREE.CylinderGeometry(torsoWidth + 0.02, torsoWidth - 0.03, 0.88, 8), materials.cloth, [0, 1.48, 0])
  addMesh(group, new THREE.CylinderGeometry(torsoWidth + 0.03, torsoWidth + 0.03, 0.12, 8), materials.accent, [0, 1.08, 0])

  addPair((side) => {
    const armX = master ? 0.46 : heavy ? 0.44 : 0.4
    addMesh(group, new THREE.CapsuleGeometry(0.09, 0.54, 5, 9), materials.coat, [side * armX, 1.36, 0], [0, 0, side * -0.08])
    addMesh(group, new THREE.SphereGeometry(0.1, 8, 6), materials.skin, [side * (armX + 0.03), 1.03, 0.02])
  })

  addThemeEmblem(group, profile, materials)
  addBaseFace(group, profile, materials)
}

function addCrystalShoulders(group, materials, size = 0.21) {
  addPair((side) => {
    addCrystal(group, materials.glow, [side * 0.46, 1.73, -0.01], size, [0, 0, side * 0.3], [1.12, 0.72, 0.92])
  })
}

function addFrostSentinel(group, materials) {
  addCrystalShoulders(group, materials, 0.23)
  ;[-0.17, 0, 0.17].forEach((x, index) => {
    addCrystal(group, materials.glow, [x, 2.51 + (index === 1 ? 0.08 : 0), -0.02], index === 1 ? 0.14 : 0.1)
  })
  addMesh(group, new THREE.BoxGeometry(0.42, 0.82, 0.12), materials.dark, [-0.58, 1.24, 0.08])
  addCrystal(group, materials.accent, [-0.58, 1.24, 0.16], 0.16, [0, 0, Math.PI / 4], [0.7, 1.35, 0.36])
  addMesh(group, new THREE.CylinderGeometry(0.035, 0.045, 1.72, 7), materials.dark, [0.58, 1.2, 0.05])
  addCrystal(group, materials.glow, [0.58, 2.05, 0.05], 0.18)
}

function addFrostMystic(group, materials) {
  addMesh(group, new THREE.TorusGeometry(0.43, 0.055, 7, 20), materials.glow, [0, 2.12, -0.3])
  addMesh(group, new THREE.ConeGeometry(0.33, 0.42, 7), materials.cloth, [0, 2.56, -0.02])
  addCrystal(group, materials.glow, [0, 2.79, -0.02], 0.11)
  addMesh(group, new THREE.CylinderGeometry(0.028, 0.038, 1.35, 7), materials.dark, [0.5, 1.35, 0.05])
  addMesh(group, new THREE.TorusGeometry(0.17, 0.035, 6, 16), materials.accent, [0.5, 2.03, 0.05])
  addCrystal(group, materials.glow, [0.5, 2.03, 0.05], 0.1, [0, 0.25, 0], [0.65, 1.25, 0.65])
}

function addFrostWarden(group, materials) {
  addMesh(group, new THREE.TorusGeometry(0.38, 0.105, 7, 16), materials.hair, [0, 1.84, 0.01])
  addMesh(group, new THREE.CylinderGeometry(0.29, 0.33, 0.3, 8), materials.cloth, [0, 2.39, -0.02])
  addPair((side) => {
    addCrystal(group, materials.glow, [side * 0.43, 1.74, -0.01], 0.2, [0, 0, side * 0.45], [1.2, 0.7, 1])
    addMesh(group, new THREE.BoxGeometry(0.1, 1.22, 0.1), materials.accent, [side * 0.31, 1.54, -0.32], [0, 0, side * 0.48])
    addCrystal(group, materials.glow, [side * 0.58, 2.04, -0.32], 0.13, [0, 0, side * 0.48], [0.6, 1.4, 0.6])
  })
  addMesh(group, new THREE.BoxGeometry(0.42, 0.1, 0.06), materials.dark, [0, 2.17, 0.29])
}

function addFrostMaster(group, materials) {
  addPair((side) => {
    addMesh(group, new THREE.BoxGeometry(0.34, 1.38, 0.09), materials.cape, [side * 0.2, 1.22, -0.31], [0.06, 0, side * -0.13])
    addCrystal(group, materials.glow, [side * 0.5, 1.78, -0.01], 0.27, [0, 0, side * 0.32], [1.1, 0.72, 0.9])
  })
  ;[-0.22, 0, 0.22].forEach((x, index) => {
    addCrystal(group, materials.glow, [x, 2.59 + (index === 1 ? 0.1 : 0), -0.02], index === 1 ? 0.17 : 0.12)
  })
  addMesh(group, new THREE.CylinderGeometry(0.035, 0.045, 1.95, 8), materials.dark, [0.64, 1.16, 0.06])
  ;[0, Math.PI / 3, -Math.PI / 3].forEach((angle) => {
    addMesh(group, new THREE.BoxGeometry(0.48, 0.055, 0.08), materials.glow, [0.64, 2.15, 0.06], [0, 0, angle])
  })
  addCrystal(group, materials.accent, [0.64, 2.15, 0.07], 0.12)
}

function addTideDiver(group, materials) {
  addMesh(group, new THREE.CylinderGeometry(0.31, 0.33, 0.35, 10), materials.metal, [0, 2.33, -0.02])
  addMesh(group, new THREE.TorusGeometry(0.25, 0.055, 7, 18), materials.accent, [0, 2.18, 0.26])
  addPair((side) => {
    addMesh(group, new THREE.CylinderGeometry(0.105, 0.105, 0.72, 8), materials.dark, [side * 0.18, 1.42, -0.35])
    addMesh(group, new THREE.BoxGeometry(0.28, 0.1, 0.58), materials.accent, [side * 0.19, 0.15, 0.16], [0, side * 0.08, 0])
  })
  addMesh(group, new THREE.BoxGeometry(0.72, 0.17, 0.38), materials.metal, [0, 1.75, -0.16])
}

function addTideHunter(group, materials) {
  addMesh(group, new THREE.BoxGeometry(0.48, 0.09, 0.08), materials.accent, [0, 2.22, 0.29])
  addMesh(group, new THREE.ConeGeometry(0.23, 0.76, 4), materials.cloth, [0, 1.62, -0.38], [Math.PI / 2, 0, 0], [0.72, 1, 1.1])
  addPair((side) => {
    addMesh(group, new THREE.ConeGeometry(0.11, 0.44, 5), materials.accent, [side * 0.45, 1.72, -0.03], [0, 0, side * -1.15])
  })
  addMesh(group, new THREE.CylinderGeometry(0.03, 0.04, 1.85, 7), materials.dark, [0.58, 1.2, 0.07])
  ;[-1, 0, 1].forEach((offset) => {
    addMesh(group, new THREE.ConeGeometry(0.045, offset === 0 ? 0.38 : 0.29, 6), materials.glow, [0.58 + offset * 0.11, 2.12 - Math.abs(offset) * 0.04, 0.07])
  })
}

function addTidePriest(group, materials) {
  addMesh(group, new THREE.TorusGeometry(0.42, 0.06, 7, 18), materials.accent, [0, 2.15, -0.31])
  ;[-2, -1, 0, 1, 2].forEach((index) => {
    const angle = Math.PI / 2 + index * 0.42
    addMesh(group, new THREE.SphereGeometry(0.075, 7, 5), materials.glow, [Math.cos(angle) * 0.42, 2.15 + Math.sin(angle) * 0.42, -0.31])
  })
  addPair((side) => {
    addMesh(group, new THREE.ConeGeometry(0.19, 0.48, 7), materials.accent, [side * 0.45, 1.72, -0.03], [0, 0, side * -1.12], [0.58, 1, 1])
  })
  addMesh(group, new THREE.CylinderGeometry(0.03, 0.04, 1.7, 7), materials.dark, [0.57, 1.2, 0.05])
  ;[-1, 0, 1].forEach((offset) => {
    addMesh(group, new THREE.ConeGeometry(0.05, offset === 0 ? 0.4 : 0.31, 6), materials.glow, [0.57 + offset * 0.13, 2.08 - Math.abs(offset) * 0.05, 0.05])
  })
}

function addTideMaster(group, materials) {
  addPair((side) => {
    addMesh(group, new THREE.ConeGeometry(0.38, 1.35, 7), materials.cape, [side * 0.29, 1.25, -0.31], [0, 0, side * -0.18], [0.5, 1, 0.72])
    addMesh(group, new THREE.ConeGeometry(0.25, 0.58, 7), materials.glow, [side * 0.5, 1.78, -0.03], [0, 0, side * -1.12], [0.6, 1, 1])
  })
  addMesh(group, new THREE.TorusGeometry(0.32, 0.06, 7, 20), materials.glow, [0, 2.48, -0.03])
  addMesh(group, new THREE.ConeGeometry(0.14, 0.48, 7), materials.accent, [0, 2.78, -0.04])
  addMesh(group, new THREE.CylinderGeometry(0.035, 0.045, 1.95, 8), materials.dark, [0.64, 1.16, 0.06])
  addMesh(group, new THREE.TorusGeometry(0.28, 0.045, 7, 20), materials.glow, [0.64, 2.14, 0.06])
  addMesh(group, new THREE.SphereGeometry(0.13, 8, 6), materials.accent, [0.64, 2.14, 0.07])
}

function addIronSmith(group, materials) {
  addMesh(group, new THREE.BoxGeometry(0.52, 0.78, 0.09), materials.dark, [0, 1.3, 0.33])
  addMesh(group, new THREE.BoxGeometry(0.34, 0.12, 0.08), materials.accent, [0, 1.55, 0.39])
  addMesh(group, new THREE.CylinderGeometry(0.3, 0.31, 0.25, 8), materials.metal, [0, 2.38, -0.02])
  addMesh(group, new THREE.BoxGeometry(0.52, 0.08, 0.08), materials.dark, [0, 2.2, 0.29])
  addPair((side) => {
    addMesh(group, new THREE.BoxGeometry(0.38, 0.24, 0.4), materials.metal, [side * 0.46, 1.7, 0])
  })
  addMesh(group, new THREE.CylinderGeometry(0.045, 0.055, 1.58, 8), materials.dark, [0.62, 1.28, 0.05], [0, 0, -0.12])
  addMesh(group, new THREE.BoxGeometry(0.58, 0.38, 0.32), materials.metal, [0.7, 2.03, 0.05], [0, 0, -0.12])
  addMesh(group, new THREE.BoxGeometry(0.26, 0.1, 0.35), materials.accent, [0.7, 2.03, 0.22], [0, 0, -0.12])
}

function addIronEngineer(group, materials) {
  addMesh(group, new THREE.BoxGeometry(0.5, 0.09, 0.07), materials.accent, [0, 2.21, 0.3])
  addMesh(group, new THREE.BoxGeometry(0.5, 0.64, 0.28), materials.dark, [0, 1.48, -0.35])
  addPair((side) => {
    addMesh(group, new THREE.TorusGeometry(0.15, 0.04, 7, 16), materials.glow, [side * 0.32, 1.48, -0.37], [0, 0, 0])
    addMesh(group, new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), materials.metal, [side * 0.22, 2.02, -0.26], [0, 0, side * -0.2])
    addMesh(group, new THREE.SphereGeometry(0.055, 7, 5), materials.glow, [side * 0.29, 2.36, -0.25])
  })
  addMesh(group, new THREE.CylinderGeometry(0.04, 0.045, 1.3, 7), materials.dark, [0.52, 1.25, 0.05])
  addMesh(group, new THREE.TorusGeometry(0.17, 0.045, 7, 16, Math.PI * 1.55), materials.metal, [0.52, 1.93, 0.05], [0, 0, 0.72])
}

function addIronRoyalGuard(group, materials) {
  addMesh(group, new THREE.CylinderGeometry(0.3, 0.32, 0.37, 8), materials.metal, [0, 2.34, -0.01])
  addMesh(group, new THREE.BoxGeometry(0.5, 0.11, 0.08), materials.dark, [0, 2.2, 0.28])
  addMesh(group, new THREE.BoxGeometry(0.1, 0.38, 0.08), materials.accent, [0, 2.55, -0.01])
  addPair((side) => {
    addMesh(group, new THREE.BoxGeometry(0.43, 0.28, 0.46), materials.metal, [side * 0.49, 1.7, 0])
  })
  addMesh(group, new THREE.BoxGeometry(0.48, 1.02, 0.14), materials.metal, [-0.6, 1.25, 0.08])
  addMesh(group, new THREE.BoxGeometry(0.12, 0.82, 0.04), materials.accent, [-0.6, 1.25, 0.17])
  addMesh(group, new THREE.BoxGeometry(0.36, 0.12, 0.04), materials.accent, [-0.6, 1.38, 0.17])
  addMesh(group, new THREE.CylinderGeometry(0.035, 0.045, 1.95, 8), materials.dark, [0.62, 1.18, 0.05])
  addMesh(group, new THREE.ConeGeometry(0.11, 0.45, 6), materials.accent, [0.62, 2.19, 0.05])
}

function addGearHalo(group, materials, center = [0, 2.12, -0.34], radius = 0.47) {
  addMesh(group, new THREE.TorusGeometry(radius, 0.07, 7, 22), materials.metal, center)
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI * 2 * index) / 8
    addMesh(
      group,
      new THREE.BoxGeometry(0.16, 0.1, 0.1),
      materials.accent,
      [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius, center[2]],
      [0, 0, angle]
    )
  }
}

function addIronMaster(group, materials) {
  addMesh(group, new THREE.BoxGeometry(0.9, 1.5, 0.12), materials.cape, [0, 1.25, -0.32], [0.06, 0, 0])
  addGearHalo(group, materials)
  addMesh(group, new THREE.CylinderGeometry(0.31, 0.33, 0.38, 9), materials.metal, [0, 2.34, -0.01])
  ;[-0.21, 0, 0.21].forEach((x, index) => {
    addMesh(group, new THREE.BoxGeometry(0.12, index === 1 ? 0.46 : 0.34, 0.12), materials.accent, [x, 2.64 + (index === 1 ? 0.04 : 0), -0.01])
  })
  addPair((side) => {
    addMesh(group, new THREE.BoxGeometry(0.5, 0.3, 0.5), materials.metal, [side * 0.51, 1.72, 0])
    addMesh(group, new THREE.BoxGeometry(0.22, 0.07, 0.54), materials.accent, [side * 0.51, 1.91, 0])
  })
  addMesh(group, new THREE.CylinderGeometry(0.045, 0.055, 1.85, 8), materials.dark, [0.68, 1.24, 0.05])
  addMesh(group, new THREE.BoxGeometry(0.52, 0.52, 0.22), materials.metal, [0.68, 2.14, 0.05], [0, 0, Math.PI / 4])
  addMesh(group, new THREE.BoxGeometry(0.16, 0.16, 0.25), materials.glow, [0.68, 2.14, 0.08])
}

function addDragonHorns(group, materials, size = 0.42, spread = 0.19) {
  addPair((side) => {
    addMesh(group, new THREE.ConeGeometry(0.075, size, 6), materials.glow, [side * spread, 2.55, -0.02], [0, 0, side * -0.3])
  })
}

function addDragonExaminer(group, materials) {
  addDragonHorns(group, materials, 0.5, 0.2)
  addMesh(group, new THREE.TorusGeometry(0.38, 0.045, 7, 20), materials.accent, [0, 2.14, -0.3])
  addMesh(group, new THREE.CylinderGeometry(0.13, 0.13, 0.62, 8), materials.cloth, [-0.48, 1.28, 0.08], [0, 0, Math.PI / 2])
  addPair((side) => {
    addMesh(group, new THREE.CylinderGeometry(0.16, 0.16, 0.08, 8), materials.accent, [-0.48 + side * 0.31, 1.28, 0.08], [0, 0, Math.PI / 2])
  })
  addMesh(group, new THREE.CylinderGeometry(0.03, 0.04, 1.58, 7), materials.dark, [0.54, 1.25, 0.05])
  addMesh(group, new THREE.ConeGeometry(0.12, 0.45, 6), materials.glow, [0.54, 2.07, 0.05])
}

function addDragonHunter(group, materials) {
  addDragonHorns(group, materials, 0.38, 0.18)
  addPair((side) => {
    addMesh(group, new THREE.ConeGeometry(0.36, 1.05, 3), materials.cape, [side * 0.36, 1.62, -0.34], [0, 0, side * -0.46], [0.52, 1, 0.74])
    ;[-1, 0, 1].forEach((offset) => {
      addMesh(group, new THREE.ConeGeometry(0.045, 0.34, 5), materials.glow, [side * (0.48 + Math.abs(offset) * 0.04), 1.05 + offset * 0.09, 0.11], [0, 0, side * -1.42])
    })
  })
  addMesh(group, new THREE.BoxGeometry(0.52, 0.08, 0.07), materials.dark, [0, 2.2, 0.29])
}

function addDragonGatekeeper(group, materials) {
  addDragonHorns(group, materials, 0.62, 0.23)
  addPair((side) => {
    addMesh(group, new THREE.ConeGeometry(0.16, 0.62, 6), materials.glow, [side * 0.49, 1.82, -0.03], [0, 0, side * -1.08])
  })
  addMesh(group, new THREE.CylinderGeometry(0.43, 0.43, 0.14, 12), materials.dark, [-0.58, 1.28, 0.08], [Math.PI / 2, 0, 0])
  addMesh(group, new THREE.TorusGeometry(0.34, 0.055, 7, 18), materials.glow, [-0.58, 1.28, 0.17])
  addMesh(group, new THREE.DodecahedronGeometry(0.15, 0), materials.accent, [-0.58, 1.28, 0.19])
  addMesh(group, new THREE.CylinderGeometry(0.035, 0.045, 1.78, 8), materials.dark, [0.61, 1.18, 0.05])
  addMesh(group, new THREE.ConeGeometry(0.14, 0.48, 6), materials.glow, [0.61, 2.1, 0.05])
}

function addDragonMaster(group, materials) {
  addPair((side) => {
    addMesh(group, new THREE.ConeGeometry(0.48, 1.52, 3), materials.cape, [side * 0.39, 1.42, -0.35], [0, 0, side * -0.43], [0.62, 1, 0.78])
    addMesh(group, new THREE.ConeGeometry(0.17, 0.67, 6), materials.glow, [side * 0.51, 1.88, -0.03], [0, 0, side * -1.08])
  })
  addDragonHorns(group, materials, 0.66, 0.23)
  addMesh(group, new THREE.DodecahedronGeometry(0.12, 0), materials.accent, [0, 2.75, -0.02])
  addMesh(group, new THREE.CylinderGeometry(0.035, 0.045, 1.98, 8), materials.dark, [0.66, 1.16, 0.06])
  addMesh(group, new THREE.TorusGeometry(0.29, 0.045, 7, 20), materials.glow, [0.66, 2.16, 0.06])
  addMesh(group, new THREE.DodecahedronGeometry(0.17, 0), materials.accent, [0.66, 2.16, 0.08])
  addPair((side) => {
    addMesh(group, new THREE.ConeGeometry(0.05, 0.32, 5), materials.glow, [0.66 + side * 0.29, 2.16, 0.06], [0, 0, side * -Math.PI / 2])
  })
}

const CHARACTER_SIGNATURE_BUILDERS = {
  'frost-sentinel': addFrostSentinel,
  'frost-mystic': addFrostMystic,
  'frost-warden': addFrostWarden,
  'frost-master': addFrostMaster,
  'tide-diver': addTideDiver,
  'tide-hunter': addTideHunter,
  'tide-priest': addTidePriest,
  'tide-master': addTideMaster,
  'iron-smith': addIronSmith,
  'iron-engineer': addIronEngineer,
  'iron-royal-guard': addIronRoyalGuard,
  'iron-master': addIronMaster,
  'dragon-examiner': addDragonExaminer,
  'dragon-hunter': addDragonHunter,
  'dragon-gatekeeper': addDragonGatekeeper,
  'dragon-master': addDragonMaster
}

export function isEliteFourCharacterType(type) {
  return ELITE_FOUR_CHARACTER_TYPES.has(type)
}

export function createEliteFourCharacterTemplate(type) {
  const profile = ELITE_FOUR_CHARACTER_PROFILES[type]
  if (!profile) return null

  const group = new THREE.Group()
  const figure = new THREE.Group()
  const master = profile.rank === 'master'
  const materials = {
    coat: makeMaterial(profile.coat, { roughness: 0.64 }),
    cloth: makeMaterial(profile.cloth, { roughness: 0.76 }),
    accent: makeMaterial(profile.accent, {
      roughness: profile.theme === 'iron' ? 0.28 : 0.4,
      metalness: profile.theme === 'iron' ? 0.7 : 0.2
    }),
    glow: makeMaterial(profile.accent, {
      roughness: 0.34,
      metalness: profile.theme === 'iron' ? 0.58 : 0.18,
      emissive: profile.accent,
      emissiveIntensity: master ? 0.18 : 0.1
    }),
    dark: makeMaterial(profile.dark, { roughness: 0.82 }),
    metal: makeMaterial(profile.theme === 'iron' ? 0x8e989f : profile.accent, { roughness: 0.32, metalness: 0.62 }),
    cape: makeMaterial(profile.dark, { roughness: 0.78, side: THREE.DoubleSide }),
    skin: makeMaterial(profile.skin, { roughness: 0.78 }),
    hair: makeMaterial(profile.hair, { roughness: 0.84 }),
    eye: makeMaterial(0x101820, { roughness: 0.55 })
  }

  addBaseBody(figure, profile, materials)
  CHARACTER_SIGNATURE_BUILDERS[profile.archetype]?.(figure, materials)
  figure.scale.set(...profile.proportions)
  group.add(figure)

  group.userData.kind = 'elite-four-character'
  group.userData.eliteCharacterType = type
  group.userData.eliteDisplayName = profile.displayName
  group.userData.eliteTheme = profile.theme
  group.userData.eliteRole = profile.rank
  group.userData.eliteArchetype = profile.archetype
  group.userData.eliteVisualSignature = `${profile.archetype}:${profile.proportions.join('x')}`
  return group
}
