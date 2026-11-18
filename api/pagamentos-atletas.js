// Pagamentos a atletas em Contas a pagar: lista os fechamentos, registra o pagamento com comprovante e abre o comprovante (link temporário).
// Grava nas mesmas tabelas do app dos atletas (fee_pagamentos, comissao_pagamentos, comprovantes), então o atleta vê o comprovante no Meu Perfil.
import { createClient } from '@supabase/supabase-js';
import { quem } from './_auth.js';
import { addMes } from './fechamento.js';

const MAX_ARQUIVO = 3 * 1024 * 1024;   // limite do corpo de requisição do Vercel
const erro = (res, c, m) => res.status(c).json({ erro: m });
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const fmtMes = ym => ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][Number(ym.slice(5, 7)) - 1] + ' de ' + ym.slice(0, 4);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return erro(res, 405, 'use POST');
  try {
    const eu = await quem(req);
    if (!eu) return erro(res, 401, 'não autenticado');
    if (!eu.paginas.includes('pagar')) return erro(res, 403, 'sem acesso');
    if (!process.env.ATLETAS_URL || !process.env.ATLETAS_SERVICE_KEY) return erro(res, 500, 'ponte não configurada');
    const db = createClient(process.env.ATLETAS_URL, process.env.ATLETAS_SERVICE_KEY, { auth: { persistSession: false } });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    if (b.acao === 'listar') {
      const desde = addMes(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7), -6) + '-01';
      const f = await db.from('fechamentos_pagamento').select('*, athletes(name, team, pix_key), comprovantes(arquivo_nome, arquivo_path)').or(`status.eq.pendente,vencimento.gte.${desde}`).order('vencimento', { ascending: false });
      if (f.error) return erro(res, 500, /fechamentos_pagamento/.test(f.error.message) ? 'Falta rodar o SQL supabase-atletas/001 no Supabase dos atletas.' : f.error.message);
      return res.status(200).json({ linhas: f.data.map(l => ({ id: l.id, atleta: l.athletes && l.athletes.name, time: l.athletes && l.athletes.team, pix: l.athletes && l.athletes.pix_key || '', tipo: l.tipo, ym: l.ym,
        valor_fee: Number(l.valor_fee), valor_comissao: Number(l.valor_comissao), vencimento: l.vencimento, status: l.status, pago_em: l.pago_em, tem_comprovante: !!(l.comprovantes && l.comprovantes.arquivo_path), arquivo_nome: l.comprovantes && l.comprovantes.arquivo_nome || '' })) });
    }

    if (b.acao === 'arquivo') {
      const f = await db.from('fechamentos_pagamento').select('comprovantes(arquivo_path)').eq('id', b.id).single();
      const p = f.data && f.data.comprovantes && f.data.comprovantes.arquivo_path;
      if (!p) return erro(res, 404, 'sem arquivo');
      const s = await db.storage.from('comprovantes').createSignedUrl(p, 300);
      if (s.error) return erro(res, 500, s.error.message);
      return res.status(200).json({ url: s.data.signedUrl });
    }

    if (b.acao === 'pagar') {
      const f = await db.from('fechamentos_pagamento').select('*').eq('id', b.id).single();
      if (f.error || !f.data) return erro(res, 404, 'pagamento não encontrado');
      const l = f.data;
      if (l.status === 'pago') return erro(res, 400, 'Este pagamento já foi registrado.');
      const data = /^\d{4}-\d{2}-\d{2}$/.test(b.data || '') ? b.data : null;
      const fee = r2(b.valor_fee), com = r2(b.valor_comissao), obs = String(b.obs || '').trim().slice(0, 300);
      if (!data || !(fee + com > 0)) return erro(res, 400, 'Preencha os valores e a data.');
      const arq = b.arquivo;
      if (arq && (typeof arq.base64 !== 'string' || Buffer.byteLength(arq.base64, 'base64') > MAX_ARQUIVO)) return erro(res, 400, 'O comprovante passa de 3 MB. Envie um print ou PDF menor.');

      const autor = eu.nome || eu.email;
      const ant = addMes(l.ym, -1);
      if (l.tipo === 'fee') {
        const r = await db.from('fee_pagamentos').insert({ athlete_id: l.athlete_id, ym: l.ym, valor_fee: fee, valor_rebate: com, pago_em: data, obs, autor });
        if (r.error) return erro(res, 500, r.error.message);
        if (com > 0) await db.from('comissao_pagamentos').insert({ athlete_id: l.athlete_id, valor: com, pago_em: data, ym: ant, obs: `Rebate pago junto com o fee de ${fmtMes(l.ym)}` });
      } else {
        const r = await db.from('comissao_pagamentos').insert({ athlete_id: l.athlete_id, valor: com, pago_em: data, ym: data.slice(0, 7), obs });
        if (r.error) return erro(res, 500, r.error.message);
      }

      let comprovanteId = null, aviso = '';
      try {
        let path = '', nome = '';
        if (arq) {
          const ext = (String(arq.nome || '').split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'pdf';
          path = `${l.athlete_id}/${data}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`; nome = String(arq.nome || 'comprovante').slice(0, 120);
          const up = await db.storage.from('comprovantes').upload(path, Buffer.from(arq.base64, 'base64'), { contentType: arq.tipo || 'application/octet-stream' });
          if (up.error) throw up.error;
        }
        const desc = l.tipo === 'fee' ? `Fee de ${fmtMes(l.ym)}${com > 0 ? ` + rebate de ${fmtMes(ant)}` : ''}${obs ? ' — ' + obs : ''}` : `Comissão${obs ? ' — ' + obs : ''}`;
        const c = await db.from('comprovantes').insert({ athlete_id: l.athlete_id, data, valor: fee + com, descricao: desc, tipo: l.tipo, arquivo_path: path, arquivo_nome: nome, autor }).select('id').single();
        if (c.error) throw c.error;
        comprovanteId = c.data.id;
      } catch (e) { aviso = 'Pagamento registrado, mas o comprovante não foi salvo: ' + (e.message || e); }

      const u = await db.from('fechamentos_pagamento').update({ status: 'pago', pago_em: data, comprovante_id: comprovanteId, valor_fee: fee, valor_comissao: com, obs, updated_at: new Date().toISOString() }).eq('id', l.id);
      if (u.error) return erro(res, 500, 'Pagamento gravado, mas a pendência não foi atualizada: ' + u.error.message);
      return res.status(200).json({ ok: true, aviso });
    }
    return erro(res, 400, 'ação desconhecida');
  } catch (e) {
    console.error(e);
    return erro(res, 500, e.message || 'falha');
  }
}
