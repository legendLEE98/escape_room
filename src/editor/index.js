import { queryEditorDom } from './dom.js';
import { buildSceneObjects } from '../engine/scene-objects.js';
import { initMode } from './core/mode.js';
import { initCameraView } from './core/camera-view.js';
import { initEditorPlayUi } from './core/play-ui.js';
import { initDoorLabels } from './core/door-labels.js';
import { initDoorLinks } from '../engine/door-links.js';
import { initPlayState } from '../engine/play-state.js';
import { initDoorRules } from '../engine/door-rules.js';
import { initInteractions } from '../engine/interactions.js';
import { initPlayerController } from '../engine/player-controller.js';
import { initLifecycle } from '../engine/lifecycle.js';
import { initInput } from '../engine/input.js';
import { initCameraProjection } from '../engine/camera-projection.js';
import { initSelectionOutline } from './core/selection-outline.js';
import { initGravity } from './core/gravity.js';
import { initEditorRooms } from './right-sidebar/rooms.js';
import { initRooms } from '../engine/rooms.js';
import { initObjectFactory } from '../engine/object-factory.js';
import { initLayoutLoader } from '../engine/layout-loader.js';
import { initRoomDoors } from '../engine/room-doors.js';
import { initRoomView } from '../engine/room-view.js';
import { initAssetLoader } from '../engine/asset-loader.js';
import { initRoomBuilder } from './core/room-builder.js';
import { initRoomLinks } from './right-sidebar/room-links.js';
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

  initLifecycle(ctx);
  initInput(ctx);
  initCameraProjection(ctx);
  ctx.addDisposer(ctx.disposeScene);
  initMode(ctx);
  initCameraView(ctx);
  initPlayerController(ctx);
  initDoorLinks(ctx);
  initPlayState(ctx);
  initDoorRules(ctx);
  initInteractions(ctx);
  initEditorPlayUi(ctx);
  initDoorLabels(ctx);
  initSelectionOutline(ctx);
  initGravity(ctx);
  initRooms(ctx);
  initEditorRooms(ctx);
  initAssetLoader(ctx);
  initAssetCatalog(ctx);
  initObjectFactory(ctx);
  initPlacement(ctx);
  initAssetPreview(ctx);
  initAssetBrowser(ctx);
  initRoomDoors(ctx);
  initRoomView(ctx);
  initRoomBuilder(ctx);
  initRoomLinks(ctx);
  initHierarchy(ctx);
  initInteraction(ctx);
  initInspector(ctx);
  initRightTabs(ctx);
  initLayoutLoader(ctx);
  initPersistence(ctx);

  ctx.setMode('editor');
  ctx.fetchAssetCatalog();

  let animationFrameId = null;
  function animate() {
    animationFrameId = requestAnimationFrame(animate);
    const delta = Math.min(ctx.clock.getDelta(), 0.05);
    ctx.characterRig.update(delta);
    ctx.updateCharacterGravity(delta);
    ctx.updateMovement(delta);
    ctx.updateInteractionRange();
    ctx.updateDoorTransitions();
    ctx.updateDoorAnimations(delta);
    ctx.updateCharacterCollisionDebug();
    ctx.updateQuarterView(delta);
    ctx.updateWallOcclusion(delta);
    ctx.updateDoorLabels();
    ctx.updateEditorCameraMovement(delta);
    if (ctx.currentMode === 'editor' || ctx.currentMode === 'roomBuilder' || ctx.currentMode === 'roomLink') ctx.orbitControls.update();
    ctx.updateSelectionOutlines();

    ctx.destinationMarker.material.opacity = 0.55 + Math.sin(ctx.clock.elapsedTime * 5) * 0.25;
    ctx.renderer.render(ctx.scene, ctx.camera);
  }

  animate();
  ctx.addDisposer(() => cancelAnimationFrame(animationFrameId));

  // Test seam: lets an automated browser read scene state (character position,
  // current room, ...). Only active when localStorage has 'et-debug' set.
  if (globalThis.localStorage?.getItem('et-debug')) window.__et = ctx;

  // Leaving the page mid-debounce would otherwise drop the last edits.
  // keepalive lets the request outlive the page; it's best-effort (browsers
  // cap keepalive bodies at 64KB).
  const flushOnPageHide = () => ctx.flushLayout({ keepalive: true });
  ctx.listen(window, 'pagehide', flushOnPageHide);

  // Works while typing in inputs too (hence not routed through mode.js's
  // keydown handler, which ignores input targets).
  const onSaveShortcut = (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.code !== 'KeyS') return;
    event.preventDefault();
    ctx.flushLayout({ manual: true });
  };
  ctx.listen(window, 'keydown', onSaveShortcut);

  // Leaving the editor: send any unsaved edit, then tear everything down
  // (render loop, window/canvas listeners, both WebGL contexts, timers).
  return () => {
    ctx.flushLayout();
    ctx.dispose();
  };
}
