import { supabase } from '../supabaseClient'

const SESSION_KEY = 'pokemon_game_profile'
const SESSION_PROFILE_COLUMNS = [
  'id',
  'email',
  'username',
  'nickname',
  'role',
  'teacher_id',
  'gold',
  'energy',
  'max_energy',
  'registration_status',
  'registration_requested_at',
  'registration_reviewed_at',
  'registration_rejection_reason',
  'created_at'
]
const SESSION_PROFILE_SELECT = SESSION_PROFILE_COLUMNS.join(', ')

const normalizeUsername = (username) => username.trim()
const normalizePassword = (password) => String(password ?? '').trim()
const normalizeApprovalStatus = (profile) => profile?.registration_status || 'approved'

const getApprovalBlockedMessage = (profile) => {
  const status = normalizeApprovalStatus(profile)
  if (status === 'pending') {
    return '你的注册申请正在等待老师确认。请尽快通知老师登录教师工作台，通过你的账号申请后再登录。'
  }
  if (status === 'rejected') {
    const reason = profile?.registration_rejection_reason?.trim()
    return reason
      ? `教师已拒绝该账号的注册申请：${reason}`
      : '教师已拒绝该账号的注册申请，请联系老师确认后重新处理。'
  }
  return ''
}

const fetchProfileById = async (userId) => {
  const { data, error } = await supabase.rpc('get_table_user_profile', {
    p_user_id: userId
  })
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

const sanitizeProfileSession = (profile) => {
  if (!profile || typeof profile !== 'object') return null

  return SESSION_PROFILE_COLUMNS.reduce((sessionProfile, key) => {
    if (profile[key] !== undefined) {
      sessionProfile[key] = profile[key]
    }
    return sessionProfile
  }, {})
}

const saveProfileSession = (profile) => {
  const sessionProfile = sanitizeProfileSession(profile)
  if (!sessionProfile?.id) return
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(sessionProfile))
  } catch (error) {
    console.warn('[Auth] 无法保存会话到本地存储', { error })
    if (error.name === 'QuotaExceededError') {
      console.error('[Auth] 存储空间已满，请清理浏览器数据')
    }
    // 会话保存失败不影响登录，只是下次需要重新登录
  }
}

const clearProfileSession = () => {
  window.localStorage.removeItem(SESSION_KEY)
}

const getProfileSession = () => {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    const sanitized = sanitizeProfileSession(parsed)
    if (!sanitized?.id) {
      clearProfileSession()
      return null
    }

    if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
      saveProfileSession(sanitized)
    }
    return sanitized
  } catch {
    clearProfileSession()
    return null
  }
}

// 简化的认证系统 - 不使用邮箱验证
export const authService = {
  getStoredProfile() {
    return getProfileSession()
  },

  async refreshStoredProfile() {
    const storedProfile = getProfileSession()
    if (!storedProfile?.id) return null

    try {
      const latestProfile = await fetchProfileById(storedProfile.id)
      if (!latestProfile?.id) {
        clearProfileSession()
        return null
      }

      const approvalMessage = latestProfile.role === 'student' ? getApprovalBlockedMessage(latestProfile) : ''
      if (approvalMessage) {
        clearProfileSession()
        return null
      }

      saveProfileSession(latestProfile)
      return getProfileSession()
    } catch (error) {
      console.error('Session refresh error:', error)
      clearProfileSession()
      return null
    }
  },

  // 注册
  async register({ username, password, nickname, role, teacherUsername, teacherRegisterPassword }) {
    try {
      const cleanUsername = normalizeUsername(username)
      const cleanTeacherUsername = normalizeUsername(teacherUsername || '')
      const cleanRole = role === 'teacher' ? 'teacher' : 'student'

      if (cleanRole === 'student' && !cleanTeacherUsername) {
        return { success: false, error: '学生必须填写老师用户名' }
      }

      const { data: rpcRegistration, error: rpcRegistrationError } = await supabase.rpc('register_table_user', {
        p_username: cleanUsername,
        p_password: password,
        p_nickname: nickname,
        p_role: cleanRole,
        p_teacher_username: cleanTeacherUsername || null,
        p_teacher_registration_code: teacherRegisterPassword || null
      })

      if (!rpcRegistrationError) {
        const result = typeof rpcRegistration === 'string' ? JSON.parse(rpcRegistration) : rpcRegistration
        if (!result?.success) {
          return { success: false, error: result?.error || '注册失败' }
        }
        if (result.profile && cleanRole === 'teacher') {
          saveProfileSession(result.profile)
        }
        return {
          success: true,
          pendingApproval: Boolean(result.pendingApproval),
          message: result.message || (cleanRole === 'student'
            ? '注册申请已提交，请尽快通知老师确认。'
            : '注册成功！')
        }
      }

      const isMissingRegistrationFunction =
        rpcRegistrationError.code === 'PGRST202' ||
        rpcRegistrationError.message?.includes('register_table_user')
      if (isMissingRegistrationFunction) {
        return {
          success: false,
          error: '注册审核数据库函数尚未部署，请先执行最新 Supabase 数据库迁移后再注册。'
        }
      }

      console.error('Registration RPC error:', rpcRegistrationError)
      return { success: false, error: `注册失败: ${rpcRegistrationError.message}` }
    } catch (error) {
      console.error('Registration error:', error)
      return { success: false, error: error.message || '注册失败' }
    }
  },

  // 登录
  async login(username, password) {
    try {
      const cleanUsername = normalizeUsername(username)
      const cleanPassword = normalizePassword(password)

      const { data: rpcProfiles, error: rpcError } = await supabase.rpc('login_with_table_password', {
        p_username: cleanUsername,
        p_password: cleanPassword
      })

      let profiles = rpcProfiles
      if (rpcError) {
        const isMissingLoginFunction = rpcError.code === 'PGRST202' || rpcError.message?.includes('login_with_table_password')
        if (!isMissingLoginFunction) {
          console.error('Login query error:', rpcError)
          return { success: false, error: `登录查询失败: ${rpcError.message}` }
        }
        return {
          success: false,
          error: '登录函数尚未部署，请先执行最新 Supabase 数据库迁移后再登录。'
        }
      }

      let profile = profiles?.[0]
      if (!profile) {
        return { success: false, error: '用户名或密码错误' }
      }

      try {
        const latestProfile = await fetchProfileById(profile.id)
        if (latestProfile?.id) {
          profile = latestProfile
        }
      } catch (latestProfileError) {
        console.warn('Profile refresh after login failed:', latestProfileError)
      }

      const approvalMessage = profile.role === 'student' ? getApprovalBlockedMessage(profile) : ''
      if (approvalMessage) {
        return { success: false, error: approvalMessage }
      }

      saveProfileSession(profile)
      return { success: true }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, error: '登录失败' }
    }
  },

  // 登出
  async logout() {
    try {
      clearProfileSession()
      return { success: true }
    } catch (error) {
      console.error('Logout error:', error)
      return { success: false, error: error.message }
    }
  }
}
