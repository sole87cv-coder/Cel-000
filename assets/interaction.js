/* v1su4rt — sensores: microfone (AudioContext + AnalyserNode) e giroscópio
   (deviceorientation). Nada é gravado nem enviado: os valores só alimentam o shader. */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  class V1Interaction {
    constructor() {
      this.audioSens = 1.5;
      this.orientSens = 1.5;
      this.sm = { level: 0, bass: 0, mid: 0, treble: 0 };
      this.bassAvg = 0;
      this.pulse = 0;
      this.tgt = { x: 0, y: 0 };
      this.tilt = { x: 0, y: 0 };
      this._onOrient = this._onOrient.bind(this);
      this._clearSession();

      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      });
    }

    get active() { return this.audioOn || this.orientOn; }

    _clearSession() {
      this.ctx = null;
      this.stream = null;
      this.analyser = null;
      this.freq = null;
      this.wave = null;
      this.audioOn = false;
      this.orientOn = false;
      this.orientSeen = false;
      this.base = null;
      this.baseAng = null;
      this.tgt.x = 0;
      this.tgt.y = 0;
    }

    /* Deve ser chamado dentro de um clique/toque: as duas permissões
       são pedidas de imediato, sem esperar uma pela outra (exigência do iOS). */
    async start(onGyro) {
      const out = { audio: 'unsupported', orientation: 'unsupported' };
      if (!window.isSecureContext) {
        out.audio = out.orientation = 'insecure';
        return out;
      }
      const gyroP = this._requestOrientation();
      const audioP = this._startAudio();
      const [g, a] = await Promise.all([gyroP, audioP]);
      out.orientation = g;
      out.audio = a;
      this.audioOn = a === 'ok';
      this.orientOn = g === 'ok';

      if (this.orientOn) {
        window.addEventListener('deviceorientation', this._onOrient);
        // computadores disparam o evento sem valores: se nada útil chegar, avisa
        this._gyroTimer = setTimeout(() => {
          if (!this.orientSeen) {
            this.orientOn = false;
            window.removeEventListener('deviceorientation', this._onOrient);
            if (onGyro) onGyro('unavailable');
          } else if (onGyro) {
            onGyro('ok');
          }
        }, 1500);
      }
      return out;
    }

    stop() {
      clearTimeout(this._gyroTimer);
      window.removeEventListener('deviceorientation', this._onOrient);
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      if (this.ctx) { try { this.ctx.close(); } catch (e) { /* ignora */ } }
      this._clearSession();
    }

    async _requestOrientation() {
      if (!('DeviceOrientationEvent' in window)) return 'unsupported';
      const D = window.DeviceOrientationEvent;
      if (typeof D.requestPermission === 'function') {
        try {
          const r = await D.requestPermission();
          return r === 'granted' ? 'ok' : 'denied';
        } catch (e) {
          return 'denied';
        }
      }
      return 'ok';
    }

    async _startAudio() {
      const md = navigator.mediaDevices;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!md || !md.getUserMedia || !AC) return 'unsupported';
      let ctx;
      try { ctx = new AC(); } catch (e) { return 'unsupported'; }
      try {
        if (ctx.resume) ctx.resume().catch(() => {});
        const stream = await md.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        if (ctx.state === 'suspended') await ctx.resume();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        an.smoothingTimeConstant = 0.4;
        src.connect(an); // sem ligar na saída: não há retorno de áudio
        this.ctx = ctx;
        this.stream = stream;
        this.analyser = an;
        this.freq = new Uint8Array(an.frequencyBinCount);
        this.wave = new Uint8Array(an.fftSize);
        return 'ok';
      } catch (e) {
        try { ctx.close(); } catch (_) { /* ignora */ }
        return e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'error';
      }
    }

    _angle() {
      let a = 0;
      if (window.screen.orientation && typeof window.screen.orientation.angle === 'number') a = window.screen.orientation.angle;
      else if (typeof window.orientation === 'number') a = window.orientation;
      return ((a % 360) + 360) % 360;
    }

    _onOrient(e) {
      if (e.gamma == null || e.beta == null) return;
      this.orientSeen = true;
      const ang = this._angle();
      let ax = e.gamma;
      let ay = e.beta;
      if (ang === 90) { ax = e.beta; ay = -e.gamma; }
      else if (ang === 270) { ax = -e.beta; ay = e.gamma; }
      else if (ang === 180) { ax = -e.gamma; ay = -e.beta; }
      // a posição em que o aparelho está ao ativar vira o centro
      if (this.base === null || this.baseAng !== ang) {
        this.base = { x: ax, y: ay };
        this.baseAng = ang;
      }
      this.tgt.x = clamp((ax - this.base.x) / 40, -1, 1);
      this.tgt.y = clamp((ay - this.base.y) / 40, -1, 1);
    }

    _band(lo, hi, hz) {
      const a = Math.max(1, Math.floor(lo / hz));
      const b = Math.min(this.freq.length - 1, Math.ceil(hi / hz));
      let s = 0;
      for (let i = a; i <= b; i++) s += this.freq[i];
      const avg = s / ((b - a + 1) * 255);
      return clamp((avg - 0.10) / 0.5, 0, 1);
    }

    update(dt) {
      let L = 0, B = 0, M = 0, T = 0;
      if (this.audioOn && this.analyser) {
        const an = this.analyser;
        an.getByteFrequencyData(this.freq);
        an.getByteTimeDomainData(this.wave);
        let s = 0;
        for (let i = 0; i < this.wave.length; i++) {
          const v = (this.wave[i] - 128) / 128;
          s += v * v;
        }
        L = clamp(Math.sqrt(s / this.wave.length) * 5, 0, 1);
        const hz = this.ctx.sampleRate / an.fftSize;
        B = this._band(20, 250, hz);
        M = this._band(250, 2000, hz);
        T = this._band(2000, 9000, hz);
      }
      const ease = (cur, target) => cur + (target - cur) * (1 - Math.exp(-dt * (target > cur ? 28 : 4)));
      this.sm.level = ease(this.sm.level, L);
      this.sm.bass = ease(this.sm.bass, B);
      this.sm.mid = ease(this.sm.mid, M);
      this.sm.treble = ease(this.sm.treble, T);

      // batida: os graves saltam acima da média recente
      this.bassAvg += (B - this.bassAvg) * (1 - Math.exp(-dt * 1.2));
      if (B - this.bassAvg > 0.16 && this.pulse < 0.35) this.pulse = 1;
      this.pulse *= Math.exp(-dt * 4.5);

      const k = 1 - Math.exp(-dt * 9);
      this.tilt.x += (this.tgt.x - this.tilt.x) * k;
      this.tilt.y += (this.tgt.y - this.tilt.y) * k;
    }

    /* Valores prontos para o shader, já com a sensibilidade aplicada. */
    read() {
      const g = this.audioSens;
      const c = (v) => clamp(v * g, 0, 1.6);
      return {
        level: c(this.sm.level),
        bass: c(this.sm.bass),
        mid: c(this.sm.mid),
        treble: c(this.sm.treble),
        pulse: clamp(this.pulse * g, 0, 1.5),
        tiltX: clamp(this.tilt.x * this.orientSens, -2, 2),
        tiltY: clamp(this.tilt.y * this.orientSens, -2, 2),
      };
    }
  }

  window.V1Interaction = V1Interaction;
})();
