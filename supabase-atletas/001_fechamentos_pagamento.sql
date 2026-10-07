-- Rode no SQL Editor do Supabase do APP DOS ATLETAS (não do hub). É idempotente.
-- Fechamento mensal de pagamentos a atletas (fee + rebate e comissão que passou de R$ 100). Quem cria: /api/fechamento (dia 1).
create table if not exists public.fechamentos_pagamento (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  tipo text not null check (tipo in ('fee', 'comissao')),
  ym text not null,                                          -- fee: mês do fee; comissão: mês fechado em que o saldo passou de R$ 100
  valor_fee numeric(12,2) not null default 0,
  valor_comissao numeric(12,2) not null default 0,           -- fee: rebate (comissão do mês anterior); comissão: saldo acumulado
  vencimento date not null,
  status text not null default 'pendente' check (status in ('pendente', 'pago')),
  pago_em date,
  comprovante_id uuid references public.comprovantes(id) on delete set null,
  obs text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists fechamentos_fee_unico on public.fechamentos_pagamento (athlete_id, ym) where tipo = 'fee';
create unique index if not exists fechamentos_comissao_aberta on public.fechamentos_pagamento (athlete_id) where tipo = 'comissao' and status = 'pendente';
create index if not exists fechamentos_status_venc on public.fechamentos_pagamento (status, vencimento);

alter table public.fechamentos_pagamento enable row level security;
drop policy if exists "equipe gerencia fechamentos" on public.fechamentos_pagamento;
create policy "equipe gerencia fechamentos" on public.fechamentos_pagamento for all to authenticated
  using (public.eh_equipe()) with check (public.eh_equipe());       -- atleta não enxerga; ele vê só os comprovantes
grant all on public.fechamentos_pagamento to service_role;
