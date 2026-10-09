import type { Settings } from './types'
import { isClinicClosed, isMsgBlocked, isCallBlocked } from './holidays'

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function nextClinicDay(date: string, s: Settings): string {
  let cur = date
  for (let i = 0; i < 30; i++) {
    if (!isClinicClosed(cur, s)) return cur
    cur = addDays(cur, 1)
  }
  return cur
}

// 확인전화·재연락용: 토요일은 허용하고 목·일·공휴일만 건너뜀
export function nextCallDay(date: string, s: Settings): string {
  let cur = date
  for (let i = 0; i < 30; i++) {
    if (!isCallBlocked(cur, s)) return cur
    cur = addDays(cur, 1)
  }
  return cur
}

export function confirmCallDate(prescribedOn: string, s: Settings): string {
  const base = addDays(prescribedOn, 1)
  return nextCallDay(base, s) // 목·일·공휴일이면 다음 가능일로(토요일은 가능)
}

export function followupDate(prescribedOn: string, s: Settings): string {
  // 10~12 중 휴진 아닌 가장 늦은 날
  for (const off of [12, 11, 10]) {
    const cand = addDays(prescribedOn, off)
    if (!isClinicClosed(cand, s)) return cand
  }
  // 다 막히면 +10 이전으로 하루씩 당겨 첫 진료일
  let cur = addDays(prescribedOn, 9)
  for (let i = 0; i < 30; i++) {
    if (!isClinicClosed(cur, s)) return cur
    cur = addDays(cur, -1)
  }
  return cur
}

// 문자 보낼 수 있는 다음 날(토·일·공휴일 건너뜀, 목요일은 가능)
export function nextMsgDay(date: string, s: Settings): string {
  let cur = date
  for (let i = 0; i < 30; i++) {
    if (!isMsgBlocked(cur, s)) return cur
    cur = addDays(cur, 1)
  }
  return cur
}

export function finalMsg1Date(lastPrescribedOn: string, s: Settings): string {
  return nextMsgDay(addDays(lastPrescribedOn, 12), s)
}

export function finalMsg2Date(msg1On: string, s: Settings): string {
  return nextMsgDay(addDays(msg1On, 10), s)
}
