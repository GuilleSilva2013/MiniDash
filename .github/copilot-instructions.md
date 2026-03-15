# Project Guidelines

## Code Style
- Keep gameplay logic in plain JavaScript inside [game.js](../game.js) using the existing IIFE pattern.
- Prefer `const` and small arrow functions for utilities and state transitions.
- Keep JSDoc type hints when touching complex objects (player state, snapshot/history, obstacle arrays).
- Follow current naming style: camelCase for symbols and UPPER_SNAKE_CASE for storage keys.
- Avoid large class-based refactors; this project intentionally uses plain objects + functions.

## Architecture
- [main.js](../main.js): Electron main process (window creation and app lifecycle).
- [index.html](../index.html): static UI shell (HUD, stage, overlays, icon section).
- [style.css](../style.css): layout and theme styling.
- [game.js](../game.js): full runtime (input, game loop, physics, rendering, level data, audio, rewind, unlocks).
- Persisted progression uses localStorage keys defined in [game.js](../game.js).

## Build and Test
- Install dependencies: `npm install`
- Run desktop app: `npm start`
- Build Windows installer: `npm run dist`
- Build portable Windows app: `npm run dist:portable`
- Run web mode locally: `python -m http.server 5173` and open `http://localhost:5173/`
- After substantial gameplay edits, validate at minimum:
	- [game.js](../game.js) has no editor errors.
	- `npm start` launches without runtime errors.
	- If packaging-related files change, run `npm run dist` and verify output in [dist](../dist).

## Conventions
- Keep game loop deterministic with the fixed-step simulation already in [game.js](../game.js).
- Keep theme behavior data-driven from level metadata (`theme`, `music`, `pattern`) in [game.js](../game.js).
- Preserve current Electron security defaults in [main.js](../main.js): `nodeIntegration: false`, `contextIsolation: true`.
- Keep changes lightweight; avoid introducing bundlers/frameworks unless explicitly requested.
- Keep rewind/history behavior coherent:
	- Do not remove the fixed-step snapshot model used for rewind.
	- Rewind must continue to work from both live gameplay and post-death state.
- Keep progression consistency:
	- If levels are added/removed, update HUD total level display in [index.html](../index.html) and related unlock thresholds in [game.js](../game.js).
	- If icons are added/removed, update icon unlock metadata and README unlock list together.
- Keep input expectations stable unless requested otherwise:
	- Enter starts run, Space/ArrowUp/W jump, Q rewinds, R restarts.
- Keep rendering changes theme-aware:
	- Background, ground, and obstacle colors should remain synchronized per level theme.

## Pitfalls
- Audio may be blocked until first user interaction (browser and Electron autoplay policies).
- Internal simulation uses fixed canvas coordinates (960x540); UI scales visually via CSS.
- Large edits in [game.js](../game.js) should avoid unrelated refactors to reduce regression risk.
- Audio balancing can become inaudible quickly; when changing synthesis/volume, test at least one early level and one late level.
- Rewind and collision changes are tightly coupled; test platform landings, spike hits, death, and rewind recovery together.
