import { supabase } from '../supabaseClient'

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
  item_bought: { label: '购买', category: 'item', icon: 'fa-cart-shopping', tone: 'orange' },
  item_sold: { label: '出售', category: 'item', icon: 'fa-scale-balanced', tone: 'amber' },
  item_used: { label: '使用道具', category: 'item', icon: 'fa-flask', tone: 'blue' },
  pickup_collected: { label: '补给', category: 'item', icon: 'fa-box-open', tone: 'teal' },
  healing_spring: { label: '泉水恢复', category: 'item', icon: 'fa-droplet', tone: 'cyan' },
  hidden_area_unlock: { label: '隐藏区', category: 'progress', icon: 'fa-key', tone: 'purple' },
}

export const GAMEPLAY_LOG_FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'battle', label: '战斗' },
  { id: 'map', label: '地图' },
  { id: 'capture', label: '捕捉' },
  { id: 'item', label: '道具' },
  { id: 'progress', label: '推进' },
]

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
  limit = 80,
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
