(function () {
  const FONT = '"HGKUnica77", system-ui, sans-serif';
  const W_MIN = 32;
  const W_MAX = 228;

  const RING_COUNT = 6;
  const RING_INNER = 0.27;
  const RING_GAP = 0.065;
  const RING_SPEED = 0.07;
  const SWIRL_ROW = 0.085;
  const SWIRL_HOLE = 0.25;
  const SWIRL_REACH = 0.4;
  const SWIRL_WORDS = ["GOAL!"];

  const easeOutBack = (x) => {
    const c1 = 1.5, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  };
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  function fit(canvas) {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h, scale: w / Math.max(1, r.width) };
  }

  const widthCache = new Map();
  function measure(ctx, text, size, weight) {
    const key = `${text}|${Math.round(size)}|${Math.round(weight / 8)}`;
    let v = widthCache.get(key);
    if (v === undefined) {
      v = ctx.measureText(text).width;
      widthCache.set(key, v);
    }
    return v;
  }

  function presence(t, phase, speed) {
    const v = Math.sin(t * (speed || 0.22) + phase * 6.283) * 2.2 + 0.7;
    return Math.min(1, Math.max(0, v));
  }

  function drawRingText(ctx, cx, cy, text, radius, size, weight, offset) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const unit = text + "\u00a0\u00a0\u00a0\u00a0\u00a0";
    const circ = 2 * Math.PI * radius;
    const unitW = measure(ctx, unit, size, weight);
    const n = Math.max(1, Math.floor(circ / unitW));
    const stretch = circ / (unitW * n);
    let a = offset;
    for (let r = 0; r < n; r++) {
      for (const ch of unit) {
        const cw = measure(ctx, ch, size, weight) * stretch;
        const mid = a + cw / 2 / radius;
        ctx.save();
        ctx.translate(cx + Math.cos(mid) * radius, cy + Math.sin(mid) * radius);
        ctx.rotate(mid + Math.PI / 2);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        a += cw / radius;
      }
    }
  }

  function ringFrame(ctx, w, h, t, state) {
    const s = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const p = clamp01((t - state.stepStart) / 0.7);
    const grow = easeOutBack(p);
    const burst = Math.pow(1 - p, 2) * 2.4;

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    for (let i = 0; i < RING_COUNT; i++) {
      ctx.fillStyle = state.colors ? state.colors[i % state.colors.length] : "#ffffff";
      const radius = s * (RING_INNER + i * RING_GAP) * (0.35 + 0.65 * grow);
      const size = s * RING_GAP * 0.66 * (0.6 + 0.4 * grow);
      const dir = i % 2 === 0 ? 1 : -1;
      const speed = RING_SPEED * (1 + i * 0.28);
      const offset = dir * (t * speed + burst * (1 + i * 0.15)) + i * 0.9;
      const wave = 0.5 + 0.5 * Math.sin(t * 1.6 + i * 0.8);
      const weight = W_MIN + (W_MAX - W_MIN) * wave;
      const text = state.phrases[i % state.phrases.length];
      drawRingText(ctx, cx, cy, text, radius, size, weight, offset);
    }
  }

  function hash(a, b) {
    const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function swirlFrame(ctx, w, h, t, state) {
    const s = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const rowH = s * SWIRL_ROW;
    const size = rowH * 0.55;
    const pop = easeOutBack(clamp01((t - state.stepStart) / 0.6));
    const reach = s * SWIRL_REACH;
    const hole = s * (state.hole || SWIRL_HOLE);
    const WORDS = state.words || SWIRL_WORDS;

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const rows = Math.ceil(h / rowH) + 2;
    for (let r = 0; r < rows; r++) {
      const y = (r - 1) * rowH + rowH / 2 + ((h % rowH) / 2);
      let x = -(hash(r, 1) * s * 0.3);
      let c = 0;
      while (x < w + s * 0.2) {
        const word = WORDS[Math.floor(hash(r, c + 3) * WORDS.length)];
        const weight = W_MIN + (W_MAX - W_MIN) * (0.5 + 0.5 * Math.sin(t * 1.4 + r * 0.6 + c * 1.3));
        ctx.font = `${weight} ${size}px ${FONT}`;
        const ww = measure(ctx, word, size, weight);
        const wx = x + ww / 2;
        const dx = wx - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        x += ww + size * 1.6;
        c++;
        if (d < hole) continue;

        const base = r % 2 === 0 ? 0 : Math.PI;
        const k = Math.pow(clamp01(1 - (d - hole) / reach), 2);
        const swirl = k * (1.1 + 0.9 * Math.sin(t * 1.3 + state.twist));
        const ang = base + swirl;
        const cosP = Math.cos(swirl), sinP = Math.sin(swirl);
        const px = cx + dx * cosP - dy * sinP;
        const py = cy + dx * sinP + dy * cosP;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.scale(pop, pop);
        ctx.fillText(word, 0, 0);
        ctx.restore();
      }
    }
  }

  function badgeFrame(ctx, w, h, t, state) {
    const info = state.info && state.info();
    const geo = state.geo && state.geo();
    if (!info || !geo) return;
    if (state.layout === "tiles" || state.layout === "single") return tilesFrame(ctx, w, h, t, state, info, geo);
    if (state.layout === "field") return fieldFrame(ctx, w, h, t, state, info, geo);
    if (state.layout === "split") return;
    const dt = Math.min(0.1, Math.max(0, t - (state.last || t)));
    state.last = t;
    state.angles = state.angles || [];

    const k = state.scale;
    const cx = w / 2;
    const cy = h / 2;
    const outer = Math.hypot(w, h) / 2;
    const band = geo.band * k * (1 + (info.size - 1) * 0.25) * (1 + info.spread * 0.15);
    const size = band * 0.8;
    const first = geo.R0 * k + band * 0.75;
    const count = Math.max(2, Math.ceil((outer - first) / band) + 1);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    for (let i = 0; i < count; i++) {
      const f = count > 1 ? i / (count - 1) : 0;
      const weight = Math.min(
        W_MAX,
        Math.max(W_MIN, info.wght * (1 - f) + (W_MIN + W_MAX - info.wght) * f)
      );
      const radius = first + i * band + Math.sin(t * 0.5 + i * 0.7) * band * 0.04;

      const dir = i % 2 === 0 ? 1 : -1;
      state.angles[i] = (state.angles[i] || 0) + dir * (0.025 + i * 0.004 + info.speed * 0.08) * dt;
      const twist = 0;

      const pick = i % 3;
      let text, color;
      if (pick === 0) { text = info.texts[0]; color = geo.orange; }
      else if (pick === 1) { text = info.texts[1]; color = geo.magenta; }
      else { text = info.texts[0] + "   " + info.texts[1]; color = geo.ink; }

      ctx.fillStyle = color;
      ctx.globalAlpha = presence(t, hash(i, 5));
      if (ctx.globalAlpha > 0.01) drawRingText(ctx, cx, cy, text, radius - size * 0.36, size, weight, state.angles[i] + twist + i * 1.3);
      ctx.globalAlpha = 1;
    }
  }

  function drawArcText(ctx, cx, cy, text, radius, size, weight, center, span) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const chars = Array.from(text);
    const widths = chars.map((c) => measure(ctx, c, size, weight));
    const total = widths.reduce((a, b) => a + b, 0) || 1;
    let a = center - span / 2;
    chars.forEach((ch, i) => {
      const part = (widths[i] / total) * span;
      const mid = a + part / 2;
      a += part;
      ctx.save();
      ctx.translate(cx + Math.cos(mid) * radius, cy + Math.sin(mid) * radius);
      ctx.rotate(mid + Math.PI / 2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });
  }

  function arcTile(ctx, cx, cy, R, t, info, geo, seed, rings, bg, fg) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - R, cy - R, R * 2, R * 2);
    ctx.clip();
    ctx.fillStyle = bg;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    for (let i = 0; i < rings; i++) {
      const f = rings > 1 ? i / (rings - 1) : 0;
      const radius = R * (0.86 - f * 0.62);
      const size = Math.min(radius * 0.42 * info.size, (R * 0.62 / Math.max(1, rings - 1)) * 0.85);
      const weight = Math.min(W_MAX, Math.max(W_MIN, info.wght * (1 - f) + (W_MIN + W_MAX - info.wght) * f));
      const dir = (i + seed) % 2 === 0 ? 1 : -1;
      const text = (i + seed) % 2 === 0 ? info.texts[0] : info.texts[1];
      const angle = dir * t * (0.06 + i * 0.02 + info.speed * 0.12) + seed * 1.7 + i * 2.1;
      const unit = text.length * size * 0.62;
      const span = Math.min(Math.PI * 1.7, (unit / radius) * 1.5);
      ctx.fillStyle = i === 0 ? fg : "#ffffff";
      ctx.globalAlpha = presence(t, hash(seed + 3, i + 9), 0.18);
      if (ctx.globalAlpha > 0.01) drawArcText(ctx, cx, cy, text, radius - size * 0.36, size, weight, angle, span);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function tilesFrame(ctx, w, h, t, state, info, geo) {
    if (state.layout === "single") {
      const R = Math.min(w, h) / 2;
      arcTile(ctx, w / 2, h / 2, R, t, info, geo, 0, 4, geo.orange, geo.magenta);
      return;
    }
    const cols = 3;
    const u = w / cols;
    const rows = Math.ceil(h / u);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const odd = (r + c) % 2 === 1;
        const bg = odd ? geo.magenta : geo.orange;
        const fg = odd ? geo.orange : geo.magenta;
        if (hash(r, c) < 0.34) {
          for (let q = 0; q < 4; q++) {
            const qx = q % 2, qy = Math.floor(q / 2);
            const qodd = (qx + qy) % 2 === 1;
            arcTile(ctx, c * u + (qx + 0.5) * u / 2, r * u + (qy + 0.5) * u / 2, u / 4, t, info, geo,
              q + r * 3 + c, 2, qodd ? bg : fg, qodd ? fg : bg);
          }
        } else {
          arcTile(ctx, c * u + u / 2, r * u + u / 2, u / 2, t, info, geo, r * 3 + c, 3, bg, fg);
        }
      }
    }
  }

  function fieldFrame(ctx, w, h, t, state, info, geo) {
    const cs = Math.min(w, h) * 0.11 * (0.9 + 0.2 * info.size);
    const cols = Math.ceil(w / cs) + 1;
    const rows = Math.ceil(h / cs) + 1;
    const letters = (info.texts.join("").replace(/[^A-Z]/g, "") || "GO").split("");
    const words = info.texts.map((x) => x.replace(/[^A-Z' ]/g, "").split(" ")[0] || x);
    const skew = -Math.tan((info.slant * Math.PI) / 180);

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cs + cs / 2;
        const y = r * cs + cs / 2;
        const alpha = presence(t, hash(r + 2, c + 6), 0.16);
        if (alpha < 0.02) continue;
        const kind = hash(r, c + 4);
        const base = [0, 0, Math.PI / 2, Math.PI][Math.floor(hash(r + 7, c) * 4)];
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.rotate(base);
        ctx.transform(1, 0, skew, 1, 0, 0);
        const weight = Math.min(W_MAX, Math.max(W_MIN, info.wght + (kind - 0.5) * 80));
        if (kind < 0.4) {
          const word = words[Math.floor(hash(r, c + 11) * words.length)];
          ctx.font = `${weight} ${cs * 0.34}px ${FONT}`;
          ctx.fillText(word, 0, 0);
        } else if (kind < 0.75) {
          ctx.font = `${weight} ${cs * 0.42}px ${FONT}`;
          ctx.fillText(letters[Math.floor(hash(r + 3, c + 5) * letters.length)], 0, 0);
        } else {
          const q = cs * 0.09;
          const four = hash(r, c + 21) > 0.5;
          const pts = four ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : [[0, 0]];
          for (const [px, py] of pts) ctx.fillRect(px * q * 1.2 - q / 2, py * q * 1.2 - q / 2, q, q);
        }
        ctx.restore();
      }
    }
  }

  function makeScene(frameFn, initial) {
    let raf = 0;
    let running = false;
    const state = Object.assign({ stepStart: 0, phrases: ["GO!"], twist: 0 }, initial);
    let canvas = null;
    let ctx = null;
    const now = () => performance.now() / 1000;

    function loop() {
      if (!running) return;
      const { w, h, scale } = fit(canvas);
      ctx.clearRect(0, 0, w, h);
      state.scale = scale;
      frameFn(ctx, w, h, now(), state);
      raf = requestAnimationFrame(loop);
    }

    return {
      state,
      start(el) {
        canvas = el;
        ctx = el.getContext("2d");
        state.stepStart = now();
        if (running) return;
        running = true;
        loop();
      },
      stop() {
        running = false;
        cancelAnimationFrame(raf);
        if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
      },
      restart() {
        state.stepStart = now();
      },
      setPhrases(list) {
        state.phrases = list;
        state.stepStart = now();
      },
    };
  }

  window.Kinetic = {
    ring: makeScene(ringFrame, { phrases: ["SWITCH!", "LOCK IN!"] }),
    swirl: makeScene(swirlFrame, {}),
    over: makeScene(swirlFrame, { words: ["MATCH OVER!"], hole: 0.32 }),
    badge: makeScene(badgeFrame, {}),
    COUNTDOWN_PHRASES: [
      ["SWITCH!", "LOCK IN!"],
      ["HIT IT!", "QUICK PASS!"],
      ["KEEP GOING!", "NICE ONE!"],
      ["GO!", "PUSH UP!"],
    ],
  };
})();
