// Player movement: acceleration, friction, gravity, crouch and jump,
// resolved as a box against the world's colliders one axis at a time, so a
// wall never swallows the player. This module owns position only; health,
// money and weapons live in main.js.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createPlayer(world) {
  const player = {
    position: new THREE.Vector3(0, 0, 14),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
  };
  const wish = { x: 0, z: 0 };

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys, speedScale = 1) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching
      && !world.overlaps(player.position.x, player.position.y, player.position.z, STAND_HEIGHT, RADIUS, 0.02)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.x = 0;
    wish.z = 0;
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      const lx = -sin * forward + cos * strafe;
      const lz = -cos * forward - sin * strafe;
      const len = Math.hypot(lx, lz) || 1;
      wish.x = lx / len;
      wish.z = lz / len;
    }

    const speed = (player.crouching ? CROUCH_SPEED : WALK_SPEED) * speedScale;
    const blend = Math.min(1, (player.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    player.velocity.x += (wish.x * speed - player.velocity.x) * blend;
    player.velocity.z += (wish.z * speed - player.velocity.z) * blend;
    if (player.onGround && !wish.x && !wish.z) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      player.velocity.x *= damp;
      player.velocity.z *= damp;
    }

    if (keys.has('Space') && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
    player.velocity.y -= GRAVITY * dt;

    const nextX = player.position.x + player.velocity.x * dt;
    if (!world.overlaps(nextX, player.position.y, player.position.z, player.height, RADIUS, 0.04)) {
      player.position.x = nextX;
    } else {
      player.velocity.x = 0;
    }
    const nextZ = player.position.z + player.velocity.z * dt;
    if (!world.overlaps(player.position.x, player.position.y, nextZ, player.height, RADIUS, 0.04)) {
      player.position.z = nextZ;
    } else {
      player.velocity.z = 0;
    }

    player.position.y += player.velocity.y * dt;
    player.onGround = false;
    const hit = world.overlaps(player.position.x, player.position.y, player.position.z, player.height, RADIUS, 0);
    if (hit && player.velocity.y <= 0) {
      player.position.y = hit.max.y;
      player.velocity.y = 0;
      player.onGround = true;
    } else if (hit) {
      player.position.y = hit.min.y - player.height;
      player.velocity.y = 0;
    }
    if (player.position.y < 0) {
      player.position.y = 0;
      player.velocity.y = 0;
      player.onGround = true;
    }
    player.velocity.y = Math.max(-30, player.velocity.y);
  }

  function reset(x, z, yaw) {
    player.position.set(x, 0, z);
    player.velocity.set(0, 0, 0);
    player.yaw = yaw;
    player.pitch = 0;
    player.eye = STAND_EYE;
    player.height = STAND_HEIGHT;
    player.crouching = false;
    player.onGround = true;
  }

  return {
    state: player,
    step,
    look,
    recoil,
    reset,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
  };
}
