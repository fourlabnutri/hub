// Fechamento mensal dos pagamentos a atletas. Roda sozinho todo dia 1 (Vercel Cron, vercel.json) e também sob demanda (botão em Contas a pagar).
// Fee: fee do mês + rebate (comissão do mês anterior). Comissão (sem fee): saldo acumulado, só vira pendência quando passa de R$ 100.
// A regra espelha o app dos atletas (shared.js: historicoComissao / montarFeesDoMes). Idempotente: rodar de novo não duplica.
import { createClient } from '@supabase/supabase-js';
import { quem } from './_auth.js';

const MINIMO = 100, INICIO_COMISSOES = '2026-09', ALIAS = 'fourlab', DIA_VENC_COMISSAO = 5;
const pad = n => String(n).padStart(2, '0');
export const addMes = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
const mesAtual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
const ultimoDia = ym => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;

async function yampi(a, ym) {
  const k = process.env.ATLETAS_SERVICE_KEY;
  const body = { alias: ALIAS, cupomCode: a.cupom_yampi, ym, descontoCupomPct: a.desconto_cupom_pct || 10, comissaoPct: a.comissao_pct || 10 };
  for (let t = 0; t < 2; t++) {
    const r = await fetch(`${process.env.ATLETAS_URL}/functions/v1/yampi-sync-atleta`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: k, Authorization: `Bearer ${k}` }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (r.ok && j && !j.error) return Number(j.comissaoMes || 0);
  }
  throw new Error('Yampi não respondeu para ' + a.name + ' (' + ym + ')');
}

async function emLotes(itens, n, fn) {
  const fila = itens.slice();
  await Promise.all(Array.from({ length: Math.min(n, fila.length) }, async () => { while (fila.length) await fn(fila.shift()); }));
}

// mes = mês em que o fechamento roda (dia 1 de `mes`): fecha o mês anterior e cria o fee de `mes`
export async function fechar(db, mes, { simular = false } = {}) {
  const ant = addMes(mes, -1);
  const [at, cad, feeP, comP, fech] = await Promise.all([
    db.from('athletes').select('id, name, cupom_yampi, desconto_cupom_pct, comissao_pct, recebe_comissao'),
    db.from('atleta_cadastro').select('athlete_id, fee_ativo, fee_valor, fee_dia'),
    db.from('fee_pagamentos').select('athlete_id, ym'),
    db.from('comissao_pagamentos').select('athlete_id, valor, ym, pago_em'),
    db.from('fechamentos_pagamento').select('*'),
  ]);
  for (const x of [at, cad, feeP, comP, fech]) if (x.error) throw new Error(x.error.message);
  const cadDe = Object.fromEntries(cad.data.map(c => [c.athlete_id, c]));
  const out = { mes, criados: [], atualizados: [], removidos: [], ignorados: 0, erros: [] };
  const novos = [], atualizar = [], apagar = [];

  const feeAtletas = at.data.filter(a => cadDe[a.id] && cadDe[a.id].fee_ativo);
  const comAtletas = at.data.filter(a => a.recebe_comissao && a.cupom_yampi && !(cadDe[a.id] && cadDe[a.id].fee_ativo));

  await emLotes(feeAtletas, 3, async a => {
    const c = cadDe[a.id];
    if (feeP.data.some(p => p.athlete_id === a.id && p.ym === mes) || fech.data.some(f => f.athlete_id === a.id && f.tipo === 'fee' && f.ym === mes)) { out.ignorados++; return; }
    let rebate = 0;
    if (a.recebe_comissao && a.cupom_yampi && ant >= INICIO_COMISSOES) {
      try { rebate = await yampi(a, ant); } catch (e) { out.erros.push(e.message); return; }   // sem Yampi não cria: evitaria pagar a menos
    }
    const dia = Math.min(Math.max(1, Number(c.fee_dia) || 5), ultimoDia(mes));
    novos.push({ athlete_id: a.id, nome: a.name, tipo: 'fee', ym: mes, valor_fee: r2(c.fee_valor), valor_comissao: r2(rebate), vencimento: `${mes}-${pad(dia)}` });
  });

  await emLotes(comAtletas, 3, async a => {
    const yms = []; for (let m = INICIO_COMISSOES; m <= ant; m = addMes(m, 1)) yms.push(m);
    const porMes = {};
    try { for (const m of yms) porMes[m] = await yampi(a, m); } catch (e) { out.erros.push(e.message); return; }
    let saldo = 0;
    yms.forEach(m => {
      const pagos = comP.data.filter(p => p.athlete_id === a.id && (p.ym || String(p.pago_em || '').slice(0, 7)) === m).reduce((t, p) => t + Number(p.valor || 0), 0);
      saldo = Math.max(0, saldo + (porMes[m] || 0) - pagos);
    });
    saldo = r2(saldo);
    const aberta = fech.data.find(f => f.athlete_id === a.id && f.tipo === 'comissao' && f.status === 'pendente');
    if (aberta) {
      if (saldo < 0.005) apagar.push({ id: aberta.id, nome: a.name });
      else if (r2(aberta.valor_comissao) !== saldo) atualizar.push({ id: aberta.id, nome: a.name, valor_comissao: saldo });
      else out.ignorados++;
    } else if (saldo >= MINIMO) {
      novos.push({ athlete_id: a.id, nome: a.name, tipo: 'comissao', ym: ant, valor_fee: 0, valor_comissao: saldo, vencimento: `${mes}-${pad(DIA_VENC_COMISSAO)}` });
    } else out.ignorados++;
  });

  out.criados = novos.map(n => ({ nome: n.nome, tipo: n.tipo, total: r2(n.valor_fee + n.valor_comissao) }));
  out.atualizados = atualizar.map(n => ({ nome: n.nome, total: n.valor_comissao }));
  out.removidos = apagar.map(n => n.nome);
  if (simular) return out;
  if (novos.length) { const r = await db.from('fechamentos_pagamento').insert(novos.map(({ nome, ...l }) => l)); if (r.error) throw new Error(r.error.message); }
  for (const u of atualizar) { const r = await db.from('fechamentos_pagamento').update({ valor_comissao: u.valor_comissao, updated_at: new Date().toISOString() }).eq('id', u.id); if (r.error) throw new Error(r.error.message); }
  for (const d of apagar) { const r = await db.from('fechamentos_pagamento').delete().eq('id', d.id); if (r.error) throw new Error(r.error.message); }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const cron = process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
    if (!cron) {
      const eu = await quem(req);
      if (!eu) return res.status(401).json({ erro: 'não autenticado' });
      if (!eu.paginas.includes('pagar')) return res.status(403).json({ erro: 'sem acesso' });
    }
    if (!process.env.ATLETAS_URL || !process.env.ATLETAS_SERVICE_KEY) return res.status(500).json({ erro: 'ponte não configurada' });
    const q = req.query || {};
    const mes = /^\d{4}-\d{2}$/.test(q.mes || '') ? q.mes : mesAtual();
    const db = createClient(process.env.ATLETAS_URL, process.env.ATLETAS_SERVICE_KEY, { auth: { persistSession: false } });
    return res.status(200).json(await fechar(db, mes, { simular: q.simular === '1' }));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: e.message || 'falha no fechamento' });
  }
}
