// Faz as telas da Gestão de atletas (escritas para o supabase-js) conversarem com a ponte /api/gestao.
// O login é o do hub; nada da chave secreta chega ao navegador.
const GESTAO = (() => {
  const hub = window.supabase.createClient(HUB_CONFIG.SUPABASE_URL, HUB_CONFIG.SUPABASE_ANON_KEY);
  const publicas = {};   // path -> url pública do último upload

  async function token() { const { data } = await hub.auth.getSession(); return data.session && data.session.access_token; }
  function paraLogin() { location.href = 'login.html'; }

  async function chamar(corpo) {
    const t = await token();
    if (!t) { paraLogin(); return { data: null, error: { message: 'Sessão expirada. Entre de novo.' } }; }
    let r;
    try { r = await fetch('/api/gestao', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(corpo) }); }
    catch (e) { return { data: null, error: { message: 'Sem conexão com o servidor.' } }; }
    if (r.status === 401) { await hub.auth.signOut(); paraLogin(); return { data: null, error: { message: 'Sessão expirada.' } }; }
    let j; try { j = await r.json(); } catch (e) { j = { data: null, error: { message: 'Resposta inválida do servidor.' } }; }
    if (!r.ok && !j.error) j.error = { message: j.erro || ('Erro ' + r.status) };
    return j;
  }

  // sb.from('x').select().eq()... : cada chamada acumula e o await envia a cadeia inteira
  function cadeia(calls) {
    return new Proxy(function () {}, {
      get(_, prop) {
        if (prop === 'then') return (ok, ko) => chamar({ calls }).then(ok, ko);
        if (typeof prop === 'symbol') return undefined;
        return (...a) => cadeia(calls.concat([{ m: prop, a }]));
      },
    });
  }

  const sb = {
    from: t => cadeia([{ m: 'from', a: [t] }]),
    storage: { from: bucket => ({
      async upload(path, file, opts) {
        const buf = await file.arrayBuffer(); let bin = ''; const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        const r = await chamar({ storage: { bucket, path, base64: btoa(bin), contentType: file.type, upsert: !!(opts && opts.upsert) } });
        if (r.data && r.data.publicUrl) publicas[bucket + '/' + path] = r.data.publicUrl;
        return r;
      },
      getPublicUrl: path => ({ data: { publicUrl: publicas[bucket + '/' + path] || '' } }),
    }) },
  };

  async function invocar(nome, body) { return chamar({ fn: nome, body }); }

  // confere sessão e perfil do hub, ajusta o menu e devolve o usuário
  async function entrar(id) {
    const { data } = await hub.auth.getSession();
    const sess = data && data.session;
    if (!sess) { paraLogin(); return null; }
    const r = await fetch('/api/report', { headers: { Authorization: 'Bearer ' + sess.access_token } });
    if (r.status === 401) { await hub.auth.signOut(); paraLogin(); return null; }
    if (!r.ok) { document.getElementById('main').innerHTML = '<div class="empty-state">Não foi possível carregar agora. Tente novamente em instantes.</div>'; return null; }
    const { perfil } = await r.json();
    if (!perfil.paginas.includes(id[0] === '@' ? id.slice(1) : 'gestao-' + id)) { document.getElementById('main').innerHTML = '<div class="empty-state"><div class="big">🔒</div>Seu perfil não tem acesso a esta área.</div>'; return null; }
    document.querySelectorAll('.nav-btn[href]').forEach(a => { const p = a.getAttribute('href').replace('.html', ''); if (p !== 'home' && !perfil.paginas.includes(p)) a.style.display = 'none'; });
    document.querySelectorAll('.nav-area').forEach(cap => {
      const vis = [...document.querySelectorAll('.nav-btn[data-area="' + cap.dataset.areaCap + '"]')].some(x => x.style.display !== 'none');
      if (!vis) { cap.style.display = 'none'; if (cap.previousElementSibling) cap.previousElementSibling.style.display = 'none'; }
    });
    const nav = document.querySelector('.sidebar');
    if (nav && !nav.querySelector('.sidebar-footer')) nav.insertAdjacentHTML('beforeend', '<div class="sidebar-footer">' + perfil.nome + ' · ' + perfil.role + '<br><button onclick="GESTAO.sair()" style="background:none;border:none;color:rgba(255,255,255,.7);font-size:11px;cursor:pointer;text-decoration:underline;padding:0;margin-top:6px">Sair</button></div>');
    return { user: sess.user, perfil };
  }
  async function sair() { await hub.auth.signOut(); paraLogin(); }

  return { sb, invocar, entrar, sair };
})();
