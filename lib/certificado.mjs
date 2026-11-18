// Certificado digital A1 (.pfx) guardado nas variáveis da Vercel — nunca no repositório.
//   CERT_PFX_BASE64 → conteúdo do .pfx em base64
//   CERT_PFX_SENHA  → senha do certificado (tipo "Secret" na Vercel)
// Só roda no servidor (api/). Nunca devolva o certificado nem a senha numa resposta ou log.
// O .pfx é aberto com node-forge porque os A1 brasileiros costumam usar criptografia antiga (RC2/3DES)
// que o OpenSSL 3 do Node recusa ("Unsupported PKCS12 PFX data").
import https from "node:https";
import forge from "node-forge";

let cache;

export function certificado() {
  if (cache) return cache;
  const b64 = process.env.CERT_PFX_BASE64;
  const senha = process.env.CERT_PFX_SENHA;
  if (!b64 || !senha) throw new Error("Certificado não configurado na Vercel");
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(b64.replace(/\s/g, ""))), senha);
  } catch {
    throw new Error("Não foi possível abrir o certificado: confira a senha (CERT_PFX_SENHA) e o conteúdo (CERT_PFX_BASE64)");
  }
  const chaves = [...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
                  ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [])];
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  if (!chaves[0] || !certs.length) throw new Error("Certificado sem chave privada ou sem certificado");
  const key = forge.pki.privateKeyToPem(chaves[0].key);
  // o certificado da empresa (o que casa com a chave) primeiro, depois a cadeia
  const mod = chaves[0].key.n.toString(16);
  const ordem = [...certs].sort((a, b) => (b.cert.publicKey.n?.toString(16) === mod) - (a.cert.publicKey.n?.toString(16) === mod));
  const cert = ordem.map((c) => forge.pki.certificateToPem(c.cert)).join("");
  const validade = ordem[0].cert.validity.notAfter;
  cache = { key, cert, validade };
  return cache;
}

// Agente HTTPS com o certificado, para chamadas que exigem autenticação mútua (mTLS).
let agente;
export function agenteCertificado() {
  const { key, cert } = certificado();
  return (agente ??= new https.Agent({ key, cert, keepAlive: true }));
}
