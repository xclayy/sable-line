// SABLE LINE — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. One central state object (G) holds the
// match: the player, the bots, the bomb, the money. Modules own their own
// pieces; this file wires them together and owns combat (the one hitscan
// path every shooter uses) and the round flow.
// ?shot=start|play|end|buy with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, SLOTS } from './weapon.js';
import { createBots } from './bots.js';
import { createRounds, FREEZE_SECONDS } from './rounds.js';
import { createEconomy, REWARDS } from './economy.js';
import { createGrenades } from './grenade.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seededRand = mulberry32(seed);
const rand = () => (shot ? seededRand() : Math.random());

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 20, 62);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const economy = createEconomy();
const player = createPlayer(world);
const weapons = createWeapons(camera);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;

// Central state: one place for the match.
const G = {
  phase: 'menu', // menu | freeze | live | end | over
  elapsed: 0,
  grenadesOwned: 0,
  bombPos: null,
  playerDead: false,
  buyOpen: false,
  started: false,
  frozen: false,
  matchStarted: false,
};

const playerCombatant = {
  id: 'YOU',
  name: 'YOU',
  team: 'A',
  pos: player.state.position,
  vel: player.state.velocity,
  health: 100,
  armor: 0,
  alive: true,
  isPlayer: true,
};

const noises = [];
function emitNoise(pos, radius, team) {
  noises.push({ pos: pos.clone(), radius, team, time: G.elapsed });
  if (noises.length > 12) noises.shift();
}

function actors() {
  return [playerCombatant, ...bots.bots];
}

function losClear(from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const dist = dir.length();
  if (dist < 0.01) return true;
  dir.divideScalar(dist);
  raycaster.set(from, dir);
  raycaster.far = dist;
  const hit = raycaster.intersectObjects(world.shootables, false)[0];
  return !hit || hit.distance >= dist - 0.3;
}

// Ray against the player's capsule (feet to head, radius 0.38). Returns
// the distance along the ray, or Infinity. Reuses module temps.
const segA = new THREE.Vector3();
const segB = new THREE.Vector3();
const segD = new THREE.Vector3();
const rayD = new THREE.Vector3();
const w0 = new THREE.Vector3();
function rayPlayerCapsule(origin, dir) {
  segA.set(playerCombatant.pos.x, playerCombatant.pos.y + 0.2, playerCombatant.pos.z);
  segB.set(playerCombatant.pos.x, playerCombatant.pos.y + 1.62, playerCombatant.pos.z);
  segD.subVectors(segB, segA);
  rayD.copy(dir);
  w0.subVectors(segA, origin);
  const a = 1;
  const b = rayD.dot(segD);
  const c = segD.lengthSq();
  const d = rayD.dot(w0);
  const e = segD.dot(w0);
  const denom = a * c - b * b;
  let sc = 0;
  let tc = 0;
  if (denom > 1e-8) {
    sc = (b * e - c * d) / denom;
    tc = (a * e - b * d) / denom;
  }
  if (sc < 0) sc = 0;
  if (tc < 0) tc = 0;
  if (tc > 1) tc = 1;
  const px = origin.x + rayD.x * sc - (segA.x + segD.x * tc);
  const py = origin.y + rayD.y * sc - (segA.y + segD.y * tc);
  const pz = origin.z + rayD.z * sc - (segA.z + segD.z * tc);
  if (px * px + py * py + pz * pz > 0.38 * 0.38) return Infinity;
  return sc;
}

const hitPoint = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();
const traceEnd = new THREE.Vector3();

// The one hitscan path: every shooter (player or bot) fires through here.
// Returns the hit combatant and part, or null.
function fireHitscan(shooter, origin, dir, damage, headMul) {
  const botMeshes = [];
  for (const bot of bots.bots) if (bot.alive) botMeshes.push(...bot.hitMeshes);
  raycaster.set(origin, dir);
  raycaster.far = 90;
  const hits = raycaster.intersectObjects(world.shootables.concat(botMeshes), false);
  const worldDist = hits.length > 0 ? hits[0].distance : Infinity;
  let playerDist = Infinity;
  if (shooter !== playerCombatant && playerCombatant.alive) {
    playerDist = rayPlayerCapsule(origin, dir);
  }
  if (playerDist < worldDist && playerDist < 90) {
    hitPoint.copy(origin).addScaledVector(dir, playerDist);
    const part = hitPoint.y > playerCombatant.pos.y + 1.4 ? 'head' : 'torso';
    applyDamage(playerCombatant, part === 'head' ? damage * headMul : damage, part, shooter);
    return { combatant: playerCombatant, part, point: hitPoint.clone() };
  }
  if (hits.length > 0) {
    const hit = hits[0];
    hitPoint.copy(hit.point);
    if (hit.object.userData.combatant) {
      const victim = hit.object.userData.combatant;
      const part = hit.object.userData.part ?? 'torso';
      applyDamage(victim, part === 'head' ? damage * headMul : damage, part, shooter);
      return { combatant: victim, part, point: hitPoint.clone() };
    }
    effects.impact(hit.point, hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0));
    return { combatant: null, part: null, point: hitPoint.clone() };
  }
  return null;
}

function applyDamage(target, amount, part, attacker) {
  if (!target.alive) return;
  let remaining = amount;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, remaining * 0.5);
    target.armor -= absorbed;
    remaining -= absorbed;
  }
  target.health -= remaining;
  if (target.health > 0 && !target.isPlayer) bots.onDamaged(target);
  if (target.isPlayer) {
    hud.damageFlash();
    audio.hurt();
    hud.setHealth(target.health, target.armor);
  }
  if (target.health > 0) return;
  target.health = 0;
  target.alive = false;
  const headshot = part === 'head';
  hud.killfeed(attacker.name, target.name, headshot);
  if (attacker === playerCombatant && !target.isPlayer) {
    economy.add(REWARDS.kill);
    audio.kill();
    hud.setMoney(economy.money);
  }
  if (target.isPlayer) {
    G.playerDead = true;
    hud.banner('YOU ARE DOWN', 'Your team fights on', 3000);
    if (document.pointerLockElement) document.exitPointerLock();
  }
  checkTeamWipe();
}

function checkTeamWipe() {
  if (rounds.state.phase !== 'live') return;
  const aliveA = bots.aliveCount('A') + (playerCombatant.alive ? 1 : 0);
  const aliveB = bots.aliveCount('B');
  if (rounds.state.bomb.planted) {
    if (aliveB === 0) rounds.endRound('A', 'DEFENDERS ELIMINATED');
    return;
  }
  if (aliveA === 0) rounds.endRound('B', 'ATTACKERS ELIMINATED');
  else if (aliveB === 0) rounds.endRound('A', 'DEFENDERS ELIMINATED');
}

const api = {
  rand,
  losClear,
  fireHitscan,
  damage: applyDamage,
  emitNoise,
  actors,
  audio,
  effects,
  takeNoise(bot) {
    let best = null;
    for (let i = noises.length - 1; i >= 0; i -= 1) {
      const n = noises[i];
      if (G.elapsed - n.time > 6) continue;
      if (n.team === bot.team) continue;
      if (bot.pos.distanceTo(n.pos) > n.radius) continue;
      best = n.pos;
      break;
    }
    return best;
  },
  onPlantComplete(bot) {
    rounds.forcePlant(rounds.state.attackSite, bot);
  },
  onDefuseComplete(bot) {
    rounds.forceDefuse(bot);
  },
};

const bots = createBots(scene, world, api);
const grenades = createGrenades(scene, world, api);

const rounds = createRounds({
  onPhase(phase, state) {
    if (phase === 'freeze') {
      G.phase = 'freeze';
      spawnRound();
      hud.setSite(state.attackSite);
      hud.setScore(state.scoreA, state.scoreB, state.round);
      hud.banner(`ROUND ${state.round} — BUY PHASE`, `Plant at Site ${state.attackSite} · ${FREEZE_SECONDS}s`, 3000);
    } else if (phase === 'live') {
      G.phase = 'live';
      hud.banner('GO', `Plant the charge at Site ${state.attackSite}`, 2200);
    }
  },
  onRoundEnd(winner, reason, state) {
    G.phase = 'end';
    rounds.state.bomb.planted = false;
    hud.bombStatus(null, 0);
    if (winner === 'A') {
      economy.add(REWARDS.win);
      audio.roundWin();
      hud.banner('ROUND WON', reason, 3200);
    } else {
      economy.add(REWARDS.loss);
      audio.roundLose();
      hud.banner('ROUND LOST', reason, 3200);
    }
    hud.setMoney(economy.money);
    hud.setScore(state.scoreA, state.scoreB, state.round);
    if (state.matchOver) {
      // The match overlay comes from onMatchEnd once the end timer lapses.
    }
  },
  onBombPlanted(site, who) {
    rounds.state.bomb.pos = who.pos.clone();
    G.bombPos = rounds.state.bomb.pos;
    hud.banner('CHARGE PLANTED', `Site ${site} — defend it until it blows`, 3000);
    audio.plantBeep();
    if (who === playerCombatant) {
      economy.add(REWARDS.plant);
      hud.setMoney(economy.money);
    }
  },
  onBombDetonated(site) {
    if (G.bombPos) {
      effects.explosion(G.bombPos);
      audio.explosion();
    }
    hud.banner('SITE DETONATED', `Site ${site} is gone`, 3000);
  },
  onBombDefused(who) {
    hud.banner('CHARGE DEFUSED', `${who.name} cut the wires`, 3000);
    audio.defuseBeep();
  },
  onMatchEnd(winner, state) {
    G.phase = 'over';
    if (document.pointerLockElement) document.exitPointerLock();
    const won = winner === 'A';
    hud.showOverlay('match', {
      title: won ? 'VICTORY' : 'DEFEAT',
      copy: won
        ? `Sable Line is yours. Final score ${state.scoreA} — ${state.scoreB}.`
        : `The depot holds. Final score ${state.scoreA} — ${state.scoreB}.`,
    });
    if (won) audio.roundWin();
    else audio.roundLose();
  },
});

function spawnRound() {
  const site = rounds.state.attackSite;
  const spawns = world.spawns.attack;
  const spawn = spawns[Math.floor(rand() * spawns.length)];
  player.reset(spawn.x, spawn.z, 0);
  playerCombatant.health = 100;
  playerCombatant.alive = true;
  G.playerDead = false;
  weapons.refillMag();
  grenades.reset();
  bots.spawnRound(site);
  hud.setHealth(100, playerCombatant.armor);
  hud.setAlive(4, 4);
  hud.setAmmo(weapons.ammo[weapons.current()].mag, weapons.ammo[weapons.current()].reserve, weapons.def().name);
}

function startMatch() {
  economy.reset();
  weapons.reset();
  playerCombatant.armor = 0;
  G.grenadesOwned = 0;
  G.matchStarted = true;
  hud.setMoney(economy.money);
  rounds.startMatch();
}

function buyItem(id) {
  if (rounds.state.phase !== 'freeze' || G.phase !== 'freeze') return;
  const item = { smg: 1500, rifle: 2700, grenade: 300, armor: 650, ammo: 200 }[id];
  if (item === undefined) return;
  if ((id === 'smg' || id === 'rifle') && weapons.owned.has(id)) {
    audio.denied();
    return;
  }
  if (id === 'grenade' && G.grenadesOwned >= 2) {
    audio.denied();
    return;
  }
  if (id === 'armor' && playerCombatant.armor >= 100) {
    audio.denied();
    return;
  }
  if (!economy.spend(item)) {
    audio.denied();
    return;
  }
  audio.buy();
  if (id === 'smg' || id === 'rifle') {
    weapons.buy(id);
    weapons.switchTo(id);
  } else if (id === 'grenade') {
    G.grenadesOwned += 1;
  } else if (id === 'armor') {
    playerCombatant.armor = 100;
  } else if (id === 'ammo') {
    weapons.refillReserve();
  }
  hud.setMoney(economy.money);
  hud.updateBuy(economy.money);
  hud.setHealth(playerCombatant.health, playerCombatant.armor);
  hud.setAmmo(weapons.ammo[weapons.current()].mag, weapons.ammo[weapons.current()].reserve, weapons.def().name);
}

function toggleBuy() {
  if (rounds.state.phase !== 'freeze') return;
  if (G.buyOpen) {
    hud.closeBuy();
    G.buyOpen = false;
    input.requestLock();
  } else {
    hud.openBuy(economy.money, buyItem);
    G.buyOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function shootPlayer() {
  if (!weapons.takeRound()) {
    audio.dryFire();
    weapons.reload();
    return;
  }
  const spread = weapons.spread(player.groundSpeed());
  camera.getWorldDirection(traceEnd);
  traceEnd.x += (rand() * 2 - 1) * spread;
  traceEnd.y += (rand() * 2 - 1) * spread;
  traceEnd.z += (rand() * 2 - 1) * spread;
  traceEnd.normalize();
  const muzzle = weapons.muzzle(muzzlePos);
  const hit = fireHitscan(playerCombatant, camera.position, traceEnd, weapons.def().damage, weapons.def().headMul);
  const end = hit ? hit.point : traceEnd.clone().multiplyScalar(60).add(camera.position);
  effects.tracer(muzzle, end);
  audio.shot(true);
  emitNoise(playerCombatant.pos, 25, 'A');
  if (hit && hit.combatant) hud.hitMarker(hit.part === 'head', 4000);
  weapons.pullTrigger();
  player.recoil(weapons.def().kick + rand() * 0.004, (rand() * 2 - 1) * 0.004);
  hud.setAmmo(weapons.ammo[weapons.current()].mag, weapons.ammo[weapons.current()].reserve, weapons.def().name);
}

const body = player.state;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function step(dt) {
  elapsed += dt;
  G.elapsed = elapsed;
  if (G.phase === 'live' || G.phase === 'freeze') {
    player.step(dt, input.state.keys, weapons.current() === 'pistol' ? 1 : 0.96);
  }
  weapons.step(dt, player.groundSpeed() > 0.5);
  if (G.phase === 'live') bots.step(dt, rounds.state.bomb);
  grenades.step(dt);
  effects.step(dt);
  rounds.step(dt);

  // Planting: hold E inside the round's site while the bomb is unplanted.
  if (G.phase === 'live' && playerCombatant.alive && !rounds.state.bomb.planted) {
    const site = world.sites[rounds.state.attackSite];
    const inZone = playerCombatant.pos.distanceTo(site.center) < site.radius;
    const holding = input.state.keys.has('KeyE');
    const moving = input.state.keys.has('KeyW') || input.state.keys.has('KeyA')
      || input.state.keys.has('KeyS') || input.state.keys.has('KeyD');
    if (inZone && holding && !moving) {
      if (rounds.state.channel.kind !== 'plant') {
        rounds.startChannel('plant', playerCombatant, 3);
        audio.plantBeep();
      }
    } else if (rounds.state.channel.kind === 'plant' && rounds.state.channel.who === playerCombatant) {
      rounds.cancelChannel();
    }
  }

  // HUD: cheap, every fixed step.
  hud.setHealth(playerCombatant.health, playerCombatant.armor);
  hud.setTimer(rounds.state.timer, rounds.state.phase);
  hud.setAlive(bots.aliveCount('A') + (playerCombatant.alive ? 1 : 0), bots.aliveCount('B'));
  if (rounds.state.bomb.planted) {
    hud.bombStatus(`CHARGE PLANTED — ${Math.ceil(rounds.state.bomb.timeLeft)}s`, rounds.state.bomb.timeLeft / 35);
  } else if (rounds.state.channel.kind === 'plant') {
    hud.bombStatus('PLANTING…', rounds.state.channel.progress / rounds.state.channel.needed);
  } else if (rounds.state.channel.kind === 'defuse') {
    hud.bombStatus('DEFUSING…', rounds.state.channel.progress / rounds.state.channel.needed);
  } else {
    hud.bombStatus(null, 0);
  }
  hud.setCrosshairGap(4 + weapons.spread(player.groundSpeed()) * 900);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!G.frozen) {
    const look = input.takeLook();
    if (playerCombatant.alive && (G.phase === 'live' || G.phase === 'freeze')) player.look(look.x, look.y);
    const pressed = input.takePressed();
    for (const code of pressed) {
      // Buy-menu digits win over weapon slots while the menu is open.
      if (G.buyOpen && code.startsWith('Digit')) {
        const ids = ['smg', 'rifle', 'grenade', 'armor', 'ammo'];
        buyItem(ids[Number(code.slice(-1)) - 1]);
      } else if (code === 'KeyR') {
        weapons.reload();
        audio.reload();
      } else if (code === 'Digit1') weapons.switchTo('pistol');
      else if (code === 'Digit2') weapons.switchTo('smg');
      else if (code === 'Digit3') weapons.switchTo('rifle');
      else if (code === 'KeyB') toggleBuy();
      else if (code === 'KeyG' && G.phase === 'live' && playerCombatant.alive && G.grenadesOwned > 0) {
        G.grenadesOwned -= 1;
        camera.getWorldDirection(traceEnd);
        grenades.throwGrenade(camera.position, traceEnd, playerCombatant);
      }
    }
    if (G.phase === 'live' && playerCombatant.alive) {
      const def = weapons.def();
      const edge = input.state.firing && !prevFiring;
      if ((def.auto && input.state.firing) || (!def.auto && edge)) {
        if (weapons.ready()) shootPlayer();
        else if (weapons.ammo[weapons.current()].mag === 0 && edge) {
          audio.dryFire();
          weapons.reload();
        }
      }
    }
    prevFiring = input.state.firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

const input = createInput(renderer.domElement, onLockChange);

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    audio.unlock();
    G.started = true;
    hud.hideOverlay();
    if (G.buyOpen) {
      hud.closeBuy();
      G.buyOpen = false;
    }
  } else if (G.phase === 'over') {
    // Match overlay stays.
  } else if (G.buyOpen) {
    // Buying: the overlay stays hidden while the menu is open.
  } else if (G.matchStarted) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (G.phase === 'over') {
    startMatch();
  } else if (!G.matchStarted) {
    startMatch();
  }
  input.requestLock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.closeBuy();
  G.buyOpen = false;
  startMatch();
  if (name === 'start') {
    body.position.set(0.6, 0, 14);
    body.yaw = 0;
    body.pitch = -0.02;
    settle(20);
    syncCamera();
    hud.showOverlay('start');
  } else if (name === 'play') {
    rounds.state.phase = 'live';
    rounds.state.timer = 83;
    G.phase = 'live';
    body.position.set(0, 0, 6);
    settle(10);
    const bot = bots.bots.find((b) => b.team === 'B' && b.alive);
    if (bot) {
      bot.pos.set(0.4, 0, -2.5);
      bot.yaw = Math.PI;
      bot.body.group.position.copy(bot.pos);
      bot.body.group.rotation.y = bot.yaw;
      aimAt(new THREE.Vector3(bot.pos.x, 1.3, bot.pos.z));
      if (weapons.ready()) shootPlayer();
      settle(6);
    }
    hud.setScore(0, 0, 1);
  } else if (name === 'end') {
    rounds.state.scoreA = 1;
    rounds.state.round = 1;
    rounds.state.phase = 'live';
    rounds.state.timer = 0;
    G.phase = 'end';
    body.position.set(-13, 0, -7);
    body.yaw = 0.6;
    settle(10);
    hud.showOverlay('round', { title: 'ROUND WON', copy: 'Site A detonated. You lead 1 — 0.' });
  } else if (name === 'buy') {
    body.position.set(0, 0, 14);
    body.yaw = 0;
    settle(10);
    hud.openBuy(1250, () => {});
    G.buyOpen = true;
  }
  hud.setHealth(playerCombatant.health, playerCombatant.armor);
  hud.setAmmo(weapons.ammo[weapons.current()].mag, weapons.ammo[weapons.current()].reserve, weapons.def().name);
  hud.setMoney(economy.money);
  hud.setTimer(rounds.state.timer, rounds.state.phase);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      G.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

syncCamera();
// Debug handle for automated smoke tests (read-only state snapshot).
window.__game = { G, player: playerCombatant, rounds: rounds.state, bots: bots.bots, economy, camera };
if (shot) runShot(shot);
else requestAnimationFrame(frame);
