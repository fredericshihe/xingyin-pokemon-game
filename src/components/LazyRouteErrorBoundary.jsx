import { Component } from 'react'
import AppLoadingScreen from './AppLoadingScreen'

export default class LazyRouteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
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

  render() {
    if (this.state.error) {
      return (
        <div className="game-app-bg">
          <div className="game-card p-5 max-w-md mx-auto text-center space-y-3">
            <p className="text-xl font-bold text-slate-800">页面资源加载失败</p>
            <p className="text-sm text-slate-600 leading-relaxed">
              常见于公开链接路径配置错误或网络中断。请刷新页面；若仍失败，请用无痕模式重开，或联系老师确认 Cloudflare 已设置 <code>VITE_BASE_PATH=/</code> 并重新部署。
            </p>
            <button type="button" className="game-primary-button px-4 py-2" onClick={this.handleReload}>
              刷新重试
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
