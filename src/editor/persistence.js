const legacyLayoutStorageKey = 'escape-room-editor-layout-v1';

function isLegacyFlatLayout(saved) {
  return Array.isArray(saved) && saved.length > 0 && typeof saved[0].file === 'string';
}

export function initPersistence(ctx) {
  ctx.layoutStorageKey =
    ctx.mapId && ctx.mapId !== 'default'
      ? `${legacyLayoutStorageKey}:${ctx.mapId}`
      : legacyLayoutStorageKey;

  ctx.serializeLayout = () => ({
    rooms: ctx.rooms.map((room) => {
      const roomObjects = ctx.placedObjects.filter(
        (object) => ctx.getObjectRoomInstanceId(object) === room.instanceId,
      );
      const connectedRooms = roomObjects
        .filter((object) => object.userData.interactionType === 'door' && object.userData.connectedRoomId != null)
        .map((object) => ({
          roomId: `room-${object.userData.connectedRoomId}`,
          doorObjectId: `obj-${object.userData.instanceId}`,
        }));
      const spawnObject = roomObjects.find((object) => object.userData.isSpawnPoint);

      return {
        id: `room-${room.instanceId}`,
        roomName: room.name,
        isStartRoom: room.isStartRoom,
        initialSpawnPos: spawnObject ? spawnObject.position.toArray() : [0, 0, 0],
        connectedRooms,
        objects: roomObjects.map((object) => ({
          id: `obj-${object.userData.instanceId}`,
          name: object.name,
          glbUrl: object.userData.assetUrl,
          transform: {
            position: object.position.toArray(),
            rotation: object.rotation.toArray(),
            scale: object.scale.toArray(),
          },
          castShadow: true,
          receiveShadow: true,
          blocksMovement: object.userData.blocksMovement,
          colliderShape: object.userData.colliderShape,
          useGravity: object.userData.useGravity,
          isSpawnPoint: Boolean(object.userData.isSpawnPoint),
          visible: object.visible,
          collapsed: ctx.collapsedInstanceIds.has(object.userData.instanceId),
          parentObjectId:
            object.userData.parentInstanceId != null ? `obj-${object.userData.parentInstanceId}` : null,
          interaction: object.userData.interactionType
            ? {
                interactionType: object.userData.interactionType,
                bgImageUrl: object.userData.bgImageUrl || null,
                connectedRoomId:
                  object.userData.connectedRoomId != null ? `room-${object.userData.connectedRoomId}` : null,
              }
            : null,
        })),
      };
    }),
  });

  ctx.saveLayout = () => {
    localStorage.setItem(ctx.layoutStorageKey, JSON.stringify(ctx.serializeLayout()));
  };

  function collectRestoreItems(saved) {
    if (isLegacyFlatLayout(saved)) {
      ctx.ensureDefaultRoom();
      return saved.map((item) => ({
        asset: ctx.assetCatalog.find((candidate) => candidate.file === item.file),
        name: item.name,
        position: item.position,
        rotation: item.rotation,
        scale: item.scale,
        roomInstanceId: ctx.currentRoomInstanceId,
        blocksMovement: true,
        colliderShape: 'box',
        useGravity: false,
      }));
    }

    const savedRooms = Array.isArray(saved) ? saved : saved.rooms || [];
    const roomIdMap = new Map();
    ctx.rooms = savedRooms.map((savedRoom, index) => {
      const room = ctx.createRoom(savedRoom.roomName || `방${index + 1}`, Boolean(savedRoom.isStartRoom));
      roomIdMap.set(savedRoom.id, room.instanceId);
      return room;
    });

    const items = [];
    savedRooms.forEach((savedRoom, index) => {
      const room = ctx.rooms[index];
      (savedRoom.objects || []).forEach((item) => {
        const interaction = item.interaction || {};
        items.push({
          asset: item.glbUrl ? ctx.assetCatalog.find((candidate) => candidate.url === item.glbUrl) : null,
          isEmpty: !item.glbUrl,
          isSpawnPoint: Boolean(item.isSpawnPoint),
          name: item.name,
          position: item.transform.position,
          rotation: item.transform.rotation,
          scale: item.transform.scale,
          roomInstanceId: room.instanceId,
          blocksMovement: item.blocksMovement ?? true,
          colliderShape: item.colliderShape ?? 'box',
          useGravity: item.useGravity ?? false,
          interactionType: interaction.interactionType ?? null,
          connectedRoomId: interaction.connectedRoomId ? roomIdMap.get(interaction.connectedRoomId) ?? null : null,
          visible: item.visible ?? true,
          collapsed: Boolean(item.collapsed),
          savedId: item.id,
          parentObjectId: item.parentObjectId ?? null,
        });
      });
    });

    ctx.ensureDefaultRoom();
    ctx.currentRoomInstanceId = ctx.rooms[0].instanceId;
    return items;
  }

  ctx.restoreLayout = async () => {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(ctx.layoutStorageKey) || '[]');
    } catch {
      saved = [];
    }
    const hasData = Array.isArray(saved) ? saved.length > 0 : Boolean(saved?.rooms?.length);
    if (!hasData) {
      ctx.ensureDefaultRoom();
      ctx.syncHierarchy();
      return;
    }

    const items = collectRestoreItems(saved);
    ctx.editorStatus.textContent = `저장된 객체 ${items.length}개를 복원하는 중...`;
    const idMap = new Map();
    for (const item of items) {
      let container = null;
      if (item.isSpawnPoint) {
        container = ctx.addSpawnPoint(item, false);
      } else if (item.isEmpty) {
        container = ctx.addEmptyObject(item, false);
      } else if (item.asset) {
        container = await ctx.addAsset(item.asset, item, false);
      }
      if (container) {
        container.visible = item.visible ?? true;
        if (item.collapsed) ctx.collapsedInstanceIds.add(container.userData.instanceId);
      }
      if (container && item.savedId) idMap.set(item.savedId, container);
    }
    items.forEach((item) => {
      if (!item.parentObjectId) return;
      const child = item.savedId ? idMap.get(item.savedId) : null;
      const parent = idMap.get(item.parentObjectId);
      if (!child || !parent || child === parent) return;
      parent.add(child);
      child.userData.parentInstanceId = parent.userData.instanceId;
    });
    ctx.applyRoomVisibility();
    ctx.selectEditorObject(null);
    ctx.syncHierarchy();
    ctx.editorStatus.textContent = `저장된 객체 ${ctx.placedObjects.length}개를 복원했습니다.`;
  };
}
