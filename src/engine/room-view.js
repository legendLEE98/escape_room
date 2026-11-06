import * as THREE from 'three';

const FLOOR_COLOR = 0x8a7257;
const WALL_COLOR = 0x9a9a9a; // placeholder — swap for a real material/texture later
const WALL_HEIGHT = 2;
const WALL_THICKNESS = 0.15;
// Measured from door/wood-door.glb's DoorFrame node (local Y spans 0..1.8024)
// — the sliver between this and WALL_HEIGHT gets its own short wall segment
// (a lintel) above each door opening instead of being left as a gap.
const DOOR_FRAME_HEIGHT = 1.8;
export function cellKey(x, z) {
  return `${x},${z}`;
}

export function edgeKey(x, z, side) {
  return `${x},${z},${side}`;
}

// All perimeter edges of a floor shape — every cell side that has no
// same-room neighbor on the other side. Shared by wall generation (which
// builds a wall on each edge, minus any marked as a door) and the room-link
// panel (which snaps a click to the nearest one of these to place a door).
export function computeBoundaryEdges(cells) {
  const floorSet = new Set(cells.map(({ x, z }) => cellKey(x, z)));
  const edges = [];
  cells.forEach(({ x, z }) => {
    if (!floorSet.has(cellKey(x, z - 1))) edges.push({ x, z, side: 'N' });
    if (!floorSet.has(cellKey(x, z + 1))) edges.push({ x, z, side: 'S' });
    if (!floorSet.has(cellKey(x - 1, z))) edges.push({ x, z, side: 'W' });
    if (!floorSet.has(cellKey(x + 1, z))) edges.push({ x, z, side: 'E' });
  });
  return edges;
}

// Builds what a room looks like — floor tiles, walls (with openings for
// doors), door models, and the fading of walls that sit between the camera
// and the player. No editor UI in here, so a game client can use it as-is.
export function initRoomView(ctx) {
  ctx.buildRoomFloor = (room, cells) => {
    const floorGroup = new THREE.Group();
    floorGroup.userData.isRoomFloor = true;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, roughness: 0.9 });
    cells.forEach(({ x, z }) => {
      const cell = new THREE.Mesh(geometry, material);
      cell.rotation.x = -Math.PI / 2;
      cell.position.set(x + 0.5, 0.008, z + 0.5);
      cell.receiveShadow = true;
      floorGroup.add(cell);
    });
    room.root.add(floorGroup);
    room.floorCells = cells;
  };

  // Collapses a set of integer positions into [start, end] runs of
  // consecutive values, e.g. [0,1,2,5,6] -> [[0,2],[5,6]].
  function mergeRuns(values) {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    const runs = [];
    let start = null;
    let end = null;
    sorted.forEach((value) => {
      if (start === null) {
        start = value;
        end = value;
      } else if (value === end + 1) {
        end = value;
      } else {
        runs.push([start, end]);
        start = value;
        end = value;
      }
    });
    if (start !== null) runs.push([start, end]);
    return runs;
  }

  ctx.computeBoundaryEdges = computeBoundaryEdges;
  ctx.edgeKey = edgeKey;
  ctx.wallHeight = WALL_HEIGHT;
  ctx.floorColor = FLOOR_COLOR;

  ctx.buildRoomWalls = (room, cells, doorEdges = []) => {
    // Rebuilding replaces both the wall geometry and whatever door models
    // were sitting in their openings — without this, repeated calls (editing
    // the floor, linking/unlinking a door) would each add another group on
    // top of the last instead of replacing it.
    const existingWalls = room.root.children.find((child) => child.userData.isRoomWalls);
    if (existingWalls) room.root.remove(existingWalls);
    const existingDoors = room.root.children.find((child) => child.userData.isRoomDoors);
    if (existingDoors) room.root.remove(existingDoors);

    const wallGroup = new THREE.Group();
    wallGroup.userData.isRoomWalls = true;

    const createWallMesh = (geometry) => {
      // Each wall gets its own material instance (not shared) so
      // updateWallOcclusion can fade individual segments independently.
      const material = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.9, transparent: true });
      const wall = new THREE.Mesh(geometry, material);
      // Thin (0.15-unit) box geometry self-shadows badly under the shadow
      // map's precision — shows up as a dithered/hatched moiré pattern on
      // the wall face, especially near corners where two walls sit close
      // together. receiveShadow off avoids that. castShadow stays ON,
      // though — otherwise the wall doesn't occlude the shadow map at all,
      // so light (and other objects' shadows) passes straight through it
      // onto whatever floor is on the other side.
      wall.castShadow = true;
      wall.receiveShadow = false;
      return wall;
    };

    const addWall = (geometry, x, z) => {
      const wall = createWallMesh(geometry);
      wall.position.set(x, WALL_HEIGHT / 2, z);
      wallGroup.add(wall);
    };

    const addWallAt = (geometry, x, y, z) => {
      const wall = createWallMesh(geometry);
      wall.position.set(x, y, z);
      wallGroup.add(wall);
    };

    // Door edges get no full-height wall segment — the opening is filled by
    // an actual door model (see ctx.buildRoomDoors below) instead. The strip
    // above the door frame's height still needs a wall, though, so it
    // doesn't just show as a hole up to the ceiling.
    const lintelHeight = WALL_HEIGHT - DOOR_FRAME_HEIGHT;
    if (lintelHeight > 0) {
      doorEdges.forEach((edge) => {
        const { x, z, side } = edge;
        const isHorizontal = side === 'N' || side === 'S';
        const geometry = isHorizontal
          ? new THREE.BoxGeometry(1, lintelHeight, WALL_THICKNESS)
          : new THREE.BoxGeometry(WALL_THICKNESS, lintelHeight, 1);
        const cx = isHorizontal ? x + 0.5 : side === 'W' ? x : x + 1;
        const cz = isHorizontal ? (side === 'N' ? z : z + 1) : z + 0.5;
        addWallAt(geometry, cx, DOOR_FRAME_HEIGHT + lintelHeight / 2, cz);
      });
    }

    const doorEdgeSet = new Set(doorEdges.map(({ x, z, side }) => edgeKey(x, z, side)));
    const boundaryEdges = computeBoundaryEdges(cells).filter(
      ({ x, z, side }) => !doorEdgeSet.has(edgeKey(x, z, side)),
    );

    // Group remaining edges by the fixed grid line they sit on, then merge
    // each line's consecutive cells into one wall run — building one box per
    // straight run (not one per cell) so adjacent same-orientation segments
    // never overlap each other and z-fight.
    const horizontalLines = new Map(); // z (fixed) -> [x, x, ...]
    const verticalLines = new Map(); // x (fixed) -> [z, z, ...]
    const addToLine = (map, key, value) => {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(value);
    };

    boundaryEdges.forEach(({ x, z, side }) => {
      if (side === 'N') addToLine(horizontalLines, z, x);
      if (side === 'S') addToLine(horizontalLines, z + 1, x);
      if (side === 'W') addToLine(verticalLines, x, z);
      if (side === 'E') addToLine(verticalLines, x + 1, z);
    });

    // A run's endpoint only needs the corner treatment below if a
    // perpendicular wall genuinely meets it there. A door can cut a run
    // short right next to where a corner used to be, leaving an endpoint
    // that ISN'T a real corner (nothing perpendicular touches it) — treating
    // every endpoint as a corner unconditionally either pokes a wall stub
    // into the doorway (horizontal extend) or leaves a real gap (vertical
    // inset) with nothing to cover it, and can even overlap a nearby true
    // corner's own extension and z-fight.
    function hasVerticalWallAt(x, z) {
      const zs = verticalLines.get(x);
      return Boolean(zs) && (zs.includes(z) || zs.includes(z - 1));
    }
    function hasHorizontalWallAt(z, x) {
      const xs = horizontalLines.get(z);
      return Boolean(xs) && (xs.includes(x) || xs.includes(x - 1));
    }

    // Horizontal (north/south-facing) runs are stretched half a thickness
    // past each end that's a real corner, so they alone fill it; vertical
    // (east/west-facing) runs are inset by half a thickness at each end
    // that's a real corner, so the two butt flush with zero shared volume
    // (extending/insetting both unconditionally would make their faces
    // coincide inside the corner and z-fight).
    horizontalLines.forEach((xs, z) => {
      mergeRuns(xs).forEach(([start, end]) => {
        const extendStart = hasVerticalWallAt(start, z) ? WALL_THICKNESS / 2 : 0;
        const extendEnd = hasVerticalWallAt(end + 1, z) ? WALL_THICKNESS / 2 : 0;
        const left = start - extendStart;
        const right = end + 1 + extendEnd;
        const geometry = new THREE.BoxGeometry(right - left, WALL_HEIGHT, WALL_THICKNESS);
        addWall(geometry, (left + right) / 2, z);
      });
    });
    verticalLines.forEach((zs, x) => {
      mergeRuns(zs).forEach(([start, end]) => {
        const insetStart = hasHorizontalWallAt(start, x) ? WALL_THICKNESS / 2 : 0;
        const insetEnd = hasHorizontalWallAt(end + 1, x) ? WALL_THICKNESS / 2 : 0;
        const top = start + insetStart;
        const bottom = end + 1 - insetEnd;
        const geometry = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, bottom - top);
        addWall(geometry, x, (top + bottom) / 2);
      });
    });

    room.root.add(wallGroup);
    room.doorEdges = doorEdges;
    ctx.buildRoomDoors(room, doorEdges);
  };

  const WALL_OCCLUDED_OPACITY = 0;
  const WALL_EDITOR_OPACITY = 0.3;
  const WALL_OPACITY_LERP_SPEED = 10;
  // How far left/right of the center sightline to also probe, so walls that
  // block the character's sides (not just its exact center point) fade too.
  const OCCLUSION_RAY_SPREAD = 0.45;
  const occlusionRaycaster = new THREE.Raycaster();
  const occlusionOrigin = new THREE.Vector3();
  const occlusionDirection = new THREE.Vector3();
  const occlusionPerpendicular = new THREE.Vector3();
  const occlusionProbeOrigin = new THREE.Vector3();
  // Hysteresis: once a wall is hit, keep it faded for a bit even if a later
  // frame's raycast narrowly misses — otherwise borderline positions flicker
  // opaque/faded every frame as the hit test tips back and forth.
  const OCCLUSION_HOLD_SECONDS = 0.2;
  const wallHeldUntil = new WeakMap();

  ctx.updateWallOcclusion = (delta) => {
    const room = ctx.rooms?.find((candidate) => candidate.instanceId === ctx.currentRoomInstanceId);
    const wallGroup = room?.root.children.find((child) => child.userData.isRoomWalls);
    if (!wallGroup || wallGroup.children.length === 0) return;

    let hitWalls = null;
    if (ctx.currentMode === 'movement') {
      // Cast from the character (roughly chest height) toward the camera —
      // any wall segment the ray crosses is standing between the player and
      // the camera, regardless of which side of the room it's on.
      occlusionOrigin.copy(ctx.character.position);
      occlusionOrigin.y += 0.8;
      occlusionDirection.subVectors(ctx.camera.position, occlusionOrigin);
      const distance = occlusionDirection.length();
      occlusionDirection.normalize();
      // Horizontal-plane perpendicular of the sightline, used to spread a
      // few extra probes across the character's width instead of just its
      // exact center point.
      occlusionPerpendicular.set(-occlusionDirection.z, 0, occlusionDirection.x).normalize();

      hitWalls = new Set();
      [0, OCCLUSION_RAY_SPREAD, -OCCLUSION_RAY_SPREAD].forEach((offset) => {
        occlusionProbeOrigin.copy(occlusionOrigin).addScaledVector(occlusionPerpendicular, offset);
        occlusionRaycaster.set(occlusionProbeOrigin, occlusionDirection);
        occlusionRaycaster.far = distance;
        occlusionRaycaster
          .intersectObjects(wallGroup.children, false)
          .forEach((hit) => hitWalls.add(hit.object));
      });
    }

    const now = ctx.clock.elapsedTime;
    hitWalls?.forEach((wall) => wallHeldUntil.set(wall, now + OCCLUSION_HOLD_SECONDS));

    const isEditingView = ctx.currentMode === 'editor' || ctx.currentMode === 'roomBuilder' || ctx.currentMode === 'roomLink';

    wallGroup.children.forEach((wall) => {
      const isHeld = (wallHeldUntil.get(wall) ?? 0) > now;
      let targetOpacity = 1;
      if (isHeld) targetOpacity = WALL_OCCLUDED_OPACITY;
      else if (isEditingView) targetOpacity = WALL_EDITOR_OPACITY;
      wall.material.opacity += (targetOpacity - wall.material.opacity) * Math.min(1, delta * WALL_OPACITY_LERP_SPEED);
    });
  };
}
