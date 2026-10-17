# v1su4rt — testes manuais

Serviço local: `python -m http.server 8000` → `http://localhost:8000`. Para sensores em celular, use a versão publicada em HTTPS.

## 1. Desktop (Chrome)

- [ ] Abre sem erros no Console e sem 404.
- [ ] O visual anima em tela cheia; o painel aparece no canto inferior esquerdo.
- [ ] **A flor em nuvem de pontos está visível**: corola de pontos vermelhos em cinco voltas, miolo alaranjado, caule verde com folhas. Em repouso é vermelho-escuro, não branco estourado.
- [ ] Perto, vê-se o grão: cada pétala é feita de pontos separados, com nervura clara e orla acesa e **escuro entre as pétalas** (o contraste não vem de uma mancha lisa).
- [ ] A flor vista em 3/4: percebe-se profundidade (pétalas da frente maiores, de trás mais escuras pela névoa).
- [ ] Mover o mouse inclina a flor (não só o fundo).

## 1b. Reação da flor ao som

Com **Ativar interações** ligado e música com grave e agudo separáveis:

- [ ] **Graves**: a corola abre de fora para dentro e a flor inclina-se para a frente.
- [ ] **Graves fortes (o fumo)**: acima de ~0,3 a borda da corola **descola pontos que sobem e se desfazem como fumaça colorida**, e a mancha da flor alarga-se; ao parar o grave os pontos voltam ao lugar.
- [ ] **Batidas**: uma onda visível corre da borda para o centro; a rotação dá um empurrão.
- [ ] **Médios**: as pétalas ondulam à volta do centro (vaga em azimute) e a orla ganha brilho.
- [ ] **Agudos**: o miolo acende e os pontos da corola cintilam mais depressa.
- [ ] Volume alto sobe a exposição, mas o vermelho continua vermelho (as pétalas não ficam brancas).
- [ ] Em silêncio a flor volta ao repouso suave, sem tremer.
- [ ] **Intensidade da nuvem de pontos**: a `0` a flor inteira desaparece e só fica o fundo; a `1` o visual é o padrão; a `2` os pontos crescem e brilham o dobro. O número à direita acompanha o slider.
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
