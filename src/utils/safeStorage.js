/**
 * 安全的 localStorage 操作工具
 * 提供友好的错误处理和用户反馈
 */

/**
 * 安全地设置 localStorage
 * @param {string} key - 存储键
 * @param {string} value - 存储值
 * @returns {{ success: boolean, error?: Error }}
 */
export const setLocalStorageSafe = (key, value) => {
  try {
    window.localStorage.setItem(key, value)
    return { success: true }
  } catch (error) {
    console.warn('[Storage] 无法保存到本地存储', { key, error })

    // 根据错误类型提供不同的提示
    if (error.name === 'QuotaExceededError') {
      console.error('存储空间已满，请清理浏览器数据')
      // 可以在这里集成 toast 提示
    } else if (error.name === 'SecurityError') {
      console.error('浏览器安全设置阻止了存储，请检查隐私模式')
    } else {
      console.error('设置可能无法保存，请检查浏览器设置')
    }

    return { success: false, error }
  }
}

/**
 * 安全地获取 localStorage
 * @param {string} key - 存储键
 * @param {*} fallback - 失败时的默认值
 * @returns {string|null}
 */
export const getLocalStorageSafe = (key, fallback = null) => {
  try {
    return window.localStorage.getItem(key)
  } catch (error) {
    console.warn('[Storage] 无法读取本地存储', { key, error })
    return fallback
  }
}

/**
 * 安全地删除 localStorage
 * @param {string} key - 存储键
 * @returns {{ success: boolean, error?: Error }}
 */
export const removeLocalStorageSafe = (key) => {
  try {
    window.localStorage.removeItem(key)
    return { success: true }
  } catch (error) {
    console.warn('[Storage] 无法删除本地存储', { key, error })
    return { success: false, error }
  }
}

/**
 * 安全地清空 localStorage
 * @returns {{ success: boolean, error?: Error }}
 */
export const clearLocalStorageSafe = () => {
  try {
    window.localStorage.clear()
    return { success: true }
  } catch (error) {
    console.warn('[Storage] 无法清空本地存储', error)
    return { success: false, error }
  }
}

/**
 * 检查 localStorage 是否可用
 * @returns {boolean}
 */
export const isLocalStorageAvailable = () => {
  try {
    const testKey = '__localStorage_test__'
    window.localStorage.setItem(testKey, 'test')
    window.localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}
