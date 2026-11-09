import assert from 'node:assert/strict'
import { withViteAuditServer } from './load-vite-module.mjs'

// Observe actual textured draw calls, not only recipe labels or pixel hashes.
await withViteAuditServer(async ({loadModule})=>{
  const {MOVES}=await loadModule('/src/utils/gameData.js')
  const {VFX_ATLAS}=await loadModule('/src/utils/battleVfxAtlas.generated.js')
  const {getMoveVfxRecipe}=await loadModule('/src/utils/battleVfxRecipes.js')
  const {createBattleVfxRenderer}=await loadModule('/src/utils/battleVfxRenderer.js')
  const {getBattleMoveImpactDelay}=await loadModule('/src/utils/battlePacing.js')
  const saved=globalThis.document, marks=[], outlines=[]
  let position=[0,0], points=[], allocations=0
  const ctx={save(){},restore(){},clearRect(){marks.length=0;outlines.length=0},fillRect(){},rotate(){},scale(){},
    translate(x,y){position=[x,y]},drawImage(tile){marks.push({material:tile.material,position:[...position]})},
    beginPath(){points=[]},moveTo(x,y){points.push([x,y])},lineTo(x,y){points.push([x,y])},
    closePath(){},fill(){outlines.push([...points])},stroke(){},ellipse(){},quadraticCurveTo(){},createLinearGradient(){return{addColorStop(){}}}}
  globalThis.document={createElement(){allocations++;const tile={width:0,height:0};tile.getContext=()=>({drawImage(image,x,y){tile.material=VFX_ATLAS.sprites[y/VFX_ATLAS.size*VFX_ATLAS.columns+x/VFX_ATLAS.size]},fillRect(){}});return tile}}
  try {
    const image={}
    const at=(key,age=.12,hitIndex=0,hitCount=1)=>{
      const durationMs=1100,hit=getBattleMoveImpactDelay('hit',durationMs)/durationMs
      const recipe=getMoveVfxRecipe(key,MOVES[key])
      const renderer=createBattleVfxRenderer(ctx,image,recipe,{phase:'hit',durationMs,feedback:{hitIndex,hitCount},anchors:{player:{x:'20%',y:'70%',radius:70},enemy:{x:'78%',y:'30%',radius:70}}})
      const before=allocations
      renderer.render(hit+age*(1-hit),900,600)
      assert.equal(allocations,before,`${key}: late texture`)
      return marks.map(x=>({...x}))
    }
    const first=at('double_kick',.12).filter(x=>x.material==='sole')
    const second=at('double_kick',.4).filter(x=>x.material==='sole')
    assert.equal(first.length,1)
    assert.equal(second.length,2,'combined double kick needs current foot plus fading first footprint')
    assert.notDeepEqual(first[0].position,second[1].position)
    for(let i=0;i<3;i++)assert.equal(at('triple_kick',.12,i,3).filter(x=>x.material==='sole').length,1,'one sole per resolved hit')
    const fire=at('blaze_kick')
    assert.equal(fire.filter(x=>x.material==='sole').length,1)
    assert.ok(fire.filter(x=>x.material==='firetongue').length>=6,'fire must wrap the footprint')
    assert.ok(at('fire_punch').some(x=>x.material==='fist'))
    assert.ok(at('bone_rush').some(x=>x.material==='bone'))
    assert.ok(at('bonemerang').some(x=>x.material==='bone'))
    const positions=[]
    for(let i=0;i<5;i++)positions.push(at('fury_attack',.12,i,5).find(x=>x.material==='horn').position.join(','))
    assert.equal(new Set(positions).size,5,'fury attacks must change target-side placement')
    const vine=at('vinewhip',.02)
    assert.ok(vine.filter(x=>x.material==='leaf').length>=5,'vine must carry leaves at multiple nodes')
    assert.ok(outlines.some(p=>p.length>=60),'vine requires a tapered solid body')
    assert.ok(at('wing_attack').some(x=>x.material==='wing'))
    assert.ok(at('peck').some(x=>x.material==='beak'))
    assert.ok(at('aqua_tail').some(x=>x.material==='tail'))
    console.log('Observed: two combined kick contacts; one footprint per resolved hit; attached flames; five surrounding strike positions; tapered leafy vines; physical bones, fists, wings, beaks and tails.')
  } finally {globalThis.document=saved}
})
