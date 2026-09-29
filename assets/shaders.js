// assets/shaders.js
// Alteração: completa implementação da API window.v1su4rtShaders, corrige trecho truncado e adiciona shaders HERO/PREVIEW/INTERACTION, fallback Canvas2D e ecoMode.
(function(){
  'use strict';

  // --- utilitários JS
  function compileShader(gl, type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      console.warn('[v1su4rt] shader compile failed', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function linkProgram(gl, vsSrc, fsSrc){
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    if(!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)){
      console.warn('[v1su4rt] program link failed', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  const VERT_SRC = 'attribute vec2 a_pos; void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }';

  // --- GLSL helpers (serão prefixados nos shaders)
  const GLSL_HELPERS = `
  precision mediump float;
  const float PI = 3.141592653589793;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
  float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p);
    float a = hash(i); float b = hash(i + vec2(1.0,0.0)); float c = hash(i + vec2(0.0,1.0)); float d = hash(i + vec2(1.0,1.0));
    vec2 u = f*f*(3.0-2.0*f);
    return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
  }
  float fbm(vec2 p, int OCT){ float v=0.0; float a=0.5; for(int i=0;i<6;i++){ if(i>=OCT) break; v += a * noise(p); p *= 2.0; a *= 0.5; } return v; }
  vec2 rot(vec2 p, float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c)*p; }
  vec3 hsv2rgb(vec3 c){ vec3 rgb = clamp( abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0 ); return c.z * mix(vec3(1.0), rgb, c.y); }
  `;

  // --- ShaderStage
  class ShaderStage{
    constructor(canvas, fragSrc, opts={}){
      this.canvas = canvas;
      this.fragSrc = fragSrc;
      this.opts = opts;
      this.gl = null; this.program = null; this.loc = {};
      this.uniforms = {};
      this.raf = null; this.running = false; this.startTime = 0; this.lastFrame = 0;
      this.pixelRatio = 1; this.isWebgl = false; this.ctx2d = null;
      this.fpsSamples = []; this.lastFpsCheck = performance.now();
      this.init();
    }

    init(){
      try{
        const ctxOpts = { antialias:false, alpha:true, premultipliedAlpha:false, powerPreference:'high-performance' };
        this.gl = this.canvas.getContext('webgl', ctxOpts) || this.canvas.getContext('experimental-webgl', ctxOpts);
      }catch(e){ this.gl = null; }

      if(!this.gl){
        console.info('[v1su4rt] WebGL indisponível, usando Canvas2D fallback');
        this.isWebgl = false; this.ctx2d = this.canvas.getContext('2d'); return;
      }

      this.isWebgl = true;
      const fullSrc = GLSL_HELPERS + '\n' + this.fragSrc;
      this.program = linkProgram(this.gl, VERT_SRC, fullSrc);
      if(!this.program){ this.isWebgl = false; this.ctx2d = this.canvas.getContext('2d'); return; }

      const gl = this.gl;
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
      const posLoc = gl.getAttribLocation(this.program, 'a_pos');
      gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      const names = ['u_time','u_resolution','u_audio','u_bass','u_treble','u_tilt','u_zoom','u_size','u_eco','u_octaves','u_fragcount'];
      for(const n of names){ try{ this.loc[n] = this.gl.getUniformLocation(this.program, n); }catch(e){ this.loc[n]=null; } }

      this.updatePixelRatio(); this.resize();

      document.addEventListener('visibilitychange', ()=>{ if(document.hidden) this.stop(); else this.start(); });
      try{ const io = new IntersectionObserver(entries=>{ entries.forEach(e=>{ if(!e.isIntersecting) this.stop(); else if(!document.hidden) this.start(); }); }); io.observe(this.canvas);}catch(e){}

      this.canvas.addEventListener('webglcontextlost', e=>{ e.preventDefault(); this.stop(); });
      this.canvas.addEventListener('webglcontextrestored', ()=>{ this.start(); });
    }

    updatePixelRatio(){ const isMobile = /Mobi|Android/i.test(navigator.userAgent || ''); this.pixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2.0); }

    resize(){ if(!this.canvas) return; this.updatePixelRatio(); const w = Math.max(1, Math.floor(this.canvas.clientWidth * this.pixelRatio)); const h = Math.max(1, Math.floor(this.canvas.clientHeight * this.pixelRatio)); if(this.canvas.width !== w || this.canvas.height !== h){ this.canvas.width = w; this.canvas.height = h; } if(this.isWebgl){ this.gl.viewport(0,0,this.canvas.width,this.canvas.height); } }

    setUniform(name, value){ this.uniforms[name] = value; }

    _applyUniforms(){ if(!this.isWebgl) return; const gl = this.gl; if(this.loc.u_time) gl.uniform1f(this.loc.u_time, this._time || 0.0); if(this.loc.u_resolution) gl.uniform2f(this.loc.u_resolution, this.canvas.width, this.canvas.height);
      if(this.loc.u_audio) gl.uniform1f(this.loc.u_audio, Number(this.uniforms.u_audio || 0.0)); if(this.loc.u_bass) gl.uniform1f(this.loc.u_bass, Number(this.uniforms.u_bass || 0.0)); if(this.loc.u_treble) gl.uniform1f(this.loc.u_treble, Number(this.uniforms.u_treble || 0.0));
      if(this.loc.u_tilt) { const t = this.uniforms.u_tilt || [0,0]; gl.uniform2f(this.loc.u_tilt, Number(t[0]||0), Number(t[1]||0)); }
      if(this.loc.u_zoom) gl.uniform1f(this.loc.u_zoom, Number(this.uniforms.u_zoom || 0.0)); if(this.loc.u_size) gl.uniform1f(this.loc.u_size, Number(this.uniforms.u_size || 0.0)); if(this.loc.u_eco) gl.uniform1f(this.loc.u_eco, Number(this.uniforms.u_eco || 0.0));
      if(this.loc.u_octaves) gl.uniform1i(this.loc.u_octaves, Math.max(1,Math.floor(Number(this.uniforms.u_octaves||3)))); if(this.loc.u_fragcount) gl.uniform1i(this.loc.u_fragcount, Math.max(1,Math.floor(Number(this.uniforms.u_fragcount||12)))); };

    draw = (now)=>{
      if(!this.startTime) this.startTime = now; this._time = (now - this.startTime) * 0.001; const delta = now - (this.lastFrame || now); this.lastFrame = now;

      if(this.isWebgl){ const gl = this.gl; gl.useProgram(this.program);
        this._applyUniforms();
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else {
        // Canvas2D fallback: pulsating circle with gradient
        const ctx = this.ctx2d; const w = this.canvas.width; const h = this.canvas.height; ctx.clearRect(0,0,w,h);
        const audio = Math.min(1, Number(this.uniforms.u_audio || 0.0));
        const r = Math.min(w,h) * 0.35 * (0.9 + 0.8*audio);
        const cx = w*0.5, cy = h*0.5;
        const g = ctx.createRadialGradient(cx,cy,r*0.1,cx,cy,r);
        g.addColorStop(0, 'rgba(163,123,255,' + (0.6 + audio*0.4) + ')');
        g.addColorStop(1, 'rgba(10,12,16,1)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
      }

      // fps sampling
      const nowMs = performance.now(); this.fpsSamples.push(delta ? (1000 / delta) : 60);
      if(nowMs - this.lastFpsCheck > 2000){ const avg = this.fpsSamples.reduce((a,b)=>a+b,0)/this.fpsSamples.length; this.fpsSamples = []; this.lastFpsCheck = nowMs; if(typeof window.v1su4rtShaders !== 'undefined' && avg < 40){ if(!window.v1su4rtShaders._ecoAuto){ window.v1su4rtShaders._ecoAuto = true; console.log('[v1su4rt] ecoMode ativado automaticamente (FPS baixo)', avg); window.v1su4rtShaders.setEco(true); } } }

      if(this.running) this.raf = window.requestAnimationFrame(this.draw);
    }

    start(){ if(this.running) return; this.running = true; this.lastFrame = 0; this.startTime = 0; this.raf = window.requestAnimationFrame(this.draw); }
    stop(){ if(!this.running) return; this.running = false; if(this.raf){ window.cancelAnimationFrame(this.raf); this.raf = null; } }
  }

  // --- Fragment shaders
  const HERO_FS = `
  uniform float u_time; uniform vec2 u_resolution; uniform float u_audio; uniform float u_bass; uniform float u_treble; uniform vec2 u_tilt; uniform float u_zoom; uniform float u_size; uniform float u_eco; uniform int u_octaves; uniform int u_fragcount;
  void main(){
    vec2 uv = (gl_FragCoord.xy / u_resolution.xy) - 0.5; uv.x *= u_resolution.x / u_resolution.y;
    float time = u_time;
    int oct = int(max(1.0, float(u_octaves)));
    float fb = fbm(uv * 0.6 + time * 0.02, oct);

    // zoom base + audio + tilt
    float z = mix(0.9, 1.4, sin(time * 0.125) * 0.5 + 0.5);
    z += u_audio * 1.2;
    z += length(u_tilt) * 0.6;
    z = clamp(z, 0.5, 3.0);
    vec2 p = uv / z;

    // gradient base colors
    vec3 c1 = vec3(0.357,0.549,1.0);
    vec3 c2 = vec3(0.639,0.482,1.0);
    vec3 base = mix(c1, c2, fb * 0.6 + 0.2);
    base += u_bass * vec3(0.15, 0.0, 0.05);
    base += u_treble * vec3(0.0, 0.08, 0.12);

    // luminance clamp
    float lum = clamp(dot(base, vec3(0.2126,0.7152,0.0722)), 0.0, 0.85);
    base = base * (lum / max(0.0001, dot(base, vec3(0.2126,0.7152,0.0722))));

    // vignette
    float dist = length(uv);
    float vig = smoothstep(0.8, 0.4, dist * (1.0 + (z-1.0)*0.6));
    vec3 col = base * (0.5 + 0.5 * fb) * vig;

    // mix with dark background
    vec3 bg = vec3(0.039,0.043,0.063);
    vec3 outc = mix(bg, col, 0.9);
    gl_FragColor = vec4(outc,1.0);
  }
  `;

  const PREVIEW_FS = `
  uniform float u_time; uniform vec2 u_resolution; uniform float u_audio; uniform float u_size; uniform float u_eco; uniform int u_octaves; uniform int u_fragcount;
  void main(){
    vec2 uv = (gl_FragCoord.xy / u_resolution.xy) - 0.5; uv.x *= u_resolution.x / u_resolution.y;
    float time = u_time;
    float s = mix(0.06, 0.22, u_size); // effect strength
    float n = fbm(uv * (2.0 + u_size*4.0) + time*0.1, int(max(1.0, float(u_octaves))));
    vec2 off = uv + rot(uv, n*1.2) * (n * s + u_audio*0.05);
    float fb = fbm(off*1.2, int(max(1.0, float(u_octaves))));
    vec3 base = mix(vec3(0.357,0.549,1.0), vec3(0.639,0.482,1.0), fb);
    // soft glass and low opacity
    vec3 bg = vec3(0.039,0.043,0.063);
    vec3 col = mix(bg, base, 0.35 + u_audio*0.4);
    gl_FragColor = vec4(col, 0.35);
  }
  `;

  const INTERACTION_FS = `
  uniform float u_time; uniform vec2 u_resolution; uniform float u_audio; uniform float u_bass; uniform float u_treble; uniform vec2 u_tilt; uniform float u_zoom; uniform float u_size; uniform float u_eco; uniform int u_octaves; uniform int u_fragcount;
  void main(){
    vec2 st = (gl_FragCoord.xy / u_resolution.xy) - 0.5; st.x *= u_resolution.x / u_resolution.y;
    float time = u_time;
    int N = max(3, u_fragcount);

    // polar coords
    float r = length(st);
    float a = atan(st.y, st.x);
    float normA = (a + PI) / (2.0 * PI);
    float sector = floor(normA * float(N));
    float id = sector;

    // random per-sector
    float rnd = hash(vec2(id, 1.0));
    float offsetRad = u_audio * u_bass * (0.15 + rnd * 0.35);
    float offsetAng = (rnd - 0.5) * u_audio * 0.8;
    float rotAngle = (rnd - 0.5) * u_audio * 1.5;

    // apply offsets
    float a2 = a + offsetAng + offsetRad * 0.8;
    vec2 p = vec2(cos(a2), sin(a2)) * r;
    p = rot(p, rotAngle);

    // base circle mask
    float radius = 0.35;
    float edge = 0.02 + 0.03 * u_audio;
    float inCircle = smoothstep(radius, radius - edge, r);

    // fragment carve using sector id
    float sectorCenter = (sector + 0.5) / float(N) * 2.0 * PI - PI;
    float angDiff = abs(mod(a - sectorCenter + PI, 2.0*PI) - PI);
    float wedge = smoothstep((2.0*PI/float(N))*0.5, 0.0, angDiff - offsetAng*0.5);

    // dissolve by audio
    float aud = u_audio;
    float fragMix = mix(1.0, wedge, aud);

    // fractal detail
    int oct = int(max(1.0, float(u_octaves)));
    float fb = fbm(p * (1.5 + u_bass*2.0) + time*0.05, oct);
    float fb1 = fbm(p * 0.6 + time*0.01, 1);
    float complexity = mix(fb1, fb, clamp(aud*2.0, 0.0, 1.0));

    // filaments from treble
    float fil = step(0.98, abs(noise(p * 8.0) - 0.5)) * u_treble * 1.5;

    // palette base
    vec3 base = mix(vec3(0.357,0.549,1.0), vec3(0.639,0.482,1.0), fb*0.6 + 0.2);
    base += u_bass * vec3(0.15, 0.0, 0.05);
    base += u_treble * vec3(0.0, 0.08, 0.12);

    // bright border for fragments
    float border = smoothstep(radius - edge*0.5, radius - edge*1.5, r);
    float glow = pow(max(0.0, 1.0 - r/radius), 2.0) * (0.4 + aud*1.2);

    // chromatic aberration
    float z = clamp(0.5 + aud*1.5 + length(u_tilt)*0.8 + sin(time*0.125)*0.5, 0.5, 3.0);
    vec2 pRg = st / z;
    vec2 off = vec2(0.002,0.0) * z * aud;
    // sample-like by recomputing color function with offsets (cheap approximation)
    float fbR = fbm((pRg+off) * (1.5 + u_bass*2.0) + time*0.05, oct);
    float fbB = fbm((pRg-off) * (1.5 + u_bass*2.0) + time*0.05, oct);
    vec3 colR = mix(vec3(0.357,0.549,1.0), vec3(0.639,0.482,1.0), fbR*0.6 + 0.2);
    vec3 colB = mix(vec3(0.357,0.549,1.0), vec3(0.639,0.482,1.0), fbB*0.6 + 0.2);
    colR += u_bass * vec3(0.15, 0.0, 0.05); colB += u_treble * vec3(0.0, 0.08, 0.12);

    // combine
    vec3 fragCol = mix(colR, colB, 0.5);
    fragCol = mix(fragCol * (0.6 + complexity*0.8 + fil*2.0), base, 0.5);
    fragCol += border * vec3(1.0, 0.9, 0.8) * (0.3 + aud*1.2);

    // apply sector mask and circle mask
    float mask = inCircle * fragMix;
    vec3 bg = vec3(0.039,0.043,0.063);
    vec3 outc = mix(bg, fragCol, clamp(mask, 0.0, 1.0));
    // final luminance clamp
    float lum = dot(outc, vec3(0.2126,0.7152,0.0722));
    if(lum > 0.85) outc *= 0.85 / lum;

    gl_FragColor = vec4(outc, 1.0);
  }
  `;

  // --- Global manager and instances
  const canvases = {
    hero: document.getElementById('hero-shader'),
    preview: document.getElementById('preview-canvas'),
    interaction: document.getElementById('interaction-canvas')
  };

  let heroStage = null, previewStage = null, interactionStage = null;
  let ecoMode = false;

  function detectDevice(){
    const hc = navigator.hardwareConcurrency || 4;
    const dm = navigator.deviceMemory || 4;
    const isWeak = (hc <= 4) || (dm <= 4);
    return { isWeakDevice: isWeak };
  }

  const device = detectDevice();
  let octaves = device.isWeakDevice ? 3 : 5;
  let fragmentCount = device.isWeakDevice ? 12 : 24;

  function createStages(){
    if(heroStage) heroStage.stop();
    if(previewStage) previewStage.stop();
    if(interactionStage) interactionStage.stop();

    if(canvases.hero) heroStage = new ShaderStage(canvases.hero, HERO_FS);
    if(canvases.preview) previewStage = new ShaderStage(canvases.preview, PREVIEW_FS);
    if(canvases.interaction) interactionStage = new ShaderStage(canvases.interaction, INTERACTION_FS);

    const stages = [heroStage, previewStage, interactionStage].filter(Boolean);
    for(const s of stages){ s.setUniform('u_octaves', octaves); s.setUniform('u_fragcount', fragmentCount); s.setUniform('u_eco', ecoMode ? 1.0 : 0.0); }
  }

  // public API
  window.v1su4rtShaders = {
    _ecoAuto: false,
    init(){ createStages(); if(heroStage) heroStage.start(); if(previewStage) previewStage.start(); if(interactionStage) interactionStage.start(); },
    setAudio(obj){ const audio = Math.max(0, Math.min(1, Number(obj.audio || 0))); const bass = Math.max(0, Math.min(1, Number(obj.bass || 0))); const treble = Math.max(0, Math.min(1, Number(obj.treble || 0))); const tiltX = Number(obj.tiltX || 0); const tiltY = Number(obj.tiltY || 0);
      const tvec = [tiltX, tiltY];
      const stages = [heroStage, previewStage, interactionStage].filter(Boolean);
      for(const s of stages){ s.setUniform('u_audio', audio); s.setUniform('u_bass', bass); s.setUniform('u_treble', treble); s.setUniform('u_tilt', tvec); }
      // hero zoom computed in shader by spec, but allow JS override optional
    },
    setSize(idx){ // 0=mobile,1=tablet,2=desktop -> interpolate u_size smoothly in start loop
      const target = Math.max(0, Math.min(2, Number(idx||0)));
      octaves = (device.isWeakDevice ? 3 : 5);
      // reduce octaves on mobile
      if(target === 0) octaves = Math.max(1, octaves - 2);
      fragmentCount = device.isWeakDevice ? 12 : 24;
      if(target === 0) fragmentCount = Math.max(8, fragmentCount - 8);
      const stages = [heroStage, previewStage, interactionStage].filter(Boolean);
      for(const s of stages){ s.setUniform('u_size', target); s.setUniform('u_octaves', octaves); s.setUniform('u_fragcount', fragmentCount); }
    },
    setEco(b){ ecoMode = !!b; octaves = ecoMode ? 3 : (device.isWeakDevice ? 3 : 5); fragmentCount = ecoMode ? 8 : (device.isWeakDevice ? 12 : 24); const stages = [heroStage, previewStage, interactionStage].filter(Boolean); for(const s of stages){ s.setUniform('u_eco', ecoMode ? 1.0 : 0.0); s.setUniform('u_octaves', octaves); s.setUniform('u_fragcount', fragmentCount); if(ecoMode){ s.stop(); // throttle to 30fps by manual RAF loop
          s.running = true; (function throttledDraw(){ if(!s.running) return; s.draw(performance.now()); setTimeout(throttledDraw, 33); })(); } else { s.stop(); s.start(); } } },
    stopAll(){ if(heroStage) heroStage.stop(); if(previewStage) previewStage.stop(); if(interactionStage) interactionStage.stop(); },
  };

  // expose compatibility name
  window.ESFShaders = window.v1su4rtShaders;

  // auto-init when DOM ready
  function tryInit(){ if(document.readyState === 'complete' || document.readyState === 'interactive'){ window.v1su4rtShaders.init(); } else { document.addEventListener('DOMContentLoaded', ()=>{ window.v1su4rtShaders.init(); }); } }
  tryInit();

})();
