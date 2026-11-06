import * as THREE from 'three';
import { edgeMidpoint } from './room-doors.js';

export const INTERACTION_RADIUS = 1.5;

// The rules for interacting with things: what's within reach, what each kind of
// object does, and password-locked doors. How it's *shown* is up to the screen,
// through `ctx.ui`:
//
//   hideAll()                              close whatever interaction UI is open
//   toast(message, ms)                     brief message
//   status(text)                           optional: quiet status line
//   showMemo({ title, text })
//   showChoice({ title, options })         options: [{ label, resultText }]
//   showPicker({ candidates, onPick })     candidates: [{ id, label }]; onPick(id)
//   showPassword({ onSubmit })             onSubmit(value) -> true if the code was right
//
// Needs initDoorRules and initPlayState to have run.
export function initInteractions(ctx) {
  const objectPosition = new THREE.Vector3();
  // Whatever objects currently have UI open (the picker's candidates, or the
  // one behind an open modal) — checked every frame so the UI closes itself
  // once the player walks out of range of all of them.
  let activeTargets = [];

  const currentRoom = () => ctx.rooms.find((candidate) => candidate.instanceId === ctx.currentRoomInstanceId);

  function distanceSqToCharacter(x, z) {
    const dx = x - ctx.character.position.x;
    const dz = z - ctx.character.position.z;
    return dx * dx + dz * dz;
  }

  function isWithinRange(object) {
    object.getWorldPosition(objectPosition);
    return distanceSqToCharacter(objectPosition.x, objectPosition.z) <= INTERACTION_RADIUS * INTERACTION_RADIUS;
  }

  ctx.cancelInteractionPicker = () => {
    ctx.ui?.hideAll();
    activeTargets = [];
  };

  // The password lives on the door's canonical edge; the player stands at their
  // own room's side of it.
  function submitPassword(room, edge, value) {
    const { edge: canonicalEdge } = ctx.resolveCanonicalDoorEdge(room, edge);
    if (value !== (canonicalEdge.password || '')) return false;
    ctx.playState.unlockDoor(ctx.playState.doorKey(canonicalEdge));
    ctx.ui.toast('잠금이 해제됐습니다.', 1400);
    return true;
  }

  function performInteraction(object) {
    const { ui } = ctx;
    ui.hideAll();
    const type = object.userData.interactionType;
    if (type === 'memo') {
      activeTargets = [object];
      ui.showMemo({ title: object.name, text: object.userData.memoText || '' });
      return;
    }
    if (type === 'choice') {
      activeTargets = [object];
      ui.showChoice({ title: object.name, options: object.userData.choiceOptions || [] });
      return;
    }
    if (type === 'button') {
      ctx.playState.pressButton(ctx.playState.buttonKey(object));
      ui.toast(`"${object.name}" 버튼을 눌렀습니다.`, 1400);
      return;
    }
    ui.status?.(`상호작용: ${object.name} (${type})`);
    activeTargets = [object];
  }

  // Finds every interactable object within reach. One candidate interacts
  // immediately; several open a picker so the player chooses.
  ctx.tryInteract = () => {
    if (ctx.currentMode !== 'movement') return;
    const { ui } = ctx;
    ui.hideAll();
    activeTargets = [];

    // Doors aren't in ctx.placedObjects (they're structural), so they get their
    // own proximity check. Only still-locked password doors need it: 'none' has
    // nothing to prompt for, and 'button' is unlocked via the button object.
    const room = currentRoom();
    const lockedDoor = room?.doorEdges?.find((edge) => {
      const { edge: canonicalEdge } = ctx.resolveCanonicalDoorEdge(room, edge);
      if ((canonicalEdge.lockType || 'none') !== 'password') return false;
      if (ctx.isDoorEdgeUnlocked(room, edge)) return false;
      const mid = edgeMidpoint(edge);
      return distanceSqToCharacter(mid.x, mid.z) <= INTERACTION_RADIUS * INTERACTION_RADIUS;
    });
    if (lockedDoor) {
      ui.showPassword({ onSubmit: (value) => submitPassword(room, lockedDoor, value) });
      return;
    }

    const candidates = [];
    ctx.placedObjects.forEach((object) => {
      if (!object.userData.interactionType) return;
      // Every room's root sits at the same origin, so without this an object in
      // a hidden room could be "within reach".
      if (ctx.getObjectRoomInstanceId(object) !== ctx.currentRoomInstanceId) return;
      object.getWorldPosition(objectPosition);
      const distanceSq = distanceSqToCharacter(objectPosition.x, objectPosition.z);
      if (distanceSq <= INTERACTION_RADIUS * INTERACTION_RADIUS) candidates.push({ object, distanceSq });
    });
    candidates.sort((a, b) => a.distanceSq - b.distanceSq);

    if (candidates.length === 0) return;
    if (candidates.length === 1) {
      performInteraction(candidates[0].object);
      return;
    }
    const objects = candidates.map((candidate) => candidate.object);
    activeTargets = objects;
    ui.showPicker({
      candidates: objects.map((object, index) => ({ id: index, label: object.name })),
      onPick: (id) => performInteraction(objects[id]),
    });
  };

  // Closes whatever interaction UI is open once the player walks out of range
  // of every object it's showing.
  ctx.updateInteractionRange = () => {
    if (activeTargets.length === 0) return;
    if (!activeTargets.some(isWithinRange)) ctx.cancelInteractionPicker();
  };
}
