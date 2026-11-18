// /api/cte/piloto — teste piloto: baixa até 100 CT-e da SEFAZ (Distribuição DF-e) em que a FourLab é interessada.
// Usa o certificado A1 das variáveis CERT_PFX_BASE64 / CERT_PFX_SENHA (lib/certificado.mjs). Só lê; não grava nada.
// Acesso: só quem tem a página "usuarios" (administração).
// Parâmetros opcionais: ?nsu=<último NSU já lido> (padrão 0 = últimos 90 dias) &max=<até 100>
import https from "node:https";
import zlib from "node:zlib";
import { quem } from "../_auth.js";
import { agenteCertificado } from "../../lib/certificado.mjs";

const URL_WS = "https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx";
const CNPJ = process.env.CTE_CNPJ || "27794541000195";
const UF = "31"; // MG

function soap(ultNSU) {
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><cteDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe"><cteDadosMsg><distDFeInt versao="1.00" xmlns="http://www.portalfiscal.inf.br/cte"><tpAmb>1</tpAmb><cUFAutor>${UF}</cUFAutor><CNPJ>${CNPJ}</CNPJ><distNSU><ultNSU>${String(ultNSU).padStart(15, "0")}</ultNSU></distNSU></distDFeInt></cteDadosMsg></cteDistDFeInteresse></soap12:Body></soap12:Envelope>`;
}

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

const tag = (xml, t) => xml.match(new RegExp(`<(?:\\w+:)?${t}[^>]*>([^<]*)</(?:\\w+:)?${t}>`))?.[1] ?? null;
const bloco = (xml, t) => xml.match(new RegExp(`<(?:\\w+:)?${t}[\\s>][\\s\\S]*?</(?:\\w+:)?${t}>`))?.[0] ?? "";

function resumo(nsu, schema, xml) {
  const emit = bloco(xml, "emit"), rem = bloco(xml, "rem"), dest = bloco(xml, "dest");
  return {
    nsu, schema,
    chave: tag(xml, "chCTe") || xml.match(/Id="CTe(\d{44})"/)?.[1] || null,
    numero: tag(bloco(xml, "ide"), "nCT"), emissao: tag(xml, "dhEmi"),
    transportadora: tag(emit, "xNome"), cnpj_transportadora: tag(emit, "CNPJ"),
    origem: tag(xml, "xMunIni") && `${tag(xml, "xMunIni")}/${tag(xml, "UFIni")}`,
    destino: tag(xml, "xMunFim") && `${tag(xml, "xMunFim")}/${tag(xml, "UFFim")}`,
    remetente: tag(rem, "xNome"), destinatario: tag(dest, "xNome"),
    valor_frete: Number(tag(xml, "vTPrest")) || null,
    valor_carga: Number(tag(xml, "vCarga")) || null,
    status: tag(bloco(xml, "infProt"), "xMotivo"),
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const eu = await quem(req).catch(() => null);
  if (!eu) return res.status(401).json({ erro: "faça login no Hub" });
  if (!eu.paginas.includes("usuarios")) return res.status(403).json({ erro: "Só administradores." });

  const max = Math.min(Number(req.query?.max) || 100, 100);
  let ultNSU = String(req.query?.nsu || "0").replace(/\D/g, "") || "0";
  const ctes = [], outros = [], chamadas = [];
  try {
    for (let i = 0; i < 4 && ctes.length < max; i++) {
      const { status, xml } = await post(soap(ultNSU));
      const ret = bloco(xml, "retDistDFeInt");
      const cStat = tag(ret, "cStat"), xMotivo = tag(ret, "xMotivo");
      chamadas.push({ http: status, cStat, xMotivo, ultNSU: tag(ret, "ultNSU"), maxNSU: tag(ret, "maxNSU") });
      if (!ret) return res.status(502).json({ erro: "Resposta inesperada da SEFAZ", http: status, trecho: xml.slice(0, 400), chamadas });
      if (cStat !== "138") break; // 137 = nada novo (esperar 1 h antes de consultar de novo); outros = erro
      for (const m of ret.matchAll(/<docZip[^>]*NSU="(\d+)"[^>]*schema="([^"]+)"[^>]*>([^<]+)<\/docZip>/g)) {
        const doc = zlib.gunzipSync(Buffer.from(m[3], "base64")).toString("utf8");
        if (/^procCTe|^procCTeOS|^resCTe/i.test(m[2])) ctes.length < max && ctes.push(resumo(m[1], m[2], doc));
        else outros.push({ nsu: m[1], schema: m[2] });
      }
      ultNSU = tag(ret, "ultNSU");
      if (ultNSU === tag(ret, "maxNSU")) break;
    }
  } catch (e) {
    return res.status(502).json({ erro: e.message, chamadas });
  }
  const total = ctes.reduce((s, c) => s + (c.valor_frete || 0), 0);
  return res.json({ cnpj: CNPJ, baixados: ctes.length, eventos_e_outros: outros.length, valor_frete_total: Math.round(total * 100) / 100,
    proximo_nsu: ultNSU, chamadas, ctes, outros });
}
