/* v1su4rt — shader único, campo de linhas iridescentes.
   Entradas: nível/graves/médios/agudos do microfone, inclinação do giroscópio
   e ponteiro (mouse/toque) como alternativa quando não há sensores. */
(function () {
  'use strict';

  const vertex = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

  const fragment = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  u_res;
uniform float u_time;
uniform float u_level;   // volume geral      0..1.6
uniform float u_bass;    // graves            0..1.6
uniform float u_mid;     // médios            0..1.6
uniform float u_treble;  // agudos            0..1.6
uniform float u_pulse;   // batida dos graves, decai sozinha
uniform vec2  u_tilt;    // giroscópio        -2..2
uniform vec2  u_point;   // mouse / toque     -1..1

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// cor de filme fino: o espectro inteiro em um único escalar
vec3 film(float x) {
  return 0.5 + 0.5 * cos(6.28318 * (x + vec3(0.00, 0.33, 0.67)));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float t = u_time;

  vec2 focus = u_tilt * 0.28 + u_point * 0.22;
  vec2 p = (uv - focus * 0.5) * (1.6 - 0.25 * min(u_level, 1.0));

  // deformação do domínio: graves abrem o movimento
  float amp = 0.45 + 0.55 * u_bass + 0.25 * u_pulse;
  vec2 w = p;
  w += amp * 0.60 * vec2(sin(w.y * 1.9 + t * 0.31),        cos(w.x * 1.7 - t * 0.27));
  w += amp * 0.35 * vec2(sin(w.y * 3.7 - t * 0.43 + 1.7),  cos(w.x * 3.3 + t * 0.39));
  w += amp * 0.18 * vec2(sin(w.y * 7.1 + t * 0.61 - u_mid * 3.0), cos(w.x * 6.4 - t * 0.57));

  // campo escalar e linhas de nível
  float d = length(w - focus);
  float f = d * 2.2 + 0.35 * sin(w.x * 2.0 + w.y * 1.5 + t * 0.2);
  float ph = f * 6.0 - t * 0.35 - u_pulse * 0.6;
  float band = abs(fract(ph) - 0.5) * 2.0;

  vec3 col = vec3(0.028, 0.035, 0.050);
  vec3 c = film(f * 0.55 + t * 0.03 + u_mid * 0.25 + focus.x * 0.2);
  float line = exp(-band * band * (28.0 - 10.0 * min(u_level, 1.0)));
  float body = 0.5 + 0.5 * cos(ph * 6.28318);
  col += c * (line * (0.75 + 0.9 * u_level) + body * 0.10 * (0.6 + u_level));

  // ondas a partir do foco: crescem com o volume
  float r = length(uv - focus);
  float rr = sin(r * 26.0 - t * 2.2 - u_level * 6.0) * 0.5 + 0.5;
  float ringMask = (1.0 - smoothstep(0.3, 0.9, r)) * u_level;
  col += film(r * 1.2 - t * 0.05) * pow(rr, 6.0) * ringMask * 0.8;

  // brilhos: agudos acendem pontos
  vec2 g = gl_FragCoord.xy / (min(u_res.x, u_res.y) * 0.045);
  vec2 id = floor(g);
  vec2 fr = fract(g) - 0.5;
  float h = hash21(id);
  float tw = step(0.86, h) * pow(max(0.0, sin(t * (3.0 + h * 6.0) + h * 40.0)), 8.0);
  vec2 off = (vec2(hash21(id + 7.1), hash21(id + 3.3)) - 0.5) * 0.4;
  float sp = 1.0 - smoothstep(0.0, 0.22, length(fr + off));
  col += vec3(1.0, 0.97, 0.90) * sp * tw * (0.15 + 1.6 * u_treble);

  col *= 1.0 - 0.55 * smoothstep(0.5, 1.4, length(uv));
  col = col / (1.0 + col * 0.6);
  col = pow(col, vec3(0.92));
  col += (hash21(gl_FragCoord.xy + t) - 0.5) * 0.012;

  gl_FragColor = vec4(col, 1.0);
}
`;

  window.V1Shaders = { vertex: vertex, fragment: fragment };
})();
