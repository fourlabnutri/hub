-- Rode no SQL Editor do projeto Supabase NOVO do hub.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  role text not null default 'comercial' check (role in ('diretoria', 'comercial')),
  ativo boolean not null default true
);

alter table public.profiles enable row level security;

-- cada usuário só lê o próprio perfil; ninguém altera perfil pelo app (sem policy de insert/update/delete)
create policy "ler o proprio perfil" on public.profiles for select using (auth.uid() = id);

-- "Automatically expose new tables" fica desligado: libera só a leitura desta tabela para usuários logados
grant select on public.profiles to authenticated;

-- Depois de criar o usuário em Authentication > Users, cadastre o perfil (troque o e-mail e o perfil):
-- insert into public.profiles (id, nome, role)
--   select id, 'Nome da pessoa', 'diretoria' from auth.users where email = 'pessoa@fourlabnutri.com.br';
