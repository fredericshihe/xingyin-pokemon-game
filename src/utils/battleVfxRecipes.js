// Authored move choreography: key | technique | material | count | spread | bend | rotation.
// Count describes visible strands/debris, never simulated damage or extra hits.
// No hash selects a move's technique. Fine particle noise is deterministic in the renderer.
const AUTHORED = `
tackle|strike|dust|5|.65|0|0
scratch|slash|claw|3|.55|.15|-.6
horn_attack|drill|spark|1|.48|0|0
quickattack|dash|mist|4|.48|-.1|0
flail|strike|dust|6|.9|.5|.6
fury_attack|drill|spark|3|.58|.18|.3
bite|fang|tooth|4|.68|0|0
bodyslam|slam|dust|9|1.3|.2|1.57
slash|slash|claw|1|1.1|.3|-.8
extremespeed|dash|spark|8|.9|.15|0
recover|heal|light|12|.8|0|0
mimic|warp|mist|3|.75|.2|0
transform|warp|smoke|5|1.05|0|1
ember|volley|flame|5|.65|-.4|0
flamethrower|jet|flame|20|.82|.12|0
fire_blast|burst|flame|5|1.55|.55|-.3
watergun|jet|droplet|12|.32|0|0
surf|wave|splash|18|1.8|.45|0
hydropump|jet|splash|24|1.25|0|0
vinewhip|whip|leaf|2|.8|.8|.3
razorleaf|volley|leaf|7|1.05|-.4|.7
thundershock|lightning|spark|2|.42|.22|0
thunderbolt|lightning|spark|5|1.05|.6|0
zap_cannon|orb|spark|12|1.4|0|.5
icebeam|beam|ice|10|.55|0|0
blizzard|storm|ice|32|1.7|.6|-.6
karate_chop|slash|spark|1|.75|.1|1.1
double_kick|strike|dust|2|.9|.15|-.8
low_kick|slash|dust|1|.8|.4|0
poison_sting|volley|claw|1|.3|-.1|0
poison_jab|strike|droplet|5|.7|0|0
earthquake|quake|rock|12|1.8|.7|0
peck|drill|spark|1|.25|0|-.1
wing_attack|slash|feather|2|1.1|.45|.4
fly|dive|feather|7|1.1|-.8|-.6
drill_peck|drill|feather|4|.65|.4|0
hurricane|vortex|feather|26|1.65|.7|.4
sky_attack|dive|light|14|1.6|-.7|-.8
psychic|levitate|light|6|1.05|.8|.2
hypnosis|sound|mist|5|.65|.45|0
dream_eater|drain|smoke|17|1.1|.9|.3
fury_cutter|slash|claw|2|.65|.2|-.4
rock_throw|volley|rock|1|.75|-.8|.4
rock_slide|storm|rock|8|1.4|.3|-.25
rollout|orb|rock|5|.6|.2|2
lick|whip|droplet|1|.65|.4|-.2
shadowball|orb|smoke|12|1.05|-.2|.8
rage_fist|strike|smoke|7|.92|.4|-.4
dragonclaw|slash|claw|3|1.15|.4|-.65
iron_tail|slash|metal|1|1.3|.85|.2
moonblast|orb|light|14|1.2|-.75|.3
absorb|drain|light|5|.42|.3|0
acid|jet|droplet|8|.65|.35|0
acid_armor|shroud|droplet|12|.8|0|0
acid_spray|volley|droplet|5|.8|-.25|0
aerial_ace|dash|feather|3|.75|-.45|-.6
agility|warp|mist|5|.75|.5|0
air_cutter|slash|mist|3|.85|.5|-.45
air_slash|slash|mist|1|1.3|.75|.2
amnesia|shroud|mist|9|.8|.6|.3
ancient_power|levitate|rock|6|.9|.7|.5
aqua_jet|dash|droplet|9|.7|0|0
aqua_tail|whip|splash|1|1.1|.85|.1
assurance|strike|smoke|4|.9|-.3|-.5
astonish|burst|smoke|5|.6|.6|.4
aura_sphere|orb|light|8|1.05|-.4|1
aurora_beam|beam|mist|5|.7|.15|.3
autotomize|shatter|metal|8|.9|.3|1
axe_kick|slash|spark|1|1.5|.3|1.57
baby_doll_eyes|sound|light|2|.45|.35|.6
belch|jet|smoke|18|1.65|.45|0
blaze_kick|slash|flame|2|1.1|.75|-.9
bone_rush|strike|rock|3|.65|.5|.8
bonemerang|volley|rock|2|.8|1.3|2
bounce|dive|dust|6|1|-.95|1.57
brave_bird|dive|feather|16|1.5|-.4|-.35
brick_break|slash|rock|1|1.05|.3|1.15
brine|jet|droplet|14|.72|.4|.15
brutal_swing|slash|smoke|3|1.15|1|0
bubble_beam|jet|bubble|18|.78|.45|0
bug_bite|fang|tooth|6|.55|.2|.2
bug_buzz|sound|mist|8|1.1|.2|.6
bulk_up|aura|dust|8|.95|0|.15
bulldoze|quake|dust|8|1.1|.4|.2
bullet_punch|dash|metal|3|.42|0|0
bullet_seed|volley|seed|5|.4|-.15|.5
calm_mind|aura|mist|4|.8|.65|.4
charge|aura|spark|8|.6|.4|.3
charge_beam|beam|spark|4|.5|.15|0
charm|shroud|petal|8|.65|.8|.4
clear_smog|shroud|mist|13|1|.45|0
close_combat|strike|spark|12|1.15|.6|.5
coil|barrier|mist|3|.65|1.2|0
confuse_ray|beam|light|3|.45|.85|.6
confusion|levitate|mist|3|.65|.4|0
cosmic_power|aura|light|14|1.1|1|.5
covet|dash|dust|5|.55|-.3|.25
crabhammer|strike|splash|8|1.2|.5|1.1
cross_chop|slash|spark|2|1.25|.3|.78
cross_poison|slash|droplet|2|1.05|.35|.78
crunch|fang|tooth|6|1.05|.1|.05
crush_claw|slash|claw|4|1.1|.45|-.5
cut|slash|claw|1|.72|.2|.4
dark_pulse|sound|smoke|7|1.05|.45|0
dazzling_gleam|burst|light|16|1.45|.5|.2
defense_curl|barrier|mist|2|.62|.7|.3
defog|wave|mist|7|1.1|.6|0
dig|eruption|dust|11|.9|.25|0
disarming_voice|sound|petal|4|.62|.3|.3
discharge|lightning|spark|8|1.4|.85|1
dive|eruption|splash|10|1|.4|0
double_edge|dash|dust|12|1.35|.2|.1
double_hit|strike|spark|2|.8|.5|.4
double_team|warp|mist|6|1.15|0|0
dragon_breath|jet|flame|15|.72|.45|.1
dragon_dance|aura|mist|7|1.15|1.2|.7
dragon_pulse|sound|light|6|1.15|.85|.3
dragon_rush|dragon-dive|flame|12|1.35|-.25|-.4
dragon_tail|whip|mist|1|1.15|1.1|.3
drain_punch|strike|light|6|.9|.3|0
draining_kiss|drain|petal|7|.65|.8|.3
drill_run|drill|dust|7|1.05|.75|.2
dual_wingbeat|slash|feather|2|1.3|.8|-.3
dynamic_punch|strike|spark|10|1.3|.25|.2
earth_power|eruption|rock|12|1.25|.3|0
echoed_voice|sound|mist|3|.6|.6|.15
eerie_impulse|sound|spark|4|.8|1.2|.4
electro_ball|orb|spark|7|.78|-.3|1.2
energy_ball|orb|leaf|9|1.15|-.35|.7
explosion|explosion|flame|32|2|.7|0
extrasensory|levitate|spark|5|1|1.1|.5
fairy_wind|wave|petal|8|.7|.8|.1
fake_out|strike|spark|2|.6|.15|0
fake_tears|shroud|droplet|7|.65|-.2|0
false_swipe|slash|claw|1|.55|.1|-.15
feather_dance|storm|feather|12|.9|1.3|.5
feint|dash|mist|3|.4|.6|-.2
fell_stinger|drill|claw|1|.58|.25|.3
fire_fang|fang|flame|4|.9|.3|0
fire_punch|strike|flame|8|.9|.2|0
first_impression|dash|claw|6|.9|.25|-.3
flame_charge|dash|flame|8|.72|.2|0
flame_wheel|orb|flame|10|.8|.2|2
flare_blitz|dash|flame|22|1.5|.3|.2
flash_cannon|beam|metal|7|1|0|.2
flatter|sound|smoke|3|.75|1|.2
focus_punch|strike|light|13|1.6|.1|.3
force_palm|strike|mist|5|.8|.45|.2
freeze_dry|shatter|ice|14|.95|.35|.1
fury_swipes|slash|claw|4|.7|.2|-.9
future_sight|levitate|light|12|1.45|1.3|.6
giga_drain|drain|leaf|18|1.15|.8|.3
giga_impact|dash|light|18|1.7|.1|.2
glare|beam|light|2|.4|0|.25
growl|sound|mist|3|.5|.2|0
growth|aura|leaf|8|.85|.6|.1
gunk_shot|volley|droplet|3|1.55|-.9|.7
gust|vortex|mist|9|.62|.5|.3
gyro_ball|orb|metal|10|.85|.2|2.6
hammer_arm|strike|dust|10|1.25|.7|1.3
harden|barrier|light|3|.7|.3|0
head_smash|strike|rock|15|1.6|.2|.1
headbutt|strike|dust|7|.85|.15|-.1
heal_pulse|heal|mist|10|1|.7|.3
heat_wave|wave|flame|20|1.5|.5|.1
heavy_slam|slam|metal|9|1.35|.2|1.57
hex|shroud|smoke|14|1.05|1.25|.3
high_horsepower|dash|dust|14|1.15|.15|.1
high_jump_kick|dive|spark|9|1.4|-.75|.7
hone_claws|aura|claw|3|.7|.3|-.6
howl|sound|light|5|1.05|.25|0
hyper_beam|beam|light|13|1.75|0|0
hyper_voice|sound|mist|9|1.5|.25|.1
ice_fang|fang|ice|4|.85|.2|.1
ice_punch|strike|ice|8|.85|.3|.1
ice_shard|volley|ice|2|.48|-.15|.5
icicle_crash|storm|ice|7|1.1|.1|1.57
icicle_spear|volley|ice|3|.4|0|0
icy_wind|wave|ice|14|1.1|.65|.2
incinerate|jet|flame|16|1.05|.35|.2
inferno|eruption|flame|24|1.45|.5|.1
iron_defense|barrier|metal|6|.95|0|.3
iron_head|strike|metal|7|.95|.2|.05
knock_off|slash|smoke|1|.95|.65|-.6
last_resort|burst|spark|15|1.55|.4|.3
lava_plume|eruption|smoke|18|1.25|.7|.2
leaf_blade|slash|leaf|2|1.2|.65|-.65
leaf_storm|vortex|leaf|32|1.7|1.2|.6
leech_life|drain|droplet|14|.9|.45|.2
leer|beam|mist|2|.5|.1|-.1
life_dew|heal|droplet|9|.85|.5|0
liquidation|slash|splash|3|1.1|.7|-.4
lovely_kiss|shroud|smoke|7|.75|.8|.1
low_sweep|slash|dust|2|1|.7|-.15
mach_punch|dash|spark|4|.55|0|.1
magical_leaf|volley|leaf|6|.85|1.25|.9
magnetic_flux|aura|spark|10|1.2|1.4|.3
mega_drain|drain|leaf|10|.7|.55|.15
mega_kick|slash|spark|1|1.55|.85|-.7
mega_punch|strike|spark|8|1.1|.1|.1
megahorn|drill|claw|7|1.4|.9|0
memento|shroud|smoke|18|1.15|1.5|.2
metal_claw|slash|metal|3|.75|.2|-.5
metal_sound|sound|metal|6|.95|.15|.4
meteor_assault|dive|spark|18|1.7|-.3|-.55
meteor_mash|strike|metal|11|1.15|.25|-.5
milk_drink|heal|droplet|6|.65|.1|.2
minimize|warp|light|3|.45|-.4|.4
moonlight|heal|light|14|1.1|.7|.3
morning_sun|heal|spark|16|1.2|.3|.1
mud_shot|volley|droplet|5|.72|-.45|.2
mud_slap|wave|dust|6|.55|.3|-.1
muddy_water|wave|splash|20|1.5|.7|.2
mystical_fire|volley|flame|7|1.05|1.15|.8
nasty_plot|aura|smoke|7|.85|1.15|.6
night_slash|slash|claw|1|1.1|.45|.55
nuzzle|lightning|spark|2|.32|.2|.5
outrage|rampage|flame|5|1.55|1|.65
overheat|explosion|flame|26|1.55|1|.15
pay_day|volley|metal|6|.7|-.5|1.2
payback|strike|smoke|6|.85|.6|-.3
petal_blizzard|storm|petal|26|1.3|.95|.7
petal_dance|vortex|petal|24|1.5|1.45|1
pin_missile|volley|claw|5|.55|-.2|.1
play_nice|sound|light|3|.55|.6|.5
play_rough|vortex|dust|15|1.05|1.5|.9
pluck|drill|feather|2|.5|.25|-.2
poison_fang|fang|droplet|4|.75|.3|-.1
poison_gas|shroud|smoke|16|1.1|.7|0
poison_powder|spore|dust|22|.85|.4|.2
pound|strike|dust|4|.55|.1|.3
powder_snow|wave|mist|12|.75|.5|.3
power_gem|volley|ice|7|.9|-.55|1
power_whip|whip|leaf|3|1.5|1.25|.45
psybeam|beam|light|5|.8|.55|.5
psycho_cut|slash|light|1|1.05|.5|.75
psyshock|volley|light|5|1.05|.9|.2
psystrike|levitate|ice|9|1.25|1.2|.4
quiver_dance|aura|petal|12|1.05|1.1|.8
raging_bull|dash|dust|13|1.2|.1|-.15
rapid_spin|vortex|dust|10|.8|1.8|.2
razor_shell|slash|shell|1|1.05|.5|-.55
retaliate|strike|spark|9|1.05|.5|-.3
reversal|strike|light|6|.85|.7|.9
rock_blast|volley|rock|3|.58|-.35|.9
rock_polish|shatter|spark|11|.75|.35|.3
rock_smash|strike|rock|6|.68|.2|.4
rock_tomb|eruption|rock|6|1.05|.6|.3
rock_wrecker|orb|rock|16|1.75|-.5|1.5
round|sound|mist|5|.8|.9|.2
sacred_sword|slash|light|1|1.3|.45|-.75
sand_attack|wave|dust|12|.78|.6|.15
scary_face|shroud|smoke|8|.95|.3|1
screech|sound|spark|7|.9|.1|.7
seed_bomb|orb|seed|8|1.05|-.8|.6
self_destruct|explosion|dust|24|1.65|.3|.2
shadow_punch|strike|smoke|8|.8|.65|.1
shadow_sneak|dash|smoke|7|.55|.35|0
shell_smash|shatter|shell|9|1.1|.6|.4
shock_wave|wave|spark|12|1.05|.7|.4
sing|sound|mist|4|.7|.8|.1
slam|strike|dust|8|1.1|.6|1.05
sleep_powder|spore|dust|18|.85|.8|.4
sludge|volley|droplet|5|.95|-.65|.4
sludge_bomb|orb|droplet|12|1.2|-.7|1
sludge_wave|wave|droplet|21|1.5|.7|.2
smog|shroud|smoke|10|.85|.5|.2
smokescreen|shroud|smoke|20|1.2|.2|0
snarl|sound|smoke|6|.85|.35|.3
snore|sound|dust|4|.75|.55|.1
soft_boiled|heal|shell|7|.8|.4|.5
solar_beam|beam|light|12|1.55|0|.4
spark|dash|spark|9|.85|.4|.2
splash|eruption|dust|3|.4|.25|.2
spore|spore|seed|24|.9|.6|.3
stockpile|aura|dust|12|1|-.5|.2
stomp|slam|dust|7|.9|.45|1.5
stomping_tantrum|quake|rock|10|1.1|1.1|.5
stone_axe|slash|rock|1|1|.6|1.05
stone_edge|eruption|rock|9|1.3|.1|.6
stored_power|orb|light|5|.62|-.2|1.6
storm_throw|vortex|mist|7|.95|1.2|.8
strength|strike|dust|11|1.1|.4|.15
string_shot|bind|thread|5|.85|.65|.3
stun_spore|spore|spark|20|.8|.9|.6
submission|vortex|dust|9|1.1|2|.9
sucker_punch|dash|smoke|6|.85|-.4|-.2
superpower|strike|light|14|1.5|.4|.8
supersonic|sound|mist|6|.7|1.25|.5
swagger|aura|smoke|10|1.05|.8|.2
swallow|heal|light|8|.75|-.6|.2
sweet_kiss|shroud|petal|6|.6|1.05|.4
sweet_scent|spore|petal|14|1.05|.95|.1
swift|volley|spark|8|.8|.75|.9
swords_dance|aura|claw|3|1.2|1.5|.3
synthesis|heal|leaf|16|1.05|.8|.2
tail_whip|whip|mist|1|.6|.75|.5
take_down|dash|dust|10|1.1|.35|.2
tearful_look|shroud|droplet|9|.5|-.3|.2
teeter_dance|aura|mist|6|1|1.7|.7
teleport|warp|light|8|1.1|1.2|.5
thrash|strike|dust|15|1.4|1.2|.9
thunder|lightning|spark|8|1.65|.9|1.57
thunder_fang|fang|spark|4|.85|.5|.2
thunder_punch|strike|spark|10|.95|.45|.4
thunder_wave|sound|spark|5|.65|.75|.3
toxic|shroud|droplet|16|.85|1.1|.4
triple_kick|slash|spark|1|.75|.55|-.9
twister|vortex|mist|12|.8|1.3|.5
uproar|sound|dust|10|1.35|.5|.25
vacuum_wave|wave|mist|6|.6|.25|.1
venoshock|jet|droplet|13|.85|.65|.3
vice_grip|fang|claw|2|.85|.3|.4
vital_throw|vortex|dust|8|1|1.5|.6
water_pulse|sound|bubble|6|.92|.6|.3
waterfall|eruption|splash|18|1.2|.85|.4
wave_crash|dash|splash|24|1.55|.65|.3
will_o_wisp|volley|flame|3|.7|1.2|.5
withdraw|barrier|shell|4|.65|.4|.2
wood_hammer|strike|rock|12|1.4|.7|1.2
x_scissor|slash|claw|2|1.1|.4|.78
zen_headbutt|strike|light|8|1|.3|.15
`

export const MOVE_VFX_RECIPES = Object.fromEntries(AUTHORED.trim().split('\n').map(row => {
  const [key, technique, material, count, spread, bend, rotation] = row.split('|')
  return [key, Object.freeze({ technique, material, count: +count, spread: +spread, bend: +bend, rotation: +rotation })]
}))

export const VFX_TYPE_PALETTES = {
  normal: ['#f5e7cc', '#a7b6c7', '#fff8e5'], fire: ['#ff6b22', '#bd251b', '#fff4ad'],
  water: ['#39baf5', '#176ebd', '#d4ffff'], grass: ['#77d750', '#26864c', '#e7ffc0'],
  electric: ['#ffda40', '#e48313', '#ffffdc'], ice: ['#87eaff', '#518ecb', '#efffff'],
  fighting: ['#ffc38d', '#c35c49', '#fff0da'], poison: ['#c67aed', '#6433a3', '#f5c7ff'],
  ground: ['#c3a477', '#795343', '#f4d7a3'], flying: ['#d4f5fc', '#8babbd', '#ffffff'],
  psychic: ['#f387da', '#8553d5', '#ffe6fb'], bug: ['#a9cc51', '#568544', '#f2fbbd'],
  rock: ['#c6b7a0', '#746a63', '#eee2cf'], ghost: ['#9f85ee', '#433673', '#dcc9ff'],
  dragon: ['#76a7ff', '#644ccb', '#d8e5ff'], dark: ['#a08bba', '#343040', '#e9d9eb'],
  steel: ['#cedde6', '#6b8495', '#f3fcff'], fairy: ['#f4b6db', '#b87acb', '#ffedf9'],
}

const PALETTE_OVERRIDES = {
  solar_beam: ['#d8ed61', '#69b649', '#ffffde'], hyper_beam: ['#ffc579', '#c96552', '#fffbe7'],
  fire_blast: ['#ff802d', '#cf3221', '#fff4b1'], will_o_wisp: ['#93b8ff', '#6156cc', '#e6f1ff'],
  morning_sun: ['#ffe099', '#d8a346', '#fffce1'], moonlight: ['#c8caff', '#8a90d0', '#f3f3ff'],
  sludge: ['#ba83d2', '#714078', '#e6b8ed'], muddy_water: ['#b8ac81', '#6e8875', '#e3dbb2'],
  mud_slap: ['#bc9e70', '#79654c', '#e9d6a7'], smokescreen: ['#a6acb5', '#4b535d', '#dde3eb'],
  sleep_powder: ['#b2a2e0', '#766399', '#e7ddff'], stun_spore: ['#ebd76a', '#a99530', '#fff3b5'],
  poison_powder: ['#c082cc', '#7b479b', '#efcaff'], wood_hammer: ['#b29a63', '#647143', '#e4cf8c'],
  petal_dance: ['#f5a9c6', '#b46095', '#ffe1ed'], petal_blizzard: ['#f0a8c6', '#a567ad', '#ffe7ef'],
  recover: ['#9befce', '#4ba989', '#e1fff1'], milk_drink: ['#f7eddf', '#cbb9ad', '#ffffff'],
}

export function getMoveVfxRecipe(moveKey, move = {}, config = {}) {
  const authored = MOVE_VFX_RECIPES[moveKey]
  const recipe = authored || { technique: move.category === 'status' ? 'aura' : 'strike', material: 'light', count: 6, spread: .7, bend: .2, rotation: 0 }
  const power = Math.max(0, Number(move.power) || 0)
  const powerLevel = power >= 130 ? 4 : power >= 95 ? 3 : power >= 60 ? 2 : power > 0 ? 1 : 0
  const palette = PALETTE_OVERRIDES[moveKey] || VFX_TYPE_PALETTES[move.type] || VFX_TYPE_PALETTES.normal
  return {
    ...recipe, key: moveKey, authored: Boolean(authored), palette, power, powerLevel,
    energy: power ? .56 + Math.min(200, power) / 150 : .7,
    target: config.target || 'foe', drain: move.effect === 'drain',
    signature: [recipe.technique, recipe.material, recipe.count, recipe.spread, recipe.bend, recipe.rotation, power, ...palette].join(':'),
  }
}
