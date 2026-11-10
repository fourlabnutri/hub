// RNC de recebimento (avaria de mercadoria): formulário, registros, fotos e códigos de avaria. Usa a chave service do Supabase do HUB.
// As fotos sobem direto do celular para a pasta privada rnc-fotos (URL assinada), sem passar pelo limite de corpo do Vercel.
import { createClient } from '@supabase/supabase-js';
import { quem } from './_auth.js';
import { randomUUID } from 'node:crypto';

const erro = (res, c, m) => res.status(c).json({ erro: m });
const txt = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);
const FOTO_RE = /^\d{4}\/\d{2}\/[0-9a-f-]{36}-\d{1,2}\.(jpg|jpeg|png|webp|heic|heif)$/;
// recebimento (mercadoria que chega para nós) e pedidos (pedido nosso que chega avariado ao cliente)
const TIPOS = {
  recebimento: { pagina: 'rnc', reg: 'rnc_registros', cod: 'rnc_codigos_avaria', pasta: '', maxFotos: 8, sql: '006',
    campos: { nf: ['o número da NF', 40], transportadora: ['a transportadora', 120], fornecedor: ['o nome do fornecedor', 160], item_nome: ['o nome do item', 200], item_codigo: ['o código do item', 60], descricao: ['a descrição da avaria', 4000] },
    lista: 'id, numero, nf, transportadora, data_recebimento, fornecedor, item_nome, item_codigo, codigo_avaria, avaria_descricao, fotos, registrado_por, created_at' },
  pedidos: { pagina: 'rnc-pedidos', reg: 'rnc_pedidos_registros', cod: 'rnc_pedidos_codigos_avaria', pasta: 'pedidos/', maxFotos: 12, sql: '007',
    campos: { nf: ['o número da NF', 40], rastreio: ['o código de rastreio', 60], transportadora: ['a transportadora', 120], codigo_barras: ['o código de barras do produto', 60], produto_nome: ['o nome do produto', 200], descricao: ['a descrição da avaria', 4000], observacao: [null, 2000] },
    lista: 'id, numero, nf, rastreio, transportadora, data_recebimento, codigo_barras, produto_nome, codigo_avaria, avaria_descricao, fotos, registrado_por, created_at' },
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return erro(res, 405, 'use POST');
  try {
    const eu = await quem(req);
    if (!process.env.SUPABASE_SERVICE_KEY) return erro(res, 500, 'Falta SUPABASE_SERVICE_KEY no Vercel.');
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const T = TIPOS[b.tipo || 'recebimento'];
    if (!T) return erro(res, 400, 'tipo desconhecido');
    if (!eu || !eu.paginas.includes(T.pagina)) return erro(res, eu ? 403 : 401, eu ? 'sem acesso' : 'não autenticado');
    const falta = e => /rnc_|schema cache|does not exist/i.test(e.message) ? `Falta rodar o SQL ${T.sql} no Supabase do hub.` : e.message;

    if (b.acao === 'opcoes') {
      const r = await db.from(T.cod).select('codigo, descricao').eq('ativo', true).order('ordem').order('codigo');
      if (r.error) return erro(res, 500, falta(r.error));
      return res.status(200).json({ codigos: r.data, codigosAdmin: eu.paginas.includes('rnc-codigos') });
    }

    if (b.acao === 'fotos') {     // devolve URLs assinadas de envio, uma por foto
      const n = Math.min(Math.max(parseInt(b.qtd, 10) || 0, 1), T.maxFotos), d = new Date(), pasta = `${T.pasta}${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`, id = randomUUID();
      const out = [];
      for (let i = 0; i < n; i++) {
        const ext = EXT.has(String((b.exts || [])[i] || 'jpg').toLowerCase()) ? String(b.exts[i]).toLowerCase() : 'jpg';
        const path = `${pasta}/${id}-${i}.${ext}`;
        const s = await db.storage.from('rnc-fotos').createSignedUploadUrl(path);
        if (s.error) return erro(res, 500, s.error.message);
        out.push({ path, token: s.data.token });
      }
      return res.status(200).json({ fotos: out });
    }

    if (b.acao === 'criar') {
      const f = {}; for (const [k, [, max]] of Object.entries(T.campos)) f[k] = txt(b[k], max);
      const data = /^\d{4}-\d{2}-\d{2}$/.test(b.data_recebimento || '') ? b.data_recebimento : null;
      for (const [k, [nome]] of Object.entries(T.campos)) if (nome && !f[k]) return erro(res, 400, `Preencha ${nome}.`);
      if (!data || data > new Date(Date.now() + 864e5).toISOString().slice(0, 10)) return erro(res, 400, 'Confira a data de recebimento.');
      const c = await db.from(T.cod).select('codigo, descricao').eq('codigo', txt(b.codigo_avaria, 10)).eq('ativo', true).maybeSingle();
      if (c.error) return erro(res, 500, falta(c.error));
      if (!c.data) return erro(res, 400, 'Escolha o código da avaria.');
      const fotos = Array.isArray(b.fotos) ? b.fotos.filter(p => typeof p === 'string' && FOTO_RE.test(p.slice(T.pasta.length)) && p.startsWith(T.pasta)).slice(0, T.maxFotos) : [];
      const r = await db.from(T.reg).insert({ ...f, data_recebimento: data, codigo_avaria: c.data.codigo, avaria_descricao: c.data.descricao, fotos, registrado_por: eu.nome, registrado_por_id: eu.id }).select('id, numero').single();
      if (r.error) return erro(res, 500, falta(r.error));
      return res.status(200).json({ ok: true, id: r.data.id, numero: r.data.numero });
    }

    if (b.acao === 'listar') {
      const r = await db.from(T.reg).select(T.lista).order('created_at', { ascending: false }).limit(500);
      if (r.error) return erro(res, 500, falta(r.error));
      return res.status(200).json({ registros: r.data.map(x => ({ ...x, fotos: (x.fotos || []).length })) });
    }

    if (b.acao === 'detalhe') {
      const r = await db.from(T.reg).select('*').eq('id', b.id).single();
      if (r.error || !r.data) return erro(res, 404, 'RNC não encontrada');
      const urls = [];
      for (const p of r.data.fotos || []) { const s = await db.storage.from('rnc-fotos').createSignedUrl(p, 3600); if (s.data) urls.push(s.data.signedUrl); }
      return res.status(200).json({ registro: { ...r.data, fotos: urls } });
    }

    if (b.acao === 'codigos' || b.acao === 'salvarCodigo') {
      if (!eu.paginas.includes('rnc-codigos')) return erro(res, 403, 'sem acesso aos códigos de avaria');
      if (b.acao === 'salvarCodigo') {
        const codigo = txt(b.codigo, 10), descricao = txt(b.descricao, 120);
        if (!/^[A-Za-z0-9]{1,10}$/.test(codigo) || !descricao) return erro(res, 400, 'Informe o código (letras e números) e a descrição.');
        const ex = await db.from(T.cod).select('codigo').eq('codigo', codigo).maybeSingle();
        const dados = { descricao, ativo: b.ativo !== false };
        const w = ex.data ? await db.from(T.cod).update(dados).eq('codigo', codigo)
          : await db.from(T.cod).insert({ codigo, ...dados, ordem: (parseInt(codigo, 10) || 99) });
        if (w.error) return erro(res, 500, falta(w.error));
      }
      const r = await db.from(T.cod).select('*').order('ordem').order('codigo');
      if (r.error) return erro(res, 500, falta(r.error));
      return res.status(200).json({ codigos: r.data });
    }
    return erro(res, 400, 'ação desconhecida');
  } catch (e) {
    console.error(e);
    return erro(res, 500, e.message || 'falha');
  }
}
