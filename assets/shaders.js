/* shaders.js — s0leVj
 * Dodecaedro 3D (wireframe <-> sólido) guiado pelo microfone e fonte de luz (u_light)
 * para o fundo. WebGL1/GLSL ES 1.0 em um passe, com fallback Canvas2D. Desenha em
 * #stage e expõe window.s0leVjShaders.setAudio(); interaction.js só envia números.
 */
(function () {
  'use strict';

  // Estado público
  window.s0leVjShaders = window.s0leVjShaders || {};
  const state = {
    audio: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    tilt: [0, 0],
    zoom: 1.0,
  };

  // Canvas alvo
  const canvas = document.getElementById('stage') || (function () {
    const c = document.createElement('canvas');
    c.id = 'stage';
    document.body.appendChild(c);
    return c;
  })();

  // Query string ?eco=1/0
  const params = new URLSearchParams(location.search);
  const forcedEco = params.has('eco') ? (params.get('eco') === '1') : null;

  // Heurística de modo econômico: <= 4 núcleos ou <= 2 GB -> eco
  function detectEco() {
    if (forcedEco !== null) return forcedEco;
    const hc = navigator.hardwareConcurrency || 4;
    // memory may be undefined in some browsers
    const mem = navigator.deviceMemory || 4;
    return (hc <= 4 || mem <= 2);
  }
  let ecoMode = detectEco();

  // Visibility / IntersectionObserver for pause
  let running = true;
  function updateRunning() {
    running = !document.hidden && observerInView;
  }
  document.addEventListener('visibilitychange', updateRunning);
  let observerInView = true;
  const io = new IntersectionObserver((entries) => {
    observerInView = entries.length ? entries[0].isIntersecting : true;
    updateRunning();
  }, { threshold: 0.01 });
  io.observe(canvas);

  // Renderer info
  let rendererMode = 'unknown'; // 'webgl' | 'canvas2d'

  // GL helpers
  function makeGL() {
    const opts = { alpha: false, antialias: true, depth: true, powerPreference: 'high-performance' };
    return canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  }

  // Simple vertex shader (3D positions + normals)
  const VERTEX_SRC = '\
attribute vec3 a_pos; \
attribute vec3 a_nrm; \
uniform mat4 u_mvp; \
uniform mat3 u_norm; \
varying vec3 v_n; \
varying vec3 v_p; \
void main(){ v_n = u_norm * a_nrm; vec4 p = vec4(a_pos,1.0); v_p = p.xyz; gl_Position = u_mvp * p; }';

  // Fragment shader: lit material, edges and point highlights; reacts to uniforms
  const FRAGMENT_SRC = '\
precision mediump float; \
varying vec3 v_n; \
varying vec3 v_p; \
uniform vec2 u_res; \
uniform float u_time; \
uniform float u_level; \
uniform float u_bass; \
uniform float u_mid; \
uniform float u_treble; \
uniform vec2 u_tilt; \
uniform float u_mode; /* 0 = wire, 1 = solid */ \
uniform float u_light; \
void main(){ \
  vec3 N = normalize(v_n); \
  vec3 L = normalize(vec3(0.3 + u_tilt.x*0.5, 0.6 + u_tilt.y*0.5, 1.0)); \
  float diff = max(dot(N, L), 0.0); \
  // base color responds to mids and bass (médios deslocam cor, graves -> magenta) \
  vec3 base = mix(vec3(0.15,0.35,0.95), vec3(0.9,0.2,0.7), clamp(u_bass*1.5,0.0,1.0)); \
  base = mix(base, base * (1.0 + u_mid*0.6), 0.5); \
  // edge factor: use view-space normal variance to fake edges \
  float edge = pow(1.0 - abs(dot(N, vec3(0.0,0.0,1.0))), 1.5); \
  float glow = pow(u_treble, 1.2); \
  vec3 col = base * diff * (0.6 + 0.4*u_light) + vec3(0.03)*glow + vec3(0.02)*u_level; \
  // wireframe overlay when in wire mode (u_mode < 0.5) or as mix when audio low \
  float w = smoothstep(0.18, 0.0, edge); \
  float mixWire = mix(1.0 - u_level, 0.0, u_mode); \
  vec3 wireCol = vec3(1.0) * (0.6 + 0.4*glow); \
  vec3 final = mix(col, wireCol, clamp(w * mixWire + 0.02*u_treble, 0.0, 1.0)); \
  gl_FragColor = vec4(final, 1.0); \
}';

  // Small mesh generator: sphere-like polyhedron (approximates a faceted solid)
  function makeMesh(subdiv) {
    const positions = [];
    const normals = [];
    const indices = [];
    const lines = [];
    const lat = Math.max(6, subdiv || 10);
    const lon = Math.max(12, (subdiv || 10) * 2);
    for (let j = 0; j <= lat; j++) {
      const v = j / lat;
      const theta = v * Math.PI;
      for (let i = 0; i <= lon; i++) {
        const u = i / lon;
        const phi = u * Math.PI * 2;
        const x = Math.sin(theta) * Math.cos(phi);
        const y = Math.cos(theta);
        const z = Math.sin(theta) * Math.sin(phi);
        positions.push(x, y, z);
        const l = Math.hypot(x, y, z) || 1;
        normals.push(x / l, y / l, z / l);
      }
    }
    for (let j = 0; j < lat; j++) {
      for (let i = 0; i < lon; i++) {
        const a = j * (lon + 1) + i;
        const b = a + lon + 1;
        indices.push(a, b, a + 1);
        indices.push(b, b + 1, a + 1);
        lines.push(a, b, a, a + 1);
      }
    }
    return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices), lines: new Uint16Array(lines) };
  }

  // GL program creation
  function compileShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  // State for rendering
  let gl = null;
  let program = null;
  let buffers = null;
  let u = {};
  let lastTime = 0;
  let frameId = 0;
  let calm = false;

  function resizeGL() {
    if (!gl) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const device = w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
    const maxDpr = { mobile: 1.5, tablet: 1.75, desktop: 2 }[device];
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr) * (ecoMode ? 0.75 : 1);
    const cw = Math.max(2, Math.round(w * dpr));
    const ch = Math.max(2, Math.round(h * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      gl.viewport(0, 0, cw, ch);
    }
  }

  function initGL() {
    gl = makeGL();
    if (!gl) return false;
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    if (!vs || !fs) return false;
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);
    // mesh
    const mesh = makeMesh(10);
    buffers = {
      pos: gl.createBuffer(),
      nrm: gl.createBuffer(),
      idx: gl.createBuffer(),
      lines: gl.createBuffer(),
      idxCount: mesh.indices.length,
      lineCount: mesh.lines.length,
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.pos);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.nrm);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.lines);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.lines, gl.STATIC_DRAW);
    // attribs
    const a_pos = gl.getAttribLocation(program, 'a_pos');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.pos);
    gl.enableVertexAttribArray(a_pos);
    gl.vertexAttribPointer(a_pos, 3, gl.FLOAT, false, 0, 0);
    const a_nrm = gl.getAttribLocation(program, 'a_nrm');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.nrm);
    gl.enableVertexAttribArray(a_nrm);
    gl.vertexAttribPointer(a_nrm, 3, gl.FLOAT, false, 0, 0);
    // uniforms
    ['u_res', 'u_time', 'u_level', 'u_bass', 'u_mid', 'u_treble', 'u_tilt', 'u_mode', 'u_light', 'u_mvp', 'u_norm']
      .forEach((n) => { u[n] = gl.getUniformLocation(program, n); });
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    resizeGL();
    return true;
  }

  // Simple matrix helpers
  function perspective(fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, (2 * far * near) * nf, 0,
    ];
  }
  function matMul(a, b) {
    const out = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) out[i*4+j] += a[i*4+k]*b[k*4+j];
    return out;
  }
  function lookAt(eye, center, up) {
    const z0 = eye[0]-center[0], z1 = eye[1]-center[1], z2 = eye[2]-center[2];
    let len = Math.hypot(z0,z1,z2) || 1;
    const z = [z0/len, z1/len, z2/len];
    const x = [(up[1]*z[2]-up[2]*z[1]), (up[2]*z[0]-up[0]*z[2]), (up[0]*z[1]-up[1]*z[0])];
    len = Math.hypot(x[0],x[1],x[2]) || 1;
    x[0]/=len; x[1]/=len; x[2]/=len;
    const y = [z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]];
    return [
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),
      -(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),
      -(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),
      1
    ];
  }

  function setUniforms(t) {
    if (!gl) return;
    const w = canvas.width, h = canvas.height;
    gl.uniform2f(u.u_res, w, h);
    gl.uniform1f(u.u_time, t * 0.001);
    const level = state.audio;
    gl.uniform1f(u.u_level, level);
    gl.uniform1f(u.u_bass, state.bass);
    gl.uniform1f(u.u_mid, state.mid);
    gl.uniform1f(u.u_treble, state.treble);
    gl.uniform2f(u.u_tilt, state.tilt[0], state.tilt[1]);
    gl.uniform1f(u.u_mode, (level > 0.25) ? 1.0 : 0.0); // solid if loud
    gl.uniform1f(u.u_light, Math.min(1.0, level*0.7 + state.bass*0.3));
    // mvp
    const aspect = w / Math.max(1, h);
    const persp = perspective(0.9, aspect, 0.1, 100);
    const zoom = 0.9 + 0.5 * (0.6*level + 0.4*(state.zoom||1.0));
    const eye = [0, 0, 3.0/zoom];
    const center = [0, 0, 0];
    const up = [0, 1, 0];
    const view = lookAt(eye, center, up);
    // rotation by time and tilt
    const ry = () => {
      const a = t*0.0002 + state.tilt[0]*0.8;
      return [
        Math.cos(a),0,Math.sin(a),0,
        0,1,0,0,
        -Math.sin(a),0,Math.cos(a),0,
        0,0,0,1
      ];
    };
    const rx = () => {
      const a = Math.sin(t*0.00013)*0.3 + state.tilt[1]*0.6;
      return [
        1,0,0,0,
        0,Math.cos(a),-Math.sin(a),0,
        0,Math.sin(a),Math.cos(a),0,
        0,0,0,1
      ];
    };
    let mvp = matMul(persp, matMul(view, matMul(ry(), rx())));
    // pass matrices (WebGL expects Float32Array)
    gl.uniformMatrix4fv(u.u_mvp, false, new Float32Array(mvp));
    // normal matrix (3x3) from model-view (approximate)
    gl.uniformMatrix3fv(u.u_norm, false, new Float32Array([
      1,0,0,0,1,0,0,0,1
    ]));
  }

  // Draw frame
  function frame(t) {
    if (!running) { lastTime = t; frameId = requestAnimationFrame(frame); return; }
    const dt = t - lastTime;
    lastTime = t;
    if (!gl) {
      // attempt to initialize once
      if (initGL()) {
        rendererMode = 'webgl';
      } else {
        // fallback to Canvas2D
        rendererMode = 'canvas2d';
        init2D();
      }
    }
    if (rendererMode === 'webgl') {
      resizeGL();
      gl.clearColor(0.03, 0.03, 0.05, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      setUniforms(t);
      // solid pass
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.idx);
      gl.drawElements(gl.TRIANGLES, buffers.idxCount, gl.UNSIGNED_SHORT, 0);
      // wire overlay (lines)
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.lineWidth(1.0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.lines);
      gl.drawElements(gl.LINES, buffers.lineCount, gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.BLEND);
    } else {
      // Canvas2D frame handled by other init2D loop
    }
    // simple adaptive frame limiting in eco mode
    const target = ecoMode ? 30 : 60;
    setTimeout(() => { frameId = requestAnimationFrame(frame); }, 1000 / target);
  }

  // Canvas2D fallback implementation
  let ctx2d = null;
  function init2D() {
    try {
      ctx2d = canvas.getContext('2d');
    } catch (e) { ctx2d = null; }
    if (!ctx2d) return;
    rendererMode = 'canvas2d';
    function draw2D(t) {
      if (!running) { requestAnimationFrame(draw2D); return; }
      const w = canvas.width = window.innerWidth;
      const h = canvas.height = window.innerHeight;
      ctx2d.clearRect(0,0,w,h);
      // background halo
      const light = Math.min(1, state.audio*0.7 + state.bass*0.3);
      const grd = ctx2d.createRadialGradient(w/2 + state.tilt[0]*100, h/2 - state.tilt[1]*100, 20, w/2, h/2, Math.max(w,h));
      grd.addColorStop(0, `rgba(${200+55*light|0},${100+80*state.mid|0},${230|0},${0.5+0.5*light})`);
      grd.addColorStop(1, 'rgba(6,8,18,1)');
      ctx2d.fillStyle = grd;
      ctx2d.fillRect(0,0,w,h);
      // centered faux-poly
      const cx = w/2 + state.tilt[0]*60;
      const cy = h/2 - state.tilt[1]*60;
      const r = (Math.min(w,h)*0.18) * (0.9 + 0.5*state.audio);
      // draw 12-gon to mimic dodecahedron silhouette
      ctx2d.save();
      ctx2d.translate(cx, cy);
      ctx2d.rotate(t*0.00025 + state.tilt[0]*0.5);
      ctx2d.beginPath();
      const sides = 12;
      for (let i=0;i<sides;i++) {
        const a = (i/sides)*Math.PI*2;
        const rr = r * (0.85 + 0.15*Math.sin(i + t*0.002 + state.bass*6));
        const x = Math.cos(a)*rr, y = Math.sin(a)*rr;
        if (i===0) ctx2d.moveTo(x,y); else ctx2d.lineTo(x,y);
      }
      ctx2d.closePath();
      const fade = 0.5 + 0.5*state.treble;
      ctx2d.fillStyle = `rgba(${180+80*state.bass|0},${60+120*state.mid|0},${200|0},${0.5*fade})`;
      ctx2d.fill();
      ctx2d.lineWidth = 2 + 3*state.treble;
      ctx2d.strokeStyle = `rgba(255,255,255,${0.6*fade})`;
      ctx2d.stroke();
      ctx2d.restore();
      // sparks from treble
      if (state.treble > 0.08) {
        const sparks = 6 + (state.treble*20|0);
        for (let i=0;i<sparks;i++) {
          const a = Math.random()*Math.PI*2;
          const rr = r* (1.05 + Math.random()*0.4);
          const x = cx + Math.cos(a)*rr;
          const y = cy + Math.sin(a)*rr;
          ctx2d.fillStyle = `rgba(255,${120+50*state.mid|0},${200|0},${Math.random()*0.8})`;
          ctx2d.fillRect(x, y, 1+Math.random()*2, 1+Math.random()*2);
        }
      }
      requestAnimationFrame(draw2D);
    }
    requestAnimationFrame(draw2D);
  }

  // Public API
  window.s0leVjShaders.setAudio = function (obj) {
    if (!obj) return;
    if (typeof obj.audio === 'number') state.audio = Math.max(0, Math.min(1, obj.audio));
    if (typeof obj.bass === 'number') state.bass = Math.max(0, Math.min(1, obj.bass));
    if (typeof obj.mid === 'number') state.mid = Math.max(0, Math.min(1, obj.mid));
    if (typeof obj.treble === 'number') state.treble = Math.max(0, Math.min(1, obj.treble));
    if (obj.tilt && Array.isArray(obj.tilt)) { state.tilt[0] = obj.tilt[0]; state.tilt[1] = obj.tilt[1]; }
    if (typeof obj.zoom === 'number') state.zoom = obj.zoom;
  };

  window.s0leVjShaders.renderer = function () { return rendererMode; };

  // start loop
  lastTime = performance.now();
  frameId = requestAnimationFrame(frame);

  // Expose small helpers for debugging
  window.s0leVjShaders._internal = { state };
})();
