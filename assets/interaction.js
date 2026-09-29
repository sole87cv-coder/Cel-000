(() => {
  // Gerencia captura de áudio e giroscópio e envia dados para shaders via window.ESFShaders
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
    window.addEventListener('deviceorientation', (ev) => { orientation.alpha = ev.alpha; orientation.beta = ev.beta; orientation.gamma = ev.gamma; window.ESFShaders && window.ESFShaders.setTilt((orientation.gamma||0)*orientSensitivity, (orientation.beta||0)*orientSensitivity); });
    return true;
  }

  // suavização exponencial simples
  let smooth = { rms:0, bass:0, treble:0 };
  function smoothUpdate(name, value) { smooth[name] = smooth[name]*0.85 + value*0.15; return smooth[name]; }

  function analyzeAndSend() {
    if (!analyser) return;
    analyser.getByteFrequencyData(dataFreq);
    analyser.getByteTimeDomainData(dataTime);
    // RMS from time domain
    let sum = 0; for (let i=0;i<dataTime.length;i++){ const v = (dataTime[i]-128)/128; sum += v*v; }
    const rms = Math.sqrt(sum/dataTime.length);
    // frequency bands
    const n = dataFreq.length;
    const bassEnd = Math.max(2, Math.floor(n*0.12)); // lower ~12%
    const trebleStart = Math.max( Math.floor(n*0.35), bassEnd+1 );
    let bassSum=0; for(let i=0;i<bassEnd;i++) bassSum += dataFreq[i];
    let treSum=0; for(let i=trebleStart;i<n;i++) treSum += dataFreq[i];
    const bass = (bassSum / Math.max(1,bassEnd)) / 255;
    const tre = (treSum / Math.max(1,n-trebleStart)) / 255;
    const r = Math.min(1, rms * 1.6 * audioSensitivity);
    const b = Math.min(1, bass * audioSensitivity);
    const t = Math.min(1, tre * audioSensitivity);
    // smoothing
    const rs = smoothUpdate('rms', r);
    const bs = smoothUpdate('bass', b);
    const ts = smoothUpdate('treble', t);
    // enviar para shaders
    window.ESFShaders && window.ESFShaders.setAudio({ rms: rs, bass: bs, treble: ts });
  }

  async function start() {
    if (running) return;
    resizeCanvas(); window.addEventListener('resize', resizeCanvas);
    const audioOk = await startAudio();
    const orientOk = await startOrientation();
    if (!audioOk && !orientOk) { note.textContent = 'Sensores não disponíveis. Use HTTPS no dispositivo e permita microfone/giroscópio.'; return; }
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
    window.ESFShaders && window.ESFShaders.setAudio({ rms:0, bass:0, treble:0 });
    note.textContent = 'Interações desativadas.';
    toggle.textContent = 'Ativar interações';
  }

  toggle && toggle.addEventListener('click', async () => { if (!running) await start(); else stop(); });

  // inicial resize
  resizeCanvas();
})();
