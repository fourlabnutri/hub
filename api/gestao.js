// Ponte segura da Gestão de atletas: o navegador (login do hub) manda a consulta, e aqui ela roda no Supabase dos atletas
// com a chave secreta (ATLETAS_SERVICE_KEY), que só existe no Vercel. Só perfis com acesso à gestão passam.
import { createClient } from '@supabase/supabase-js';
import { quem } from './_auth.js';

const TABELAS = new Set(['athletes', 'cycles', 'entries', 'products', 'teams', 'roteiro_exemplos', 'roteiro_biblioteca', 'crm_cards',
  'blog_textos', 'avisos', 'vendas_mensais', 'comissao_pagamentos', 'ia_contexto',
  'atleta_cadastro', 'atleta_compras', 'ia_acesso', 'ia_pedidos', 'sugestao_exemplos', 'sugestao_gravacoes', 'sugestoes', 'sugestoes_conteudo']);
const METODOS = new Set(['from', 'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
  'contains', 'containedBy', 'or', 'not', 'filter', 'match', 'order', 'limit', 'range', 'single', 'maybeSingle', 'textSearch']);
const FILTROS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'or', 'not', 'filter', 'match', 'textSearch']);
const FUNCOES = new Set(['gerar-roteiro', 'buscar-trends', 'gerar-cupom', 'yampi-sync-atleta', 'yampi-compras-atleta', 'gerar-sugestao', 'criar-acesso-atleta']);
const BUCKETS = new Set(['briefings']);

let cliente;
const atletas = () => cliente || (cliente = createClient(process.env.ATLETAS_URL, process.env.ATLETAS_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }));

// reexecuta a cadeia do supabase-js (from().select().eq()...) só com tabelas e métodos permitidos
export async function executar(calls, base) {
  if (!Array.isArray(calls) || !calls.length || calls.length > 25) throw new Error('consulta inválida');
  if (calls[0].m !== 'from' || calls.filter(c => c.m === 'from').length !== 1) throw new Error('consulta inválida');
  if (!TABELAS.has(calls[0].a[0])) throw new Error('tabela não permitida: ' + calls[0].a[0]);
  let q = base;
  for (const c of calls) {
    if (!METODOS.has(c.m) || !Array.isArray(c.a)) throw new Error('método não permitido: ' + c.m);
    q = q[c.m](...c.a);
  }
  const grava = calls.some(c => c.m === 'update' || c.m === 'delete');
  if (grava && !calls.some(c => FILTROS.has(c.m))) throw new Error('update/delete exigem filtro');
  return await q;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ erro: 'método inválido' });
  try {
    const perfil = await quem(req);
    if (!perfil) return res.status(401).json({ erro: 'não autenticado' });
    if (!perfil.paginas.some(p => p.startsWith('gestao-'))) return res.status(403).json({ erro: 'sem acesso à gestão de atletas' });
    if (!process.env.ATLETAS_URL || !process.env.ATLETAS_SERVICE_KEY) return res.status(500).json({ erro: 'ponte não configurada' });
    const corpo = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    if (corpo.calls) {
      const r = await executar(corpo.calls, atletas());
      return res.status(200).json({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null });
    }
    if (corpo.fn) {
      if (!FUNCOES.has(corpo.fn)) return res.status(400).json({ erro: 'função não permitida' });
      const k = process.env.ATLETAS_SERVICE_KEY;
      const f = await fetch(`${process.env.ATLETAS_URL}/functions/v1/${corpo.fn}`, {
        method: 'POST', headers: { 'content-type': 'application/json', apikey: k, Authorization: `Bearer ${k}` }, body: JSON.stringify(corpo.body || {}),
      });
      const txt = await f.text(); let data; try { data = JSON.parse(txt); } catch { data = txt; }
      if (!f.ok) return res.status(200).json({ data: null, error: { message: (data && (data.error || data.message)) || `função respondeu ${f.status}` } });
      return res.status(200).json({ data, error: null });
    }
    if (corpo.storage) {
      const { bucket, path, base64, contentType, upsert } = corpo.storage;
      if (!BUCKETS.has(bucket) || typeof path !== 'string' || path.includes('..') || path.startsWith('/')) return res.status(400).json({ erro: 'arquivo inválido' });
      const up = await atletas().storage.from(bucket).upload(path, Buffer.from(base64, 'base64'), { upsert: !!upsert, contentType });
      if (up.error) return res.status(200).json({ data: null, error: { message: up.error.message } });
      const { data } = atletas().storage.from(bucket).getPublicUrl(path);
      return res.status(200).json({ data: { path, publicUrl: data.publicUrl }, error: null });
    }
    return res.status(400).json({ erro: 'pedido inválido' });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ data: null, error: { message: e.message || 'falha na ponte' } });
  }
}
