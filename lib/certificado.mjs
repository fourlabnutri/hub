// Certificado digital A1 (.pfx) guardado nas variáveis da Vercel — nunca no repositório.
//   CERT_PFX_BASE64 → conteúdo do .pfx em base64
//   CERT_PFX_SENHA  → senha do certificado (marcar como "Sensitive" na Vercel)
// Só roda no servidor (api/). Nunca devolva o certificado nem a senha numa resposta ou log.
import https from "node:https";

let cache;

export function certificado() {
  if (cache) return cache;
  const b64 = process.env.CERT_PFX_BASE64;
  const senha = process.env.CERT_PFX_SENHA;
  if (!b64 || !senha) throw new Error("Certificado não configurado na Vercel");
  cache = { pfx: Buffer.from(b64.replace(/\s/g, ""), "base64"), passphrase: senha };
  return cache;
}

// Agente HTTPS com o certificado, para chamadas que exigem autenticação mútua (mTLS).
let agente;
export function agenteCertificado() {
  return (agente ??= new https.Agent({ ...certificado(), keepAlive: true }));
}
