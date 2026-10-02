// Login, chamada à /api/report e adaptação das linhas para o formato que os dashboards já usam.
const sb = window.supabase.createClient(HUB_CONFIG.SUPABASE_URL, HUB_CONFIG.SUPABASE_ANON_KEY);
const ROLES = { diretoria: 'Diretoria', comercial: 'Comercial' };

function hubTela(msg) {
  document.getElementById('main').innerHTML = `<div class="empty-state"><div class="big">🔒</div>${msg}</div>`;
}
async function hubSair() { await sb.auth.signOut(); location.href = 'login.html'; }

// ---- adaptadores: tabelas report_* -> arrays esperados pelas páginas ----
const hojeBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const FORMA = { boleto: 'B', pix: 'X', cartao: 'C' };
function adaptarReceber(d) {
  return {
    gerado: hojeBR(),
    titulos: d.titulos.map(t => [t.cliente_chave, t.origem === 'asaas' ? 'A' : 'B', t.vencimento, t.valor, FORMA[t.forma] || 'B', t.pedido || '', t.parcela || '']),
    // [chave, nome, email, tel, cidade/uf, n, emDia, atrasos, atrasoMedio, atrasoMax, pagoV, emitidoV, emDiaV, atrasoV]; score vem pronto da tabela
    clientes: d.clientes.map(c => Object.assign(
      [c.cliente_chave, c.nome, c.email, c.telefone_valido ? c.telefone : (c.telefone ? '0000000000' : ''), c.cidade_uf, c.titulos_historico, c.pagos_em_dia, c.titulos_atrasados, c.atraso_medio_dias, c.atraso_max_dias, c.pago_total, c.compras_total, 0, 0],
      { scoreFixo: c.score })),
  };
}
const COD = { 'Pesagem': 'PE', 'Mistura líquido': 'ML', 'Mistura em pó': 'MP', 'Envase líquido': 'EL', 'Envase em pó': 'EP', 'Rotulagem de pote': 'RP', 'Embalagem em display': 'DP', 'Envase / contagem de cápsulas': 'EC', 'Selagem de sachê': 'SS' };
const SIGLA_ST = { aguardando: 'A', em_execucao: 'E', executada: 'X' };
const ST_OP = { em_producao: 'A', produzindo: 'P', finalizada: 'F' };
function adaptarProducao(d) {
  const por = {};
  d.etapas.slice().sort((a, b) => a.etapa_ordem - b.etapa_ordem).forEach(e => (por[e.op_id] = por[e.op_id] || []).push(`${COD[e.etapa] || 'XX'}:${SIGLA_ST[e.status_etapa] || 'A'}`));
  return {
    gerado: hojeBR(),
    ops: d.ops.map(o => [o.op_id, o.op_numero, o.produto, o.tipo === 'produto_acabado' ? '04' : '03', o.unidade, o.sku || '', o.quantidade, ST_OP[o.status_op] || 'A', o.emissao, o.inicio_planejado || '', '', o.previsao_entrega || '', o.conclusao || '', (por[o.op_id] || []).join(','), '']),
  };
}
const ADAPTADORES = { receber: adaptarReceber, producao: adaptarProducao };

async function hubBoot(secao) {
  document.getElementById('main').innerHTML = '<div class="empty-state"><span class="loader" style="border-top-color:var(--orange);border-color:rgba(0,0,0,0.1);"></span><div class="desc" style="margin-top:12px">Carregando dados…</div></div>';
  try { await hubBootInterno(secao); }
  catch (e) { console.error(e); hubTela('Erro ao montar a página: ' + (e && e.message ? e.message : e)); }
}

async function hubBootInterno(secao) {
  const { data } = await sb.auth.getSession();
  const sess = data && data.session;
  if (!sess) { location.href = 'login.html'; return; }
  const r = await fetch('/api/report?s=' + secao, { headers: { Authorization: 'Bearer ' + sess.access_token } });
  if (r.status === 401) { await sb.auth.signOut(); location.href = 'login.html'; return; }
  if (r.status === 403) { hubTela('Seu perfil não tem acesso a esta área.'); return; }
  if (!r.ok) { hubTela('Não foi possível carregar os dados agora. Tente novamente em instantes.'); return; }
  const j = await r.json();

  // menu: só as áreas permitidas + usuário e sair
  document.querySelectorAll('.nav-btn[href]').forEach(a => {
    const id = a.getAttribute('href').replace('.html', '');
    if (!j.perfil.paginas.includes(id)) a.style.display = 'none';
  });
  const nav = document.querySelector('.sidebar');
  if (nav) nav.insertAdjacentHTML('beforeend', `<div class="sidebar-footer">${j.perfil.nome} · ${ROLES[j.perfil.role] || j.perfil.role}<br><button onclick="hubSair()" style="background:none;border:none;color:rgba(255,255,255,.7);font-size:11px;cursor:pointer;text-decoration:underline;padding:0;margin-top:6px">Sair</button></div>`);

  window.__DATA__ = ADAPTADORES[secao](j.dados);
  const s = document.createElement('script');
  s.textContent = 'const DATA = window.__DATA__;\n' + document.getElementById('app').textContent;
  document.body.appendChild(s);
}
