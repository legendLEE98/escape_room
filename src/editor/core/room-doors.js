import * as THREE from 'three';
import { cloneMaterials } from '../assets/catalog.js';

// Not part of the placeable asset catalog (no manifest entry yet), so it's
// hardcoded here rather than looked up — this is structural geometry, not
// something a user drags in from the asset browser.
const DOOR_ASSET = { file: 'door/wood-door.glb', url: '/models/assets/door/wood-door.glb' };

// The single source of truth for where a door edge sits in world space —
// room-links.js and movement.js both import this rather than re-deriving
// the N/S/W/E offset convention themselves, since room-builder.js's
// wall-run generation, this module's door/peek placement, and movement.js's
// door-transition teleport all need to agree exactly on this point.
export function edgeMidpoint({ x, z, side }) {
  if (side === 'N') return { x: x + 0.5, z };
  if (side === 'S') return { x: x + 0.5, z: z + 1 };
  if (side === 'W') return { x, z: z + 0.5 };
  return { x: x + 1, z: z + 0.5 }; // E
}

// How far out the beam's straight 90° edge reaches when the door is fully
// open.
export const PEEK_DEPTH = 1.6;
const PEEK_NEAR_HALF_WIDTH = 0.5; // matches the 1-unit doorway itself
const PEEK_FAR_SPREAD = 0.6; // how much extra the swinging side fans out by

// Scene background (#0c1119, scene-objects.js) — the far edge's color fades
// toward this so it blends into the void instead of ending in a visible
// hard-edged tan rectangle.
const PEEK_FAR_COLOR = new THREE.Color(0x0c1119);
const nearColor = new THREE.Color();
const farColor = new THREE.Color();

function edgeOutwardVector({ side }) {
  if (side === 'N') return { x: 0, z: -1 };
  if (side === 'S') return { x: 0, z: 1 };
  if (side === 'W') return { x: -1, z: 0 };
  return { x: 1, z: 0 }; // E
}

// A right trapezoid, not a symmetric one: one doorway corner (near1) extends
// straight outward at a clean 90° to the door (far1) — that edge is always
// dead straight regardless of how open the door is. The other corner
// (near2) fans out further as the door opens (far2), so the far edge isn't
// parallel to the near edge — that's what keeps the asymmetric, "swinging
// open" read instead of looking like a straight hallway extension. Flat in
// (X,0,Z), built directly from the outward direction vector — no object
// rotation involved (a hand-rotated plane turned out fragile to get right
// for all 4 sides, since Three.js's intrinsic XYZ Euler composition order
// isn't what a "flatten, then spin around up-axis" mental model predicts).
//
// Also carries a near→far vertex-color gradient (floor color near the
// doorway, fading toward the scene's own background color at the far edge)
// combined with a texture alpha gradient (low opacity near, higher far) —
// so close to the door it reads as a faint tint on the real floor, and by
// the far edge it's dissolved into the dark background instead of showing
// as a hard-edged patch.
export function buildPeekBeamGeometry(ctx, outward, openFraction) {
  const depth = PEEK_DEPTH * openFraction;
  const perp = { x: -outward.z, z: outward.x };

  const near1 = { x: perp.x * PEEK_NEAR_HALF_WIDTH, z: perp.z * PEEK_NEAR_HALF_WIDTH };
  const near2 = { x: -perp.x * PEEK_NEAR_HALF_WIDTH, z: -perp.z * PEEK_NEAR_HALF_WIDTH };
  const far1 = { x: near1.x + outward.x * depth, z: near1.z + outward.z * depth };
  const farSpread = PEEK_NEAR_HALF_WIDTH + depth * PEEK_FAR_SPREAD;
  const far2 = {
    x: outward.x * depth - perp.x * farSpread,
    z: outward.z * depth - perp.z * farSpread,
  };

  const positions = [near1.x, 0, near1.z, near2.x, 0, near2.z, far1.x, 0, far1.z, far2.x, 0, far2.z];
  const uvs = [0, 0, 1, 0, 0, 1, 1, 1]; // v=0 near the door, v=1 at the far edge

  nearColor.set(ctx.floorColor);
  farColor.copy(PEEK_FAR_COLOR);
  const colors = [
    nearColor.r, nearColor.g, nearColor.b,
    nearColor.r, nearColor.g, nearColor.b,
    farColor.r, farColor.g, farColor.b,
    farColor.r, farColor.g, farColor.b,
  ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  return geometry;
}

let peekAlphaTexture = null;
function getPeekAlphaTexture() {
  if (peekAlphaTexture) return peekAlphaTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 32;
  const ctx2d = canvas.getContext('2d');
  const gradient = ctx2d.createLinearGradient(0, 0, 0, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,0.12)'); // near the door: barely there
  gradient.addColorStop(1, 'rgba(255,255,255,0.65)'); // far edge: more opaque, but fading to background color
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0, 0, 2, 32);
  peekAlphaTexture = new THREE.CanvasTexture(canvas);
  return peekAlphaTexture;
}

// A static, always-present hint that a room lies beyond this door — a
// light-beam-shaped mask matching the door's current open amount, animated
// by movement.js's updateDoorAnimations as the door swings. Built collapsed
// (openFraction 0) up front; movement.js grows it by replacing the geometry
// each frame the amount changes.
function addPeekBeam(ctx, group, edge) {
  const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === edge.connectedRoomInstanceId);
  if (!targetRoom?.floorCells?.length) return;

  const material = new THREE.MeshBasicMaterial({
    map: getPeekAlphaTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const outward = edgeOutwardVector(edge);
  const mesh = new THREE.Mesh(buildPeekBeamGeometry(ctx, outward, 0), material);
  const mid = edgeMidpoint(edge);
  mesh.position.set(mid.x, 0.008, mid.z);
  group.add(mesh);
  edge._peekBeam = mesh;
  edge._peekOutward = outward;
  edge._peekOpenFraction = 0;
}

export function initRoomDoors(ctx) {
  // Fills every door edge's opening with an actual door+frame model instead
  // of leaving it empty. Called from ctx.buildRoomWalls, which has already
  // removed any previous isRoomDoors group before creating this one — so a
  // load resolving after a newer rebuild just checks group.parent to bail
  // out instead of attaching to a group nobody references anymore.
  ctx.buildRoomDoors = (room, doorEdges) => {
    const group = new THREE.Group();
    group.userData.isRoomDoors = true;
    room.root.add(group);

    (doorEdges || []).forEach((edge) => {
      // Doesn't wait on the door GLB load since it only needs data already
      // in memory (whether the neighbor room's floor exists at all).
      addPeekBeam(ctx, group, edge);

      ctx.loadAssetTemplate(DOOR_ASSET).then((template) => {
        if (!group.parent) return;
        const content = template.clone(true);
        cloneMaterials(content);
        // Deliberately skipping normalizeAsset here — the source GLB is
        // already centered on X/Z and floor-aligned on Y (frame local X
        // spans -0.44..0.44, Y spans 0..1.8), which happens to line up
        // exactly with a boundary-edge midpoint. Re-centering it would only
        // throw that off.
        const { x, z } = edgeMidpoint(edge);
        content.position.set(x, 0, z);
        if (edge.side === 'W' || edge.side === 'E') content.rotation.y = Math.PI / 2;
        group.add(content);

        // Runtime-only reference (not persisted — persistence.js's
        // serializeDoorEdges whitelists its own fields) so movement.js can
        // animate this specific door leaf open/closed. The Door node's own
        // local origin sits right at its hinge edge (see room-doors.js's
        // earlier GLB inspection notes), so rotating it in place opens it.
        edge._doorLeaf = content.getObjectByName('Door');
      });
    });
  };
}
