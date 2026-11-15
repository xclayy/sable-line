// YARD 7 — a decommissioned rail depot at dusk, the game's one map.
// Attackers spawn south, defenders north. Two plant sites: A, a container
// yard on the west; B, a warehouse on the east. Three lanes run between
// them (west long, mid, east long) with a north connector behind the sites.
// Every box is a collider for movement and a surface a bullet stops on.
// Plain geometry only, no models and no textures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const HALF_X = 22;
const HALF_Z = 18;
const WALL_H = 4.6;

// Waypoint graph the bots route on. Nodes sit in open ground; edges are
// straight lines a bot can walk without crossing a wall.
const NODE_LIST = [
  ['sA0', 0, 14], ['sA1', -4, 14], ['sA2', 4, 14],
  ['jS', 0, 8],
  ['a1', -10, 10], ['a2', -17, 7], ['a3', -19, 0], ['a4', -19, -6],
  ['a5', -15, -10], ['a6', -10, -13.5],
  ['b1', 10, 10], ['b2', 17, 7], ['b3', 19, 0], ['b4', 19, -6],
  ['b5', 15, -10], ['b6', 8, -11],
  ['m0', 0, 0], ['m1', 0, -8], ['m2', 0, -13],
  ['n1', -8, -15], ['n2', 8, -15],
  ['hA1', -18, -9], ['hA2', -12, -14],
  ['hB1', 18, -13], ['hB2', 12, -11],
  ['sD0', 0, -14], ['sD1', -4, -14], ['sD2', 4, -14],
];
const EDGE_LIST = [
  ['sA0', 'jS'], ['sA1', 'jS'], ['sA2', 'jS'],
  ['jS', 'a1'], ['jS', 'b1'], ['jS', 'm0'],
  ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a4'], ['a4', 'a5'], ['a5', 'a6'],
  ['a6', 'm1'], ['a6', 'n1'], ['a5', 'hA1'], ['a5', 'hA2'], ['a6', 'hA2'],
  ['b1', 'b2'], ['b2', 'b3'], ['b3', 'b4'], ['b4', 'b5'], ['b5', 'b6'],
  ['b6', 'm1'], ['b6', 'n2'], ['b5', 'hB1'], ['b5', 'hB2'], ['b6', 'hB2'],
  ['a1', 'm0'], ['b1', 'm0'],
  ['m0', 'm1'], ['m1', 'm2'], ['m1', 'n1'], ['m1', 'n2'],
  ['m2', 'n1'], ['m2', 'n2'], ['m2', 'sD0'],
  ['n1', 'sD1'], ['n2', 'sD2'],
  ['a4', 'hA1'], ['b4', 'hB1'],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent),
    emissive: new THREE.Color(PALETTE.accent),
    emissiveIntensity: 2.2,
    roughness: 0.4,
  });
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1d2129'),
    roughness: 0.95,
    metalness: 0.02,
  });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Decorative mesh: visible, casts no shadow, never collides, never shot.
  function deco(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Floor and perimeter walls.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(HALF_X * 2 + 0.4, 0.4, HALF_Z * 2 + 0.4), floorMaterial);
  floor.position.set(0, -0.2, 0);
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push(new THREE.Box3().setFromObject(floor));
  shootables.push(floor);
  box(0.4, WALL_H, HALF_Z * 2 + 0.4, -HALF_X - 0.2, WALL_H / 2, 0, 'surface');
  box(0.4, WALL_H, HALF_Z * 2 + 0.4, HALF_X + 0.2, WALL_H / 2, 0, 'surface');
  box(HALF_X * 2 + 0.4, WALL_H, 0.4, 0, WALL_H / 2, -HALF_Z - 0.2, 'surface');
  box(HALF_X * 2 + 0.4, WALL_H, 0.4, 0, WALL_H / 2, HALF_Z + 0.2, 'surface');

  // Lane dividers with a doorway each, forcing mid to commit to a lane.
  box(0.4, 3.4, 5, -9, 1.7, -5.5, 'hairline');
  box(0.4, 3.4, 3, -9, 1.7, 0.5, 'hairline');
  box(0.4, 3.4, 5, 9, 1.7, -5.5, 'hairline');
  box(0.4, 3.4, 3, 9, 1.7, 0.5, 'hairline');

  // Site A — container yard (west).
  box(6, 2.6, 2.6, -18, 1.3, -12, 'accent');
  box(2.6, 2.6, 6, -13, 1.3, -6.5, 'teamB');
  box(2.6, 2.6, 2.6, -16, 3.9, -12, 'hairline');
  box(1.4, 1.4, 1.4, -11.5, 0.7, -16.5, 'surface');
  box(1.4, 1.4, 1.4, -20.5, 0.7, -7.5, 'surface');

  // Site B — warehouse (east), roofed, two doorways (south and west).
  box(6.5, 3.4, 0.4, 13.75, 1.7, -6.5, 'surface');
  box(0.5, 3.4, 0.4, 20.25, 1.7, -6.5, 'surface');
  box(0.4, 3.4, 3.5, 10.5, 1.7, -8.25, 'surface');
  box(0.4, 3.4, 2.5, 10.5, 1.7, -13.25, 'surface');
  box(10.4, 3.4, 0.4, 15.5, 1.7, -14.5, 'surface');
  box(0.4, 3.4, 8.4, 20.5, 1.7, -10.5, 'surface');
  box(10.4, 0.3, 8.4, 15.5, 3.55, -10.5, 'hairline');
  box(1.2, 1.2, 1.2, 14, 0.6, -12, 'hairline');
  box(1.2, 1.2, 1.2, 13.5, 0.6, -8.5, 'hairline');

  // Mid cover: crates and a pillar. (The mid crate sits off the m0 waypoint
  // so the waypoint graph stays walkable; see research/audit_map.mjs.)
  box(1.6, 1.6, 1.6, 5, 0.8, 1, 'hairline');
  box(1.2, 1.2, 1.2, 2.5, 0.6, -4, 'surface');
  box(1.2, 1.2, 1.2, -2.5, 0.6, 5.5, 'surface');
  box(1.2, 3.2, 1.2, 4, 1.6, -8, 'hairline');

  // Long-lane cover and spawn cover. (Kept off the waypoint lines; the
  // north-connector slabs were removed — they sat on the m2/sD0 nodes.)
  box(1.4, 1.4, 1.4, -14, 0.7, 4, 'surface');
  box(1.4, 1.4, 1.4, -14, 0.7, -4, 'surface');
  box(1.4, 1.4, 1.4, 14, 0.7, 4, 'surface');
  box(1.4, 1.4, 1.4, 14, 0.7, -4, 'surface');
  box(2, 1, 1, -6, 0.5, 12, 'hairline');
  box(2, 1, 1, 6, 0.5, 12, 'hairline');

  // Site markers: amber floor stripes around each plant zone.
  function siteMarker(cx, cz, size) {
    const t = 0.18;
    const y = 0.02;
    deco(size, 0.04, t, cx, y, cz - size / 2, materials.accent);
    deco(size, 0.04, t, cx, y, cz + size / 2, materials.accent);
    deco(t, 0.04, size, cx - size / 2, y, cz, materials.accent);
    deco(t, 0.04, size, cx + size / 2, y, cz, materials.accent);
  }
  siteMarker(-15.5, -10.5, 7);
  siteMarker(15.5, -10.5, 7);

  // Lamp posts with glowing heads (visual only).
  function lamp(x, z) {
    deco(0.18, 3.4, 0.18, x, 1.7, z, materials.hairline);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), lampMaterial);
    head.position.set(x, 3.5, z);
    group.add(head);
  }
  lamp(-6, 2);
  lamp(6, 2);
  lamp(-15, -6);
  lamp(15, -6);

  // Light: a low amber sun from the west, a cool fill, and the dusk sky.
  const sky = new THREE.HemisphereLight(new THREE.Color('#2a3340'), new THREE.Color('#14161a'), 1.0);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#f2c078'), 2.0);
  sun.position.set(-16, 15, 9);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5f7ea8'), 0.55);
  fill.position.set(12, 10, -12);
  scene.add(fill);
  const lampA = new THREE.PointLight(new THREE.Color(PALETTE.accent), 22, 20, 1.6);
  lampA.position.set(-15.5, 4.2, -10.5);
  scene.add(lampA);
  const lampB = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 13, 1.6);
  lampB.position.set(15.5, 3, -10.5);
  scene.add(lampB);
  const lampM = new THREE.PointLight(new THREE.Color('#cdd7e2'), 10, 13, 1.6);
  lampM.position.set(0, 3.4, 0);
  scene.add(lampM);

  // Waypoint graph.
  const nodes = new Map();
  for (const [id, x, z] of NODE_LIST) nodes.set(id, { id, x, z });
  const edges = new Map();
  for (const [a, b] of EDGE_LIST) {
    if (!edges.has(a)) edges.set(a, []);
    if (!edges.has(b)) edges.set(b, []);
    edges.get(a).push(b);
    edges.get(b).push(a);
  }

  const probe = new THREE.Box3();
  function overlaps(x, y, z, height, radius, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  return {
    colliders,
    shootables,
    group,
    overlaps,
    sites: {
      A: { id: 'A', name: 'CONTAINER YARD', center: new THREE.Vector3(-15.5, 0, -10.5), radius: 4.2 },
      B: { id: 'B', name: 'WAREHOUSE', center: new THREE.Vector3(15.5, 0, -10.5), radius: 4.2 },
    },
    spawns: {
      attack: [
        new THREE.Vector3(0, 0, 14), new THREE.Vector3(-4, 0, 14), new THREE.Vector3(4, 0, 14),
        new THREE.Vector3(-2, 0, 15.5), new THREE.Vector3(2, 0, 15.5),
      ],
      defend: [
        new THREE.Vector3(0, 0, -14), new THREE.Vector3(-4, 0, -14), new THREE.Vector3(4, 0, -14),
        new THREE.Vector3(-2, 0, -15.5), new THREE.Vector3(2, 0, -15.5),
      ],
    },
    waypoints: { nodes, edges },
    holds: { A: ['hA1', 'hA2', 'a6'], B: ['hB1', 'hB2', 'b6'], mid: ['m1', 'a6', 'b6'] },
    bounds: { x: HALF_X, z: HALF_Z },
  };
}

// Breadth-first route between two waypoint ids; returns an array of node
// ids (excluding the start) or null when no route exists.
export function findRoute(waypoints, fromId, toId) {
  if (fromId === toId) return [];
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of waypoints.edges.get(current) ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, current);
      if (next === toId) {
        const path = [next];
        let step = current;
        while (step !== null) {
          path.unshift(step);
          step = prev.get(step);
        }
        return path.slice(1);
      }
      queue.push(next);
    }
  }
  return null;
}

// The nearest waypoint to a position.
export function nearestNode(waypoints, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const node of waypoints.nodes.values()) {
    const d = (node.x - x) * (node.x - x) + (node.z - z) * (node.z - z);
    if (d < bestD) {
      bestD = d;
      best = node;
    }
  }
  return best;
}
