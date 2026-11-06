const SAVE_INTERVAL_MS = 10000;
const SAVE_RETRY_MS = 5000;

const MANUAL_SAVE_STATUS_HIDE_MS = 2000;

// Autosaves are silent; only manual saves (Ctrl+S) and failures are reported.
const SAVE_STATUS_TEXT = {
  saving: '저장 중...',
  saved: '저장됨',
  error: '저장 실패 — 다시 시도합니다',
};

export function initPersistence(ctx) {
  // text === null hides the overlay. onRetry (optional) shows a retry button
  // for the failed-load case.
  ctx.setEditorLoading = (text, { onRetry = null } = {}) => {
    ctx.editorLoading.hidden = text === null;
    ctx.editorLoadingText.textContent = text ?? '';
    ctx.editorLoadingRetry.hidden = !onRetry;
    ctx.editorLoadingRetry.onclick = onRetry;
  };

  let saveStatusHideTimer = null;
  // state === null hides the indicator. autoHideMs hides it again on its own.
  ctx.setSaveStatus = (state, { autoHideMs = 0 } = {}) => {
    clearTimeout(saveStatusHideTimer);
    ctx.saveStatus.textContent = SAVE_STATUS_TEXT[state] ?? '';
    ctx.saveStatus.dataset.state = state ?? '';
    ctx.saveStatus.hidden = !SAVE_STATUS_TEXT[state];
    if (autoHideMs > 0) {
      saveStatusHideTimer = setTimeout(() => {
        ctx.saveStatus.hidden = true;
      }, autoHideMs);
    }
  };

  // A room that was never lazy-loaded has no live THREE.js objects to read from —
  // its only source of truth is the raw JSON it was parsed from (room._savedObjects).
  // initialSpawnPos is itself a *derived* field (never authored directly), so it's
  // recomputed from that raw JSON here, the same way the loaded branch recomputes
  // it from live objects. Storing it as a separate frozen copy instead would create
  // two sources of truth that can drift apart.
  function serializeDoorEdges(room) {
    return (room.doorEdges || []).filter((edge) => !edge.isExit).map(
      ({
        x,
        z,
        side,
        connectedRoomInstanceId,
        lockType,
        password,
        requiredButtonInstanceId,
        requiredButtonSavedId,
        doorId,
      }) => ({
        x,
        z,
        side,
        connectedRoomId: connectedRoomInstanceId != null ? `room-${connectedRoomInstanceId}` : null,
        // A random UUID, not derived from any per-session counter — unlike
        // room/object instanceIds it needs no remapping on restore.
        doorId: doorId || null,
        lockType: lockType || 'none',
        password: password || '',
        // requiredButtonInstanceId is only ever valid within the current
        // session (object instanceIds are reassigned from 1 on every load,
        // same as room instanceIds), so it's saved as the same stable
        // "obj-N" id used elsewhere (parentObjectId). If it
        // never got resolved this session (its room was never opened),
        // requiredButtonSavedId still carries the original saved id through
        // untouched instead of losing it.
        requiredButtonId:
          requiredButtonInstanceId != null ? `obj-${requiredButtonInstanceId}` : requiredButtonSavedId || null,
      }),
    );
  }

  // Exits are kept in room.doorEdges at runtime (so the door rules, walls and
  // models just work) but saved apart: they lead nowhere, so they don't belong
  // in the list of doors that connect two rooms.
  function serializeExitEdges(room) {
    return (room.doorEdges || [])
      .filter((edge) => edge.isExit)
      .map(({ x, z, side, doorId, lockType, password, requiredButtonInstanceId, requiredButtonSavedId }) => ({
        x,
        z,
        side,
        exitId: doorId || null,
        lockType: lockType || 'none',
        password: password || '',
        requiredButtonId:
          requiredButtonInstanceId != null ? `obj-${requiredButtonInstanceId}` : requiredButtonSavedId || null,
      }));
  }

  function serializeUnloadedRoom(room) {
    const savedObjects = room._savedObjects ?? [];
    const spawnItem = savedObjects.find((item) => item.isSpawnPoint);

    return {
      id: `room-${room.instanceId}`,
      roomName: room.name,
      isStartRoom: room.isStartRoom,
      initialSpawnPos: spawnItem ? spawnItem.transform.position : [0, 0, 0],
      floorCells: room.floorCells ?? null,
      doorEdges: serializeDoorEdges(room),
      exitEdges: serializeExitEdges(room),
      worldOffset: room.worldOffset ?? { x: 0, z: 0 },
      objects: savedObjects,
    };
  }

  ctx.serializeLayout = () => ({
    rooms: ctx.rooms.map((room) => {
      if (!room._loaded) return serializeUnloadedRoom(room);

      const roomObjects = ctx.placedObjects.filter(
        (object) => ctx.getObjectRoomInstanceId(object) === room.instanceId,
      );
      const spawnObject = roomObjects.find((object) => object.userData.isSpawnPoint);

      return {
        id: `room-${room.instanceId}`,
        roomName: room.name,
        isStartRoom: room.isStartRoom,
        initialSpawnPos: spawnObject ? spawnObject.position.toArray() : [0, 0, 0],
        floorCells: room.floorCells ?? null,
        doorEdges: serializeDoorEdges(room),
      exitEdges: serializeExitEdges(room),
        worldOffset: room.worldOffset ?? { x: 0, z: 0 },
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
              }
            : null,
        })),
      };
    }),
  });

  // False until the initial restore from the server has fully succeeded.
  // Saves are ignored while false so a failed/partial load can never be
  // autosaved over the server's real data (every save replaces the whole map).
  ctx.layoutReady = false;

  let saveTimer = null;
  let inFlight = null;
  let dirty = false;
  // True from the first edit until a save of it has been sent successfully.
  let unsaved = false;
  // Exact JSON last confirmed saved (or loaded). A write whose payload is
  // identical — e.g. an object moved and then moved back — is skipped.
  let lastSyncedJson = null;
  // Set by a manual save so the next write reports its progress/result.
  let reportNextWrite = false;

  ctx.addDisposer(() => {
    clearTimeout(saveTimer);
    clearTimeout(saveStatusHideTimer);
  });

  function scheduleWrite(delay) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      writeLayout();
    }, delay);
  }

  function writeLayout({ keepalive = false } = {}) {
    if (!ctx.layoutReady) return Promise.resolve();
    if (inFlight) {
      dirty = true;
      return inFlight;
    }
    // A room whose objects are still streaming in is marked _loaded already,
    // so serializing now would persist it half-empty. Wait for it instead.
    if (ctx.roomLoadsInFlight > 0) {
      scheduleWrite(300);
      return Promise.resolve();
    }

    inFlight = (async () => {
      do {
        dirty = false;
        unsaved = false;
        const report = reportNextWrite;
        reportNextWrite = false;
        if (report) ctx.setSaveStatus('saving');
        try {
          const body = JSON.stringify(ctx.serializeLayout());
          if (body !== lastSyncedJson) {
            const response = await fetch(`/api/maps/${ctx.mapId}/layout`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body,
              keepalive,
            });
            if (!response.ok) throw new Error(`Layout save failed: ${response.status}`);
            lastSyncedJson = body;
          }
          if (report) {
            ctx.setSaveStatus('saved', { autoHideMs: MANUAL_SAVE_STATUS_HIDE_MS });
          } else if (ctx.saveStatus.dataset.state === 'error') {
            ctx.setSaveStatus(null); // an earlier failure just got resolved
          }
        } catch (error) {
          console.error(error);
          ctx.setSaveStatus('error');
          dirty = false;
          unsaved = true;
          scheduleWrite(SAVE_RETRY_MS);
          return;
        }
      } while (dirty);
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  // Call sites invoke this after every single edit. The timer is NOT reset by
  // later edits, so a save goes out at most SAVE_INTERVAL_MS after the first
  // unsaved change even while editing continuously.
  ctx.saveLayout = () => {
    if (!ctx.layoutReady) return;
    unsaved = true;
    if (saveTimer === null) scheduleWrite(SAVE_INTERVAL_MS);
  };

  // Skips the interval wait — manual save (Ctrl+S, manual: true) and leaving
  // the editor (silent).
  ctx.flushLayout = ({ manual = false, keepalive = false } = {}) => {
    if (!ctx.layoutReady) return Promise.resolve();
    clearTimeout(saveTimer);
    saveTimer = null;
    if (manual) reportNextWrite = true;
    if (!unsaved && !inFlight) {
      reportNextWrite = false;
      if (manual) ctx.setSaveStatus('saved', { autoHideMs: MANUAL_SAVE_STATUS_HIDE_MS });
      return Promise.resolve();
    }
    return writeLayout({ keepalive });
  };

  ctx.restoreLayout = async () => {
    ctx.setEditorLoading('맵을 불러오는 중...');
    let saved;
    try {
      const response = await fetch(`/api/maps/${ctx.mapId}/layout`);
      if (!response.ok) throw new Error(`Layout load failed: ${response.status}`);
      saved = await response.json();
    } catch (error) {
      console.error(error);
      // layoutReady stays false on purpose — see its declaration above.
      ctx.setEditorLoading('맵을 불러오지 못했습니다.', { onRetry: () => ctx.restoreLayout() });
      return;
    }

    if (!saved?.rooms?.length) {
      ctx.ensureDefaultRoom();
      ctx.syncHierarchy();
      lastSyncedJson = JSON.stringify(ctx.serializeLayout());
      ctx.layoutReady = true;
      ctx.setEditorLoading(null);
      return;
    }

    try {
      ctx.buildRoomsFromLayout(saved);
      const startRoom = ctx.rooms.find((room) => room.instanceId === ctx.currentRoomInstanceId);
      ctx.setEditorLoading(`"${startRoom.name}" 방을 불러오는 중...`);
      await ctx.loadRoomContents(startRoom);
      ctx.applyRoomVisibility();
      ctx.selectEditorObject(null);
      ctx.syncHierarchy();
      ctx.editorStatus.textContent = `"${startRoom.name}" 방을 복원했습니다. (다른 방은 선택할 때 불러옵니다)`;
      lastSyncedJson = JSON.stringify(ctx.serializeLayout());
      ctx.layoutReady = true;
      ctx.setEditorLoading(null);
    } catch (error) {
      console.error(error);
      ctx.setEditorLoading('맵을 복원하는 중 오류가 발생했습니다. 페이지를 새로고침해 주세요.');
    }
  };
}
