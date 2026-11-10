// Mensagem padrão de WhatsApp para o cliente que recebeu um pedido avariado (aba "Mensagem ao cliente" do RNC de pedidos).
// Só monta o texto e abre o WhatsApp do próprio atendente: nada é enviado nem gravado pelo hub.
(() => {
  const $ = s => document.querySelector(s);
  const texto = (nome, pedido) => `Olá${nome ? ', ' + nome : ''}! Aqui é da FourLab Nutrition.

Sentimos muito que ${pedido ? 'o seu pedido ' + pedido : 'o seu pedido'} tenha chegado com avaria. Para resolvermos o mais rápido possível, envie aqui, por favor:

1. Pelo menos 3 fotos do produto avariado, mostrando também a data de fabricação e o lote.
2. Pelo menos 3 fotos da caixa de transporte em que o produto chegou.
3. 1 foto da etiqueta de transporte, com o nome do destinatário.
4. Uma breve descrição do que aconteceu.

Assim que recebermos, damos o retorno com a solução. Obrigado pela paciência!`;
  let editado = false;
  const atualizar = () => { if (!editado) $('#wTexto').value = texto($('#wNome').value.trim().split(' ')[0], $('#wPedido').value.trim()); };
  $('#wNome').oninput = atualizar; $('#wPedido').oninput = atualizar;
  $('#wTexto').oninput = () => { editado = true; };
  atualizar();
  const digitos = () => { const d = $('#wTel').value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); return d.length >= 10 && d.length <= 11 ? '55' + d : ''; };
  $('#wAbrir').onclick = () => {
    if ($('#wTel').value.trim() && !digitos()) { $('#wOk').textContent = 'Confira o número: DDD + telefone, só números.'; return; }
    const msg = encodeURIComponent($('#wTexto').value);
    window.open(digitos() ? `https://wa.me/${digitos()}?text=${msg}` : `https://wa.me/?text=${msg}`, '_blank', 'noopener');
    $('#wOk').textContent = '';
  };
  $('#wCopiar').onclick = async () => {
    try { await navigator.clipboard.writeText($('#wTexto').value); $('#wOk').textContent = 'Texto copiado.'; }
    catch (e) { $('#wTexto').select(); $('#wOk').textContent = 'Selecionei o texto: use Cmd+C para copiar.'; }
  };
})();
