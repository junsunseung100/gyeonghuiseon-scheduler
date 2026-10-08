# 예약 가져오기(네이버 복붙) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 네이버 예약자관리 표를 복사해 붙여넣으면, 예약이 날짜별 목록으로 뜨고 한약/침이 색으로 구분되는 "예약" 탭을 만든다.

**Architecture:** 붙여넣은 텍스트를 순수 파서 모듈(`src/reservations.ts`)이 예약 배열로 바꾸고(TDD로 검증), 기존 패턴대로 `types.ts`/`supabase.ts`에 저장 계층을, `main.ts`에 "예약" 탭 UI를 얹는다. 예약번호(resv_no)로 upsert해 중복을 막고, 사용자가 손으로 지정한 종류(type_manual)는 재가져오기에도 유지한다. 문진일정 달력은 건드리지 않는다.

**Tech Stack:** Vite + TypeScript, Vitest, @supabase/supabase-js (vanilla DOM in main.ts), Vercel.

## Global Constraints

- 날짜는 로컬 `YYYY-MM-DD` 문자열. `toISOString()` 금지(시간대 밀림). 연도는 `20` + 두자리.
- "약침"은 한약이 아님(침 계열). 한약 판정 키워드 기본값 = `['한약','첩약','탕약']`. 단독 키워드 "약" 금지.
- 저장 표가 아직 없을 때도 앱이 안 깨지게: `loadAll`은 `?? []`로 방어.
- 기존 코드 스타일 유지(한국어 주석, `esc()`로 사용자 텍스트 이스케이프, `data-action`/`data-tab` 디스패치).
- 커밋 메시지: `<type>: <한국어 요약>` + 본문 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- 비밀/키/실제 환자정보는 커밋·테스트에 넣지 않음(테스트는 가짜 이름·번호).

---

### Task 1: 파서 순수 모듈 (`src/reservations.ts`) — TDD

네이버 복붙 텍스트를 예약 배열로 바꾸는 핵심 로직. DOM/네트워크 없음, 전부 단위 테스트.

**Files:**
- Create: `src/reservations.ts`
- Test: `tests/reservations.test.ts`

**Interfaces:**
- Consumes: 없음(문자열 입력만).
- Produces (다른 태스크가 import):
  - `export interface ParsedReservation { resv_no: string; name: string; phone: string; menu: string; resv_date: string; resv_time: string; status: '확정' | '신청' | '취소' }`
  - `export const RESV_KEYWORDS_DEFAULT: string[]` (= `['한약','첩약','탕약']`)
  - `export function parseResvDate(token: string): string` — `"26.10.10.토"` → `"2026-10-10"`, 실패 시 `''`
  - `export function classifyType(menu: string, keywords: string[]): '한약' | '침'`
  - `export function parseReservations(text: string): ParsedReservation[]` — resv_no 기준 중복 제거(뒤엣것 우선)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/reservations.test.ts`

```ts
import { test, expect } from 'vitest'
import { parseResvDate, classifyType, parseReservations, RESV_KEYWORDS_DEFAULT } from '../src/reservations'

test('parseResvDate: 두자리/한자리 월일 모두 0패딩', () => {
  expect(parseResvDate('26.10.10.토')).toBe('2026-10-10')
  expect(parseResvDate('26.9.17.목')).toBe('2026-09-17')
})
test('parseResvDate: 형식 아니면 빈 문자열', () => {
  expect(parseResvDate('어제')).toBe('')
  expect(parseResvDate('2026-10-10')).toBe('')
})

test('classifyType: 약침/침은 침(한약 아님)', () => {
  expect(classifyType('통증 클리닉(약침/침)', RESV_KEYWORDS_DEFAULT)).toBe('침')
})
test('classifyType: 상품에 한약 키워드 있으면 한약', () => {
  expect(classifyType('한약 상담', RESV_KEYWORDS_DEFAULT)).toBe('한약')
  expect(classifyType('첩약 처방', RESV_KEYWORDS_DEFAULT)).toBe('한약')
})

const SAMPLE = `오늘이용
0
확정대기
2
오늘취소
0
3건
내려받기
상세 내려받기
인쇄
상태\t예약자\t전화번호\t예약번호\t
이용일시
상품
옵션
요청사항
총금액
신청일시
확정일시
취소일시
확정\t
김가나
010-0000-0001\t1354860833\t
26.10.10.토
12:00
통증 클리닉(약침/침)
-
0원
26.9.17.목
18:36
26.9.18.금
09:17
-
신청\t
이다라
010-0000-0002\t1373668176\t
26.10.16.금
12:00
한약 상담
-
0원
26.10.8.목
12:01
-
-`

test('parseReservations: 레코드 2건을 정확히 뽑는다', () => {
  const rs = parseReservations(SAMPLE)
  expect(rs.length).toBe(2)
  expect(rs[0]).toEqual({
    resv_no: '1354860833', name: '김가나', phone: '010-0000-0001',
    menu: '통증 클리닉(약침/침)', resv_date: '2026-10-10', resv_time: '12:00', status: '확정',
  })
  expect(rs[1]).toEqual({
    resv_no: '1373668176', name: '이다라', phone: '010-0000-0002',
    menu: '한약 상담', resv_date: '2026-10-16', resv_time: '12:00', status: '신청',
  })
})

test('parseReservations: 같은 예약번호 두 번이면 1건(뒤엣것)', () => {
  const dup = SAMPLE + `
확정\t
김가나
010-0000-0001\t1354860833\t
26.10.11.일
09:00
통증 클리닉(약침/침)
-
0원`
  const rs = parseReservations(dup)
  expect(rs.length).toBe(2)
  const r = rs.find((x) => x.resv_no === '1354860833')!
  expect(r.resv_date).toBe('2026-10-11') // 마지막 값으로 갱신
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- reservations`
Expected: FAIL ("Cannot find module '../src/reservations'" 또는 함수 미정의)

- [ ] **Step 3: 최소 구현 작성** — `src/reservations.ts`

```ts
export interface ParsedReservation {
  resv_no: string
  name: string
  phone: string
  menu: string
  resv_date: string // YYYY-MM-DD
  resv_time: string // HH:MM
  status: '확정' | '신청' | '취소'
}

// 한약 판정 기본 키워드. "약침"은 침 계열이므로 "약" 단독은 쓰지 않는다.
export const RESV_KEYWORDS_DEFAULT = ['한약', '첩약', '탕약']

const DATE_RE = /^(\d{2})\.(\d{1,2})\.(\d{1,2})\.[월화수목금토일]$/
const TIME_RE = /^\d{1,2}:\d{2}$/
const PHONE_RE = /^01\d-?\d{3,4}-?\d{4}$/
const RESVNO_RE = /^\d{10}$/

// "26.10.10.토" → "2026-10-10", 형식 아니면 ''
export function parseResvDate(token: string): string {
  const m = token.match(DATE_RE)
  if (!m) return ''
  const yy = m[1], mm = m[2].padStart(2, '0'), dd = m[3].padStart(2, '0')
  return `20${yy}-${mm}-${dd}`
}

export function classifyType(menu: string, keywords: string[]): '한약' | '침' {
  return keywords.some((k) => k && menu.includes(k)) ? '한약' : '침'
}

// 줄바꿈·탭으로 토큰화 → 상태(확정/신청/취소) 토큰마다 한 레코드로 자른다.
const JUNK = new Set([
  '오늘이용', '확정대기', '오늘취소', '내려받기', '상세 내려받기', '인쇄',
  '상태', '예약자', '전화번호', '예약번호', '이용일시', '상품', '옵션',
  '요청사항', '총금액', '신청일시', '확정일시', '취소일시',
])
const STATUS = new Set(['확정', '신청', '취소'])

export function parseReservations(text: string): ParsedReservation[] {
  const tokens = text.split(/[\n\t]/).map((s) => s.trim()).filter(Boolean)
  // 레코드 시작(상태 토큰) 위치
  const starts: number[] = []
  tokens.forEach((tk, i) => { if (STATUS.has(tk)) starts.push(i) })
  const byNo = new Map<string, ParsedReservation>()
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s]
    const to = s + 1 < starts.length ? starts[s + 1] : tokens.length
    const slice = tokens.slice(from, to)
    const status = slice[0] as ParsedReservation['status']
    const phone = slice.find((t) => PHONE_RE.test(t)) ?? ''
    const resv_no = slice.find((t) => RESVNO_RE.test(t)) ?? ''
    if (!resv_no) continue // 예약번호 없으면 레코드로 안 봄
    // 이름: 상태 다음, 전화 앞의 첫 '일반' 토큰
    const name = slice.slice(1).find((t) =>
      t !== '-' && !PHONE_RE.test(t) && !RESVNO_RE.test(t) && !DATE_RE.test(t) && !TIME_RE.test(t) && !JUNK.has(t)) ?? ''
    // 이용일시: 첫 날짜 + 그 뒤 첫 시간(신청/확정일시는 뒤라 자동 제외)
    const dateIdx = slice.findIndex((t) => DATE_RE.test(t))
    const resv_date = dateIdx >= 0 ? parseResvDate(slice[dateIdx]) : ''
    let resv_time = '', menu = ''
    if (dateIdx >= 0) {
      const timeRel = slice.slice(dateIdx + 1).findIndex((t) => TIME_RE.test(t))
      if (timeRel >= 0) {
        const timeIdx = dateIdx + 1 + timeRel
        resv_time = slice[timeIdx]
        menu = slice[timeIdx + 1] ?? '' // 시간 바로 다음 토큰 = 상품
      }
    }
    byNo.set(resv_no, { resv_no, name, phone, menu, resv_date, resv_time, status })
  }
  return [...byNo.values()]
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- reservations`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/reservations.ts tests/reservations.test.ts
git commit -m "feat: 예약 복붙 파서 모듈 추가(날짜·분류·중복제거)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 타입 + 저장 계층 (`types.ts`, `supabase.ts`)

예약 저장용 타입과 Supabase 읽기/쓰기. 설정에 한약 키워드 추가.

**Files:**
- Modify: `src/types.ts` (Reservation 인터페이스, Settings에 resv_keywords)
- Modify: `src/supabase.ts` (loadAll·loadSettings 확장, upsert/update/delete)

**Interfaces:**
- Consumes: `ParsedReservation`(Task 1)는 main.ts에서만 쓰고, 여기서는 안 씀.
- Produces (Task 4가 import):
  - 타입: `Reservation`
  - `export async function upsertReservations(rows: Omit<Reservation, 'id' | 'created_at'>[]): Promise<void>`
  - `export async function updateReservation(id: string, patch: Partial<Reservation>): Promise<void>`
  - `export async function deleteReservation(id: string): Promise<void>`
  - `loadAll()` 반환에 `reservations: Reservation[]` 추가
  - `loadSettings()` 반환에 `resv_keywords?: string[]` 추가

- [ ] **Step 1: 타입 추가** — `src/types.ts` 끝에 추가

```ts
export interface Reservation {
  id: string
  resv_no: string // 네이버 예약번호(중복 방지 키)
  name: string
  phone: string
  menu: string // 상품명
  resv_date: string // 이용일 YYYY-MM-DD
  resv_time: string // 이용시간 HH:MM
  status: '확정' | '신청' | '취소'
  type: '한약' | '침' // 자동(상품 키워드) 또는 수동
  type_manual?: boolean // 손으로 지정 → 재가져오기 때 자동 덮어쓰기 방지
  note?: string
  created_at?: string
}
```

그리고 `Settings` 인터페이스에 한 줄 추가(기존 `quick_links?` 다음):

```ts
  resv_keywords?: string[] // 예약 한약 판정 키워드(기본 한약·첩약·탕약)
```

- [ ] **Step 2: supabase.ts — import 확장**

`import type { ... } from './types'` 줄의 타입 목록 끝에 `, Reservation` 추가.

- [ ] **Step 3: loadAll에 reservations 추가** — `src/supabase.ts`의 `loadAll`

반환 타입 객체에 `reservations: Reservation[]` 추가. Promise.all 배열에 한 줄 추가:

```ts
    sb.from('reservations').select('*').order('resv_date'),
```

구조분해에 `reservations`를 추가하고(`const [patients, blocks, prescriptions, tasks, inventory, supply, notes, reservations] = ...`), return 객체에 추가:

```ts
    reservations: (reservations.data ?? []) as Reservation[],
```

- [ ] **Step 4: loadSettings에 resv_keywords 추가** — return 객체에 한 줄

```ts
    resv_keywords: (data?.resv_keywords ?? undefined) as string[] | undefined,
```

- [ ] **Step 5: CRUD 함수 추가** — `src/supabase.ts` 끝에 추가

```ts
// ---- 예약(네이버 복붙) ----
export async function upsertReservations(rows: Omit<Reservation, 'id' | 'created_at'>[]): Promise<void> {
  if (!rows.length) return
  const { error } = await sb.from('reservations').upsert(rows, { onConflict: 'resv_no' })
  if (error) throw error
}
export async function updateReservation(id: string, patch: Partial<Reservation>): Promise<void> {
  const { error } = await sb.from('reservations').update(patch).eq('id', id); if (error) throw error
}
export async function deleteReservation(id: string): Promise<void> {
  await sb.from('reservations').delete().eq('id', id)
}
```

- [ ] **Step 6: 타입체크·빌드 확인**

Run: `npm run build`
Expected: 빌드 성공(타입 에러 없음). (main.ts는 아직 reservations를 state에 안 넣었지만, loadAll 반환이 넓어진 것뿐이라 빌드는 통과. 만약 구조분해 미사용 경고가 에러로 잡히면 Task 4에서 소비되므로 이 단계에서는 reservations를 반환에만 쓰고 구조분해는 실제 사용.)

- [ ] **Step 7: 커밋**

```bash
git add src/types.ts src/supabase.ts
git commit -m "feat: 예약 저장 계층 추가(Reservation 타입·upsert·키워드 설정)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: DB 마이그레이션 (reservations 표 + 설정 컬럼)

Supabase에 표와 컬럼을 만든다. SQL 파일로 남기고, 실제 적용은 Supabase SQL 편집기에서 실행.

**Files:**
- Create: `supabase/2026-10-09-reservations.sql`

**Interfaces:**
- Produces: `reservations` 표(resv_no unique), `settings.resv_keywords` jsonb 컬럼. Task 2의 쿼리가 이 스키마에 의존.

- [ ] **Step 1: 마이그레이션 SQL 작성** — `supabase/2026-10-09-reservations.sql`

```sql
-- 예약(네이버 복붙) 표
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  resv_no text unique not null,
  name text,
  phone text,
  menu text,
  resv_date date,
  resv_time text,
  status text,
  type text,
  type_manual boolean default false,
  note text,
  created_at timestamptz default now()
);
alter table reservations enable row level security;
drop policy if exists "reservations all authenticated" on reservations;
create policy "reservations all authenticated" on reservations
  for all to authenticated using (true) with check (true);

-- 예약 한약 판정 키워드(설정)
alter table settings add column if not exists resv_keywords jsonb;
```

- [ ] **Step 2: Supabase에서 실행 (가이드/수동)**

Supabase SQL 편집기(사용자 크롬)에 위 SQL을 붙여 실행. 확인용:

```sql
select column_name from information_schema.columns
where table_name = 'reservations';
```

Expected: 위 컬럼들(id, resv_no, name, …, created_at)이 나오고, 별도로 `settings.resv_keywords`도 존재.

- [ ] **Step 3: 커밋**

```bash
git add supabase/2026-10-09-reservations.sql
git commit -m "chore: 예약 표 마이그레이션 SQL 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: "예약" 탭 UI (`main.ts`) + 스타일 (`index.html`)

사이드바에 "예약" 추가, 붙여넣기 가져오기, 날짜별 목록, 한약/침 색·토글·문자, 설정 키워드 카드.

**Files:**
- Modify: `src/main.ts` (State·reload·NAV_GROUPS·render·renderReservations·handleClick·renderSettings)
- Modify: `index.html` (한약 강조행 스타일, 붙여넣기 영역 스타일)

**Interfaces:**
- Consumes: `parseReservations`, `classifyType`, `RESV_KEYWORDS_DEFAULT`(Task 1); `Reservation`, `upsertReservations`, `updateReservation`, `deleteReservation`(Task 2); 기존 `addDays`, `todayStr`, `esc`, `pushUndo`, `insertRaw`, `reload`, `saveSettings`.
- Produces: 사용자 화면(테스트 대상 아님; 빌드 + 실제앱 확인).

- [ ] **Step 1: import 추가** — `src/main.ts` 상단

`./supabase` import 목록에 `upsertReservations, updateReservation, deleteReservation` 추가.
`./types` import 목록에 `Reservation` 추가.
새 import 한 줄 추가(기존 `import { invStatuses, ... } from './inventory'` 아래):

```ts
import { parseReservations, classifyType, RESV_KEYWORDS_DEFAULT } from './reservations'
```

- [ ] **Step 2: State에 필드 추가** — `interface State`와 초기값

`interface State`에 추가:

```ts
  reservations: Reservation[]
  resvDate: string // 예약 탭에서 보고 있는 날짜(YYYY-MM-DD)
```

초기값 객체에 `reservations: [],`와 `resvDate: '',` 추가(기존 `boardNotes: [],` 옆, `pickDate: '', ` 옆).

- [ ] **Step 3: reload에 반영** — `reload()` 안

```ts
  state.reservations = data.reservations
```
(기존 `state.boardNotes = data.boardNotes` 다음 줄)

- [ ] **Step 4: 사이드바에 예약 탭** — `NAV_GROUPS`의 '일정' 그룹

```ts
  { label: '일정', items: [['calendar', '📅', '달력'], ['today', '✅', '오늘 할 일'], ['weekly', '📈', '주간 요약'], ['reservations', '📒', '예약']] },
```

- [ ] **Step 5: render 디스패치 추가** — `render()`의 분기

```ts
  else if (state.tab === 'reservations') renderReservations(view)
```
(`else if (state.tab === 'weekly') ...` 다음 줄)

- [ ] **Step 6: renderReservations 작성** — `src/main.ts`에 새 함수(renderWeekly 근처)

```ts
// ---------- 예약(네이버 복붙) ----------
const RESV_SMS = '안녕하세요, 경희선한의원입니다. 예약 확인차 연락드립니다. 변경사항 있으시면 알려주세요.'
function renderReservations(view: HTMLElement): void {
  const day = state.resvDate || todayStr()
  const list = state.reservations
    .filter((r) => r.resv_date === day && r.status !== '취소')
    .sort((a, b) => a.resv_time.localeCompare(b.resv_time))
  const rows = list.map((r) => {
    const herbal = r.type === '한약'
    const phone = (r.phone || '').replace(/[^0-9]/g, '')
    const smsBtn = phone ? `<button class="btn" data-action="sms" data-phone="${phone}" data-body="${RESV_SMS}">📩 문자</button>` : ''
    return `<tr class="${herbal ? 'resv-herbal' : ''}">
      <td>${esc(r.resv_time)}</td>
      <td><span class="chip">${esc(r.status)}</span></td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.menu)}</td>
      <td>${esc(r.phone)}</td>
      <td>${smsBtn} <button class="btn" data-action="toggleResvType" data-id="${r.id}">${herbal ? '침으로' : '한약으로'}</button> <button class="btn" data-action="delResv" data-id="${r.id}">삭제</button></td>
    </tr>`
  }).join('')
  view.innerHTML = `
    <div class="card">
      <h3 class="ch">예약 붙여넣기</h3>
      <p class="muted" style="font-size:13px">네이버 예약자관리 표를 드래그해 복사(Ctrl+C)한 뒤 아래에 붙여넣고(Ctrl+V) [불러오기]를 누르세요. 같은 예약을 또 붙여도 중복되지 않습니다.</p>
      <textarea id="resvPaste" rows="4" style="width:100%;font-size:13px" placeholder="여기에 붙여넣기"></textarea>
      <button class="btn primary" data-action="importResv" style="margin-top:8px">불러오기</button>
    </div>
    <div class="card">
      <div class="row" style="margin-bottom:8px">
        <button class="btn" data-action="resvPrevDay">◀</button>
        <button class="btn" data-action="resvToday">오늘</button>
        <b>${day}</b>
        <button class="btn" data-action="resvNextDay">▶</button>
        <span class="muted" style="font-size:12px">한약 환자는 노란 줄, 침·미정은 기본색. 줄의 [한약으로/침으로]로 바꿀 수 있어요.</span>
      </div>
      ${list.length ? `<table class="tbl">
        <thead><tr><th>시간</th><th>상태</th><th>이름</th><th>메뉴</th><th>연락처</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table>` : '<p class="muted">이 날 예약 없음</p>'}
    </div>`
}
```

- [ ] **Step 7: handleClick에 예약 액션 추가** — `src/main.ts` `handleClick` 안(물품 액션 블록 근처)

```ts
  // --- 예약(네이버 복붙) ---
  if (action === 'importResv') {
    const ta = document.getElementById('resvPaste') as HTMLTextAreaElement | null
    const text = ta?.value ?? ''
    const parsed = parseReservations(text)
    if (!parsed.length) { alert('붙여넣은 내용에서 예약을 찾지 못했어요. 네이버 표를 드래그해 복사했는지 확인해 주세요.'); return }
    const keywords = state.settings.resv_keywords ?? RESV_KEYWORDS_DEFAULT
    const rows = parsed.map((p) => {
      const exist = state.reservations.find((r) => r.resv_no === p.resv_no)
      // 손으로 지정한 종류는 유지, 아니면 상품으로 자동 분류
      const type = exist?.type_manual ? exist.type : classifyType(p.menu, keywords)
      return { ...p, type, type_manual: exist?.type_manual ?? false, note: exist?.note ?? '' }
    })
    await upsertReservations(rows)
    await reload()
    alert(`예약 ${rows.length}건을 반영했습니다.`)
    return
  }
  if (action === 'resvPrevDay') { state.resvDate = addDays(state.resvDate || todayStr(), -1); render(); return }
  if (action === 'resvNextDay') { state.resvDate = addDays(state.resvDate || todayStr(), 1); render(); return }
  if (action === 'resvToday') { state.resvDate = todayStr(); render(); return }
  if (action === 'toggleResvType') {
    const r = state.reservations.find((x) => x.id === id); if (!r) return
    const next = r.type === '한약' ? '침' : '한약'
    await updateReservation(id, { type: next, type_manual: true }); await reload(); return
  }
  if (action === 'delResv') {
    const r = state.reservations.find((x) => x.id === id)
    if (r && confirm(`${r.name} 예약을 지울까요? (Ctrl+Z로 되돌릴 수 있음)`)) {
      const snap = r
      pushUndo(async () => { await insertRaw('reservations', [snap as unknown as Record<string, unknown>]) })
      await deleteReservation(id); await reload()
    }
    return
  }
```

- [ ] **Step 8: 설정에 키워드 카드 추가** — `renderSettings`에 카드 하나 추가(바로가기 카드 근처)

```ts
    <div class="card">
      <h3 class="ch">예약 한약 판정 키워드</h3>
      <p class="muted" style="font-size:13px">예약 상품명에 이 단어가 들어가면 "한약"으로 색 표시합니다. 쉼표로 구분. ("약침"은 침으로 처리됩니다.)</p>
      <input id="resv-kw" style="width:100%" value="${esc((state.settings.resv_keywords ?? RESV_KEYWORDS_DEFAULT).join(', '))}">
      <button class="btn primary" data-action="setResvKw" style="margin-top:8px">저장</button>
    </div>
```

그리고 `handleClick`에 액션 추가:

```ts
  if (action === 'setResvKw') {
    const raw = (document.getElementById('resv-kw') as HTMLInputElement).value
    const kws = raw.split(',').map((s) => s.trim()).filter(Boolean)
    await saveSettings({ ...state.settings, resv_keywords: kws })
    alert('키워드를 저장했습니다.'); await reload(); return
  }
```

- [ ] **Step 9: 스타일 추가** — `index.html` `<style>` 안에 한약 강조행

```css
tr.resv-herbal td { background: #fff7e6; font-weight: 700; }
tr.resv-herbal td:first-child { box-shadow: inset 3px 0 0 var(--gold); }
```

- [ ] **Step 10: 빌드·테스트 확인**

Run: `npm run build`
Expected: 빌드 성공.
Run: `npm test`
Expected: 전체 통과(기존 + 예약 파서 테스트).

- [ ] **Step 11: 커밋**

```bash
git add src/main.ts index.html
git commit -m "feat: 예약 탭 추가(복붙 가져오기·날짜별 목록·한약/침 색·문자)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 12: 푸시 + 실제앱 확인**

```bash
git push origin main
```
Vercel 배포 후 https://gyeonghuiseon-scheduler.vercel.app (PIN 1234) → 사이드바 "예약" → 가짜 예약 텍스트 붙여넣기 → [불러오기] → 날짜 이동으로 그날 목록·색·토글·문자 버튼 확인. (실제 네이버 복붙은 원장과 함께 1건으로 최종 검증.)

---

## 완료 기준 (전체)

- 사이드바 "예약" 탭이 생기고, 문진일정 달력은 그대로다.
- 네이버 표를 복사해 붙여넣고 [불러오기] → 예약이 저장되고 날짜별 목록에 뜬다.
- 같은 표를 다시 붙여도 중복이 안 생긴다(resv_no upsert).
- "통증 클리닉(약침/침)" = 침(기본색), "한약" 포함 상품 = 한약(노란 강조행). 줄에서 한약↔침 토글이 재가져오기 후에도 유지(type_manual).
- 각 줄에서 📩 문자로 그 환자 문자 앱을 열 수 있다.
- 설정에서 한약 판정 키워드를 바꿀 수 있다.

## 나중(비범위)
- 네이버 한약 상품명 재설계(원장과 함께) → 자동 분류 정확도 향상.
- 엑셀 업로드, 자동 스크래핑, 솔라피, 예약↔한약 처방 연결, 한약 강조색 사용자 변경, "다가오는 예약 전체" 보기.
