/* v1su4rt — desenha o shader em tela cheia, liga os sensores e cuida do painel. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('stage');
  const panel = $('panel');
  const toggle = $('interaction-toggle');
  const status = $('interaction-status');
  const collapseBtn = $('panel-collapse');
  const audioRange = $('audio-sens');
  const orientRange = $('orient-sens');
  const audioOut = $('audio-sens-value');
  const orientOut = $('orient-sens-value');

  const sensors = new window.V1Interaction();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- painel ---------- */

  function setStatus(msg, kind) {
    status.textContent = msg || '';
    status.dataset.kind = kind || 'ok';
  }

  function paintButton() {
    const on = sensors.active;
    toggle.textContent = on ? 'Desativar interações' : 'Ativar interações';
    toggle.setAttribute('aria-pressed', String(on));
  }

  function describe(res, gyro) {
    const a = res.audio;
    const g = gyro || res.orientation;
    if (a === 'insecure') return ['Microfone e giroscópio exigem HTTPS. Abra o endereço que começa com https://.', 'warn'];
    if (a === 'ok' && g === 'ok') return ['Ativo. Fale, toque música ou incline o aparelho.', 'ok'];
    if (a === 'ok') {
      if (g === 'denied') return ['Microfone ativo. Movimento negado: recarregue a página e permita ao ativar.', 'warn'];
      return ['Microfone ativo. Sem giroscópio neste aparelho: mova o mouse ou arraste na tela.', 'ok'];
    }
    if (a === 'denied') return ['Microfone bloqueado. Libere nas permissões do site e ative de novo.', 'warn'];
    if (a === 'unsupported') return ['Este navegador não dá acesso ao microfone.' + (g === 'ok' ? ' O giroscópio segue ativo.' : ''), 'warn'];
    return ['Não foi possível abrir o microfone. Confira se outro app não está usando e ative de novo.', 'warn'];
  }

  let lastRes = null;

  toggle.addEventListener('click', async () => {
    if (sensors.active) {
      sensors.stop();
      paintButton();
      setStatus('');
      return;
    }
    toggle.disabled = true;
    toggle.textContent = 'Ativando…';
    let res;
    try {
      res = await sensors.start((state) => {
        // resposta tardia do giroscópio (chega até 1,5 s depois)
        if (lastRes) { const [m, k] = describe(lastRes, state); setStatus(m, k); }
        paintButton();
      });
    } catch (err) {
      console.error(err);
      res = { audio: 'error', orientation: 'error' };
    }
    lastRes = res;
    toggle.disabled = false;
    paintButton();
    const [msg, kind] = describe(res);
    setStatus(msg, kind);
  });

  function bindRange(input, out, apply) {
    const sync = () => {
      const v = parseFloat(input.value);
      out.textContent = v.toFixed(2);
      apply(v);
    };
    input.addEventListener('input', sync);
    sync();
  }
  bindRange(audioRange, audioOut, (v) => { sensors.audioSens = v; });
  bindRange(orientRange, orientOut, (v) => { sensors.orientSens = v; });

  collapseBtn.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('is-collapsed');
    collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    collapseBtn.setAttribute('aria-label', collapsed ? 'Mostrar controles' : 'Recolher controles');
  });

  /* ---------- ponteiro (mouse, toque): alternativa quando não há sensores ---------- */

  const pointer = { x: 0, y: 0 };
  const pointerT = { x: 0, y: 0 };
  function movePointer(e) {
    pointerT.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointerT.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }
  canvas.addEventListener('pointermove', movePointer);
  canvas.addEventListener('pointerdown', movePointer);
  const release = (e) => { if (e.pointerType !== 'mouse') { pointerT.x = 0; pointerT.y = 0; } };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  /* ---------- WebGL ---------- */

  let gl = null;
  let prog = null;
  let U = {};
  let scale = 1;
  let raf = 0;

  function makeContext() {
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' };
    return canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  }

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function init() {
    gl = makeContext();
    if (!gl) return false;
    const vs = compile(gl.VERTEX_SHADER, window.V1Shaders.vertex);
    const fs = compile(gl.FRAGMENT_SHADER, window.V1Shaders.fragment);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return false;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    U = {};
    ['u_res', 'u_time', 'u_level', 'u_bass', 'u_mid', 'u_treble', 'u_pulse', 'u_tilt', 'u_point']
      .forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
    resize();
    return true;
  }

  /* celular, tablet e desktop: resolução interna se adapta à tela e ao desempenho */
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const device = w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
    const maxDpr = { mobile: 1.5, tablet: 1.75, desktop: 2 }[device];
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr) * scale;
    const cw = Math.max(2, Math.round(w * dpr));
    const ch = Math.max(2, Math.round(h * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    document.documentElement.dataset.device = device;
    if (gl) gl.viewport(0, 0, cw, ch);
  }

  let last = performance.now();
  let time = 0;
  let acc = 0;
  let frames = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
    last = now;

    sensors.update(dt);
    const s = sensors.read();
    const k = 1 - Math.exp(-dt * 6);
    pointer.x += (pointerT.x - pointer.x) * k;
    pointer.y += (pointerT.y - pointer.y) * k;

    const calm = reduceMotion.matches;
    time += dt * (calm ? 0.3 : 1);

    gl.uniform2f(U.u_res, canvas.width, canvas.height);
    gl.uniform1f(U.u_time, time);
    gl.uniform1f(U.u_level, s.level);
    gl.uniform1f(U.u_bass, s.bass);
    gl.uniform1f(U.u_mid, s.mid);
    gl.uniform1f(U.u_treble, s.treble);
    gl.uniform1f(U.u_pulse, calm ? s.pulse * 0.5 : s.pulse);
    gl.uniform2f(U.u_tilt, s.tiltX, s.tiltY);
    gl.uniform2f(U.u_point, pointer.x, pointer.y);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // se a média passar de ~24 ms por quadro, reduz a resolução interna (nunca sobe de novo)
    frames++;
    if (frames > 30) {
      acc += dt;
      if (frames % 45 === 0) {
        if (acc / 45 > 0.024 && scale > 0.55) {
          scale = Math.max(0.55, scale * 0.82);
          resize();
        }
        acc = 0;
      }
    }
  }

  function start() {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
  });
  canvas.addEventListener('webglcontextrestored', () => { if (init()) start(); });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', () => { last = performance.now(); frames = 0; acc = 0; });

  if (init()) {
    start();
  } else {
    document.documentElement.classList.add('no-webgl');
    setStatus('Este navegador não conseguiu iniciar os gráficos (WebGL). Tente outro navegador.', 'warn');
  }

  /* ---------- instalação e offline ---------- */

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((err) => console.warn('Service worker não registrado:', err));
    });
  }
})();
