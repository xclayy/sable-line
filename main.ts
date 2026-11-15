// SABLE LINE — a three.js tactical FPS entry for make.fun (threejs-fps-02).
//
// This program hands the game in. The game itself is plain static files in
// game/ (three.js 0.187.0 vendored under game/vendor/three, loaded through an
// import map, no build step, no network at runtime). This file copies game/
// and screenshots/ from beside itself into /output and writes
// /output/dossier.json with the kit's vendored library, which is the summary
// the judge reads. Run it outside the grader with MAKEFUN_OUTPUT_DIR:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Node 22, standard library only; nothing is installed before it runs.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The gate's caps, from the kit's reference/gate.json: the dossier text cap
// shapes the bytes; the others refuse an entry the scorer would refuse
// (more than 4 screenshots or one over 256 KiB; more than 993 files in
// game/ or 48 MiB of game files in all).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
