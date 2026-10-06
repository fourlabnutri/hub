-- Rode no Supabase do hub: libera a tela "Sugestões de conteúdo" para o cargo Marketing (a Diretoria já vê tudo).
update public.cargos set paginas = array_append(paginas, 'gestao-sugestoes')
where id = 'marketing' and not ('gestao-sugestoes' = any(paginas));
