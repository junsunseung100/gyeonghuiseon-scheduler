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

  // 처방·문자 (한 항목). 처방일이 한의원 휴진이면 직전 진료일에 "미리 예약"
  let due = rx.prescribed_on
  let note = ''
  if (isClinicClosed(rx.prescribed_on, s)) {
    let cur = addDays(rx.prescribed_on, -1)
    while (isClinicClosed(cur, s)) cur = addDays(cur, -1)
    due = cur
    note = '미리 예약'
  }
  tasks.push({
    patient_id: p.id, prescription_id: rx.id, kind: '처방문자',
    label: `${tag} 처방·문자`, due_on: due, status: '예정', attempt: 0, note,
  })

  // 확인전화 (+1, 휴진 회피)
  tasks.push({
    patient_id: p.id, prescription_id: rx.id, kind: '확인전화',
    label: `${tag} 확인전화`, due_on: confirmCallDate(rx.prescribed_on, s), status: '예정', attempt: 0, note: '',
  })

  if (isLast) {
    // 마지막 회차: 마무리문자 1·2
    const m1 = finalMsg1Date(rx.prescribed_on)
    const m2 = finalMsg2Date(m1)
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

export function saturdayWarning(p: Patient, prescribedOn: string): string | null {
  if (dow(prescribedOn) === 6 && (p.region === '지방' || p.region === '해외')) {
    return '토요일 지방/해외 처방 — 주말 배송 중단 주의(꼭 그날 요청이면 진행)'
  }
  return null
}
