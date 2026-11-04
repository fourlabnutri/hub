// acessibilidade.js — Hub FourLab (mesmo widget do Hub Bioflora)
// Widget flutuante de acessibilidade. Carregado por um bootstrapper
// em cada página (não uma tag <script src="..."> fixa) -- o
// bootstrapper busca sempre a versão mais nova, com carimbo de hora
// na URL, então esse arquivo pode ser atualizado à vontade sem
// precisar mexer em mais nada nas outras páginas.
// Não depende de mais nada — injeta o próprio botão, painel e CSS.

(function(){
  const NIVEIS_FONTE = ['100%','115%','130%','150%','170%'];
  const LABELS_FONTE = ['Padrão','Grande','Maior','Muito grande','Máxima'];

  let nivelFonte = parseInt(localStorage.getItem('a11y_fonte') || '0', 10);
  let temaEscuro = localStorage.getItem('a11y_escuro') === '1';
  let espacado = localStorage.getItem('a11y_espacado') === '1';
  let leituraFacil = localStorage.getItem('a11y_leitura') === '1';

  function salvar(){
    localStorage.setItem('a11y_fonte', nivelFonte);
    localStorage.setItem('a11y_escuro', temaEscuro ? '1' : '0');
    localStorage.setItem('a11y_espacado', espacado ? '1' : '0');
    localStorage.setItem('a11y_leitura', leituraFacil ? '1' : '0');
  }

  function aplicar(){
    document.documentElement.style.zoom = NIVEIS_FONTE[nivelFonte];
    document.documentElement.classList.toggle('a11y-escuro', temaEscuro);
    document.documentElement.classList.toggle('a11y-espacado', espacado);
    document.documentElement.classList.toggle('a11y-leitura', leituraFacil);
    atualizarPainel();
  }

  function atualizarPainel(){
    const fonteLabel = document.getElementById('a11yFonteLabel');
    if(fonteLabel) fonteLabel.textContent = LABELS_FONTE[nivelFonte];
    const tEscuro = document.getElementById('a11yToggleEscuro');
    if(tEscuro) tEscuro.classList.toggle('on', temaEscuro);
    const tEspacado = document.getElementById('a11yToggleEspacado');
    if(tEspacado) tEspacado.classList.toggle('on', espacado);
    const tLeitura = document.getElementById('a11yToggleLeitura');
    if(tLeitura) tLeitura.classList.toggle('on', leituraFacil);
  }

  function injetarEstilos(){
    const css = `
      .a11y-fab{position:fixed;bottom:22px;right:22px;width:52px;height:52px;border-radius:50%;
        background:#e96709;color:#fff;border:none;font-size:24px;cursor:grab;touch-action:none;
        box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:9999;display:flex;align-items:center;justify-content:center;user-select:none;}
      .a11y-fab:active{cursor:grabbing;}
      .a11y-fab:hover{background:#c2520a;}
      .a11y-fab-fechar{position:absolute;top:-4px;right:-4px;width:19px;height:19px;border-radius:50%;
        background:#fff;color:#6E6266;border:1px solid #E7DFE0;font-size:11px;line-height:1;cursor:pointer;
        display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.15);}
      .a11y-reabrir{position:fixed;bottom:22px;right:0;background:#e96709;color:#fff;border:none;
        padding:8px 6px 8px 10px;border-radius:10px 0 0 10px;font-size:15px;cursor:pointer;z-index:9999;
        box-shadow:0 2px 10px rgba(0,0,0,.2);opacity:.85;}
      .a11y-reabrir:hover{opacity:1;}
      .a11y-panel{position:fixed;bottom:82px;right:22px;background:#fff;border:1px solid #E7DFE0;
        border-radius:14px;padding:18px;width:260px;box-shadow:0 8px 30px rgba(0,0,0,.18);z-index:9999;
        display:none;font-family:'Maven Pro',sans-serif;}
      .a11y-panel.show{display:block;}
      .a11y-panel h4{font-size:13px;margin:0 0 14px;color:#2A2224;font-weight:700;}
      .a11y-block{margin-bottom:16px;}
      .a11y-block:last-child{margin-bottom:0;}
      .a11y-label{font-size:11.5px;color:#6E6266;font-weight:600;margin-bottom:8px;display:block;}
      .a11y-fonte-row{display:flex;align-items:center;justify-content:space-between;gap:8px;}
      .a11y-fonte-row button{font-size:16px;width:30px;height:30px;border-radius:6px;border:1px solid #E7DFE0;background:#FBF9F7;cursor:pointer;color:#2A2224;}
      .a11y-fonte-row span{font-size:12px;color:#2A2224;flex:1;text-align:center;}
      .a11y-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:0;font-size:12.5px;color:#2A2224;}
      .a11y-toggle{position:relative;width:38px;height:20px;border-radius:12px;background:#E7DFE0;cursor:pointer;border:none;flex-shrink:0;}
      .a11y-toggle.on{background:#e96709;}
      .a11y-toggle::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.15s;}
      .a11y-toggle.on::after{left:20px;}
      .a11y-reset{width:100%;margin-top:14px;font-size:11.5px;color:#6E6266;background:none;border:none;cursor:pointer;text-decoration:underline;}

      html.a11y-espacado body, html.a11y-espacado body *{letter-spacing:.03em !important; word-spacing:.06em !important;}
      html.a11y-espacado p, html.a11y-espacado li, html.a11y-espacado td, html.a11y-espacado .desc{line-height:1.85 !important;}

      html.a11y-leitura body{font-family:Arial, Helvetica, sans-serif !important;}

      /* Tema escuro por inversão de cor — mesma técnica que extensões
         de "modo escuro forçado" usam. Não depende de nenhuma classe,
         variável ou estrutura da página: funciona igual em qualquer
         tela, presente ou futura, garantido. */
      html.a11y-escuro{
        filter: invert(1) hue-rotate(180deg);
        background:#fff;
      }
      html.a11y-escuro img, html.a11y-escuro video, html.a11y-escuro svg image,
      html.a11y-escuro .a11y-fab, html.a11y-escuro .a11y-panel{
        filter: invert(1) hue-rotate(180deg); /* desfaz a inversão só nessas, senão fotos ficam com cor estranha */
      }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function injetarWidget(){
    const fab = document.createElement('button');
    fab.className = 'a11y-fab';
    fab.title = 'Acessibilidade';
    fab.setAttribute('aria-label', 'Abrir opções de acessibilidade');
    fab.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="4.5" r="1.8" fill="currentColor" stroke="none"/><path d="M5 8.5c4.5 1.2 9.5 1.2 14 0"/><path d="M12 9.8v4.4"/><path d="M12 14.2 9 20.5"/><path d="M12 14.2l3 6.3"/></svg><span class="a11y-fab-fechar" id="a11yFecharBtn" title="Esconder" aria-label="Esconder botão de acessibilidade">×</span>`;

    const painel = document.createElement('div');
    painel.className = 'a11y-panel';
    painel.innerHTML = `
      <h4>Acessibilidade</h4>
      <div class="a11y-block">
        <span class="a11y-label">Tamanho da fonte</span>
        <div class="a11y-fonte-row">
          <button id="a11yFonteMenos" aria-label="Diminuir fonte">A-</button>
          <span id="a11yFonteLabel">Padrão</span>
          <button id="a11yFonteMais" aria-label="Aumentar fonte">A+</button>
        </div>
      </div>
      <div class="a11y-block a11y-row">
        <span class="a11y-label" style="margin:0">Tema escuro</span>
        <button class="a11y-toggle" id="a11yToggleEscuro" aria-label="Ativar tema escuro"></button>
      </div>
      <div class="a11y-block a11y-row" style="margin-top:12px">
        <span class="a11y-label" style="margin:0">Espaçamento de leitura</span>
        <button class="a11y-toggle" id="a11yToggleEspacado" aria-label="Ativar espaçamento de leitura"></button>
      </div>
      <div class="a11y-block a11y-row" style="margin-top:12px">
        <span class="a11y-label" style="margin:0">Fonte de leitura fácil</span>
        <button class="a11y-toggle" id="a11yToggleLeitura" aria-label="Ativar fonte de leitura fácil"></button>
      </div>
      <button class="a11y-reset" id="a11yReset">Restaurar padrão</button>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(painel);

    // ---------- Posição por canto (arrasta e encaixa) ----------
    const CANTOS = {
      'bottom-right': { fab:{bottom:'22px',right:'22px',top:'',left:''}, painel:{bottom:'82px',right:'22px',top:'',left:''} },
      'bottom-left':  { fab:{bottom:'22px',left:'22px',top:'',right:''}, painel:{bottom:'82px',left:'22px',top:'',right:''} },
      'top-right':    { fab:{top:'22px',right:'22px',bottom:'',left:''}, painel:{top:'82px',right:'22px',bottom:'',left:''} },
      'top-left':     { fab:{top:'22px',left:'22px',bottom:'',right:''}, painel:{top:'82px',left:'22px',bottom:'',right:''} },
    };
    function aplicarCanto(nome){
      const c = CANTOS[nome] || CANTOS['bottom-right'];
      Object.assign(fab.style, c.fab);
      Object.assign(painel.style, c.painel);
    }
    let cantoAtual = localStorage.getItem('a11y_canto') || 'bottom-right';
    aplicarCanto(cantoAtual);

    let arrastando = false, moveu = false, offsetX = 0, offsetY = 0;
    fab.addEventListener('pointerdown', (e) => {
      if(e.target.id === 'a11yFecharBtn') return;
      arrastando = true; moveu = false;
      const rect = fab.getBoundingClientRect();
      offsetX = e.clientX - rect.left; offsetY = e.clientY - rect.top;
      fab.setPointerCapture(e.pointerId);
    });
    fab.addEventListener('pointermove', (e) => {
      if(!arrastando) return;
      moveu = true;
      fab.style.top = (e.clientY - offsetY) + 'px';
      fab.style.left = (e.clientX - offsetX) + 'px';
      fab.style.bottom = ''; fab.style.right = '';
      painel.classList.remove('show');
    });
    fab.addEventListener('pointerup', (e) => {
      if(!arrastando) return;
      arrastando = false;
      if(moveu){
        const rect = fab.getBoundingClientRect();
        const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
        const metadeX = window.innerWidth/2, metadeY = window.innerHeight/2;
        cantoAtual = (cy < metadeY ? 'top' : 'bottom') + '-' + (cx < metadeX ? 'left' : 'right');
        aplicarCanto(cantoAtual);
        localStorage.setItem('a11y_canto', cantoAtual);
      } else {
        painel.classList.toggle('show');
      }
    });

    // ---------- Fechar / reabrir ----------
    const reabrirBtn = document.createElement('button');
    reabrirBtn.className = 'a11y-reabrir';
    reabrirBtn.title = 'Mostrar acessibilidade';
    reabrirBtn.setAttribute('aria-label', 'Mostrar botão de acessibilidade');
    reabrirBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="4.5" r="1.8" fill="currentColor" stroke="none"/><path d="M5 8.5c4.5 1.2 9.5 1.2 14 0"/><path d="M12 9.8v4.4"/><path d="M12 14.2 9 20.5"/><path d="M12 14.2l3 6.3"/></svg>';
    document.body.appendChild(reabrirBtn);

    function aplicarVisibilidade(){
      const escondido = localStorage.getItem('a11y_escondido') === '1';
      fab.style.display = escondido ? 'none' : 'flex';
      reabrirBtn.style.display = escondido ? 'block' : 'none';
      if(escondido) painel.classList.remove('show');
    }
    aplicarVisibilidade();

    document.getElementById('a11yFecharBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      localStorage.setItem('a11y_escondido', '1');
      aplicarVisibilidade();
    });
    reabrirBtn.addEventListener('click', () => {
      localStorage.setItem('a11y_escondido', '0');
      aplicarVisibilidade();
    });

    document.addEventListener('click', (e) => {
      if(!painel.contains(e.target) && e.target !== fab) painel.classList.remove('show');
    });

    document.getElementById('a11yFonteMais').addEventListener('click', () => {
      nivelFonte = Math.min(nivelFonte+1, NIVEIS_FONTE.length-1);
      aplicar(); salvar();
    });
    document.getElementById('a11yFonteMenos').addEventListener('click', () => {
      nivelFonte = Math.max(nivelFonte-1, 0);
      aplicar(); salvar();
    });
    document.getElementById('a11yToggleEscuro').addEventListener('click', () => {
      temaEscuro = !temaEscuro;
      aplicar(); salvar();
    });
    document.getElementById('a11yToggleEspacado').addEventListener('click', () => {
      espacado = !espacado; aplicar(); salvar();
    });
    document.getElementById('a11yToggleLeitura').addEventListener('click', () => {
      leituraFacil = !leituraFacil; aplicar(); salvar();
    });
    document.getElementById('a11yReset').addEventListener('click', () => {
      nivelFonte = 0; temaEscuro = false; espacado = false; leituraFacil = false;
      aplicar(); salvar();
    });
  }

  function iniciar(){
    injetarEstilos();
    injetarWidget();
    aplicar();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
