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
