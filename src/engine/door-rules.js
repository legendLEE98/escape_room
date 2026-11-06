import * as THREE from 'three';
import { buildPeekBeamGeometry, edgeMidpoint } from './room-doors.js';

const DOOR_OPEN_ANGLE = -Math.PI / 2;
const DOOR_ANIM_LERP_SPEED = 6;
const DOOR_TRANSITION_RADIUS = 0.55;

// Which direction is "into the room" from this edge — used to drop the
// character just past the doorway on the other side instead of exactly on the
// boundary line (where they'd immediately re-trigger the transition back).
function edgeInwardOffset(edge, distance) {
  if (edge.side === 'N') return { x: 0, z: distance };
  if (edge.side === 'S') return { x: 0, z: -distance };
  if (edge.side === 'W') return { x: distance, z: 0 };
  return { x: -distance, z: 0 }; // E
}

// The rules for doors: whether one is open, swinging it, and walking through.
// Needs initDoorLinks and initPlayState to have run.
export function initDoorRules(ctx) {
  let exitFired = false;
  const currentRoom = () => ctx.rooms.find((candidate) => candidate.instanceId === ctx.currentRoomInstanceId);

  ctx.isDoorEdgeUnlocked = (room, edge) => {
    const { edge: canonicalEdge } = ctx.resolveCanonicalDoorEdge(room, edge);
    const lockType = canonicalEdge.lockType || 'none';
    if (lockType === 'none') return true;
    if (lockType === 'button') {
      const key = ctx.playState.requiredButtonKey(canonicalEdge);
      return key != null && ctx.playState.isButtonPressed(key);
    }
    if (lockType === 'password') {
      return ctx.playState.isDoorUnlocked(ctx.playState.doorKey(canonicalEdge));
    }
    return false; // 'key' — needs the inventory system
  };

  // Swings the door leaf open on its hinge once its lock condition is met,
  // reusing the exact check the transition logic uses, so what you see and
  // whether you can walk through never disagree.
  ctx.updateDoorAnimations = (delta) => {
    if (ctx.currentMode !== 'movement') return;
    const room = currentRoom();
    if (!room) return;
    (room.doorEdges || []).forEach((edge) => {
      const leaf = edge._doorLeaf;
      if (leaf) {
        const targetAngle = ctx.isDoorEdgeUnlocked(room, edge) ? DOOR_OPEN_ANGLE : 0;
        leaf.rotation.y += (targetAngle - leaf.rotation.y) * Math.min(1, delta * DOOR_ANIM_LERP_SPEED);
      }

      // The floor-peek beam (room-doors.js) grows to match how far the door has
      // actually swung, so a door barely cracked open only shows a sliver.
      const beam = edge._peekBeam;
      if (beam && leaf) {
        const openFraction = THREE.MathUtils.clamp(Math.abs(leaf.rotation.y) / Math.abs(DOOR_OPEN_ANGLE), 0, 1);
        if (Math.abs(openFraction - edge._peekOpenFraction) > 0.01) {
          edge._peekOpenFraction = openFraction;
          beam.geometry.dispose();
          beam.geometry = buildPeekBeamGeometry(ctx, edge._peekOutward, openFraction);
        }
      }
    });
  };

  // Rooms aren't spatially continuous (every room.root sits at the same local
  // origin) — a door doesn't lead to an adjacent position, it swaps which room
  // is "current" and drops the character at the matching doorway on the other
  // side.
  function transitionThroughDoor(room, edge) {
    const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === edge.connectedRoomInstanceId);
    if (!targetRoom || !targetRoom._loaded) return; // directly-linked rooms are eager-loaded; not loaded means data's missing
    const matchedEdge = ctx.findDoorMirrorEdge(room, targetRoom, edge);
    if (!matchedEdge) return;

    const mid = edgeMidpoint(matchedEdge);
    const inward = edgeInwardOffset(matchedEdge, 0.8);
    ctx.currentRoomInstanceId = targetRoom.instanceId;
    ctx.applyRoomVisibility();
    ctx.character.position.set(mid.x + inward.x, 0, mid.z + inward.z);
    ctx.walkableBounds = ctx.computeWalkableBounds();
    ctx.stopMovement();
    // ctx.updateQuarterView lerps the camera toward the character every frame
    // but always looks straight at the character's *current* position — after a
    // teleport that leaves the camera far from where it should be, so for the
    // next several frames it sweeps through a wide arc to catch up (reads as a
    // violent spin). Snapping it straight to the right offset skips that.
    ctx.camera.position.copy(ctx.character.position).add(ctx.cameraOffset);
    ctx.camera.lookAt(ctx.character.position.x, ctx.character.position.y + 0.65, ctx.character.position.z);
    ctx.ui?.toast(`"${targetRoom.name}"(으)로 이동했습니다.`, 1400);
    ctx.loadNeighborRooms(targetRoom);
    ctx.onRoomEntered?.(targetRoom);
  }

  // Checked every frame — reaching an unlocked doorway transitions
  // immediately, no separate "interact to open" step.
  ctx.updateDoorTransitions = () => {
    if (ctx.currentMode !== 'movement') return;
    const room = currentRoom();
    if (!room) return;

    const nearbyEdge = (room.doorEdges || []).find((edge) => {
      const mid = edgeMidpoint(edge);
      const dx = ctx.character.position.x - mid.x;
      const dz = ctx.character.position.z - mid.z;
      return dx * dx + dz * dz < DOOR_TRANSITION_RADIUS * DOOR_TRANSITION_RADIUS;
    });
    if (!nearbyEdge) {
      exitFired = false;
      return;
    }
    if (!ctx.isDoorEdgeUnlocked(room, nearbyEdge)) return;
    if (nearbyEdge.isExit) {
      // Walking into an open exit clears the game — once per approach.
      if (!exitFired) {
        exitFired = true;
        ctx.onExitReached?.(room, nearbyEdge);
      }
      return;
    }
    transitionThroughDoor(room, nearbyEdge);
  };
}
