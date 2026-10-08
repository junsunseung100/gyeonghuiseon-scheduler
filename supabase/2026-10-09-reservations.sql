-- 예약(네이버 복붙) 표
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  resv_no text unique not null,
  name text,
  phone text,
  menu text,
  resv_date date,
  resv_time text,
  status text,
  type text,
  type_manual boolean default false,
  note text,
  created_at timestamptz default now()
);
alter table reservations enable row level security;
drop policy if exists "reservations all authenticated" on reservations;
create policy "reservations all authenticated" on reservations
  for all to authenticated using (true) with check (true);

-- 예약 한약 판정 키워드(설정)
alter table settings add column if not exists resv_keywords jsonb;
