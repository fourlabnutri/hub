// Administração de pessoas e cargos do hub (só quem tem a página "usuarios"). Usa a chave service do Supabase do HUB (env SUPABASE_SERVICE_KEY).
import { quem, TODAS } from './_auth.js';

const URL_ = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_KEY;
const H = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' });
const rest = (path, opt = {}) => fetch(`${URL_()}/rest/v1/${path}`, { ...opt, headers: { ...H(), Prefer: 'return=representation', ...(opt.headers || {}) } });
const auth = (path, opt = {}) => fetch(`${URL_()}/auth/v1/admin/${path}`, { ...opt, headers: H() });
const falha = (res, code, erro) => res.status(code).json({ erro });
const msg = async r => { try { const j = await r.json(); return j.msg || j.message || j.error_description || j.error || JSON.stringify(j); } catch { return 'erro ' + r.status; } };

const limpaPaginas = arr => [...new Set((Array.isArray(arr) ? arr : []).filter(p => TODAS.includes(p)))];
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return falha(res, 405, 'use POST');
  const eu = await quem(req);
  if (!eu) return falha(res, 401, 'não autenticado');
  if (!eu.paginas.includes('usuarios')) return falha(res, 403, 'sem acesso');
  if (!KEY()) return falha(res, 500, 'Falta a variável SUPABASE_SERVICE_KEY no Vercel (chave service_role do Supabase do hub).');
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  try {
    if (b.acao === 'listar') {
      const [pr, ca, us] = await Promise.all([rest('profiles?select=*&order=nome'), rest('cargos?select=*&order=nome'), auth('users?per_page=500')]);
      if (!pr.ok || !ca.ok) return falha(res, 500, 'Rode o SQL 003 no Supabase do hub (' + await msg(pr.ok ? ca : pr) + ')');
      const emails = {};
      ((await us.json()).users || []).forEach(u => { emails[u.id] = u.email; });
      const pessoas = (await pr.json()).map(p => ({ id: p.id, nome: p.nome, email: emails[p.id] || '', role: p.role, extras: p.extras || [], ativo: p.ativo }));
      return res.status(200).json({ pessoas, cargos: await ca.json(), eu: eu.id });
    }

    if (b.acao === 'criar') {
      const email = String(b.email || '').trim().toLowerCase(), nome = String(b.nome || '').trim(), senha = String(b.senha || '');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return falha(res, 400, 'E-mail inválido.');
      if (!nome) return falha(res, 400, 'Informe o nome.');
      if (senha.length < 8) return falha(res, 400, 'A senha precisa de 8 caracteres ou mais.');
      const c = await rest(`cargos?id=eq.${encodeURIComponent(b.role)}&select=id`);
      if (!(await c.json())[0]) return falha(res, 400, 'Cargo inexistente.');
      const u = await auth('users', { method: 'POST', body: JSON.stringify({ email, password: senha, email_confirm: true }) });
      if (!u.ok) return falha(res, 400, 'Não foi possível criar o login: ' + await msg(u));
      const user = await u.json();
      const p = await rest('profiles', { method: 'POST', body: JSON.stringify({ id: user.id, nome, role: b.role, extras: limpaPaginas(b.extras), ativo: true }) });
      if (!p.ok) { await auth('users/' + user.id, { method: 'DELETE' }); return falha(res, 500, 'Não foi possível criar o perfil: ' + await msg(p)); }
      return res.status(200).json({ ok: true });
    }

    if (b.acao === 'editar') {
      if (b.id === eu.id && (b.ativo === false || b.role !== eu.role)) return falha(res, 400, 'Você não pode desativar nem trocar o cargo da sua própria conta.');
      const c = await rest(`cargos?id=eq.${encodeURIComponent(b.role)}&select=id`);
      if (!(await c.json())[0]) return falha(res, 400, 'Cargo inexistente.');
      const p = await rest(`profiles?id=eq.${encodeURIComponent(b.id)}`, { method: 'PATCH', body: JSON.stringify({ nome: String(b.nome || '').trim(), role: b.role, extras: limpaPaginas(b.extras), ativo: b.ativo !== false }) });
      if (!p.ok) return falha(res, 500, await msg(p));
      return res.status(200).json({ ok: true });
    }

    if (b.acao === 'senha') {
      if (String(b.senha || '').length < 8) return falha(res, 400, 'A senha precisa de 8 caracteres ou mais.');
      const r = await auth('users/' + encodeURIComponent(b.id), { method: 'PUT', body: JSON.stringify({ password: b.senha }) });
      if (!r.ok) return falha(res, 400, await msg(r));
      return res.status(200).json({ ok: true });
    }

    if (b.acao === 'salvarCargo') {
      const nome = String(b.nome || '').trim();
      if (!nome) return falha(res, 400, 'Informe o nome do cargo.');
      if (b.id) {
        const dados = b.id === 'diretoria' ? { nome } : { nome, paginas: limpaPaginas(b.paginas) };   // diretoria sempre vê tudo
        const r = await rest(`cargos?id=eq.${encodeURIComponent(b.id)}`, { method: 'PATCH', body: JSON.stringify(dados) });
        if (!r.ok) return falha(res, 500, await msg(r));
      } else {
        const id = slug(nome);
        if (!id) return falha(res, 400, 'Nome inválido.');
        const r = await rest('cargos', { method: 'POST', body: JSON.stringify({ id, nome, paginas: limpaPaginas(b.paginas) }) });
        if (!r.ok) return falha(res, 400, r.status === 409 ? 'Já existe um cargo com esse nome.' : await msg(r));
      }
      return res.status(200).json({ ok: true });
    }

    if (b.acao === 'excluirCargo') {
      if (b.id === 'diretoria') return falha(res, 400, 'O cargo Diretoria não pode ser excluído.');
      const u = await rest(`profiles?role=eq.${encodeURIComponent(b.id)}&select=id`);
      if ((await u.json()).length) return falha(res, 400, 'Há pessoas neste cargo. Mude o cargo delas antes.');
      const r = await rest(`cargos?id=eq.${encodeURIComponent(b.id)}`, { method: 'DELETE' });
      if (!r.ok) return falha(res, 500, await msg(r));
      return res.status(200).json({ ok: true });
    }
    return falha(res, 400, 'ação desconhecida');
  } catch (e) {
    return falha(res, 500, 'erro: ' + (e && e.message ? e.message : e));
  }
}
