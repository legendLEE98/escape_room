const legacyLayoutStorageKey = 'escape-room-editor-layout-v1';

function isLegacyFlatLayout(saved) {
  return Array.isArray(saved) && saved.length > 0 && typeof saved[0].file === 'string';
}

export function initPersistence(ctx) {
  ctx.layoutStorageKey =
    ctx.mapId && ctx.mapId !== 'default'
      ? `${legacyLayoutStorageKey}:${ctx.mapId}`
      : legacyLayoutStorageKey;

  // A room that was never lazy-loaded has no live THREE.js objects to read from —
  // its only source of truth is the raw JSON it was parsed from (room._savedObjects).
  // Both initialSpawnPos and connectedRooms are themselves *derived* fields (never
  // authored directly), so they're recomputed from that raw JSON here, the same way
  // the loaded branch recomputes them from live objects. Storing them as separate
  // frozen copies instead would create two sources of truth that can drift apart.
  // Wall-opening links made in the room-link panel, independent of the older
  // door-object-based connectedRooms above (that graph comes from placed
  // objects; this one comes from room.doorEdges, set by ctx.buildRoomWalls).
  function serializeDoorEdges(room) {
    return (room.doorEdges || []).map(({ x, z, side, connectedRoomInstanceId }) => ({
      x,
      z,
      side,
      connectedRoomId: connectedRoomInstanceId != null ? `room-${connectedRoomInstanceId}` : null,
    }));
  }

  function serializeUnloadedRoom(room) {
    const savedObjects = room._savedObjects ?? [];
    const spawnItem = savedObjects.find((item) => item.isSpawnPoint);
    const connectedRooms = savedObjects
      .filter((item) => item.interaction?.interactionType === 'door' && item.interaction?.connectedRoomId != null)
      .map((item) => ({ roomId: item.interaction.connectedRoomId, doorObjectId: item.id }));

    return {
      id: `room-${room.instanceId}`,
      roomName: room.name,
      isStartRoom: room.isStartRoom,
      initialSpawnPos: spawnItem ? spawnItem.transform.position : [0, 0, 0],
      floorCells: room.floorCells ?? null,
      doorEdges: serializeDoorEdges(room),
      worldOffset: room.worldOffset ?? { x: 0, z: 0 },
      connectedRooms,
      objects: savedObjects,
    };
  }

  ctx.serializeLayout = () => ({
    rooms: ctx.rooms.map((room) => {
      if (!room._loaded) return serializeUnloadedRoom(room);

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
        floorCells: room.floorCells ?? null,
        doorEdges: serializeDoorEdges(room),
        worldOffset: room.worldOffset ?? { x: 0, z: 0 },
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
          parentObjectId:
            object.userData.parentInstanceId != null ? `obj-${object.userData.parentInstanceId}` : null,
          interaction: object.userData.interactionType
            ? {
                interactionType: object.userData.interactionType,
                bgImageUrl: object.userData.bgImageUrl || null,
                memoText: object.userData.memoText || null,
                choiceOptions: object.userData.choiceOptions || null,
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
      room.worldOffset = savedRoom.worldOffset ?? { x: 0, z: 0 };
      if (savedRoom.floorCells?.length) ctx.buildRoomFloor(room, savedRoom.floorCells);
      // Keep the raw saved objects around so an unopened room can still be
      // round-tripped through save/restore without ever being instantiated —
      // initialSpawnPos/connectedRooms are re-derived from these, not stored separately.
      room._savedObjects = savedRoom.objects || [];
      room._loaded = false;
      roomIdMap.set(savedRoom.id, room.instanceId);
      return room;
    });

    // Walls are built only now, in a second pass — doorEdges reference other
    // rooms by their saved id, which roomIdMap can only resolve once every
    // room above has been created.
    savedRooms.forEach((savedRoom, index) => {
      const room = ctx.rooms[index];
      if (!savedRoom.floorCells?.length) return;
      const doorEdges = (savedRoom.doorEdges || []).map(({ x, z, side, connectedRoomId }) => ({
        x,
        z,
        side,
        connectedRoomInstanceId: connectedRoomId ? roomIdMap.get(connectedRoomId) ?? null : null,
      }));
      ctx.buildRoomWalls(room, savedRoom.floorCells, doorEdges);
    });

    savedRooms.forEach((savedRoom, index) => {
      const room = ctx.rooms[index];
      room._pendingItems = (savedRoom.objects || []).map((item) => {
        const interaction = item.interaction || {};
        return {
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
          bgImageUrl: interaction.bgImageUrl ?? null,
          memoText: interaction.memoText ?? null,
          choiceOptions: interaction.choiceOptions ?? null,
          connectedRoomId: interaction.connectedRoomId ? roomIdMap.get(interaction.connectedRoomId) ?? null : null,
          visible: item.visible ?? true,
          savedId: item.id,
          parentObjectId: item.parentObjectId ?? null,
        };
      });
    });

    ctx.ensureDefaultRoom();
    ctx.currentRoomInstanceId = ctx.rooms[0].instanceId;
    return null;
  }

  // Shared across every room load in this session so parent/child links that
  // cross room boundaries still resolve once both sides have been loaded.
  ctx.crossRoomIdMap = new Map();
  ctx.pendingParentLinks = [];

  function resolvePendingParentLinks() {
    ctx.pendingParentLinks = ctx.pendingParentLinks.filter((link) => {
      const child = ctx.crossRoomIdMap.get(link.savedId);
      const parent = ctx.crossRoomIdMap.get(link.parentObjectId);
      if (!child || !parent || child === parent) return true;
      parent.add(child);
      child.userData.parentInstanceId = parent.userData.instanceId;
      return false;
    });
  }

  ctx.loadRoomContents = async (room) => {
    if (room._loaded) return;
    room._loaded = true;
    const items = room._pendingItems || [];

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
      }
      if (container && item.savedId) ctx.crossRoomIdMap.set(item.savedId, container);
      if (container && item.parentObjectId) {
        ctx.pendingParentLinks.push({ savedId: item.savedId, parentObjectId: item.parentObjectId });
      }
    }

    delete room._pendingItems;
    resolvePendingParentLinks();
  };

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

    if (isLegacyFlatLayout(saved)) {
      const items = collectRestoreItems(saved);
      ctx.editorStatus.textContent = `저장된 객체 ${items.length}개를 복원하는 중...`;
      for (const item of items) {
        if (item.asset) await ctx.addAsset(item.asset, item, false);
      }
      ctx.applyRoomVisibility();
      ctx.selectEditorObject(null);
      ctx.syncHierarchy();
      ctx.editorStatus.textContent = `저장된 객체 ${ctx.placedObjects.length}개를 복원했습니다.`;
      return;
    }

    collectRestoreItems(saved);
    const startRoom = ctx.rooms.find((room) => room.instanceId === ctx.currentRoomInstanceId);
    ctx.editorStatus.textContent = `"${startRoom.name}" 방을 불러오는 중...`;
    await ctx.loadRoomContents(startRoom);
    ctx.applyRoomVisibility();
    ctx.selectEditorObject(null);
    ctx.syncHierarchy();
    ctx.editorStatus.textContent = `"${startRoom.name}" 방을 복원했습니다. (다른 방은 선택할 때 불러옵니다)`;
  };
}
