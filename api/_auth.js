// Login (Supabase do hub) + perfil -> páginas liberadas. Usado por /api/report e /api/gestao.
// perfil -> módulos que pode abrir (o arquivo build.py define os nomes/ordem na tela)
const GESTAO = ['gestao-home', 'gestao-briefing', 'gestao-ciclo', 'gestao-acompanhamento', 'gestao-blog', 'gestao-biblioteca', 'gestao-ia',
  'gestao-atletas', 'gestao-crm', 'gestao-vendas', 'gestao-avisos', 'gestao-produtos'];
const MARKETING = ['loja', 'vendas', 'campanhas', 'canais', 'app-atletas', ...GESTAO];
export const ACESSO = {
  diretoria: ['receber', 'pagar', 'producao', ...MARKETING],
  comercial: ['receber'],
  marketing: MARKETING,
};

export const TODAS = ['receber', 'pagar', 'producao', 'loja', 'vendas', 'campanhas', 'canais', 'app-atletas', ...GESTAO, 'usuarios'];

// cargo (tabela cargos, editável na tela Usuários) + acessos extras da pessoa. Sem a chave service ou sem a tabela, cai no ACESSO fixo acima.
async function paginasDe(perfil) {
  let base = ACESSO[perfil.role], cargo = perfil.role;
  const sk = process.env.SUPABASE_SERVICE_KEY;
  if (sk) {
    try {
      const c = await fetch(`${process.env.SUPABASE_URL}/rest/v1/cargos?id=eq.${encodeURIComponent(perfil.role)}&select=nome,paginas`, { headers: { apikey: sk, Authorization: `Bearer ${sk}` } });
      const j = await c.json();
      if (Array.isArray(j) && j[0]) { base = j[0].paginas; cargo = j[0].nome; }
    } catch (e) { /* mantém o fixo */ }
  }
  const set = new Set([...(base || []), ...(perfil.extras || [])]);
  if (perfil.role === 'diretoria') [...ACESSO.diretoria, 'usuarios'].forEach(p => set.add(p));   // diretoria nunca perde acesso
  if ([...set].some(p => p.startsWith('gestao-'))) set.add('app-atletas');
  return { cargo, paginas: [...set].filter(p => TODAS.includes(p)) };
}

export async function quem(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
  if (!token) return null;
  const h = { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
  const u = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: h });
  if (!u.ok) return null;
  const user = await u.json();
  const p = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=*`, { headers: h });
  const perfil = (await p.json())[0];
  if (!perfil || !perfil.ativo) return null;
  const { cargo, paginas } = await paginasDe(perfil);
  if (!paginas.length) return null;
  return { id: user.id, nome: perfil.nome || user.email, role: perfil.role, cargo, email: user.email, paginas };
}
