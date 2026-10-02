export type Region = '서울' | '지방' | '해외'

export type TaskKind =
  | '처방문자' | '처방' | '문자' | '확인전화' | '문진예정'
  | '재연락' | '마무리문자1' | '마무리문자2' | '연락대기' | '메모'

export type TaskStatus = '예정' | '완료' | '연락안됨' | '대기' | '취소'

export interface Patient {
  id: string
  name: string
  region: Region // 서울/지방/해외 (지방·해외는 배지)
  birth?: string // 생년 또는 생년월일 (동명이인 구분용, 선택)
  first_herbal?: boolean // 한약 초진 여부
  phone?: string // 전화번호 (문자 보내기용, 선택)
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
  pin?: string // 4자리 PIN (빠른 로그인)
  max_saturday?: number // (사용 안 함) 과거 토요일 문진 제한
  colors?: Record<string, string> // 종류별 색 (간호사가 설정에서 변경, 전 기기 공유)
  expiry_warn_days?: number // 유효기간 임박 경고 일수 (기본 90)
}

export interface InventoryItem {
  id: string
  name: string
  category: string // 외용제/내복/소모품/기타
  qty: number
  unit: string // 개·통·박스 등
  expiry?: string | null // YYYY-MM-DD
  reorder_at?: number | null // 이 수량 이하면 '부족'
  note?: string
  created_at?: string
}

export interface SupplyRequest {
  id: string
  name: string
  qty: number
  unit: string
  status: '요청' | '확인' | '도착'
  inventory_id?: string | null // 약장 품목과 연결(도착 시 그 품목에 수량 더함)
  note?: string
  created_at?: string
}
