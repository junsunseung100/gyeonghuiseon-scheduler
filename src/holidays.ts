import type { Settings } from './types'

export function dow(date: string): number {
  return new Date(date + 'T00:00:00').getDay()
}

// 양력 고정 법정공휴일 (음력 설·추석·부처님오신날·대체공휴일은 설정에서 직접 추가)
const FIXED_HOLIDAYS: Record<string, string> = {
  '01-01': '신정', '03-01': '삼일절', '05-05': '어린이날', '06-06': '현충일',
  '08-15': '광복절', '10-03': '개천절', '10-09': '한글날', '12-25': '성탄절',
}

export function holidayName(date: string, s: Settings): string | null {
  const md = date.slice(5) // MM-DD
  if (FIXED_HOLIDAYS[md]) return FIXED_HOLIDAYS[md]
  if (s.holidays.includes(date)) return '공휴일'
  return null
}

export function isHoliday(date: string, s: Settings): boolean {
  return holidayName(date, s) !== null
}

// 원내 직원이 필요한 일(확인전화·문진)이 불가한 날: 매주 휴진(일·목) + 토요일 + 공휴일
export function isClinicClosed(date: string, s: Settings): boolean {
  return s.weekly_closed.includes(dow(date)) || dow(date) === 6 || isHoliday(date, s)
}

// 문자·처방이 잡히면 안 되는 날: 토·일·공휴일 전면 제외 (목요일은 예약 발송 가능해서 허용)
export function isMsgBlocked(date: string, s: Settings): boolean {
  const d = dow(date)
  return d === 0 || d === 6 || isHoliday(date, s)
}

export function isDispensaryOpen(date: string, s: Settings): boolean {
  // 원외탕전: 일요일과 공휴일만 휴무 (목·토는 운영)
  return dow(date) !== 0 && !isHoliday(date, s)
}
