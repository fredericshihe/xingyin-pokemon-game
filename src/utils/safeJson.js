/**
 * 安全的 JSON 序列化工具
 * 防止循环引用导致的序列化失败
 */

/**
 * 安全地序列化对象为 JSON 字符串
 * 自动处理循环引用
 *
 * @param {*} obj - 要序列化的对象
 * @param {number} space - 缩进空格数（默认0）
 * @returns {string} JSON 字符串
 */
export const safeStringify = (obj, space = 0) => {
  const seen = new WeakSet()

  return JSON.stringify(obj, (key, value) => {
    // 处理对象类型
    if (typeof value === 'object' && value !== null) {
      // 检测循环引用
      if (seen.has(value)) {
        return '[Circular Reference]'
      }
      seen.add(value)
    }

    // 处理特殊值
    if (typeof value === 'function') {
      return '[Function]'
    }
    if (typeof value === 'symbol') {
      return '[Symbol]'
    }
    if (typeof value === 'undefined') {
      return '[Undefined]'
    }

    // 处理 NaN 和 Infinity
    if (typeof value === 'number') {
      if (Number.isNaN(value)) return '[NaN]'
      if (!Number.isFinite(value)) return '[Infinity]'
    }

    return value
  }, space)
}

/**
 * 安全地解析 JSON 字符串
 * 提供默认值和错误处理
 *
 * @param {string} jsonString - JSON 字符串
 * @param {*} fallback - 解析失败时的默认值
 * @returns {*} 解析后的对象或默认值
 */
export const safeParse = (jsonString, fallback = null) => {
  try {
    return JSON.parse(jsonString)
  } catch (error) {
    console.error('[JSON] Parse failed', { error, jsonString: jsonString?.substring(0, 100) })
    return fallback
  }
}

/**
 * 尝试序列化对象，失败时返回错误信息
 *
 * @param {*} obj - 要序列化的对象
 * @param {number} space - 缩进空格数
 * @returns {{ success: boolean, data?: string, error?: Error }}
 */
export const tryStringify = (obj, space = 0) => {
  try {
    const data = safeStringify(obj, space)
    return { success: true, data }
  } catch (error) {
    console.error('[JSON] Stringify failed', error)
    return { success: false, error }
  }
}

/**
 * 尝试解析 JSON，失败时返回错误信息
 *
 * @param {string} jsonString - JSON 字符串
 * @returns {{ success: boolean, data?: *, error?: Error }}
 */
export const tryParse = (jsonString) => {
  try {
    const data = JSON.parse(jsonString)
    return { success: true, data }
  } catch (error) {
    console.error('[JSON] Parse failed', error)
    return { success: false, error }
  }
}

/**
 * 深度克隆对象（使用 JSON 序列化）
 * 注意：会丢失函数、Symbol 等特殊类型
 *
 * @param {*} obj - 要克隆的对象
 * @returns {*} 克隆后的对象
 */
export const deepClone = (obj) => {
  try {
    return JSON.parse(safeStringify(obj))
  } catch (error) {
    console.error('[JSON] Deep clone failed', error)
    return obj
  }
}
