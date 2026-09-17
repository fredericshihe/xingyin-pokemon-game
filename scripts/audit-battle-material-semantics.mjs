import assert from 'node:assert/strict'
import { withViteAuditServer } from './load-vite-module.mjs'

await withViteAuditServer(async ({ loadModule }) => {
  const { MOVES } = await loadModule('/src/utils/gameData.js')
  const { getMoveEffectConfig } = await loadModule('/src/utils/moveVisuals.js')
  const { getMoveVfxRecipe } = await loadModule('/src/utils/battleVfxRecipes.js')
  const { createBattleVfxRenderer } = await loadModule('/src/utils/battleVfxRenderer.js')
  let allocations = 0, lastPoint = null, straightLength = 0, currentSegments = [], blends = []
  const ctx = {
    save() {}, restore() {}, clearRect() {}, fillRect() {}, translate() {}, rotate() {}, drawImage() {},
    beginPath() { lastPoint = null; currentSegments = [] }, closePath() {}, fill() {},
    moveTo(x,y) { lastPoint = [x,y] },
    lineTo(x,y) { if(lastPoint)currentSegments.push(Math.hypot(x-lastPoint[0],y-lastPoint[1]));lastPoint=[x,y] },
    quadraticCurveTo() { lastPoint = null }, ellipse() { lastPoint = null },
    stroke() { if(currentSegments.length===1)straightLength=Math.max(straightLength,currentSegments[0]) },
    createLinearGradient() { return { addColorStop() {} } },
    set globalCompositeOperation(value) { blends.push(value) },
  }
  const savedDocument = globalThis.document
  globalThis.document = { createElement() { allocations++;return { width:0,height:0,getContext(){return ctx} } } }
  let count = 0
  try {
    const image = {}
    for (const [key,move] of Object.entries(MOVES)) {
      const recipe = getMoveVfxRecipe(key,move,getMoveEffectConfig(key,move))
      const renderer = createBattleVfxRenderer(ctx,image,recipe,{moveKey:key,phase:'hit',durationMs:1040,
        anchors:{player:{x:'20%',y:'72%',radius:64},enemy:{x:'80%',y:'25%',radius:64}}})
      const before = allocations
      straightLength = 0; blends = []
      for (let frame=1;frame<60;frame++)renderer.render(frame/60,1024,768)
      assert.equal(allocations,before,`${key}: texture allocated during visible playback`)
      assert.ok(!blends.includes('screen'),`${key}: destination-read blend in animation`)
      if (['strike','slam','dash','dive','dragon-dive','rampage','slash','roll','fang','drill'].includes(recipe.technique)) {
        assert.ok(straightLength<100,`${key}: contact attack drew a long straight rod (${straightLength}px)`)
      }
      count++
    }
    for (const key of ['glare','leer']) assert.equal(getMoveVfxRecipe(key,MOVES[key]).technique,'gaze')
    for (const key of ['rollout','gyro_ball','flame_wheel']) assert.equal(getMoveVfxRecipe(key,MOVES[key]).technique,'roll')
    assert.equal(getMoveVfxRecipe('double_kick',MOVES.double_kick).gesture,'kick')
    assert.equal(getMoveVfxRecipe('fire_punch',MOVES.fire_punch).gesture,'punch')
    for (const key of ['soft_boiled', 'swords_dance', 'rock_tomb', 'bone_rush', 'bonemerang', 'wood_hammer', 'dig', 'dive', 'splash', 'fake_tears']) {
      const recipe = getMoveVfxRecipe(key,MOVES[key],getMoveEffectConfig(key,MOVES[key]))
      assert.ok(recipe.direction, `${key}: missing semantic direction`)
    }
    for (const result of [{kind:'heal'}, {kind:'stat', stages:-2}, {kind:'stat',stages:2},
      ...['burn','poison','paralysis','sleep','freeze','confusion','flinch'].map(status=>({kind:'status',status}))]) {
      const recipe = getMoveVfxRecipe('ember', MOVES.ember)
      const renderer = createBattleVfxRenderer(ctx,image,recipe,{phase:'secondary',visualResult:result,durationMs:440})
      const before = allocations
      assert.equal(renderer.render(.01,1024,768).draws,0,'Secondary result cannot appear before its gameplay impact')
      for(let frame=1;frame<60;frame++)renderer.render(frame/60,1024,768)
      assert.equal(allocations,before,`Result ${JSON.stringify(result)} allocated textures during playback`)
    }
  } finally { globalThis.document = savedDocument }
  console.log(`${count} moves: no visible-frame texture allocations; no screen blending; contact attacks have no connecting rods; gaze/rolling/kick/punch semantics passed.`)
})
