import { buildSceneObjects } from '../engine/scene-objects.js';
import { initLifecycle } from '../engine/lifecycle.js';
import { initInput } from '../engine/input.js';
import { initCameraProjection } from '../engine/camera-projection.js';
import { initRooms } from '../engine/rooms.js';
import { initAssetLoader } from '../engine/asset-loader.js';
import { initObjectFactory } from '../engine/object-factory.js';
import { initRoomDoors } from '../engine/room-doors.js';
import { initRoomView } from '../engine/room-view.js';
import { initPlayerController } from '../engine/player-controller.js';
import { initLayoutLoader } from '../engine/layout-loader.js';
import { createNameTag } from '../engine/name-tag.js';
import { initRemotePlayers } from '../engine/remote-players.js';
import { initDoorLinks } from '../engine/door-links.js';
import { initPlayState } from '../engine/play-state.js';
import { initDoorRules } from '../engine/door-rules.js';
import { initInteractions } from '../engine/interactions.js';

const MOVEMENT_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
const INTERACT_KEY = 'KeyG';
const SPAWN_SPREAD = 1.4;
// How often the local position may be sent, and how much it has to change to
// be worth sending. ~12 updates a second reads as smooth once the receiver
// interpolates, without flooding the server.
const SEND_INTERVAL_MS = 80;
const SEND_POSITION_EPSILON = 0.01;
const SEND_ROTATION_EPSILON = 0.05;
const MOVED_EPSILON_SQ = 1e-6;
const round = (value) => Math.round(value * 1000) / 1000;

// The game client's 3D scene: the engine's shared parts and nothing from the
// editor (no sidebars, hierarchy, gizmos or tools). `layout` is a saved-layout
// JSON — the fixed lobby today, a released map's layout later. `playerName` is
// shown above the local character. `mapPlay` (a real map, not the lobby) turns
// on doors, locks and interactions: { ui, onPlayChange(kind, key), snapshot }
// where `ui` is the interaction UI (see engine/interactions.js), `onPlayChange`
// hears what this player pressed/unlocked ('button' | 'door'), and `snapshot`
// is what the others already did ({ pressed, unlocked }); `onExit()` is called
// when this player walks into an open exit. `onLocalState({x,z,ry,moving})` is called
// (throttled, only when something changed) as the local player moves, for the
// caller to send to the server.
//
// Returns { ctx, ready, sendLocalState, remotePlayers, dispose }. `ready` resolves once the first room is
// built and the player is standing in it; `dispose` stops the render loop and
// releases listeners and the GPU context.
export function createGameScene(canvas, { layout, playerName, onLocalState, mapPlay = null }) {
  const ctx = { canvas, ...buildSceneObjects(canvas, { editorTools: false, sizeToWindow: false }) };

  initLifecycle(ctx);
  ctx.addDisposer(ctx.disposeScene);
  initInput(ctx);

  // The engine's movement and camera code keys off this; a game client is
  // always "playing".
  ctx.currentMode = 'movement';

  initCameraProjection(ctx, { sizeToCanvas: true });
  ctx.resizeViewport();
  initRooms(ctx);
  initAssetLoader(ctx);
  initObjectFactory(ctx);
  initRoomDoors(ctx);
  initRoomView(ctx);
  initPlayerController(ctx);
  initLayoutLoader(ctx);
  initRemotePlayers(ctx);

  if (mapPlay) {
    ctx.ui = mapPlay.ui;
    initDoorLinks(ctx);
    initPlayState(ctx);
    initDoorRules(ctx);
    initInteractions(ctx);
    ctx.playState.applySnapshot({
      pressedButtons: mapPlay.snapshot?.pressed,
      unlockedDoors: mapPlay.snapshot?.unlocked,
    });
    // The server speaks 'door'; the play state says 'unlock'.
    ctx.playState.onLocalChange = (kind, key) => mapPlay.onPlayChange?.(kind === 'button' ? 'button' : 'door', key);
    ctx.onRoomEntered = (room) => {
      ctx.remotePlayers.setViewerRoom(room.savedId);
      sendLocalState(true);
    };
    ctx.onExitReached = () => mapPlay.onExit?.();
    ctx.addDisposer(() => ctx.cancelInteractionPicker());
  }

  ctx.localNameTag = createNameTag(ctx, playerName, ctx.character);
  ctx.addDisposer(() => ctx.localNameTag.dispose());

  ctx.listen(window, 'keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (mapPlay && event.code === 'Escape') {
      ctx.cancelInteractionPicker();
      return;
    }
    if (mapPlay && event.code === INTERACT_KEY) {
      if (!event.repeat) ctx.tryInteract();
      return;
    }
    if (!MOVEMENT_KEYS.includes(event.code)) return;
    event.preventDefault();
    ctx.pressedKeys.add(event.code);
  });
  ctx.listen(window, 'keyup', (event) => ctx.pressedKeys.delete(event.code));
  ctx.listen(window, 'blur', () => ctx.pressedKeys.clear());

  async function start() {
    ctx.buildRoomsFromLayout(layout);
    const startRoom = ctx.rooms.find((room) => room.isStartRoom) ?? ctx.rooms[0];
    ctx.currentRoomInstanceId = startRoom.instanceId;
    await ctx.loadRoomContents(startRoom);
    ctx.applyRoomVisibility();

    if (mapPlay) ctx.remotePlayers.setViewerRoom(startRoom.savedId);

    // Spawn markers are an editing aid; players shouldn't see them.
    ctx.placedObjects.forEach((object) => {
      if (object.userData.isSpawnPoint) object.visible = false;
    });

    ctx.updateCameraProjection();
    // Everyone shares one spawn marker; spread them out a little.
    ctx.spawnLocalPlayer({ jitter: SPAWN_SPREAD });
  }

  // --- local position -> caller (throttled) ---
  let lastSent = null;
  let lastSentAt = 0;
  let previousX = null;
  let previousZ = null;
  let moving = false;

  function localState() {
    const { position, rotation } = ctx.character;
    const state = { x: round(position.x), z: round(position.z), ry: round(rotation.y), moving };
    if (mapPlay) {
      const room = ctx.rooms.find((candidate) => candidate.instanceId === ctx.currentRoomInstanceId);
      if (room?.savedId) state.room = room.savedId;
    }
    return state;
  }

  function sendLocalState(force = false) {
    if (!onLocalState) return;
    const state = localState();
    const now = performance.now();
    if (!force) {
      if (now - lastSentAt < SEND_INTERVAL_MS) return;
      const unchanged =
        lastSent &&
        lastSent.moving === state.moving &&
        lastSent.room === state.room &&
        Math.abs(lastSent.x - state.x) < SEND_POSITION_EPSILON &&
        Math.abs(lastSent.z - state.z) < SEND_POSITION_EPSILON &&
        Math.abs(lastSent.ry - state.ry) < SEND_ROTATION_EPSILON;
      if (unchanged) return;
    }
    lastSent = state;
    lastSentAt = now;
    onLocalState(state);
  }

  function trackLocalMovement() {
    const { x, z } = ctx.character.position;
    if (previousX !== null) {
      const dx = x - previousX;
      const dz = z - previousZ;
      moving = dx * dx + dz * dz > MOVED_EPSILON_SQ;
    }
    previousX = x;
    previousZ = z;
    sendLocalState();
  }

  let animationFrameId = null;
  function animate() {
    animationFrameId = requestAnimationFrame(animate);
    const delta = Math.min(ctx.clock.getDelta(), 0.05);
    ctx.characterRig.update(delta);
    ctx.updateCharacterGravity(delta);
    ctx.updateMovement(delta);
    if (mapPlay) {
      ctx.updateInteractionRange();
      ctx.updateDoorTransitions();
      ctx.updateDoorAnimations(delta);
    }
    ctx.updateQuarterView(delta);
    ctx.updateWallOcclusion(delta);
    ctx.localNameTag.update();
    ctx.remotePlayers.update(delta);
    trackLocalMovement();
    ctx.destinationMarker.material.opacity = 0.55 + Math.sin(ctx.clock.elapsedTime * 5) * 0.25;
    ctx.renderer.render(ctx.scene, ctx.camera);
  }
  animate();
  ctx.addDisposer(() => cancelAnimationFrame(animationFrameId));

  // Test seam, same switch the editor uses.
  if (globalThis.localStorage?.getItem('et-debug')) window.__et = ctx;

  return {
    ctx,
    ready: start(),
    // Push the current position now (e.g. right after joining), regardless of throttling.
    sendLocalState: () => sendLocalState(true),
    remotePlayers: ctx.remotePlayers,
    dispose: () => ctx.dispose(),
  };
}
