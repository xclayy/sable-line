// Combat feedback, pooled: tracers, impact puffs and the explosion
// flash. Nothing is allocated per shot — every visual is a reused object
// from a fixed pool, so the hot loop stays allocation-free.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_POOL = 24;
const IMPACT_POOL = 16;
const TRACER_LIFE = 0.07;
const IMPACT_LIFE = 0.35;

export function createEffects(scene) {
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 });
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const line = new THREE.Line(tracerGeo.clone(), tracerMat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;

  const impactMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ink), transparent: true, opacity: 0.8, depthWrite: false });
  const impactGeo = new THREE.PlaneGeometry(0.16, 0.16);
  const impacts = [];
  for (let i = 0; i < IMPACT_POOL; i += 1) {
    const mesh = new THREE.Mesh(impactGeo, impactMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    impacts.push({ mesh, life: 0 });
  }
  let impactNext = 0;

  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 26, 1.4);
  scene.add(boomLight);
  let boomLife = 0;
  const boomPos = new THREE.Vector3();

  function tracer(from, to) {
    const slot = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACER_POOL;
    const attr = slot.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    slot.line.visible = true;
    slot.life = TRACER_LIFE;
  }

  function impact(point, normal) {
    const slot = impacts[impactNext];
    impactNext = (impactNext + 1) % IMPACT_POOL;
    slot.mesh.position.copy(point);
    slot.mesh.lookAt(point.x + normal.x, point.y + normal.y, point.z + normal.z);
    slot.mesh.visible = true;
    slot.life = IMPACT_LIFE;
    slot.mesh.material.opacity = 0.8;
  }

  function explosion(point) {
    boomPos.copy(point);
    boomLight.position.copy(point);
    boomLight.intensity = 160;
    boomLife = 0.4;
  }

  function step(dt) {
    for (const slot of tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) slot.line.visible = false;
    }
    for (const slot of impacts) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.mesh.material.opacity = Math.max(0, slot.life / IMPACT_LIFE) * 0.8;
      slot.mesh.scale.setScalar(1 + (1 - slot.life / IMPACT_LIFE) * 2);
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    if (boomLife > 0) {
      boomLife -= dt;
      boomLight.intensity = Math.max(0, boomLife / 0.4) * 160;
    }
  }

  return { tracer, impact, explosion, step };
}
