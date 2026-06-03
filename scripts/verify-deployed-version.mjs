#!/usr/bin/env node
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const ROOT_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const DEFAULT_SITE_URL = 'https://pokemongame.site/'
const execFileAsync = promisify(execFile)

const args = process.argv.slice(2)
const targetArg = args.find((arg) => !arg.startsWith('--'))
const targetUrl = new URL(targetArg || DEFAULT_SITE_URL)
if (!targetUrl.pathname.endsWith('/')) {
  targetUrl.pathname = `${targetUrl.pathname}/`
}

const warnings = []
const errors = []
const checks = []

const addCheck = (status, label, detail) => {
  checks.push({ status, label, detail })
}

const addWarning = (label, detail) => {
  warnings.push({ label, detail })
  addCheck('warn', label, detail)
}

const addError = (label, detail) => {
  errors.push({ label, detail })
  addCheck('error', label, detail)
}

const addOk = (label, detail) => {
  addCheck('ok', label, detail)
}

const parseMaxAge = (cacheControl) => {
  const match = String(cacheControl || '').match(/max-age=(\d+)/i)
  return match ? Number(match[1]) : null
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const parseHeaderBlock = (rawHeaders) => {
  const sections = String(rawHeaders || '')
    .split(/\r?\n\r?\n/)
    .map((section) => section.trim())
    .filter(Boolean)

  const last = sections.at(-1) || ''
  const lines = last.split(/\r?\n/).filter(Boolean)
  const statusLine = lines.shift() || ''
  const headers = new Map()
  lines.forEach((line) => {
    const separator = line.indexOf(':')
    if (separator <= 0) return
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    headers.set(key, value)
  })
  const statusMatch = statusLine.match(/\s(\d{3})\s/)
  return {
    status: statusMatch ? Number(statusMatch[1]) : 0,
    headers
  }
}

const fetchWithCurl = async (requestUrl, { label, accept } = {}) => {
  const commonArgs = [
    '--max-time', '20',
    '--silent',
    '--show-error',
    '--location',
    '-H', 'Cache-Control: no-cache'
  ]
  if (accept) {
    commonArgs.push('-H', `Accept: ${accept}`)
  }

  const headerResult = await execFileAsync('curl', [
    ...commonArgs,
    '-I',
    requestUrl.toString()
  ], {
    cwd: ROOT_DIR,
    maxBuffer: 8 * 1024 * 1024
  })
  const parsedHeaders = parseHeaderBlock(headerResult.stdout)
  if (!parsedHeaders.status || parsedHeaders.status >= 400) {
    throw new Error(`${label || requestUrl.pathname} 请求失败: HTTP ${parsedHeaders.status || '未知'}`)
  }

  const bodyResult = await execFileAsync('curl', [
    ...commonArgs,
    requestUrl.toString()
  ], {
    cwd: ROOT_DIR,
    maxBuffer: 12 * 1024 * 1024
  })

  return {
    url: requestUrl,
    text: bodyResult.stdout,
    response: {
      ok: parsedHeaders.status >= 200 && parsedHeaders.status < 300,
      status: parsedHeaders.status,
      headers: {
        get(name) {
          return parsedHeaders.headers.get(String(name || '').toLowerCase()) || null
        }
      }
    }
  }
}

const requestText = async (url, { label, accept } = {}) => {
  const requestUrl = new URL(url)
  requestUrl.searchParams.set('__verify', Date.now().toString(36))
  let lastError = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(requestUrl, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          ...(accept ? { Accept: accept } : {})
        }
      })
      const text = await response.text()
      if (!response.ok) {
        throw new Error(`${label || requestUrl.pathname} 请求失败: HTTP ${response.status}`)
      }
      return {
        url: requestUrl,
        text,
        response
      }
    } catch (error) {
      lastError = error
      if (attempt < 2) {
        await sleep(250 * (attempt + 1))
      }
    }
  }

  try {
    return await fetchWithCurl(requestUrl, { label, accept })
  } catch (curlError) {
    throw new Error(`${label || requestUrl.pathname} 请求失败: ${curlError?.message || lastError?.message || lastError}`)
  }
}

const parseEntryScript = (html) => {
  const match = html.match(/<script[^>]+src="([^"]*\/assets\/index-([A-Za-z0-9_-]+)\.js)"/i)
  if (!match) return null
  return {
    src: match[1],
    hash: match[2]
  }
}

const parseSwBuildIds = (swText) => {
  const pageMatch = swText.match(/game-pages-([A-Za-z0-9_-]+)/)
  const staticMatch = swText.match(/game-static-([A-Za-z0-9_-]+)/)
  return {
    pageBuildId: pageMatch?.[1] || null,
    staticBuildId: staticMatch?.[1] || null
  }
}

const readLocalVersion = async () => {
  try {
    const content = await fs.readFile(path.join(ROOT_DIR, 'dist', 'version.json'), 'utf8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

const formatValue = (value) => value == null || value === '' ? '无' : String(value)

const main = async () => {
  const siteLabel = targetUrl.toString()
  console.log(`[verify-deploy] target ${siteLabel}`)

  const localVersion = await readLocalVersion()
  if (localVersion) {
    addOk(
      '检测到本地 dist/version.json',
      `buildId=${formatValue(localVersion.buildId)} entryHash=${formatValue(localVersion.entryHash)}`
    )
  } else {
    addWarning('未找到本地 dist/version.json', '将只校验线上文件之间是否自洽，不比较本地构建。')
  }

  const versionResult = await requestText(new URL('version.json', targetUrl), {
    label: 'version.json',
    accept: 'application/json'
  })
  const versionCacheControl = versionResult.response.headers.get('cache-control')
  let remoteVersion
  try {
    remoteVersion = JSON.parse(versionResult.text)
  } catch (error) {
    throw new Error(`version.json 不是合法 JSON: ${error.message}`)
  }

  if (!remoteVersion?.buildId || !remoteVersion?.entryHash) {
    addError(
      'version.json 缺少关键信息',
      `buildId=${formatValue(remoteVersion?.buildId)} entryHash=${formatValue(remoteVersion?.entryHash)}`
    )
  } else {
    addOk(
      '线上 version.json 可用',
      `buildId=${remoteVersion.buildId} entryHash=${remoteVersion.entryHash} cache-control=${formatValue(versionCacheControl)}`
    )
  }

  const versionMaxAge = parseMaxAge(versionCacheControl)
  if (versionMaxAge != null && versionMaxAge > 600) {
    addWarning('version.json CDN 缓存偏长', `max-age=${versionMaxAge}s，老用户自动切新版的窗口会变长。`)
  }

  const indexResult = await requestText(targetUrl, {
    label: 'index.html',
    accept: 'text/html'
  })
  const indexCacheControl = indexResult.response.headers.get('cache-control')
  const entryScript = parseEntryScript(indexResult.text)
  if (!entryScript) {
    addError('首页未找到入口脚本', 'index.html 中没有匹配到 /assets/index-*.js。')
  } else {
    addOk('首页入口脚本存在', `${entryScript.src} (entryHash=${entryScript.hash})`)
    if (!entryScript.src.startsWith('/assets/index-')) {
      addError('入口脚本不是根路径资源', `当前入口为 ${entryScript.src}，应为 /assets/index-*.js。`)
    }
  }

  const indexMaxAge = parseMaxAge(indexCacheControl)
  if (indexMaxAge != null && indexMaxAge > 600) {
    addWarning('首页 CDN 缓存偏长', `max-age=${indexMaxAge}s，新首页传播可能会稍慢。`)
  }

  const hasEarlyGuard = (
    indexResult.text.includes('game:cache-flush-once')
    && indexResult.text.includes('game:app-entry-hash')
    && indexResult.text.includes('version.json')
  )
  if (!hasEarlyGuard) {
    addError('首页缺少早期版本守卫', 'React 启动前的 version.json 对比脚本没有找到。')
  } else {
    addOk('首页早期更新守卫存在', '已检测到 version.json 预检查与缓存清理标记。')
  }

  if (entryScript && remoteVersion?.entryHash && entryScript.hash !== remoteVersion.entryHash) {
    addError(
      'version.json 与首页入口 hash 不一致',
      `version.json=${remoteVersion.entryHash} index.html=${entryScript.hash}`
    )
  } else if (entryScript && remoteVersion?.entryHash) {
    addOk('version.json 与首页入口一致', `entryHash=${remoteVersion.entryHash}`)
  }

  if (entryScript) {
    const assetResult = await requestText(new URL(entryScript.src, targetUrl), {
      label: 'entry asset',
      accept: 'text/javascript,application/javascript'
    })
    const contentType = assetResult.response.headers.get('content-type')
    addOk('线上入口 JS 可访问', `${entryScript.src} content-type=${formatValue(contentType)}`)
  }

  const swResult = await requestText(new URL('sw.js', targetUrl), {
    label: 'sw.js',
    accept: 'application/javascript,text/javascript'
  })
  const hasSwUpdateFlags = swResult.text.includes('skipWaiting()') && swResult.text.includes('clientsClaim()')
  if (!hasSwUpdateFlags) {
    addError('Service Worker 缺少即时接管配置', 'sw.js 中没有同时找到 skipWaiting() 和 clientsClaim()。')
  } else {
    addOk('Service Worker 即时接管配置正常', '已检测到 skipWaiting() 与 clientsClaim()。')
  }

  const swBuildIds = parseSwBuildIds(swResult.text)
  if (!swBuildIds.pageBuildId || !swBuildIds.staticBuildId) {
    addError(
      'Service Worker 缺少构建版本缓存名',
      `game-pages=${formatValue(swBuildIds.pageBuildId)} game-static=${formatValue(swBuildIds.staticBuildId)}`
    )
  } else {
    addOk(
      'Service Worker 构建缓存名存在',
      `game-pages=${swBuildIds.pageBuildId} game-static=${swBuildIds.staticBuildId}`
    )
  }

  if (remoteVersion?.buildId && swBuildIds.pageBuildId && remoteVersion.buildId !== swBuildIds.pageBuildId) {
    addError(
      'version.json 与 sw.js buildId 不一致',
      `version.json=${remoteVersion.buildId} sw.js=${swBuildIds.pageBuildId}`
    )
  } else if (remoteVersion?.buildId && swBuildIds.pageBuildId) {
    addOk('version.json 与 sw.js buildId 一致', `buildId=${remoteVersion.buildId}`)
  }

  if (entryScript && !swResult.text.includes(`assets/index-${entryScript.hash}.js`)) {
    addError('sw.js 未预缓存当前入口 JS', `未在 sw.js 中找到 assets/index-${entryScript.hash}.js`)
  } else if (entryScript) {
    addOk('sw.js 已预缓存当前入口 JS', `assets/index-${entryScript.hash}.js`)
  }

  if (localVersion) {
    if (remoteVersion?.buildId !== localVersion.buildId || remoteVersion?.entryHash !== localVersion.entryHash) {
      addError(
        '线上版本与本地 dist 不一致',
        `local buildId=${formatValue(localVersion.buildId)} entryHash=${formatValue(localVersion.entryHash)}; remote buildId=${formatValue(remoteVersion?.buildId)} entryHash=${formatValue(remoteVersion?.entryHash)}`
      )
    } else {
      addOk(
        '线上版本与本地 dist 一致',
        `buildId=${localVersion.buildId} entryHash=${localVersion.entryHash}`
      )
    }
  }

  checks.forEach(({ status, label, detail }) => {
    const prefix = status === 'ok' ? 'OK  ' : status === 'warn' ? 'WARN' : 'ERR '
    console.log(`${prefix} ${label}${detail ? ` - ${detail}` : ''}`)
  })

  console.log(
    `[verify-deploy] summary ok=${checks.filter((item) => item.status === 'ok').length} warn=${warnings.length} err=${errors.length}`
  )

  if (errors.length > 0) {
    process.exitCode = 1
  }
}

await main().catch((error) => {
  console.error(`[verify-deploy] failed ${error.message}`)
  process.exit(1)
})
