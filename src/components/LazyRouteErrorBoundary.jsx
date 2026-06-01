import { Component } from 'react'
import { clearClientCaches, getExpectedGameUrl, isLikelyChunkLoadError } from '../utils/recoverStaleClient'

export default class LazyRouteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, clearing: false }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[route] lazy chunk failed', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleClearCacheReload = async () => {
    if (this.state.clearing) return
    this.setState({ clearing: true })
    try {
      await clearClientCaches()
    } catch (error) {
      console.warn('[route] cache clear failed', error)
    } finally {
      window.location.reload()
    }
  }

  render() {
    if (this.state.error) {
      const gameUrl = getExpectedGameUrl()
      const staleDeploy = isLikelyChunkLoadError(this.state.error)

      return (
        <div className="game-app-bg">
          <div className="game-gate-card game-card p-5 text-center space-y-3 relative z-[1]">
            <p className="text-xl font-bold text-slate-800">页面资源加载失败</p>
            <p className="text-sm text-slate-600 leading-relaxed text-left space-y-2">
              <span className="block">当前使用 <strong>GitHub Pages</strong> 托管，请按下面顺序排查：</span>
              <span className="block">1. 确认打开完整链接（含仓库名）：<code className="break-all">{gameUrl}</code></span>
              <span className="block">2. {staleDeploy ? '游戏刚更新，旧缓存可能导致 JS 404。' : '网络可能中断。'}请点「清除缓存并重试」。</span>
              <span className="block">3. 仍失败时用浏览器<strong>无痕模式</strong>重新打开上述链接。</span>
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="game-primary-button px-4 py-2"
                disabled={this.state.clearing}
                onClick={this.handleClearCacheReload}
              >
                {this.state.clearing ? '正在清除…' : '清除缓存并重试'}
              </button>
              <button type="button" className="game-soft-button px-4 py-2" onClick={this.handleReload}>
                仅刷新页面
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
