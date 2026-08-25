import * as THREE from 'three';

function setSharedNumberField(input, values, precision) {
  const rounded = values.map((value) => Number(value.toFixed(precision)));
  const allEqual = rounded.every((value) => value === rounded[0]);
  input.value = allEqual ? rounded[0].toFixed(precision) : '';
}

export function initInspector(ctx) {
  ctx.multiTransformSnapshot = null;
  ctx.suppressNextCanvasClick = false;

  ctx.updateInspectorFromSelection = () => {
    const count = ctx.multiSelection.size;
    ctx.duplicateButton.disabled = count !== 1;
    ctx.deleteButton.disabled = count === 0;

    ctx.inspectorBody.hidden = count === 0;
    ctx.inspectorEmpty.hidden = count > 0;
    if (count === 0) return;

    const selected = ctx.placedObjects.filter((object) => ctx.multiSelection.has(object.userData.instanceId));

    setSharedNumberField(ctx.inspectorPosX, selected.map((object) => object.position.x), 2);
    setSharedNumberField(ctx.inspectorPosY, selected.map((object) => object.position.y), 2);
    setSharedNumberField(ctx.inspectorPosZ, selected.map((object) => object.position.z), 2);
    setSharedNumberField(
      ctx.inspectorRotX,
      selected.map((object) => THREE.MathUtils.radToDeg(object.rotation.x)),
      1,
    );
    setSharedNumberField(
      ctx.inspectorRotY,
      selected.map((object) => THREE.MathUtils.radToDeg(object.rotation.y)),
      1,
    );
    setSharedNumberField(
      ctx.inspectorRotZ,
      selected.map((object) => THREE.MathUtils.radToDeg(object.rotation.z)),
      1,
    );
    setSharedNumberField(ctx.inspectorScaleX, selected.map((object) => object.scale.x), 2);
    setSharedNumberField(ctx.inspectorScaleY, selected.map((object) => object.scale.y), 2);
    setSharedNumberField(ctx.inspectorScaleZ, selected.map((object) => object.scale.z), 2);

    ctx.inspectorBgImage.value = '';
    const bgImageUrl = count === 1 ? ctx.selectedEditorObject.userData.bgImageUrl || '' : '';
    ctx.inspectorBgPreview.hidden = !bgImageUrl;
    ctx.inspectorBgPreview.src = bgImageUrl;
  };

  ctx.duplicateSelectedObject = async () => {
    if (!ctx.selectedEditorObject || ctx.multiSelection.size !== 1) return;
    const asset = ctx.assetCatalog.find(
      (candidate) => candidate.file === ctx.selectedEditorObject.userData.assetFile,
    );
    if (!asset) return;
    const transform = {
      position: ctx.selectedEditorObject.position.clone().add(new THREE.Vector3(0.5, 0, 0.5)).toArray(),
      rotation: ctx.selectedEditorObject.rotation.toArray(),
      scale: ctx.selectedEditorObject.scale.toArray(),
      roomInstanceId: ctx.selectedEditorObject.userData.roomInstanceId,
    };
    await ctx.addAsset(asset, transform);
  };

  function applyMultiTransformDelta() {
    if (!ctx.multiTransformSnapshot || !ctx.selectedEditorObject) return;
    const primarySnapshot = ctx.multiTransformSnapshot.get(ctx.selectedEditorObject.userData.instanceId);
    if (!primarySnapshot) return;

    const deltaPosition = ctx.selectedEditorObject.position.clone().sub(primarySnapshot.position);
    const deltaQuaternion = ctx.selectedEditorObject.quaternion
      .clone()
      .multiply(primarySnapshot.quaternion.clone().invert());
    const deltaScale = ctx.selectedEditorObject.scale.clone().divide(primarySnapshot.scale);

    ctx.multiTransformSnapshot.forEach((snapshot, instanceId) => {
      if (instanceId === ctx.selectedEditorObject.userData.instanceId) return;
      const object = ctx.placedObjects.find((candidate) => candidate.userData.instanceId === instanceId);
      if (!object) return;
      object.position.copy(snapshot.position.clone().add(deltaPosition));
      object.quaternion.copy(deltaQuaternion.clone().multiply(snapshot.quaternion));
      object.scale.copy(snapshot.scale.clone().multiply(deltaScale));
    });
  }

  ctx.transformControls.addEventListener('dragging-changed', (event) => {
    ctx.orbitControls.enabled = !event.value && ctx.currentMode === 'editor';
    if (event.value) {
      if (ctx.multiSelection.size > 1 && ctx.selectedEditorObject) {
        ctx.multiTransformSnapshot = new Map();
        ctx.placedObjects
          .filter((object) => ctx.multiSelection.has(object.userData.instanceId))
          .forEach((object) => {
            ctx.multiTransformSnapshot.set(object.userData.instanceId, {
              position: object.position.clone(),
              quaternion: object.quaternion.clone(),
              scale: object.scale.clone(),
            });
          });
      } else {
        ctx.multiTransformSnapshot = null;
      }
    } else {
      ctx.multiTransformSnapshot = null;
      ctx.suppressNextCanvasClick = true;
      ctx.saveLayout();
    }
  });

  ctx.transformControls.addEventListener('objectChange', () => {
    applyMultiTransformDelta();
    ctx.updateInspectorFromSelection();
  });

  function applyInspectorVector(component, axis, value) {
    if (ctx.multiSelection.size === 0) return;
    const trimmed = value.trim();
    if (trimmed === '') return;
    const number = Number(trimmed);
    if (Number.isNaN(number)) return;

    ctx.placedObjects
      .filter((object) => ctx.multiSelection.has(object.userData.instanceId))
      .forEach((object) => {
        if (component === 'rotation') {
          object.rotation[axis] = THREE.MathUtils.degToRad(number);
        } else {
          object[component][axis] = number;
        }
      });
    ctx.saveLayout();
  }

  ctx.inspectorPosX.addEventListener('input', (event) => applyInspectorVector('position', 'x', event.target.value));
  ctx.inspectorPosY.addEventListener('input', (event) => applyInspectorVector('position', 'y', event.target.value));
  ctx.inspectorPosZ.addEventListener('input', (event) => applyInspectorVector('position', 'z', event.target.value));
  ctx.inspectorRotX.addEventListener('input', (event) => applyInspectorVector('rotation', 'x', event.target.value));
  ctx.inspectorRotY.addEventListener('input', (event) => applyInspectorVector('rotation', 'y', event.target.value));
  ctx.inspectorRotZ.addEventListener('input', (event) => applyInspectorVector('rotation', 'z', event.target.value));
  ctx.inspectorScaleX.addEventListener('input', (event) => applyInspectorVector('scale', 'x', event.target.value));
  ctx.inspectorScaleY.addEventListener('input', (event) => applyInspectorVector('scale', 'y', event.target.value));
  ctx.inspectorScaleZ.addEventListener('input', (event) => applyInspectorVector('scale', 'z', event.target.value));

  ctx.inspectorBgImage.addEventListener('change', () => {
    if (!ctx.selectedEditorObject) return;
    const file = ctx.inspectorBgImage.files[0];
    if (!file) return;

    const previousUrl = ctx.selectedEditorObject.userData.bgImageUrl;
    if (previousUrl?.startsWith('blob:')) URL.revokeObjectURL(previousUrl);

    const objectUrl = URL.createObjectURL(file);
    ctx.selectedEditorObject.userData.bgImageUrl = objectUrl;
    ctx.inspectorBgPreview.hidden = false;
    ctx.inspectorBgPreview.src = objectUrl;
  });

  ctx.deleteButton.addEventListener('click', () => ctx.removeSelectedObjects());
  ctx.duplicateButton.addEventListener('click', ctx.duplicateSelectedObject);
}
