/* s0leVj — painel e registro do service worker. Render e sensores delegados a assets/shaders.js e assets/interaction.js */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const panel = $('panel');
  const toggle = $('interaction-toggle');
  const status = $('interaction-status');
  const collapseBtn = $('panel-collapse');
  const audioRange = $('audio-sens');
  const orientRange = $('orient-sens');
  const audioOut = $('audio-sens-value');
  const orientOut = $('orient-sens-value');

  /* ---------- painel ---------- */
  function setStatus(msg, kind) {
    if (!status) return;
    status.textContent = msg || '';
    status.dataset.kind = kind || 'ok';
  }

  function paintButton() {
    // A interação é controlada por assets/interaction.js; sincronizamos o rótulo.
    const on = window.s0leVjInteraction && typeof window.s0leVjInteraction.isActive === 'function'
      ? window.s0leVjInteraction.isActive()
      : false;
    if (toggle) {
      toggle.textContent = on ? 'Desativar interações' : 'Ativar interações';
      toggle.setAttribute('aria-pressed', String(on));
    }
  }

  function bindRange(input, out, apply) {
    if (!input) return;
    const sync = () => {
      const v = parseFloat(input.value);
      if (out) out.textContent = v.toFixed(2);
      if (apply) apply(v);
    };
    input.addEventListener('input', sync);
    sync();
  }

  // sincroniza sliders com o módulo de interação (se exposto)
  bindRange(audioRange, audioOut, (v) => { if (window.s0leVjInteraction) window.s0leVjInteraction.audioSens = v; });
  bindRange(orientRange, orientOut, (v) => { if (window.s0leVjInteraction) window.s0leVjInteraction.orientSens = v; });

  collapseBtn.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('is-collapsed');
    collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    collapseBtn.setAttribute('aria-label', collapsed ? 'Mostrar controles' : 'Recolher controles');
  });

  // delega o botão de interação ao módulo de interaction, se presente
  if (toggle) {
    toggle.addEventListener('click', () => {
      if (window.s0leVjInteraction && typeof window.s0leVjInteraction.start === 'function') {
        if (window.s0leVjInteraction.isActive()) window.s0leVjInteraction.stop();
        else window.s0leVjInteraction.start();
      }
      setTimeout(paintButton, 200);
    });
  }

  // atualiza rótulo no carregamento
  paintButton();

  /* ---------- instalação e offline ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((err) => console.warn('Service worker não registrado:', err));
    });
  }
})();

/******/
