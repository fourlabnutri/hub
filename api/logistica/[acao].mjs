// /api/logistica/:acao — apoio ao monitor de atrasos (n8n do Jr).
//   POST rastreio-correios  { "codigos": ["AP576796852BR", ...] }  (até 50)
//   Consulta o SRO Rastro dos Correios com o contrato da FourLab (mesmas variáveis do gateway de frete:
//   CORREIOS_USUARIO, CORREIOS_CODIGO_ACESSO, CORREIOS_CARTAO) e devolve um item por código, com a situação classificada.
// Acesso: "Authorization: Bearer <CRON_SECRET>" (a mesma credencial "Gateway Frete" que o n8n já usa) ou admin logado no Hub.
import { quem } from "../_auth.js";

const API = "https://api.correios.com.br";
const MAX = 50, PAUSA_MS = 250;
let tok = null;   // token do cartão de postagem (vale ~24 h); fica em memória enquanto a função estiver quente

async function token() {
  if (tok && tok.ate > Date.now() + 60e3) return tok.valor;
  const { CORREIOS_USUARIO: u, CORREIOS_CODIGO_ACESSO: c, CORREIOS_CARTAO: cartao } = process.env;
  if (!u || !c || !cartao) throw new Error("Faltam CORREIOS_USUARIO, CORREIOS_CODIGO_ACESSO ou CORREIOS_CARTAO na Vercel.");
  const r = await fetch(`${API}/token/v1/autentica/cartaopostagem`, {
    method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${u}:${c}`).toString("base64"), "Content-Type": "application/json" },
    body: JSON.stringify({ numero: cartao }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw new Error(`Correios: falha no token (HTTP ${r.status}) ${(j.msgs || []).join("; ")}`.trim());
  tok = { valor: j.token, ate: j.expiraEm ? Date.parse(j.expiraEm) : Date.now() + 36e5 };
  return tok.valor;
}

const dormir = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Regra inicial (o Jr ajusta depois de ver as primeiras respostas reais)
export function classificar(ev) {
  if (!ev) return "sem_eventos";
  const cod = String(ev.codigo || "").toUpperCase(), st = String(ev.status || ""), d = norm(ev.descricao);
  if (cod === "LDI" || /aguardando retirada|disponivel para retirada/.test(d)) return "aguardando_retirada";
  if (/devolvid|nao entregue|endereco|ausente|recusad|extraviad|roubad|avariad|nao procurado/.test(d)) return /devolvid/.test(d) ? "devolucao" : "problema";
  if (["BDE", "BDI", "BDR"].includes(cod) && st === "01") return "entregue";
  if (/entregue ao destinatario/.test(d)) return "entregue";
  if (cod === "OEC" || /saiu para entrega/.test(d)) return "saiu_para_entrega";
  if (cod === "LDI" || /aguardando retirada|disponivel para retirada/.test(d)) return "aguardando_retirada";
  if (cod === "PO" || /postado/.test(d)) return "postado";
  if (["RO", "DO"].includes(cod) || /transito|encaminhado/.test(d)) return "em_transito";
  if (["BDE", "BDI", "BDR"].includes(cod)) return "problema";   // baixa com status diferente de 01
  return "em_transito";
}

function evento(e) {
  const end = (e.unidade && e.unidade.endereco) || {};
  return { data: e.dtHrCriado || null, descricao: [e.descricao, e.detalhe].filter(Boolean).join(" · ") || null, codigo: e.codigo || null,
    status: e.tipo != null ? String(e.tipo) : null, cidade: end.cidade || null, uf: end.uf || null };
}

async function rastrear(codigo, t) {
  try {
    const r = await fetch(`${API}/srorastro/v1/objetos/${encodeURIComponent(codigo)}?resultado=T`, { headers: { Authorization: `Bearer ${t}`, Accept: "application/json", "Accept-Language": "pt-BR" } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { codigo, ok: false, situacao: null, ultimo_evento: null, eventos: [], erro: `HTTP ${r.status} ${(j.msgs || []).join("; ")}`.trim() };
    const obj = (j.objetos || [])[0] || {};
    if (obj.mensagem && !(obj.eventos || []).length) return { codigo, ok: false, situacao: "sem_eventos", ultimo_evento: null, eventos: [], erro: obj.mensagem };
    const eventos = (obj.eventos || []).map(evento).sort((a, b) => String(b.data).localeCompare(String(a.data)));
    return { codigo, ok: true, situacao: classificar(eventos[0]), ultimo_evento: eventos[0] || null, eventos, erro: null };
  } catch (e) {
    return { codigo, ok: false, situacao: null, ultimo_evento: null, eventos: [], erro: e.message };
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const acao = req.query?.acao;
  try {
    const cron = process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
    if (!cron) { const eu = await quem(req).catch(() => null); if (!eu || !eu.paginas.includes("usuarios")) return res.status(401).json({ erro: "sem acesso" }); }
    if (acao !== "rastreio-correios") return res.status(404).json({ erro: "ação desconhecida" });
    if (req.method !== "POST") return res.status(405).json({ erro: "use POST" });
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const codigos = [...new Set((Array.isArray(b.codigos) ? b.codigos : []).map(c => String(c).trim().toUpperCase()).filter(c => /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(c)))];
    if (!codigos.length) return res.status(400).json({ erro: "Envie {\"codigos\": [\"AA123456789BR\", ...]}" });
    if (codigos.length > MAX) return res.status(400).json({ erro: `Máximo de ${MAX} códigos por chamada.` });
    const t = await token(), out = [];
    for (let i = 0; i < codigos.length; i++) { if (i) await dormir(PAUSA_MS); out.push(await rastrear(codigos[i], t)); }
    return res.status(200).json({ consultados: out.length, resultados: out });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ erro: e.message });
  }
}
