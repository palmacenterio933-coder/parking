-- Pega todo esto en Supabase > SQL Editor > Run

create table celdas (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  fila int,   -- posición en el mapa
  col int,
  created_at timestamptz default now()
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  placa text,
  tipo_vehiculo text not null default 'carro',
  celda_id uuid references celdas(id) on delete set null,
  valor_mensual numeric not null default 0,
  vence date not null,
  activo boolean not null default true,
  created_at timestamptz default now()
);

-- una sola persona activa por celda
create unique index un_cliente_por_celda
  on clientes(celda_id) where activo and celda_id is not null;

create table pagos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  monto numeric not null,
  metodo text not null default 'efectivo',
  fecha date not null default current_date,
  vence_hasta date,
  created_at timestamptz default now()
);

create table gastos (
  id uuid primary key default gen_random_uuid(),
  concepto text not null,
  categoria text not null default 'Otros',
  monto numeric not null,
  fecha date not null default current_date,
  created_at timestamptz default now()
);

-- Seguridad: solo usuarios con sesión iniciada pueden ver/editar
alter table celdas   enable row level security;
alter table clientes enable row level security;
alter table pagos    enable row level security;
alter table gastos   enable row level security;

create policy "solo logueados" on celdas   for all to authenticated using (true) with check (true);
create policy "solo logueados" on clientes for all to authenticated using (true) with check (true);
create policy "solo logueados" on pagos    for all to authenticated using (true) with check (true);

create policy "solo logueados" on gastos  for all to authenticated using (true) with check (true);

-- Opcional: crear 20 celdas de una vez
-- insert into celdas (numero) select generate_series(1,20)::text;
