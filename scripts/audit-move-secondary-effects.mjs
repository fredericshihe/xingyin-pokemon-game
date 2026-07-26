#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { withViteAuditServer } from './load-vite-module.mjs'

const PRIMARY_STATUSES = new Set(['sleep', 'poison', 'burn', 'paralysis', 'freeze'])
const VOLATILE_STATUSES = new Set(['flinch', 'confusion'])
const MOVE_EFFECTS = new Set(['heal', 'drain', 'mimic', 'nothing', 'teleport'])
const STAT_CHANGE_KEYS = new Set(['atk', 'def', 'spAtk', 'spDef', 'spd', 'accuracy', 'evasion'])
const STAT_CHANGE_TARGETS = new Set(['attacker', 'defender'])

const EXPECTED_MOVE_EFFECTS = {
  bite: { volatileStatus: 'flinch', volatileChance: 30 },
  bodyslam: { status: 'paralysis', statusChance: 30 },
  recover: { effect: 'heal' },
  mimic: { effect: 'mimic' },
  ember: { status: 'burn', statusChance: 10 },
  flamethrower: { status: 'burn', statusChance: 10 },
  fire_blast: { status: 'burn', statusChance: 10 },
  thundershock: { status: 'paralysis', statusChance: 10 },
  thunderbolt: { status: 'paralysis', statusChance: 10 },
  zap_cannon: { status: 'paralysis', statusChance: 100 },
  icebeam: { status: 'freeze', statusChance: 10 },
  blizzard: { status: 'freeze', statusChance: 10 },
  poison_jab: { status: 'poison', statusChance: 30 },
  hurricane: { volatileStatus: 'confusion', volatileChance: 30 },
  sky_attack: { volatileStatus: 'flinch', volatileChance: 30 },
  psychic: { statChange: { target: 'defender', stat: 'spDef', stages: -1, chance: 10 } },
  hypnosis: { status: 'sleep', statusChance: 100 },
  dream_eater: { effect: 'drain', requiresTargetStatus: 'sleep' },
  rock_slide: { volatileStatus: 'flinch', volatileChance: 30 },
  lick: { status: 'paralysis', statusChance: 30 },
  shadowball: { statChange: { target: 'defender', stat: 'spDef', stages: -1, chance: 20 } },
  iron_tail: { statChange: { target: 'defender', stat: 'def', stages: -1, chance: 30 } },
  moonblast: { statChange: { target: 'defender', stat: 'spAtk', stages: -1, chance: 30 } },
  snore: { requiresUserStatus: 'sleep', usableWhileAsleep: true, volatileStatus: 'flinch', volatileChance: 30 },
}

const SOURCE_CONTRACTS = [
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '主异常状态按 statusChance 掷骰',
    pattern: /move\.status\s*&&\s*rollChance\(move\.statusChance/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '畏缩/混乱按 volatileChance 掷骰',
    pattern: /move\.volatileStatus\s*&&\s*rollChance\(move\.volatileChance/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '能力变化按每条 statChange.chance 掷骰',
    pattern: /for \(const statChange of getMoveStatChanges\(move\)\)[\s\S]*?rollChance\(statChange\.chance/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '命中率同时计算自身命中和目标闪避等级',
    pattern: /attacker\?\.statStages\?\.accuracy[\s\S]*defender\?\.statStages\?\.evasion/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '伤害招式无效时不触发追加效果',
    pattern: /const canApplySecondaryEffect\s*=\s*move\.category === 'status' \|\| move\.power <= 0 \|\| effectiveness > 0/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '畏缩只在目标尚未行动时生效',
    pattern: /move\.volatileStatus !== 'flinch' \|\| canTargetStillAct/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '已有异常或属性免疫会阻止新异常',
    pattern: /target\.status \|\| hasStatusImmunity\(target, status\)/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '睡眠会在行动前阻止出招并倒计时',
    pattern: /nextMon\.status === 'sleep'[\s\S]*?睡着了，无法行动/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '睡眠中可用招式不会被睡眠回合开始判定挡住',
    pattern: /nextMon\.status === 'sleep'[\s\S]*?attemptedMove\?\.usableWhileAsleep[\s\S]*?还在睡梦中/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '冰冻会在行动前判定解冻',
    pattern: /nextMon\.status === 'freeze'[\s\S]*?rollChance\(20\)/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '麻痹会在行动前有概率无法行动',
    pattern: /nextMon\.status === 'paralysis'[\s\S]*?rollChance\(25\)[\s\S]*?因麻痹无法行动/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '满麻不会白白消耗混乱回合',
    pattern: /const pendingConfusionTurns = Math\.max\(0,\s*Number\(volatileStatuses\.confusion\) \|\| 0\)[\s\S]*?nextMon\.status === 'paralysis'[\s\S]*?pendingConfusionTurns > 0/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '冰冻中的特定破冰招式会直接解冻并继续行动',
    pattern: /attemptedMove && isFreezeSelfThawingMove\(attemptedMove\)[\s\S]*?破冰而出，准备使出/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '敌方被状态阻止行动后仍返回更新后的自身状态',
    pattern: /const runEnemyAction[\s\S]*?if \(!turnStart\.canAct\)[\s\S]*?attacker:\s*resolvedEnemyAfterTurnStart[\s\S]*?defender:\s*playerMon/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '我方被状态阻止行动后仍返回更新后的自身状态',
    pattern: /const runPlayerAction[\s\S]*?if \(!turnStart\.canAct\)[\s\S]*?attacker:\s*resolvedPlayerAfterTurnStart[\s\S]*?defender:\s*enemyMon/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '同回合后续行动使用上一动作返回的最新双方状态',
    pattern: /const playerFaints = resolveBattleActionFaintFlags\(playerResult, latestPlayer, latestEnemy\);[\s\S]*?latestPlayer = playerFaints\.actorMon \|\| latestPlayer;[\s\S]*?latestEnemy = playerFaints\.targetMon \|\| latestEnemy;[\s\S]*?const enemyFaints = resolveBattleActionFaintFlags\(enemyResult, latestEnemy, latestPlayer\);[\s\S]*?latestEnemy = enemyFaints\.actorMon \|\| latestEnemy;[\s\S]*?latestPlayer = enemyFaints\.targetMon \|\| latestPlayer/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '使用者自身状态要求会在扣 MP 前阻止无效招式',
    pattern: /getUserStatusRequirementFailureMessage\(move,\s*resolved\w+AfterTurnStart\.name\)[\s\S]*?resolved\w+AfterTurnStart\.status !== move\.requiresUserStatus[\s\S]*?commitBattleRuntimeCheckpoint/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '回合末中毒灼伤会按速度顺序结算',
    pattern: /const determineBattleEndOfTurnSideOrder =[\s\S]*?getEffectiveBattleStat\(playerMon, 'spd'\)[\s\S]*?getEffectiveBattleStat\(enemyMon, 'spd'\)[\s\S]*?Math\.random\(\) < 0\.5/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '双方都存活进入回合末时会先完整结算残余伤害再统一处理击倒',
    pattern: /if \(!pendingPlayerFaint && !pendingEnemyFaint && latestPlayer && latestEnemy\)[\s\S]*?determineBattleEndOfTurnSideOrder[\s\S]*?return finalizeResolvedFaints\(\)/,
  },
  {
    file: 'src/utils/battleAi.js',
    label: 'AI 不会选择使用者自身状态不满足的招式',
    pattern: /const hasUserStatusRequirement[\s\S]*?user\?\.status === move\.requiresUserStatus[\s\S]*?hasUserStatusRequirement\(move, enemyMon\)/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '中毒/灼伤会造成持续扣血',
    pattern: /nextMon\.status === 'poison' \|\| nextMon\.status === 'burn'/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '自我再生治疗效果已接入',
    pattern: /move\.effect === 'heal'/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '食梦吸血效果已接入',
    pattern: /move\.effect === 'drain'/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '模仿效果已接入',
    pattern: /move\.effect === 'mimic'/,
  },
  {
    file: 'src/components/Game/OriginalGame.jsx',
    label: '瞬间移动脱离战斗效果已接入',
    pattern: /move\.effect === 'teleport'[\s\S]*?escaped: teleportEscaped/,
  },
  {
    file: 'src/utils/battleDamage.js',
    label: '麻痹会降低速度',
    pattern: /stat === 'spd' && mon\?\.status === 'paralysis'/,
  },
  {
    file: 'src/utils/battleDamage.js',
    label: '灼伤会降低物理攻击',
    pattern: /stat === 'atk' && mon\?\.status === 'burn'/,
  },
]

const isIntegerInRange = (value, min, max) => (
  Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max
)

const compareStatChange = (actual, expected) => {
  if (!actual || !expected) return actual === expected
  return actual.target === expected.target &&
    actual.stat === expected.stat &&
    actual.stages === expected.stages &&
    actual.chance === expected.chance
}

const describeMoveEffect = (moveKey, move) => ({
  moveKey,
  name: move.name,
  category: move.category,
  power: move.power,
  status: move.status || null,
  statusChance: move.statusChance ?? null,
  volatileStatus: move.volatileStatus || null,
  volatileChance: move.volatileChance ?? null,
  statChange: move.statChange || null,
  statChanges: move.statChanges || null,
  effect: move.effect || null,
  requiresTargetStatus: move.requiresTargetStatus || null,
  requiresUserStatus: move.requiresUserStatus || null,
  usableWhileAsleep: Boolean(move.usableWhileAsleep),
})

await withViteAuditServer(async ({ rootDir, loadModule }) => {
  const { MOVES } = await loadModule('/src/utils/gameData.js')
  const issues = []
  const warnings = []
  const effectMoves = []

  for (const [moveKey, expected] of Object.entries(EXPECTED_MOVE_EFFECTS)) {
    const move = MOVES[moveKey]
    if (!move) {
      issues.push({ moveKey, issue: 'expected_move_missing', expected })
      continue
    }

    for (const [key, expectedValue] of Object.entries(expected)) {
      if (key === 'statChange') {
        if (!compareStatChange(move.statChange, expectedValue)) {
          issues.push({
            moveKey,
            issue: 'stat_change_contract_mismatch',
            expected: expectedValue,
            actual: move.statChange || null,
          })
        }
      } else if (move[key] !== expectedValue) {
        issues.push({
          moveKey,
          issue: 'effect_contract_mismatch',
          field: key,
          expected: expectedValue,
          actual: move[key] ?? null,
        })
      }
    }
  }

  for (const [moveKey, move] of Object.entries(MOVES)) {
    const statChanges = [
      ...(move.statChange ? [move.statChange] : []),
      ...(Array.isArray(move.statChanges) ? move.statChanges : []),
    ]
    const hasRuntimeEffect = Boolean(move.status || move.volatileStatus || statChanges.length > 0 || move.effect || move.requiresTargetStatus)
    if (hasRuntimeEffect) effectMoves.push(describeMoveEffect(moveKey, move))

    if (move.status) {
      if (!PRIMARY_STATUSES.has(move.status)) {
        issues.push({ moveKey, issue: 'unsupported_primary_status', status: move.status })
      }
      if (!isIntegerInRange(move.statusChance, 1, 100)) {
        issues.push({
          moveKey,
          issue: 'missing_or_invalid_status_chance',
          status: move.status,
          statusChance: move.statusChance ?? null,
        })
      }
    } else if (move.statusChance !== undefined) {
      issues.push({ moveKey, issue: 'orphan_status_chance', statusChance: move.statusChance })
    }

    if (move.volatileStatus) {
      if (!VOLATILE_STATUSES.has(move.volatileStatus)) {
        issues.push({ moveKey, issue: 'unsupported_volatile_status', volatileStatus: move.volatileStatus })
      }
      if (!isIntegerInRange(move.volatileChance, 1, 100)) {
        issues.push({
          moveKey,
          issue: 'missing_or_invalid_volatile_chance',
          volatileStatus: move.volatileStatus,
          volatileChance: move.volatileChance ?? null,
        })
      }
    } else if (move.volatileChance !== undefined) {
      issues.push({ moveKey, issue: 'orphan_volatile_chance', volatileChance: move.volatileChance })
    }

    for (const statChange of statChanges) {
      const { target, stat, stages, chance } = statChange
      if (!STAT_CHANGE_TARGETS.has(target)) {
        issues.push({ moveKey, issue: 'invalid_stat_change_target', statChange })
      }
      if (!STAT_CHANGE_KEYS.has(stat)) {
        issues.push({ moveKey, issue: 'invalid_stat_change_stat', statChange })
      }
      if (!Number.isInteger(stages) || stages === 0 || stages < -6 || stages > 6) {
        issues.push({ moveKey, issue: 'invalid_stat_change_stages', statChange })
      }
      if (!isIntegerInRange(chance, 1, 100)) {
        issues.push({ moveKey, issue: 'missing_or_invalid_stat_change_chance', statChange })
      }
    }

    if (move.effect && !MOVE_EFFECTS.has(move.effect)) {
      issues.push({ moveKey, issue: 'unsupported_move_effect', effect: move.effect })
    }

    if (move.requiresTargetStatus && !PRIMARY_STATUSES.has(move.requiresTargetStatus)) {
      issues.push({
        moveKey,
        issue: 'unsupported_required_status',
        requiresTargetStatus: move.requiresTargetStatus,
      })
    }

    if (move.requiresUserStatus && !PRIMARY_STATUSES.has(move.requiresUserStatus)) {
      issues.push({
        moveKey,
        issue: 'unsupported_required_user_status',
        requiresUserStatus: move.requiresUserStatus,
      })
    }

    if (move.usableWhileAsleep && move.requiresUserStatus !== 'sleep') {
      issues.push({
        moveKey,
        issue: 'usable_while_asleep_without_sleep_requirement',
        requiresUserStatus: move.requiresUserStatus ?? null,
      })
    }

    if (move.effect === 'drain' && (!(Number(move.power) > 0) || move.category === 'status')) {
      issues.push({ moveKey, issue: 'drain_requires_damaging_move', move: describeMoveEffect(moveKey, move) })
    }

    if (move.category === 'status' && !move.status && !move.volatileStatus && statChanges.length === 0 && !move.effect) {
      issues.push({ moveKey, issue: 'status_move_without_runtime_effect', move: describeMoveEffect(moveKey, move) })
    }
  }

  for (const contract of SOURCE_CONTRACTS) {
    const filePath = path.join(rootDir, contract.file)
    const source = fs.readFileSync(filePath, 'utf8')
    if (!contract.pattern.test(source)) {
      issues.push({
        issue: 'runtime_contract_missing',
        file: contract.file,
        contract: contract.label,
      })
    }
  }

  const originalGameSource = fs.readFileSync(path.join(rootDir, 'src/components/Game/OriginalGame.jsx'), 'utf8')
  if (!/poison:\s*\[[^\]]*'poison'[^\]]*'steel'[^\]]*\]/.test(originalGameSource)) {
    issues.push({
      issue: 'poison_immunity_missing_steel',
      file: 'src/components/Game/OriginalGame.jsx',
    })
  }

  const gameWrapperSource = fs.readFileSync(path.join(rootDir, 'src/components/Game/GameWrapper.jsx'), 'utf8')
  const appSource = fs.readFileSync(path.join(rootDir, 'src/App.jsx'), 'utf8')
  if (!gameWrapperSource.includes("import OriginalGame from './OriginalGame'") || appSource.includes("import Battle from './components/Game/Battle'")) {
    warnings.push({
      issue: 'battle_entrypoint_needs_manual_check',
      detail: '主入口可能不再只使用 OriginalGame，请确认旧 Battle.jsx 是否重新接入。',
    })
  }

  const summary = {
    auditedMoveCount: Object.keys(MOVES).length,
    effectMoveCount: effectMoves.length,
    expectedContractCount: Object.keys(EXPECTED_MOVE_EFFECTS).length,
    issueCount: issues.length,
    warningCount: warnings.length,
    effectMoves,
    warnings,
    issues,
  }

  console.log(JSON.stringify(summary, null, 2))
  if (issues.length > 0) {
    process.exitCode = 1
  }
})
