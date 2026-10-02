import { test, expect } from 'vitest'
import { invStatuses, invSeverity, sortInventory, isLow } from '../src/inventory'
import type { InventoryItem } from '../src/types'

function item(p: Partial<InventoryItem>): InventoryItem {
  return { id: p.id ?? 'x', name: p.name ?? '품목', category: p.category ?? '기타', qty: p.qty ?? 10, unit: p.unit ?? '개', expiry: p.expiry ?? null, reorder_at: p.reorder_at ?? null, note: '' }
}
const today = '2026-10-02'

test('유효기간 지남 = 만료', () => {
  expect(invStatuses(item({ expiry: '2026-09-30' }), today, 90)).toContain('expired')
})

test('유효기간 90일 이내 = 임박, 넘으면 정상', () => {
  expect(invStatuses(item({ expiry: '2026-11-01' }), today, 90)).toContain('expiring') // 30일 뒤
  expect(invStatuses(item({ expiry: '2027-03-01' }), today, 90)).toEqual(['ok']) // 150일 뒤
})

test('수량이 부족 기준 이하 = 부족', () => {
  expect(isLow(item({ qty: 2, reorder_at: 3 }))).toBe(true)
  expect(isLow(item({ qty: 5, reorder_at: 3 }))).toBe(false)
  expect(isLow(item({ qty: 0, reorder_at: null }))).toBe(false) // 기준 없으면 부족 아님
  expect(invStatuses(item({ qty: 2, reorder_at: 3 }), today, 90)).toContain('low')
})

test('만료+부족 동시', () => {
  const st = invStatuses(item({ expiry: '2026-01-01', qty: 0, reorder_at: 1 }), today, 90)
  expect(st).toContain('expired'); expect(st).toContain('low')
})

test('정렬: 경고 있는 것이 위로', () => {
  const items = [
    item({ id: 'a', name: '가', qty: 10 }), // ok
    item({ id: 'b', name: '나', qty: 1, reorder_at: 2 }), // low(2)
    item({ id: 'c', name: '다', expiry: '2026-11-01' }), // expiring(1)
  ]
  const sorted = sortInventory(items, today, 90).map((x) => x.id)
  expect(sorted[0]).toBe('b') // 부족 먼저
  expect(sorted[1]).toBe('c') // 임박 다음
  expect(sorted[2]).toBe('a') // 정상 마지막
})

test('심각도 값', () => {
  expect(invSeverity(item({ qty: 10 }), today, 90)).toBe(0)
  expect(invSeverity(item({ expiry: '2026-11-01' }), today, 90)).toBe(1)
  expect(invSeverity(item({ qty: 0, reorder_at: 1 }), today, 90)).toBe(2)
})
