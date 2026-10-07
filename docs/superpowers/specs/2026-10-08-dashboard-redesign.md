# 대시보드 대대적 개편 — 설계 (2026-10-08)

목표: 열면 "하루 일의 흐름이 확" 보이게. ①문제부터 + ②오늘 할 일을 '하는 순서'대로 + ③직접 적는 메모. 원장 일월 승인(시안 확인).

## 화면 구성(위→아래)
1. **🔴 긴급 밴드** — 큰 숫자 카드 4개: 놓친(밀린 예정) · 연락 안 됨/재연락/대기 · 완주 임박 · 물품(주문 필요+물품 경고). 색으로 긴급도, 0이면 차분히. 클릭 시 해당 탭으로(놓친→오늘 할 일, 연락안됨→연락 안 됨, 물품→물품).
2. **📝 우리 메모** — 한 줄씩 자유롭게 추가(입력+추가), ✕로 삭제. 날짜 없음, 서버 저장(모든 기기 공유). 달력 날짜 메모와 별개.
3. **오늘 할 일 — 하는 순서대로** — 단계 카드 5개를 순서대로:
   1 처방·문자(처방문자/처방/문자) · 2 확인전화 · 3 문진예정 · 4 마무리문자(1·2) · 5 재연락(재연락/연락대기)
   - 각 단계: "N/M 완료" 진행 막대 + 그 단계 오늘 항목 체크리스트(status 예정·완료만, 취소·연락안됨 제외).
   - 체크박스 토글 = 완료/되돌리기(updateTask). 완료는 회색 줄긋기.
   - 문자 단계 항목엔 [📩 문자](전화번호 있을 때). 오늘 할 게 없는 단계는 "오늘 없음" 흐리게.
4. **(아래, 작게)** 연락 안 됨·완주 임박 상세 목록 + 이번 주 처방 나간 환자 수.

## 데이터
- 새 표 **board_notes**(id uuid, text, created_at). RLS authenticated. loadAll에 포함(없으면 [] 처리).
- 기존 tasks/supply/inventory 재사용.

## 영향 파일
- types.ts: BoardNote.
- supabase.ts: loadAll에 board_notes, insertBoardNote/deleteBoardNote.
- main.ts: State.boardNotes, reload, renderDashboard 재작성, 핸들러(toggleDone, addNote, delNote). 밴드는 기존 data-tab 재사용.
- DB: board_notes 표 생성 SQL(Chrome SQL 편집기에서 실행).

## 핸들러
- toggleDone: 해당 task status 완료↔예정 토글 후 reload.
- addNote: 입력값으로 board_notes insert.
- delNote: id로 board_notes delete.

## 수용 기준
- 밴드 숫자가 실제 데이터와 맞고 클릭 시 해당 탭 이동.
- 오늘 할 일이 단계 순서로 뜨고, 체크하면 완료/회색, 진행 막대 반영.
- 메모 추가·삭제가 되고 새로고침·다른 기기에서도 보임.

## 제외(다음)
- 완주율/재방문 통계(별도), 드래그 정렬 등.
