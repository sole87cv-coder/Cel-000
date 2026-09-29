// Resumo: helper para criar pequenos programas de shader e instâncias para hero/preview/interacao
// Cria programas WebGL mínimos e encapsula start/stop/setUniform.
(function () {
  function createShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('shader compile', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('program link', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  // helper público
  window.createShaderProgram = function (canvas, fragSource) {
    if (!canvas) return { start() {}, stop() {}, setUniform() {} };
    let gl = null; let program = null; let raf = null; let startTime = 0; let uniforms = {};
    try { gl = canvas.getContext('webgl'); } catch (e) { gl = null; }
    if (!gl) return { start() {}, stop() {}, setUniform() {} };

    const vs = 'attribute vec2 a_position; void main(){ gl_Position=vec4(a_position,0.,1.); }';
    program = createProgram(gl, vs, fragSource);
    if (!program) return { start() {}, stop() {}, setUniform() {} };

    const posLoc = gl.getAttribLocation(program, 'a_position');
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);

    const getUniform = (name) => gl.getUniformLocation(program, name);

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(0| (canvas.clientWidth * dpr), 1);
      const h = Math.max(0| (canvas.clientHeight * dpr), 1);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0,0,canvas.width,canvas.height);
    }

    function draw(t) {
      if (!program) return;
      resize();
      gl.useProgram(program);
      gl.enableVertexAttribArray(posLoc);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
      const rtime = t - startTime;
      const u_time = getUniform('u_time'); if (u_time) gl.uniform1f(u_time, rtime);
      const u_resolution = getUniform('u_resolution'); if (u_resolution) gl.uniform2f(u_resolution, canvas.width, canvas.height);
      // aplicar uniforms customizados
      Object.keys(uniforms).forEach((k) => {
        const loc = getUniform(k); if (!loc) return;
        const v = uniforms[k]; if (typeof v === 'number') gl.uniform1f(loc, v);
        if (Array.isArray(v) && v.length === 2) gl.uniform2f(loc, v[0], v[1]);
      });
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = window.requestAnimationFrame(draw);
    }

    const obj = {
      start() {
        if (raf) return; startTime = performance.now(); raf = window.requestAnimationFrame(draw);
      },
      stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } },
      setUniform(name, value) { uniforms[name] = value; }
    };

    // pause when not visible
    document.addEventListener('visibilitychange', () => { if (document.hidden) obj.stop(); else obj.start(); });

    // intersection to stop when offscreen
    try {
      const io = new IntersectionObserver((entries) => { entries.forEach(ent => { if (!ent.isIntersecting) obj.stop(); else if (!document.hidden) obj.start(); }); });
      io.observe(canvas);
    } catch (e) { /* ignore */ }

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); obj.stop(); });
    canvas.addEventListener('webglcontextrestored', () => { obj.start(); });

    return obj;
  };

  // Hero shader: suave gradiente animado com ruído simples (sem sampler)
  const heroFrag = 'precision mediump float; uniform vec2 u_resolution; uniform float u_time; uniform float u_tilt;\n'
    + 'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n'
    + 'float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);float a=hash(i);float b=hash(i+vec2(1.0,0.0));float c=hash(i+vec2(0.0,1.0));float d=hash(i+vec2(1.0,1.0));vec2 u=f*f*(3.0-2.0*f);return mix(a,b,u.x)+ (c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;}\n'
    + 'void main(){vec2 uv=gl_FragCoord.xy/u_resolution.xy; vec2 p=uv*2.0-1.0; float t=u_time*0.0002; float n=noise(p*1.2+t*0.05); vec3 a=vec3(0.137,0.412,0.961); vec3 b=vec3(0.525,0.698,1.0); vec3 c=vec3(0.447,0.435,0.878); float mixv=0.5+0.5*sin(t*0.6+p.x*1.2+n*1.4); vec3 col=mix(a,b,mixv); col=mix(col,c,n*0.3+0.1); gl_FragColor=vec4(col,1.0);}';

  // Preview shader: sutil refração/vidro
  const previewFrag = 'precision mediump float; uniform vec2 u_resolution; uniform float u_time; uniform float u_size;\n'
    + 'void main(){vec2 uv=gl_FragCoord.xy/u_resolution.xy; vec2 p=uv-0.5; float t=u_time*0.0004; float d=sin((p.x*10.0+ t*2.0))*0.003* (1.0+u_size*1.4); vec2 q=uv+vec2(d); vec3 bg=vec3(0.96,0.97,0.99); vec3 mid=vec3(0.88,0.92,1.0); vec3 col=mix(bg,mid, smoothstep(0.0,0.8,length(p))); gl_FragColor=vec4(col,0.35);}';

  // criar instâncias quando houver canvas com ids conhecidos
  function mountIfExists(id, frag, extra) {
    const c = document.getElementById(id);
    if (!c) return null;
    // ensure size
    c.style.width = c.style.width || '100%'; c.style.height = c.style.height || '100%';
    const inst = window.createShaderProgram(c, frag);
    // apply extras
    if (inst && extra) extra(inst);
    // respects prefers-reduced-motion
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) inst.start();
    return inst;
  }

  document.addEventListener('DOMContentLoaded', () => {
    mountIfExists('hero-shader', heroFrag, (i) => { /* tilt default */ i.setUniform('u_tilt', 0.0); });
    mountIfExists('preview-canvas', previewFrag, (i) => { i.setUniform('u_size', 0.0); });
  });
})();
