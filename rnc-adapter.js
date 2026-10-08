// Tudo que a tela de RNC precisa do "back" passa por aqui. Para ligar outro armazenamento/banco, crie um adapter novo com as mesmas 6 funções
// e escolha-o em config.js (RNC_BACKEND). A tela (rnc.js) não muda.
//
// Contrato de um adapter:
//   opcoes()                      -> { codigos: [{codigo, descricao}], podeGerenciar: boolean }
//   criar(dados, fotos, onFoto)   -> { numero }     dados: nf, transportadora, data_recebimento (AAAA-MM-DD), fornecedor, item_nome, item_codigo, codigo_avaria, descricao
//                                                   fotos: [{ blob, ext }] já reduzidas (JPEG ~1600 px); onFoto(i, total) avisa o progresso
//   listar()                      -> [{ id, numero, nf, transportadora, data_recebimento, fornecedor, item_nome, item_codigo, codigo_avaria, avaria_descricao, fotos: <quantidade>, registrado_por, created_at }]
//   detalhe(id)                   -> { ...mesmos campos, descricao, fotos: [<url de cada foto>] }
//   codigos()                     -> [{ codigo, descricao, ativo }]
//   salvarCodigo({codigo, descricao, ativo}) -> [{ codigo, descricao, ativo }]   (lista atualizada)
(function () {
  const cfg = (window.HUB_CONFIG && HUB_CONFIG.RNC_BACKEND) || 'demo';

  // ---------- DEMO: guarda só neste navegador (para mostrar a tela antes de existir o back) ----------
  const demo = (() => {
    const ler = (k, v) => { try { return JSON.parse(localStorage.getItem(k)) || v; } catch (e) { return v; } };
    const gravar = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    const COD = [['01', 'Saco rasgado'], ['02', 'Saco/caixa molhado'], ['03', 'Caixa amassada'], ['04', 'Falta de volume'], ['05', 'Palete quebrado']].map(c => ({ codigo: c[0], descricao: c[1], ativo: true }));
    const miniatura = blob => new Promise(res => {
      const img = new Image(), url = URL.createObjectURL(blob);
      img.onload = () => { const k = Math.min(1, 480 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.6)); };
      img.onerror = () => { URL.revokeObjectURL(url); res(''); };
      img.src = url;
      setTimeout(() => res(''), 3000);   // se o navegador não conseguir ler a imagem, segue sem miniatura
    });
    return {
      aviso: 'Modo demonstração: os registros ficam só neste navegador e não são enviados a lugar nenhum.',
      async opcoes() { return { codigos: demo.cods().filter(c => c.ativo), podeGerenciar: true }; },
      cods() { return ler('rnc_demo_codigos', COD); },
      async criar(d, fotos, onFoto) {
        const lista = ler('rnc_demo_registros', []), urls = [];
        for (let i = 0; i < fotos.length; i++) { onFoto && onFoto(i + 1, fotos.length); const u = await miniatura(fotos[i].blob); if (u) urls.push(u); }
        const cod = demo.cods().find(c => c.codigo === d.codigo_avaria) || { descricao: '' };
        const numero = (lista.reduce((m, r) => Math.max(m, r.numero), 0)) + 1;
        lista.unshift({ id: 'demo-' + numero, numero, ...d, avaria_descricao: cod.descricao, fotos: urls, registrado_por: 'Demonstração', created_at: new Date().toISOString() });
        try { gravar('rnc_demo_registros', lista.slice(0, 30)); } catch (e) { throw new Error('O navegador não tem espaço para guardar a demonstração.'); }
        return { numero };
      },
      async listar() { return ler('rnc_demo_registros', []).map(r => ({ ...r, fotos: r.fotos.length })); },
      async detalhe(id) { const r = ler('rnc_demo_registros', []).find(x => x.id === id); if (!r) throw new Error('RNC não encontrada'); return r; },
      async codigos() { return demo.cods(); },
      async salvarCodigo(c) {
        const l = demo.cods(), i = l.findIndex(x => x.codigo === c.codigo);
        if (!/^[A-Za-z0-9]{1,10}$/.test(c.codigo) || !String(c.descricao).trim()) throw new Error('Informe o código (letras e números) e a descrição.');
        const novo = { codigo: c.codigo, descricao: String(c.descricao).trim(), ativo: c.ativo !== false };
        if (i >= 0) l[i] = novo; else l.push(novo);
        gravar('rnc_demo_codigos', l); return l;
      },
    };
  })();

  // ---------- SUPABASE DO HUB (opcional; precisa do SQL 006 e de /api/rnc) ----------
  const supa = (() => {
    const sb = window.supabase.createClient(HUB_CONFIG.SUPABASE_URL, HUB_CONFIG.SUPABASE_ANON_KEY);
    async function api(acao, corpo) {
      const { data } = await sb.auth.getSession();
      const r = await fetch('/api/rnc', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token }, body: JSON.stringify({ acao, ...corpo }) });
      const j = await r.json().catch(() => ({ erro: 'Resposta inválida do servidor.' }));
      if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
      return j;
    }
    return {
      aviso: '',
      async opcoes() { const o = await api('opcoes', {}); return { codigos: o.codigos, podeGerenciar: o.codigosAdmin }; },
      async criar(d, fotos, onFoto) {
        const paths = [];
        if (fotos.length) {
          const { fotos: slots } = await api('fotos', { qtd: fotos.length, exts: fotos.map(f => f.ext) });
          for (let i = 0; i < slots.length; i++) {
            onFoto && onFoto(i + 1, slots.length);
            const up = await sb.storage.from('rnc-fotos').uploadToSignedUrl(slots[i].path, slots[i].token, fotos[i].blob, { contentType: fotos[i].blob.type || 'image/jpeg' });
            if (up.error) throw new Error('Não consegui enviar a foto ' + (i + 1) + ': ' + up.error.message);
            paths.push(slots[i].path);
          }
        }
        return api('criar', { ...d, fotos: paths });
      },
      async listar() { return (await api('listar', {})).registros; },
      async detalhe(id) { return (await api('detalhe', { id })).registro; },
      async codigos() { return (await api('codigos', {})).codigos; },
      async salvarCodigo(c) { return (await api('salvarCodigo', c)).codigos; },
    };
  })();

  window.RNC_ADAPTER = { demo, supabase: supa }[cfg] || demo;
})();
