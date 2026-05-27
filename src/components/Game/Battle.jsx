import React, { useState, useEffect } from 'react'
import { MOVES } from '../../utils/gameData'
import {
  calculateDamage,
  applyMoveEffect,
  determineOrder,
  aiSelectMove,
  checkBattleEnd,
  attemptCatch
} from '../../utils/battleLogic'
import { getTypeEffectivenessMessage } from '../../utils/battleDamage'
import { getCatchAttemptWarning, getPlayerAverageLevel } from '../../utils/gameBalance'
import { applyImageFallback } from '../../utils/localAssetPreloader'
import { pokemonArtUrl, POKEMON_PLACEHOLDER_URL, extractPokedexIdFromArtUrl, toPngFallbackUrl } from '../../utils/mediaAssetUrl'

const POKEMON_LOCAL_PLACEHOLDER = POKEMON_PLACEHOLDER_URL

const extractPokedexIdFromSpriteUrl = (url) => (
  extractPokedexIdFromArtUrl(url)
)

const getLocalPokemonSprite = (monster, preferredUrl) => {
  const pokedexId = Number(monster?.pokedexId || monster?.dexNo) || extractPokedexIdFromSpriteUrl(preferredUrl) || extractPokedexIdFromSpriteUrl(monster?.sprite)
  return pokedexId ? pokemonArtUrl(pokedexId) : (preferredUrl || POKEMON_LOCAL_PLACEHOLDER)
}

const handlePokemonImageError = (event) => {
  const image = event?.currentTarget || event?.target
  const currentSrc = image?.src || ''
  if (currentSrc.includes('.webp')) {
    applyImageFallback(event, toPngFallbackUrl(currentSrc))
    return
  }
  applyImageFallback(event, POKEMON_LOCAL_PLACEHOLDER)
}

const normalizeBattleMonsterAsset = (monster) => {
  if (!monster) return monster
  const sprite = getLocalPokemonSprite(monster, monster.sprite)
  return {
    ...monster,
    sprite,
    backSprite: getLocalPokemonSprite(monster, monster.backSprite || sprite),
    fallbackSprite: POKEMON_LOCAL_PLACEHOLDER
  }
}

const handlePokemonImageError = (event) => {
  applyImageFallback(event, POKEMON_LOCAL_PLACEHOLDER)
}

const getHpBarColorClass = (current, max) => {
  const safeMax = Number(max) > 0 ? Number(max) : 1
  const percent = Math.max(0, Math.min(100, (Number(current) || 0) / safeMax * 100))
  if (percent <= 20) return 'bg-red-500'
  if (percent <= 50) return 'bg-yellow-500'
  return 'bg-green-500'
}

export default function Battle({
  playerTeam,
  enemyMon,
  onBattleEnd,
  onEscape,
  isWild = true,
  inventory = {}
}) {
  const [playerMon, setPlayerMon] = useState(() => normalizeBattleMonsterAsset(playerTeam[0]))
  const [enemy, setEnemy] = useState(() => {
    const normalizedEnemy = normalizeBattleMonsterAsset(enemyMon)
    return {...normalizedEnemy, hp: enemyMon.maxHp, mp: enemyMon.maxMp}
  })
  const [battleLog, setBattleLog] = useState([])
  const [isPlayerTurn, setIsPlayerTurn] = useState(true)
  const [battlePhase, setBattlePhase] = useState('select') // select, animating, result
  const [showCatchMenu, setShowCatchMenu] = useState(false)

  useEffect(() => {
    addLog(`野生的 ${enemy.name} 出现了！`)
  }, [])

  const addLog = (message) => {
    setBattleLog(prev => [...prev, message])
  }

  const handleAttack = async (moveId) => {
    const move = MOVES[moveId]

    // 检查MP
    if (playerMon.mp < move.cost) {
      addLog('技能值不足！')
      return
    }

    setBattlePhase('animating')

    // 更新技能值
    const updatedPlayer = { ...playerMon, mp: playerMon.mp - move.cost }
    setPlayerMon(updatedPlayer)

    // AI选择技能
    const enemyMoveId = aiSelectMove(enemy, updatedPlayer, {
      battleKind: isWild ? 'wild' : 'trainer'
    })
    const enemyMove = MOVES[enemyMoveId]

    // 判断行动顺序
    const order = determineOrder(updatedPlayer, enemy, move, enemyMove)

    if (order === 'player') {
      await executePlayerMove(updatedPlayer, enemy, move)
      if (enemy.hp > 0) {
        await executeEnemyMove(updatedPlayer, enemy, enemyMove)
      }
    } else {
      await executeEnemyMove(updatedPlayer, enemy, enemyMove)
      if (updatedPlayer.hp > 0) {
        await executePlayerMove(updatedPlayer, enemy, move)
      }
    }

    // 检查战斗结果
    const result = checkBattleEnd(updatedPlayer, enemy)
    if (result) {
      handleBattleEnd(result)
    } else {
      setBattlePhase('select')
    }
  }

  const executePlayerMove = async (player, target, move) => {
    return new Promise(resolve => {
      setTimeout(() => {
        addLog(`${player.name} 使用了 ${move.name}！`)

        const damage = calculateDamage(player, target, move)
        const result = applyMoveEffect(player, target, move, damage)

        if (result.missed) {
          addLog('攻击没有命中！')
        } else {
          const effectivenessMessage = move.power > 0 ? getTypeEffectivenessMessage({
            moveType: move.type,
            defender: target,
            defenderName: target.name,
            effectiveness: result.effectiveness
          }) : ''
          if (effectivenessMessage) addLog(effectivenessMessage)

          if (result.damage > 0) {
            const newHp = Math.max(0, target.hp - result.damage)
            setEnemy(prev => ({ ...prev, hp: newHp }))

            addLog(`${target.name} 受到了伤害！`)
          }

          if (result.heal > 0) {
            const newHp = Math.min(player.maxHp, player.hp + result.heal)
            setPlayerMon(prev => ({ ...prev, hp: newHp }))
            addLog(`${player.name} 恢复了体力！`)
          }
        }

        resolve()
      }, 500)
    })
  }

  const executeEnemyMove = async (player, target, move) => {
    return new Promise(resolve => {
      setTimeout(() => {
        // 更新敌方技能值
        const updatedEnemy = { ...target, mp: target.mp - move.cost }
        setEnemy(updatedEnemy)

        addLog(`${target.name} 使用了 ${move.name}！`)

        const damage = calculateDamage(target, player, move)
        const result = applyMoveEffect(target, player, move, damage)

        if (result.missed) {
          addLog('攻击没有命中！')
        } else {
          const effectivenessMessage = move.power > 0 ? getTypeEffectivenessMessage({
            moveType: move.type,
            defender: player,
            defenderName: player.name,
            effectiveness: result.effectiveness
          }) : ''
          if (effectivenessMessage) addLog(effectivenessMessage)

          if (result.damage > 0) {
            const newHp = Math.max(0, player.hp - result.damage)
            setPlayerMon(prev => ({ ...prev, hp: newHp }))

            addLog(`${player.name} 受到了伤害！`)
          }

          if (result.heal > 0) {
            const newHp = Math.min(target.maxHp, target.hp + result.heal)
            setEnemy(prev => ({ ...prev, hp: newHp }))
            addLog(`${target.name} 恢复了体力！`)
          }
        }

        resolve()
      }, 500)
    })
  }

  const handleBattleEnd = (result) => {
    setBattlePhase('result')

    if (result === 'win') {
      addLog(`战斗胜利！`)
      addLog('战斗奖励已结算。')

      setTimeout(() => {
        onBattleEnd({
          result: 'win',
          playerMon: { ...playerMon }
        })
      }, 2000)
    } else {
      addLog(`战斗失败...`)
      setTimeout(() => {
        onBattleEnd({ result: 'lose' })
      }, 2000)
    }
  }

  const handleCatch = (ballType) => {
    const ball = inventory[ballType]
    const ballCount = Number(ball?.count ?? ball?.quantity ?? ball ?? 0)
    if (!ball || ballCount <= 0) {
      addLog('没有这种精灵球了！')
      return
    }

    if ((Number(enemy.hp) || 0) <= 0) {
      addLog('已经失去战斗能力的宝可梦无法捕捉。')
      return
    }

    setBattlePhase('animating')
    setShowCatchMenu(false)

    addLog(`使用了 ${ball.name}！`)
    const catchWarning = getCatchAttemptWarning(
      {
        ...enemy,
        currentHp: enemy.currentHp ?? enemy.hp,
        currentMp: enemy.currentMp ?? enemy.mp
      },
      getPlayerAverageLevel(playerTeam)
    )
    if (catchWarning) addLog(catchWarning)

    setTimeout(() => {
      const success = attemptCatch(enemy, ball.catchRateMultiplier, getPlayerAverageLevel(playerTeam))

      if (success) {
        addLog(`成功捕获了 ${enemy.name}！`)
        setTimeout(() => {
          onBattleEnd({
            result: 'catch',
            caughtMon: { ...enemy },
            usedBall: ballType
          })
        }, 1500)
      } else {
        addLog(`${enemy.name} 挣脱了！`)

        // 敌人反击
        const enemyMoveId = aiSelectMove(enemy, playerMon, {
          battleKind: isWild ? 'wild' : 'trainer'
        })
        const enemyMove = MOVES[enemyMoveId]
        executeEnemyMove(playerMon, enemy, enemyMove).then(() => {
          const result = checkBattleEnd(playerMon, enemy)
          if (result) {
            handleBattleEnd(result)
          } else {
            setBattlePhase('select')
          }
        })
      }
    }, 1000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-400 to-blue-500 p-4">
      <div className="max-w-6xl mx-auto">
        {/* 战斗场景 */}
        <div className="bg-white rounded-lg shadow-2xl p-6 mb-4">
          <div className="grid grid-cols-2 gap-8">
            {/* 敌方宝可梦 */}
            <div className="text-center">
              <div className="bg-red-100 rounded-lg p-4 mb-4">
                <h3 className="text-xl font-bold mb-2">{enemy.name}</h3>
                <div className="mb-2">
                  <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div
                      className={`${getHpBarColorClass(enemy.hp, enemy.maxHp)} h-full transition-all duration-500`}
                      style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }}
                    />
                  </div>
                  <p className="text-sm mt-1">HP: {enemy.hp}/{enemy.maxHp}</p>
                </div>
                <div>
                  <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full transition-all duration-500"
                      style={{ width: `${(enemy.mp / enemy.maxMp) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs mt-1">MP: {enemy.mp}/{enemy.maxMp}</p>
                </div>
              </div>
              <img
                src={enemy.sprite}
                onError={handlePokemonImageError}
                alt={enemy.name}
                className="w-48 h-48 mx-auto"
              />
            </div>

            {/* 我方宝可梦 */}
            <div className="text-center">
              <img
                src={playerMon.backSprite}
                onError={handlePokemonImageError}
                alt={playerMon.name}
                className="w-48 h-48 mx-auto mb-4"
              />
              <div className="bg-green-100 rounded-lg p-4">
                <h3 className="text-xl font-bold mb-2">{playerMon.name}</h3>
                <div className="mb-2">
                  <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div
                      className={`${getHpBarColorClass(playerMon.hp, playerMon.maxHp)} h-full transition-all duration-500`}
                      style={{ width: `${(playerMon.hp / playerMon.maxHp) * 100}%` }}
                    />
                  </div>
                  <p className="text-sm mt-1">HP: {playerMon.hp}/{playerMon.maxHp}</p>
                </div>
                <div>
                  <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full transition-all duration-500"
                      style={{ width: `${(playerMon.mp / playerMon.maxMp) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs mt-1">MP: {playerMon.mp}/{playerMon.maxMp}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 战斗日志 */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-4 h-32 overflow-y-auto">
          {battleLog.map((log, index) => (
            <p key={index} className="text-sm mb-1">{log}</p>
          ))}
        </div>

        {/* 操作菜单 */}
        {battlePhase === 'select' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            {!showCatchMenu ? (
              <div className="grid grid-cols-2 gap-4">
                {/* 技能列表 */}
                <div>
                  <h4 className="font-bold mb-3">选择技能</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {playerMon.moves.map(moveId => {
                      const move = MOVES[moveId]
                      const canUse = playerMon.mp >= move.cost
                      return (
                        <button
                          key={moveId}
                          onClick={() => canUse && handleAttack(moveId)}
                          disabled={!canUse}
                          className={`p-3 rounded-lg text-left transition-colors ${
                            canUse
                              ? 'bg-blue-500 hover:bg-blue-600 text-white'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          <div className="font-bold">{move.name}</div>
                          <div className="text-xs">MP: {move.cost}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 其他操作 */}
                <div>
                  <h4 className="font-bold mb-3">其他操作</h4>
                  <div className="space-y-2">
                    {isWild && (
                      <button
                        onClick={() => setShowCatchMenu(true)}
                        className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                      >
                        捕捉
                      </button>
                    )}
                    <button
                      onClick={onEscape}
                      className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                      逃跑
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h4 className="font-bold mb-3">选择精灵球</h4>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {Object.entries(inventory).filter(([key]) => key.startsWith('pokeball_')).map(([key, ball]) => {
                    const ballCount = Number(ball?.count ?? ball?.quantity ?? ball ?? 0)
                    return (
                      <button
                        key={key}
                        onClick={() => handleCatch(key)}
                        disabled={ballCount <= 0}
                        className={`p-4 rounded-lg ${
                          ballCount > 0
                            ? 'bg-purple-500 hover:bg-purple-600 text-white'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        <img src={ball.sprite} alt={ball.name} className="w-12 h-12 mx-auto mb-2" />
                        <div className="font-bold">{ball.name}</div>
                        <div className="text-sm">x{ballCount}</div>
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => setShowCatchMenu(false)}
                  className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg"
                >
                  返回
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
