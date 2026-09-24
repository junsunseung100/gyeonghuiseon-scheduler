import { test, expect } from 'vitest'
import { buildTasksForPrescription, saturdayWarning } from '../src/schedule'
import type { Settings, Patient, Prescription } from '../src/types'

const s: Settings = { weekly_closed: [0, 4], holidays: [], no_delivery: [] }
const kim: Patient = { id: 'p1', name: '김**', region: '서울' }

function rx(y: number, on: string): Prescription {
  return { id: 'r1', block_id: 'b1', patient_id: 'p1', y, overall: y, prescribed_on: on }
}

test('중간 회차: 처방문자(한 항목) / 확인전화(같은 번호) / 문진예정(다음 번호)', () => {
  const tasks = buildTasksForPrescription(kim, rx(1, '2026-09-08'), 6, s)
  const kinds = tasks.map((t) => t.kind)
  expect(kinds).toEqual(['처방문자', '확인전화', '문진예정'])
  const pm = tasks.find((t) => t.kind === '처방문자')!
  const call = tasks.find((t) => t.kind === '확인전화')!
  const followup = tasks.find((t) => t.kind === '문진예정')!
  expect(pm.label).toContain('6-1')
  expect(pm.label).toContain('처방·문자')
  expect(call.label).toContain('6-1')
  expect(call.due_on).toBe('2026-09-09')
  expect(followup.label).toContain('6-2') // 다음 번호
  expect(followup.due_on).toBe('2026-09-19')
})

test('목요일 처방이어도 처방문자는 그날(목)에 그대로', () => {
  // 09-10(목) 처방 → 처방문자 due_on = 09-10(목), 확인전화는 다음날 금요일
  const tasks = buildTasksForPrescription(kim, rx(2, '2026-09-10'), 6, s)
  const pm = tasks.find((t) => t.kind === '처방문자')!
  expect(pm.due_on).toBe('2026-09-10')
  const call = tasks.find((t) => t.kind === '확인전화')!
  expect(call.due_on).toBe('2026-09-11') // 금
})

test('마지막 회차(y===x)는 문진예정 대신 마무리문자 1·2', () => {
  const tasks = buildTasksForPrescription(kim, rx(6, '2026-09-08'), 6, s)
  const kinds = tasks.map((t) => t.kind)
  expect(kinds).toContain('마무리문자1')
  expect(kinds).toContain('마무리문자2')
  expect(kinds).not.toContain('문진예정')
  const m1 = tasks.find((t) => t.kind === '마무리문자1')!
  const m2 = tasks.find((t) => t.kind === '마무리문자2')!
  expect(m1.due_on).toBe('2026-09-20') // +12
  expect(m2.due_on).toBe('2026-09-30') // 1차+10
})

test('토요일 + 지방이면 경고', () => {
  const jibang: Patient = { id: 'p2', name: '박**', region: '지방' }
  expect(saturdayWarning(jibang, '2026-09-12')).not.toBeNull() // 토
  expect(saturdayWarning(kim, '2026-09-12')).toBeNull() // 서울
})
