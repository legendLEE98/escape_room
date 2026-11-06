// Editor-only room operations; the room model itself lives in engine/rooms.js.
export function initEditorRooms(ctx) {
  ctx.onRoomVisibilityApplied = () => {
    if (ctx.currentMode === 'editor') ctx.refreshRoomLinkGhostsForCurrentRoom?.();
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
    ctx.selectedDoorEdge = null;
    ctx.transformControls.detach();
    ctx.currentRoomInstanceId = room.instanceId;

    if (!room._loaded) {
      ctx.editorStatus.textContent = `"${room.name}" 방을 불러오는 중...`;
      await ctx.loadRoomContents(room);
      ctx.editorStatus.textContent = `"${room.name}" 방을 불러왔습니다.`;
    }

    ctx.applyRoomVisibility();
    if (ctx.currentMode === 'editor') ctx.refreshRoomLinkGhostsForCurrentRoom?.();
    ctx.updateInspectorFromSelection();
    ctx.syncHierarchy();
  };
}
