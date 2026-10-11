-- Solo si YA habías corrido schema.sql antes de agregar los gastos:
create table if not exists gastos (
  id uuid primary key default gen_random_uuid(),
  concepto text not null,
  categoria text not null default 'Otros',
  monto numeric not null,
  fecha date not null default current_date,
  created_at timestamptz default now()
);
alter table gastos enable row level security;
create policy "solo logueados" on gastos for all to authenticated using (true) with check (true);
