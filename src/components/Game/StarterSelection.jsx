import React, { useState } from 'react'
import { MONSTERS } from '../../utils/gameData'

const getHighResPokemonSprite = (starter) => {
  return starter?.sprite || '/assets/pokemon/placeholder.svg'
}

const handlePokemonImageError = (event) => {
  const image = event.currentTarget
  if (image.dataset.fallbackApplied === 'true') return
  image.dataset.fallbackApplied = 'true'
  image.src = '/assets/pokemon/placeholder.svg'
}

export default function StarterSelection({ onSelect }) {
  const [selectedStarter, setSelectedStarter] = useState(null)

  // 初始宝可梦：妙蛙种子、小火龙、杰尼龟
  const starters = [
    MONSTERS.find(m => m.id === 1), // 妙蛙种子
    MONSTERS.find(m => m.id === 2), // 小火龙
    MONSTERS.find(m => m.id === 3)  // 杰尼龟
  ]

  const handleSelect = (starter) => {
    setSelectedStarter(starter)
  }

  const handleConfirm = () => {
    if (selectedStarter) {
      // 创建宝可梦实例
      const pokemon = {
        ...selectedStarter,
        hp: selectedStarter.maxHp,
        mp: selectedStarter.maxMp,
        level: 5,
        exp: 0
      }
      onSelect(pokemon)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-400 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-4xl w-full">
        <h1 className="text-4xl font-bold text-center mb-2 text-gray-800">
          欢迎来到宝可梦世界！
        </h1>
        <p className="text-center text-gray-600 mb-8">
          选择你的初始宝可梦开始冒险
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {starters.map((starter) => (
            <div
              key={starter.id}
              onClick={() => handleSelect(starter)}
              className={`cursor-pointer border-4 rounded-lg p-6 transition-all transform hover:scale-105 ${
                selectedStarter?.id === starter.id
                  ? 'border-blue-500 bg-blue-50 shadow-lg'
                  : 'border-gray-300 hover:border-blue-300'
              }`}
            >
              <img
                src={getHighResPokemonSprite(starter)}
                onError={handlePokemonImageError}
                alt={starter.name}
                className="w-32 h-32 mx-auto mb-4"
              />
              <h3 className="text-2xl font-bold text-center mb-2">
                {starter.name}
              </h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p className="text-center">
                  <span className="font-semibold">属性：</span>
                  {starter.type}
                  {starter.type2 && ` / ${starter.type2}`}
                </p>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="text-center">
                    <p className="text-xs text-gray-500">HP</p>
                    <p className="font-bold">{starter.maxHp}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">MP</p>
                    <p className="font-bold">{starter.maxMp}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">攻击</p>
                    <p className="font-bold">{starter.atk}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">防御</p>
                    <p className="font-bold">{starter.def}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {selectedStarter && (
          <div className="text-center">
            <button
              onClick={handleConfirm}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg text-xl transition-colors shadow-lg"
            >
              确认选择 {selectedStarter.name}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
