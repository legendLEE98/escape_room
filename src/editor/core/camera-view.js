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

  ctx.updateCameraProjection = () => {
    const aspect = window.innerWidth / window.innerHeight;
    const viewHeight = ctx.currentMode === 'editor' ? 16 : 10;
    ctx.camera.left = (-viewHeight * aspect) / 2;
    ctx.camera.right = (viewHeight * aspect) / 2;
    ctx.camera.top = viewHeight / 2;
    ctx.camera.bottom = -viewHeight / 2;
    ctx.camera.near = 0.01;
    ctx.camera.far = 200;
    ctx.camera.updateProjectionMatrix();
  };

  ctx.applyEditorView = (view) => {
    ctx.editorView = view;
    $$('.tool-button[data-view]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.view === view);
    });
    if (view === 'top') {
      ctx.camera.position.copy(topCameraPosition);
      ctx.orbitControls.target.set(0, 0, 0);
      ctx.orbitControls.enableRotate = false;
    } else {
      ctx.camera.position.copy(isometricCameraPosition);
      ctx.orbitControls.target.set(0, 0.8, 0);
      ctx.orbitControls.enableRotate = true;
    }
    ctx.orbitControls.update();
    ctx.updateCameraProjection();
  };

  ctx.updateEditorCameraMovement = (delta) => {
    if (ctx.currentMode !== 'editor') return;
    const horizontal =
      Number(ctx.pressedKeys.has('KeyD')) - Number(ctx.pressedKeys.has('KeyA'));
    const vertical =
      Number(ctx.pressedKeys.has('KeyW')) - Number(ctx.pressedKeys.has('KeyS'));
    if (horizontal === 0 && vertical === 0) return;

    ctx.camera.getWorldDirection(editorCameraForward);
    editorCameraForward.y = 0;
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
