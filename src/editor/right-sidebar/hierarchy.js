export function initHierarchy(ctx) {
  ctx.selectedEditorObject = null;
  ctx.multiSelection = new Set();

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
      ctx.currentRoomInstanceId = ctx.selectedEditorObject.userData.roomInstanceId;
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
    const hits = ctx.raycaster.intersectObjects(ctx.placedObjects, true);
    const object = hits.length ? ctx.findPlacedAncestor(hits[0].object) : null;
    if (object && event.shiftKey) ctx.selectEditorObject(object, { range: true });
    else if (object && (event.ctrlKey || event.metaKey)) ctx.selectEditorObject(object, { additive: true });
    else ctx.selectEditorObject(object);
  };

  ctx.syncHierarchyHighlight = () => {
    ctx.hierarchyList.querySelectorAll('.hierarchy-object').forEach((item) => {
      item.classList.toggle('is-selected', ctx.multiSelection.has(Number(item.dataset.instanceId)));
    });
    ctx.hierarchyList.querySelectorAll('.hierarchy-room-header').forEach((header) => {
      header.classList.toggle(
        'is-current-room',
        Number(header.dataset.roomInstanceId) === ctx.currentRoomInstanceId,
      );
    });
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
      const index = ctx.placedObjects.indexOf(object);
      if (index >= 0) ctx.placedObjects.splice(index, 1);
      object.removeFromParent();
    });
    ctx.selectEditorObject(null);
    ctx.syncHierarchy();
    if (shouldSave) ctx.saveLayout();
    ctx.editorStatus.textContent = `선택한 객체 ${targets.length}개를 삭제했습니다.`;
  };

  ctx.syncHierarchy = () => {
    ctx.hierarchyList.innerHTML = '';

    ctx.rooms.forEach((room) => {
      const header = document.createElement('li');
      header.className = 'hierarchy-room-header';
      header.dataset.roomInstanceId = String(room.instanceId);
      header.classList.toggle('is-current-room', room.instanceId === ctx.currentRoomInstanceId);

      const headerLabel = document.createElement('span');
      headerLabel.className = 'hierarchy-room-header-label';
      headerLabel.textContent = room.name;
      header.append(headerLabel);

      const deleteRoomButton = document.createElement('button');
      deleteRoomButton.type = 'button';
      deleteRoomButton.className = 'hierarchy-room-delete';
      deleteRoomButton.textContent = '×';
      deleteRoomButton.setAttribute('aria-label', `${room.name} 삭제`);
      deleteRoomButton.addEventListener('click', (event) => {
        event.stopPropagation();
        ctx.deleteRoom(room);
      });
      header.append(deleteRoomButton);

      header.addEventListener('click', () => ctx.selectRoom(room));
      ctx.hierarchyList.append(header);

      ctx.placedObjects
        .filter((object) => object.userData.roomInstanceId === room.instanceId)
        .forEach((object) => {
          const item = document.createElement('li');
          item.className = 'hierarchy-object';
          item.dataset.instanceId = String(object.userData.instanceId);
          item.textContent = object.name;
          item.classList.toggle('is-selected', ctx.multiSelection.has(object.userData.instanceId));
          item.addEventListener('click', (event) => {
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
          ctx.hierarchyList.append(item);
        });
    });

    const addRoomItem = document.createElement('li');
    addRoomItem.className = 'hierarchy-add-room';
    const addRoomButton = document.createElement('button');
    addRoomButton.type = 'button';
    addRoomButton.className = 'hierarchy-add-room-button';
    addRoomButton.textContent = '+';
    addRoomButton.setAttribute('aria-label', '방 추가');
    addRoomButton.addEventListener('click', ctx.addRoom);
    addRoomItem.append(addRoomButton);
    ctx.hierarchyList.append(addRoomItem);
  };

  ctx.sidebarRightToggle.addEventListener('click', () => {
    const collapsed = ctx.sidebarRight.dataset.collapsed === 'true';
    ctx.sidebarRight.dataset.collapsed = String(!collapsed);
    document.body.classList.toggle('sidebar-right-collapsed', !collapsed);
  });

  ctx.canvas.addEventListener('click', ctx.selectFromCanvas);
}
