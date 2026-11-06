import * as THREE from 'three';
import { $$ } from '../dom.js';

const isometricCameraPosition = new THREE.Vector3(11, 13, 11);
const topCameraPosition = new THREE.Vector3(0.001, 30, 0.001);
const editorCameraSpeed = 10;

export function initCameraView(ctx) {
  ctx.editorView = 'isometric';

  const editorCameraForward = new THREE.Vector3();
  const editorCameraRight = new THREE.Vector3();
  const editorCameraOffset = new THREE.Vector3();

  ctx.applyEditorView = (view) => {
    ctx.editorView = view;
    if (view === 'top') {
      ctx.camera.position.copy(topCameraPosition);
      ctx.orbitControls.target.set(0, 0, 0);
    } else {
      ctx.camera.position.copy(isometricCameraPosition);
      ctx.orbitControls.target.set(0, 0.8, 0);
    }
    ctx.orbitControls.update();
    ctx.updateCameraProjection();
  };

  ctx.updateEditorCameraMovement = (delta) => {
    if (ctx.currentMode !== 'editor' && ctx.currentMode !== 'roomBuilder' && ctx.currentMode !== 'roomLink') return;
    const horizontal =
      Number(ctx.pressedKeys.has('KeyD')) - Number(ctx.pressedKeys.has('KeyA'));
    const vertical =
      Number(ctx.pressedKeys.has('KeyW')) - Number(ctx.pressedKeys.has('KeyS'));
    if (horizontal === 0 && vertical === 0) return;

    ctx.camera.getWorldDirection(editorCameraForward);
    editorCameraForward.y = 0;
    if (editorCameraForward.lengthSq() < 1e-6) {
      // Looking straight down (top view): the forward vector degenerates to ~0 on the
      // ground plane, so derive "screen up" from the camera's actual up axis instead of
      // a fixed world constant — otherwise WASD ignores the camera's real orientation.
      editorCameraForward.setFromMatrixColumn(ctx.camera.matrixWorld, 1);
      editorCameraForward.y = 0;
    }
    if (editorCameraForward.lengthSq() < 1e-6) editorCameraForward.set(0, 0, -1);
    editorCameraForward.normalize();
    editorCameraRight.crossVectors(editorCameraForward, ctx.camera.up).normalize();

    editorCameraOffset
      .set(0, 0, 0)
      .addScaledVector(editorCameraForward, vertical)
      .addScaledVector(editorCameraRight, horizontal)
      .normalize()
      .multiplyScalar(editorCameraSpeed * delta);

    ctx.camera.position.add(editorCameraOffset);
    ctx.orbitControls.target.add(editorCameraOffset);
  };

  $$('.tool-button[data-view]').forEach((button) => {
    button.addEventListener('click', () => ctx.applyEditorView(button.dataset.view));
  });
}
