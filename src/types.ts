export type Region = '서울' | '지방' | '해외'

export type TaskKind =
  | '처방' | '문자' | '확인전화' | '문진예정'
  | '재연락' | '마무리문자1' | '마무리문자2' | '연락대기'

export type TaskStatus = '예정' | '완료' | '연락안됨' | '대기' | '취소'

export interface Patient {
  id: string
  name: string
  region: Region // 서울/지방/해외 (지방·해외는 배지)
  birth?: string // 생년 또는 생년월일 (동명이인 구분용, 선택)
  first_herbal?: boolean // 한약 초진 여부
}

export interface Block {
  id: string
  patient_id: string
  months: 1 | 2 | 3 // 결제 개월수
  x: number // months * 2 (총 처방수)
  created_at: string
}

export interface Prescription {
  id: string
  block_id: string
  patient_id: string
  y: number // 블록 내 순번 (1..x)
  overall: number // 통산 회차
  prescribed_on: string // YYYY-MM-DD
}

export interface Task {
  id: string
  patient_id: string
  prescription_id: string | null
  kind: TaskKind
  label: string // 예: "김** 6-2 문진예정"
  due_on: string // YYYY-MM-DD
  status: TaskStatus
  attempt: number // 재연락 시도 횟수 (기본 0)
  note: string // 예: "원장에게 얘기하기"
}

export interface Settings {
  weekly_closed: number[] // 요일 휴진 [0=일,4=목]
  holidays: string[] // 법정공휴일 YYYY-MM-DD
  no_delivery: string[] // 원외탕전 택배 불가일 YYYY-MM-DD
}
