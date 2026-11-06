import * as THREE from 'three';
import { $$ } from '../dom.js';

export function initMode(ctx) {
  ctx.currentMode = 'editor';
  ctx.isShiftHeld = false;

  let toastHideTimer = null;
  ctx.addDisposer(() => clearTimeout(toastHideTimer));
  ctx.showCenterToast = (message, durationMs = 2600) => {
    ctx.centerToastText.textContent = message;
    ctx.centerToast.hidden = false;
    ctx.centerToast.classList.remove('center-toast-out');
    clearTimeout(toastHideTimer);
    toastHideTimer = setTimeout(() => {
      ctx.centerToast.classList.add('center-toast-out');
      setTimeout(() => {
        ctx.centerToast.hidden = true;
      }, 200);
    }, durationMs);
  };

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
    const isRoomBuilder = mode === 'roomBuilder'; // 타일 수정
    const isRoomLink = mode === 'roomLink'; // 방 연결
    const isRoomEditing = isRoomBuilder || isRoomLink; // what the two share: top view, room list, no object editing

    // A mode button was pressed. Leaving a room-editing mode drops the room draft
  // (asking first if tile changes weren't applied); entering one loads the
  // current room into it.
  ctx.requestMode = (mode) => {
    const from = ctx.currentMode;
    if (mode === from) return;
    const fromRoomEditing = from === 'roomBuilder' || from === 'roomLink';
    const toRoomEditing = mode === 'roomBuilder' || mode === 'roomLink';
    if (fromRoomEditing && ctx.isRoomDraftDirty?.() && !window.confirm('적용하지 않은 타일 변경이 사라집니다. 계속할까요?')) {
      return;
    }
    if (toRoomEditing) {
      ctx.startRoomEditor(mode);
      return;
    }
    if (fromRoomEditing) ctx.leaveRoomEditing();
    ctx.setMode(mode);
  };

  $$('.mode-button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.mode === mode);
    });
    ctx.sidebarLeft.hidden = !isEditor;
    ctx.sidebarRight.hidden = !isEditor;
    ctx.editorHint.hidden = !isEditor;
    ctx.viewSwitch.hidden = !isEditor;
    // Drawing a brand-new room (nothing being edited yet) is its own flow with
    // its own apply/cancel; the mode tabs only make sense for an existing room.
    ctx.modeSwitch.hidden = isRoomEditing && ctx.editingRoomInstanceId == null;
    ctx.roomBuilderPanel.hidden = !isRoomBuilder;
    ctx.roomBuilderNamePanel.hidden = !isRoomBuilder;
    ctx.roomTexturePanel.hidden = !isRoomBuilder;
    ctx.roomLinkPanel.hidden = !isRoomLink;
    ctx.roomListPanel.hidden = !isRoomEditing;
    if (isRoomEditing) ctx.renderRoomBuilderRoomList?.();
    if (isRoomLink) {
      ctx.renderRoomLinkPanel();
    } else if (isRoomBuilder) {
      ctx.cancelDoorEdgePicking?.();
      ctx.hideRoomLinkVisuals?.();
    } else if (isEditor) {
      ctx.cancelDoorEdgePicking?.();
      ctx.refreshRoomLinkGhostsForCurrentRoom?.();
      // Doors are added/removed in room-builder mode; the interaction tab's
      // list of this room's doors would otherwise still show the old ones.
      ctx.updateInteractionFromSelection?.();
    } else {
      ctx.hideRoomLinkVisuals?.();
    }
    ctx.character.visible = isMovement;
    ctx.destinationMarker.visible = isMovement && ctx.isMoving;
    ctx.orbitControls.enabled = isEditor || isRoomEditing;
    ctx.orbitControls.mouseButtons.LEFT = isRoomEditing ? null : THREE.MOUSE.PAN;
    ctx.orbitControls.enableRotate = !isRoomEditing;
    ctx.updateGizmoVisibility();
    ctx.selectionOutlineGroup.visible = isEditor;

    ctx.floor.visible = isEditor || isRoomEditing;
    ctx.grid.visible = isEditor || isRoomEditing;

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
    if (isRoomEditing) {
      ctx.applyEditorView('top');
    } else if (isEditor) {
      ctx.applyEditorView(ctx.editorView);
    } else {
      ctx.playState.reset();
      ctx.spawnLocalPlayer();
    }
    ctx.updateCameraProjection();
  };

  $$('.mode-button').forEach((button) => {
    button.addEventListener('click', () => {
      ctx.requestMode(button.dataset.mode);
    });
  });

  $$('.tool-button[data-transform]').forEach((button) => {
    button.addEventListener('click', () => ctx.setTransformMode(button.dataset.transform));
  });

  ctx.listen(window, 'keydown', (event) => {
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

  ctx.listen(window, 'keyup', (event) => {
    if (event.key === 'Shift') {
      ctx.isShiftHeld = false;
      ctx.updateGizmoVisibility();
    }

    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
    ctx.pressedKeys.delete(event.code);
  });

  ctx.listen(window, 'blur', () => {
    ctx.pressedKeys.clear();
    ctx.isShiftHeld = false;
    ctx.updateGizmoVisibility();
  });
}
