// 云存档保存锁 - 防止并发冲突
let cloudSaveLock = false
let cloudSaveQueue = []

/**
 * 带锁的云存档保存函数
 * 防止多标签页或快速连续保存导致的数据覆盖
 */
export const saveCloudGameWithLock = async (saveFunction) => {
  // 如果正在保存，加入队列
  if (cloudSaveLock) {
    console.warn('[CloudSave] Save in progress, queuing request')
    return new Promise((resolve) => {
      cloudSaveQueue.push({ saveFunction, resolve })
    })
  }

  cloudSaveLock = true
  try {
    const result = await saveFunction()
    return result
  } finally {
    cloudSaveLock = false

    // 处理队列中的下一个保存请求
    if (cloudSaveQueue.length > 0) {
      const { saveFunction: nextSave, resolve } = cloudSaveQueue.shift()
      saveCloudGameWithLock(nextSave).then(resolve)
    }
  }
}

/**
 * 清除保存队列（用于组件卸载时）
 */
export const clearCloudSaveQueue = () => {
  cloudSaveQueue = []
  cloudSaveLock = false
}
