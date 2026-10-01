'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const holdPanel = document.getElementById('hold-panel');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');
const pauseOverlay = document.getElementById('pause-overlay');
const pauseMain = document.getElementById('pause-main');
const pauseControls = document.getElementById('pause-controls');
const startLevelEl = document.getElementById('start-level-value');
const levelSelect = document.getElementById('level-select');
const menuItems = [
  document.getElementById('pause-resume'),
  document.getElementById('pause-restart'),
  document.getElementById('pause-controls-btn'),
  levelSelect,
];
const LEVEL_ITEM = 3;

const MIN_START_LEVEL = 1;
const MAX_START_LEVEL = 10;

let gridColor, highlightColor;
let startLevel = MIN_START_LEVEL; // UI-only, no gameplay effect
let pauseView = 'main';
let menuIndex = 0;
const heldKeys = new Set();       // keys currently down
let suppressedKeys = new Set();   // held across menu open/close/restart: ignored by gameplay until released
let board, current, next, held, canHold, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  return makePiece(Math.floor(Math.random() * 7) + 1);
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
  if (!gameOver) setCanHold(true);
}

function setCanHold(value) {
  canHold = value;
  holdPanel.classList.toggle('blocked', !canHold);
  drawHold();
}

function holdPiece() {
  if (!canHold) return;
  const type = current.type;
  if (held) {
    current = makePiece(held);
    held = type;
    if (collide(current.shape, current.x, current.y)) endGame();
  } else {
    held = type;
    spawn();
  }
  setCanHold(false);
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = highlightColor;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function drawHold() {
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (!held) return;
  const shape = PIECES[held];
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(holdCtx, offX + c, offY + r, shape[r][c], 30, canHold ? 1 : 0.3);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function openPause() {
  if (gameOver || paused) return;
  paused = true;
  cancelAnimationFrame(animId);
  suppressedKeys = new Set(heldKeys);
  showPauseView('main');
  pauseOverlay.classList.remove('hidden');
}

function closePause() {
  if (!paused) return;
  paused = false;
  suppressedKeys = new Set(heldKeys);
  pauseOverlay.classList.add('hidden');
  showPauseView('main');
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function togglePause() {
  if (gameOver) return;
  if (paused) closePause(); else openPause();
}

function showPauseView(view) {
  pauseView = view;
  pauseMain.classList.toggle('hidden', view !== 'main');
  pauseControls.classList.toggle('hidden', view !== 'controls');
  setMenuIndex(0);
}

function setMenuIndex(i) {
  menuIndex = (i + menuItems.length) % menuItems.length;
  menuItems.forEach((el, idx) => el.classList.toggle('focused', idx === menuIndex));
}

// Hook for the future level system: only updates the selector, never `level`/`dropInterval`.
function setStartLevel(n) {
  startLevel = Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, n));
  startLevelEl.textContent = startLevel;
}

function activateMenuItem(i) {
  if (i === 0) closePause();
  else if (i === 1) init();
  else if (i === 2) showPauseView('controls');
}

function handlePauseKey(e) {
  if (pauseView === 'controls') {
    if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) showPauseView('main');
    else if (e.code === 'Backspace') showPauseView('main');
    return;
  }
  switch (e.code) {
    case 'ArrowUp': setMenuIndex(menuIndex - 1); break;
    case 'ArrowDown': setMenuIndex(menuIndex + 1); break;
    case 'ArrowLeft': if (menuIndex === LEVEL_ITEM) setStartLevel(startLevel - 1); break;
    case 'ArrowRight': if (menuIndex === LEVEL_ITEM) setStartLevel(startLevel + 1); break;
    case 'Enter':
    case 'Space':
      if (!e.repeat) activateMenuItem(menuIndex);
      break;
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch (e) {}
  const styles = getComputedStyle(document.documentElement);
  gridColor = styles.getPropertyValue('--grid').trim();
  highlightColor = styles.getPropertyValue('--block-highlight').trim();
  draw();
  drawNext();
  drawHold();
}

function toggleTheme() {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  pauseOverlay.classList.add('hidden');
  showPauseView('main');
  suppressedKeys = new Set(heldKeys);
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  held = null;
  next = randomPiece();
  spawn();
  setCanHold(true);
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  heldKeys.add(e.code);
  if (e.code === 'KeyT') { toggleTheme(); return; }
  if ((e.code === 'KeyP' || e.code === 'Escape') && !gameOver) {
    e.preventDefault();
    if (!e.repeat) togglePause();
    return;
  }
  if (paused) {
    e.preventDefault();
    e.stopPropagation();
    handlePauseKey(e);
    return;
  }
  if (gameOver || suppressedKeys.has(e.code)) return;
  if (e.code === 'KeyC' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    if (!e.repeat) holdPiece();
    return;
  }
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

document.addEventListener('keyup', e => {
  heldKeys.delete(e.code);
  suppressedKeys.delete(e.code);
});
window.addEventListener('blur', () => {
  heldKeys.clear();
  suppressedKeys.clear();
});

restartBtn.addEventListener('click', init);
const onMenuClick = (el, fn) => el.addEventListener('click', () => { fn(); el.blur(); });
onMenuClick(document.getElementById('pause-resume'), closePause);
onMenuClick(document.getElementById('pause-restart'), init);
onMenuClick(document.getElementById('pause-controls-btn'), () => showPauseView('controls'));
onMenuClick(document.getElementById('pause-back'), () => showPauseView('main'));
onMenuClick(document.getElementById('start-level-dec'), () => setStartLevel(startLevel - 1));
onMenuClick(document.getElementById('start-level-inc'), () => setStartLevel(startLevel + 1));
themeBtn.addEventListener('click', () => {
  toggleTheme();
  themeBtn.blur();
});

init();
setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
