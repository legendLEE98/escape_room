import * as THREE from 'three';
import { normalizeAsset } from '../assets/catalog.js';

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
  // Exposed so room-builder.js can also block a floor-redraw that would push
  // a room into cells a linked neighbor already occupies in shared world
  // space — the same check used here when confirming a brand new link.
  ctx.cellsOverlap = cellsOverlap;
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

  // Wall-picking navigator: every pickable (non-door) boundary edge shown in
  // red while choosing which wall to put a door on, so it's clear where you
  // can click — plus a single green highlight that follows the cursor to
  // whichever edge is currently under it.
  const wallNavigatorGroup = new THREE.Group();
  ctx.scene.add(wallNavigatorGroup);
  const wallNavigatorMaterial = new THREE.MeshBasicMaterial({
    color: 0xff6b6b,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  });
  const hoverEdgeMesh = new THREE.Mesh(
    highlightGeometry,
    new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  hoverEdgeMesh.rotation.x = -Math.PI / 2;
  hoverEdgeMesh.renderOrder = 6;
  hoverEdgeMesh.visible = false;
  ctx.scene.add(hoverEdgeMesh);

  // Non-interactive: every room already linked to the one being edited,
  // shown translucent for reference every time you open that room.
  const linkedGhostsGroup = new THREE.Group();
  ctx.scene.add(linkedGhostsGroup);
  // Interactive: the one target room being dragged into place right now,
  // while confirming a brand new link. Split into two children so dragging
  // (every pointermove) only has to redo the cheap procedural floor/wall
  // part — the furniture is loaded once per target room and just moved.
  const activeGhostGroup = new THREE.Group();
  ctx.scene.add(activeGhostGroup);
  const activeFloorWallGroup = new THREE.Group();
  activeGhostGroup.add(activeFloorWallGroup);
  const activeFurnitureGroup = new THREE.Group();
  activeGhostGroup.add(activeFurnitureGroup);
  let furnitureLoadToken = 0;

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

  // Reads whatever furniture data is available for a room, whichever source
  // is authoritative right now: live objects if it's currently loaded (may
  // include edits not saved yet), otherwise the last-saved raw JSON.
  function readRoomFurnitureItems(room) {
    if (room._loaded) {
      return ctx.placedObjects
        .filter(
          (object) =>
            ctx.getObjectRoomInstanceId(object) === room.instanceId &&
            object.userData.assetFile &&
            !object.userData.isSpawnPoint,
        )
        .map((object) => ({
          file: object.userData.assetFile,
          position: object.position.toArray(),
          rotation: object.rotation.toArray(),
          scale: object.scale.toArray(),
        }));
    }
    return (room._savedObjects || [])
      .filter((item) => item.glbUrl && !item.isSpawnPoint)
      .map((item) => ({
        url: item.glbUrl,
        position: item.transform.position,
        rotation: item.transform.rotation,
        scale: item.transform.scale,
      }));
  }

  // Loads and clones every placed asset in a room so the ghost shows its
  // actual layout (desks, cabinets, ...), not just a bare floor outline.
  // Async — GLBs are cached by ctx.loadAssetTemplate after the first load.
  async function buildGhostFurnitureGroup(room, opacity) {
    const group = new THREE.Group();
    const ghostMaterial = new THREE.MeshBasicMaterial({
      color: GHOST_WALL_COLOR,
      transparent: true,
      opacity,
      depthWrite: false,
    });

    await Promise.all(
      readRoomFurnitureItems(room).map(async (item) => {
        const asset = item.file
          ? ctx.assetCatalog.find((candidate) => candidate.file === item.file)
          : ctx.assetCatalog.find((candidate) => candidate.url === item.url);
        if (!asset) return;
        try {
          const template = await ctx.loadAssetTemplate(asset);
          const content = template.clone(true);
          // The saved position/rotation/scale was recorded for a *placed*
          // (ctx.addAsset) object, which normalizeAsset() has already
          // re-centered — applying that saved transform straight onto the
          // raw un-normalized template lands it wherever the original GLB's
          // own arbitrary origin happens to be, often far outside view.
          normalizeAsset(content);
          content.traverse((child) => {
            if (child.isMesh) child.material = ghostMaterial;
          });
          const wrapper = new THREE.Group();
          wrapper.add(content);
          wrapper.position.fromArray(item.position);
          wrapper.rotation.fromArray(item.rotation);
          wrapper.scale.fromArray(item.scale);
          group.add(wrapper);
        } catch {
          // A single failed/missing asset shouldn't break the whole preview.
        }
      }),
    );

    return group;
  }

  // Redraws the permanent, non-interactive ghosts for every room already
  // linked to the one currently being edited.
  function renderLinkedGhosts(room) {
    linkedGhostsGroup.clear();
    if (!room) return;
    // Defensive: draw each linked room's ghost at most once even if the
    // data somehow has more than one door to it (e.g. leftover from before
    // renderTargetOptions started blocking duplicate links) — otherwise two
    // identical ghosts land on the exact same spot and z-fight.
    const renderedRoomIds = new Set();
    (room.doorEdges || []).forEach((edge) => {
      if (renderedRoomIds.has(edge.connectedRoomInstanceId)) return;
      const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === edge.connectedRoomInstanceId);
      if (!targetRoom) return;
      renderedRoomIds.add(edge.connectedRoomInstanceId);
      const offsetX = (targetRoom.worldOffset?.x ?? 0) - (room.worldOffset?.x ?? 0);
      const offsetZ = (targetRoom.worldOffset?.z ?? 0) - (room.worldOffset?.z ?? 0);
      linkedGhostsGroup.add(buildGhostRoomMeshes(targetRoom, offsetX, offsetZ, 0.28));

      const furnitureGroup = new THREE.Group();
      furnitureGroup.position.set(offsetX, 0, offsetZ);
      linkedGhostsGroup.add(furnitureGroup);
      buildGhostFurnitureGroup(targetRoom, 0.3).then((loaded) => {
        // The room being edited may have changed by the time this resolves.
        if (currentEditingRoom() !== room) return;
        furnitureGroup.add(loaded);
      });
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

  function renderWallNavigator(room, cells) {
    wallNavigatorGroup.clear();
    if (!room) return;
    const doorSet = new Set((room.doorEdges || []).map(({ x, z, side }) => ctx.edgeKey(x, z, side)));
    ctx.computeBoundaryEdges(cells).forEach((edge) => {
      if (doorSet.has(ctx.edgeKey(edge.x, edge.z, edge.side))) return; // already a door, shown green elsewhere
      const { x, z } = edgeMidpoint(edge);
      const mesh = new THREE.Mesh(highlightGeometry, wallNavigatorMaterial);
      mesh.rotation.x = -Math.PI / 2;
      if (edge.side === 'W' || edge.side === 'E') mesh.rotation.z = Math.PI / 2;
      mesh.position.set(x, 0.028, z);
      wallNavigatorGroup.add(mesh);
    });
  }

  function clearWallNavigator() {
    wallNavigatorGroup.clear();
    hoverEdgeMesh.visible = false;
    ctx.canvas.style.cursor = '';
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
    // A room already linked can't be picked again — a second door to the
    // same room would render its ghost twice at the identical position
    // (perfectly overlapping, z-fighting) and doesn't mean anything extra
    // anyway, since the link itself is what matters, not which wall.
    const alreadyLinkedIds = new Set((room.doorEdges || []).map((edge) => edge.connectedRoomInstanceId));
    ctx.rooms
      .filter((candidate) => candidate.instanceId !== room.instanceId && !alreadyLinkedIds.has(candidate.instanceId))
      .forEach((candidate) => {
        const option = document.createElement('option');
        option.value = String(candidate.instanceId);
        option.textContent = candidate.name;
        ctx.roomLinkTargetSelect.append(option);
      });
    ctx.roomLinkAddButton.disabled = ctx.roomLinkTargetSelect.options.length === 0;
  }

  ctx.cancelDoorEdgePicking = () => {
    activeFloorWallGroup.clear();
    activeFurnitureGroup.clear();
    furnitureLoadToken += 1; // invalidate any in-flight furniture load
    clearWallNavigator();
    ctx.roomLinkPositionPanel.hidden = true;
    if (ctx.currentMode === 'roomBuilder') ctx.roomBuilderPanel.hidden = false;
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

  // Editor mode reuses the same ghost/door-highlight rendering as room-builder
  // mode, just keyed off the currently viewed room (ctx.currentRoomInstanceId)
  // instead of the room being actively edited.
  ctx.refreshRoomLinkGhostsForCurrentRoom = () => {
    const room = ctx.rooms?.find((candidate) => candidate.instanceId === ctx.currentRoomInstanceId);
    if (!room) {
      linkedGhostsGroup.clear();
      highlightGroup.clear();
      return;
    }
    renderDoorEdgeHighlights(room);
    renderLinkedGhosts(room);
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
    renderWallNavigator(room, Array.from(ctx.roomDraftCells.values()));
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
      clearWallNavigator();
      addEdgeHighlight(edge);
      const { x, z } = edgeMidpoint(edge);
      const normal =
        edge.side === 'N' ? { x: 0, z: -1 } : edge.side === 'S' ? { x: 0, z: 1 } : edge.side === 'W' ? { x: -1, z: 0 } : { x: 1, z: 0 };
      ghostOffset = { x: Math.round(x + normal.x - 0.5), z: Math.round(z + normal.z - 0.5) };
      activeFloorWallGroup.clear();
      activeFurnitureGroup.clear();
      const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === pickingTargetRoomInstanceId);
      if (targetRoom) {
        activeFloorWallGroup.add(buildGhostRoomMeshes(targetRoom, ghostOffset.x, ghostOffset.z, 0.5));
        activeFurnitureGroup.position.set(ghostOffset.x, 0, ghostOffset.z);
        const token = ++furnitureLoadToken;
        buildGhostFurnitureGroup(targetRoom, 0.5).then((loaded) => {
          if (token !== furnitureLoadToken) return; // a newer pick/cancel happened meanwhile
          activeFurnitureGroup.add(loaded);
        });
      }
      ctx.roomBuilderPanel.hidden = true;
      ctx.roomLinkPositionPanel.hidden = false;
      ctx.roomLinkPositionStatus.textContent = '반투명 방을 드래그해서 위치를 맞추고 "링크 확정"을 누르세요 (Esc로 취소)';
      return;
    }

    if (ctx.isPositioningGhost) {
      ctx.setPointer(event);
      if (!ctx.raycaster.ray.intersectPlane(groundPlane, dragStartHit)) return;
      isDraggingGhost = true;
      dragStartOffset = { ...ghostOffset };
    }
  });

  ctx.canvas.addEventListener('pointermove', (event) => {
    if (ctx.currentMode !== 'roomBuilder' || !ctx.isPickingDoorEdge) return;
    const cells = Array.from(ctx.roomDraftCells.values());
    const edge = findNearestEdge(event, cells);
    if (!edge) {
      hoverEdgeMesh.visible = false;
      ctx.canvas.style.cursor = '';
      return;
    }
    const { x, z } = edgeMidpoint(edge);
    hoverEdgeMesh.position.set(x, 0.032, z);
    hoverEdgeMesh.rotation.z = edge.side === 'W' || edge.side === 'E' ? Math.PI / 2 : 0;
    hoverEdgeMesh.visible = true;
    ctx.canvas.style.cursor = 'pointer';
  });

  window.addEventListener('pointermove', (event) => {
    if (!isDraggingGhost || ctx.currentMode !== 'roomBuilder') return;
    ctx.setPointer(event);
    if (!ctx.raycaster.ray.intersectPlane(groundPlane, groundHit)) return;
    const rawX = dragStartOffset.x + (groundHit.x - dragStartHit.x);
    const rawZ = dragStartOffset.z + (groundHit.z - dragStartHit.z);
    ghostOffset = { x: Math.round(rawX), z: Math.round(rawZ) };

    const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === pickingTargetRoomInstanceId);
    activeFloorWallGroup.clear();
    if (targetRoom) activeFloorWallGroup.add(buildGhostRoomMeshes(targetRoom, ghostOffset.x, ghostOffset.z, 0.5));
    activeFurnitureGroup.position.set(ghostOffset.x, 0, ghostOffset.z);
  });

  window.addEventListener('pointerup', () => {
    isDraggingGhost = false;
  });

  ctx.roomLinkConfirmButton.addEventListener('click', () => {
    const room = currentEditingRoom();
    const targetRoom = ctx.rooms.find((candidate) => candidate.instanceId === pickingTargetRoomInstanceId);
    if (!room || !targetRoom || !pickedEdge) return;

    // Hard guard, independent of whether the dropdown happened to still be
    // showing this room as an option — the dropdown is just UI, this is the
    // actual rule: a room can only be linked to another room once.
    const alreadyLinked = (room.doorEdges || []).some(
      (edge) => edge.connectedRoomInstanceId === targetRoom.instanceId,
    );
    if (alreadyLinked) {
      ctx.showCenterToast(`"${targetRoom.name}"은(는) 이미 연결되어 있어요.`);
      ctx.cancelDoorEdgePicking();
      renderTargetOptions(room);
      return;
    }

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
    renderTargetOptions(room);
    renderDoorEdgeHighlights(room);
    renderLinkedGhosts(room);
    ctx.saveLayout();
  });

  ctx.roomLinkCancelButton.addEventListener('click', ctx.cancelDoorEdgePicking);

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && (ctx.isPickingDoorEdge || ctx.isPositioningGhost)) ctx.cancelDoorEdgePicking();
  });
}
