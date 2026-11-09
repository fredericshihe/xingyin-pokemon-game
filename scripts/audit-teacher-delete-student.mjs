import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'

const source = await fs.readFile(new URL('../src/components/Teacher/Dashboard.jsx', import.meta.url), 'utf8')
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
const handler = between('  const handleDeleteStudent =', '  const goldWarning =')
const target = { id: 'student-a', username: 'student-a', nickname: '甲' }
function fixture(rpc) {
  const state = { students: [target, { id: 'student-b' }], pending: [target], logs: [{ student_id: 'student-a' }, { student_id: 'student-b' }], selected: 'student-a', busy: false, error: '', target, message: null }
  const assign = (key) => (value) => { state[key] = typeof value === 'function' ? value(state[key]) : value }
  const context = {
    deleteTarget: target, deletionInFlight: { current: false }, removedStudentIds: { current: new Set() },
    selectedKeyRef: { current: 'student-a' }, selectedStudentId: 'student-a', profile: { id: 'teacher-a' }, client: { rpc },
    setDeleteBusy: assign('busy'), setDeleteError: assign('error'), setDeleteTarget: assign('target'),
    setStudents: assign('students'), setPendingStudents: assign('pending'), setGameplayLogs: assign('logs'),
    setSelectedStudentId: assign('selected'), setMessage: assign('message'), setGoldLogs: assign('goldLogs'), setEnergyLogs: assign('energyLogs'),
    loadStudents: async () => {}, loadPendingStudents: async () => {},
  }
  const run = vm.runInNewContext(`${handler}\nhandleDeleteStudent`, context)
  return { state, context, run }
}

let calls = []
const success = fixture(async (name, args) => { calls.push({ name, args }); return { data: JSON.stringify({ success: true }) } })
await success.run('synthetic-password')
assert.equal(calls[0].name, 'teacher_delete_student')
assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args)), { p_teacher_id: 'teacher-a', p_student_id: 'student-a', p_teacher_password: 'synthetic-password', p_expected_username: 'student-a' })
assert.equal(success.state.students.length, 1)
assert.equal(success.state.students[0].id, 'student-b')
assert.equal(success.state.pending.length, 0)
assert.equal(success.state.logs[0].student_id, 'student-b')
assert.equal(success.state.selected, null)
assert.equal(success.state.target, null)
assert.equal(success.state.busy, false)
assert.equal(success.context.removedStudentIds.current.has(target.id), true)

const denied = fixture(async () => ({ data: { success: false, error: '教师身份或密码验证失败' } }))
await denied.run('wrong')
assert.equal(denied.state.students.length, 2)
assert.equal(denied.state.target, target)
assert.equal(denied.state.selected, target.id)
assert.equal(denied.state.error, '教师身份或密码验证失败')
assert.equal(denied.context.removedStudentIds.current.size, 0)

let release, count = 0
const pending = fixture(async () => { count++; return new Promise((resolve) => { release = resolve }) })
const first = pending.run('synthetic-password')
await pending.run('synthetic-password')
assert.equal(count, 1, 'Duplicate submission must not create another RPC')
assert.equal(pending.state.busy, true)
release({ data: { success: true, alreadyDeleted: true } })
await first
assert.equal(pending.state.busy, false)

const missing = fixture(async () => { throw { code: 'PGRST202' } })
await missing.run('synthetic-password')
assert.match(missing.state.error, /尚未部署/)
assert.equal(missing.state.students.length, 2)
assert.equal(missing.state.busy, false)
const offline = fixture(async () => { throw new Error('timeout') })
await offline.run('synthetic-password')
assert.match(offline.state.error, /未确认/)
assert.equal(offline.state.target, target)
assert.equal(offline.context.deletionInFlight.current, false)

// Exercise production list readers with a delayed pre-deletion snapshot.
const readers = vm.runInNewContext([
  between('  const loadStudents =', '  const handleReviewStudent ='),
  '({loadStudents,loadPendingStudents})'
].join('\n'), { ...success.context, setStudentsLoading() {}, client: { rpc: async () => ({ data: [target, { id: 'student-b' }] }) }, console: { error() {} } })
await readers.loadStudents()
await readers.loadPendingStudents()
assert.equal(success.state.students.length, 1, 'Old list response must not resurrect a deleted account')
assert.equal(success.state.pending.length, 1)
assert.equal(success.state.pending[0].id, 'student-b')
console.log('Teacher deletion client audit passed: exact target, denial, double-click, network failure, retry and stale-list protection.')
