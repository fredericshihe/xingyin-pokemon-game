import { useState } from 'react'

export default function Login({ onLogin, onSwitchToRegister }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await onLogin(username, password)
      if (!result.success) {
        setError(result.error || '登录失败')
      }
    } catch (err) {
      setError('登录失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page auth-page--login game-app-bg">
      <div className="auth-scenery" aria-hidden="true">
        <span className="auth-cloud auth-cloud--one" />
        <span className="auth-cloud auth-cloud--two" />
        <img className="auth-pokemon auth-pokemon--bulbasaur" src="/assets/pokemon/official-artwork/1.png" alt="" />
        <img className="auth-pokemon auth-pokemon--pikachu" src="/assets/pokemon/official-artwork/25.png" alt="" />
        <img className="auth-pokemon auth-pokemon--eevee" src="/assets/pokemon/official-artwork/133.png" alt="" />
      </div>

      <main className="auth-shell auth-shell--login" aria-labelledby="login-title">
        <section className="auth-hero" aria-hidden="true">
          <div className="auth-mascot-stage auth-mascot-stage--login">
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
            <img className="auth-mascot auth-mascot--left" src="/assets/pokemon/official-artwork/1.png" alt="" />
            <img className="auth-mascot auth-mascot--hero" src="/assets/pokemon/official-artwork/25.png" alt="" />
            <img className="auth-mascot auth-mascot--right" src="/assets/pokemon/official-artwork/133.png" alt="" />
          </div>

          <div className="auth-hero-copy">
            <div className="auth-badge">
              <i className="fa-solid fa-music"></i>
              星音学院
            </div>
            <h1>星音宝可梦</h1>
            <p className="auth-hero-subtitle">XINGYIN POKEMON JOURNEY</p>
            <div className="auth-route-card">
              <span><i className="fa-solid fa-paw"></i> 伙伴养成</span>
              <span><i className="fa-solid fa-list-check"></i> 课堂任务</span>
              <span><i className="fa-solid fa-cloud-arrow-up"></i> 云端存档</span>
            </div>
          </div>
        </section>

        <section className="auth-panel" aria-label="登录表单">
          <div className="auth-panel__header">
            <span>欢迎回来</span>
            <h2 id="login-title">登录账号</h2>
            <p>输入老师表中记录的用户名和密码。</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form" autoComplete="on">
            <label className="auth-field" htmlFor="login-username">
              <span>用户名</span>
              <div className="auth-input-wrap">
                <i className="fa-solid fa-user"></i>
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck="false"
                  placeholder="输入用户名"
                  required
                />
              </div>
            </label>

            <label className="auth-field" htmlFor="login-password">
              <span>密码</span>
              <div className="auth-input-wrap auth-input-wrap--password">
                <i className="fa-solid fa-lock"></i>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="输入密码"
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

            {error && (
              <div className="auth-error" role="alert">
                <i className="fa-solid fa-circle-exclamation"></i>
                {error}
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
                  登录中
                </>
              ) : (
                <>
                  登录
                  <i className="fa-solid fa-arrow-right"></i>
                </>
              )}
            </button>
          </form>

          <div className="auth-switch">
            <span>还没有账号？</span>
            <button type="button" onClick={onSwitchToRegister}>
              立即注册
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
