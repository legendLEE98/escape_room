import * as THREE from 'three';
import { $$ } from '../dom.js';

export function initMode(ctx) {
  ctx.currentMode = 'editor';
  ctx.isShiftHeld = false;

  ctx.updateGizmoVisibility = () => {
    const isEditor = ctx.currentMode === 'editor';
    ctx.transformControls.enabled = isEditor && !ctx.isShiftHeld;
    ctx.transformControls.getHelper().visible =
      isEditor && !ctx.isShiftHeld && Boolean(ctx.selectedEditorObject);
  };

  ctx.setTransformMode = (mode) => {
    ctx.transformControls.setMode(mode);
    $$('.tool-button[data-transform]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.transform === mode);
    });
  };

  ctx.setMode = (mode) => {
    ctx.currentMode = mode;
    ctx.cancelInteractionPicker?.();
    document.body.dataset.mode = mode;
    const isEditor = mode === 'editor';
    const isMovement = mode === 'movement';
    const isRoomBuilder = mode === 'roomBuilder';

    $$('.mode-button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.mode === mode);
    });
    ctx.sidebarLeft.hidden = !isEditor;
    ctx.sidebarRight.hidden = !isEditor;
    ctx.editorHint.hidden = !isEditor;
    ctx.viewSwitch.hidden = !isEditor;
    ctx.modeSwitch.hidden = isRoomBuilder;
    ctx.roomBuilderPanel.hidden = !isRoomBuilder;
    ctx.roomBuilderNamePanel.hidden = !isRoomBuilder;
    ctx.character.visible = isMovement;
    ctx.destinationMarker.visible = isMovement && ctx.isMoving;
    ctx.orbitControls.enabled = isEditor || isRoomBuilder;
    ctx.orbitControls.mouseButtons.LEFT = isRoomBuilder ? null : THREE.MOUSE.PAN;
    ctx.orbitControls.enableRotate = !isRoomBuilder;
    ctx.updateGizmoVisibility();
    ctx.selectionOutlineGroup.visible = isEditor;

    ctx.floor.visible = isEditor || isRoomBuilder;
    ctx.grid.visible = isEditor || isRoomBuilder;

    if (isMovement) {
      ctx.placedObjects
        .filter((object) => object.userData.isSpawnPoint && object.visible)
        .forEach((object) => {
          object.visible = false;
          object.userData.hiddenForModeSwitch = true;
        });
    } else {
      ctx.placedObjects
        .filter((object) => object.userData.isSpawnPoint && object.userData.hiddenForModeSwitch)
        .forEach((object) => {
          object.visible = true;
          delete object.userData.hiddenForModeSwitch;
        });
    }

    ctx.pressedKeys.clear();
    if (isRoomBuilder) {
      ctx.applyEditorView('top');
    } else if (isEditor) {
      ctx.applyEditorView(ctx.editorView);
    } else {
      ctx.resetCharacterMovement();
      ctx.editorLayoutBounds = ctx.computeEditorLayoutBounds();

      const spawnPoint = ctx.placedObjects.find(
        (object) =>
          object.userData.isSpawnPoint && ctx.getObjectRoomInstanceId(object) === ctx.currentRoomInstanceId,
      );

      if (spawnPoint) {
        ctx.character.position.set(spawnPoint.position.x, 0, spawnPoint.position.z);
        ctx.character.rotation.y = spawnPoint.rotation.y;
      } else if (ctx.editorLayoutBounds) {
        const centerX = (ctx.editorLayoutBounds.min.x + ctx.editorLayoutBounds.max.x) / 2;
        const centerZ = (ctx.editorLayoutBounds.min.z + ctx.editorLayoutBounds.max.z) / 2;
        const spawn = ctx.findValidSpawnPosition(centerX, centerZ);
        ctx.character.position.set(spawn.x, 0, spawn.z);
      }
      ctx.startCharacterFall();
      // Editor-mode mouse-wheel zoom (orbitControls.zoom) otherwise carries
      // over untouched into movement mode, so the play-test view would look
      // different depending on whatever zoom level was left over from editing.
      ctx.camera.zoom = 1;
      ctx.resetMovementCameraZoom();
      ctx.camera.position.copy(ctx.character.position).add(ctx.cameraOffset);
      ctx.camera.lookAt(
        ctx.character.position.x,
        ctx.character.position.y + 0.65,
        ctx.character.position.z,
      );
    }
    ctx.updateCameraProjection();
  };

  $$('.mode-button').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.mode === 'roomBuilder') ctx.startRoomEditor();
      else ctx.setMode(button.dataset.mode);
    });
  });

  $$('.tool-button[data-transform]').forEach((button) => {
    button.addEventListener('click', () => ctx.setTransformMode(button.dataset.transform));
  });

  window.addEventListener('keydown', (event) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    if (event.key === 'Shift' && !ctx.isShiftHeld) {
      ctx.isShiftHeld = true;
      ctx.updateGizmoVisibility();
    }

    if (ctx.currentMode === 'editor') {
      if (event.code === 'KeyQ') ctx.setTransformMode('translate');
      if (event.code === 'KeyE') ctx.setTransformMode('rotate');
      if (event.code === 'KeyR') ctx.setTransformMode('scale');
      if (event.code === 'Delete') ctx.removeSelectedObjects();
      if (event.code === 'F2') {
        event.preventDefault();
        ctx.renameSelectedObject();
      }
    }

    if (ctx.currentMode === 'movement') {
      if (event.code === 'KeyG') ctx.tryInteract();
      if (event.code === 'Escape') ctx.cancelInteractionPicker();
    }

    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
    event.preventDefault();
    ctx.pressedKeys.add(event.code);
  });

  window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') {
      ctx.isShiftHeld = false;
      ctx.updateGizmoVisibility();
    }

    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
    ctx.pressedKeys.delete(event.code);
  });

  window.addEventListener('blur', () => {
    ctx.pressedKeys.clear();
    ctx.isShiftHeld = false;
    ctx.updateGizmoVisibility();
  });
  window.addEventListener('resize', () => {
    ctx.renderer.setSize(window.innerWidth, window.innerHeight);
    ctx.updateCameraProjection();
  });
}
