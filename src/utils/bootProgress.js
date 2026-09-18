/** Only asset work has a measurable percentage; cloud/render checks do not. */
export function mergeBootProgress(cloudLoading, assetProgress, assetsReady = false) {
  if (cloudLoading) {
    return {
      phase: '正在读取云端进度',
      detail: '正在同步你的队伍、背包、地图位置与奖励记录…',
      percent: null,
      hideResourceCounts: true
    }
  }
  if (assetsReady) return { percent: null, hideResourceCounts: true }
  return assetProgress || { percent: null }
}
