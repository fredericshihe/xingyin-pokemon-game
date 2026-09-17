import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { withViteAuditServer } from './load-vite-module.mjs'

await withViteAuditServer(async ({loadModule}) => {
  const {MOVES}=await loadModule('/src/utils/gameData.js')
  const {MOVE_VFX_RECIPES,getMoveVfxRecipe}=await loadModule('/src/utils/battleVfxRecipes.js')
  const {getMoveEffectConfig}=await loadModule('/src/utils/moveVisuals.js')
  const {VFX_ATLAS}=await loadModule('/src/utils/battleVfxAtlas.generated.js')
  const renderer=await fs.readFile('src/utils/battleVfxRenderer.js','utf8')
  const component=await fs.readFile('src/components/Game/BattleMoveEffect.jsx','utf8')
  const signatures=new Set(),techniques=new Set(),materials=new Set()
  assert.deepEqual(Object.keys(MOVE_VFX_RECIPES).sort(),Object.keys(MOVES).sort())
  for (const [key,move] of Object.entries(MOVES)) {
    const recipe=getMoveVfxRecipe(key,move,getMoveEffectConfig(key,move))
    assert.ok(recipe.authored,`${key}: missing authored recipe`)
    assert.ok(renderer.includes(`case '${recipe.technique}':`),`${key}: technique has no renderer`)
    assert.ok(VFX_ATLAS.sprites.includes(recipe.material),`${key}: missing material`)
    assert.ok(recipe.count>0 && recipe.count<=32)
    assert.ok(recipe.spread>0 && recipe.spread<=2)
    assert.ok(Number.isFinite(recipe.bend)&&Number.isFinite(recipe.rotation))
    assert.ok(!signatures.has(recipe.signature),`${key}: identical choreography`)
    signatures.add(recipe.signature);techniques.add(recipe.technique);materials.add(recipe.material)
  }
  // These pairs must differ in actual geometry/trajectory, not just hue or IDs.
  for (const pair of [['ember','flamethrower'],['flamethrower','fire_blast'],['watergun','surf'],['icebeam','blizzard'],['razorleaf','leaf_storm'],['rock_throw','earthquake'],['recover','swords_dance']]) {
    assert.notEqual(MOVE_VFX_RECIPES[pair[0]].technique,MOVE_VFX_RECIPES[pair[1]].technique)
  }
  for (const keys of [['absorb','mega_drain','giga_drain'],['thundershock','thunderbolt','thunder'],['watergun','hydropump']]) {
    const recipes=keys.map(k=>getMoveVfxRecipe(k,MOVES[k]))
    for(let i=1;i<recipes.length;i++) {
      assert.ok(recipes[i].energy>recipes[i-1].energy)
      assert.ok(recipes[i].spread>recipes[i-1].spread)
    }
  }
  assert.ok(!/battle-vfx-icon|battle-vfx-symbol|fillText|strokeText|fa-solid/.test(component+renderer))
  assert.ok(!/Math\.random/.test(renderer))
  assert.ok(/getBattleMoveImpactDelay/.test(renderer))
  assert.ok(/phase === 'miss'/.test(renderer)&&/phase === 'secondary'/.test(renderer))
  assert.ok((await fs.stat('src/assets/battle-vfx-atlas.png')).size<160000)
  console.log(JSON.stringify({moves:signatures.size,techniques:techniques.size,materials:materials.size,atlasSprites:VFX_ATLAS.sprites.length,uniqueRecipes:true,noGlyphEffects:true},null,2))
})
