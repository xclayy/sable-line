// The SPARROW frag: thrown on an arc, bounces off the world, and
// detonates on a 2.5-second fuse. Damage falls with distance and is
// quartered through a wall. It hurts enemies and its thrower, never
// teammates. Four grenades fly at most; the oldest is reused.
import * as THREE from 'three';

const MAX_ACTIVE = 4;
const FUSE_SECONDS = 2.5;
const THROW_SPEED = 16;
const GRAVITY = 14;
const BLAST_RADIUS = 6;
const BLAST_MAX = 120;
const BLAST_MIN = 20;

export function createGrenades(scene, world, api) {
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2c323a'), roughness: 0.5, metalness: 0.6 });
  const items = [];
  for (let i = 0; i < MAX_ACTIVE; i += 1) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.castShadow = true;
    scene.add(mesh);
    items.push({ mesh, vel: new THREE.Vector3(), fuse: 0, active: false, thrower: null });
  }
  let next = 0;

  function throwGrenade(from, dir, thrower) {
    const item = items[next];
    next = (next + 1) % MAX_ACTIVE;
    item.mesh.position.copy(from);
    item.vel.copy(dir).multiplyScalar(THROW_SPEED);
    item.vel.y += 4;
    item.fuse = FUSE_SECONDS;
    item.active = true;
    item.thrower = thrower;
    item.mesh.visible = true;
    api.audio.grenadePin();
  }

  function explode(item) {
    item.active = false;
    item.mesh.visible = false;
    const pos = item.mesh.position;
    api.effects.explosion(pos);
    api.audio.explosion();
    api.emitNoise(pos, 40, null);
    for (const target of api.actors()) {
      if (!target.alive || target === item.thrower) continue;
      if (target.team === item.thrower.team) continue;
      const dist = target.pos.distanceTo(pos);
      if (dist > BLAST_RADIUS) continue;
      const los = api.losClear(pos, new THREE.Vector3(target.pos.x, target.pos.y + 1.2, target.pos.z));
      const fall = 1 - dist / BLAST_RADIUS;
      let damage = BLAST_MIN + (BLAST_MAX - BLAST_MIN) * fall;
      if (!los) damage *= 0.25;
      api.damage(target, Math.round(damage), 'blast', item.thrower);
    }
    // The thrower can hurt themself.
    const self = item.thrower;
    if (self.alive) {
      const dist = self.pos.distanceTo(pos);
      if (dist <= BLAST_RADIUS) {
        const fall = 1 - dist / BLAST_RADIUS;
        api.damage(self, Math.round(BLAST_MIN + (BLAST_MAX - BLAST_MIN) * fall * 0.5), 'blast', self);
      }
    }
  }

  function step(dt) {
    for (const item of items) {
      if (!item.active) continue;
      item.fuse -= dt;
      const p = item.mesh.position;
      const v = item.vel;
      v.y -= GRAVITY * dt;
      const nx = p.x + v.x * dt;
      if (!world.overlaps(nx, p.y, p.z, 0.2, 0.09, 0)) p.x = nx;
      else v.x *= -0.4;
      const nz = p.z + v.z * dt;
      if (!world.overlaps(p.x, p.y, nz, 0.2, 0.09, 0)) p.z = nz;
      else v.z *= -0.4;
      p.y += v.y * dt;
      if (p.y < 0.09) {
        p.y = 0.09;
        v.y = Math.abs(v.y) > 1 ? -v.y * 0.4 : 0;
        v.x *= 0.7;
        v.z *= 0.7;
      }
      if (item.fuse <= 0) explode(item);
    }
  }

  function reset() {
    for (const item of items) {
      item.active = false;
      item.mesh.visible = false;
    }
  }

  return { throwGrenade, step, reset };
}
