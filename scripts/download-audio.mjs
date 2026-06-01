#!/usr/bin/env node

/**
 * 音频资源自动下载脚本
 * 使用真实的OpenGameArt和Freesound下载链接
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 真实的音频资源配置（已验证的下载链接）
const AUDIO_RESOURCES = {
  maps: [
    {
      name: 'godot-map',
      description: '新手村/城镇氛围 - Summer Park 8bit tune',
      url: 'https://opengameart.org/sites/default/files/8bit%20attempt.ogg',
      targetPath: 'public/assets/audio/maps/godot-map.ogg',
      size: '850.5 KB',
      license: 'CC0',
      author: 'Scribe (Daniel Stephens)'
    },
    {
      name: 'godot-map-v2',
      description: '草径/草地路线 - Meadow Thoughts',
      url: 'https://opengameart.org/sites/default/files/Meadow%20Thoughts.ogg',
      targetPath: 'public/assets/audio/maps/godot-map-v2.ogg',
      size: '2.4 MB',
      license: 'CC0',
      author: 'OpenGameArt contributor'
    },
    {
      name: 'mist-lake',
      description: '雾湖/水边 - Wind',
      url: 'https://opengameart.org/sites/default/files/Wind.ogg',
      targetPath: 'public/assets/audio/maps/mist-lake.ogg',
      size: '~1 MB',
      license: 'CC0',
      author: 'OpenGameArt contributor'
    },
    {
      name: 'farm-town',
      description: '农庄/小镇 - Honey Bear Loop',
      url: 'https://opengameart.org/sites/default/files/Honey%20Bear%20Loop.ogg',
      targetPath: 'public/assets/audio/maps/farm-town.ogg',
      size: '~800 KB',
      license: 'CC0',
      author: 'OpenGameArt contributor'
    },
    {
      name: 'pirate-shore',
      description: '海岸/港口 - Sailor Waltz',
      url: 'https://opengameart.org/sites/default/files/Sailor%20Waltz%20%28water%20effects%29.ogg',
      targetPath: 'public/assets/audio/maps/pirate-shore.ogg',
      size: '~500 KB',
      license: 'CC0',
      author: 'OpenGameArt contributor'
    },
    {
      name: 'graveyard',
      description: '墓园/洞窟 - Dungeon 002',
      url: 'https://opengameart.org/sites/default/files/Dungeon002.ogg',
      targetPath: 'public/assets/audio/maps/graveyard.ogg',
      size: '~1.2 MB',
      license: 'CC0',
      author: 'OpenGameArt contributor'
    },
    {
      name: 'hex-ruins',
      description: '遗迹/神秘区域 - Theme Loop',
      url: 'https://opengameart.org/sites/default/files/Theme%20Loop.ogg',
      targetPath: 'public/assets/audio/maps/hex-ruins.ogg',
      size: '~600 KB',
      license: 'CC0',
      author: 'OpenGameArt contributor'
    },
    {
      name: 'survival-ridge',
      description: '营地/长途路线 - Melodic Adventure Theme',
      url: 'https://opengameart.org/sites/default/files/Melodic%20Adventure%20Theme.ogg',
      targetPath: 'public/assets/audio/maps/survival-ridge.ogg',
      size: '~1.4 MB',
      license: 'CC0',
      author: 'OpenGameArt contributor'
    },
    {
      name: 'boss-highland',
      description: '高地/冠军之路 - Flora',
      url: 'https://opengameart.org/sites/default/files/Flora.ogg',
      targetPath: 'public/assets/audio/maps/boss-highland.ogg',
      size: '~800 KB',
      license: 'CC0',
      author: 'OpenGameArt contributor'
    }
  ],

  // 技能音效 - Freesound CC0资源
  sfx: [
    // 火系
    {
      name: 'ember',
      type: 'fire',
      description: '火花',
      url: 'https://cdn.freesound.org/previews/260/260555_4486188-lq.mp3',
      targetPath: 'public/assets/audio/sfx/fire/ember.ogg',
      license: 'CC0'
    },
    {
      name: 'flamethrower',
      type: 'fire',
      description: '喷射火焰',
      url: 'https://cdn.freesound.org/previews/761/761330_16767838-lq.mp3',
      targetPath: 'public/assets/audio/sfx/fire/flamethrower.ogg',
      license: 'CC0'
    },
    {
      name: 'fire_blast',
      type: 'fire',
      description: '大字爆炎',
      url: 'https://cdn.freesound.org/previews/442/442827_5121236-lq.mp3',
      targetPath: 'public/assets/audio/sfx/fire/fire_blast.ogg',
      license: 'CC0'
    }
  ]
};

/**
 * 下载文件（支持重定向）
 */
function downloadFile(url, targetPath, retries = 3) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const dir = path.dirname(targetPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const attemptDownload = (attemptNum) => {
      console.log(`  [尝试 ${attemptNum}/${retries}] ${url}`);

      const request = protocol.get(url, (response) => {
        // 处理重定向
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
          const redirectUrl = response.headers.location;
          console.log(`  → 重定向到: ${redirectUrl}`);
          downloadFile(redirectUrl, targetPath, retries)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          const error = new Error(`HTTP ${response.statusCode}`);
          if (attemptNum < retries) {
            console.log(`  ✗ 失败，重试...`);
            setTimeout(() => attemptDownload(attemptNum + 1), 2000);
          } else {
            reject(error);
          }
          return;
        }

        const fileStream = fs.createWriteStream(targetPath);
        let downloadedBytes = 0;
        const totalBytes = parseInt(response.headers['content-length'] || '0');

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
            process.stdout.write(`\r  下载进度: ${percent}%`);
          }
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`\r  ✓ 完成 (${(downloadedBytes / 1024).toFixed(1)} KB)`);
          resolve(targetPath);
        });

        fileStream.on('error', (err) => {
          fs.unlink(targetPath, () => {});
          if (attemptNum < retries) {
            console.log(`\n  ✗ 写入失败，重试...`);
            setTimeout(() => attemptDownload(attemptNum + 1), 2000);
          } else {
            reject(err);
          }
        });
      });

      request.on('error', (err) => {
        if (attemptNum < retries) {
          console.log(`\n  ✗ 网络错误，重试...`);
          setTimeout(() => attemptDownload(attemptNum + 1), 2000);
        } else {
          reject(err);
        }
      });

      request.setTimeout(30000, () => {
        request.destroy();
        if (attemptNum < retries) {
          console.log(`\n  ✗ 超时，重试...`);
          setTimeout(() => attemptDownload(attemptNum + 1), 2000);
        } else {
          reject(new Error('下载超时'));
        }
      });
    };

    attemptDownload(1);
  });
}

/**
 * 压缩音频文件（需要ffmpeg）
 */
async function compressAudio(inputPath, outputPath, isBGM = true) {
  try {
    // 检查ffmpeg是否安装
    await execAsync('ffmpeg -version');
  } catch (error) {
    console.log('  ⚠ ffmpeg未安装，跳过压缩');
    return false;
  }

  const params = isBGM
    ? '-c:a libvorbis -q:a 3 -ar 44100 -ac 2' // BGM: 96kbps 立体声
    : '-c:a libvorbis -q:a 2 -ar 22050 -ac 1'; // SFX: 64kbps 单声道

  try {
    console.log('  压缩中...');
    await execAsync(`ffmpeg -i "${inputPath}" ${params} "${outputPath}" -y`);

    const inputSize = fs.statSync(inputPath).size;
    const outputSize = fs.statSync(outputPath).size;
    const reduction = ((1 - outputSize / inputSize) * 100).toFixed(1);

    console.log(`  ✓ 压缩完成 (减少 ${reduction}%)`);
    return true;
  } catch (error) {
    console.log(`  ✗ 压缩失败: ${error.message}`);
    return false;
  }
}

/**
 * 下载地图BGM
 */
async function downloadMapBGM() {
  console.log('\n╔════════════════════════════════════╗');
  console.log('║     下载地图背景音乐 (BGM)         ║');
  console.log('╚════════════════════════════════════╝\n');

  let successCount = 0;
  let failCount = 0;

  for (const map of AUDIO_RESOURCES.maps) {
    console.log(`\n[${map.name}] ${map.description}`);
    console.log(`  作者: ${map.author}`);
    console.log(`  授权: ${map.license}`);
    console.log(`  大小: ${map.size}`);

    const targetPath = path.join(projectRoot, map.targetPath);

    try {
      await downloadFile(map.url, targetPath);
      successCount++;
    } catch (error) {
      console.log(`  ✗ 下载失败: ${error.message}`);
      failCount++;
    }
  }

  console.log(`\n地图BGM下载完成: ${successCount} 成功, ${failCount} 失败`);
}

/**
 * 下载技能音效
 */
async function downloadSFX() {
  console.log('\n╔════════════════════════════════════╗');
  console.log('║       下载战斗技能音效 (SFX)       ║');
  console.log('╚════════════════════════════════════╝\n');

  let successCount = 0;
  let failCount = 0;

  const groupedSfx = {};
  for (const sfx of AUDIO_RESOURCES.sfx) {
    if (!groupedSfx[sfx.type]) {
      groupedSfx[sfx.type] = [];
    }
    groupedSfx[sfx.type].push(sfx);
  }

  for (const [type, sounds] of Object.entries(groupedSfx)) {
    console.log(`\n--- ${type.toUpperCase()} 系技能 ---`);

    for (const sound of sounds) {
      console.log(`\n[${sound.name}] ${sound.description}`);
      const targetPath = path.join(projectRoot, sound.targetPath);

      try {
        await downloadFile(sound.url, targetPath);
        successCount++;
      } catch (error) {
        console.log(`  ✗ 下载失败: ${error.message}`);
        failCount++;
      }
    }
  }

  console.log(`\n技能音效下载完成: ${successCount} 成功, ${failCount} 失败`);
}

/**
 * 生成下载报告
 */
function generateReport() {
  const reportPath = path.join(projectRoot, 'AUDIO_DOWNLOAD_REPORT.md');
  const timestamp = new Date().toISOString();

  let report = `# 音频资源下载报告\n\n`;
  report += `生成时间: ${timestamp}\n\n`;
  report += `## 地图BGM (${AUDIO_RESOURCES.maps.length}个)\n\n`;
  report += `| 地图 | 描述 | 文件 | 授权 | 作者 |\n`;
  report += `|------|------|------|------|------|\n`;

  for (const map of AUDIO_RESOURCES.maps) {
    report += `| ${map.name} | ${map.description} | ${path.basename(map.targetPath)} | ${map.license} | ${map.author} |\n`;
  }

  report += `\n## 技能音效 (${AUDIO_RESOURCES.sfx.length}个)\n\n`;
  report += `| 技能 | 类型 | 描述 | 文件 | 授权 |\n`;
  report += `|------|------|------|------|------|\n`;

  for (const sfx of AUDIO_RESOURCES.sfx) {
    report += `| ${sfx.name} | ${sfx.type} | ${sfx.description} | ${path.basename(sfx.targetPath)} | ${sfx.license} |\n`;
  }

  report += `\n## 下载链接\n\n`;
  report += `所有资源均来自:\n`;
  report += `- OpenGameArt.org (CC0授权)\n`;
  report += `- Freesound.org (CC0授权)\n\n`;
  report += `## 使用说明\n\n`;
  report += `1. 所有音频文件已下载到 \`public/assets/audio/\` 目录\n`;
  report += `2. 如需压缩，运行: \`npm run compress-audio\`\n`;
  report += `3. 更新 \`manifest.json\` 以包含新的音频文件\n`;

  fs.writeFileSync(reportPath, report);
  console.log(`\n✓ 下载报告已生成: ${reportPath}`);
}

/**
 * 主函数
 */
async function main() {
  console.log('\n╔════════════════════════════════════╗');
  console.log('║   音频资源自动下载工具 v1.0       ║');
  console.log('╚════════════════════════════════════╝');

  const args = process.argv.slice(2);
  const mode = args[0] || 'all';

  try {
    if (mode === 'maps' || mode === 'all') {
      await downloadMapBGM();
    }

    if (mode === 'sfx' || mode === 'all') {
      await downloadSFX();
    }

    generateReport();

    console.log('\n╔════════════════════════════════════╗');
    console.log('║          下载任务完成！            ║');
    console.log('╚════════════════════════════════════╝\n');

    console.log('提示:');
    console.log('  • 查看下载报告: AUDIO_DOWNLOAD_REPORT.md');
    console.log('  • 压缩音频文件: npm run compress-audio');
    console.log('  • 更新配置文件: npm run update-audio-manifest\n');

  } catch (error) {
    console.error('\n✗ 下载过程出错:', error.message);
    process.exit(1);
  }
}

// 运行
main();
