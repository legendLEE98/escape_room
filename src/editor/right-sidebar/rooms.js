import * as THREE from 'three';

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
    ctx.editorRoot.add(room.root);
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
  };

  ctx.ensureDefaultRoom = () => {
    if (ctx.rooms.length > 0) return;
    const room = createRoom('방1', true);
    ctx.rooms.push(room);
    ctx.currentRoomInstanceId = room.instanceId;
    ctx.applyRoomVisibility();
  };

  ctx.deleteRoom = (room) => {
    if (ctx.rooms.length <= 1) {
      ctx.editorStatus.textContent = '최소 하나의 방은 있어야 합니다.';
      return;
    }

    const targets = ctx.placedObjects.filter(
      (object) => ctx.getObjectRoomInstanceId(object) === room.instanceId,
    );
    const confirmed = window.confirm(
      `"${room.name}" 방을 삭제합니다. 방 안의 오브젝트 ${targets.length}개가 함께 삭제되며 되돌릴 수 없습니다. 계속할까요?`,
    );
    if (!confirmed) return;

    targets.forEach((object) => {
      const index = ctx.placedObjects.indexOf(object);
      if (index >= 0) ctx.placedObjects.splice(index, 1);
      ctx.multiSelection.delete(object.userData.instanceId);
    });
    room.root.removeFromParent();

    if (ctx.selectedEditorObject && !ctx.placedObjects.includes(ctx.selectedEditorObject)) {
      ctx.selectedEditorObject = null;
      ctx.transformControls.detach();
    }

    ctx.rooms = ctx.rooms.filter((candidate) => candidate.instanceId !== room.instanceId);
    if (ctx.rooms.length && !ctx.rooms.some((candidate) => candidate.isStartRoom)) {
      ctx.rooms[0].isStartRoom = true;
    }
    if (ctx.currentRoomInstanceId === room.instanceId) {
      ctx.currentRoomInstanceId = ctx.rooms[0]?.instanceId ?? null;
    }
    ctx.applyRoomVisibility();

    ctx.updateInspectorFromSelection();
    ctx.syncHierarchy();
    ctx.saveLayout();
    ctx.editorStatus.textContent = `"${room.name}" 방과 오브젝트 ${targets.length}개를 삭제했습니다.`;
  };

  ctx.selectRoom = async (room) => {
    ctx.multiSelection.clear();
    ctx.selectedEditorObject = null;
    ctx.transformControls.detach();
    ctx.currentRoomInstanceId = room.instanceId;

    if (!room._loaded) {
      ctx.editorStatus.textContent = `"${room.name}" 방을 불러오는 중...`;
      await ctx.loadRoomContents(room);
      ctx.editorStatus.textContent = `"${room.name}" 방을 불러왔습니다.`;
    }

    ctx.applyRoomVisibility();
    ctx.updateInspectorFromSelection();
    ctx.syncHierarchy();
  };
}
