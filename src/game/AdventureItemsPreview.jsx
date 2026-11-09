import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import '../game.css'
import { BattleScene } from '../components/Game/OriginalGame'
import { ShopScreen, UnifiedBagScreen } from '../components/Game/DeferredGamePanels'
import TimberLeagueConfirmModal from '../components/Game/TimberLeagueConfirmModal'
import PokemonBreederScreen from '../components/Game/PokemonBreederScreen'
import PokemonReleasePreview from './PokemonReleasePreview'
import { createPokemonBreederState, getPokemonBreederRefreshPrice, refreshPokemonBreederDailyState, setPokemonBreederOfferLock } from '../utils/pokemonBreeder'
import { MONSTERS, EXP_POTIONS, POTIONS, POKEBALLS, STAT_BOOST_ITEMS } from '../utils/gameData'
import { BATTLE_ITEMS, KEY_ITEMS } from '../utils/adventureItems'
import { activateDynamax, normalizeDynamaxRuntime, hasUsedDynamax } from '../utils/dynamax'
import { simulateMonsterExpGain } from '../utils/pokemonProgress'
import { getInventoryItemQuantity, getPotionEffectText, mergeInventoryEntries, consumeInventoryItem } from '../utils/inventoryItems'
import { calculateBattleDamage } from '../utils/battleDamage'
import { MOVES } from '../utils/gameData'
import { prepareStatBoostItemUse } from '../utils/pokemonStats'
import { loadModels } from './threeLowPolyModelCache'
import { createLowPolyPlayer } from './playerFigureVisual'
import { createPlayerTravelRig, attachBicycleModel, attachSportsCarModel, setPlayerRiding, animatePlayerTravelRig } from './playerBicycleVisual'

function fixture(dexNo, id) {
  const base = MONSTERS.find((m) => m.dexNo === dexNo)
  return simulateMonsterExpGain({ ...base, baseId: base.id, id, level: 50, currentExp: 0, moves: ['tackle','thunderbolt','quick_attack','thunder_wave'] }, 0).updatedMon
}
function VehicleGallery({ vehicle = 'bicycle' }) {
  const host = useRef(null)
  useEffect(() => {
    let disposed = false, frame, player, previous = 0
    const renderer = new THREE.WebGLRenderer({antialias:true})
    renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(host.current.clientWidth,host.current.clientHeight)
    renderer.setClearColor('#dfeced'); host.current.appendChild(renderer.domElement)
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35,host.current.clientWidth/host.current.clientHeight,.1,30)
    camera.position.set(3.4,2.35,3.9); camera.lookAt(0,.85,0)
    scene.add(new THREE.HemisphereLight(0xffffff,0x709f9e,2))
    const light = new THREE.DirectionalLight(0xfff3e0,3);light.position.set(2,5,4);scene.add(light)
    const floor=new THREE.Mesh(new THREE.CircleGeometry(2,48),new THREE.MeshStandardMaterial({color:'#c3dbd7',roughness:1}));floor.rotation.x=-Math.PI/2;scene.add(floor)
    loadModels(['player_child_adventurer', vehicle === 'sports_car' ? 'player_sports_car' : 'player_bicycle']).then(()=>{
      if(disposed)return
      player=createPlayerTravelRig(createLowPolyPlayer())
      const ready = vehicle === 'sports_car' ? attachSportsCarModel(player) : attachBicycleModel(player)
      setPlayerRiding(player,true,vehicle);scene.add(player)
      renderer.domElement.dataset.vehicleReady=String(ready)
    })
    const tick=(now)=>{if(disposed)return;const dt=previous?Math.min(.05,(now-previous)/1000):0;previous=now;if(player)animatePlayerTravelRig(player,true,now,dt);renderer.render(scene,camera);frame=requestAnimationFrame(tick)}
    frame=requestAnimationFrame(tick)
    return()=>{disposed=true;cancelAnimationFrame(frame);scene.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose()});renderer.dispose();renderer.domElement.remove()}
  },[vehicle])
  return <div ref={host} style={{width:'100%',height:'100%'}} aria-label={vehicle === 'sports_car' ? '跑车模型预览' : '自行车模型预览'} />
}
function PokemonBreederPreview() {
  const [state, setState] = useState(() => createPokemonBreederState('2026-10-01', MONSTERS))
  const [gold, setGold] = useState(300000)
  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
    <div style={{ padding: '8px 16px', flexShrink: 0 }}>
      <button type="button" onClick={() => {
        const nextDay = new Date(`${state.dayKey}T00:00:00Z`)
        nextDay.setUTCDate(nextDay.getUTCDate() + 1)
        setState(refreshPokemonBreederDailyState(state, nextDay.toISOString().slice(0, 10), MONSTERS))
      }}>模拟第二天</button> <span>{state.dayKey}</span>
    </div>
    <div style={{ flex: 1, minHeight: 0 }}>
      <PokemonBreederScreen state={state} playerGold={gold} busy={null} onBack={() => {}}
        onLock={(id, locked) => setState(setPokemonBreederOfferLock(state, id, locked) || state)}
        onRefresh={() => {
          const price = getPokemonBreederRefreshPrice(state)
          if (price === null || gold < price) return
          setGold(gold - price)
          setState(createPokemonBreederState(state.dayKey, MONSTERS, state.refreshCount + 1))
        }}
        onPurchase={(id) => {
          const offer = state.offers.find((entry) => entry.id === id)
          if (!offer || offer.purchased || gold < offer.price) return
          setGold(gold - offer.price)
          setState({ ...state, offers: state.offers.map((entry) => entry.id === id ? { ...entry, purchased: true, locked: false } : entry) })
        }} />
    </div>
  </div>
}

export default function AdventureItemsPreview() {
  const [mode,setMode]=useState(() => ['breeder','bag','bicycle','sports_car','battle','league','release'].includes(new URLSearchParams(window.location.search).get('mode')) ? new URLSearchParams(window.location.search).get('mode') : 'shop'),[gold,setGold]=useState(100000)
  const [inventory,setInventory]=useState([{itemType:'battleItem',itemKey:'dynamax_candy',quantity:2}, ...Object.keys(STAT_BOOST_ITEMS).filter(key=>key!=='rare_candy').map(itemKey=>({itemType:'statBoost',itemKey,quantity:6}))])
  const [player,setPlayer]=useState(()=>fixture(25,'preview-player')),[enemy,setEnemy]=useState(()=>fixture(133,'preview-enemy'))
  const [log,setLog]=useState('本地道具预览，不写入账号存档。'),[attacks,setAttacks]=useState(0)
  const reset=()=>{setPlayer(fixture(25,'preview-player'));setEnemy(fixture(133,'preview-enemy'));setAttacks(0);setLog('新一场战斗。')}
  return <main style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#edf4f5'}} data-attack-count={attacks}>
    <nav style={{display:'flex',gap:12,padding:10,flexWrap:'wrap',fontSize:13,flexShrink:0}}>
      <b>本地道具预览</b>{[['shop','商店'],['bag','宝石培养'],['battle','极巨化战斗'],['bicycle','自行车模型'],['sports_car','跑车模型'],['league','联赛界面'],['breeder','饲养家'],['release','放生补偿']].map(([id,name])=><button key={id} onClick={()=>setMode(id)}>{name}</button>)}
      <a href="/map-runtime-preview?map=GodotMapV2&perf=1&bicycle=1">地图骑行</a>
      <a href="/map-runtime-preview?map=GodotMapV2_FarmTown&spawn=8,16&perf=1&sports_car=1&bicycle=1">地图试驾</a>
      {mode==='battle'&&<><button onClick={reset}>新战斗</button><button onClick={()=>setPlayer(m=>normalizeDynamaxRuntime({...m,currentHp:0}))}>模拟阵亡</button><button onClick={()=>setPlayer(m=>({...m,currentMp:1}))}>MP 设为 1</button></>}
    </nav>
    <div style={{flex:1,minHeight:0,position:'relative'}}>
      {mode==='release'&&<PokemonReleasePreview />}
      {mode==='shop'&&<ShopScreen playerGold={gold} playerTeam={[player]} playerInventory={inventory} getInventoryItemQuantity={getInventoryItemQuantity} getPotionEffectText={getPotionEffectText} onBack={()=>setMode('battle')} onPurchase={async(type,key,quantity)=>{
        const item={pokeball:POKEBALLS,potion:POTIONS,expPotion:EXP_POTIONS,battleItem:BATTLE_ITEMS,keyItem:KEY_ITEMS,statBoost:STAT_BOOST_ITEMS}[type]?.[key]
        if(!item||gold<item.price*quantity||(item.permanent&&getInventoryItemQuantity(inventory,type,key)))return false
        setGold(v=>v-item.price*quantity);setInventory(v=>mergeInventoryEntries(v,type,key,quantity));return {success:true}
      }}/>}
      {mode==='bag'&&<UnifiedBagScreen inventory={inventory} team={[player]} onClose={()=>setMode('shop')} addLog={setLog}
        onUseStatBoostItem={async(id,key)=>{
          const result=prepareStatBoostItemUse(player,STAT_BOOST_ITEMS[key])
          if(!result.success||getInventoryItemQuantity(inventory,'statBoost',key)<=0)return false
          setPlayer(simulateMonsterExpGain({...player,statBoosts:result.statBoosts,statGemUses:result.statGemUses},0).updatedMon)
          setInventory(v=>consumeInventoryItem(v,'statBoost',key));return true
        }} />}
      {mode==='battle'&&<BattleScene playerMon={player} enemyMon={enemy} playerTeam={[player]} enemyTeam={[enemy]} activeEnemyId={enemy.id} turn="player" battlePhase="active" battleKind="wild" playerGold={gold} logs={[log]} playerInventory={inventory}
        onMove={async key=>{const damage=calculateBattleDamage(player,enemy,MOVES[key],{randomFactor:1}).damage;setEnemy(m=>({...m,currentHp:Math.max(0,m.currentHp-damage)}));setAttacks(n=>n+1);setLog(`${player.name} 使用${MOVES[key].name}，造成 ${damage} 伤害。`)}}
        onUseBattleItem={async()=>{if(hasUsedDynamax([player]))return false;setPlayer(activateDynamax(player));setInventory(v=>consumeInventoryItem(v,'battleItem','dynamax_candy'));setLog('极巨化完成，可以选择招式！');return{success:true}}}
        onSwitch={()=>false} onRun={()=>false} onSurrender={()=>false} onNavigate={()=>{}} onUseItem={()=>false} onUsePotion={()=>false} addLog={setLog}/>}
      {(mode==='bicycle'||mode==='sports_car')&&<VehicleGallery vehicle={mode}/>}
      {mode==='league'&&<TimberLeagueConfirmModal leagueState={null} playerTeam={Array(6).fill(80)} busy={false} onCancel={()=>setMode('shop')} onConfirm={()=>setMode('shop')}/>}
      {mode==='breeder'&&<PokemonBreederPreview/>}
    </div>
  </main>
}
