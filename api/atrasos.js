// Monitor de atrasos de entrega (só leitura). Banco: schema "logistica" do Supabase do Hub (tabelas do Junior:
// atraso_casos e atraso_eventos). O schema precisa estar em "Exposed schemas" (Supabase › Project Settings › API).
// Acesso: página "atrasos" do hub.
import { createClient } from '@supabase/supabase-js';
import { quem } from './_auth.js';

const erro = (res, c, m) => res.status(c).json({ erro: m });
const CAMPOS = 'id, pedido_numero, nf_numero, loja_id, cliente, cliente_documento, municipio, uf, valor_pedido, transportadora, servico, codigo_rastreio, data_saida, prazo_data, motivo, status, ticket_numero, ticket_aberto_em, proxima_cobranca, busca_limite, reembolso_valor, desfecho, detectado_em, encerrado_em, atualizado_em';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return erro(res, 405, 'use POST');
  try {
    const eu = await quem(req);
    if (!eu || !eu.paginas.includes('atrasos')) return erro(res, eu ? 403 : 401, eu ? 'sem acesso' : 'não autenticado');
    if (!process.env.SUPABASE_SERVICE_KEY) return erro(res, 500, 'Falta SUPABASE_SERVICE_KEY no Vercel.');
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } }).schema('logistica');
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const falta = e => /schema|logistica|does not exist|Invalid schema/i.test(e.message) ? 'O schema "logistica" não está liberado na API do Supabase (Project Settings › API › Exposed schemas).' : e.message;

    if (b.acao === 'casos') {
      const r = await db.from('atraso_casos').select(CAMPOS).order('detectado_em', { ascending: false }).limit(5000);
      if (r.error) return erro(res, 500, falta(r.error));
      return res.status(200).json({ casos: r.data });
    }
    if (b.acao === 'caso') {
      const id = Number(b.id);
      const [c, e] = await Promise.all([
        db.from('atraso_casos').select(CAMPOS + ', texto_ticket').eq('id', id).maybeSingle(),
        db.from('atraso_eventos').select('tipo, origem, detalhe, criado_em').eq('caso_id', id).order('criado_em', { ascending: false }).limit(200),
      ]);
      if (c.error || !c.data) return erro(res, 404, c.error ? falta(c.error) : 'caso não encontrado');
      return res.status(200).json({ caso: c.data, eventos: e.data || [] });
    }
    return erro(res, 400, 'ação desconhecida');
  } catch (e) {
    console.error(e);
    return erro(res, 500, e.message || 'falha');
  }
}
