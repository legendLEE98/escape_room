export function initRooms(ctx) {
  ctx.rooms = [];
  ctx.nextRoomInstanceId = 1;
  ctx.currentRoomInstanceId = null;

  ctx.ensureDefaultRoom = () => {
    if (ctx.rooms.length > 0) return;
    const room = { instanceId: ctx.nextRoomInstanceId++, name: '방1', isStartRoom: true };
    ctx.rooms.push(room);
    ctx.currentRoomInstanceId = room.instanceId;
  };

  ctx.addRoom = () => {
    const room = {
      instanceId: ctx.nextRoomInstanceId++,
      name: `방${ctx.rooms.length + 1}`,
      isStartRoom: ctx.rooms.length === 0,
    };
    ctx.rooms.push(room);
    ctx.currentRoomInstanceId = room.instanceId;
    ctx.syncHierarchy();
    ctx.saveLayout();
  };

  ctx.deleteRoom = (room) => {
    if (ctx.rooms.length <= 1) {
      ctx.editorStatus.textContent = '최소 하나의 방은 있어야 합니다.';
      return;
    }

    const targets = ctx.placedObjects.filter(
      (object) => object.userData.roomInstanceId === room.instanceId,
    );
    const confirmed = window.confirm(
      `"${room.name}" 방을 삭제합니다. 방 안의 오브젝트 ${targets.length}개가 함께 삭제되며 되돌릴 수 없습니다. 계속할까요?`,
    );
    if (!confirmed) return;

    targets.forEach((object) => {
      const index = ctx.placedObjects.indexOf(object);
      if (index >= 0) ctx.placedObjects.splice(index, 1);
      object.removeFromParent();
      ctx.multiSelection.delete(object.userData.instanceId);
    });
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

    ctx.updateInspectorFromSelection();
    ctx.syncHierarchy();
    ctx.saveLayout();
    ctx.editorStatus.textContent = `"${room.name}" 방과 오브젝트 ${targets.length}개를 삭제했습니다.`;
  };

  ctx.selectRoom = (room) => {
    ctx.multiSelection.clear();
    ctx.selectedEditorObject = null;
    ctx.transformControls.detach();
    ctx.currentRoomInstanceId = room.instanceId;
    ctx.updateInspectorFromSelection();
    ctx.syncHierarchyHighlight();
  };
}
