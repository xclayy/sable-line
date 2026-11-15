// The arsenal: three hitscan weapons plus the numbers that make them
// different. One weapon is live at a time; the others keep their ammo.
// Spread grows with movement and with sustained fire (bloom), so stopping
// to aim pays. The module owns ammo and the view model; main.js owns the
// ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    key: 'pistol', name: 'P9 SIDEARM', price: 0, mag: 12, reserve: 36,
    gap: 0.18, reload: 1.2, damage: 26, headMul: 3, auto: false,
    spreadStill: 0.002, spreadMove: 0.02, kick: 0.006, length: 0.3,
  },
  smg: {
    key: 'smg', name: 'KESTREL-9', price: 1500, mag: 32, reserve: 96,
    gap: 0.075, reload: 1.7, damage: 22, headMul: 3, auto: true,
    spreadStill: 0.004, spreadMove: 0.03, kick: 0.004, length: 0.42,
  },
  rifle: {
    key: 'rifle', name: 'VK-47', price: 2700, mag: 30, reserve: 90,
    gap: 0.1, reload: 1.9, damage: 34, headMul: 3, auto: true,
    spreadStill: 0.0022, spreadMove: 0.028, kick: 0.009, length: 0.55,
  },
};
export const SLOTS = ['pistol', 'smg', 'rifle'];
const MOVE_REFERENCE = 5.2;
const BLOOM_PER_SHOT = 0.0035;
const BLOOM_MAX = 0.02;
const BLOOM_DECAY = 0.03;
const SWITCH_TIME = 0.4;
const MUZZLE_TIME = 0.06;

export function createWeapons(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.6, metalness: 0.3 });

  function buildModel(def) {
    const model = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, def.length), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, def.length * 0.7), grip);
    barrel.position.set(0, 0.025, -def.length * 0.75);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), grip);
    stock.position.set(0, -0.02, def.length * 0.5);
    model.add(receiver, barrel, stock);
    if (def.key !== 'pistol') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), dark);
      mag.position.set(0, -0.12, 0.02);
      mag.rotation.x = 0.25;
      model.add(mag);
    }
    if (def.key === 'rifle') {
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.12), dark);
      sight.position.set(0, 0.08, -0.05);
      model.add(sight);
    }
    model.position.set(0.28, -0.28, -0.8);
    model.rotation.y = 0.12;
    model.scale.setScalar(0.7);
    model.visible = false;
    camera.add(model);
    return model;
  }

  const models = {};
  for (const key of SLOTS) models[key] = buildModel(WEAPONS[key]);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.25, -0.22, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.26, -0.2, -0.75);
  camera.add(flashLight);

  const ammo = {};
  for (const key of SLOTS) ammo[key] = { mag: WEAPONS[key].mag, reserve: WEAPONS[key].reserve };
  const owned = new Set(['pistol']);
  let current = 'pistol';
  models.pistol.visible = true;
  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0, switchLeft: 0, bob: 0 };

  function def() {
    return WEAPONS[current];
  }

  function step(dt, moving) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - BLOOM_DECAY * dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.switchLeft = Math.max(0, state.switchLeft - dt);
    const model = models[current];
    state.bob += dt * (moving ? 11 : 2);
    model.position.z = -0.8 + state.kick;
    model.position.y = -0.28 + (moving ? Math.sin(state.bob) * 0.008 : 0);
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - ammo[current].mag;
        const take = Math.min(need, ammo[current].reserve);
        ammo[current].mag += take;
        ammo[current].reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    ammo,
    owned,
    current() {
      return current;
    },
    step,
    ready() {
      return ammo[current].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switchLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
      state.bloom = Math.min(BLOOM_MAX, state.bloom + BLOOM_PER_SHOT);
    },
    takeRound() {
      if (ammo[current].mag <= 0) return false;
      ammo[current].mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || ammo[current].mag === def().mag || ammo[current].reserve === 0) return;
      state.reloadLeft = def().reload;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * d.spreadMove + state.bloom;
    },
    switchTo(key) {
      if (!owned.has(key) || key === current || state.switchLeft > 0) return false;
      models[current].visible = false;
      current = key;
      models[current].visible = true;
      state.switchLeft = SWITCH_TIME;
      state.reloadLeft = 0;
      return true;
    },
    buy(key) {
      owned.add(key);
      ammo[key] = { mag: WEAPONS[key].mag, reserve: WEAPONS[key].reserve };
    },
    refillMag() {
      for (const key of owned) {
        const need = WEAPONS[key].mag - ammo[key].mag;
        const take = Math.min(need, ammo[key].reserve);
        ammo[key].mag += take;
        ammo[key].reserve -= take;
      }
      state.reloadLeft = 0;
    },
    refillReserve() {
      for (const key of owned) ammo[key].reserve = WEAPONS[key].reserve;
    },
    reset() {
      owned.clear();
      owned.add('pistol');
      for (const key of SLOTS) ammo[key] = { mag: WEAPONS[key].mag, reserve: WEAPONS[key].reserve };
      models[current].visible = false;
      current = 'pistol';
      models.pistol.visible = true;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
      state.switchLeft = 0;
    },
    // World position of the muzzle, for tracers.
    muzzle(out) {
      out.set(0.25, -0.24, -1.0);
      return camera.localToWorld(out);
    },
  };
}
