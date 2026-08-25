import { $$ } from '../dom.js';

export function initMode(ctx) {
  ctx.currentMode = 'editor';

  ctx.setTransformMode = (mode) => {
    ctx.transformControls.setMode(mode);
    $$('.tool-button[data-transform]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.transform === mode);
    });
  };

  ctx.setMode = (mode) => {
    ctx.currentMode = mode;
    document.body.dataset.mode = mode;
    const isEditor = mode === 'editor';

    $$('.mode-button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.mode === mode);
    });
    ctx.sidebarLeft.hidden = !isEditor;
    ctx.sidebarRight.hidden = !isEditor;
    ctx.editorHint.hidden = !isEditor;
    ctx.character.visible = !isEditor;
    ctx.destinationMarker.visible = !isEditor && ctx.isMoving;
    ctx.orbitControls.enabled = isEditor;
    ctx.transformControls.enabled = isEditor;
    ctx.transformControls.getHelper().visible = isEditor && Boolean(ctx.selectedEditorObject);

    ctx.floor.visible = isEditor;
    ctx.grid.visible = isEditor;

    ctx.pressedKeys.clear();
    if (isEditor) {
      ctx.applyEditorView(ctx.editorView);
    } else {
      ctx.resetCharacterMovement();
      ctx.editorLayoutBounds = ctx.computeEditorLayoutBounds();
      if (ctx.editorLayoutBounds) {
        ctx.character.position.set(
          (ctx.editorLayoutBounds.min.x + ctx.editorLayoutBounds.max.x) / 2,
          0,
          (ctx.editorLayoutBounds.min.z + ctx.editorLayoutBounds.max.z) / 2,
        );
      }
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
    button.addEventListener('click', () => ctx.setMode(button.dataset.mode));
  });

  $$('.tool-button[data-transform]').forEach((button) => {
    button.addEventListener('click', () => ctx.setTransformMode(button.dataset.transform));
  });

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
      return;
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

    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
    event.preventDefault();
    ctx.pressedKeys.add(event.code);
  });

  window.addEventListener('keyup', (event) => {
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
    ctx.pressedKeys.delete(event.code);
  });

  window.addEventListener('blur', () => ctx.pressedKeys.clear());
  window.addEventListener('resize', () => {
    ctx.renderer.setSize(window.innerWidth, window.innerHeight);
    ctx.updateCameraProjection();
  });
}
