-- 대시보드 '우리 메모' 표
create table if not exists board_notes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  created_at timestamptz default now()
);
alter table board_notes enable row level security;
drop policy if exists board_notes_authenticated on board_notes;
create policy board_notes_authenticated on board_notes for all to authenticated using (true) with check (true);
