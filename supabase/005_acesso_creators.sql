-- Rode no Supabase do hub: libera "Programa Creators" para o cargo Marketing (a Diretoria já vê tudo).
update public.cargos set paginas = array_append(paginas, 'gestao-programa-creators')
where id = 'marketing' and not ('gestao-programa-creators' = any(paginas));
