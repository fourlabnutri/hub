// Login (Supabase do hub) + perfil -> páginas liberadas. Usado por /api/report e /api/gestao.
// perfil -> módulos que pode abrir (o arquivo build.py define os nomes/ordem na tela)
const GESTAO = ['gestao-home', 'gestao-briefing', 'gestao-ciclo', 'gestao-acompanhamento', 'gestao-blog', 'gestao-biblioteca', 'gestao-ia',
  'gestao-atletas', 'gestao-crm', 'gestao-vendas', 'gestao-avisos', 'gestao-produtos'];
const MARKETING = ['loja', 'vendas', 'campanhas', 'canais', ...GESTAO];
export const ACESSO = {
  diretoria: ['receber', 'pagar', 'producao', ...MARKETING],
  comercial: ['receber'],
  marketing: MARKETING,
};

export async function quem(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
  if (!token) return null;
  const h = { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
  const u = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: h });
  if (!u.ok) return null;
  const user = await u.json();
  const p = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=nome,role,ativo`, { headers: h });
  const perfil = (await p.json())[0];
  if (!perfil || !perfil.ativo || !ACESSO[perfil.role]) return null;
  return { nome: perfil.nome || user.email, role: perfil.role, email: user.email, paginas: ACESSO[perfil.role] };
}
