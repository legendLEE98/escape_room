import * as THREE from 'three';
import { createCharacterRig } from './character-rig.js';
import { createNameTag } from './name-tag.js';

// Other players in the room: each one is a character rig plus a name tag that
// glides toward the latest position the server relayed, so a stream of ~12
// updates a second reads as smooth movement.
const SMOOTHING = 12; // higher = snappier
// Closer than this to where it should be counts as standing still for the
// walk animation even if the last message said "moving".
const MOVING_EPSILON = 0.03;

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function initRemotePlayers(ctx) {
  const players = new Map();
  // Every map room is drawn at the same origin, so someone in another room
  // would otherwise show up standing inside ours. `room` is the saved id of the
  // map room a player is in (undefined in the lobby, where there's only one).
  let viewerRoom;
  const sameRoom = (player) => player.target != null && player.target.room === viewerRoom;
  function applyVisibility(player) {
    const visible = sameRoom(player);
    player.rig.group.visible = visible;
    player.tag.sprite.visible = visible;
  }

  function add({ id, nickname }) {
    if (players.has(id)) return;
    const rig = createCharacterRig(ctx.loader);
    ctx.scene.add(rig.group);
    const tag = createNameTag(ctx, nickname, rig.group);
    // Hidden until their first position arrives — we don't know where they are yet.
    rig.group.visible = false;
    tag.sprite.visible = false;
    players.set(id, { id, nickname, rig, tag, target: null });
  }

  function move(id, state) {
    const player = players.get(id);
    if (!player) return;
    if (!player.target || player.target.room !== state.room) {
      // First position, or they changed room: appear there instead of sliding
      // in from wherever they were.
      player.rig.group.position.set(state.x, 0, state.z);
      player.rig.group.rotation.y = state.ry;
    }
    player.target = state;
    applyVisibility(player);
  }

  function remove(id) {
    const player = players.get(id);
    if (!player) return;
    player.rig.dispose();
    player.tag.dispose();
    players.delete(id);
  }

  function update(delta) {
    const k = 1 - Math.exp(-SMOOTHING * delta);
    players.forEach((player) => {
      const { group } = player.rig;
      if (player.target) {
        const dx = player.target.x - group.position.x;
        const dz = player.target.z - group.position.z;
        group.position.x += dx * k;
        group.position.z += dz * k;
        group.rotation.y += shortestAngleDelta(group.rotation.y, player.target.ry) * k;
        player.rig.setMoving(player.target.moving && Math.hypot(dx, dz) > MOVING_EPSILON);
      }
      player.rig.update(delta);
      player.tag.update();
    });
  }

  function setViewerRoom(room) {
    viewerRoom = room;
    players.forEach(applyVisibility);
  }

  ctx.remotePlayers = {
    setViewerRoom,
    add,
    move,
    remove,
    update,
    has: (id) => players.has(id),
    ids: () => [...players.keys()],
    get: (id) => players.get(id),
  };
  ctx.addDisposer(() => [...players.keys()].forEach(remove));
}
