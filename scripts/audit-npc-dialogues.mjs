#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const TEXT_LIMITS = {
  beforeBattleText: 46,
  defeatedText: 34,
  dailyDefeatedText: 34,
  completedText: 34,
  ruleDescription: 24,
}

const DIALOGUE_FIELDS = Object.keys(TEXT_LIMITS)
const BANNED_PATTERNS = [
  { pattern: /概率/, label: '概率' },
  { pattern: /按批次/, label: '按批次' },
  { pattern: /固定四组/, label: '固定四组' },
  { pattern: /3\/4\/5\/6/, label: '3/4/5/6' },
  { pattern: /首通奖励不会重复/, label: '首通奖励不会重复' },
  { pattern: /不会重复开放/, label: '不会重复开放' },
  { pattern: /挡住了你的去路/, label: '挡住了你的去路' },
  { pattern: /认真对战/, label: '认真对战' },
]

const errors = []
const warnings = []

const cleanText = (value) => (
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim()
    : ''
)

const addError = (message) => errors.push(message)
const addWarning = (message) => warnings.push(message)

await withViteAuditServer(async ({ loadModule }) => {
  const { ADVENTURE_MAP_CHAIN, getAdventureMapInfo } = await loadModule('/src/game/data/overworldMaps.js')
  const { normalizeTrainerRole } = await loadModule('/src/utils/gameBalance.js')

  const summary = {
    normal: 0,
    lieutenant: 0,
    boss: 0,
    challenge: 0,
    reward: 0,
    minigame: 0,
    total: 0,
  }

  const normalTrainerTemplates = new Map()

  for (const mapId of ADVENTURE_MAP_CHAIN) {
    const map = getAdventureMapInfo(mapId)
    const events = (map?.runtimeEvents || []).filter((event) => (
      event.type === 'trainer' || event.type === 'boss' || event.type === 'challenge'
    ))

    for (const event of events) {
      const props = event?.properties || {}
      const role = event.type === 'challenge'
        ? 'challenge'
        : event.type === 'boss'
          ? 'boss'
          : normalizeTrainerRole(props.role || 'normal')
      const eventLabel = `${mapId}/${event.id}/${props.name || role}`
      summary[role] += 1
      summary.total += 1

      DIALOGUE_FIELDS.forEach((field) => {
        const text = cleanText(props[field])
        if (!text) return

        const limit = TEXT_LIMITS[field]
        if (text.length > limit) {
          addError(`${eventLabel} 的 ${field} 过长（${text.length} > ${limit}）`)
        }

        BANNED_PATTERNS.forEach(({ pattern, label }) => {
          if (pattern.test(text)) {
            addError(`${eventLabel} 的 ${field} 不应出现机制词“${label}”`)
          }
        })
      })

      if (!cleanText(props.beforeBattleText)) {
        addError(`${eventLabel} 缺少 beforeBattleText`)
      }

      if (role === 'reward' && (!Array.isArray(props.rewardItems) || props.rewardItems.length === 0)) {
        addError(`${eventLabel} 作为奖励 NPC 必须配置 rewardItems`)
      }

      if (role === 'minigame' && !cleanText(props.ruleDescription)) {
        addWarning(`${eventLabel} 建议保留一句简短 ruleDescription 作为低保底说明`)
      }

      if (role === 'lieutenant') {
        const order = Math.trunc(Number(props.sequenceOrder))
        if (!Number.isInteger(order) || order <= 0) {
          addError(`${eventLabel} 部下必须配置 sequenceOrder`)
        }
        if (Number.isInteger(order) && order > 0 && !cleanText(props.title).includes(`第${order}部下`)) {
          addError(`${eventLabel} 部下标题必须明确第${order}部下`)
        }
        if (!cleanText(props.ruleDescription)) {
          addError(`${eventLabel} 部下必须配置一句战斗特点`)
        }
        if (!cleanText(props.battleHintText)) {
          addError(`${eventLabel} 部下必须配置一句临战建议`)
        }
      }

      if (role === 'boss') {
        if (!cleanText(props.ruleDescription)) {
          addError(`${eventLabel} Boss 必须配置一句战斗特点`)
        }
        if (!cleanText(props.battleHintText)) {
          addError(`${eventLabel} Boss 必须配置一句临战建议`)
        }
      }

      if (role === 'challenge' && Array.isArray(props.challengeRarePool) && props.challengeRarePool.length > 0) {
        if (!cleanText(props.challengeRareUnlockText)) {
          addError(`${eventLabel} 缺少 challengeRareUnlockText`)
        }
      }

      if (role === 'normal') {
        const trainerName = cleanText(props.name)
        const template = cleanText(props.beforeBattleText).replaceAll(trainerName, '<name>')
        normalTrainerTemplates.set(template, (normalTrainerTemplates.get(template) || 0) + 1)
      }
    }
  }

  normalTrainerTemplates.forEach((count, template) => {
    if (count > 8) {
      addError(`普通训练师套话重复过多（${count} 次）：${template}`)
    }
  })

  if (errors.length > 0) {
    console.error('[audit-npc-dialogues] FAILED')
    errors.forEach((message) => console.error(`- ${message}`))
    if (warnings.length > 0) {
      console.error('Warnings:')
      warnings.forEach((message) => console.error(`- ${message}`))
    }
    process.exit(1)
    return
  }

  console.log('[audit-npc-dialogues] OK')
  console.log(JSON.stringify({ summary, warnings }, null, 2))
})
