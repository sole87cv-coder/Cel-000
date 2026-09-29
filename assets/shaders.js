// Resumo: Shaders WebGL leves com API para hero, preview e interação.
// Gera visual reativo ao áudio (rms, bass, treble) e tilt.
(function(){
  'use strict';

  function createShader(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){console.warn('shader compile',gl.getShaderInfoLog(s));gl.deleteShader(s);return null;}return s;}
  function createProgram(gl,vs,fs){const a=createShader(gl,gl.VERTEX_SHADER,vs);const b=createShader(gl,gl.FRAGMENT_SHADER,fs);if(!a||!b) return null;const p=gl.createProgram();gl.attachShader(p,a);gl.attachShader(p,b);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS)){console.warn('program link',gl.getProgramInfoLog(p));return null;}return p;}

  function makeProgram(canvas,fsSource){
    if(!canvas) return null; let gl=null; try{gl=canvas.getContext('webgl',{antialias:false});}catch(e){gl=null;} if(!gl) return null;
    const vs = 'attribute vec2 a_position; void main(){gl_Position=vec4(a_position,0.,1.);}';
    const program = createProgram(gl,vs,fsSource); if(!program) return null;
    const posLoc = gl.getAttribLocation(program,'a_position');
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const uniforms = {};

    function resize(){
      const dpr = Math.min(window.devicePixelRatio||1,2);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      gl.viewport(0,0,canvas.width,canvas.height);
    }

    function draw(now){
      resize(); gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc,2,gl.FLOAT,false,0,0);
      const tLoc = gl.getUniformLocation(program,'u_time'); if(tLoc) gl.uniform1f(tLoc, (now - startTime));
      const rLoc = gl.getUniformLocation(program,'u_resolution'); if(rLoc) gl.uniform2f(rLoc, canvas.width, canvas.height);
      Object.keys(uniforms).forEach((k)=>{ const loc = gl.getUniformLocation(program,k); if(!loc) return; const v = uniforms[k]; if(typeof v === 'number') gl.uniform1f(loc,v); else if(Array.isArray(v)&&v.length===2) gl.uniform2f(loc,v[0],v[1]); });
      gl.drawArrays(gl.TRIANGLES,0,6); raf = window.requestAnimationFrame(draw);
    }

    let raf = null; let startTime = 0;
    const api = {
      start(){ if(raf) return; startTime = performance.now(); raf = window.requestAnimationFrame(draw); },
      stop(){ if(raf){ cancelAnimationFrame(raf); raf=null; } },
      setUniform(n,v){ uniforms[n]=v; }
    };

    document.addEventListener('visibilitychange', ()=>{ if(document.hidden) api.stop(); else api.start(); });
    try{ const io = new IntersectionObserver(entries=>{ entries.forEach(e=>{ if(!e.isIntersecting) api.stop(); else if(!document.hidden) api.start(); }); }); io.observe(canvas);}catch(e){}
    canvas.addEventListener('webglcontextlost', e=>{ e.preventDefault(); api.stop(); }); canvas.addEventListener('webglcontextrestored', ()=>{ api.start(); });
    return api;
  }

  // FRAGMENTS
  const heroFS = 'precision mediump float; uniform vec2 u_resolution; uniform float u_time; uniform vec2 u_tilt; uniform float u_audio; uniform float u_bass; uniform float u_treble;\n'
    + 'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n'
    + 'float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);float a=hash(i);float b=hash(i+vec2(1.,0.));float c=hash(i+vec2(0.,1.));float d=hash(i+vec2(1.,1.));vec2 u=f*f*(3.-2.*f);return mix(a,b,u.x)+ (c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;}\n'
    + 'float fbm(vec2 p){float v=0.;float amp=0.5;for(int i=0;i<3;i++){v+=amp*noise(p);p*=2.;amp*=0.5;}return v;}\n'
    + 'void main(){vec2 uv=gl_FragCoord.xy/u_resolution.xy;vec2 p=(uv-0.5)*vec2(u_resolution.x/u_resolution.y,1.);float t=u_time*0.001;float a=u_audio;float b=u_bass;float tr=u_treble;float n=fbm(p*1.2 + t*0.06);float agitation=a*1.6;vec3 A=vec3(0.141,0.412,0.961);vec3 B=vec3(0.525,0.698,1.0);vec3 C=vec3(0.443,0.435,0.878);float mixv=smoothstep(-0.2,0.8,n + sin(p.x*1.2 + t*0.6)*0.25*agitation);vec3 col=mix(A,B,mixv);col=mix(col,C,b*0.6);float spark=fract(sin(dot(uv*120.0 + t*50.0,vec2(12.9898,78.233)))*43758.5453);col += vec3(pow(spark,40.0)*tr*0.9);col += a*0.06;gl_FragColor=vec4(col,1.0);}';

  const previewFS = 'precision mediump float; uniform vec2 u_resolution; uniform float u_time; uniform float u_size; uniform float u_audio;\n'
    + 'void main(){vec2 uv=gl_FragCoord.xy/u_resolution.xy;vec2 p=uv-0.5;float t=u_time*0.001;float ref=sin((p.x*10.0+t*4.0))*0.002*(1.0+u_audio*1.2)*(1.0+u_size*0.8);vec3 bg=vec3(0.96,0.97,0.99);vec3 mid=vec3(0.88,0.92,1.0);float v=smoothstep(0.0,0.8,length(p));vec3 col=mix(bg,mid,v);col += vec3(u_audio*0.04);gl_FragColor=vec4(col,0.35);}';

  const interactionFS = 'precision mediump float; uniform vec2 u_resolution; uniform float u_time; uniform float u_audio; uniform float u_bass; uniform float u_treble; uniform vec2 u_tilt;\n'
    + 'void main(){vec2 uv=gl_FragCoord.xy/u_resolution.xy;vec2 p=(uv-0.5);p.x *= u_resolution.x/u_resolution.y;float d=length(p - u_tilt*0.0015);float t=u_time*0.001;float audio=clamp(u_audio,0.,1.);float bass=clamp(u_bass,0.,1.);float tre=clamp(u_treble,0.,1.);float w=0.;for(int i=0;i<4;i++){float fi=float(i);w += sin((d*20.0/(1.0+fi*0.5)) - t*2.0 + fi*1.3) * (0.06/(1.0+fi*0.5));}float amp=0.6*audio;vec3 base = mix(vec3(0.94,0.97,1.0), vec3(0.31,0.5,1.0), bass);vec3 col = base + vec3(w*amp*1.2);float sparks = step(0.995, fract(sin(dot(uv*100.0 + t*50.0, vec2(12.9898,78.233)))*43758.5453));col += vec3(sparks*tre*0.9);col *= 1.0 - smoothstep(0.45,0.9,d);gl_FragColor = vec4(col,1.0);}';

  // instâncias
  const inst = { hero:null, preview:null, interaction:null };

  window.ESFShaders = {
    initHero(){ if(!inst.hero) inst.hero = makeProgram(document.getElementById('hero-shader'), heroFS); return inst.hero; },
    initPreview(){ if(!inst.preview) inst.preview = makeProgram(document.getElementById('preview-canvas'), previewFS); return inst.preview; },
    initInteraction(){ if(!inst.interaction) inst.interaction = makeProgram(document.getElementById('interaction-canvas'), interactionFS); return inst.interaction; },
    setSize(i){ try{ if(inst.preview) inst.preview.setUniform('u_size', i); }catch(e){} },
    setAudio(o){ try{ const r=o.rms||0; const b=o.bass||0; const t=o.treble||0; inst.hero && inst.hero.setUniform('u_audio', r); inst.hero && inst.hero.setUniform('u_bass', b); inst.hero && inst.hero.setUniform('u_treble', t); inst.preview && inst.preview.setUniform('u_audio', r); inst.interaction && inst.interaction.setUniform('u_audio', r); inst.interaction && inst.interaction.setUniform('u_bass', b); inst.interaction && inst.interaction.setUniform('u_treble', t); }catch(e){} },
    setTilt(x,y){ try{ if(inst.hero) inst.hero.setUniform('u_tilt',[x||0,y||0]); if(inst.interaction) inst.interaction.setUniform('u_tilt',[x||0,y||0]); }catch(e){} },
    stopAll(){ Object.keys(inst).forEach(k=>{ if(inst[k]){ try{ inst[k].stop(); }catch(e){} inst[k]=null; } }); }
  };

  // auto init hero/preview when DOM ready
  document.addEventListener('DOMContentLoaded', ()=>{ try{ window.ESFShaders.initHero(); window.ESFShaders.initPreview(); }catch(e){} });

})();
