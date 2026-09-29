# v1su4rt — testes manuais

Serviço local: `python -m http.server 8000` → `http://localhost:8000`. Para sensores em celular, use a versão publicada em HTTPS.

## 1. Desktop (Chrome)

- [ ] Abre sem erros no Console e sem 404.
- [ ] O visual anima em tela cheia; o painel aparece no canto inferior esquerdo.
- [ ] Mover o mouse desloca o centro das formas.
- [ ] Application → Manifest: nome, ícones 192/512/maskable, `display: standalone`.
- [ ] Application → Service Workers: "activated and is running".
- [ ] Network → Offline → recarregar: a página abre do cache.
- [ ] **Ativar interações** pede o microfone; falar/tocar música anima ondas (volume), deformação (graves) e brilhos (agudos).
- [ ] Sem giroscópio, a mensagem avisa e sugere usar mouse ou toque.
- [ ] **Desativar interações** solta o microfone (o ícone de gravação some da aba).

## 2. Tamanhos de tela

Em DevTools → modo dispositivo (ou redimensionando a janela):

- [ ] 360 px: painel na largura toda, embaixo; botão com altura de toque confortável.
- [ ] 768 px: painel em cartão de 380 px no canto.
- [ ] 1280 px+: painel de 400 px; visual ocupa toda a tela.
- [ ] Celular deitado (ex. 800×360): painel estreito, sliders lado a lado, nada cortado.
- [ ] O botão de seta recolhe e mostra o painel.

## 3. Android (Chrome, HTTPS)

- [ ] Instalar app / Adicionar à tela inicial; abre sem barra de endereço.
- [ ] Modo avião: o app abre do cache.
- [ ] **Ativar interações**: aceitar microfone; o visual reage ao som.
- [ ] Inclinar o aparelho move o centro das formas; deitar o celular continua coerente.
- [ ] Sliders mudam a intensidade na hora (valores mostram 2 casas, ex. 1.50).
- [ ] Arrastar o dedo na tela move o centro.

## 4. iOS (Safari, HTTPS)

- [ ] Compartilhar → Adicionar à Tela de Início.
- [ ] **Ativar interações**: aceitar microfone e movimento no mesmo toque.
- [ ] Se negar o movimento: mensagem pede para recarregar a página.
- [ ] Microfone e giroscópio reagem como no Android.

## 5. Acessibilidade e desempenho

- [ ] Navegação por Tab passa por: botão ativar, recolher, sliders, privacidade; foco visível.
- [ ] Com "reduzir movimento" ligado no sistema, a animação fica mais lenta.
- [ ] Em aparelho fraco, a imagem perde definição em vez de travar.
- [ ] `privacy.html` abre e o link **Voltar** funciona.

## 6. Depois de cada mudança

- [ ] Aumentar `CACHE_NAME` em `service-worker.js`.
- [ ] Hard reload (Ctrl+Shift+R) no desktop; no celular, fechar e reabrir o app.
- [ ] `git status` antes de commitar.
