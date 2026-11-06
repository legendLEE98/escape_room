import * as THREE from 'three';
import { cellKey, edgeKey, computeBoundaryEdges } from '../../engine/room-view.js';

const CELL_HIGHLIGHT_COLOR = 0x8fc5ff;
const PENDING_ADD_COLOR = 0xffd166;
const PENDING_REMOVE_COLOR = 0xff6b6b;

export function initRoomBuilder(ctx) {
  ctx.roomDraftCells = new Map();
  ctx.editingRoomInstanceId = null;
  const cellMeshes = new Map();

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundHit = new THREE.Vector3();

  const previewGroup = new THREE.Group();
  ctx.scene.add(previewGroup);

  const previewGeometry = new THREE.PlaneGeometry(1, 1);
  const previewMaterial = new THREE.MeshBasicMaterial({
    color: CELL_HIGHLIGHT_COLOR,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  });

  const hoverMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
  );
  hoverMesh.rotation.x = -Math.PI / 2;
  hoverMesh.position.y = 0.015;
  hoverMesh.visible = false;
  ctx.scene.add(hoverMesh);

  const pendingGroup = new THREE.Group();
  ctx.scene.add(pendingGroup);
  const pendingGeometry = new THREE.PlaneGeometry(1, 1);
  const pendingAddMaterial = new THREE.MeshBasicMaterial({
    color: PENDING_ADD_COLOR,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  });
  const pendingRemoveMaterial = new THREE.MeshBasicMaterial({
    color: PENDING_REMOVE_COLOR,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  });
  const pendingMeshes = new Map();
  let dragStartCell = null;
  let isDragging = false;
  let dragMode = 'add';

  function pointerToCell(event) {
    ctx.setPointer(event);
    if (!ctx.raycaster.ray.intersectPlane(groundPlane, groundHit)) return null;
    return { x: Math.floor(groundHit.x), z: Math.floor(groundHit.z) };
  }

  function rectCells(a, b) {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minZ = Math.min(a.z, b.z);
    const maxZ = Math.max(a.z, b.z);
    const cells = [];
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        cells.push({ x, z });
      }
    }
    return cells;
  }

  function clearPending() {
    pendingMeshes.forEach((mesh) => pendingGroup.remove(mesh));
    pendingMeshes.clear();
  }

  function updatePending(a, b) {
    const cells = rectCells(a, b);
    const nextKeys = new Set(cells.map(({ x, z }) => cellKey(x, z)));
    pendingMeshes.forEach((mesh, key) => {
      if (nextKeys.has(key)) return;
      pendingGroup.remove(mesh);
      pendingMeshes.delete(key);
    });
    const material = dragMode === 'remove' ? pendingRemoveMaterial : pendingAddMaterial;
    cells.forEach(({ x, z }) => {
      const key = cellKey(x, z);
      if (pendingMeshes.has(key)) return;
      const mesh = new THREE.Mesh(pendingGeometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x + 0.5, 0.022, z + 0.5);
      pendingGroup.add(mesh);
      pendingMeshes.set(key, mesh);
    });
  }

  function addCellMesh(x, z) {
    const mesh = new THREE.Mesh(previewGeometry, previewMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x + 0.5, 0.02, z + 0.5);
    previewGroup.add(mesh);
    cellMeshes.set(cellKey(x, z), mesh);
  }

  function removeCellMesh(x, z) {
    const key = cellKey(x, z);
    const mesh = cellMeshes.get(key);
    if (!mesh) return;
    previewGroup.remove(mesh);
    cellMeshes.delete(key);
  }

  function clearDraft() {
    ctx.roomDraftCells.clear();
    cellMeshes.forEach((mesh) => previewGroup.remove(mesh));
    cellMeshes.clear();
    clearPending();
    hoverMesh.visible = false;
    dragStartCell = null;
    isDragging = false;
  }

  function toggleCell(x, z) {
    const key = cellKey(x, z);
    if (ctx.roomDraftCells.has(key)) {
      ctx.roomDraftCells.delete(key);
      removeCellMesh(x, z);
    } else {
      ctx.roomDraftCells.set(key, { x, z });
      addCellMesh(x, z);
    }
    ctx.updateRoomBuilderStatus();
  }

  function stampCells(cells) {
    cells.forEach(({ x, z }) => {
      const key = cellKey(x, z);
      if (ctx.roomDraftCells.has(key)) return;
      ctx.roomDraftCells.set(key, { x, z });
      addCellMesh(x, z);
    });
    ctx.updateRoomBuilderStatus();
  }

  function eraseCells(cells) {
    cells.forEach(({ x, z }) => {
      const key = cellKey(x, z);
      if (!ctx.roomDraftCells.has(key)) return;
      ctx.roomDraftCells.delete(key);
      removeCellMesh(x, z);
    });
    ctx.updateRoomBuilderStatus();
  }

  ctx.updateRoomBuilderStatus = () => {
    const count = ctx.roomDraftCells.size;
    if (count > 0) {
      ctx.roomBuilderStatus.textContent = `${count}칸 선택됨 — 완료를 눌러 방을 만드세요. 켜진 칸에서 드래그를 시작하면 그 범위를 한 번에 끌 수 있습니다.`;
      ctx.roomBuilderFinishButton.disabled = false;
    } else {
      ctx.roomBuilderStatus.textContent = '클릭으로 칸 하나씩, 드래그로 사각형 범위를 한 번에 켜서 바닥을 그려주세요.';
      ctx.roomBuilderFinishButton.disabled = true;
    }
  };

  ctx.startRoomBuilder = () => {
    ctx.editingRoomInstanceId = null;
    clearDraft();
    ctx.rooms.forEach((room) => {
      room.root.visible = false;
    });
    ctx.roomBuilderNameInput.value = `방${ctx.rooms.length + 1}`;
    ctx.setMode('roomBuilder');
    ctx.updateRoomBuilderStatus();
  };

  // mode: 'roomBuilder' (타일 수정) or 'roomLink' (방 연결) — both work on the
  // current room's draft; only the tools differ.
  ctx.startRoomEditor = (mode = 'roomBuilder') => {
    const room = ctx.rooms.find((candidate) => candidate.instanceId === ctx.currentRoomInstanceId);
    if (!room) {
      ctx.startRoomBuilder();
      return;
    }
    ctx.editingRoomInstanceId = room.instanceId;
    clearDraft();
    (room.floorCells || []).forEach(({ x, z }) => {
      ctx.roomDraftCells.set(cellKey(x, z), { x, z });
      addCellMesh(x, z);
    });
    ctx.roomBuilderNameInput.value = room.name;
    ctx.setMode(mode);
    ctx.updateRoomBuilderStatus();
  };

  // Lets you hop to a different room's floor/wall draft without leaving
  // room-builder mode. Keyed off ctx.currentRoomInstanceId — the same field
  // the editor-mode hierarchy dropdown (ctx.selectRoom) writes to — so both
  // pickers always agree on which room is "current."
  ctx.switchRoomBuilderRoom = async (room) => {
    if (!room || room.instanceId === ctx.currentRoomInstanceId) return;
    // Clear the OLD room's link ghosts/highlights immediately — startRoomEditor
    // (below) only rebuilds them for the new room once it actually runs, and
    // if the target room needs a lazy load first, that leaves an async gap
    // where the previous room's ghosts are still in the scene despite its
    // own geometry already being hidden. Without this, that gap is enough to
    // catch a leftover ghost (with its faded-but-still-real shadow) on screen.
    ctx.hideRoomLinkVisuals?.();
    ctx.currentRoomInstanceId = room.instanceId;
    // startRoomEditor doesn't touch room visibility on its own — it assumes
    // whatever room was already visible (set by applyRoomVisibility back in
    // editor mode) is the one it's now editing, which was always true before
    // this in-place switch existed. Without this call the previously edited
    // room's root (floor/walls/furniture) stays visible and overlaps the new
    // one's draft.
    ctx.applyRoomVisibility();
    if (!room._loaded) await ctx.loadRoomContents(room);
    ctx.startRoomEditor(ctx.currentMode);
  };

  ctx.renderRoomBuilderRoomList = () => {
    ctx.roomBuilderRoomList.innerHTML = '';
    ctx.rooms.forEach((room) => {
      const item = document.createElement('li');
      item.className = 'room-builder-room-list-item';
      item.classList.toggle('is-active', room.instanceId === ctx.currentRoomInstanceId);
      item.textContent = room.name;
      item.addEventListener('click', () => ctx.switchRoomBuilderRoom(room));
      ctx.roomBuilderRoomList.append(item);
    });
  };

  // Drops the room draft and restores normal room visibility (no mode change).
  ctx.leaveRoomEditing = () => {
    ctx.editingRoomInstanceId = null;
    clearDraft();
    ctx.applyRoomVisibility();
  };

  // True when the tiles drawn differ from the room's applied floor.
  ctx.isRoomDraftDirty = () => {
    const room = ctx.rooms.find((candidate) => candidate.instanceId === ctx.editingRoomInstanceId);
    if (!room) return false;
    const applied = new Set((room.floorCells || []).map(({ x, z }) => cellKey(x, z)));
    if (applied.size !== ctx.roomDraftCells.size) return true;
    return [...applied].some((key) => !ctx.roomDraftCells.has(key));
  };

  ctx.cancelRoomBuilder = () => {
    ctx.leaveRoomEditing();
    ctx.setMode('editor');
  };

  ctx.finishRoomBuilder = () => {
    if (ctx.roomDraftCells.size === 0) return;
    const name = ctx.roomBuilderNameInput.value.trim() || `방${ctx.rooms.length + 1}`;
    const cells = Array.from(ctx.roomDraftCells.values());
    const editingRoom =
      ctx.editingRoomInstanceId != null
        ? ctx.rooms.find((candidate) => candidate.instanceId === ctx.editingRoomInstanceId)
        : null;

    const previousDoorEdges = editingRoom?.doorEdges || [];
    const editingWorldOffset = editingRoom?.worldOffset ?? { x: 0, z: 0 };

    // Redrawing the floor can extend it into cells a linked neighbor already
    // occupies in shared world space — the door edge would still "connect"
    // the two rooms, but they'd render stacked on top of each other. Block
    // the edit instead of silently producing that overlap (same check used
    // in room-links.js when a brand new link is first confirmed).
    const overlapsLinkedRoom = previousDoorEdges.some((edge) => {
      const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === edge.connectedRoomInstanceId);
      if (!targetRoom) return false;
      const offsetX = (targetRoom.worldOffset?.x ?? 0) - editingWorldOffset.x;
      const offsetZ = (targetRoom.worldOffset?.z ?? 0) - editingWorldOffset.z;
      return ctx.cellsOverlap(cells, targetRoom.floorCells || [], offsetX, offsetZ);
    });
    if (overlapsLinkedRoom) {
      ctx.showCenterToast('연결된 방과 바닥이 겹쳐요. 겹치는 칸을 지워주세요.');
      return;
    }

    // Erasing the cell a door edge sits on (or otherwise reshaping the floor
    // so that edge falls off the new perimeter) used to silently drop the
    // edge — the door just vanished with no warning, and the connected
    // room's matching entry was left dangling since only this room's list
    // got filtered. Block it instead, the same way an overlap is blocked,
    // and point at the proper way to remove a door (the 방 연결 panel's
    // delete button, which cleans up both sides).
    const newBoundaryKeys = new Set(
      computeBoundaryEdges(cells).map(({ x, z, side }) => edgeKey(x, z, side)),
    );
    const wouldDropDoorEdge = previousDoorEdges.some(
      ({ x, z, side }) => !newBoundaryKeys.has(edgeKey(x, z, side)),
    );
    if (wouldDropDoorEdge) {
      ctx.showCenterToast('문이 있는 칸의 모양은 바꿀 수 없어요. 먼저 방 연결을 삭제해주세요.');
      return;
    }

    let room;
    if (editingRoom) {
      room = editingRoom;
      const oldFloor = room.root.children.find((child) => child.userData.isRoomFloor);
      if (oldFloor) room.root.remove(oldFloor);
      // Old walls/doors are removed by buildRoomWalls itself now.
      room.name = name;
      room.root.name = name;
    } else {
      room = ctx.createRoom(name, ctx.rooms.length === 0);
      ctx.rooms.push(room);
    }

    // wouldDropDoorEdge above already guarantees every entry in
    // previousDoorEdges still sits on the new perimeter.
    const doorEdges = previousDoorEdges;

    ctx.buildRoomFloor(room, cells);
    ctx.buildRoomWalls(room, cells, doorEdges);

    ctx.currentRoomInstanceId = room.instanceId;
    ctx.applyRoomVisibility();
    ctx.editingRoomInstanceId = null;
    clearDraft();
    ctx.syncHierarchy();
    ctx.saveLayout();
    ctx.setMode('editor');
    ctx.editorStatus.textContent = editingRoom
      ? `"${name}" 방을 수정했습니다.`
      : `"${name}" 방을 생성했습니다.`;
  };

  ctx.roomBuilderFinishButton.addEventListener('click', ctx.finishRoomBuilder);
  ctx.roomBuilderCancelButton.addEventListener('click', ctx.cancelRoomBuilder);

  ctx.listen(ctx.canvas, 'pointermove', (event) => {
    if (ctx.currentMode !== 'roomBuilder' || ctx.isPickingDoorEdge || ctx.isPositioningGhost) {
      hoverMesh.visible = false;
      return;
    }
    const cell = pointerToCell(event);
    if (!cell) {
      hoverMesh.visible = false;
      return;
    }
    hoverMesh.position.set(cell.x + 0.5, 0.015, cell.z + 0.5);
    hoverMesh.visible = true;

    if (isDragging && dragStartCell) {
      updatePending(dragStartCell, cell);
    }
  });

  ctx.listen(ctx.canvas, 'pointerdown', (event) => {
    if (ctx.currentMode !== 'roomBuilder' || ctx.isPickingDoorEdge || ctx.isPositioningGhost || event.button !== 0) return;
    const cell = pointerToCell(event);
    if (!cell) return;
    dragStartCell = cell;
    isDragging = true;
    dragMode = ctx.roomDraftCells.has(cellKey(cell.x, cell.z)) ? 'remove' : 'add';
    updatePending(cell, cell);
  });

  ctx.listen(window, 'pointerup', (event) => {
    if (ctx.currentMode !== 'roomBuilder' || ctx.isPickingDoorEdge || ctx.isPositioningGhost || !isDragging || event.button !== 0) return;
    isDragging = false;
    const endCell = pointerToCell(event) ?? dragStartCell;
    const cells = rectCells(dragStartCell, endCell);
    clearPending();

    if (cells.length === 1) {
      toggleCell(cells[0].x, cells[0].z);
    } else if (dragMode === 'remove') {
      eraseCells(cells);
    } else {
      stampCells(cells);
    }
    dragStartCell = null;
  });
}
