-- =====================================================================================================
-- 006_rnc.sql — RNC (Registro de Não Conformidade) do Hub FourLab: recebimento e pedidos avariados
-- Para: Luciano (Hub) · Preparado em 11/11/2026
--
-- Onde roda: no Supabase do Hub (o mesmo projeto do login do Hub; o rnc-adapter.js já usa sb.auth).
-- Casa com o que a tela já espera (rnc-adapter.js, modo 'supabase'):
--   /api/rnc  ações: opcoes | fotos | criar | listar | detalhe | codigos | salvarCodigo
--   bucket de Storage 'rnc-fotos' (privado, fotos JPEG ~1600 px, até 12 por RNC de pedidos e 8 de recebimento)
--   tipos: 'recebimento' (rnc.html) e 'pedidos' (rnc-pedidos.html), cada um com sua numeração (RNC-0001…)
-- Depois de rodar: em config.js trocar RNC_BACKEND de 'demo' para 'supabase'.
-- =====================================================================================================

create schema if not exists qualidade;

-- ---------- Códigos de avaria (por tipo; o admin edita pela tela "Códigos") ----------
create table if not exists qualidade.rnc_codigos (
  tipo        text not null check (tipo in ('recebimento', 'pedidos')),
  codigo      text not null check (codigo ~ '^[A-Za-z0-9]{1,10}$'),
  descricao   text not null check (length(trim(descricao)) > 0),
  ativo       boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (tipo, codigo)
);

insert into qualidade.rnc_codigos (tipo, codigo, descricao) values
  ('pedidos', '01', 'Embalagem estourada ou vazando (ex.: gel)'),
  ('pedidos', '02', 'Produto amassado ou quebrado'),
  ('pedidos', '03', 'Caixa de transporte danificada'),
  ('pedidos', '04', 'Produto molhado'),
  ('pedidos', '05', 'Item faltando'),
  ('pedidos', '06', 'Lacre violado'),
  ('recebimento', '01', 'Saco rasgado'),
  ('recebimento', '02', 'Saco/caixa molhado'),
  ('recebimento', '03', 'Caixa amassada'),
  ('recebimento', '04', 'Falta de volume'),
  ('recebimento', '05', 'Palete quebrado')
on conflict (tipo, codigo) do nothing;

-- ---------- RNC (uma linha por avaria registrada) ----------
create table if not exists qualidade.rnc (
  id                 uuid primary key default gen_random_uuid(),
  tipo               text not null check (tipo in ('recebimento', 'pedidos')),
  numero             integer not null,                 -- sequência por tipo (RNC-0001); preenchida pelo trigger
  -- comuns
  nf                 text not null,                    -- número da NF (de entrada no recebimento; de venda nos pedidos)
  transportadora     text not null,
  data_recebimento   date not null,                    -- recebimento: quando a FourLab recebeu; pedidos: quando o CLIENTE recebeu
  codigo_avaria      text not null,
  descricao          text not null,                    -- descrição da avaria
  observacao         text,
  -- só pedidos (rnc-pedidos.html)
  rastreio           text,                             -- código de rastreio
  codigo_barras      text,                             -- EAN do produto
  produto_nome       text,
  -- só recebimento (rnc.html)
  fornecedor         text,
  item_nome          text,
  item_codigo        text,
  -- tratativa (para uso futuro do Hub; a tela atual não preenche)
  status             text not null default 'aberta' check (status in ('aberta', 'em_tratativa', 'encerrada')),
  tratativa          text,                             -- ex.: reenvio, reembolso, crédito, cobrança da transportadora
  custo_estimado     numeric(12,2),
  encerrada_em       timestamptz,
  -- auditoria
  registrado_por     uuid default auth.uid() references auth.users(id),
  registrado_por_nome text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tipo, numero),
  foreign key (tipo, codigo_avaria) references qualidade.rnc_codigos (tipo, codigo),
  -- campos obrigatórios por tipo (os mesmos que a tela exige)
  constraint rnc_pedidos_obrig check (tipo <> 'pedidos' or (rastreio is not null and codigo_barras is not null and produto_nome is not null)),
  constraint rnc_receb_obrig   check (tipo <> 'recebimento' or (fornecedor is not null and item_nome is not null))
);

create index if not exists rnc_tipo_data_idx on qualidade.rnc (tipo, data_recebimento desc);
create index if not exists rnc_nf_idx on qualidade.rnc (nf);
create index if not exists rnc_rastreio_idx on qualidade.rnc (rastreio);

-- ---------- Fotos (caminhos no bucket 'rnc-fotos'; a URL é assinada na hora de ver) ----------
create table if not exists qualidade.rnc_fotos (
  id          uuid primary key default gen_random_uuid(),
  rnc_id      uuid not null references qualidade.rnc (id) on delete cascade,
  ordem       smallint not null,
  path        text not null unique,                    -- ex.: pedidos/2026/11/<uuid>.jpg
  created_at  timestamptz not null default now(),
  unique (rnc_id, ordem)
);

-- ---------- Numeração por tipo, sem buraco e sem corrida ----------
create or replace function qualidade.rnc_numerar() returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext('rnc_' || new.tipo));
  select coalesce(max(numero), 0) + 1 into new.numero from qualidade.rnc where tipo = new.tipo;
  return new;
end $$;
drop trigger if exists rnc_numerar on qualidade.rnc;
create trigger rnc_numerar before insert on qualidade.rnc for each row execute function qualidade.rnc_numerar();

create or replace function qualidade.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists rnc_updated_at on qualidade.rnc;
create trigger rnc_updated_at before update on qualidade.rnc for each row execute function qualidade.set_updated_at();

-- ---------- Visão para a aba "Registros" (o que o listar() devolve) ----------
create or replace view qualidade.rnc_lista with (security_invoker = true) as
select r.id, r.tipo, r.numero, 'RNC-' || lpad(r.numero::text, 4, '0') as rnc,
       r.nf, r.rastreio, r.transportadora, r.data_recebimento,
       r.fornecedor, r.item_nome, r.item_codigo, r.codigo_barras, r.produto_nome,
       r.codigo_avaria, c.descricao as avaria_descricao, r.descricao, r.observacao,
       r.status, (select count(*) from qualidade.rnc_fotos f where f.rnc_id = r.id) as fotos,
       r.registrado_por_nome as registrado_por, r.created_at
from qualidade.rnc r
join qualidade.rnc_codigos c on c.tipo = r.tipo and c.codigo = r.codigo_avaria;

-- ---------- Segurança (RLS) ----------
-- Usuário logado no Hub: lê tudo, registra RNC e fotos. Só admin edita códigos e altera/encerra RNC.
-- Ajuste qualidade.eh_admin() para a regra de perfis do Hub ("Usuários e acessos").
create or replace function qualidade.eh_admin() returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'papel') = 'admin', false)
$$;

alter table qualidade.rnc         enable row level security;
alter table qualidade.rnc_fotos   enable row level security;
alter table qualidade.rnc_codigos enable row level security;

drop policy if exists rnc_ler on qualidade.rnc;
create policy rnc_ler on qualidade.rnc for select to authenticated using (true);
drop policy if exists rnc_criar on qualidade.rnc;
create policy rnc_criar on qualidade.rnc for insert to authenticated with check (registrado_por = auth.uid());
drop policy if exists rnc_alterar on qualidade.rnc;
create policy rnc_alterar on qualidade.rnc for update to authenticated using (qualidade.eh_admin()) with check (qualidade.eh_admin());

drop policy if exists fotos_ler on qualidade.rnc_fotos;
create policy fotos_ler on qualidade.rnc_fotos for select to authenticated using (true);
drop policy if exists fotos_criar on qualidade.rnc_fotos;
create policy fotos_criar on qualidade.rnc_fotos for insert to authenticated
  with check (exists (select 1 from qualidade.rnc r where r.id = rnc_id and r.registrado_por = auth.uid()));

drop policy if exists cod_ler on qualidade.rnc_codigos;
create policy cod_ler on qualidade.rnc_codigos for select to authenticated using (true);
drop policy if exists cod_admin on qualidade.rnc_codigos;
create policy cod_admin on qualidade.rnc_codigos for all to authenticated using (qualidade.eh_admin()) with check (qualidade.eh_admin());

grant usage on schema qualidade to authenticated, service_role;
grant select, insert, update on qualidade.rnc, qualidade.rnc_fotos, qualidade.rnc_codigos to authenticated;
grant select on qualidade.rnc_lista to authenticated;
grant all on all tables in schema qualidade to service_role;

-- ---------- Storage: bucket privado das fotos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rnc-fotos', 'rnc-fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists rnc_fotos_ler on storage.objects;
create policy rnc_fotos_ler on storage.objects for select to authenticated using (bucket_id = 'rnc-fotos');
drop policy if exists rnc_fotos_enviar on storage.objects;
create policy rnc_fotos_enviar on storage.objects for insert to authenticated with check (bucket_id = 'rnc-fotos');
-- (sem policy de delete/update: foto de RNC é evidência e não se apaga pela tela)

-- =====================================================================================================
-- /api/rnc — o que cada ação faz (servidor do Hub, com o JWT do usuário; service_role só para URLs assinadas)
--   opcoes        → { codigos: select codigo, descricao from rnc_codigos where tipo = $tipo and ativo order by codigo,
--                     codigosAdmin: eh_admin() }
--   fotos         → para cada ext: path = '<tipo>/<aaaa>/<mm>/<uuid>.<ext>' e storage.createSignedUploadUrl(path);
--                   devolve { fotos: [{ path, token }] }  (a tela sobe cada foto com uploadToSignedUrl)
--   criar         → insert em qualidade.rnc (tipo, campos do formulário, registrado_por_nome = nome do usuário)
--                   + insert em rnc_fotos (rnc_id, ordem, path) para cada foto; devolve { numero }
--   listar        → select * from qualidade.rnc_lista where tipo = $tipo order by numero desc limit 500
--   detalhe       → linha de rnc_lista + fotos: createSignedUrl(path, 3600) de cada foto, na ordem
--   codigos       → select codigo, descricao, ativo from rnc_codigos where tipo = $tipo order by codigo
--   salvarCodigo  → upsert em rnc_codigos (só admin); devolve a lista atualizada
-- Depois: a Nekt lê qualidade.rnc (Postgres) para cruzar com o Bling (NF → pedido, cliente, valor) e a
-- transportadora, e montar os indicadores de avaria (por transportadora, produto, código e custo).
-- =====================================================================================================
