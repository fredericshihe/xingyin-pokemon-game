// 音频调试工具
// 在浏览器控制台运行这些命令来诊断音频问题

console.log('=== 音频系统调试工具 ===');

// 1. 检查AudioContext状态
function checkAudioContext() {
  const debug = window.__POKEMON_GAME_AUDIO_DEBUG__;
  console.log('AudioContext调试信息:', debug);
  console.log('- 是否支持:', debug?.supported);
  console.log('- 状态:', debug?.contextState);
  console.log('- 原因:', debug?.reason);
  console.log('- 错误:', debug?.lastError);
  console.log('- 音效已启用:', debug?.audioEnabled);
  console.log('- 音效音量:', debug?.audioVolume);
  console.log('- 已调度音调:', debug?.scheduledTones);
  console.log('- 已调度噪音:', debug?.scheduledNoise);
}

// 2. 检查localStorage中的音频设置
function checkAudioSettings() {
  const key = 'pokemon-game:audio-settings:v2';
  const raw = localStorage.getItem(key);
  console.log('localStorage音频设置:', raw);
  if (raw) {
    try {
      const settings = JSON.parse(raw);
      console.log('解析后的设置:', settings);
      console.log('- SFX启用:', settings.sfxEnabled);
      console.log('- SFX音量:', settings.sfxVolume);
      console.log('- BGM启用:', settings.bgmEnabled);
      console.log('- BGM音量:', settings.bgmVolume);
    } catch (e) {
      console.error('解析失败:', e);
    }
  }
}

// 3. 测试SFX播放
function testSfx() {
  console.log('测试SFX播放...');
  console.log('注意: gameAudio在ES模块中，无法直接访问');
  console.log('请点击页面上的任意按钮来测试音效');
  console.log('或者点击右上角的音量按钮');
}

// 4. 测试BGM播放
function testBgm() {
  console.log('测试BGM播放...');
  // gameBgm和gameAudio在模块中，不在全局作用域
  console.log('注意: gameBgm和gameAudio在ES模块中，无法直接访问');
  console.log('请检查以下HTML属性来查看状态:');
  const dataset = document.documentElement.dataset;
  console.log('- audioState:', dataset.audioState);
  console.log('- audioEnabled:', dataset.audioEnabled);
  console.log('- audioVolume:', dataset.audioVolume);
  console.log('- audioSupported:', dataset.audioSupported);
}

// 5. 手动解锁AudioContext
async function unlockAudio() {
  console.log('尝试解锁AudioContext...');
  console.log('由于gameAudio在ES模块中，请通过以下方式解锁:');
  console.log('1. 点击页面任意位置');
  console.log('2. 点击右上角的音量按钮');
  console.log('3. 点击任何游戏按钮');
  console.log('');
  console.log('AudioContext会在用户手势后自动解锁');
}

// 6. 检查音频文件是否加载
function checkAudioFiles() {
  console.log('检查音频文件加载状态...');
  console.log('音频文件信息无法直接访问（在ES模块中）');
  console.log('请检查Network标签查看音频文件加载情况');
  console.log('音频文件路径: /xingyin-pokemon-game/assets/audio/');
}

// 7. 完整诊断
function diagnose() {
  console.log('\n=== 开始完整诊断 ===\n');
  checkAudioContext();
  console.log('\n---\n');
  checkAudioSettings();
  console.log('\n---\n');
  testBgm();
  console.log('\n---\n');
  checkAudioFiles();
  console.log('\n=== 诊断完成 ===\n');
  console.log('如果需要手动解锁音频，请运行: unlockAudio()');
  console.log('如果需要测试SFX，请运行: testSfx()');
}

// 导出到全局
window.audioDebug = {
  checkAudioContext,
  checkAudioSettings,
  testSfx,
  testBgm,
  unlockAudio,
  checkAudioFiles,
  diagnose
};

console.log('音频调试工具已加载！');
console.log('运行 audioDebug.diagnose() 开始诊断');
console.log('或运行以下命令:');
console.log('- audioDebug.checkAudioContext() - 检查AudioContext状态');
console.log('- audioDebug.checkAudioSettings() - 检查音频设置');
console.log('- audioDebug.testSfx() - 测试音效');
console.log('- audioDebug.testBgm() - 检查BGM状态');
console.log('- audioDebug.unlockAudio() - 手动解锁音频');
console.log('- audioDebug.checkAudioFiles() - 检查音频文件');
