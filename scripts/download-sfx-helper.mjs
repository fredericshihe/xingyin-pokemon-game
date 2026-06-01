#!/usr/bin/env node

/**
 * 音效下载助手
 *
 * 这个脚本帮助你从免费资源网站下载推荐的音效文件
 *
 * 使用方法:
 *   node scripts/download-sfx-helper.mjs
 */

console.log('=== 音效下载助手 ===\n')

const SFX_RECOMMENDATIONS = {
  'UI音效': [
    {
      name: 'select.ogg',
      path: 'public/assets/audio/sfx/ui/select.ogg',
      keywords: 'button click, menu select, ui click',
      sites: [
        'https://freesound.org/search/?q=button+click+game',
        'https://www.zapsplat.com/sound-effect-category/game-sounds/'
      ],
      tips: '选择短促、清脆的点击音，时长0.1-0.2秒'
    },
    {
      name: 'confirm.ogg',
      path: 'public/assets/audio/sfx/ui/confirm.ogg',
      keywords: 'confirm, accept, positive beep',
      sites: [
        'https://freesound.org/search/?q=confirm+beep',
        'https://mixkit.co/free-sound-effects/game/'
      ],
      tips: '选择上升音调的确认音，给人积极的感觉'
    },
    {
      name: 'cancel.ogg',
      path: 'public/assets/audio/sfx/ui/cancel.ogg',
      keywords: 'cancel, back, negative beep',
      sites: [
        'https://freesound.org/search/?q=cancel+beep'
      ],
      tips: '选择下降音调的取消音，与确认音形成对比'
    }
  ],

  '火系技能音效': [
    {
      name: 'fire-attack-1.ogg',
      path: 'public/assets/audio/sfx/battle/moves/fire/fire-attack-1.ogg',
      keywords: 'fire whoosh, flame burst, fireball',
      sites: [
        'https://freesound.org/search/?q=fire+whoosh',
        'https://freesound.org/search/?q=flame+burst'
      ],
      tips: '选择有"呼"声的火焰音效，时长0.3-0.5秒'
    },
    {
      name: 'fire-attack-2.ogg',
      path: 'public/assets/audio/sfx/battle/moves/fire/fire-attack-2.ogg',
      keywords: 'explosion small, fire blast',
      sites: [
        'https://freesound.org/search/?q=small+explosion'
      ],
      tips: '选择爆炸类音效，比第一个更有冲击力'
    },
    {
      name: 'fire-attack-3.ogg',
      path: 'public/assets/audio/sfx/battle/moves/fire/fire-attack-3.ogg',
      keywords: 'fire crackle, burning',
      sites: [
        'https://freesound.org/search/?q=fire+crackle'
      ],
      tips: '选择燃烧、噼啪声，提供变化'
    }
  ],

  '水系技能音效': [
    {
      name: 'water-attack-1.ogg',
      path: 'public/assets/audio/sfx/battle/moves/water/water-attack-1.ogg',
      keywords: 'water splash, liquid impact',
      sites: [
        'https://freesound.org/search/?q=water+splash',
        'https://freesound.org/search/?q=water+spray'
      ],
      tips: '选择水花飞溅音效'
    },
    {
      name: 'water-attack-2.ogg',
      path: 'public/assets/audio/sfx/battle/moves/water/water-attack-2.ogg',
      keywords: 'water wave, liquid whoosh',
      sites: [
        'https://freesound.org/search/?q=water+wave'
      ],
      tips: '选择水波、水流音效'
    },
    {
      name: 'water-attack-3.ogg',
      path: 'public/assets/audio/sfx/battle/moves/water/water-attack-3.ogg',
      keywords: 'bubble pop, water bubble',
      sites: [
        'https://freesound.org/search/?q=bubble+pop'
      ],
      tips: '选择泡泡音效，提供变化'
    }
  ],

  '伤害音效': [
    {
      name: 'hit-normal.ogg',
      path: 'public/assets/audio/sfx/battle/impact/hit-normal.ogg',
      keywords: 'punch impact, hit body, thud',
      sites: [
        'https://freesound.org/search/?q=punch+impact',
        'https://freesound.org/search/?q=body+hit'
      ],
      tips: '选择中等力度的打击音'
    },
    {
      name: 'hit-super-effective.ogg',
      path: 'public/assets/audio/sfx/battle/impact/hit-super-effective.ogg',
      keywords: 'heavy impact, strong hit, critical',
      sites: [
        'https://freesound.org/search/?q=heavy+impact'
      ],
      tips: '选择更重、更有力的打击音'
    },
    {
      name: 'hit-not-very-effective.ogg',
      path: 'public/assets/audio/sfx/battle/impact/hit-not-very-effective.ogg',
      keywords: 'soft impact, weak hit',
      sites: [
        'https://freesound.org/search/?q=soft+impact'
      ],
      tips: '选择较轻的打击音'
    },
    {
      name: 'miss.ogg',
      path: 'public/assets/audio/sfx/battle/impact/miss.ogg',
      keywords: 'whoosh, air swipe, miss',
      sites: [
        'https://freesound.org/search/?q=whoosh+miss'
      ],
      tips: '选择空挥音效'
    }
  ],

  '战斗事件音效': [
    {
      name: 'encounter-wild.ogg',
      path: 'public/assets/audio/sfx/battle/events/encounter-wild.ogg',
      keywords: 'encounter, alert, surprise',
      sites: [
        'https://freesound.org/search/?q=game+encounter',
        'https://freesound.org/search/?q=alert+sound'
      ],
      tips: '选择突然的、引起注意的音效'
    },
    {
      name: 'faint.ogg',
      path: 'public/assets/audio/sfx/battle/events/faint.ogg',
      keywords: 'defeat, fall, collapse',
      sites: [
        'https://freesound.org/search/?q=defeat+sound'
      ],
      tips: '选择下降音调的失败音'
    },
    {
      name: 'victory.ogg',
      path: 'public/assets/audio/sfx/battle/events/victory.ogg',
      keywords: 'victory, win, success fanfare',
      sites: [
        'https://freesound.org/search/?q=victory+fanfare',
        'https://mixkit.co/free-sound-effects/win/'
      ],
      tips: '选择上升音调的胜利音，可以是短旋律'
    }
  ]
}

console.log('推荐的音效下载列表：\n')

Object.entries(SFX_RECOMMENDATIONS).forEach(([category, sounds]) => {
  console.log(`\n📁 ${category}`)
  console.log('─'.repeat(60))

  sounds.forEach((sound, index) => {
    console.log(`\n${index + 1}. ${sound.name}`)
    console.log(`   保存路径: ${sound.path}`)
    console.log(`   搜索关键词: ${sound.keywords}`)
    console.log(`   推荐网站:`)
    sound.sites.forEach(site => {
      console.log(`   - ${site}`)
    })
    console.log(`   💡 提示: ${sound.tips}`)
  })
})

console.log('\n\n=== 下载步骤 ===\n')
console.log('1. 访问推荐的网站链接')
console.log('2. 使用搜索关键词查找音效')
console.log('3. 试听并选择合适的音效')
console.log('4. 下载音效文件（MP3或OGG格式）')
console.log('5. 如果是MP3，转换为OGG格式（推荐）')
console.log('6. 重命名为推荐的文件名')
console.log('7. 保存到对应的路径')
console.log('8. 在游戏中测试')

console.log('\n\n=== 音效转换 ===\n')
console.log('在线转换工具:')
console.log('- CloudConvert: https://cloudconvert.com/')
console.log('- Online Audio Converter: https://online-audio-converter.com/')
console.log('')
console.log('命令行转换（需要安装FFmpeg）:')
console.log('  ffmpeg -i input.mp3 -c:a libvorbis -q:a 5 output.ogg')

console.log('\n\n=== 文件大小建议 ===\n')
console.log('- UI音效: < 5KB')
console.log('- 技能音效: < 10KB')
console.log('- 事件音效: < 15KB')
console.log('')
console.log('如果文件过大，可以降低比特率或缩短时长')

console.log('\n\n=== 免费音效网站 ===\n')
console.log('1. Freesound.org (推荐)')
console.log('   https://freesound.org/')
console.log('   - CC授权，质量高')
console.log('   - 需要免费注册')
console.log('')
console.log('2. OpenGameArt.org')
console.log('   https://opengameart.org/')
console.log('   - 开源游戏素材')
console.log('   - 无需注册')
console.log('')
console.log('3. Zapsplat')
console.log('   https://www.zapsplat.com/')
console.log('   - 免费注册后下载')
console.log('   - 分类清晰')
console.log('')
console.log('4. Mixkit')
console.log('   https://mixkit.co/free-sound-effects/game/')
console.log('   - 免费商用')
console.log('   - 高质量')

console.log('\n\n=== 下一步 ===\n')
console.log('1. 创建目录结构:')
console.log('   mkdir -p public/assets/audio/sfx/{ui,battle/{moves/{fire,water,grass,electric},impact,status,events,pokeball},items,special}')
console.log('')
console.log('2. 下载并放置音效文件')
console.log('')
console.log('3. 在游戏中测试:')
console.log('   npm run dev')
console.log('')
console.log('4. 查看集成示例:')
console.log('   cat SFX_INTEGRATION_EXAMPLES.md')

console.log('\n')
