# 약장·재고 + 물품 신청 (연결) — 설계 (2026-10-02)

출처: DK 운영 대시보드(재고·물품신청) + 구디 약장(유효기간) 참고. 원장 일월 승인.
현재 스케줄러(Vite+TS+Supabase)에 모듈로 추가. 외부 서비스 없음.

## 목표
재고가 떨어지면 눈에 띄고, 한 번 눌러 바로 주문 요청까지. 약장↔물품신청을 연결.

## A. 약장·재고 (새 탭 "약장")
- 품목 저장: name · category(외용제/내복/소모품/기타) · qty + unit · expiry(선택) · reorder_at(부족 기준, 선택) · note.
- 화면:
  - 요약: ⚠️ 유효기간 임박 N · 📉 부족 N (누르면 그것만 필터).
  - 품목 추가 한 줄 입력.
  - 목록: 경고 있는 것(만료·임박·부족)이 위로. 각 줄 수량 [−][+], 수정·삭제(Ctrl+Z 되돌리기).
  - 경고: expiry < 오늘 = 만료(빨강), expiry ≤ 오늘+경고일수 = 임박(주황), qty ≤ reorder_at = 부족(빨강).
  - 부족/거의 소진 품목 줄에 [물품 신청] 버튼 → supply_requests에 추가.
- 설정: expiry_warn_days(기본 90) 변경 가능.

## B. 물품 신청 (새 탭 "물품신청")
- 상태: 요청 → 확인 → 도착. 버튼으로 다음 단계 이동.
- 도착 체크 시: (해당 inventory_id 있으면) 그 품목 수량에 신청 수량 더하기(선택 확인).
- "새 물품 신청" 수동 입력도 가능.
- 삭제(되돌리기).

## C. 연결·노출
- 약장 부족 품목 [물품 신청] → 물품신청 목록(status=요청).
- 대시보드(오늘 한눈에)에 "주문 필요 N건"(요청 상태) 한 줄 알림 추가.
- 탭 배지는 생략(요약 숫자/대시보드로 충분). 달력 메모 버튼: 이번엔 제외(기본 끔).

## 데이터 (Supabase 새 표 2개)
- **inventory**: id, name, category, qty(numeric), unit, expiry(date null), reorder_at(numeric null), note, created_at.
- **supply_requests**: id, name, qty, unit, status(요청/확인/도착), inventory_id(null), note, created_at.
- RLS 켜고 authenticated 정책(다른 표와 동일). settings에 expiry_warn_days(int) 추가.
- 마이그레이션 SQL은 전에 남은 colors 칸과 함께 Supabase에서 실행(또는 안내).

## 영향 파일
- types.ts: InventoryItem, SupplyRequest, Settings.expiry_warn_days.
- supabase.ts: loadAll에 inventory·supply_requests 추가, CRUD 함수, loadSettings에 expiry_warn_days.
- main.ts: State 확장, 약장/물품신청 탭 렌더·핸들러, 대시보드 알림.
- index.html: 재고 경고 색 스타일.
- CLAUDE.md: 표·탭 추가 반영.

## 순수 로직·테스트
- `inventory.ts`: 경고 판정(만료/임박/부족) 순수 함수 + 정렬 → 단위 테스트.

## 수용 기준
- 약장 탭에서 품목 추가·수량 조정·삭제 됨. 유효기간/부족 경고가 색으로 보임.
- 부족 품목 [물품 신청] → 물품신청 목록에 뜸. 상태 요청→확인→도착 진행, 도착 시 재고 반영.
- 대시보드에 "주문 필요 N건" 보임.

## 다음 라운드(별도)
- 대시보드 대대적 개편(하루 일의 흐름 시각화) — 약장·물품 알림 포함해 새 브레인스토밍.
