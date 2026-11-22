// Monitor de atrasos de entrega · painel BI (só leitura). Dados: /api/atrasos (schema logistica do Jr).
(async () => {
  if (typeof GESTAO !== 'undefined' && !(await GESTAO.entrar('@atrasos'))) return;
  const hub = window.supabase && window.HUB_CONFIG ? window.supabase.createClient(HUB_CONFIG.SUPABASE_URL, HUB_CONFIG.SUPABASE_ANON_KEY) : null;
  async function api(acao, corpo = {}) {
    const { data } = await hub.auth.getSession();
    const r = await fetch('/api/atrasos', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token }, body: JSON.stringify({ acao, ...corpo }) });
    const j = await r.json().catch(() => ({ erro: 'resposta inválida' })); if (!r.ok) throw new Error(j.erro || 'erro ' + r.status); return j;
  }
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const BRL = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const kC = v => v >= 1e6 ? 'R$ ' + (v / 1e6).toFixed(1).replace('.', ',') + ' mi' : v >= 1e3 ? 'R$ ' + Math.round(v / 1e3) + ' mil' : 'R$ ' + Math.round(v || 0);
  const kv = v => { const [i, c] = (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(','); return `<small>R$</small>${i}<span style="opacity:.45">,${c}</span>`; };
  const dBR = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
  const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const dias = (a, b) => Math.round((Date.parse(String(a).slice(0, 10)) - Date.parse(String(b).slice(0, 10))) / 864e5);
  const NM = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const titulo = s => String(s || '').toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase());
  const rot = s => s ? titulo(String(s).replace(/_/g, ' ')) : '—';

  // ---------- gráficos ----------
  function gauge(pct) { const N = 22, on = Math.round(Math.min(100, pct) / 100 * N), cx = 110, cy = 104; let seg = '';
    for (let i = 0; i < N; i++) { const a = Math.PI * (1 - i / (N - 1)), c = Math.cos(a), s = Math.sin(a);
      seg += `<line x1="${cx + c * 76}" y1="${cy - s * 76}" x2="${cx + c * 96}" y2="${cy - s * 96}" stroke="${i < on ? 'var(--orange)' : 'rgba(26,19,21,.09)'}" stroke-width="9" stroke-linecap="round"/>`; }
    return `<svg class="gauge" viewBox="0 0 220 112">${seg}<text x="110" y="104" text-anchor="middle">${pct.toFixed(0)}%</text></svg>`; }
  function colunas(rows) { const max = Math.max(1, ...rows.map(r => r.v));
    return `<div class="cols">${rows.map(r => `<div class="col ${r.v === max && r.v > 0 ? 'top' : ''}"><div class="bar" style="height:${Math.max(4, r.v / max * 100)}%"><em>${r.fmt ?? r.v}</em></div><div class="m">${esc(r.l)}</div></div>`).join('')}</div>`; }
  function colsStack(rows) { const max = Math.max(1, ...rows.map(r => r.a + r.b));
    return `<div class="cols cols-st">${rows.map(r => { const t = r.a + r.b; return `<div class="col" title="${esc(r.l)}: ${r.a} abertos · ${r.b} encerrados"><div class="stk" style="height:${Math.max(3, t / max * 100)}%"><em>${t || ''}</em>${r.b ? `<i class="b" style="flex:${r.b}"></i>` : ''}${r.a ? `<i class="a" style="flex:${r.a}"></i>` : ''}</div><div class="m">${esc(r.l)}</div></div>`; }).join('')}</div>`; }
  function donut(parts) { const tot = parts.reduce((s, p) => s + p.v, 0) || 1, C = 2 * Math.PI * 42; let off = 0;
    const arcs = parts.map(p => { const len = p.v / tot * C, d = `<circle cx="60" cy="60" r="42" fill="none" stroke="${p.c}" stroke-width="16" stroke-dasharray="${Math.max(0, len - 3)} ${C}" stroke-dashoffset="${-off}" stroke-linecap="round" transform="rotate(-90 60 60)"/>`; off += len; return d; }).join('');
    return `<div class="donut"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="42" fill="none" stroke="rgba(26,19,21,.06)" stroke-width="16"/>${arcs}</svg><div class="dl">${parts.map(p => `<div><i style="background:${p.c}"></i><span>${esc(p.l)}</span><b>${p.v}</b><small>${Math.round(p.v / tot * 100)}%</small></div>`).join('')}</div></div>`; }
  const rank = (rows, fmt) => { const max = Math.max(1, ...rows.map(r => r.v)); return `<div class="rank">${rows.map((r, i) => `<div class="rk"><span class="ic2">${i + 1}</span><div class="nmr"><b title="${esc(r.l)}">${esc(r.l)}</b><div class="tr2"><i style="width:${r.v / max * 100}%"></i></div></div><div class="vr">${fmt(r)}</div></div>`).join('') || '<div class="empty">Sem dados.</div>'}</div>`; };
  const diasHtml = d => `<span class="dias ${d <= 0 ? 'd0' : d <= 3 ? 'd1' : d <= 10 ? 'd2' : 'd3'}">${d > 0 ? d + ' d' : 'no prazo'}</span>`;
  const CH = { mes: '6', tr: 'n', fx: 'n' };
  const chips = (k, ops) => `<div class="chips-f no-print">${ops.map(([id, l]) => `<button class="${CH[k] === id ? 'on' : ''}" data-ch="${k}" data-v="${id}">${l}</button>`).join('')}</div>`;

  // ---------- dados ----------
  let CASOS = [], erroCarga = '';
  const S = { view: 'painel', aba: 'abertos', q: '', tr: 'todas', pag: 25 };
  const aberto = c => !c.encerrado_em;
  function prep(c) { const fim = c.encerrado_em ? String(c.encerrado_em).slice(0, 10) : HOJE; return { ...c, dias: c.prazo_data ? dias(fim, c.prazo_data) : 0, valor: Number(c.valor_pedido) || 0, reemb: Number(c.reembolso_valor) || 0 }; }

  function filtrados() {
    const q = S.q.trim().toLowerCase();
    return CASOS.filter(c => (S.tr === 'todas' || c.transportadora === S.tr) && (!q || [c.pedido_numero, c.nf_numero, c.cliente, c.codigo_rastreio, c.municipio].some(x => String(x || '').toLowerCase().includes(q))));
  }

  function painel(L) {
    const ab = L.filter(aberto), enc = L.filter(c => !aberto(c));
    const valAb = ab.reduce((s, c) => s + c.valor, 0), medio = ab.length ? ab.reduce((s, c) => s + Math.max(0, c.dias), 0) / ab.length : 0;
    const comTicket = ab.filter(c => c.ticket_numero).length;
    const reemb = L.reduce((s, c) => s + c.reemb, 0);
    const res = enc.filter(c => c.detectado_em && c.encerrado_em), tRes = res.length ? res.reduce((s, c) => s + Math.max(0, dias(c.encerrado_em, c.detectado_em)), 0) / res.length : 0;
    const cobrar = ab.filter(c => c.proxima_cobranca && c.proxima_cobranca <= HOJE).length;
    // por mês de detecção
    const pm = {}; L.forEach(c => { if (!c.detectado_em) return; const k = String(c.detectado_em).slice(0, 7); const x = pm[k] = pm[k] || { a: 0, b: 0 }; aberto(c) ? x.a++ : x.b++; });
    let ks = Object.keys(pm).sort(); if (CH.mes !== 'tudo') { const d = new Date(HOJE); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (+CH.mes - 1)); const ini = d.toISOString().slice(0, 7); ks = ks.filter(k => k >= ini); }
    // transportadora
    const pt = {}; (CH.tr === 'r' ? L : ab).forEach(c => { const k = c.transportadora || '—'; const x = pt[k] = pt[k] || { l: k, n: 0, v: 0 }; x.n++; x.v += c.valor; });
    const trs = Object.values(pt).map(x => ({ ...x, v2: CH.tr === 'v' ? x.v : x.n })).sort((a, b) => b.v2 - a.v2).slice(0, 7).map(x => ({ l: x.l, v: x.v2, n: x.n, val: x.v }));
    // faixa de atraso (abertos)
    const FX = [['1–3 d', 1, 3], ['4–7 d', 4, 7], ['8–15 d', 8, 15], ['16–30 d', 16, 30], ['+30 d', 31, 1e9]];
    const fx = FX.map(([l, a, b]) => { const x = ab.filter(c => c.dias >= a && c.dias <= b); return { l, v: CH.fx === 'v' ? x.reduce((s, c) => s + c.valor, 0) : x.length, n: x.length }; });
    // motivos e UF
    const cnt = (arr, k) => { const m = {}; arr.forEach(c => { const v = c[k] || '—'; m[v] = (m[v] || 0) + 1; }); return Object.entries(m).map(([l, v]) => ({ l, v })).sort((a, b) => b.v - a.v); };
    const mot = cnt(L, 'motivo').slice(0, 5), ufs = cnt(ab, 'uf').slice(0, 7), des = cnt(enc, 'desfecho').slice(0, 5);
    const CORES = ['var(--orange)', 'var(--purple)', 'var(--yellow)', 'var(--pink)', '#b9b0a6'];
    const top = ab.slice().sort((a, b) => b.dias - a.dias).slice(0, 6);
    return `
    <div class="hero">
      <div class="k glass"><div class="lbl">Casos abertos</div><div class="val">${ab.length}</div></div>
      <div class="k hot"><div class="lbl">Valor em atraso</div><div class="val">${kv(valAb)}</div></div>
      <div class="k glass"><div class="lbl">Atraso médio</div><div class="val">${medio.toFixed(1).replace('.', ',')}<small style="font-size:.5em;opacity:.55"> dias</small></div></div>
      <div class="k glass gcard"><div class="lbl">Com ticket aberto</div>${gauge(ab.length ? comTicket / ab.length * 100 : 0)}</div>
    </div>
    <div class="mini">
      <div class="glass m1"><span>Cobranças para hoje</span><b>${cobrar}</b></div>
      <div class="glass m1"><span>Encerrados</span><b>${enc.length}</b></div>
      <div class="glass m1"><span>Tempo para resolver</span><b>${Math.round(tRes)}<small> dias</small></b></div>
      <div class="glass m1"><span>Reembolsos</span><b>${kC(reemb)}</b></div>
    </div>
    <div class="g-main">
      <div class="box glass"><div class="bh"><h2>Casos por mês</h2>${chips('mes', [['6', '6m'], ['12', '12m'], ['tudo', 'Tudo']])}</div>
        <div class="leg2"><span><i class="a"></i>Abertos</span><span><i class="b"></i>Encerrados</span></div>
        ${ks.length ? colsStack(ks.map(k => ({ l: NM[+k.slice(5) - 1] + '/' + k.slice(2, 4), a: pm[k].a, b: pm[k].b }))) : '<div class="empty">Sem casos.</div>'}</div>
      <div class="box glass ana"><div class="bh"><h2>Maiores atrasos</h2><button class="btn-glass" data-go="analitico">Analítico →</button></div>
        <div class="top5">${top.map(c => `<button data-caso="${c.id}"><span class="av" style="background:var(--orange-soft);color:#b5680a">${esc((c.transportadora || '?').slice(0, 2).toUpperCase())}</span><span class="nm"><b>Pedido ${esc(c.pedido_numero || '—')}</b><small>${esc(c.transportadora || '')} · ${esc(c.uf || '')}</small></span><span class="vl">${c.dias} d</span></button>`).join('') || '<div class="empty">Nenhum caso aberto.</div>'}</div></div>
    </div>
    <div class="g-tri">
      <div class="box glass"><div class="bh"><h2>Por transportadora</h2>${chips('tr', [['n', 'Abertos'], ['v', 'R$'], ['r', 'Histórico']])}</div>${rank(trs, r => CH.tr === 'v' ? kC(r.val) : r.n)}</div>
      <div class="box glass"><div class="bh"><h2>Faixa de atraso</h2>${chips('fx', [['n', 'Casos'], ['v', 'R$']])}</div>${colunas(fx.map(x => ({ l: x.l, v: x.v, fmt: CH.fx === 'v' ? kC(x.v) : x.v })))}</div>
      <div class="box glass"><div class="bh"><h2>Motivos</h2></div>${mot.length ? donut(mot.map((m, i) => ({ l: rot(m.l), v: m.v, c: CORES[i] }))) : '<div class="empty">Sem dados.</div>'}</div>
    </div>
    <div class="g-duo2">
      <div class="box glass"><div class="bh"><h2>Abertos por UF</h2></div>${rank(ufs, r => r.v)}</div>
      <div class="box glass"><div class="bh"><h2>Desfechos</h2></div>${rank(des.map(d => ({ ...d, l: rot(d.l) })), r => r.v)}</div>
    </div>`;
  }

  function analitico(L) {
    const lista = (S.aba === 'abertos' ? L.filter(aberto) : S.aba === 'encerrados' ? L.filter(c => !aberto(c)) : L).sort((a, b) => b.dias - a.dias);
    const n = k => k === 'abertos' ? L.filter(aberto).length : k === 'encerrados' ? L.filter(c => !aberto(c)).length : L.length;
    return `<div class="clientes glass"><div class="c-head"><div class="tabs2">${[['abertos', 'Abertos'], ['encerrados', 'Encerrados'], ['todos', 'Todos']].map(([id, l]) => `<button class="${S.aba === id ? 'on' : ''}" data-aba="${id}">${l} <span class="cnt">${n(id)}</span></button>`).join('')}</div>
      <button class="btn-glass no-print" id="csv">Baixar CSV</button></div>
      <div class="lista" style="margin-top:12px"><div class="li at cab"><span>Pedido</span><span>Transportadora</span><span class="num">Prazo</span><span class="num">Valor</span><span class="num">Atraso</span><span>Situação</span></div>
      ${lista.slice(0, S.pag).map(c => `<div class="li at" data-caso="${c.id}"><div class="who"><span class="av" style="background:var(--orange-soft);color:#b5680a">${esc((c.uf || '—').slice(0, 2))}</span><div style="min-width:0"><b>Pedido ${esc(c.pedido_numero || '—')}${c.nf_numero ? ` · NF ${esc(c.nf_numero)}` : ''}</b><small>${esc(titulo(c.cliente))} · ${esc(titulo(c.municipio))}/${esc(c.uf || '')}</small></div></div>
        <div class="vv" style="text-align:left">${esc(c.transportadora || '—')}<small>${esc(c.servico || '')}</small></div><div class="vv">${dBR(c.prazo_data)}</div><div class="vv"><b>${BRL(c.valor)}</b></div><div class="num">${diasHtml(c.dias)}</div><div><span class="chip-st">${rot(c.status)}</span></div></div>`).join('') || '<div class="empty">Nenhum caso.</div>'}</div>
      ${lista.length > S.pag ? `<div class="rodape"><span class="note">Mostrando ${S.pag} de ${lista.length}</span><button class="btn-glass no-print" id="mais">Ver mais</button></div>` : ''}</div>`;
  }

  function render() {
    const L = filtrados(), trs = [...new Set(CASOS.map(c => c.transportadora).filter(Boolean))].sort();
    $('#main').innerHTML = `
    <div class="r-head"><div class="tt"><h1>Atrasos de entrega</h1><div class="vw no-print"><button class="${S.view === 'painel' ? 'on' : ''}" data-go="painel">Painel</button><button class="${S.view === 'analitico' ? 'on' : ''}" data-go="analitico">Analítico</button></div></div>
      <span class="pill-dt">${dBR(HOJE)}</span></div>
    <div class="toolbar glass no-print">
      <div class="sel"><select id="trSel"><option value="todas">Todas as transportadoras</option>${trs.map(t => `<option ${S.tr === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      <div class="busca"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" type="search" placeholder="Pedido, NF, cliente ou rastreio" value="${esc(S.q)}"></div>
    </div>
    ${erroCarga ? `<div class="glass" style="padding:20px">${esc(erroCarga)}</div>` : S.view === 'painel' ? painel(L) : analitico(L)}`;
    // eventos
    $('#main').querySelectorAll('[data-go]').forEach(b => b.onclick = () => { S.view = b.dataset.go; render(); scrollTo(0, 0); });
    $('#main').querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { CH[b.dataset.ch] = b.dataset.v; render(); });
    $('#main').querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { S.aba = b.dataset.aba; S.pag = 25; render(); });
    $('#main').querySelectorAll('[data-caso]').forEach(b => b.onclick = () => detalhe(+b.dataset.caso));
    $('#trSel').onchange = e => { S.tr = e.target.value; render(); };
    const q = $('#q'); q.oninput = () => { S.q = q.value; clearTimeout(window._t); window._t = setTimeout(() => { render(); const e = $('#q'); e.focus(); e.setSelectionRange(e.value.length, e.value.length); }, 250); };
    const m = $('#mais'); if (m) m.onclick = () => { S.pag += 50; render(); };
    const c = $('#csv'); if (c) c.onclick = csv;
  }

  async function detalhe(id) {
    const base = CASOS.find(x => x.id === id); if (!base) return;
    const box = $('#modalBox'); $('#modalBg').classList.add('active');
    const desenhar = (c, ev) => box.innerHTML = `<div class="pop">
      <div class="pop-h"><span class="av" style="background:var(--orange-soft);color:#b5680a">${esc((c.transportadora || '?').slice(0, 2).toUpperCase())}</span><div class="pop-t"><h2>Pedido ${esc(c.pedido_numero || '—')}</h2><div><span class="chip-t">${rot(c.status)}</span>${c.nf_numero ? `<span>NF ${esc(c.nf_numero)}</span>` : ''}<span>${esc(titulo(c.cliente))}</span><span>${esc(titulo(c.municipio))}/${esc(c.uf || '')}</span></div></div>
        <button class="pop-x" id="fx" aria-label="Fechar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="pop-k"><div class="pk hot"><span>Atraso</span><b>${c.dias > 0 ? c.dias : 0}<small style="font-size:.55em"> dias</small></b></div><div class="pk"><span>Valor do pedido</span><b>${kv(c.valor)}</b></div><div class="pk"><span>Reembolso</span><b>${c.reemb ? kv(c.reemb) : '—'}</b></div></div>
      <div class="pop-hist">
        <div><span>Transportadora</span><b>${esc(c.transportadora || '—')}</b><span>${esc(c.servico || '')}${c.codigo_rastreio ? ' · ' + esc(c.codigo_rastreio) : ''}</span></div>
        <div><span>Saída · prazo</span><b>${dBR(c.data_saida)} → ${dBR(c.prazo_data)}</b></div>
        <div><span>Ticket</span><b>${esc(c.ticket_numero || '—')}</b><span>${c.proxima_cobranca ? 'próx. cobrança ' + dBR(c.proxima_cobranca) : ''}</span></div>
      </div>
      ${c.motivo || c.desfecho ? `<div class="pop-hist" style="grid-template-columns:1fr 1fr"><div><span>Motivo</span><b>${rot(c.motivo)}</b></div><div><span>Desfecho</span><b>${rot(c.desfecho)}</b></div></div>` : ''}
      <h3 style="font-size:13px;margin:16px 0 6px">Histórico</h3>
      <div class="pop-l">${ev === null ? '<div class="empty">Carregando…</div>' : ev.length ? ev.map(e => `<div class="pl ev"><span>${new Date(e.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><span><b>${rot(e.tipo)}</b><small>${esc(e.detalhe || '')}</small></span><span>${esc(e.origem || '')}</span></div>`).join('') : '<div class="empty">Sem eventos.</div>'}</div></div>`;
    const ligar = () => { const b = $('#fx'); if (b) b.onclick = fechar; };
    desenhar(base, null); ligar();
    if (!hub) { desenhar(base, []); ligar(); return; }
    try { const j = await api('caso', { id }); desenhar(prep(j.caso), j.eventos); ligar(); } catch (e) { desenhar(base, []); ligar(); }
  }
  function fechar() { $('#modalBg').classList.remove('active'); }
  $('#modalBg').addEventListener('click', e => { if (e.target.id === 'modalBg') fechar(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });

  function csv() {
    const cab = ['Pedido', 'NF', 'Cliente', 'Município', 'UF', 'Transportadora', 'Serviço', 'Rastreio', 'Saída', 'Prazo', 'Atraso (dias)', 'Valor', 'Motivo', 'Status', 'Ticket', 'Reembolso', 'Desfecho', 'Detectado em', 'Encerrado em'];
    const n = v => (Number(v) || 0).toFixed(2).replace('.', ',');
    const rows = filtrados().map(c => [c.pedido_numero, c.nf_numero, c.cliente, c.municipio, c.uf, c.transportadora, c.servico, c.codigo_rastreio, c.data_saida, c.prazo_data, c.dias, n(c.valor), c.motivo, c.status, c.ticket_numero, n(c.reemb), c.desfecho, c.detectado_em, c.encerrado_em]);
    const txt = '﻿' + [cab, ...rows].map(r => r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = `atrasos_${HOJE}.csv`; a.click();
  }

  $('#main').innerHTML = '<div class="empty" style="padding:60px">Carregando…</div>';
  if (window.ATRASOS_DEMO) CASOS = window.ATRASOS_DEMO.map(prep);
  else try { CASOS = (await api('casos')).casos.map(prep); } catch (e) { erroCarga = e.message; }
  render();
})();
