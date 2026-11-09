import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import ConfirmDialog from '../ui/ConfirmDialog'
import './teacherDashboard.css'
import { OFFICIAL_DEX_MONSTERS, POKEBALLS, POTIONS, EXP_POTIONS } from '../../utils/gameData'
import { getExpPotionEffectText, getPokeballEffectText, getPotionEffectText } from '../../utils/inventoryItems'
import { GAMEPLAY_LOG_FILTERS, fetchStudentGameplayLogs, fetchTeacherGameplayLogs, formatFishingGameplayLogDetails, getGameplayLogEventMeta } from '../../utils/gameplayLogs'
import { TEACHER_UPDATE_EVENTS, broadcastStudentTeacherUpdate, createTeacherResourceRewardUpdate } from '../../utils/teacherRewardUpdates'
import {
  GOLD_REWARD_PRESETS,
  ENERGY_REWARD_PRESETS,
  ITEM_REWARD_PRESETS,
  getEnergyRewardWarning,
  getGoldRewardWarning,
  getItemRewardWarning,
  getMaxEnergyWarning,
  getPokemonRewardWarning
} from '../../utils/gameBalance'

const SHOP_REWARD_ITEMS = {
  pokeball: { label: '精灵球', items: POKEBALLS },
  potion: { label: '回复药', items: POTIONS },
  expPotion: { label: '经验药水', items: EXP_POTIONS }
}

const getRewardItemEffectText = (itemType, item = {}) => {
  if (itemType === 'potion') return getPotionEffectText(item)
  if (itemType === 'expPotion') return getExpPotionEffectText(item)
  if (itemType === 'pokeball') return getPokeballEffectText(item)
  return ''
}

const getRewardItemOptionText = (itemType, item = {}) => {
  const effectText = getRewardItemEffectText(itemType, item)
  return effectText ? `${item.name} · ${effectText}` : item.name
}

const PANEL_TABS = [
  { id: 'gold', label: '金币', icon: 'fa-coins' },
  { id: 'energy', label: '能量', icon: 'fa-bolt' },
  { id: 'reward', label: '奖励', icon: 'fa-gift' },
  { id: 'logs', label: '记录', icon: 'fa-clock-rotate-left' },
  { id: 'account', label: '账号', icon: 'fa-user-gear' }
]

const inputClass = 'teacher-input'

const DEFAULT_DAILY_PLAYTIME_LIMIT_MINUTES = 30

function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}

function getStudentPlaytimeLimitMinutes(student) {
  const value = Number(student?.daily_playtime_limit_minutes)
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : DEFAULT_DAILY_PLAYTIME_LIMIT_MINUTES
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function StudentAvatar({ name }) {
  const initial = (name || '?').trim().charAt(0) || '?'
  return <span className="teacher-avatar">{initial}</span>
}

function MessageBanner({ message, onDismiss }) {
  if (!message) return null
  return (
    <div className={cn('teacher-alert', message.type === 'success' ? 'teacher-alert--success' : 'teacher-alert--error')} role="status">
      <span className="teacher-alert__text">{message.text}</span>
      {onDismiss && (
        <button type="button" className="teacher-alert__close" onClick={onDismiss} aria-label="关闭提示">
          <i className="fa-solid fa-xmark" />
        </button>
      )}
    </div>
  )
}

function WarningBanner({ text }) {
  if (!text) return null
  return (
    <div className="teacher-alert teacher-alert--warning" role="alert">
      <i className="fa-solid fa-triangle-exclamation" />
      <span>{text}</span>
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <label className="teacher-field">
      <span className="teacher-field__label">{label}</span>
      {children}
      {hint ? <span className="teacher-field__hint">{hint}</span> : null}
    </label>
  )
}

function PresetRow({ presets, onSelect, renderLabel }) {
  return (
    <div className="teacher-presets">
      {presets.map((preset) => (
        <button key={preset.label} type="button" onClick={() => onSelect(preset)} className="teacher-preset-chip">
          {renderLabel ? renderLabel(preset) : preset.label}
        </button>
      ))}
    </div>
  )
}

function LogList({ logs, emptyText, renderAmount, renderMeta }) {
  if (!logs.length) return <p className="teacher-empty-inline">{emptyText}</p>
  return (
    <div className="teacher-log-list">
      {logs.map((log) => (
        <article key={log.id} className="teacher-log-item">
          <div className="teacher-log-item__main">
            <time className="teacher-log-item__time">{formatDate(log.created_at)}</time>
            <p className="teacher-log-item__reason">{log.reason || '系统变动'}</p>
          </div>
          <div className="teacher-log-item__side">
            <div className="teacher-log-item__amount">{renderAmount(log)}</div>
            <div className="teacher-log-item__meta">{renderMeta(log)}</div>
          </div>
        </article>
      ))}
    </div>
  )
}

function formatGameplayLogDetail(log) {
  if (log?.event_type?.startsWith('fishing_')) return formatFishingGameplayLogDetails(log)
  const details = log?.details && typeof log.details === 'object' ? log.details : {}
  const parts = []

  if (details.pokemonName) parts.push(details.pokemonLevel ? `${details.pokemonName} Lv.${details.pokemonLevel}` : details.pokemonName)
  if (details.enemyName && !details.pokemonName) parts.push(details.enemyLevel ? `${details.enemyName} Lv.${details.enemyLevel}` : details.enemyName)
  if (Array.isArray(details.enemyTeam) && details.enemyTeam.length > 0) {
    const teamText = details.enemyTeam
      .map((member) => member?.name ? `${member.name}${member.level ? ` Lv.${member.level}` : ''}` : '')
      .filter(Boolean)
      .join('、')
    if (teamText) parts.push(`对手：${teamText}`)
  }
  if (details.itemName) parts.push(details.quantity ? `${details.itemName} x${details.quantity}` : details.itemName)
  if (details.gold != null) parts.push(`金币 ${details.gold}`)
  if (details.exp != null) parts.push(`经验 ${details.exp}`)
  if (details.energyCost != null) parts.push(`能量 -${details.energyCost}`)
  if (details.turns != null) parts.push(`回合 ${details.turns}`)
  if (details.switches != null) parts.push(`换人 ${details.switches}`)
  if (details.enemySwitches != null) parts.push(`对手换人 ${details.enemySwitches}`)
  if (details.potions != null) parts.push(`用药 ${details.potions}`)
  if (details.fromMapDisplayName && details.targetMapDisplayName) {
    parts.push(`${details.fromMapDisplayName} → ${details.targetMapDisplayName}`)
  }
  if (typeof details.result === 'string') parts.push(details.result)

  return parts.filter(Boolean).slice(0, 6).join(' · ')
}

export function GameplayLogList({ logs, emptyText }) {
  if (!logs.length) return <p className="teacher-empty-inline">{emptyText}</p>

  return (
    <div className="teacher-gameplay-log-list">
      {logs.map((log) => {
        const meta = getGameplayLogEventMeta(log.event_type)
        const detailText = formatGameplayLogDetail(log)
        return (
          <article key={log.id} className={cn('teacher-gameplay-log', `teacher-gameplay-log--${meta.tone}`)}>
            <span className="teacher-gameplay-log__icon">
              <i className={cn('fa-solid', meta.icon)} />
            </span>
            <div className="teacher-gameplay-log__body">
              <div className="teacher-gameplay-log__head">
                <strong>{log.title || meta.label}</strong>
                <time>{formatDate(log.created_at)}</time>
              </div>
              {log.student_nickname || log.student_username ? (
                <span className="teacher-gameplay-log__student">
                  {log.student_nickname || log.student_username}
                  {log.student_username && log.student_nickname ? ` · @${log.student_username}` : ''}
                </span>
              ) : null}
              {log.summary ? <p>{log.summary}</p> : null}
              <div className="teacher-gameplay-log__meta">
                <span>{meta.label}</span>
                {log.map_display_name || log.map_name ? <span>{log.map_display_name || log.map_name}</span> : null}
                {detailText ? <span>{detailText}</span> : null}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

export default function TeacherDashboard({ profile, teacherPassword = '', client = supabase, previewGameplayLogs = null, onLogout }) {
  const [students, setStudents] = useState([])
  const [studentsLoading, setStudentsLoading] = useState(true)
  const selectedKeyRef = useRef(null)
  const removedStudentIds = useRef(new Set())
  const [pendingStudents, setPendingStudents] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  const [studentSearch, setStudentSearch] = useState('')
  const [activePanel, setActivePanel] = useState('gold')
  const [logTab, setLogTab] = useState('gold')

  const [goldAmount, setGoldAmount] = useState('')
  const [energyAmount, setEnergyAmount] = useState('')
  const [energyMax, setEnergyMax] = useState('')
  const [energyFillToMax, setEnergyFillToMax] = useState(false)
  const [reason, setReason] = useState('')
  const [energyReason, setEnergyReason] = useState('')
  const [playtimeLimitMinutes, setPlaytimeLimitMinutes] = useState(String(DEFAULT_DAILY_PLAYTIME_LIMIT_MINUTES))
  const [playtimeLimitLoading, setPlaytimeLimitLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [approvalLoadingId, setApprovalLoadingId] = useState(null)
  const [goldLogs, setGoldLogs] = useState([])
  const [energyLogs, setEnergyLogs] = useState([])
  const [gameplayLogs, setGameplayLogs] = useState([])
  const [gameplayLogFilter, setGameplayLogFilter] = useState('all')
  const [gameplayLogScope, setGameplayLogScope] = useState('all')
  const [gameplayLogsLoading, setGameplayLogsLoading] = useState(false)
  const [rewardMode, setRewardMode] = useState('item')
  const [rewardItemType, setRewardItemType] = useState('pokeball')
  const [rewardItemKey, setRewardItemKey] = useState(Object.keys(POKEBALLS)[0])
  const [rewardQuantity, setRewardQuantity] = useState('1')
  const [rewardPokemonId, setRewardPokemonId] = useState(String(OFFICIAL_DEX_MONSTERS[0]?.id || 1))
  const [rewardPokemonLevel, setRewardPokemonLevel] = useState('5')
  const [rewardReason, setRewardReason] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('')
  const [passwordResetLoading, setPasswordResetLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const confirmationResolve = useRef(null)
  const deletionInFlight = useRef(false)
  const requestConfirmation = (options) => new Promise((resolve) => {
    confirmationResolve.current = resolve
    setConfirmation(options)
  })
  const finishConfirmation = (value) => {
    confirmationResolve.current?.(value)
    confirmationResolve.current = null
    setConfirmation(null)
  }
  useEffect(() => () => confirmationResolve.current?.(false), [])

  const handleDeleteStudent = async (teacherPassword) => {
    if (!deleteTarget || deletionInFlight.current) return
    const target = deleteTarget
    deletionInFlight.current = true
    setDeleteBusy(true)
    setDeleteError('')
    try {
      const { data, error } = await client.rpc('teacher_delete_student', {
        p_teacher_id: profile.id,
        p_student_id: target.id,
        p_teacher_password: teacherPassword,
        p_expected_username: target.username
      })
      if (error) throw error
      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (!result?.success) {
        setDeleteError(result?.error || '删除失败，请重试')
        return
      }
      removedStudentIds.current.add(target.id)
      setStudents((previous) => previous.filter((student) => student.id !== target.id))
      setPendingStudents((previous) => previous.filter((student) => student.id !== target.id))
      setGameplayLogs((previous) => previous.filter((log) => log.student_id !== target.id))
      if (selectedStudentId === String(target.id)) {
        selectedKeyRef.current = null
        setSelectedStudentId(null)
        setGoldLogs([])
        setEnergyLogs([])
      }
      setDeleteTarget(null)
      setMessage({ type: 'success', text: `已删除 ${target.nickname || target.username} 的账号及关联数据` })
      await Promise.all([loadStudents(), loadPendingStudents()])
    } catch (error) {
      setDeleteError(error.code === 'PGRST202' ? '账号删除功能尚未部署，请联系管理员' : '删除未确认，请重试；系统会校验账号当前状态')
    } finally {
      deletionInFlight.current = false
      setDeleteBusy(false)
    }
  }

  const goldWarning = getGoldRewardWarning(goldAmount)
  const energyWarning = getEnergyRewardWarning(energyAmount) || getMaxEnergyWarning(energyMax)
  const rewardWarning =
    rewardMode === 'item'
      ? getItemRewardWarning({ itemKey: rewardItemKey, quantity: rewardQuantity })
      : getPokemonRewardWarning(rewardPokemonLevel)
  const selectedRewardItem = SHOP_REWARD_ITEMS[rewardItemType]?.items?.[rewardItemKey]
  const selectedRewardItemHint = selectedRewardItem ? getRewardItemEffectText(rewardItemType, selectedRewardItem) : ''

  const notifyStudentTeacherUpdate = useCallback((studentId, eventName, resourceReward = null) => {
    void broadcastStudentTeacherUpdate(client, studentId, eventName, resourceReward)
  }, [client])

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase()
    if (!q) return students
    return students.filter(
      (s) =>
        s.nickname?.toLowerCase().includes(q) ||
        s.username?.toLowerCase().includes(q)
    )
  }, [students, studentSearch])

  const selectedStudent = useMemo(
    () => students.find((student) => String(student.id) === selectedStudentId) || null,
    [students, selectedStudentId]
  )

  const filteredGameplayLogs = useMemo(() => {
    if (gameplayLogFilter === 'all') return gameplayLogs
    return gameplayLogs.filter((log) => {
      const meta = getGameplayLogEventMeta(log.event_type)
      return (log.category || meta.category) === gameplayLogFilter
    })
  }, [gameplayLogFilter, gameplayLogs])

  useEffect(() => {
    loadStudents()
    loadPendingStudents()
  }, [])

  useEffect(() => {
    if (selectedStudentId) {
      loadGoldLogs(selectedStudentId)
      loadEnergyLogs(selectedStudentId)
      loadGameplayLogs(selectedStudentId, gameplayLogScope)
    } else {
      setGoldLogs([])
      setEnergyLogs([])
      setGameplayLogs([])
    }
  }, [gameplayLogScope, selectedStudentId])

  useEffect(() => {
    if (selectedStudentId && students.length > 0 && !students.some((student) => String(student.id) === selectedStudentId)) {
      setSelectedStudentId(null)
    }
  }, [selectedStudentId, students])

  useEffect(() => {
    setResetPassword('')
    setResetPasswordConfirm('')
    setPasswordResetLoading(false)
  }, [selectedStudentId])

  useEffect(() => {
    setPlaytimeLimitMinutes(String(getStudentPlaytimeLimitMinutes(selectedStudent)))
    setPlaytimeLimitLoading(false)
  }, [selectedStudent])

  const selectStudent = useCallback((student) => {
    if (!student?.id) return
    selectedKeyRef.current = String(student.id)
    setGoldLogs([])
    setEnergyLogs([])
    setGameplayLogs([])
    setGoldAmount('')
    setReason('')
    setEnergyAmount('')
    setEnergyMax('')
    setEnergyReason('')
    setEnergyFillToMax(false)
    setRewardReason('')
    setSelectedStudentId(String(student.id))
    setMessage(null)
    setActivePanel('gold')
    setLogTab('gold')
    setGameplayLogFilter('all')
  }, [])

  const patchStudent = (studentId, patch) => {
    setStudents((prev) => prev.map((student) => (
      student.id === studentId ? { ...student, ...patch } : student
    )))
  }

  const loadStudents = async () => {
    setStudentsLoading(true)
    try {
      const { data, error } = await client.rpc('get_teacher_students', {
        p_teacher_id: profile.id
      })

      if (error) throw error
      setStudents((data || []).filter((student) => !removedStudentIds.current.has(student.id)))
    } catch (error) {
      console.error('Error loading students:', error)
      setMessage({ type: 'error', text: '学生列表读取失败，请点击刷新重试' })
    } finally {
      setStudentsLoading(false)
    }
  }

  const loadPendingStudents = async () => {
    try {
      const { data, error } = await client.rpc('get_teacher_pending_students', {
        p_teacher_id: profile.id
      })

      if (error) throw error
      setPendingStudents((data || []).filter((student) => !removedStudentIds.current.has(student.id)))
    } catch (error) {
      console.error('Error loading pending students:', error)
    }
  }

  const handleReviewStudent = async (student, approved) => {
    if (!student?.id) return
    const rejectionReason = approved ? '' : await requestConfirmation({ title: '拒绝注册申请', description: `学生：${student.nickname || student.username}（@${student.username}）`, fieldLabel: '拒绝原因（可选）', optional: true, confirmLabel: '拒绝申请', danger: true })
    if (!approved && rejectionReason === false) return

    setApprovalLoadingId(student.id)
    setMessage(null)
    try {
      const { data, error } = await client.rpc('review_student_registration', {
        p_teacher_id: profile.id,
        p_student_id: student.id,
        p_approved: approved,
        p_rejection_reason: rejectionReason || null
      })
      if (error) throw error
      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (result?.success === false) {
        setMessage({ type: 'error', text: result.error || '审核操作失败' })
      } else {
        setMessage({
          type: 'success',
          text: approved
            ? `已同意 ${student.nickname || student.username} 的注册申请`
            : `已拒绝 ${student.nickname || student.username} 的注册申请`
        })
        await loadPendingStudents()
        await loadStudents()
      }
    } catch (error) {
      console.error('Error reviewing student:', error)
      setMessage({ type: 'error', text: '审核操作失败: ' + error.message })
    } finally {
      setApprovalLoadingId(null)
    }
  }

  const loadGoldLogs = async (studentId) => {
    try {
      const { data, error } = await client.rpc('get_student_gold_logs', {
        p_teacher_id: profile.id,
        p_student_id: studentId,
        p_limit: 20
      })
      if (error) throw error
      if (selectedKeyRef.current === String(studentId)) setGoldLogs(data || [])
    } catch (error) {
      console.error('Error loading gold logs:', error)
    }
  }

  const loadEnergyLogs = async (studentId) => {
    try {
      const { data, error } = await client.rpc('get_student_energy_logs', {
        p_teacher_id: profile.id,
        p_student_id: studentId,
        p_limit: 20
      })
      if (error) throw error
      if (selectedKeyRef.current === String(studentId)) setEnergyLogs(data || [])
    } catch (error) {
      console.error('Error loading energy logs:', error)
    }
  }

  const loadGameplayLogs = async (studentId, scope = gameplayLogScope) => {
    setGameplayLogsLoading(true)
    try {
      const logs = previewGameplayLogs !== null ? previewGameplayLogs.filter((log) => scope === 'all' || log.student_id === studentId) : scope === 'all'
        ? await fetchTeacherGameplayLogs({ teacherId: profile.id, limit: 1000 })
        : await fetchStudentGameplayLogs({ teacherId: profile.id, studentId, limit: 300 })
      if (selectedKeyRef.current === String(studentId)) setGameplayLogs(logs.filter((log) => !removedStudentIds.current.has(log.student_id)))
    } catch (error) {
      console.error('Error loading gameplay logs:', error)
      setGameplayLogs([])
    } finally {
      setGameplayLogsLoading(false)
    }
  }

  const handleGameplayScopeChange = (scope) => {
    setGameplayLogScope(scope)
    void loadGameplayLogs(selectedStudent?.id, scope)
  }

  const handleGrantGold = async () => {
    if (!selectedStudent || !goldAmount || goldAmount <= 0) {
      setMessage({ type: 'error', text: '请输入有效的金币数量' })
      return
    }
    const warning = getGoldRewardWarning(goldAmount)
    if (warning && !await requestConfirmation({ title: '确认发放', description: warning, confirmLabel: '继续发放' })) return

    setLoading(true)
    setMessage(null)
    try {
      const { data, error } = await client.rpc('grant_gold', {
        p_teacher_id: profile.id,
        p_student_id: selectedStudent.id,
        p_amount: parseInt(goldAmount),
        p_reason: reason || '老师发放'
      })
      if (error) throw error
      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (result.success) {
        setMessage({ type: 'success', text: result.message })
        setGoldAmount('')
        setReason('')
        patchStudent(selectedStudent.id, { gold: result.goldAfter })
        notifyStudentTeacherUpdate(selectedStudent.id, TEACHER_UPDATE_EVENTS.resourcesChanged,
          createTeacherResourceRewardUpdate({ goldDelta: result.goldAfter - result.goldBefore }))
        await loadStudents()
        await loadGoldLogs(selectedStudent.id)
      } else {
        setMessage({ type: 'error', text: result.error || '发放失败' })
      }
    } catch (error) {
      console.error('Error granting gold:', error)
      setMessage({ type: 'error', text: '发放失败: ' + error.message })
    } finally {
      setLoading(false)
    }
  }

  const handleGrantEnergy = async () => {
    if (!selectedStudent) {
      setMessage({ type: 'error', text: '请先选择学生' })
      return
    }
    const amount = parseInt(energyAmount || '0')
    const maxValue = energyMax === '' ? null : parseInt(energyMax)
    if (!energyFillToMax && (!amount || amount <= 0) && maxValue === null) {
      setMessage({ type: 'error', text: '请输入要恢复的能量数量，或选择补满/调整上限' })
      return
    }
    const warning = getEnergyRewardWarning(amount) || getMaxEnergyWarning(maxValue)
    if (warning && !await requestConfirmation({ title: '确认调整', description: warning, confirmLabel: '继续调整' })) return

    const defaultEnergyReason = energyFillToMax
      ? '老师补满能量'
      : (maxValue !== null && (!amount || amount <= 0) ? '老师调整能量上限' : '老师恢复能量')

    setLoading(true)
    setMessage(null)
    try {
      const { data, error } = await client.rpc('grant_energy', {
        p_teacher_id: profile.id,
        p_student_id: selectedStudent.id,
        p_amount: amount > 0 ? amount : 0,
        p_reason: energyReason || defaultEnergyReason,
        p_fill_to_max: energyFillToMax,
        p_max_energy: maxValue
      })
      if (error) throw error
      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (result.success) {
        setMessage({ type: 'success', text: result.message })
        setEnergyAmount('')
        setEnergyMax('')
        setEnergyReason('')
        setEnergyFillToMax(false)
        patchStudent(selectedStudent.id, {
          energy: result.energyAfter,
          max_energy: result.maxEnergyAfter
        })
        notifyStudentTeacherUpdate(selectedStudent.id, TEACHER_UPDATE_EVENTS.resourcesChanged,
          createTeacherResourceRewardUpdate({ maxEnergyDelta: Math.max(0, result.maxEnergyAfter - result.maxEnergyBefore) }))
        await loadStudents()
        await loadEnergyLogs(selectedStudent.id)
      } else {
        setMessage({ type: 'error', text: result.error || '能量操作失败' })
      }
    } catch (error) {
      console.error('Error granting energy:', error)
      setMessage({ type: 'error', text: '能量操作失败: ' + error.message })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePlaytimeLimit = async () => {
    if (!selectedStudent) {
      setMessage({ type: 'error', text: '请先选择学生' })
      return
    }

    const nextLimit = parseInt(playtimeLimitMinutes, 10)
    if (!Number.isFinite(nextLimit) || nextLimit < 0 || nextLimit > 1440) {
      setMessage({ type: 'error', text: '每日游玩时长需在 0 到 1440 分钟之间' })
      return
    }

    setPlaytimeLimitLoading(true)
    setMessage(null)
    try {
      if (!teacherPassword) {
        throw new Error('教师验证已过期，请退出后重新登录教师账号。')
      }
      const { data, error } = await client.rpc('set_student_daily_playtime_limit', {
        p_teacher_id: profile.id,
        p_student_id: selectedStudent.id,
        p_limit_minutes: nextLimit,
        p_teacher_password: teacherPassword
      })
      if (error) throw error
      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (result?.success) {
        const limitMinutes = Number.isFinite(Number(result.limitMinutes))
          ? Math.max(0, Math.trunc(Number(result.limitMinutes)))
          : nextLimit
        patchStudent(selectedStudent.id, {
          daily_playtime_limit_minutes: limitMinutes
        })
        setPlaytimeLimitMinutes(String(limitMinutes))
        setMessage({ type: 'success', text: result.message || '每日游玩时长已更新' })
        notifyStudentTeacherUpdate(selectedStudent.id, TEACHER_UPDATE_EVENTS.playtimeChanged)
        await loadStudents()
      } else {
        setMessage({ type: 'error', text: result?.error || '每日游玩时长更新失败' })
      }
    } catch (error) {
      console.error('Error updating playtime limit:', error)
      setMessage({ type: 'error', text: '每日游玩时长更新失败: ' + error.message })
    } finally {
      setPlaytimeLimitLoading(false)
    }
  }

  const handleRewardItemTypeChange = (itemType) => {
    if (!SHOP_REWARD_ITEMS[itemType]) return
    const firstKey = Object.keys(SHOP_REWARD_ITEMS[itemType].items)[0]
    setRewardItemType(itemType)
    setRewardItemKey(firstKey)
  }

  const applyGoldPreset = (preset) => {
    setGoldAmount(String(preset.amount))
    setReason(preset.reason)
  }

  const applyEnergyPreset = (preset) => {
    setEnergyAmount(String(preset.amount))
    setEnergyReason(preset.reason)
    setEnergyFillToMax(false)
  }

  const applyItemPreset = (preset) => {
    if (!SHOP_REWARD_ITEMS[preset.itemType]) return
    setRewardMode('item')
    setRewardItemType(preset.itemType)
    setRewardItemKey(preset.itemKey)
    setRewardQuantity(String(preset.quantity))
    setRewardReason(preset.reason)
    setActivePanel('reward')
  }

  const handleGrantReward = async () => {
    if (!selectedStudent) {
      setMessage({ type: 'error', text: '请先选择学生' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      let data
      let error
      if (rewardMode === 'item') {
        const quantity = parseInt(rewardQuantity)
        if (!rewardItemKey || !quantity || quantity <= 0) {
          setMessage({ type: 'error', text: '请选择有效道具和数量' })
          return
        }
        const warning = getItemRewardWarning({ itemKey: rewardItemKey, quantity })
        if (warning && !await requestConfirmation({ title: '确认发放', description: warning, confirmLabel: '继续发放' })) return
        const result = await client.rpc('grant_item_reward', {
          p_teacher_id: profile.id,
          p_student_id: selectedStudent.id,
          p_item_type: rewardItemType,
          p_item_key: rewardItemKey,
          p_quantity: quantity,
          p_reason: rewardReason || '老师奖励'
        })
        data = result.data
        error = result.error
      } else {
        const pokemonId = parseInt(rewardPokemonId)
        const level = parseInt(rewardPokemonLevel)
        if (!pokemonId || !level || level < 1 || level > 100) {
          setMessage({ type: 'error', text: '请选择宝可梦，并输入1到100级' })
          return
        }
        const warning = getPokemonRewardWarning(level)
        if (warning && !await requestConfirmation({ title: '确认发放', description: warning, confirmLabel: '继续发放' })) return
        const result = await client.rpc('grant_pokemon_reward', {
          p_teacher_id: profile.id,
          p_student_id: selectedStudent.id,
          p_pokemon_id: pokemonId,
          p_level: level,
          p_reason: rewardReason || '老师奖励'
        })
        data = result.data
        error = result.error
      }
      if (error) throw error
      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (result.success) {
        setMessage({ type: 'success', text: result.message })
        setRewardQuantity('1')
        setRewardPokemonLevel('5')
        setRewardReason('')
        notifyStudentTeacherUpdate(selectedStudent.id, TEACHER_UPDATE_EVENTS.rewardsChanged)
      } else {
        setMessage({ type: 'error', text: result.error || '奖励发放失败' })
      }
    } catch (error) {
      console.error('Error granting reward:', error)
      setMessage({ type: 'error', text: '奖励发放失败: ' + error.message })
    } finally {
      setLoading(false)
    }
  }

  const handleResetStudentPassword = async () => {
    if (!selectedStudent) {
      setMessage({ type: 'error', text: '请先选择学生' })
      return
    }

    const nextPassword = String(resetPassword || '').trim()
    const confirmPassword = String(resetPasswordConfirm || '').trim()
    if (nextPassword.length < 6) {
      setMessage({ type: 'error', text: '新密码至少 6 位' })
      return
    }
    if (nextPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的新密码不一致' })
      return
    }
    if (!await requestConfirmation({ title: '更新学生密码', description: `${selectedStudent.nickname || selectedStudent.username} 的旧密码将立即失效。`, confirmLabel: '更新密码' })) {
      return
    }

    setPasswordResetLoading(true)
    setMessage(null)
    try {
      const { data, error } = await client.rpc('teacher_reset_student_password', {
        p_teacher_id: profile.id,
        p_student_id: selectedStudent.id,
        p_new_password: nextPassword
      })
      if (error) throw error
      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (result?.success) {
        setResetPassword('')
        setResetPasswordConfirm('')
        setMessage({
          type: 'success',
          text: `${selectedStudent.nickname || selectedStudent.username} 的登录密码已更新，旧密码立即失效。`
        })
      } else {
        setMessage({ type: 'error', text: result?.error || '密码更新失败' })
      }
    } catch (error) {
      console.error('Error resetting student password:', error)
      setMessage({ type: 'error', text: `密码更新失败: ${error.message}` })
    } finally {
      setPasswordResetLoading(false)
    }
  }

  const panelTitle = PANEL_TABS.find((t) => t.id === activePanel)?.label

  return (
    <div className="teacher-dashboard game-app-bg" data-student-open={Boolean(selectedStudent)}>
      <header className="teacher-header">
        <div className="teacher-header__brand">
          <span className="teacher-header__icon">
            <i className="fa-solid fa-chalkboard-user" />
          </span>
          <div>
            <h1 className="teacher-header__title">教师工作台</h1>
            <p className="teacher-header__subtitle">欢迎，{profile.nickname} 老师</p>
          </div>
        </div>
        <div className="teacher-header__stats">
          <span className="teacher-stat-pill">
            <i className="fa-solid fa-users" />
            {students.length} 名学生
          </span>
          <span className={cn('teacher-stat-pill', pendingStudents.length > 0 && 'teacher-stat-pill--pending')}>
            <i className="fa-solid fa-user-clock" />
            {pendingStudents.length} 个待确认
          </span>
          <button type="button" className="game-soft-button" onClick={() => { loadStudents(); loadPendingStudents() }} aria-label="刷新学生列表"><i className="fa-solid fa-rotate-right" />刷新</button>
          {onLogout && <button type="button" className="game-soft-button" onClick={onLogout}><i className="fa-solid fa-right-from-bracket" />退出</button>}
        </div>
      </header>

      <MessageBanner message={message} onDismiss={() => setMessage(null)} />

      <div className="teacher-layout">
        <aside className="teacher-sidebar game-card">
          <div className="teacher-sidebar__head">
            <h2>学生列表</h2>
            <span className="teacher-sidebar__count">{students.length}</span>
          </div>
          <input
            type="search"
            aria-label="搜索学生"
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            placeholder="搜索昵称或用户名"
            className={inputClass}
          />

          <details className="teacher-approval-box">
            <summary className="teacher-approval-box__head">
              <h3>注册待确认</h3>
              <span>{pendingStudents.length}</span>
            </summary>
            {pendingStudents.length === 0 ? (
              <p className="teacher-empty-inline">暂无学生注册申请</p>
            ) : (
              <div className="teacher-approval-list">
                {pendingStudents.map((student) => (
                  <article key={student.id} className="teacher-approval-card">
                    <StudentAvatar name={student.nickname} />
                    <div className="teacher-approval-card__body">
                      <strong>{student.nickname || student.username}</strong>
                      <span>@{student.username}</span>
                      <time>{formatDate(student.registration_requested_at || student.created_at)}</time>
                    </div>
                    <div className="teacher-approval-card__actions">
                      <button
                        type="button"
                        className="teacher-approval-card__approve"
                        disabled={approvalLoadingId === student.id}
                        onClick={() => handleReviewStudent(student, true)}
                      >
                        同意
                      </button>
                      <button
                        type="button"
                        className="teacher-approval-card__reject"
                        disabled={approvalLoadingId === student.id}
                        onClick={() => handleReviewStudent(student, false)}
                      >
                        拒绝
                      </button>
                      <button type="button" className="teacher-approval-card__delete" onClick={() => { setDeleteError(''); setDeleteTarget({ ...student }) }}>删除账号</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </details>

          {studentsLoading && students.length === 0 ? <p className="teacher-empty-inline" role="status">正在读取学生列表…</p> : students.length === 0 ? (
            <div className="teacher-empty">
              <i className="fa-solid fa-user-plus teacher-empty__icon" />
              <p>还没有学生</p>
              <p className="teacher-empty__hint">学生注册时需填写你的用户名</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <p className="teacher-empty-inline">没有匹配的学生</p>
          ) : (
            <>
              <ul className="teacher-student-list" aria-label="学生列表">
              {filteredStudents.map((student) => {
                const active = selectedStudentId === String(student.id)
                return (
                  <li key={student.id}>
                    <button
                      type="button"
                      disabled={loading || passwordResetLoading || playtimeLimitLoading || deleteBusy}
                      onClick={() => selectStudent(student)}
                      className={cn('teacher-student-card', active && 'teacher-student-card--active')}
                      data-student-id={student.id}
                      aria-pressed={active}
                      aria-label={`选择学生 ${student.nickname || student.username}`}
                    >
                      <StudentAvatar name={student.nickname} />
                      <div className="teacher-student-card__body">
                        <span className="teacher-student-card__name">{student.nickname}</span>
                        <span className="teacher-student-card__user">@{student.username}</span>

                      </div>
                      <div className="teacher-student-card__stats">
                        <span className="teacher-student-card__gold"><i className="fa-solid fa-coins" aria-hidden="true" /> {student.gold ?? 0}</span>
                        <span className="teacher-student-card__energy">
                          <i className="fa-solid fa-bolt" aria-hidden="true" /> {student.energy ?? 0}/{student.max_energy ?? 0}
                        </span>
                        <span className="teacher-student-card__playtime">
                          {getStudentPlaytimeLimitMinutes(student)} 分钟/天
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
              </ul>
            </>
          )}
        </aside>

        <main className="teacher-main">
          {!selectedStudent ? (
            <section className="teacher-main-empty game-card">
              <i className="fa-solid fa-hand-pointer teacher-main-empty__icon" />
              <h2>请从左侧选择一名学生</h2>
              <p>选择后可发放金币、恢复能量、发放奖励，并查看操作记录</p>
            </section>
          ) : (
            <>
              <button type="button" className="teacher-mobile-back game-soft-button" onClick={() => { selectedKeyRef.current = null; setSelectedStudentId(null) }}><i className="fa-solid fa-arrow-left" />学生列表</button>
              <section className="teacher-profile game-card">
                <StudentAvatar name={selectedStudent.nickname} />
                <div className="teacher-profile__info">
                  <h2>{selectedStudent.nickname}</h2>
                  <p>@{selectedStudent.username}</p>
                </div>
                <dl className="teacher-profile__grid">
                  <div>
                    <dt>创建时间</dt>
                    <dd>{formatDate(selectedStudent.created_at)}</dd>
                  </div>
                  <div>
                    <dt>金币</dt>
                    <dd className="teacher-profile__gold">{selectedStudent.gold ?? 0}</dd>
                  </div>
                  <div>
                    <dt>能量</dt>
                    <dd className="teacher-profile__energy">
                      {selectedStudent.energy ?? 0} / {selectedStudent.max_energy ?? 0}
                    </dd>
                  </div>
                  <div>
                    <dt>每日时长</dt>
                    <dd className="teacher-profile__playtime">
                      {getStudentPlaytimeLimitMinutes(selectedStudent)} 分钟
                    </dd>
                  </div>
                </dl>
              </section>

              <nav className="teacher-tabs" aria-label="操作分类">
                {PANEL_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActivePanel(tab.id)}
                    aria-pressed={activePanel === tab.id}
                    className={cn('teacher-tab', activePanel === tab.id && 'teacher-tab--active')}
                  >
                    <i className={cn('fa-solid', tab.icon)} />
                    {tab.label}
                  </button>
                ))}
              </nav>

              <section className="teacher-panel game-card">
                <header className="teacher-panel__head">
                  <h3>{panelTitle}</h3>
                  <span className="teacher-panel__target">目标：{selectedStudent.nickname}</span>
                </header>

                {activePanel === 'account' && (
                  <div className="teacher-account">
                    <section className="teacher-account__section">
                      <h4>游玩设置</h4>
                      <form
                        className="teacher-profile__playtime-form"
                        onSubmit={(e) => {
                          e.preventDefault()
                          handleUpdatePlaytimeLimit()
                        }}
                      >
                        <Field label="每日游玩时长" hint="保存后学生端立即生效">
                          <div className="teacher-profile__playtime-control">
                            <input
                              type="number"
                              value={playtimeLimitMinutes}
                              onChange={(e) => setPlaytimeLimitMinutes(e.target.value)}
                              min="0"
                              max="1440"
                              className={inputClass}
                            />
                            <span>分钟/天</span>
                          </div>
                        </Field>
                        <button
                          type="submit"
                          disabled={playtimeLimitLoading || !selectedStudent}
                          className="game-soft-button teacher-profile__playtime-btn"
                        >
                          <i className={cn('fa-solid', playtimeLimitLoading ? 'fa-rotate fa-spin' : 'fa-floppy-disk')} />
                          {playtimeLimitLoading ? '保存中…' : '保存时长'}
                        </button>
                      </form>
                      <form
                        className="teacher-profile__password"
                        onSubmit={(e) => {
                          e.preventDefault()
                          handleResetStudentPassword()
                        }}
                      >
                        <div className="teacher-profile__password-copy">
                          <strong>重设学生登录密码</strong>
                          <span>至少 6 位，更新后请将新密码告知学生。</span>
                        </div>
                        <div className="teacher-form-row">
                          <Field label="新密码" hint="至少 6 位，提交后旧密码立即失效">
                            <input
                              type="password"
                              value={resetPassword}
                              onChange={(e) => setResetPassword(e.target.value)}
                              autoComplete="new-password"
                              placeholder="输入新的登录密码"
                              className={inputClass}
                            />
                          </Field>
                          <Field label="确认新密码">
                            <input
                              type="password"
                              value={resetPasswordConfirm}
                              onChange={(e) => setResetPasswordConfirm(e.target.value)}
                              autoComplete="new-password"
                              placeholder="再次输入新密码"
                              className={inputClass}
                            />
                          </Field>
                        </div>
                        <button
                          type="submit"
                          disabled={passwordResetLoading}
                          className="game-primary-button teacher-profile__password-btn"
                        >
                          {passwordResetLoading ? '更新中…' : '更新学生密码'}
                        </button>
                      </form>

                    </section>
                    <section className="teacher-danger-zone">
                      <div><h4>删除学生账号</h4><p>删除账号及存档、鱼获、银行、奖励和记录，无法恢复。</p></div>
                      <button type="button" className="game-danger-button" disabled={loading || passwordResetLoading || playtimeLimitLoading} onClick={() => { setDeleteError(''); setDeleteTarget({ ...selectedStudent }) }}>删除账号</button>
                    </section>
                  </div>
                )}

                {activePanel === 'gold' && (
                  <form
                    className="teacher-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleGrantGold()
                    }}
                  >
                    <Field label="金币数量">
                      <input
                        type="number"
                        value={goldAmount}
                        onChange={(e) => setGoldAmount(e.target.value)}
                        placeholder="例如 300"
                        className={inputClass}
                        min="1"
                      />
                    </Field>
                    <Field label="备注（可选）">
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="如：本周练习表现优秀"
                        className={inputClass}
                      />
                    </Field>
                    <PresetRow
                      presets={GOLD_REWARD_PRESETS}
                      onSelect={applyGoldPreset}
                      renderLabel={(p) => `${p.label} +${p.amount}`}
                    />
                    <WarningBanner text={goldWarning} />
                    <button
                      type="submit"
                      disabled={loading || !goldAmount || goldAmount <= 0}
                      className="game-primary-button w-full py-3"
                    >
                      {loading ? '发放中…' : '确认发放金币'}
                    </button>
                  </form>
                )}

                {activePanel === 'energy' && (
                  <form
                    className="teacher-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleGrantEnergy()
                    }}
                  >
                    <div className="teacher-form-row">
                      <Field label="恢复能量" hint="当前规则：每场战斗消耗 1 点能量">
                        <input
                          type="number"
                          value={energyAmount}
                          onChange={(e) => setEnergyAmount(e.target.value)}
                          placeholder="如 3"
                          className={inputClass}
                          min="0"
                        />
                      </Field>
                      <Field
                        label="能量上限（可选）"
                        hint={`当前上限 ${selectedStudent.max_energy ?? 10}；若低于当前能量，会同步下调当前能量`}
                      >
                        <input
                          type="number"
                          value={energyMax}
                          onChange={(e) => setEnergyMax(e.target.value)}
                          placeholder="留空则不修改"
                          className={inputClass}
                          min="0"
                        />
                      </Field>
                    </div>
                    <label className="teacher-checkbox">
                      <input
                        type="checkbox"
                        checked={energyFillToMax}
                        onChange={(e) => setEnergyFillToMax(e.target.checked)}
                      />
                      直接补满到当前/新上限
                    </label>
                    <Field label="备注（可选）">
                      <input
                        type="text"
                        value={energyReason}
                        onChange={(e) => setEnergyReason(e.target.value)}
                        placeholder="如：本节课练习达标"
                        className={inputClass}
                      />
                    </Field>
                    <PresetRow
                      presets={ENERGY_REWARD_PRESETS}
                      onSelect={applyEnergyPreset}
                      renderLabel={(p) => `${p.label} +${p.amount}`}
                    />
                    <button
                      type="button"
                      className="teacher-preset-chip"
                      onClick={() => {
                        setEnergyFillToMax(true)
                        setEnergyReason('老师补满能量')
                      }}
                    >
                      一键补满
                    </button>
                    <WarningBanner text={energyWarning} />
                    <button type="submit" disabled={loading} className="game-primary-button w-full py-3">
                      {loading ? '处理中…' : '确认恢复/调整能量'}
                    </button>
                  </form>
                )}

                {activePanel === 'reward' && (
                  <form
                    className="teacher-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleGrantReward()
                    }}
                  >
                    <div className="teacher-segment">
                      <button
                        type="button"
                        className={cn('teacher-segment__btn', rewardMode === 'item' && 'teacher-segment__btn--active')}
                        onClick={() => setRewardMode('item')}
                      >
                        商店道具
                      </button>
                      <button
                        type="button"
                        className={cn('teacher-segment__btn', rewardMode === 'pokemon' && 'teacher-segment__btn--active')}
                        onClick={() => setRewardMode('pokemon')}
                      >
                        宝可梦
                      </button>
                    </div>
                    <PresetRow presets={ITEM_REWARD_PRESETS} onSelect={applyItemPreset} />
                    {rewardMode === 'item' ? (
                      <div className="teacher-form-row teacher-form-row--3">
                        <Field label="道具分类">
                          <select
                            value={rewardItemType}
                            onChange={(e) => handleRewardItemTypeChange(e.target.value)}
                            className={inputClass}
                          >
                            {Object.entries(SHOP_REWARD_ITEMS).map(([key, group]) => (
                              <option key={key} value={key}>
                                {group.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="道具" hint={selectedRewardItemHint}>
                          <select
                            value={rewardItemKey}
                            onChange={(e) => setRewardItemKey(e.target.value)}
                            className={inputClass}
                          >
                            {Object.entries(SHOP_REWARD_ITEMS[rewardItemType].items).map(([key, item]) => (
                              <option key={key} value={key}>
                                {getRewardItemOptionText(rewardItemType, item)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="数量">
                          <input
                            type="number"
                            value={rewardQuantity}
                            onChange={(e) => setRewardQuantity(e.target.value)}
                            min="1"
                            className={inputClass}
                          />
                        </Field>
                      </div>
                    ) : (
                      <div className="teacher-form-row">
                        <Field label="宝可梦">
                          <select
                            value={rewardPokemonId}
                            onChange={(e) => setRewardPokemonId(e.target.value)}
                            className={inputClass}
                          >
                            {OFFICIAL_DEX_MONSTERS.map((mon) => (
                              <option key={mon.id} value={mon.id}>
                                No.{String(mon.dexNo ?? mon.pokedexId ?? mon.id).padStart(3, '0')} {mon.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="等级">
                          <input
                            type="number"
                            value={rewardPokemonLevel}
                            onChange={(e) => setRewardPokemonLevel(e.target.value)}
                            min="1"
                            max="100"
                            className={inputClass}
                          />
                        </Field>
                      </div>
                    )}
                    <Field label="奖励备注（可选）">
                      <input
                        type="text"
                        value={rewardReason}
                        onChange={(e) => setRewardReason(e.target.value)}
                        placeholder="如：阶段测试奖励"
                        className={inputClass}
                      />
                    </Field>
                    <WarningBanner text={rewardWarning} />
                    <button type="submit" disabled={loading} className="game-primary-button w-full py-3">
                      {loading ? '发放中…' : '确认发放奖励'}
                    </button>
                  </form>
                )}

                {activePanel === 'logs' && (
                  <div className="teacher-logs">
                    <div className="teacher-segment teacher-segment--compact">
                      <button
                        type="button"
                        className={cn('teacher-segment__btn', logTab === 'gold' && 'teacher-segment__btn--active')}
                        onClick={() => setLogTab('gold')}
                      >
                        金币记录
                      </button>
                      <button
                        type="button"
                        className={cn('teacher-segment__btn', logTab === 'energy' && 'teacher-segment__btn--active')}
                        onClick={() => setLogTab('energy')}
                      >
                        能量记录
                      </button>
                      <button
                        type="button"
                        className={cn('teacher-segment__btn', logTab === 'gameplay' && 'teacher-segment__btn--active')}
                        onClick={() => setLogTab('gameplay')}
                      >
                        游玩动向
                      </button>
                    </div>
                    {logTab === 'gold' ? (
                      <LogList
                        logs={goldLogs}
                        emptyText="暂无金币记录"
                        renderAmount={(log) => (
                          <span className={log.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {log.amount > 0 ? '+' : ''}
                            {log.amount}
                          </span>
                        )}
                        renderMeta={(log) => `余额 ${log.balance_after}`}
                      />
                    ) : logTab === 'energy' ? (
                      <LogList
                        logs={energyLogs}
                        emptyText="暂无能量记录"
                        renderAmount={(log) => (
                          <span
                            className={
                              log.amount > 0 ? 'text-emerald-600' : log.amount < 0 ? 'text-rose-600' : 'text-slate-500'
                            }
                          >
                            {log.amount > 0 ? '+' : ''}
                            {log.amount}
                          </span>
                        )}
                        renderMeta={(log) => `能量 ${log.energy_after}/${log.max_energy_after}`}
                      />
                    ) : (
                      <div className="teacher-gameplay-logs">
                        <div className="teacher-gameplay-controls">
                          <Field label="查看范围">
                            <select className={inputClass} value={gameplayLogScope} onChange={(event) => handleGameplayScopeChange(event.target.value)}>
                              <option value="all">全部学生</option><option value="student">当前学生</option>
                            </select>
                          </Field>
                          <Field label="记录类型">
                            <select className={inputClass} value={gameplayLogFilter} onChange={(event) => setGameplayLogFilter(event.target.value)}>
                              {GAMEPLAY_LOG_FILTERS.map((filter) => <option key={filter.id} value={filter.id}>{filter.label}</option>)}
                            </select>
                          </Field>
                          <button type="button" className="game-soft-button" onClick={() => loadGameplayLogs(selectedStudent?.id, gameplayLogScope)} disabled={gameplayLogsLoading}>
                            <i className="fa-solid fa-rotate-right" />{gameplayLogsLoading ? '读取中…' : '刷新'}
                          </button>
                        </div>
                        <GameplayLogList
                          logs={filteredGameplayLogs}
                          emptyText={gameplayLogsLoading ? '正在读取游玩动向…' : '暂无游玩动向记录'}
                        />
                      </div>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
      {confirmation && <ConfirmDialog key={confirmation.title} {...confirmation} onConfirm={finishConfirmation} onCancel={() => finishConfirmation(false)} />}
      {deleteTarget && <ConfirmDialog title="删除学生账号" description={`${deleteTarget.nickname || deleteTarget.username}（@${deleteTarget.username}）\n账号、存档与游戏记录将永久删除，无法恢复。`} confirmLabel="确认删除" danger fieldLabel="你的教师登录密码" fieldType="password" busy={deleteBusy} error={deleteError} onConfirm={handleDeleteStudent} onCancel={() => setDeleteTarget(null)} />}
    </div>
  )
}
