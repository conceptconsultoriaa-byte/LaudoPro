-- ========== LaudoPro — mesmo projeto Supabase compartilhado (tabela businesses reaproveitada) ==========

alter table patrocinadores drop constraint if exists patrocinadores_produto_check;
alter table patrocinadores add constraint patrocinadores_produto_check check (produto in ('agendapro','trainpro','nutripro','vitrinepro','laudopro'));

create table if not exists lp_empresas (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  nome text not null,
  telefone text,
  observacoes text,
  created_at timestamptz default now()
);
create index if not exists idx_lp_empresas_business on lp_empresas(business_id);
alter table lp_empresas enable row level security;
create policy "dono gerencia empresas" on lp_empresas
  for all using (exists (select 1 from businesses b where b.id = lp_empresas.business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from businesses b where b.id = lp_empresas.business_id and b.owner_id = auth.uid()));

create table if not exists lp_valores (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  empresa_id uuid not null references lp_empresas(id) on delete cascade,
  tipo text not null,
  valor_unitario numeric(10,2) not null default 0,
  created_at timestamptz default now(),
  unique(empresa_id, tipo)
);
alter table lp_valores enable row level security;
create policy "dono gerencia valores" on lp_valores
  for all using (exists (select 1 from businesses b where b.id = lp_valores.business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from businesses b where b.id = lp_valores.business_id and b.owner_id = auth.uid()));

create table if not exists lp_laudos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  empresa_id uuid not null references lp_empresas(id) on delete restrict,
  data date not null,
  tipo text not null,
  quantidade int not null check (quantidade > 0),
  valor_unitario numeric(10,2) not null default 0,
  valor_total numeric(10,2) not null default 0,
  created_at timestamptz default now()
);
create index if not exists idx_lp_laudos_business on lp_laudos(business_id);
create index if not exists idx_lp_laudos_empresa on lp_laudos(empresa_id);
alter table lp_laudos enable row level security;
create policy "dono gerencia laudos" on lp_laudos
  for all using (exists (select 1 from businesses b where b.id = lp_laudos.business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from businesses b where b.id = lp_laudos.business_id and b.owner_id = auth.uid()));

create table if not exists lp_recebimentos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  empresa_id uuid not null references lp_empresas(id) on delete cascade,
  competencia date not null,
  valor_recebido numeric(10,2) not null default 0,
  data_recebimento date,
  observacoes text,
  created_at timestamptz default now(),
  unique(empresa_id, competencia)
);
alter table lp_recebimentos enable row level security;
create policy "dono gerencia recebimentos" on lp_recebimentos
  for all using (exists (select 1 from businesses b where b.id = lp_recebimentos.business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from businesses b where b.id = lp_recebimentos.business_id and b.owner_id = auth.uid()));
