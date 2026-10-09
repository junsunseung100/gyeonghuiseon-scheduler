-- 우리 메모를 날짜별로: 메모에 해당 날짜 컬럼 추가(없으면 상시)
alter table board_notes add column if not exists note_date date;
