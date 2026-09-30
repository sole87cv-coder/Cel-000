// assets/interaction.js
// Captura do microfone (volume, bass, mid, treble), giroscópio e ponteiro.
// Atualiza o painel (#interaction-toggle, #audio-sens, #orient-sens, #interaction-status).
// Envia dados para window.s0leVjShaders.setAudio(...)
;(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const toggle = $('interaction-toggle');
  const status = $('interaction-status');
  const audioSens = $('audio-sens');
  const orientSens = $('orient-sens');
  const audioVal = $('audio-sens-value');
  const orientVal = $('orient-sens-value');

  // estado local
  let audioCtx = null;
  let analyser = null;
  let source = null;
  let dataArray = null;
  let raf = 0;
  let active = false;
  let stream = null;

  function setStatus(msg, kind) {
    if (!status) return;
    status.textContent = msg || '';
    status.dataset.kind = kind || 'ok';
  }

  function paintButton() {
    if (!toggle) return;
    toggle.textContent = active ? 'Desativar interações' : 'Ativar interações';
    toggle.setAttribute('aria-pressed', String(active));
  }

  // compute bands from frequency data
  function computeBands(freq) {
    const len = freq.length;
    let bass = 0, mid = 0, treble = 0, sum = 0;
    for (let i = 0; i < len; i++) {
      const v = freq[i] / 255;
      sum += v;
      const f = i / len;
      if (f < 0.15) bass += v;
      else if (f < 0.6) mid += v;
      else treble += v;
    }
    const total = sum / len;
    bass = bass / (len * 0.15) || 0;
    mid = mid / (len * 0.45) || 0;
    treble = treble / (len * 0.4) || 0;
    return { audio: total, bass: Math.min(1, bass), mid: Math.min(1, mid), treble: Math.min(1, treble) };
  }

  // animation loop: reads analyser and dispatches to shader
  function loop() {
    if (!active) return;
    if (!analyser) { raf = requestAnimationFrame(loop); return; }
    analyser.getByteFrequencyData(dataArray);
    const bands = computeBands(dataArray);
    // apply sensitivity
    const sens = parseFloat(audioSens ? audioSens.value : 1.0);
    bands.audio = Math.pow(bands.audio * sens, 1.0);
    bands.bass = Math.pow(bands.bass * sens, 1.1);
    bands.mid = Math.pow(bands.mid * sens, 1.0);
    bands.treble = Math.pow(bands.treble * sens, 0.9);
    // tilt from last known or zeros
    const tilt = lastTilt || [0,0];
    const zoom = 1.0;
    // send
    if (window.s0leVjShaders && typeof window.s0leVjShaders.setAudio === 'function') {
      window.s0leVjShaders.setAudio({ audio: bands.audio, bass: bands.bass, mid: bands.mid, treble: bands.treble, tilt, zoom });
    }
    raf = requestAnimationFrame(loop);
  }

  async function startAudio() {
    if (active) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      const bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
      source.connect(analyser);
      active = true;
      setStatus('Microfone ativo.', 'ok');
      paintButton();
      loop();
    } catch (err) {
      console.error('erro audio', err);
      setStatus('Microfone não disponível.', 'warn');
      active = false;
      paintButton();
    }
  }

  function stopAudio() {
    active = false;
    if (raf) cancelAnimationFrame(raf);
    if (source) try { source.disconnect(); } catch (e) {}
    if (analyser) try { analyser.disconnect(); } catch (e) {}
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
    audioCtx = analyser = source = null;
    setStatus('');
    paintButton();
  }

  // tilt / gyroscope / pointer
  let lastTilt = [0,0];
  function onDevice(e) {
    if (!e) return;
    // use gamma (left/right) and beta (front/back)
    const gx = (e.gamma || 0) / 90; // -1..1
    const gy = (e.beta || 0) / 90;  // -1..1
    const sens = parseFloat(orientSens ? orientSens.value : 1.0);
    lastTilt = [gx * sens, gy * sens];
    if (window.s0leVjShaders && typeof window.s0leVjShaders.setAudio === 'function') {
      window.s0leVjShaders.setAudio({ tilt: lastTilt });
    }
  }

  function onPointer(e) {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -((e.clientY / window.innerHeight) * 2 - 1);
    const sens = parseFloat(orientSens ? orientSens.value : 1.0);
    lastTilt = [x * sens, y * sens];
    if (window.s0leVjShaders && typeof window.s0leVjShaders.setAudio === 'function') {
      window.s0leVjShaders.setAudio({ tilt: lastTilt });
    }
  }

  // bind UI
  if (toggle) {
    toggle.addEventListener('click', async () => {
      if (active) { stopAudio(); return; }
      // request device orientation permission on iOS when needed
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const resp = await DeviceOrientationEvent.requestPermission();
          if (resp !== 'granted') setStatus('Permissão de movimento não concedida.', 'warn');
        } catch (e) { /* ignore */ }
      }
      startAudio();
    });
  }
  if (audioSens) {
    audioSens.addEventListener('input', () => { if (audioVal) audioVal.textContent = parseFloat(audioSens.value).toFixed(2); });
    audioSens.dispatchEvent(new Event('input'));
  }
  if (orientSens) {
    orientSens.addEventListener('input', () => { if (orientVal) orientVal.textContent = parseFloat(orientSens.value).toFixed(2); });
    orientSens.dispatchEvent(new Event('input'));
  }
  // device orientation and pointer fallback
  window.addEventListener('deviceorientation', onDevice);
  window.addEventListener('pointermove', onPointer);
  window.addEventListener('pointerdown', onPointer);

  // expose small API
  window.s0leVjInteraction = {
    start: startAudio,
    stop: stopAudio,
    isActive: () => active
  };
})();
