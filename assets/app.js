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
  const cloudRange = $('cloud-intens');
  const audioOut = $('audio-sens-value');
  const orientOut = $('orient-sens-value');
  const cloudOut = $('cloud-intens-value');

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
      return ['Microfone ativo. Sem giroscópio neste aparelho: mova o rato ou arraste no ecrã.', 'ok'];
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
  bindRange(cloudRange, cloudOut, (v) => {
    if (window.v1su4rtShaders) window.v1su4rtShaders.setCloudIntensity(v);
  });

  collapseBtn.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('is-collapsed');
    collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    collapseBtn.setAttribute('aria-label', collapsed ? 'Mostrar controles' : 'Recolher controles');
  });

  /* ---------- ponteiro (rato, toque): substitui o giroscópio quando não existe ---------- */

  const pointer = { x: 0, y: 0 };
  const pointerTarget = { x: 0, y: 0 };

  function movePointer(e) {
    pointerTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointerTarget.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }
  canvas.addEventListener('pointermove', movePointer);
  canvas.addEventListener('pointerdown', movePointer);
  const release = (e) => { if (e.pointerType !== 'mouse') { pointerTarget.x = 0; pointerTarget.y = 0; } };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  /* ---------- renderizador (delegado a shaders.js) ---------- */

  function readFrame(dt) {
    sensors.update(dt);
    const s = sensors.read();

    let tiltX = s.tiltX;
    let tiltY = s.tiltY;
    if (!sensors.orientOn) {
      const k = 1 - Math.exp(-dt * 6);
      pointer.x += (pointerTarget.x - pointer.x) * k;
      pointer.y += (pointerTarget.y - pointer.y) * k;
      tiltX = pointer.x * sensors.orientSens;
      tiltY = pointer.y * sensors.orientSens;
    }

    return {
      audio: s.level,
      bass: s.bass,
      mid: s.mid,
      treble: s.treble,
      pulse: s.pulse,
      tilt: [tiltX, tiltY]
    };
  }

  function applyMotionPreference() {
    window.v1su4rtShaders.setTimeScale(reduceMotion.matches ? 0.35 : 1);
  }

  if (!window.v1su4rtShaders) {
    console.error('[v1su4rt] shaders indisponíveis: shaders.glsl.js / shaders.js');
    document.documentElement.classList.add('no-webgl');
    setStatus('[v1su4rt] Erro: shaders indisponíveis.', 'warn');
    return;
  }

  if (window.v1su4rtShaders.init('stage', readFrame)) {
    applyMotionPreference();
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', applyMotionPreference);
  } else {
    console.error('[v1su4rt] WebGL indisponível');
    document.documentElement.classList.add('no-webgl');
    setStatus('Este navegador não tem WebGL disponível, por isso o visual não pode ser desenhado.', 'warn');
  }

  /* ---------- instalação e offline ---------- */

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((err) => console.warn('Service worker não registrado:', err));
    });
  }
})();
