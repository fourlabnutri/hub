// Função serverless (Vercel): confere o login (Supabase), checa o perfil e devolve as tabelas report_* do Nekt.
// A chave do Nekt só existe aqui (variável de ambiente), nunca no navegador.
import { quem } from './_auth.js';

const NEKT_URL = 'https://api.nekt.ai/api/v1/sql-query/';
const DB = process.env.NEKT_DATABASE || 'fourlabnutri_trusted';


const T = t => `${DB}.${t}`;
const RESULTADO = `select cast(dia as string) as dia, campanha_id, campanha, sku, produto, investimento, impressoes, alcance, cliques_link, visualizacoes_lp, inicios_checkout, compras_meta, pedidos_produto, unidades_produto, receita_produto, clientes, pedidos_com_cupom, dia_com_dados_meta from ${T('report_campanha_resultado_dia')}`;
const SECOES = {
  receber: {
    titulos: `select titulo_id, origem, cliente_chave, cliente_nome, cast(vencimento as string) as vencimento, valor, forma, pedido, parcela, dias_atraso, situacao, faixa_atraso, escopo from ${T('report_receber_titulos')}`,
    clientes: `select cliente_chave, nome, email, telefone, telefone_valido, cidade_uf, titulos_historico, pagos_em_dia, titulos_atrasados, atraso_medio_dias, atraso_max_dias, compras_total, pago_total, vencido, a_vencer, em_aberto, maior_atraso_dias, score, classe_score, status_cliente from ${T('report_receber_clientes')}`,
  },
  pagar: {
    titulos: `select titulo_id, fornecedor_chave, fornecedor_nome, fornecedor_documento, email, telefone, categoria, eh_comissao, descricao, numero_documento, cast(emissao as string) as emissao, cast(vencimento_original as string) as vencimento_original, cast(vencimento as string) as vencimento, valor, saldo, situacao_titulo, dias_atraso, situacao_prazo, faixa_atraso from ${T('report_pagar_titulos')}`,
  },
  canais: {
    canais: `select cast(dia as string) as dia, canal, investimento, impressoes, cliques, compras_plataforma, pedidos, receita from ${T('report_marketing_canal_dia')} where dia >= date_sub(current_date('America/Sao_Paulo'), interval 120 day)`,
    anuncios: `select cast(dia as string) as dia, campanha_id, campanha, anuncio, conjunto_id, ad_id, conta_id, investimento, cliques_link, compras_meta, pedidos, receita from ${T('report_marketing_anuncio_utm_dia')} where dia >= date_sub(current_date('America/Sao_Paulo'), interval 120 day) and (investimento > 0 or pedidos > 0)`,
    catalogo: `select ad_id, anuncio, situacao_efetiva, campanha_id, campanha, conjunto_id, conjunto, conta_id from ${T('report_marketing_anuncios')} where situacao_efetiva = 'ACTIVE'`,
  },
  loja: {
    pedidos: `select cast(dia as string) as dia, status, status_grupo, valor_total, forma_pagamento, parcelas, uf, cliente_id, cliente_recorrente, utm_source, utm_medium, utm_campaign from ${T('report_loja_pedidos')} where dia >= date_sub(current_date('America/Sao_Paulo'), interval 180 day)`,
    carrinhos: `select cast(dia as string) as dia, valor, etapa, utm_source, recuperado from ${T('report_loja_carrinhos')} where dia >= date_sub(current_date('America/Sao_Paulo'), interval 180 day)`,
    produtos: `select cast(dia as string) as dia, sku, produto, pedidos, unidades from ${T('report_vendas_produto_dia')} where dia >= date_sub(current_date('America/Sao_Paulo'), interval 180 day)`,
  },
  vendas: {
    dia: `select cast(dia as string) as dia, sku, produto, pedidos, unidades, receita_produtos, receita_frete, receita_total, clientes, pedidos_com_cupom, pedidos_aguardando_pagamento, pedidos_cancelados from ${T('report_vendas_produto_dia')} where dia >= date_sub(current_date('America/Sao_Paulo'), interval 180 day)`,
    resultado: RESULTADO,
  },
  campanhas: {
    anuncios: `select cast(dia as string) as dia, campanha_id, campanha, situacao_campanha, conjunto, conjunto_id, anuncio, ad_id, conta_id, criativo_tipo, criativo_titulo, criativo_miniatura, link_preview, investimento, impressoes, alcance, cliques_link, visualizacoes_lp, inicios_checkout, compras_meta, valor_compras_meta from ${T('report_marketing_anuncio_dia')} where dia >= date_sub(current_date('America/Sao_Paulo'), interval 180 day)`,
    catalogo: `select ad_id, anuncio, situacao_efetiva, campanha_id, campanha, conjunto_id, conjunto, conta_id from ${T('report_marketing_anuncios')} where situacao_efetiva = 'ACTIVE'`,
    resultado: RESULTADO,
  },
  producao: {
    ops: `select op_id, op_numero, produto, sku, tipo, unidade, quantidade, status_op, cast(emissao as string) as emissao, cast(inicio_planejado as string) as inicio_planejado, cast(previsao_entrega as string) as previsao_entrega, cast(conclusao as string) as conclusao from ${T('report_producao_ops')}`,
    etapas: `select op_id, etapa, etapa_ordem, status_etapa from ${T('report_producao_etapas')}`,
  },
};

const NUM = new Set(['cliques','compras_plataforma','receita','valor_total','parcelas','pedidos','unidades','receita_produtos','receita_frete','receita_total','clientes','pedidos_com_cupom','pedidos_aguardando_pagamento','pedidos_cancelados','investimento','impressoes','alcance','cliques_link','visualizacoes_lp','inicios_checkout','compras_meta','valor_compras_meta','pedidos_produto','unidades_produto','receita_produto','saldo','valor','dias_atraso','titulos_historico','pagos_em_dia','titulos_atrasados','atraso_medio_dias','atraso_max_dias','compras_total','pago_total','vencido','a_vencer','em_aberto','maior_atraso_dias','score','quantidade','etapa_ordem']);
const BOOL = new Set(['telefone_valido', 'eh_comissao', 'dia_com_dados_meta', 'cliente_recorrente', 'recuperado']);

function parseCsv(txt) {
  const rows = []; let row = [], f = '', q = false;
  if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

function toObjects(csvs) {
  const out = [];
  for (const txt of csvs) {
    const [head, ...body] = parseCsv(txt);
    if (!head) continue;
    for (const r of body) {
      if (r.length === 1 && r[0] === '') continue;
      const o = {};
      head.forEach((h, i) => {
        const v = r[i];
        o[h] = v === '' || v === undefined ? null : NUM.has(h) ? Number(v) : BOOL.has(h) ? v === 'true' : v;
      });
      out.push(o);
    }
  }
  return out;
}

async function runQuery(sql) {
  const r = await fetch(NEKT_URL, {
    method: 'POST',
    headers: { 'x-api-key': process.env.NEKT_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ sql, mode: 'csv' }),
  });
  const j = await r.json();
  if (!r.ok || j.state !== 'SUCCEEDED') throw new Error(`Nekt: ${r.status} ${j.state || ''} ${JSON.stringify(j).slice(0, 300)}`);
  const csvs = await Promise.all((j.presigned_urls || []).map(u => fetch(u).then(x => x.text())));
  return toObjects(csvs);
}

// cache em memória por instância (os dados são os mesmos para todo usuário autorizado da seção)
const cache = new Map(); const TTL = 5 * 60 * 1000;
async function secao(nome) {
  const hit = cache.get(nome);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const defs = SECOES[nome];
  const v = Object.fromEntries(await Promise.all(Object.entries(defs).map(async ([k, sql]) => [k, await runQuery(sql)])));
  cache.set(nome, { t: Date.now(), v });
  return v;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');   // nunca no cache compartilhado: dados de clientes
  try {
    const perfil = await quem(req);
    if (!perfil) return res.status(401).json({ erro: 'não autenticado' });
    const paginas = perfil.paginas;
    const s = req.query.s;
    if (!s) return res.status(200).json({ perfil });
    if (!paginas.includes(s)) return res.status(403).json({ erro: 'sem acesso a esta área' });
    return res.status(200).json({ perfil, dados: await secao(s) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: 'falha ao consultar os dados' });
  }
}
