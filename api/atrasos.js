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
      const [r, f] = await Promise.all([
        db.from('atraso_casos').select(CAMPOS).order('detectado_em', { ascending: false }).limit(5000),
        db.from('v_fila_atrasos').select('id, dias_atraso, ultimo_evento, ultimo_evento_detalhe, ultimo_evento_em').limit(5000),
      ]);
      if (r.error) return erro(res, 500, falta(r.error));
      const fila = new Map((f.data || []).map(x => [x.id, x]));
      return res.status(200).json({ casos: r.data.map(c => ({ ...c, ...(fila.get(c.id) || {}), na_fila: fila.has(c.id) })) });
    }
    // ação manual (Waldo, Petherson ou o agente com o login do Petherson): muda o status e registra o evento
    if (b.acao === 'mudar') {
      const PARA = { entregue: 'entregue', nao_postado: 'pendente_decisao', ticket_preparado: 'ticket_rascunho', ticket_enviado: 'ticket_aberto', encerrar: 'encerrado' };
      const novo = PARA[b.botao], id = Number(b.id), obs = String(b.obs || '').trim().slice(0, 2000);
      if (!novo || !id) return erro(res, 400, 'ação inválida');
      if (b.botao === 'encerrar' && !obs) return erro(res, 400, 'Escreva a observação para encerrar.');
      const atual = await db.from('atraso_casos').select('id, volume_id, status').eq('id', id).maybeSingle();
      if (atual.error || !atual.data) return erro(res, 404, atual.error ? falta(atual.error) : 'caso não encontrado');
      const agora = new Date().toISOString(), mud = { status: novo, atualizado_em: agora };
      if (novo === 'encerrado' || novo === 'entregue') mud.encerrado_em = agora;
      if (novo === 'encerrado') mud.desfecho = obs;
      if (novo === 'ticket_aberto') mud.ticket_aberto_em = agora;
      const u = await db.from('atraso_casos').update(mud).eq('id', id);
      if (u.error) return erro(res, 500, falta(u.error));
      const ev = await db.from('atraso_eventos').insert({ caso_id: id, volume_id: atual.data.volume_id, tipo: 'status_manual', origem: 'hub',
        detalhe: `${atual.data.status || '—'} → ${novo} · ${eu.nome}${obs ? ' · ' + obs : ''}`,
        payload: { de: atual.data.status, para: novo, botao: b.botao, por: eu.nome, email: eu.email, obs: obs || null }, criado_em: agora });
      if (ev.error) return erro(res, 500, `Status alterado, mas o evento não foi gravado: ${ev.error.message}`);
      return res.status(200).json({ ok: true, status: novo });
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
