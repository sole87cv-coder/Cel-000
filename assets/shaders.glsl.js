/* v1su4rt — o texto dos shaders GLSL, separado do renderizador.
   É aqui que se mexe no visual: o fundo (VERTEX_BG / FRAGMENT_BG) e a nuvem de
   pontos (VERTEX_POINTS / FRAGMENT_POINTS). Este ficheiro carrega antes de
   shaders.js, que lê window.v1su4rtGlsl.
   Precisão: uniform e varying partilhados entre os dois estágios têm de declarar a
   MESMA precisão — o estágio de vértice garante highp, o de fragmento não, por isso
   v_a e v_col são mediump dos dois lados. E mediump num telemóvel é um passo de
   2^-10: uma fase grande (t / LIFE) tem de vir pronta de fora, nunca calculada aqui,
   senão a nuvem de pontos granula em passos visíveis. */
(function () {
  'use strict';

  const VERTEX_BG = `
precision mediump float;

attribute vec2 a_pos;

varying vec2 v_uv;

void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

  const FRAGMENT_BG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float u_time;
uniform float u_audio;
uniform float u_bass;
uniform float u_mid;
uniform float u_pulse;
uniform vec2 u_tilt;

varying vec2 v_uv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  float t = u_time * 0.3;

  // a inclinação empurra o centro das formas
  vec2 center = vec2(0.5) + u_tilt * 0.12;
  float r = length(v_uv - center);

  // O fundo tem de ficar abaixo de L 0,02 quase em todo o ecran: a nuvem de
  // pontos e desenhada em blending aditivo e nao ha forma de ler fumaca luminosa
  // sobre um palco ja aceso. Os valores antigos davam L 0,06 nos cantos.
  vec3 col = mix(
    vec3(0.010, 0.008, 0.022),
    vec3(0.014, 0.010, 0.028),
    smoothstep(0.0, 1.0, r)
  );

  // respiração lenta do fundo + flash nas batidas
  col += vec3(0.008, 0.004, 0.014) * (0.3 + 0.2 * sin(t * 0.5));
  col += vec3(0.030, 0.012, 0.036) * u_pulse;

  // ondas: os graves mandam na amplitude, o volume no brilho
  float wave = sin(r * (5.0 + u_bass * 6.0) - t) * (0.06 + u_bass * 0.14);
  col += vec3(0.10, 0.05, 0.15) * wave * (0.4 + u_audio) * 0.35;

  // os médios deslocam a cor
  col.r += u_mid * 0.018;
  col.b -= u_mid * 0.012;

  // grão muito baixo
  col += (hash21(v_uv + t * 0.1) - 0.5) * 0.006;

  gl_FragColor = vec4(col, 1.0);
}
`;

  /* A flor inteira é a nuvem de pontos: cada ponto pertence a uma superfície da
     corola e tem um ciclo de vida, por isso pode descolar e desfazer-se em fumo.

     Contraste e transparência saem da normal da superfície, calculada no vértice:
     a cara iluminada da pétala acende, a cara em sombra fica quase preta, e a luz
     que atravessa a pétala fina faz-la brilhar por detrás. Sobre blending aditivo,
     as camadas somam-se, por isso as pétalas viradas a quem vê ficam translúcidas
     e as vistas de raspão acumulam até ao brilho de orla da fumaça.

     Todo o cálculo vai no vértice e chega ao fragmento como cor e alpha: os termos
     variam ponto a ponto, não píxel a píxel. Este programa não tem uniforms no
     fragmento, pelo que só os varying têm de declarar a MESMA precisão nos dois
     estágios — é isso que permite highp no vértice e mediump no fragmento. */
  const VERTEX_POINTS = `
precision highp float;

attribute vec3 a_pos;
attribute vec3 a_norm;
attribute vec3 a_col;
attribute vec3 a_seed;
attribute float a_rad;
attribute float a_band;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform mat4 u_model;
uniform mat3 u_normalMat;
uniform vec3 u_eye;
uniform float u_time;
uniform float u_audio;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_pulse;
uniform float u_phase;
uniform float u_cloud;
uniform float u_size;
uniform float u_maxPx;

varying mediump vec3 v_col;
varying mediump float v_a;

void main() {
  vec3 p = a_pos;
  float r = clamp(a_rad, 0.0, 1.0);
  float az = atan(p.z, p.x + 0.0001);
  vec2 dir = normalize(vec2(p.x, p.z) + vec2(0.0001));
  float floral = clamp(a_band, 0.0, 1.0);

  // o som mexe na flor toda: abre por raio, ondula a borda nas batidas
  float open = u_bass * 0.30 + u_audio * 0.10;
  float ripple = sin(r * 9.0 - u_time * 5.5) * u_pulse * 0.075;
  float breath = mix(u_treble, u_bass, r) * 0.10;
  float shimmer = sin(p.y * 18.0 + u_time * 3.0 + r * 12.0) * u_mid * 0.012;
  float sway = sin(az * 6.0 + u_time * 2.2) * u_mid * 0.035;
  p.xz += dir * (open + breath) * r * 0.55;
  p.y += ripple + open * 0.42 * r + shimmer + sway * (0.25 + r);

  // fragmentação em fumo: só os graves fortes descolam pontos, e sempre da borda
  // para dentro, porque é a borda que pertence aos graves
  float frag = pow(clamp((u_bass - 0.28) / 0.72, 0.0, 1.0), 1.2) * (0.25 + 0.75 * r) * floral;

  // idade em ciclo: cada ponto tem uma fase diferente, por isso a densidade média
  // da nuvem se mantém constante enquanto cada ponto nasce, cresce e morre
  float age = fract(u_phase + a_seed.x);
  float ex = 1.0 + (0.7 + 3.3 * frag) * age;

  // o puff sai pela normal, puxado para fora do eixo da flor
  vec3 puff = normalize(a_norm * 0.7 + vec3(dir.x, 0.30, dir.y) * 0.7);
  p += puff * (0.035 + 0.60 * frag) * age * (0.30 + 0.70 * floral);

  // tremor turbulento, com duas escalas por eixo
  vec3 sd = a_seed * 11.0;
  p += vec3(
    sin(u_time * 0.70 + sd.y) + 0.5 * sin(u_time * 1.9 + sd.z),
    sin(u_time * 0.53 + sd.z) + 0.5 * sin(u_time * 1.7 + sd.x),
    cos(u_time * 0.61 + sd.x) + 0.5 * cos(u_time * 2.3 + sd.y)
  ) * (0.012 + 0.05 * frag) * age;

  vec4 world = u_model * vec4(p, 1.0);

  // o fumo sobe em espaço do mundo: a rotação da flor não o pode levar consigo
  world.y += age * (0.03 + 0.45 * frag);
  world.x += sin(u_time * 0.31 + sd.x) * 0.07 * frag * age;
  world.z += cos(u_time * 0.27 + sd.z) * 0.07 * frag * age;

  vec4 clip = u_proj * u_view * world;
  gl_Position = clip;
  float depth = max(clip.w, 0.05);

  vec3 N = normalize(u_normalMat * a_norm);
  vec3 V = normalize(u_eye - world.xyz);
  vec3 L = normalize(vec3(0.45, 0.85, 0.35));
  float diff = max(dot(N, L), 0.0);
  float face = abs(dot(N, V));
  float trans = pow(max(dot(-N, L), 0.0), 3.0);
  float fres = pow(1.0 - face, 3.0);
  // cada ponto cintila: os agudos dão a frequência e o centro da corola a intensidade
  float spark = 0.55 + 0.45 * sin(u_time * (2.5 + u_treble * 9.0) + a_seed.y * 40.0);
  float band = mix(u_treble, u_bass, r);

  // CONTRASTE: 0,02 na sombra contra 2,30 na luz — um range de ~115:1 dentro de
  // cada ponto. Numa nuvem de pontos é isso que desenha a nervura e as orlas: as
  // faces viradas à luz ficam claras e as de lado quase só veem o fundo escuro.
  // ORÇAMENTO DE LUZ: com o microfone no teto (bandas todas a 1,0 e sensibilidade
  // 1,5) a flor só pode ir a ~1,8× o brilho do silêncio. Passado isso o acumulado
  // aditivo queima o frame inteiro e a corola deixa de se ver como flor.
  vec3 col = a_col * (0.02 + diff * 2.30);
  // TRANSPARÊNCIA: a luz que atravessa a pétala fina acende-a por detrás, e é esta
  // term que faz as orlas lerem como película atravessada e não como mancha opaca
  col += a_col * trans * (0.65 + band * 0.75);
  // realce de orla: quente e fraco, porque magenta somado em três camadas de
  // pontos lê-se como tinta azulada e lava o vermelho do referente. Fraco de
  // propósito no miolo e forte na borda: é a orla de cada lâmina, vista de topo,
  // que tem de acender para a pétala ler como película atravessada pela luz.
  col += mix(vec3(1.00, 0.58, 0.12), vec3(0.86, 0.24, 0.10), r) * fres * (0.11 + 0.26 * r + u_mid * 0.35);
  col += vec3(0.22, 0.10, 0.04) * u_treble * (1.0 - r) * floral;
  col += vec3(0.10, 0.17, 0.04) * u_mid * (1.0 - r * 0.4) * 0.55;
  col += vec3(0.50, 0.26, 0.10) * u_pulse * (0.30 + 0.50 * r);
  // o fumo já desfeito aclara e perde saturação, como a fumaça apanhada pela luz
  col = mix(col, vec3(0.86, 0.52, 0.30), frag * age * 0.40);
  // o último termo acende as pontas: na nuvem, a borda da corola é uma só camada de
  // pontos e precisa de mais luz por ponto para ler ao mesmo nível do miolo
  col *= 0.62 + u_audio * 0.25 + band * 0.15 + (0.16 + 0.15 * u_treble) * spark * (1.0 - r) + 0.95 * smoothstep(0.42, 0.88, r);

  // névoa de profundidade: sem depth buffer é assim que o lado de trás fica atrás.
  // É forte de propósito: os pontos de trás são os que se empilham sobre os de
  // frente, e sem os abaixar o centro da corola estoura em branco.
  float fog = 1.0 - smoothstep(3.2, 4.6, depth) * 0.82;

  // os pontos da borda são maiores que os do miolo: a corola cobre mais frame sem
  // empilhar mais luz no centro, que é onde tudo se acumula
  float px = (0.0285 + 0.010 * frag * age + 0.006 * a_seed.z) * (0.82 + 0.40 * r) * u_size / depth;
  gl_PointSize = clamp(px * (0.75 + 0.25 * u_cloud), 1.0, u_maxPx);

  // envelope com pico em age 0,238 e energia conservada ao dividir por ex^2;
  // a face-on term faz a pétala virada a quem vê ser mais opaca que a borda,
  // que se acumula com as vizinhas até ao brilho de orla
  float e = pow(max(age, 0.002) / 0.238, 0.5) * pow(max(1.0 - age, 0.002) / 0.762, 1.6);
  float alpha = e / (ex * ex);
  float thin = mix(0.55, 1.0, face * face);
  // afino do centro: só na corola, porque é ali que as cinco voltas, o miolo e os
  // filetes se sobrepõem na projeção; caule e folhas (floral 0) ficam intactos.
  // Vai até r 0,42 porque é toda a zona de bases — com a corola larga, sem isto o
  // centro queima e a flor deixa de ter miolo dourado para passar a borrão branco.
  float coreThin = 1.0 - floral * 0.90 * (1.0 - smoothstep(0.05, 0.42, r));

  v_a = clamp(alpha * thin * coreThin * (0.72 + band * 0.20) * u_cloud * fog, 0.0, 1.0);
  v_col = col * fog;
}
`;

  const FRAGMENT_POINTS = `
precision mediump float;

varying mediump vec3 v_col;
varying mediump float v_a;

void main() {
  // sprite de núcleo quase chato e orla suave: a quatro píxeis um disco plano e um
  // gaussiano são indiferenciáveis, mas o núcleo chato leva o dobro e meio da luz
  // por ponto, que é o que faz a corola inteira ver-se e não só o miolo
  float d = length(gl_PointCoord - vec2(0.5));
  float f = 1.0 - smoothstep(0.30, 0.50, d);
  float a = f * v_a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(v_col * f, a);
}
`;

  window.v1su4rtGlsl = {
    VERTEX_BG: VERTEX_BG,
    FRAGMENT_BG: FRAGMENT_BG,
    VERTEX_POINTS: VERTEX_POINTS,
    FRAGMENT_POINTS: FRAGMENT_POINTS,
  };
})();
