/* v1su4rt — renderizador WebGL: fundo animado + flor em malha 3D.
   Fundo: gradiente radial deslocado pela inclinação, ondas com graves, cor com médios.
   Flor: pétalas em voltas, miolo, filetes, sépalas, caule e folhas; luz, transparência
         e névoa de profundidade. O som abre a flor por raio: borda=graves, centro=agudos. */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /* ========== SHADERS ========== */

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

  vec3 col = mix(
    vec3(0.02, 0.02, 0.05),
    vec3(0.08, 0.05, 0.15),
    smoothstep(0.0, 1.0, r)
  );

  // respiração lenta do fundo + flash nas batidas
  col += vec3(0.05, 0.02, 0.08) * (0.3 + 0.2 * sin(t * 0.5));
  col += vec3(0.10, 0.04, 0.12) * u_pulse;

  // ondas: os graves mandam na amplitude, o volume no brilho
  float wave = sin(r * (5.0 + u_bass * 6.0) - t) * (0.06 + u_bass * 0.14);
  col += vec3(0.10, 0.05, 0.15) * wave * (0.4 + u_audio);

  // os médios deslocam a cor
  col.r += u_mid * 0.06;
  col.b -= u_mid * 0.04;

  // grão muito baixo
  col += (hash21(v_uv + t * 0.1) - 0.5) * 0.01;

  gl_FragColor = vec4(col, 1.0);
}
`;

  // Os dois estágios têm de declarar a MESMA precisão: os uniformes e os
  // varying partilhados não podem ter precisões diferentes entre eles.
  const VERTEX_MESH = `
precision mediump float;

attribute vec3 a_pos;
attribute vec3 a_norm;
attribute vec3 a_color;
attribute float a_rad;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform mat4 u_model;
uniform mat3 u_normalMat;
uniform float u_time;
uniform float u_audio;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_pulse;

varying vec3 v_color;
varying vec3 v_norm;
varying vec3 v_world;
varying float v_rad;

void main() {
  vec3 p = a_pos;
  float r = a_rad;
  vec2 dir = normalize(vec2(p.x, p.z) + vec2(0.0001));

  // abrir: os graves endireitam as pétalas, o volume puxa todas
  float open = u_bass * 0.30 + u_audio * 0.10;

  // onda que corre da borda para o centro a cada batida
  float ripple = sin(r * 9.0 - u_time * 5.5) * u_pulse * 0.075;

  // respiração espectral: agudos no centro, graves na borda
  float breath = mix(u_treble, u_bass, r) * 0.10;

  // tremor fino dos médios
  float shimmer = sin(p.y * 18.0 + u_time * 3.0 + r * 12.0) * u_mid * 0.012;

  // vaga que corre à volta da corola: os médios fazem as pétalas ondular em azimute
  float az = atan(p.z, p.x + 0.0001);
  float sway = sin(az * 6.0 + u_time * 2.2) * u_mid * 0.035;

  p.xz += dir * (open + breath) * r * 0.55;
  p.y += ripple + open * 0.42 * r + shimmer + sway * (0.25 + r);

  vec4 world = u_model * vec4(p, 1.0);
  v_world = world.xyz;
  v_norm = normalize(u_normalMat * a_norm);
  v_color = a_color;
  v_rad = r;

  gl_Position = u_proj * u_view * world;
}
`;

  const FRAGMENT_MESH = `
precision mediump float;

uniform vec3 u_eye;
uniform float u_audio;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_pulse;

varying vec3 v_color;
varying vec3 v_norm;
varying vec3 v_world;
varying float v_rad;

void main() {
  vec3 N = normalize(v_norm);
  vec3 V = normalize(u_eye - v_world);

  // pétalas finas: a normal vira sempre para quem vê, dos dois lados
  float face = step(0.0, dot(N, V)) * 2.0 - 1.0;
  N *= face;

  vec3 L = normalize(vec3(0.45, 0.85, 0.35));
  vec3 H = normalize(L + V);

  float diff = max(dot(N, L), 0.0);
  // luz de preenchimento vinda da câmara: as pétalas viradas a quem vê não ficam pretas
  float fill = max(dot(N, V), 0.0);
  // luz atravessada: vista por detrás, a pétala acende como vidro colorido
  float trans = pow(max(dot(-N, L), 0.0), 3.0);
  float spec = pow(max(dot(N, H), 0.0), 28.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  // espectro por raio: borda = graves, centro = agudos
  float t = clamp(v_rad, 0.0, 1.0);
  float band = mix(u_treble, u_bass, t);

  vec3 col = v_color * (0.42 + diff * 0.80 + fill * 0.30);
  col += v_color * trans * (0.15 + band * 1.05);
  col += vec3(1.0, 0.92, 0.82) * spec * (0.30 + u_treble * 0.55);
  col += mix(vec3(0.85, 0.20, 0.75), vec3(1.0, 0.55, 0.22), t) * fres * (0.18 + u_mid * 0.75);
  col += v_color * u_pulse * (0.30 + 0.62 * t);

  // matizes por banda: multiplicativo, por isso ganha intensidade sem lavar a cor
  col *= mix(vec3(1.0), vec3(1.24, 0.72, 1.14), clamp(u_treble, 0.0, 1.0) * 0.45);
  col *= mix(vec3(1.0), vec3(1.14, 1.00, 0.76), clamp(u_bass, 0.0, 1.0) * 0.35);
  col *= 0.95 + u_audio * 0.35;

  // névoa de profundidade: separa a flor do fundo e dá volume, mas deixa
  // ver o caule (que fica longe por causa da perspectiva)
  float depth = length(u_eye - v_world);
  col = mix(col, vec3(0.05, 0.04, 0.10), smoothstep(3.6, 8.0, depth));

  // tone mapping: segura os realces sem estourar o vermelho
  col = vec3(1.0) - exp(-col * 1.75);

  gl_FragColor = vec4(col, 1.0);
}
`;

  const VERTEX_POINTS = `
precision mediump float;

attribute vec3 a_pos;
attribute float a_rad;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform mat4 u_model;
uniform float u_time;
uniform float u_treble;
uniform float u_pulse;
uniform float u_dpr;
uniform float u_cloud;

varying float v_rad;
varying float v_twinkle;

void main() {
  vec3 p = a_pos;
  float r = clamp(a_rad, 0.0, 1.0);

  // deriva em espiral, sobe nas batidas
  float ph = u_time * (0.35 + u_treble * 1.2) + r * 6.2831;
  p.x += sin(ph) * 0.07;
  p.z += cos(ph * 0.9) * 0.07;
  p.y += sin(u_time * 0.9 + r * 7.0) * 0.10 + u_pulse * 0.16;

  v_rad = r;
  v_twinkle = 0.35 + 0.65 * (0.5 + 0.5 * sin(u_time * 6.0 + r * 40.0));

  gl_Position = u_proj * u_view * u_model * vec4(p, 1.0);
  // u_cloud = 1 mantém o tamanho original; 0,55..1,45 cobre o curso do controlo
  gl_PointSize = (2.0 + u_treble * 9.0 + u_pulse * 5.0) * (0.6 + 0.4 * r) * u_dpr * (0.55 + 0.45 * u_cloud);
}
`;

  const FRAGMENT_POINTS = `
precision mediump float;

uniform float u_treble;
uniform float u_cloud;

varying float v_rad;
varying float v_twinkle;

void main() {
  // sprite redondo e suave
  float d = length(gl_PointCoord - vec2(0.5));
  float a = smoothstep(0.5, 0.06, d) * v_twinkle * (0.22 + u_treble * 0.95) * u_cloud;
  if (a < 0.02) discard;

  vec3 col = mix(vec3(1.0, 0.86, 0.45), vec3(1.0, 0.50, 0.86), v_rad);
  gl_FragColor = vec4(col, a);
}
`;

  /* ========== GEOMETRIA ========== */

  // Lâmina (pétala ou folha): perfil ao longo do comprimento, curvatura e copo,
  // depois levantada em torno de X e rodada em torno do eixo Y pela azimute.
  function bladeSampler(o, azimuth) {
    const ct = Math.cos(o.tilt);
    const st = Math.sin(o.tilt);
    const ca = Math.cos(azimuth);
    const sa = Math.sin(azimuth);
    return function (u, v01) {
      const v = v01 - 0.5;
      const profile = Math.pow(u, o.round) * (1 - o.tip * Math.pow(u, o.tipPow));
      const x = v * o.width * profile;
      const z = o.radius + u * o.length;
      const y = o.curl * o.length * u * u + o.cup * o.width * 4 * v * v + o.twist * o.length * u * v;
      const yy = y * ct + z * st + o.y;
      const zz = -y * st + z * ct;
      return [x * ca + zz * sa, yy, -x * sa + zz * ca + o.zoff];
    };
  }

  function bladeColor(a, b) {
    return function (u, v) {
      const k = Math.pow(u, 0.8);
      const midrib = 1 + 0.30 * Math.exp(-(v * v) / 0.010);
      const edge = 1 - 0.22 * Math.pow(Math.abs(v) * 2, 3);
      const f = midrib * edge;
      return [
        clamp(a[0] + (b[0] - a[0]) * k, 0, 1.2) * f,
        clamp(a[1] + (b[1] - a[1]) * k, 0, 1.2) * f,
        clamp(a[2] + (b[2] - a[2]) * k, 0, 1.2) * f,
      ];
    };
  }

  // voltas de pétalas, de fora (deitada) para dentro (direita)
  const WHORLS = [
    { count: 13, radius: 0.160, length: 0.95, width: 0.215, tilt: 0.30, curl: 0.10, cup: 0.16, twist: 0.050, base: [0.30, 0.04, 0.13], tipCol: [0.86, 0.17, 0.30] },
    { count: 11, radius: 0.135, length: 0.76, width: 0.195, tilt: 0.52, curl: 0.13, cup: 0.20, twist: 0.045, base: [0.36, 0.05, 0.15], tipCol: [0.92, 0.24, 0.38] },
    { count: 9, radius: 0.105, length: 0.58, width: 0.168, tilt: 0.74, curl: 0.16, cup: 0.24, twist: 0.040, base: [0.42, 0.07, 0.17], tipCol: [0.97, 0.34, 0.48] },
    { count: 7, radius: 0.075, length: 0.42, width: 0.135, tilt: 0.98, curl: 0.20, cup: 0.28, twist: 0.035, base: [0.50, 0.10, 0.20], tipCol: [1.00, 0.46, 0.58] },
    { count: 5, radius: 0.045, length: 0.28, width: 0.105, tilt: 1.22, curl: 0.24, cup: 0.32, twist: 0.030, base: [0.58, 0.14, 0.22], tipCol: [1.00, 0.60, 0.70] },
  ];

  const BLADE_OPTS = { round: 0.40, tip: 0.42, tipPow: 4, y: 0, zoff: 0 };

  // folhas presas ao caule; zoff acompanha a curva do caule à altura de cada uma
  const LEAVES = [
    { az: 0.7, y: -0.55, zoff: 0.03, length: 0.46, width: 0.24, tilt: 0.16, curl: -0.10, cup: 0.12, twist: 0.03 },
    { az: 2.7, y: -0.80, zoff: 0.06, length: 0.40, width: 0.215, tilt: 0.12, curl: -0.12, cup: 0.12, twist: -0.03 },
    { az: 4.5, y: -1.06, zoff: 0.10, length: 0.34, width: 0.185, tilt: 0.08, curl: -0.14, cup: 0.12, twist: 0.03 },
    { az: 5.7, y: -1.34, zoff: 0.17, length: 0.30, width: 0.165, tilt: 0.05, curl: -0.16, cup: 0.12, twist: -0.03 },
  ];

  function newGeo() {
    return { pos: [], nrm: [], col: [], rad: [], idx: [] };
  }

  // adiciona uma superfície parametrizada; normais por diferenças finitas
  function addSurface(g, nu, nv, sampler, colorFn, radFn) {
    const eps = 0.001;
    const start = g.pos.length / 3;
    const row = nv + 1;

    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        const p = sampler(u, v);
        const pu = sampler(c01(u + eps), v);
        const mu = sampler(c01(u - eps), v);
        const pv = sampler(u, c01(v + eps));
        const mv = sampler(u, c01(v - eps));

        const du = [pu[0] - mu[0], pu[1] - mu[1], pu[2] - mu[2]];
        const dv = [pv[0] - mv[0], pv[1] - mv[1], pv[2] - mv[2]];
        const n = normalize3(cross3(du, dv));

        const c = colorFn(u, v);
        g.pos.push(p[0], p[1], p[2]);
        g.nrm.push(n[0], n[1], n[2]);
        g.col.push(c[0], c[1], c[2]);
        g.rad.push(radFn(u, v));
      }
    }

    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = start + i * row + j;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        g.idx.push(a, c, b, b, c, d);
      }
    }
  }

  // filetes: tubo fino que sai do miolo e inclina para fora, com antera na ponta
  function stamenSampler(azimuth, lean, len) {
    const ca = Math.cos(azimuth);
    const sa = Math.sin(azimuth);
    const ex = Math.sin(lean);
    const ey = Math.cos(lean);
    return function (u, v) {
      const phi = v * Math.PI * 2;
      const bulb = Math.exp(-Math.pow((u - 0.94) * 7.0, 2));
      const rad = 0.007 + 0.006 * u + 0.016 * bulb;
      const along = u * len;
      const radial = ex * along + ey * Math.cos(phi) * rad;
      const vertical = ey * along - ex * Math.cos(phi) * rad;
      const tangential = Math.sin(phi) * rad;
      return [ca * radial - sa * tangential, vertical, sa * radial + ca * tangential];
    };
  }

  function buildFlower() {
    const g = newGeo();
    const blade = Object.create(BLADE_OPTS);

    // 5 voltas de pétalas, cada volta meia azimute da anterior
    WHORLS.forEach(function (w, wi) {
      const offset = wi * (Math.PI / w.count);
      for (let i = 0; i < w.count; i++) {
        blade.radius = w.radius;
        blade.length = w.length;
        blade.width = w.width;
        blade.tilt = w.tilt;
        blade.curl = w.curl;
        blade.cup = w.cup;
        blade.twist = w.twist * (i % 2 ? 1 : -1);
        blade.round = BLADE_OPTS.round;
        blade.tip = BLADE_OPTS.tip;
        blade.tipPow = BLADE_OPTS.tipPow;
        blade.y = 0;
        blade.zoff = 0;

        const az = offset + (i / w.count) * Math.PI * 2;
        addSurface(
          g,
          9,
          6,
          bladeSampler(blade, az),
          bladeColor(w.base, w.tipCol),
          function (u) { return c01((w.radius + u * w.length) / 1.15); }
        );
      }
    });

    // sépalas: cinco lâminas verdes na base da corola
    for (let i = 0; i < 5; i++) {
      blade.radius = 0.05;
      blade.length = 0.30;
      blade.width = 0.11;
      blade.tilt = 0.22;
      blade.curl = 0.05;
      blade.cup = 0.22;
      blade.twist = 0.02;
      blade.round = 0.45;
      blade.tip = 0.55;
      blade.tipPow = 5;
      blade.y = -0.10;
      blade.zoff = 0;
      addSurface(
        g,
        7,
        5,
        bladeSampler(blade, (i / 5) * Math.PI * 2 + 0.4),
        bladeColor([0.08, 0.26, 0.06], [0.26, 0.52, 0.14]),
        function () { return 0.02; }
      );
    }

    // miolo: domo alaranjado coberto de sementes
    addSurface(
      g,
      6,
      18,
      function (u, v) {
        const th = u * Math.PI * 0.55;
        const phi = v * Math.PI * 2;
        const rr = 0.175 * Math.sin(th);
        const yy = 0.205 * Math.cos(th) - 0.015;
        const seed = 0.006 * Math.sin(phi * 9.0) * Math.sin(th * 5.0);
        return [Math.cos(phi) * (rr + seed), yy, Math.sin(phi) * (rr + seed)];
      },
      function (u, v) {
        const k = 1 - u;
        const speck = 0.75 + 0.25 * Math.sin(v * Math.PI * 2 * 11.0) * Math.sin(u * Math.PI * 4.0);
        return [(0.50 + 0.45 * k) * speck, (0.26 + 0.30 * k) * speck, 0.05 + 0.06 * u];
      },
      function () { return 0.05; }
    );

    // filetes à volta do miolo
    for (let i = 0; i < 20; i++) {
      const az = (i / 20) * Math.PI * 2 + 0.15;
      const lean = 0.34 + 0.12 * Math.sin(i * 2.3);
      const len = 0.30 + 0.07 * Math.cos(i * 1.7);
      addSurface(
        g,
        5,
        5,
        stamenSampler(az, lean, len),
        function (u) {
          const head = Math.pow(c01((u - 0.55) / 0.45), 2);
          return [0.45 + 0.55 * head, 0.52 - 0.16 * head, 0.20 - 0.14 * head];
        },
        function (u) { return 0.02 + u * 0.10; }
      );
    }

    // caule: comprido e curvado para a frente, para se ver inteiro em 3/4
    addSurface(
      g,
      14,
      8,
      function (u, v) {
        const phi = v * Math.PI * 2;
        const y = -1.72 + u * 1.66;
        const rr = 0.036 - 0.016 * u;
        // o pé vem para a câmara: sem isto o caule foge para trás e desaparece
        const zc = 0.30 * (1 - u) * (1 - u);
        const xc = Math.sin(u * 2.2) * 0.045;
        return [Math.cos(phi) * rr + xc, y, Math.sin(phi) * rr + zc];
      },
      function (u, v) {
        const lit = 0.7 + 0.3 * Math.cos(v * Math.PI * 2);
        return [0.13 * lit, (0.44 + 0.12 * u) * lit, 0.11 * lit];
      },
      function () { return 0.0; }
    );

    // folhas presas ao caule: a_rad alto, por isso tremem com os graves
    LEAVES.forEach(function (L) {
      blade.radius = 0.04;
      blade.length = L.length;
      blade.width = L.width;
      blade.tilt = L.tilt;
      blade.curl = L.curl;
      blade.cup = L.cup;
      blade.twist = L.twist;
      blade.round = 0.38;
      blade.tip = 0.50;
      blade.tipPow = 4;
      blade.y = L.y;
      blade.zoff = L.zoff;
      addSurface(
        g,
        8,
        6,
        bladeSampler(blade, L.az),
        bladeColor([0.07, 0.24, 0.06], [0.26, 0.56, 0.16]),
        function () { return 0.90; }
      );
    });

    return {
      pos: new Float32Array(g.pos),
      nrm: new Float32Array(g.nrm),
      col: new Float32Array(g.col),
      rad: new Float32Array(g.rad),
      idx: new Uint16Array(g.idx),
      count: g.idx.length,
    };
  }

  // grão de pólen: pontos aditivos que flutuam sobre a corola
  function buildPollen(n) {
    const pos = new Float32Array(n * 3);
    const rad = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const az = Math.random() * Math.PI * 2;
      const rr = 0.12 + Math.pow(Math.random(), 0.7) * 0.62;
      pos[i * 3] = Math.cos(az) * rr;
      pos[i * 3 + 1] = 0.05 + Math.random() * 0.55;
      pos[i * 3 + 2] = Math.sin(az) * rr;
      rad[i] = c01(rr / 0.74);
    }
    return { pos: pos, rad: rad, count: n };
  }

  /* ========== ESTADO ========== */

  let gl = null;
  let canvas = null;
  let driver = null;
  let raf = 0;
  let rendererMode = 'webgl';

  let progBg = null;
  let progMesh = null;
  let progPoints = null;
  let bgBuffer = null;
  let mesh = null;
  let pollen = null;

  let time = 0;
  let timeScale = 1;
  let spin = 0;
  let lastFrameTime = 0;

  const eye = [0, 0, 3.5];

  let proj = identity();
  let view = lookAt(eye, [0, 0, 0], [0, 1, 0]);

  let quality = 1; // cai quando os fps não chegam
  let fpsAvg = 60;
  let lastTune = 0;
  let pixelScale = 1;

  const state = { audio: 0, bass: 0, mid: 0, treble: 0, pulse: 0, tiltX: 0, tiltY: 0, cloud: 1 };

  /* ========== GL ========== */

  function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[v1su4rt] Shader error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function buildProgram(vsSrc, fsSrc, attribs, uniforms) {
    const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;

    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('[v1su4rt] Link error:', gl.getProgramInfoLog(p));
      gl.deleteProgram(p);
      return null;
    }

    const prog = { program: p, attrib: {}, uniform: {} };
    attribs.forEach((n) => { prog.attrib[n] = gl.getAttribLocation(p, n); });
    uniforms.forEach((n) => { prog.uniform[n] = gl.getUniformLocation(p, n); });
    return prog;
  }

  function staticBuffer(target, data) {
    const b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  }

  function initGL() {
    if (!canvas) {
      console.warn('[v1su4rt] canvas #stage não encontrado');
      return false;
    }

    const opts = { alpha: false, antialias: true, depth: true, stencil: false, powerPreference: 'high-performance' };
    try {
      gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    } catch (e) {
      console.error('[v1su4rt] WebGL indisponível:', e);
      return false;
    }
    if (!gl) return false;

    progBg = buildProgram(VERTEX_BG, FRAGMENT_BG, ['a_pos'], ['u_time', 'u_audio', 'u_bass', 'u_mid', 'u_pulse', 'u_tilt']);
    progMesh = buildProgram(
      VERTEX_MESH,
      FRAGMENT_MESH,
      ['a_pos', 'a_norm', 'a_color', 'a_rad'],
      ['u_proj', 'u_view', 'u_model', 'u_normalMat', 'u_eye', 'u_time', 'u_audio', 'u_bass', 'u_mid', 'u_treble', 'u_pulse']
    );
    progPoints = buildProgram(
      VERTEX_POINTS,
      FRAGMENT_POINTS,
      ['a_pos', 'a_rad'],
      ['u_proj', 'u_view', 'u_model', 'u_time', 'u_treble', 'u_pulse', 'u_dpr', 'u_cloud']
    );
    if (!progBg || !progMesh || !progPoints) return false;

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.02, 0.02, 0.05, 1.0);

    // tudo criado uma única vez: nada de buffers novos por frame
    bgBuffer = staticBuffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));

    const f = buildFlower();
    mesh = {
      pos: staticBuffer(gl.ARRAY_BUFFER, f.pos),
      nrm: staticBuffer(gl.ARRAY_BUFFER, f.nrm),
      col: staticBuffer(gl.ARRAY_BUFFER, f.col),
      rad: staticBuffer(gl.ARRAY_BUFFER, f.rad),
      idx: staticBuffer(gl.ELEMENT_ARRAY_BUFFER, f.idx),
      count: f.count,
    };

    const pl = buildPollen(140);
    pollen = {
      pos: staticBuffer(gl.ARRAY_BUFFER, pl.pos),
      rad: staticBuffer(gl.ARRAY_BUFFER, pl.rad),
      count: pl.count,
    };

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    resize();
    return true;
  }

  /* Resolução interna: limitada por breakpoint e degradada quando faltam fps. */
  function targetScale() {
    const w = window.innerWidth;
    const cap = w < 640 ? 1.5 : w < 1024 ? 1.75 : 2;
    return Math.min(window.devicePixelRatio || 1, cap) * quality;
  }

  function resize() {
    const scale = targetScale();
    const w = Math.max(1, Math.round(canvas.clientWidth * scale));
    const h = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      proj = perspective(45, w / h, 0.1, 100);
      view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    }
    pixelScale = scale;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function tuneQuality(dt) {
    fpsAvg += (1 / dt - fpsAvg) * 0.05;
    const now = performance.now();
    if (now - lastTune < 1000) return;
    lastTune = now;
    if (fpsAvg < 40 && quality > 0.5) quality = Math.max(0.5, quality - 0.1);
    else if (fpsAvg > 55 && quality < 1) quality = Math.min(1, quality + 0.05);
  }

  /* ========== RENDER ========== */

  function drawBackground() {
    const p = progBg;
    gl.useProgram(p.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, bgBuffer);
    gl.enableVertexAttribArray(p.attrib.a_pos);
    gl.vertexAttribPointer(p.attrib.a_pos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(p.uniform.u_time, time);
    gl.uniform1f(p.uniform.u_audio, state.audio);
    gl.uniform1f(p.uniform.u_bass, state.bass);
    gl.uniform1f(p.uniform.u_mid, state.mid);
    gl.uniform1f(p.uniform.u_pulse, state.pulse);
    gl.uniform2f(p.uniform.u_tilt, state.tiltX, state.tiltY);

    // o quad ocupa o ecrã todo a profundidade 0.5: se escrever no depth buffer
    // tapa tudo o que estiver mais longe, incluindo a flor
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }

  function setMeshMatrices(p, model) {
    gl.uniformMatrix4fv(p.uniform.u_proj, false, proj);
    gl.uniformMatrix4fv(p.uniform.u_view, false, view);
    gl.uniformMatrix4fv(p.uniform.u_model, false, model);
    gl.uniform3f(p.uniform.u_eye, eye[0], eye[1], eye[2]);
  }

  function bindMeshAttrib(p) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
    gl.enableVertexAttribArray(p.attrib.a_pos);
    gl.vertexAttribPointer(p.attrib.a_pos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrm);
    gl.enableVertexAttribArray(p.attrib.a_norm);
    gl.vertexAttribPointer(p.attrib.a_norm, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.col);
    gl.enableVertexAttribArray(p.attrib.a_color);
    gl.vertexAttribPointer(p.attrib.a_color, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.rad);
    gl.enableVertexAttribArray(p.attrib.a_rad);
    gl.vertexAttribPointer(p.attrib.a_rad, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
  }

  function drawFlower(dt) {
    // as batidas dão um empurrão na rotação: a flor acelera e volta ao ritmo
    spin += dt * timeScale * (0.10 + state.audio * 0.22 + state.pulse * 0.45);
    const tx = clamp(state.tiltX, -1.2, 1.2);
    const ty = clamp(state.tiltY, -1.2, 1.2);

    // 3/4: a base de ~1.02 rad (~58°) faz a câmara olhar para dentro da corola,
    // por isso o giroscópio e o rato também inclinam a flor, não só o fundo
    const s = 0.82 * (0.98 + state.audio * 0.04 + state.pulse * 0.02);
    let model = mat4Scale(s, s, s);
    model = multiplyMatrices(mat4RotateY(spin), model);
    model = multiplyMatrices(mat4RotateZ(tx * 0.25), model);
    // os graves fazem a flor inclinar-se para a frente
    model = multiplyMatrices(mat4RotateX(1.02 + ty * 0.25 - state.bass * 0.10), model);
    model = multiplyMatrices(mat4Translate(0, 0.04, 0), model);

    const p = progMesh;
    gl.useProgram(p.program);
    setMeshMatrices(p, model);
    gl.uniformMatrix3fv(p.uniform.u_normalMat, false, mat3FromMat4(model));
    gl.uniform1f(p.uniform.u_time, time);
    gl.uniform1f(p.uniform.u_audio, state.audio);
    gl.uniform1f(p.uniform.u_bass, state.bass);
    gl.uniform1f(p.uniform.u_mid, state.mid);
    gl.uniform1f(p.uniform.u_treble, state.treble);
    gl.uniform1f(p.uniform.u_pulse, state.pulse);
    bindMeshAttrib(p);

    gl.depthMask(true);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);

    drawPollen(model);
  }

  function drawPollen(model) {
    // intensidade a zero: nem se envia o draw call
    if (state.cloud <= 0.001) return;
    const p = progPoints;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.uniform.u_proj, false, proj);
    gl.uniformMatrix4fv(p.uniform.u_view, false, view);
    gl.uniformMatrix4fv(p.uniform.u_model, false, model);
    gl.uniform1f(p.uniform.u_time, time);
    gl.uniform1f(p.uniform.u_treble, state.treble);
    gl.uniform1f(p.uniform.u_pulse, state.pulse);
    gl.uniform1f(p.uniform.u_dpr, pixelScale);
    gl.uniform1f(p.uniform.u_cloud, state.cloud);

    gl.bindBuffer(gl.ARRAY_BUFFER, pollen.pos);
    gl.enableVertexAttribArray(p.attrib.a_pos);
    gl.vertexAttribPointer(p.attrib.a_pos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, pollen.rad);
    gl.enableVertexAttribArray(p.attrib.a_rad);
    gl.vertexAttribPointer(p.attrib.a_rad, 1, gl.FLOAT, false, 0, 0);

    // aditivo, sem escrever profundidade: brilho por cima de tudo
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, pollen.count);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = clamp((now - lastFrameTime) / 1000, 0.001, 0.1);
    lastFrameTime = now;

    if (driver) {
      const s = driver(dt);
      if (s) applyState(s);
    }

    time += dt * timeScale;
    tuneQuality(dt);
    resize();

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawBackground();
    drawFlower(dt);
  }

  /* ========== MATH (column-major) ========== */

  function identity() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan((fov * Math.PI) / 360);
    const nf = 1 / (near - far);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ];
  }

  // Convenção OpenGL: o que está à frente da câmara tem z negativo.
  function lookAt(e, center, up) {
    const f = normalize3([center[0] - e[0], center[1] - e[1], center[2] - e[2]]);
    const s = normalize3(cross3(f, up));
    const u = cross3(s, f);
    return [
      s[0], u[0], -f[0], 0,
      s[1], u[1], -f[1], 0,
      s[2], u[2], -f[2], 0,
      -dot3(s, e), -dot3(u, e), dot3(f, e), 1,
    ];
  }

  function cross3(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  function normalize3(v) {
    const len = Math.sqrt(dot3(v, v)) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  function mat4Translate(x, y, z) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  }

  function mat4RotateX(ang) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  }

  function mat4RotateY(ang) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  }

  function mat4RotateZ(ang) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  function mat4Scale(x, y, z) {
    return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
  }

  // GLSL ES 1.00 não constrói mat3 a partir de mat4: a extracção é feita aqui.
  // A escala é uniforme, por isso basta a parte de rotação.
  function mat3FromMat4(m) {
    return [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  }

  function multiplyMatrices(a, b) {
    const out = new Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  /* ========== ENTRADA DE DADOS ========== */

  function applyState(obj) {
    state.audio = Math.max(0, obj.audio || 0);
    state.bass = Math.max(0, obj.bass || 0);
    state.mid = Math.max(0, obj.mid || 0);
    state.treble = Math.max(0, obj.treble || 0);
    state.pulse = Math.max(0, obj.pulse || 0);
    if (obj.tilt) {
      state.tiltX = obj.tilt[0] || 0;
      state.tiltY = obj.tilt[1] || 0;
    }
  }

  /* readFrame(dt) devolve o estado dos sensores de cada frame. */
  window.v1su4rtShaders = {
    init: function (canvasId, readFrame) {
      canvas = document.getElementById(canvasId || 'stage');
      driver = typeof readFrame === 'function' ? readFrame : null;
      if (!initGL()) {
        rendererMode = 'none';
        return false;
      }
      lastFrameTime = performance.now();
      frame(lastFrameTime);
      return true;
    },
    setTimeScale: function (k) { timeScale = clamp(k, 0.05, 4); },
    // ganho da nuvem de pontos: 0 apaga, 1 é o valor desenhado, 2 duplica o brilho
    setCloudIntensity: function (v) { state.cloud = clamp(Number(v) || 0, 0, 2); },
    cloudIntensity: function () { return state.cloud; },
    stop: function () {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    renderer: function () { return rendererMode; }
  };
})();
