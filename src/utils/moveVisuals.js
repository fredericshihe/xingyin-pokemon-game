export const MOVE_EFFECT_CONFIG = {
  tackle: { icon: 'fa-solid fa-star', visual: 'impact', motion: 'lunge', hitReaction: 'bump', target: 'foe', accent: '#f8fafc', core: '#64748b', glow: 'rgba(148, 163, 184, 0.55)' },
  scratch: { icon: 'fa-solid fa-grip-lines-vertical', visual: 'scratch', motion: 'swipe', hitReaction: 'slice', target: 'foe', accent: '#f1f5f9', core: '#475569', glow: 'rgba(226, 232, 240, 0.6)' },
  horn_attack: { icon: 'fa-solid fa-location-arrow', visual: 'pierce', motion: 'jab', hitReaction: 'pierce', target: 'foe', accent: '#fef3c7', core: '#92400e', glow: 'rgba(146, 64, 14, 0.62)' },
  quickattack: { icon: 'fa-solid fa-forward-fast', visual: 'speed', motion: 'dash', hitReaction: 'snap', target: 'foe', accent: '#fef3c7', core: '#38bdf8', glow: 'rgba(125, 211, 252, 0.75)' },
  flail: { icon: 'fa-solid fa-arrows-spin', visual: 'flail', motion: 'flail', hitReaction: 'wobble', target: 'foe', accent: '#fef9c3', core: '#fb923c', glow: 'rgba(251, 146, 60, 0.58)' },
  fury_attack: { icon: 'fa-solid fa-burst', visual: 'fury', motion: 'flail', hitReaction: 'pierce', target: 'foe', accent: '#f8fafc', core: '#475569', glow: 'rgba(148, 163, 184, 0.68)' },
  bite: { icon: 'fa-solid fa-teeth', visual: 'bite', motion: 'bite', hitReaction: 'crunch', target: 'foe', accent: '#fef3c7', core: '#292524', glow: 'rgba(68, 64, 60, 0.72)' },
  bodyslam: { icon: 'fa-solid fa-weight-hanging', visual: 'slam', motion: 'leap', hitReaction: 'squash', target: 'foe', accent: '#e2e8f0', core: '#78716c', glow: 'rgba(120, 113, 108, 0.62)' },
  slash: { icon: 'fa-solid fa-slash', visual: 'slash', motion: 'swipe', hitReaction: 'slice', target: 'foe', accent: '#ffffff', core: '#334155', glow: 'rgba(241, 245, 249, 0.68)' },
  extremespeed: { icon: 'fa-solid fa-wind', visual: 'speed', motion: 'dash-fast', hitReaction: 'snap', target: 'foe', accent: '#e0f2fe', core: '#0ea5e9', glow: 'rgba(14, 165, 233, 0.72)' },
  recover: { icon: 'fa-solid fa-heart-pulse', visual: 'recover', motion: 'focus', hitReaction: 'heal', target: 'self', accent: '#fbcfe8', core: '#ec4899', glow: 'rgba(236, 72, 153, 0.58)' },
  mimic: { icon: 'fa-solid fa-clone', visual: 'mimic', motion: 'focus', hitReaction: 'ripple', target: 'self', accent: '#e0e7ff', core: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.62)' },

  ember: { icon: 'fa-solid fa-fire', visual: 'embers', motion: 'cast', hitReaction: 'burn', target: 'foe', accent: '#fed7aa', core: '#f97316', glow: 'rgba(249, 115, 22, 0.75)' },
  flamethrower: { icon: 'fa-solid fa-fire-flame-curved', visual: 'flame-beam', motion: 'cast', hitReaction: 'burn', target: 'foe', accent: '#fef3c7', core: '#dc2626', glow: 'rgba(220, 38, 38, 0.8)' },
  fire_blast: { icon: 'fa-solid fa-explosion', visual: 'fire-blast', motion: 'burst', hitReaction: 'blast', target: 'foe', accent: '#fef08a', core: '#b91c1c', glow: 'rgba(248, 113, 113, 0.88)' },

  watergun: { icon: 'fa-solid fa-droplet', visual: 'water-jet', motion: 'cast', hitReaction: 'splash', target: 'foe', accent: '#dbeafe', core: '#2563eb', glow: 'rgba(37, 99, 235, 0.72)' },
  surf: { icon: 'fa-solid fa-water', visual: 'wave', motion: 'surge', hitReaction: 'splash', target: 'foe', accent: '#cffafe', core: '#0891b2', glow: 'rgba(6, 182, 212, 0.7)' },
  hydropump: { icon: 'fa-solid fa-faucet-drip', visual: 'hydro', motion: 'blast', hitReaction: 'blast', target: 'foe', accent: '#bfdbfe', core: '#1d4ed8', glow: 'rgba(29, 78, 216, 0.84)' },

  vinewhip: { icon: 'fa-solid fa-seedling', visual: 'whip', motion: 'swipe', hitReaction: 'snap', target: 'foe', accent: '#bbf7d0', core: '#16a34a', glow: 'rgba(22, 163, 74, 0.7)' },
  razorleaf: { icon: 'fa-solid fa-leaf', visual: 'leaves', motion: 'cast', hitReaction: 'slice', target: 'foe', accent: '#dcfce7', core: '#15803d', glow: 'rgba(21, 128, 61, 0.72)' },

  thundershock: { icon: 'fa-solid fa-bolt', visual: 'spark', motion: 'cast', hitReaction: 'jolt', target: 'foe', accent: '#fef08a', core: '#eab308', glow: 'rgba(234, 179, 8, 0.84)' },
  thunderbolt: { icon: 'fa-solid fa-bolt-lightning', visual: 'lightning', motion: 'cast', hitReaction: 'jolt', target: 'foe', accent: '#fef9c3', core: '#ca8a04', glow: 'rgba(250, 204, 21, 0.92)' },
  zap_cannon: { icon: 'fa-solid fa-circle-dot', visual: 'zap-cannon', motion: 'burst', hitReaction: 'blast', target: 'foe', accent: '#ffffff', core: '#facc15', glow: 'rgba(250, 204, 21, 0.98)' },

  icebeam: { icon: 'fa-solid fa-icicles', visual: 'ice-beam', motion: 'cast', hitReaction: 'freeze', target: 'foe', accent: '#ecfeff', core: '#06b6d4', glow: 'rgba(103, 232, 249, 0.78)' },
  blizzard: { icon: 'fa-solid fa-snowflake', visual: 'blizzard', motion: 'storm', hitReaction: 'freeze', target: 'foe', accent: '#ffffff', core: '#0891b2', glow: 'rgba(207, 250, 254, 0.85)' },

  karate_chop: { icon: 'fa-solid fa-hand-fist', visual: 'chop', motion: 'chop', hitReaction: 'slice', target: 'foe', accent: '#fee2e2', core: '#b91c1c', glow: 'rgba(185, 28, 28, 0.7)' },
  double_kick: { icon: 'fa-solid fa-shoe-prints', visual: 'double-kick', motion: 'low-kick', hitReaction: 'trip', target: 'foe', accent: '#fee2e2', core: '#b91c1c', glow: 'rgba(185, 28, 28, 0.7)' },
  low_kick: { icon: 'fa-solid fa-shoe-prints', visual: 'low-kick', motion: 'low-kick', hitReaction: 'trip', target: 'foe', accent: '#fecaca', core: '#991b1b', glow: 'rgba(153, 27, 27, 0.66)' },

  poison_sting: { icon: 'fa-solid fa-syringe', visual: 'poison-sting', motion: 'jab', hitReaction: 'toxic', target: 'foe', accent: '#f5d0fe', core: '#a21caf', glow: 'rgba(162, 28, 175, 0.76)' },
  poison_jab: { icon: 'fa-solid fa-syringe', visual: 'poison-jab', motion: 'jab', hitReaction: 'toxic', target: 'foe', accent: '#f5d0fe', core: '#a21caf', glow: 'rgba(162, 28, 175, 0.76)' },
  earthquake: { icon: 'fa-solid fa-house-crack', visual: 'quake', motion: 'quake', hitReaction: 'quake', target: 'foe', accent: '#fde68a', core: '#92400e', glow: 'rgba(146, 64, 14, 0.72)' },

  peck: { icon: 'fa-solid fa-feather', visual: 'peck', motion: 'jab', hitReaction: 'pierce', target: 'foe', accent: '#e0f2fe', core: '#0284c7', glow: 'rgba(56, 189, 248, 0.7)' },
  wing_attack: { icon: 'fa-solid fa-feather-pointed', visual: 'wing', motion: 'swoop', hitReaction: 'slice', target: 'foe', accent: '#e0f2fe', core: '#0284c7', glow: 'rgba(56, 189, 248, 0.7)' },
  fly: { icon: 'fa-solid fa-plane-up', visual: 'dive', motion: 'takeoff', hitReaction: 'snap', target: 'foe', accent: '#f0f9ff', core: '#0369a1', glow: 'rgba(125, 211, 252, 0.76)' },
  drill_peck: { icon: 'fa-solid fa-screwdriver', visual: 'drill', motion: 'drill', hitReaction: 'pierce', target: 'foe', accent: '#fef3c7', core: '#a16207', glow: 'rgba(161, 98, 7, 0.7)' },
  hurricane: { icon: 'fa-solid fa-tornado', visual: 'tornado', motion: 'storm', hitReaction: 'wobble', target: 'foe', accent: '#f8fafc', core: '#475569', glow: 'rgba(148, 163, 184, 0.75)' },
  sky_attack: { icon: 'fa-solid fa-meteor', visual: 'skyfall', motion: 'sky-charge', hitReaction: 'blast', target: 'foe', accent: '#ffedd5', core: '#0284c7', glow: 'rgba(251, 146, 60, 0.82)' },

  psychic: { icon: 'fa-solid fa-brain', visual: 'psychic', motion: 'focus', hitReaction: 'ripple', target: 'foe', accent: '#fce7f3', core: '#db2777', glow: 'rgba(219, 39, 119, 0.76)' },
  hypnosis: { icon: 'fa-solid fa-compact-disc', visual: 'hypnosis', motion: 'focus', hitReaction: 'ripple', target: 'foe', accent: '#e9d5ff', core: '#7e22ce', glow: 'rgba(126, 34, 206, 0.78)' },
  dream_eater: { icon: 'fa-solid fa-cloud-moon', visual: 'dream', motion: 'drain', hitReaction: 'drain', target: 'foe', accent: '#ede9fe', core: '#581c87', glow: 'rgba(88, 28, 135, 0.82)' },

  fury_cutter: { icon: 'fa-solid fa-scissors', visual: 'fury-cutter', motion: 'swipe', hitReaction: 'slice', target: 'foe', accent: '#d9f99d', core: '#4d7c0f', glow: 'rgba(77, 124, 15, 0.7)' },

  rock_throw: { icon: 'fa-solid fa-cube', visual: 'rock-throw', motion: 'throw', hitReaction: 'bump', target: 'foe', accent: '#e7e5e4', core: '#57534e', glow: 'rgba(87, 83, 78, 0.68)' },
  rock_slide: { icon: 'fa-solid fa-hill-rockslide', visual: 'rock-slide', motion: 'throw', hitReaction: 'crush', target: 'foe', accent: '#d6d3d1', core: '#44403c', glow: 'rgba(68, 64, 60, 0.78)' },
  rollout: { icon: 'fa-solid fa-circle-notch', visual: 'rollout', motion: 'roll', hitReaction: 'bump', target: 'foe', accent: '#fef3c7', core: '#78716c', glow: 'rgba(120, 113, 108, 0.72)' },

  lick: { icon: 'fa-solid fa-ghost', visual: 'lick', motion: 'haunt', hitReaction: 'jolt', target: 'foe', accent: '#ddd6fe', core: '#7c3aed', glow: 'rgba(124, 58, 237, 0.76)' },
  shadowball: { icon: 'fa-solid fa-circle-dot', visual: 'shadow-ball', motion: 'cast', hitReaction: 'ripple', target: 'foe', accent: '#c4b5fd', core: '#312e81', glow: 'rgba(49, 46, 129, 0.86)' },
  rage_fist: { icon: 'fa-solid fa-hand-fist', visual: 'rage-fist', motion: 'rage', hitReaction: 'crunch', target: 'foe', accent: '#fecdd3', core: '#be123c', glow: 'rgba(190, 18, 60, 0.76)' },

  dragonclaw: { icon: 'fa-solid fa-dragon', visual: 'dragon-claw', motion: 'swipe', hitReaction: 'slice', target: 'foe', accent: '#c7d2fe', core: '#4338ca', glow: 'rgba(67, 56, 202, 0.76)' },
  iron_tail: { icon: 'fa-solid fa-shield-halved', visual: 'iron-tail', motion: 'tail', hitReaction: 'clang', target: 'foe', accent: '#f8fafc', core: '#64748b', glow: 'rgba(148, 163, 184, 0.86)' },
  moonblast: { icon: 'fa-solid fa-moon', visual: 'moonblast', motion: 'focus', hitReaction: 'ripple', target: 'foe', accent: '#fae8ff', core: '#c026d3', glow: 'rgba(192, 38, 211, 0.78)' },

  // ── 高威力招式精细配置 ──────────────────────────────────────────────────────
  close_combat: { icon: 'fa-solid fa-dumbbell', visual: 'rage-fist', motion: 'rage', hitReaction: 'crunch', target: 'foe', accent: '#fca5a5', core: '#991b1b', glow: 'rgba(153, 27, 27, 0.82)', scale: 1.12, particleCount: 14 },
  superpower:   { icon: 'fa-solid fa-dumbbell', visual: 'rage-fist', motion: 'leap',  hitReaction: 'squash', target: 'foe', accent: '#fca5a5', core: '#7f1d1d', glow: 'rgba(127, 29, 29, 0.86)', scale: 1.12, particleCount: 14 },
  outrage:      { icon: 'fa-solid fa-dragon',   visual: 'dragon-claw', motion: 'rage', hitReaction: 'slice',  target: 'foe', accent: '#a5b4fc', core: '#3730a3', glow: 'rgba(55, 48, 163, 0.86)', scale: 1.12, particleCount: 14 },
  giga_impact:  { icon: 'fa-solid fa-weight-hanging', visual: 'slam', motion: 'leap', hitReaction: 'squash', target: 'foe', accent: '#e2e8f0', core: '#1e293b', glow: 'rgba(30, 41, 59, 0.88)', scale: 1.12, particleCount: 14 },
  hyper_beam:   { icon: 'fa-solid fa-wand-magic-sparkles', visual: 'psychic', motion: 'burst', hitReaction: 'blast', target: 'foe', accent: '#f0abfc', core: '#86198f', glow: 'rgba(134, 25, 143, 0.9)', scale: 1.12, particleCount: 14 },
  thunder:      { icon: 'fa-solid fa-bolt-lightning', visual: 'lightning', motion: 'storm', hitReaction: 'jolt', target: 'foe', accent: '#fef08a', core: '#a16207', glow: 'rgba(250, 204, 21, 0.95)', scale: 1.0, particleCount: 14 },
  overheat:     { icon: 'fa-solid fa-fire-flame-curved', visual: 'fire-blast', motion: 'burst', hitReaction: 'blast', target: 'foe', accent: '#fef08a', core: '#7f1d1d', glow: 'rgba(239, 68, 68, 0.92)', scale: 1.12, particleCount: 14 },
  leaf_storm:   { icon: 'fa-solid fa-tornado', visual: 'tornado', motion: 'storm', hitReaction: 'slice', target: 'foe', accent: '#bbf7d0', core: '#166534', glow: 'rgba(21, 128, 61, 0.88)', scale: 1.0, particleCount: 14 },

  // ── 自强化/能力变化招式独立视觉（区分于普通催眠视觉） ─────────────────────────
  swords_dance:  { icon: 'fa-solid fa-slash', visual: 'slash',   motion: 'flail',  hitReaction: 'heal',  target: 'self', accent: '#fef9c3', core: '#ca8a04', glow: 'rgba(202, 138, 4, 0.72)' },
  calm_mind:     { icon: 'fa-solid fa-brain', visual: 'psychic', motion: 'focus',  hitReaction: 'heal',  target: 'self', accent: '#fce7f3', core: '#9d174d', glow: 'rgba(157, 23, 77, 0.7)' },
  dragon_dance:  { icon: 'fa-solid fa-dragon', visual: 'dragon-claw', motion: 'flail', hitReaction: 'heal', target: 'self', accent: '#c7d2fe', core: '#4338ca', glow: 'rgba(67, 56, 202, 0.72)' },
  nasty_plot:    { icon: 'fa-solid fa-moon',  visual: 'shadow-ball', motion: 'focus', hitReaction: 'heal', target: 'self', accent: '#e7e5e4', core: '#292524', glow: 'rgba(68, 64, 60, 0.7)' },
  bulk_up:       { icon: 'fa-solid fa-dumbbell', visual: 'rage-fist', motion: 'focus', hitReaction: 'heal', target: 'self', accent: '#fee2e2', core: '#9f1239', glow: 'rgba(159, 18, 57, 0.68)' },
  quiver_dance:  { icon: 'fa-solid fa-spa',   visual: 'leaves',  motion: 'flail',  hitReaction: 'heal',  target: 'self', accent: '#d1fae5', core: '#065f46', glow: 'rgba(5, 150, 105, 0.72)' },
};

export const SUPPORTED_MOVE_VISUALS = [
  'impact', 'scratch', 'pierce', 'speed', 'flail', 'fury', 'bite', 'slam', 'slash',
  'recover', 'mimic', 'embers', 'flame-beam', 'fire-blast', 'water-jet', 'wave',
  'hydro', 'whip', 'leaves', 'spark', 'lightning', 'zap-cannon', 'ice-beam',
  'blizzard', 'chop', 'double-kick', 'low-kick', 'poison-sting', 'poison-jab',
  'quake', 'peck', 'wing', 'dive', 'drill', 'tornado', 'skyfall', 'psychic',
  'hypnosis', 'dream', 'fury-cutter', 'rock-throw', 'rock-slide', 'rollout',
  'lick', 'shadow-ball', 'rage-fist', 'dragon-claw', 'iron-tail', 'moonblast',
  'secondary-result'
];

export const SUPPORTED_MOVE_MOTIONS = [
  'lunge', 'swipe', 'jab', 'dash', 'dash-fast', 'flail', 'bite', 'leap', 'focus',
  'cast', 'burst', 'surge', 'blast', 'chop', 'low-kick', 'quake', 'swoop',
  'takeoff', 'drill', 'storm', 'sky-charge', 'throw', 'roll', 'haunt', 'rage',
  'tail', 'drain'
];

export const SUPPORTED_HIT_REACTIONS = [
  'bump', 'slice', 'pierce', 'snap', 'wobble', 'crunch', 'squash', 'heal',
  'ripple', 'burn', 'blast', 'splash', 'jolt', 'freeze', 'trip', 'toxic',
  'quake', 'drain', 'crush', 'clang', 'charge'
];

export const SUPPORTED_MOVE_VARIANTS = [
  'physical', 'special', 'status', 'light', 'heavy', 'priority', 'delayed',
  'multi', 'recoil', 'self-destruct', 'dynamic', 'charge', 'precise', 'heal',
  'drain', 'copy', 'teleport', 'fizzle', 'buff', 'debuff', 'stat-shift', 'status-sleep',
  'status-poison', 'status-burn', 'status-paralysis', 'status-freeze',
  'volatile-flinch', 'volatile-confusion'
];

export const SUPPORTED_MOVE_SEMANTIC_TAGS = [
  'impact', 'fang', 'punch', 'kick', 'blade', 'horn', 'tail', 'wing', 'sky',
  'wind', 'beam', 'cannon', 'ball', 'pulse', 'wave', 'bubble', 'flame',
  'electric', 'ice', 'leaf', 'seed', 'vine', 'powder', 'gas', 'poison', 'rock',
  'bone', 'ground', 'mud', 'sound', 'eye', 'dance', 'shield', 'heal', 'drain',
  'copy', 'teleport', 'spin', 'self-destruct', 'recoil', 'multi', 'priority',
  'precise', 'dynamic', 'charge', 'sleep', 'burn', 'paralysis', 'freeze',
  'confusion', 'flinch', 'fairy', 'dark', 'steel', 'dragon', 'nothing',
  'claw', 'hammer', 'head', 'body', 'light', 'star', 'coin', 'shell', 'egg',
  'kiss', 'aura', 'gem', 'sand', 'flower', 'needle', 'mind', 'roar',
  'meteor', 'waterfall', 'splash', 'muscle'
];

const SUPPORTED_MOVE_VISUAL_SET = new Set(SUPPORTED_MOVE_VISUALS);
const SUPPORTED_MOVE_MOTION_SET = new Set(SUPPORTED_MOVE_MOTIONS);
const SUPPORTED_HIT_REACTION_SET = new Set(SUPPORTED_HIT_REACTIONS);
const SUPPORTED_MOVE_VARIANT_SET = new Set(SUPPORTED_MOVE_VARIANTS);
const SUPPORTED_MOVE_SEMANTIC_TAG_SET = new Set(SUPPORTED_MOVE_SEMANTIC_TAGS);

const TYPE_EFFECT_DEFAULTS = {
  normal: { icon: 'fa-solid fa-star', visual: 'impact', motion: 'lunge', hitReaction: 'bump', accent: '#f8fafc', core: '#64748b', glow: 'rgba(148, 163, 184, 0.55)' },
  fire: { icon: 'fa-solid fa-fire', visual: 'embers', motion: 'cast', hitReaction: 'burn', accent: '#fed7aa', core: '#f97316', glow: 'rgba(249, 115, 22, 0.75)' },
  water: { icon: 'fa-solid fa-droplet', visual: 'water-jet', motion: 'cast', hitReaction: 'splash', accent: '#dbeafe', core: '#2563eb', glow: 'rgba(37, 99, 235, 0.72)' },
  grass: { icon: 'fa-solid fa-leaf', visual: 'leaves', motion: 'cast', hitReaction: 'slice', accent: '#dcfce7', core: '#15803d', glow: 'rgba(21, 128, 61, 0.72)' },
  electric: { icon: 'fa-solid fa-bolt', visual: 'spark', motion: 'cast', hitReaction: 'jolt', accent: '#fef08a', core: '#eab308', glow: 'rgba(234, 179, 8, 0.84)' },
  ice: { icon: 'fa-solid fa-snowflake', visual: 'ice-beam', motion: 'cast', hitReaction: 'freeze', accent: '#ecfeff', core: '#06b6d4', glow: 'rgba(103, 232, 249, 0.78)' },
  fighting: { icon: 'fa-solid fa-hand-fist', visual: 'chop', motion: 'chop', hitReaction: 'slice', accent: '#fee2e2', core: '#b91c1c', glow: 'rgba(185, 28, 28, 0.7)' },
  poison: { icon: 'fa-solid fa-skull-crossbones', visual: 'poison-jab', motion: 'jab', hitReaction: 'toxic', accent: '#f5d0fe', core: '#a21caf', glow: 'rgba(162, 28, 175, 0.76)' },
  ground: { icon: 'fa-solid fa-house-crack', visual: 'quake', motion: 'quake', hitReaction: 'quake', accent: '#fde68a', core: '#92400e', glow: 'rgba(146, 64, 14, 0.72)' },
  flying: { icon: 'fa-solid fa-feather-pointed', visual: 'wing', motion: 'swoop', hitReaction: 'slice', accent: '#e0f2fe', core: '#0284c7', glow: 'rgba(56, 189, 248, 0.7)' },
  psychic: { icon: 'fa-solid fa-brain', visual: 'psychic', motion: 'focus', hitReaction: 'ripple', accent: '#fce7f3', core: '#db2777', glow: 'rgba(219, 39, 119, 0.76)' },
  bug: { icon: 'fa-solid fa-bug', visual: 'fury-cutter', motion: 'swipe', hitReaction: 'slice', accent: '#d9f99d', core: '#4d7c0f', glow: 'rgba(77, 124, 15, 0.7)' },
  rock: { icon: 'fa-solid fa-cube', visual: 'rock-throw', motion: 'throw', hitReaction: 'bump', accent: '#e7e5e4', core: '#57534e', glow: 'rgba(87, 83, 78, 0.68)' },
  ghost: { icon: 'fa-solid fa-ghost', visual: 'shadow-ball', motion: 'haunt', hitReaction: 'ripple', accent: '#c4b5fd', core: '#312e81', glow: 'rgba(49, 46, 129, 0.86)' },
  dragon: { icon: 'fa-solid fa-dragon', visual: 'dragon-claw', motion: 'swipe', hitReaction: 'slice', accent: '#c7d2fe', core: '#4338ca', glow: 'rgba(67, 56, 202, 0.76)' },
  dark: { icon: 'fa-solid fa-moon', visual: 'bite', motion: 'bite', hitReaction: 'crunch', accent: '#e7e5e4', core: '#292524', glow: 'rgba(68, 64, 60, 0.72)' },
  steel: { icon: 'fa-solid fa-shield-halved', visual: 'iron-tail', motion: 'tail', hitReaction: 'clang', accent: '#f8fafc', core: '#64748b', glow: 'rgba(148, 163, 184, 0.86)' },
  fairy: { icon: 'fa-solid fa-moon', visual: 'moonblast', motion: 'focus', hitReaction: 'ripple', accent: '#fae8ff', core: '#c026d3', glow: 'rgba(192, 38, 211, 0.78)' },
};

const TYPE_VISUAL_POOLS = {
  normal: {
    physical: ['impact', 'slam', 'speed', 'slash', 'flail', 'fury'],
    special: ['impact', 'speed', 'fury', 'mimic'],
    status: ['mimic', 'recover', 'flail']
  },
  fire: {
    physical: ['embers', 'flame-beam', 'fire-blast', 'bite', 'low-kick'],
    special: ['embers', 'flame-beam', 'fire-blast'],
    status: ['embers', 'flame-beam']
  },
  water: {
    physical: ['water-jet', 'wave', 'hydro', 'slam', 'dive'],
    special: ['water-jet', 'wave', 'hydro'],
    status: ['wave', 'recover']
  },
  grass: {
    physical: ['whip', 'leaves', 'fury-cutter', 'slash'],
    special: ['leaves', 'whip', 'recover'],
    status: ['leaves', 'recover', 'whip']
  },
  electric: {
    physical: ['spark', 'lightning', 'zap-cannon', 'speed'],
    special: ['spark', 'lightning', 'zap-cannon'],
    status: ['spark', 'lightning']
  },
  ice: {
    physical: ['ice-beam', 'blizzard', 'pierce', 'slash'],
    special: ['ice-beam', 'blizzard'],
    status: ['ice-beam', 'blizzard']
  },
  fighting: {
    physical: ['chop', 'double-kick', 'low-kick', 'rage-fist', 'slam'],
    special: ['chop', 'rage-fist'],
    status: ['rage-fist', 'mimic']
  },
  poison: {
    physical: ['poison-sting', 'poison-jab', 'pierce'],
    special: ['poison-jab', 'lick', 'shadow-ball'],
    status: ['poison-jab', 'poison-sting']
  },
  ground: {
    physical: ['quake', 'rock-throw', 'low-kick', 'slam', 'rollout'],
    special: ['quake', 'rock-slide', 'rock-throw'],
    status: ['quake', 'mimic']
  },
  flying: {
    physical: ['peck', 'wing', 'dive', 'drill', 'skyfall'],
    special: ['tornado', 'wing', 'dive'],
    status: ['tornado', 'wing']
  },
  psychic: {
    physical: ['psychic', 'slash', 'dream'],
    special: ['psychic', 'hypnosis', 'dream'],
    status: ['psychic', 'hypnosis', 'dream', 'mimic']
  },
  bug: {
    physical: ['fury-cutter', 'poison-sting', 'slash', 'fury'],
    special: ['fury-cutter', 'leaves', 'poison-sting'],
    status: ['fury-cutter', 'leaves']
  },
  rock: {
    physical: ['rock-throw', 'rock-slide', 'rollout', 'slam'],
    special: ['rock-throw', 'rock-slide', 'quake'],
    status: ['rock-throw', 'rollout']
  },
  ghost: {
    physical: ['lick', 'shadow-ball', 'rage-fist', 'bite'],
    special: ['shadow-ball', 'lick', 'hypnosis'],
    status: ['shadow-ball', 'hypnosis', 'lick']
  },
  dragon: {
    physical: ['dragon-claw', 'dive', 'slash', 'skyfall'],
    special: ['dragon-claw', 'skyfall', 'psychic'],
    status: ['dragon-claw', 'mimic']
  },
  dark: {
    physical: ['bite', 'slash', 'rage-fist', 'shadow-ball'],
    special: ['bite', 'shadow-ball', 'hypnosis'],
    status: ['hypnosis', 'shadow-ball', 'bite']
  },
  steel: {
    physical: ['iron-tail', 'pierce', 'slam', 'slash'],
    special: ['iron-tail', 'zap-cannon', 'pierce'],
    status: ['iron-tail', 'mimic']
  },
  fairy: {
    physical: ['moonblast', 'slam', 'speed'],
    special: ['moonblast', 'psychic', 'recover'],
    status: ['moonblast', 'recover', 'mimic']
  }
};

const STATUS_VISUAL_CONFIG = {
  sleep: { visual: 'hypnosis', motion: 'focus', hitReaction: 'ripple', variant: 'status-sleep' },
  poison: { visual: 'poison-jab', motion: 'cast', hitReaction: 'toxic', variant: 'status-poison' },
  burn: { visual: 'embers', motion: 'cast', hitReaction: 'burn', variant: 'status-burn' },
  paralysis: { visual: 'spark', motion: 'cast', hitReaction: 'jolt', variant: 'status-paralysis' },
  freeze: { visual: 'ice-beam', motion: 'cast', hitReaction: 'freeze', variant: 'status-freeze' }
};

const HIT_REACTION_BY_TYPE = {
  normal: 'bump',
  fire: 'burn',
  water: 'splash',
  grass: 'slice',
  electric: 'jolt',
  ice: 'freeze',
  fighting: 'trip',
  poison: 'toxic',
  ground: 'quake',
  flying: 'slice',
  psychic: 'ripple',
  bug: 'slice',
  rock: 'crush',
  ghost: 'ripple',
  dragon: 'slice',
  dark: 'crunch',
  steel: 'clang',
  fairy: 'ripple'
};

const MOTION_BY_VISUAL = {
  scratch: 'swipe',
  slash: 'swipe',
  'dragon-claw': 'swipe',
  'fury-cutter': 'swipe',
  whip: 'swipe',
  wing: 'swoop',
  peck: 'jab',
  pierce: 'jab',
  'poison-sting': 'jab',
  'poison-jab': 'jab',
  bite: 'bite',
  lick: 'haunt',
  'shadow-ball': 'haunt',
  'rage-fist': 'rage',
  chop: 'chop',
  'double-kick': 'low-kick',
  'low-kick': 'low-kick',
  slam: 'leap',
  speed: 'dash',
  flail: 'flail',
  fury: 'jab',
  impact: 'lunge',
  embers: 'cast',
  'flame-beam': 'cast',
  'fire-blast': 'burst',
  'water-jet': 'cast',
  wave: 'surge',
  hydro: 'blast',
  leaves: 'cast',
  spark: 'cast',
  lightning: 'cast',
  'zap-cannon': 'burst',
  'ice-beam': 'cast',
  blizzard: 'storm',
  quake: 'quake',
  dive: 'takeoff',
  drill: 'drill',
  tornado: 'storm',
  skyfall: 'sky-charge',
  psychic: 'focus',
  hypnosis: 'focus',
  dream: 'drain',
  'rock-throw': 'throw',
  'rock-slide': 'throw',
  rollout: 'roll',
  'iron-tail': 'tail',
  moonblast: 'focus',
  recover: 'focus',
  mimic: 'focus'
};

const HIT_REACTION_BY_VISUAL = {
  scratch: 'slice',
  slash: 'slice',
  'dragon-claw': 'slice',
  'fury-cutter': 'slice',
  whip: 'snap',
  wing: 'slice',
  peck: 'pierce',
  drill: 'pierce',
  pierce: 'pierce',
  'poison-sting': 'toxic',
  'poison-jab': 'toxic',
  bite: 'crunch',
  lick: 'jolt',
  'shadow-ball': 'ripple',
  'rage-fist': 'crunch',
  chop: 'slice',
  'double-kick': 'trip',
  'low-kick': 'trip',
  slam: 'squash',
  speed: 'snap',
  flail: 'wobble',
  embers: 'burn',
  'flame-beam': 'burn',
  'fire-blast': 'blast',
  'water-jet': 'splash',
  wave: 'splash',
  hydro: 'blast',
  leaves: 'slice',
  spark: 'jolt',
  lightning: 'jolt',
  'zap-cannon': 'blast',
  'ice-beam': 'freeze',
  blizzard: 'freeze',
  quake: 'quake',
  dive: 'snap',
  tornado: 'wobble',
  skyfall: 'blast',
  psychic: 'ripple',
  hypnosis: 'ripple',
  dream: 'drain',
  'rock-throw': 'bump',
  'rock-slide': 'crush',
  rollout: 'bump',
  'iron-tail': 'clang',
  moonblast: 'ripple',
  recover: 'heal',
  mimic: 'ripple'
};

const hashMoveKey = (moveKey = '') => (
  String(moveKey).split('').reduce((hash, char) => ((hash * 33) + char.charCodeAt(0)) >>> 0, 5381)
);

const roundSignatureValue = (value, digits = 3) => Number(value.toFixed(digits));

const mixSignatureSeed = (seed, salt = 0) => {
  let mixed = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b) >>> 0;
  return (mixed ^ (mixed >>> 16)) >>> 0;
};

export const getMoveSignatureStyle = (moveKey, move = {}) => {
  const normalizedMoveKey = String(moveKey || 'unknown');
  const seed = hashMoveKey(`${normalizedMoveKey}:battle-signature`);
  const phaseDeg = roundSignatureValue((seed / 0xffffffff) * 360, 4);
  const pattern = seed % 12;
  const rhythm = (seed >>> 4) % 8;
  const impactPattern = (seed >>> 7) % 8;
  const trailPattern = (seed >>> 10) % 6;
  const angleOffsetDeg = -180 + ((seed >>> 2) % 360);
  const angleStepDeg = 27 + ((seed >>> 9) % 20);
  const particleDistancePx = 54 + ((seed >>> 14) % 37);
  const particleDelayMs = 6 + ((seed >>> 20) % 13);
  const ringTiltDeg = -20 + ((seed >>> 6) % 41);
  const ringScaleX = roundSignatureValue(0.82 + (((seed >>> 11) % 37) / 100));
  const ringScaleY = roundSignatureValue(0.78 + (((seed >>> 16) % 39) / 100));
  const sceneXPercent = 28 + ((seed >>> 3) % 45);
  const sceneYPercent = 26 + ((seed >>> 12) % 49);
  const pathBend = -12 + ((seed >>> 18) % 25);
  const pathBias = -7 + ((seed >>> 23) % 15);
  const dashA = 7 + ((seed >>> 5) % 13);
  const dashB = 4 + ((seed >>> 15) % 11);
  const signatureOpacity = roundSignatureValue(0.24 + (((seed >>> 21) % 16) / 100));
  const lobeStepDeg = 103 + ((seed >>> 8) % 31);
  const lobes = Array.from({ length: 3 }, (_, index) => {
    const lobeSeed = mixSignatureSeed(hashMoveKey(`${normalizedMoveKey}:battle-signature-lobes`), index);
    const lobeAngleDeg = phaseDeg + (index * lobeStepDeg) + ((lobeSeed >>> 27) % 13) - 6;
    const lobeAngle = (lobeAngleDeg * Math.PI) / 180;
    const lobeRadius = 17 + ((lobeSeed >>> 4) % 17);
    return {
      xPercent: roundSignatureValue(50 + (Math.cos(lobeAngle) * lobeRadius), 2),
      yPercent: roundSignatureValue(50 + (Math.sin(lobeAngle) * lobeRadius * 0.82), 2),
      widthPercent: 19 + ((lobeSeed >>> 15) % 24),
      heightPercent: 13 + ((lobeSeed >>> 20) % 25),
      rotationDeg: -70 + ((lobeSeed >>> 7) % 141),
      delayMs: index * (18 + ((lobeSeed >>> 24) % 23)),
    };
  });
  const renderFingerprint = [
    seed,
    pattern,
    rhythm,
    impactPattern,
    trailPattern,
    phaseDeg,
    angleOffsetDeg,
    angleStepDeg,
    particleDistancePx,
    particleDelayMs,
    ringTiltDeg,
    ringScaleX,
    ringScaleY,
    sceneXPercent,
    sceneYPercent,
    pathBend,
    pathBias,
    dashA,
    dashB,
    signatureOpacity,
    ...lobes.flatMap((lobe) => Object.values(lobe)),
  ].join(':');

  return {
    id: `${normalizedMoveKey}-${seed.toString(36)}`,
    seed,
    pattern,
    rhythm,
    impactPattern,
    trailPattern,
    phaseDeg,
    angleOffsetDeg,
    angleStepDeg,
    particleDistancePx,
    particleDelayMs,
    ringTiltDeg,
    ringScaleX,
    ringScaleY,
    sceneXPercent,
    sceneYPercent,
    pathBend,
    pathBias,
    dashA,
    dashB,
    signatureOpacity,
    lobes,
    renderFingerprint,
    moveName: String(move?.name || normalizedMoveKey),
  };
};

const pickByMoveKey = (items = [], moveKey = '', salt = 0) => {
  const list = items.filter((item) => SUPPORTED_MOVE_VISUAL_SET.has(item));
  if (list.length === 0) return 'impact';
  return list[(hashMoveKey(moveKey) + salt) % list.length];
};

const includesAny = (text, tokens) => tokens.some((token) => text.includes(token));

const getMoveKeyParts = (moveKey = '') => (
  String(moveKey || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
);

const getMoveSearchText = (moveKey, move) => (
  `${String(moveKey || '')} ${String(move?.name || '')}`.toLowerCase()
);

const addSemanticTag = (tags, tag) => {
  if (SUPPORTED_MOVE_SEMANTIC_TAG_SET.has(tag) && !tags.includes(tag)) tags.push(tag);
};

const removeSemanticTag = (tags, tag) => {
  const index = tags.indexOf(tag);
  if (index >= 0) tags.splice(index, 1);
};

const addSemanticRule = (tags, text, tag, tokens) => {
  if (includesAny(text, tokens)) addSemanticTag(tags, tag);
};

const getMoveSemanticTags = (moveKey, move = {}, context = {}) => {
  const text = getMoveSearchText(moveKey, move);
  const keyParts = getMoveKeyParts(moveKey);
  const tags = [];
  const category = context.category || getCategory(move);
  const statChanges = context.statChanges || getMoveStatChanges(move);
  const type = move.type || 'normal';

  if (move.status) addSemanticTag(tags, move.status);
  if (move.volatileStatus) addSemanticTag(tags, move.volatileStatus);
  if (move.effect === 'heal') addSemanticTag(tags, 'heal');
  if (move.effect === 'drain') addSemanticTag(tags, 'drain');
  if (move.effect === 'mimic') addSemanticTag(tags, 'copy');
  if (move.effect === 'nothing') addSemanticTag(tags, 'nothing');
  if (move.selfDestruct) addSemanticTag(tags, 'self-destruct');
  if (move.recoilPercent) addSemanticTag(tags, 'recoil');
  if (move.multiHit) addSemanticTag(tags, 'multi');
  if (move.priority > 0) addSemanticTag(tags, 'priority');
  if (move.alwaysHits) addSemanticTag(tags, 'precise');
  if (move.dynamicPower) addSemanticTag(tags, 'dynamic');
  if (move.charge) addSemanticTag(tags, 'charge');

  addSemanticRule(tags, text, 'fang', ['fang', 'bite', 'crunch', '咬', '牙']);
  addSemanticRule(tags, text, 'punch', ['punch', 'fist', '拳']);
  addSemanticRule(tags, text, 'kick', ['kick', '踢']);
  addSemanticRule(tags, text, 'claw', ['claw', 'hone_claws', 'metal_claw', 'dragonclaw', '爪']);
  addSemanticRule(tags, text, 'blade', ['slash', 'cut', 'cutter', 'claw', 'scissor', 'blade', 'sword', 'x_scissor', 'night_slash', 'psycho_cut', 'razor', '斩', '切', '爪', '刃', '劈', '剪', '剑']);
  addSemanticRule(tags, text, 'horn', ['horn', 'megahorn', 'drill_run', 'drill_peck', 'horn_attack', '角', '钻']);
  addSemanticRule(tags, text, 'tail', ['tail', '尾']);
  addSemanticRule(tags, text, 'wing', ['wing', 'feather', 'pluck', 'peck', '翅', '翼', '啄']);
  addSemanticRule(tags, text, 'sky', ['fly', 'aerial', 'brave_bird', 'sky', '飞翔', '飞', '鸟', '燕']);
  addSemanticRule(tags, text, 'wind', ['wind', 'gust', 'air', 'hurricane', 'twister', 'defog', 'icy_wind', 'heat_wave', '风', '空气', '龙卷', '清除浓雾', '热风']);
  addSemanticRule(tags, text, 'beam', ['beam', 'psybeam', 'aurora_beam', 'solar_beam', 'charge_beam', '光束', '光线']);
  addSemanticRule(tags, text, 'cannon', ['cannon', 'pump', 'hydro', 'flash_cannon', 'zap_cannon', '炮', '加农']);
  addSemanticRule(tags, text, 'ball', ['ball', 'gem', 'sphere', 'electro_ball', 'gyro_ball', 'power_gem', '球', '宝石']);
  addSemanticRule(tags, text, 'pulse', ['pulse', 'aura_sphere', 'dark_pulse', 'water_pulse', 'dragon_pulse', 'heal_pulse', '波动', '波导']);
  addSemanticRule(tags, text, 'wave', ['wave', 'surf', 'waterfall', 'brine', 'muddy_water', 'liquidation', '水', '波', '冲浪', '攀瀑', '盐水']);
  addSemanticRule(tags, text, 'bubble', ['bubble', '泡沫']);
  addSemanticRule(tags, text, 'flame', ['fire', 'flame', 'flare', 'blaze', 'inferno', 'heat', 'lava', 'ember', 'incinerate', '火', '炎', '热', '炼狱', '熔岩']);
  addSemanticRule(tags, text, 'electric', ['thunder', 'shock', 'volt', 'spark', 'electro', 'charge', 'magnetic', 'nuzzle', '电', '雷', '充电', '磁']);
  addSemanticRule(tags, text, 'ice', ['ice', 'freeze', 'snow', 'blizzard', 'icicle', 'aurora', '冰', '雪', '极光']);
  addSemanticRule(tags, text, 'leaf', ['leaf', 'petal', 'magical_leaf', 'razorleaf', '叶', '花瓣']);
  addSemanticRule(tags, text, 'seed', ['seed', 'bullet_seed', 'seed_bomb', '种']);
  addSemanticRule(tags, text, 'vine', ['vine', 'whip', 'power_whip', '藤', '鞭']);
  addSemanticRule(tags, text, 'powder', ['powder', 'spore', 'sweet_scent', '粉', '孢子', '香气']);
  addSemanticRule(tags, text, 'gas', ['gas', 'smog', 'smoke', 'smokescreen', 'fog', 'clear_smog', '瓦斯', '烟', '雾', '浊']);
  addSemanticRule(tags, text, 'poison', ['poison', 'toxic', 'sludge', 'gunk', 'acid', '毒', '污泥', '溶解', '垃圾']);
  addSemanticRule(tags, text, 'rock', ['rock', 'stone', 'gem', '岩', '石']);
  addSemanticRule(tags, text, 'bone', ['bone', '骨']);
  addSemanticRule(tags, text, 'ground', ['earth', 'ground', 'bulldoze', 'horsepower', 'stomping', 'quake', '地', '重踏', '地震']);
  addSemanticRule(tags, text, 'mud', ['mud', '泥']);
  addSemanticRule(tags, text, 'sound', ['voice', 'sound', 'echo', 'round', 'growl', 'screech', 'snarl', 'sing', 'uproar', 'supersonic', 'howl', 'hyper_voice', '声', '唱', '咆哮', '叫', '音', '刺耳']);
  addSemanticRule(tags, text, 'eye', ['eyes', 'leer', 'face', 'tears', 'look', 'charm', 'fake_tears', 'baby_doll', 'play_nice', 'tearful', '眼', '瞪', '鬼面', '撒娇', '泪']);
  addSemanticRule(tags, text, 'dance', ['dance', 'petal_dance', 'dragon_dance', 'quiver_dance', 'teeter_dance', 'swords_dance', '舞']);
  addSemanticRule(tags, text, 'shield', ['armor', 'defense', 'harden', 'curl', 'withdraw', 'stockpile', 'cosmic_power', 'iron_defense', 'bulk_up', 'amnesia', '壳', '防御', '变圆', '硬', '铁壁', '宇宙', '健美']);
  addSemanticRule(tags, text, 'heal', ['heal', 'recover', 'synthesis', 'moonlight', 'morning_sun', 'soft_boiled', 'swallow', 'life_dew', '生蛋', '再生', '光合作用', '月光', '晨光', '吞下', '生命']);
  addSemanticRule(tags, text, 'teleport', ['teleport', '瞬间移动']);
  addSemanticRule(tags, text, 'spin', ['spin', 'rollout', 'gyro', 'rapid_spin', '滚', '旋转', '陀螺']);
  addSemanticRule(tags, text, 'hammer', ['hammer', 'crabhammer', 'hammer_arm', 'wood_hammer', '锤', '槌']);
  addSemanticRule(tags, text, 'head', ['head', 'headbutt', 'iron_head', 'zen_headbutt', '头', '头锤']);
  addSemanticRule(tags, text, 'body', ['body', 'slam', 'take_down', 'giga_impact', 'raging_bull', '撞', '冲撞', '摔', '踩踏']);
  addSemanticRule(tags, text, 'light', ['gleam', 'flash', 'solar', 'sun', 'moonlight', 'morning_sun', 'dazzling', '光', '闪耀', '日光', '月光', '晨光']);
  addSemanticRule(tags, text, 'star', ['swift', '星']);
  addSemanticRule(tags, text, 'coin', ['pay_day', '聚宝']);
  addSemanticRule(tags, text, 'shell', ['shell', 'withdraw', '贝壳', '缩入壳中']);
  addSemanticRule(tags, text, 'egg', ['soft_boiled', '生蛋']);
  addSemanticRule(tags, text, 'kiss', ['kiss', '吻']);
  addSemanticRule(tags, text, 'aura', ['aura', '波导']);
  addSemanticRule(tags, text, 'gem', ['gem', '宝石']);
  addSemanticRule(tags, text, 'sand', ['sand', '沙']);
  addSemanticRule(tags, text, 'flower', ['petal', '花瓣', '落英']);
  addSemanticRule(tags, text, 'needle', ['needle', 'missile', 'pin_missile', 'icicle_spear', 'poison_sting', '针', '飞弹', '冰锥']);
  addSemanticRule(tags, text, 'mind', ['mind', 'calm_mind', 'amnesia', 'psychic', 'confusion', 'psybeam', 'psyshock', 'psystrike', '冥想', '念力', '精神', '失忆', '神通']);
  addSemanticRule(tags, text, 'roar', ['roar', 'howl', 'growl', 'snarl', 'uproar', 'hyper_voice', 'echoed_voice', 'round', '咆哮', '长嚎', '叫声', '吵闹', '轮唱', '巨声']);
  addSemanticRule(tags, text, 'meteor', ['meteor', '流星']);
  addSemanticRule(tags, text, 'waterfall', ['waterfall', '攀瀑']);
  addSemanticRule(tags, text, 'splash', ['splash', '跃起']);
  addSemanticRule(tags, text, 'muscle', ['bulk_up', 'superpower', 'close_combat', 'strength', '健美', '蛮力', '近身战', '怪力']);

  if (text.includes('heat_wave')) {
    const waveIndex = tags.indexOf('wave');
    if (waveIndex >= 0) tags.splice(waveIndex, 1);
  }

  if (keyParts.includes('voice') || keyParts.includes('nice') || keyParts.includes('vice')) {
    removeSemanticTag(tags, 'ice');
  }
  if (moveKey === 'quickattack' || (type !== 'electric' && !includesAny(text, ['thunder', 'shock', 'volt', 'electro', 'spark', 'charge', 'magnetic', 'nuzzle']))) {
    removeSemanticTag(tags, 'electric');
  }
  if (
    type !== 'flying' &&
    !includesAny(String(moveKey || ''), ['fly', 'aerial', 'brave_bird', 'sky'])
  ) {
    removeSemanticTag(tags, 'sky');
  }
  if (keyParts.includes('swing') && !keyParts.includes('wing')) {
    removeSemanticTag(tags, 'wing');
  }
  if (moveKey === 'tail_whip') {
    removeSemanticTag(tags, 'vine');
  }

  if (type === 'fairy') addSemanticTag(tags, 'fairy');
  if (type === 'dark') addSemanticTag(tags, 'dark');
  if (type === 'steel') addSemanticTag(tags, 'steel');
  if (type === 'dragon') addSemanticTag(tags, 'dragon');

  if (statChanges.length > 0) {
    const allSelfPositive = statChanges.every((statChange) => statChange.target === 'attacker' && statChange.stages > 0);
    const allDefenderNegative = statChanges.every((statChange) => statChange.target === 'defender' && statChange.stages < 0);
    if (allSelfPositive) addSemanticTag(tags, 'shield');
    else if (allDefenderNegative) addSemanticTag(tags, 'eye');
  }

  if (tags.length === 0) {
    addSemanticTag(tags, category === 'status' ? 'shield' : (category === 'special' ? 'pulse' : 'impact'));
  }

  return tags;
};

const getSemanticIcon = (tags = [], type, fallbackIcon) => {
  const iconByTag = {
    'self-destruct': 'fa-solid fa-explosion',
    heal: 'fa-solid fa-heart-pulse',
    drain: 'fa-solid fa-droplet',
    copy: 'fa-solid fa-clone',
    teleport: 'fa-solid fa-location-arrow',
    fang: 'fa-solid fa-teeth',
    punch: 'fa-solid fa-hand-fist',
    kick: 'fa-solid fa-shoe-prints',
    claw: 'fa-solid fa-hand-sparkles',
    blade: 'fa-solid fa-slash',
    horn: 'fa-solid fa-location-arrow',
    tail: 'fa-solid fa-wand-magic-sparkles',
    wing: 'fa-solid fa-feather-pointed',
    sky: 'fa-solid fa-plane-up',
    wind: 'fa-solid fa-wind',
    sound: 'fa-solid fa-volume-high',
    powder: 'fa-solid fa-cloud',
    gas: 'fa-solid fa-smog',
    poison: 'fa-solid fa-skull-crossbones',
    rock: 'fa-solid fa-cube',
    bone: 'fa-solid fa-bone',
    ground: 'fa-solid fa-house-crack',
    mud: 'fa-solid fa-mountain',
    shield: 'fa-solid fa-shield-halved',
    eye: 'fa-solid fa-eye',
    dance: 'fa-solid fa-compact-disc',
    ball: 'fa-solid fa-circle-dot',
    cannon: 'fa-solid fa-bullseye',
    beam: 'fa-solid fa-wand-magic-sparkles',
    pulse: 'fa-solid fa-wave-square',
    wave: 'fa-solid fa-water',
    bubble: 'fa-solid fa-droplet',
    flame: 'fa-solid fa-fire-flame-curved',
    electric: 'fa-solid fa-bolt-lightning',
    ice: 'fa-solid fa-snowflake',
    leaf: 'fa-solid fa-leaf',
    seed: 'fa-solid fa-seedling',
    vine: 'fa-solid fa-seedling',
    spin: 'fa-solid fa-circle-notch',
    sleep: 'fa-solid fa-compact-disc',
    burn: 'fa-solid fa-fire',
    paralysis: 'fa-solid fa-bolt',
    freeze: 'fa-solid fa-icicles',
    confusion: 'fa-solid fa-question',
    flinch: 'fa-solid fa-burst',
    fairy: 'fa-solid fa-moon',
    dark: 'fa-solid fa-moon',
    steel: 'fa-solid fa-shield-halved',
    dragon: 'fa-solid fa-dragon',
    nothing: 'fa-solid fa-arrows-spin',
    hammer: 'fa-solid fa-hammer',
    head: 'fa-solid fa-circle-up',
    body: 'fa-solid fa-weight-hanging',
    light: 'fa-solid fa-sun',
    star: 'fa-solid fa-star',
    coin: 'fa-solid fa-coins',
    shell: 'fa-solid fa-shield',
    egg: 'fa-solid fa-egg',
    kiss: 'fa-solid fa-heart',
    aura: 'fa-solid fa-circle-nodes',
    gem: 'fa-solid fa-gem',
    sand: 'fa-solid fa-mound',
    flower: 'fa-solid fa-spa',
    needle: 'fa-solid fa-location-crosshairs',
    mind: 'fa-solid fa-brain',
    roar: 'fa-solid fa-volume-high',
    meteor: 'fa-solid fa-meteor',
    waterfall: 'fa-solid fa-water',
    splash: 'fa-solid fa-person-running',
    muscle: 'fa-solid fa-dumbbell'
  };
  const priorityTags = ['self-destruct', 'heal', 'drain', 'copy', 'teleport', 'kiss', 'coin', 'egg', 'star', 'meteor', 'aura', 'gem', 'hammer', 'head', 'claw', 'fang', 'punch', 'kick', 'blade', 'horn', 'tail', 'shell', 'sound', 'roar', 'powder', 'gas', 'poison', 'sand', 'rock', 'bone', 'ground', 'shield', 'eye', 'mind', 'dance', 'ball', 'cannon', 'beam', 'light', 'flame', 'electric', 'ice', 'flower', 'leaf', 'seed', 'waterfall', 'wave', 'wing', 'sky', 'dragon', 'fairy', 'dark', 'steel', 'muscle', 'splash', 'nothing'];
  const tag = priorityTags.find((candidate) => tags.includes(candidate));
  if (tag && iconByTag[tag]) return iconByTag[tag];
  return fallbackIcon || TYPE_EFFECT_DEFAULTS[type]?.icon || TYPE_EFFECT_DEFAULTS.normal.icon;
};

const getMoveStatChanges = (move = {}) => (
  Array.isArray(move.statChanges)
    ? move.statChanges.filter(Boolean)
    : (move.statChange ? [move.statChange] : [])
);

const getCategory = (move = {}) => (
  move.category || (Number(move.power) > 0 ? 'physical' : 'status')
);

const getPowerTier = (power) => {
  if (!(power > 0)) return 'status';
  if (power <= 40) return 'light';
  if (power >= 110) return 'heavy';
  return null;
};

const MOVE_VISUAL_HINTS = {
  absorb: 'dream',
  mega_drain: 'dream',
  giga_drain: 'dream',
  leech_life: 'dream',
  draining_kiss: 'dream',
  drain_punch: 'rage-fist',
  acid: 'poison-jab',
  acid_armor: 'poison-jab',
  aerial_ace: 'dive',
  agility: 'speed',
  air_cutter: 'slash',
  air_slash: 'slash',
  ancient_power: 'rock-slide',
  aqua_jet: 'water-jet',
  aqua_tail: 'hydro',
  aura_sphere: 'psychic',
  aurora_beam: 'ice-beam',
  baby_doll_eyes: 'hypnosis',
  belch: 'poison-jab',
  blaze_kick: 'low-kick',
  bone_rush: 'rock-throw',
  bonemerang: 'rock-throw',
  brave_bird: 'dive',
  brick_break: 'chop',
  bubble_beam: 'hydro',
  bullet_punch: 'speed',
  bullet_seed: 'poison-sting',
  calm_mind: 'psychic',
  charge: 'spark',
  charge_beam: 'lightning',
  charm: 'hypnosis',
  clear_smog: 'poison-jab',
  close_combat: 'rage-fist',
  confuse_ray: 'hypnosis',
  crabhammer: 'slam',
  cross_chop: 'chop',
  dark_pulse: 'shadow-ball',
  dazzling_gleam: 'moonblast',
  dig: 'quake',
  disarming_voice: 'hypnosis',
  discharge: 'lightning',
  dive: 'water-jet',
  double_edge: 'slam',
  double_hit: 'fury',
  double_team: 'mimic',
  dragon_breath: 'flame-beam',
  dragon_dance: 'dragon-claw',
  dragon_pulse: 'psychic',
  dragon_rush: 'dive',
  dragon_tail: 'iron-tail',
  drill_run: 'drill',
  dynamic_punch: 'rage-fist',
  earth_power: 'quake',
  echoed_voice: 'hypnosis',
  eerie_impulse: 'spark',
  electro_ball: 'zap-cannon',
  explosion: 'fire-blast',
  extrasensory: 'psychic',
  fake_out: 'speed',
  fire_fang: 'bite',
  fire_punch: 'rage-fist',
  flame_wheel: 'rollout',
  flare_blitz: 'speed',
  flash_cannon: 'zap-cannon',
  focus_punch: 'rage-fist',
  freeze_dry: 'ice-beam',
  fury_swipes: 'scratch',
  future_sight: 'psychic',
  giga_impact: 'slam',
  growl: 'hypnosis',
  gunk_shot: 'poison-sting',
  gust: 'tornado',
  gyro_ball: 'rollout',
  hammer_arm: 'chop',
  head_smash: 'slam',
  headbutt: 'slam',
  heal_pulse: 'recover',
  heat_wave: 'fire-blast',
  heavy_slam: 'slam',
  hex: 'shadow-ball',
  high_horsepower: 'quake',
  high_jump_kick: 'low-kick',
  hone_claws: 'slash',
  howl: 'hypnosis',
  hyper_beam: 'psychic',
  hyper_voice: 'hypnosis',
  ice_fang: 'bite',
  ice_punch: 'rage-fist',
  ice_shard: 'pierce',
  icicle_crash: 'rock-slide',
  icicle_spear: 'poison-sting',
  icy_wind: 'blizzard',
  incinerate: 'embers',
  inferno: 'fire-blast',
  iron_defense: 'iron-tail',
  iron_head: 'slam',
  knock_off: 'slash',
  last_resort: 'slam',
  lava_plume: 'fire-blast',
  leaf_blade: 'fury-cutter',
  leaf_storm: 'tornado',
  life_dew: 'recover',
  liquidation: 'wave',
  lovely_kiss: 'hypnosis',
  low_sweep: 'low-kick',
  mach_punch: 'speed',
  magical_leaf: 'leaves',
  magnetic_flux: 'spark',
  mega_kick: 'low-kick',
  mega_punch: 'rage-fist',
  megahorn: 'drill',
  metal_claw: 'slash',
  metal_sound: 'hypnosis',
  meteor_assault: 'skyfall',
  minimize: 'mimic',
  moonlight: 'recover',
  morning_sun: 'recover',
  mud_shot: 'quake',
  mud_slap: 'quake',
  muddy_water: 'wave',
  nasty_plot: 'hypnosis',
  night_slash: 'slash',
  nuzzle: 'spark',
  outrage: 'dragon-claw',
  overheat: 'fire-blast',
  pay_day: 'fury',
  payback: 'bite',
  petal_blizzard: 'blizzard',
  petal_dance: 'leaves',
  pin_missile: 'poison-sting',
  play_nice: 'hypnosis',
  play_rough: 'slam',
  pluck: 'peck',
  poison_gas: 'poison-jab',
  poison_powder: 'poison-jab',
  powder_snow: 'blizzard',
  power_gem: 'rock-throw',
  power_whip: 'whip',
  psybeam: 'psychic',
  psycho_cut: 'slash',
  psyshock: 'psychic',
  psystrike: 'dream',
  quiver_dance: 'leaves',
  raging_bull: 'slam',
  rapid_spin: 'rollout',
  razor_shell: 'slash',
  reversal: 'rage-fist',
  rock_blast: 'rock-slide',
  rock_polish: 'rollout',
  rock_smash: 'rock-slide',
  rock_tomb: 'rock-slide',
  rock_wrecker: 'rock-slide',
  round: 'hypnosis',
  sand_attack: 'quake',
  scary_face: 'hypnosis',
  screech: 'hypnosis',
  seed_bomb: 'slam',
  self_destruct: 'fire-blast',
  shadow_punch: 'rage-fist',
  shell_smash: 'rock-slide',
  shock_wave: 'lightning',
  sing: 'hypnosis',
  sleep_powder: 'hypnosis',
  sludge: 'poison-jab',
  sludge_bomb: 'poison-jab',
  sludge_wave: 'wave',
  smog: 'poison-jab',
  smokescreen: 'hypnosis',
  snarl: 'hypnosis',
  snore: 'hypnosis',
  soft_boiled: 'recover',
  solar_beam: 'psychic',
  spark: 'spark',
  splash: 'flail',
  stockpile: 'mimic',
  stomp: 'slam',
  stomping_tantrum: 'quake',
  stone_axe: 'rock-slide',
  stone_edge: 'rock-slide',
  storm_throw: 'chop',
  strength: 'slam',
  stun_spore: 'spark',
  submission: 'rollout',
  sucker_punch: 'speed',
  superpower: 'rage-fist',
  supersonic: 'hypnosis',
  swagger: 'hypnosis',
  swallow: 'recover',
  sweet_kiss: 'hypnosis',
  sweet_scent: 'hypnosis',
  swift: 'fury',
  swords_dance: 'slash',
  synthesis: 'recover',
  tail_whip: 'iron-tail',
  take_down: 'slam',
  tearful_look: 'hypnosis',
  teeter_dance: 'hypnosis',
  teleport: 'mimic',
  thrash: 'flail',
  thunder: 'lightning',
  thunder_fang: 'bite',
  thunder_punch: 'rage-fist',
  thunder_wave: 'spark',
  triple_kick: 'double-kick',
  twister: 'tornado',
  uproar: 'hypnosis',
  vacuum_wave: 'speed',
  vice_grip: 'fury',
  vital_throw: 'chop',
  water_pulse: 'water-jet',
  waterfall: 'wave',
  wave_crash: 'wave',
  will_o_wisp: 'embers',
  withdraw: 'recover',
  wood_hammer: 'slam',
  x_scissor: 'fury-cutter',
  zen_headbutt: 'psychic',
};

const getHintedVisual = (moveKey, move = {}, fallbackVisual) => {
  const text = getMoveSearchText(moveKey, move);
  const type = move.type || 'normal';
  const keyHint = MOVE_VISUAL_HINTS[String(moveKey || '')];
  if (keyHint && SUPPORTED_MOVE_VISUAL_SET.has(keyHint)) return keyHint;

  if (includesAny(text, ['fang', 'bite', 'crunch'])) return 'bite';
  if (includesAny(text, ['punch', 'fist'])) {
    if (type === 'electric') return 'spark';
    if (type === 'fire') return 'embers';
    if (type === 'ice') return 'ice-beam';
    if (type === 'steel') return 'iron-tail';
    return 'rage-fist';
  }
  if (includesAny(text, ['kick'])) return text.includes('double') || text.includes('triple') ? 'double-kick' : 'low-kick';
  if (includesAny(text, ['slash', 'cut', 'cutter', 'claw', 'scissor', 'blade'])) {
    if (type === 'dragon') return 'dragon-claw';
    if (type === 'bug') return 'fury-cutter';
    if (type === 'grass') return 'leaves';
    return 'slash';
  }
  if (includesAny(text, ['tail'])) {
    if (type === 'grass') return 'whip';
    if (type === 'water') return 'hydro';
    return 'iron-tail';
  }
  if (includesAny(text, ['beam', 'cannon'])) {
    if (type === 'electric') return 'zap-cannon';
    if (type === 'fire') return 'flame-beam';
    if (type === 'water') return 'hydro';
    if (type === 'ice') return 'ice-beam';
    if (type === 'steel') return 'zap-cannon';
    return fallbackVisual;
  }
  if (includesAny(text, ['blast', 'bomb', 'explosion', 'destruct', 'wrecker', 'impact'])) {
    if (type === 'fire' || move.selfDestruct) return 'fire-blast';
    if (type === 'poison') return 'poison-jab';
    if (type === 'rock') return 'rock-slide';
    if (type === 'ghost' || type === 'dark') return 'shadow-ball';
    return 'slam';
  }
  if (includesAny(text, ['ball', 'gem', 'pulse', 'sphere'])) {
    if (type === 'electric') return 'zap-cannon';
    if (type === 'ghost' || type === 'dark') return 'shadow-ball';
    if (type === 'fairy') return 'moonblast';
    if (type === 'rock') return 'rock-throw';
    if (type === 'dragon') return 'dragon-claw';
    return fallbackVisual;
  }
  if (includesAny(text, ['wave', 'surf', 'waterfall', 'voice', 'sound', 'echo', 'round', 'snarl', 'uproar'])) {
    if (type === 'water') return 'wave';
    if (type === 'flying') return 'tornado';
    if (type === 'poison') return 'poison-jab';
    if (type === 'normal') return 'speed';
    return fallbackVisual;
  }
  if (includesAny(text, ['powder', 'spore', 'gas', 'smog', 'toxic', 'sludge'])) {
    return move.status ? STATUS_VISUAL_CONFIG[move.status]?.visual || 'poison-jab' : 'poison-jab';
  }
  if (includesAny(text, ['dance'])) {
    if (type === 'dragon') return 'dragon-claw';
    if (type === 'bug' || type === 'grass') return 'leaves';
    return 'mimic';
  }
  if (includesAny(text, ['rock', 'stone', 'bone'])) return type === 'ground' ? 'rock-throw' : 'rock-slide';
  if (includesAny(text, ['mud', 'earth', 'ground', 'bulldoze', 'stomp', 'horsepower'])) return 'quake';
  if (includesAny(text, ['seed', 'needle', 'missile'])) return type === 'bug' ? 'poison-sting' : 'leaves';
  if (includesAny(text, ['thunder', 'shock', 'volt', 'nuzzle', 'charge', 'magnetic'])) return move.power >= 80 ? 'lightning' : 'spark';
  if (includesAny(text, ['wind', 'gust', 'air', 'hurricane', 'twister'])) return move.power >= 90 ? 'tornado' : 'wing';
  if (includesAny(text, ['heal', 'boiled', 'moonlight', 'synthesis', 'morning_sun', 'life_dew'])) return 'recover';
  if (includesAny(text, ['sleep', 'hypnosis', 'kiss', 'sing', 'confuse', 'supersonic', 'teeter'])) return 'hypnosis';

  return fallbackVisual;
};

const getSelfTargetingStatusMove = (move = {}, statChanges = []) => {
  if (['heal', 'mimic', 'nothing', 'teleport'].includes(move.effect)) return true;
  if (move.status || move.volatileStatus) return false;
  return statChanges.length > 0 && statChanges.every((statChange) => statChange.target === 'attacker');
};

const getMoveVariant = (move = {}, category, power, statChanges = []) => {
  if (move.selfDestruct) return 'self-destruct';
  if (move.effect === 'heal') return 'heal';
  if (move.effect === 'mimic') return 'copy';
  if (move.effect === 'teleport') return 'teleport';
  if (move.effect === 'nothing') return 'fizzle';
  if (move.effect === 'drain') return 'drain';
  if (move.recoilPercent) return 'recoil';
  if (move.multiHit) return 'multi';
  if (move.dynamicPower) return 'dynamic';
  if (move.charge) return 'charge';
  if (move.status) return `status-${move.status}`;
  if (move.volatileStatus) return `volatile-${move.volatileStatus}`;

  if (statChanges.length > 0) {
    const allSelfPositive = statChanges.every((statChange) => statChange.target === 'attacker' && statChange.stages > 0);
    const allDefenderNegative = statChanges.every((statChange) => statChange.target === 'defender' && statChange.stages < 0);
    if (allSelfPositive) return 'buff';
    if (allDefenderNegative) return 'debuff';
    return 'stat-shift';
  }

  if (move.priority > 0) return 'priority';
  if (move.priority < 0) return 'delayed';
  if (move.alwaysHits) return 'precise';
  return getPowerTier(power) || category || 'physical';
};

const getGeneratedMoveEffectConfig = (moveKey, move = {}) => {
  const normalizedMoveKey = String(moveKey || '');
  const type = move.type || 'normal';
  const category = getCategory(move);
  const power = Number(move.power) || 0;
  const base = TYPE_EFFECT_DEFAULTS[type] || TYPE_EFFECT_DEFAULTS.normal;
  const statChanges = getMoveStatChanges(move);
  const pools = TYPE_VISUAL_POOLS[type] || TYPE_VISUAL_POOLS.normal;
  const visualPool = pools[category] || pools.physical || TYPE_VISUAL_POOLS.normal.physical;
  const powerSalt = power >= 110 ? 7 : power <= 40 ? 3 : 0;
  let visual = pickByMoveKey(visualPool, normalizedMoveKey, powerSalt);

  visual = getHintedVisual(normalizedMoveKey, move, visual);

  if ((category === 'status' || power <= 0) && move.status && STATUS_VISUAL_CONFIG[move.status]) {
    visual = STATUS_VISUAL_CONFIG[move.status].visual;
  }
  if ((category === 'status' || power <= 0) && move.volatileStatus === 'confusion') visual = 'hypnosis';
  if ((category === 'status' || power <= 0) && move.volatileStatus === 'flinch') visual = 'speed';
  if (move.effect === 'heal') visual = 'recover';
  if (move.effect === 'mimic') visual = 'mimic';
  if (move.effect === 'teleport') visual = 'mimic';
  if (move.effect === 'nothing') visual = 'flail';
  if (move.effect === 'drain' && (category === 'status' || power <= 0 || ['ghost', 'psychic', 'dark'].includes(type))) visual = 'dream';
  if (move.multiHit) visual = getHintedVisual(normalizedMoveKey, move, pickByMoveKey(['fury', 'double-kick', 'poison-sting', 'rock-slide', 'leaves'], normalizedMoveKey));
  if (move.selfDestruct) visual = 'fire-blast';

  const variant = getMoveVariant(move, category, power, statChanges);
  const target = getSelfTargetingStatusMove(move, statChanges) ? 'self' : 'foe';
  const statusConfig = move.status ? STATUS_VISUAL_CONFIG[move.status] : null;
  let hitReaction = statusConfig?.hitReaction || HIT_REACTION_BY_VISUAL[visual] || HIT_REACTION_BY_TYPE[type] || base.hitReaction;
  if (move.volatileStatus === 'confusion') hitReaction = 'wobble';
  if (move.volatileStatus === 'flinch') hitReaction = 'snap';
  if (move.effect === 'heal') hitReaction = 'heal';
  if (move.effect === 'drain') hitReaction = 'drain';
  if (move.selfDestruct) hitReaction = 'blast';
  if (statChanges.length > 0 && category === 'status' && !move.status && !move.volatileStatus) {
    const allSelfPositive = statChanges.every((statChange) => statChange.target === 'attacker' && statChange.stages > 0);
    hitReaction = allSelfPositive ? 'heal' : 'ripple';
  }

  let motion = MOTION_BY_VISUAL[visual] || base.motion || 'lunge';
  if (move.priority > 0 && category !== 'status') motion = move.priority >= 2 ? 'dash-fast' : 'dash';
  if (move.effect === 'nothing') motion = 'flail';
  else if (move.effect === 'heal' || target === 'self') motion = 'focus';
  if (move.effect === 'drain') motion = 'drain';
  if (move.selfDestruct || move.recoilPercent) motion = power >= 120 ? 'leap' : motion;

  const particleCount = move.multiHit ? 16 : (power >= 110 || visual === 'blizzard' || visual === 'rock-slide' || visual === 'fire-blast' ? 14 : 10);
  const shardCount = ['rock-slide', 'blizzard', 'quake', 'rock-throw', 'rollout', 'ice-beam'].includes(visual) ? 12 : 8;
  const scale = power >= 120 || move.selfDestruct ? 1.12 : power <= 40 && power > 0 ? 0.92 : 1;
  const semanticTags = getMoveSemanticTags(normalizedMoveKey, move, { category, power, visual, variant, statChanges });
  const icon = getSemanticIcon(semanticTags, type, base.icon);
  const signatureStyle = getMoveSignatureStyle(normalizedMoveKey, move);

  return {
    ...base,
    icon,
    visual,
    motion,
    hitReaction,
    target,
    variant,
    semanticTags,
    particleCount,
    shardCount,
    scale,
    signatureStyle,
    signature: `${type}:${category}:${variant}:${visual}:${motion}:${hitReaction}:${semanticTags.join('+')}`
  };
};

export const getMoveEffectConfig = (moveKey, move = {}) => {
  const normalizedMoveKey = String(moveKey || '');
  const generatedConfig = getGeneratedMoveEffectConfig(normalizedMoveKey, move || {});
  const explicitConfig = MOVE_EFFECT_CONFIG[normalizedMoveKey] || {};
  const finalConfig = {
    ...generatedConfig,
    ...explicitConfig,
    variant: explicitConfig.variant || generatedConfig.variant,
    semanticTags: Array.isArray(explicitConfig.semanticTags) ? explicitConfig.semanticTags : generatedConfig.semanticTags,
    particleCount: explicitConfig.particleCount || generatedConfig.particleCount,
    shardCount: explicitConfig.shardCount || generatedConfig.shardCount,
    scale: explicitConfig.scale || generatedConfig.scale,
    signatureStyle: explicitConfig.signatureStyle || generatedConfig.signatureStyle,
  };
  return {
    ...finalConfig,
    signature: `${move?.type || 'normal'}:${getCategory(move)}:${finalConfig.variant}:${finalConfig.visual}:${finalConfig.motion}:${finalConfig.hitReaction}:${(finalConfig.semanticTags || []).join('+')}`
  };
};

export const getMoveVisualAudit = (moves = {}) => {
  const requiredFields = ['icon', 'visual', 'motion', 'hitReaction', 'target', 'accent', 'core', 'glow', 'variant', 'semanticTags', 'signatureStyle'];
  const moveEntries = Object.entries(moves);
  const configKeys = Object.keys(MOVE_EFFECT_CONFIG);
  const configs = moveEntries.map(([moveKey, move]) => [moveKey, move, getMoveEffectConfig(moveKey, move)]);
  const countValues = (index) => configs.reduce((counts, [, , config]) => {
    const value = config[index];
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
  const missingVisuals = configs
    .map(([moveKey, move, config]) => ({
      moveKey,
      name: move?.name,
      missingFields: requiredFields.filter((field) => !config[field])
    }))
    .filter((entry) => entry.missingFields.length > 0);
  const unsupportedVisuals = configs
    .flatMap(([moveKey, move, config]) => ([
      !SUPPORTED_MOVE_VISUAL_SET.has(config.visual) ? { moveKey, name: move?.name, field: 'visual', value: config.visual } : null,
      !SUPPORTED_MOVE_MOTION_SET.has(config.motion) ? { moveKey, name: move?.name, field: 'motion', value: config.motion } : null,
      !SUPPORTED_HIT_REACTION_SET.has(config.hitReaction) ? { moveKey, name: move?.name, field: 'hitReaction', value: config.hitReaction } : null,
      !SUPPORTED_MOVE_VARIANT_SET.has(config.variant) ? { moveKey, name: move?.name, field: 'variant', value: config.variant } : null,
      ...(Array.isArray(config.semanticTags)
        ? config.semanticTags
          .filter((tag) => !SUPPORTED_MOVE_SEMANTIC_TAG_SET.has(tag))
          .map((tag) => ({ moveKey, name: move?.name, field: 'semanticTags', value: tag }))
        : [{ moveKey, name: move?.name, field: 'semanticTags', value: config.semanticTags }]),
    ].filter(Boolean)));
  const signatures = new Set(configs.map(([, , config]) => config.signature || `${config.visual}:${config.motion}:${config.hitReaction}:${config.variant}`));
  const renderSignatures = new Set(configs.map(([, , config]) => config.signatureStyle?.renderFingerprint));
  const renderSignatureGroups = configs.reduce((groups, [moveKey, move, config]) => {
    const fingerprint = config.signatureStyle?.renderFingerprint || 'missing';
    if (!groups[fingerprint]) groups[fingerprint] = [];
    groups[fingerprint].push({ moveKey, name: move?.name });
    return groups;
  }, {});
  const semanticTagUsage = configs.reduce((counts, [, , config]) => {
    (Array.isArray(config.semanticTags) ? config.semanticTags : []).forEach((tag) => {
      counts[tag] = (counts[tag] || 0) + 1;
    });
    return counts;
  }, {});

  return {
    moveCount: moveEntries.length,
    explicitVisualCount: configKeys.filter((key) => moves[key]).length,
    generatedVisualCount: moveEntries.length - configKeys.filter((key) => moves[key]).length,
    visualCount: Object.keys(countValues('visual')).length,
    motionCount: Object.keys(countValues('motion')).length,
    hitReactionCount: Object.keys(countValues('hitReaction')).length,
    variantCount: Object.keys(countValues('variant')).length,
    semanticTagCount: Object.keys(semanticTagUsage).length,
    signatureCount: signatures.size,
    renderSignatureCount: renderSignatures.size,
    duplicateRenderSignatures: Object.entries(renderSignatureGroups)
      .filter(([, entries]) => entries.length > 1)
      .map(([fingerprint, entries]) => ({ fingerprint, entries })),
    missingVisuals,
    unsupportedVisuals,
    orphanVisuals: configKeys.filter((key) => !moves[key]),
    visualUsage: countValues('visual'),
    hitReactionUsage: countValues('hitReaction'),
    variantUsage: countValues('variant'),
    semanticTagUsage,
  };
};
