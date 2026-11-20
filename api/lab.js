// Laboratório: chamados de manutenção (com fotos) e solicitação de materiais de uso e consumo.
// Banco: SQL 007 (tabelas public.lab_*). Fotos no bucket privado rnc-fotos, pasta manutencao/, com upload direto do celular (URL assinada).
// Acesso: página "laboratorio" do hub.
import { createClient } from '@supabase/supabase-js';
import { quem } from './_auth.js';
import { randomUUID } from 'node:crypto';

const erro = (res, c, m) => res.status(c).json({ erro: m });
const txt = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);
const MAX_FOTOS = 8;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return erro(res, 405, 'use POST');
  try {
    const eu = await quem(req);
    if (!eu || !eu.paginas.includes('laboratorio')) return erro(res, eu ? 403 : 401, eu ? 'sem acesso' : 'não autenticado');
    if (!process.env.SUPABASE_SERVICE_KEY) return erro(res, 500, 'Falta SUPABASE_SERVICE_KEY no Vercel.');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const falta = e => /lab_|does not exist|relation/i.test(e.message) ? 'O banco do laboratório não está pronto: rode o SQL 007 no Supabase do Hub.' : e.message;

    if (b.acao === 'catalogo') {
      const r = await sb.from('lab_materiais_catalogo').select('categoria, item, unidade').eq('ativo', true).order('categoria').order('item');
      if (r.error) return erro(res, 500, falta(r.error));
      return res.status(200).json({ itens: r.data });
    }

    if (b.acao === 'fotos') {
      const n = Math.min(Math.max(parseInt(b.qtd, 10) || 0, 1), MAX_FOTOS), d = new Date();
      const pasta = `manutencao/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`, out = [];
      for (let i = 0; i < n; i++) {
        const e = String((b.exts || [])[i] || 'jpg').toLowerCase(), path = `${pasta}/${randomUUID()}.${EXT.has(e) ? e : 'jpg'}`;
        const s = await sb.storage.from('rnc-fotos').createSignedUploadUrl(path);
        if (s.error) return erro(res, 500, s.error.message);
        out.push({ path, token: s.data.token });
      }
      return res.status(200).json({ fotos: out });
    }

    if (b.acao === 'manutencao') {
      const f = { local: txt(b.local, 120), item: txt(b.item, 160), descricao: txt(b.descricao, 4000), prioridade: ['baixa', 'normal', 'alta', 'urgente'].includes(b.prioridade) ? b.prioridade : 'normal' };
      if (!f.local) return erro(res, 400, 'Informe o local.');
      if (!f.item) return erro(res, 400, 'Informe o que está com problema.');
      if (!f.descricao) return erro(res, 400, 'Descreva o problema.');
      const ok = /^manutencao\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/;
      const fotos = Array.isArray(b.fotos) ? b.fotos.filter(p => typeof p === 'string' && ok.test(p)).slice(0, MAX_FOTOS) : [];
      const r = await sb.from('lab_manutencao').insert({ ...f, fotos, registrado_por: eu.id, registrado_por_nome: eu.nome }).select('numero').single();
      if (r.error) return erro(res, 500, falta(r.error));
      return res.status(200).json({ ok: true, numero: r.data.numero });
    }

    if (b.acao === 'materiais') {
      const setor = txt(b.setor, 80);
      if (!setor) return erro(res, 400, 'Informe o setor.');
      const cat = await sb.from('lab_materiais_catalogo').select('categoria, item, unidade').eq('ativo', true);
      if (cat.error) return erro(res, 500, falta(cat.error));
      const itens = (Array.isArray(b.itens) ? b.itens : []).slice(0, 40).map(x => {
        const q = Math.min(Math.max(parseInt(x.quantidade, 10) || 0, 0), 9999);
        const c = cat.data.find(y => y.categoria === x.categoria && y.item === x.item);
        const outro = !c && txt(x.item, 120);
        return q && (c || outro) ? { categoria: txt(x.categoria, 60), item: c ? c.item : outro, unidade: c ? c.unidade : txt(x.unidade, 20) || 'un', quantidade: q } : null;
      }).filter(Boolean);
      if (!itens.length) return erro(res, 400, 'Adicione pelo menos um item com quantidade.');
      const r = await sb.from('lab_materiais_pedidos').insert({ setor, itens, urgencia: b.urgencia === 'urgente' ? 'urgente' : 'normal', observacao: txt(b.observacao, 2000) || null, registrado_por: eu.id, registrado_por_nome: eu.nome }).select('numero').single();
      if (r.error) return erro(res, 500, falta(r.error));
      return res.status(200).json({ ok: true, numero: r.data.numero });
    }

    if (b.acao === 'listar') {
      const [m, p] = await Promise.all([
        sb.from('lab_manutencao').select('id, numero, local, item, prioridade, descricao, status, fotos, registrado_por_nome, created_at').order('created_at', { ascending: false }).limit(300),
        sb.from('lab_materiais_pedidos').select('id, numero, setor, urgencia, observacao, itens, status, registrado_por_nome, created_at').order('created_at', { ascending: false }).limit(300),
      ]);
      if (m.error) return erro(res, 500, falta(m.error));
      if (p.error) return erro(res, 500, falta(p.error));
      return res.status(200).json({ manutencao: m.data.map(x => ({ ...x, fotos: (x.fotos || []).length })), materiais: p.data });
    }

    if (b.acao === 'fotosChamado') {
      const r = await sb.from('lab_manutencao').select('fotos').eq('id', b.id).maybeSingle();
      if (r.error || !r.data) return erro(res, 404, 'Chamado não encontrado');
      const urls = [];
      for (const path of r.data.fotos || []) { const s = await sb.storage.from('rnc-fotos').createSignedUrl(path, 3600); if (s.data) urls.push(s.data.signedUrl); }
      return res.status(200).json({ fotos: urls });
    }
    return erro(res, 400, 'ação desconhecida');
  } catch (e) {
    console.error(e);
    return erro(res, 500, e.message || 'falha');
  }
}
