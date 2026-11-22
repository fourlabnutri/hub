// Solicitações: chamado de manutenção (com fotos), pedido de materiais de uso e consumo e registros (com cadastro de materiais pela chefia).
// Uma página por aba (sol-manutencao, sol-materiais, sol-registros), definida por window.SOL_ABA. Back em /api/lab.
(async () => {
  const ABA = window.SOL_ABA || 'manut', PAG = window.SOL_PAGINA || 'sol-manutencao';
  let EU = null;
  if (typeof GESTAO !== 'undefined') { EU = await GESTAO.entrar('@' + PAG); if (!EU) return; }
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dt = iso => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const hub = window.supabase && window.HUB_CONFIG ? window.supabase.createClient(HUB_CONFIG.SUPABASE_URL, HUB_CONFIG.SUPABASE_ANON_KEY) : null;
  async function api(acao, corpo = {}) {
    const { data } = await hub.auth.getSession();
    if (!data.session) { location.href = 'login.html'; throw new Error('faça login'); }
    const r = await fetch('/api/lab', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token }, body: JSON.stringify({ acao, ...corpo }) });
    const j = await r.json().catch(() => ({ erro: 'resposta inválida' }));
    if (!r.ok) throw new Error(j.erro || 'erro ' + r.status);
    return j;
  }

  // ---------- abas ----------
  let aba = ABA, regAba = 'manut';
  $('#tit').textContent = { manut: 'Manutenção', mat: 'Materiais', reg: 'Registros' }[ABA];
  function irPara(a) {
    aba = a; ['manut', 'mat', 'reg', 'ok'].forEach(k => $('#s-' + k).hidden = k !== a);
    document.querySelectorAll('#abas button').forEach(b => b.classList.toggle('on', b.dataset.a === a));
    if (a === 'reg') carregarReg();
  }
  document.querySelectorAll('#abas button').forEach(b => b.onclick = () => irPara(b.dataset.a));
  const seg = (sel) => { document.querySelectorAll(sel + ' button').forEach(b => b.onclick = () => { document.querySelectorAll(sel + ' button').forEach(x => x.classList.toggle('on', x === b)); }); };
  seg('#mPrio'); seg('#pUrg');
  const val = sel => (document.querySelector(sel + ' button.on') || {}).dataset?.v;
  const erroEm = (el, m) => { el.textContent = m; el.hidden = !m; };

  // ---------- manutenção: fotos ----------
  const fotos = [];
  async function reduzir(file) {
    const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise(r => c.toBlob(b => r(b), 'image/jpeg', 0.82));
  }
  function desenharFotos() {
    $('#mFotos').innerHTML = fotos.map((f, i) => `<div class="ft"><img src="${f.url}" alt=""><button type="button" data-i="${i}" aria-label="Remover">×</button></div>`).join('')
      + (fotos.length < 8 ? '<label class="add-ft" for="mArq">+ foto</label>' : '');
    $('#mFotos').querySelectorAll('button').forEach(b => b.onclick = () => { URL.revokeObjectURL(fotos[b.dataset.i].url); fotos.splice(b.dataset.i, 1); desenharFotos(); });
  }
  $('#mArq').onchange = async e => {
    for (const f of e.target.files) { if (fotos.length >= 8) break; try { const blob = await reduzir(f); fotos.push({ blob, url: URL.createObjectURL(blob) }); } catch { } }
    e.target.value = ''; desenharFotos();
  };
  desenharFotos();

  $('#fManut').onsubmit = async e => {
    e.preventDefault(); const btn = $('#mEnviar'); erroEm($('#mErro'), '');
    const d = { local: $('#mLocal').value.trim(), item: $('#mItem').value.trim(), descricao: $('#mDesc').value.trim(), prioridade: val('#mPrio') };
    if (!d.local || !d.item || !d.descricao) return erroEm($('#mErro'), 'Preencha local, o que está com problema e a descrição.');
    btn.disabled = true;
    try {
      let paths = [];
      if (fotos.length) {
        btn.textContent = 'Enviando fotos…';
        const { fotos: urls } = await api('fotos', { qtd: fotos.length, exts: fotos.map(() => 'jpg') });
        for (let i = 0; i < urls.length; i++) {
          btn.textContent = `Enviando foto ${i + 1} de ${urls.length}…`;
          const u = await hub.storage.from('rnc-fotos').uploadToSignedUrl(urls[i].path, urls[i].token, fotos[i].blob, { contentType: 'image/jpeg' });
          if (u.error) throw new Error('Falha ao enviar a foto ' + (i + 1));
          paths.push(urls[i].path);
        }
      }
      btn.textContent = 'Salvando…';
      const r = await api('manutencao', { ...d, fotos: paths });
      fotos.splice(0).forEach(f => URL.revokeObjectURL(f.url)); desenharFotos(); $('#fManut').reset();
      sucesso(`Chamado #${r.numero} aberto`, `${esc(d.item)} · ${esc(d.local)}${paths.length ? ` · ${paths.length} foto(s)` : ''}`, 'manut');
    } catch (err) { erroEm($('#mErro'), err.message); }
    btn.disabled = false; btn.textContent = 'Abrir chamado';
  };

  // ---------- materiais ----------
  const PADRAO = { 'Material de escritório': ['Caneta esferográfica azul', 'Caneta esferográfica preta', 'Caneta marca-texto', 'Marca-texto', 'Caneta permanente (marcador)', 'Lápis', 'Borracha', 'Papel A4 (resma)', 'Bloco de notas / post-it', 'Fita adesiva transparente', 'Fita crepe', 'Fita dupla face', 'Etiquetas adesivas', 'Etiqueta de frágil', 'Etiqueta 10x15', 'Lacre de display (adesivo)', 'Grampos', 'Clipes', 'Pasta / arquivo', 'Pilhas AA', 'Pilhas AAA', 'Lâmpada'],
    'Material de limpeza': ['Álcool 70%', 'Detergente', 'Desinfetante', 'Água sanitária', 'Sabonete líquido', 'Papel toalha', 'Papel higiênico', 'Saco de lixo 100 L', 'Saco de lixo 50 L', 'Esponja', 'Pano de limpeza', 'Rodo', 'Vassoura'],
    'EPI': ['Luva nitrílica (caixa)', 'Luva de látex (caixa)', 'Máscara descartável', 'Máscara PFF2', 'Touca descartável', 'Óculos de proteção', 'Jaleco', 'Protetor auricular', 'Propé descartável', 'Avental', 'Bota de segurança'] };
  let CAT = Object.fromEntries(Object.entries(PADRAO).map(([c, l]) => [c, l.map(item => ({ item, unidade: 'un' }))]));
  if (hub) api('catalogo').then(j => { if (j.itens?.length) { CAT = {}; j.itens.forEach(x => (CAT[x.categoria] = CAT[x.categoria] || []).push(x)); desenharItens(); } }).catch(() => { });
  const linhas = [{ categoria: Object.keys(CAT)[0], item: '', outro: '', quantidade: 1 }];
  function desenharItens() {
    $('#pItens').innerHTML = linhas.map((l, i) => {
      const lista = CAT[l.categoria] || [], u = (lista.find(x => x.item === l.item) || {}).unidade;
      return `<div class="it" data-i="${i}">
        <label class="f">Categoria<select data-k="categoria">${Object.keys(CAT).map(c => `<option ${c === l.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="f">Item${l.item === '__outro' ? `<input data-k="outro" value="${esc(l.outro)}" placeholder="Qual item?" maxlength="120">` : `<select data-k="item"><option value="">Escolha…</option>${lista.map(x => `<option value="${esc(x.item)}" ${x.item === l.item ? 'selected' : ''}>${esc(x.item)}</option>`).join('')}<option value="__outro">Outro…</option></select>`}</label>
        <label class="f">Qtd${u && u !== 'un' ? ` (${esc(u)})` : ''}<input data-k="quantidade" type="number" inputmode="numeric" min="1" max="9999" value="${l.quantidade}"></label>
        <button type="button" class="rm" aria-label="Remover item" ${linhas.length < 2 ? 'disabled' : ''}>×</button></div>`;
    }).join('');
    $('#pItens').querySelectorAll('.it').forEach(el => {
      const l = linhas[el.dataset.i];
      el.querySelectorAll('[data-k]').forEach(inp => inp.onchange = inp.oninput = () => {
        const k = inp.dataset.k; l[k] = k === 'quantidade' ? inp.value : inp.value;
        if (k === 'categoria') { l.item = ''; desenharItens(); } else if (k === 'item' && inp.value === '__outro') { desenharItens(); el.parentNode.querySelector(`[data-i="${el.dataset.i}"] [data-k="outro"]`)?.focus(); }
      });
      el.querySelector('.rm').onclick = () => { linhas.splice(el.dataset.i, 1); desenharItens(); };
    });
  }
  $('#pAdd').onclick = () => { const ult = linhas[linhas.length - 1]; linhas.push({ categoria: ult ? ult.categoria : Object.keys(CAT)[0], item: '', outro: '', quantidade: 1 }); desenharItens(); };
  desenharItens();

  $('#fMat').onsubmit = async e => {
    e.preventDefault(); const btn = $('#pEnviar'); erroEm($('#pErro'), '');
    const setor = $('#pSetor').value.trim();
    const itens = linhas.map(l => ({ categoria: l.categoria, item: l.item === '__outro' ? l.outro.trim() : l.item, quantidade: parseInt(l.quantidade, 10) || 0 })).filter(x => x.item && x.quantidade > 0);
    if (!setor) return erroEm($('#pErro'), 'Informe o setor.');
    if (!itens.length) return erroEm($('#pErro'), 'Escolha pelo menos um item e a quantidade.');
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const r = await api('materiais', { setor, itens, urgencia: val('#pUrg'), observacao: $('#pObs').value.trim() });
      linhas.splice(0, linhas.length, { categoria: Object.keys(CAT)[0], item: '', outro: '', quantidade: 1 }); desenharItens(); $('#pObs').value = '';
      sucesso(`Solicitação #${r.numero} enviada`, itens.map(x => `${x.quantidade}× ${esc(x.item)}`).join(' · '), 'mat');
    } catch (err) { erroEm($('#pErro'), err.message); }
    btn.disabled = false; btn.textContent = 'Enviar solicitação';
  };

  // ---------- sucesso ----------
  let voltar = 'manut';
  function sucesso(tit, txt, de) { voltar = de; $('#okTit').textContent = '✓ ' + tit; $('#okTxt').innerHTML = txt; irPara('ok'); scrollTo(0, 0); }
  $('#okNovo').onclick = () => irPara(voltar);
  $('#okReg').onclick = () => { location.href = 'sol-registros.html'; };

  // ---------- registros ----------
  let REG = null, aberto = null;
  document.querySelectorAll('#regAbas button').forEach(b => b.onclick = () => { regAba = b.dataset.r; aberto = null; desenharReg(); });
  async function carregarReg() {
    if (!hub) { $('#regLista').innerHTML = '<div class="empty">Os registros aparecem no Hub ao vivo.</div>'; return; }
    try { REG = await api('listar'); desenharReg(); } catch (e) { $('#regLista').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }
  const PRIO = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' }, ST = { aberto: 'Aberto', em_andamento: 'Em andamento', resolvido: 'Resolvido', pendente: 'Pendente', comprado: 'Comprado', entregue: 'Entregue', cancelado: 'Cancelado' };
  function desenharReg() {
    document.querySelectorAll('#regAbas button').forEach(b => b.classList.toggle('on', b.dataset.r === regAba));
    if (!REG) return;
    const el = $('#regLista');
    if (regAba === 'manut') {
      el.innerHTML = `<div class="rl cab"><span>Nº</span><span>Problema</span><span>Aberto por</span><span>Prioridade</span><span>Situação</span></div>` + (REG.manutencao.map(r => `<div class="rl" data-id="${r.id}"><span><b>#${r.numero}</b></span><span><b>${esc(r.item)}</b><small>${esc(r.local)} · ${dt(r.created_at)}${r.fotos ? ` · ${r.fotos} foto(s)` : ''}</small></span><span>${esc(r.registrado_por_nome || '')}</span><span><span class="pill p-${r.prioridade}">${PRIO[r.prioridade]}</span></span><span><span class="pill s-${r.status}">${ST[r.status]}</span></span>${aberto === r.id ? `<div class="det" id="det">${esc(r.descricao)}<div class="gal" id="gal"></div></div>` : ''}</div>`).join('') || '<div class="empty">Nenhum chamado ainda.</div>');
    } else {
      el.innerHTML = `<div class="rl cab"><span>Nº</span><span>Itens</span><span>Pedido por</span><span>Urgência</span><span>Situação</span></div>` + (REG.materiais.map(r => `<div class="rl" data-id="${r.id}"><span><b>#${r.numero}</b></span><span><b>${r.itens.length} ${r.itens.length > 1 ? 'itens' : 'item'}</b><small>${esc(r.setor)} · ${dt(r.created_at)}</small></span><span>${esc(r.registrado_por_nome || '')}</span><span><span class="pill p-${r.urgencia}">${r.urgencia === 'urgente' ? 'Urgente' : 'Normal'}</span></span><span><span class="pill s-${r.status}">${ST[r.status]}</span></span>${aberto === r.id ? `<div class="det">${r.itens.map(x => `${x.quantidade} ${esc(x.unidade)} · ${esc(x.item)} <small>(${esc(x.categoria)})</small>`).join('\n')}${r.observacao ? '\n\n' + esc(r.observacao) : ''}</div>` : ''}</div>`).join('') || '<div class="empty">Nenhum pedido ainda.</div>');
    }
    el.querySelectorAll('.rl[data-id]').forEach(row => row.onclick = e => { if (e.target.closest('.det')) return; aberto = aberto === row.dataset.id ? null : row.dataset.id; desenharReg(); if (aberto && regAba === 'manut') fotosDe(aberto); });
  }
  async function fotosDe(id) {
    const r = REG.manutencao.find(x => x.id === id); if (!r || !r.fotos) return;
    try { const { fotos } = await api('fotosChamado', { id }); const g = $('#gal'); if (g) g.innerHTML = fotos.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="" loading="lazy"></a>`).join(''); } catch { }
  }

  // ---------- cadastro de materiais (só quem tem "sol-catalogo") ----------
  const podeCadastrar = !EU || EU.perfil.paginas.includes('sol-catalogo');
  let CATA = [];
  async function carregarCat() {
    if (!hub) { CATA = Object.entries(PADRAO).flatMap(([categoria, l]) => l.map(item => ({ categoria, item, unidade: 'un', ativo: true }))); return desenharCat(); }
    try { CATA = (await api('catalogoTodos')).itens; desenharCat(); } catch (e) { erroEm($('#cErro'), e.message); }
  }
  function desenharCat() {
    const g = {}; CATA.forEach(x => (g[x.categoria] = g[x.categoria] || []).push(x));
    $('#cCats').innerHTML = Object.keys(g).map(c => `<option value="${esc(c)}">`).join('');
    $('#catLista').innerHTML = Object.entries(g).map(([c, l]) => `<div class="cat-g"><h3>${esc(c)} · ${l.filter(x => x.ativo).length}</h3>${l.map(x => `<div class="cat-i ${x.ativo ? '' : 'off'}"><span>${esc(x.item)}<small>${esc(x.unidade)}</small></span><button type="button" data-c="${esc(c)}" data-i="${esc(x.item)}" data-u="${esc(x.unidade)}" data-a="${x.ativo ? 0 : 1}">${x.ativo ? 'Desativar' : 'Reativar'}</button></div>`).join('')}</div>`).join('');
    $('#catLista').querySelectorAll('button').forEach(b => b.onclick = () => salvarItem(b.dataset.c, b.dataset.i, b.dataset.u, b.dataset.a === '1'));
  }
  async function salvarItem(categoria, item, unidade, ativo) {
    erroEm($('#cErro'), '');
    if (!categoria || !item) return erroEm($('#cErro'), 'Informe a categoria e o item.');
    try { if (!hub) throw new Error('O cadastro funciona no Hub ao vivo.'); CATA = (await api('salvarItem', { categoria, item, unidade: unidade || 'un', ativo })).itens; desenharCat(); $('#cItem').value = ''; }
    catch (e) { erroEm($('#cErro'), e.message); }
  }
  $('#cAdd').onclick = () => salvarItem($('#cCat').value.trim(), $('#cItem').value.trim(), $('#cUn').value.trim(), true);

  irPara(ABA);
  if (ABA === 'reg' && podeCadastrar) { $('#catBox').hidden = false; carregarCat(); }
})();
