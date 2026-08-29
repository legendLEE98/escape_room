import * as THREE from 'three';

const CHARACTER_RADIUS = 0.32;
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

  ctx.updateCharacterCollisionDebug = () => {
    const visible = ctx.currentMode === 'movement';
    characterCollisionRing.visible = visible;
    if (visible) {
      characterCollisionRing.position.set(ctx.character.position.x, 0.03, ctx.character.position.z);
    }
  };

  const destination = new THREE.Vector3();
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
      characterScale = largestDimension > 0 ? 1.35 / largestDimension : 1;
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
    ctx.pressedKeys.clear();
    ctx.destinationMarker.visible = false;
  };

  // sparrow.glb's authored forward axis doesn't match the +Z assumption below —
  // this constant corrects the mismatch. Measured directly from the GLB's
  // bind-pose bone positions (body->tail and wing.L/wing.R symmetry axis
  // independently agree to 0.001deg): local forward sits at -56.0976deg off +Z.
  const CHARACTER_FACING_OFFSET = (56.09761797820096 * Math.PI) / 180;

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

    const objectHits = ctx.raycaster.intersectObjects(ctx.placedObjects, true);
    if (objectHits.length) {
      const object = ctx.findPlacedAncestor(objectHits[0].object);
      if (object?.userData.interactionType === 'door' && object.userData.blocksMovement) {
        object.userData.blocksMovement = false;
        return;
      }
    }

    const hit = ctx.raycaster.intersectObject(ctx.navigationSurface, false)[0];
    if (!hit || !ctx.isInsideActiveMap(hit.point)) return;

    destination.copy(hit.point);
    destination.y = 0;
    ctx.destinationMarker.position.x = destination.x;
    ctx.destinationMarker.position.z = destination.z;
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
      ctx.isMoving = false;
      ctx.destinationMarker.visible = false;
      applyCharacterPose(false);
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
      ctx.destinationMarker.visible = false;
      applyCharacterPose(false);
      return;
    }
    rotateTowardsMovement(delta);
  };

  ctx.updateQuarterView = (delta) => {
    if (ctx.currentMode !== 'movement') return;
    ctx.cameraTarget.copy(ctx.character.position).add(ctx.cameraOffset);
    const cameraLerp = 1 - Math.exp(-5 * delta);
    ctx.camera.position.lerp(ctx.cameraTarget, cameraLerp);
    ctx.camera.lookAt(
      ctx.character.position.x,
      ctx.character.position.y + 0.65,
      ctx.character.position.z,
    );
  };

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
            [idleAction, runAction].forEach((action) => {
              action.play();
              action.setEffectiveWeight(0);
            });
            idleAction.setEffectiveWeight(1);
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
}
