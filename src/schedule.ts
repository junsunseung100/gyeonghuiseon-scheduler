import type { Patient, Prescription, Task, Settings } from './types'
import { addDays, confirmCallDate, followupDate, finalMsg1Date, finalMsg2Date } from './dates'
import { isClinicClosed, dow } from './holidays'

type NewTask = Omit<Task, 'id'>
const num = (x: number, y: number) => `${x}-${y}`

// numberOverride: "2-2" 처럼 원장이 직접 적은 번호. 있으면 그 번호를 쓴다.
export function buildTasksForPrescription(p: Patient, rx: Prescription, x: number, s: Settings, numberOverride?: string): NewTask[] {
  const tasks: NewTask[] = []
  let numX = x, numY = rx.y
  if (numberOverride) {
    const mt = numberOverride.match(/^(\d+)-(\d+)$/)
    if (mt) { numX = Number(mt[1]); numY = Number(mt[2]) }
  }
  const isLast = numY >= numX
  const dname = p.birth ? `${p.name}(${p.birth})` : p.name
  const tag = `${dname} ${num(numX, numY)}`

  // 처방·문자 (한 항목) — 처방이 실제로 나가는 날(처방일) 그대로. 목요일도 원외탕전 운영일이라 그날 표시.
  tasks.push({
    patient_id: p.id, prescription_id: rx.id, kind: '처방문자',
    label: `${tag} 처방·문자`, due_on: rx.prescribed_on, status: '예정', attempt: 0, note: '',
  })

  // 확인전화 (+1, 휴진 회피)
  tasks.push({
    patient_id: p.id, prescription_id: rx.id, kind: '확인전화',
    label: `${tag} 확인전화`, due_on: confirmCallDate(rx.prescribed_on, s), status: '예정', attempt: 0, note: '',
  })

  if (isLast) {
    // 마지막 회차: 마무리문자 1·2
    const m1 = finalMsg1Date(rx.prescribed_on, s)
    const m2 = finalMsg2Date(m1, s)
    tasks.push({
      patient_id: p.id, prescription_id: rx.id, kind: '마무리문자1',
      label: `${dname} 마무리 문자 1차`, due_on: m1, status: '예정', attempt: 0, note: '',
    })
    tasks.push({
      patient_id: p.id, prescription_id: rx.id, kind: '마무리문자2',
      label: `${dname} 마무리 문자 2차`, due_on: m2, status: '예정', attempt: 0, note: '',
    })
  } else {
    // 문진예정 (다음 번호)
    tasks.push({
      patient_id: p.id, prescription_id: rx.id, kind: '문진예정',
      label: `${dname} ${num(numX, numY + 1)} 문진예정`, due_on: followupDate(rx.prescribed_on, s), status: '예정', attempt: 0, note: '',
    })
  }
  return tasks
}

// 날짜 팝업에서 처방 없이 한 가지 일정만 손으로 넣기(간호사 요청 2026-10-15).
// 번호는 팝업 번호 칸 그대로. 「다시 연락하기」는 재연락 — 이후 연락 안 됨 흐름(3일→10일)이 그대로 이어진다.
export type ManualKind = '문진예정' | '재연락' | '확인전화'
export const MANUAL_LABEL: Record<ManualKind, string> = { 문진예정: '문진예정', 재연락: '다시 연락하기', 확인전화: '확인전화' }

export function buildManualTask(p: Patient, kind: ManualKind, date: string, number: string, rxId: string | null): NewTask {
  const dname = p.birth ? `${p.name}(${p.birth})` : p.name
  const tag = number.trim() ? `${dname} ${number.trim()}` : dname
  return { patient_id: p.id, prescription_id: rxId, kind, label: `${tag} ${kind}`, due_on: date, status: '예정', attempt: 0, note: '' }
}

export function saturdayWarning(p: Patient, prescribedOn: string): string | null {
  if (dow(prescribedOn) === 6 && (p.region === '지방' || p.region === '해외')) {
    return '토요일 지방/해외 처방 — 주말 배송 중단 주의(꼭 그날 요청이면 진행)'
  }
  return null
}
