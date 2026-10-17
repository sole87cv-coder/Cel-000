# Histórico

Formato seguido: uma entrada por mudança de visual ou de estrutura, com o `CACHE_NAME`
correspondente do `service-worker.js` — é ele que diz ao browser para deitar fora a
versão guardada.

## 2026-10-17 — flor inteira em nuvem de pontos (`v1su4rt-v13`)

- A flor deixou de ser malha de vértices: é agora uma nuvem de ~47 mil pontos, cada um
  com normal, cor, semente e fase próprias. Não existe `VERTEX_MESH` nem `FRAGMENT_MESH`.
- Contraste e transparência por ponto: sombra a `0,02` contra luz a `2,30`, luz que
  atravessa a pétala fina por detrás e orla acesa quando o ponto é visto de topo.
- Fragmentação em fumo: acima de grave `0,28` a borda descola pontos que sobem e se
  desfazem; a massa de luz sobe ~3,4× e a silhueta alarga ~43% sem queimar o frame.
- Pétalas largas e sobrepostas em cinco voltas, ponta arredondada — a corola lê como
  flor e não como estrela de pontas.
- Fundo escurecido para o aditivo ler; cadeia de áudio corrigida (ganho por banda,
  limites fixos no analisador, tudo limitado a 0..1).
- Organização: o texto GLSL passou para `assets/shaders.glsl.js`; acrescentados
  `vercel.json`, `.vercelignore` e este histórico.

## 2026-10-17 — controlo de intensidade (`v1su4rt-v10`)

- Slider **Intensidade da nuvem de pontos**, levado ao shader pelo uniforme `u_cloud`.

## 2026-10-17 — limpeza do repositório

- Removidos o `Cel-000/` aninhado, `assets/icons/` duplicado e o `.slnx` vazio.
- Corrigidos o clip do fundo em `gl_Position`, a fuga de buffers por frame e o `clear`
  que apagava o desenho; `targetScale()` reposta antes de `resize()`.

## 2026-09-30 — dalia 3D em malha

- Primeira flor em malha de vértices com iluminação, reativa ao microfone.
