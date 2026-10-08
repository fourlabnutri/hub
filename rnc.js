// RNC de recebimento: formulário (celular primeiro), registros e códigos de avaria. Fala com /api/rnc.
(async () => {
  const sb = window.supabase.createClient(HUB_CONFIG.SUPABASE_URL, HUB_CONFIG.SUPABASE_ANON_KEY);
  const u = await GESTAO.entrar('@rnc');
  if (!u) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dBR = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
  const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const nRNC = n => 'RNC-' + String(n).padStart(4, '0');

  async function api(acao, corpo) {
    const { data } = await sb.auth.getSession();
    const r = await fetch('/api/rnc', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token }, body: JSON.stringify({ acao, ...corpo }) });
    const j = await r.json().catch(() => ({ erro: 'Resposta inválida do servidor.' }));
    if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
    return j;
  }

  // ---- abas ----
  let aba = 'nova';
  function mostrar(v) {
    aba = v;
    ['nova', 'lista', 'detalhe', 'codigos'].forEach(x => { $('#v-' + x).hidden = x !== v; });
    document.querySelectorAll('.r-tab').forEach(t => t.classList.toggle('on', t.dataset.v === (v === 'detalhe' ? 'lista' : v)));
    if (v === 'lista') carregarLista();
    if (v === 'codigos') carregarCodigos();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.r-tab').forEach(t => t.onclick = () => mostrar(t.dataset.v));

  // ---- formulário ----
  const fotos = [];   // { blob, ext, url }
  $('#data').value = hoje();
  async function carregarOpcoes() {
    try {
      const o = await api('opcoes', {}), atual = $('#codigo_avaria').value;
      $('#codigo_avaria').innerHTML = '<option value="">Escolha…</option>' + o.codigos.map(c => `<option value="${esc(c.codigo)}">${esc(c.codigo)} - ${esc(c.descricao)}</option>`).join('');
      $('#codigo_avaria').value = atual;
      if (o.codigosAdmin) $('#tabCodigos').hidden = false;
    } catch (e) { mostrarErro(e.message); }
  }
  await carregarOpcoes();

  function mostrarErro(m) { const e = $('#erro'); e.textContent = m; e.style.display = m ? 'block' : 'none'; if (m) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); }

  async function reduzir(file) {   // foto do celular tem vários MB: reduz para ~1600 px antes de enviar
    try {
      const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
      if (blob) return { blob, ext: 'jpg' };
    } catch (e) { /* formato que o navegador não lê (ex.: HEIC no Chrome): envia o original */ }
    return { blob: file, ext: ((file.name || '').split('.').pop() || 'jpg').toLowerCase() };
  }
  function desenharFotos() {
    $('#fotos').innerHTML = fotos.map((f, i) => `<div class="r-foto"><img src="${f.url}" alt=""><button type="button" data-i="${i}" aria-label="Remover foto">×</button></div>`).join('');
    $('#fotos').querySelectorAll('button').forEach(b => b.onclick = () => { URL.revokeObjectURL(fotos[b.dataset.i].url); fotos.splice(b.dataset.i, 1); desenharFotos(); });
  }
  async function addFotos(lista) {
    for (const file of lista) {
      if (fotos.length >= 8) { mostrarErro('O limite é de 8 fotos por RNC.'); break; }
      const r = await reduzir(file); fotos.push({ ...r, url: URL.createObjectURL(r.blob) });
    }
    desenharFotos();
  }
  $('#btCamera').onclick = () => $('#inCamera').click();
  $('#btGaleria').onclick = () => $('#inGaleria').click();
  $('#inCamera').onchange = async e => { await addFotos([...e.target.files]); e.target.value = ''; };
  $('#inGaleria').onchange = async e => { await addFotos([...e.target.files]); e.target.value = ''; };

  $('#form').onsubmit = async ev => {
    ev.preventDefault(); mostrarErro('');
    const v = id => $('#' + id).value.trim();
    const obrig = [['nf', 'o número da NF'], ['transportadora', 'a transportadora'], ['fornecedor', 'o nome do fornecedor'], ['item_nome', 'o nome do item'], ['item_codigo', 'o código do item'], ['codigo_avaria', 'o código da avaria'], ['descricao', 'a descrição da avaria']];
    for (const [id, nome] of obrig) if (!v(id)) { mostrarErro('Preencha ' + nome + '.'); $('#' + id).focus(); return; }
    if (!v('data')) { mostrarErro('Informe a data de recebimento.'); return; }
    const btn = $('#enviar'); btn.disabled = true; const rotulo = btn.textContent;
    try {
      let paths = [];
      if (fotos.length) {
        btn.textContent = 'Preparando fotos…';
        const { fotos: slots } = await api('fotos', { qtd: fotos.length, exts: fotos.map(f => f.ext) });
        for (let i = 0; i < slots.length; i++) {
          btn.textContent = `Enviando foto ${i + 1} de ${slots.length}…`;
          const up = await sb.storage.from('rnc-fotos').uploadToSignedUrl(slots[i].path, slots[i].token, fotos[i].blob, { contentType: fotos[i].blob.type || 'image/jpeg' });
          if (up.error) throw new Error('Não consegui enviar a foto ' + (i + 1) + ': ' + up.error.message);
          paths.push(slots[i].path);
        }
      }
      btn.textContent = 'Salvando…';
      const r = await api('criar', { nf: v('nf'), transportadora: v('transportadora'), data_recebimento: v('data'), fornecedor: v('fornecedor'), item_nome: v('item_nome'), item_codigo: v('item_codigo'), codigo_avaria: v('codigo_avaria'), descricao: v('descricao'), fotos: paths });
      sucesso(r.numero);
    } catch (e) { mostrarErro(e.message); }
    btn.disabled = false; btn.textContent = rotulo;
  };

  function sucesso(numero) {
    $('#form').hidden = true;
    const ok = $('#ok'); ok.hidden = false;
    ok.innerHTML = `<h2>✔ ${nRNC(numero)} registrada</h2><div>O registro foi salvo com ${fotos.length} foto(s).</div>
      <div class="r-btns"><button class="r-btn main" id="outra">Registrar outra avaria da mesma NF</button><button class="r-btn sec" id="nova">Nova RNC</button></div>`;
    const limpar = manter => {
      ['nf', 'transportadora', 'fornecedor'].forEach(id => { if (!manter) $('#' + id).value = ''; });
      ['item_nome', 'item_codigo', 'descricao'].forEach(id => $('#' + id).value = '');
      $('#codigo_avaria').value = ''; if (!manter) $('#data').value = hoje();
      fotos.splice(0).forEach(f => URL.revokeObjectURL(f.url)); desenharFotos();
      ok.hidden = true; $('#form').hidden = false; mostrarErro(''); window.scrollTo(0, 0);
    };
    $('#outra').onclick = () => limpar(true); $('#nova').onclick = () => limpar(false);
    window.scrollTo(0, 0);
  }

  // ---- registros ----
  let registros = [];
  async function carregarLista() {
    $('#lista').innerHTML = '<tr><td colspan="7" style="padding:18px">Carregando…</td></tr>';
    try { registros = (await api('listar', {})).registros; desenharLista(); }
    catch (e) { $('#lista').innerHTML = `<tr><td colspan="7" style="padding:18px">${esc(e.message)}</td></tr>`; }
  }
  function desenharLista() {
    const q = $('#busca').value.trim().toLowerCase();
    const L = registros.filter(r => !q || [nRNC(r.numero), r.nf, r.fornecedor, r.item_nome, r.item_codigo, r.transportadora, r.codigo_avaria, r.avaria_descricao].join(' ').toLowerCase().includes(q));
    $('#lista').innerHTML = L.length ? L.map(r => `<tr class="lk" data-id="${r.id}"><td data-l="Nº"><b>${nRNC(r.numero)}</b></td><td data-l="Recebimento">${dBR(r.data_recebimento)}</td><td data-l="NF">${esc(r.nf)}</td><td data-l="Fornecedor">${esc(r.fornecedor)}</td><td data-l="Item">${esc(r.item_nome)} <span style="opacity:.55">(${esc(r.item_codigo)})</span></td><td data-l="Avaria"><span class="r-pill">${esc(r.codigo_avaria)} · ${esc(r.avaria_descricao)}</span></td><td data-l="Fotos">${r.fotos}</td></tr>`).join('')
      : '<tr><td colspan="7" style="padding:18px">Nenhuma RNC encontrada.</td></tr>';
    $('#lista').querySelectorAll('tr.lk').forEach(tr => tr.onclick = () => abrirDetalhe(tr.dataset.id));
  }
  $('#busca').oninput = desenharLista;
  $('#btCsv').onclick = () => {
    const cab = ['RNC', 'Recebimento', 'NF', 'Transportadora', 'Fornecedor', 'Item', 'Código do item', 'Código da avaria', 'Avaria', 'Fotos', 'Registrado por', 'Registrado em'];
    const linhas = registros.map(r => [nRNC(r.numero), dBR(r.data_recebimento), r.nf, r.transportadora, r.fornecedor, r.item_nome, r.item_codigo, r.codigo_avaria, r.avaria_descricao, r.fotos, r.registrado_por, new Date(r.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })]);
    const csv = '﻿' + [cab, ...linhas].map(l => l.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'rnc_recebimento_' + hoje() + '.csv'; a.click();
  };
  async function abrirDetalhe(id) {
    mostrar('detalhe'); $('#detalhe').innerHTML = 'Carregando…';
    try {
      const r = (await api('detalhe', { id })).registro;
      $('#detalhe').innerHTML = `<div class="r-btns no-print" style="margin-bottom:16px"><button class="r-btn sec" id="volta">← Voltar</button><button class="r-btn sec" onclick="window.print()">Imprimir / PDF</button></div>
        <h2 style="margin-bottom:12px">${nRNC(r.numero)}</h2>
        <dl><dt>Data de recebimento</dt><dd>${dBR(r.data_recebimento)}</dd><dt>Número da NF</dt><dd>${esc(r.nf)}</dd><dt>Transportadora</dt><dd>${esc(r.transportadora)}</dd><dt>Fornecedor</dt><dd>${esc(r.fornecedor)}</dd>
        <dt>Item</dt><dd>${esc(r.item_nome)} (código ${esc(r.item_codigo)})</dd><dt>Código da avaria</dt><dd>${esc(r.codigo_avaria)} - ${esc(r.avaria_descricao)}</dd><dt>Descrição</dt><dd>${esc(r.descricao)}</dd>
        <dt>Registrado por</dt><dd>${esc(r.registrado_por)} em ${new Date(r.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</dd></dl>
        <h3 style="margin:18px 0 6px">Fotos (${r.fotos.length})</h3>${r.fotos.length ? '<div class="r-galeria">' + r.fotos.map(f => `<a href="${esc(f)}" target="_blank" rel="noopener"><img src="${esc(f)}" alt="Foto da avaria" loading="lazy"></a>`).join('') + '</div>' : '<div style="opacity:.6">Sem fotos.</div>'}`;
      $('#volta').onclick = () => mostrar('lista');
    } catch (e) { $('#detalhe').innerHTML = `<div class="r-btns no-print"><button class="r-btn sec" id="volta">← Voltar</button></div><p style="margin-top:12px">${esc(e.message)}</p>`; $('#volta').onclick = () => mostrar('lista'); }
  }

  // ---- códigos de avaria ----
  async function carregarCodigos(corpo) {
    try {
      const j = await api(corpo ? 'salvarCodigo' : 'codigos', corpo || {});
      if (corpo) carregarOpcoes();   // a lista do formulário acompanha
      $('#codigos').innerHTML = j.codigos.map(c => `<div class="r-cod" data-c="${esc(c.codigo)}"><b>${esc(c.codigo)}</b><input type="text" value="${esc(c.descricao)}" class="d"><label class="ac" style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" class="a" ${c.ativo ? 'checked' : ''}> Ativo</label><div class="ac"><button class="r-btn sec s">Salvar</button></div></div>`).join('');
      $('#codigos').querySelectorAll('.r-cod').forEach(el => el.querySelector('.s').onclick = async () => {
        try { await carregarCodigos({ codigo: el.dataset.c, descricao: el.querySelector('.d').value, ativo: el.querySelector('.a').checked }); $('#erroCod').style.display = 'none'; }
        catch (e) { $('#erroCod').textContent = e.message; $('#erroCod').style.display = 'block'; }
      });
    } catch (e) { if (corpo) throw e; $('#codigos').textContent = e.message; }
  }
  $('#ncAdd').onclick = async () => {
    try { await carregarCodigos({ codigo: $('#ncCod').value, descricao: $('#ncDesc').value, ativo: true }); $('#ncCod').value = ''; $('#ncDesc').value = ''; $('#erroCod').style.display = 'none'; }
    catch (e) { $('#erroCod').textContent = e.message; $('#erroCod').style.display = 'block'; }
  };
  // códigos novos entram na lista do formulário na próxima abertura
})();
