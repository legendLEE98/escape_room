import * as THREE from 'three';

const modelHeadingCorrection = THREE.MathUtils.degToRad(-17);

export function initMovement(ctx) {
  ctx.mixer = null;
  ctx.squidMeshes = [];
  ctx.loadedModel = null;
  ctx.isMoving = false;
  ctx.characterSpeed = 2.8;
  ctx.editorLayoutBounds = null;

  const destination = new THREE.Vector3();
  const movementDirection = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const keyboardDirection = new THREE.Vector3();

  function centerSelectedSquid(selected) {
    if (!selected || !ctx.loadedModel) return;
    ctx.loadedModel.position.set(0, 0, 0);
    ctx.loadedModel.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(selected);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const localCenter = ctx.character.worldToLocal(center.clone());

    ctx.loadedModel.position.x -= localCenter.x;
    ctx.loadedModel.position.z -= localCenter.z;
    ctx.loadedModel.position.y -= localCenter.y - size.y / 2;

    const largestDimension = Math.max(size.x, size.y, size.z);
    if (largestDimension > 0) ctx.character.scale.setScalar(1.35 / largestDimension);
    ctx.loadedModel.updateMatrixWorld(true);
  }

  function showSquid(index) {
    const selected = ctx.squidMeshes[index];
    if (!selected) return;
    ctx.squidMeshes.forEach((mesh) => {
      mesh.visible = mesh === selected;
    });
    centerSelectedSquid(selected);
  }

  ctx.computeEditorLayoutBounds = () => {
    if (ctx.placedObjects.length === 0) return null;
    const box = new THREE.Box3();
    ctx.placedObjects.forEach((object) => box.expandByObject(object));
    return {
      min: new THREE.Vector3(box.min.x - 1, 0, box.min.z - 1),
      max: new THREE.Vector3(box.max.x + 1, 0, box.max.z + 1),
    };
  };

  ctx.isInsideActiveMap = (position) => {
    if (!ctx.editorLayoutBounds) return false;
    return (
      position.x >= ctx.editorLayoutBounds.min.x &&
      position.x <= ctx.editorLayoutBounds.max.x &&
      position.z >= ctx.editorLayoutBounds.min.z &&
      position.z <= ctx.editorLayoutBounds.max.z
    );
  };

  ctx.resetCharacterMovement = () => {
    ctx.character.position.set(0, 0, 0);
    ctx.isMoving = false;
    ctx.pressedKeys.clear();
    ctx.destinationMarker.visible = false;
  };

  function rotateTowardsMovement(delta) {
    const targetRotation =
      Math.atan2(movementDirection.x, movementDirection.z) + modelHeadingCorrection;
    const rotationDifference = Math.atan2(
      Math.sin(targetRotation - ctx.character.rotation.y),
      Math.cos(targetRotation - ctx.character.rotation.y),
    );
    ctx.character.rotation.y += rotationDifference * Math.min(1, delta * 10);
  }

  ctx.setDestination = (event) => {
    if (ctx.currentMode !== 'movement') return;
    ctx.setPointer(event);

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
    if (ctx.currentMode !== 'movement') return false;
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
    if (updateKeyboardMovement(delta) || !ctx.isMoving) return;
    movementDirection.subVectors(destination, ctx.character.position);
    movementDirection.y = 0;
    const remainingDistance = movementDirection.length();

    if (remainingDistance < 0.04) {
      ctx.character.position.copy(destination);
      ctx.isMoving = false;
      ctx.destinationMarker.visible = false;
      return;
    }

    movementDirection.normalize();
    ctx.character.position.addScaledVector(
      movementDirection,
      Math.min(ctx.characterSpeed * delta, remainingDistance),
    );
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

  ctx.loader.load(
    '/models/quirky_series_-_free_animals_pack.glb',
    (gltf) => {
      ctx.loadedModel = gltf.scene;
      ctx.loadedModel.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const isSquid = materials.some((material) => material?.name === 'M_Inkfish');
        child.visible = isSquid;
        if (isSquid) ctx.squidMeshes.push(child);
      });
      ctx.character.add(ctx.loadedModel);

      if (gltf.animations.length) {
        ctx.mixer = new THREE.AnimationMixer(ctx.loadedModel);
        gltf.animations.forEach((clip) => ctx.mixer.clipAction(clip).play());
      }

      if (ctx.squidMeshes.length) showSquid(0);
    },
    undefined,
    (error) => {
      console.error(error);
    },
  );

  ctx.canvas.addEventListener('pointerdown', ctx.setDestination);
}
