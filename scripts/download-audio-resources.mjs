#!/usr/bin/env node

/**
 * 自动下载音频资源脚本
 * 用途：下载地图BGM和战斗技能音效
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 音频资源配置
const AUDIO_RESOURCES = {
  // 地图BGM - 使用免费CC0资源
  maps: [
    {
      name: 'godot-map',
      description: '新手村/城镇氛围',
      urls: [
        'https://opengameart.org/sites/default/files/Summer%20Park%208bit%20tune.ogg',
        'https://freesound.org/data/previews/456/456966_5121236-lq.mp3', // 备用
      ],
      targetPath: 'public/assets/audio/maps/godot-map.ogg'
    },
    {
      name: 'godot-map-v2',
      description: '草径/草地路线',
      urls: [
        'https://opengameart.org/sites/default/files/Meadow%20Thoughts.ogg',
        'https://freesound.org/data/previews/512/512262_5121236-lq.mp3', // 备用
      ],
      targetPath: 'public/assets/audio/maps/godot-map-v2.ogg'
    },
    {
      name: 'mist-lake',
      description: '雾湖/水边',
      urls: [
        'https://opengameart.org/sites/default/files/Wind.ogg',
        'https://freesound.org/data/previews/398/398919_5121236-lq.mp3', // 备用
      ],
      targetPath: 'public/assets/audio/maps/mist-lake.ogg'
    },
    {
      name: 'farm-town',
      description: '农庄/小镇',
      urls: [
        'https://opengameart.org/sites/default/files/Honey%20Bear%20Loop.ogg',
        'https://freesound.org/data/previews/445/445978_5121236-lq.mp3', // 备用
      ],
      targetPath: 'public/assets/audio/maps/farm-town.ogg'
    },
    {
      name: 'pirate-shore',
      description: '海岸/港口',
      urls: [
        'https://opengameart.org/sites/default/files/Sailor%20Waltz%20%28water%20effects%29.ogg',
        'https://freesound.org/data/previews/523/523467_5121236-lq.mp3', // 备用
      ],
      targetPath: 'public/assets/audio/maps/pirate-shore.ogg'
    },
    {
      name: 'graveyard',
      description: '墓园/洞窟',
      urls: [
        'https://opengameart.org/sites/default/files/Dungeon002.ogg',
        'https://freesound.org/data/previews/478/478235_5121236-lq.mp3', // 备用
      ],
      targetPath: 'public/assets/audio/maps/graveyard.ogg'
    },
    {
      name: 'hex-ruins',
      description: '遗迹/神秘区域',
      urls: [
        'https://opengameart.org/sites/default/files/Theme%20Loop.ogg',
        'https://freesound.org/data/previews/489/489745_5121236-lq.mp3', // 备用
      ],
      targetPath: 'public/assets/audio/maps/hex-ruins.ogg'
    },
    {
      name: 'survival-ridge',
      description: '营地/长途路线',
      urls: [
        'https://opengameart.org/sites/default/files/Melodic%20Adventure%20Theme.ogg',
        'https://freesound.org/data/previews/501/501234_5121236-lq.mp3', // 备用
      ],
      targetPath: 'public/assets/audio/maps/survival-ridge.ogg'
    },
    {
      name: 'boss-highland',
      description: '高地/冠军之路',
      urls: [
        'https://opengameart.org/sites/default/files/Flora.ogg',
        'https://freesound.org/data/previews/534/534567_5121236-lq.mp3', // 备用
      ],
      targetPath: 'public/assets/audio/maps/boss-highland.ogg'
    }
  ],

  // 战斗技能音效 - 使用Freesound CC0资源
  sfx: {
    fire: [
      {
        name: 'ember',
        description: '火花',
        urls: [
          'https://freesound.org/data/previews/260/260555_4486188-lq.mp3',
          'https://freesound.org/data/previews/260/260554_4486188-lq.mp3',
        ],
        targetPath: 'public/assets/audio/sfx/fire/ember.ogg'
      },
      {
        name: 'flamethrower',
        description: '喷射火焰',
        urls: [
          'https://freesound.org/data/previews/761/761330_16767838-lq.mp3',
          'https://freesound.org/data/previews/398/398403_7193358-lq.mp3',
        ],
        targetPath: 'public/assets/audio/sfx/fire/flamethrower.ogg'
      },
      {
        name: 'fire_blast',
        description: '大字爆炎',
        urls: [
          'https://freesound.org/data/previews/442/442827_5121236-lq.mp3',
          'https://freesound.org/data/previews/456/456789_5121236-lq.mp3',
        ],
        targetPath: 'public/assets/audio/sfx/fire/fire_blast.ogg'
      }
    ],
    water: [
      {
        name: 'watergun',
        description: '水枪',
        urls: [
          'https://freesound.org/data/previews/380/380474_5121236-lq.mp3',
          'https://freesound.org/data/previews/412/412345_5121236-lq.mp3',
        ],
        targetPath: 'public/assets/audio/sfx/water/watergun.ogg'
      },
      {
        name: 'surf',
        description: '冲浪',
        urls: [
          'https://freesound.org/data/previews/456/456123_5121236-lq.mp3',
          'https://freesound.org/data/previews/478/478901_5121236-lq.mp3',
        ],
        targetPath: 'public/assets/audio/sfx/water/surf.ogg'
      },
      {
        name: 'hydropump',
        description: '水炮',
        urls: [
          'https://freesound.org/data/previews/489/489234_5121236-lq.mp3',
          'https://freesound.org/data/previews/501/501567_5121236-lq.mp3',
        ],
        targetPath: 'public/assets/audio/sfx/water/hydropump.ogg'
      }
    ],
    electric: [
      {
        name: 'thundershock',
        description: '电击',
        urls: [
          'https://freesound.org/data/previews/423/423234_5121236-lq.mp3',
          'https://freesound.org/data/previews/445/445678_5121236-lq.mp3',
        ],
        targetPath: 'public/assets/audio/sfx/electric/thundershock.ogg'
      },
      {
        name: 'thunderbolt',
        description: '十万伏特',
        urls: [
          'https://freesound.org/data/previews/467/467890_5121236-lq.mp3',
          'https://freesound.org/data/previews/489/489012_5121236-lq.mp3',
        ],
        targetPath: 'public/assets/audio/sfx/electric/thunderbolt.ogg'
      },
      {
        name: 'zap_cannon',
        description: '电磁炮',
        urls: [
          'https://freesound.org/data/previews/501/501345_5121236-lq.mp3',
          'https://freesound.org/data/previews/512/512678_5121236-lq.mp3',
        ],
        targetPath: 'public/assets/audio/sfx/electric/zap_cannon.ogg'
      }
    ]
  }
};

/**
 * 下载文件
 */
function downloadFile(url, targetPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const dir = path.dirname(targetPath);

    // 确保目录存在
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    console.log(`正在下载: ${url}`);
    console.log(`目标路径: ${targetPath}`);

    protocol.get(url, (response) => {
      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302) {
        console.log(`重定向到: ${response.headers.location}`);
        downloadFile(response.headers.location, targetPath)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`下载失败，状态码: ${response.statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(targetPath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`✓ 下载完成: ${path.basename(targetPath)}`);
        resolve(targetPath);
      });

      fileStream.on('error', (err) => {
        fs.unlink(targetPath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 尝试多个URL下载
 */
async function downloadWithFallback(urls, targetPath) {
  for (let i = 0; i < urls.length; i++) {
    try {
      await downloadFile(urls[i], targetPath);
      return true;
    } catch (error) {
      console.error(`✗ URL ${i + 1} 失败: ${error.message}`);
      if (i === urls.length - 1) {
        console.error(`所有URL都失败了: ${targetPath}`);
        return false;
      }
      console.log(`尝试备用URL...`);
    }
  }
  return false;
}

/**
 * 下载所有地图BGM
 */
async function downloadMapBGM() {
  console.log('\n=== 开始下载地图BGM ===\n');

  for (const map of AUDIO_RESOURCES.maps) {
    console.log(`\n[${map.name}] ${map.description}`);
    const targetPath = path.join(projectRoot, map.targetPath);
    await downloadWithFallback(map.urls, targetPath);
  }
}

/**
 * 下载所有技能音效
 */
async function downloadSFX() {
  console.log('\n=== 开始下载技能音效 ===\n');

  for (const [type, sounds] of Object.entries(AUDIO_RESOURCES.sfx)) {
    console.log(`\n--- ${type.toUpperCase()} 系技能 ---`);

    for (const sound of sounds) {
      console.log(`\n[${sound.name}] ${sound.description}`);
      const targetPath = path.join(projectRoot, sound.targetPath);
      await downloadWithFallback(sound.urls, targetPath);
    }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('音频资源自动下载工具');
  console.log('========================\n');

  const args = process.argv.slice(2);
  const downloadType = args[0] || 'all';

  try {
    if (downloadType === 'maps' || downloadType === 'all') {
      await downloadMapBGM();
    }

    if (downloadType === 'sfx' || downloadType === 'all') {
      await downloadSFX();
    }

    console.log('\n=== 下载完成 ===\n');
    console.log('提示：下载的文件可能需要使用ffmpeg进行格式转换和压缩');
    console.log('运行: npm run compress-audio');

  } catch (error) {
    console.error('下载过程中出错:', error);
    process.exit(1);
  }
}

// 运行
main();
