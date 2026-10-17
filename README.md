# v1su4rt

Shaders visuais em tela cheia que reagem ao **microfone** e ao **giroscópio**. Site estático, sem dependências, instalável (PWA) e com cache offline.

A tela mostra uma **flor desenhada inteiramente em nuvem de pontos** — cerca de 47 mil pontos, cada um com a sua normal, cor e fase — sobre um fundo animado, e um painel pequeno: botão **Ativar interações**, os controles de sensibilidade (áudio e giroscópio), o controle **Intensidade da nuvem de pontos** e um botão para recolher o painel.

## Como reage

O espectro é mapeado pelo **raio da flor**: a borda pertence aos graves, o centro aos agudos. Por isso a flor abre de fora para dentro conforme a frequência. Cada ponto tem uma fase própria: nasce, cresce e desfaz-se, de modo que a nuvem mantém a densidade média enquanto cada grão vive a sua vida curta.

| Entrada | Efeito no fundo | Efeito na flor |
| --- | --- | --- |
| Volume | ondas a partir do centro, brilho | abre todas as pétalas e sobe a exposição |
| Graves | amplitude da deformação | endireita a corola, ondula a borda, e acima de 0,28 **descola pontos da borda para dentro, que sobem e se desfazem em fumo colorido** |
| Médios | deslocamento de cor | onda que corre à volta das pétalas e realce na orla |
| Agudos | — | acende o miolo e faz cintilar os pontos da corola |
| Batidas | flash | onda que viaja da borda ao centro e um empurrão na rotação |
| Giroscópio | move o centro das formas (a posição ao ativar vira o zero) | inclina a flor em 3/4 |
| Mouse / toque | mesmo efeito do giroscópio | mesmo efeito do giroscópio, para telas sem sensor |

O contraste da corola vem da luz por ponto: cada ponto é iluminado pela sua própria normal, com uma face clara, uma sombra funda (`0,02` contra `2,30`), a luz que atravessa a pétala fina por detrás e a orla acesa quando o ponto está visto de topo. É isso que faz a nuvem ler como pétalas translúcidas e não como mancha.

O slider **Intensidade da nuvem de pontos** é um ganho sobre a nuvem toda, levado ao shader pelo uniforme `u_cloud`: `0` apaga a flor (fica só o fundo), `1` é o valor desenhado, `2` duplica o brilho e dá um quarto mais de tamanho a cada ponto. Não altera o fundo. No console: `v1su4rtShaders.setCloudIntensity(0.5)`.

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

## Publicar no Vercel

O `vercel.json` já declara o projeto como estático (sem framework, sem build, saída na raiz), então basta:

1. Importar o repositório em [vercel.com/new](https://vercel.com/new).
2. Não tocar em nenhuma opção de build — a deteção já vem certa.
3. Deploy. O HTTPS é automático, e é isso que permite o microfone e o giroscópio no celular.

O `service-worker.js` é servido com `no-store` para o Vercel não o cachear e prender os utilizadores numa versão velha. Os `.md`, `.slnx`, `scripts/` e `.vs/` ficam fora do deploy pelo `.vercelignore`.

## Publicar no GitHub Pages

1. Envie os arquivos para a raiz do repositório.
2. **Settings → Pages → Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Abra o endereço `https://` gerado no celular.

## Mapa do projeto

| Onde mudar o quê | Ficheiro |
| --- | --- |
| Cor, luz, contraste, transparência, tamanho dos pontos, fumo, fundo | [`assets/shaders.glsl.js`](assets/shaders.glsl.js) — texto GLSL puro |
| Forma da flor: voltas, pétalas, folhas, densidade da nuvem | [`assets/shaders.js`](assets/shaders.js) — `WHORLS`, `LEAVES`, `buildCloud()` |
| Bandas de frequência, portas, suavização, giroscópio | [`assets/interaction.js`](assets/interaction.js) |
| Painel, sliders, ligação dos sensores ao renderizador | [`assets/app.js`](assets/app.js) |
| Layout responsivo do painel | [`assets/styles.css`](assets/styles.css) |
| Estrutura da página, ordem dos scripts | [`index.html`](index.html) |
| Cache offline, versão do deploy | [`service-worker.js`](service-worker.js) — `CACHE_NAME` |
| Cache-Control e deteção de static no Vercel | [`vercel.json`](vercel.json) |
| O que vai no deploy do Vercel | [`.vercelignore`](.vercelignore) |
| Histórico das mudanças | [`CHANGELOG.md`](CHANGELOG.md) |

- `assets/shaders.glsl.js` são os quatro shaders em texto (`VERTEX_BG`, `FRAGMENT_BG`, `VERTEX_POINTS`, `FRAGMENT_POINTS`). É carregado **antes** de `shaders.js`, que só os lê de `window.v1su4rtGlsl`. Quase todo o ajuste visual acontece aqui, e nenhum precisador do renderizador muda.
- `assets/shaders.js` constrói a geometria em CPU e desenha. Cada ponto leva posição, cor, normal e semente; o resto é feito no shader. **Atenção ao `mediump`:** no celular o passo é 2⁻¹⁰, por isso a fase `age` é dobrada na CPU antes de ir para o shader.
- `service-worker.js`: cache-first. Ao mudar qualquer arquivo em `APP_FILES`, aumente `CACHE_NAME` e registe a mudança no `CHANGELOG.md`.
- `manifest.webmanifest`, `icon.svg`, `icons/`: instalação como app.
- `privacy.html`: nota de privacidade.
- `scripts/deploy.ps1`: stage, commit e push.
- `ESF-01.slnx`: agrupa os arquivos no Visual Studio 2026.
- `TESTES.md`: roteiro de testes manuais.

Ordem de carregamento: `shaders.glsl.js` → `shaders.js` → `interaction.js` → `app.js`, todas com `defer`.

## Problemas comuns

- **Versão antiga aparecendo:** aumente `CACHE_NAME` no `service-worker.js`, ou desregistre em DevTools → Application → Service Workers. Em desenvolvimento, active **Disable cache** no DevTools: o service worker deixa passar pedidos que peçam recarregamento forçado.
- **Microfone sem reação:** permissões do site, HTTPS, e aumente **Sensibilidade áudio**.
- **Giroscópio sem reação:** no iOS a permissão de movimento só é pedida ao tocar em **Ativar interações**; se negada, recarregue a página.
