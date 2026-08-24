'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');

const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayBtn = document.getElementById('overlayBtn');
const pauseBtn = document.getElementById('pauseBtn');
const restartBtn = document.getElementById('restartBtn');
const ghostToggleBtn = document.getElementById('ghostToggleBtn');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const bgmToggleBtn = document.getElementById('bgmToggleBtn');
const audioNotice = document.getElementById('audioNotice');
const startScreen = document.getElementById('startScreen');
const startBtn = document.getElementById('startBtn');
const startGhostToggleBtn = document.getElementById('startGhostToggleBtn');
const startSoundToggleBtn = document.getElementById('startSoundToggleBtn');
const startBgmToggleBtn = document.getElementById('startBgmToggleBtn');

const COLS = 10;
const ROWS = 20;
const BLOCK = canvas.width / COLS;

const COLORS = {
  I: '#22d3ee',
  J: '#3b82f6',
  L: '#fb923c',
  O: '#facc15',
  S: '#4ade80',
  T: '#c084fc',
  Z: '#fb7185'
};

const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
  O: [[1,1],[1,1]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]]
};

let board;
let current;
let nextPiece;
let bag = [];
let score = 0;
let lines = 0;
let level = 1;
let gameOver = false;
let paused = false;
let lastTime = 0;
let dropCounter = 0;
let animationId = 0;
let gameStarted = false;
let ghostEnabled = localStorage.getItem('tetrisGhost') !== 'off';
let soundEnabled = localStorage.getItem('tetrisSound') !== 'off';
let bgmEnabled = localStorage.getItem('tetrisBgm') !== 'off';
let audioCtx = null;
let noiseBuffer = null;
let audioUnlocked = false;
let bgmTimer = null;
let bgmBarIndex = 0;
let bgmRunning = false;
let bgmNextBarTime = 0;
const activeBgmOscillators = new Set();

// Korobeiniki: traditional Russian folk melody, arranged here as an original
// browser-generated chiptune. The melody is in A minor and uses 4-beat bars.
const KOROBEINIKI_BARS = [
  {
    harmony: ['Am', 'E7'],
    melody: [['E5',0.5],['B4',0.25],['C5',0.25],['D5',0.5],['C5',0.25],['B4',0.25],['A4',0.5],['A4',0.25],['C5',0.25],['E5',0.5],['D5',0.25],['C5',0.25]]
  },
  {
    harmony: ['E7', 'Am'],
    melody: [['B4',0.75],['C5',0.25],['D5',0.5],['E5',0.5],['C5',0.5],['A4',0.5],['A4',1]]
  },
  {
    harmony: ['Dm', 'Am'],
    melody: [['R',0.25],['D5',0.5],['F5',0.25],['A5',0.5],['G5',0.25],['F5',0.25],['E5',0.5],['R',0.25],['C5',0.25],['E5',0.5],['D5',0.25],['C5',0.25]]
  },
  {
    harmony: ['E7', 'Am'],
    melody: [['B4',0.5],['B4',0.25],['C5',0.25],['D5',0.5],['E5',0.5],['C5',0.5],['A4',0.5],['A4',1]]
  },
  {
    harmony: ['Am', 'E7'],
    melody: [['E5',1],['C5',1],['D5',1],['B4',1]]
  },
  {
    harmony: ['Am', 'E7'],
    melody: [['C5',1],['A4',1],['G#4',1],['R',1]]
  },
  {
    harmony: ['Am', 'E7'],
    melody: [['E5',1],['C5',1],['D5',1],['B4',1]]
  },
  {
    harmony: ['Am', 'E7'],
    melody: [['A4',0.5],['C5',0.5],['A4',1],['G#4',1],['R',1]]
  }
];

const BGM_CHORDS = {
  Am: { bass: ['A2', 'E3'], tones: ['A3', 'C4', 'E4'] },
  E7: { bass: ['E2', 'B2'], tones: ['G#3', 'B3', 'D4'] },
  Dm: { bass: ['D2', 'A2'], tones: ['D3', 'F3', 'A3'] }
};

function syncSettingButton(button, enabled) {
  if (!button) return;
  button.classList.toggle('is-on', enabled);
  button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  const state = button.querySelector('strong');
  if (state) state.textContent = enabled ? 'ON' : 'OFF';
}

function updateSettingButtons() {
  syncSettingButton(ghostToggleBtn, ghostEnabled);
  syncSettingButton(soundToggleBtn, soundEnabled);
  syncSettingButton(bgmToggleBtn, bgmEnabled);
  syncSettingButton(startGhostToggleBtn, ghostEnabled);
  syncSettingButton(startSoundToggleBtn, soundEnabled);
  syncSettingButton(startBgmToggleBtn, bgmEnabled);
}

function setAudioNotice(visible) {
  if (!audioNotice) return;
  audioNotice.classList.toggle('hidden', !visible);
}

function ensureAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
    noiseBuffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.18), audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  return audioCtx;
}

function unlockAudio() {
  const ac = ensureAudio();
  if (!ac) return;

  const finish = () => {
    audioUnlocked = true;
    setAudioNotice(false);
    if (gameStarted && bgmEnabled && !paused && !gameOver) startBgm(false);
  };

  if (ac.state === 'suspended') {
    ac.resume().then(finish).catch(() => setAudioNotice(true));
  } else {
    finish();
  }
}

function tryAutoplayBgm() {
  if (!bgmEnabled) return;
  const ac = ensureAudio();
  if (!ac) return;

  if (ac.state === 'running') {
    audioUnlocked = true;
    setAudioNotice(false);
    startBgm(true);
  } else {
    // Most mobile/desktop browsers intentionally block audible autoplay until
    // the first user gesture. We still try immediately, then fall back to the
    // first key / click / touch anywhere on the page.
    ac.resume().then(() => {
      if (ac.state === 'running') {
        audioUnlocked = true;
        setAudioNotice(false);
        startBgm(true);
      } else {
        setAudioNotice(true);
      }
    }).catch(() => setAudioNotice(true));

    // Some browsers keep resume() pending until a gesture instead of rejecting it.
    setTimeout(() => {
      if (!audioUnlocked && ac.state !== 'running') setAudioNotice(true);
    }, 350);
  }
}

function tone(frequency, duration = 0.05, volume = 0.035, type = 'square', endFrequency = null, delay = 0) {
  if (!soundEnabled) return;
  const ac = ensureAudio();
  if (!ac || ac.state !== 'running') return;

  const start = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (endFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise(duration = 0.07, volume = 0.02, delay = 0) {
  if (!soundEnabled) return;
  const ac = ensureAudio();
  if (!ac || ac.state !== 'running' || !noiseBuffer) return;
  const start = ac.currentTime + delay;
  const source = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  source.buffer = noiseBuffer;
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  source.start(start);
  source.stop(start + duration);
}

const sfx = {
  move() { tone(155, 0.025, 0.014, 'square'); },
  rotate() { tone(330, 0.045, 0.025, 'triangle', 440); },
  land() { noise(0.055, 0.022); tone(95, 0.055, 0.025, 'sine', 70); },
  hardDrop() { noise(0.085, 0.032); tone(150, 0.08, 0.035, 'sawtooth', 55); },
  clear(count) {
    const base = count === 4 ? 520 : 390;
    tone(base, 0.08, 0.035, 'triangle');
    tone(base * 1.25, 0.09, 0.035, 'triangle', null, 0.07);
    if (count === 4) tone(base * 1.5, 0.12, 0.04, 'triangle', null, 0.14);
  },
  gameOver() {
    tone(260, 0.16, 0.035, 'sawtooth', 180);
    tone(180, 0.22, 0.035, 'sawtooth', 80, 0.14);
  }
};

function noteFrequency(note) {
  if (note === 'R') return 0;
  const match = note.match(/^([A-G])(#?)(\d)$/);
  if (!match) return 0;
  const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = (Number(match[3]) + 1) * 12 + semitones[match[1]] + (match[2] ? 1 : 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function currentBgmBpm() {
  // Give the opening levels more breathing room, then widen the tempo range
  // so each level-up remains noticeable well into the late game.
  const baseBpm = 120;
  const earlyStep = 6;
  const lateStep = 8;
  const earlyLevels = 10;

  if (level <= earlyLevels) {
    return baseBpm + (level - 1) * earlyStep;
  }

  const bpmAtLevel10 = baseBpm + (earlyLevels - 1) * earlyStep; // 174 BPM
  return Math.min(220, bpmAtLevel10 + (level - earlyLevels) * lateStep);
}

function trackBgmOscillator(osc) {
  activeBgmOscillators.add(osc);
  osc.addEventListener('ended', () => activeBgmOscillators.delete(osc), { once: true });
}

function scheduleOscillator(note, start, duration, volume, type = 'square', cutoff = 2200) {
  const ac = ensureAudio();
  if (!ac || ac.state !== 'running' || note === 'R') return;
  const frequency = noteFrequency(note);
  if (!frequency) return;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, start);

  const attack = Math.min(0.008, duration * 0.15);
  const release = Math.min(0.045, duration * 0.35);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + attack);
  gain.gain.setValueAtTime(volume, Math.max(start + attack + 0.001, start + duration - release));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
  trackBgmOscillator(osc);
}

function scheduleLead(note, start, duration) {
  if (note === 'R') return;
  // Two very light layers give the melody a retro-console feel without copying
  // a specific commercial recording/arrangement.
  scheduleOscillator(note, start, duration * 0.90, 0.028, 'square', 2100);
  scheduleOscillator(note, start + 0.004, duration * 0.84, 0.008, 'triangle', 2800);
}

function scheduleChordPulse(chordName, start, beatSec) {
  const chord = BGM_CHORDS[chordName];
  if (!chord) return;
  chord.tones.forEach((note, i) => {
    scheduleOscillator(note, start + i * 0.004, beatSec * 0.28, 0.0048, 'square', 1250);
  });
}

function scheduleAccompaniment(harmony, barStart, beatSec) {
  for (let eighth = 0; eighth < 8; eighth++) {
    const beat = eighth * 0.5;
    const chordName = harmony[beat < 2 ? 0 : 1] || harmony[0];
    const chord = BGM_CHORDS[chordName];
    if (!chord) continue;
    const bassNote = chord.bass[eighth % 2];
    scheduleOscillator(bassNote, barStart + beat * beatSec, beatSec * 0.38, 0.013, 'triangle', 900);
  }

  scheduleChordPulse(harmony[0], barStart + 0.5 * beatSec, beatSec);
  scheduleChordPulse(harmony[1] || harmony[0], barStart + 2.5 * beatSec, beatSec);
}

function scheduleBgmBar() {
  if (!gameStarted || !bgmRunning || !bgmEnabled || !audioUnlocked || paused || gameOver) {
    bgmRunning = false;
    return;
  }

  const ac = ensureAudio();
  if (!ac || ac.state !== 'running') {
    bgmRunning = false;
    setAudioNotice(true);
    return;
  }

  const beatSec = 60 / currentBgmBpm();
  const bar = KOROBEINIKI_BARS[bgmBarIndex];
  const barStart = Math.max(ac.currentTime + 0.025, bgmNextBarTime || 0);

  let beatOffset = 0;
  for (const [note, beats] of bar.melody) {
    scheduleLead(note, barStart + beatOffset * beatSec, beats * beatSec);
    beatOffset += beats;
  }

  scheduleAccompaniment(bar.harmony, barStart, beatSec);

  bgmNextBarTime = barStart + 4 * beatSec;
  bgmBarIndex = (bgmBarIndex + 1) % KOROBEINIKI_BARS.length;

  const waitMs = Math.max(40, (bgmNextBarTime - ac.currentTime - 0.10) * 1000);
  bgmTimer = setTimeout(scheduleBgmBar, waitMs);
}

function startBgm(resetPosition = false) {
  if (resetPosition) {
    bgmBarIndex = 0;
    bgmNextBarTime = 0;
  }
  if (!gameStarted || !bgmEnabled || !audioUnlocked || paused || gameOver || bgmRunning) return;
  const ac = ensureAudio();
  if (!ac || ac.state !== 'running') return;
  bgmRunning = true;
  scheduleBgmBar();
}

function stopBgm(resetPosition = false) {
  clearTimeout(bgmTimer);
  bgmTimer = null;
  bgmRunning = false;
  bgmNextBarTime = 0;
  for (const osc of activeBgmOscillators) {
    try { osc.stop(); } catch (_) {}
  }
  activeBgmOscillators.clear();
  if (resetPosition) bgmBarIndex = 0;
}

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function shuffledBag() {
  const pieces = Object.keys(SHAPES);
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return pieces;
}

function takeType() {
  if (bag.length === 0) bag = shuffledBag();
  return bag.pop();
}

function createPiece(type = takeType()) {
  const matrix = SHAPES[type].map(row => [...row]);
  return {
    type,
    matrix,
    x: Math.floor(COLS / 2) - Math.ceil(matrix[0].length / 2),
    y: type === 'I' ? -1 : 0
  };
}

function resetGame(shouldStart = true) {
  stopBgm(true);
  gameStarted = shouldStart;
  board = createBoard();
  bag = [];
  score = 0;
  lines = 0;
  level = 1;
  gameOver = false;
  paused = false;
  current = createPiece();
  nextPiece = createPiece();
  dropCounter = 0;
  lastTime = performance.now();
  pauseBtn.textContent = '一時停止';
  pauseBtn.disabled = !shouldStart;
  updateInfo();
  hideOverlay();
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(update);
  if (shouldStart && bgmEnabled && audioUnlocked) startBgm(true);
}

function startGame() {
  startScreen.classList.add('hidden');
  unlockAudio();
  resetGame(true);
}

function updateInfo() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines.toString();
  levelEl.textContent = level.toString();
}

function collides(piece, offsetX = 0, offsetY = 0, matrix = piece.matrix) {
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (!matrix[y][x]) continue;
      const bx = piece.x + x + offsetX;
      const by = piece.y + y + offsetY;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
  }
  return false;
}

function mergePiece() {
  let aboveTop = false;
  current.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      const by = current.y + y;
      const bx = current.x + x;
      if (by < 0) {
        aboveTop = true;
      } else {
        board[by][bx] = current.type;
      }
    });
  });

  if (aboveTop) {
    endGame();
    return;
  }

  sfx.land();
  clearLines();
  current = nextPiece;
  current.x = Math.floor(COLS / 2) - Math.ceil(current.matrix[0].length / 2);
  current.y = current.type === 'I' ? -1 : 0;
  nextPiece = createPiece();

  if (collides(current)) endGame();
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(Boolean)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(null));
      cleared++;
      y++;
    }
  }

  if (cleared > 0) {
    const scoreTable = [0, 100, 300, 500, 800];
    score += scoreTable[cleared] * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    updateInfo();
    sfx.clear(cleared);
  }
}

function move(dx) {
  if (!gameStarted || gameOver || paused) return;
  if (!collides(current, dx, 0)) {
    current.x += dx;
    sfx.move();
  }
}

function softDrop() {
  if (!gameStarted || gameOver || paused) return;
  if (!collides(current, 0, 1)) {
    current.y++;
    score += 1;
    updateInfo();
  } else {
    mergePiece();
  }
  dropCounter = 0;
}

function autoDrop() {
  if (!collides(current, 0, 1)) {
    current.y++;
  } else {
    mergePiece();
  }
  dropCounter = 0;
}

function hardDrop() {
  if (!gameStarted || gameOver || paused) return;
  let distance = 0;
  while (!collides(current, 0, 1)) {
    current.y++;
    distance++;
  }
  score += distance * 2;
  updateInfo();
  sfx.hardDrop();
  mergePiece();
  dropCounter = 0;
}

function rotateMatrix(matrix) {
  return matrix[0].map((_, index) => matrix.map(row => row[index]).reverse());
}

function rotate() {
  if (!gameStarted || gameOver || paused || current.type === 'O') return;
  const rotated = rotateMatrix(current.matrix);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collides(current, kick, 0, rotated)) {
      current.x += kick;
      current.matrix = rotated;
      sfx.rotate();
      return;
    }
  }
}

function ghostY() {
  let offset = 0;
  while (!collides(current, 0, offset + 1)) offset++;
  return current.y + offset;
}

function drawCell(context, x, y, color, size, alpha = 1) {
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,.20)';
  context.fillRect(x * size + 3, y * size + 3, size - 6, 3);
  context.strokeStyle = 'rgba(0,0,0,.25)';
  context.strokeRect(x * size + 1.5, y * size + 1.5, size - 3, size - 3);
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,.045)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * BLOCK, 0);
    ctx.lineTo(x * BLOCK, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * BLOCK);
    ctx.lineTo(canvas.width, y * BLOCK);
    ctx.stroke();
  }
}

function drawMatrix(matrix, px, py, type, alpha = 1) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value && py + y >= 0) drawCell(ctx, px + x, py + y, COLORS[type], BLOCK, alpha);
    });
  });
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#070b15';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  board.forEach((row, y) => {
    row.forEach((type, x) => {
      if (type) drawCell(ctx, x, y, COLORS[type], BLOCK);
    });
  });

  if (current && !gameOver) {
    if (ghostEnabled) drawMatrix(current.matrix, current.x, ghostY(), current.type, 0.20);
    drawMatrix(current.matrix, current.x, current.y, current.type, 1);
  }

  drawNext();
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  nextCtx.fillStyle = '#0b1020';
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!nextPiece) return;

  const matrix = nextPiece.matrix;
  const cols = matrix[0].length;
  const rows = matrix.length;
  const cell = Math.min(24, nextCanvas.width / (cols + 2), nextCanvas.height / (rows + 2));
  const ox = (nextCanvas.width - cols * cell) / 2;
  const oy = (nextCanvas.height - rows * cell) / 2;

  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      nextCtx.fillStyle = COLORS[nextPiece.type];
      nextCtx.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
    });
  });
}

function update(time = 0) {
  const delta = time - lastTime;
  lastTime = time;

  if (gameStarted && !paused && !gameOver) {
    dropCounter += delta;
    const interval = Math.max(90, 850 - (level - 1) * 65);
    if (dropCounter > interval) autoDrop();
  }

  draw();
  animationId = requestAnimationFrame(update);
}

function showOverlay(title, buttonText) {
  overlayTitle.textContent = title;
  overlayBtn.textContent = buttonText;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function endGame() {
  gameOver = true;
  stopBgm(false);
  sfx.gameOver();
  showOverlay('GAME OVER', 'もう一度プレイ');
}

function togglePause() {
  if (!gameStarted || gameOver) return;
  paused = !paused;
  if (paused) {
    stopBgm(false);
    showOverlay('PAUSE', '再開');
    pauseBtn.textContent = '再開';
  } else {
    hideOverlay();
    pauseBtn.textContent = '一時停止';
    lastTime = performance.now();
    startBgm(false);
  }
}

document.addEventListener('keydown', (event) => {
  const key = event.key;
  if (!gameStarted) {
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      startGame();
    }
    return;
  }

  unlockAudio();
  if (['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' ','z','Z','x','X','p','P'].includes(key)) {
    event.preventDefault();
  }

  if (key === 'ArrowLeft') move(-1);
  else if (key === 'ArrowRight') move(1);
  else if (key === 'ArrowDown') softDrop();
  else if (key === 'ArrowUp' || key === 'x' || key === 'X') rotate();
  else if (key === 'z' || key === 'Z') {
    rotate(); rotate(); rotate();
  }
  else if (key === ' ') hardDrop();
  else if (key === 'p' || key === 'P') togglePause();
});

function bindButton(id, action, repeat = false) {
  const button = document.getElementById(id);
  let delayTimer = null;
  let repeatTimer = null;

  const stop = () => {
    clearTimeout(delayTimer);
    clearInterval(repeatTimer);
    button.classList.remove('pressed');
  };

  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    unlockAudio();
    button.setPointerCapture?.(e.pointerId);
    button.classList.add('pressed');
    action();
    if (repeat) {
      delayTimer = setTimeout(() => {
        repeatTimer = setInterval(action, 70);
      }, 180);
    }
  });

  button.addEventListener('pointerup', stop);
  button.addEventListener('pointercancel', stop);
  button.addEventListener('lostpointercapture', stop);
}

bindButton('leftBtn', () => move(-1), true);
bindButton('rightBtn', () => move(1), true);
bindButton('downBtn', softDrop, true);
bindButton('rotateBtn', rotate);
bindButton('dropBtn', hardDrop);

function toggleGhostSetting() {
  ghostEnabled = !ghostEnabled;
  localStorage.setItem('tetrisGhost', ghostEnabled ? 'on' : 'off');
  updateSettingButtons();
}

function toggleSoundSetting() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('tetrisSound', soundEnabled ? 'on' : 'off');
  updateSettingButtons();
  if (soundEnabled && gameStarted) {
    unlockAudio();
    tone(440, 0.05, 0.025, 'triangle', 660);
  }
}

function toggleBgmSetting() {
  bgmEnabled = !bgmEnabled;
  localStorage.setItem('tetrisBgm', bgmEnabled ? 'on' : 'off');
  updateSettingButtons();
  if (bgmEnabled && gameStarted) {
    unlockAudio();
    startBgm(false);
  } else {
    stopBgm(false);
  }
}

ghostToggleBtn.addEventListener('click', toggleGhostSetting);
soundToggleBtn.addEventListener('click', toggleSoundSetting);
bgmToggleBtn.addEventListener('click', toggleBgmSetting);
startGhostToggleBtn.addEventListener('click', toggleGhostSetting);
startSoundToggleBtn.addEventListener('click', toggleSoundSetting);
startBgmToggleBtn.addEventListener('click', toggleBgmSetting);

startBtn.addEventListener('click', startGame);
pauseBtn.addEventListener('click', togglePause);
restartBtn.addEventListener('click', () => {
  unlockAudio();
  resetGame(true);
});
overlayBtn.addEventListener('click', () => {
  if (gameOver) {
    unlockAudio();
    resetGame(true);
  } else {
    togglePause();
  }
});

// Smartphone gestures on the game canvas.
let touchStart = null;
let touchLast = null;
let gestureMoved = false;

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (e.pointerType === 'mouse') return;
  e.preventDefault();
  canvas.setPointerCapture?.(e.pointerId);
  touchStart = { x: e.clientX, y: e.clientY, time: performance.now() };
  touchLast = { ...touchStart };
  gestureMoved = false;
});

canvas.addEventListener('pointermove', (e) => {
  if (!touchStart || e.pointerType === 'mouse') return;
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const cellWidth = rect.width / COLS;
  const dx = e.clientX - touchLast.x;
  const dy = e.clientY - touchLast.y;

  if (Math.abs(dx) >= cellWidth * 0.7) {
    move(dx > 0 ? 1 : -1);
    touchLast.x = e.clientX;
    touchLast.y = e.clientY;
    gestureMoved = true;
  } else if (dy >= cellWidth * 0.75) {
    softDrop();
    touchLast.x = e.clientX;
    touchLast.y = e.clientY;
    gestureMoved = true;
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (!touchStart || e.pointerType === 'mouse') return;
  e.preventDefault();

  const totalDy = e.clientY - touchStart.y;
  const duration = performance.now() - touchStart.time;
  const rect = canvas.getBoundingClientRect();

  if (!gestureMoved && duration < 320) {
    rotate();
  } else if (totalDy > rect.height * 0.16 && duration < 500) {
    hardDrop();
  }

  touchStart = null;
  touchLast = null;
});

canvas.addEventListener('pointercancel', () => {
  touchStart = null;
  touchLast = null;
});

window.addEventListener('blur', () => {
  if (gameStarted && !gameOver && !paused) togglePause();
});

document.addEventListener('visibilitychange', () => {
  if (gameStarted && !document.hidden && audioUnlocked && bgmEnabled && !paused && !gameOver) {
    const ac = ensureAudio();
    if (ac && ac.state === 'suspended') ac.resume().then(() => startBgm(false)).catch(() => {});
    else startBgm(false);
  }
});

updateSettingButtons();
resetGame(false);
startScreen.classList.remove('hidden');
requestAnimationFrame(() => startBtn.focus());
