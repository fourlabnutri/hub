// Consulta de RNC: histórico das RNCs de recebimento e de pedidos num lugar só (só leitura). Fala com /api/rnc, tipo 'todos'.
(async () => {
  const u = await GESTAO.entrar('@rnc-consulta');
  if (!u) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dBR = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
  const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const quando = iso => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const nRNC = r => 'RNC-' + String(r.numero).padStart(4, '0');
  const TIPO = { recebimento: 'Recebimento', pedidos: 'Pedido' };
  const produto = r => r.tipo === 'pedidos' ? r.produto_nome : r.item_nome;
  const sb = window.supabase.createClient(HUB_CONFIG.SUPABASE_URL, HUB_CONFIG.SUPABASE_ANON_KEY);
  async function api(corpo) {
    const { data } = await sb.auth.getSession();
    const r = await fetch('/api/rnc', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token }, body: JSON.stringify({ tipo: 'todos', ...corpo }) });
    const j = await r.json().catch(() => ({ erro: 'Resposta inválida do servidor.' }));
    if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
    return j;
  }

  const S = { tipo: '', avaria: '', transp: '', ini: '', fim: '' };
  let todos = [];
  function filtrados() {
    const q = $('#busca').value.trim().toLowerCase();
    return todos.filter(r => (!S.tipo || r.tipo === S.tipo) && (!S.avaria || r.avaria_descricao === S.avaria) && (!S.transp || r.transportadora === S.transp)
      && (!S.ini || r.data_recebimento >= S.ini) && (!S.fim || r.data_recebimento <= S.fim)
      && (!q || [nRNC(r), r.nf, r.rastreio, r.transportadora, r.produto_nome, r.codigo_barras, r.fornecedor, r.item_nome, r.item_codigo, r.avaria_descricao, r.descricao, r.observacao].join(' ').toLowerCase().includes(q)));
  }
  const contar = (l, f) => { const m = {}; l.forEach(r => { const k = f(r) || '—'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  function desenhar() {
    const L = filtrados(), d30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const av = contar(L, r => r.avaria_descricao)[0], tr = contar(L, r => r.transportadora)[0];
    $('#kpis').innerHTML = `<div class="c-kpi"><div class="l">RNCs no filtro</div><div class="v">${L.length}</div><div class="f">${L.filter(r => r.tipo === 'recebimento').length} de recebimento · ${L.filter(r => r.tipo === 'pedidos').length} de pedidos</div></div>
      <div class="c-kpi"><div class="l">Últimos 30 dias</div><div class="v">${L.filter(r => r.data_recebimento >= d30).length}</div><div class="f">pela data de recebimento</div></div>
      <div class="c-kpi"><div class="l">Avaria mais comum</div><div class="v" style="font-size:18px">${av ? esc(av[0]) : '—'}</div><div class="f">${av ? av[1] + ' RNC' + (av[1] > 1 ? 's' : '') : ''}</div></div>
      <div class="c-kpi"><div class="l">Transportadora com mais RNCs</div><div class="v" style="font-size:18px">${tr ? esc(tr[0]) : '—'}</div><div class="f">${tr ? tr[1] + ' RNC' + (tr[1] > 1 ? 's' : '') : ''}</div></div>`;
    $('#lista').innerHTML = L.length ? L.map(r => `<tr class="lk" data-id="${r.id}"><td data-l="Nº"><b>${nRNC(r)}</b></td><td data-l="Tipo"><span class="tp ${r.tipo}">${TIPO[r.tipo]}</span></td><td data-l="Recebimento">${dBR(r.data_recebimento)}</td><td data-l="NF">${esc(r.nf)}</td>
      <td data-l="Produto ou item">${esc(produto(r))}${r.tipo === 'pedidos' && r.rastreio ? `<div class="st">rastreio ${esc(r.rastreio)}</div>` : r.fornecedor ? `<div class="st">${esc(r.fornecedor)}</div>` : ''}</td><td data-l="Transportadora">${esc(r.transportadora)}</td>
      <td data-l="Avaria"><span class="r-pill">${esc(r.codigo_avaria)} · ${esc(r.avaria_descricao)}</span></td><td data-l="Fotos">${r.fotos}</td></tr>`).join('')
      : '<tr><td colspan="8" style="padding:18px">Nenhuma RNC encontrada.</td></tr>';
    $('#lista').querySelectorAll('tr.lk').forEach(tr => tr.onclick = () => abrir(tr.dataset.id));
  }
  function opcoes(id, valores, rotulo) { $(id).innerHTML = `<option value="">${rotulo}</option>` + [...new Set(valores.filter(Boolean))].sort().map(v => `<option>${esc(v)}</option>`).join(''); }

  async function carregar() {
    $('#lista').innerHTML = '<tr><td colspan="8" style="padding:18px">Carregando…</td></tr>';
    try {
      todos = (await api({ acao: 'listar' })).registros;
      opcoes('#fAvaria', todos.map(r => r.avaria_descricao), 'Todas as avarias');
      opcoes('#fTransp', todos.map(r => r.transportadora), 'Todas as transportadoras');
      desenhar();
    } catch (e) { $('#lista').innerHTML = `<tr><td colspan="8" style="padding:18px">${esc(e.message)}</td></tr>`; }
  }
  document.querySelectorAll('#tipos .r-tab').forEach(t => t.onclick = () => { S.tipo = t.dataset.t; document.querySelectorAll('#tipos .r-tab').forEach(x => x.classList.toggle('on', x === t)); desenhar(); });
  $('#fAvaria').onchange = e => { S.avaria = e.target.value; desenhar(); };
  $('#fTransp').onchange = e => { S.transp = e.target.value; desenhar(); };
  $('#fIni').onchange = e => { S.ini = e.target.value; desenhar(); };
  $('#fFim').onchange = e => { S.fim = e.target.value; desenhar(); };
  $('#busca').oninput = desenhar;
  $('#btCsv').onclick = () => {
    const cab = ['RNC', 'Tipo', 'Recebimento', 'NF', 'Rastreio', 'Transportadora', 'Produto ou item', 'Código de barras ou do item', 'Fornecedor', 'Código da avaria', 'Avaria', 'Descrição', 'Observação', 'Fotos', 'Registrado por', 'Registrado em'];
    const linhas = filtrados().map(r => [nRNC(r), TIPO[r.tipo], dBR(r.data_recebimento), r.nf, r.rastreio, r.transportadora, produto(r), r.tipo === 'pedidos' ? r.codigo_barras : r.item_codigo, r.fornecedor, r.codigo_avaria, r.avaria_descricao, r.descricao, r.observacao, r.fotos, r.registrado_por, quando(r.created_at)]);
    const csv = '﻿' + [cab, ...linhas].map(l => l.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'rnc_consulta_' + hoje() + '.csv'; a.click();
  };

  function mostrar(det) { $('#v-lista').hidden = det; $('#v-detalhe').hidden = !det; window.scrollTo(0, 0); }
  async function abrir(id) {
    mostrar(true); $('#detalhe').innerHTML = 'Carregando…';
    const voltar = '<div class="r-btns no-print" style="margin-bottom:16px"><button class="r-btn sec" id="volta">← Voltar</button><button class="r-btn sec" onclick="window.print()">Imprimir / PDF</button></div>';
    try {
      const r = (await api({ acao: 'detalhe', id })).registro;
      const linha = (l, v) => v ? `<dt>${l}</dt><dd>${v}</dd>` : '';
      const campos = r.tipo === 'pedidos'
        ? linha('Data do recebimento (cliente)', dBR(r.data_recebimento)) + linha('Número da NF', esc(r.nf)) + linha('Código de rastreio', esc(r.rastreio)) + linha('Transportadora', esc(r.transportadora)) + linha('Produto', esc(r.produto_nome)) + linha('Código de barras', esc(r.codigo_barras))
        : linha('Data de recebimento', dBR(r.data_recebimento)) + linha('Número da NF', esc(r.nf)) + linha('Transportadora', esc(r.transportadora)) + linha('Fornecedor', esc(r.fornecedor)) + linha('Item', esc(r.item_nome)) + linha('Código do item', esc(r.item_codigo));
      $('#detalhe').innerHTML = voltar + `<h2 style="margin-bottom:4px">${nRNC(r)} <span class="tp ${r.tipo}" style="vertical-align:middle">${TIPO[r.tipo]}</span></h2><div class="st" style="margin-bottom:14px">Situação: ${esc((r.status || 'aberta').replace('_', ' '))}</div>
        <dl>${campos}${linha('Código da avaria', esc(r.codigo_avaria) + ' - ' + esc(r.avaria_descricao))}${linha('Descrição', esc(r.descricao))}${linha('Observação', esc(r.observacao))}${linha('Registrado por', esc(r.registrado_por) + ' em ' + quando(r.created_at))}</dl>
        <h3 style="margin:18px 0 6px">Fotos (${r.fotos.length})</h3>${r.fotos.length ? '<div class="r-galeria">' + r.fotos.map(f => `<a href="${esc(f)}" target="_blank" rel="noopener"><img src="${esc(f)}" alt="Foto da avaria" loading="lazy"></a>`).join('') + '</div>' : '<div style="opacity:.6">Sem fotos.</div>'}`;
    } catch (e) { $('#detalhe').innerHTML = voltar + `<p>${esc(e.message)}</p>`; }
    $('#volta').onclick = () => mostrar(false);
  }
  await carregar();
})();
