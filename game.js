(() => {
  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const bestEl = document.getElementById("best");
  const overlayEl = document.getElementById("overlay");
  const levelBannerEl = document.getElementById("levelBanner");
  const menuEl = document.getElementById("menu");
  const startBtn = document.getElementById("startBtn");
  const menuHardModeBtn = document.getElementById("menuHardModeBtn");
  const iconGridEl = document.getElementById("iconGrid");
  const iconsProgressEl = document.getElementById("iconsProgress");
  const hardModeBtn = document.getElementById("hardModeBtn");

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const BEST_STORAGE_KEY = "mini-dash-best";
  const PROGRESS_STORAGE_KEY = "mini-dash-completed-levels";
  const ICON_STORAGE_KEY = "mini-dash-selected-icon";
  const DEATHS_STORAGE_KEY = "mini-dash-death-count";
  const HARD_MODE_STORAGE_KEY = "mini-dash-hard-mode";
  const HARD_MODE_COMPLETED_STORAGE_KEY = "mini-dash-hard-mode-completed";

  const loadBest = () => {
    const raw = localStorage.getItem(BEST_STORAGE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };
  const saveBest = (best) => localStorage.setItem(BEST_STORAGE_KEY, String(best));

  const loadCompletedLevels = () => {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };
  const saveCompletedLevels = (n) => localStorage.setItem(PROGRESS_STORAGE_KEY, String(n));

  const loadSelectedIcon = () => localStorage.getItem(ICON_STORAGE_KEY) || "classic";
  const saveSelectedIcon = (iconId) => localStorage.setItem(ICON_STORAGE_KEY, iconId);

  const loadDeathCount = () => {
    const raw = localStorage.getItem(DEATHS_STORAGE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };
  const saveDeathCount = (n) => localStorage.setItem(DEATHS_STORAGE_KEY, String(n));

  const loadHardMode = () => localStorage.getItem(HARD_MODE_STORAGE_KEY) === "true";
  const saveHardMode = (enabled) => localStorage.setItem(HARD_MODE_STORAGE_KEY, String(enabled));

  const loadHardModeCompletedLevels = () => {
    const raw = localStorage.getItem(HARD_MODE_COMPLETED_STORAGE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };
  const saveHardModeCompletedLevels = (n) => localStorage.setItem(HARD_MODE_COMPLETED_STORAGE_KEY, String(n));

  const state = {
    mode: /** @type {"ready"|"playing"|"dead"|"won"} */ ("ready"),
    t: 0,
    levelTime: 0,
    score: 0,
    best: loadBest(),
    levelIndex: 0,
    levelProgress: 0,
    levelEndProgress: 0,
    completedLevels: 0,
    deathCount: 0,
    selectedIconId: "classic",
    hardMode: false,
    hardModeCompletedLevels: 0,
  };

  const REWIND_SECONDS = 10;
  const HISTORY_FRAMES = REWIND_SECONDS * 120;

  /** @type {{
   *  t:number,
   *  levelTime:number,
   *  score:number,
   *  levelIndex:number,
   *  levelProgress:number,
   *  levelEndProgress:number,
   *  player:{x:number,y:number,w:number,h:number,vy:number,onGround:boolean,rotation:number,jumpHeldTime:number},
   *  obstacles:{x:number,y:number,w:number,h:number,kind:"spike"|"block"}[]
   * }[]} */
  const history = [];

  const rewind = {
    active: false,
    cursor: -1,
    elapsed: 0,
    frameBudget: 0,
  };

  bestEl.textContent = String(state.best);

  // World constants in canvas pixels.
  const WORLD = {
    w: canvas.width,
    h: canvas.height,
    groundY: Math.round(canvas.height * 0.78),
    gravity: 2400, // px/s^2
    jumpV: 860, // px/s
    baseSpeed: 520, // px/s
    maxSpeed: 980,
  };

  const player = {
    x: Math.round(canvas.width * 0.22),
    y: WORLD.groundY,
    w: 44,
    h: 44,
    vy: 0,
    onGround: true,
    rotation: 0,
    jumpHeldTime: 0,
  };

  const input = {
    jumpHeld: false,
    rewindHeld: false,
  };

  const clonePlayer = () => ({
    x: player.x,
    y: player.y,
    w: player.w,
    h: player.h,
    vy: player.vy,
    onGround: player.onGround,
    rotation: player.rotation,
    jumpHeldTime: player.jumpHeldTime,
  });

  const cloneObstacles = () =>
    obstacles.map((o) => ({
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      kind: o.kind,
    }));

  const recordSnapshot = () => {
    if (state.mode !== "playing") return;
    history.push({
      t: state.t,
      levelTime: state.levelTime,
      score: state.score,
      levelIndex: state.levelIndex,
      levelProgress: state.levelProgress,
      levelEndProgress: state.levelEndProgress,
      player: clonePlayer(),
      obstacles: cloneObstacles(),
    });

    if (history.length > HISTORY_FRAMES) {
      history.shift();
    }
  };

  const restoreSnapshot = (snap) => {
    state.t = snap.t;
    state.levelTime = snap.levelTime;
    state.score = snap.score;
    state.levelIndex = snap.levelIndex;
    state.levelProgress = snap.levelProgress;
    state.levelEndProgress = snap.levelEndProgress;

    player.x = snap.player.x;
    player.y = snap.player.y;
    player.w = snap.player.w;
    player.h = snap.player.h;
    player.vy = snap.player.vy;
    player.onGround = snap.player.onGround;
    player.rotation = snap.player.rotation;
    player.jumpHeldTime = snap.player.jumpHeldTime;

    obstacles.length = 0;
    for (const o of snap.obstacles) {
      obstacles.push({ x: o.x, y: o.y, w: o.w, h: o.h, kind: o.kind });
    }
  };

  const startRewind = () => {
    if (!history.length) return;

    rewind.active = true;
    rewind.cursor = history.length - 1;
    rewind.elapsed = 0;
    rewind.frameBudget = 0;
    input.jumpHeld = false;
    state.mode = "playing";
    setOverlay(null);
    stopMusic();
  };

  const stopRewind = () => {
    if (!rewind.active) return;

    if (rewind.cursor >= 0 && rewind.cursor < history.length) {
      history.length = rewind.cursor + 1;
    }

    rewind.active = false;
    rewind.cursor = -1;
    rewind.elapsed = 0;
    rewind.frameBudget = 0;

    state.mode = "playing";
    ensureAudio();
    startLevelMusic(state.levelIndex);
    updateHud();
  };

  const rewindStep = (dt) => {
    if (!rewind.active || !history.length) return;

    rewind.elapsed += dt;
    rewind.frameBudget += dt * 120 * 1.15;

    const capIndex = Math.max(0, history.length - HISTORY_FRAMES);

    while (rewind.frameBudget >= 1 && rewind.cursor > capIndex) {
      rewind.cursor -= 1;
      rewind.frameBudget -= 1;
      restoreSnapshot(history[rewind.cursor]);
    }

    updateHud();

    if (rewind.elapsed >= REWIND_SECONDS || rewind.cursor <= capIndex) {
      input.rewindHeld = false;
      stopRewind();
    }
  };

  /** @type {{x:number,y:number,w:number,h:number,kind:"spike"|"block"}[]} */
  const obstacles = [];

  const LEVELS = [
    {
      name: "Nivel 1",
      theme: "neon-city",
      baseSpeed: 520,
      maxSpeed: 760,
      music: {
        bpm: 118,
        wave: "triangle",
        notes: ["E4", "-", "G4", "B4", "E5", "-", "B4", "G4"],
      },
      endPad: 320,
      pattern: [
        { kind: "spike", x: 720, size: 44 },
        { kind: "spike", x: 920, size: 44 },
        { kind: "spike", x: 1120, size: 44 },
        { kind: "block", x: 1580, w: 64, h: 56 },
        { kind: "spike", x: 1980, size: 44 },
        { kind: "spike", x: 2170, size: 44 },
        { kind: "spike", x: 2380, size: 54 },
        { kind: "block", x: 2840, w: 84, h: 56 },
        { kind: "spike", x: 3340, size: 44 },
        { kind: "spike", x: 3740, size: 44 },
        { kind: "spike", x: 3960, size: 44 },
        { kind: "block", x: 4200, w: 64, h: 80 },
        { kind: "spike", x: 4700, size: 44 },
      ],
    },
    {
      name: "Nivel 2",
      theme: "sunset",
      baseSpeed: 620,
      maxSpeed: 860,
      music: {
        bpm: 132,
        wave: "square",
        notes: ["D4", "F4", "A4", "C5", "D5", "C5", "A4", "F4"],
      },
      endPad: 360,
      pattern: [
        { kind: "spike", x: 680, size: 44 },
        { kind: "spike", x: 980, size: 44 },
        { kind: "block", x: 1320, w: 64, h: 56 },
        { kind: "spike", x: 1700, size: 44 },
        { kind: "spike", x: 1910, size: 44 },
        { kind: "spike", x: 2100, size: 44 },
        { kind: "block", x: 2240, w: 84, h: 56 },
        { kind: "spike", x: 2640, size: 54 },
        { kind: "spike", x: 2810, size: 44 },
        { kind: "block", x: 2960, w: 64, h: 80 },
        { kind: "spike", x: 3350, size: 44 },
        { kind: "spike", x: 3560, size: 44 },
        { kind: "block", x: 3920, w: 84, h: 56 },
        { kind: "spike", x: 4300, size: 54 },
        { kind: "spike", x: 4520, size: 44 },
        { kind: "spike", x: 4700, size: 44 },
        { kind: "block", x: 4860, w: 64, h: 56 },
        { kind: "spike", x: 5250, size: 44 },
      ],
    },
    {
      name: "Nivel 3",
      theme: "cavern",
      baseSpeed: 720,
      maxSpeed: 980,
      music: {
        bpm: 148,
        wave: "sawtooth",
        notes: ["E4", "G4", "B4", "D5", "E5", "D5", "B4", "G4"],
      },
      endPad: 420,
      pattern: [
        { kind: "spike", x: 640, size: 44 },
        { kind: "spike", x: 900, size: 44 },
        { kind: "block", x: 1230, w: 84, h: 56 },
        { kind: "spike", x: 1560, size: 54 },
        { kind: "spike", x: 1770, size: 44 },
        { kind: "spike", x: 1930, size: 44 },
        { kind: "block", x: 2070, w: 64, h: 80 },
        { kind: "spike", x: 2420, size: 44 },
        { kind: "spike", x: 2620, size: 44 },
        { kind: "spike", x: 2790, size: 44 },
        { kind: "block", x: 2930, w: 84, h: 56 },
        { kind: "spike", x: 3270, size: 54 },
        { kind: "spike", x: 3470, size: 44 },
        { kind: "block", x: 3770, w: 64, h: 56 },
        { kind: "spike", x: 4070, size: 44 },
        { kind: "spike", x: 4270, size: 44 },
        { kind: "spike", x: 4440, size: 44 },
        { kind: "block", x: 4590, w: 84, h: 80 },
        { kind: "spike", x: 4960, size: 54 },
        { kind: "spike", x: 5170, size: 44 },
        { kind: "spike", x: 5340, size: 44 },
        { kind: "block", x: 5490, w: 84, h: 56 },
      ],
    },
    {
      name: "Nivel 4",
      theme: "toxic",
      baseSpeed: 780,
      maxSpeed: 1040,
      music: {
        bpm: 160,
        wave: "triangle",
        notes: ["C5", "E5", "D5", "B4", "A4", "B4", "D5", "E5"],
      },
      endPad: 460,
      pattern: [
        { kind: "spike", x: 600, size: 44 },
        { kind: "spike", x: 790, size: 44 },
        { kind: "block", x: 980, w: 84, h: 56 },
        { kind: "spike", x: 1240, size: 54 },
        { kind: "spike", x: 1410, size: 44 },
        { kind: "block", x: 1580, w: 64, h: 80 },
        { kind: "spike", x: 1900, size: 44 },
        { kind: "spike", x: 2080, size: 44 },
        { kind: "spike", x: 2240, size: 54 },
        { kind: "block", x: 2460, w: 84, h: 56 },
        { kind: "spike", x: 2800, size: 44 },
        { kind: "block", x: 3010, w: 64, h: 80 },
        { kind: "spike", x: 3320, size: 54 },
        { kind: "spike", x: 3510, size: 44 },
        { kind: "block", x: 3730, w: 84, h: 56 },
        { kind: "spike", x: 4080, size: 44 },
        { kind: "spike", x: 4260, size: 44 },
        { kind: "spike", x: 4430, size: 54 },
        { kind: "block", x: 4680, w: 64, h: 80 },
        { kind: "spike", x: 5030, size: 44 },
        { kind: "spike", x: 5210, size: 44 },
        { kind: "block", x: 5410, w: 84, h: 56 },
      ],
    },
    {
      name: "Nivel 5",
      theme: "desert",
      baseSpeed: 840,
      maxSpeed: 1100,
      music: {
        bpm: 168,
        wave: "square",
        notes: ["E5", "D5", "C5", "A4", "B4", "D5", "E5", "C5"],
      },
      endPad: 500,
      pattern: [
        { kind: "spike", x: 560, size: 44 },
        { kind: "spike", x: 730, size: 44 },
        { kind: "spike", x: 890, size: 44 },
        { kind: "block", x: 1060, w: 84, h: 56 },
        { kind: "spike", x: 1340, size: 54 },
        { kind: "block", x: 1540, w: 64, h: 80 },
        { kind: "spike", x: 1830, size: 44 },
        { kind: "spike", x: 2000, size: 44 },
        { kind: "block", x: 2170, w: 84, h: 56 },
        { kind: "spike", x: 2510, size: 54 },
        { kind: "spike", x: 2680, size: 44 },
        { kind: "block", x: 2860, w: 64, h: 80 },
        { kind: "spike", x: 3190, size: 44 },
        { kind: "spike", x: 3360, size: 44 },
        { kind: "spike", x: 3530, size: 54 },
        { kind: "block", x: 3740, w: 84, h: 56 },
        { kind: "spike", x: 4080, size: 44 },
        { kind: "block", x: 4270, w: 64, h: 80 },
        { kind: "spike", x: 4580, size: 54 },
        { kind: "spike", x: 4760, size: 44 },
        { kind: "block", x: 4960, w: 84, h: 56 },
        { kind: "spike", x: 5310, size: 44 },
        { kind: "spike", x: 5490, size: 44 },
      ],
    },
    {
      name: "Nivel 6",
      theme: "volcanic",
      baseSpeed: 900,
      maxSpeed: 1160,
      music: {
        bpm: 176,
        wave: "sawtooth",
        notes: ["E5", "C5", "D5", "B4", "C5", "A4", "B4", "D5"],
      },
      endPad: 560,
      pattern: [
        { kind: "spike", x: 520, size: 44 },
        { kind: "spike", x: 690, size: 44 },
        { kind: "block", x: 860, w: 64, h: 56 },
        { kind: "spike", x: 1080, size: 54 },
        { kind: "spike", x: 1240, size: 44 },
        { kind: "block", x: 1410, w: 84, h: 80 },
        { kind: "spike", x: 1720, size: 44 },
        { kind: "spike", x: 1880, size: 44 },
        { kind: "block", x: 2060, w: 64, h: 56 },
        { kind: "spike", x: 2300, size: 54 },
        { kind: "spike", x: 2460, size: 44 },
        { kind: "block", x: 2640, w: 84, h: 80 },
        { kind: "spike", x: 2970, size: 44 },
        { kind: "spike", x: 3140, size: 44 },
        { kind: "spike", x: 3300, size: 54 },
        { kind: "block", x: 3520, w: 64, h: 56 },
        { kind: "spike", x: 3780, size: 44 },
        { kind: "spike", x: 3940, size: 44 },
        { kind: "block", x: 4120, w: 84, h: 80 },
        { kind: "spike", x: 4460, size: 54 },
        { kind: "spike", x: 4620, size: 44 },
        { kind: "block", x: 4800, w: 64, h: 56 },
        { kind: "spike", x: 5060, size: 44 },
        { kind: "spike", x: 5220, size: 44 },
        { kind: "block", x: 5410, w: 84, h: 80 },
      ],
    },
    {
      name: "Orbita 7",
      baseSpeed: 920,
      maxSpeed: 1200,
      theme: "space-orbit",
      music: {
        bpm: 182,
        wave: "triangle",
        notes: ["C5", "E5", "D5", "E5", "C5", "A4", "B4", "D5"],
      },
      endPad: 600,
      pattern: [
        { kind: "spike", x: 520, size: 44 },
        { kind: "spike", x: 680, size: 44 },
        { kind: "block", x: 860, w: 64, h: 56 },
        { kind: "spike", x: 1080, size: 54 },
        { kind: "spike", x: 1240, size: 44 },
        { kind: "block", x: 1420, w: 84, h: 80 },
        { kind: "spike", x: 1730, size: 44 },
        { kind: "spike", x: 1890, size: 44 },
        { kind: "block", x: 2070, w: 64, h: 56 },
        { kind: "spike", x: 2310, size: 54 },
        { kind: "spike", x: 2470, size: 44 },
        { kind: "block", x: 2660, w: 84, h: 80 },
        { kind: "spike", x: 2980, size: 44 },
        { kind: "spike", x: 3140, size: 44 },
        { kind: "spike", x: 3310, size: 54 },
        { kind: "block", x: 3530, w: 64, h: 56 },
        { kind: "spike", x: 3780, size: 44 },
        { kind: "spike", x: 3940, size: 44 },
        { kind: "block", x: 4130, w: 84, h: 80 },
        { kind: "spike", x: 4470, size: 54 },
        { kind: "spike", x: 4630, size: 44 },
        { kind: "block", x: 4820, w: 64, h: 56 },
        { kind: "spike", x: 5080, size: 44 },
        { kind: "spike", x: 5250, size: 44 },
        { kind: "block", x: 5450, w: 84, h: 80 },
      ],
    },
    {
      name: "Nebula 8",
      baseSpeed: 980,
      maxSpeed: 1260,
      theme: "space-nebula",
      music: {
        bpm: 188,
        wave: "square",
        notes: ["E5", "D5", "B4", "C5", "A4", "C5", "D5", "E5"],
      },
      endPad: 640,
      pattern: [
        { kind: "spike", x: 500, size: 44 },
        { kind: "spike", x: 650, size: 44 },
        { kind: "spike", x: 800, size: 44 },
        { kind: "block", x: 980, w: 84, h: 56 },
        { kind: "spike", x: 1240, size: 54 },
        { kind: "block", x: 1430, w: 64, h: 80 },
        { kind: "spike", x: 1720, size: 44 },
        { kind: "spike", x: 1880, size: 44 },
        { kind: "block", x: 2060, w: 84, h: 56 },
        { kind: "spike", x: 2390, size: 54 },
        { kind: "spike", x: 2550, size: 44 },
        { kind: "block", x: 2740, w: 64, h: 80 },
        { kind: "spike", x: 3060, size: 44 },
        { kind: "spike", x: 3220, size: 44 },
        { kind: "spike", x: 3380, size: 54 },
        { kind: "block", x: 3610, w: 84, h: 56 },
        { kind: "spike", x: 3940, size: 44 },
        { kind: "block", x: 4130, w: 64, h: 80 },
        { kind: "spike", x: 4440, size: 54 },
        { kind: "spike", x: 4600, size: 44 },
        { kind: "block", x: 4790, w: 84, h: 56 },
        { kind: "spike", x: 5120, size: 44 },
        { kind: "spike", x: 5290, size: 44 },
        { kind: "block", x: 5490, w: 64, h: 80 },
      ],
    },
    {
      name: "Cosmos 9",
      baseSpeed: 1040,
      maxSpeed: 1320,
      theme: "space-void",
      music: {
        bpm: 194,
        wave: "sawtooth",
        notes: ["E5", "C5", "A4", "B4", "D5", "E5", "C5", "D5"],
      },
      endPad: 700,
      pattern: [
        { kind: "spike", x: 480, size: 44 },
        { kind: "spike", x: 630, size: 44 },
        { kind: "block", x: 810, w: 64, h: 56 },
        { kind: "spike", x: 1040, size: 54 },
        { kind: "spike", x: 1190, size: 44 },
        { kind: "block", x: 1370, w: 84, h: 80 },
        { kind: "spike", x: 1670, size: 44 },
        { kind: "spike", x: 1820, size: 44 },
        { kind: "block", x: 1990, w: 64, h: 56 },
        { kind: "spike", x: 2220, size: 54 },
        { kind: "spike", x: 2380, size: 44 },
        { kind: "block", x: 2570, w: 84, h: 80 },
        { kind: "spike", x: 2880, size: 44 },
        { kind: "spike", x: 3040, size: 44 },
        { kind: "spike", x: 3200, size: 54 },
        { kind: "block", x: 3410, w: 64, h: 56 },
        { kind: "spike", x: 3660, size: 44 },
        { kind: "spike", x: 3820, size: 44 },
        { kind: "block", x: 4000, w: 84, h: 80 },
        { kind: "spike", x: 4320, size: 54 },
        { kind: "spike", x: 4480, size: 44 },
        { kind: "block", x: 4680, w: 64, h: 56 },
        { kind: "spike", x: 4940, size: 44 },
        { kind: "spike", x: 5100, size: 44 },
        { kind: "block", x: 5290, w: 84, h: 80 },
        { kind: "spike", x: 5620, size: 54 },
      ],
    },
    {
      name: "Nieve 10",
      theme: "snowstorm",
      baseSpeed: 1020,
      maxSpeed: 1300,
      music: {
        bpm: 186,
        wave: "triangle",
        notes: ["D5", "B4", "C5", "A4", "B4", "D5", "E5", "C5"],
      },
      endPad: 760,
      pattern: [
        { kind: "spike", x: 500, size: 44 },
        { kind: "spike", x: 650, size: 44 },
        { kind: "block", x: 820, w: 64, h: 56 },
        { kind: "spike", x: 1040, size: 54 },
        { kind: "spike", x: 1190, size: 44 },
        { kind: "block", x: 1380, w: 84, h: 80 },
        { kind: "spike", x: 1680, size: 44 },
        { kind: "spike", x: 1830, size: 44 },
        { kind: "block", x: 2010, w: 64, h: 56 },
        { kind: "spike", x: 2240, size: 54 },
        { kind: "spike", x: 2390, size: 44 },
        { kind: "block", x: 2580, w: 84, h: 80 },
        { kind: "spike", x: 2890, size: 44 },
        { kind: "spike", x: 3040, size: 44 },
        { kind: "spike", x: 3190, size: 54 },
        { kind: "block", x: 3400, w: 64, h: 56 },
        { kind: "spike", x: 3650, size: 44 },
        { kind: "spike", x: 3800, size: 44 },
        { kind: "block", x: 3980, w: 84, h: 80 },
        { kind: "spike", x: 4300, size: 54 },
        { kind: "spike", x: 4460, size: 44 },
        { kind: "block", x: 4650, w: 64, h: 56 },
        { kind: "spike", x: 4910, size: 44 },
        { kind: "spike", x: 5060, size: 44 },
        { kind: "block", x: 5250, w: 84, h: 80 },
        { kind: "spike", x: 5570, size: 54 },
      ],
    },
    {
      name: "Aurora 11",
      theme: "aurora",
      baseSpeed: 1080,
      maxSpeed: 1360,
      music: {
        bpm: 192,
        wave: "square",
        notes: ["E5", "D5", "C5", "B4", "A4", "B4", "D5", "E5"],
      },
      endPad: 820,
      pattern: [
        { kind: "spike", x: 480, size: 44 },
        { kind: "spike", x: 620, size: 44 },
        { kind: "spike", x: 760, size: 44 },
        { kind: "block", x: 940, w: 84, h: 56 },
        { kind: "spike", x: 1180, size: 54 },
        { kind: "block", x: 1370, w: 64, h: 80 },
        { kind: "spike", x: 1660, size: 44 },
        { kind: "spike", x: 1810, size: 44 },
        { kind: "block", x: 1980, w: 84, h: 56 },
        { kind: "spike", x: 2300, size: 54 },
        { kind: "spike", x: 2450, size: 44 },
        { kind: "block", x: 2630, w: 64, h: 80 },
        { kind: "spike", x: 2940, size: 44 },
        { kind: "spike", x: 3090, size: 44 },
        { kind: "spike", x: 3240, size: 54 },
        { kind: "block", x: 3450, w: 84, h: 56 },
        { kind: "spike", x: 3780, size: 44 },
        { kind: "block", x: 3970, w: 64, h: 80 },
        { kind: "spike", x: 4280, size: 54 },
        { kind: "spike", x: 4430, size: 44 },
        { kind: "block", x: 4620, w: 84, h: 56 },
        { kind: "spike", x: 4940, size: 44 },
        { kind: "spike", x: 5100, size: 44 },
        { kind: "block", x: 5290, w: 64, h: 80 },
        { kind: "spike", x: 5610, size: 54 },
      ],
    },
    {
      name: "Blizzard 12",
      theme: "blizzard",
      baseSpeed: 1140,
      maxSpeed: 1420,
      music: {
        bpm: 198,
        wave: "sawtooth",
        notes: ["E5", "C5", "D5", "B4", "C5", "A4", "B4", "D5"],
      },
      endPad: 900,
      pattern: [
        { kind: "spike", x: 460, size: 44 },
        { kind: "spike", x: 600, size: 44 },
        { kind: "block", x: 770, w: 64, h: 56 },
        { kind: "spike", x: 990, size: 54 },
        { kind: "spike", x: 1140, size: 44 },
        { kind: "block", x: 1320, w: 84, h: 80 },
        { kind: "spike", x: 1610, size: 44 },
        { kind: "spike", x: 1760, size: 44 },
        { kind: "block", x: 1930, w: 64, h: 56 },
        { kind: "spike", x: 2160, size: 54 },
        { kind: "spike", x: 2310, size: 44 },
        { kind: "block", x: 2490, w: 84, h: 80 },
        { kind: "spike", x: 2800, size: 44 },
        { kind: "spike", x: 2950, size: 44 },
        { kind: "spike", x: 3100, size: 54 },
        { kind: "block", x: 3310, w: 64, h: 56 },
        { kind: "spike", x: 3550, size: 44 },
        { kind: "spike", x: 3700, size: 44 },
        { kind: "block", x: 3880, w: 84, h: 80 },
        { kind: "spike", x: 4200, size: 54 },
        { kind: "spike", x: 4350, size: 44 },
        { kind: "block", x: 4530, w: 64, h: 56 },
        { kind: "spike", x: 4780, size: 44 },
        { kind: "spike", x: 4930, size: 44 },
        { kind: "block", x: 5120, w: 84, h: 80 },
        { kind: "spike", x: 5440, size: 54 },
        { kind: "spike", x: 5590, size: 44 },
      ],
    },
  ];

  const ICONS = [
    {
      id: "classic",
      name: "Clasico",
      unlockAfter: 0,
      base: "#53f3c7",
      accent: "#1f7a63",
      style: "classic",
    },
    {
      id: "bolt",
      name: "Rayo",
      unlockAfter: 1,
      base: "#68a7ff",
      accent: "#2f4e9a",
      style: "bolt",
    },
    {
      id: "hazard",
      name: "Hazard",
      unlockAfter: 2,
      base: "#ff6b8f",
      accent: "#8f2d48",
      style: "hazard",
    },
    {
      id: "crown",
      name: "Corona",
      unlockAfter: 3,
      base: "#ffd54a",
      accent: "#9b6d00",
      style: "crown",
    },
    {
      id: "nebula",
      name: "Nebula",
      unlockAfter: 4,
      base: "#8f8dff",
      accent: "#3834a6",
      style: "nebula",
    },
    {
      id: "glitch",
      name: "Glitch",
      unlockAfter: 5,
      base: "#48f0e1",
      accent: "#00857b",
      style: "glitch",
    },
    {
      id: "inferno",
      name: "Inferno",
      unlockAfter: 6,
      base: "#ff8b3d",
      accent: "#9a2f00",
      style: "inferno",
    },
    {
      id: "saturn",
      name: "Saturn",
      unlockAfter: 7,
      base: "#9ec9ff",
      accent: "#3569a6",
      style: "saturn",
    },
    {
      id: "comet",
      name: "Cometa",
      unlockAfter: 8,
      base: "#b8ffe0",
      accent: "#2f8f72",
      style: "comet",
    },
    {
      id: "void",
      name: "Void",
      unlockAfter: 9,
      base: "#b58cff",
      accent: "#4e2a9a",
      style: "void",
    },
    {
      id: "frost",
      name: "Frost",
      unlockAfter: 10,
      base: "#bfe9ff",
      accent: "#4d86b8",
      style: "frost",
    },
    {
      id: "snowflake",
      name: "Snowflake",
      unlockAfter: 11,
      base: "#e6fbff",
      accent: "#6ab7bf",
      style: "snowflake",
    },
    {
      id: "icecore",
      name: "Ice Core",
      unlockAfter: 12,
      base: "#d6f4ff",
      accent: "#3f6fa8",
      style: "icecore",
    },
    {
      id: "laststand",
      name: "Last Stand",
      unlockAfterDeaths: 20,
      base: "#f0e3ff",
      accent: "#6f52a8",
      style: "laststand",
    },
    {
      id: "hardbolt",
      name: "Hard Bolt",
      unlockAfterHardModeLevels: 1,
      base: "#ff4444",
      accent: "#aa0000",
      style: "hardbolt",
    },
    {
      id: "hardhazard",
      name: "Hard Hazard",
      unlockAfterHardModeLevels: 3,
      base: "#ff8844",
      accent: "#aa4400",
      style: "hardhazard",
    },
    {
      id: "hardcrown",
      name: "Hard Crown",
      unlockAfterHardModeLevels: 5,
      base: "#ffff44",
      accent: "#aaaa00",
      style: "hardcrown",
    },
    {
      id: "hardnebula",
      name: "Hard Nebula",
      unlockAfterHardModeLevels: 7,
      base: "#8844ff",
      accent: "#4400aa",
      style: "hardnebula",
    },
    {
      id: "hardglitch",
      name: "Hard Glitch",
      unlockAfterHardModeLevels: 9,
      base: "#44ff88",
      accent: "#00aa44",
      style: "hardglitch",
    },
    {
      id: "hardinferno",
      name: "Hard Inferno",
      unlockAfterHardModeLevels: 11,
      base: "#ff4444",
      accent: "#aa0000",
      style: "hardinferno",
    },
    {
      id: "hardsaturn",
      name: "Hard Saturn",
      unlockAfterHardModeLevels: 12,
      base: "#44ffff",
      accent: "#00aaaa",
      style: "hardsaturn",
    },
  ];

  const getIconById = (iconId) => ICONS.find((icon) => icon.id === iconId) || ICONS[0];
  const isIconUnlocked = (icon) => {
    if (typeof icon.unlockAfterDeaths === "number") {
      return state.deathCount >= icon.unlockAfterDeaths;
    }
    if (typeof icon.unlockAfterHardModeLevels === "number") {
      return state.hardModeCompletedLevels >= icon.unlockAfterHardModeLevels;
    }
    return state.completedLevels >= icon.unlockAfter;
  };
  const firstUnlockedIcon = () => ICONS.find((icon) => isIconUnlocked(icon)) || ICONS[0];

  const updateIconsProgress = () => {
    if (!iconsProgressEl) return;
    iconsProgressEl.textContent =
      `Niveles completados: ${state.completedLevels}/${LEVELS.length} | Derrotas: ${state.deathCount} | Difícil: ${state.hardModeCompletedLevels}`;
  };

  const renderIconPicker = () => {
    if (!iconGridEl) return;

    iconGridEl.innerHTML = "";
    for (const icon of ICONS) {
      const unlocked = isIconUnlocked(icon);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "iconBtn";
      if (state.selectedIconId === icon.id) {
        button.classList.add("isSelected");
      }
      button.dataset.iconId = icon.id;
      button.disabled = !unlocked;

      const preview = document.createElement("div");
      preview.className = "iconPreview";
      preview.style.background = `linear-gradient(145deg, ${icon.base}, ${icon.accent})`;

      const name = document.createElement("div");
      name.className = "iconName";
      name.textContent = icon.name;

      const meta = document.createElement("div");
      meta.className = "iconMeta";
      if (unlocked) {
        meta.textContent = "Desbloqueado";
      } else if (typeof icon.unlockAfterDeaths === "number") {
        meta.textContent = `Pierde ${icon.unlockAfterDeaths} veces (${state.deathCount}/${icon.unlockAfterDeaths})`;
      } else if (typeof icon.unlockAfterHardModeLevels === "number") {
        meta.textContent = `Completa ${icon.unlockAfterHardModeLevels} nivel${icon.unlockAfterHardModeLevels === 1 ? "" : "es"} en difícil (${state.hardModeCompletedLevels}/${icon.unlockAfterHardModeLevels})`;
      } else {
        meta.textContent = `Completa ${icon.unlockAfter} nivel${icon.unlockAfter === 1 ? "" : "es"}`;
      }

      button.append(preview, name, meta);
      iconGridEl.append(button);
    }

    updateIconsProgress();
  };

  const selectIcon = (iconId) => {
    const icon = getIconById(iconId);
    if (!isIconUnlocked(icon)) return;
    state.selectedIconId = icon.id;
    saveSelectedIcon(icon.id);
    renderIconPicker();
  };

  const toggleHardMode = () => {
    state.hardMode = !state.hardMode;
    saveHardMode(state.hardMode);
    updateHud();
  };

  const markLevelCompleted = (completedCount) => {
    const nextValue = clamp(completedCount, 0, LEVELS.length);
    if (nextValue <= state.completedLevels) return;

    state.completedLevels = nextValue;
    saveCompletedLevels(state.completedLevels);

    if (state.hardMode) {
      const hardNextValue = clamp(completedCount, 0, LEVELS.length);
      if (hardNextValue > state.hardModeCompletedLevels) {
        state.hardModeCompletedLevels = hardNextValue;
        saveHardModeCompletedLevels(state.hardModeCompletedLevels);
      }
    }

    // Fallback when selected icon is still locked.
    const selected = getIconById(state.selectedIconId);
    if (!isIconUnlocked(selected)) {
      const fallback = firstUnlockedIcon();
      state.selectedIconId = fallback.id;
      saveSelectedIcon(fallback.id);
    }

    renderIconPicker();
  };

  state.completedLevels = clamp(loadCompletedLevels(), 0, LEVELS.length);
  state.deathCount = Math.max(0, loadDeathCount());
  state.hardMode = loadHardMode();
  state.hardModeCompletedLevels = Math.max(0, loadHardModeCompletedLevels());
  state.selectedIconId = loadSelectedIcon();
  if (!ICONS.some((icon) => icon.id === state.selectedIconId)) {
    state.selectedIconId = ICONS[0].id;
  }
  if (!isIconUnlocked(getIconById(state.selectedIconId))) {
    state.selectedIconId = firstUnlockedIcon().id;
    saveSelectedIcon(state.selectedIconId);
  }

  if (iconGridEl) {
    iconGridEl.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button.iconBtn");
      if (!(button instanceof HTMLButtonElement)) return;
      const iconId = button.dataset.iconId;
      if (!iconId) return;
      selectIcon(iconId);
    });
  }

  if (hardModeBtn) {
    hardModeBtn.addEventListener("click", toggleHardMode);
  }

  if (startBtn) {
    startBtn.addEventListener("click", start);
  }

  if (menuHardModeBtn) {
    menuHardModeBtn.addEventListener("click", toggleHardMode);
  }

  const aabbOverlap = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const NOTE_FREQ = {
    C4: 261.63,
    D4: 293.66,
    E4: 329.63,
    F4: 349.23,
    G4: 392.0,
    A4: 440.0,
    B4: 493.88,
    C5: 523.25,
    D5: 587.33,
    E5: 659.25,
    F5: 698.46,
    G5: 783.99,
    A5: 880.0,
  };

  const transposeFreq = (freq, semitones) => freq * Math.pow(2, semitones / 12);

  const audio = {
    ctx: /** @type {AudioContext|null} */ (null),
    master: /** @type {GainNode|null} */ (null),
    step: 0,
    timerId: /** @type {number|null} */ (null),
    activeLevel: -1,
  };

  const ensureAudio = () => {
    if (!window.AudioContext && !window.webkitAudioContext) return;
    if (!audio.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new Ctx();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.22;
      audio.master.connect(audio.ctx.destination);
    }
    if (audio.ctx.state === "suspended") {
      audio.ctx.resume().catch(() => {});
    }
  };

  const stopMusic = () => {
    if (audio.timerId !== null) {
      clearInterval(audio.timerId);
      audio.timerId = null;
    }
    audio.activeLevel = -1;
  };

  const playTone = (freq, duration, wave) => {
    if (!audio.ctx || !audio.master) return;
    const when = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();

    osc.type = wave;
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.28, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  };

  const playKick = (duration = 0.12) => {
    if (!audio.ctx || !audio.master) return;
    const when = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(130, when);
    osc.frequency.exponentialRampToValueAtTime(48, when + duration);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.36, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  };

  const startLevelMusic = (levelIndex) => {
    ensureAudio();
    if (!audio.ctx) return;
    if (audio.activeLevel === levelIndex && audio.timerId !== null) return;

    stopMusic();
    audio.activeLevel = levelIndex;
    audio.step = 0;

    const level = LEVELS[levelIndex];
    const beatMs = Math.round(60000 / level.music.bpm);
    const semitoneByLevel = [-5, -3, -2, 0, 2, 3, 5, 7, 8, 10, 12, 14];
    const transpose = semitoneByLevel[levelIndex] ?? 0;
    const bassWave = levelIndex % 2 === 0 ? "sine" : "triangle";
    const kickEvery = levelIndex < 4 ? 4 : levelIndex < 8 ? 3 : 2;

    audio.timerId = window.setInterval(() => {
      if (state.mode !== "playing") return;
      const step = audio.step;
      const note = level.music.notes[step % level.music.notes.length];
      audio.step += 1;

      if (step % kickEvery === 0) {
        playKick(levelIndex >= 8 ? 0.1 : 0.12);
      }

      if (note !== "-") {
        const base = NOTE_FREQ[note] ?? 440;
        const freq = transposeFreq(base, transpose);
        const noteDur = Math.max(0.07, beatMs / 1000 - 0.05);
        playTone(freq, noteDur, level.music.wave);

        // Add a bass line on strong beats so each level feels less flat.
        if (step % 2 === 0) {
          const bassFreq = transposeFreq(base * 0.5, transpose - 12);
          playTone(bassFreq, noteDur * 1.3, bassWave);
        }

        // Light harmony on later levels for a richer identity.
        if (levelIndex >= 6 && step % 4 === 1) {
          playTone(transposeFreq(freq, 7), noteDur * 0.75, "triangle");
        }
      }
    }, beatMs);
  };

  const showLevelBanner = (text) => {
    if (!levelBannerEl) return;
    levelBannerEl.textContent = text;
    levelBannerEl.classList.remove("show");
    // Restart animation reliably.
    void levelBannerEl.offsetWidth;
    levelBannerEl.classList.add("show");
  };

  const addSpike = (xWorld, size) => {
    const s = size ?? 44;
    obstacles.push({
      kind: "spike",
      x: canvas.width + xWorld,
      y: WORLD.groundY - s,
      w: s,
      h: s,
    });
  };

  const addBlock = (xWorld, w, h) => {
    const bw = w ?? 64;
    const bh = h ?? 56;
    obstacles.push({
      kind: "block",
      x: canvas.width + xWorld,
      y: WORLD.groundY - bh,
      w: bw,
      h: bh,
    });
  };

  const buildLevel = (levelIndex, announce = false) => {
    const level = LEVELS[levelIndex];
    obstacles.length = 0;

    let maxX = 0;
    for (const p of level.pattern) {
      maxX = Math.max(maxX, p.x);
      if (p.kind === "spike") addSpike(p.x, p.size);
      else addBlock(p.x, p.w, p.h);
    }

    state.levelIndex = levelIndex;
    state.levelProgress = 0;
    state.levelTime = 0;
    state.levelEndProgress = canvas.width + maxX + level.endPad;

    if (announce) {
      showLevelBanner(level.name);
    }

    if (state.mode === "playing") {
      startLevelMusic(levelIndex);
    }
  };

  const resetRun = (announce = false) => {
    state.t = 0;
    state.levelTime = 0;
    state.score = 0;
    player.y = WORLD.groundY - player.h;
    player.vy = 0;
    player.onGround = true;
    player.rotation = 0;
    player.jumpHeldTime = 0;
    input.jumpHeld = false;
    buildLevel(0, announce);

    updateHud();
  };

  const setOverlay = (lines) => {
    overlayEl.textContent = "";
    overlayEl.style.display = lines ? "grid" : "none";
    if (!lines) return;

    // Keep it simple: newline-separated text.
    overlayEl.textContent = lines;
  };

  const updateMenu = () => {
    if (menuEl) {
      menuEl.style.display = state.mode === "ready" ? "grid" : "none";
    }
    if (menuHardModeBtn) {
      menuHardModeBtn.textContent = `Modo Difícil: ${state.hardMode ? "On" : "Off"}`;
    }
  };

  const updateHud = () => {
    scoreEl.textContent = String(Math.floor(state.score));
    levelEl.textContent = `${state.levelIndex + 1}/${LEVELS.length}`;
    bestEl.textContent = String(state.best);
    if (hardModeBtn) {
      hardModeBtn.textContent = `Modo Difícil: ${state.hardMode ? "On" : "Off"}`;
    }
    updateMenu();
  };

  const speedAt = (levelTime, baseSpeed, maxSpeed) => {
    // Gentle ramp-up per level.
    const ramp = 1 - Math.exp(-levelTime / 16);
    const v = baseSpeed + ramp * (maxSpeed - baseSpeed);
    return clamp(v, baseSpeed, maxSpeed);
  };

  const currentSpeed = () => {
    const level = LEVELS[state.levelIndex];
    const multiplier = state.hardMode ? 1.3 : 1;
    return speedAt(state.levelTime, level.baseSpeed * multiplier, level.maxSpeed * multiplier);
  };

  const jump = () => {
    if (state.mode !== "playing") return;
    if (!player.onGround) return;

    player.vy = -760;
    player.onGround = false;
    player.jumpHeldTime = 0;
  };

  const releaseJump = () => {
    input.jumpHeld = false;
    // Early release = lower jump arc.
    if (player.vy < -300) {
      player.vy = -300;
    }
  };

  function start() {
    state.mode = "playing";
    setOverlay(null);
    resetRun(true);
    recordSnapshot();
    updateMenu();
    // Short startup blip to confirm audio context is actually unlocked.
    playTone(660, 0.1, "triangle");
  }

  const die = () => {
    state.mode = "dead";
    state.deathCount += 1;
    saveDeathCount(state.deathCount);
    renderIconPicker();
    stopMusic();
    if (state.score > state.best) {
      state.best = Math.floor(state.score);
      saveBest(state.best);
    }
    updateHud();

    setOverlay(
      `¡Perdiste!\n\nPuntos: ${Math.floor(state.score)}\nRécord: ${state.best}\n\nMantén Q para rewind (max 10s)\nPulsa R para reiniciar`
    );
  };

  const win = () => {
    state.mode = "won";
    markLevelCompleted(LEVELS.length);
    stopMusic();
    if (state.score > state.best) {
      state.best = Math.floor(state.score);
      saveBest(state.best);
    }
    updateHud();
    setOverlay(
      `¡Nivel completado!\n\nHas terminado todos los niveles.\n\nPuntos: ${Math.floor(state.score)}\nRécord: ${state.best}\n\nPulsa R para jugar otra vez`
    );
  };

  const restart = () => {
    ensureAudio();
    state.mode = "playing";
    setOverlay(null);
    resetRun(true);
    history.length = 0;
    rewind.active = false;
    rewind.cursor = -1;
    rewind.elapsed = 0;
    rewind.frameBudget = 0;
    input.rewindHeld = false;
    recordSnapshot();
  };

  const onKeyDown = (e) => {
    ensureAudio();
    if (e.code === "Enter") {
      e.preventDefault();
      if (state.mode === "ready") start();
      return;
    }

    if (e.code === "KeyQ") {
      e.preventDefault();
      if (!input.rewindHeld) {
        input.rewindHeld = true;
        startRewind();
      }
      return;
    }

    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      if (state.mode !== "playing") return;
      e.preventDefault();
      input.jumpHeld = true;
      jump();
    }
    if (e.code === "KeyR") {
      e.preventDefault();
      restart();
    }
  };

  const onKeyUp = (e) => {
    if (e.code === "KeyQ") {
      input.rewindHeld = false;
      stopRewind();
    }
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      releaseJump();
    }
  };

  const onPointer = (e) => {
    // Prevent text selection / double-tap issues.
    e.preventDefault();
    ensureAudio();
    if (state.mode !== "playing") return;
    input.jumpHeld = true;
    jump();
  };

  const onPointerUp = () => {
    releaseJump();
  };

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: true });
  window.addEventListener("blur", () => {
    input.jumpHeld = false;
    input.rewindHeld = false;
    stopRewind();
  });
  canvas.addEventListener("pointerdown", onPointer, { passive: false });
  canvas.addEventListener("pointerup", onPointerUp, { passive: true });
  canvas.addEventListener("pointercancel", onPointerUp, { passive: true });
  canvas.addEventListener("pointerleave", onPointerUp, { passive: true });

  updateHud();

  const drawBackground = (t, level) => {
    const theme = level.theme || "neon-city";
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);

    if (theme === "neon-city") {
      g.addColorStop(0, "#0b1330");
      g.addColorStop(1, "#080911");
    } else if (theme === "sunset") {
      g.addColorStop(0, "#ff9a57");
      g.addColorStop(0.55, "#d35b7a");
      g.addColorStop(1, "#4b2f64");
    } else if (theme === "cavern") {
      g.addColorStop(0, "#1b1625");
      g.addColorStop(1, "#0b0913");
    } else if (theme === "toxic") {
      g.addColorStop(0, "#1a3518");
      g.addColorStop(1, "#081a0c");
    } else if (theme === "desert") {
      g.addColorStop(0, "#ffcf8f");
      g.addColorStop(0.65, "#e59c56");
      g.addColorStop(1, "#8c5529");
    } else if (theme === "volcanic") {
      g.addColorStop(0, "#2b1111");
      g.addColorStop(0.7, "#140707");
      g.addColorStop(1, "#060202");
    } else if (theme === "space-orbit") {
      g.addColorStop(0, "#030816");
      g.addColorStop(0.6, "#0a1130");
      g.addColorStop(1, "#050914");
    } else if (theme === "space-nebula") {
      g.addColorStop(0, "#13082a");
      g.addColorStop(0.6, "#221150");
      g.addColorStop(1, "#0a0619");
    } else if (theme === "space-void") {
      g.addColorStop(0, "#04040a");
      g.addColorStop(1, "#000000");
    } else if (theme === "snowstorm") {
      g.addColorStop(0, "#93b9d9");
      g.addColorStop(0.6, "#7ea0be");
      g.addColorStop(1, "#3f5c75");
    } else if (theme === "aurora") {
      g.addColorStop(0, "#082232");
      g.addColorStop(0.55, "#1c4961");
      g.addColorStop(1, "#081422");
    } else if (theme === "blizzard") {
      g.addColorStop(0, "#d7e4ef");
      g.addColorStop(0.6, "#bacfe0");
      g.addColorStop(1, "#738da2");
    }

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (theme === "sunset") {
      ctx.fillStyle = "rgba(255,235,170,0.36)";
      ctx.beginPath();
      ctx.arc(canvas.width * 0.75, 130, 86, 0, Math.PI * 2);
      ctx.fill();
    }

    if (theme === "desert") {
      ctx.fillStyle = "rgba(255,214,150,0.28)";
      for (let i = 0; i < 3; i += 1) {
        const y = WORLD.groundY - 48 - i * 22;
        const ox = ((t * (18 + i * 7)) % (canvas.width + 260)) - 130;
        ctx.beginPath();
        ctx.moveTo(-180 + ox, y + 35);
        ctx.quadraticCurveTo(160 + ox, y - 30, 500 + ox, y + 35);
        ctx.quadraticCurveTo(760 + ox, y + 70, canvas.width + 180 + ox, y + 30);
        ctx.lineTo(canvas.width + 180 + ox, y + 90);
        ctx.lineTo(-180 + ox, y + 90);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (theme === "volcanic") {
      for (let i = 0; i < 34; i += 1) {
        const px = ((i * 91 + t * 70) % (canvas.width + 60)) - 30;
        const py = WORLD.groundY - ((i * 43 + t * 110) % 210);
        ctx.globalAlpha = 0.12 + (i % 5) * 0.03;
        ctx.fillStyle = i % 2 ? "#ff8a2d" : "#ffcc66";
        ctx.fillRect(px, py, 3, 3);
      }
      ctx.globalAlpha = 1;
    }

    const isSpace =
      theme === "space-orbit" || theme === "space-nebula" || theme === "space-void";
    if (isSpace) {
      for (let i = 0; i < 60; i += 1) {
        const px = (i * 173.3 + t * 18 + (i % 5) * 21) % (canvas.width + 120) - 60;
        const py = 26 + ((i * 89.7) % (WORLD.groundY - 80));
        const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.8 + i * 2.17));
        ctx.globalAlpha = 0.1 + twinkle * 0.55;
        ctx.fillStyle = i % 7 === 0 ? "#ffdca8" : "#c8d6ff";
        ctx.fillRect(px, py, 2, 2);
      }
      ctx.globalAlpha = 1;

      if (theme !== "space-void") {
        const nebulaX = ((t * 24) % (canvas.width + 360)) - 180;
        const nebula = ctx.createRadialGradient(nebulaX, 130, 20, nebulaX, 130, 220);
        const tone = theme === "space-nebula" ? "rgba(202,145,255,0.28)" : "rgba(145,125,255,0.24)";
        nebula.addColorStop(0, tone);
        nebula.addColorStop(1, "rgba(145,125,255,0)");
        ctx.fillStyle = nebula;
        ctx.fillRect(nebulaX - 220, -40, 440, 340);
      }
    }

    if (theme === "toxic") {
      for (let i = 0; i < 18; i += 1) {
        const bx = ((i * 115 + t * 35) % (canvas.width + 80)) - 40;
        const by = WORLD.groundY - 40 - ((i * 37 + t * 22) % 120);
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = "#9fff66";
        ctx.beginPath();
        ctx.arc(bx, by, 9 + (i % 4), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (theme === "cavern") {
      ctx.fillStyle = "rgba(170,150,210,0.12)";
      for (let i = 0; i < 14; i += 1) {
        const x = i * 86 + ((t * 8) % 70);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 18, 70 + (i % 3) * 18);
        ctx.lineTo(x + 36, 0);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (theme === "snowstorm" || theme === "aurora" || theme === "blizzard") {
      for (let i = 0; i < 80; i += 1) {
        const wind = theme === "blizzard" ? 90 : theme === "aurora" ? 45 : 60;
        const px = ((i * 97 + t * wind) % (canvas.width + 120)) - 60;
        const py = ((i * 61 + t * 140) % (WORLD.groundY + 20)) - 20;
        ctx.globalAlpha = theme === "blizzard" ? 0.35 : 0.22;
        ctx.fillStyle = "#f4fbff";
        ctx.fillRect(px, py, 2, 2);
      }
      ctx.globalAlpha = 1;

      if (theme === "aurora") {
        const ax = ((t * 28) % (canvas.width + 400)) - 200;
        const ribbon = ctx.createLinearGradient(ax, 20, ax + 240, 220);
        ribbon.addColorStop(0, "rgba(120,255,210,0.22)");
        ribbon.addColorStop(0.5, "rgba(110,190,255,0.18)");
        ribbon.addColorStop(1, "rgba(170,130,255,0)");
        ctx.fillStyle = ribbon;
        ctx.fillRect(ax - 60, -10, 360, 280);
      }
    }

    ctx.save();
    ctx.globalAlpha = 0.12;
    const stripeY = WORLD.groundY;
    const stripeSpacing = 36;
    const offset = (t * 80) % stripeSpacing;
    ctx.strokeStyle = "#7aa2ff";
    if (theme === "sunset") ctx.strokeStyle = "#ffd0a0";
    if (theme === "cavern") ctx.strokeStyle = "#76609b";
    if (theme === "toxic") ctx.strokeStyle = "#8fff6f";
    if (theme === "desert") ctx.strokeStyle = "#ffd49f";
    if (theme === "volcanic") ctx.strokeStyle = "#ff6f4b";
    if (theme === "space-nebula") ctx.strokeStyle = "#b09bff";
    if (theme === "space-void") ctx.strokeStyle = "#8da0da";
    if (theme === "snowstorm" || theme === "aurora" || theme === "blizzard") {
      ctx.strokeStyle = "#dff6ff";
    }

    ctx.lineWidth = 1;
    for (let x = -canvas.width; x < canvas.width * 2; x += stripeSpacing) {
      ctx.beginPath();
      ctx.moveTo(x - offset, stripeY);
      ctx.lineTo(x + 120 - offset, stripeY - 120);
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawGround = (t, speed, level) => {
    const theme = level.theme || "neon-city";

    let ground = "#10162e";
    let edge = "#2a356a";
    let tile = "#7aa2ff";

    if (theme === "sunset") {
      ground = "#462f57";
      edge = "#ffb48f";
      tile = "#ffd5aa";
    } else if (theme === "cavern") {
      ground = "#1a1522";
      edge = "#5f4c84";
      tile = "#9b88c8";
    } else if (theme === "toxic") {
      ground = "#11210f";
      edge = "#72d44e";
      tile = "#b4ff76";
    } else if (theme === "desert") {
      ground = "#8b5b2f";
      edge = "#f7cd8b";
      tile = "#ffe3b2";
    } else if (theme === "volcanic") {
      ground = "#220d0d";
      edge = "#ff6f4b";
      tile = "#ffb067";
    } else if (theme === "space-orbit") {
      ground = "#0a1026";
      edge = "#3c4ca1";
      tile = "#9fc0ff";
    } else if (theme === "space-nebula") {
      ground = "#1b1437";
      edge = "#7961d2";
      tile = "#c8b9ff";
    } else if (theme === "space-void") {
      ground = "#0a0a12";
      edge = "#4a4f7f";
      tile = "#9ca8d9";
    } else if (theme === "snowstorm") {
      ground = "#6f8ea8";
      edge = "#d6f2ff";
      tile = "#f0fbff";
    } else if (theme === "aurora") {
      ground = "#21455d";
      edge = "#9df9df";
      tile = "#d5fff5";
    } else if (theme === "blizzard") {
      ground = "#8ca7bb";
      edge = "#ffffff";
      tile = "#f4fbff";
    }

    ctx.fillStyle = ground;
    ctx.fillRect(0, WORLD.groundY, canvas.width, canvas.height - WORLD.groundY);

    // Ground top line
    ctx.fillStyle = edge;
    ctx.fillRect(0, WORLD.groundY - 6, canvas.width, 6);

    // Moving tiles
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = tile;
    const tileW = 42;
    const offset = (t * speed) % tileW;
    for (let x = -tileW; x < canvas.width + tileW; x += tileW) {
      ctx.fillRect(Math.floor(x - offset), WORLD.groundY + 14, 18, 3);
    }
    ctx.restore();
  };

  const drawObstacle = (o, level) => {
    const theme = level.theme || "neon-city";
    const snowTheme = theme === "snowstorm" || theme === "aurora" || theme === "blizzard";
    const spaceTheme =
      theme === "space-orbit" || theme === "space-nebula" || theme === "space-void";

    if (o.kind === "block") {
      if (snowTheme) ctx.fillStyle = "#b8e7ff";
      else if (spaceTheme) ctx.fillStyle = "#8f84ff";
      else if (theme === "volcanic") ctx.fillStyle = "#ff6d46";
      else if (theme === "desert") ctx.fillStyle = "#f2b074";
      else if (theme === "toxic") ctx.fillStyle = "#88e65b";
      else ctx.fillStyle = "#ff4d8d";
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(o.x + 6, o.y + 6, o.w - 12, o.h - 12);
      return;
    }

    // Spike: draw as triangle.
    const x = o.x;
    const y = o.y;
    const w = o.w;
    const h = o.h;

    if (snowTheme) ctx.fillStyle = "#e7fbff";
    else if (spaceTheme) ctx.fillStyle = "#d5c8ff";
    else if (theme === "volcanic") ctx.fillStyle = "#ff9c5a";
    else if (theme === "toxic") ctx.fillStyle = "#c8ff7f";
    else ctx.fillStyle = "#ffd54a";
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w * 0.5, y);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.moveTo(x + 6, y + h);
    ctx.lineTo(x + w * 0.5, y + 10);
    ctx.lineTo(x + w - 6, y + h);
    ctx.closePath();
    ctx.fill();
  };

  const drawPlayer = () => {
    const px = player.x;
    const py = player.y;
    const icon = getIconById(state.selectedIconId);

    ctx.save();
    ctx.translate(px + player.w / 2, py + player.h / 2);
    ctx.rotate(player.rotation);
    ctx.translate(-player.w / 2, -player.h / 2);

    ctx.fillStyle = icon.base;
    ctx.fillRect(0, 0, player.w, player.h);

    if (icon.style === "classic") {
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(6, 6, player.w - 12, player.h - 12);
    }

    if (icon.style === "bolt") {
      ctx.strokeStyle = icon.accent;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(28, 4);
      ctx.lineTo(18, 19);
      ctx.lineTo(27, 19);
      ctx.lineTo(15, 40);
      ctx.lineTo(20, 24);
      ctx.lineTo(12, 24);
      ctx.closePath();
      ctx.stroke();
    }

    if (icon.style === "hazard") {
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(5, 5, player.w - 10, player.h - 10);
      ctx.strokeStyle = icon.accent;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(11, 11);
      ctx.lineTo(33, 33);
      ctx.moveTo(33, 11);
      ctx.lineTo(11, 33);
      ctx.stroke();
    }

    if (icon.style === "crown") {
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(6, 16, player.w - 12, player.h - 22);
      ctx.fillStyle = icon.accent;
      ctx.beginPath();
      ctx.moveTo(7, 20);
      ctx.lineTo(14, 8);
      ctx.lineTo(22, 16);
      ctx.lineTo(30, 6);
      ctx.lineTo(37, 20);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(7, 20, player.w - 14, 6);
    }

    if (icon.style === "nebula") {
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.arc(13, 14, 4, 0, Math.PI * 2);
      ctx.arc(30, 12, 3, 0, Math.PI * 2);
      ctx.arc(24, 29, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = icon.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(8, 34);
      ctx.lineTo(36, 10);
      ctx.stroke();
    }

    if (icon.style === "glitch") {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(7, 7, player.w - 14, player.h - 14);
      ctx.fillStyle = icon.accent;
      ctx.fillRect(8, 10, 26, 4);
      ctx.fillRect(12, 18, 18, 4);
      ctx.fillRect(9, 26, 24, 4);
      ctx.fillRect(14, 34, 16, 4);
    }

    if (icon.style === "inferno") {
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(6, 6, player.w - 12, player.h - 12);
      ctx.fillStyle = "#ffd28a";
      ctx.beginPath();
      ctx.moveTo(22, 7);
      ctx.lineTo(30, 19);
      ctx.lineTo(24, 26);
      ctx.lineTo(30, 34);
      ctx.lineTo(21, 39);
      ctx.lineTo(15, 30);
      ctx.lineTo(19, 22);
      ctx.lineTo(14, 15);
      ctx.closePath();
      ctx.fill();
    }

    if (icon.style === "saturn") {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(22, 22, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = icon.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(22, 22, 17, 7, -0.25, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (icon.style === "hardbolt") {
      ctx.strokeStyle = icon.accent;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(18, 6);
      ctx.lineTo(12, 24);
      ctx.lineTo(22, 24);
      ctx.lineTo(14, 42);
      ctx.lineTo(28, 18);
      ctx.lineTo(18, 18);
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20, 10);
      ctx.lineTo(14, 26);
      ctx.lineTo(22, 26);
      ctx.lineTo(16, 38);
      ctx.stroke();
    }

    if (icon.style === "hardhazard") {
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(6, 6, player.w - 12, player.h - 12);
      ctx.strokeStyle = icon.accent;
      ctx.lineWidth = 4;
      for (let i = 6; i < player.w - 6; i += 10) {
        ctx.beginPath();
        ctx.moveTo(i, 6);
        ctx.lineTo(i - 6, player.h - 6);
        ctx.stroke();
      }
    }

    if (icon.style === "hardcrown") {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(6, 6, player.w - 12, player.h - 12);
      ctx.fillStyle = icon.accent;
      ctx.beginPath();
      ctx.moveTo(8, 24);
      ctx.lineTo(14, 12);
      ctx.lineTo(18, 26);
      ctx.lineTo(22, 14);
      ctx.lineTo(26, 28);
      ctx.lineTo(30, 14);
      ctx.lineTo(34, 26);
      ctx.lineTo(38, 12);
      ctx.lineTo(44, 24);
      ctx.lineTo(44, 34);
      ctx.lineTo(8, 34);
      ctx.closePath();
      ctx.fill();
    }

    if (icon.style === "hardnebula") {
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.arc(22, 22, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = icon.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(22, 22, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(12, 14, 2.5, 0, Math.PI * 2);
      ctx.arc(34, 18, 2.5, 0, Math.PI * 2);
      ctx.arc(24, 32, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (icon.style === "hardglitch") {
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(6, 6, player.w - 12, player.h - 12);
      ctx.fillStyle = icon.accent;
      ctx.fillRect(8, 10, 10, 4);
      ctx.fillRect(18, 18, 16, 4);
      ctx.fillRect(10, 28, 14, 4);
      ctx.fillRect(20, 34, 12, 4);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(14, 14, 8, 3);
      ctx.fillRect(22, 26, 6, 3);
    }

    if (icon.style === "hardinferno") {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(6, 6, player.w - 12, player.h - 12);
      ctx.fillStyle = "#ffcc44";
      ctx.beginPath();
      ctx.moveTo(22, 10);
      ctx.lineTo(27, 24);
      ctx.lineTo(23, 20);
      ctx.lineTo(25, 32);
      ctx.lineTo(22, 28);
      ctx.lineTo(19, 34);
      ctx.lineTo(20, 24);
      ctx.lineTo(17, 22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = icon.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (icon.style === "hardsaturn") {
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.arc(22, 22, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = icon.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(22, 22, 18, 7, -0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(10, 12);
      ctx.lineTo(34, 32);
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (icon.style === "comet") {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.moveTo(6, 29);
      ctx.lineTo(22, 8);
      ctx.lineTo(38, 14);
      ctx.lineTo(22, 35);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = icon.accent;
      ctx.beginPath();
      ctx.arc(25, 20, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    if (icon.style === "void") {
      ctx.fillStyle = "rgba(0,0,0,0.36)";
      ctx.fillRect(5, 5, player.w - 10, player.h - 10);
      ctx.strokeStyle = "#dfd0ff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(22, 22, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(22, 22, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = icon.accent;
      ctx.fill();
    }

    if (icon.style === "frost") {
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(7, 7, player.w - 14, player.h - 14);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(22, 8);
      ctx.lineTo(22, 36);
      ctx.moveTo(8, 22);
      ctx.lineTo(36, 22);
      ctx.moveTo(12, 12);
      ctx.lineTo(32, 32);
      ctx.moveTo(32, 12);
      ctx.lineTo(12, 32);
      ctx.stroke();
    }

    if (icon.style === "snowflake") {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(22, 22, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = icon.accent;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i;
        ctx.beginPath();
        ctx.moveTo(22, 22);
        ctx.lineTo(22 + Math.cos(a) * 12, 22 + Math.sin(a) * 12);
        ctx.stroke();
      }
    }

    if (icon.style === "icecore") {
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.moveTo(10, 36);
      ctx.lineTo(22, 6);
      ctx.lineTo(34, 36);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = icon.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(22, 8);
      ctx.lineTo(22, 34);
      ctx.moveTo(16, 23);
      ctx.lineTo(28, 23);
      ctx.stroke();
    }

    if (icon.style === "laststand") {
      ctx.fillStyle = "rgba(0,0,0,0.24)";
      ctx.fillRect(6, 6, player.w - 12, player.h - 12);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(10, 34);
      ctx.lineTo(22, 10);
      ctx.lineTo(34, 34);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(22, 15);
      ctx.lineTo(22, 28);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(22, 32, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }

    ctx.strokeStyle = icon.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(1.5, 1.5, player.w - 3, player.h - 3);

    ctx.restore();
  };

  const simulate = (dt) => {
    state.t += dt;
    state.levelTime += dt;

    const speed = currentSpeed();
    state.levelProgress += speed * dt;
    const prevY = player.y;

    // Score increases with time and speed.
    state.score += dt * (speed * 0.04);

    // Player physics.
    if (input.jumpHeld && !player.onGround && player.vy < 0 && player.jumpHeldTime < 0.18) {
      player.vy -= 2600 * dt;
      player.jumpHeldTime += dt;
    }

    player.vy += WORLD.gravity * dt;
    player.y += player.vy * dt;
    player.onGround = false;

    if (player.y >= WORLD.groundY - player.h) {
      player.y = WORLD.groundY - player.h;
      player.vy = 0;
      player.onGround = true;
    }

    // Blocks are platforms if landed from above.
    for (const o of obstacles) {
      if (o.kind !== "block") continue;

      const overlapX = player.x + player.w > o.x + 6 && player.x < o.x + o.w - 6;
      if (!overlapX) continue;

      const prevBottom = prevY + player.h;
      const nowBottom = player.y + player.h;
      const blockTop = o.y;
      const landingFromAbove = prevBottom <= blockTop + 2 && nowBottom >= blockTop && player.vy >= 0;

      if (landingFromAbove) {
        player.y = blockTop - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }

    // Rotation while airborne for that "dash" feel.
    if (!player.onGround) player.rotation += dt * 8;
    else player.rotation = 0;

    // Obstacles move left.
    for (const o of obstacles) {
      o.x -= speed * dt;
    }

    // Remove offscreen obstacles.
    while (obstacles.length && obstacles[0].x + obstacles[0].w < -80) {
      obstacles.shift();
    }

    // Collision check.
    const pBox = {
      x: player.x + 6,
      y: player.y + 6,
      w: player.w - 12,
      h: player.h - 12,
    };

    for (const o of obstacles) {
      const oBox =
        o.kind === "spike"
          ? { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 8 }
          : { x: o.x + 2, y: o.y + 12, w: o.w - 4, h: o.h - 12 };

      // Ignore top contact on blocks: they are platforms now.
      if (o.kind === "block" && player.vy === 0 && player.y + player.h <= o.y + 1) {
        continue;
      }

      if (aabbOverlap(pBox, oBox)) {
        die();
        return;
      }
    }

    // Next level when we've traveled far enough and all obstacles are gone.
    if (state.levelProgress >= state.levelEndProgress && obstacles.length === 0) {
      markLevelCompleted(state.levelIndex + 1);
      if (state.levelIndex + 1 >= LEVELS.length) {
        win();
        return;
      }
      buildLevel(state.levelIndex + 1, true);
      updateHud();
    }

    if (state.score > state.best && state.mode !== "dead") {
      // Show "live" best without writing storage each frame.
      bestEl.textContent = String(Math.floor(state.score));
    }

    scoreEl.textContent = String(Math.floor(state.score));
    recordSnapshot();
  };

  const render = () => {
    const speed = currentSpeed();
    const level = LEVELS[state.levelIndex];
    drawBackground(state.t, level);
    drawGround(state.t, speed, level);

    // Obstacles
    for (const o of obstacles) {
      drawObstacle(o, level);
    }
    drawPlayer();

    // Small hint in ready mode.
    if (state.mode === "ready") {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "700 22px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Pulsa Enter para empezar", canvas.width / 2, canvas.height * 0.32);
      ctx.restore();
    }
  };

  // Fixed time step for consistent physics.
  let last = performance.now();
  let acc = 0;
  const step = 1 / 120;

  const frame = (now) => {
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;

    if (rewind.active && input.rewindHeld) {
      rewindStep(dt);
      acc = 0;
    } else if (state.mode === "playing") {
      acc += dt;
      while (acc >= step) {
        simulate(step);
        acc -= step;
        if (state.mode === "dead" || state.mode === "won") {
          acc = 0;
          break;
        }
      }
    }

    render();
    requestAnimationFrame(frame);
  };

  // Initial UI.
  renderIconPicker();
  setOverlay("Pulsa Enter para empezar");
  resetRun();
  requestAnimationFrame(frame);
})();
