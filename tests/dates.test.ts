import { test, expect } from 'vitest'
import { addDays, confirmCallDate, followupDate, finalMsg1Date, finalMsg2Date } from '../src/dates'
import type { Settings } from '../src/types'

const s: Settings = { weekly_closed: [0, 4], holidays: [], no_delivery: [] }

test('addDays', () => {
  expect(addDays('2026-09-09', 1)).toBe('2026-09-10')
  expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
})

test('확인전화는 처방+1, 젬마 예시', () => {
  // 09-08(화) 처방 → 확인전화 09-09(수)
  expect(confirmCallDate('2026-09-08', s)).toBe('2026-09-09')
})

test('수요일 처방이면 확인전화는 금요일(목 휴진 회피)', () => {
  // 09-09(수) 처방 → +1 09-10(목 휴진) → 09-11(금)
  expect(confirmCallDate('2026-09-09', s)).toBe('2026-09-11')
})

test('문진예정은 10~12 중 휴진 아닌 가장 늦은 날, 젬마 예시', () => {
  // 09-08 처방 → +12 09-20(일 휴진) → +11 09-19(토, 진료일) = 09-19
  expect(followupDate('2026-09-08', s)).toBe('2026-09-19')
})

test('10~12가 다 휴진이면 앞으로 당김', () => {
  const s2: Settings = { weekly_closed: [0, 4], holidays: ['2026-10-05', '2026-10-06', '2026-10-07'], no_delivery: [] }
  // 09-25 처방 → +10=10-05,+11=10-06,+12=10-07 모두 공휴일 → 앞으로 당김.
  // +9=10-04(일 휴진) 건너뛰고 10-03(토, 진료일)
  expect(followupDate('2026-09-25', s2)).toBe('2026-10-03')
})

test('마무리 문자 1차 +12, 2차 1차+10', () => {
  expect(finalMsg1Date('2026-09-08')).toBe('2026-09-20')
  expect(finalMsg2Date('2026-09-20')).toBe('2026-09-30')
})
