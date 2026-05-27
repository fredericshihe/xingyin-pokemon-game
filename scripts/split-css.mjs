import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const indexPath = path.join(root, 'src/index.css')
const lines = (await fs.readFile(indexPath, 'utf8')).split('\n')

const authStart = lines.findIndex((line) => line.includes('/* 登录/注册入口 */'))
const authEnd = lines.findIndex((line, index) => (
  index > authStart && line.includes('/* 首次进入：研究所邀请与伙伴选择 */')
))
const teacherStart = lines.findIndex((line) => line.includes('/* ── Teacher dashboard ── */'))

if (authStart < 0 || authEnd < 0) {
  throw new Error('Unable to locate auth CSS block in index.css')
}

const shellBlocks = [
  lines.slice(0, 54),
  lines.slice(54, authStart),
  lines.slice(authStart, authEnd),
  teacherStart >= 0 ? lines.slice(teacherStart) : []
]

const shellLineSet = new Set(shellBlocks.flat())
const gameLines = lines.filter((line, index) => {
  if (index < 54) return false
  if (index >= authStart && index < authEnd) return false
  if (teacherStart >= 0 && index >= teacherStart) return false
  return true
})

const shellCss = `${shellBlocks.flat().join('\n')}\n`
const gameCss = `/* Game UI styles — load after login */\n${gameLines.join('\n')}\n`

await fs.writeFile(path.join(root, 'src/shell.css'), shellCss, 'utf8')
await fs.writeFile(path.join(root, 'src/game.css'), gameCss, 'utf8')

console.log(JSON.stringify({
  indexLines: lines.length,
  shellLines: shellBlocks.flat().length,
  gameLines: gameLines.length
}, null, 2))
