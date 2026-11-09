import React, { useState } from 'react'
import { TeamScreen } from '../components/Game/DeferredGamePanels'
import { MonsterAcquisitionDecisionModal } from '../components/Game/OriginalGame'
import { MONSTERS } from '../utils/gameData'
import { simulateMonsterExpGain } from '../utils/pokemonProgress'
import { preparePokemonRelease } from '../utils/pokemonRelease'

const partner = (dexNo, id, level) => {
  const base = MONSTERS.find((mon) => mon.dexNo === dexNo)
  return simulateMonsterExpGain({ ...base, id, baseId: base.id, level, currentExp: 0 }, 0).updatedMon
}
const createPreview = () => ({
  playerGold: 500,
  playerTeam: [partner(129,'preview-1',10),partner(25,'preview-2',50),partner(149,'preview-3',80)],
  storageBox: [partner(151,'preview-4',100),partner(16,'preview-5',30)],
  activePlayerId: 'preview-1', view: 'team',
})

export default function PokemonReleasePreview() {
  const [snapshot,setSnapshot] = useState(createPreview)
  const [battle,setBattle] = useState(false)
  const [fail,setFail] = useState(false)
  const [notice,setNotice] = useState('本地预览，不写入账号存档。')
  const release = async (id,from,expectedGold) => {
    const result = preparePokemonRelease({ ...snapshot, activeEnemyId: battle ? 'preview-enemy' : null },id,from,expectedGold)
    if (!result.success || fail) { setNotice(fail ? '同步失败，宝可梦和金币保持原样。' : result.message); return false }
    setSnapshot({ ...result.snapshot,playerGold:snapshot.playerGold+result.quote.gold })
    setNotice(`已放生 ${result.quote.name}，获得 ${result.quote.gold} 金币。`)
    return true
  }
  return <div style={{height:'100%',display:'flex',flexDirection:'column'}}>
    <div style={{padding:'8px 16px',display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
      <b>金币 {snapshot.playerGold}</b>
      <label><input type="checkbox" checked={battle} onChange={e=>setBattle(e.target.checked)} />模拟战斗中</label>
      <label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)} />模拟同步失败</label>
      <button onClick={()=>setSnapshot({...snapshot,pendingMonsterAcquisition:{source:'capture',monster:partner(144,'preview-pending',80)}})}>待安置示例</button>
      <button onClick={()=>{setSnapshot(createPreview());setBattle(false);setFail(false)}}>重置示例</button>
      <span role="status">{notice}</span>
    </div>
    <div style={{flex:1,minHeight:0,position:'relative'}}>
      <TeamScreen team={snapshot.playerTeam} storageBox={snapshot.storageBox} activeId={snapshot.activePlayerId}
        playerGold={snapshot.playerGold} onBack={()=>{}}
        onRelease={release} onReleaseStorage={(id,gold)=>release(id,'storage',gold)}
        releaseBlockedReason={battle ? '战斗中不能放生' : ''} />
      {snapshot.pendingMonsterAcquisition && !battle && <MonsterAcquisitionDecisionModal
        pending={snapshot.pendingMonsterAcquisition} party={snapshot.playerTeam} storageBox={snapshot.storageBox}
        onReleasePending={gold=>release(snapshot.pendingMonsterAcquisition.monster.id,'pending',gold)} />}
    </div>
  </div>
}
