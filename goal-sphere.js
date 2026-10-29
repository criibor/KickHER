(() => {
  'use strict';
  const canvas = document.getElementById('goal-sphere');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) { console.error('GOAL sphere requires WebGL.'); return; }

  const vertexSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }`;
  const derivatives = gl.getExtension('OES_standard_derivatives');
  const fragmentSource = `${derivatives ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIV 1' : ''}
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_type;
    uniform vec2 u_resolution;
    uniform vec2 u_center;
    uniform float u_radius;
    uniform float u_rotation;
    uniform float u_spacing;
    uniform float u_line;
    uniform float u_time;
    uniform vec3 u_background;
    const float PI = 3.141592653589793;
    void main() {
      vec2 pixel = v_uv * u_resolution;
      vec2 q = (pixel - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);
      float t = u_time;
      vec2 wave = vec2(
        0.038 * sin(q.y * 9.0 + t * 0.55) + 0.023 * sin(q.x * 12.0 - q.y * 7.0 - t * 0.36),
        0.035 * sin(q.x * 8.0 - t * 0.43) + 0.022 * cos(q.y * 13.0 + q.x * 5.0 + t * 0.32)
      );
      float d = length(q * vec2(1.0, 1.12));
      float pocket = exp(-d * d * 10.0) * (0.11 + 0.015 * sin(t * 0.7));
      vec2 warped = (q + wave + q * pocket) * min(u_resolution.x, u_resolution.y);
      vec2 gridCoord = abs(mod(warped + u_spacing * 0.5, u_spacing) - u_spacing * 0.5);
      float lineDist = min(gridCoord.x, gridCoord.y);
      float gridAlpha = 1.0 - smoothstep(u_line * 0.5 - 0.8, u_line * 0.5 + 0.8, lineDist);
      vec3 tealBackground = vec3(0.0, 177.0 / 255.0, 183.0 / 255.0);
      vec4 outputColor = vec4(mix(tealBackground, vec3(1.0), 0.85 * gridAlpha), 1.0);

      vec2 p = (pixel - u_center) / u_radius;
      float r2 = dot(p, p);
      vec2 shadowP = (pixel - u_center - vec2(u_radius * 0.075, -u_radius * 0.10)) / u_radius;
      float shadowD = length(shadowP);
      float shadow = (1.0 - smoothstep(0.82, 1.32, shadowD)) * 0.20;
      outputColor.rgb *= 1.0 - shadow * smoothstep(0.94, 1.02, sqrt(r2));
      if (r2 <= 1.0) {
        float z = sqrt(max(0.0, 1.0 - r2));
        float frontAngle = atan(p.x, z);
        float centerWeight = pow(max(0.0, 1.0 - r2), 1.35);
        float radialScale = 1.0 - 0.14 * centerWeight;
        vec2 bent = p * radialScale;
        float bentZ = sqrt(max(0.0001, 1.0 - dot(bent, bent)));
        float curvedAngle = atan(bent.x, bentZ);
        float longitude = curvedAngle + u_rotation;
        float latitude = asin(clamp(bent.y, -1.0, 1.0));
        float u = 0.5 + longitude / (2.0 * PI);
        vec2 uv = vec2(fract(u), 0.5 + latitude / PI);
        #ifdef HAS_DERIV
        float uB = fract(u + 0.5) - 0.5;
        if (fwidth(uB) < fwidth(uv.x) - 0.0001) uv.x = uB;
        #endif
        vec4 typeColor = texture2D(u_type, uv);
        vec3 sphereColor = mix(u_background, vec3(1.0), typeColor.a);
        vec3 normal = normalize(vec3(p, z));
        vec3 lightDir = normalize(vec3(-0.48, 0.62, 0.75));
        float diffuse = max(dot(normal, lightDir), 0.0);
        float lighting = 0.74 + 0.26 * diffuse;
        float rimShade = 1.0 - 0.12 * pow(1.0 - z, 2.0);
        sphereColor *= lighting * rimShade;
        float highlight = pow(max(dot(reflect(-lightDir, normal), vec3(0.0, 0.0, 1.0)), 0.0), 22.0);
        sphereColor = mix(sphereColor, vec3(1.0), highlight * 0.055);
        outputColor = vec4(sphereColor, 1.0);
      }
      gl_FragColor = outputColor;
    }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniform = name => gl.getUniformLocation(program, name);
  const U = {
    resolution: uniform('u_resolution'), center: uniform('u_center'), radius: uniform('u_radius'),
    rotation: uniform('u_rotation'), spacing: uniform('u_spacing'), line: uniform('u_line'),
    background: uniform('u_background'), type: uniform('u_type'), time: uniform('u_time')
  };
  const texture = document.createElement('canvas');
  texture.width = 4096;
  texture.height = 2048;
  const tx = texture.getContext('2d');
  const gpuTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gpuTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
  if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  gl.uniform1i(U.type, 0);

  const ROW_LATITUDES = [-37, 0, 37];
  const ROW_BAND = 34;
  const WORDS_AT_EQUATOR = 4;
  const WORD_FILL = 0.86;
  function buildTypography() {
    const W = texture.width, H = texture.height;
    tx.clearRect(0, 0, W, H);
    tx.fillStyle = '#ffffff';
    tx.textAlign = 'center';
    tx.textBaseline = 'middle';
    const bandPx = H * ROW_BAND / 180;
    tx.font = `228 ${bandPx * 0.84}px "HGKUnica77", sans-serif`;
    const wordW = Math.max(1, tx.measureText('GOAL!').width);
    const equatorCell = W / WORDS_AT_EQUATOR;
    for (const lat of ROW_LATITUDES) {
      const k = Math.cos(lat * Math.PI / 180);
      const n = Math.max(1, Math.round(WORDS_AT_EQUATOR * k));
      const cell = W / n;
      const sx = Math.min(cell * WORD_FILL, equatorCell * WORD_FILL / k) / wordW;
      const y = (0.5 - lat / 180) * H;
      const shift = lat === 0 ? 0 : cell * 0.5 * Math.sign(lat);
      for (let c = -1; c <= n; c++) {
        tx.save();
        tx.translate(c * cell + cell / 2 + shift, y);
        tx.scale(sx, 1);
        tx.fillText('GOAL!', 0, 0);
        tx.restore();
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, gpuTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  let active = false, raf = 0, started = 0, duration = 3500, token = 0;
  let width = 1, height = 1, scale = 1, overlay = null;
  function resize() {
    const r = canvas.getBoundingClientRect();
    scale = Math.min(2, window.devicePixelRatio || 1);
    width = Math.max(1, Math.round(r.width * scale));
    height = Math.max(1, Math.round(r.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  }
  function color() {
    const el = overlay || document.getElementById('goal-overlay');
    const styles = getComputedStyle(el);
    const variable = el.classList.contains('p2') ? '--magenta' : '--orange';
    const hex = styles.getPropertyValue(variable).trim();
    const parts = /^#([0-9a-f]{6})$/i.exec(hex);
    if (parts) return [1, 3, 5].map(i => parseInt(parts[1].slice(i - 1, i + 1), 16) / 255);
    return el.classList.contains('p2') ? [0.984, 0, 1] : [1, 0.396, 0.2];
  }
  function frame(now) {
    if (!active) return;
    const t = Math.min(1, (now - started) / duration);
    const entrance = 1 - Math.pow(1 - Math.min(1, t / 0.17), 3);
    const radius = Math.min(width * 0.42, height * 0.36) * (0.35 + 0.65 * entrance);
    const spacing = Math.max(38 * scale, Math.min(width, height) / 5.5);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.resolution, width, height);
    gl.uniform2f(U.center, width * 0.5, height * 0.53);
    gl.uniform1f(U.radius, radius);
    gl.uniform1f(U.rotation, t * Math.PI * 2 * 0.85);
    gl.uniform1f(U.time, (now - started) / 1000);
    gl.uniform1f(U.spacing, spacing);
    gl.uniform1f(U.line, Math.max(1, Math.min(width, height) / 360));
    gl.uniform3fv(U.background, color());
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (t < 1) raf = requestAnimationFrame(frame);
  }
  window.GoalSphere = {
    start(element, ms = 3500) {
      cancelAnimationFrame(raf);
      active = true;
      overlay = element || document.getElementById('goal-overlay');
      duration = ms;
      const current = ++token;
      resize();
      const begin = () => {
        if (!active || current !== token) return;
        buildTypography();
        started = performance.now();
        raf = requestAnimationFrame(frame);
      };
      if (document.fonts?.load) document.fonts.load('228 155px "HGKUnica77"').then(begin, begin);
      else begin();
    },
    stop() {
      active = false;
      ++token;
      cancelAnimationFrame(raf);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  };
  window.addEventListener('resize', () => { if (active) resize(); });
})();
