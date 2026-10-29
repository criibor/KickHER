const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const frameCanvas = document.createElement("canvas");
frameCanvas.width = canvas.width;
frameCanvas.height = canvas.height;
const frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });

const DET_W = 640;
const detCanvas = document.createElement("canvas");
const detCtx = detCanvas.getContext("2d", { willReadFrequently: true });
let K = 1;
function sizeToVideo() {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    frameCanvas.width = w;
    frameCanvas.height = h;
  }
  K = Math.max(1, w / DET_W);
  detCanvas.width = Math.round(w / K);
  detCanvas.height = Math.round(h / K);
  statusEl.textContent = `Camera ${w}×${h}`;
  setTimeout(() => { if (statusEl.textContent.startsWith("Camera ")) statusEl.textContent = ""; }, 6000);
}

const statusEl = document.getElementById("status");
const pickHintEl = document.getElementById("pick-hint");
const colorSlotsEl = document.getElementById("color-slots");
const wghtReadoutEl = document.getElementById("wght-readout");
const rotReadoutEl = document.getElementById("rot-readout");
const lsReadoutEl = document.getElementById("ls-readout");
const sizeReadoutEl = document.getElementById("size-readout");
const slantReadoutEl = document.getElementById("slant-readout");
const wght2ReadoutEl = document.getElementById("wght2-readout");
const slant2ReadoutEl = document.getElementById("slant2-readout");
const discEl = document.querySelector(".disc");
const panelEl = document.querySelector(".specimen-panel");
const ringReadoutEl = document.getElementById("ring-readout");
const ballReadoutEl = document.getElementById("ball-readout");
const scoreReadoutEl = document.getElementById("score-readout");
const goalOverlayEl = document.getElementById("goal-overlay");
let goalReady = false;

if (!window.Kinetic) {
  console.error("kinetic.js was not loaded - put it in the same folder as index.html");
  const noop = { start() {}, stop() {}, setPhrases() {}, restart() {}, state: {} };
  window.Kinetic = { ring: noop, swirl: noop, over: noop, badge: noop, COUNTDOWN_PHRASES: [[], [], [], []] };
  statusEl.textContent = "kinetic.js not found";
}

const WRIST = 0;
const PALM_BASES = [5, 9, 13, 17];
const WGHT_MIN = 32;
const WGHT_MAX = 228;
const HAND_ANGLE_MIN = -75;
const HAND_ANGLE_MAX = 75;

const HAND_COLORS = {
  "0-weight": "#00B1B7",
  "0-italic": "#00B1B7",
  "1-weight": "#FFFFFF",
  "1-italic": "#00B1B7",
};
const HAND_IGNORED_COLOR = "#888888";

const SLANT_MAX = 20;
const FINGER_TIPS = [8, 12, 16, 20];
const FIST_RATIO = 1.1;
const OPEN_RATIO = 1.8;
const LINE_FIST = 1.0;
const LINE_OPEN = 2.4;

const TRACK_BOX_HALO = 3;
const TRACK_BOX_LINE = 1.5;
const TRACK_LABEL_SIZE = 14;
const TRACK_LOST_MS = 500;
const REST_SIZE = 130;
const MIN_AREA = 120;

const ROTATION_SCALE = 1;
const SPIN_FACTOR = 4;
const LS_MIN = -0.25;
const LS_MAX = 0.25;
const X_IN_MIN = 0.1;
const X_IN_MAX = 0.9;
const SIZE_MIN = 32;
const SIZE_MAX = 420;
const Y_IN_MIN = 0.1;
const Y_IN_MAX = 0.9;

const RING_BAND = 0.045;
const BALL_AXIS = "y";
const BALL_IN_MIN = 0.1;
const BALL_IN_MAX = 0.9;
const BALL_MAX_SHARE = 0.8;
const BALL_EASE = 0.06;
const ball = { target: 0.5, value: 0.5, pos: 0.5, seenAt: 0 };

const GOAL_ZONE = 0.08;
const GOAL_LOST_MS = 1500;
const GOAL_COOLDOWN_MS = 6000;
const WIN_SCORE = 3;
const OVER_MS = 9000;
let lastGoal = -Infinity;
let gameRunning = false;

const CIRCLE_WEIGHT_RANGE = 0.07;
const CIRCLE_SPIN_RANGE = 0.03;
const CIRCLE_SLIDE_RANGE = 0.04;
const CIRCLE_BREATH = 0.006;
const CIRCLE_BREATH_SPEED = 1.2;
const TILT_MAX = 4;
const FIT_WORDS = true;
const RING_CLEARANCE = 0.1;

const EASE = { wght: 0.1, rotation: 0.05, spacing: 0.05, size: 0.05, slant: 0.08 };
const NBSP = "\u00a0";
const DEFAULT_PHRASES = [["Player 1"], ["Player 2"]];
const STORAGE_KEY = "io-hand-words-v2";

let phraseLines = DEFAULT_PHRASES.map((list) => [...list]);
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (Array.isArray(saved) && saved.length === 2 && saved.every(Array.isArray)) {
    phraseLines = saved.map((list) => list.map(String));
  }
} catch (e) {}

function parsePhrase(line) {
  const t = line.trim();
  if (!t) return null;
  let a, b;
  if (t.includes("|")) {
    const i = t.indexOf("|");
    a = t.slice(0, i);
    b = t.slice(i + 1).replace(/\|/g, "");
  } else if (/\s/.test(t)) {
    const m = t.match(/^(\S+)\s+(.*)$/);
    a = m[1] + " ";
    b = m[2];
  } else {
    const m = t.match(/^(.+?)([!?.,)]+)$/);
    a = m ? m[1] : t;
    b = m ? m[2] : "";
  }
  a = a.replace(/ +$/, (sp) => NBSP.repeat(sp.length));
  b = b.replace(/^ +/, (sp) => NBSP.repeat(sp.length));
  return [a, b];
}

function getVariants(slot) {
  const list = phraseLines[slot].map(parsePhrase).filter(Boolean);
  return list.length ? list : DEFAULT_PHRASES[slot].map(parsePhrase);
}

const makeState = () => ({ wght: WGHT_MIN, rotation: 0, spacing: 0, size: REST_SIZE, slant: 0 });
const words = [
  {
    el: document.getElementById("specimen"),
    partA: document.getElementById("part-a"),
    partB: document.getElementById("part-b"),
    state: makeState(),
    targets: makeState(),
    variant: 0,
    fistClosed: false,
    lastSwitch: 0,
  },
  {
    el: document.getElementById("specimen-2"),
    partA: document.getElementById("part-a-2"),
    partB: document.getElementById("part-b-2"),
    state: makeState(),
    targets: makeState(),
    variant: 0,
    fistClosed: false,
    lastSwitch: 0,
  },
];

const calibration = { hueTol: 12, satMin: 70, valMin: 70 };

const colorDetectors = [
  {
    id: "pink",
    name: "pink",
    stroke: "#FB00FF",
    text: "#FB00FF",
    enabled: true,
    ranges: [[[145, 100, 100], [170, 255, 255]]],
  },
  {
    id: "orange",
    name: "orange",
    stroke: "#FF6533",
    text: "#FF6533",
    enabled: true,
    ranges: [[[5, 120, 120], [18, 255, 255]]],
  },
  {
    id: "blue",
    name: "blue (Bambu PLA)",
    stroke: "#00B1B7",
    text: "#00B1B7",
    enabled: true,
    ranges: [[[80, 80, 80], [105, 255, 255]]],
  },
];

const COLORS_KEY = "io-hand-colors-v1";
const DEFAULT_DETECTORS = JSON.parse(JSON.stringify(colorDetectors));

function saveColors() {
  try {
    const data = {};
    for (const d of colorDetectors) data[d.id] = { stroke: d.stroke, ranges: d.ranges };
    localStorage.setItem(COLORS_KEY, JSON.stringify(data));
  } catch (e) {}
}

try {
  const saved = JSON.parse(localStorage.getItem(COLORS_KEY));
  if (saved) {
    for (const d of colorDetectors) {
      const entry = saved[d.id];
      if (entry && typeof entry.stroke === "string" && Array.isArray(entry.ranges)) {
        d.stroke = entry.stroke;
        d.text = entry.stroke;
        d.ranges = entry.ranges;
      }
    }
  }
} catch (e) {}

function resetColors() {
  try {
    localStorage.removeItem(COLORS_KEY);
  } catch (e) {}
  colorDetectors.forEach((d, i) => {
    const def = DEFAULT_DETECTORS[i];
    d.stroke = def.stroke;
    d.text = def.text;
    d.ranges = def.ranges.map((pair) => pair.map((hsv) => [...hsv]));
  });
  renderColorSlots();
}

let pickTargetIndex = null;
let cvReady = false;

const SOUND_FILES = {
  warmup: "sounds/warmup.mp3",
  whistle: "sounds/whistle.mp3",
  crowd: "sounds/crowd.mp3",
  goal: "sounds/goal.mp3",
  final: "sounds/final.mp3",
  chant: "sounds/chant.mp3",
};
const SOUND_GAIN = { warmup: 0.45, whistle: 0.9, crowd: 0.9, goal: 1, final: 0.9, chant: 0.75, beep: 0.35 };
const CROWD_MIN = 0.35;
const CROWD_MAX = 1;
const CHANT_DELAY = 1.8;

let audioCtx = null;
let master = null;
const buffers = {};
const loops = {};
let soundsLoading = false;
let crowdLevel = CROWD_MIN;
let chantNode = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    master = audioCtx.createGain();
    master.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  loadSounds();
}

async function loadSounds() {
  if (soundsLoading) return;
  soundsLoading = true;
  await Promise.all(Object.entries(SOUND_FILES).map(async ([name, url]) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      buffers[name] = await audioCtx.decodeAudioData(await res.arrayBuffer());
    } catch (e) {
      console.warn("Sound not loaded:", url);
    }
  }));
  if (!countdownStarted && !gameRunning) startLoop("warmup", 1);
  if (gameRunning) startLoop("crowd", CROWD_MIN);
}

function playSound(name, delay = 0) {
  if (!audioCtx || !buffers[name]) return null;
  const src = audioCtx.createBufferSource();
  src.buffer = buffers[name];
  const gain = audioCtx.createGain();
  gain.gain.value = SOUND_GAIN[name] ?? 1;
  src.connect(gain).connect(master);
  src.start(audioCtx.currentTime + delay);
  return { src, gain };
}

function fadeOut(node, sec = 1) {
  if (!node || !audioCtx) return;
  const t = audioCtx.currentTime;
  const g = node.gain.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(0, t + sec);
  try { node.src.stop(t + sec + 0.05); } catch (e) {}
}

function startLoop(name, level = 1, fadeIn = 1.2) {
  if (loops[name] || !audioCtx || !buffers[name]) return;
  const src = audioCtx.createBufferSource();
  src.buffer = buffers[name];
  src.loop = true;
  const gain = audioCtx.createGain();
  const t = audioCtx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level * (SOUND_GAIN[name] ?? 1), t + fadeIn);
  src.connect(gain).connect(master);
  src.start(t);
  loops[name] = { src, gain };
}

function stopLoop(name, sec = 1) {
  fadeOut(loops[name], sec);
  delete loops[name];
}

function setLoopLevel(name, level) {
  const l = loops[name];
  if (!l) return;
  const g = l.gain.gain;
  const t = audioCtx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.setTargetAtTime(level * (SOUND_GAIN[name] ?? 1), t, 0.3);
}

function startCrowd() {
  crowdLevel = CROWD_MIN;
  startLoop("crowd", CROWD_MIN, 1.5);
}

function stopCrowd(sec = 1) {
  stopLoop("crowd", sec);
}

function beep(freq = 660, ms = 160) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(SOUND_GAIN.beep, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + ms / 1000 + 0.02);
}

function rangeMap(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return outMin;
  const t = (value - inMin) / (inMax - inMin);
  const clamped = Math.min(1, Math.max(0, t));
  return outMin + (outMax - outMin) * clamped;
}

function foldAngle(angle) {
  let a = ((angle % 90) + 90) % 90;
  if (a > 45) a -= 90;
  return a;
}

function panelScale() {
  return Math.min(2, Math.max(0.3, discEl.clientWidth / 640));
}

const LAYOUTS = [
  ["disc", "Disc + rings"],
  ["split", "Split"],
  ["single", "One tile"],
  ["tiles", "Tiles"],
  ["field", "Word field"],
];
const LAYOUT_KEY = "io-hand-layout-v1";
let layout = "disc";
try {
  const saved = localStorage.getItem(LAYOUT_KEY);
  if (LAYOUTS.some(([id]) => id === saved)) layout = saved;
} catch (e) {}

function setLayout(id) {
  layout = id;
  LAYOUTS.forEach(([name]) => document.body.classList.toggle(`layout-${name}`, name === id));
  Kinetic.badge.state.layout = id;
  document.querySelectorAll("#layout-buttons button").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.layout === id);
  });
  if (id !== "split") {
    discEl.style.gridTemplateRows = "";
    discEl.style.background = "";
  }
  try {
    localStorage.setItem(LAYOUT_KEY, id);
  } catch (e) {}
}

const STORY_LAYOUT = "split";
function initLayoutTool() {
  setLayout(STORY_LAYOUT);
}

function setWordVariant(wordIndex, index) {
  const word = words[wordIndex];
  const variants = getVariants(wordIndex);
  word.variant = ((index % variants.length) + variants.length) % variants.length;
  const [a, b] = variants[word.variant];
  word.partA.textContent = a;
  word.partB.textContent = b;
  word.el.setAttribute("aria-label", (a + b).replace(/\u00a0/g, " "));
  if (wordIndex === 1 && /goal/i.test(a + b) && goalReady) showGoal();
  const counter = document.getElementById(`word-count-${wordIndex}`);
  if (counter) counter.textContent = `${word.variant + 1} / ${variants.length}`;
}

function badgeGeometry() {
  const badge = document.querySelector(".badge");
  const cs = getComputedStyle(panelEl);
  const num = (n) => parseFloat(cs.getPropertyValue(n)) || 0;
  const dyn = (n) => parseFloat(panelEl.style.getPropertyValue(n)) || 0;
  const b = badge.clientWidth;
  if (b < 10) return null;

  const disc = num("--disc-base") + dyn("--dyn-disc");
  return {
    R0: (b * disc) / 2,
    band: b * RING_BAND,
    orange: cs.getPropertyValue("--orange").trim(),
    magenta: cs.getPropertyValue("--magenta").trim(),
    ink: cs.getPropertyValue("--ink").trim(),
  };
}

function badgeInfo() {
  const [w1, w2] = words;
  const text = (w) => (w.partA.textContent + w.partB.textContent).replace(/\u00a0/g, " ").toUpperCase();
  const avg = (key) => (Math.abs(w1.state[key]) + Math.abs(w2.state[key])) / 2;
  return {
    texts: [text(w1), text(w2)],
    wght: w1.state.wght,
    speed: Math.min(1, avg("rotation") / 45),
    rot: w1.state.rotation / 45,
    slant: (w1.state.slant + w2.state.slant) / 2,
    spread: Math.min(1, avg("spacing") / Math.max(Math.abs(LS_MIN), Math.abs(LS_MAX))),
    size: 0.6 + 0.8 * Math.min(1, Math.max(0, (w1.state.size - SIZE_MIN) / (SIZE_MAX - SIZE_MIN))),
  };
}

const score = [0, 0];
function showScore(animate = false) {
  const el = document.getElementById("goal-score");
  if (el && window.Flip) Flip.set(el, `${score[0]}:${score[1]}`, animate ? { delay: 700, final: 420 } : { instant: true });
  else if (el) el.textContent = `${score[0]} : ${score[1]}`;
  scoreReadoutEl.textContent = `${score[0]} : ${score[1]}`;
}
let matchOver = false;
let overTimer = null;
function scoreGoal(player) {
  if (matchOver) return;
  if (player === 0 || player === 1) score[player]++;
  showScore(true);
  showGoal(player);
  if ((player === 0 || player === 1) && score[player] >= WIN_SCORE) {
    matchOver = true;
    gameRunning = false;
    cancelEventInterludes();
    overTimer = setTimeout(() => showMatchOver(player), GOAL_MS + 500);
  }
}

function showMatchOver(winner) {
  cancelEventInterludes();
  stopCrowd(0.6);
  playSound("final");
  if (chantNode) fadeOut(chantNode, 0.3);
  chantNode = playSound("chant", CHANT_DELAY);
  setTimeout(() => { fadeOut(chantNode, 1.5); chantNode = null; }, OVER_MS - 1500);
  const overlay = document.getElementById("over-overlay");
  overlay.classList.remove("win-1", "win-2", "draw");
  overlay.classList.add(winner === 0 ? "win-1" : winner === 1 ? "win-2" : "draw");
  document.getElementById("over-winner").textContent = winner === null ? "DRAW" : `PLAYER ${winner + 1} WINS`;
  const overScoreEl = document.getElementById("over-score");
  if (window.Flip) {
    Flip.reset(overScoreEl, `${score[0]}:${score[1]}`);
    Flip.set(overScoreEl, `${score[0]}:${score[1]}`, { delay: 1150, stagger: 140, cycles: 3, step: 95, final: 380 });
  } else overScoreEl.textContent = `${score[0]} : ${score[1]}`;
  overlay.classList.add("active");
  setTimeout(() => {
    overlay.classList.remove("active");
    restartStory();
  }, OVER_MS);
}

function restartStory() {
  stopCrowd();
  if (chantNode) { fadeOut(chantNode, 0.8); chantNode = null; }
  startLoop("warmup", 1, 2);
  score[0] = score[1] = 0;
  showScore();
  ball.target = 0.5;
  ball.pos = 0.5;
  lastGoal = -Infinity;
  matchOver = false;
  gameRunning = false;
  countdownStarted = false;
  clearIntroTimers();
  gameStart = 0;
  cancelEventInterludes();
  halftimeShown = false;
  document.getElementById("over-overlay").classList.remove("active");
  const overlay = document.getElementById("countdown-overlay");
  overlay.style.display = "flex";
  overlay.style.opacity = "1";
  overlay.className = "intro-ready";
  document.getElementById("countdown-number").textContent = "";
}

const GOAL_MS = 3500;
let goalTimer = null;
function showGoal(player) {
  if (!goalOverlayEl) return;
  clearTimeout(goalTimer);
  goalOverlayEl.classList.remove("p1", "p2");
  if (player === 0 || player === 1) goalOverlayEl.classList.add(player === 0 ? "p1" : "p2");
  if (window.GoalSphere) GoalSphere.start(goalOverlayEl, GOAL_MS);
  playSound("goal");
  goalOverlayEl.classList.add("active");
  goalTimer = setTimeout(() => {
    goalOverlayEl.classList.remove("active");
    if (window.GoalSphere) GoalSphere.stop();
  }, GOAL_MS);
}

function checkGoal() {
  if (!gameRunning || !ball.seenAt) return;
  const now = performance.now();
  if (now - lastGoal < GOAL_COOLDOWN_MS) return;
  const atEdge = ball.pos < GOAL_ZONE || ball.pos > 1 - GOAL_ZONE;
  const sinceSeen = now - ball.seenAt;
  const visible = sinceSeen <= TRACK_LOST_MS;
  if (atEdge && (visible || sinceSeen <= GOAL_LOST_MS)) {
    lastGoal = now;
    const inLowGoal = ball.pos < 0.5;
    ball.pos = 0.5;
    scoreGoal(inLowGoal ? 1 : 0);
  }
}

function updateTypography() {
  releaseLostFigures();
  checkGoal();
  ball.value += (ball.target - ball.value) * BALL_EASE;

  if (layout === "split" && performance.now() - lastSeen.blue <= TRACK_LOST_MS) {
    const big = rangeMap(ball.value, 1 - BALL_MAX_SHARE, BALL_MAX_SHARE, 90, SIZE_MAX);
    words[0].targets.size = big;
    words[1].targets.size = Math.max(70, SIZE_MIN + SIZE_MAX - big);
  }
  const scale = panelScale();

  words.forEach((word, i) => {
    const { state, targets } = word;
    for (const key of Object.keys(state)) {
      state[key] += (targets[key] - state[key]) * EASE[key];
    }

    const wght = Math.round(state.wght);
    const spin = (state.rotation * SPIN_FACTOR).toFixed(0);
    const slant = state.slant.toFixed(1);

    const wghtOpposite = WGHT_MIN + WGHT_MAX - wght;
    word.partA.style.fontVariationSettings = `'wght' ${wght}`;
    word.partB.style.fontVariationSettings = `'wght' ${wghtOpposite}`;

    const wanted = state.size * scale;
    const slantRad = (state.slant * Math.PI) / 180;
    word.el.style.fontSize = `${wanted}px`;
    const textW =
      word.partA.offsetWidth +
      word.partB.offsetWidth +
      2 * Math.abs(Math.tan(slantRad)) * 0.5 * wanted;
    const D = discEl.clientWidth;
    const R = (D / 2) * (1 - RING_CLEARANCE);
    const fitHere = FIT_WORDS && layout === "disc";
    const cy = D / 4;
    let k = 1;
    let slideLimit = Infinity;
    if (fitHere && D > 10 && textW > 0 && wanted > 0) {
      const qa = (textW / 2) ** 2 + (0.5 * wanted) ** 2;
      const qb = cy * wanted;
      const qc = cy * cy - R * R;
      k = Math.min(1, (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa));
      const fitted = wanted * k;
      const xMax = Math.sqrt(Math.max(0, R * R - (cy + 0.5 * fitted) ** 2));
      slideLimit = Math.max(0, xMax - (textW * k) / 2) / fitted;
    }
    if (layout === "split" && FIT_WORDS && textW > 0 && wanted > 0) {
      const W = discEl.clientWidth;
      const H = discEl.clientHeight;
      const pShare = Math.min(BALL_MAX_SHARE, Math.max(1 - BALL_MAX_SHARE, ball.value));
      const halfH = (i === 0 ? pShare : 1 - pShare) * H;
      const maxW = W * 0.86;
      const maxH = Math.max(1, halfH * 0.72);
      const safetyW = textW + wanted * 0.22;
      k = Math.max(0.05, Math.min(1, maxW / safetyW, maxH / wanted));
      const fitted = Math.max(1, wanted * k);
      slideLimit = Math.max(0, (maxW - safetyW * k) / 2) / fitted;
      slideLimit = Math.min(slideLimit, 0.12);
    }
    const fontPx = wanted * k;
    const slideUsed = Math.max(-slideLimit, Math.min(slideLimit, state.spacing));
    const slide = slideUsed.toFixed(2);
    const size = Math.round(fontPx);

    word.el.style.fontSize = `${fontPx.toFixed(1)}px`;
    word.el.style.transform = `skewX(${-slant}deg)`;

    word.partA.style.transform = `translateX(${slide}em)`;
    word.partB.style.transform = `translateX(${-slide}em)`;

    if (i === 0) {
      wghtReadoutEl.textContent = `${wght} / ${wghtOpposite}`;
      rotReadoutEl.textContent = `${spin}°`;
      lsReadoutEl.textContent = `${slide}em`;
      sizeReadoutEl.textContent = `${size}px`;
      slantReadoutEl.textContent = `${slant}°`;
    } else {
      wght2ReadoutEl.textContent = `${wght} / ${wghtOpposite}`;
      slant2ReadoutEl.textContent = `${slant}°`;
    }
  });

  const [w1, w2] = words;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  panelEl.style.setProperty("--split", `${(ball.value * 100).toFixed(1)}%`);
  ballReadoutEl.textContent = `${Math.round(ball.value * 100)} / ${Math.round((1 - ball.value) * 100)}%`;

  const ballColor = colorDetectors.find((d) => d.id === "blue").stroke;
  const ballIsVisible = performance.now() - lastSeen.blue <= TRACK_LOST_MS;
  if (gameRunning && ballIsVisible) {
    const inPlayer1Half = ball.pos < 0.5;
    panelEl.style.setProperty("--player1-type-color", inPlayer1Half ? ballColor : "#ffffff");
    panelEl.style.setProperty("--player2-type-color", inPlayer1Half ? "#ffffff" : ballColor);
  } else if (!gameRunning) {
    panelEl.style.setProperty("--player1-type-color", "#ffffff");
    panelEl.style.setProperty("--player2-type-color", "#ffffff");
  }
  if (layout === "split") {
    const p = Math.min(BALL_MAX_SHARE, Math.max(1 - BALL_MAX_SHARE, ball.value));
    discEl.style.gridTemplateRows = `${p}fr ${1 - p}fr`;
    discEl.style.background = `linear-gradient(180deg, var(--orange) ${p * 100}%, var(--magenta) ${p * 100}%)`;
  }
  const weightAvg =
    ((w1.state.wght - WGHT_MIN) / (WGHT_MAX - WGHT_MIN) +
      (w2.state.wght - WGHT_MIN) / (WGHT_MAX - WGHT_MIN)) / 2;
  const spinAmp = clamp01((Math.abs(w1.state.rotation) + Math.abs(w2.state.rotation)) / 2 / 45);
  const slideAmp = clamp01(
    (Math.abs(w1.state.spacing) + Math.abs(w2.state.spacing)) / 2 /
      Math.max(Math.abs(LS_MIN), Math.abs(LS_MAX))
  );
  const breath = Math.sin((performance.now() / 1000) * CIRCLE_BREATH_SPEED * 1.2);

  panelEl.style.setProperty(
    "--dyn-disc",
    ((weightAvg - 0.5) * CIRCLE_WEIGHT_RANGE + breath * CIRCLE_BREATH).toFixed(4)
  );

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const shiftX = clamp(w1.state.spacing / Math.max(Math.abs(LS_MIN), Math.abs(LS_MAX)), -1, 1);
  const shiftY = clamp((w1.state.slant + w2.state.slant) / 2 / SLANT_MAX, -1, 1);
  panelEl.style.setProperty("--ox", shiftX.toFixed(3));
  panelEl.style.setProperty("--oy", shiftY.toFixed(3));
  panelEl.style.setProperty("--tilt", `${((w1.state.rotation / 45) * TILT_MAX).toFixed(2)}deg`);
  panelEl.style.setProperty("--dyn-f1", (spinAmp * CIRCLE_SPIN_RANGE).toFixed(4));
  panelEl.style.setProperty("--dyn-gap3", (slideAmp * CIRCLE_SLIDE_RANGE).toFixed(4));
  if (gameRunning && loops.crowd) {
    const nearGoal = Math.min(1, Math.max(0, (Math.abs(ball.pos - 0.5) * 2 - 0.4) / 0.6));
    const target = CROWD_MIN + (CROWD_MAX - CROWD_MIN) * nearGoal;
    if (Math.abs(target - crowdLevel) > 0.03) {
      crowdLevel = target;
      setLoopLevel("crowd", crowdLevel);
    }
  }
  ringReadoutEl.textContent = `${Math.round(weightAvg * 100)} / ${Math.round(spinAmp * 100)} / ${Math.round(slideAmp * 100)}%`;
}

const lastSeen = { pink: 0, orange: 0, blue: 0 };

function releaseLostFigures() {
  const now = performance.now();
  for (const word of words) {
    if (now - lastSeen.pink > TRACK_LOST_MS) word.targets.rotation = 0;
    if (now - lastSeen.orange > TRACK_LOST_MS) word.targets.spacing = 0;
    if (now - lastSeen.blue > TRACK_LOST_MS) word.targets.size = REST_SIZE;
  }
  if (now - lastSeen.blue > TRACK_LOST_MS) ball.target = 0.5;
}

function applyTracking(id, m) {
  lastSeen[id] = performance.now();
  const [w1, w2] = words;
  switch (id) {
    case "pink": {
      const v = foldAngle(m.angle) * ROTATION_SCALE;
      w1.targets.rotation = v;
      w2.targets.rotation = -v;
      break;
    }
    case "orange": {
      const v = rangeMap(m.x, X_IN_MIN, X_IN_MAX, LS_MIN, LS_MAX);
      w1.targets.spacing = v;
      w2.targets.spacing = -v;
      break;
    }
    case "blue": {
      const bv = BALL_AXIS === "y" ? m.y : m.x;
      ball.target = rangeMap(bv, BALL_IN_MIN, BALL_IN_MAX, BALL_MAX_SHARE, 1 - BALL_MAX_SHARE);
      ball.pos = bv;
      ball.seenAt = performance.now();
      const v = rangeMap(m.y, Y_IN_MIN, Y_IN_MAX, SIZE_MAX, SIZE_MIN);
      w1.targets.size = v;
      w2.targets.size = SIZE_MIN + SIZE_MAX - v;
      break;
    }
  }
}

function toCanvas(p) {
  return { x: (1 - p.x) * canvas.width, y: p.y * canvas.height };
}

function handAngle(landmarks) {
  const wrist = landmarks[WRIST];
  let bx = 0, by = 0;
  for (const i of PALM_BASES) {
    bx += landmarks[i].x;
    by += landmarks[i].y;
  }
  bx /= PALM_BASES.length;
  by /= PALM_BASES.length;

  const dx = -(bx - wrist.x) * canvas.width;
  const dy = (by - wrist.y) * canvas.height;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

function handOpenness(landmarks) {
  const wrist = landmarks[WRIST];
  const dist = (p) =>
    Math.hypot((p.x - wrist.x) * canvas.width, (p.y - wrist.y) * canvas.height);

  const palm = dist(landmarks[9]);
  if (palm === 0) return 1;

  let sum = 0;
  for (const i of FINGER_TIPS) sum += dist(landmarks[i]);
  const ratio = sum / FINGER_TIPS.length / palm;

  return rangeMap(ratio, FIST_RATIO, OPEN_RATIO, 0, 1);
}

function assignHandSlots(hands) {
  const halves = [[], []];
  hands.forEach((landmarks, i) => {
    const x = 1 - landmarks[WRIST].x;
    halves[x < 0.5 ? 0 : 1].push({ i, x });
  });

  const slots = new Array(hands.length).fill(null);
  halves.forEach((group, word) => {
    group.sort((a, b) => a.x - b.x);
    if (group[0]) slots[group[0].i] = `${word}-weight`;
    if (group[1]) slots[group[1].i] = `${word}-italic`;
  });
  return slots;
}

function drawHandAxis(landmarks, angle, openness, color) {
  const wrist = toCanvas(landmarks[WRIST]);
  const palm = { x: 0, y: 0 };
  for (const i of PALM_BASES) {
    const p = toCanvas(landmarks[i]);
    palm.x += p.x / PALM_BASES.length;
    palm.y += p.y / PALM_BASES.length;
  }

  const reach = LINE_FIST + (LINE_OPEN - LINE_FIST) * openness;
  const tip = {
    x: wrist.x + (palm.x - wrist.x) * reach,
    y: wrist.y + (palm.y - wrist.y) * reach,
  };

  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(wrist.x, wrist.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();

  ctx.fillStyle = color;
  for (const p of [wrist, tip]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "16px HGKUnica77, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const label = openness < 0.2 ? `${angle.toFixed(0)}° fist` : `${angle.toFixed(0)}°`;
  ctx.fillText(label, tip.x, tip.y - 12);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

function rgbToOpenCvHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d > 0) {
    if (max === r) hue = 60 * (((g - b) / d) % 6);
    else if (max === g) hue = 60 * ((b - r) / d + 2);
    else hue = 60 * ((r - g) / d + 4);
    if (hue < 0) hue += 360;
  }
  return {
    h: Math.round(hue / 2) % 180,
    s: max === 0 ? 0 : Math.round((255 * d) / max),
    v: max,
  };
}

function hsvRangesFromHue(h, satMin, valMin, hueTol) {
  const sm = satMin;
  const vm = valMin;

  if (h <= hueTol) {
    return [
      [[0, sm, vm], [h + hueTol, 255, 255]],
      [[180 - (hueTol - h), sm, vm], [180, 255, 255]],
    ];
  }
  if (h >= 180 - hueTol) {
    return [
      [[h - hueTol, sm, vm], [180, 255, 255]],
      [[0, sm, vm], [hueTol - (180 - h), 255, 255]],
    ];
  }
  return [[[h - hueTol, sm, vm], [h + hueTol, 255, 255]]];
}

function applyColorToDetector(index, hex, sampled) {
  const detector = colorDetectors[index];
  const [r, g, b] = hexToRgb(hex);
  const { h } = rgbToOpenCvHsv(r, g, b);

  const satMin = sampled
    ? Math.max(25, Math.round(sampled.s - 80))
    : calibration.satMin;
  const valMin = sampled
    ? Math.max(25, Math.round(sampled.v - 100))
    : calibration.valMin;

  detector.stroke = hex;
  detector.text = hex;
  detector.ranges = hsvRangesFromHue(h, satMin, valMin, calibration.hueTol);
  saveColors();
}

function sampleAverageColor(x, y, radius) {
  const x0 = Math.max(0, x - radius);
  const y0 = Math.max(0, y - radius);
  const w = Math.min(canvas.width, x + radius + 1) - x0;
  const h = Math.min(canvas.height, y + radius + 1) - y0;
  const data = frameCtx.getImageData(x0, y0, w, h).data;

  let r = 0, g = 0, b = 0;
  const n = w * h;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function initColorTool() {
  renderColorSlots();
  document.getElementById("reset-colors").addEventListener("click", resetColors);

  canvas.addEventListener("click", (e) => {
    if (pickTargetIndex === null) return;

    const rect = canvas.getBoundingClientRect();
    const scale = Math.max(rect.width / canvas.width, rect.height / canvas.height);
    const offsetX = (rect.width - canvas.width * scale) / 2;
    const offsetY = (rect.height - canvas.height * scale) / 2;
    const x = Math.floor((e.clientX - rect.left - offsetX) / scale);
    const y = Math.floor((e.clientY - rect.top - offsetY) / scale);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    const [r, g, b] = sampleAverageColor(x, y, 4);
    const hex = rgbToHex(r, g, b);
    const { s, v } = rgbToOpenCvHsv(r, g, b);

    applyColorToDetector(pickTargetIndex, hex, { s, v });
    setPickMode(null);
    renderColorSlots();
  });
}

function setPickMode(index) {
  pickTargetIndex = index;
  const picking = index !== null;
  canvas.classList.toggle("is-picking", picking);
  pickHintEl.hidden = !picking;
  renderColorSlots();
}

function renderColorSlots() {
  colorSlotsEl.innerHTML = "";

  colorDetectors.forEach((detector, index) => {
    const slot = document.createElement("div");
    slot.className = "color-slot";
    if (pickTargetIndex === index) slot.classList.add("is-active");

    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = detector.stroke;
    picker.title = `Color for ${detector.name}`;
    picker.addEventListener("input", () => {
      applyColorToDetector(index, picker.value);
    });

    const name = document.createElement("span");
    name.className = "color-slot__name";
    name.textContent = detector.name;

    const enableLabel = document.createElement("label");
    enableLabel.className = "enable";
    const enableCheck = document.createElement("input");
    enableCheck.type = "checkbox";
    enableCheck.checked = detector.enabled;
    enableCheck.addEventListener("change", () => {
      detector.enabled = enableCheck.checked;
    });
    enableLabel.append(enableCheck, document.createTextNode(" Detect"));

    const actions = document.createElement("div");
    actions.className = "color-slot__actions";

    const sampleBtn = document.createElement("button");
    sampleBtn.type = "button";
    sampleBtn.textContent =
      pickTargetIndex === index ? "Cancel sample" : "Sample from video";
    sampleBtn.addEventListener("click", () => {
      setPickMode(pickTargetIndex === index ? null : index);
    });

    actions.append(sampleBtn);

    slot.append(picker, name, enableLabel, actions);
    colorSlotsEl.append(slot);
  });
}

function buildMask(hsv, rangePairs) {
  let mask = null;

  for (const [lowArr, highArr] of rangePairs) {
    let low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [...lowArr, 0]);
    let high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [...highArr, 255]);
    let part = new cv.Mat();
    cv.inRange(hsv, low, high, part);
    low.delete();
    high.delete();

    if (!mask) {
      mask = part;
    } else {
      let merged = new cv.Mat();
      cv.bitwise_or(mask, part, merged);
      mask.delete();
      part.delete();
      mask = merged;
    }
  }

  return mask;
}

function drawDetections(contours, stroke, textColor) {
  let best = null;
  let bestArea = 0;

  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    const area = cv.contourArea(cnt);

    if (area >= MIN_AREA) {
      let rotatedRect = cv.minAreaRect(cnt);
      let vertices = cv.RotatedRect.points(rotatedRect);

      ctx.beginPath();
      ctx.moveTo(vertices[0].x * K, vertices[0].y * K);
      for (let j = 1; j < 4; j++) {
        ctx.lineTo(vertices[j].x * K, vertices[j].y * K);
      }
      ctx.closePath();
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = TRACK_BOX_HALO * K;
      ctx.stroke();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = TRACK_BOX_LINE * K;
      ctx.stroke();

      const label = `${rotatedRect.angle.toFixed(1)}°`;
      ctx.font = `${TRACK_LABEL_SIZE * K}px HGKUnica77, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3 * K;
      ctx.strokeStyle = "#000000";
      ctx.strokeText(label, rotatedRect.center.x * K, rotatedRect.center.y * K);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, rotatedRect.center.x * K, rotatedRect.center.y * K);

      if (area > bestArea) {
        bestArea = area;
        best = {
          angle: rotatedRect.angle,
          x: rotatedRect.center.x / detCanvas.width,
          y: rotatedRect.center.y / detCanvas.height,
        };
      }
    }

    cnt.delete();
  }

  return best;
}

function detectColors() {
  if (!detCanvas.width) return;
  let src = cv.imread(detCanvas);
  let rgb = new cv.Mat();
  let hsv = new cv.Mat();
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);

  for (const detector of colorDetectors) {
    if (!detector.enabled) continue;

    let mask = buildMask(hsv, detector.ranges);
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(
      mask,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    const tracked = drawDetections(contours, detector.stroke, detector.text);
    if (tracked) applyTracking(detector.id, tracked);

    mask.delete();
    contours.delete();
    hierarchy.delete();
  }

  src.delete();
  rgb.delete();
  hsv.delete();
}

const handOpen = { "0-weight": 1, "0-italic": 1, "1-weight": 1, "1-italic": 1 };

let countdownStarted = false;
let introTimers = [];
function clearIntroTimers() { introTimers.forEach(clearTimeout); introTimers = []; }
function triggerCountdownOnHands() {
  if (countdownStarted) return;
  countdownStarted = true;
  clearIntroTimers();
  stopLoop("warmup", 1.5);
  const overlay = document.getElementById("countdown-overlay");
  const numberEl = document.getElementById("countdown-number");
  const subtitle = document.getElementById("intro-subtitle");
  document.body.classList.add("ui-off");
  overlay.style.display = "flex";
  overlay.style.opacity = "1";
  overlay.style.visibility = "visible";
  overlay.style.background = "#00B1B7";
  overlay.className = "intro-ready";
  const frames = [
    { at: 0, mode: "intro-ready", word: "READY?", sub: "" },
    { at: 1050, mode: "intro-versus", word: "", sub: "" },
    { at: 2350, mode: "intro-count", word: "3", sub: "" },
    { at: 3100, mode: "intro-count", word: "2", sub: "" },
    { at: 3850, mode: "intro-count", word: "1", sub: "" },
    { at: 4600, mode: "intro-play", word: "PLAY!", sub: "" },
  ];
  const apply = (frame) => {
    overlay.style.background = frame.mode === "intro-versus"
      ? "linear-gradient(to bottom, #FF6533 0 50%, #FB00FF 50% 100%)"
      : "#00B1B7";
    numberEl.textContent = frame.word;
    overlay.className = frame.mode;
    if (frame.mode === "intro-count") beep(660);
    if (frame.mode === "intro-play") playSound("whistle");
    overlay.style.opacity = "1";
    subtitle.textContent = frame.sub;
    numberEl.style.animation = "none";
    void numberEl.offsetWidth;
    numberEl.style.animation = "introTypeIn .62s cubic-bezier(.16,1,.3,1) both";
  };
  apply(frames[0]);
  for (const frame of frames.slice(1)) introTimers.push(setTimeout(() => apply(frame), frame.at));
  introTimers.push(setTimeout(() => {
    overlay.classList.add("fade-out");
    introTimers.push(setTimeout(() => {
      overlay.style.display = "none";
      gameRunning = true;
      gameStart = performance.now();
      startCrowd();
      halftimeShown = false;
      introTimers = [];
    }, 400));
  }, 5700));
}

let handsDetector = null;

function initHands() {
  handsDetector = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  handsDetector.setOptions({
    maxNumHands: 4,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.6
  });

  handsDetector.onResults(onResults);
}

async function processFrame() {
  if (video.readyState >= 2) {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    frameCtx.drawImage(canvas, 0, 0);
    detCtx.drawImage(canvas, 0, 0, detCanvas.width, detCanvas.height);

    if (cvReady) detectColors();

    if (handsDetector) {
      try { await handsDetector.send({ image: video }); }
      catch (error) { console.warn("Hand tracking frame skipped:", error); }
    }
  }

  requestAnimationFrame(processFrame);
}

function onResults(results) {
  const hands = results.multiHandLandmarks;
  if (hands && hands.length > 0) {
    triggerCountdownOnHands();

    const slots = assignHandSlots(hands);

    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    hands.forEach((landmarks, i) => {
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
        color: HAND_COLORS[slots[i]] || HAND_IGNORED_COLOR,
        lineWidth: 2,
      });
    });
    ctx.restore();

    hands.forEach((landmarks, i) => {
      const slot = slots[i];
      if (!slot) return;

      const [wordIndex, role] = slot.split("-");
      const word = words[Number(wordIndex)];
      const angle = handAngle(landmarks);

      handOpen[slot] += (handOpenness(landmarks) - handOpen[slot]) * 0.35;
      drawHandAxis(landmarks, angle, handOpen[slot], HAND_COLORS[slot]);

      if (role === "weight") {
        word.targets.wght = rangeMap(angle, HAND_ANGLE_MIN, HAND_ANGLE_MAX, WGHT_MIN, WGHT_MAX);
      } else {
        word.targets.slant = rangeMap(angle, HAND_ANGLE_MIN, HAND_ANGLE_MAX, -SLANT_MAX, SLANT_MAX);
      }
    });
  }

  updateTypography();
}

function setCvStatus(text) {
  const el = document.getElementById("cv-status");
  if (el) el.textContent = text;
}

function whenOpenCvReady(callback) {
  let waitingForPromise = false;
  const startedAt = performance.now();

  const check = () => {
    if (typeof cv !== "undefined" && cv.Mat) {
      callback();
      return;
    }
    if (window.openCvFailed) {
      setCvStatus("OpenCV load failed.");
      return;
    }
    if (performance.now() - startedAt > 20000) {
      setCvStatus("OpenCV loading...");
    }
    if (typeof cv !== "undefined" && typeof cv.then === "function" && !waitingForPromise) {
      waitingForPromise = true;
      cv.then((module) => { window.cv = module; });
    }
    setTimeout(check, 100);
  };

  check();
}

async function startDirectCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 }, facingMode: "user" }
    });
    video.srcObject = stream;
    video.addEventListener("loadedmetadata", sizeToVideo);
    video.play();
    statusEl.textContent = "";
  } catch (err) {
    statusEl.textContent = "Camera access blocked or unavailable.";
  }
}

const simBall = { on: false, x: 0.5, y: 0.5 };
document.addEventListener("mousemove", (e) => {
  if (!simBall.on) return;
  simBall.x = e.clientX / window.innerWidth;
  simBall.y = e.clientY / window.innerHeight;
});
setInterval(() => {
  if (simBall.on) applyTracking("blue", { x: simBall.x, y: simBall.y, angle: 0 });
}, 100);

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const el = e.target;
  if (el && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable)) return;

  const key = e.key.toLowerCase();
  if (key === "t") document.body.classList.toggle("theme-dark");
  if (key === "d") document.body.classList.toggle("hide-readouts");
  if (key === "c") triggerCountdownOnHands();
  if (key === "i") showInterlude(INTERLUDES[testInterlude++ % INTERLUDES.length].words);
  if (key === "m") {
    if (!matchOver) {
      score[0] = WIN_SCORE - 1;
      scoreGoal(0);
    }
  }
  if (key === "b") {
    simBall.on = !simBall.on;
  }
  if (key === "arrowup") { simBall.on = true; simBall.y = Math.max(0, simBall.y - 0.05); e.preventDefault(); }
  if (key === "arrowdown") { simBall.on = true; simBall.y = Math.min(1, simBall.y + 0.05); e.preventDefault(); }
  if (key === "arrowleft") { simBall.on = true; simBall.x = Math.max(0, simBall.x - 0.05); }
  if (key === "arrowright") { simBall.on = true; simBall.x = Math.min(1, simBall.x + 0.05); }
  if (key === "?" || key === "/") document.getElementById("keys-help").hidden =
    !document.getElementById("keys-help").hidden;
  if (key === "g") scoreGoal(0);
  if (key === "k") scoreGoal(1);
  if (key === "r") {
    clearTimeout(overTimer);
    restartStory();
  }
  if (key === "h") document.body.classList.toggle("ui-off");
});

initColorTool();
setCvStatus("OpenCV loading...");
whenOpenCvReady(() => {
  cvReady = true;
  setCvStatus("");
});

words.forEach((_, i) => setWordVariant(i, 0));
goalReady = true;

initLayoutTool();
showScore();

Kinetic.badge.state.geo = badgeGeometry;
Kinetic.badge.state.info = badgeInfo;
Kinetic.badge.start(document.getElementById("badge-kinetic"));

const MATCH_SECONDS = 60;
const INTERLUDE_MS = 3000;
const HALF_TIME_SECONDS = MATCH_SECONDS / 2;
let gameStart = 0;
let halftimeShown = false;
let interludeTimer = null;
let testInterlude = 0;
const INTERLUDES = [
  { words: ["HALF TIME!", "30 SECONDS LEFT!"] },
];
const idleOverlayEl = document.getElementById("idle-overlay");
const timeReadoutEl = document.getElementById("time-readout");

function showInterlude(words, duration = INTERLUDE_MS) {
  if (!gameRunning || matchOver || goalOverlayEl.classList.contains("active") ||
      document.getElementById("over-overlay").classList.contains("active")) return;
  clearTimeout(interludeTimer);
  idleOverlayEl.classList.remove("active");
  void idleOverlayEl.offsetWidth;
  idleOverlayEl.classList.add("active");
  playSound("whistle");
  if (window.Flip) {
    const top = document.getElementById("ht-top"), bottom = document.getElementById("ht-bottom");
    Flip.reset(top, "HALF");
    Flip.reset(bottom, "TIME!");
    Flip.set(top, "HALF", { delay: 150, stagger: 80, cycles: 2, step: 85, final: 300 });
    Flip.set(bottom, "TIME!", { delay: 380, stagger: 80, cycles: 2, step: 85, final: 300 });
  }
  interludeTimer = setTimeout(hideInterlude, duration);
}

function hideInterlude() {
  clearTimeout(interludeTimer);
  idleOverlayEl.classList.remove("active");

}

function cancelEventInterludes() {
  hideInterlude();
}

function tickGame() {
  if (!gameRunning || matchOver) {
    timeReadoutEl.textContent = "–";
    return;
  }
  const t = (performance.now() - gameStart) / 1000;
  const remaining = MATCH_SECONDS - t;
  timeReadoutEl.textContent = `${Math.max(0, Math.ceil(remaining))}s`;
  if (goalOverlayEl.classList.contains("active")) return;
  if (t >= MATCH_SECONDS) {
    matchOver = true;
    gameRunning = false;
    showMatchOver(score[0] === score[1] ? null : score[0] > score[1] ? 0 : 1);
    return;
  }
  if (!halftimeShown && t >= HALF_TIME_SECONDS) {
    halftimeShown = true;
    showInterlude(["HALF TIME!", "30 SECONDS LEFT!"], INTERLUDE_MS);
  }
}
setInterval(tickGame, 250);
const SHOW_UI = true;
document.body.classList.toggle("ui-off", !SHOW_UI);

const unlockAudio = () => initAudio();
document.addEventListener("click", unlockAudio, { once: true });
document.addEventListener("keydown", unlockAudio, { once: true });

initHands();
startDirectCamera();
requestAnimationFrame(processFrame);
