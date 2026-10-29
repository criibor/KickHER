(function () {
  const STATIC_CHARS = ":";
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const DIGITS = "0123456789";

  function widthFor(ch) {
    if (/\d/.test(ch)) return 0.8;
    if (ch === " ") return 0.8;
    if ("I!.".includes(ch)) return 0.46;
    if ("MW".includes(ch)) return 1.04;
    if (ch === ":") return 0.42;
    return 0.84;
  }

  function makeTile(ch) {
    const c = document.createElement("div");
    c.className = "flap";
    c.innerHTML =
      '<div class="flap-half flap-top"><b></b></div>' +
      '<div class="flap-half flap-bottom"><b></b></div>' +
      '<div class="flap-half flap-leaf flap-leaf-top"><b></b></div>' +
      '<div class="flap-half flap-leaf flap-leaf-bottom"><b></b></div>';
    const b = c.querySelectorAll("b");
    c._b = { top: b[0], bottom: b[1], leafTop: b[2], leafBottom: b[3] };
    c._leafTop = c.children[2];
    c._leafBottom = c.children[3];
    rest(c, ch);
    return c;
  }

  function makeSign(ch) {
    const c = document.createElement("div");
    c.className = "flap-sign";
    c.textContent = ch;
    c._sign = true;
    return c;
  }

  function rest(c, ch) {
    clearTimeout(c._timer);
    c._value = ch;
    for (const k in c._b) c._b[k].textContent = ch;
    c._leafTop.style.animation = "none";
    c._leafBottom.style.animation = "none";
  }

  function flipOnce(c, to, ms) {
    return new Promise((done) => {
      clearTimeout(c._timer);
      const from = c._value;
      if (from === to) return done();
      c._b.top.textContent = to;
      c._b.bottom.textContent = from;
      c._b.leafTop.textContent = from;
      c._b.leafBottom.textContent = to;
      const half = ms / 2;
      c._leafTop.style.animation = "none";
      c._leafBottom.style.animation = "none";
      void c.offsetWidth;
      c._leafTop.style.animation = `flapTop ${half}ms cubic-bezier(.55,0,1,.45) forwards`;
      c._leafBottom.style.animation = `flapBottom ${half}ms cubic-bezier(0,.55,.45,1) ${half}ms forwards`;
      c._timer = setTimeout(() => {
        rest(c, to);
        done();
      }, ms);
    });
  }

  function build(el, likeText, startBlank) {
    el.classList.add("flap-board");
    el.textContent = "";
    el._cells = Array.from(likeText).map((ch) => {
      const c = STATIC_CHARS.includes(ch) ? makeSign(ch) : makeTile(startBlank ? " " : ch);
      c.style.width = widthFor(ch) + "em";
      el.append(c);
      return c;
    });
  }

  function reset(el, likeText) {
    el._token = (el._token || 0) + 1;
    build(el, likeText, true);
  }

  function set(el, text, opts = {}) {
    const {
      delay = 0, stagger = 60, cycles = 0, step = 110, final = 300,
      pool = /^[\d: ]*$/.test(text) ? DIGITS : LETTERS, instant = false,
    } = opts;
    const chars = Array.from(text);
    if (!el._cells || el._cells.length !== chars.length ||
        el._cells.some((c, i) => !!c._sign !== STATIC_CHARS.includes(chars[i]))) {
      build(el, text, !instant);
    }
    const token = (el._token = (el._token || 0) + 1);
    chars.forEach((ch, i) => {
      const c = el._cells[i];
      c.style.width = widthFor(ch) + "em";
      if (c._sign) { c.textContent = ch; return; }
      if (instant) { rest(c, ch); return; }
      if (c._value === ch && !cycles) return;
      const n = cycles ? cycles + Math.floor(Math.random() * (cycles + 1)) : 0;
      setTimeout(async () => {
        for (let k = 0; k < n; k++) {
          if (el._token !== token) return;
          await flipOnce(c, pool[Math.floor(Math.random() * pool.length)], step);
        }
        if (el._token !== token) return;
        await flipOnce(c, ch, final);
      }, delay + i * stagger);
    });
  }

  window.Flip = { set, reset };
})();
