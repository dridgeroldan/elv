-- Employee Lifetime Value (ELV) - Supabase Schema
-- Run this in your Supabase SQL Editor

-- Employees table
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branch text not null,
  created_at timestamptz default now()
);

-- KPI definitions per employee group / period
create table if not exists kpi_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  weight numeric not null,
  employee_id uuid references employees(id) on delete cascade,
  month_year text not null, -- e.g. "2026-04"
  created_at timestamptz default now()
);

-- Daily KPI entries
create table if not exists daily_kpi_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  entry_date date not null,
  kpi_name text not null,
  weight numeric not null,
  target numeric,
  actual_value numeric,
  actual_pct numeric,
  weighted_value numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Shift schedule per employee per day
create table if not exists daily_shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  shift_date date not null,
  shift_label text, -- e.g. "08:00 AM - 04:00 PM", "REST DAY", "LEAVE"
  shift_code text,  -- e.g. "A07", "R", "L"
  created_at timestamptz default now(),
  unique(employee_id, shift_date)
);

-- Monthly summary per employee
create table if not exists monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  month_year text not null, -- "2026-04"
  avg_score numeric,
  bonus_points numeric default 0,
  amuma_behavior numeric default 0,
  deduction numeric default 0,
  zero_tolerance boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(employee_id, month_year)
);

-- Bonus / special recognition notes per day
create table if not exists daily_notes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  note_date date not null,
  note_text text not null,
  points numeric default 0,
  created_at timestamptz default now()
);

-- Indexes for fast queries
create index on daily_kpi_entries(employee_id, entry_date);
create index on daily_shifts(employee_id, shift_date);
create index on monthly_summaries(employee_id, month_year);
create index on daily_notes(employee_id, note_date);

-- Enable Row Level Security (RLS) - adjust policies for your auth setup
alter table employees enable row level security;
alter table kpi_definitions enable row level security;
alter table daily_kpi_entries enable row level security;
alter table daily_shifts enable row level security;
alter table monthly_summaries enable row level security;
alter table daily_notes enable row level security;

-- Open read/write policies (adjust for production auth)
create policy "Allow all" on employees for all using (true) with check (true);
create policy "Allow all" on kpi_definitions for all using (true) with check (true);
create policy "Allow all" on daily_kpi_entries for all using (true) with check (true);
create policy "Allow all" on daily_shifts for all using (true) with check (true);
create policy "Allow all" on monthly_summaries for all using (true) with check (true);
create policy "Allow all" on daily_notes for all using (true) with check (true);

-- Seed initial employees (from April sheet)
insert into employees (name, branch) values
  ('Argie Sacedon', 'Maribago'),
  ('Cyrel Comedido', 'Maribago'),
  ('Jayson Cruz', 'Almont')
on conflict do nothing;
