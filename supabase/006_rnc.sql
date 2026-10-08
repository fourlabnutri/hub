-- Rode no SQL Editor do Supabase do HUB. RNC de recebimento (avaria de mercadoria) + códigos de avaria + pasta privada das fotos. É idempotente.
create sequence if not exists public.rnc_numero_seq;

create table if not exists public.rnc_codigos_avaria (
  codigo text primary key,
  descricao text not null,
  ativo boolean not null default true,
  ordem int not null default 0
);
insert into public.rnc_codigos_avaria (codigo, descricao, ordem) values
  ('01', 'Saco rasgado', 1), ('02', 'Saco/caixa molhado', 2), ('03', 'Caixa amassada', 3), ('04', 'Falta de volume', 4), ('05', 'Palete quebrado', 5)
on conflict (codigo) do nothing;

create table if not exists public.rnc_registros (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.rnc_numero_seq'),
  nf text not null,
  transportadora text not null,
  data_recebimento date not null,
  fornecedor text not null,
  item_nome text not null,
  item_codigo text not null,
  codigo_avaria text not null,
  avaria_descricao text not null,            -- texto do código no momento do registro
  descricao text not null,
  fotos text[] not null default '{}',        -- caminhos na pasta rnc-fotos
  registrado_por text not null default '',
  registrado_por_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists rnc_registros_data on public.rnc_registros (data_recebimento desc, created_at desc);
create index if not exists rnc_registros_nf on public.rnc_registros (nf);

alter table public.rnc_codigos_avaria enable row level security;   -- sem policy: só o servidor (service_role) acessa
alter table public.rnc_registros enable row level security;
grant all on public.rnc_codigos_avaria, public.rnc_registros to service_role;
grant usage, select on sequence public.rnc_numero_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rnc-fotos', 'rnc-fotos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

-- Cargo para quem só preenche o RNC
insert into public.cargos (id, nome, paginas) values ('recebimento', 'Recebimento', array['rnc']) on conflict (id) do nothing;
