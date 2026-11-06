import * as THREE from 'three';
import { createCharacterRig } from './character-rig.js';

// How the local player moves: WASD and click-to-move (A* over the room's floor
// cells, around furniture), falling onto the floor at spawn, and the
// follow-camera. Nothing here touches editor UI — the editor's play-test and
// the game client both run on it.
// Scales with the model (see CHARACTER_SIZE_FACTOR in character-rig.js).
export const CHARACTER_RADIUS = 0.32 * 0.8;
const DROP_HEIGHT = 4;
const GRAVITY_ACCELERATION = 18;

function circleIntersectsBox(px, pz, radius, box) {
  const closestX = THREE.MathUtils.clamp(px, box.min.x, box.max.x);
  const closestZ = THREE.MathUtils.clamp(pz, box.min.z, box.max.z);
  const dx = px - closestX;
  const dz = pz - closestZ;
  return dx * dx + dz * dz < radius * radius;
}

function circleIntersectsCircle(px, pz, radius, cx, cz, otherRadius) {
  const dx = px - cx;
  const dz = pz - cz;
  const minDistance = radius + otherRadius;
  return dx * dx + dz * dz < minDistance * minDistance;
}

// Grid cells that actually overlap a blocksMovement object's collision shape
// — no character-radius margin here (that's already enforced separately,
// every frame, by the precise circle-vs-box/cylinder check in
// isBlockedByPlacedObjects; adding it again here just to plan a path would
// double up and make small furniture block a much wider area than it really
// occupies). Reuses the same userData.colliderShape the real collision check
// reads, rather than always treating the object as a box, so round objects
// (colliderShape: 'cylinder') don't over-block their corners either.
function computeBlockedCellSet(ctx, roomInstanceId) {
  const blocked = new Set();
  ctx.placedObjects.forEach((object) => {
    if (!object.userData.blocksMovement) return;
    if (ctx.getObjectRoomInstanceId(object) !== roomInstanceId) return;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const minX = Math.floor(box.min.x);
    const maxX = Math.floor(box.max.x);
    const minZ = Math.floor(box.min.z);
    const maxZ = Math.floor(box.max.z);

    if (object.userData.colliderShape === 'cylinder') {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.z) / 2;
      for (let x = minX; x <= maxX; x += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          if (circleIntersectsBox(center.x, center.z, radius, { min: { x, z }, max: { x: x + 1, z: z + 1 } })) {
            blocked.add(`${x},${z}`);
          }
        }
      }
      return;
    }

    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const overlapsX = box.min.x < x + 1 && box.max.x > x;
        const overlapsZ = box.min.z < z + 1 && box.max.z > z;
        if (overlapsX && overlapsZ) blocked.add(`${x},${z}`);
      }
    }
  });
  return blocked;
}

// A* over the room's floor grid — needed because click-to-move used to walk
// a straight line straight to the destination, which clips right through
// missing corners in any non-convex room shape (an L-shaped hallway, say)
// even though both endpoints are on valid floor. `isWalkable(x, z)` decides
// whether a cell counts as floor AND isn't blocked by furniture. Returns an
// array of {x,z} cell coords from start to end (inclusive), or null if end
// isn't reachable from start.
const PATH_NEIGHBORS = [
  { dx: 1, dz: 0, cost: 1 },
  { dx: -1, dz: 0, cost: 1 },
  { dx: 0, dz: 1, cost: 1 },
  { dx: 0, dz: -1, cost: 1 },
  { dx: 1, dz: 1, cost: Math.SQRT2 },
  { dx: 1, dz: -1, cost: Math.SQRT2 },
  { dx: -1, dz: 1, cost: Math.SQRT2 },
  { dx: -1, dz: -1, cost: Math.SQRT2 },
];

function findGridPath(isWalkable, start, end) {
  const startKey = `${start.x},${start.z}`;
  const endKey = `${end.x},${end.z}`;
  if (startKey === endKey) return [start];
  // The start cell is always allowed even if it reads as "blocked" (the
  // character is already standing there — e.g. right next to a piece of
  // furniture whose expanded collision margin laps over into this cell).
  if (!isWalkable(end.x, end.z)) return null;

  const heuristic = (x, z) => Math.hypot(end.x - x, end.z - z);
  const gScore = new Map([[startKey, 0]]);
  const cameFrom = new Map();
  const open = [{ key: startKey, x: start.x, z: start.z, f: heuristic(start.x, start.z) }];
  const closed = new Set();

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    if (current.key === endKey) {
      const path = [{ x: current.x, z: current.z }];
      let key = current.key;
      while (cameFrom.has(key)) {
        key = cameFrom.get(key);
        const [x, z] = key.split(',').map(Number);
        path.unshift({ x, z });
      }
      return path;
    }
    if (closed.has(current.key)) continue;
    closed.add(current.key);

    PATH_NEIGHBORS.forEach(({ dx, dz, cost }) => {
      const nx = current.x + dx;
      const nz = current.z + dz;
      const nKey = `${nx},${nz}`;
      if (closed.has(nKey)) return;
      if (nKey !== startKey && !isWalkable(nx, nz)) return;
      // A diagonal step must not cut through a corner neither orthogonal
      // neighbor actually has floor on — otherwise the path (and the
      // straight-line walk between two path points) can clip a missing cell.
      if (dx !== 0 && dz !== 0) {
        const orthogonalOpen = isWalkable(current.x + dx, current.z) && isWalkable(current.x, current.z + dz);
        if (!orthogonalOpen) return;
      }
      const tentativeG = gScore.get(current.key) + cost;
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        gScore.set(nKey, tentativeG);
        cameFrom.set(nKey, current.key);
        open.push({ key: nKey, x: nx, z: nz, f: tentativeG + heuristic(nx, nz) });
      }
    });
  }
  return null;
}

// Straight line between two world points, sampled every ~0.15 units, all on
// walkable cells.
function hasLineOfSight(isWalkable, from, to) {
  const distance = from.distanceTo(to);
  const steps = Math.max(1, Math.ceil(distance / 0.15));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    if (!isWalkable(Math.floor(x), Math.floor(z))) return false;
  }
  return true;
}

// Reduces a cell-by-cell path down to just the corners actually needed —
// otherwise the character would visibly stop and re-aim at every single
// grid cell along the way instead of walking a natural, mostly-straight route.
function simplifyWorldPath(isWalkable, worldPoints) {
  if (worldPoints.length <= 2) return worldPoints;
  const result = [worldPoints[0]];
  let anchor = 0;
  for (let i = 2; i < worldPoints.length; i += 1) {
    if (!hasLineOfSight(isWalkable, worldPoints[anchor], worldPoints[i])) {
      result.push(worldPoints[i - 1]);
      anchor = i - 1;
    }
  }
  result.push(worldPoints[worldPoints.length - 1]);
  return result;
}

export function initPlayerController(ctx) {
  // The local player's animated model. Remote players in a multiplayer room
  // get their own rigs from the same factory.
  ctx.characterRig = createCharacterRig(ctx.loader, ctx.character);
  ctx.isMoving = false;
  ctx.characterSpeed = 2.8;
  ctx.walkableBounds = null;
  ctx.isFalling = false;
  let fallVelocity = 0;

  // 3-step play-test camera zoom, same isometric angle throughout — each
  // step just zooms the character in closer regardless of facing direction.
  const MOVEMENT_CAMERA_ZOOM_LEVELS = [1, 1.7, 2.6];
  let movementCameraZoomLevel = 0;
  ctx.resetMovementCameraZoom = () => {
    movementCameraZoomLevel = 0;
  };

  const destination = new THREE.Vector3();
  // Remaining waypoints after `destination` — populated by setDestination
  // when the A* path has more than one corner to walk through.
  let movementPath = [];
  const movementDirection = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const keyboardDirection = new THREE.Vector3();

  ctx.startCharacterFall = () => {
    ctx.character.position.y = DROP_HEIGHT;
    ctx.isFalling = true;
    fallVelocity = 0;
  };

  ctx.updateCharacterGravity = (delta) => {
    if (ctx.currentMode !== 'movement' || !ctx.isFalling) return;
    fallVelocity += GRAVITY_ACCELERATION * delta;
    ctx.character.position.y -= fallVelocity * delta;
    if (ctx.character.position.y <= 0) {
      ctx.character.position.y = 0;
      ctx.isFalling = false;
      fallVelocity = 0;
    }
  };

  ctx.computeWalkableBounds = () => {
    // Walkable area is the room's drawn floor (room.floorCells), not a bounding
    // box of the furniture — a furniture-bbox rectangle is both narrower than
    // the actual floor (small desk near the middle of a big room) and wrong
    // shape for non-rectangular rooms (lets the character walk into notches
    // that have no floor).
    const room = ctx.rooms?.find((candidate) => candidate.instanceId === ctx.currentRoomInstanceId);
    const cells = room?.floorCells ?? [];
    if (cells.length === 0) return null;

    const cellSet = new Set(cells.map(({ x, z }) => `${x},${z}`));
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    cells.forEach(({ x, z }) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + 1);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z + 1);
    });

    return {
      cellSet,
      min: new THREE.Vector3(minX, 0, minZ),
      max: new THREE.Vector3(maxX, 0, maxZ),
    };
  };

  function isBlockedByPlacedObjects(position) {
    return ctx.placedObjects.some((object) => {
      if (!object.userData.blocksMovement) return false;
      // Every room's root sits at the same local origin, so without this an
      // object in a different (hidden) room can still collide with the
      // character in whichever room is actually being played.
      if (ctx.getObjectRoomInstanceId(object) !== ctx.currentRoomInstanceId) return false;
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) return false;

      if (object.userData.colliderShape === 'cylinder') {
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.z) / 2;
        return circleIntersectsCircle(position.x, position.z, CHARACTER_RADIUS, center.x, center.z, radius);
      }
      return circleIntersectsBox(position.x, position.z, CHARACTER_RADIUS, box);
    });
  }

  ctx.isInsideActiveMap = (position) => {
    if (!ctx.walkableBounds) return false;
    const cellKey = `${Math.floor(position.x)},${Math.floor(position.z)}`;
    const onFloor = ctx.walkableBounds.cellSet.has(cellKey);
    return onFloor && !isBlockedByPlacedObjects(position);
  };

  const spawnCandidate = new THREE.Vector3();

  ctx.findValidSpawnPosition = (centerX, centerZ) => {
    spawnCandidate.set(centerX, 0, centerZ);
    if (ctx.isInsideActiveMap(spawnCandidate)) return spawnCandidate.clone();

    const maxRadius = 15;
    for (let radius = 0.5; radius <= maxRadius; radius += 0.5) {
      const steps = Math.max(8, Math.round(radius * 8));
      for (let i = 0; i < steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        spawnCandidate.set(centerX + Math.cos(angle) * radius, 0, centerZ + Math.sin(angle) * radius);
        if (ctx.isInsideActiveMap(spawnCandidate)) return spawnCandidate.clone();
      }
    }
    return new THREE.Vector3(centerX, 0, centerZ);
  };

  // Puts the local player into the current room: works out the walkable area,
  // stands them on the room's spawn marker (or the nearest open floor to the
  // middle), drops them in, and snaps the camera to them. Both the editor's
  // play-test and the game client start play through this.
  // `jitter` spreads players that share one spawn marker: the player lands on a
  // random walkable spot within that many units of it instead of its exact point.
  ctx.spawnLocalPlayer = ({ jitter = 0 } = {}) => {
    ctx.resetCharacterMovement();
    ctx.walkableBounds = ctx.computeWalkableBounds();

    const spawnPoint = ctx.placedObjects.find(
      (object) =>
        object.userData.isSpawnPoint && ctx.getObjectRoomInstanceId(object) === ctx.currentRoomInstanceId,
    );

    if (spawnPoint) {
      ctx.character.position.set(spawnPoint.position.x, 0, spawnPoint.position.z);
      ctx.character.rotation.y = spawnPoint.rotation.y;
      if (jitter > 0) {
        const candidate = new THREE.Vector3();
        for (let attempt = 0; attempt < 30; attempt += 1) {
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.sqrt(Math.random()) * jitter;
          candidate.set(spawnPoint.position.x + Math.cos(angle) * radius, 0, spawnPoint.position.z + Math.sin(angle) * radius);
          if (ctx.isInsideActiveMap(candidate)) {
            ctx.character.position.set(candidate.x, 0, candidate.z);
            break;
          }
        }
      }
    } else if (ctx.walkableBounds) {
      const centerX = (ctx.walkableBounds.min.x + ctx.walkableBounds.max.x) / 2;
      const centerZ = (ctx.walkableBounds.min.z + ctx.walkableBounds.max.z) / 2;
      const spawn = ctx.findValidSpawnPosition(centerX, centerZ);
      ctx.character.position.set(spawn.x, 0, spawn.z);
    }
    ctx.startCharacterFall();
    // Orbit-controls zoom from the editor would otherwise carry over, making
    // the play view depend on whatever zoom was left over from editing.
    ctx.camera.zoom = 1;
    ctx.resetMovementCameraZoom();
    ctx.camera.position.copy(ctx.character.position).add(ctx.cameraOffset);
    ctx.camera.lookAt(
      ctx.character.position.x,
      ctx.character.position.y + 0.52,
      ctx.character.position.z,
    );
  };

  // Cancels any click-to-move in progress without teleporting the character.
  ctx.stopMovement = () => {
    ctx.isMoving = false;
    movementPath = [];
    ctx.destinationMarker.visible = false;
  };

  ctx.resetCharacterMovement = () => {
    ctx.character.position.set(0, 0, 0);
    ctx.isMoving = false;
    movementPath = [];
    ctx.pressedKeys.clear();
    ctx.destinationMarker.visible = false;
  };

  // sparrow.glb's forward axis is correctly aligned to +Z in this export
  // (verified from the GLB's bind-pose wing/feet symmetry axes: 0.00deg off),
  // so no correction is needed.
  const CHARACTER_FACING_OFFSET = 0;

  function rotateTowardsMovement(delta) {
    const targetRotation = Math.atan2(movementDirection.x, movementDirection.z) + CHARACTER_FACING_OFFSET;
    const rotationDifference = Math.atan2(
      Math.sin(targetRotation - ctx.character.rotation.y),
      Math.cos(targetRotation - ctx.character.rotation.y),
    );
    ctx.character.rotation.y += rotationDifference * Math.min(1, delta * 10);
  }

  ctx.setDestination = (event) => {
    if (ctx.currentMode !== 'movement' || ctx.isFalling) return;
    ctx.setPointer(event);

    const hit = ctx.raycaster.intersectObject(ctx.navigationSurface, false)[0];
    if (!hit || !ctx.isInsideActiveMap(hit.point)) return;

    const cellSet = ctx.walkableBounds?.cellSet;
    if (!cellSet) return;
    const blockedCellSet = computeBlockedCellSet(ctx, ctx.currentRoomInstanceId);
    const isWalkable = (x, z) => cellSet.has(`${x},${z}`) && !blockedCellSet.has(`${x},${z}`);

    const startCell = { x: Math.floor(ctx.character.position.x), z: Math.floor(ctx.character.position.z) };
    const endCell = { x: Math.floor(hit.point.x), z: Math.floor(hit.point.z) };
    const cellPath = findGridPath(isWalkable, startCell, endCell);
    if (!cellPath) return; // not reachable from here (blocked off by furniture, or not connected)

    const worldPoints = cellPath.map(({ x, z }) => new THREE.Vector3(x + 0.5, 0, z + 0.5));
    worldPoints[0].set(ctx.character.position.x, 0, ctx.character.position.z);
    worldPoints[worldPoints.length - 1].set(hit.point.x, 0, hit.point.z);
    // Drop the leading point (current position) — everything after it is a
    // waypoint still to walk through.
    const waypoints = simplifyWorldPath(isWalkable, worldPoints).slice(1);

    movementPath = waypoints.slice(1);
    destination.copy(waypoints[0] ?? new THREE.Vector3(hit.point.x, 0, hit.point.z));
    ctx.destinationMarker.position.x = hit.point.x;
    ctx.destinationMarker.position.z = hit.point.z;
    ctx.destinationMarker.visible = true;
    ctx.isMoving = true;
  };

  function updateKeyboardMovement(delta) {
    if (ctx.currentMode !== 'movement' || ctx.isFalling) return false;
    const horizontal =
      Number(ctx.pressedKeys.has('KeyD')) - Number(ctx.pressedKeys.has('KeyA'));
    const vertical =
      Number(ctx.pressedKeys.has('KeyW')) - Number(ctx.pressedKeys.has('KeyS'));
    if (horizontal === 0 && vertical === 0) return false;

    ctx.camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();
    cameraRight.crossVectors(cameraForward, ctx.camera.up).normalize();
    keyboardDirection
      .set(0, 0, 0)
      .addScaledVector(cameraForward, vertical)
      .addScaledVector(cameraRight, horizontal)
      .normalize();

    movementDirection.copy(keyboardDirection);
    const previousPosition = ctx.character.position.clone();
    ctx.character.position.addScaledVector(movementDirection, ctx.characterSpeed * delta);
    if (!ctx.isInsideActiveMap(ctx.character.position)) {
      ctx.character.position.copy(previousPosition);
    }

    rotateTowardsMovement(delta);
    ctx.isMoving = false;
    movementPath = [];
    ctx.destinationMarker.visible = false;
    return true;
  }

  ctx.updateMovement = (delta) => {
    if (updateKeyboardMovement(delta)) {
      ctx.characterRig.setMoving(true);
      return;
    }
    if (!ctx.isMoving) {
      ctx.characterRig.setMoving(false);
      return;
    }

    movementDirection.subVectors(destination, ctx.character.position);
    movementDirection.y = 0;
    const remainingDistance = movementDirection.length();

    if (remainingDistance < 0.04) {
      ctx.character.position.copy(destination);
      if (movementPath.length > 0) {
        // More corners left on the A* path — keep walking without a frame
        // of idle pose at the corner (isAnimatingRun stays true already).
        destination.copy(movementPath.shift());
      } else {
        ctx.isMoving = false;
        ctx.destinationMarker.visible = false;
        ctx.characterRig.setMoving(false);
      }
      return;
    }

    ctx.characterRig.setMoving(true);
    movementDirection.normalize();
    const previousPosition = ctx.character.position.clone();
    ctx.character.position.addScaledVector(
      movementDirection,
      Math.min(ctx.characterSpeed * delta, remainingDistance),
    );
    if (!ctx.isInsideActiveMap(ctx.character.position)) {
      ctx.character.position.copy(previousPosition);
      ctx.isMoving = false;
      movementPath = [];
      ctx.destinationMarker.visible = false;
      ctx.characterRig.setMoving(false);
      return;
    }
    rotateTowardsMovement(delta);
  };

  ctx.updateQuarterView = (delta) => {
    if (ctx.currentMode !== 'movement') return;
    const targetZoom = MOVEMENT_CAMERA_ZOOM_LEVELS[movementCameraZoomLevel];

    ctx.cameraTarget.copy(ctx.character.position).add(ctx.cameraOffset);
    const cameraLerp = 1 - Math.exp(-5 * delta);
    ctx.camera.position.lerp(ctx.cameraTarget, cameraLerp);
    ctx.camera.zoom += (targetZoom - ctx.camera.zoom) * cameraLerp;
    ctx.camera.updateProjectionMatrix();
    ctx.camera.lookAt(
      ctx.character.position.x,
      ctx.character.position.y + 0.52,
      ctx.character.position.z,
    );
  };

  const onWheel = (event) => {
    if (ctx.currentMode !== 'movement') return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    movementCameraZoomLevel = THREE.MathUtils.clamp(
      movementCameraZoomLevel + direction,
      0,
      MOVEMENT_CAMERA_ZOOM_LEVELS.length - 1,
    );
  };
  ctx.listen(ctx.canvas, 'wheel', onWheel, { passive: false });

  ctx.listen(ctx.canvas, 'pointerdown', ctx.setDestination);
}
