# FourLab Hub — app ao vivo (Vercel + Supabase + Nekt)

Fluxo: navegador → `/api/report` (Vercel) → confere login/perfil no Supabase → lê `fourlabnutri_trusted.report_*` na API de dados do Nekt.
A chave do Nekt só existe no Vercel. Os dados têm contatos de clientes: o app só responde a usuários logados.

## Perfis
| Perfil | Vê |
|---|---|
| `diretoria` | Contas a receber + Produção |
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
