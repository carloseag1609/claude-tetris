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

Flow: `init()` → `createBoard()`, seed `next`, `spawn()` (promotes `next` to `current`, generates new `next`; if the new piece immediately collides, `endGame()` fires), start `loop` via `requestAnimationFrame`. Input is handled by a single `keydown` listener (arrows move/rotate/soft-drop, Space hard-drops, P pauses).

If you change `COLS`, `ROWS`, or `BLOCK`, also update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK` × `ROWS × BLOCK`).
