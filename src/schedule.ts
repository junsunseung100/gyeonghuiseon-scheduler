import type { Patient, Prescription, Task, Settings } from './types'
import { addDays, confirmCallDate, followupDate, finalMsg1Date, finalMsg2Date } from './dates'
import { isClinicClosed, dow } from './holidays'

type NewTask = Omit<Task, 'id'>
const num = (x: number, y: number) => `${x}-${y}`

export function buildTasksForPrescription(p: Patient, rx: Prescription, x: number, s: Settings): NewTask[] {
  const tasks: NewTask[] = []
  const tag = `${p.name} ${num(x, rx.y)}`

  // 처방 (당일)
  tasks.push({
    patient_id: p.id, prescription_id: rx.id, kind: '처방',
    label: `${tag} 처방`, due_on: rx.prescribed_on, status: '예정', attempt: 0, note: '',
  })

  // 문자: 처방일이 한의원 휴진이면 직전 진료일에 "미리 예약"
  let msgDue = rx.prescribed_on
  let msgNote = ''
  if (isClinicClosed(rx.prescribed_on, s)) {
    let cur = addDays(rx.prescribed_on, -1)
    while (isClinicClosed(cur, s)) cur = addDays(cur, -1)
    msgDue = cur
    msgNote = '미리 예약'
  }
  tasks.push({
    patient_id: p.id, prescription_id: rx.id, kind: '문자',
    label: `${tag} 문자`, due_on: msgDue, status: '예정', attempt: 0, note: msgNote,
  })

  // 확인전화 (+1, 휴진 회피)
  tasks.push({
    patient_id: p.id, prescription_id: rx.id, kind: '확인전화',
    label: `${tag} 확인전화`, due_on: confirmCallDate(rx.prescribed_on, s), status: '예정', attempt: 0, note: '',
  })

  if (rx.y === x) {
    // 마지막 회차: 마무리문자 1·2
    const m1 = finalMsg1Date(rx.prescribed_on)
    const m2 = finalMsg2Date(m1)
    tasks.push({
      patient_id: p.id, prescription_id: rx.id, kind: '마무리문자1',
      label: `${p.name} 마무리 문자 1차`, due_on: m1, status: '예정', attempt: 0, note: '',
    })
    tasks.push({
      patient_id: p.id, prescription_id: rx.id, kind: '마무리문자2',
      label: `${p.name} 마무리 문자 2차`, due_on: m2, status: '예정', attempt: 0, note: '',
    })
  } else {
    // 문진예정 (다음 번호)
    tasks.push({
      patient_id: p.id, prescription_id: rx.id, kind: '문진예정',
      label: `${p.name} ${num(x, rx.y + 1)} 문진예정`, due_on: followupDate(rx.prescribed_on, s), status: '예정', attempt: 0, note: '',
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
