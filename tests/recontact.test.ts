import { test, expect } from 'vitest'
import { buildRecontact, buildWaitRevival } from '../src/recontact'
import type { Task, Settings } from '../src/types'

const s: Settings = { weekly_closed: [0, 4], holidays: [], no_delivery: [] }
const base: Task = {
  id: 't1', patient_id: 'p1', prescription_id: 'r1', kind: '문진예정',
  label: '김** 6-2 문진예정', due_on: '2026-09-19', status: '연락안됨', attempt: 0, note: '',
}

test('1회째 연락 안 됨 → 3일 뒤 재연락(평일이면 그대로), 라벨에 회차', () => {
  const r = buildRecontact(base, 1, s) // 09-19(토)+3=09-22(화)
  expect(r.kind).toBe('재연락')
  expect(r.label).toBe('김** 6-2 재연락 1회차')
  expect(r.due_on).toBe('2026-09-22')
  expect(r.note).toBe('')
})

test('2회째부터 → 10일 뒤 + 원장에게 얘기하기, 회차 누적', () => {
  const prev = { ...base, kind: '재연락' as const, label: '김** 6-2 재연락 1회차' }
  const r = buildRecontact(prev, 2, s) // 09-19+10=09-29(화)
  expect(r.label).toBe('김** 6-2 재연락 2회차')
  expect(r.due_on).toBe('2026-09-29')
  expect(r.note).toContain('원장에게 얘기하기')
})

test('재연락이 목요일에 걸리면 금요일로(간호사 없음)', () => {
  const prev = { ...base, due_on: '2026-09-28' } // 월
  const r = buildRecontact(prev, 1, s) // +3=10-01(목) → 10-02(금)
  expect(r.due_on).toBe('2026-10-02')
})

test('재연락이 토·일에 걸리면 다음 진료일(월)로', () => {
  const prev = { ...base, due_on: '2026-10-07' } // 수
  const r = buildRecontact(prev, 1, s) // +3=10-10(토) → 10-12(월)
  expect(r.due_on).toBe('2026-10-12')
})

test('환자가 연락 주기로 함 → 그날이 휴진이면 다음 진료일로', () => {
  const w = buildWaitRevival(base, '2026-10-01', s) // 목 → 금
  expect(w.kind).toBe('연락대기')
  expect(w.due_on).toBe('2026-10-02')
  expect(w.label).toContain('우리가 먼저 연락')
})
