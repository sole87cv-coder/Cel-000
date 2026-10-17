/* v1su4rt — renderizador WebGL: fundo animado + flor desenhada em nuvem de pontos.
   Fundo: gradiente radial deslocado pela inclinação, ondas com graves, cor com médios.
   Flor: ~47 mil pontos em cinco voltas de pétalas, miolo, filetes, sépalas, caule e
         folhas; cada ponto é iluminado pela sua normal (claro/escuro, luz atravessada,
         orla) e tem uma fase própria — nasce, cresce e desfaz-se. O som abre a flor por
         raio (borda=graves, centro=agudos) e, em graves fortes, descola pontos da borda
         que sobem e se espalham como fumaça colorida. */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /* ========== SHADERS ========== */

  // O texto GLSL vive em shaders.glsl.js, carregado antes deste ficheiro: assim,
  // para mudar o visual não é preciso atravessar o renderizador.
  const GLSL = window.v1su4rtGlsl;
  if (!GLSL) throw new Error('[v1su4rt] shaders.glsl.js em falta: sem texto GLSL não há renderizador');
  const VERTEX_BG = GLSL.VERTEX_BG;
  const FRAGMENT_BG = GLSL.FRAGMENT_BG;
  const VERTEX_POINTS = GLSL.VERTEX_POINTS;
  const FRAGMENT_POINTS = GLSL.FRAGMENT_POINTS;

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
  // voltas de pétalas, de fora (deitada) para dentro (direita). A paleta segue o
  // referente medido: o centro é ouro escuro (L 0,17, sat 0,90, quase sem azul),
  // a volta mais brilhante fica em ~0,25 do raio da flor (L 0,30) e a partir daí
  // a luz cai até ~0,20 na borda. Dentro de cada pétala a nervura central clara e
  // as orlas escuras é que dão o contraste quando a nuvem é fina.
  // largas e sobrepostas: uma corola de lâminas estreitas lê-se como fogo-de-artifício
  // pontilhado, não como flor. A copa (cup) fecha cada lâmina em calha, e são as
  // calhas encostadas umas às outras que dão o claro-escuro de pétala a pétala.
  const WHORLS = [
    { count: 16, radius: 0.200, length: 0.82, width: 0.400, tilt: 0.34, curl: 0.16, cup: 0.30, twist: 0.050, base: [0.80, 0.12, 0.06], tipCol: [0.46, 0.05, 0.05] },
    { count: 14, radius: 0.170, length: 0.68, width: 0.360, tilt: 0.55, curl: 0.19, cup: 0.34, twist: 0.045, base: [0.90, 0.20, 0.06], tipCol: [0.56, 0.09, 0.05] },
    { count: 11, radius: 0.135, length: 0.52, width: 0.300, tilt: 0.76, curl: 0.22, cup: 0.38, twist: 0.040, base: [0.94, 0.33, 0.06], tipCol: [0.62, 0.14, 0.06] },
    { count: 9, radius: 0.100, length: 0.38, width: 0.250, tilt: 0.98, curl: 0.25, cup: 0.42, twist: 0.035, base: [0.82, 0.35, 0.06], tipCol: [0.72, 0.22, 0.07] },
    { count: 6, radius: 0.060, length: 0.26, width: 0.190, tilt: 1.22, curl: 0.28, cup: 0.46, twist: 0.030, base: [0.60, 0.27, 0.05], tipCol: [0.68, 0.26, 0.05] },
  ];

  // ponta larga (tip pequeno): uma lâmina que afunila muito deixa ver o fundo entre
  // as vizinhas e a flor lê como estrela de pontas, não como corola
  const BLADE_OPTS = { round: 0.35, tip: 0.22, tipPow: 3, y: 0, zoff: 0 };

  // folhas presas ao caule; zoff acompanha a curva do caule à altura de cada uma
  const LEAVES = [
    { az: 0.7, y: -0.55, zoff: 0.03, length: 0.46, width: 0.24, tilt: 0.16, curl: -0.10, cup: 0.12, twist: 0.03 },
    { az: 2.7, y: -0.80, zoff: 0.06, length: 0.40, width: 0.215, tilt: 0.12, curl: -0.12, cup: 0.12, twist: -0.03 },
    { az: 4.5, y: -1.06, zoff: 0.10, length: 0.34, width: 0.185, tilt: 0.08, curl: -0.14, cup: 0.12, twist: 0.03 },
    { az: 5.7, y: -1.34, zoff: 0.17, length: 0.30, width: 0.165, tilt: 0.05, curl: -0.16, cup: 0.12, twist: -0.03 },
  ];

  /* A nuvem é construída sobre as MESMAS superfícies paramétricas da flor: para
     cada superfície faz-se uma grelha com tantas células quanta a sua área, e cai
     um ponto num ponto aleatório de cada célula. A densidade fica uniforme sobre
     toda a flor, e qualquer prefixo da lista é uma amostra representativa dela —
     é isso que permite desenhar menos pontos quando faltam fps sem mudar a
     silhueta. */
  const SPACING = 0.0138; // distância média entre pontos, em unidades de mundo

  function newCloud() {
    return { pos: [], norm: [], col: [], seed: [], rad: [], band: [] };
  }

  function gridFor(area, aspect) {
    const cells = Math.max(6, Math.round(area / (SPACING * SPACING)));
    const nu = Math.max(2, Math.round(Math.sqrt(cells * aspect)));
    const nv = Math.max(2, Math.round(cells / nu));
    return { nu: nu, nv: nv };
  }

  // normais por diferenças finitas; a normal é sempre virada para fora do eixo,
  // porque uma lâmina fina tem duas faces e a que interessa ao fumo é a de fora
  function addCloudSurface(g, nu, nv, sampler, colorFn, radFn, band) {
    const eps = 0.001;
    for (let i = 0; i < nu; i++) {
      const u = (i + Math.random()) / nu;
      for (let j = 0; j < nv; j++) {
        const v = (j + Math.random()) / nv;
        const p = sampler(u, v);
        const pu = sampler(c01(u + eps), v);
        const mu = sampler(c01(u - eps), v);
        const pv = sampler(u, c01(v + eps));
        const mv = sampler(u, c01(v - eps));
        const du = [pu[0] - mu[0], pu[1] - mu[1], pu[2] - mu[2]];
        const dv = [pv[0] - mv[0], pv[1] - mv[1], pv[2] - mv[2]];
        let n = normalize3(cross3(du, dv));
        if (n[0] * p[0] + n[2] * p[2] < 0) n = [-n[0], -n[1], -n[2]];

        const c = colorFn(u, v);
        g.pos.push(p[0], p[1], p[2]);
        g.norm.push(n[0], n[1], n[2]);
        g.col.push(clamp(c[0], 0, 1.2), clamp(c[1], 0, 1.2), clamp(c[2], 0, 1.2));
        g.seed.push(Math.random(), Math.random(), Math.random());
        g.rad.push(radFn(u, v));
        g.band.push(band);
      }
    }
  }

  function swapArr(a, i, j, stride) {
    for (let k = 0; k < stride; k++) {
      const t = a[i * stride + k];
      a[i * stride + k] = a[j * stride + k];
      a[j * stride + k] = t;
    }
  }

  function shuffleCloud(g) {
    const n = g.rad.length;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      if (j !== i) {
        swapArr(g.pos, i, j, 3);
        swapArr(g.norm, i, j, 3);
        swapArr(g.col, i, j, 3);
        swapArr(g.seed, i, j, 3);
        swapArr(g.rad, i, j, 1);
        swapArr(g.band, i, j, 1);
      }
    }
    return g;
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

  const BLADE_AREA = 0.69; // integral do perfil de largura d'u de uma lâmina

  function buildCloud() {
    const g = newCloud();
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

        const gr = gridFor(w.length * w.width * BLADE_AREA, w.length / w.width);
        const az = offset + (i / w.count) * Math.PI * 2;
        addCloudSurface(
          g,
          gr.nu,
          gr.nv,
          bladeSampler(blade, az),
          bladeColor(w.base, w.tipCol),
          function (u) { return c01((w.radius + u * w.length) / 1.15); },
          1
        );
      }
    });

    // sépalas: cinco lâminas verdes na base da corola; fragmentam-se a meio
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
      const gr = gridFor(0.30 * 0.11 * BLADE_AREA, 0.30 / 0.11);
      addCloudSurface(
        g,
        gr.nu,
        gr.nv,
        bladeSampler(blade, (i / 5) * Math.PI * 2 + 0.4),
        bladeColor([0.10, 0.30, 0.07], [0.05, 0.16, 0.05]),
        function () { return 0.02; },
        0.5
      );
    }

    // miolo: domo dourado amostrado por raio ao quadrado, que é como se obtém
    // densidade uniforme numa superfície de revolução
    const mioloR = 0.175;
    const mioloArea = Math.PI * mioloR * mioloR * 1.35;
    const mioloGrid = gridFor(mioloArea, mioloR / (Math.PI * mioloR));
    addCloudSurface(
      g,
      mioloGrid.nu,
      mioloGrid.nv,
      function (u, v) {
        const rr = mioloR * Math.sqrt(u);
        const th = Math.asin(Math.min(1, rr / mioloR));
        const phi = v * Math.PI * 2;
        const seed = 0.006 * Math.sin(phi * 9.0) * Math.sin(th * 5.0);
        return [
          Math.cos(phi) * (rr + seed),
          0.205 * Math.cos(th) - 0.015,
          Math.sin(phi) * (rr + seed),
        ];
      },
      function (u, v) {
        // o disco é ouro escuro no meio e acende para o bordo, que é onde está o
        // anel brilhante do referente; nunca leva azul, que é o que lê como tinta.
        // É mesmo escuro porque aqui os pontos se empilham: o acumulado aditivo
        // multiplicaria por três o que aqui se pinta.
        const speck = 0.74 + 0.26 * Math.sin(v * Math.PI * 2 * 11.0) * Math.sin(u * Math.PI * 4.0);
        return [(0.15 + 0.16 * u) * speck, (0.095 + 0.085 * u) * speck, 0.018 + 0.014 * u];
      },
      function () { return 0.05; },
      1
    );

    // filetes à volta do miolo
    for (let i = 0; i < 20; i++) {
      const az = (i / 20) * Math.PI * 2 + 0.15;
      const lean = 0.34 + 0.12 * Math.sin(i * 2.3);
      const len = 0.30 + 0.07 * Math.cos(i * 1.7);
      // os filetes são detalhe: uma em cada duas células da sua área chega, e o
      // centro da corola fica com menos pontos empilhados para não estourar
      const gr = gridFor(len * 0.085 * 0.45, len / 0.085);
      addCloudSurface(
        g,
        gr.nu,
        gr.nv,
        stamenSampler(az, lean, len),
        function (u) {
          const head = Math.pow(c01((u - 0.55) / 0.45), 2);
          return [0.35 + 0.40 * head, 0.28 - 0.08 * head, 0.05 - 0.03 * head];
        },
        function (u) { return 0.02 + u * 0.10; },
        0.85
      );
    }

    // caule: comprido e curvado para a frente, para se ver inteiro em 3/4
    const grStem = gridFor(1.66 * 0.18, 1.66 / 0.18);
    addCloudSurface(
      g,
      grStem.nu,
      grStem.nv,
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
        const lit = 0.55 + 0.45 * Math.cos(v * Math.PI * 2);
        return [0.10 * lit, (0.40 + 0.14 * u) * lit, 0.09 * lit];
      },
      function () { return 0.0; },
      0
    );

    // folhas presas ao caule; zoff acompanha a curva do caule à altura de cada uma
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
      const gr = gridFor(L.length * L.width * BLADE_AREA, L.length / L.width);
      addCloudSurface(
        g,
        gr.nu,
        gr.nv,
        bladeSampler(blade, L.az),
        bladeColor([0.10, 0.32, 0.08], [0.04, 0.15, 0.05]),
        function () { return 0.90; },
        0
      );
    });

    return {
      pos: new Float32Array(shuffleCloud(g).pos),
      norm: new Float32Array(g.norm),
      col: new Float32Array(g.col),
      seed: new Float32Array(g.seed),
      rad: new Float32Array(g.rad),
      band: new Float32Array(g.band),
      count: g.rad.length,
    };
  }

  /* ========== ESTADO ========== */

  let gl = null;
  let canvas = null;
  let driver = null;
  let raf = 0;
  let rendererMode = 'webgl';

  let progBg = null;
  let progPoints = null;
  let bgBuffer = null;
  let points = null;

  let time = 0;
  let timeScale = 1;
  let spin = 0;
  let lastFrameTime = 0;

  // vida média de um ponto, em segundos. O ciclo é feito no CPU e entregue como
  // u_phase já em [0,1): um mediump float com t=600 s teria passo de 0,32 e um
  // terço dos pontos mudaria de idade de um frame para o outro.
  const LIFE = 3.4;
  let phase = 0;

  const eye = [0, 0, 3.5];

  let proj = identity();
  let view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
  let pointMaxPx = 64; // máximo do driver para gl_PointSize
  let pointPx = 1; // píxeis por unidade de mundo à profundidade 1

  let quality = 1; // cai quando os fps não chegam
  let fpsAvg = 60;
  let lastTune = 0;

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

    const opts = { alpha: false, antialias: true, depth: false, stencil: false, powerPreference: 'high-performance' };
    try {
      gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    } catch (e) {
      console.error('[v1su4rt] WebGL indisponível:', e);
      return false;
    }
    if (!gl) return false;

    progBg = buildProgram(VERTEX_BG, FRAGMENT_BG, ['a_pos'], ['u_time', 'u_audio', 'u_bass', 'u_mid', 'u_pulse', 'u_tilt']);
    progPoints = buildProgram(
      VERTEX_POINTS,
      FRAGMENT_POINTS,
      ['a_pos', 'a_norm', 'a_col', 'a_seed', 'a_rad', 'a_band'],
      [
        'u_proj', 'u_view', 'u_model', 'u_normalMat', 'u_eye', 'u_time', 'u_audio', 'u_bass',
        'u_mid', 'u_treble', 'u_pulse', 'u_phase', 'u_cloud', 'u_size', 'u_maxPx',
      ]
    );
    if (!progBg || !progPoints) return false;

    // a nuvem não escreve profundidade: é aditiva e transparente. O depth buffer
    // já não serve para nada, por isso nem é pedido; a separação frente/trás é
    // feita pela névoa de profundidade calculada no vértice.
    gl.clearColor(0.010, 0.008, 0.022, 1.0);

    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    pointMaxPx = Math.min(range ? range[1] : 64, 256);

    // tudo criado uma única vez: nada de buffers novos por frame
    bgBuffer = staticBuffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));

    const c = buildCloud();
    points = {
      pos: staticBuffer(gl.ARRAY_BUFFER, c.pos),
      norm: staticBuffer(gl.ARRAY_BUFFER, c.norm),
      col: staticBuffer(gl.ARRAY_BUFFER, c.col),
      seed: staticBuffer(gl.ARRAY_BUFFER, c.seed),
      rad: staticBuffer(gl.ARRAY_BUFFER, c.rad),
      band: staticBuffer(gl.ARRAY_BUFFER, c.band),
      count: c.count,
    };

    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    resize();
    return true;
  }

  /* Resolução interna: limitada por breakpoint e degradada quando faltam fps. */
  function targetScale() {
    const w = window.innerWidth;
    const cap = w < 640 ? 1.5 : w < 1024 ? 1.75 : 2;
    return Math.min(window.devicePixelRatio || 1, cap) * quality;
  }

  // O tamanho dos pontos vai em unidades de mundo, por isso a relação entre o
  // diâmetro do ponto e o intervalo entre pontos não depende da resolução: a
  // flor lê-se igualmente como nuvem de fumo a 1x ou a 2x, só muda a nitidez.
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
    // proj[5] é cot(fov/2): converte unidades de mundo em píxeis à profundidade 1
    pointPx = (canvas.height / 2) * proj[5];
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function tuneQuality(dt) {
    fpsAvg += (1 / dt - fpsAvg) * 0.05;
    const now = performance.now();
    if (now - lastTune < 1000) return;
    lastTune = now;
    // a flor são dezenas de milhares de vértices e área pintada: quando faltam
    // fps corta-se primeiro na resolução, depois na quantidade de pontos
    if (fpsAvg < 40 && quality > 0.45) quality = Math.max(0.45, quality - 0.1);
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

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function bindPoints(p) {
    gl.bindBuffer(gl.ARRAY_BUFFER, points.pos);
    gl.enableVertexAttribArray(p.attrib.a_pos);
    gl.vertexAttribPointer(p.attrib.a_pos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, points.norm);
    gl.enableVertexAttribArray(p.attrib.a_norm);
    gl.vertexAttribPointer(p.attrib.a_norm, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, points.col);
    gl.enableVertexAttribArray(p.attrib.a_col);
    gl.vertexAttribPointer(p.attrib.a_col, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, points.seed);
    gl.enableVertexAttribArray(p.attrib.a_seed);
    gl.vertexAttribPointer(p.attrib.a_seed, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, points.rad);
    gl.enableVertexAttribArray(p.attrib.a_rad);
    gl.vertexAttribPointer(p.attrib.a_rad, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, points.band);
    gl.enableVertexAttribArray(p.attrib.a_band);
    gl.vertexAttribPointer(p.attrib.a_band, 1, gl.FLOAT, false, 0, 0);
  }

  // A flor inteira é este draw call: uma nuvem de pontos sobre as superfícies
  // paramétricas, aditiva e sem escrever profundidade.
  function drawFlower(dt) {
    // intensidade a zero: nem se envia o draw call
    if (state.cloud <= 0.001) return;

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

    const p = progPoints;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.uniform.u_proj, false, proj);
    gl.uniformMatrix4fv(p.uniform.u_view, false, view);
    gl.uniformMatrix4fv(p.uniform.u_model, false, model);
    gl.uniformMatrix3fv(p.uniform.u_normalMat, false, mat3FromMat4(model));
    gl.uniform3f(p.uniform.u_eye, eye[0], eye[1], eye[2]);
    gl.uniform1f(p.uniform.u_time, time);
    gl.uniform1f(p.uniform.u_audio, state.audio);
    gl.uniform1f(p.uniform.u_bass, state.bass);
    gl.uniform1f(p.uniform.u_mid, state.mid);
    gl.uniform1f(p.uniform.u_treble, state.treble);
    gl.uniform1f(p.uniform.u_pulse, state.pulse);
    gl.uniform1f(p.uniform.u_phase, phase);
    gl.uniform1f(p.uniform.u_cloud, state.cloud);
    gl.uniform1f(p.uniform.u_size, pointPx);
    gl.uniform1f(p.uniform.u_maxPx, pointMaxPx);
    bindPoints(p);

    // aditivo: as camadas de pontos somam-se, e é isso que faz as pétalas
    // translúcidas; sem ordem nem depth buffer, porque nada aqui é opaco
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, Math.round(points.count * quality));
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
    phase = (time / LIFE) % 1;
    tuneQuality(dt);
    resize();

    // só a cor: nada nesta cena escreve profundidade, por isso não há depth buffer
    gl.clear(gl.COLOR_BUFFER_BIT);
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
    // limite superior também aqui: um sensor que entregue mais de 1 não pode
    // estourar a exposição nem abrir a corola para além do desenhado
    const c01 = (v) => clamp(v || 0, 0, 1);
    state.audio = c01(obj.audio);
    state.bass = c01(obj.bass);
    state.mid = c01(obj.mid);
    state.treble = c01(obj.treble);
    state.pulse = c01(obj.pulse);
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
    // e dá um quarto mais de tamanho a cada ponto
    setCloudIntensity: function (v) { state.cloud = clamp(Number(v) || 0, 0, 2); },
    cloudIntensity: function () { return state.cloud; },
    stop: function () {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    renderer: function () { return rendererMode; }
  };
})();
