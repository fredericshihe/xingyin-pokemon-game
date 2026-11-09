import { supabase } from '../supabaseClient'
import { FISHING_CATCHES } from '../game/fishingCatalog'
import { FISHING_APPRAISAL_GRADES } from '../game/fishingRewards'

export const GAMEPLAY_LOG_EVENT_META = {
  starter_selected: { label: '开局', category: 'progress', icon: 'fa-flag-checkered', tone: 'sky' },
  map_enter: { label: '进入地图', category: 'map', icon: 'fa-map-location-dot', tone: 'emerald' },
  fast_travel: { label: '快速传送', category: 'map', icon: 'fa-shuffle', tone: 'cyan' },
  wild_encounter_start: { label: '野外遭遇', category: 'battle', icon: 'fa-leaf', tone: 'lime' },
  trainer_battle_start: { label: '训练家战', category: 'battle', icon: 'fa-user-shield', tone: 'violet' },
  battle_victory: { label: '战斗胜利', category: 'battle', icon: 'fa-trophy', tone: 'amber' },
  battle_defeat: { label: '战斗失败', category: 'battle', icon: 'fa-heart-crack', tone: 'rose' },
  battle_escape: { label: '逃跑', category: 'battle', icon: 'fa-person-running', tone: 'slate' },
  capture_result: { label: '捕捉', category: 'capture', icon: 'fa-circle-dot', tone: 'pink' },
  pokemon_released: { label: '放生补偿', category: 'progress', icon: 'fa-person-walking-arrow-right', tone: 'amber' },
  item_bought: { label: '购买', category: 'item', icon: 'fa-cart-shopping', tone: 'orange' },
  item_sold: { label: '出售', category: 'item', icon: 'fa-scale-balanced', tone: 'amber' },
  item_used: { label: '使用道具', category: 'item', icon: 'fa-flask', tone: 'blue' },
  pickup_collected: { label: '补给', category: 'item', icon: 'fa-box-open', tone: 'teal' },
  healing_spring: { label: '泉水恢复', category: 'item', icon: 'fa-droplet', tone: 'cyan' },
  hidden_area_unlock: { label: '隐藏区', category: 'progress', icon: 'fa-key', tone: 'purple' },
  fishing_purchase: { label: '购买渔具', category: 'fishing', icon: 'fa-cart-shopping', tone: 'orange' },
  fishing_start: { label: '抛竿', category: 'fishing', icon: 'fa-fish', tone: 'cyan' },
  fishing_settle: { label: '钓鱼收杆', category: 'fishing', icon: 'fa-fish', tone: 'teal' },
  fishing_cancel: { label: '取消钓鱼', category: 'fishing', icon: 'fa-arrow-rotate-left', tone: 'slate' },
  fishing_expired: { label: '钓鱼超时', category: 'fishing', icon: 'fa-clock', tone: 'slate' },
  fishing_appraise: { label: '鉴定宝藏', category: 'fishing', icon: 'fa-magnifying-glass', tone: 'violet' },
  fishing_sell: { label: '出售鱼获', category: 'fishing', icon: 'fa-coins', tone: 'amber' },
}

export const GAMEPLAY_LOG_FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'battle', label: '战斗' },
  { id: 'map', label: '地图' },
  { id: 'capture', label: '捕捉' },
  { id: 'item', label: '道具' },
  { id: 'fishing', label: '钓鱼' },
  { id: 'progress', label: '推进' },
]

export function formatFishingGameplayLogDetails(log) {
  const details = log?.details || {}, result = typeof details.result === 'object' && details.result ? details.result : {}
  const parts = [details.spotName, details.baitName, details.merchantName].filter(Boolean)
  const item = FISHING_CATCHES[result.catchId]
  if (item) parts.push(item.name)
  if ((result.hitStreak ?? result.perfectStreak ?? 0) > 0) parts.push(`连续命中 ×${result.hitStreak ?? result.perfectStreak}`)
  if (result.bonusGold > 0) parts.push(`连击奖励 +${result.bonusGold} 金币`)
  if (result.perfectBonusGold > 0) parts.push(`完美加成 +${result.perfectBonusGold} 金币`)
  if (result.appraised && Number.isFinite(result.price)) parts.push(`${FISHING_APPRAISAL_GRADES[result.appraisalGrade]?.label || '已鉴定'} · ${result.price} 金币`)
  if (Array.isArray(result.sold)) {
    const names = result.sold.map((row) => `${FISHING_CATCHES[row.catchId]?.name || '鱼获'} ×${row.quantity}`)
    if (names.length) parts.push(names.join('、'))
  }
  return parts.join(' · ')
}

const MAX_TEXT_LENGTH = 240
const MAX_DETAILS_TEXT_LENGTH = 1200

const normalizeText = (value, fallback = '') => {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return fallback
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}…` : text
}

const normalizeJson = (value, fallback = {}) => {
  if (!value || typeof value !== 'object') return fallback
  try {
    return JSON.parse(JSON.stringify(value, (key, nestedValue) => {
      if (typeof nestedValue === 'string' && nestedValue.length > MAX_DETAILS_TEXT_LENGTH) {
        return `${nestedValue.slice(0, MAX_DETAILS_TEXT_LENGTH)}…`
      }
      return nestedValue
    }))
  } catch {
    return fallback
  }
}

export const getGameplayLogEventMeta = (eventType) => (
  GAMEPLAY_LOG_EVENT_META[eventType] || {
    label: '游玩',
    category: 'progress',
    icon: 'fa-sparkles',
    tone: 'slate'
  }
)

export async function recordGameplayEvent({
  studentId,
  eventType,
  title,
  summary,
  mapName,
  mapDisplayName,
  position,
  details,
} = {}) {
  if (!studentId || !eventType) return { success: false, skipped: true }

  const meta = getGameplayLogEventMeta(eventType)
  try {
    const { data, error } = await supabase.rpc('append_student_gameplay_log', {
      p_student_id: studentId,
      p_event_type: eventType,
      p_category: meta.category,
      p_title: normalizeText(title, meta.label),
      p_summary: normalizeText(summary),
      p_map_name: normalizeText(mapName),
      p_map_display_name: normalizeText(mapDisplayName),
      p_position: normalizeJson(position, {}),
      p_details: normalizeJson(details, {})
    })

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.warn('[GameplayLogs] 记录游玩日志失败，不影响游戏流程:', error?.message || error)
    return { success: false, error }
  }
}

export async function fetchStudentGameplayLogs({
  teacherId,
  studentId,
  limit = 300,
} = {}) {
  if (!teacherId || !studentId) return []
  const { data, error } = await supabase.rpc('get_student_gameplay_logs', {
    p_teacher_id: teacherId,
    p_student_id: studentId,
    p_limit: limit
  })
  if (error) throw error
  return data || []
}

export async function fetchTeacherGameplayLogs({
  teacherId,
  pageSize = 1000,
} = {}) {
  if (!teacherId) return []
  const safePageSize = Math.max(1, Math.min(1000, Math.trunc(Number(pageSize)) || 1000))
  const allLogs = []
  let offset = 0

  for (let page = 0; page < 100; page += 1) {
    const { data, error } = await supabase.rpc('get_teacher_gameplay_logs_page', {
      p_teacher_id: teacherId,
      p_limit: safePageSize,
      p_offset: offset
    })
    if (error) throw error
    const rows = Array.isArray(data) ? data : []
    allLogs.push(...rows)
    if (rows.length < safePageSize) break
    offset += rows.length
  }

  return allLogs
}
