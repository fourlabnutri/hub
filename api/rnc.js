// RNC (recebimento e pedidos avariados): formulário, registros, fotos e códigos de avaria. Usa a chave service do Supabase do HUB.
// Banco: schema "qualidade" do SQL 006 do Junior (tabelas rnc, rnc_fotos, rnc_codigos e a visão rnc_lista). O schema precisa
// estar em "Exposed schemas" (Supabase › Project Settings › API). Acesso: as páginas do hub (rnc, rnc-pedidos, rnc-codigos).
// As fotos sobem direto do celular para a pasta privada rnc-fotos (URL assinada), sem passar pelo limite de corpo do Vercel.
import { createClient } from '@supabase/supabase-js';
import { quem } from './_auth.js';
import { randomUUID } from 'node:crypto';

const erro = (res, c, m) => res.status(c).json({ erro: m });
const txt = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);   // o bucket do SQL 006 aceita só estes
// recebimento (mercadoria que chega para nós) e pedidos (pedido nosso que chega avariado ao cliente)
const TIPOS = {
  recebimento: { pagina: 'rnc', maxFotos: 8,
    campos: { nf: ['o número da NF', 40], transportadora: ['a transportadora', 120], fornecedor: ['o nome do fornecedor', 160], item_nome: ['o nome do item', 200], item_codigo: ['o código do item', 60], descricao: ['a descrição da avaria', 4000] } },
  pedidos: { pagina: 'rnc-pedidos', maxFotos: 12,
    campos: { nf: ['o número da NF', 40], rastreio: ['o código de rastreio', 60], transportadora: ['a transportadora', 120], codigo_barras: ['o código de barras do produto', 60], produto_nome: ['o nome do produto', 200], descricao: ['a descrição da avaria', 4000], observacao: [null, 2000] } },
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return erro(res, 405, 'use POST');
  try {
    const eu = await quem(req);
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    // consulta: só leitura (listar e detalhe) das duas RNCs juntas, para quem tem a página rnc-consulta
    const consulta = b.tipo === 'todos';
    if (consulta && !['listar', 'detalhe'].includes(b.acao)) return erro(res, 400, 'a consulta só lista e abre RNCs');
    const tipo = consulta ? null : (b.tipo || 'recebimento'), T = consulta ? { pagina: 'rnc-consulta' } : TIPOS[tipo];
    if (!T) return erro(res, 400, 'tipo desconhecido');
    if (!eu || !eu.paginas.includes(T.pagina)) return erro(res, eu ? 403 : 401, eu ? 'sem acesso' : 'não autenticado');
    if (!process.env.SUPABASE_SERVICE_KEY) return erro(res, 500, 'Falta SUPABASE_SERVICE_KEY no Vercel.');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const db = sb.schema('qualidade');
    const falta = e => /schema|qualidade|rnc|does not exist/i.test(e.message) ? 'O banco do RNC não está pronto: rode o SQL 006 e exponha o schema "qualidade" na API do Supabase.' : e.message;
    const admin = eu.paginas.includes('rnc-codigos');

    if (b.acao === 'opcoes') {
      const r = await db.from('rnc_codigos').select('codigo, descricao').eq('tipo', tipo).eq('ativo', true).order('codigo');
      if (r.error) return erro(res, 500, falta(r.error));
      return res.status(200).json({ codigos: r.data, codigosAdmin: admin });
    }

    if (b.acao === 'fotos') {     // devolve URLs assinadas de envio, uma por foto: <tipo>/<aaaa>/<mm>/<uuid>.<ext>
      const n = Math.min(Math.max(parseInt(b.qtd, 10) || 0, 1), T.maxFotos), d = new Date(), pasta = `${tipo}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const out = [];
      for (let i = 0; i < n; i++) {
        const e = String((b.exts || [])[i] || 'jpg').toLowerCase(), ext = EXT.has(e) ? e : 'jpg';
        const path = `${pasta}/${randomUUID()}.${ext}`;
        const s = await sb.storage.from('rnc-fotos').createSignedUploadUrl(path);
        if (s.error) return erro(res, 500, s.error.message);
        out.push({ path, token: s.data.token });
      }
      return res.status(200).json({ fotos: out });
    }

    if (b.acao === 'criar') {
      const f = {};
      for (const [k, [nome, max]] of Object.entries(T.campos)) { f[k] = txt(b[k], max) || null; if (nome && !f[k]) return erro(res, 400, `Preencha ${nome}.`); }
      const data = /^\d{4}-\d{2}-\d{2}$/.test(b.data_recebimento || '') ? b.data_recebimento : null;
      if (!data || data > new Date(Date.now() + 864e5).toISOString().slice(0, 10)) return erro(res, 400, 'Confira a data de recebimento.');
      const c = await db.from('rnc_codigos').select('codigo').eq('tipo', tipo).eq('codigo', txt(b.codigo_avaria, 10)).eq('ativo', true).maybeSingle();
      if (c.error) return erro(res, 500, falta(c.error));
      if (!c.data) return erro(res, 400, 'Escolha o código da avaria.');
      const prefixo = new RegExp(`^${tipo}/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.(jpg|jpeg|png|webp)$`);
      const fotos = Array.isArray(b.fotos) ? b.fotos.filter(p => typeof p === 'string' && prefixo.test(p)).slice(0, T.maxFotos) : [];
      const r = await db.from('rnc').insert({ tipo, ...f, data_recebimento: data, codigo_avaria: c.data.codigo, registrado_por: eu.id, registrado_por_nome: eu.nome }).select('id, numero').single();
      if (r.error) return erro(res, 500, falta(r.error));
      if (fotos.length) {
        const w = await db.from('rnc_fotos').insert(fotos.map((path, ordem) => ({ rnc_id: r.data.id, ordem, path })));
        if (w.error) return erro(res, 500, `A RNC ${r.data.numero} foi salva, mas as fotos não: ${w.error.message}`);
      }
      return res.status(200).json({ ok: true, id: r.data.id, numero: r.data.numero });
    }

    if (b.acao === 'listar') {
      let q = db.from('rnc_lista').select('*');
      if (tipo) q = q.eq('tipo', tipo);
      const r = await q.order('created_at', { ascending: false }).limit(1000);
      if (r.error) return erro(res, 500, falta(r.error));
      return res.status(200).json({ registros: r.data.map(x => ({ ...x, fotos: Number(x.fotos) || 0 })) });
    }

    if (b.acao === 'detalhe') {
      let q = db.from('rnc_lista').select('*').eq('id', b.id);
      if (tipo) q = q.eq('tipo', tipo);
      const r = await q.maybeSingle();
      if (r.error || !r.data) return erro(res, 404, 'RNC não encontrada');
      const f = await db.from('rnc_fotos').select('path').eq('rnc_id', b.id).order('ordem');
      const urls = [];
      for (const { path } of f.data || []) { const s = await sb.storage.from('rnc-fotos').createSignedUrl(path, 3600); if (s.data) urls.push(s.data.signedUrl); }
      return res.status(200).json({ registro: { ...r.data, fotos: urls } });
    }

    if (b.acao === 'codigos' || b.acao === 'salvarCodigo') {
      if (!admin) return erro(res, 403, 'sem acesso aos códigos de avaria');
      if (b.acao === 'salvarCodigo') {
        const codigo = txt(b.codigo, 10), descricao = txt(b.descricao, 120);
        if (!/^[A-Za-z0-9]{1,10}$/.test(codigo) || !descricao) return erro(res, 400, 'Informe o código (letras e números) e a descrição.');
        const w = await db.from('rnc_codigos').upsert({ tipo, codigo, descricao, ativo: b.ativo !== false, updated_at: new Date().toISOString() }, { onConflict: 'tipo,codigo' });
        if (w.error) return erro(res, 500, falta(w.error));
      }
      const r = await db.from('rnc_codigos').select('codigo, descricao, ativo').eq('tipo', tipo).order('codigo');
      if (r.error) return erro(res, 500, falta(r.error));
      return res.status(200).json({ codigos: r.data });
    }
    return erro(res, 400, 'ação desconhecida');
  } catch (e) {
    console.error(e);
    return erro(res, 500, e.message || 'falha');
  }
}
