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
const pauseMenu = document.getElementById('pause-menu');
const pauseMain = document.getElementById('pause-main');
const pauseControls = document.getElementById('pause-controls');
const startLevelRow = document.getElementById('start-level-row');
const startLevelEl = document.getElementById('start-level');

let gridColor, highlightColor;
let board, current, next, held, canHold, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
// Menú de pausa: startLevel es solo UI (nunca toca level ni dropInterval).
// downKeys = teclas físicamente pulsadas; blockedKeys = pulsadas al abrir/cerrar/reiniciar, ignoradas hasta keyup.
let startLevel = 1;
let menuView = 'main';
const downKeys = new Set();
let blockedKeys = new Set();

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

function blockHeldKeys() {
  blockedKeys = new Set(downKeys);
}

function showMenuView(view) {
  menuView = view;
  pauseMain.classList.toggle('hidden', view !== 'main');
  pauseControls.classList.toggle('hidden', view !== 'controls');
  const first = (view === 'main' ? pauseMain : pauseControls).querySelector('.menu-item');
  first.focus();
}

function openMenu() {
  if (gameOver || paused) return;
  paused = true;
  cancelAnimationFrame(animId);
  blockHeldKeys();
  pauseMenu.classList.remove('hidden');
  showMenuView('main');
}

function closeMenu() {
  if (!paused) return;
  paused = false;
  blockHeldKeys();
  pauseMenu.classList.add('hidden');
  if (document.activeElement) document.activeElement.blur();
  lastTime = performance.now();
  loop(lastTime);
}

function setStartLevel(n) {
  startLevel = Math.min(10, Math.max(1, n));
  startLevelEl.textContent = startLevel;
  startLevelRow.setAttribute('aria-valuenow', startLevel);
}

function menuKey(e) {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (menuView === 'controls') showMenuView('main');
    else closeMenu();
    return;
  }
  const items = [...(menuView === 'main' ? pauseMain : pauseControls).querySelectorAll('.menu-item')];
  const i = items.indexOf(document.activeElement);
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault();
    const step = e.code === 'ArrowDown' ? 1 : -1;
    items[(i + step + items.length) % items.length].focus();
  } else if (document.activeElement === startLevelRow &&
             (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
    e.preventDefault();
    setStartLevel(startLevel + (e.code === 'ArrowRight' ? 1 : -1));
  } else if (e.code === 'Space' && document.activeElement === document.body) {
    e.preventDefault();
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
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  held = null;
  next = randomPiece();
  spawn();
  setCanHold(true);
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  blockHeldKeys();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  downKeys.add(e.code);
  if (e.code === 'KeyT') { toggleTheme(); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!paused && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !blockedKeys.has(e.code)) openMenu();
    else if (paused) menuKey(e);
    return;
  }
  if (paused) { menuKey(e); return; }
  if (gameOver || blockedKeys.has(e.code)) return;
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
  downKeys.delete(e.code);
  blockedKeys.delete(e.code);
});
window.addEventListener('blur', () => {
  downKeys.clear();
  blockedKeys.clear();
});

restartBtn.addEventListener('click', init);
document.getElementById('resume-btn').addEventListener('click', closeMenu);
document.getElementById('pause-restart-btn').addEventListener('click', init);
document.getElementById('controls-btn').addEventListener('click', () => showMenuView('controls'));
document.getElementById('controls-back-btn').addEventListener('click', () => showMenuView('main'));
document.getElementById('level-down').addEventListener('click', () => setStartLevel(startLevel - 1));
document.getElementById('level-up').addEventListener('click', () => setStartLevel(startLevel + 1));
themeBtn.addEventListener('click', () => {
  toggleTheme();
  themeBtn.blur();
});

init();
setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
