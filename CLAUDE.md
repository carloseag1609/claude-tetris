# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond in English when working in this repository, even though UI strings, comments, and README are in Spanish.

## Run

No build/install step. Open `index.html` directly, or serve statically:

```bash
python3 -m http.server 8000
# or
npx serve .
```

No test suite, linter, or package.json exists in this repo.

## Architecture

Vanilla JS Tetris, three files, no dependencies, no framework, no build process:

- `index.html` — DOM structure: `<canvas id="board">` (300×600, 30px blocks) for the board, `<canvas id="next-canvas">` for the next-piece preview, HUD (score/lines/level), pause/game-over overlay.
- `style.css` — dark/retro arcade visuals.
- `game.js` — all game logic, single global mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, ...), no modules/classes.

Key mechanics in `game.js`:
- Board is a `ROWS × COLS` matrix; each cell is `0` (empty) or a color index (1–7) identifying the piece type.
- Pieces are square matrices in `PIECES`; rotation (`rotateCW`) transposes + reverses rows.
- `collide(shape, ox, oy)` checks bounds and overlap against locked board cells.
- `tryRotate()` implements wall kicks: tries offsets `[0, -1, 1, -2, 2]` after rotating, keeps first non-colliding.
- Game loop (`loop`, driven by `requestAnimationFrame`) accumulates elapsed time and drops the piece when `dropAccum >= dropInterval`.
- `clearLines()` scans bottom-up, splices full rows out and unshifts empty rows in; recomputes `level` (`floor(lines/10)+1`) and `dropInterval` (`max(100, 1000 - (level-1)*90)`).
- Scoring: `LINE_SCORES = [0, 100, 300, 500, 800]` × level for line clears; hard drop = 2 pts/cell dropped; soft drop = 1 pt/row.
- Ghost piece (`ghostY`) projects `current`'s landing row, drawn at `globalAlpha = 0.2`.

Hold: `held` (piece type or `null`) and `canHold` state. `holdPiece()` (`C`/`Shift`, ignoring `e.repeat`) stores the current type in `#hold-canvas` (left panel) and either spawns `next` or swaps in a fresh unrotated `makePiece(held)`. `setCanHold()` toggles the `.blocked` class on `#hold-panel` and redraws; hold re-enables in `lockPiece()` after `spawn()` (not inside `spawn()`, or hold would never block).

Theming: colors live in CSS custom properties on `:root` (dark, default) with a `:root[data-theme="light"]` override in `style.css`. An inline script in `<head>` applies the saved theme (`localStorage` key `theme`) before first paint. `setTheme()` in `game.js` sets `data-theme`, persists it, caches canvas colors (`--grid`, `--block-highlight`) read via `getComputedStyle` into `gridColor`/`highlightColor`, and repaints `draw()`/`drawNext()` (so it works while paused/game over). Toggle with the `#theme-toggle` button or `T` (handled before the `paused || gameOver` guard).

Flow: `init()` → `createBoard()`, seed `next`, `spawn()` (promotes `next` to `current`, generates new `next`; if the new piece immediately collides, `endGame()` fires), start `loop` via `requestAnimationFrame`. Input is handled by a single `keydown` listener (arrows move/rotate/soft-drop, Space hard-drops, P/Esc open the pause menu).

Pause menu: `#pause-overlay` (separate from game-over `#overlay`) with views `main` (Reanudar / Reiniciar / Controles / NIVEL INICIAL selector) and `controls`, switched by `showPauseView()`. `openPause()`/`closePause()` (via `togglePause()`, no-op after game over) cancel/restart the rAF loop; `P`/`Esc` toggle. While `paused`, the keydown handler `preventDefault`+`stopPropagation`s and routes to `handlePauseKey()` before any gameplay code. `heldKeys`/`suppressedKeys` make gameplay ignore keys held across open/close/restart until released. Restart = `init()`. `startLevel`/`setStartLevel()` is UI-only (hook for a future level system); it never touches `level`/`dropInterval`.

If you change `COLS`, `ROWS`, or `BLOCK`, also update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK` × `ROWS × BLOCK`).

## CI

- `.github/workflows/claude.yml` — responds to `@claude` mentions in issues/PR comments/reviews.
- `.github/workflows/claude-code-review.yml` — auto-reviews opened/updated PRs.
- `.github/workflows/claude-issue-triage.yml` — on every new issue, Claude labels it (type, `area: *`, `priority: *`, `triaged`, ...) and posts a diagnosis comment (affected code, root-cause/approach, implementation steps, verification). Comment `@claude implement this` on a triaged issue to have `claude.yml` open a fix PR.
