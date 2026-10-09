import type { Task, Settings } from './types'
import { addDays, nextCallDay } from './dates'

export function buildRecontact(prev: Task, todayAttempt: number, s: Settings): Omit<Task, 'id'> {
  const gap = todayAttempt === 1 ? 3 : 10
  const note = todayAttempt >= 2 ? '원장에게 얘기하기' : ''
  const base = prev.label.replace(/\s*(문진예정|재연락).*$/, '') // "김나나 2-2"
  const label = `${base} 재연락 ${todayAttempt}회차`
  return {
    patient_id: prev.patient_id,
    prescription_id: prev.prescription_id,
    kind: '재연락',
    label,
    // 재연락은 간호사 전화 → 목·일·공휴일 회피(토요일은 가능)
    due_on: nextCallDay(addDays(prev.due_on, gap), s),
    status: '예정',
    attempt: todayAttempt,
    note,
  }
}

export function buildWaitRevival(followup: Task, reviveOn: string, s: Settings): Omit<Task, 'id'> {
  return {
    patient_id: followup.patient_id,
    prescription_id: followup.prescription_id,
    kind: '연락대기',
    label: followup.label.replace(/(문진예정|재연락)/, '대기 만료 — 우리가 먼저 연락'),
    // 우리가 먼저 거는 전화 → 목·일·공휴일 회피(토요일은 가능)
    due_on: nextCallDay(reviveOn, s),
    status: '예정',
    attempt: followup.attempt,
    note: '',
  }
}
