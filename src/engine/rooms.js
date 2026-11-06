import * as THREE from 'three';

// The set of rooms in a scene and which one is shown. Nothing editor-specific:
// the editor builds on this (deleting/selecting rooms), and so does the game.
export function initRooms(ctx) {
  ctx.rooms = [];
  ctx.nextRoomInstanceId = 1;
  ctx.currentRoomInstanceId = null;

  function createRoom(name, isStartRoom) {
    const room = {
      instanceId: ctx.nextRoomInstanceId++,
      name,
      isStartRoom,
      _loaded: true,
      // Where this room sits relative to every other room, in the same
      // shared grid used by floorCells — set by dragging its ghost into
      // place during room-link creation. Unrelated to the isolated-editing
      // trick (room.root itself always renders at local origin while you're
      // editing that specific room); this is purely link/ghost-placement data.
      worldOffset: { x: 0, z: 0 },
    };
    room.root = new THREE.Group();
    room.root.name = name;
    room.root.userData.isRoomRoot = true;
    room.root.userData.roomInstanceId = room.instanceId;
    room.root.visible = false;
    ctx.worldRoot.add(room.root);
    return room;
  }

  ctx.createRoom = createRoom;

  ctx.getObjectRoomInstanceId = (object) => {
    let current = object;
    while (current) {
      if (current.userData.isRoomRoot) return current.userData.roomInstanceId;
      current = current.parent;
    }
    return null;
  };

  ctx.applyRoomVisibility = () => {
    ctx.rooms.forEach((room) => {
      room.root.visible = room.instanceId === ctx.currentRoomInstanceId;
    });
    // Single choke point for "which room is current changed" — every place
    // that flips ctx.currentRoomInstanceId calls this already, so whoever
    // needs to react (the editor refreshes its linked-room ghosts) hooks in
    // here instead of each call site having to remember to.
    ctx.onRoomVisibilityApplied?.();
  };

  ctx.ensureDefaultRoom = () => {
    if (ctx.rooms.length > 0) return;
    const room = createRoom('방1', true);
    ctx.rooms.push(room);
    ctx.currentRoomInstanceId = room.instanceId;
    ctx.applyRoomVisibility();
  };
}
