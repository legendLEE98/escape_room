import * as THREE from 'three';

// Midpoint of a boundary edge in world space, matching the cell/side
// convention from room-builder.js's computeBoundaryEdges (N/S run along
// fixed z, W/E run along fixed x).
function edgeMidpoint({ x, z, side }) {
  if (side === 'N') return { x: x + 0.5, z };
  if (side === 'S') return { x: x + 0.5, z: z + 1 };
  if (side === 'W') return { x, z: z + 0.5 };
  return { x: x + 1, z: z + 0.5 }; // E
}

// Given a wall edge on the "anchor" room and a candidate offset for the
// "other" room (in the anchor room's local frame), finds the cell+side on
// the other room that would sit flush against that exact wall — or null if
// nothing lines up there. This is what makes a door "one object shared by
// two rooms" instead of two independently-placed one-way edges: it only
// exists where the two rooms' geometry actually touches.
function computeMatchingEdge(pickedEdge, offsetX, offsetZ, otherFloorCells) {
  const otherFloorSet = new Set(otherFloorCells.map(({ x, z }) => `${x},${z}`));
  const { x, z, side } = pickedEdge;
  let neighborCell;
  let matchedSide;
  if (side === 'N') {
    neighborCell = { x, z: z - 1 };
    matchedSide = 'S';
  } else if (side === 'S') {
    neighborCell = { x, z: z + 1 };
    matchedSide = 'N';
  } else if (side === 'W') {
    neighborCell = { x: x - 1, z };
    matchedSide = 'E';
  } else {
    neighborCell = { x: x + 1, z };
    matchedSide = 'W';
  }
  const localX = neighborCell.x - offsetX;
  const localZ = neighborCell.z - offsetZ;
  if (!otherFloorSet.has(`${localX},${localZ}`)) return null;
  return { x: localX, z: localZ, side: matchedSide };
}

// Whether any of the other room's cells would land on top of one of the
// anchor room's cells once positioned at this offset (in the anchor's
// local frame) — two rooms can't physically share the same floor space.
function cellsOverlap(anchorCells, otherCells, offsetX, offsetZ) {
  const anchorSet = new Set(anchorCells.map(({ x, z }) => `${x},${z}`));
  return otherCells.some(({ x, z }) => anchorSet.has(`${x + offsetX},${z + offsetZ}`));
}

const EDGE_PICK_RADIUS = 0.6;
const GHOST_FLOOR_COLOR = 0x8fc5ff;
const GHOST_WALL_COLOR = 0x8fc5ff;

export function initRoomLinks(ctx) {
  ctx.isPickingDoorEdge = false;
  ctx.isPositioningGhost = false;
  let pickingTargetRoomInstanceId = null;
  let pickedEdge = null;
  let ghostOffset = { x: 0, z: 0 };
  let isDraggingGhost = false;
  const dragStartHit = new THREE.Vector3();
  let dragStartOffset = { x: 0, z: 0 };

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundHit = new THREE.Vector3();

  const highlightGroup = new THREE.Group();
  ctx.scene.add(highlightGroup);
  const highlightGeometry = new THREE.PlaneGeometry(1, 0.25);
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: 0x4ade80,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });

  // Non-interactive: every room already linked to the one being edited,
  // shown translucent for reference every time you open that room.
  const linkedGhostsGroup = new THREE.Group();
  ctx.scene.add(linkedGhostsGroup);
  // Interactive: the one target room being dragged into place right now,
  // while confirming a brand new link.
  const activeGhostGroup = new THREE.Group();
  ctx.scene.add(activeGhostGroup);

  function currentEditingRoom() {
    return ctx.rooms?.find((room) => room.instanceId === ctx.editingRoomInstanceId) || null;
  }

  function buildGhostRoomMeshes(room, offsetX, offsetZ, opacity) {
    const group = new THREE.Group();
    const cells = room.floorCells || [];
    const floorGeometry = new THREE.PlaneGeometry(1, 1);
    const floorMaterial = new THREE.MeshBasicMaterial({
      color: GHOST_FLOOR_COLOR,
      transparent: true,
      opacity: opacity * 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    cells.forEach(({ x, z }) => {
      const mesh = new THREE.Mesh(floorGeometry, floorMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x + 0.5 + offsetX, 0.012, z + 0.5 + offsetZ);
      group.add(mesh);
    });

    const doorSet = new Set((room.doorEdges || []).map(({ x, z, side }) => ctx.edgeKey(x, z, side)));
    const wallGeometry = new THREE.PlaneGeometry(1, ctx.wallHeight);
    const wallMaterial = new THREE.MeshBasicMaterial({
      color: GHOST_WALL_COLOR,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    ctx.computeBoundaryEdges(cells).forEach((edge) => {
      if (doorSet.has(ctx.edgeKey(edge.x, edge.z, edge.side))) return;
      const { x, z } = edgeMidpoint(edge);
      const mesh = new THREE.Mesh(wallGeometry, wallMaterial);
      mesh.position.set(x + offsetX, ctx.wallHeight / 2, z + offsetZ);
      if (edge.side === 'W' || edge.side === 'E') mesh.rotation.y = Math.PI / 2;
      group.add(mesh);
    });

    return group;
  }

  // Redraws the permanent, non-interactive ghosts for every room already
  // linked to the one currently being edited.
  function renderLinkedGhosts(room) {
    linkedGhostsGroup.clear();
    if (!room) return;
    (room.doorEdges || []).forEach((edge) => {
      const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === edge.connectedRoomInstanceId);
      if (!targetRoom) return;
      const offsetX = (targetRoom.worldOffset?.x ?? 0) - (room.worldOffset?.x ?? 0);
      const offsetZ = (targetRoom.worldOffset?.z ?? 0) - (room.worldOffset?.z ?? 0);
      linkedGhostsGroup.add(buildGhostRoomMeshes(targetRoom, offsetX, offsetZ, 0.28));
    });
  }

  function addEdgeHighlight(edge) {
    const { x, z } = edgeMidpoint(edge);
    const mesh = new THREE.Mesh(highlightGeometry, highlightMaterial);
    mesh.rotation.x = -Math.PI / 2;
    if (edge.side === 'W' || edge.side === 'E') mesh.rotation.z = Math.PI / 2;
    mesh.position.set(x, 0.03, z);
    highlightGroup.add(mesh);
  }

  function renderDoorEdgeHighlights(room) {
    highlightGroup.clear();
    (room?.doorEdges || []).forEach(addEdgeHighlight);
  }

  function findNearestEdge(event, cells) {
    ctx.setPointer(event);
    if (!ctx.raycaster.ray.intersectPlane(groundPlane, groundHit)) return null;
    let nearest = null;
    let nearestDistSq = Infinity;
    ctx.computeBoundaryEdges(cells).forEach((edge) => {
      const { x, z } = edgeMidpoint(edge);
      const dx = groundHit.x - x;
      const dz = groundHit.z - z;
      const distSq = dx * dx + dz * dz;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = edge;
      }
    });
    return nearest && nearestDistSq < EDGE_PICK_RADIUS * EDGE_PICK_RADIUS ? nearest : null;
  }

  function renderLinkList(room) {
    ctx.roomLinkList.innerHTML = '';
    if (!room) return;

    (room.doorEdges || []).forEach((edge) => {
      const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === edge.connectedRoomInstanceId);
      const row = document.createElement('div');
      row.className = 'room-link-row';

      const label = document.createElement('span');
      label.className = 'room-link-row-label';
      label.textContent = `→ ${targetRoom ? targetRoom.name : '(삭제된 방)'} · ${edge.side}쪽 벽`;
      row.append(label);

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'room-link-row-remove';
      removeButton.textContent = '삭제';
      removeButton.addEventListener('click', () => {
        // A door is one shared object, not two independent edges — removing
        // it from this side also removes the matching edge on the other
        // room, instead of leaving a one-sided wall opening behind.
        room.doorEdges = (room.doorEdges || []).filter((candidate) => candidate !== edge);
        ctx.buildRoomWalls(room, room.floorCells, room.doorEdges);
        if (targetRoom) {
          targetRoom.doorEdges = (targetRoom.doorEdges || []).filter(
            (candidate) => candidate.connectedRoomInstanceId !== room.instanceId,
          );
          if (targetRoom.floorCells) ctx.buildRoomWalls(targetRoom, targetRoom.floorCells, targetRoom.doorEdges);
        }
        ctx.renderRoomLinkPanel();
        ctx.saveLayout();
      });
      row.append(removeButton);

      ctx.roomLinkList.append(row);
    });
  }

  function renderTargetOptions(room) {
    ctx.roomLinkTargetSelect.innerHTML = '';
    if (!room) {
      ctx.roomLinkAddButton.disabled = true;
      return;
    }
    ctx.rooms
      .filter((candidate) => candidate.instanceId !== room.instanceId)
      .forEach((candidate) => {
        const option = document.createElement('option');
        option.value = String(candidate.instanceId);
        option.textContent = candidate.name;
        ctx.roomLinkTargetSelect.append(option);
      });
    ctx.roomLinkAddButton.disabled = ctx.roomLinkTargetSelect.options.length === 0;
  }

  ctx.cancelDoorEdgePicking = () => {
    activeGhostGroup.clear();
    ctx.roomLinkConfirmRow.hidden = true;
    if (ctx.isPickingDoorEdge) {
      ctx.isPickingDoorEdge = false;
      pickingTargetRoomInstanceId = null;
      ctx.roomLinkStatus.textContent = '';
    }
    if (ctx.isPositioningGhost) {
      ctx.isPositioningGhost = false;
      pickedEdge = null;
      pickingTargetRoomInstanceId = null;
      isDraggingGhost = false;
      ctx.roomLinkStatus.textContent = '';
      // The picked-wall highlight was added directly to highlightGroup
      // outside of renderDoorEdgeHighlights, so a plain cancel (no save)
      // needs its own rebuild from the room's actual confirmed doors.
      renderDoorEdgeHighlights(currentEditingRoom());
    }
  };

  // Room-builder-only visuals (linked-room ghosts, door highlights, any
  // in-progress positioning) — none of this belongs in editor/movement mode,
  // so it all gets torn down whenever room-builder mode is left.
  ctx.hideRoomLinkVisuals = () => {
    ctx.cancelDoorEdgePicking();
    linkedGhostsGroup.clear();
    highlightGroup.clear();
  };

  ctx.renderRoomLinkPanel = () => {
    const room = currentEditingRoom();
    ctx.cancelDoorEdgePicking();
    renderLinkList(room);
    renderTargetOptions(room);
    renderDoorEdgeHighlights(room);
    renderLinkedGhosts(room);
    if (!room) {
      ctx.roomLinkStatus.textContent = '먼저 바닥을 그려서 방을 만들어 주세요.';
    }
  };

  ctx.roomLinkAddButton.addEventListener('click', () => {
    const room = currentEditingRoom();
    if (!room || !ctx.roomLinkTargetSelect.value) return;
    pickingTargetRoomInstanceId = Number(ctx.roomLinkTargetSelect.value);
    ctx.isPickingDoorEdge = true;
    ctx.roomLinkStatus.textContent = '문을 놓을 벽을 클릭하세요 (Esc로 취소)';
  });

  ctx.canvas.addEventListener('pointerdown', (event) => {
    if (ctx.currentMode !== 'roomBuilder' || event.button !== 0) return;

    if (ctx.isPickingDoorEdge) {
      const room = currentEditingRoom();
      const cells = Array.from(ctx.roomDraftCells.values());
      const edge = findNearestEdge(event, cells);
      if (!room || !edge) {
        ctx.roomLinkStatus.textContent = '벽 근처를 클릭해 주세요.';
        return;
      }

      // Wall picked — now bring in the target room as a draggable ghost
      // instead of finishing the link immediately; the actual door only
      // gets created once its position is confirmed.
      pickedEdge = edge;
      ctx.isPickingDoorEdge = false;
      ctx.isPositioningGhost = true;
      addEdgeHighlight(edge);
      const { x, z } = edgeMidpoint(edge);
      const normal =
        edge.side === 'N' ? { x: 0, z: -1 } : edge.side === 'S' ? { x: 0, z: 1 } : edge.side === 'W' ? { x: -1, z: 0 } : { x: 1, z: 0 };
      ghostOffset = { x: Math.round(x + normal.x - 0.5), z: Math.round(z + normal.z - 0.5) };
      activeGhostGroup.clear();
      const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === pickingTargetRoomInstanceId);
      if (targetRoom) activeGhostGroup.add(buildGhostRoomMeshes(targetRoom, ghostOffset.x, ghostOffset.z, 0.5));
      ctx.roomLinkConfirmRow.hidden = false;
      ctx.roomLinkStatus.textContent = '반투명 방을 드래그해서 위치를 맞추고 "링크 확정"을 누르세요 (Esc로 취소)';
      return;
    }

    if (ctx.isPositioningGhost) {
      ctx.setPointer(event);
      if (!ctx.raycaster.ray.intersectPlane(groundPlane, dragStartHit)) return;
      isDraggingGhost = true;
      dragStartOffset = { ...ghostOffset };
    }
  });

  window.addEventListener('pointermove', (event) => {
    if (!isDraggingGhost || ctx.currentMode !== 'roomBuilder') return;
    ctx.setPointer(event);
    if (!ctx.raycaster.ray.intersectPlane(groundPlane, groundHit)) return;
    const rawX = dragStartOffset.x + (groundHit.x - dragStartHit.x);
    const rawZ = dragStartOffset.z + (groundHit.z - dragStartHit.z);
    ghostOffset = { x: Math.round(rawX), z: Math.round(rawZ) };

    const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === pickingTargetRoomInstanceId);
    activeGhostGroup.clear();
    if (targetRoom) activeGhostGroup.add(buildGhostRoomMeshes(targetRoom, ghostOffset.x, ghostOffset.z, 0.5));
  });

  window.addEventListener('pointerup', () => {
    isDraggingGhost = false;
  });

  ctx.roomLinkConfirmButton.addEventListener('click', () => {
    const room = currentEditingRoom();
    const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === pickingTargetRoomInstanceId);
    if (!room || !targetRoom || !pickedEdge) return;

    const cells = Array.from(ctx.roomDraftCells.values());
    if (cellsOverlap(cells, targetRoom.floorCells || [], ghostOffset.x, ghostOffset.z)) {
      ctx.showCenterToast('두 방의 칸이 겹쳐서 확정할 수 없어요. 위치를 조정해 주세요.');
      return;
    }

    const matchedEdge = computeMatchingEdge(pickedEdge, ghostOffset.x, ghostOffset.z, targetRoom.floorCells || []);
    if (!matchedEdge) {
      ctx.showCenterToast('벽이 정확히 맞닿지 않았어요. 방을 조금 더 옮겨주세요.');
      return;
    }

    const nextDoorEdges = (room.doorEdges || []).filter(
      (existing) => ctx.edgeKey(existing.x, existing.z, existing.side) !== ctx.edgeKey(pickedEdge.x, pickedEdge.z, pickedEdge.side),
    );
    nextDoorEdges.push({ ...pickedEdge, connectedRoomInstanceId: targetRoom.instanceId });

    const targetNextDoorEdges = (targetRoom.doorEdges || []).filter(
      (existing) => ctx.edgeKey(existing.x, existing.z, existing.side) !== ctx.edgeKey(matchedEdge.x, matchedEdge.z, matchedEdge.side),
    );
    targetNextDoorEdges.push({ ...matchedEdge, connectedRoomInstanceId: room.instanceId });

    room.worldOffset = room.worldOffset ?? { x: 0, z: 0 };
    targetRoom.worldOffset = { x: room.worldOffset.x + ghostOffset.x, z: room.worldOffset.z + ghostOffset.z };

    ctx.buildRoomWalls(room, cells, nextDoorEdges);
    if (targetRoom.floorCells) ctx.buildRoomWalls(targetRoom, targetRoom.floorCells, targetNextDoorEdges);

    ctx.cancelDoorEdgePicking();
    renderLinkList(room);
    renderDoorEdgeHighlights(room);
    renderLinkedGhosts(room);
    ctx.saveLayout();
  });

  ctx.roomLinkCancelButton.addEventListener('click', ctx.cancelDoorEdgePicking);

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && (ctx.isPickingDoorEdge || ctx.isPositioningGhost)) ctx.cancelDoorEdgePicking();
  });
}
