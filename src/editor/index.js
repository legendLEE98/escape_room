import * as THREE from 'three';
import { queryEditorDom } from './dom.js';
import { buildSceneObjects } from './core/scene-objects.js';
import { initMode } from './core/mode.js';
import { initCameraView } from './core/camera-view.js';
import { initMovement } from './core/movement.js';
import { initSelectionOutline } from './core/selection-outline.js';
import { initGravity } from './core/gravity.js';
import { initRooms } from './right-sidebar/rooms.js';
import { initRoomBuilder } from './core/room-builder.js';
import { initAssetCatalog } from './assets/catalog.js';
import { initPlacement } from './assets/placement.js';
import { initAssetPreview } from './left-sidebar/asset-preview.js';
import { initAssetBrowser } from './left-sidebar/asset-browser.js';
import { initHierarchy } from './right-sidebar/hierarchy.js';
import { initInteraction } from './right-sidebar/interaction.js';
import { initInspector } from './right-sidebar/inspector.js';
import { initRightTabs } from './right-sidebar/tabs.js';
import { initPersistence } from './persistence.js';

export function createScene(canvas, mapId) {
  const ctx = {
    canvas,
    mapId,
    ...queryEditorDom(),
    ...buildSceneObjects(canvas),
  };

  ctx.raycaster = new THREE.Raycaster();
  ctx.pointer = new THREE.Vector2();
  ctx.pressedKeys = new Set();

  ctx.setPointer = (event) => {
    const bounds = ctx.canvas.getBoundingClientRect();
    ctx.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    ctx.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
  };

  initMode(ctx);
  initCameraView(ctx);
  initMovement(ctx);
  initSelectionOutline(ctx);
  initGravity(ctx);
  initRooms(ctx);
  initAssetCatalog(ctx);
  initPlacement(ctx);
  initAssetPreview(ctx);
  initAssetBrowser(ctx);
  initRoomBuilder(ctx);
  initHierarchy(ctx);
  initInteraction(ctx);
  initInspector(ctx);
  initRightTabs(ctx);
  initPersistence(ctx);

  ctx.setMode('editor');
  ctx.fetchAssetCatalog();

  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(ctx.clock.getDelta(), 0.05);
    ctx.mixer?.update(delta);
    ctx.updateCharacterGravity(delta);
    ctx.updateMovement(delta);
    ctx.updateCharacterCollisionDebug();
    ctx.updateQuarterView(delta);
    ctx.updateEditorCameraMovement(delta);
    if (ctx.currentMode === 'editor' || ctx.currentMode === 'roomBuilder') ctx.orbitControls.update();
    ctx.updateSelectionOutlines();

    ctx.destinationMarker.material.opacity = 0.55 + Math.sin(ctx.clock.elapsedTime * 5) * 0.25;
    ctx.renderer.render(ctx.scene, ctx.camera);

    if (ctx.currentMode === 'editor' && ctx.previewGroup.children.length) {
      ctx.previewGroup.rotation.y += delta * 0.6;
      ctx.previewRenderer.render(ctx.previewScene, ctx.previewCamera);
    }
  }

  animate();

  return undefined;
}
