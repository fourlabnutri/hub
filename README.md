# FourLab Hub — app ao vivo (Vercel + Supabase + Nekt)

Fluxo: navegador → `/api/report` (Vercel) → confere login/perfil no Supabase → lê `fourlabnutri_trusted.report_*` na API de dados do Nekt.
A chave do Nekt só existe no Vercel. Os dados têm contatos de clientes: o app só responde a usuários logados.

## Perfis
| Perfil | Vê |
|---|---|
| `diretoria` | Tudo |
| `marketing` | Gestão de atletas, Conteúdo, Marketing e E-commerce |
| `comercial` | Contas a receber |

Para mudar, edite `ACESSO` em `api/report.js`.

## 1. Supabase (projeto novo só do hub)
1. Crie o projeto em supabase.com.
2. SQL Editor: rode `supabase/001_hub_profiles.sql`.
3. Authentication > Sign In / Providers: **desligue "Allow new users to sign up"** (só entra quem você convidar).
4. Authentication > Users > Add user (e-mail + senha, marque auto-confirm).
5. Cadastre o perfil de cada usuário (comentário no fim do SQL).
6. Project Settings > API: copie a **URL** e a chave **publishable** e cole em `config.js`.

## 2. GitHub
Envie esta pasta para o repositório `fourlabnutri/hub` (raiz do repositório = esta pasta):
```bash
cd deploy
git init && git add . && git commit -m "hub: app ao vivo"
git branch -M main
git remote add origin https://github.com/fourlabnutri/hub.git
git push -u origin main
```

## 3. Vercel
1. vercel.com > Add New > Project > importe `fourlabnutri/hub` (Framework: Other, sem build).
2. Settings > Environment Variables (Production):
   - `NEKT_API_KEY` = sua chave do Nekt
   - `SUPABASE_URL` = URL do projeto Supabase
   - `SUPABASE_ANON_KEY` = chave publishable
3. Deploy. Cada `git push` republica sozinho.

## Manutenção
- Dados: as Queries do Nekt atualizam as tabelas `report_*` todo dia às 07:00 (BRT). A API guarda os dados 5 min em memória.
- Visual: os dashboards são gerados de `../receber.src.html` e `../producao.src.html` (`python3 ../build.py` regera esta pasta).

## Gestão de atletas (equipe)
As telas da equipe (atletas, CRM, roteiros, avisos…) são as do app dos atletas, portadas para o hub (`../gestao-src/` -> `gestao-*.html` via `build.py`).
Elas leem e gravam no **mesmo banco do app dos atletas** (outro projeto do Supabase) por uma ponte: `api/gestao.js`.
- Variáveis do Vercel (Secret): `ATLETAS_URL` (Project URL do projeto dos atletas) e `ATLETAS_SERVICE_KEY` (chave service_role do mesmo projeto).
- A ponte só aceita as tabelas e funções listadas em `api/gestao.js`; perfis `marketing` e `diretoria` passam.
- Perfil novo: rode `supabase/002_perfil_marketing.sql` no Supabase do hub e cadastre os usuários.
- Envio de arquivo (Briefing) passa pela ponte e vale para arquivos de até ~3 MB (limite do Vercel).
- As funções de IA/cupom/Yampi continuam no projeto dos atletas; a ponte chama as mesmas.

## Usuários e acessos (Administração)
Tela `usuarios.html` (só quem tem o acesso `usuarios`, a Diretoria sempre tem): cria pessoas (login + senha provisória), define cargo, acessos extras, ativa/desativa, redefine senha e edita o que cada cargo enxerga.
- Rode `supabase/003_cargos_usuarios.sql` no Supabase do hub (cria `cargos` e `profiles.extras`).
- Variável no Vercel (Secret): `SUPABASE_SERVICE_KEY` = chave service_role do Supabase do HUB (não a dos atletas). Sem ela, o hub segue com os cargos fixos de `api/_auth.js`.

## Pagamentos a atletas (Contas a pagar)
Todo dia 1, às 08:00 (Brasília), o Vercel Cron chama `/api/fechamento`: cria a pendência de fee (+ rebate) de quem tem fee e a de comissão de quem passou de R$ 100 de saldo. Roda também sob demanda pelo botão "Atualizar fechamento do mês". Idempotente.
- SQL: `supabase-atletas/001_fechamentos_pagamento.sql` no Supabase **dos atletas**.
- Variável no Vercel (Secret): `CRON_SECRET` (qualquer texto longo e aleatório; o Vercel o envia no cron).
- `api/pagamentos-atletas.js` registra o pagamento nas mesmas tabelas do app (`fee_pagamentos`, `comissao_pagamentos`, `comprovantes`) e guarda o arquivo na pasta privada `comprovantes`, para o atleta ver no Meu Perfil. Arquivo até 3 MB.
