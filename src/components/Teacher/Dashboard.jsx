import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../supabaseClient'
import { OFFICIAL_DEX_MONSTERS, POKEBALLS, POTIONS, EXP_POTIONS } from '../../utils/gameData'
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

const getPotionEffectText = (item) => {
  const safeItem = item && typeof item === 'object' ? item : {}
  const hp = Math.max(0, Number(safeItem.healAmount) || 0)
  const mp = Math.max(0, Number(safeItem.mpRestoreAmount) || 0)
  return [
    hp > 0 ? `HP +${hp}` : null,
    mp > 0 ? `MP +${mp}` : null
  ].filter(Boolean).join(' / ') || '恢复'
}

const getRewardItemEffectText = (itemType, item = {}) => {
  if (itemType === 'potion') return getPotionEffectText(item)
  if (itemType === 'expPotion') return `经验 +${item.expAmount || 0}`
  if (itemType === 'pokeball') return '捕捉道具'
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
  { id: 'logs', label: '记录', icon: 'fa-clock-rotate-left' }
]

const inputClass =
  'teacher-input w-full rounded-xl border border-slate-200/90 bg-white/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200'

function cn(...parts) {
  return parts.filter(Boolean).join(' ')
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

export default function TeacherDashboard({ profile }) {
  const [students, setStudents] = useState([])
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
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [approvalLoadingId, setApprovalLoadingId] = useState(null)
  const [goldLogs, setGoldLogs] = useState([])
  const [energyLogs, setEnergyLogs] = useState([])
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

  const goldWarning = getGoldRewardWarning(goldAmount)
  const energyWarning = getEnergyRewardWarning(energyAmount) || getMaxEnergyWarning(energyMax)
  const rewardWarning =
    rewardMode === 'item'
      ? getItemRewardWarning({ itemKey: rewardItemKey, quantity: rewardQuantity })
      : getPokemonRewardWarning(rewardPokemonLevel)
  const selectedRewardItem = SHOP_REWARD_ITEMS[rewardItemType]?.items?.[rewardItemKey]
  const selectedRewardItemHint = selectedRewardItem ? getRewardItemEffectText(rewardItemType, selectedRewardItem) : ''

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

  const studentById = useMemo(() => {
    const map = new Map()
    students.forEach((student) => {
      map.set(String(student.id), student)
    })
    return map
  }, [students])

  useEffect(() => {
    loadStudents()
    loadPendingStudents()
  }, [])

  useEffect(() => {
    if (selectedStudentId) {
      loadGoldLogs(selectedStudentId)
      loadEnergyLogs(selectedStudentId)
    } else {
      setGoldLogs([])
      setEnergyLogs([])
    }
  }, [selectedStudentId])

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

  const selectStudent = useCallback((student) => {
    if (!student?.id) return
    setSelectedStudentId(String(student.id))
    setMessage(null)
    setActivePanel('gold')
    setLogTab('gold')
  }, [])

  const handleStudentListActivate = useCallback((event) => {
    const target = event.target instanceof Element ? event.target : null
    const card = target?.closest?.('[data-student-id]')
    const studentId = card?.getAttribute('data-student-id')
    if (!studentId) return
    const student = studentById.get(String(studentId))
    if (student) selectStudent(student)
  }, [selectStudent, studentById])

  const handleStudentKeyDown = useCallback((event, student) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    selectStudent(student)
  }, [selectStudent])

  const patchStudent = (studentId, patch) => {
    setStudents((prev) => prev.map((student) => (
      student.id === studentId ? { ...student, ...patch } : student
    )))
  }

  const loadStudents = async () => {
    try {
      const { data, error } = await supabase.rpc('get_teacher_students', {
        p_teacher_id: profile.id
      })

      if (error) throw error
      setStudents(data || [])
    } catch (error) {
      console.error('Error loading students:', error)
    }
  }

  const loadPendingStudents = async () => {
    try {
      const { data, error } = await supabase.rpc('get_teacher_pending_students', {
        p_teacher_id: profile.id
      })

      if (error) throw error
      setPendingStudents(data || [])
    } catch (error) {
      console.error('Error loading pending students:', error)
    }
  }

  const handleReviewStudent = async (student, approved) => {
    if (!student?.id) return
    const rejectionReason = approved ? '' : window.prompt('请输入拒绝原因（可留空）：', '')
    if (!approved && rejectionReason === null) return

    setApprovalLoadingId(student.id)
    setMessage(null)
    try {
      const { data, error } = await supabase.rpc('review_student_registration', {
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
      const { data, error } = await supabase.rpc('get_student_gold_logs', {
        p_teacher_id: profile.id,
        p_student_id: studentId,
        p_limit: 20
      })
      if (error) throw error
      setGoldLogs(data || [])
    } catch (error) {
      console.error('Error loading gold logs:', error)
    }
  }

  const loadEnergyLogs = async (studentId) => {
    try {
      const { data, error } = await supabase.rpc('get_student_energy_logs', {
        p_teacher_id: profile.id,
        p_student_id: studentId,
        p_limit: 20
      })
      if (error) throw error
      setEnergyLogs(data || [])
    } catch (error) {
      console.error('Error loading energy logs:', error)
    }
  }

  const handleGrantGold = async () => {
    if (!selectedStudent || !goldAmount || goldAmount <= 0) {
      setMessage({ type: 'error', text: '请输入有效的金币数量' })
      return
    }
    const warning = getGoldRewardWarning(goldAmount)
    if (warning && !window.confirm(`${warning}\n\n确认继续发放吗？`)) return

    setLoading(true)
    setMessage(null)
    try {
      const { data, error } = await supabase.rpc('grant_gold', {
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
    if (warning && !window.confirm(`${warning}\n\n确认继续操作吗？`)) return

    setLoading(true)
    setMessage(null)
    try {
      const { data, error } = await supabase.rpc('grant_energy', {
        p_teacher_id: profile.id,
        p_student_id: selectedStudent.id,
        p_amount: amount > 0 ? amount : 0,
        p_reason: energyReason || '老师恢复能量',
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
        if (warning && !window.confirm(`${warning}\n\n确认继续发放吗？`)) return
        const result = await supabase.rpc('grant_item_reward', {
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
        if (warning && !window.confirm(`${warning}\n\n确认继续发放吗？`)) return
        const result = await supabase.rpc('grant_pokemon_reward', {
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
    if (!window.confirm(`确认更新 ${selectedStudent.nickname || selectedStudent.username} 的登录密码吗？\n\n旧密码会立即失效。`)) {
      return
    }

    setPasswordResetLoading(true)
    setMessage(null)
    try {
      const { data, error } = await supabase.rpc('teacher_reset_student_password', {
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
    <div className="teacher-dashboard game-app-bg">
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
          <span className="teacher-stat-pill teacher-stat-pill--muted">学生奖励与云端数据管理</span>
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
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            placeholder="搜索昵称或用户名"
            className={inputClass}
          />

          <section className="teacher-approval-box">
            <div className="teacher-approval-box__head">
              <h3>注册待确认</h3>
              <span>{pendingStudents.length}</span>
            </div>
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
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {students.length === 0 ? (
            <div className="teacher-empty">
              <i className="fa-solid fa-user-plus teacher-empty__icon" />
              <p>还没有学生</p>
              <p className="teacher-empty__hint">学生注册时需填写你的用户名</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <p className="teacher-empty-inline">没有匹配的学生</p>
          ) : (
            <>
              <div className={cn('teacher-selected-strip', selectedStudent && 'teacher-selected-strip--active')}>
                {selectedStudent ? (
                  <>
                    <i className="fa-solid fa-circle-check" />
                    已选：{selectedStudent.nickname || selectedStudent.username}
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-hand-pointer" />
                    点击学生卡片进行选择
                  </>
                )}
              </div>
              <ul
                className="teacher-student-list"
                onClickCapture={handleStudentListActivate}
                onPointerDownCapture={handleStudentListActivate}
              >
              {filteredStudents.map((student) => {
                const active = selectedStudentId === String(student.id)
                return (
                  <li key={student.id}>
                    <article
                      role="button"
                      tabIndex={0}
                      onClick={() => selectStudent(student)}
                      onPointerDown={() => selectStudent(student)}
                      onKeyDown={(event) => handleStudentKeyDown(event, student)}
                      className={cn('teacher-student-card', active && 'teacher-student-card--active')}
                      data-student-id={student.id}
                      aria-selected={active}
                      aria-label={`选择学生 ${student.nickname || student.username}`}
                    >
                      <StudentAvatar name={student.nickname} />
                      <div className="teacher-student-card__body">
                        <span className="teacher-student-card__name">{student.nickname}</span>
                        <span className="teacher-student-card__user">@{student.username}</span>
                        <span className="teacher-student-card__meta">
                          建档 {formatDate(student.created_at)}
                        </span>
                      </div>
                      <div className="teacher-student-card__stats">
                        <span className="teacher-student-card__gold">{student.gold ?? 0}</span>
                        <span className="teacher-student-card__energy">
                          {student.energy ?? 0}/{student.max_energy ?? 0}
                        </span>
                      </div>
                    </article>
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
                </dl>
                <form
                  className="teacher-profile__password"
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleResetStudentPassword()
                  }}
                >
                  <div className="teacher-profile__password-copy">
                    <strong>重设学生登录密码</strong>
                    <span>后台不再显示旧密码。设置成功后，学生需要使用新密码重新登录。</span>
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

              <nav className="teacher-tabs" aria-label="操作分类">
                {PANEL_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActivePanel(tab.id)}
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
                      <Field label="能量上限（可选）" hint={`当前上限 ${selectedStudent.max_energy ?? 10}`}>
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
                    <WarningBanner text="进化已统一改为等级触发，老师后台不再发放进化道具。" />
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
                    ) : (
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
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
