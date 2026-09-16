import * as THREE from 'three';
import { buildPeekBeamGeometry, edgeMidpoint } from './room-doors.js';

const CHARACTER_RADIUS = 0.32;
const INTERACTION_RADIUS = 1.5;
const DROP_HEIGHT = 4;
const GRAVITY_ACCELERATION = 18;
const IDLE_SQUID_INDEX = 5;
const WALK_SQUID_INDEX = 1;

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

export function initMovement(ctx) {
  ctx.mixer = null;
  ctx.squidMeshes = [];
  ctx.loadedModel = null;
  ctx.isMoving = false;
  ctx.characterSpeed = 2.8;
  ctx.editorLayoutBounds = null;
  ctx.isFalling = false;
  let fallVelocity = 0;
  let currentSquidIndex = -1;
  let idleAction = null;
  let runAction = null;
  let isAnimatingRun = null;

  // 3-step play-test camera zoom, same isometric angle throughout — each
  // step just zooms the character in closer regardless of facing direction.
  const MOVEMENT_CAMERA_ZOOM_LEVELS = [1, 1.7, 2.6];
  let movementCameraZoomLevel = 0;
  ctx.resetMovementCameraZoom = () => {
    movementCameraZoomLevel = 0;
  };
  const ANIMATION_CROSSFADE_SECONDS = 0.25;

  const characterCollisionRing = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(CHARACTER_RADIUS - 0.03, 0.01), CHARACTER_RADIUS, 32),
    new THREE.MeshBasicMaterial({
      color: '#ff6b6b',
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  characterCollisionRing.rotation.x = -Math.PI / 2;
  characterCollisionRing.renderOrder = 5;
  characterCollisionRing.visible = false;
  ctx.scene.add(characterCollisionRing);

  const interactionRangeRing = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(INTERACTION_RADIUS - 0.03, 0.01), INTERACTION_RADIUS, 48),
    new THREE.MeshBasicMaterial({
      color: '#8fc5ff',
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  interactionRangeRing.rotation.x = -Math.PI / 2;
  interactionRangeRing.renderOrder = 4;
  interactionRangeRing.visible = false;
  ctx.scene.add(interactionRangeRing);

  ctx.updateCharacterCollisionDebug = () => {
    const visible = ctx.currentMode === 'movement';
    characterCollisionRing.visible = visible;
    interactionRangeRing.visible = visible;
    if (visible) {
      characterCollisionRing.position.set(ctx.character.position.x, 0.03, ctx.character.position.z);
      interactionRangeRing.position.set(ctx.character.position.x, 0.025, ctx.character.position.z);
    }
  };

  const destination = new THREE.Vector3();
  // Remaining waypoints after `destination` — populated by setDestination
  // when the A* path has more than one corner to walk through.
  let movementPath = [];
  const movementDirection = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const keyboardDirection = new THREE.Vector3();

  let characterScale = null;

  function fitModelToCharacter(selected) {
    if (!selected || !ctx.loadedModel) return;
    ctx.loadedModel.position.set(0, 0, 0);
    ctx.character.scale.setScalar(1);
    ctx.loadedModel.updateMatrixWorld(true);
    ctx.character.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(selected);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const localCenter = ctx.character.worldToLocal(center.clone());

    if (characterScale === null) {
      const largestDimension = Math.max(size.x, size.y, size.z);
      characterScale = largestDimension > 0 ? 1 / largestDimension : 1;
    }

    ctx.loadedModel.position.x -= localCenter.x;
    ctx.loadedModel.position.z -= localCenter.z;
    ctx.loadedModel.position.y -= localCenter.y - size.y / 2;

    ctx.character.scale.setScalar(characterScale);
    ctx.loadedModel.updateMatrixWorld(true);
  }

  function showSquid(index) {
    const selected = ctx.squidMeshes[index];
    if (!selected) return;
    ctx.squidMeshes.forEach((mesh) => {
      mesh.visible = mesh === selected;
    });
    fitModelToCharacter(selected);
  }

  function applyCharacterPose(moving) {
    if (ctx.squidMeshes.length) {
      const targetIndex = Math.min(moving ? WALK_SQUID_INDEX : IDLE_SQUID_INDEX, ctx.squidMeshes.length - 1);
      if (targetIndex !== currentSquidIndex) {
        currentSquidIndex = targetIndex;
        showSquid(targetIndex);
      }
    }

    if (idleAction && runAction && moving !== isAnimatingRun) {
      isAnimatingRun = moving;
      const active = moving ? runAction : idleAction;
      const inactive = moving ? idleAction : runAction;
      // THREE's fadeIn/fadeOut always ramp from a hard-coded 0 or 1, not the
      // action's current weight — so this must fire once on state change only,
      // never every frame, or the ramp keeps getting reset before it finishes.
      active.reset().fadeIn(ANIMATION_CROSSFADE_SECONDS).play();
      inactive.fadeOut(ANIMATION_CROSSFADE_SECONDS);
    }
  }

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

  ctx.computeEditorLayoutBounds = () => {
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
    if (!ctx.editorLayoutBounds) return false;
    const cellKey = `${Math.floor(position.x)},${Math.floor(position.z)}`;
    const onFloor = ctx.editorLayoutBounds.cellSet.has(cellKey);
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

    const cellSet = ctx.editorLayoutBounds?.cellSet;
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
      applyCharacterPose(true);
      return;
    }
    if (!ctx.isMoving) {
      applyCharacterPose(false);
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
        applyCharacterPose(false);
      }
      return;
    }

    applyCharacterPose(true);
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
      applyCharacterPose(false);
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
      ctx.character.position.y + 0.65,
      ctx.character.position.z,
    );
  };

  ctx.canvas.addEventListener(
    'wheel',
    (event) => {
      if (ctx.currentMode !== 'movement') return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      movementCameraZoomLevel = THREE.MathUtils.clamp(
        movementCameraZoomLevel + direction,
        0,
        MOVEMENT_CAMERA_ZOOM_LEVELS.length - 1,
      );
    },
    { passive: false },
  );

  const CHARACTER_DIRECTORY = '/models/assets/character/';
  const PREFERRED_CHARACTER_FILE = 'sparrow.glb';
  const FALLBACK_CHARACTER_FILE = 'quirky_series_-_free_animals_pack.glb';

  async function resolveCharacterUrl() {
    try {
      const response = await fetch(`${CHARACTER_DIRECTORY}character-index.json`, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        const files = data.files ?? [];
        const file = files.includes(PREFERRED_CHARACTER_FILE) ? PREFERRED_CHARACTER_FILE : files[0];
        if (file) return `${CHARACTER_DIRECTORY}${encodeURIComponent(file)}`;
      }
    } catch (error) {
      console.warn('Character index unavailable, falling back to default character.', error);
    }
    return `${CHARACTER_DIRECTORY}${encodeURIComponent(FALLBACK_CHARACTER_FILE)}`;
  }

  resolveCharacterUrl().then((url) => {
    ctx.loader.load(
      url,
      (gltf) => {
        ctx.loadedModel = gltf.scene;
        const meshes = [];
        ctx.loadedModel.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = true;
          meshes.push(child);
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          if (materials.some((material) => material?.name === 'M_Inkfish')) {
            ctx.squidMeshes.push(child);
          }
        });
        // The bundled animal pack has many characters baked into one file and needs
        // this tag to isolate just the squid meshes. A dedicated single-character
        // file won't have that tag at all, so fall back to showing everything.
        if (ctx.squidMeshes.length > 0) {
          meshes.forEach((mesh) => {
            mesh.visible = ctx.squidMeshes.includes(mesh);
          });
        } else {
          meshes.forEach((mesh) => {
            mesh.visible = true;
          });
        }
        ctx.character.add(ctx.loadedModel);
        if (ctx.squidMeshes.length === 0) {
          fitModelToCharacter(ctx.loadedModel);
        }

        if (gltf.animations.length) {
          ctx.mixer = new THREE.AnimationMixer(ctx.loadedModel);
          const idleClip = gltf.animations.find((clip) => /idle/i.test(clip.name));
          const runClip = gltf.animations.find((clip) => /run/i.test(clip.name));
          if (idleClip && runClip) {
            // Named idle/run pair (e.g. sparrow.glb) — crossfade between them by
            // movement state instead of just playing every clip at once.
            idleAction = ctx.mixer.clipAction(idleClip);
            runAction = ctx.mixer.clipAction(runClip);
            // Leave .weight at its default of 1 for both — fadeIn/fadeOut (used
            // below by applyCharacterPose) multiply their ramp against .weight,
            // so setEffectiveWeight(0) here would permanently pin it to 0 and
            // silently break every future fadeIn.
            idleAction.play();
            runAction.play();
          } else {
            // No recognizable idle/run naming (e.g. the bundled animal pack) —
            // fall back to the old behavior of just playing every clip.
            gltf.animations.forEach((clip) => ctx.mixer.clipAction(clip).play());
          }
        }

        applyCharacterPose(false);
      },
      undefined,
      (error) => {
        console.error(error);
      },
    );
  });

  ctx.canvas.addEventListener('pointerdown', ctx.setDestination);

  const interactionWorldPosition = new THREE.Vector3();
  // Whatever object(s) currently have UI open (the picker's candidates, or
  // the single object behind an open modal) — checked every frame so the UI
  // auto-closes once the player walks out of range of all of them.
  let activeInteractionTargets = [];
  // Runtime-only (not persisted, not networked yet) — which "버튼" objects
  // have been pressed this play-test session. Doors will read this later to
  // decide whether a button-locked opening is unlocked.
  ctx.pressedButtonInstanceIds = new Set();
  // Same idea for password-locked doors — holds the canonical edge object
  // itself (not an id) once its code has been entered correctly this
  // session. An object works fine as a Set key here since it's the exact
  // same reference every time (ctx.resolveCanonicalDoorEdge always returns
  // the one shared edge for a given door).
  ctx.unlockedPasswordDoors = new Set();

  function isWithinInteractionRange(object) {
    object.getWorldPosition(interactionWorldPosition);
    const dx = interactionWorldPosition.x - ctx.character.position.x;
    const dz = interactionWorldPosition.z - ctx.character.position.z;
    return dx * dx + dz * dz <= INTERACTION_RADIUS * INTERACTION_RADIUS;
  }

  function hideInteractionPicker() {
    ctx.interactionPicker.hidden = true;
    ctx.interactionPickerList.innerHTML = '';
  }

  function hideMemoModal() {
    ctx.memoModal.hidden = true;
  }

  function hideChoiceModal() {
    ctx.choiceModal.hidden = true;
    ctx.choiceModalOptions.hidden = false;
    ctx.choiceModalOptions.innerHTML = '';
    ctx.choiceModalResult.hidden = true;
    ctx.choiceModalResult.textContent = '';
  }

  // The door being prompted for right now, if any — { room, edge } using
  // the same clicked-room/canonical-edge split as ctx.selectedDoorEdge in
  // interaction.js (the label/proximity check stays in the player's own
  // room, but the password itself lives on the canonical edge).
  let activePasswordDoor = null;

  function hidePasswordModal() {
    ctx.passwordModal.hidden = true;
    ctx.passwordModalError.hidden = true;
    ctx.passwordModalInput.value = '';
    activePasswordDoor = null;
  }

  ctx.cancelInteractionPicker = () => {
    hideInteractionPicker();
    hideMemoModal();
    hideChoiceModal();
    hidePasswordModal();
    activeInteractionTargets = [];
  };

  function showMemoModal(object) {
    ctx.memoModalText.textContent = object.userData.memoText || '';
    ctx.memoModal.hidden = false;
    activeInteractionTargets = [object];
  }

  function showChoiceModal(object) {
    const options = object.userData.choiceOptions || [];
    ctx.choiceModalOptions.innerHTML = '';
    options.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label || '(제목 없음)';
      button.addEventListener('click', () => {
        ctx.choiceModalOptions.hidden = true;
        ctx.choiceModalResult.hidden = false;
        ctx.choiceModalResult.textContent = option.resultText || '';
      });
      ctx.choiceModalOptions.append(button);
    });
    ctx.choiceModal.hidden = false;
    activeInteractionTargets = [object];
  }

  function showPasswordModal(room, edge) {
    hideMemoModal();
    hideChoiceModal();
    hideInteractionPicker();
    ctx.passwordModalError.hidden = true;
    ctx.passwordModalInput.value = '';
    ctx.passwordModal.hidden = false;
    ctx.passwordModalInput.focus();
    activePasswordDoor = { room, edge };
  }

  function submitPasswordModal() {
    if (!activePasswordDoor) return;
    const { room, edge } = activePasswordDoor;
    const { edge: canonicalEdge } = ctx.resolveCanonicalDoorEdge(room, edge);
    if (ctx.passwordModalInput.value === (canonicalEdge.password || '')) {
      ctx.unlockedPasswordDoors.add(canonicalEdge);
      hidePasswordModal();
      ctx.showCenterToast?.('잠금이 해제됐습니다.', 1400);
    } else {
      ctx.passwordModalError.hidden = false;
      ctx.passwordModalInput.select();
    }
  }

  ctx.memoModalClose.addEventListener('click', ctx.cancelInteractionPicker);
  ctx.choiceModalClose.addEventListener('click', ctx.cancelInteractionPicker);
  ctx.passwordModalClose.addEventListener('click', ctx.cancelInteractionPicker);
  ctx.passwordModalConfirm.addEventListener('click', submitPasswordModal);
  ctx.passwordModalInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submitPasswordModal();
  });

  // Does the actual "interact" action. Memo/choice show real modals; image
  // is still a status-text placeholder until that UI exists.
  function performInteraction(object) {
    hideInteractionPicker();
    if (object.userData.interactionType === 'memo') {
      showMemoModal(object);
      return;
    }
    if (object.userData.interactionType === 'choice') {
      showChoiceModal(object);
      return;
    }
    if (object.userData.interactionType === 'button') {
      ctx.pressedButtonInstanceIds.add(object.userData.instanceId);
      ctx.showCenterToast(`"${object.name}" 버튼을 눌렀습니다.`, 1400);
      return;
    }
    ctx.editorStatus.textContent = `상호작용: ${object.name} (${object.userData.interactionType})`;
    activeInteractionTargets = [object];
  }

  function showInteractionPicker(candidates) {
    ctx.interactionPickerList.innerHTML = '';
    candidates.forEach((object) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = object.name;
      button.addEventListener('click', () => performInteraction(object));
      ctx.interactionPickerList.append(button);
    });
    ctx.interactionPicker.hidden = false;
    activeInteractionTargets = candidates;
  }

  // Finds every interactable object within reach. One candidate interacts
  // immediately; multiple candidates open a picker so the player chooses.
  ctx.tryInteract = () => {
    if (ctx.currentMode !== 'movement') return;
    hideInteractionPicker();
    hideMemoModal();
    hideChoiceModal();

    // Doors aren't in ctx.placedObjects (they're structural, not a placed
    // asset), so they get their own proximity check here rather than
    // joining the object-candidate list below. Only password-locked AND
    // still-locked doors need this — 'none' has nothing to prompt for, and
    // 'button' is unlocked by interacting with the button object itself,
    // not the door.
    const room = ctx.rooms.find((candidate) => candidate.instanceId === ctx.currentRoomInstanceId);
    const nearbyLockedDoor = room?.doorEdges?.find((edge) => {
      const { edge: canonicalEdge } = ctx.resolveCanonicalDoorEdge(room, edge);
      if ((canonicalEdge.lockType || 'none') !== 'password') return false;
      if (isDoorEdgeUnlocked(room, edge)) return false;
      const mid = edgeMidpointXZ(edge);
      const dx = ctx.character.position.x - mid.x;
      const dz = ctx.character.position.z - mid.y;
      return dx * dx + dz * dz <= INTERACTION_RADIUS * INTERACTION_RADIUS;
    });
    if (nearbyLockedDoor) {
      showPasswordModal(room, nearbyLockedDoor);
      return;
    }

    const candidates = [];
    ctx.placedObjects.forEach((object) => {
      if (!object.userData.interactionType) return;
      object.getWorldPosition(interactionWorldPosition);
      const dx = interactionWorldPosition.x - ctx.character.position.x;
      const dz = interactionWorldPosition.z - ctx.character.position.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq <= INTERACTION_RADIUS * INTERACTION_RADIUS) {
        candidates.push({ object, distanceSq });
      }
    });
    candidates.sort((a, b) => a.distanceSq - b.distanceSq);

    if (candidates.length === 0) return;
    if (candidates.length === 1) {
      performInteraction(candidates[0].object);
      return;
    }
    showInteractionPicker(candidates.map((candidate) => candidate.object));
  };

  // Closes whatever interaction UI is open once the player walks out of
  // range of every object it's showing.
  ctx.updateInteractionRange = () => {
    if (activeInteractionTargets.length === 0) return;
    const stillInRange = activeInteractionTargets.some(isWithinInteractionRange);
    if (!stillInRange) ctx.cancelInteractionPicker();
  };

  function isDoorEdgeUnlocked(room, edge) {
    const { edge: canonicalEdge } = ctx.resolveCanonicalDoorEdge(room, edge);
    const lockType = canonicalEdge.lockType || 'none';
    if (lockType === 'none') return true;
    if (lockType === 'button') {
      return (
        canonicalEdge.requiredButtonInstanceId != null &&
        ctx.pressedButtonInstanceIds.has(canonicalEdge.requiredButtonInstanceId)
      );
    }
    if (lockType === 'password') {
      return ctx.unlockedPasswordDoors.has(canonicalEdge);
    }
    return false;
  }

  // Swings the door leaf open on its hinge once its lock condition (of
  // whatever kind — 'none', 'button', eventually 'password') is satisfied,
  // reusing the exact same isDoorEdgeUnlocked check the transition logic
  // uses, so the visual state and the "can I actually walk through" state
  // never disagree.
  const DOOR_OPEN_ANGLE = -Math.PI / 2;
  const DOOR_ANIM_LERP_SPEED = 6;

  ctx.updateDoorAnimations = (delta) => {
    if (ctx.currentMode !== 'movement') return;
    const room = ctx.rooms.find((candidate) => candidate.instanceId === ctx.currentRoomInstanceId);
    if (!room) return;
    (room.doorEdges || []).forEach((edge) => {
      const leaf = edge._doorLeaf;
      if (leaf) {
        const targetAngle = isDoorEdgeUnlocked(room, edge) ? DOOR_OPEN_ANGLE : 0;
        leaf.rotation.y += (targetAngle - leaf.rotation.y) * Math.min(1, delta * DOOR_ANIM_LERP_SPEED);
      }

      // The floor-peek beam (room-doors.js) grows to match how far the door
      // has actually swung open, instead of just popping to a fixed shape —
      // so a door barely cracked open only shows a sliver.
      const beam = edge._peekBeam;
      if (beam && leaf) {
        const openFraction = THREE.MathUtils.clamp(Math.abs(leaf.rotation.y) / Math.abs(DOOR_OPEN_ANGLE), 0, 1);
        if (Math.abs(openFraction - edge._peekOpenFraction) > 0.01) {
          edge._peekOpenFraction = openFraction;
          beam.geometry.dispose();
          beam.geometry = buildPeekBeamGeometry(ctx, edge._peekOutward, openFraction);
        }
      }
    });
  };

  const DOOR_TRANSITION_RADIUS = 0.55;
  const doorMidpoint = new THREE.Vector2();

  // Reuses a scratch Vector2 since this runs every frame — the offset
  // convention itself lives in room-doors.js's edgeMidpoint, the single
  // source of truth shared with room-links.js.
  function edgeMidpointXZ(edge) {
    const { x, z } = edgeMidpoint(edge);
    return doorMidpoint.set(x, z);
  }

  // Which direction is "into the room" from this edge — used to drop the
  // character just past the doorway on the other side instead of exactly on
  // the boundary line (where they'd immediately re-trigger the transition
  // back).
  function edgeInwardOffset(edge, distance) {
    if (edge.side === 'N') return { x: 0, z: distance };
    if (edge.side === 'S') return { x: 0, z: -distance };
    if (edge.side === 'W') return { x: distance, z: 0 };
    return { x: -distance, z: 0 }; // E
  }

  // Rooms aren't spatially continuous (every room.root sits at the same
  // local origin — see rooms.js) — a door doesn't lead to an adjacent
  // position, it swaps which room is "current" and drops the character at
  // the matching doorway on the other side.
  function transitionThroughDoor(room, edge) {
    const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === edge.connectedRoomInstanceId);
    if (!targetRoom || !targetRoom._loaded) return; // directly-linked rooms are eager-loaded; not loaded means data's missing
    const matchedEdge = ctx.findDoorMirrorEdge(room, targetRoom, edge);
    if (!matchedEdge) return;

    const mid = edgeMidpointXZ(matchedEdge);
    const inward = edgeInwardOffset(matchedEdge, 0.8);
    ctx.currentRoomInstanceId = targetRoom.instanceId;
    ctx.applyRoomVisibility();
    ctx.character.position.set(mid.x + inward.x, 0, mid.y + inward.z);
    ctx.editorLayoutBounds = ctx.computeEditorLayoutBounds();
    ctx.isMoving = false;
    movementPath = [];
    ctx.destinationMarker.visible = false;
    // ctx.updateQuarterView lerps the camera toward the character every
    // frame but always looks straight at the character's *current* position
    // — after a teleport that leaves the camera far from where it should be,
    // so for the next several frames it sweeps through a wide arc to catch
    // up (reads as a violent spin). Snapping it straight to the correct
    // isometric offset here skips that entirely.
    ctx.camera.position.copy(ctx.character.position).add(ctx.cameraOffset);
    ctx.camera.lookAt(ctx.character.position.x, ctx.character.position.y + 0.65, ctx.character.position.z);
    ctx.showCenterToast?.(`"${targetRoom.name}"(으)로 이동했습니다.`, 1400);
  }

  // Checked every frame in movement mode — reaching an unlocked doorway
  // transitions immediately, no separate "interact to open" step.
  ctx.updateDoorTransitions = () => {
    if (ctx.currentMode !== 'movement') return;
    const room = ctx.rooms.find((candidate) => candidate.instanceId === ctx.currentRoomInstanceId);
    if (!room) return;

    const nearbyEdge = (room.doorEdges || []).find((edge) => {
      const mid = edgeMidpointXZ(edge);
      const dx = ctx.character.position.x - mid.x;
      const dz = ctx.character.position.z - mid.y;
      return dx * dx + dz * dz < DOOR_TRANSITION_RADIUS * DOOR_TRANSITION_RADIUS;
    });
    if (!nearbyEdge || !isDoorEdgeUnlocked(room, nearbyEdge)) return;
    transitionThroughDoor(room, nearbyEdge);
  };
}
