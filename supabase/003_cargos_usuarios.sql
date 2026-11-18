-- Rode no SQL Editor do Supabase do hub: cargos editáveis + acessos extras por pessoa.
create table if not exists public.cargos (
  id text primary key,
  nome text not null,
  paginas text[] not null default '{}'
);
alter table public.cargos enable row level security;   -- sem policy: só a chave service_role (servidor) acessa

insert into public.cargos (id, nome, paginas) values
  ('diretoria', 'Diretoria', array['receber','pagar','producao','loja','vendas','campanhas','canais','app-atletas','gestao-home','gestao-briefing','gestao-ciclo','gestao-acompanhamento','gestao-blog','gestao-biblioteca','gestao-ia','gestao-atletas','gestao-crm','gestao-vendas','gestao-avisos','gestao-produtos','usuarios']),
  ('comercial', 'Comercial', array['receber']),
  ('marketing', 'Marketing', array['loja','vendas','campanhas','canais','app-atletas','gestao-home','gestao-briefing','gestao-ciclo','gestao-acompanhamento','gestao-blog','gestao-biblioteca','gestao-ia','gestao-atletas','gestao-crm','gestao-vendas','gestao-avisos','gestao-produtos'])
on conflict (id) do nothing;

alter table public.profiles add column if not exists extras text[] not null default '{}';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop constraint if exists profiles_role_fk;
alter table public.profiles add constraint profiles_role_fk foreign key (role) references public.cargos(id) on update cascade;

grant all on public.cargos to service_role;
grant all on public.profiles to service_role;
