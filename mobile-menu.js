// Celular: barra de topo com botão de menu; o menu lateral desliza por cima (o CSS está em shared.css).
(function () {
  var sb = document.querySelector('.sidebar');
  if (!sb || document.querySelector('.mobile-top')) return;
  var lg = sb.querySelector('.sidebar-logo img');
  var titulo = document.title.replace(/ · FourLab.*$/, '');
  document.body.insertAdjacentHTML('afterbegin',
    '<div class="mobile-top"><button class="mt-btn" aria-label="Menu" id="mtBtn">' +
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>' +
    (lg ? '<img class="mt-logo" src="' + lg.src + '" alt="">' : '') + '<div class="mt-title"></div></div><div class="menu-backdrop" id="mtFundo"></div>');
  document.querySelector('.mt-title').textContent = titulo;
  var fecha = function () { document.body.classList.remove('menu-aberto'); };
  document.getElementById('mtBtn').onclick = function () { document.body.classList.toggle('menu-aberto'); };
  document.getElementById('mtFundo').onclick = fecha;
  sb.addEventListener('click', function (e) { if (e.target.closest('a')) fecha(); });
})();
