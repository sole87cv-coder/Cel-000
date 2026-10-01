/* v1su4rt — renderizador WebGL 3D com dodecaedro + flor dália.
   Dodecaedro: reativo ao giroscópio e microfone.
   Flor: malha de vértices 3D azul, reativa apenas ao microfone.
   Background: deformação via áudio e tilt. */
(function () {
  'use strict';

  // ========== SHADERS ==========
  const VERTEX_3D = `
precision mediump float;

attribute vec3 a_pos;
attribute vec3 a_norm;
attribute vec3 a_color;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform mat4 u_model;
uniform mat4 u_normalMat;

varying vec3 v_pos;
varying vec3 v_norm;
varying vec3 v_color;

void main() {
  vec4 worldPos = u_model * vec4(a_pos, 1.0);
  v_pos = worldPos.xyz;
  v_norm = normalize((u_normalMat * vec4(a_norm, 0.0)).xyz);
  v_color = a_color;
  gl_Position = u_proj * u_view * worldPos;
}
`;

  const FRAGMENT_3D = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float u_time;
uniform float u_audio;    // volume geral 0..1.6
uniform float u_bass;     // graves 0..1.6
uniform float u_mid;      // médios 0..1.6
uniform float u_treble;   // agudos 0..1.6
uniform float u_pulse;    // batida
uniform bool u_wireframe; // wireframe ou sólido

varying vec3 v_pos;
varying vec3 v_norm;
varying vec3 v_color;

void main() {
  vec3 light = normalize(vec3(1.0, 1.0, 1.0));
  float diff = max(0.2, dot(v_norm, light));

  // cor base muito mais brilhante
  vec3 col = v_color * (0.9 + 0.5 * u_audio);

  // reflexão especular intensa
  col += diff * vec3(1.0, 1.0, 1.0) * 0.6;

  // agudos acendem pontos (roxo/magenta)
  col += vec3(1.0, 0.2, 1.0) * u_treble * 0.8;

  // brilho pulsante com graves (verde)
  col += vec3(0.3, 1.0, 0.3) * u_bass * (0.5 + u_pulse * 0.5) * 0.6;

  // ondulação com áudio
  col *= 1.0 + sin(u_time + v_pos.x * 5.0) * u_mid * 0.3;

  // se wireframe, mais opaco
  if (u_wireframe) col *= 0.9;

  gl_FragColor = vec4(col, 1.0);
}
`;

  // ========== SHADERS DA FLOR ==========
  const VERTEX_FLOWER = `
precision mediump float;

attribute vec3 a_pos;
attribute vec3 a_color;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform mat4 u_model;

varying vec3 v_pos;
varying vec3 v_color;

void main() {
  vec4 worldPos = u_model * vec4(a_pos, 1.0);
  v_pos = worldPos.xyz;
  v_color = a_color;
  gl_Position = u_proj * u_view * worldPos;
  gl_PointSize = 3.0;
}
`;

  const FRAGMENT_FLOWER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float u_time;
uniform float u_audio;
uniform float u_bass;
uniform float u_treble;

varying vec3 v_pos;
varying vec3 v_color;

void main() {
  vec3 col = v_color;

  // glow nos vértices muito mais pronunciado
  float glow = 0.5 + u_treble * 1.2;
  col += vec3(1.0, 0.8, 1.0) * glow * 0.6;

  // brilho com som forte
  col *= 1.0 + u_audio * 0.8;

  // pulsação com bass
  col += vec3(0.2, 0.8, 1.0) * u_bass * 0.5;

  gl_FragColor = vec4(col, 1.0);
}
`;

  const VERTEX_BG = `
precision mediump float;

attribute vec2 a_pos;

varying vec2 v_uv;

void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

  const FRAGMENT_BG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_res;
uniform float u_time;
uniform float u_audio;
uniform vec2 u_tilt;

varying vec2 v_uv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = v_uv;
  float t = u_time * 0.3;

  // BACKGROUND MÁS OSCURO para que la flor brille
  vec2 center = vec2(0.5);
  float r = length(uv - center);

  // gradiente: negro profundo → azul oscuro
  vec3 col = mix(
    vec3(0.02, 0.02, 0.05),     // muy oscuro
    vec3(0.08, 0.05, 0.15),     // azul oscuro
    smoothstep(0.0, 1.0, r)
  );

  // pulso sutil de fondo
  col += vec3(0.05, 0.02, 0.08) * (0.3 + 0.2 * sin(t * 0.5));

  // pequeñas ondas muy sutiles
  col += vec3(0.1, 0.05, 0.15) * sin(r * 5.0 - t) * 0.1 * u_audio;

  // ruido muy bajo
  col += (hash21(uv + t * 0.1) - 0.5) * 0.01;

  gl_FragColor = vec4(col, 1.0);
}
`;

  // ========== GEOMETRIA ==========
  const PHI = (1.0 + Math.sqrt(5.0)) / 2.0;

  // Vértices de um dodecaedro inscrito
  const DODECA_VERTS = [
    [-1,-1,-1], [1,-1,-1], [-1,1,-1], [1,1,-1],
    [-1,-1,1], [1,-1,1], [-1,1,1], [1,1,1],
    [0,-PHI,-1/PHI], [0,PHI,-1/PHI], [-PHI,-1/PHI,0], [PHI,-1/PHI,0],
    [-PHI,1/PHI,0], [PHI,1/PHI,0], [-1/PHI,0,-PHI], [1/PHI,0,-PHI],
    [-1/PHI,0,PHI], [1/PHI,0,PHI], [0,-PHI,1/PHI], [0,PHI,1/PHI],
  ];

  // Faces pentagonais do dodecaedro (índices)
  const DODECA_FACES = [
    [0,8,9,2,14], [0,14,15,1,8], [0,10,12,2,14],
    [1,11,13,3,15], [1,8,9,19,11], [2,9,19,6,12],
    [3,13,12,6,7], [3,15,14,2,9], [4,17,16,6,19],
    [4,18,11,5,17], [4,10,0,8,18], [5,11,13,7,17],
    [5,18,8,1,11], [6,16,10,12,19], [7,13,3,15,17],
    [7,17,16,4,10], [9,14,2,12,19], [10,0,14,15,11],
    [16,17,5,4,18], [16,6,12,10,4],
  ];

  // ========== GEOMETRIA DA FLOR ==========
  function makeFlower(layers = 6) {
    const verts = [];
    const colors = [];

    // pétalas: camadas simples, FÁCIL de ver
    for (let layer = 0; layer < layers; layer++) {
      const ratio = (layer + 1) / layers;
      const radius = 0.2 + ratio * 1.2;  // mais grande
      const height = Math.sin(ratio * Math.PI) * 0.3;
      const segments = 20 + layer * 3;  // mais pontos

      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = height - 0.3;  // mais abaixo

        verts.push(x, y, z);

        // cor VERMELHA: gradiente vermelho escuro → vermelho brilhante
        const red = 0.8 + ratio * 0.2;    // 0.8 a 1.0
        const green = 0.05 * ratio;        // 0.0 a 0.05
        const blue = 0.05 * ratio;         // 0.0 a 0.05
        colors.push(red, green, blue);
      }
    }

    // miolo (esfera, VERMELHO INTENSO)
    const coreSegments = 16;
    const coreLayers = 8;
    for (let lat = 0; lat < coreLayers; lat++) {
      const theta = (lat / coreLayers) * Math.PI;
      const sinTheta = Math.sin(theta);
      const y = Math.cos(theta) * 0.2 - 0.3;

      for (let lon = 0; lon < coreSegments; lon++) {
        const phi = (lon / coreSegments) * Math.PI * 2;
        const x = Math.sin(phi) * sinTheta * 0.2;
        const z = Math.cos(phi) * sinTheta * 0.2;

        verts.push(x, y, z);
        colors.push(1.0, 0.2, 0.0); // rojo naranja intenso
      }
    }

    // gotas de agua: puntos brillantes BLANCOS
    const dropCount = 30;
    for (let i = 0; i < dropCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.4 + Math.random() * 0.8;
      const height = (Math.random() - 0.5) * 0.6 - 0.3;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      verts.push(x, height, z);
      colors.push(1.0, 1.0, 0.9); // blanco brillante
    }

    return { verts: new Float32Array(verts), colors: new Float32Array(colors), count: verts.length / 3 };
  }

  function makeDodeca(scale = 0.7) {
    const verts = [];
    const norms = [];
    const colors = [];
    const indices = [];

    // normalizar vértices
    for (let v of DODECA_VERTS) {
      let len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
      verts.push(v[0]/len*scale, v[1]/len*scale, v[2]/len*scale);
    }

    let idx = 0;
    for (let face of DODECA_FACES) {
      // triangular cada pentágono: vertex 0,1,2, então 0,2,3, então 0,3,4
      for (let i = 1; i < face.length - 1; i++) {
        const [a, b, c] = [face[0], face[i], face[i+1]];

        // normal (triângulo)
        const v1 = [
          DODECA_VERTS[b][0] - DODECA_VERTS[a][0],
          DODECA_VERTS[b][1] - DODECA_VERTS[a][1],
          DODECA_VERTS[b][2] - DODECA_VERTS[a][2]
        ];
        const v2 = [
          DODECA_VERTS[c][0] - DODECA_VERTS[a][0],
          DODECA_VERTS[c][1] - DODECA_VERTS[a][1],
          DODECA_VERTS[c][2] - DODECA_VERTS[a][2]
        ];
        let nx = v1[1]*v2[2] - v1[2]*v2[1];
        let ny = v1[2]*v2[0] - v1[0]*v2[2];
        let nz = v1[0]*v2[1] - v1[1]*v2[0];
        let nlen = Math.sqrt(nx*nx + ny*ny + nz*nz);
        if (nlen > 0.001) { nx/=nlen; ny/=nlen; nz/=nlen; }

        // cor alternada: roxo VIBRANTE + verde VIBRANTE
        const hue = (idx % 2) === 0 ? [1.0, 0.1, 1.0] : [0.1, 1.0, 0.3];

        for (let vi of [a, b, c]) {
          indices.push(verts.length / 3);
          verts.push(DODECA_VERTS[vi][0]/Math.sqrt(3), DODECA_VERTS[vi][1]/Math.sqrt(3), DODECA_VERTS[vi][2]/Math.sqrt(3));
          norms.push(nx, ny, nz);
          colors.push(...hue);
        }
        idx++;
      }
    }

    return { verts: new Float32Array(verts), norms: new Float32Array(norms), colors: new Float32Array(colors), indices: new Uint16Array(indices), count: indices.length };
  }

  // ========== RENDERIZADOR ==========
  let gl = null;
  let progBg = null, progDodeca = null;
  let dodeca = null;
  let vao = null, vaoIndices = null;
  let state = { audio: 0, bass: 0, mid: 0, treble: 0, pulse: 0, tiltX: 0, tiltY: 0 };
  let time = 0;
  let raf = 0;
  let wireframe = false;
  let canvas = null;
  let rendererMode = 'webgl'; // ou '2d' se fallback

  // variáveis da flor
  let progFlower = null;
  let flower = null;
  let flowerVerts = null;
  let flowerColors = null;
  let flowerRotation = 0;

  function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[v1su4rt] Shader error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function linkProgram(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('[v1su4rt] Link error:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  function initGL() {
    if (!canvas) {
      console.warn('[v1su4rt] canvas #stage não encontrado');
      return false;
    }

    const opts = { alpha: false, antialias: true, depth: true, stencil: false, powerPreference: 'high-performance' };
    try {
      gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    } catch (e) {
      console.error('[v1su4rt] WebGL indisponível:', e);
      return false;
    }

    if (!gl) {
      console.info('[v1su4rt] WebGL indisponível, usando Canvas2D');
      rendererMode = '2d';
      return false;
    }

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.05, 0.02, 0.08, 1.0);

    // programa background
    const vsBg = compileShader(gl.VERTEX_SHADER, VERTEX_BG);
    const fsBg = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_BG);
    if (!vsBg || !fsBg) return false;
    progBg = linkProgram(vsBg, fsBg);
    if (!progBg) return false;

    // programa dodecaedro
    const vs = compileShader(gl.VERTEX_SHADER, VERTEX_3D);
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_3D);
    if (!vs || !fs) return false;
    progDodeca = linkProgram(vs, fs);
    if (!progDodeca) return false;

    // geometria
    dodeca = makeDodeca(1.0);

    // VAO (se suportado)
    const ext = gl.getExtension('OES_vertex_array_object');
    if (ext) {
      vao = ext.createVertexArrayOES();
      ext.bindVertexArrayOES(vao);
    }

    // buffers
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, dodeca.verts, gl.STATIC_DRAW);
    let posLoc = gl.getAttribLocation(progDodeca, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    const normBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, dodeca.norms, gl.STATIC_DRAW);
    let normLoc = gl.getAttribLocation(progDodeca, 'a_norm');
    gl.enableVertexAttribArray(normLoc);
    gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0);

    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, dodeca.colors, gl.STATIC_DRAW);
    let colorLoc = gl.getAttribLocation(progDodeca, 'a_color');
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);

    vaoIndices = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vaoIndices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, dodeca.indices, gl.STATIC_DRAW);

    if (ext) ext.bindVertexArrayOES(null);

    // --- INICIALIZAR FLOR ---
    const vsFlower = compileShader(gl.VERTEX_SHADER, VERTEX_FLOWER);
    const fsFlower = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_FLOWER);
    if (vsFlower && fsFlower) {
      progFlower = linkProgram(vsFlower, fsFlower);
      if (progFlower) {
        flower = makeFlower(8); // 8 camadas de pétalas

        // buffers da flor
        flowerVerts = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, flowerVerts);
        gl.bufferData(gl.ARRAY_BUFFER, flower.verts, gl.STATIC_DRAW);

        flowerColors = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, flowerColors);
        gl.bufferData(gl.ARRAY_BUFFER, flower.colors, gl.STATIC_DRAW);
      }
    }

    return true;
  }

  function resizeGL() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (gl) gl.viewport(0, 0, w, h);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0.001, (now - window._lastFrame || now) / 1000));
    window._lastFrame = now;
    time += dt;

    resizeGL();

    // --- BACKGROUND ---
    gl.useProgram(progBg);
    const bgQuadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bgQuadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const posLocBg = gl.getAttribLocation(progBg, 'a_pos');
    gl.enableVertexAttribArray(posLocBg);
    gl.vertexAttribPointer(posLocBg, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(gl.getUniformLocation(progBg, 'u_res'), canvas.width, canvas.height);
    gl.uniform1f(gl.getUniformLocation(progBg, 'u_time'), time);
    gl.uniform1f(gl.getUniformLocation(progBg, 'u_audio'), state.audio);
    gl.uniform2f(gl.getUniformLocation(progBg, 'u_tilt'), state.tiltX, state.tiltY);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // --- DODECAEDRO (TEMPORALMENTE DESACTIVADO PARA ENFOQUE EN FLOR) ---
    // gl.useProgram(progDodeca);

    // matrizes
    const aspect = canvas.width / canvas.height;
    const proj = perspective(45, aspect, 0.1, 100);
    const view = lookAt([0,0,3.5], [0,0,0], [0,1,0]);
    // const model = identity();
    // // rotação via giroscópio
    // rotateY(model, state.tiltX * Math.PI);
    // rotateX(model, state.tiltY * Math.PI);
    // // rotação autônoma
    // rotateZ(model, time * 0.3 + state.audio * 1.5);
    // // escala com áudio
    // const scale = 1.0 + state.audio * 0.3;
    // m4mult(model, [scale,0,0,0, 0,scale,0,0, 0,0,scale,0, 0,0,0,1]);

    // const normalMat = transpose(inverse(model));

    // gl.uniformMatrix4fv(gl.getUniformLocation(progDodeca, 'u_proj'), false, proj);
    // gl.uniformMatrix4fv(gl.getUniformLocation(progDodeca, 'u_view'), false, view);
    // gl.uniformMatrix4fv(gl.getUniformLocation(progDodeca, 'u_model'), false, model);
    // gl.uniformMatrix4fv(gl.getUniformLocation(progDodeca, 'u_normalMat'), false, normalMat);

    // gl.uniform1f(gl.getUniformLocation(progDodeca, 'u_time'), time);
    // gl.uniform1f(gl.getUniformLocation(progDodeca, 'u_audio'), state.audio);
    // gl.uniform1f(gl.getUniformLocation(progDodeca, 'u_bass'), state.bass);
    // gl.uniform1f(gl.getUniformLocation(progDodeca, 'u_mid'), state.mid);
    // gl.uniform1f(gl.getUniformLocation(progDodeca, 'u_treble'), state.treble);
    // gl.uniform1f(gl.getUniformLocation(progDodeca, 'u_pulse'), state.pulse);
    // gl.uniform1i(gl.getUniformLocation(progDodeca, 'u_wireframe'), wireframe ? 1 : 0);

    // // bind VAO e draw
    // const ext = gl.getExtension('OES_vertex_array_object');
    // if (ext && vao) ext.bindVertexArrayOES(vao);

    // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vaoIndices);
    // gl.drawElements(gl.TRIANGLES, dodeca.count, gl.UNSIGNED_SHORT, 0);

    // --- FLOR ---
    if (progFlower && flower) {
      gl.useProgram(progFlower);

      // modelo da flor: só com áudio, SEM giroscópio
      const modelFlower = identity();
      // rotação lenta + aceleração com áudio
      flowerRotation += dt * (0.2 + state.audio * 0.8);
      rotateY(modelFlower, flowerRotation);
      // escala com áudio
      const scaleFlower = 0.9 + state.audio * 0.5;
      m4mult(modelFlower, [scaleFlower,0,0,0, 0,scaleFlower,0,0, 0,0,scaleFlower,0, 0,0,0,1]);

      gl.uniformMatrix4fv(gl.getUniformLocation(progFlower, 'u_proj'), false, proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(progFlower, 'u_view'), false, view);
      gl.uniformMatrix4fv(gl.getUniformLocation(progFlower, 'u_model'), false, modelFlower);

      gl.uniform1f(gl.getUniformLocation(progFlower, 'u_time'), time);
      gl.uniform1f(gl.getUniformLocation(progFlower, 'u_audio'), state.audio);
      gl.uniform1f(gl.getUniformLocation(progFlower, 'u_bass'), state.bass);
      gl.uniform1f(gl.getUniformLocation(progFlower, 'u_treble'), state.treble);

      // bind e draw
      if (flowerVerts) {
        gl.bindBuffer(gl.ARRAY_BUFFER, flowerVerts);
        const posLocFlower = gl.getAttribLocation(progFlower, 'a_pos');
        gl.enableVertexAttribArray(posLocFlower);
        gl.vertexAttribPointer(posLocFlower, 3, gl.FLOAT, false, 0, 0);
      }

      if (flowerColors) {
        gl.bindBuffer(gl.ARRAY_BUFFER, flowerColors);
        const colorLocFlower = gl.getAttribLocation(progFlower, 'a_color');
        gl.enableVertexAttribArray(colorLocFlower);
        gl.vertexAttribPointer(colorLocFlower, 3, gl.FLOAT, false, 0, 0);
      }

      gl.drawArrays(gl.POINTS, 0, flower.count);
    }
  }

  // ========== MATH ==========
  function identity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov * Math.PI / 360);
    const nf = 1 / (near - far);
    return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];
  }
  function lookAt(eye, center, up) {
    const f = [center[0]-eye[0], center[1]-eye[1], center[2]-eye[2]];
    let flen = Math.sqrt(f[0]*f[0]+f[1]*f[1]+f[2]*f[2]);
    f[0]/=flen; f[1]/=flen; f[2]/=flen;
    const s = [up[1]*f[2]-up[2]*f[1], up[2]*f[0]-up[0]*f[2], up[0]*f[1]-up[1]*f[0]];
    let slen = Math.sqrt(s[0]*s[0]+s[1]*s[1]+s[2]*s[2]);
    s[0]/=slen; s[1]/=slen; s[2]/=slen;
    const u = [f[1]*s[2]-f[2]*s[1], f[2]*s[0]-f[0]*s[2], f[0]*s[1]-f[1]*s[0]];
    return [s[0],-u[0],f[0],0, s[1],-u[1],f[1],0, s[2],-u[2],f[2],0, -dot(s,eye),-dot(u,eye),-dot(f,eye),1];
  }
  function dot(a,b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
  function rotateX(m, ang) { const c=Math.cos(ang), s=Math.sin(ang); const t=[1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1]; m4mult(m, t); }
  function rotateY(m, ang) { const c=Math.cos(ang), s=Math.sin(ang); const t=[c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1]; m4mult(m, t); }
  function rotateZ(m, ang) { const c=Math.cos(ang), s=Math.sin(ang); const t=[c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1]; m4mult(m, t); }
  function m4mult(a, b) { for(let i=0;i<16;i++)a[i]=b[i%4]*a[Math.floor(i/4)*4] + b[(i%4)+4]*a[Math.floor(i/4)*4+1] + b[(i%4)+8]*a[Math.floor(i/4)*4+2] + b[(i%4)+12]*a[Math.floor(i/4)*4+3]; }
  function inverse(m) { /* simplificado */ return m; }
  function transpose(m) { return [m[0],m[4],m[8],m[12], m[1],m[5],m[9],m[13], m[2],m[6],m[10],m[14], m[3],m[7],m[11],m[15]]; }

  // ========== API PÚBLICA ==========
  window.v1su4rtShaders = {
    init: function(canvasId) {
      canvas = document.getElementById(canvasId || 'stage');
      if (initGL()) {
        frame(performance.now());
      } else {
        rendererMode = '2d';
      }
    },
    setAudio: function(obj) {
      if (!obj) return;
      state.audio = Math.max(0, obj.audio || 0);
      state.bass = Math.max(0, obj.bass || 0);
      state.mid = Math.max(0, obj.mid || 0);
      state.treble = Math.max(0, obj.treble || 0);
      state.pulse = Math.max(0, obj.pulse || 0);
      if (obj.tilt) {
        state.tiltX = obj.tilt[0] || 0;
        state.tiltY = obj.tilt[1] || 0;
      }
      wireframe = state.audio > 0.8; // wireframe quando som alto
    },
    stop: function() {
      if (raf) cancelAnimationFrame(raf);
    },
    renderer: function() { return rendererMode; }
  };
})();
