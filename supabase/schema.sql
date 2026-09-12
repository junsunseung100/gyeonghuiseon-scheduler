create table patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text not null default '서울'
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
