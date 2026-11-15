// The bots: seven agents, three on the player's team and four against.
// Each bot routes on the waypoint graph, holds positions, reacts to what it
// sees (line of sight, field of view, range) and what it hears (gunshots),
// and fires in bursts with the same hitscan path the player uses. The
// attackers push a site and plant; the defenders hold and defuse.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { findRoute, nearestNode } from './world.js';

const BOT_SPEED = 4.2;
const BOT_STRAFE = 2.6;
const THINK_EVERY = 0.15;
const SIGHT_RANGE = 42;
const ENGAGE_RANGE = 24; // Bots hold their objective against far targets;
// only a close sighting (or being shot) makes them stop and fight.
const SIGHT_HALF_FOV = 0.8; // cos(37 deg): a 74-degree vision cone. (The kit
// comment said 55 deg, but its 0.96 was a 16-degree tunnel; 55 deg let
// holders shred every push, so the cone is tuned to 37 deg.)
const HEAR_RANGE = 25;
const REACT_MIN = 0.25;
const REACT_MAX = 0.55;
const BURST_MIN = 3;
const BURST_MAX = 5;
const BURST_GAP = 0.12;
const BURST_PAUSE_MIN = 0.6;
const BURST_PAUSE_MAX = 1.1;
const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 4;
const BOT_DAMAGE = 34;
const BOT_HEAD_MUL = 3;

const NAMES_A = ['VEX', 'IRIS', 'DUNE'];
const NAMES_B = ['ROOK', 'HAVOC', 'MOSS', 'PIKE'];

function makeBody(scene, team) {
  const trim = team === 'A' ? PALETTE.teamA : PALETTE.teamB;
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const vest = new THREE.MeshStandardMaterial({ color: new THREE.Color(trim), roughness: 0.6, metalness: 0.1 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });
  const group = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.26), cloth);
  legs.position.y = 0.4;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.3), vest);
  torso.position.y = 1.16;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.y = 1.66;
  head.userData.part = 'head';
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.05), new THREE.MeshStandardMaterial({ color: new THREE.Color(trim), emissive: new THREE.Color(trim), emissiveIntensity: 1.2 }));
  visor.position.set(0, 1.68, -0.14);
  group.add(legs, torso, head, visor);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  scene.add(group);
  return { group, torso, head, legs };
}

export function createBots(scene, world, api) {
  const bots = [];
  const tmpDir = new THREE.Vector3();
  const tmpTo = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();

  function spawnBot(team, name, index, spawn) {
    const body = makeBody(scene, team);
    const bot = {
      id: `${team}${index}`,
      name,
      team,
      body,
      hitMeshes: [body.torso, body.head],
      pos: spawn.clone(),
      yaw: team === 'A' ? 0 : Math.PI,
      vel: new THREE.Vector3(),
      health: 100,
      armor: 0,
      alive: true,
      hurtTimer: 0,
      px: spawn.x,
      pz: spawn.z,
      stuckX: spawn.x,
      stuckZ: spawn.z,
      stuckTimer: 0,
      state: 'route',
      route: [],
      routeIndex: 0,
      target: null,
      lastSeen: null,
      lostTimer: 0,
      thinkTimer: Math.random() * THINK_EVERY,
      reactTimer: 0,
      burstLeft: 0,
      burstTimer: 0,
      burstPause: 0,
      strafeDir: 1,
      strafeTimer: 0,
      scanPhase: Math.random() * 6.28,
      holdTimer: 0,
      channel: 0,
      channelKind: null,
      assignedSite: null,
      holdNode: null,
      investigatePos: null,
      fall: 0,
    };
    body.torso.userData.combatant = bot;
    body.head.userData.combatant = bot;
    body.legs.userData.combatant = bot;
    body.legs.userData.part = 'legs';
    bot.hitMeshes.push(body.legs);
    bots.push(bot);
    return bot;
  }

  function eyePos(bot, out) {
    return out.set(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
  }

  function faceToward(bot, x, z, dt, rate = 6) {
    const want = Math.atan2(-(x - bot.pos.x), -(z - bot.pos.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  function moveToward(bot, x, z, dt, speed) {
    tmpDir.set(x - bot.pos.x, 0, z - bot.pos.z);
    const dist = tmpDir.length();
    if (dist < 0.05) return true;
    tmpDir.divideScalar(dist);
    const step = Math.min(dist, speed * dt);
    const nx = bot.pos.x + tmpDir.x * step;
    if (!world.overlaps(nx, bot.pos.y, bot.pos.z, 1.72, 0.34, 0.04)) bot.pos.x = nx;
    const nz = bot.pos.z + tmpDir.z * step;
    if (!world.overlaps(bot.pos.x, bot.pos.y, nz, 1.72, 0.34, 0.04)) bot.pos.z = nz;
    faceToward(bot, x, z, dt, 8);
    return dist <= 0.7;
  }

  function nearestWaypoint(bot) {
    return nearestNode(world.waypoints, bot.pos.x, bot.pos.z);
  }

  function setRoute(bot, toId) {
    const from = nearestWaypoint(bot);
    const route = findRoute(world.waypoints, from.id, toId);
    bot.route = route ?? [];
    bot.routeIndex = 0;
    bot.state = 'route';
  }

  // Route through a lane entry first, so the team does not funnel down the
  // same shortest (mid) lane every round: west, mid, or the long east flank.
  function setRouteVia(bot, viaId, toId) {
    const from = nearestWaypoint(bot);
    const first = findRoute(world.waypoints, from.id, viaId) ?? [];
    const second = findRoute(world.waypoints, viaId, toId) ?? [];
    bot.route = [...first, ...second];
    bot.routeIndex = 0;
    bot.state = 'route';
  }

  function pickObjective(bot, bomb) {
    if (bot.team === 'A') {
      if (bomb.planted) {
        // Attackers defend the planted charge: hold near its site.
        setRoute(bot, bomb.site === 'A' ? 'hA1' : 'hB1');
        bot.holdNode = bomb.site === 'A' ? 'hA1' : 'hB1';
      } else if (bot.channelKind === 'plant') {
        // already planting
      } else {
        const site = bot.assignedSite;
        const node = site === 'A' ? 'a5' : 'b5';
        const lanes = site === 'A' ? ['a1', 'a1', 'm0', 'b1'] : ['b1', 'b1', 'm0', 'a1'];
        setRouteVia(bot, lanes[Math.floor(api.rand() * lanes.length)], node);
      }
    } else if (bomb.planted) {
      const node = bomb.site === 'A' ? 'a5' : 'b5';
      setRoute(bot, node);
    } else {
      const holds = world.holds[bot.assignedSite] ?? world.holds.mid;
      const pick = holds[Math.floor(api.rand() * holds.length)];
      setRoute(bot, pick);
      bot.holdNode = pick;
    }
  }

  function visibleEnemy(bot, maxDist) {
    const eye = eyePos(bot, tmpEye);
    const fx = -Math.sin(bot.yaw);
    const fz = -Math.cos(bot.yaw);
    let best = null;
    let bestD = Infinity;
    for (const enemy of api.actors()) {
      if (!enemy.alive || enemy.team === bot.team) continue;
      tmpTo.set(enemy.pos.x - eye.x, enemy.pos.y + 1.5 - eye.y, enemy.pos.z - eye.z);
      const dist = tmpTo.length();
      if (dist > maxDist || dist < 0.5) continue;
      tmpTo.divideScalar(dist);
      if (tmpTo.x * fx + tmpTo.z * fz < SIGHT_HALF_FOV) continue;
      tmpTarget.set(enemy.pos.x, enemy.pos.y + 1.2, enemy.pos.z);
      if (!api.losClear(eye, tmpTarget)) continue;
      if (dist < bestD) {
        bestD = dist;
        best = { enemy, dist };
      }
    }
    return best;
  }

  function startBurst(bot) {
    bot.burstLeft = BURST_MIN + Math.floor(api.rand() * (BURST_MAX - BURST_MIN + 1));
    bot.burstTimer = 0;
  }

  function fireAt(bot, target, dt) {
    if (bot.burstLeft <= 0) {
      bot.burstPause -= dt;
      if (bot.burstPause <= 0) startBurst(bot);
      return;
    }
    bot.burstTimer -= dt;
    if (bot.burstTimer > 0) return;
    bot.burstTimer = BURST_GAP;
    bot.burstLeft -= 1;
    if (bot.burstLeft <= 0) bot.burstPause = BURST_PAUSE_MIN + api.rand() * (BURST_PAUSE_MAX - BURST_PAUSE_MIN);

    const eye = eyePos(bot, tmpEye);
    tmpTarget.set(target.pos.x, target.pos.y + 1.25, target.pos.z);
    const dist = eye.distanceTo(tmpTarget);
    const moving = Math.hypot(target.vel?.x ?? 0, target.vel?.z ?? 0) > 1;
    const err = 0.028 + 0.05 * (dist / SIGHT_RANGE) + (moving ? 0.02 : 0);
    tmpDir.copy(tmpTarget).sub(eye).normalize();
    tmpDir.x += (api.rand() * 2 - 1) * err;
    tmpDir.y += (api.rand() * 2 - 1) * err;
    tmpDir.z += (api.rand() * 2 - 1) * err;
    tmpDir.normalize();
    api.fireHitscan(bot, eye, tmpDir, BOT_DAMAGE, BOT_HEAD_MUL);
  }

  function think(bot, bomb) {
    // Hearing: a recent noise pulls a bot off its route.
    const noise = api.takeNoise(bot);
    if (noise && bot.state !== 'engage' && bot.state !== 'plant' && bot.state !== 'defuse') {
      bot.investigatePos = noise;
      bot.state = 'investigate';
      bot.route = [];
    }
    const seen = visibleEnemy(bot, bot.hurtTimer > 0 ? SIGHT_RANGE : ENGAGE_RANGE);
    if (seen) {
      if (bot.state !== 'engage') {
        // Abandoning a plant or defuse to fight voids the channel.
        bot.channelKind = null;
        bot.channel = 0;
        bot.state = 'engage';
        bot.reactTimer = REACT_MIN + api.rand() * (REACT_MAX - REACT_MIN);
        bot.burstLeft = 0;
        bot.burstPause = 0;
      }
      bot.target = seen.enemy;
      bot.lastSeen = new THREE.Vector3(seen.enemy.pos.x, 0, seen.enemy.pos.z);
      bot.lostTimer = 0;
      return;
    }
    if (bot.state === 'engage') {
      bot.lostTimer += THINK_EVERY;
      if (bot.lostTimer > 2.5) {
        bot.target = null;
        bot.state = 'investigate';
        bot.investigatePos = bot.lastSeen;
        bot.route = [];
      }
      return;
    }
    // Objective channels. Runs for bots on foot (route or hold): a bot that
    // finished its route and is holding at the site must still plant, and a
    // defender holding at the charge must still defuse. (Previously this sat
    // below the hold early-return, so it never ran once a bot arrived.)
    if (bot.state === 'route' || bot.state === 'hold') {
      // Attackers at their site with no enemy around start the plant.
      if (bot.team === 'A' && !bomb.planted && bot.channelKind !== 'plant') {
        const site = world.sites[bot.assignedSite];
        if (bot.pos.distanceTo(site.center) < site.radius * 0.7) {
          bot.state = 'plant';
          bot.channel = 0;
          bot.channelKind = 'plant';
          return;
        }
      }
      if (bot.team === 'B' && bomb.planted && bot.channelKind !== 'defuse') {
        const dist = bot.pos.distanceTo(bomb.pos);
        if (dist < 2.2) {
          bot.state = 'defuse';
          bot.channel = 0;
          bot.channelKind = 'defuse';
        }
      }
    }
    if (bot.state === 'investigate' || bot.state === 'hold') return;
    if (bot.state === 'plant' || bot.state === 'defuse') return;
  }

  function stepBot(bot, dt, bomb) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.body.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    // Velocity from the last tick's displacement: fireAt's "moving target"
    // penalty keys off this, so a bot on the move is genuinely harder to hit.
    bot.vel.set((bot.pos.x - bot.px) / dt, 0, (bot.pos.z - bot.pz) / dt);
    bot.px = bot.pos.x;
    bot.pz = bot.pos.z;
    if (bot.hurtTimer > 0) bot.hurtTimer -= dt;
    // Stuck watch: a bot pushing against a collider (or a node it cannot
    // reach) makes no progress. After 1.5 s, skip the unreachable route node
    // or abandon the investigation — never stand still for a whole round.
    if (bot.state === 'route' || bot.state === 'investigate') {
      const moved = Math.hypot(bot.pos.x - bot.stuckX, bot.pos.z - bot.stuckZ);
      if (moved > 0.5) {
        bot.stuckX = bot.pos.x;
        bot.stuckZ = bot.pos.z;
        bot.stuckTimer = 0;
      } else {
        bot.stuckTimer += dt;
        if (bot.stuckTimer > 1.5) {
          bot.stuckTimer = 0;
          bot.stuckX = bot.pos.x;
          bot.stuckZ = bot.pos.z;
          if (bot.state === 'route') {
            bot.routeIndex += 1;
            if (bot.routeIndex >= bot.route.length) {
              bot.state = 'hold';
              bot.holdTimer = 0;
            }
          } else {
            bot.state = 'hold';
            bot.holdTimer = 0;
            bot.investigatePos = null;
          }
        }
      }
    }
    bot.thinkTimer -= dt;
    if (bot.thinkTimer <= 0) {
      bot.thinkTimer = THINK_EVERY;
      think(bot, bomb);
    }

    if (bot.state === 'engage' && bot.target) {
      const target = bot.target;
      if (!target.alive) {
        bot.target = null;
        bot.state = 'investigate';
        bot.investigatePos = bot.lastSeen;
        bot.route = [];
      } else {
        faceToward(bot, target.pos.x, target.pos.z, dt, 10);
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeDir = api.rand() < 0.5 ? -1 : 1;
          bot.strafeTimer = 0.8 + api.rand() * 0.7;
        }
        const sx = Math.cos(bot.yaw) * bot.strafeDir;
        const sz = -Math.sin(bot.yaw) * bot.strafeDir;
        const nx = bot.pos.x + sx * BOT_STRAFE * dt;
        if (!world.overlaps(nx, bot.pos.y, bot.pos.z, 1.72, 0.34, 0.04)) bot.pos.x = nx;
        const nz = bot.pos.z + sz * BOT_STRAFE * dt;
        if (!world.overlaps(bot.pos.x, bot.pos.y, nz, 1.72, 0.34, 0.04)) bot.pos.z = nz;
        if (bot.reactTimer > 0) {
          bot.reactTimer -= dt;
        } else {
          fireAt(bot, target, dt);
        }
      }
    } else if (bot.state === 'route') {
      if (bot.routeIndex < bot.route.length) {
        const node = world.waypoints.nodes.get(bot.route[bot.routeIndex]);
        if (moveToward(bot, node.x, node.z, dt, BOT_SPEED)) bot.routeIndex += 1;
      } else if (bot.team === 'B') {
        bot.state = 'hold';
        bot.holdTimer = 0;
      } else if (bot.team === 'A') {
        // Reached the site node: the plant check in think() takes over;
        // until then, hold and scan.
        bot.state = 'hold';
        bot.holdTimer = 0;
      }
    } else if (bot.state === 'investigate' && bot.investigatePos) {
      if (moveToward(bot, bot.investigatePos.x, bot.investigatePos.z, dt, BOT_SPEED)) {
        bot.state = 'hold';
        bot.holdTimer = 0;
        bot.investigatePos = null;
      }
    } else if (bot.state === 'hold') {
      bot.holdTimer += dt;
      bot.scanPhase += dt * 0.7;
      bot.yaw += Math.sin(bot.scanPhase) * 0.35 * dt;
      // A bot holding away from its objective for a while re-picks it: an
      // attacker that lost its target mid-map must head for the site again
      // (otherwise it would stand there until the timer ran out), and a
      // defender rotates its hold. At the site itself the plant/defuse check
      // in think() fires first, so this never pulls a bot off a channel.
      if (bot.holdTimer > 6) pickObjective(bot, bomb);
    } else if (bot.state === 'plant') {
      bot.channel += dt;
      if (bot.channel >= PLANT_SECONDS) {
        bot.channelKind = null;
        api.onPlantComplete(bot);
      }
    } else if (bot.state === 'defuse') {
      bot.channel += dt;
      if (bot.channel >= DEFUSE_SECONDS) {
        bot.channelKind = null;
        api.onDefuseComplete(bot);
      }
    }

    bot.body.group.position.copy(bot.pos);
    bot.body.group.rotation.y = bot.yaw;
  }

  function spawnRound(attackSite) {
    // Clear old bodies.
    for (const bot of bots) scene.remove(bot.body.group);
    bots.length = 0;
    const aSpawns = world.spawns.attack;
    const dSpawns = world.spawns.defend;
    NAMES_A.forEach((name, i) => {
      const bot = spawnBot('A', name, i, aSpawns[i % aSpawns.length]);
      bot.assignedSite = attackSite;
      bot.yaw = 0;
    });
    NAMES_B.forEach((name, i) => {
      const bot = spawnBot('B', name, i, dSpawns[i % dSpawns.length]);
      bot.assignedSite = i < 2 ? attackSite : attackSite === 'A' ? 'B' : 'A';
      bot.yaw = Math.PI;
    });
    for (const bot of bots) pickObjective(bot, { planted: false, site: null });
  }

  function reset() {
    for (const bot of bots) scene.remove(bot.body.group);
    bots.length = 0;
  }

  return {
    bots,
    spawnRound,
    reset,
    // A bot that takes a hit turns on its attacker for a few seconds,
    // even at long range. Called by main.js from applyDamage.
    onDamaged(bot) {
      if (bot.alive) bot.hurtTimer = 2.5;
    },
    aliveCount(team) {
      return bots.filter((bot) => bot.alive && bot.team === team).length;
    },
    step(dt, bomb) {
      for (const bot of bots) stepBot(bot, dt, bomb);
    },
  };
}
