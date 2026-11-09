import { useMemo, useRef, useState } from 'react'
import TeacherDashboard from '../components/Teacher/Dashboard'
import Login from '../components/Auth/Login'
import Register from '../components/Auth/Register'
import './ui-preview.css'

const teacher = { id: 'ui-demo-teacher', nickname: '林', role: 'teacher' }
const initialStudents = [
  { id: 'demo-1', username: 'xiaoyu', nickname: '小雨', gold: 1260, energy: 7, max_energy: 10, daily_playtime_limit_minutes: 30 },
  { id: 'demo-2', username: 'chenchen', nickname: '晨晨', gold: 830, energy: 4, max_energy: 10, daily_playtime_limit_minutes: 45 },
  { id: 'demo-3', username: 'yueyue', nickname: '悦悦 · 长昵称展示', gold: 12580, energy: 10, max_energy: 12, daily_playtime_limit_minutes: 30 }
].map((student) => ({ ...student, teacher_id: teacher.id, created_at: '2026-10-09T04:00:00Z' }))

export default function UiDesignPreview() {
  const [mode, setMode] = useState('teacher')
  const [revision, setRevision] = useState(0)
  const records = useRef(structuredClone(initialStudents))
  const pending = useRef([{ ...initialStudents[0], id: 'demo-pending', nickname: '新同学', username: 'new_student', registration_requested_at: '2026-10-11T01:00:00Z' }])
  const client = useMemo(() => ({
    async rpc(name, args) {
      await new Promise((resolve) => setTimeout(resolve, 220))
      const student = records.current.find((item) => item.id === args.p_student_id)
      if (name === 'get_teacher_students') return { data: structuredClone(records.current) }
      if (name === 'get_teacher_pending_students') return { data: structuredClone(pending.current) }
      if (name === 'get_student_gold_logs') return { data: [{ id: 'demo-log', amount: 100, balance_after: student?.gold || 0, reason: '本周课堂练习', created_at: '2026-10-11T02:00:00Z' }] }
      if (name === 'get_student_energy_logs') return { data: [] }
      if (name === 'teacher_delete_student') {
        if (args.p_teacher_password !== 'demo123') return { data: { success: false, error: '教师身份或密码验证失败' } }
        records.current = records.current.filter((item) => item.id !== args.p_student_id)
        pending.current = pending.current.filter((item) => item.id !== args.p_student_id)
      }
      if (name === 'review_student_registration') {
        const target = pending.current.find((item) => item.id === args.p_student_id)
        pending.current = pending.current.filter((item) => item.id !== args.p_student_id)
        if (args.p_approved && target) records.current.push(target)
      }
      if (name === 'grant_gold' && student) {
        const before = student.gold
        student.gold += args.p_amount
        return { data: { success: true, goldBefore: before, goldAfter: student.gold, message: '金币已发放（演示）' } }
      }
      if (name === 'grant_energy' && student) {
        const before = student.max_energy
        if (args.p_max_energy !== null) student.max_energy = args.p_max_energy
        student.energy = args.p_fill_to_max ? student.max_energy : Math.min(student.max_energy, student.energy + args.p_amount)
        return { data: { success: true, energyAfter: student.energy, maxEnergyBefore: before, maxEnergyAfter: student.max_energy, message: '能量已更新（演示）' } }
      }
      if (name === 'set_student_daily_playtime_limit' && student) student.daily_playtime_limit_minutes = args.p_limit_minutes
      return { data: { success: true, message: '操作成功（演示）', limitMinutes: args.p_limit_minutes } }
    }
  }), [])
  return <div className="ui-preview">
    <nav className="ui-preview__nav" aria-label="设计预览">
      <strong>界面规范 · 本地演示</strong>
      {[['teacher', '教师'], ['login', '登录'], ['register', '注册'], ['standard', '尺寸标准']].map(([key, label]) => <button key={key} type="button" className={mode === key ? 'game-primary-button' : 'game-soft-button'} aria-pressed={mode === key} onClick={() => setMode(key)}>{label}</button>)}
      <a href="/adventure-items-preview">商店 / 背包</a><a href="/fishing-preview">渔具 / 鱼商</a><a href="/timber-bank-preview">银行</a>
      <button type="button" className="game-soft-button" onClick={() => { records.current = structuredClone(initialStudents); setRevision((n) => n + 1) }}>重置演示</button>
    </nav>
    {mode === 'teacher' && <><div className="ui-preview__note">使用合成学生；删除演示密码为 demo123。操作仅在内存中生效。</div><TeacherDashboard key={revision} profile={teacher} client={client} previewGameplayLogs={[{ id: 'demo-fishing-log', student_id: 'demo-1', student_nickname: '小雨', student_username: 'xiaoyu', event_type: 'fishing_catch', title: '钓到稀有鱼获', summary: '连续命中 3 次，获得金币奖励', map_display_name: '雾湖', details: { hitStreak: 3, comboGold: 2 }, created_at: '2026-10-11T02:10:00Z' }]} /></>}
    {mode === 'login' && <Login onLogin={async () => ({ success: false, error: '这里是界面演示，请从游戏首页登录。' })} onSwitchToRegister={() => setMode('register')} />}
    {mode === 'register' && <Register onRegister={async () => ({ success: true, pendingApproval: true, message: '演示申请已提交，未创建真实账号。' })} onSwitchToLogin={() => setMode('login')} />}
    {mode === 'standard' && <main className="ui-preview__standard"><h1>统一界面设计标准</h1><p>4px 间距基准 · 清楚的主次 · 一个主要动作</p>
      <div className="ui-preview__swatches">{[['背景', 'bg'], ['卡片', 'surface'], ['主文字', 'text'], ['辅助文字', 'muted'], ['品牌', 'primary'], ['危险', 'danger']].map(([label, token]) => <div key={token}><span style={{ background: `var(--ui-${token})` }} /><small>{label}</small></div>)}</div>
      <section><h2>按钮 · 44px</h2><div className="ui-preview__row"><button className="game-primary-button">主要操作</button><button className="game-soft-button">次要操作</button><button className="game-danger-button">危险操作</button><button className="game-primary-button" disabled>暂不可用</button></div></section>
      <section><h2>表单 · 44px</h2><div className="ui-preview__row"><label className="ui-field"><span>标准输入</span><input placeholder="输入内容" /></label><label className="ui-field"><span>标准选择器</span><select className="teacher-input"><option>选择分类</option><option>渔具</option></select></label></div></section>
      <section><h2>排版 · 24 / 18 / 14 / 12px</h2><h3>清楚的板块标题</h3><p>正文说明当前操作和结果。</p><small>辅助文字说明时间、英文名称或补充规则。</small></section>
      <section><h2>间距与圆角</h2><p>间距 4 / 8 / 12 / 16 / 20 / 24 / 32px。控件圆角 10px，卡片 16px，弹窗 20px。</p></section>
    </main>}
  </div>
}
