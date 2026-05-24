import { useState } from 'react'

export default function Register({ onRegister, onSwitchToLogin }) {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    nickname: '',
    role: 'student',
    teacherUsername: '',
    teacherRegisterPassword: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleRoleChange = (role) => {
    setFormData((prev) => ({
      ...prev,
      role,
      teacherUsername: role === 'teacher' ? '' : prev.teacherUsername,
      teacherRegisterPassword: role === 'student' ? '' : prev.teacherRegisterPassword
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')

    if (formData.password !== formData.confirmPassword) {
      setError('两次密码不一致')
      return
    }

    if (formData.password.length < 6) {
      setError('密码至少6位')
      return
    }

    if (formData.role === 'student' && !formData.teacherUsername) {
      setError('学生必须填写老师用户名')
      return
    }

    if (formData.role === 'teacher' && formData.teacherRegisterPassword !== '198985') {
      setError('老师注册密码不正确')
      return
    }

    setLoading(true)

    try {
      const result = await onRegister(formData)
      if (!result.success) {
        setError(result.error || '注册失败')
      } else if (result.pendingApproval) {
        setNotice(result.message || '注册申请已提交，请通知老师确认。')
      }
    } catch (err) {
      setError('注册失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page auth-page--register game-app-bg">
      <div className="auth-scenery" aria-hidden="true">
        <span className="auth-cloud auth-cloud--one" />
        <span className="auth-cloud auth-cloud--two" />
        <img className="auth-pokemon auth-pokemon--charmander" src="/assets/pokemon/official-artwork/4.png" alt="" />
        <img className="auth-pokemon auth-pokemon--squirtle" src="/assets/pokemon/official-artwork/7.png" alt="" />
        <img className="auth-pokemon auth-pokemon--pikachu" src="/assets/pokemon/official-artwork/25.png" alt="" />
      </div>

      <main className="auth-shell auth-shell--register" aria-labelledby="register-title">
        <section className="auth-hero" aria-hidden="true">
          <div className="auth-mascot-stage auth-mascot-stage--register">
            <span className="auth-scene-sun" />
            <span className="auth-scene-mountain auth-scene-mountain--one" />
            <span className="auth-scene-mountain auth-scene-mountain--two" />
            <span className="auth-scene-tree auth-scene-tree--left" />
            <span className="auth-scene-tree auth-scene-tree--right" />
            <span className="auth-scene-path" />
            <span className="auth-scene-sign" />
            <span className="auth-stage-cloud auth-stage-cloud--left" />
            <span className="auth-stage-cloud auth-stage-cloud--right" />
            <span className="auth-scene-flowers auth-scene-flowers--left" />
            <span className="auth-scene-flowers auth-scene-flowers--right" />
            <img className="auth-mascot auth-mascot--left" src="/assets/pokemon/official-artwork/4.png" alt="" />
            <img className="auth-mascot auth-mascot--hero" src="/assets/pokemon/official-artwork/7.png" alt="" />
            <img className="auth-mascot auth-mascot--right" src="/assets/pokemon/official-artwork/25.png" alt="" />
          </div>

          <div className="auth-hero-copy">
            <div className="auth-badge">
              <i className="fa-solid fa-star"></i>
              新档案
            </div>
            <h1>星音宝可梦</h1>
            <p className="auth-hero-subtitle">XINGYIN POKEMON JOURNEY</p>
            <div className="auth-route-card">
              <span><i className="fa-solid fa-id-card"></i> 身份档案</span>
              <span><i className="fa-solid fa-paw"></i> 伙伴养成</span>
              <span><i className="fa-solid fa-cloud-arrow-up"></i> 云端存档</span>
            </div>
          </div>
        </section>

        <section className="auth-panel" aria-label="注册表单">
          <div className="auth-panel__header">
            <span>创建档案</span>
            <h2 id="register-title">注册账号</h2>
            <p>学生账号需要填写老师用户名。</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form" autoComplete="on">
            <label className="auth-field" htmlFor="register-username">
              <span>用户名</span>
              <div className="auth-input-wrap">
                <i className="fa-solid fa-user"></i>
                <input
                  id="register-username"
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck="false"
                  placeholder="字母数字组合"
                  required
                />
              </div>
            </label>

            <label className="auth-field" htmlFor="register-nickname">
              <span>昵称</span>
              <div className="auth-input-wrap">
                <i className="fa-solid fa-id-badge"></i>
                <input
                  id="register-nickname"
                  type="text"
                  name="nickname"
                  value={formData.nickname}
                  onChange={handleChange}
                  autoComplete="nickname"
                  placeholder="游戏中显示的名字"
                  required
                />
              </div>
            </label>

            <label className="auth-field" htmlFor="register-password">
              <span>密码</span>
              <div className="auth-input-wrap auth-input-wrap--password">
                <i className="fa-solid fa-lock"></i>
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  autoComplete="new-password"
                  placeholder="至少6位"
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  title={showPassword ? '隐藏密码' : '显示密码'}
                >
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </label>

            <label className="auth-field" htmlFor="register-confirm-password">
              <span>确认密码</span>
              <div className="auth-input-wrap auth-input-wrap--password">
                <i className="fa-solid fa-shield-heart"></i>
                <input
                  id="register-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  placeholder="再次输入密码"
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  aria-label={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                  title={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                >
                  <i className={`fa-solid ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </label>

            <fieldset className="auth-role-picker">
              <legend>身份</legend>
              <div>
                <button
                  type="button"
                  className={formData.role === 'student' ? 'auth-role-button auth-role-button--active' : 'auth-role-button'}
                  onClick={() => handleRoleChange('student')}
                >
                  <i className="fa-solid fa-user-graduate"></i>
                  学生
                </button>
                <button
                  type="button"
                  className={formData.role === 'teacher' ? 'auth-role-button auth-role-button--active' : 'auth-role-button'}
                  onClick={() => handleRoleChange('teacher')}
                >
                  <i className="fa-solid fa-chalkboard-user"></i>
                  老师
                </button>
              </div>
            </fieldset>

            {formData.role === 'student' && (
              <label className="auth-field" htmlFor="register-teacher">
                <span>老师用户名</span>
                <div className="auth-input-wrap">
                  <i className="fa-solid fa-school"></i>
                  <input
                    id="register-teacher"
                    type="text"
                    name="teacherUsername"
                    value={formData.teacherUsername}
                    onChange={handleChange}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck="false"
                    placeholder="你的老师的用户名"
                    required
                  />
                </div>
              </label>
            )}

            {formData.role === 'teacher' && (
              <label className="auth-field" htmlFor="register-teacher-code">
                <span>老师注册密码</span>
                <div className="auth-input-wrap auth-input-wrap--password">
                  <i className="fa-solid fa-key"></i>
                  <input
                    id="register-teacher-code"
                    type="password"
                    name="teacherRegisterPassword"
                    value={formData.teacherRegisterPassword}
                    onChange={handleChange}
                    autoComplete="off"
                    placeholder="输入老师专属注册密码"
                    required
                  />
                </div>
              </label>
            )}

            {error && (
              <div className="auth-error" role="alert">
                <i className="fa-solid fa-circle-exclamation"></i>
                {error}
              </div>
            )}

            {notice && (
              <div className="auth-notice" role="status">
                <i className="fa-solid fa-circle-check"></i>
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="auth-submit game-primary-button"
            >
              {loading ? (
                <>
                  <i className="fa-solid fa-rotate fa-spin"></i>
                  注册中
                </>
              ) : (
                <>
                  创建档案
                  <i className="fa-solid fa-arrow-right"></i>
                </>
              )}
            </button>
          </form>

          <div className="auth-switch">
            <span>已有账号？</span>
            <button type="button" onClick={onSwitchToLogin}>
              立即登录
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
