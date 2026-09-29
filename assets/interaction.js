(() => {
  // assets/interaction.js
  // Alteração: envia {audio,bass,treble,tiltX,tiltY} para window.v1su4rtShaders.setAudio
  // Ajustes: médias dos bins, suavização attack/release, tilt normalizado -1..1
  const toggle = document.getElementById('interaction-toggle');
  const note = document.getElementById('interaction-note');
  const canvas = document.getElementById('interaction-canvas');
  const audioSlider = document.getElementById('audio-sens');
  const orientSlider = document.getElementById('orient-sens');
  const audioValueSpan = document.getElementById('audio-sens-value');
  const orientValueSpan = document.getElementById('orient-sens-value');

  let audioContext = null;
  let analyser = null;
  let dataFreq = null;
  let dataTime = null;
  let source = null;
  let rafId = null;
  let running = false;

  let audioSensitivity = audioSlider ? parseFloat(audioSlider.value) || 1.0 : 1.0;
  let orientSensitivity = orientSlider ? parseFloat(orientSlider.value) || 1.0 : 1.0;

  audioValueSpan && (audioValueSpan.textContent = audioSensitivity.toFixed(2));
  orientValueSpan && (orientValueSpan.textContent = orientSensitivity.toFixed(2));

  audioSlider && audioSlider.addEventListener('input', () => { audioSensitivity = parseFloat(audioSlider.value) || 1.0; audioValueSpan && (audioValueSpan.textContent = audioSensitivity.toFixed(2)); });
  orientSlider && orientSlider.addEventListener('input', () => { orientSensitivity = parseFloat(orientSlider.value) || 1.0; orientValueSpan && (orientValueSpan.textContent = orientSensitivity.toFixed(2)); });

  let orientation = { alpha:0, beta:0, gamma:0 };
  let tiltX = 0; // -1..1
  let tiltY = 0; // -1..1

  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = canvas.clientWidth || window.innerWidth;
    canvas.height = Math.min(380, window.innerHeight * 0.45);
  }

  async function startAudio() {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      dataFreq = new Uint8Array(analyser.frequencyBinCount);
      dataTime = new Uint8Array(analyser.fftSize);
      source.connect(analyser);
      return true;
    } catch (e) {
      console.warn('Microfone não disponível', e);
      return false;
    }
  }

  async function startOrientation() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') return false;
      } catch (e) { return false; }
    }
    window.addEventListener('deviceorientation', (ev) => {
      orientation.alpha = ev.alpha; orientation.beta = ev.beta; orientation.gamma = ev.gamma;
      // normalizar gamma (tiltX) e beta (tiltY) por 45deg e aplicar sensibilidade
      const g = (orientation.gamma || 0) / 45 * orientSensitivity;
      const b = (orientation.beta || 0) / 45 * orientSensitivity;
      tiltX = Math.max(-1, Math.min(1, g));
      tiltY = Math.max(-1, Math.min(1, b));
    });
    return true;
  }

  // suavização exponencial (attack 0.15, release 0.08)
  let smooth = { audio:0, bass:0, treble:0 };
  const attack = 0.15;
  const release = 0.08;
  function smoothUpdate(name, value) {
    const prev = smooth[name] || 0;
    const coeff = value > prev ? attack : release;
    const next = prev * (1 - coeff) + value * coeff;
    smooth[name] = next;
    return next;
  }

  function analyzeAndSend() {
    if (!analyser) return;
    analyser.getByteFrequencyData(dataFreq);
    // média dos bins 0..255 como nível geral (audio)
    const n = dataFreq.length;
    const maxBin = Math.min(255, n - 1);
    let sumAll = 0; for (let i = 0; i <= maxBin; i++) sumAll += dataFreq[i];
    const avgAll = sumAll / Math.max(1, maxBin + 1) / 255; // 0..1

    // graves: bins 0..8
    const bassEnd = Math.min(8, n - 1);
    let bassSum = 0; for (let i = 0; i <= bassEnd; i++) bassSum += dataFreq[i];
    const bassRaw = (bassSum / Math.max(1, bassEnd + 1)) / 255;

    // agudos: bins 24..64
    const treStart = Math.min(24, n - 1);
    const treEnd = Math.min(64, n - 1);
    let treSum = 0; for (let i = treStart; i <= treEnd; i++) treSum += dataFreq[i];
    const treRaw = (treSum / Math.max(1, treEnd - treStart + 1)) / 255;

    // aplicar sensibilidade
    const audioRaw = Math.min(1, avgAll * audioSensitivity);
    const bassVal = Math.min(1, bassRaw * audioSensitivity);
    const treVal = Math.min(1, treRaw * audioSensitivity);

    // suavização
    const sa = smoothUpdate('audio', audioRaw);
    const sb = smoothUpdate('bass', bassVal);
    const st = smoothUpdate('treble', treVal);

    // enviar para shaders conforme contrato
    if (window.v1su4rtShaders && typeof window.v1su4rtShaders.setAudio === 'function'){
      window.v1su4rtShaders.setAudio({ audio: sa, bass: sb, treble: st, tiltX: tiltX, tiltY: tiltY });
    }
  }

  async function start() {
    if (running) return;
    resizeCanvas(); window.addEventListener('resize', resizeCanvas);
    const audioOk = await startAudio();
    const orientOk = await startOrientation();
    if (!audioOk && !orientOk) {
      note.textContent = 'Sensores não disponíveis. Use HTTPS no dispositivo e permita microfone/giroscópio.';
      // informar zeros ao shader
      if (window.v1su4rtShaders && window.v1su4rtShaders.setAudio) window.v1su4rtShaders.setAudio({ audio:0, bass:0, treble:0, tiltX:0, tiltY:0 });
      return;
    }
    // iniciar shader de interação
    if (window.ESFShaders && window.ESFShaders.initInteraction) window.ESFShaders.initInteraction();
    note.textContent = 'Interações ativas — movimente o dispositivo ou fale ao microfone.';
    running = true;
    function loop(){ analyzeAndSend(); rafId = requestAnimationFrame(loop); }
    rafId = requestAnimationFrame(loop);
    toggle.textContent = 'Desativar interações';
  }

  function stop() {
    if (!running) return;
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    try { if (audioContext && audioContext.state !== 'closed') audioContext.close(); } catch(e){}
    if (source && source.mediaStream) { try { source.mediaStream.getTracks().forEach(t => t.stop()); } catch(e){} }
    audioContext = null; analyser = null; dataFreq = null; dataTime = null; source = null;
    if (window.v1su4rtShaders && window.v1su4rtShaders.setAudio) window.v1su4rtShaders.setAudio({ audio:0, bass:0, treble:0, tiltX:0, tiltY:0 });
    note.textContent = 'Interações desativadas.';
    toggle.textContent = 'Ativar interações';
  }

  toggle && toggle.addEventListener('click', async () => { if (!running) await start(); else stop(); });

  // inicial resize
  resizeCanvas();
})();
