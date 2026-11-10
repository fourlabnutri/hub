-- Rode no SQL Editor do Supabase do HUB (depois do 006). RNC de pedidos nossos que chegam avariados ao cliente. É idempotente.
-- As fotos usam a mesma pasta privada rnc-fotos, dentro de pedidos/.
create sequence if not exists public.rnc_pedidos_numero_seq;

create table if not exists public.rnc_pedidos_codigos_avaria (
  codigo text primary key,
  descricao text not null,
  ativo boolean not null default true,
  ordem int not null default 0
);
insert into public.rnc_pedidos_codigos_avaria (codigo, descricao, ordem) values
  ('01', 'Embalagem estourada ou vazando (ex.: gel)', 1), ('02', 'Produto amassado ou quebrado', 2), ('03', 'Caixa de transporte danificada', 3),
  ('04', 'Produto molhado', 4), ('05', 'Item faltando', 5), ('06', 'Lacre violado', 6)
on conflict (codigo) do nothing;

create table if not exists public.rnc_pedidos_registros (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.rnc_pedidos_numero_seq'),
  nf text not null,
  rastreio text not null,
  data_recebimento date not null,
  transportadora text not null,
  codigo_barras text not null,
  produto_nome text not null,
  codigo_avaria text not null,
  avaria_descricao text not null,            -- texto do código no momento do registro
  descricao text not null,
  observacao text not null default '',
  fotos text[] not null default '{}',        -- caminhos na pasta rnc-fotos (pedidos/...)
  registrado_por text not null default '',
  registrado_por_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists rnc_pedidos_data on public.rnc_pedidos_registros (data_recebimento desc, created_at desc);
create index if not exists rnc_pedidos_nf on public.rnc_pedidos_registros (nf);

alter table public.rnc_pedidos_codigos_avaria enable row level security;   -- sem policy: só o servidor (service_role) acessa
alter table public.rnc_pedidos_registros enable row level security;
grant all on public.rnc_pedidos_codigos_avaria, public.rnc_pedidos_registros to service_role;
grant usage, select on sequence public.rnc_pedidos_numero_seq to service_role;

insert into public.cargos (id, nome, paginas) values ('sac', 'Atendimento (SAC)', array['rnc-pedidos']) on conflict (id) do nothing;
