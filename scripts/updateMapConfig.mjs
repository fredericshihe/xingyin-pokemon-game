import fs from 'fs';

const fileContent = `// 地图配置 - 难度、推荐等级、宝可梦分布

export const MAP_CONFIG = {
  ForestMap: {
    displayName: '迷雾森林',
    description: '充满生机与神秘的森林，隐藏着各种宝可梦。',
    difficulty: 1,
    recommendedLevel: 5,
    minLevel: 3,
    maxLevel: 8,
    wildPokemon: [
      { id: 13, weight: 30 }, // 伊布 (普通)
      { id: 14, weight: 20 }, // 可达鸭 (水)
      { id: 39, weight: 20 }, // 大葱鸭 (普通/飞行)
      { id: 23, weight: 15 }, // 飞天螳螂 (虫/飞行)
      { id: 30, weight: 15 }, // 霸王花 (草/毒)
    ],
    encounterRate: 0.15, // 普通草地遇敌率
    tallGrassRate: 0.30, // 高草丛遇敌率
  }
};

export function getMapConfig(mapName) {
  return MAP_CONFIG[mapName] || MAP_CONFIG.ForestMap;
}

export function getRandomWildPokemon(mapName) {
  const config = getMapConfig(mapName);
  const totalWeight = config.wildPokemon.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const pokemon of config.wildPokemon) {
    random -= pokemon.weight;
    if (random <= 0) {
      return pokemon.id;
    }
  }
  return config.wildPokemon[0].id;
}

export function getRandomWildLevel(mapName) {
  const config = getMapConfig(mapName);
  return Math.floor(Math.random() * (config.maxLevel - config.minLevel + 1)) + config.minLevel;
}
`;

fs.writeFileSync('src/data/maps/mapConfig.js', fileContent);
console.log('Updated mapConfig.js');
