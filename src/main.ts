import type { User } from '@supabase/supabase-js'
import type { Patient, Block, Prescription, Task, Settings, Region } from './types'
import {
  currentUser, onAuth, signIn, signOut,
  loadAll, loadSettings,
  insertPatient, insertBlock, insertPrescription, insertTasks,
  updateTask, deleteTasksBy, saveSettings,
} from './supabase'
import { buildTasksForPrescription, saturdayWarning } from './schedule'
import { buildRecontact, buildWaitRevival } from './recontact'
import { isClinicClosed, isHoliday } from './holidays'

// ---------- 상태 ----------
interface State {
  user: User | null
  patients: Patient[]
  blocks: Block[]
  prescriptions: Prescription[]
  tasks: Task[]
  settings: Settings
  tab: string
  year: number
  month: number // 0-11
}
const now = new Date()
const state: State = {
  user: null, patients: [], blocks: [], prescriptions: [], tasks: [],
  settings: { weekly_closed: [0, 4], holidays: [], no_delivery: [] },
  tab: 'calendar', year: now.getFullYear(), month: now.getMonth(),
}

const COLOR: Record<string, string> = {
  처방: 'var(--brown)', 문자: 'var(--brown)', 확인전화: 'var(--blue)', 문진예정: 'var(--green)',
  재연락: 'var(--red)', 마무리문자1: 'var(--gold)', 마무리문자2: 'var(--gold)', 연락대기: 'var(--purple)',
}
const TABS: [string, string][] = [
  ['calendar', '달력'], ['today', '오늘 할 일'], ['weekly', '주간 요약'],
  ['patients', '환자'], ['uncontactable', '연락 안 됨'], ['settings', '설정'],
]

// ---------- 유틸 ----------
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function patientById(id: string): Patient | undefined { return state.patients.find((p) => p.id === id) }
function latestBlock(pid: string): Block | undefined {
  const bs = state.blocks.filter((b) => b.patient_id === pid)
  return bs[bs.length - 1]
}
function rxInBlock(blockId: string): Prescription[] { return state.prescriptions.filter((r) => r.block_id === blockId) }

// ---------- 데이터 로드 ----------
async function reload(): Promise<void> {
  const [data, s] = await Promise.all([loadAll(), loadSettings()])
  state.patients = data.patients; state.blocks = data.blocks
  state.prescriptions = data.prescriptions; state.tasks = data.tasks
  state.settings = s
  render()
}

// ---------- 렌더: 로그인 ----------
function renderLogin(root: HTMLElement): void {
  root.innerHTML = `
    <div id="login" class="card">
      <h1>경희선한의원 · 문진일정</h1>
      <p class="muted">등록된 계정으로 로그인하세요.</p>
      <form id="loginForm">
        <label class="field">이메일<input name="email" type="email" required></label>
        <label class="field" style="margin-top:8px">비밀번호<input name="password" type="password" required></label>
        <div id="loginErr" style="color:var(--red);font-size:12px;margin-top:8px"></div>
        <button class="btn primary" style="margin-top:12px;width:100%;padding:8px" type="submit">로그인</button>
      </form>
    </div>`
  const form = root.querySelector('#loginForm') as HTMLFormElement
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(form)
    try {
      await signIn(String(fd.get('email')), String(fd.get('password')))
    } catch (err) {
      (root.querySelector('#loginErr') as HTMLElement).textContent =
        '로그인 실패: 이메일·비밀번호를 확인하세요.'
    }
  })
}

// ---------- 렌더: 앱 ----------
function render(): void {
  const root = document.getElementById('root') as HTMLElement
  if (!state.user) { renderLogin(root); return }
  root.innerHTML = `
    <header>
      <h1>경희선한의원 · 문진일정 달력</h1>
      <div id="userbar"><span>${state.user.email ?? ''}</span><button class="btn" data-action="logout">로그아웃</button></div>
    </header>
    <nav id="tabs">${TABS.map(([k, t]) => `<button data-tab="${k}" class="${state.tab === k ? 'active' : ''}">${t}</button>`).join('')}</nav>
    <main id="view"></main>`
  const view = root.querySelector('#view') as HTMLElement
  if (state.tab === 'calendar') renderCalendar(view)
  else if (state.tab === 'today') renderToday(view)
  else if (state.tab === 'weekly') renderWeekly(view)
  else if (state.tab === 'patients') renderPatients(view)
  else if (state.tab === 'uncontactable') renderUncontactable(view)
  else if (state.tab === 'settings') renderSettings(view)
}

// ---------- 달력 ----------
function renderCalendar(view: HTMLElement): void {
  const y = state.year, m = state.month
  const first = new Date(y, m, 1)
  const startDow = first.getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells: string[] = []
  for (let i = 0; i < startDow; i++) cells.push('<td></td>')
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayTasks = state.tasks.filter((t) => t.due_on === ds && t.status !== '완료' && t.status !== '취소')
    const chips = dayTasks.map((t) => `<span class="chip" style="background:${COLOR[t.kind] ?? '#888'}">${t.label}</span>`).join('')
    const closed = isClinicClosed(ds, state.settings)
    const hol = isHoliday(ds, state.settings)
    const noDel = state.settings.no_delivery.includes(ds)
    const count = dayTasks.length > 5 ? `<span class="cellcount">${dayTasks.length}건 · 스크롤 ↕</span>` : ''
    cells.push(`<td class="${closed ? 'closed' : ''} ${ds === todayStr() ? 'today' : ''}">
      <div class="daynum">${d}${hol ? ' <span class="holiday">공휴일</span>' : ''}${noDel ? ' <span class="holiday">택배불가</span>' : ''} ${count}</div>
      <div class="cellbox">${chips}</div></td>`)
  }
  const rows: string[] = []
  for (let i = 0; i < cells.length; i += 7) rows.push('<tr>' + cells.slice(i, i + 7).join('') + '</tr>')
  view.innerHTML = `
    <div class="row" style="margin-bottom:8px">
      <button class="btn" data-action="prevMonth">◀</button>
      <b>${y}년 ${m + 1}월</b>
      <button class="btn" data-action="nextMonth">▶</button>
      <span class="muted">달력의 일정은 색으로 구분됩니다. 완료 처리는 "오늘 할 일"에서.</span>
    </div>
    <table class="cal">
      <thead><tr>${['일', '월', '화', '수', '목', '금', '토'].map((w) => `<th>${w}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`
}

// ---------- 오늘 할 일 ----------
function taskActions(t: Task): string {
  const btns: string[] = [`<button class="btn primary" data-action="done" data-id="${t.id}">완료</button>`,
    `<button class="btn" data-action="move" data-id="${t.id}">날짜변경</button>`]
  if (t.kind === '문진예정' || t.kind === '재연락') {
    btns.push(`<button class="btn" data-action="nocontact" data-id="${t.id}">연락 안 됨</button>`)
    btns.push(`<button class="btn" data-action="willcall" data-id="${t.id}">환자가 연락 주기로</button>`)
  }
  if (t.kind === '마무리문자1') btns.push(`<button class="btn" data-action="visited" data-id="${t.id}">내원함(2차 취소)</button>`)
  return btns.join('')
}
function taskLine(t: Task, overdue: boolean): string {
  return `<div class="task ${overdue ? 'overdue' : ''}">
    <span class="chip" style="background:${COLOR[t.kind] ?? '#888'}">${t.kind}</span>
    <b>${t.label}</b> <span class="muted">${t.due_on}</span>${t.note ? ` <span class="badge">${t.note}</span>` : ''}
    <div style="margin-top:4px">${taskActions(t)}</div></div>`
}
function renderToday(view: HTMLElement): void {
  const today = todayStr()
  const open = state.tasks.filter((t) => t.status !== '완료' && t.status !== '취소' && t.status !== '대기')
  const past = open.filter((t) => t.due_on < today).sort((a, b) => a.due_on.localeCompare(b.due_on))
  const now2 = open.filter((t) => t.due_on === today)
  const soonMax = (() => { const d = new Date(); d.setDate(d.getDate() + 4); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const soon = open.filter((t) => t.due_on > today && t.due_on <= soonMax).sort((a, b) => a.due_on.localeCompare(b.due_on))
  view.innerHTML = `
    <h3>지난 일 (놓친 것)</h3>${past.length ? past.map((t) => taskLine(t, true)).join('') : '<p class="muted">없음</p>'}
    <h3>오늘</h3>${now2.length ? now2.map((t) => taskLine(t, false)).join('') : '<p class="muted">없음</p>'}
    <h3>다가오는 4일</h3>${soon.length ? soon.map((t) => taskLine(t, false)).join('') : '<p class="muted">없음</p>'}`
}

// ---------- 주간 요약 (처방 나간 날만, 요일별) ----------
function renderWeekly(view: HTMLElement): void {
  const d = new Date()
  const day = d.getDay()
  const monday = new Date(d); monday.setDate(d.getDate() - ((day + 6) % 7))
  const names = ['월', '화', '수', '목', '금', '토', '일']
  const rows: string[] = []
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday); cur.setDate(monday.getDate() + i)
    const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    const rx = state.tasks.filter((t) => t.kind === '처방' && t.due_on === ds)
    const who = rx.map((t) => t.label.replace(' 처방', '')).join(', ')
    rows.push(`<div class="card"><b>${names[i]} (${ds})</b><div>${who || '<span class="muted">처방 없음</span>'}</div></div>`)
  }
  view.innerHTML = `<h3>이번 주 처방 나간 환자</h3>${rows.join('')}`
}

// ---------- 환자 ----------
function renderPatients(view: HTMLElement): void {
  const cards = state.patients.map((p) => {
    const blk = latestBlock(p.id)
    const inb = blk ? rxInBlock(blk.id).length : 0
    const prog = blk ? `${blk.x}-${inb} (${inb}/${blk.x})` : '결제 없음'
    const badge = p.region !== '서울' ? `<span class="badge">${p.region}</span>` : ''
    return `<div class="card">
      <div class="row"><b>${p.name}</b>${badge}<span class="muted">현재 ${prog}</span></div>
      <div class="row" style="margin-top:6px">
        <input type="date" id="rxdate-${p.id}" value="${todayStr()}">
        <button class="btn primary" data-action="addRx" data-id="${p.id}">이 날 처방 나감</button>
        <button class="btn" data-action="addBlock" data-id="${p.id}">새 결제 추가</button>
      </div></div>`
  }).join('')
  view.innerHTML = `
    <div class="card">
      <b>환자 등록</b>
      <div class="row" style="margin-top:6px">
        <input id="np-name" placeholder="이름 (예: 김**)">
        <select id="np-region"><option>서울</option><option>지방</option><option>해외</option></select>
        <select id="np-months"><option value="1">한 달(2회)</option><option value="2">두 달(4회)</option><option value="3">3개월(6회)</option></select>
        <button class="btn primary" data-action="addPatient">등록</button>
      </div>
    </div>
    <h3>환자 목록</h3>${cards || '<p class="muted">아직 없음</p>'}`
}

// ---------- 연락 안 됨 목록 ----------
function renderUncontactable(view: HTMLElement): void {
  const list = state.tasks.filter((t) =>
    (t.status === '연락안됨' || t.kind === '재연락' || t.kind === '연락대기') && t.status !== '완료' && t.status !== '취소')
    .sort((a, b) => a.due_on.localeCompare(b.due_on))
  view.innerHTML = `<h3>연락 안 됨 · 재연락 · 대기</h3>
    ${list.length ? list.map((t) => taskLine(t, t.due_on < todayStr())).join('') : '<p class="muted">없음</p>'}`
}

// ---------- 설정 ----------
function renderSettings(view: HTMLElement): void {
  const wk = ['일', '월', '화', '수', '목', '금', '토']
  const wkBtns = wk.map((w, i) => `<button class="btn ${state.settings.weekly_closed.includes(i) ? 'primary' : ''}" data-action="toggleWk" data-dow="${i}">${w}</button>`).join('')
  const hol = state.settings.holidays.map((h) => `<span class="badge">${h} <button class="btn" data-action="delHoliday" data-date="${h}">x</button></span>`).join(' ')
  const nod = state.settings.no_delivery.map((h) => `<span class="badge">${h} <button class="btn" data-action="delNoDel" data-date="${h}">x</button></span>`).join(' ')
  view.innerHTML = `
    <div class="card"><b>매주 휴진 요일</b><div class="row" style="margin-top:6px">${wkBtns}</div><span class="muted">기본: 일·목</span></div>
    <div class="card"><b>법정공휴일</b><div style="margin:6px 0">${hol || '<span class="muted">없음</span>'}</div>
      <div class="row"><input type="date" id="holDate"><button class="btn primary" data-action="addHoliday">추가</button></div></div>
    <div class="card"><b>원외탕전 택배 불가일</b><div style="margin:6px 0">${nod || '<span class="muted">없음</span>'}</div>
      <div class="row"><input type="date" id="nodDate"><button class="btn primary" data-action="addNoDel">추가</button></div></div>`
}

// ---------- 액션 ----------
async function handleClick(e: Event): Promise<void> {
  const el = (e.target as HTMLElement).closest('[data-action],[data-tab]') as HTMLElement | null
  if (!el) return
  const tab = el.getAttribute('data-tab')
  if (tab) { state.tab = tab; render(); return }
  const action = el.getAttribute('data-action')!
  const id = el.getAttribute('data-id') ?? ''
  const t = state.tasks.find((x) => x.id === id)

  if (action === 'logout') { await signOut(); return }
  if (action === 'prevMonth') { state.month--; if (state.month < 0) { state.month = 11; state.year-- } render(); return }
  if (action === 'nextMonth') { state.month++; if (state.month > 11) { state.month = 0; state.year++ } render(); return }

  if (action === 'addPatient') {
    const name = (document.getElementById('np-name') as HTMLInputElement).value.trim()
    if (!name) { alert('이름을 입력하세요'); return }
    const region = (document.getElementById('np-region') as HTMLSelectElement).value as Region
    const months = Number((document.getElementById('np-months') as HTMLSelectElement).value) as 1 | 2 | 3
    const p = await insertPatient({ name, region })
    await insertBlock({ patient_id: p.id, months, x: months * 2 })
    await reload(); return
  }
  if (action === 'addBlock') {
    const m = Number(prompt('추가 결제 개월수 (1/2/3)', '1'))
    if (![1, 2, 3].includes(m)) return
    await insertBlock({ patient_id: id, months: m as 1 | 2 | 3, x: m * 2 })
    await reload(); return
  }
  if (action === 'addRx') {
    const p = patientById(id)!
    const blk = latestBlock(id)
    if (!blk) { alert('결제(개월수)를 먼저 등록하세요'); return }
    const inb = rxInBlock(blk.id)
    if (inb.length >= blk.x) { alert('이 결제분을 다 채웠습니다. "새 결제 추가"를 먼저 하세요.'); return }
    const date = (document.getElementById(`rxdate-${id}`) as HTMLInputElement).value
    const warn = saturdayWarning(p, date)
    if (warn && !confirm(warn + '\n그래도 진행할까요?')) return
    const y = inb.length + 1
    const overall = state.prescriptions.filter((r) => r.patient_id === id).length + 1
    const rx = await insertPrescription({ block_id: blk.id, patient_id: id, y, overall, prescribed_on: date })
    await insertTasks(buildTasksForPrescription(p, rx, blk.x, state.settings))
    await reload(); return
  }

  if (!t) return
  if (action === 'done') { await updateTask(t.id, { status: '완료' }); await reload(); return }
  if (action === 'move') {
    const nd = prompt('새 날짜 (YYYY-MM-DD)', t.due_on)
    if (nd) { await updateTask(t.id, { due_on: nd }); await reload() }
    return
  }
  if (action === 'nocontact') {
    await updateTask(t.id, { status: '연락안됨' })
    await insertTasks([buildRecontact(t, t.attempt + 1)])
    await reload(); return
  }
  if (action === 'willcall') {
    const rd = prompt('환자가 연락 주기로 한 날 / 예상 소진일 (YYYY-MM-DD)', todayStr())
    if (rd) { await updateTask(t.id, { status: '대기' }); await insertTasks([buildWaitRevival(t, rd)]); await reload() }
    return
  }
  if (action === 'visited') {
    await updateTask(t.id, { status: '완료' })
    if (t.prescription_id) await deleteTasksBy(t.prescription_id, '마무리문자2')
    await reload(); return
  }

  // 설정
  if (action === 'toggleWk') {
    const dow = Number(el.getAttribute('data-dow'))
    const wc = state.settings.weekly_closed.includes(dow)
      ? state.settings.weekly_closed.filter((x) => x !== dow)
      : [...state.settings.weekly_closed, dow]
    await saveSettings({ ...state.settings, weekly_closed: wc }); await reload(); return
  }
  if (action === 'addHoliday') {
    const d = (document.getElementById('holDate') as HTMLInputElement).value
    if (d && !state.settings.holidays.includes(d)) { await saveSettings({ ...state.settings, holidays: [...state.settings.holidays, d] }); await reload() }
    return
  }
  if (action === 'delHoliday') {
    const d = el.getAttribute('data-date')!
    await saveSettings({ ...state.settings, holidays: state.settings.holidays.filter((x) => x !== d) }); await reload(); return
  }
  if (action === 'addNoDel') {
    const d = (document.getElementById('nodDate') as HTMLInputElement).value
    if (d && !state.settings.no_delivery.includes(d)) { await saveSettings({ ...state.settings, no_delivery: [...state.settings.no_delivery, d] }); await reload() }
    return
  }
  if (action === 'delNoDel') {
    const d = el.getAttribute('data-date')!
    await saveSettings({ ...state.settings, no_delivery: state.settings.no_delivery.filter((x) => x !== d) }); await reload(); return
  }
}

// ---------- 시작 ----------
document.getElementById('root')!.addEventListener('click', (e) => { void handleClick(e) })
onAuth(async (user) => {
  state.user = user
  if (user) await reload()
  else render()
})
currentUser().then(async (user) => {
  state.user = user
  if (user) await reload()
  else render()
})
