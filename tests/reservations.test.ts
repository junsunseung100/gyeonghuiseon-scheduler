import { test, expect } from 'vitest'
import { parseResvDate, classifyType, parseReservations, RESV_KEYWORDS_DEFAULT } from '../src/reservations'

test('parseResvDate: 두자리/한자리 월일 모두 0패딩', () => {
  expect(parseResvDate('26.10.10.토')).toBe('2026-10-10')
  expect(parseResvDate('26.9.17.목')).toBe('2026-09-17')
})
test('parseResvDate: 형식 아니면 빈 문자열', () => {
  expect(parseResvDate('어제')).toBe('')
  expect(parseResvDate('2026-10-10')).toBe('')
})

test('classifyType: 약침/침은 침(한약 아님)', () => {
  expect(classifyType('통증 클리닉(약침/침)', RESV_KEYWORDS_DEFAULT)).toBe('침')
})
test('classifyType: 상품에 한약 키워드 있으면 한약', () => {
  expect(classifyType('한약 상담', RESV_KEYWORDS_DEFAULT)).toBe('한약')
  expect(classifyType('첩약 처방', RESV_KEYWORDS_DEFAULT)).toBe('한약')
})

const SAMPLE = `오늘이용
0
확정대기
2
오늘취소
0
3건
내려받기
상세 내려받기
인쇄
상태\t예약자\t전화번호\t예약번호\t
이용일시
상품
옵션
요청사항
총금액
신청일시
확정일시
취소일시
확정\t
김가나
010-0000-0001\t1354860833\t
26.10.10.토
12:00
통증 클리닉(약침/침)
-
0원
26.9.17.목
18:36
26.9.18.금
09:17
-
신청\t
이다라
010-0000-0002\t1373668176\t
26.10.16.금
12:00
한약 상담
-
0원
26.10.8.목
12:01
-
-`

test('parseReservations: 레코드 2건을 정확히 뽑는다', () => {
  const rs = parseReservations(SAMPLE)
  expect(rs.length).toBe(2)
  expect(rs[0]).toEqual({
    resv_no: '1354860833', name: '김가나', phone: '010-0000-0001',
    menu: '통증 클리닉(약침/침)', resv_date: '2026-10-10', resv_time: '12:00', status: '확정',
  })
  expect(rs[1]).toEqual({
    resv_no: '1373668176', name: '이다라', phone: '010-0000-0002',
    menu: '한약 상담', resv_date: '2026-10-16', resv_time: '12:00', status: '신청',
  })
})

test('parseReservations: 같은 예약번호 두 번이면 1건(뒤엣것)', () => {
  const dup = SAMPLE + `
확정\t
김가나
010-0000-0001\t1354860833\t
26.10.11.일
09:00
통증 클리닉(약침/침)
-
0원`
  const rs = parseReservations(dup)
  expect(rs.length).toBe(2)
  const r = rs.find((x) => x.resv_no === '1354860833')!
  expect(r.resv_date).toBe('2026-10-11') // 마지막 값으로 갱신
})
