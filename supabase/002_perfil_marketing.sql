-- Rode no SQL Editor do Supabase do hub: libera o perfil "marketing" (Gestão de atletas, Marketing e E-commerce).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('diretoria', 'comercial', 'marketing'));

-- Depois, para cada pessoa do marketing (crie o usuário em Authentication > Users antes):
-- insert into public.profiles (id, nome, role)
--   select id, 'Nome da pessoa', 'marketing' from auth.users where email = 'pessoa@fourlabnutri.com.br';
