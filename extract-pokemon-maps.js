import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 宝可梦水晶版瓦片ID映射到我们的游戏瓦片类型
// 基于 pokecrystal 项目的瓦片定义
const TILE_MAPPING = {
  // 草地和地面
  0x01: 0,  // 普通草地
  0x02: 0,  // 草地变体
  0x03: 0,  // 草地
  0x07: 0,  // 可行走地面
  0x08: 8,  // 高草丛（遇敌率高）
  0x0a: 0,  // 换行符（当作草地）
  0x0b: 8,  // 高草丛
  0x1a: 8,  // 高草丛变体
  0x31: 0,  // 数字1（路径）

  // 树木和障碍物
  0x42: 1,  // 树木 'B'
  0x4d: 1,  // 树木 'M'
  0x4e: 1,  // 树木 'N'
  0x51: 1,  // 树木 'Q'
  0x52: 1,  // 树木 'R'
  0x50: 1,  // 树木 'P'
  0x4f: 1,  // 树木 'O'
  0x74: 1,  // 树木 't'
  0x6e: 1,  // 树木 'n'
  0x6d: 1,  // 树木 'm'
  0x61: 1,  // 树木 'a'
  0x62: 1,  // 树木 'b'
  0x63: 1,  // 树木 'c'
  0x6f: 1,  // 树木 'o'

  // 特殊地形
  0x2f: 12, // 沙地 '/'
};

// 默认映射：未知瓦片当作草地
function mapTile(originalTile) {
  return TILE_MAPPING[originalTile] !== undefined ? TILE_MAPPING[originalTile] : 0;
}

// 解析 .blk 文件
function parseBlkFile(filePath) {
  const data = fs.readFileSync(filePath);
  const tiles = [];

  for (let i = 0; i < data.length; i++) {
    tiles.push(data[i]);
  }

  return tiles;
}

// 将一维数组转换为二维地图
function convertTo2DMap(tiles, width) {
  const height = Math.ceil(tiles.length / width);
  const map = [];

  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (index < tiles.length) {
        row.push(mapTile(tiles[index]));
      } else {
        row.push(0); // 填充
      }
    }
    map.push(row);
  }

  return map;
}

// 分析地图尺寸（尝试常见的宽度）
function detectMapDimensions(tiles) {
  const commonWidths = [10, 12, 15, 18, 20, 30];

  for (const width of commonWidths) {
    if (tiles.length % width === 0) {
      return { width, height: tiles.length / width };
    }
  }

  // 如果没有完美匹配，尝试最接近正方形的
  const sqrt = Math.sqrt(tiles.length);
  const width = Math.ceil(sqrt);
  return { width, height: Math.ceil(tiles.length / width) };
}

// 处理单个地图文件
function processMap(inputPath, outputPath, mapName) {
  console.log(`\n处理地图: ${mapName}`);

  const tiles = parseBlkFile(inputPath);
  console.log(`  总瓦片数: ${tiles.length}`);

  const { width, height } = detectMapDimensions(tiles);
  console.log(`  检测到尺寸: ${width}x${height}`);

  const map2D = convertTo2DMap(tiles, width);

  // 统计瓦片类型
  const tileStats = {};
  tiles.forEach(tile => {
    const hex = '0x' + tile.toString(16).padStart(2, '0');
    tileStats[hex] = (tileStats[hex] || 0) + 1;
  });

  console.log('  瓦片统计:');
  Object.entries(tileStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([tile, count]) => {
      const char = parseInt(tile) >= 0x20 && parseInt(tile) <= 0x7e
        ? ` '${String.fromCharCode(parseInt(tile))}'`
        : '';
      console.log(`    ${tile}${char}: ${count}次`);
    });

  // 生成 JavaScript 文件
  const jsContent = `// ${mapName} - 从宝可梦水晶版提取
// 原始尺寸: ${width}x${height}
// 瓦片类型: 0=草地, 1=树木, 8=高草丛, 12=沙地

export const ${mapName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_MAP = ${JSON.stringify(map2D, null, 2)};

export const ${mapName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_INFO = {
  name: "${mapName}",
  width: ${width},
  height: ${height},
  startPosition: { x: ${Math.floor(width / 2)}, y: ${height - 2} },
  exitPosition: { x: ${Math.floor(width / 2)}, y: 1 }
};
`;

  fs.writeFileSync(outputPath, jsContent);
  console.log(`  ✓ 已保存到: ${outputPath}`);

  return map2D;
}

// 主程序
function main() {
  const extractedDir = path.join(__dirname, 'extracted_maps');
  const outputDir = path.join(__dirname, 'src', 'data', 'maps');

  // 创建输出目录
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('=== 宝可梦地图提取工具 ===');
  console.log(`输入目录: ${extractedDir}`);
  console.log(`输出目录: ${outputDir}`);

  // 处理所有地图
  const maps = [
    { input: 'Route1.blk', output: 'route1.js', name: 'Route1' },
    { input: 'Route2.blk', output: 'route2.js', name: 'Route2' },
    { input: 'Route3.blk', output: 'route3.js', name: 'Route3' },
    { input: 'Route4.blk', output: 'route4.js', name: 'Route4' },
    { input: 'Route32.blk', output: 'route32.js', name: 'Route32' },
    { input: 'Route33.blk', output: 'route33.js', name: 'Route33' },
    { input: 'DarkCave.blk', output: 'darkcave.js', name: 'DarkCave' },
    { input: 'IlexForest.blk', output: 'ilexforest.js', name: 'IlexForest' },
    { input: 'UnionCave1F.blk', output: 'unioncave.js', name: 'UnionCave' },
  ];

  const processedMaps = [];

  maps.forEach(({ input, output, name }) => {
    const inputPath = path.join(extractedDir, input);
    const outputPath = path.join(outputDir, output);

    if (fs.existsSync(inputPath)) {
      const map = processMap(inputPath, outputPath, name);
      processedMaps.push({ name, output, map });
    } else {
      console.log(`\n⚠ 跳过: ${input} (文件不存在)`);
    }
  });

  // 生成索引文件
  const indexContent = `// 宝可梦地图集合
${processedMaps.map(m => `import { ${m.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_MAP, ${m.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_INFO } from './${m.output.replace('.js', '')}';`).join('\n')}

export const POKEMON_MAPS = {
${processedMaps.map(m => `  ${m.name}: { map: ${m.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_MAP, info: ${m.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_INFO }`).join(',\n')}
};

export const MAP_LIST = [
${processedMaps.map(m => `  '${m.name}'`).join(',\n')}
];
`;

  fs.writeFileSync(path.join(outputDir, 'index.js'), indexContent);
  console.log(`\n✓ 已生成索引文件: ${path.join(outputDir, 'index.js')}`);
  console.log(`\n=== 完成！共处理 ${processedMaps.length} 个地图 ===`);
}

main();
