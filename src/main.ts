import type { User } from '@supabase/supabase-js'
import type { Patient, Block, Prescription, Task, Settings, Region } from './types'
import {
  currentUser, onAuth, signIn, signOut,
  loadAll, loadSettings,
  insertPatient, insertBlock, insertPrescription, insertTasks,
  updateTask, deleteTask, deleteTasksBy, saveSettings, deletePatient, deletePrescriptionCascade, insertRaw,
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
  pickDate: string // 달력에서 클릭한 날짜
}
const now = new Date()
const state: State = {
  user: null, patients: [], blocks: [], prescriptions: [], tasks: [],
  settings: { weekly_closed: [0, 4], holidays: [], no_delivery: [] },
  tab: 'calendar', year: now.getFullYear(), month: now.getMonth(), pickDate: '',
}

const COLOR: Record<string, string> = {
  처방: 'var(--brown)', 문자: 'var(--brown)', 확인전화: 'var(--blue)', 문진예정: 'var(--green)',
  재연락: 'var(--red)', 마무리문자1: 'var(--gold)', 마무리문자2: 'var(--gold)', 연락대기: 'var(--purple)',
}
const TABS: [string, string][] = [
  ['calendar', '달력'], ['today', '오늘 할 일'], ['weekly', '주간 요약'],
  ['patients', '환자'], ['uncontactable', '연락 안 됨'], ['stats', '통계'], ['settings', '설정'],
]

// ---------- 유틸 ----------
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function patientById(id: string): Patient | undefined { return state.patients.find((p) => p.id === id) }
function displayName(p: Patient): string { return p.birth ? `${p.name}(${p.birth})` : p.name }
function nameExists(name: string): boolean { return state.patients.some((p) => p.name === name) }
function latestBlock(pid: string): Block | undefined {
  const bs = state.blocks.filter((b) => b.patient_id === pid)
  return bs[bs.length - 1]
}
function rxInBlock(blockId: string): Prescription[] { return state.prescriptions.filter((r) => r.block_id === blockId) }
function suggestNumber(pid: string): string {
  const blk = latestBlock(pid)
  if (!blk) return ''
  return `${blk.x}-${rxInBlock(blk.id).length + 1}`
}

// ---------- 되돌리기(Undo) ----------
const undoStack: Array<() => Promise<void>> = []
function pushUndo(fn: () => Promise<void>): void {
  undoStack.push(fn)
  if (undoStack.length > 30) undoStack.shift()
}
async function doUndo(): Promise<void> {
  const fn = undoStack.pop()
  if (!fn) { alert('되돌릴 게 없습니다.'); return }
  await fn()
  await reload()
}

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
      <div id="userbar"><span>${state.user.email ?? ''}</span><button class="btn" data-action="undo" title="삭제 되돌리기 (Ctrl+Z)">되돌리기</button><button class="btn" data-action="logout">로그아웃</button></div>
    </header>
    <nav id="tabs">${TABS.map(([k, t]) => `<button data-tab="${k}" class="${state.tab === k ? 'active' : ''}">${t}</button>`).join('')}</nav>
    <main id="view"></main>
    <div id="modal"></div>`
  const view = root.querySelector('#view') as HTMLElement
  if (state.tab === 'calendar') renderCalendar(view)
  else if (state.tab === 'today') renderToday(view)
  else if (state.tab === 'weekly') renderWeekly(view)
  else if (state.tab === 'patients') renderPatients(view)
  else if (state.tab === 'uncontactable') renderUncontactable(view)
  else if (state.tab === 'stats') renderStats(view)
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
    const dayTasks = state.tasks.filter((t) => t.due_on === ds && t.status !== '완료' && t.status !== '취소' && t.status !== '연락안됨')
    // 같은 처방의 처방+문자가 같은 날이면 한 줄로 합침: "김나나 6-1 처방 문자"
    const shown = dayTasks.filter((t) => !(t.kind === '문자' && dayTasks.some((o) => o.kind === '처방' && o.prescription_id === t.prescription_id)))
    const chips = shown.map((t) => {
      let label = t.label
      if (t.kind === '처방' && dayTasks.some((o) => o.kind === '문자' && o.prescription_id === t.prescription_id)) label = `${t.label} 문자`
      return `<span class="chip" style="background:${COLOR[t.kind] ?? '#888'}">${label}</span>`
    }).join('')
    const closed = isClinicClosed(ds, state.settings)
    const hol = isHoliday(ds, state.settings)
    const noDel = state.settings.no_delivery.includes(ds)
    const count = shown.length > 6 ? `<span class="cellcount">${shown.length}건 · 스크롤 ↕</span>` : ''
    cells.push(`<td class="${closed ? 'closed' : ''} ${ds === todayStr() ? 'today' : ''}" data-action="pickDay" data-date="${ds}">
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
  if (t.kind === '처방' && t.prescription_id) btns.push(`<button class="btn" data-action="delRx" data-id="${t.prescription_id}">이 회차 전체 삭제</button>`)
  btns.push(`<button class="btn" data-action="delTask" data-id="${t.id}">삭제</button>`)
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
  const open = state.tasks.filter((t) => t.status !== '완료' && t.status !== '취소' && t.status !== '대기' && t.status !== '연락안됨')
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
    const cj = p.first_herbal ? '<span class="badge">한약초진</span>' : ''
    const blkCount = state.blocks.filter((b) => b.patient_id === p.id).length
    const rxCount = state.prescriptions.filter((r) => r.patient_id === p.id).length
    return `<div class="card">
      <div class="row"><b>${displayName(p)}</b>${badge}${cj}<span class="muted">현재 ${prog} · 결제 ${blkCount}회 · 처방 ${rxCount}회</span></div>
      <div class="row" style="margin-top:6px">
        <input type="date" id="rxdate-${p.id}" value="${todayStr()}">
        <button class="btn primary" data-action="addRx" data-id="${p.id}">이 날 처방 나감</button>
        <button class="btn" data-action="addBlock" data-id="${p.id}">새 결제 추가</button>
        <button class="btn" data-action="delPatient" data-id="${p.id}">삭제</button>
      </div></div>`
  }).join('')
  view.innerHTML = `
    <div class="card">
      <b>환자 등록</b>
      <div class="row" style="margin-top:6px">
        <input id="np-name" placeholder="이름 (예: 김**)">
        <input id="np-birth" style="width:110px" placeholder="생년(동명이인만)">
        <select id="np-region"><option>서울</option><option>지방</option><option>해외</option></select>
        <select id="np-months"><option value="1">한 달(2회)</option><option value="2">두 달(4회)</option><option value="3">3개월(6회)</option></select>
        <label style="font-size:13px"><input type="checkbox" id="np-first"> 한약 초진</label>
        <button class="btn primary" data-action="addPatient">등록</button>
      </div>
      <p class="muted" style="margin-top:4px">생년은 같은 이름 환자가 있을 때만 넣으면 됩니다. 침 치료는 오래 했어도 한약이 처음이면 "한약 초진" 체크.</p>
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

// ---------- 통계 ----------
function renderStats(view: HTMLElement): void {
  // 환자별 첫 처방월
  const firstMonth = new Map<string, string>()
  for (const r of [...state.prescriptions].sort((a, b) => a.prescribed_on.localeCompare(b.prescribed_on))) {
    if (!firstMonth.has(r.patient_id)) firstMonth.set(r.patient_id, r.prescribed_on.slice(0, 7))
  }
  // 최근 6개월
  const months: string[] = []
  const d = new Date()
  for (let i = 5; i >= 0; i--) { const m = new Date(d.getFullYear(), d.getMonth() - i, 1); months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`) }
  const rows = months.map((mo) => {
    const paid = new Set(state.prescriptions.filter((r) => r.prescribed_on.startsWith(mo)).map((r) => r.patient_id)).size
    let chojin = 0
    for (const p of state.patients) if (p.first_herbal && firstMonth.get(p.id) === mo) chojin++
    return `<tr><td>${mo}</td><td>${paid}</td><td>${chojin}</td></tr>`
  }).join('')
  const pr = state.patients.map((p) => {
    const blk = state.blocks.filter((b) => b.patient_id === p.id).length
    const rx = state.prescriptions.filter((r) => r.patient_id === p.id).length
    return `<tr><td>${displayName(p)}</td><td>${blk}</td><td>${rx}</td><td>${p.first_herbal ? '○' : ''}</td></tr>`
  }).join('')
  view.innerHTML = `
    <h3>월별 처방(결제) 환자 수 · 한약 초진 수</h3>
    <table class="tbl"><thead><tr><th>월</th><th>처방 나간 환자 수</th><th>한약 초진 수</th></tr></thead><tbody>${rows}</tbody></table>
    <h3>환자별 재복(결제·처방) 횟수</h3>
    <table class="tbl"><thead><tr><th>환자</th><th>결제(블록) 수</th><th>처방 수</th><th>한약초진</th></tr></thead><tbody>${pr || '<tr><td colspan="4" class="muted">없음</td></tr>'}</tbody></table>
    <p class="muted">한약 초진 수는 "한약 초진"으로 체크한 환자의 첫 처방이 그 달에 있는 경우를 셉니다.</p>`
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

// ---------- 처방 생성 공통 ----------
async function createRx(p: Patient, blk: Block, date: string, numberStr?: string): Promise<void> {
  const inb = rxInBlock(blk.id)
  let y = inb.length + 1
  const mt = numberStr ? numberStr.match(/^\d+-(\d+)$/) : null
  if (mt) y = Number(mt[1]) // 직접 적은 번호의 Y를 저장
  const overall = state.prescriptions.filter((r) => r.patient_id === p.id).length + 1
  const rx = await insertPrescription({ block_id: blk.id, patient_id: p.id, y, overall, prescribed_on: date })
  await insertTasks(buildTasksForPrescription(p, rx, blk.x, state.settings, numberStr))
}
async function registerPatient(name: string, region: Region, months: 1 | 2 | 3, birth: string, firstHerbal: boolean): Promise<{ p: Patient; blk: Block }> {
  const p = await insertPatient({ name, region, birth, first_herbal: firstHerbal })
  const blk = await insertBlock({ patient_id: p.id, months, x: months * 2 })
  return { p, blk }
}

// ---------- 날짜 클릭 팝업 ----------
function openDayModal(ds: string): void {
  state.pickDate = ds
  const modal = document.getElementById('modal') as HTMLElement
  const opts = state.patients.map((p) => `<option value="${p.id}">${displayName(p)}${p.region !== '서울' ? ` (${p.region})` : ''}</option>`).join('')
  const firstSug = state.patients.length ? suggestNumber(state.patients[0].id) : ''
  const dayTasks = state.tasks.filter((t) => t.due_on === ds && t.status !== '완료' && t.status !== '취소' && t.status !== '연락안됨')
  const dayList = dayTasks.length
    ? `<hr style="border:none;border-top:1px solid var(--line);margin:12px 0">
       <div class="row"><b>이 날 일정</b><button class="btn" data-action="delSelected" data-date="${ds}">선택 삭제</button><span class="muted">여러 개 체크해서 한 번에 삭제</span></div>` +
      dayTasks.map((t) => `<div class="task">
        <label style="display:block"><input type="checkbox" class="m-del" data-id="${t.id}"> <span class="chip" style="background:${COLOR[t.kind] ?? '#888'}">${t.kind}</span> <b>${t.label}</b></label>
        <div style="margin-top:4px">${taskActions(t)}</div></div>`).join('')
    : ''
  modal.className = 'open'
  modal.innerHTML = `<div class="modal-box">
    <h3>${ds} — 처방 입력</h3>
    ${state.patients.length
      ? `<b>기존 환자에 이어서</b>
         <div class="row" style="margin-top:6px">
           <select id="m-pat">${opts}</select>
           <input id="m-num" style="width:80px" placeholder="번호" value="${firstSug}" title="예: 2-2 (고칠 수 있음)">
           <button class="btn primary" data-action="rxForDay">이 날 처방 나감</button>
         </div>
         <hr style="border:none;border-top:1px solid var(--line);margin:12px 0">`
      : '<p class="muted">등록된 환자가 없습니다. 아래에서 새로 등록하세요.</p>'}
    <b>새 환자 등록하고 이 날 처방</b>
    <div class="row" style="margin-top:6px">
      <input id="m-name" placeholder="이름 (예: 김나나)">
      <input id="m-birth" style="width:110px" placeholder="생년(동명이인만)">
      <select id="m-region"><option>서울</option><option>지방</option><option>해외</option></select>
      <select id="m-months"><option value="1">한 달(2회)</option><option value="2">두 달(4회)</option><option value="3">3개월(6회)</option></select>
      <label style="font-size:13px"><input type="checkbox" id="m-first"> 한약 초진</label>
    </div>
    <div class="row" style="margin-top:6px">
      <input id="m-num2" style="width:100px" placeholder="번호" value="2-1" title="예: 2-1 (고칠 수 있음)">
      <button class="btn primary" data-action="registerAndRx">등록하고 처방</button>
      <button class="btn" data-action="closeModal">닫기</button>
    </div>
    <p class="muted" style="margin-top:8px">번호(2-1, 6-2 등)는 자동으로 채워지지만 직접 고칠 수 있습니다. 생년은 같은 이름이 있을 때만.</p>
    ${dayList}
  </div>`
  const patSel = document.getElementById('m-pat') as HTMLSelectElement | null
  if (patSel) patSel.addEventListener('change', () => {
    const el = document.getElementById('m-num') as HTMLInputElement
    el.value = suggestNumber(patSel.value)
  })
  const monSel = document.getElementById('m-months') as HTMLSelectElement
  monSel.addEventListener('change', () => {
    (document.getElementById('m-num2') as HTMLInputElement).value = `${Number(monSel.value) * 2}-1`
  })
}
function closeModal(): void {
  const modal = document.getElementById('modal') as HTMLElement
  modal.className = ''; modal.innerHTML = ''
}

// ---------- 액션 ----------
async function handleClick(e: Event): Promise<void> {
  // 팝업 바깥(어두운 배경)을 누르면 닫기
  if ((e.target as HTMLElement).id === 'modal') { closeModal(); return }
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

  // 달력 날짜 클릭 → 팝업
  if (action === 'pickDay') { openDayModal(el.getAttribute('data-date')!); return }
  if (action === 'closeModal') { closeModal(); return }
  if (action === 'rxForDay') {
    const pid = (document.getElementById('m-pat') as HTMLSelectElement).value
    const p = patientById(pid)!
    const blk = latestBlock(pid)
    if (!blk) { alert('이 환자는 결제(개월수)가 없습니다. 환자 탭에서 새 결제를 추가하세요.'); return }
    if (rxInBlock(blk.id).length >= blk.x) { alert('이 결제분을 다 채웠습니다. 환자 탭에서 "새 결제 추가"를 먼저 하세요.'); return }
    const numStr = (document.getElementById('m-num') as HTMLInputElement).value.trim()
    const warn = saturdayWarning(p, state.pickDate)
    if (warn && !confirm(warn + '\n그래도 진행할까요?')) return
    await createRx(p, blk, state.pickDate, numStr); closeModal(); await reload(); return
  }
  if (action === 'registerAndRx') {
    const name = (document.getElementById('m-name') as HTMLInputElement).value.trim()
    if (!name) { alert('이름을 입력하세요'); return }
    const birth = (document.getElementById('m-birth') as HTMLInputElement).value.trim()
    if (!birth && nameExists(name)) { alert('같은 이름 환자가 있습니다. 생년을 넣어 구분하거나, 위에서 기존 환자를 고르세요.'); return }
    const region = (document.getElementById('m-region') as HTMLSelectElement).value as Region
    const months = Number((document.getElementById('m-months') as HTMLSelectElement).value) as 1 | 2 | 3
    const first = (document.getElementById('m-first') as HTMLInputElement).checked
    const numStr = (document.getElementById('m-num2') as HTMLInputElement).value.trim()
    const { p, blk } = await registerPatient(name, region, months, birth, first)
    const warn = saturdayWarning(p, state.pickDate)
    if (warn && !confirm(warn + '\n그래도 진행할까요?')) { closeModal(); await reload(); return }
    await createRx(p, blk, state.pickDate, numStr); closeModal(); await reload(); return
  }

  if (action === 'addPatient') {
    const name = (document.getElementById('np-name') as HTMLInputElement).value.trim()
    if (!name) { alert('이름을 입력하세요'); return }
    const birth = (document.getElementById('np-birth') as HTMLInputElement).value.trim()
    if (!birth && nameExists(name)) { alert('같은 이름 환자가 있습니다. 생년을 넣어 구분하세요.'); return }
    const region = (document.getElementById('np-region') as HTMLSelectElement).value as Region
    const months = Number((document.getElementById('np-months') as HTMLSelectElement).value) as 1 | 2 | 3
    const first = (document.getElementById('np-first') as HTMLInputElement).checked
    await registerPatient(name, region, months, birth, first)
    await reload(); return
  }
  if (action === 'addBlock') {
    const m = Number(prompt('추가 결제 개월수 (1/2/3)', '1'))
    if (![1, 2, 3].includes(m)) return
    await insertBlock({ patient_id: id, months: m as 1 | 2 | 3, x: m * 2 })
    await reload(); return
  }
  if (action === 'delPatient') {
    const p = patientById(id)
    if (p && confirm(`${displayName(p)} 환자와 관련된 모든 일정을 지울까요? (Ctrl+Z로 되돌릴 수 있음)`)) {
      const blks = state.blocks.filter((b) => b.patient_id === id)
      const rxs = state.prescriptions.filter((r) => r.patient_id === id)
      const tks = state.tasks.filter((x) => x.patient_id === id)
      const snap = p
      pushUndo(async () => {
        await insertRaw('patients', [snap as unknown as Record<string, unknown>])
        await insertRaw('blocks', blks as unknown as Record<string, unknown>[])
        await insertRaw('prescriptions', rxs as unknown as Record<string, unknown>[])
        await insertRaw('tasks', tks as unknown as Record<string, unknown>[])
      })
      await deletePatient(id); await reload()
    }
    return
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

  if (action === 'delRx') {
    if (confirm('이 회차의 처방·문자·확인전화·문진 등을 모두 지울까요? (Ctrl+Z로 되돌릴 수 있음)')) {
      const rx = state.prescriptions.find((r) => r.id === id)
      const rxTasks = state.tasks.filter((x) => x.prescription_id === id)
      pushUndo(async () => { if (rx) await insertRaw('prescriptions', [rx as unknown as Record<string, unknown>]); await insertRaw('tasks', rxTasks as unknown as Record<string, unknown>[]) })
      await deletePrescriptionCascade(id); closeModal(); await reload()
    }
    return
  }
  if (action === 'delTask') {
    if (t && confirm('이 항목을 지울까요? (Ctrl+Z로 되돌릴 수 있음)')) {
      const snap = t
      pushUndo(async () => { await insertRaw('tasks', [snap as unknown as Record<string, unknown>]) })
      await deleteTask(t.id); closeModal(); await reload()
    }
    return
  }
  if (action === 'undo') { await doUndo(); return }
  if (action === 'delSelected') {
    const ds = el.getAttribute('data-date')!
    const ids = Array.from(document.querySelectorAll('.m-del:checked')).map((c) => (c as HTMLElement).getAttribute('data-id')!)
    if (!ids.length) { alert('지울 항목을 체크하세요.'); return }
    if (!confirm(`선택한 ${ids.length}개를 지울까요? (Ctrl+Z로 되돌릴 수 있음)`)) return
    const snaps = state.tasks.filter((x) => ids.includes(x.id))
    pushUndo(async () => { await insertRaw('tasks', snaps as unknown as Record<string, unknown>[]) })
    for (const tid of ids) await deleteTask(tid)
    await reload()
    openDayModal(ds) // 팝업 유지(갱신)
    return
  }

  if (!t) return
  if (action === 'done') { await updateTask(t.id, { status: '완료' }); await reload(); return }
  if (action === 'move') {
    const nd = prompt('새 날짜 (YYYY-MM-DD)', t.due_on)
    if (nd) { await updateTask(t.id, { due_on: nd }); await reload() }
    return
  }
  if (action === 'nocontact') {
    const rc = buildRecontact(t, t.attempt + 1)
    await updateTask(t.id, { status: '연락안됨' })
    await insertTasks([rc])
    const [yy, mm] = rc.due_on.split('-').map(Number)
    state.year = yy; state.month = mm - 1; state.tab = 'calendar'
    closeModal()
    alert(`다음 재연락을 ${rc.due_on}에 만들었습니다.${rc.note ? ' — ' + rc.note : ''}`)
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
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); return }
  const tag = (e.target as HTMLElement).tagName
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
    e.preventDefault(); void doUndo()
  }
})
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
