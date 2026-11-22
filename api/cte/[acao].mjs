// /api/cte/:acao — CT-e pela Distribuição DF-e da SEFAZ, com o certificado A1 das variáveis CERT_PFX_BASE64 / CERT_PFX_SENHA.
//   piloto   → só lê até 100 CT-e e devolve na tela (não grava). Acesso: página "usuarios".
//   importar → continua do último NSU (frete_cte_controle) e grava em frete_cte, frete_cte_nfe e frete_cte_componente.
//              Chamado pelo N8N a cada hora com "Authorization: Bearer <CRON_SECRET>", ou por um admin logado.
// Regra da SEFAZ: quando responde "nenhum documento" (137), só se consulta de novo depois de 1 hora.
import https from "node:https";
import zlib from "node:zlib";
import { quem } from "../_auth.js";
import { agenteCertificado } from "../../lib/certificado.mjs";
import { tag, bloco, lerCTe, lerResumo, lerEvento } from "../../lib/cte.mjs";

const URL_WS = "https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx";
const CNPJ = process.env.CTE_CNPJ || "27794541000195";
const UF = "31"; // MG
const LIMITE_MS = 48000;   // a função tem 60 s; para antes e deixa o resto para a próxima rodada

const soap = ultNSU => `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><cteDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe"><cteDadosMsg><distDFeInt versao="1.00" xmlns="http://www.portalfiscal.inf.br/cte"><tpAmb>1</tpAmb><cUFAutor>${UF}</cUFAutor><CNPJ>${CNPJ}</CNPJ><distNSU><ultNSU>${String(ultNSU).padStart(15, "0")}</ultNSU></distNSU></distDFeInt></cteDadosMsg></cteDistDFeInteresse></soap12:Body></soap12:Envelope>`;

function post(body) {
  return new Promise((ok, erro) => {
    const r = https.request(URL_WS, { method: "POST", agent: agenteCertificado(), timeout: 25000,
      headers: { "Content-Type": "application/soap+xml; charset=utf-8", "Content-Length": Buffer.byteLength(body) } }, (res) => {
      let d = ""; res.setEncoding("utf8"); res.on("data", (c) => d += c); res.on("end", () => ok({ status: res.statusCode, xml: d }));
    });
    r.on("timeout", () => r.destroy(new Error("SEFAZ não respondeu em 25 s")));
    r.on("error", erro); r.end(body);
  });
}

// uma chamada à SEFAZ: devolve status, NSUs e os documentos já descompactados
async function lote(ultNSU) {
  const { status, xml } = await post(soap(ultNSU));
  const ret = bloco(xml, "retDistDFeInt");
  if (!ret) throw new Error(`Resposta inesperada da SEFAZ (HTTP ${status})`);
  const docs = [...ret.matchAll(/<docZip[^>]*NSU="(\d+)"[^>]*schema="([^"]+)"[^>]*>([^<]+)<\/docZip>/g)]
    .map(m => ({ nsu: m[1], schema: m[2], xml: zlib.gunzipSync(Buffer.from(m[3], "base64")).toString("utf8") }));
  return { cStat: tag(ret, "cStat"), xMotivo: tag(ret, "xMotivo"), ultNSU: tag(ret, "ultNSU"), maxNSU: tag(ret, "maxNSU"), docs };
}

// Supabase REST com a chave service (só no servidor)
const SB = () => ({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY });
async function rest(metodo, caminho, corpo, prefer) {
  const { url, key } = SB();
  const r = await fetch(`${url}/rest/v1/${caminho}`, { method: metodo, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  if (!r.ok) throw new Error(`Supabase ${caminho}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}
const upsert = (tabela, linhas, conflito, ignorar) => linhas.length ? rest("POST", `${tabela}?on_conflict=${conflito}`, linhas, `resolution=${ignorar ? "ignore" : "merge"}-duplicates,return=minimal`) : null;

async function gravar(docs) {
  const completos = [], resumos = [], cancel = [], outros = [];
  for (const d of docs) {
    try {
      if (/^procCTe|^procCTeOS/i.test(d.schema)) { const x = lerCTe(d.xml); x ? completos.push(x) : outros.push(d.schema); }
      else if (/^resCTe/i.test(d.schema)) { const x = lerResumo(d.xml); x ? resumos.push(x) : outros.push(d.schema); }
      else if (/Evento/i.test(d.schema)) { const x = lerEvento(d.xml); x ? cancel.push(x.chave) : outros.push(d.schema); }
      else outros.push(d.schema);
    } catch (e) { outros.push(`${d.schema} (erro: ${e.message})`); }
  }
  const unico = (arr, k) => [...new Map(arr.map(x => [k(x), x])).values()];   // a mesma chave duas vezes no lote quebra o upsert
  await upsert("frete_cte", unico(completos.map(x => x.cte), c => c.chave), "chave");
  await upsert("frete_cte", unico(resumos.map(x => x.cte), c => c.chave), "chave", true);   // resumo nunca sobrescreve o completo
  await upsert("frete_cte_nfe", unico(completos.flatMap(x => x.nfes), n => n.chave_cte + n.chave_nfe), "chave_cte,chave_nfe", true);
  await upsert("frete_cte_componente", unico(completos.flatMap(x => x.componentes), c => c.chave + "|" + c.nome), "chave,nome");
  for (const chave of cancel) await rest("PATCH", `frete_cte?chave=eq.${chave}`, { cancelado: true }, "return=minimal");
  return { completos: completos.length, resumos: resumos.length, cancelados: cancel.length, outros };
}

async function importar(forcar) {
  const inicio = Date.now(), agora = () => new Date().toISOString();
  const [ctl] = await rest("GET", "frete_cte_controle?id=eq.1&select=*") || [];
  if (!ctl) throw new Error("Falta a tabela frete_cte_controle: rode o SQL 008 no Supabase do Hub.");
  if (!forcar && ctl.proxima_consulta && new Date(ctl.proxima_consulta) > new Date())
    return { pulou: true, motivo: `A SEFAZ só aceita nova consulta depois de ${ctl.proxima_consulta}`, ult_nsu: ctl.ult_nsu };
  let ult = ctl.ult_nsu, max = ctl.max_nsu, status = "", lidos = 0, chamadas = 0, proxima = null;
  const tot = { completos: 0, resumos: 0, cancelados: 0, outros: [] };
  while (Date.now() - inicio < LIMITE_MS) {
    const r = await lote(ult); chamadas++; status = `${r.cStat} ${r.xMotivo}`;
    if (r.cStat === "137") { proxima = new Date(Date.now() + 61 * 60e3).toISOString(); max = r.maxNSU || max; break; }   // nada novo: espera 1 h
    if (r.cStat !== "138") { proxima = new Date(Date.now() + 61 * 60e3).toISOString(); break; }                          // erro/consumo indevido: espera também
    const g = await gravar(r.docs);
    tot.completos += g.completos; tot.resumos += g.resumos; tot.cancelados += g.cancelados; tot.outros.push(...g.outros);
    lidos += r.docs.length; ult = r.ultNSU; max = r.maxNSU;
    await rest("PATCH", "frete_cte_controle?id=eq.1", { ult_nsu: ult, max_nsu: max, ultimo_status: status, ultima_execucao: agora(), documentos_lidos: Number(ctl.documentos_lidos || 0) + lidos }, "return=minimal");
    if (ult === max) { proxima = new Date(Date.now() + 61 * 60e3).toISOString(); break; }   // fila zerada: próxima em 1 h
  }
  await rest("PATCH", "frete_cte_controle?id=eq.1", { ult_nsu: ult, max_nsu: max, ultimo_status: status, ultima_execucao: agora(), proxima_consulta: proxima, documentos_lidos: Number(ctl.documentos_lidos || 0) + lidos }, "return=minimal");
  return { chamadas, documentos: lidos, ...tot, outros: tot.outros.length, ult_nsu: ult, max_nsu: max, falta: max && ult ? Number(max) - Number(ult) : null, status, proxima_consulta: proxima };
}

async function piloto(req) {
  const max = Math.min(Number(req.query?.max) || 100, 100);
  let ult = String(req.query?.nsu || "0").replace(/\D/g, "") || "0";
  const ctes = [], chamadas = [];
  for (let i = 0; i < 4 && ctes.length < max; i++) {
    const r = await lote(ult); chamadas.push({ cStat: r.cStat, xMotivo: r.xMotivo, ultNSU: r.ultNSU, maxNSU: r.maxNSU });
    if (r.cStat !== "138") break;
    for (const d of r.docs) { const x = /^procCTe/i.test(d.schema) ? lerCTe(d.xml) : /^resCTe/i.test(d.schema) ? lerResumo(d.xml) : null; if (x && ctes.length < max) ctes.push(x.cte); }
    ult = r.ultNSU; if (ult === r.maxNSU) break;
  }
  return { baixados: ctes.length, valor_frete_total: Math.round(ctes.reduce((s, c) => s + (c.valor_prestacao || 0), 0) * 100) / 100, proximo_nsu: ult, chamadas, ctes };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const acao = req.query?.acao;
  try {
    const cron = process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
    const eu = cron ? null : await quem(req).catch(() => null);
    const admin = eu && eu.paginas.includes("usuarios");
    if (acao === "importar") {
      if (!cron && !admin) return res.status(401).json({ erro: "sem acesso" });
      return res.json(await importar(admin && req.query?.forcar === "1"));
    }
    if (acao === "piloto") {
      if (!admin) return res.status(eu ? 403 : 401).json({ erro: eu ? "Só administradores." : "faça login no Hub" });
      return res.json(await piloto(req));
    }
    return res.status(404).json({ erro: "ação desconhecida" });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ erro: e.message });
  }
}
