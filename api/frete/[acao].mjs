// /api/frete/:acao — cotação de frete (gateway do Junior em lib/frete-gateway.mjs, gerado no projeto fourlab-frete; não editar lá).
// Antes de entrar no gateway, confere login e a página "frete" pelo mesmo _auth.js das outras APIs do hub.
// Por isso o gateway roda sem HUB_ORIGEM (não precisa chamar /api/report de novo) e usa a chave service já cadastrada no Vercel.
import { handlerVercel } from "../../lib/frete-gateway.mjs";
import { quem } from "../_auth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const env = { ...process.env, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY, HUB_ORIGEM: "" };
  // cotação automática (cron/N8N): não tem login do hub; o gateway exige o Bearer CRON_SECRET
  if (req.query?.acao === "auto") return handlerVercel(req, res, env);
  const eu = await quem(req).catch(() => null);
  if (!eu) return res.status(401).json({ erro: "faça login no Hub" });
  if (!eu.paginas.includes("frete")) return res.status(403).json({ erro: "Seu perfil não tem acesso a esta área." });
  return handlerVercel(req, res, env);
}
