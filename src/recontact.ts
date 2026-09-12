import type { Task } from './types'
import { addDays } from './dates'

export function buildRecontact(prev: Task, todayAttempt: number): Omit<Task, 'id'> {
  const gap = todayAttempt === 1 ? 3 : 10
  const note = todayAttempt >= 2 ? '원장에게 얘기하기' : ''
  const label = prev.label.replace(/(문진예정|재연락)/, '재연락')
  return {
    patient_id: prev.patient_id,
    prescription_id: prev.prescription_id,
    kind: '재연락',
    label,
    due_on: addDays(prev.due_on, gap),
    status: '예정',
    attempt: todayAttempt,
    note,
  }
}

export function buildWaitRevival(followup: Task, reviveOn: string): Omit<Task, 'id'> {
  return {
    patient_id: followup.patient_id,
    prescription_id: followup.prescription_id,
    kind: '연락대기',
    label: followup.label.replace(/(문진예정|재연락)/, '대기 만료 — 우리가 먼저 연락'),
    due_on: reviveOn,
    status: '예정',
    attempt: followup.attempt,
    note: '',
  }
}
