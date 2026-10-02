import type { InventoryItem } from './types'

export type InvStatus = 'ok' | 'expired' | 'expiring' | 'low'

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00').getTime()
  const db = new Date(b + 'T00:00:00').getTime()
  return Math.round((db - da) / 86400000)
}

export function isLow(it: InventoryItem): boolean {
  return it.reorder_at != null && it.qty <= it.reorder_at
}

// 오늘·경고일수 기준 상태들(여러 개 가능: 만료+부족 등)
export function invStatuses(it: InventoryItem, today: string, warnDays: number): InvStatus[] {
  const out: InvStatus[] = []
  if (it.expiry) {
    if (it.expiry < today) out.push('expired')
    else if (daysBetween(today, it.expiry) <= warnDays) out.push('expiring')
  }
  if (isLow(it)) out.push('low')
  if (out.length === 0) out.push('ok')
  return out
}

// 심각도: 만료·부족=2, 임박=1, 정상=0
export function invSeverity(it: InventoryItem, today: string, warnDays: number): number {
  const st = invStatuses(it, today, warnDays)
  if (st.includes('expired') || st.includes('low')) return 2
  if (st.includes('expiring')) return 1
  return 0
}

// 경고 있는 것 위로, 그다음 이름순
export function sortInventory(items: InventoryItem[], today: string, warnDays: number): InventoryItem[] {
  return [...items].sort((a, b) =>
    invSeverity(b, today, warnDays) - invSeverity(a, today, warnDays) || a.name.localeCompare(b.name, 'ko'))
}
