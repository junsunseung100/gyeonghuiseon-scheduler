import { test, expect } from 'vitest'
import { isClinicClosed, isDispensaryOpen, dow } from '../src/holidays'
import type { Settings } from '../src/types'

const s: Settings = { weekly_closed: [0, 4], holidays: ['2026-09-29'], no_delivery: [] }

test('요일 계산', () => {
  expect(dow('2026-09-09')).toBe(3) // 수요일
})

test('일·목·공휴일은 한의원 휴진', () => {
  expect(isClinicClosed('2026-09-13', s)).toBe(true) // 일
  expect(isClinicClosed('2026-09-10', s)).toBe(true) // 목
  expect(isClinicClosed('2026-09-29', s)).toBe(true) // 공휴일(설정)
  expect(isClinicClosed('2026-09-09', s)).toBe(false) // 수
})

test('개천절 등 양력 고정 공휴일은 설정 없이도 인식', () => {
  const empty: Settings = { weekly_closed: [0, 4], holidays: [], no_delivery: [] }
  expect(isClinicClosed('2026-10-03', empty)).toBe(true) // 개천절
  expect(isClinicClosed('2026-01-01', empty)).toBe(true) // 신정
})

test('원외탕전은 목·토 운영, 일·공휴일 휴무', () => {
  expect(isDispensaryOpen('2026-09-10', s)).toBe(true) // 목 운영
  expect(isDispensaryOpen('2026-09-12', s)).toBe(true) // 토 운영
  expect(isDispensaryOpen('2026-09-13', s)).toBe(false) // 일 휴무
  expect(isDispensaryOpen('2026-09-29', s)).toBe(false) // 공휴일 휴무
})
