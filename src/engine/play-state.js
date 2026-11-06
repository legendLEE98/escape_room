// What the players have done so far that changes the world: which buttons are
// pressed and which doors have been unlocked. Everything is keyed by stable
// string ids (not per-session instance numbers) so the same state can be
// shared between players' browsers and survive a reload.
//
// Changes made *here* call `onLocalChange(kind, key)` so a networked caller can
// send them on; changes that *arrive* from elsewhere go through applyRemote()
// and are not echoed back.
export function initPlayState(ctx) {
  const pressedButtons = new Set();
  const unlockedDoors = new Set();
  let nextLocalEdgeKey = 1;

  const state = {
    onLocalChange: null,

    // A button object's id: its saved id when it came from a layout, else a
    // per-session fallback (objects placed during this editing session).
    buttonKey: (object) => object.userData.savedId ?? `obj:${object.userData.instanceId}`,

    // The button a door needs. An edge records it by live instance id once the
    // button's room has loaded, and by saved id before that — both must land on
    // the same key the button object itself reports.
    requiredButtonKey(edge) {
      if (edge.requiredButtonInstanceId != null) {
        const object = ctx.placedObjects.find((o) => o.userData.instanceId === edge.requiredButtonInstanceId);
        if (object) return state.buttonKey(object);
      }
      return edge.requiredButtonSavedId ?? null;
    },

    // A door's id: its doorId, or a per-session key for edges that predate doorIds.
    doorKey(canonicalEdge) {
      if (canonicalEdge.doorId) return canonicalEdge.doorId;
      canonicalEdge._localKey ??= `edge:${nextLocalEdgeKey++}`;
      return canonicalEdge._localKey;
    },

    isButtonPressed: (key) => pressedButtons.has(key),
    isDoorUnlocked: (key) => unlockedDoors.has(key),

    pressButton(key) {
      if (pressedButtons.has(key)) return;
      pressedButtons.add(key);
      state.onLocalChange?.('button', key);
    },
    unlockDoor(key) {
      if (unlockedDoors.has(key)) return;
      unlockedDoors.add(key);
      state.onLocalChange?.('unlock', key);
    },

    // Applies a change someone else made, or a full snapshot (late joiner).
    applyRemote(kind, key) {
      (kind === 'button' ? pressedButtons : unlockedDoors).add(key);
    },
    applySnapshot({ pressedButtons: buttons = [], unlockedDoors: doors = [] } = {}) {
      buttons.forEach((key) => pressedButtons.add(key));
      doors.forEach((key) => unlockedDoors.add(key));
    },

    reset() {
      pressedButtons.clear();
      unlockedDoors.clear();
    },
  };

  ctx.playState = state;
}
