import type { Settings } from './types'

export function dow(date: string): number {
  return new Date(date + 'T00:00:00').getDay()
}

export function isHoliday(date: string, s: Settings): boolean {
  return s.holidays.includes(date)
}

export function isClinicClosed(date: string, s: Settings): boolean {
  return s.weekly_closed.includes(dow(date)) || isHoliday(date, s)
}

export function isDispensaryOpen(date: string, s: Settings): boolean {
  // 원외탕전: 일요일과 공휴일만 휴무 (목·토는 운영)
  return dow(date) !== 0 && !isHoliday(date, s)
}
