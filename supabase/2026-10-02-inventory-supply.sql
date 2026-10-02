-- V2.1/V2.2 마이그레이션: 설정 칸 2개 + 약장·물품신청 표 2개
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run

-- 1) 설정: 색 설정 + 유효기간 경고일수
alter table settings add column if not exists colors jsonb;
alter table settings add column if not exists expiry_warn_days int;

-- 2) 약장·재고
create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  qty numeric default 0,
  unit text,
  expiry date,
  reorder_at numeric,
  note text default '',
  created_at timestamptz default now()
);
alter table inventory enable row level security;
drop policy if exists inventory_authenticated on inventory;
create policy inventory_authenticated on inventory for all to authenticated using (true) with check (true);

-- 3) 물품 신청
create table if not exists supply_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qty numeric default 1,
  unit text,
  status text default '요청',
  inventory_id uuid,
  note text default '',
  created_at timestamptz default now()
);
alter table supply_requests enable row level security;
drop policy if exists supply_requests_authenticated on supply_requests;
create policy supply_requests_authenticated on supply_requests for all to authenticated using (true) with check (true);
