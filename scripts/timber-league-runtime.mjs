import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'
const traverse = traverseModule.default || traverseModule

// Execute production callbacks unchanged, replacing only animation, sound and persistence.
export async function loadBattleRuntime(rootDir, loadModule, state) {
  const source = readFileSync(resolve(rootDir, 'src/components/Game/OriginalGame.jsx'), 'utf8')
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })
  const declarations = new Map()
  const imports = new Map()
  const overrides = {
    normalizeMonsterAssetSource: (mon) => mon,
    getMoveEffectConfig: () => ({}),
    getBattleCinematicProfile: () => ({ durationMs: 0 }),
    getBattleMovePhaseDuration: () => 0,
    getBattleMoveImpactDelay: () => 0,
    getBattleLogReadDelay: () => 0,
    buildBattleImpactFeedback: () => null,
    wait: async () => {},
    addBattleLogAndWait: async (addLog, message) => addLog(message),
    waitForBattleMoveVisual: async (key, side, phase, options) => options.onImpact?.(),
    addLog: (message) => state.logs.push(message),
    setPlayerTeam: (updater) => { state.party = updater(state.party) },
    setEnemyTeam: (updater) => { state.enemies = updater(state.enemies) },
    battleEnvironment: state.environment || {},
    battleEscapeRule: { canRun: false, blockedReason: '训练赛不能逃跑' },
    gameAudio: { playBattleStatus() {}, playBattleImpact() {} },
  }
  traverse(ast, {
    VariableDeclarator(path) {
      if (path.node.id.type !== 'Identifier') return
      const { name } = path.node.id
      if (path.parentPath.parentPath.isProgram()) declarations.set(name, path)
      if (name === 'executeBattleMove') declarations.set(name, path.get('init.arguments.0'))
    },
    FunctionDeclaration(path) {
      if (path.parentPath.isProgram()) declarations.set(path.node.id.name, path)
    },
    ImportDeclaration(path) {
      for (const spec of path.node.specifiers) imports.set(spec.local.name, {
        from: path.node.source.value,
        member: spec.type === 'ImportSpecifier' ? spec.imported.name : 'default',
      })
    },
  })
  const selected = new Map()
  const importedNames = new Set()
  const select = (name) => {
    if (name in overrides || selected.has(name)) return
    if (imports.has(name)) { importedNames.add(name); return }
    const path = declarations.get(name)
    if (!path) return
    selected.set(name, path)
    path.traverse({ ReferencedIdentifier(ref) {
      const binding = ref.scope.getBinding(ref.node.name)
      if (binding && binding.path.node.start >= path.node.start && binding.path.node.end <= path.node.end) return
      select(ref.node.name)
    } })
  }
  const exports = ['executeBattleMove', 'resolveTurnStart', 'resolveTurnEnd', 'clearTemporaryBattleRuntime',
    'determineBattleActionOrder', 'determineBattleEndOfTurnSideOrder', 'getDynamicBattleMovePower', 'getMoveMpCost', 'getBattleMoveUseMessage',
    'getBattleActionOrderReason', 'getEnemyAiSwitchIntentMessage', 'didPlayerJustSwitchOnLastBattleLog']
  exports.forEach(select)
  const context = { ...overrides, Math, console }
  for (const name of importedNames) {
    const entry = imports.get(name)
    const modulePath = resolve(rootDir, 'src/components/Game', entry.from)
    const moduleId = `/${modulePath.slice(rootDir.length + 1)}`
    const loaded = await loadModule(moduleId)
    assert(name in loaded || entry.member in loaded, `Missing import ${name}`)
    context[name] = loaded[entry.member]
  }
  const snippets = [...selected.entries()].sort((a, b) => a[1].node.start - b[1].node.start).map(([name, path]) => {
    if (path.isFunctionDeclaration()) return source.slice(path.node.start, path.node.end)
    const node = path.isVariableDeclarator() ? path.node.init : path.node
    return `const ${name} = ${source.slice(node.start, node.end)};`
  })
  const runtime = vm.runInNewContext(`${snippets.join('\n')}\n({${exports.join(',')}})`, context)
  return { runtime, sourceSha256: createHash('sha256').update(source).digest('hex') }
}
