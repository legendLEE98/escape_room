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
    rooms: ctx.rooms.map((room) => ({
      id: `room-${room.instanceId}`,
      roomName: room.name,
      isStartRoom: room.isStartRoom,
      initialSpawnPos: [0, 0, 0],
      connectedRooms: [],
      objects: ctx.placedObjects
        .filter((object) => object.userData.roomInstanceId === room.instanceId)
        .map((object) => ({
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
          interaction: null,
        })),
    })),
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
    const items = [];
    ctx.rooms = savedRooms.map((savedRoom, index) => {
      const room = {
        instanceId: ctx.nextRoomInstanceId++,
        name: savedRoom.roomName || `방${index + 1}`,
        isStartRoom: Boolean(savedRoom.isStartRoom),
      };
      (savedRoom.objects || []).forEach((item) => {
        items.push({
          asset: ctx.assetCatalog.find((candidate) => candidate.url === item.glbUrl),
          name: item.name,
          position: item.transform.position,
          rotation: item.transform.rotation,
          scale: item.transform.scale,
          roomInstanceId: room.instanceId,
          blocksMovement: item.blocksMovement ?? true,
          colliderShape: item.colliderShape ?? 'box',
          useGravity: item.useGravity ?? false,
        });
      });
      return room;
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
    for (const item of items) {
      if (item.asset) await ctx.addAsset(item.asset, item, false);
    }
    ctx.selectEditorObject(null);
    ctx.syncHierarchy();
    ctx.editorStatus.textContent = `저장된 객체 ${ctx.placedObjects.length}개를 복원했습니다.`;
  };
}
