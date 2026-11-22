// Leitura do XML de CT-e (procCTe / resCTe / eventos) para as tabelas frete_cte, frete_cte_nfe e frete_cte_componente.
// Sem dependência: extração por tags, que é estável no layout 4.00 da SEFAZ.

const re = t => new RegExp(`<(?:\\w+:)?${t}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${t}>`);
export const tag = (xml, t) => { const m = (xml || '').match(re(t)); return m ? m[1].trim() : null; };
export const bloco = (xml, t) => { const m = (xml || '').match(new RegExp(`<(?:\\w+:)?${t}(?:\\s[^>]*)?>[\\s\\S]*?</(?:\\w+:)?${t}>`)); return m ? m[0] : ''; };
const todos = (xml, t) => [...(xml || '').matchAll(new RegExp(`<(?:\\w+:)?${t}(?:\\s[^>]*)?>[\\s\\S]*?</(?:\\w+:)?${t}>`, 'g'))].map(m => m[0]);
const num = v => v == null || v === '' ? null : Number(v);
const doc = x => tag(x, 'CNPJ') || tag(x, 'CPF');

const TIPO = { 0: 'normal', 1: 'complemento', 2: 'anulacao', 3: 'substituto' };
const MODAL = { '01': 'rodoviario', '02': 'aereo', '03': 'aquaviario', '04': 'ferroviario', '05': 'dutoviario', '06': 'multimodal' };
const PAPEL = { 0: 'remetente', 1: 'expedidor', 2: 'recebedor', 3: 'destinatario', 4: 'outros' };

// CT-e completo (procCTe ou CTe)
export function lerCTe(xml) {
  const inf = bloco(xml, 'infCte'), ide = bloco(inf, 'ide'), emit = bloco(inf, 'emit');
  const rem = bloco(inf, 'rem'), dest = bloco(inf, 'dest'), exped = bloco(inf, 'exped'), receb = bloco(inf, 'receb');
  const chave = tag(xml, 'chCTe') || (inf.match(/Id="CTe(\d{44})"/) || [])[1];
  if (!chave) return null;
  // tomador: toma3 (papel 0..3) ou toma4 (outros, com o próprio documento)
  const t3 = bloco(ide, 'toma3'), t4 = bloco(ide, 'toma4');
  const papelN = t3 ? Number(tag(t3, 'toma')) : t4 ? 4 : null;
  const docPapel = { 0: doc(rem), 1: doc(exped), 2: doc(receb), 3: doc(dest), 4: doc(t4) };
  // ICMS: o primeiro grupo ICMSxx dentro de imp
  const imp = bloco(inf, 'imp'), icmsG = (bloco(imp, 'ICMS').match(/<(?:\w+:)?(ICMS\w+)>[\s\S]*?<\/(?:\w+:)?\1>/) || [])[0] || '';
  // carga: peso em kg (cUnid 01) e volumes (cUnid 03)
  const carga = bloco(inf, 'infCarga'), qs = todos(carga, 'infQ');
  const q = c => qs.filter(x => tag(x, 'cUnid') === c).reduce((s, x) => s + (num(tag(x, 'qCarga')) || 0), 0) || null;
  const prot = bloco(xml, 'infProt'), vPrest = bloco(inf, 'vPrest');
  const tp = tag(ide, 'tpCTe');
  return {
    cte: {
      chave, numero: Number(tag(ide, 'nCT')), serie: Number(tag(ide, 'serie')), emitido_em: tag(ide, 'dhEmi'),
      tipo: TIPO[tp] || tp || 'normal', modal: MODAL[tag(ide, 'modal')] || tag(ide, 'modal'), cfop: tag(ide, 'CFOP'),
      transportadora_cnpj: tag(emit, 'CNPJ') || tag(emit, 'CPF'), transportadora_nome: tag(emit, 'xNome'),
      remetente_doc: doc(rem), destinatario_doc: doc(dest), destinatario_nome: tag(dest, 'xNome'), destino_cep: tag(bloco(dest, 'enderDest'), 'CEP'),
      tomador_papel: papelN == null ? null : PAPEL[papelN], tomador_doc: papelN == null ? null : docPapel[papelN] || null,
      origem_municipio: tag(ide, 'xMunIni'), origem_uf: tag(ide, 'UFIni'), destino_municipio: tag(ide, 'xMunFim'), destino_uf: tag(ide, 'UFFim'),
      valor_prestacao: num(tag(vPrest, 'vTPrest')) ?? 0, valor_receber: num(tag(vPrest, 'vRec')),
      icms_cst: tag(icmsG, 'CST') || tag(icmsG, 'CSOSN'), icms_base: num(tag(icmsG, 'vBC')), icms_aliquota: num(tag(icmsG, 'pICMS')), icms_valor: num(tag(icmsG, 'vICMS')),
      valor_carga: num(tag(carga, 'vCarga')), produto_predominante: tag(carga, 'proPred'), peso_kg: q('01'), volumes: q('03') == null ? null : Math.round(q('03')),
      protocolo: tag(prot, 'nProt'), status_sefaz: num(tag(prot, 'cStat')), autorizado_em: tag(prot, 'dhRecbto'),
      cancelado: tag(prot, 'cStat') === '101',
    },
    nfes: [...new Set(todos(bloco(inf, 'infDoc'), 'infNFe').map(x => tag(x, 'chave')).filter(Boolean))].map(chave_nfe => ({ chave_cte: chave, chave_nfe })),
    componentes: Object.values(todos(vPrest, 'Comp').reduce((m, c) => { const nome = tag(c, 'xNome') || 'sem nome'; m[nome] = { chave, nome, valor: ((m[nome] || {}).valor || 0) + (num(tag(c, 'vComp')) || 0) }; return m; }, {})),
  };
}

// Resumo (resCTe): só alguns campos; o XML completo pode chegar depois e completa o registro
export function lerResumo(xml) {
  const chave = tag(xml, 'chCTe'); if (!chave) return null;
  return { cte: { chave, numero: Number(chave.slice(25, 34)), serie: Number(chave.slice(22, 25)), emitido_em: tag(xml, 'dhEmi'), tipo: 'normal',
    transportadora_cnpj: tag(xml, 'CNPJ') || chave.slice(6, 20), transportadora_nome: tag(xml, 'xNome'), valor_prestacao: num(tag(xml, 'vTPrest')) ?? 0,
    protocolo: tag(xml, 'nProt'), cancelado: tag(xml, 'cSitCTe') === '3' }, nfes: [], componentes: [], resumo: true };
}

// Evento: cancelamento (110111) marca o CT-e como cancelado
export function lerEvento(xml) {
  const tp = tag(xml, 'tpEvento'), chave = tag(xml, 'chCTe');
  return tp === '110111' && chave ? { chave, cancelado: true } : null;
}
