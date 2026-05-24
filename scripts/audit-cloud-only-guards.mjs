#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const SRC_DIR = path.join(ROOT_DIR, 'src')

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs'])
const OLD_HOOK_PATHS = [
  'src/hooks/useAuth.js',
  'src/hooks/useGameSave.js',
]

const toPosix = (filePath) => path.relative(ROOT_DIR, filePath).split(path.sep).join('/')

const readSourceFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await readSourceFiles(fullPath))
      continue
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath)
    }
  }

  return files
}

const lineContext = (lines, index, radius = 4) => {
  const start = Math.max(0, index - radius)
  const end = Math.min(lines.length, index + radius + 1)
  return lines.slice(start, end).join('\n')
}

const addViolation = (violations, code, file, line, message, excerpt) => {
  violations.push({
    code,
    file,
    line,
    message,
    excerpt: excerpt?.trim() || undefined,
  })
}

const canUseLocalStorage = (relativeFile, lines, index) => {
  const context = lineContext(lines, index)

  if (relativeFile === 'src/utils/authService.js') {
    return context.includes('SESSION_KEY') || context.includes('ProfileSession')
  }

  if (relativeFile === 'src/components/Game/OriginalGame.jsx') {
    return (
      context.includes('getLegacyTeacherRewardRecoveryStorageKey') ||
      context.includes('LegacyTeacherRewardRecovery') ||
      context.includes('legacy teacher reward recovery')
    )
  }

  return false
}

const canReferencePlainPassword = (relativeFile) => {
  return [
    'src/utils/authService.js',
    'src/components/Teacher/Dashboard.jsx',
  ].includes(relativeFile)
}

const requiredOriginalGameMarkers = [
  'load_cloud_game_save',
  'save_cloud_game_save',
  'save_cloud_game_state_with_resources',
  'begin_teacher_reward_claim',
  'confirm_teacher_reward_claim',
]

const files = await readSourceFiles(SRC_DIR)
const violations = []
const stats = {
  scannedFiles: files.length,
  localStorageReferences: 0,
  sessionStorageReferences: 0,
  selectStarReferences: 0,
  plainPasswordReferences: 0,
  legacyTeacherRewardRpcReferences: 0,
  atomicResourceFallbackReferences: 0,
  localFirstProgressHelperReferences: 0,
  directStudentResourceMutationReferences: 0,
  criticalCloudSaveHelperReferences: 0,
  localMapContentResetReferences: 0,
  directMapRuntimeSetterReferences: 0,
  trainerDailyCloudMarkers: 0,
}

for (const file of files) {
  const relativeFile = toPosix(file)
  const source = await fs.readFile(file, 'utf8')
  const lines = source.split(/\r?\n/)

  lines.forEach((line, index) => {
    const lineNumber = index + 1

    if (line.includes('localStorage')) {
      stats.localStorageReferences += 1
      if (!canUseLocalStorage(relativeFile, lines, index)) {
        addViolation(
          violations,
          'LOCAL_STORAGE_FORBIDDEN',
          relativeFile,
          lineNumber,
          '学生游戏必须云端唯一进度；除登录会话白名单和旧老师奖励补偿外，源码不得新增 localStorage。',
          line
        )
      }
    }

    if (line.includes('sessionStorage')) {
      stats.sessionStorageReferences += 1
      addViolation(
        violations,
        'SESSION_STORAGE_FORBIDDEN',
        relativeFile,
        lineNumber,
        '当前规则不支持本地/离线游戏，源码不得使用 sessionStorage 保存进度或状态。',
        line
      )
    }

    if (/\bselect\s*\(\s*['"`]\*['"`]\s*\)/.test(line)) {
      stats.selectStarReferences += 1
      addViolation(
        violations,
        'SELECT_STAR_FORBIDDEN',
        relativeFile,
        lineNumber,
        '前端查询用户/存档应使用字段白名单，避免把 plain_password 或冗余字段带入会话。',
        line
      )
    }

    if (line.includes('plain_password')) {
      stats.plainPasswordReferences += 1
      if (!canReferencePlainPassword(relativeFile)) {
        addViolation(
          violations,
          'PLAIN_PASSWORD_SCOPE',
          relativeFile,
          lineNumber,
          'plain_password 只能出现在用户表登录 fallback 或教师查看学生密码的界面，不能进入其它前端链路。',
          line
        )
      }
    }

    if (line.includes('claim_teacher_rewards')) {
      stats.legacyTeacherRewardRpcReferences += 1
      addViolation(
        violations,
        'LEGACY_TEACHER_REWARD_RPC_FORBIDDEN',
        relativeFile,
        lineNumber,
        '前端不应再调用旧 claim_teacher_rewards；老师奖励必须走 begin/confirm 两段式领取，避免奖励先标记领取但云存档未落库。',
        line
      )
    }

    if (line.includes('atomicUnavailable: true') || line.includes('missingAtomicResourceSaveRpcRef')) {
      stats.atomicResourceFallbackReferences += 1
      addViolation(
        violations,
        'ATOMIC_RESOURCE_FALLBACK_FORBIDDEN',
        relativeFile,
        lineNumber,
        '资源与云存档必须走 save_cloud_game_state_with_resources；不得恢复“RPC 缺失时拆成资源变动 + 普通存档”的半事务 fallback。',
        line
      )
    }

    if (/\b(addInventoryItem|addRewardMonster|gainExpAndLevelUp)\b/.test(line)) {
      stats.localFirstProgressHelperReferences += 1
      addViolation(
        violations,
        'LOCAL_FIRST_PROGRESS_HELPER_FORBIDDEN',
        relativeFile,
        lineNumber,
        '这些旧辅助会先改本地背包/队伍/经验再等待云端保存；云端唯一进度模式下不得恢复。',
        line
      )
    }

    if (
      relativeFile === 'src/components/Game/OriginalGame.jsx' &&
      /\b(updateGoldBalance|updateEnergyBalance|adjust_gold|adjust_energy)\b/.test(line)
    ) {
      stats.directStudentResourceMutationReferences += 1
      addViolation(
        violations,
        'DIRECT_STUDENT_RESOURCE_MUTATION_FORBIDDEN',
        relativeFile,
        lineNumber,
        '学生端关键资源变动必须和游戏快照一起走 save_cloud_game_state_with_resources；不得恢复单独 adjust_gold/adjust_energy 或前端包装函数。',
        line
      )
    }

    if (
      relativeFile === 'src/components/Game/OriginalGame.jsx' &&
      /\brequestCriticalCloudSave\b/.test(line)
    ) {
      stats.criticalCloudSaveHelperReferences += 1
      addViolation(
        violations,
        'CRITICAL_CLOUD_SAVE_HELPER_FORBIDDEN',
        relativeFile,
        lineNumber,
        '战斗微状态不得恢复为“本地先改再请求保存”的 helper；应在行动结算后提交完整云端检查点。',
        line
      )
    }

    if (
      relativeFile === 'src/components/Game/OriginalGame.jsx' &&
      /\b(activeMapContentVersion|setActiveMapContentVersion)\b/.test(line)
    ) {
      stats.localMapContentResetReferences += 1
      addViolation(
        violations,
        'LOCAL_MAP_CONTENT_RESET_FORBIDDEN',
        relativeFile,
        lineNumber,
        '地图内容版本迁移必须通过读档归一化后保存到云端，不得恢复为本地 effect 直接重置地图/位置。',
        line
      )
    }

    if (
      relativeFile === 'src/components/Game/OriginalGame.jsx' &&
      (line.includes('onPlayerMove={setPlayerPos}') || line.includes('onEncounterCooldownChange={setEncounterCooldownSteps}'))
    ) {
      stats.directMapRuntimeSetterReferences += 1
      addViolation(
        violations,
        'DIRECT_MAP_RUNTIME_SETTER_FORBIDDEN',
        relativeFile,
        lineNumber,
        '地图运行时回调必须走封装 handler，以便关键事件提交时携带最新位置/冷却并安排云端保存；不得直接传 setPlayerPos/setEncounterCooldownSteps。',
        line
      )
    }

    if (/\buse(Auth|GameSave)\b/.test(line)) {
      addViolation(
        violations,
        'OLD_HOOK_REFERENCE',
        relativeFile,
        lineNumber,
        '旧 Supabase Auth / 旧独立云存档 Hook 已删除，源码不得重新引用 useAuth 或 useGameSave。',
        line
      )
    }
  })
}

for (const oldHookPath of OLD_HOOK_PATHS) {
  try {
    await fs.stat(path.join(ROOT_DIR, oldHookPath))
    addViolation(
      violations,
      'OLD_HOOK_FILE_EXISTS',
      oldHookPath,
      1,
      '旧认证/旧存档 Hook 不应恢复到仓库中。',
      oldHookPath
    )
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

const originalGamePath = path.join(ROOT_DIR, 'src/components/Game/OriginalGame.jsx')
const originalGameSource = await fs.readFile(originalGamePath, 'utf8')
for (const marker of requiredOriginalGameMarkers) {
  if (!originalGameSource.includes(marker)) {
    addViolation(
      violations,
      'MISSING_CLOUD_RPC_MARKER',
      'src/components/Game/OriginalGame.jsx',
      1,
      `主游戏链路缺少关键云端 RPC 标记：${marker}`,
      marker
    )
  }
}

const trainerDailyCloudMarkers = [
  {
    marker: 'dailyTrainerBattleIds: shouldResetDailyEvents ? [] : uniqueStringList(source.dailyTrainerBattleIds)',
    message: '每日训练家对战锁必须进入 world 归一化，才能被 createCloudSnapshot 持久化到云端。',
  },
  {
    marker: 'trainerVictoryCounts: normalizePositiveIntegerMap(source.trainerVictoryCounts)',
    message: '训练家累计胜场必须进入 world 归一化，才能跨设备同步每日成长难度。',
  },
  {
    marker: 'appendDailyTrainerBattleEvent(nextWorld, completedMapName, completedEventId)',
    message: '训练家胜利结算必须按地图隔离写入今日已战胜状态。',
  },
  {
    marker: 'isDailyScalingTrainer ? completedMapName : null',
    message: '普通训练家的累计胜场必须按地图隔离，避免跨地图难度和挑战锁串用。',
  },
  {
    marker: 'applyLocalCommittedCloudSnapshot(normalizedSnapshot)',
    message: '普通云端提交被接受后必须立即应用本次提交快照，避免胜利后的每日训练家锁在本地交互中短暂丢失。',
  },
  {
    marker: 'world: normalizeWorldState(gameData.world',
    message: '云端快照必须通过 normalizeWorldState 写入 world，避免新增 world 字段只停留在本地状态。',
  },
]

for (const { marker, message } of trainerDailyCloudMarkers) {
  if (originalGameSource.includes(marker)) {
    stats.trainerDailyCloudMarkers += 1
  } else {
    addViolation(
      violations,
      'TRAINER_DAILY_CLOUD_MARKER_MISSING',
      'src/components/Game/OriginalGame.jsx',
      1,
      message,
      marker
    )
  }
}

const summary = {
  ok: violations.length === 0,
  stats,
  checkedRules: [
    'no unauthorized localStorage',
    'no sessionStorage',
    'no select(*) in src',
    'plain_password limited to auth fallback and teacher dashboard',
    'no legacy claim_teacher_rewards calls in src',
    'no atomic resource half-transaction fallback',
    'no local-first inventory/reward/exp helpers',
    'no direct student gold/energy mutation helper in main game',
    'no requestCriticalCloudSave helper in main game',
    'no local map-content reset effect in main game',
    'no direct map runtime setter passthrough in main game',
    'old auth/save hooks absent',
    'main game still references required cloud save/reward RPCs',
    'daily trainer lock and victory count are cloud snapshot fields',
  ],
  violations,
}

console.log(JSON.stringify(summary, null, 2))

if (violations.length > 0) {
  process.exitCode = 1
}
