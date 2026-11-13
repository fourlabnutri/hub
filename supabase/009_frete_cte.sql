-- Fourlab Frete Gateway · CT-es recebidos (Distribuição DF-e da SEFAZ e XMLs avulsos)
-- Tabelas no schema public com prefixo frete_ (mesmo padrão do gateway). Liga o frete realmente cobrado às NF-e e, por elas, aos pedidos do Bling.

-- Controle do NSU por CNPJ: a SEFAZ entrega os documentos em ordem de NSU, de 50 em 50.
create table if not exists public.frete_dfe_controle (
  cnpj            text primary key,
  ult_nsu         bigint not null default 0,
  max_nsu         bigint,
  ultima_consulta timestamptz,
  proxima_consulta timestamptz,      -- a SEFAZ pede 1 h de espera quando não há documentos novos (cStat 137)
  ultimo_cstat    int,
  ultimo_motivo   text
);

-- Documento bruto, como chegou (auditoria e reprocessamento).
create table if not exists public.frete_dfe_documento (
  nsu         bigint not null,
  cnpj        text not null,
  schema      text not null,          -- procCTe_v4.00.xsd, procEventoCTe_v4.00.xsd ...
  chave       text,
  xml         text not null,
  recebido_em timestamptz not null default now(),
  origem      text not null default 'sefaz',   -- sefaz | email | contador | manual
  primary key (cnpj, nsu)
);

create table if not exists public.frete_cte (
  chave                 char(44) primary key,
  numero                int not null,
  serie                 int not null,
  emitido_em            timestamptz not null,
  tipo                  text not null,          -- normal | complemento | anulacao | substituto
  modal                 text,
  cfop                  text,
  transportadora_cnpj   text not null,
  transportadora_nome   text,
  remetente_doc         text,
  destinatario_doc      text,
  destinatario_nome     text,
  destino_cep           text,
  tomador_papel         text,
  tomador_doc           text,
  origem_municipio      text, origem_uf char(2),
  destino_municipio     text, destino_uf char(2),
  valor_prestacao       numeric(12,2) not null,
  valor_receber         numeric(12,2),
  icms_cst              text, icms_base numeric(12,2), icms_aliquota numeric(5,2), icms_valor numeric(12,2),
  valor_carga           numeric(14,2),
  produto_predominante  text,
  peso_kg               numeric(12,3),
  volumes               int,
  protocolo             text,
  status_sefaz          int,
  cancelado             boolean not null default false,   -- marcado pelo evento de cancelamento
  autorizado_em         timestamptz,
  importado_em          timestamptz not null default now()
);
create index if not exists frete_cte_emitido_idx on public.frete_cte (emitido_em);
create index if not exists frete_cte_transp_idx on public.frete_cte (transportadora_cnpj, emitido_em);

create table if not exists public.frete_cte_componente (
  chave  char(44) references public.frete_cte on delete cascade,
  nome   text not null,
  valor  numeric(12,2) not null,
  primary key (chave, nome)
);

create table if not exists public.frete_cte_nfe (
  chave_cte char(44) references public.frete_cte on delete cascade,
  chave_nfe char(44) not null,
  primary key (chave_cte, chave_nfe)
);
create index if not exists frete_cte_nfe_nfe_idx on public.frete_cte_nfe (chave_nfe);

-- Frete realizado por NF-e (um CT-e pode levar várias NF-e: o valor é rateado pelo nº de notas).
-- security_invoker: a view respeita o RLS das tabelas (sem isso, ficaria aberta para a chave pública).
create or replace view public.frete_por_nfe with (security_invoker = true) as
select n.chave_nfe,
       c.chave as chave_cte, c.transportadora_nome, c.emitido_em, c.destino_municipio, c.destino_uf,
       round(c.valor_prestacao / count(*) over (partition by c.chave), 2) as frete_rateado,
       c.valor_prestacao as frete_cte, c.peso_kg, c.valor_carga,
       round(100 * c.valor_prestacao / nullif(c.valor_carga, 0), 2) as frete_pct_carga
from public.frete_cte c
join public.frete_cte_nfe n on n.chave_cte = c.chave
where not c.cancelado and c.tipo <> 'anulacao';

alter table public.frete_dfe_controle enable row level security;
alter table public.frete_dfe_documento enable row level security;
alter table public.frete_cte enable row level security;
alter table public.frete_cte_componente enable row level security;
alter table public.frete_cte_nfe enable row level security;
