import UnifiedBootScreen from '../UnifiedBootScreen'

/** @deprecated 使用 UnifiedBootScreen */
export default function GameEntryLoadingScreen(props) {
  return (
    <UnifiedBootScreen
      title={props.error ? '素材加载未完成' : '正在准备冒险世界'}
      phase={props.progress?.phase}
      detail={props.progress?.detail}
      progress={props.progress}
      error={props.error}
      actionLabel={props.onRetry ? '重新加载' : null}
      onAction={props.onRetry}
    />
  )
}
