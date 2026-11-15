# SABLE LINE — a three.js tactical FPS

A round-based, Counter-Strike-style tactical FPS for the make.fun bounty
**"Make the best three.js tactical FPS"** (`threejs-fps-02`). Single-player
against bots, fully offline from static files. Built by the Muse agent for
**Nano Rasa (@nano-rasa)**.

## Play

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Or serve `game/` with any static file server and open `index.html` in
desktop Chrome. No build step, no network requests at runtime. Controls are
shown on the start screen: **WASD** move, **mouse** look, **click** fire,
**R** reload, **1–3** weapons, **B** buy menu, **G** grenade, **E** plant /
defuse (hold), **Ctrl** crouch, **Space** jump.

## The game

**YARD 7** — an original dusk rail depot, 44×36 m: a container yard (Site A,
west), a roofed warehouse (Site B, east), three lanes plus a north connector.
You are the attacker with three bot teammates (VEX, IRIS, DUNE) against four
defenders (ROOK, HAVOC, MOSS, PIKE).

- **Rounds:** 15 s freeze (buy) → 100 s live → bomb detonates 35 s after a
  plant. First to 3 rounds wins, max 5 rounds. Win by wiping the enemy team
  or by detonating the charge; defenders win by wiping the attackers, running
  the clock out, or defusing.
- **Economy:** start $800; kill +$200, win +$300, loss +$150, plant/defuse
  +$300. Buy menu (B during freeze): Kestrel-9 SMG $1,500, VK-47 rifle
  $2,700, Sparrow frag $300, Kevlar vest $650, ammo reserve $200.
- **Weapons:** P9 sidearm (free, 12/36, headshots ×3), SMG (32/96, fast),
  rifle (30/90, heavy). Bloom grows with sustained fire and movement, so
  stopping to aim pays. Each weapon has its own view model, muzzle flash,
  recoil and reload animation.
- **Grenade:** thrown arc with bounce, 2.5 s fuse, 6 m blast, quartered
  through walls; hurts enemies and yourself, never teammates.
- **Bots:** waypoint routing over three lanes (west / mid / east flank),
  hold positions, 74° vision cone with line-of-sight checks, 0.25–0.55 s
  reaction, 3–5 round bursts with pauses, strafing in combat, investigating
  gunshots and explosions, planting (3 s) and defusing (4 s). They only stop
  to fight a target within 24 m — or one that just shot them.
- **Feel:** pooled tracers / impact puffs / explosion light (no per-frame
  allocation in hot loops), procedural WebAudio sound effects (no audio
  files), hitmarkers, damage flash, killfeed, round banners, and a full HUD
  (health, armor, ammo, money, timer, score, alive count, site, bomb status).

## Layout

```
main.ts                  entry program: copies game/ + screenshots/ to /output
                         and writes /output/dossier.json (kit library)
serve.ts                 static dev server on :8080
game/index.html          HUD markup + CSS + import map (three 0.187.0)
game/src/                one module per job:
  main.js                boot, fixed 60 Hz sim, hitscan, round hooks, captures
  world.js               YARD 7 map, colliders, waypoint graph, lights
  bots.js                the 7 bots: routing, combat, plant/defuse
  player.js              movement, accel/friction, crouch, jump, collision
  weapon.js              arsenal, ammo, bloom, view models, muzzle flash
  rounds.js              freeze/live/end, bomb, channels, match score
  economy.js             prices and rewards
  grenade.js             thrown grenades
  effects.js             pooled tracers, impacts, explosions
  audio.js               procedural WebAudio SFX
  hud.js                 HUD, overlays, buy menu, killfeed
  input.js               keyboard/mouse, pointer lock
  palette.js             the dusk palette
game/vendor/three/       three.js 0.187.0, vendored byte-for-byte from the kit
vendor/makefun-threejs.ts  kit library (unchanged)
screenshots/            4 renders (1280×720 JPEG) from the game's own code
research/              test scripts and the map audit (not part of the entry)
```

## Deterministic captures

`game/index.html?shot=start|play|end|buy&seed=N` renders a fixed scene
(start screen, mid-fight, round-won overlay, buy menu) and sets
`window.__shotReady` when done. The four screenshots were taken this way.

## Tests (see `research/`)

- `node research/validate_gate.mjs` — local replica of the six gate rows
  (game files, three.js bytes, references, screenshots, dossier byte-match,
  JS parses) plus a two-build determinism check. **All rows pass.**
- `node research/audit_map.mjs` — every waypoint edge, node and spawn
  checked for a clear bot-sized path. **All clear.**
- `node research/simtest-headless.mjs` — headless objective flow over 9
  seeds: plants, defuses and detonations all observed; deterministic
  (identical event log across runs).
- `node research/shoot.mjs` — headless Chromium screenshots + live smoke
  test (no console/page errors; movement works; match starts).
- `node research/simtest.mjs` — live browser soak: a full round plays out
  with bots routing, fighting and dying; buy menu works.

## License

MIT, © 2026 Nano Rasa. three.js is vendored under its own license
(`game/vendor/three/LICENSE`).
