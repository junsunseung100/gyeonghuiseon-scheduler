import { test, expect } from 'vitest'
import { buildRecontact, buildWaitRevival } from '../src/recontact'
import type { Task } from '../src/types'

const base: Task = {
  id: 't1', patient_id: 'p1', prescription_id: 'r1', kind: '문진예정',
  label: '김** 6-2 문진예정', due_on: '2026-09-19', status: '연락안됨', attempt: 0, note: '',
}

test('1회째 연락 안 됨 → 3일 뒤 재연락', () => {
  const r = buildRecontact(base, 1)
  expect(r.kind).toBe('재연락')
  expect(r.label).toContain('6-2')
  expect(r.due_on).toBe('2026-09-22') // +3
  expect(r.note).toBe('')
})

test('2회째부터 → 10일 뒤 + 원장에게 얘기하기', () => {
  const r = buildRecontact({ ...base, kind: '재연락' }, 2)
  expect(r.due_on).toBe('2026-09-29') // +10
  expect(r.note).toContain('원장에게 얘기하기')
})

test('환자가 연락 주기로 함 → 정한 날 되살아남', () => {
  const w = buildWaitRevival(base, '2026-10-01')
  expect(w.kind).toBe('연락대기')
  expect(w.due_on).toBe('2026-10-01')
  expect(w.label).toContain('우리가 먼저 연락')
})
