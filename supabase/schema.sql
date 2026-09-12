-- 기존 테이블 정리 (재실행 안전)
drop table if exists tasks cascade;
drop table if exists prescriptions cascade;
drop table if exists blocks cascade;
drop table if exists patients cascade;
drop table if exists settings cascade;

-- 테이블 생성
create table patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text not null default '서울',
  birth text not null default '',
  first_herbal boolean not null default false
);

create table blocks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  months int not null,
  x int not null,
  created_at timestamptz default now()
);

create table prescriptions (
  id uuid primary key default gen_random_uuid(),
  block_id uuid references blocks(id) on delete cascade,
  patient_id uuid references patients(id) on delete cascade,
  y int not null,
  overall int not null,
  prescribed_on date not null
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  prescription_id uuid references prescriptions(id) on delete set null,
  kind text not null,
  label text not null,
  due_on date not null,
  status text not null default '예정',
  attempt int not null default 0,
  note text not null default ''
);

create table settings (
  id int primary key default 1,
  weekly_closed jsonb not null default '[0,4]',
  holidays jsonb not null default '[]',
  no_delivery jsonb not null default '[]'
);

insert into settings (id) values (1) on conflict do nothing;

-- 보안(RLS): 로그인한 사용자(원장·간호사)만 접근
alter table patients enable row level security;
alter table blocks enable row level security;
alter table prescriptions enable row level security;
alter table tasks enable row level security;
alter table settings enable row level security;

create policy "authenticated all" on patients for all to authenticated using (true) with check (true);
create policy "authenticated all" on blocks for all to authenticated using (true) with check (true);
create policy "authenticated all" on prescriptions for all to authenticated using (true) with check (true);
create policy "authenticated all" on tasks for all to authenticated using (true) with check (true);
create policy "authenticated all" on settings for all to authenticated using (true) with check (true);
