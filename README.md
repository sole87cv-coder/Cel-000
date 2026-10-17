# v1su4rt

Shaders visuais em tela cheia que reagem ao **microfone** e ao **giroscópio**. Site estático, sem dependências, instalável (PWA) e com cache offline.

A tela mostra uma **flor 3D** (pétalas em cinco voltas, miolo, filetes, caule e folhas) sobre um fundo animado, e um painel pequeno: botão **Ativar interações**, os controles de sensibilidade (áudio e giroscópio), o controle **Intensidade da nuvem de pontos** e um botão para recolher o painel.

## Como reage

O espectro é mapeado pelo **raio da flor**: a borda pertence aos graves, o centro aos agudos. Por isso a flor abre de fora para dentro conforme a frequência.

| Entrada | Efeito no fundo | Efeito na flor |
| --- | --- | --- |
| Volume | ondas a partir do centro, brilho | abre todas as pétalas e sobe a exposição |
| Graves | amplitude da deformação | endireita a corola, ondula a borda, inclina a flor para a frente |
| Médios | deslocamento de cor | onda que corre à volta das pétalas e realce na orla |
| Agudos | — | acende o miolo e o pólen brilhante, dá brilho especular |
| Batidas | flash | onda que viaja da borda ao centro e um empurrão na rotação |
| Giroscópio | move o centro das formas (a posição ao ativar vira o zero) | inclina a flor em 3/4 |
| Mouse / toque | mesmo efeito do giroscópio | mesmo efeito do giroscópio, para telas sem sensor |

O slider **Intensidade da nuvem de pontos** é um ganho sobre os pontos brilhantes (pólen/faíscas), levado ao shader pelo uniforme `u_cloud`: `0` apaga a nuvem, `1` é o valor desenhado, `2` duplica o brilho e aumenta o tamanho dos pontos. Não altera a malha da flor nem o fundo. No console: `v1su4rtShaders.setCloudIntensity(0.5)`.

## Celular, tablet e desktop

- **Celular (< 640 px):** painel na largura toda, embaixo. Resolução interna limitada a 1.5x.
- **Tablet (640–1023 px):** painel em cartão de 380 px no canto. Até 1.75x.
- **Desktop (≥ 1024 px):** painel de 400 px no canto. Até 2x.
- **Celular deitado:** painel estreito, sliders lado a lado.
- Se o aparelho não sustentar ~40 fps, a resolução interna desce sozinha, até 50% do limite.
- `prefers-reduced-motion` reduz a velocidade da animação a 35%.
- Sem WebGL, fica um fundo estático e o painel avisa que o visual não pode ser desenhado.

## Executar no computador

```bash
python -m http.server 8000
```

Abra `http://localhost:8000`. O microfone funciona em `localhost`; o giroscópio só existe em celular/tablet, então precisa de HTTPS no aparelho.

## Publicar no GitHub Pages

1. Envie os arquivos para a raiz do repositório.
2. **Settings → Pages → Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Abra o endereço `https://` gerado no celular.

## Arquivos

- `index.html`: página, canvas e painel.
- `assets/shaders.js`: renderizador WebGL (fundo + flor 3D) e os shaders GLSL. É aqui que se muda o visual. A forma da flor está em `WHORLS` (voltas de pétalas), `LEAVES` e `buildFlower()`; a reação ao som está em `VERTEX_MESH` e `FRAGMENT_MESH`.
- `assets/interaction.js`: microfone (graves, médios, agudos, volume) e giroscópio.
- `assets/app.js`: painel, ligação dos sensores ao renderizador e registo do service worker.
- `assets/styles.css`: layout responsivo.
- `manifest.webmanifest`, `icon.svg`, `icons/`: instalação como app.
- `service-worker.js`: cache offline. Ao mudar qualquer arquivo, aumente `CACHE_NAME`.
- `privacy.html`: nota de privacidade.
- `scripts/deploy.ps1`: stage, commit e push para o GitHub Pages.
- `ESF-01.slnx`: agrupa os arquivos no Visual Studio 2026.
- `TESTES.md`: roteiro de testes manuais.

## Problemas comuns

- **Versão antiga aparecendo:** aumente `CACHE_NAME` no `service-worker.js`, ou desregistre em DevTools → Application → Service Workers. Em desenvolvimento, active **Disable cache** no DevTools: o service worker deixa passar pedidos que peçam recarregamento forçado.
- **Microfone sem reação:** permissões do site, HTTPS, e aumente **Sensibilidade áudio**.
- **Giroscópio sem reação:** no iOS a permissão de movimento só é pedida ao tocar em **Ativar interações**; se negada, recarregue a página.
