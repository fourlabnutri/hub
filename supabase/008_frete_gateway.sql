-- Fourlab Frete Gateway · tabelas do gateway no Supabase do Hub
-- Acesso só pelo servidor (função da Vercel com a service_role). RLS ligado e sem políticas:
-- o navegador não lê nem grava direto nestas tabelas.

create table if not exists public.frete_cotacao (
  id                    text primary key,              -- AAAAMMDD-xxxxxxxx
  criada_em             timestamptz not null,
  operador              text,
  pedido_numero         bigint,
  cliente               text,
  destino_cep           text not null,
  destino_uf            char(2),
  destino_cidade        text,
  peso_kg               numeric(12,3),
  valor_nf              numeric(14,2),
  melhor_transportadora text,
  melhor_preco          numeric(12,2),
  dados                 jsonb not null                 -- cotação completa (itens, caixas, todas as opções)
);
create index if not exists frete_cotacao_criada_idx on public.frete_cotacao (criada_em desc);
create index if not exists frete_cotacao_pedido_idx on public.frete_cotacao (pedido_numero);

create table if not exists public.frete_escolha (
  id             bigint generated always as identity primary key,
  cotacao_id     text not null references public.frete_cotacao(id) on delete cascade,
  chave          text not null,                        -- transportadora|serviço normalizado
  adaptador      text not null,                        -- fonte usada (tabela, API, Frenet, Melhor Envio...)
  transportadora text not null,
  servico        text,
  preco_total    numeric(12,2),
  prazo_max_du   int,
  recomendado    boolean not null,
  motivo         text,                                 -- obrigatório quando não é a recomendada
  operador       text,
  escolhida_em   timestamptz not null default now()
);
create index if not exists frete_escolha_cotacao_idx on public.frete_escolha (cotacao_id);

-- Tokens de integração (hoje só o do Bling, que muda a cada renovação).
create table if not exists public.frete_integracao (
  nome          text primary key,                      -- 'bling'
  dados         jsonb not null,
  atualizado_em timestamptz not null default now()
);

alter table public.frete_cotacao    enable row level security;
alter table public.frete_escolha    enable row level security;
alter table public.frete_integracao enable row level security;
