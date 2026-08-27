const EYE_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-3.22 4.36M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const ADD_ROOM_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
const ADD_EMPTY_OBJECT_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 3"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="9" y1="12" x2="15" y2="12"/></svg>';
const RENAME_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 0 1 4 4L7 21l-4 1 1-4z"/></svg>';
const DELETE_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/></svg>';

export function initHierarchy(ctx) {
  ctx.selectedEditorObject = null;
  ctx.multiSelection = new Set();
  ctx.collapsedInstanceIds = new Set();

  function currentRoomRoot() {
    return ctx.rooms.find((candidate) => candidate.instanceId === ctx.currentRoomInstanceId)?.root ?? ctx.editorRoot;
  }

  ctx.selectEditorObject = (object, options = {}) => {
    const { additive = false, range = false } = options;

    if (!object) {
      ctx.multiSelection.clear();
      ctx.selectedEditorObject = null;
    } else if (range && ctx.selectedEditorObject) {
      const startIndex = ctx.placedObjects.indexOf(ctx.selectedEditorObject);
      const endIndex = ctx.placedObjects.indexOf(object);
      if (startIndex >= 0 && endIndex >= 0) {
        const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        for (let i = from; i <= to; i += 1) {
          ctx.multiSelection.add(ctx.placedObjects[i].userData.instanceId);
        }
      }
      ctx.selectedEditorObject = object;
    } else if (additive) {
      if (ctx.multiSelection.has(object.userData.instanceId)) {
        ctx.multiSelection.delete(object.userData.instanceId);
        ctx.selectedEditorObject =
          ctx.placedObjects.find((candidate) => ctx.multiSelection.has(candidate.userData.instanceId)) ||
          null;
      } else {
        ctx.multiSelection.add(object.userData.instanceId);
        ctx.selectedEditorObject = object;
      }
    } else {
      ctx.multiSelection.clear();
      ctx.multiSelection.add(object.userData.instanceId);
      ctx.selectedEditorObject = object;
    }

    if (ctx.selectedEditorObject) {
      ctx.transformControls.attach(ctx.selectedEditorObject);
    } else {
      ctx.transformControls.detach();
    }
    ctx.updateInspectorFromSelection();
    ctx.syncHierarchyHighlight();
  };

  ctx.findPlacedAncestor = (object) => {
    let current = object;
    while (current && current !== ctx.editorRoot) {
      if (current.userData.editorAsset) return current;
      current = current.parent;
    }
    return null;
  };

  ctx.findByInstanceId = (instanceId) =>
    ctx.placedObjects.find((candidate) => candidate.userData.instanceId === instanceId);

  ctx.isDescendantOf = (candidateInstanceId, ancestorInstanceId) => {
    let current = ctx.findByInstanceId(candidateInstanceId)?.userData.parentInstanceId;
    const visited = new Set();
    while (current != null) {
      if (current === ancestorInstanceId) return true;
      if (visited.has(current)) break;
      visited.add(current);
      current = ctx.findByInstanceId(current)?.userData.parentInstanceId;
    }
    return false;
  };

  function moveInOrder(dragged, reference, after) {
    const index = ctx.placedObjects.indexOf(dragged);
    if (index >= 0) ctx.placedObjects.splice(index, 1);
    let refIndex = ctx.placedObjects.indexOf(reference);
    if (refIndex < 0) refIndex = ctx.placedObjects.length;
    ctx.placedObjects.splice(after ? refIndex + 1 : refIndex, 0, dragged);
  }

  function reparentByDrag(event, target) {
    const draggedInstanceId = Number(event.dataTransfer.getData('text/plain'));
    if (!Number.isFinite(draggedInstanceId)) return;
    const dragged = ctx.findByInstanceId(draggedInstanceId);
    if (!dragged) return;

    if (target) {
      if (target === dragged || ctx.isDescendantOf(target.userData.instanceId, dragged.userData.instanceId)) return;
      target.attach(dragged);
      dragged.userData.parentInstanceId = target.userData.instanceId;
    } else {
      currentRoomRoot().attach(dragged);
      dragged.userData.parentInstanceId = null;
    }
    ctx.syncHierarchy();
    ctx.saveLayout();
  }

  function dropOnObject(event, reference, mode) {
    const draggedInstanceId = Number(event.dataTransfer.getData('text/plain'));
    if (!Number.isFinite(draggedInstanceId)) return;
    const dragged = ctx.findByInstanceId(draggedInstanceId);
    if (!dragged || dragged === reference) return;
    if (ctx.isDescendantOf(reference.userData.instanceId, dragged.userData.instanceId)) return;

    if (mode === 'child') {
      reference.attach(dragged);
      dragged.userData.parentInstanceId = reference.userData.instanceId;
      moveInOrder(dragged, reference, true);
    } else {
      const newParentId = reference.userData.parentInstanceId;
      const newParent = newParentId != null ? ctx.findByInstanceId(newParentId) : null;
      if (newParent) newParent.attach(dragged);
      else currentRoomRoot().attach(dragged);
      dragged.userData.parentInstanceId = newParentId ?? null;
      moveInOrder(dragged, reference, mode === 'after');
    }
    ctx.syncHierarchy();
    ctx.saveLayout();
  }

  ctx.selectFromCanvas = (event) => {
    if (ctx.suppressNextCanvasClick) {
      ctx.suppressNextCanvasClick = false;
      return;
    }
    if (
      ctx.currentMode !== 'editor' ||
      ctx.transformControls.dragging ||
      ctx.sidebarLeft.contains(event.target) ||
      ctx.sidebarRight.contains(event.target)
    ) {
      return;
    }
    ctx.setPointer(event);
    const candidates = ctx.placedObjects.filter(
      (object) => ctx.getObjectRoomInstanceId(object) === ctx.currentRoomInstanceId,
    );
    const hits = ctx.raycaster.intersectObjects(candidates, true);
    const object = hits.length ? ctx.findPlacedAncestor(hits[0].object) : null;
    if (object && event.shiftKey) ctx.selectEditorObject(object, { range: true });
    else if (object && (event.ctrlKey || event.metaKey)) ctx.selectEditorObject(object, { additive: true });
    else ctx.selectEditorObject(object);
  };

  ctx.syncHierarchyHighlight = () => {
    ctx.hierarchyList.querySelectorAll('.hierarchy-object').forEach((item) => {
      item.classList.toggle('is-selected', ctx.multiSelection.has(Number(item.dataset.instanceId)));
    });
    ctx.syncSelectionOutlines();
    ctx.updateGizmoVisibility();
  };

  function startRenameHierarchyItem(item, object) {
    if (item.querySelector('input')) return;
    item.textContent = '';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = object.name;
    item.append(input);
    input.focus();
    input.select();

    const commit = () => {
      const nextName = input.value.trim();
      if (nextName) object.name = nextName;
      ctx.syncHierarchy();
      ctx.saveLayout();
    };

    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.code === 'Enter') input.blur();
      if (event.code === 'Escape') {
        input.removeEventListener('blur', commit);
        ctx.syncHierarchy();
      }
    });
    input.addEventListener('blur', commit, { once: true });
  }

  ctx.renameSelectedObject = () => {
    if (!ctx.selectedEditorObject || ctx.multiSelection.size !== 1) return;
    const item = ctx.hierarchyList.querySelector(
      `li[data-instance-id="${ctx.selectedEditorObject.userData.instanceId}"]`,
    );
    if (item) startRenameHierarchyItem(item, ctx.selectedEditorObject);
  };

  ctx.removeSelectedObjects = (shouldSave = true) => {
    if (ctx.multiSelection.size === 0) return;
    const targets = ctx.placedObjects.filter((object) => ctx.multiSelection.has(object.userData.instanceId));

    targets.forEach((object) => {
      ctx.placedObjects
        .filter((candidate) => candidate.userData.parentInstanceId === object.userData.instanceId)
        .forEach((child) => {
          currentRoomRoot().attach(child);
          child.userData.parentInstanceId = null;
        });
    });

    targets.forEach((object) => {
      const index = ctx.placedObjects.indexOf(object);
      if (index >= 0) ctx.placedObjects.splice(index, 1);
      object.removeFromParent();
    });
    ctx.selectEditorObject(null);
    ctx.syncHierarchy();
    if (shouldSave) ctx.saveLayout();
    ctx.editorStatus.textContent = `선택한 객체 ${targets.length}개를 삭제했습니다.`;
  };

  function buildToolbar() {
    const toolbar = document.createElement('li');
    toolbar.className = 'hierarchy-toolbar';
    toolbar.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      toolbar.classList.add('is-drag-over');
    });
    toolbar.addEventListener('dragleave', () => toolbar.classList.remove('is-drag-over'));
    toolbar.addEventListener('drop', (event) => {
      event.preventDefault();
      toolbar.classList.remove('is-drag-over');
      reparentByDrag(event, null);
    });

    const roomGroup = document.createElement('div');
    roomGroup.className = 'hierarchy-toolbar-room';
    roomGroup.classList.add('hierarchy-toolbar-row');

    const roomSelect = document.createElement('select');
    roomSelect.className = 'hierarchy-room-select';
    ctx.rooms.forEach((room) => {
      const option = document.createElement('option');
      option.value = String(room.instanceId);
      option.textContent = room.name;
      roomSelect.append(option);
    });
    roomSelect.value = String(ctx.currentRoomInstanceId);
    roomSelect.addEventListener('change', () => {
      const room = ctx.rooms.find((candidate) => candidate.instanceId === Number(roomSelect.value));
      if (room) ctx.selectRoom(room);
    });
    roomGroup.append(roomSelect);

    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.className = 'hierarchy-room-icon-button';
    renameButton.innerHTML = RENAME_ICON;
    renameButton.setAttribute('aria-label', '방 이름 변경');
    renameButton.addEventListener('click', () => {
      const room = ctx.rooms.find((candidate) => candidate.instanceId === ctx.currentRoomInstanceId);
      if (!room) return;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'hierarchy-room-rename-input';
      input.value = room.name;
      roomSelect.replaceWith(input);
      input.focus();
      input.select();

      const commit = () => {
        const nextName = input.value.trim();
        if (nextName) {
          room.name = nextName;
          room.root.name = nextName;
        }
        ctx.syncHierarchy();
        ctx.saveLayout();
      };

      input.addEventListener('keydown', (event) => {
        if (event.code === 'Enter') input.blur();
        if (event.code === 'Escape') {
          input.removeEventListener('blur', commit);
          ctx.syncHierarchy();
        }
      });
      input.addEventListener('blur', commit, { once: true });
    });
    roomGroup.append(renameButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'hierarchy-room-icon-button';
    deleteButton.innerHTML = DELETE_ICON;
    deleteButton.setAttribute('aria-label', '방 삭제');
    deleteButton.addEventListener('click', () => {
      const room = ctx.rooms.find((candidate) => candidate.instanceId === ctx.currentRoomInstanceId);
      if (room) ctx.deleteRoom(room);
    });
    roomGroup.append(deleteButton);

    toolbar.append(roomGroup);

    const actionGroup = document.createElement('div');
    actionGroup.className = 'hierarchy-toolbar-actions hierarchy-toolbar-row';

    const addRoomButton = document.createElement('button');
    addRoomButton.type = 'button';
    addRoomButton.className = 'hierarchy-toolbar-icon';
    addRoomButton.innerHTML = ADD_ROOM_ICON;
    addRoomButton.setAttribute('aria-label', '방 추가');
    addRoomButton.addEventListener('click', ctx.addRoom);
    actionGroup.append(addRoomButton);

    const addEmptyObjectButton = document.createElement('button');
    addEmptyObjectButton.type = 'button';
    addEmptyObjectButton.className = 'hierarchy-toolbar-icon';
    addEmptyObjectButton.innerHTML = ADD_EMPTY_OBJECT_ICON;
    addEmptyObjectButton.setAttribute('aria-label', '빈 오브젝트 추가');
    addEmptyObjectButton.addEventListener('click', () => ctx.addEmptyObject());
    actionGroup.append(addEmptyObjectButton);

    toolbar.append(actionGroup);

    return toolbar;
  }

  ctx.syncHierarchy = () => {
    ctx.hierarchyList.innerHTML = '';
    ctx.hierarchyList.append(buildToolbar());

    const currentRoom = ctx.rooms.find((room) => room.instanceId === ctx.currentRoomInstanceId);
    if (!currentRoom) return;

    const roomObjects = ctx.placedObjects.filter(
      (object) => ctx.getObjectRoomInstanceId(object) === currentRoom.instanceId,
    );
    const roomInstanceIds = new Set(roomObjects.map((object) => object.userData.instanceId));
    const childrenByParent = new Map();
    const roots = [];
    roomObjects.forEach((object) => {
      const parentId = object.userData.parentInstanceId;
      if (parentId != null && roomInstanceIds.has(parentId)) {
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        childrenByParent.get(parentId).push(object);
      } else {
        roots.push(object);
      }
    });

    const rendered = new Set();
    function renderObjectItem(object, depth) {
      if (rendered.has(object.userData.instanceId)) return;
      rendered.add(object.userData.instanceId);

      const children = childrenByParent.get(object.userData.instanceId) || [];
      const isCollapsed = ctx.collapsedInstanceIds.has(object.userData.instanceId);

      const item = document.createElement('li');
      item.className = 'hierarchy-object';
      item.dataset.instanceId = String(object.userData.instanceId);
      item.style.paddingLeft = `${18 + depth * 16}px`;
      item.draggable = true;

      const visibilityToggle = document.createElement('button');
      visibilityToggle.type = 'button';
      visibilityToggle.className = 'hierarchy-object-visibility';
      visibilityToggle.setAttribute('aria-label', object.visible ? '숨기기' : '보이기');
      visibilityToggle.innerHTML = object.visible ? EYE_ICON : EYE_OFF_ICON;
      visibilityToggle.addEventListener('click', (event) => {
        event.stopPropagation();
        object.visible = !object.visible;
        ctx.syncHierarchy();
      });
      item.append(visibilityToggle);

      const toggle = document.createElement('span');
      toggle.className = 'hierarchy-object-toggle';
      if (children.length > 0) {
        toggle.textContent = isCollapsed ? '▶' : '▼';
        toggle.addEventListener('click', (event) => {
          event.stopPropagation();
          if (isCollapsed) ctx.collapsedInstanceIds.delete(object.userData.instanceId);
          else ctx.collapsedInstanceIds.add(object.userData.instanceId);
          ctx.syncHierarchy();
        });
      } else {
        toggle.classList.add('is-empty');
      }
      item.append(toggle);

      const label = document.createElement('span');
      label.className = 'hierarchy-object-label';
      label.textContent = object.name;
      item.append(label);
      item.classList.toggle('is-selected', ctx.multiSelection.has(object.userData.instanceId));
      item.classList.toggle('is-hidden', !object.visible);
      label.addEventListener('click', (event) => {
        if (event.shiftKey) {
          ctx.selectEditorObject(object, { range: true });
        } else if (event.ctrlKey || event.metaKey) {
          ctx.selectEditorObject(object, { additive: true });
        } else if (
          ctx.multiSelection.size === 1 &&
          object.userData.instanceId === ctx.selectedEditorObject?.userData.instanceId
        ) {
          startRenameHierarchyItem(item, object);
        } else {
          ctx.selectEditorObject(object);
        }
      });
      item.addEventListener('dragstart', (event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(object.userData.instanceId));
      });
      const clearDragZoneClasses = () =>
        item.classList.remove('drag-over-before', 'drag-over-after', 'drag-over-inside');

      const dragZoneFor = (event) => {
        const rect = item.getBoundingClientRect();
        const ratio = (event.clientY - rect.top) / rect.height;
        if (ratio < 0.25) return 'before';
        if (ratio > 0.75) return 'after';
        return 'child';
      };

      item.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        const zone = dragZoneFor(event);
        clearDragZoneClasses();
        item.classList.add(zone === 'child' ? 'drag-over-inside' : `drag-over-${zone}`);
      });
      item.addEventListener('dragleave', clearDragZoneClasses);
      item.addEventListener('drop', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const zone = dragZoneFor(event);
        clearDragZoneClasses();
        dropOnObject(event, object, zone);
      });
      ctx.hierarchyList.append(item);

      if (!isCollapsed) {
        children.forEach((child) => renderObjectItem(child, depth + 1));
      }
    }

    roots.forEach((object) => renderObjectItem(object, 0));

    ctx.syncSelectionOutlines();
    ctx.updateGizmoVisibility();
  };

  ctx.sidebarRightToggle.addEventListener('click', () => {
    const collapsed = ctx.sidebarRight.dataset.collapsed === 'true';
    ctx.sidebarRight.dataset.collapsed = String(!collapsed);
    document.body.classList.toggle('sidebar-right-collapsed', !collapsed);
  });

  let openContextMenu = null;
  function closeContextMenu() {
    openContextMenu?.remove();
    openContextMenu = null;
  }

  function buildContextMenuItem(label, onSelect) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'hierarchy-context-menu-item';
    item.textContent = label;
    item.addEventListener('click', () => {
      closeContextMenu();
      onSelect();
    });
    return item;
  }

  ctx.hierarchyList.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'hierarchy-context-menu';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.append(
      buildContextMenuItem('빈 오브젝트 추가', () => ctx.addEmptyObject()),
      buildContextMenuItem('방 추가', ctx.addRoom),
      buildContextMenuItem('스폰 위치 추가', () => ctx.addSpawnPoint()),
    );
    document.body.append(menu);
    openContextMenu = menu;
  });

  document.addEventListener('click', closeContextMenu);
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') closeContextMenu();
  });

  ctx.canvas.addEventListener('click', ctx.selectFromCanvas);
}
