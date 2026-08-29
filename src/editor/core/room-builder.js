import * as THREE from 'three';

const FLOOR_COLOR = 0x8a7257;
const WALL_COLOR = 0x9a9a9a; // placeholder — swap for a real material/texture later
const WALL_HEIGHT = 2;
const WALL_THICKNESS = 0.15;
const CELL_HIGHLIGHT_COLOR = 0x8fc5ff;
const PENDING_ADD_COLOR = 0xffd166;
const PENDING_REMOVE_COLOR = 0xff6b6b;

function cellKey(x, z) {
  return `${x},${z}`;
}

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

  ctx.buildRoomFloor = (room, cells) => {
    const floorGroup = new THREE.Group();
    floorGroup.userData.isRoomFloor = true;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, roughness: 0.9 });
    cells.forEach(({ x, z }) => {
      const cell = new THREE.Mesh(geometry, material);
      cell.rotation.x = -Math.PI / 2;
      cell.position.set(x + 0.5, 0.008, z + 0.5);
      cell.receiveShadow = true;
      floorGroup.add(cell);
    });
    room.root.add(floorGroup);
    room.floorCells = cells;
  };

  // Collapses a set of integer positions into [start, end] runs of
  // consecutive values, e.g. [0,1,2,5,6] -> [[0,2],[5,6]].
  function mergeRuns(values) {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    const runs = [];
    let start = null;
    let end = null;
    sorted.forEach((value) => {
      if (start === null) {
        start = value;
        end = value;
      } else if (value === end + 1) {
        end = value;
      } else {
        runs.push([start, end]);
        start = value;
        end = value;
      }
    });
    if (start !== null) runs.push([start, end]);
    return runs;
  }

  ctx.buildRoomWalls = (room, cells) => {
    const wallGroup = new THREE.Group();
    wallGroup.userData.isRoomWalls = true;

    const addWall = (geometry, x, z) => {
      // Each wall gets its own material instance (not shared) so
      // updateWallOcclusion can fade individual segments independently.
      const material = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.9, transparent: true });
      const wall = new THREE.Mesh(geometry, material);
      wall.position.set(x, WALL_HEIGHT / 2, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      wallGroup.add(wall);
    };

    const floorSet = new Set(cells.map(({ x, z }) => cellKey(x, z)));

    // Group missing-neighbor edges by the fixed grid line they sit on, then
    // merge each line's consecutive cells into one wall run — building one
    // box per straight run (not one per cell) so adjacent same-orientation
    // segments never overlap each other and z-fight.
    const horizontalLines = new Map(); // z (fixed) -> [x, x, ...]
    const verticalLines = new Map(); // x (fixed) -> [z, z, ...]
    const addToLine = (map, key, value) => {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(value);
    };

    cells.forEach(({ x, z }) => {
      if (!floorSet.has(cellKey(x, z - 1))) addToLine(horizontalLines, z, x); // north
      if (!floorSet.has(cellKey(x, z + 1))) addToLine(horizontalLines, z + 1, x); // south
      if (!floorSet.has(cellKey(x - 1, z))) addToLine(verticalLines, x, z); // west
      if (!floorSet.has(cellKey(x + 1, z))) addToLine(verticalLines, x + 1, z); // east
    });

    // Horizontal (north/south-facing) runs are stretched half a thickness
    // past each end so they alone fill every outer corner; vertical
    // (east/west-facing) runs stay at their exact span and butt flush
    // against them — extending both would make their faces coincide inside
    // the corner and z-fight.
    horizontalLines.forEach((xs, z) => {
      mergeRuns(xs).forEach(([start, end]) => {
        const length = end - start + 1;
        const geometry = new THREE.BoxGeometry(length + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
        addWall(geometry, start + length / 2, z);
      });
    });
    verticalLines.forEach((zs, x) => {
      mergeRuns(zs).forEach(([start, end]) => {
        const length = end - start + 1;
        // Inset (not just "un-extended") by half a thickness at each end —
        // the horizontal runs' extension already fully covers that sliver,
        // so this leaves the two runs touching with zero shared volume
        // instead of a small overlapping cube at the corner (which caused
        // the top face of both boxes to coincide there and z-fight).
        const geometry = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, length - WALL_THICKNESS);
        addWall(geometry, x, start + length / 2);
      });
    });

    room.root.add(wallGroup);
  };

  const WALL_OCCLUDED_OPACITY = 0;
  const WALL_EDITOR_OPACITY = 0.3;
  const WALL_OPACITY_LERP_SPEED = 10;
  // How far left/right of the center sightline to also probe, so walls that
  // block the character's sides (not just its exact center point) fade too.
  const OCCLUSION_RAY_SPREAD = 0.45;
  const occlusionRaycaster = new THREE.Raycaster();
  const occlusionOrigin = new THREE.Vector3();
  const occlusionDirection = new THREE.Vector3();
  const occlusionPerpendicular = new THREE.Vector3();
  const occlusionProbeOrigin = new THREE.Vector3();
  // Hysteresis: once a wall is hit, keep it faded for a bit even if a later
  // frame's raycast narrowly misses — otherwise borderline positions flicker
  // opaque/faded every frame as the hit test tips back and forth.
  const OCCLUSION_HOLD_SECONDS = 0.2;
  const wallHeldUntil = new WeakMap();

  ctx.updateWallOcclusion = (delta) => {
    const room = ctx.rooms?.find((candidate) => candidate.instanceId === ctx.currentRoomInstanceId);
    const wallGroup = room?.root.children.find((child) => child.userData.isRoomWalls);
    if (!wallGroup || wallGroup.children.length === 0) return;

    let hitWalls = null;
    if (ctx.currentMode === 'movement') {
      // Cast from the character (roughly chest height) toward the camera —
      // any wall segment the ray crosses is standing between the player and
      // the camera, regardless of which side of the room it's on.
      occlusionOrigin.copy(ctx.character.position);
      occlusionOrigin.y += 0.8;
      occlusionDirection.subVectors(ctx.camera.position, occlusionOrigin);
      const distance = occlusionDirection.length();
      occlusionDirection.normalize();
      // Horizontal-plane perpendicular of the sightline, used to spread a
      // few extra probes across the character's width instead of just its
      // exact center point.
      occlusionPerpendicular.set(-occlusionDirection.z, 0, occlusionDirection.x).normalize();

      hitWalls = new Set();
      [0, OCCLUSION_RAY_SPREAD, -OCCLUSION_RAY_SPREAD].forEach((offset) => {
        occlusionProbeOrigin.copy(occlusionOrigin).addScaledVector(occlusionPerpendicular, offset);
        occlusionRaycaster.set(occlusionProbeOrigin, occlusionDirection);
        occlusionRaycaster.far = distance;
        occlusionRaycaster
          .intersectObjects(wallGroup.children, false)
          .forEach((hit) => hitWalls.add(hit.object));
      });
    }

    const now = ctx.clock.elapsedTime;
    hitWalls?.forEach((wall) => wallHeldUntil.set(wall, now + OCCLUSION_HOLD_SECONDS));

    const isEditingView = ctx.currentMode === 'editor' || ctx.currentMode === 'roomBuilder';

    wallGroup.children.forEach((wall) => {
      const isHeld = (wallHeldUntil.get(wall) ?? 0) > now;
      let targetOpacity = 1;
      if (isHeld) targetOpacity = WALL_OCCLUDED_OPACITY;
      else if (isEditingView) targetOpacity = WALL_EDITOR_OPACITY;
      wall.material.opacity += (targetOpacity - wall.material.opacity) * Math.min(1, delta * WALL_OPACITY_LERP_SPEED);
    });
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

  ctx.startRoomEditor = () => {
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
    ctx.setMode('roomBuilder');
    ctx.updateRoomBuilderStatus();
  };

  ctx.cancelRoomBuilder = () => {
    ctx.editingRoomInstanceId = null;
    clearDraft();
    ctx.applyRoomVisibility();
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

    let room;
    if (editingRoom) {
      room = editingRoom;
      const oldFloor = room.root.children.find((child) => child.userData.isRoomFloor);
      if (oldFloor) room.root.remove(oldFloor);
      const oldWalls = room.root.children.find((child) => child.userData.isRoomWalls);
      if (oldWalls) room.root.remove(oldWalls);
      room.name = name;
      room.root.name = name;
    } else {
      room = ctx.createRoom(name, ctx.rooms.length === 0);
      ctx.rooms.push(room);
    }

    ctx.buildRoomFloor(room, cells);
    ctx.buildRoomWalls(room, cells);

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

  ctx.canvas.addEventListener('pointermove', (event) => {
    if (ctx.currentMode !== 'roomBuilder') {
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

  ctx.canvas.addEventListener('pointerdown', (event) => {
    if (ctx.currentMode !== 'roomBuilder' || event.button !== 0) return;
    const cell = pointerToCell(event);
    if (!cell) return;
    dragStartCell = cell;
    isDragging = true;
    dragMode = ctx.roomDraftCells.has(cellKey(cell.x, cell.z)) ? 'remove' : 'add';
    updatePending(cell, cell);
  });

  window.addEventListener('pointerup', (event) => {
    if (ctx.currentMode !== 'roomBuilder' || !isDragging || event.button !== 0) return;
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
