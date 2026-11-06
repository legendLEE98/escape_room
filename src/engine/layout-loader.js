// Builds a scene from the saved layout JSON (the shape GET /api/maps/:id/layout
// and map_release.layout return): rooms with floors, walls and doors first,
// then each room's objects on demand. Used by the editor's restore and by the
// game client — nothing here touches editor UI.

const ASSET_URL_PREFIX = '/models/assets/';

// A saved item only carries its GLB url. `file` doubles as the template cache
// key and matches the catalog's own keys (url minus the assets prefix), so a
// file already loaded through the editor catalog is reused.
function assetFromUrl(url, label) {
  const file = url.startsWith(ASSET_URL_PREFIX) ? decodeURIComponent(url.slice(ASSET_URL_PREFIX.length)) : url;
  return { file, url, label };
}

export function initLayoutLoader(ctx) {
  // Rooms whose objects are still streaming in. The editor's autosave waits
  // for this to reach 0 so it never saves a half-loaded room.
  ctx.roomLoadsInFlight = 0;

  ctx.buildRoomsFromLayout = (saved) => {
    const savedRooms = saved.rooms || [];
    const roomIdMap = new Map();
    ctx.rooms = savedRooms.map((savedRoom, index) => {
      const room = ctx.createRoom(savedRoom.roomName || `방${index + 1}`, Boolean(savedRoom.isStartRoom));
      room.savedId = savedRoom.id; // stable id (what other players refer to this room by)
      room.worldOffset = savedRoom.worldOffset ?? { x: 0, z: 0 };
      if (savedRoom.floorCells?.length) ctx.buildRoomFloor(room, savedRoom.floorCells);
      // Keep the raw saved objects around so an unopened room can still be
      // round-tripped through save/restore without ever being instantiated —
      // initialSpawnPos is re-derived from these, not stored separately.
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
      const doorEdges = (savedRoom.doorEdges || []).map(
        ({ x, z, side, connectedRoomId, doorId, lockType, password, requiredButtonId }) => {
          const edge = {
            x,
            z,
            side,
            connectedRoomInstanceId: connectedRoomId ? roomIdMap.get(connectedRoomId) ?? null : null,
            doorId: doorId || null,
            lockType: lockType || 'none',
            password: password || '',
            // Resolved lazily once the button's own room actually loads and
            // its object gets a live instanceId — see resolvePendingDoorButtonLinks.
            requiredButtonInstanceId: null,
            requiredButtonSavedId: requiredButtonId || null,
          };
          if (requiredButtonId) ctx.pendingDoorButtonLinks.push(edge);
          return edge;
        },
      );
      // Exits are saved apart from doors but live with them at runtime, flagged
      // isExit and leading nowhere, so walls, door models and locks all treat
      // them like any other door.
      (savedRoom.exitEdges || []).forEach(({ x, z, side, exitId, lockType, password, requiredButtonId }) => {
        const edge = {
          x,
          z,
          side,
          isExit: true,
          connectedRoomInstanceId: null,
          doorId: exitId || null,
          lockType: lockType || 'none',
          password: password || '',
          requiredButtonInstanceId: null,
          requiredButtonSavedId: requiredButtonId || null,
        };
        if (requiredButtonId) ctx.pendingDoorButtonLinks.push(edge);
        doorEdges.push(edge);
      });
      ctx.buildRoomWalls(room, savedRoom.floorCells, doorEdges);
    });

    savedRooms.forEach((savedRoom, index) => {
      const room = ctx.rooms[index];
      room._pendingItems = (savedRoom.objects || []).map((item) => {
        const interaction = item.interaction || {};
        return {
          asset: item.glbUrl ? assetFromUrl(item.glbUrl, item.name) : null,
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
          visible: item.visible ?? true,
          savedId: item.id,
          parentObjectId: item.parentObjectId ?? null,
        };
      });
    });

    ctx.ensureDefaultRoom();
    ctx.currentRoomInstanceId = ctx.rooms[0].instanceId;
    return null;
  };

  // Shared across every room load in this session so parent/child links that
  // cross room boundaries still resolve once both sides have been loaded.
  ctx.crossRoomIdMap = new Map();
  ctx.pendingParentLinks = [];
  // Door-edge lock configs referencing a "button" object by its saved id —
  // that object may live in a room that hasn't been opened (lazy-loaded)
  // yet, so the edge just holds requiredButtonSavedId until then.
  ctx.pendingDoorButtonLinks = [];

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

  function resolvePendingDoorButtonLinks() {
    ctx.pendingDoorButtonLinks = ctx.pendingDoorButtonLinks.filter((edge) => {
      const container = ctx.crossRoomIdMap.get(edge.requiredButtonSavedId);
      if (!container) return true;
      edge.requiredButtonInstanceId = container.userData.instanceId;
      return false;
    });
  }

  // loadNeighbors: false is used when THIS call is itself loading a
  // neighbor, so we load one ring of directly-connected rooms out and stop —
  // not the whole connected graph transitively.
  ctx.loadRoomContents = async (room, { loadNeighbors = true } = {}) => {
    if (room._loaded) return;
    room._loaded = true;
    ctx.roomLoadsInFlight += 1;
    try {
      await loadRoomItems(room, loadNeighbors);
    } finally {
      ctx.roomLoadsInFlight -= 1;
    }
  };

  // Rooms directly connected by a door load together with this one — a
  // button-locked door referencing an object in the next room over shouldn't
  // have to wait for the player to separately walk in there. Also called on
  // entering a room, so the ring keeps moving ahead of the player.
  ctx.loadNeighborRooms = async (room) => {
    const neighborRoomIds = new Set(
      (room.doorEdges || []).map((edge) => edge.connectedRoomInstanceId).filter((id) => id != null),
    );
    await Promise.all(
      Array.from(neighborRoomIds).map((id) => {
        const neighbor = ctx.rooms.find((candidate) => candidate.instanceId === id);
        return neighbor ? ctx.loadRoomContents(neighbor, { loadNeighbors: false }) : null;
      }),
    );
  };

  async function loadRoomItems(room, loadNeighbors) {
    const items = room._pendingItems || [];

    for (const item of items) {
      let container = null;
      if (item.isSpawnPoint) {
        container = ctx.createSpawnPointObject(item);
      } else if (item.isEmpty) {
        container = ctx.createEmptyObject(item);
      } else if (item.asset) {
        // A GLB that fails to load is skipped rather than aborting the room.
        container = await ctx.createAssetObject(item.asset, item).catch((error) => {
          console.error(error);
          return null;
        });
      }
      if (container) {
        container.visible = item.visible ?? true;
      }
      if (container && item.savedId) {
        container.userData.savedId = item.savedId;
        ctx.crossRoomIdMap.set(item.savedId, container);
      }
      if (container && item.parentObjectId) {
        ctx.pendingParentLinks.push({ savedId: item.savedId, parentObjectId: item.parentObjectId });
      }
    }

    delete room._pendingItems;
    resolvePendingParentLinks();
    resolvePendingDoorButtonLinks();

    if (loadNeighbors) await ctx.loadNeighborRooms(room);
  }
}
