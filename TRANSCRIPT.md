# TRANSCRIPT.md — SABLE LINE build session

Build session for the make.fun bounty **threejs-fps-02** ("Make the best
three.js tactical FPS"), $1,000 USDC, deadline 17 Nov 2026 04:30 WIB.
Built by the Muse agent (session `9443d547-69dd-4adb-8b9a-cd4ab8553e1e`),
started 15 Nov 2026 ~16:20 WIB, v1 finished 15 Nov 2026 ~17:45 WIB.

The full machine-readable session log is `transcript.jsonl` (copied from the
agent's session file). This file is a human summary of what was done, in
order, so a reviewer can see the build is genuine agent work, not a pasted
starter.

## 1. Kit study (~16:20–16:35 WIB)

- Downloaded the kit from https://make.fun/c/threejs-fps-02/kit into `kit/`
  and read `RULES.txt` (407 lines) in full, plus `competition.yaml` and the
  make.fun agent guide at https://make.fun/skill.md.
- Key rules taken from the kit, not invented: static files under `game/`,
  ES modules, no build step, no network requests; three.js 0.187.0 vendored
  byte-for-byte; one import map in `index.html`; `main.ts` (Node 22 stdlib)
  copies `game/` + `screenshots/` to `/output` and writes
  `/output/dossier.json` via the kit's `buildDossier`; 3–4 screenshots, real
  renders of the game's own code; dossier source cap 160 KiB; six gate rows,
  first five must pass.
- Verified the environment: node v24.22.1, python3 3.12.3, Chromium at
  `/opt/meta-chromium/chrome`, Playwright (node) with the SwiftShader/WebGL
  flags proven by the radar project's shoot script.

## 2. Game design and first build (~16:35–16:55 WIB)

- Designed **SABLE LINE**: dusk rail depot "YARD 7" (44×36 m), two bomb
  sites (container yard west, roofed warehouse east), three lanes + north
  connector, waypoint graph, 3 friendly bots + 4 enemy bots, freeze 15 s /
  live 100 s / detonate 35 s, first to 3, max 5 rounds, economy with a buy
  menu, three weapons, grenades, procedural audio.
- Wrote all 13 game modules + `index.html` + `main.ts` + `serve.ts` from
  scratch in this session (the starter was read for reference only; none of
  its game code was copied — the only verbatim copies are the vendored
  three.js files and the kit library `vendor/makefun-threejs.ts`, which the
  rules explicitly require/exempt).
- Fixed eight integration bugs found while wiring the modules together
  (duplicate grenade instance, `takeNoise` argument mismatch, spawn yaw
  backwards, `channelKind` never cleared, missing `forcePlant`/`forceDefuse`
  hooks, buy digits clashing with weapon digits, bots stepping during
  freeze, redundant timer ternary).

## 3. Screenshot debugging (~16:55–17:10 WIB)

- First screenshot run: all four shots byte-identical because
  `window.__shotReady` never fired — `hud.js` referenced `money-value`,
  which did not exist in `index.html`. Fixed the markup.
- Second run: no errors, four distinct shots, but the view model was
  missing from frame. A magenta recolor test (`/tmp/dbg6.mjs`) proved the
  gun rendered but was enormous (stock 0.17 m from the camera). Fixed by
  moving it to z −0.62 and shrinking its screen footprint.
- Buy menu number keys overlapped prices — fixed with explicit grid
  placement. Sun/fill light bumped (1.7→2.0 / 0.4→0.55).

## 4. Bot behaviour and map fixes (~17:10–17:30 WIB)

- Live browser soak (player idle at spawn): bots fought from spawn and the
  round never ended — they engaged at any distance and never routed.
  Added `ENGAGE_RANGE = 24`, a `hurtTimer` (a bot that just took damage
  engages its attacker), and `bots.onDamaged()`.
- Plant/defuse checks sat below an early return for 'hold'/'investigate',
  so a bot that finished its route never planted. Moved the checks up,
  gated to 'route'/'hold'.
- Attackers all took the same BFS-shortest mid lane. Added `setRouteVia`
  with a random lane entry per round.
- Found a real FOV bug: `SIGHT_HALF_FOV` was 0.96 (a 16° tunnel) while the
  comment said cos(55°). Fixed to 0.574 (110° cone) — then tuned to 0.8
  (74° cone) after headless tests showed holders shredding every push.
- `moveToward` walks straight at its target with no obstacle avoidance, so
  any waypoint edge crossing a crate stalls a bot forever. Wrote
  `research/audit_map.mjs`: 60 blocked edges/nodes/spawns found and fixed
  (crates and a pillar moved, a platform and two boxes removed, three
  waypoints repositioned). Audit now reports all clear.
- `bot.vel` was never updated, so the "moving target" accuracy penalty in
  `fireAt` never applied. Fixed by deriving velocity from per-tick
  displacement.
- Added a stuck safety net: a bot that moves < 0.5 m in 1.5 s skips to its
  next route node.

## 5. Objective-flow verification (~17:30–17:40 WIB)

- `research/simtest-headless.mjs` drives the real `world`/`bots`/`rounds`
  modules with no renderer (stub API, simplified ray-sphere hitscan,
  seeded `Math.random`). Results across 9 seeds: plants in 6/9, defuses
  observed (MOSS, 65.0 s and 57.1 s), detonations observed (86.5 s, 90.3 s,
  121.8 s), time-expired rounds observed. Event log byte-identical across
  repeated runs (deterministic).
- Note: the headless harness's hit spheres are slightly more generous than
  the real game's capsule test (chest 0.38 / head 0.25 vs capsule r=0.38),
  so headless kill pace is faster than in the browser; balance was judged
  from the browser soak as well.
- Live browser soak (final tuning): bots route across the map, fight at
  mid, take damage, die, killfeed works, buy menu works, round timer
  advances. No console/page errors. (Headless SwiftShader runs the sim at
  ~0.2× real time — the round did not finish inside the 130 s wall window;
  on real hardware the fixed-step sim runs 1×.)

## 6. Final polish and validation (~17:40–17:45 WIB)

- View model resized again: scale 0.7, position (0.28, −0.28, −0.8),
  rotation.y 0.12 — a properly-sized pistol in the lower right, verified
  with the magenta test and the final screenshots.
- Re-took all four screenshots (`research/shoot.mjs`), visually inspected
  the start and play shots: title overlay, controls, HUD, three bots in
  view, hitmarker, ammo 11/36 after the scripted shot.
- `research/validate_gate.mjs`: **all six gate rows pass**; dossier text
  96,724 / 163,840 bytes; two builds byte-identical.
- Wrote `README.md`, this file, fixed the LICENSE copyright to Nano Rasa,
  removed build outputs (`out/`, `out2/`) so the repo root is clean.

## What was NOT done here

No GitHub repo was created, nothing was submitted to make.fun, no wallet or
key was touched, no account was logged into. Those steps are the parent
agent's. Files that must NOT go into the entry repo: `kit/` (reference),
`research/` (test scripts), `transcript.jsonl` (this log — it is a build
record, not part of the game; keep it in the workspace, do not upload).
