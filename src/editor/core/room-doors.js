import * as THREE from 'three';
import { cloneMaterials } from '../assets/catalog.js';

// Not part of the placeable asset catalog (no manifest entry yet), so it's
// hardcoded here rather than looked up — this is structural geometry, not
// something a user drags in from the asset browser.
const DOOR_ASSET = { file: 'door/wood-door.glb', url: '/models/assets/door/wood-door.glb' };

// Matches room-links.js's edgeMidpoint / room-builder.js's wall-run
// convention: N/S walls run along X at a fixed z, W/E walls run along Z at a
// fixed x.
function edgeMidpoint({ x, z, side }) {
  if (side === 'N') return { x: x + 0.5, z };
  if (side === 'S') return { x: x + 0.5, z: z + 1 };
  if (side === 'W') return { x, z: z + 0.5 };
  return { x: x + 1, z: z + 0.5 }; // E
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
      });
    });
  };
}
