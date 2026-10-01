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
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const newRecordEl = document.getElementById('new-record');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const goScoresBlock = document.getElementById('go-scores-block');

const MAX_SCORES = 5;
const NAME_MAX = 12;

let gridColor, highlightColor;
let board, current, next, held, canHold, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let started = false, combo = 0, bestComboGame = 0;

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
  return cleared;
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
  // combo: bloqueos consecutivos que limpian >= 1 línea
  combo = clearLines() ? combo + 1 : 0;
  if (combo > bestComboGame) bestComboGame = combo;
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

// ---- Récords (localStorage) ----
function loadScores() {
  try {
    const data = JSON.parse(localStorage.getItem('highscores'));
    if (!Array.isArray(data)) return [];
    return data
      .filter(e => e && typeof e === 'object' && Number.isFinite(e.score) && e.score > 0)
      .map(e => ({
        name: String(e.name ?? '').slice(0, NAME_MAX) || 'Anónimo',
        score: Math.floor(e.score),
        lines: Number.isFinite(e.lines) ? Math.floor(e.lines) : 0,
        combo: Number.isFinite(e.combo) ? Math.floor(e.combo) : 0,
        date: Number.isFinite(e.date) ? e.date : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SCORES);
  } catch (e) {
    return [];
  }
}

function saveScores(list) {
  try { localStorage.setItem('highscores', JSON.stringify(list)); } catch (e) {}
}

function loadRecords() {
  const rec = { maxCombo: 0, maxLines: 0 };
  try {
    const data = JSON.parse(localStorage.getItem('records'));
    if (data && Number.isFinite(data.maxCombo) && data.maxCombo > 0) rec.maxCombo = Math.floor(data.maxCombo);
    if (data && Number.isFinite(data.maxLines) && data.maxLines > 0) rec.maxLines = Math.floor(data.maxLines);
  } catch (e) {}
  return rec;
}

function saveRecords() {
  const rec = loadRecords();
  rec.maxCombo = Math.max(rec.maxCombo, bestComboGame);
  rec.maxLines = Math.max(rec.maxLines, lines);
  try { localStorage.setItem('records', JSON.stringify(rec)); } catch (e) {}
}

function qualifies(s) {
  const list = loadScores();
  return s > 0 && (list.length < MAX_SCORES || s > list[list.length - 1].score);
}

function renderScores(listEl, recordsEl, highlight) {
  const list = loadScores();
  listEl.replaceChildren();
  if (!list.length) {
    const li = document.createElement('li');
    li.textContent = 'Sin puntuaciones';
    listEl.appendChild(li);
  }
  list.forEach((e, i) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    const pts = document.createElement('span');
    name.textContent = `${i + 1}. ${e.name}`;
    pts.textContent = e.score.toLocaleString();
    li.append(name, pts);
    if (highlight && e.date === highlight.date && e.score === highlight.score && e.name === highlight.name) {
      li.classList.add('highlight');
    }
    listEl.appendChild(li);
  });
  const rec = loadRecords();
  recordsEl.textContent = `Mejor combo: ${rec.maxCombo}\nMáx. líneas en una partida: ${rec.maxLines}`;
}

function renderAllScores(highlight) {
  renderScores(document.getElementById('start-scores'), document.getElementById('start-records'));
  renderScores(document.getElementById('go-scores'), document.getElementById('go-records'), highlight);
}

function submitName() {
  const name = nameInput.value.trim().slice(0, NAME_MAX) || 'Anónimo';
  try { localStorage.setItem('playerName', name); } catch (e) {}
  const entry = { name, score, lines, combo: bestComboGame, date: Date.now() };
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  saveScores(list.slice(0, MAX_SCORES));
  nameForm.classList.add('hidden');
  newRecordEl.classList.add('hidden');
  goScoresBlock.classList.remove('hidden');
  renderAllScores(entry);
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  saveRecords();
  renderAllScores();
  if (qualifies(score)) {
    let last = '';
    try { last = localStorage.getItem('playerName') || ''; } catch (e) {}
    nameInput.value = last.slice(0, NAME_MAX);
    newRecordEl.classList.remove('hidden');
    nameForm.classList.remove('hidden');
    goScoresBlock.classList.add('hidden');
  } else {
    goScoresBlock.classList.remove('hidden');
  }
  overlay.classList.remove('hidden');
  if (!nameForm.classList.contains('hidden')) nameInput.focus();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
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
  combo = 0;
  bestComboGame = 0;
  newRecordEl.classList.add('hidden');
  nameForm.classList.add('hidden');
  goScoresBlock.classList.add('hidden');
  next = randomPiece();
  spawn();
  setCanHold(true);
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (!started) {
    if (e.code === 'KeyT') toggleTheme();
    else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && tag !== 'BUTTON') { e.preventDefault(); startGame(); }
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyT') { toggleTheme(); return; }
  if (paused || gameOver) return;
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

function startGame() {
  if (started) return;
  started = true;
  startOverlay.classList.add('hidden');
  if (document.activeElement) document.activeElement.blur();
  init();
}

restartBtn.addEventListener('click', init);
startBtn.addEventListener('click', startGame);
nameForm.addEventListener('submit', e => {
  e.preventDefault();
  submitName();
});
document.querySelectorAll('.reset-scores').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!confirm('¿Borrar todos los récords?')) return;
    try {
      localStorage.removeItem('highscores');
      localStorage.removeItem('records');
    } catch (e) {}
    renderAllScores();
    btn.blur();
  });
});
themeBtn.addEventListener('click', () => {
  toggleTheme();
  themeBtn.blur();
});

// pantalla de inicio: el juego no arranca hasta pulsar Jugar / Enter
init();
cancelAnimationFrame(animId);
renderAllScores();
setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
